/**
 * خدمة عمليات البيع ونقطة الكاشير (Sales & POS Service)
 * تدير: حفظ الفاتورة بالكامل داخل Transaction، حساب الخصومات والضرائب،
 * توزيع المخزون بدقة وفق خوارزمية FEFO (الأقرب انتهاءً أولاً)، تسجيل حركات الخزنة والمخزون،
 * وتعليق واستئناف وإلغاء الفواتير (Void Sale)
 */

import crypto from 'crypto';
import type Database from 'better-sqlite3';
import { getDatabase } from '../db/connection';
import { CreateSaleInput } from '../../shared/schemas/sales.schema';
import { Sale, SaleItem, SalePayment, HeldSale } from '../../shared/types/sales.types';
import { auditService as globalAuditService, AuditService } from './audit.service';

export interface SalesFilterOptions {
  shiftId?: number;
  customerId?: number;
  status?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

function resolveUserId(db: Database.Database, userId?: number | null): number {
  if (userId && userId > 0) {
    const exists = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (exists) return userId;
  }
  const firstUser = db.prepare('SELECT id FROM users ORDER BY id ASC LIMIT 1').get() as { id: number } | undefined;
  if (firstUser) return firstUser.id;

  try {
    db.prepare(`
      INSERT OR IGNORE INTO users (id, username, password_hash, display_name, role, is_active, created_at)
      VALUES (1, 'system', 'system', 'نظام موبيكس', 'admin', 1, datetime('now'))
    `).run();
    return 1;
  } catch {
    return 1;
  }
}

function resolveShiftId(db: Database.Database, shiftId?: number | null, userId?: number): number {
  if (shiftId) {
    const exists = db.prepare("SELECT id FROM shifts WHERE id = ?").get(shiftId);
    if (exists) return shiftId;
  }
  const openShift = db.prepare("SELECT id FROM shifts WHERE status = 'open' ORDER BY id DESC LIMIT 1").get() as { id: number } | undefined;
  if (openShift) return openShift.id;

  const effectiveUserId = resolveUserId(db, userId);
  const uuid = crypto.randomUUID();
  const res = db.prepare(`
    INSERT INTO shifts (uuid, user_id, opening_balance, status, opened_at, notes)
    VALUES (?, ?, 0, 'open', datetime('now'), 'وردية تلقائية لبدء عمليات البيع')
  `).run(uuid, effectiveUserId);
  return Number(res.lastInsertRowid);
}

export class SalesService {
  private db?: Database.Database;
  private auditService: AuditService;

  constructor(db?: Database.Database, audit?: AuditService) {
    this.db = db;
    this.auditService = audit ?? (db ? new AuditService(db) : globalAuditService);
  }

  private getDb(): Database.Database {
    return this.db ?? getDatabase();
  }

  /**
   * إنشاء دفعة افتراضية للمنتج في حال لم تكن مسجلة مسبقاً
   */
  private getOrCreateBatch(
    variantId: number,
    unitCost: number = 0,
    txDb?: Database.Database
  ): { id: number; qty_remaining: number } {
    const db = txDb ?? this.getDb();
    const existing = db
      .prepare('SELECT id, qty_remaining FROM batches WHERE variant_id = ? ORDER BY id DESC LIMIT 1')
      .get(variantId) as { id: number; qty_remaining: number } | undefined;

    if (existing) {
      return existing;
    }

    const res = db
      .prepare(`
        INSERT INTO batches (variant_id, batch_no, expiry_date, unit_cost, qty_remaining, received_at)
        VALUES (?, 'INITIAL-BATCH', NULL, ?, 0, datetime('now'))
      `)
      .run(variantId, unitCost);

    return { id: Number(res.lastInsertRowid), qty_remaining: 0 };
  }

  /**
   * خوارزمية FEFO لاختيار الدفعات الأقرب انتهاءً لصنف معين وتوزيع الكمية المطلوبة
   */
  private allocateBatchesFEFO(
    variantId: number,
    requiredQty: number,
    allowZeroStock: boolean,
    txDb: Database.Database
  ): Array<{ batch_id: number; qty: number; unit_cost: number }> {
    // جلب الدفعات المتاحة مرتبة تصاعدياً حسب تاريخ الصلاحية
    const availableBatches = txDb
      .prepare(`
        SELECT id, qty_remaining, unit_cost
        FROM batches
        WHERE variant_id = ? AND qty_remaining > 0
          AND (expiry_date IS NULL OR expiry_date > date('now'))
        ORDER BY expiry_date ASC NULLS LAST, id ASC
      `)
      .all(variantId) as { id: number; qty_remaining: number; unit_cost: number }[];

    const totalStock = availableBatches.reduce((acc, b) => acc + b.qty_remaining, 0);

    if (totalStock < requiredQty) {
      if (!allowZeroStock) {
        throw new Error(
          `الرصيد المتاح من هذا الصنف (${totalStock}) غير كافٍ للكمية المطلوبة (${requiredQty})`
        );
      }

      // في حال تفعيل خيار السماح بالبيع عند نفاذ المخزون
      const allocations: Array<{ batch_id: number; qty: number; unit_cost: number }> = [];
      let remainingNeeded = requiredQty;

      for (const b of availableBatches) {
        if (remainingNeeded <= 0) break;
        const take = Math.min(b.qty_remaining, remainingNeeded);
        allocations.push({ batch_id: b.id, qty: take, unit_cost: b.unit_cost });
        remainingNeeded -= take;
      }

      if (remainingNeeded > 0) {
        const fallbackBatch = this.getOrCreateBatch(variantId, 0, txDb);
        // تحديث الرصيد لتفادي CHECK (qty_remaining >= 0)
        txDb
          .prepare('UPDATE batches SET qty_remaining = qty_remaining + ? WHERE id = ?')
          .run(remainingNeeded, fallbackBatch.id);
        allocations.push({ batch_id: fallbackBatch.id, qty: remainingNeeded, unit_cost: 0 });
      }

      return allocations;
    }

    const allocations: Array<{ batch_id: number; qty: number; unit_cost: number }> = [];
    let remainingNeeded = requiredQty;

    for (const b of availableBatches) {
      if (remainingNeeded <= 0) break;
      const take = Math.min(b.qty_remaining, remainingNeeded);
      allocations.push({ batch_id: b.id, qty: take, unit_cost: b.unit_cost });
      remainingNeeded -= take;
    }

    return allocations;
  }

  /**
   * إنشاء فاتورة بيع جديدة كاملة (Point of Sale Engine)
   */
  async createSale(input: CreateSaleInput, userId: number, shiftId: number): Promise<Sale> {
    const db = this.getDb();
    let createdSaleId = 0;

    const saleTx = db.transaction(() => {
      // 1. التحقق من أن الوردية والمستخدم متاحان وصحيحان
      const effectiveUserId = resolveUserId(db, userId);
      const effectiveShiftId = resolveShiftId(db, shiftId, effectiveUserId);

      // 2. قراءة إعداد السماح بالبيع مع رصيد صفر والضريبة
      const zeroStockSetting = db
        .prepare("SELECT value FROM settings WHERE key = 'allow_zero_stock_sale'")
        .get() as { value: string } | undefined;
      const allowZeroStock = zeroStockSetting?.value === '1';

      const taxRateSetting = db
        .prepare("SELECT value FROM settings WHERE key = 'tax_rate'")
        .get() as { value: string } | undefined;
      const taxRate = parseFloat(taxRateSetting?.value ?? '0');

      // 3. زيادة عداد الفواتير والحصول على seq_no و invoice_no
      db.prepare(`
        INSERT INTO counters (name, value) VALUES ('sale_seq', 1)
        ON CONFLICT(name) DO UPDATE SET value = value + 1
      `).run();

      const seqRow = db
        .prepare("SELECT value FROM counters WHERE name = 'sale_seq'")
        .get() as { value: number };
      const seqNo = seqRow.value;
      const invoiceNo = `INV-${String(seqNo).padStart(5, '0')}`;
      const saleUuid = crypto.randomUUID();

      // 4. معالجة بنود السلة و FEFO
      let subtotal = 0;
      const processedItems: Array<{
        variant_id: number;
        batch_id: number;
        product_name: string;
        variant_name: string | null;
        qty: number;
        unit_price: number;
        unit_cost: number;
        discount_amount: number;
        line_total: number;
      }> = [];

      for (const item of input.items) {
        // جلب تفاصيل الـ variant واسم المنتج
        const variantRow = db
          .prepare(`
            SELECT v.id, v.sale_price, v.name as variant_name, p.name_ar as product_name
            FROM product_variants v
            JOIN products p ON v.product_id = p.id
            WHERE v.id = ?
          `)
          .get(item.variant_id) as
          | { id: number; sale_price: number; variant_name: string | null; product_name: string }
          | undefined;

        if (!variantRow) {
          throw new Error(`الصنف رقم ${item.variant_id} غير موجود`);
        }

        const unitPrice = item.unit_price ?? variantRow.sale_price;
        const discountOnItem = item.discount_amount ?? 0;

        // توزيع الكمية على الدفعات حسب FEFO
        const batchAllocations = this.allocateBatchesFEFO(
          item.variant_id,
          item.qty,
          allowZeroStock,
          db
        );

        for (const alloc of batchAllocations) {
          const allocRatio = alloc.qty / item.qty;
          const allocDiscount = Math.round(discountOnItem * allocRatio);
          const lineTotal = Math.max(0, alloc.qty * unitPrice - allocDiscount);
          subtotal += lineTotal;

          processedItems.push({
            variant_id: item.variant_id,
            batch_id: alloc.batch_id,
            product_name: variantRow.product_name,
            variant_name: variantRow.variant_name,
            qty: alloc.qty,
            unit_price: unitPrice,
            unit_cost: alloc.unit_cost,
            discount_amount: allocDiscount,
            line_total: lineTotal,
          });
        }
      }

      // 5. حساب الإجماليات
      const globalDiscount = input.discount_amount ?? 0;
      const subtotalAfterDiscount = Math.max(0, subtotal - globalDiscount);
      const taxAmount = taxRate > 0 ? Math.round((subtotalAfterDiscount * taxRate) / 100) : 0;
      const totalAmount = subtotalAfterDiscount + taxAmount;

      // 6. التحقق من المدفوعات والبيع الآجل
      const totalPaid = input.payments.reduce((acc, p) => acc + p.amount, 0);
      if (totalPaid < totalAmount) {
        throw new Error(
          `المبلغ المدفوع (${totalPaid / 100} ج.م) أقل من إجمالي الفاتورة (${totalAmount / 100} ج.م)`
        );
      }

      // التحقق من حساب العميل والحد الائتماني عند وجود دفع آجل
      const creditPayments = input.payments.filter((p) => p.method === 'credit');
      const totalCreditAmount = creditPayments.reduce((acc, p) => acc + p.amount, 0);

      if (totalCreditAmount > 0) {
        if (!input.customer_id) {
          throw new Error('لا يمكن إتمام البيع الآجل دون تحديد عميل مسجل في النظام');
        }

        const customer = db
          .prepare('SELECT id, name, balance, credit_limit FROM customers WHERE id = ?')
          .get(input.customer_id) as
          | { id: number; name: string; balance: number; credit_limit: number }
          | undefined;

        if (!customer) {
          throw new Error(`العميل رقم ${input.customer_id} غير موجود في النظام`);
        }

        if (customer.credit_limit > 0 && customer.balance + totalCreditAmount > customer.credit_limit) {
          const availableCredit = Math.max(0, customer.credit_limit - customer.balance);
          throw new Error(
            `المبلغ الآجل المطلوب (${totalCreditAmount / 100} ج.م) يتجاوز الحد الائتماني المتاح للعميل (${availableCredit / 100} ج.م من أصل ${customer.credit_limit / 100} ج.م)`
          );
        }

        // زيادة رصيد العميل المدين
        db.prepare('UPDATE customers SET balance = balance + ? WHERE id = ?').run(
          totalCreditAmount,
          input.customer_id
        );
      }

      // 7. إدراج رأس الفاتورة
      const insertSaleStmt = db.prepare(`
        INSERT INTO sales (
          uuid, seq_no, invoice_no, user_id, shift_id, customer_id,
          subtotal, discount_amount, tax_amount, total, status, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, datetime('now'))
      `);

      const saleResult = insertSaleStmt.run(
        saleUuid,
        seqNo,
        invoiceNo,
        effectiveUserId,
        effectiveShiftId,
        input.customer_id ?? null,
        subtotal,
        globalDiscount,
        taxAmount,
        totalAmount,
        input.notes ?? null
      );
      createdSaleId = Number(saleResult.lastInsertRowid);

      // 8. إدراج بنود الفاتورة وحركات المخزون
      const insertItemStmt = db.prepare(`
        INSERT INTO sale_items (
          sale_id, variant_id, batch_id, product_name, variant_name,
          qty, unit_price, unit_cost, discount_amount, line_total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertMovementStmt = db.prepare(`
        INSERT INTO stock_movements (
          batch_id, type, qty, ref_type, ref_id, user_id, note, created_at
        ) VALUES (?, 'sale', ?, 'sale', ?, ?, ?, datetime('now'))
      `);

      for (const pItem of processedItems) {
        insertItemStmt.run(
          createdSaleId,
          pItem.variant_id,
          pItem.batch_id,
          pItem.product_name,
          pItem.variant_name,
          pItem.qty,
          pItem.unit_price,
          pItem.unit_cost,
          pItem.discount_amount,
          pItem.line_total
        );

        // حركة خصم سالبة بالمخزون (الـ Trigger يحدث qty_remaining تلقائياً)
        insertMovementStmt.run(
          pItem.batch_id,
          -Math.abs(pItem.qty),
          createdSaleId,
          effectiveUserId,
          `مبيعات فاتورة #${invoiceNo}`
        );
      }

      // 9. إدراج المدفوعات وحركات الخزنة
      const insertPaymentStmt = db.prepare(`
        INSERT INTO sale_payments (sale_id, method, amount)
        VALUES (?, ?, ?)
      `);

      const insertCashMovementStmt = db.prepare(`
        INSERT INTO cash_movements (
          shift_id, user_id, type, amount, ref_type, ref_id, note, created_at
        ) VALUES (?, ?, 'sale', ?, 'sale', ?, ?, datetime('now'))
      `);

      for (const p of input.payments) {
        insertPaymentStmt.run(createdSaleId, p.method, p.amount);

        // إذا كان الدفع نقدياً، نسجل حركة بالخزنة
        if (p.method === 'cash') {
          insertCashMovementStmt.run(
            effectiveShiftId,
            effectiveUserId,
            p.amount,
            createdSaleId,
            `مبيعات فاتورة نقدي #${invoiceNo}`
          );
        }
      }

      // 10. تسجيل الرقابة والتدقيق
      this.auditService.log({
        userId: effectiveUserId,
        action: 'CREATE_SALE',
        entityType: 'sales',
        entityId: createdSaleId,
        details: {
          invoice_no: invoiceNo,
          total: totalAmount,
          items_count: processedItems.length,
        },
      });
    });

    saleTx();
    return this.getSaleById(createdSaleId)!;
  }

  /**
   * جلب تفاصيل الفاتورة كاملة بواسطة المعرف ID
   */
  getSaleById(id: number): Sale | null {
    const db = this.getDb();
    const saleRow = db.prepare(`
      SELECT s.*,
             u.display_name as cashier_name,
             c.name as customer_name,
             c.phone as customer_phone
      FROM sales s
      LEFT JOIN users u ON s.user_id = u.id
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE s.id = ?
    `).get(id) as any;
    if (!saleRow) return null;

    const items = db
      .prepare('SELECT * FROM sale_items WHERE sale_id = ? ORDER BY id ASC')
      .all(id) as SaleItem[];

    const payments = db
      .prepare('SELECT * FROM sale_payments WHERE sale_id = ? ORDER BY id ASC')
      .all(id) as SalePayment[];

    return {
      ...saleRow,
      items,
      payments,
    };
  }

  /**
   * جلب تفاصيل الفاتورة بواسطة رقم الفاتورة المنسق
   */
  getSaleByInvoiceNo(invoiceNo: string): Sale | null {
    const db = this.getDb();
    const row = db.prepare('SELECT id FROM sales WHERE invoice_no = ?').get(invoiceNo.trim()) as
      | { id: number }
      | undefined;
    return row ? this.getSaleById(row.id) : null;
  }

  /**
   * قائمة الفواتير مع فلاتر وبحث وترتيب
   */
  async listSales(options?: SalesFilterOptions): Promise<Sale[]> {
    const db = this.getDb();
    const whereClauses: string[] = [];
    const params: any[] = [];

    if (options?.shiftId) {
      whereClauses.push('shift_id = ?');
      params.push(options.shiftId);
    }
    if (options?.customerId) {
      whereClauses.push('customer_id = ?');
      params.push(options.customerId);
    }
    if (options?.status) {
      whereClauses.push('status = ?');
      params.push(options.status);
    }
    if (options?.startDate) {
      whereClauses.push("created_at >= ?");
      params.push(options.startDate);
    }
    if (options?.endDate) {
      whereClauses.push("created_at <= ?");
      params.push(options.endDate);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const limit = options?.limit ?? 50;
    const offset = ((options?.page ?? 1) - 1) * limit;

    const rows = db
      .prepare(`
        SELECT id FROM sales
        ${whereSql}
        ORDER BY id DESC
        LIMIT ? OFFSET ?
      `)
      .all(...params, limit, offset) as { id: number }[];

    return rows.map((r) => this.getSaleById(r.id)!);
  }

  /**
   * استخراج بيانات العرض من payload المخزّن
   */
  private parseHeldPayload(payload: string): {
    cart_data: string;
    total_amount: number;
    item_count: number;
    customer_name: string;
  } {
    try {
      let parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;

      // حالة نص JSON مغلف مرتين (string inside string)
      if (typeof parsed === 'string') {
        try {
          parsed = JSON.parse(parsed);
        } catch { }
      }

      // الحالة الجديدة: payload يحتوي على { cart, customerName }
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.cart) {
        let cartItems = parsed.cart;
        if (typeof cartItems === 'string') {
          try {
            cartItems = JSON.parse(cartItems);
          } catch {
            cartItems = [];
          }
        }
        cartItems = Array.isArray(cartItems) ? cartItems : [];

        const totalAmount = cartItems.reduce(
          (sum: number, item: any) => sum + ((item.unitPrice || 0) * (item.qty || 1) - (item.discount || 0)),
          0
        );
        return {
          cart_data: JSON.stringify(cartItems),
          total_amount: Math.max(0, totalAmount),
          item_count: cartItems.reduce((sum: number, item: any) => sum + (item.qty || 1), 0),
          customer_name: parsed.customerName || 'عميل نقدي سريع',
        };
      }

      // الحالة القديمة: payload هو مصفوفة cart مباشرة (بيانات قديمة محفوظة مسبقاً)
      if (Array.isArray(parsed)) {
        const totalAmount = parsed.reduce(
          (sum: number, item: any) => sum + ((item.unitPrice || 0) * (item.qty || 1) - (item.discount || 0)),
          0
        );
        return {
          cart_data: JSON.stringify(parsed),
          total_amount: Math.max(0, totalAmount),
          item_count: parsed.reduce((sum: number, item: any) => sum + (item.qty || 1), 0),
          customer_name: 'عميل نقدي سريع',
        };
      }

      return { cart_data: typeof payload === 'string' ? payload : JSON.stringify(payload), total_amount: 0, item_count: 0, customer_name: 'عميل نقدي سريع' };
    } catch {
      return { cart_data: '[]', total_amount: 0, item_count: 0, customer_name: 'عميل نقدي سريع' };
    }
  }

  /**
   * تعليق فاتورة حالية (Hold Sale)
   * يخزّن بيانات السلة واسم العميل داخل payload واحد منظم
   */
  async holdSale(
    cartData: Record<string, unknown> | any[] | string,
    _shiftId: number,
    _userId: number,
    customerName?: string
  ): Promise<string> {
    const db = this.getDb();
    const holdId = crypto.randomUUID();

    const maxHoldRow = db.prepare('SELECT COALESCE(MAX(hold_no), 0) as max_no FROM held_sales').get() as {
      max_no: number;
    };
    const holdNo = maxHoldRow.max_no + 1;

    let finalCart = cartData;
    if (typeof cartData === 'string') {
      try {
        finalCart = JSON.parse(cartData);
      } catch { }
    }

    // تخزين البيانات بهيكل منظم يتضمن اسم العميل
    const structuredPayload = JSON.stringify({
      cart: finalCart,
      customerName: customerName || 'عميل نقدي سريع',
    });

    db.prepare(`
      INSERT INTO held_sales (id, hold_no, payload, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `).run(holdId, holdNo, structuredPayload);

    return holdId;
  }

  /**
   * جلب قائمة الفواتير المعلقة مع بيانات العرض المحسوبة
   */
  async getHeldSales(): Promise<any[]> {
    const db = this.getDb();
    const rows = db
      .prepare('SELECT id, hold_no, payload, created_at FROM held_sales ORDER BY hold_no DESC')
      .all() as { id: string; hold_no: number; payload: string; created_at: string }[];

    return rows.map((r) => {
      const parsed = this.parseHeldPayload(r.payload);
      return {
        id: r.id,
        hold_no: r.hold_no,
        payload: r.payload,
        created_at: r.created_at,
        // حقول إضافية تحتاجها الواجهة
        cart_data: parsed.cart_data,
        total_amount: parsed.total_amount,
        item_count: parsed.item_count,
        customer_name: parsed.customer_name,
      };
    });
  }

  /**
   * استئناف وحذف فاتورة معلقة (Resume Held Sale)
   */
  async resumeHeldSale(holdId: string): Promise<any> {
    const db = this.getDb();
    const row = db
      .prepare('SELECT id, hold_no, payload, created_at FROM held_sales WHERE id = ?')
      .get(String(holdId)) as { id: string; hold_no: number; payload: string; created_at: string } | undefined;

    if (!row) {
      throw new Error(`الفاتورة المعلقة برقم ${holdId} غير موجودة`);
    }

    db.prepare('DELETE FROM held_sales WHERE id = ?').run(String(holdId));

    const parsed = this.parseHeldPayload(row.payload);
    return {
      id: row.id,
      hold_no: row.hold_no,
      payload: row.payload,
      created_at: row.created_at,
      cart_data: parsed.cart_data,
      total_amount: parsed.total_amount,
      item_count: parsed.item_count,
      customer_name: parsed.customer_name,
    };
  }

  /**
   * حذف فاتورة معلقة دون استئنافها
   */
  async deleteHeldSale(holdId: string): Promise<boolean> {
    const db = this.getDb();
    db.prepare('DELETE FROM held_sales WHERE id = ?').run(String(holdId));
    return true;
  }

  /**
   * إلغاء فاتورة مبيعات (Void Sale) وعكس المخزون واسترداد النقد
   */
  async voidSale(saleId: number, userId: number, reason: string): Promise<Sale> {
    const db = this.getDb();

    const voidTx = db.transaction(() => {
      const sale = this.getSaleById(saleId);
      if (!sale) {
        throw new Error(`الفاتورة رقم ${saleId} غير موجودة`);
      }
      if (sale.status !== 'completed') {
        throw new Error('لا يمكن إلغاء سوى الفواتير المكتملة فقط');
      }

      // 1. تحديث حالة الفاتورة إلى voided
      db.prepare(`
        UPDATE sales
        SET status = 'voided', void_reason = ?
        WHERE id = ?
      `).run(reason.trim(), saleId);

      // 2. عكس حركات المخزون (إرجاع الكميات للدفعات نفسها)
      const insertMovementStmt = db.prepare(`
        INSERT INTO stock_movements (
          batch_id, type, qty, ref_type, ref_id, user_id, note, created_at
        ) VALUES (?, 'sale_return', ?, 'sale_void', ?, ?, ?, datetime('now'))
      `);

      const effectiveUserId = resolveUserId(db, userId);
      for (const item of sale.items ?? []) {
        insertMovementStmt.run(
          item.batch_id,
          Math.abs(item.qty),
          saleId,
          effectiveUserId,
          `استرجاع إلغاء فاتورة #${sale.invoice_no}: ${reason}`
        );
      }

      // 3. عكس حركات الخزنة النقدية
      const activeShift = db
        .prepare("SELECT id FROM shifts WHERE status = 'open' ORDER BY id DESC LIMIT 1")
        .get() as { id: number } | undefined;
      const refundShiftId = resolveShiftId(db, activeShift ? activeShift.id : sale.shift_id, effectiveUserId);

      const cashPayments = (sale.payments ?? []).filter((p) => p.method === 'cash');
      for (const cp of cashPayments) {
        db.prepare(`
          INSERT INTO cash_movements (
            shift_id, user_id, type, amount, ref_type, ref_id, note, created_at
          ) VALUES (?, ?, 'refund', ?, 'sale_void', ?, ?, datetime('now'))
        `).run(
          refundShiftId,
          effectiveUserId,
          -Math.abs(cp.amount),
          saleId,
          `استرداد نقدي لإلغاء فاتورة #${sale.invoice_no}`
        );
      }

      // 4. عكس مديونية العميل إن وُجد بيع آجل في الفاتورة الملغاة
      const creditPayments = (sale.payments ?? []).filter((p) => p.method === 'credit');
      const totalCredit = creditPayments.reduce((acc, p) => acc + p.amount, 0);
      if (totalCredit > 0 && sale.customer_id) {
        db.prepare('UPDATE customers SET balance = balance - ? WHERE id = ?').run(
          totalCredit,
          sale.customer_id
        );
      }

      // 5. تسجيل الرقابة والتدقيق
      this.auditService.log({
        userId: effectiveUserId,
        action: 'VOID_SALE',
        entityType: 'sales',
        entityId: saleId,
        details: { invoice_no: sale.invoice_no, reason, totalCreditReversed: totalCredit },
      });
    });

    voidTx();
    return this.getSaleById(saleId)!;
  }
}

export const salesService = new SalesService();
