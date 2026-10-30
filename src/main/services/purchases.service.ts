/**
 * خدمة فواتير الشراء ومرتجعات الشراء (Purchases & Returns Engine)
 * تدير: حفظ فواتير المشتريات المعقدة داخل Transaction واحد،
 * إنشاء الدفعات (Batches)، تطبيق حركات المخزون المعيارية، تحديث أسعار البيع،
 * إدارة حسابات الموردين والخزنة، وإجراء مرتجعات الشراء وتاريخ التكلفة.
 */

import crypto from 'crypto';
import type Database from 'better-sqlite3';
import { getDatabase } from '../db/connection';
import {
  Purchase,
  PurchaseItem,
  CreatePurchaseInput,
  PurchaseReturn,
  PurchaseReturnItem,
  CostHistoryEntry,
  SupplierCostComparison,
} from '../../shared/types/purchases.types';
import { auditService as globalAuditService, AuditService } from './audit.service';

export class PurchasesService {
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
   * توليد رقم فاتورة شراء تسلسلي تلقائي
   */
  private generateInvoiceNumber(txDb: Database.Database): string {
    txDb.prepare("UPDATE counters SET value = value + 1 WHERE name = 'purchase_seq'").run();
    const row = txDb.prepare("SELECT value FROM counters WHERE name = 'purchase_seq'").get() as {
      value: number;
    };
    return `PUR-${String(row.value).padStart(6, '0')}`;
  }

  /**
   * إنشاء فاتورة شراء جديدة بالكامل داخل Transaction متكامل
   */
  public async create(input: CreatePurchaseInput): Promise<Purchase> {
    const db = this.getDb();

    if (!input.items || input.items.length === 0) {
      throw new Error('لا يمكن حفظ فاتورة شراء بدون بنود');
    }

    return db.transaction(() => {
      // 1. التحقق من وجود المورد
      const supplier = db
        .prepare('SELECT id, name, balance FROM suppliers WHERE id = ?')
        .get(input.supplier_id) as { id: number; name: string; balance: number } | undefined;

      if (!supplier) {
        throw new Error(`المورد رقم ${input.supplier_id} غير موجود`);
      }

      // 2. حساب إجمالي البنود والمبالغ
      let subtotal = 0;
      for (const item of input.items) {
        if (item.qty <= 0) {
          throw new Error('كمية الصنف يجب أن تكون أكبر من الصفر');
        }
        if (item.unit_cost < 0) {
          throw new Error('سعر التكلفة لا يمكن أن يكون سالباً');
        }
        subtotal += item.qty * item.unit_cost;
      }

      const discount = Math.max(0, input.discount ?? 0);
      const tax = Math.max(0, input.tax ?? 0);
      const total = Math.max(0, subtotal - discount + tax);
      const paid = Math.max(0, input.paid ?? 0);

      if (paid > total) {
        throw new Error(`المبلغ المدفوع (${paid}) أكبر من إجمالي الفاتورة (${total})`);
      }

      const status = paid >= total ? 'completed' : 'partial';
      const invoiceNo = input.invoice_no?.trim() || this.generateInvoiceNumber(db);
      const purchaseUuid = crypto.randomUUID();

      // 3. إدراج فاتورة الشراء
      const insertPurchase = db.prepare(`
        INSERT INTO purchases (
          uuid, invoice_no, supplier_id, subtotal, discount, tax, total, paid,
          payment_method, status, user_id, note, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `);

      const res = insertPurchase.run(
        purchaseUuid,
        invoiceNo,
        input.supplier_id,
        subtotal,
        discount,
        tax,
        total,
        paid,
        input.payment_method ?? 'cash',
        status,
        input.user_id,
        input.notes ?? null
      );
      const purchaseId = Number(res.lastInsertRowid);

      // 4. معالجة كل صنف: إنشاء دفعة + بند شراء + حركة مخزون (+qty) + تحديث سعر البيع
      const insertBatchStmt = db.prepare(`
        INSERT INTO batches (variant_id, batch_no, expiry_date, unit_cost, qty_remaining, received_at)
        VALUES (?, ?, ?, ?, 0, datetime('now'))
      `);

      const insertItemStmt = db.prepare(`
        INSERT INTO purchase_items (
          purchase_id, variant_id, batch_id, qty, unit_cost, total_cost, suggested_price, expiry_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertMovementStmt = db.prepare(`
        INSERT INTO stock_movements (batch_id, type, qty, ref_type, ref_id, user_id, note, created_at)
        VALUES (?, 'purchase', ?, 'purchase', ?, ?, ?, datetime('now'))
      `);

      const updatePriceStmt = db.prepare(`
        UPDATE product_variants SET sale_price = ? WHERE id = ?
      `);

      for (const item of input.items) {
        const batchNo = item.batch_no?.trim() || `B-${invoiceNo}-${item.variant_id}`;
        const itemTotal = item.qty * item.unit_cost;

        // إنشاء الدفعة برصيد 0 مبدئياً
        const batchRes = insertBatchStmt.run(
          item.variant_id,
          batchNo,
          item.expiry_date ?? null,
          item.unit_cost
        );
        const batchId = Number(batchRes.lastInsertRowid);

        // إدراج بند الفاتورة
        insertItemStmt.run(
          purchaseId,
          item.variant_id,
          batchId,
          item.qty,
          item.unit_cost,
          itemTotal,
          item.suggested_sale_price ?? null,
          item.expiry_date ?? null
        );

        // إدراج حركة المخزون (سيقوم مشغل trg_movement_apply بزيادة qty_remaining في الدفعة)
        insertMovementStmt.run(
          batchId,
          item.qty,
          purchaseId,
          input.user_id,
          `استلام شراء فاتورة #${invoiceNo}`
        );

        // تحديث سعر البيع للصنف إن حُدد
        if (item.suggested_sale_price && item.suggested_sale_price > 0) {
          updatePriceStmt.run(item.suggested_sale_price, item.variant_id);
        }
      }

      // 5. تحديث رصيد المورد بالآجل (المبلغ المتبقي غير المسدد)
      const unpaid = total - paid;
      if (unpaid > 0) {
        db.prepare('UPDATE suppliers SET balance = balance + ? WHERE id = ?').run(
          unpaid,
          input.supplier_id
        );
      }

      // 6. في حال وجود سداد نقدي مسدد من الخزنة
      if (paid > 0 && input.payment_method === 'cash') {
        let targetShiftId = input.shift_id;
        if (!targetShiftId) {
          const openShift = db
            .prepare("SELECT id FROM shifts WHERE status = 'open' ORDER BY id DESC LIMIT 1")
            .get() as { id: number } | undefined;
          targetShiftId = openShift?.id;
        }

        if (!targetShiftId) {
          // فتح وردية تلقائية للمستخدم لضمان عدم تعطل حفظ فاتورة الشراء النقدية
          const shiftUuid = crypto.randomUUID();
          const shiftRes = db
            .prepare("INSERT INTO shifts (uuid, user_id, opening_balance, status, opened_at, notes) VALUES (?, ?, 0, 'open', datetime('now'), 'وردية تلقائية')")
            .run(shiftUuid, input.user_id);
          targetShiftId = Number(shiftRes.lastInsertRowid);
        }

        db.prepare(`
          INSERT INTO cash_movements (
            shift_id, user_id, type, amount, ref_type, ref_id, note, created_at
          ) VALUES (?, ?, 'withdrawal', ?, 'purchase', ?, ?, datetime('now'))
        `).run(
          targetShiftId,
          input.user_id,
          -Math.abs(paid),
          purchaseId,
          `سداد فاتورة مشتريات #${invoiceNo} (${supplier.name})`
        );
      }

      // 7. تسجيل التدقيق
      this.auditService.log(
        {
          userId: input.user_id,
          action: 'PURCHASE_CREATED',
          entityType: 'purchase',
          entityId: purchaseId,
          details: {
            invoiceNo,
            supplierId: input.supplier_id,
            total,
            paid,
            itemsCount: input.items.length,
          },
        },
        db
      );

      return this.getByIdInternal(purchaseId, db)!;
    })();
  }

  private getByIdInternal(id: number, db: Database.Database): Purchase | null {
    const purchase = db
      .prepare(`
        SELECT 
          p.*, s.name as supplier_name, u.display_name as user_name
        FROM purchases p
        LEFT JOIN suppliers s ON p.supplier_id = s.id
        LEFT JOIN users u ON p.user_id = u.id
        WHERE p.id = ?
      `)
      .get(id) as Purchase | undefined;

    if (!purchase) return null;

    const items = db
      .prepare(`
        SELECT 
          pi.*,
          pi.suggested_price as suggested_sale_price,
          p.name_ar as product_name,
          pv.name as variant_name,
          pv.sku,
          b.batch_no,
          b.expiry_date
        FROM purchase_items pi
        JOIN product_variants pv ON pi.variant_id = pv.id
        JOIN products p ON pv.product_id = p.id
        LEFT JOIN batches b ON pi.batch_id = b.id
        WHERE pi.purchase_id = ?
        ORDER BY pi.id ASC
      `)
      .all(id) as PurchaseItem[];

    return {
      ...purchase,
      items,
    };
  }

  /**
   * جلب فاتورة شراء بالمعرف مع جميع بنودها
   */
  public async getById(id: number): Promise<Purchase | null> {
    const db = this.getDb();
    return this.getByIdInternal(id, db);
  }

  /**
   * قائمة فواتير الشراء مع الفلاتر
   */
  public async list(filters?: {
    supplierId?: number;
    status?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ purchases: Purchase[]; total: number }> {
    const db = this.getDb();
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (filters?.supplierId) {
      conditions.push('p.supplier_id = ?');
      params.push(filters.supplierId);
    }
    if (filters?.status) {
      conditions.push('p.status = ?');
      params.push(filters.status);
    }
    if (filters?.startDate) {
      conditions.push('p.created_at >= date(?)');
      params.push(filters.startDate);
    }
    if (filters?.endDate) {
      conditions.push("p.created_at <= date(?, '+1 day')");
      params.push(filters.endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.max(1, filters?.limit ?? 50);
    const offset = Math.max(0, filters?.offset ?? 0);

    const countSql = `SELECT COUNT(*) as cnt FROM purchases p ${whereClause}`;
    const totalRow = db.prepare(countSql).get(...params) as { cnt: number };

    const querySql = `
      SELECT 
        p.*, s.name as supplier_name, u.display_name as user_name
      FROM purchases p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      LEFT JOIN users u ON p.user_id = u.id
      ${whereClause}
      ORDER BY p.id DESC
      LIMIT ? OFFSET ?
    `;

    const purchases = db.prepare(querySql).all(...params, limit, offset) as Purchase[];

    return { purchases, total: totalRow.cnt };
  }

  /**
   * إنشاء مرتجع شراء مرتبط بفاتورة الشراء الأصلية
   */
  public async createReturn(params: {
    purchaseId: number;
    items: Array<{ purchaseItemId: number; qty: number }>;
    userId: number;
    note?: string | null;
  }): Promise<PurchaseReturn> {
    if (!params.items || params.items.length === 0) {
      throw new Error('يجب تحديد البنود المراد إرجاعها للمورد');
    }

    const db = this.getDb();
    const returnUuid = crypto.randomUUID();

    return db.transaction(() => {
      // 1. فحص الفاتورة الأصلية
      const purchase = db
        .prepare('SELECT * FROM purchases WHERE id = ?')
        .get(params.purchaseId) as Purchase | undefined;

      if (!purchase) {
        throw new Error(`فاتورة الشراء رقم ${params.purchaseId} غير موجودة`);
      }
      if (purchase.status === 'cancelled') {
        throw new Error('لا يمكن عمل مرتجع لفاتورة شراء ملغاة');
      }

      // 2. التحقق من كل بند وحساب قيمة المرتجع
      let totalRefund = 0;
      const verifiedItems: Array<{
        purchaseItemId: number;
        variantId: number;
        batchId: number;
        qty: number;
        unitCost: number;
      }> = [];

      for (const item of params.items) {
        if (item.qty <= 0) {
          throw new Error('كمية المرتجع يجب أن تكون أكبر من الصفر');
        }

        const originalItem = db
          .prepare('SELECT * FROM purchase_items WHERE id = ? AND purchase_id = ?')
          .get(item.purchaseItemId, params.purchaseId) as {
            id: number;
            variant_id: number;
            batch_id: number;
            qty: number;
            unit_cost: number;
          } | undefined;

        if (!originalItem) {
          throw new Error(`بند الشراء رقم ${item.purchaseItemId} غير موجود في الفاتورة`);
        }

        // فحص الكميات المرتجعة سابقاً لنفس البند
        const prevReturned = db
          .prepare(
            'SELECT COALESCE(SUM(qty), 0) as total_ret FROM purchase_return_items WHERE purchase_item_id = ?'
          )
          .get(item.purchaseItemId) as { total_ret: number };

        const availableToReturn = originalItem.qty - prevReturned.total_ret;
        if (item.qty > availableToReturn) {
          throw new Error(
            `الكمية المرتجعة (${item.qty}) تتجاوز الكمية المتبقية المسموح بإرجاعها (${availableToReturn})`
          );
        }

        // فحص رصيد الدفعة الحالى في المخزون
        const batch = db
          .prepare('SELECT qty_remaining FROM batches WHERE id = ?')
          .get(originalItem.batch_id) as { qty_remaining: number } | undefined;

        if (!batch || batch.qty_remaining < item.qty) {
          throw new Error(
            `رصيد الدفعة الحالي بالمخزون (${batch?.qty_remaining ?? 0}) أقل من الكمية المراد إرجاعها (${item.qty})`
          );
        }

        totalRefund += item.qty * originalItem.unit_cost;
        verifiedItems.push({
          purchaseItemId: originalItem.id,
          variantId: originalItem.variant_id,
          batchId: originalItem.batch_id,
          qty: item.qty,
          unitCost: originalItem.unit_cost,
        });
      }

      // 3. إنشاء سجل مرتجع الشراء
      const insertReturn = db.prepare(`
        INSERT INTO purchase_returns (uuid, purchase_id, supplier_id, total_refund, user_id, note, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `);

      const res = insertReturn.run(
        returnUuid,
        params.purchaseId,
        purchase.supplier_id,
        totalRefund,
        params.userId,
        params.note ?? null
      );
      const returnId = Number(res.lastInsertRowid);

      // 4. إدراج بنود المرتجع وحركات خروج المخزون
      const insertReturnItem = db.prepare(`
        INSERT INTO purchase_return_items (return_id, purchase_item_id, variant_id, batch_id, qty, unit_cost)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      const insertMovement = db.prepare(`
        INSERT INTO stock_movements (batch_id, type, qty, ref_type, ref_id, user_id, note, created_at)
        VALUES (?, 'purchase_return', ?, 'purchase_return', ?, ?, ?, datetime('now'))
      `);

      for (const item of verifiedItems) {
        insertReturnItem.run(
          returnId,
          item.purchaseItemId,
          item.variantId,
          item.batchId,
          item.qty,
          item.unitCost
        );

        // حركة مخزون سالبة (Trigger يخصم من qty_remaining في الدفعة)
        insertMovement.run(
          item.batchId,
          -item.qty,
          returnId,
          params.userId,
          `مرتجع شراء #${returnId} لفاتورة #${purchase.invoice_no}`
        );
      }

      // 5. خصم قيمة المرتجع من رصيد المورد
      db.prepare('UPDATE suppliers SET balance = balance - ? WHERE id = ?').run(
        totalRefund,
        purchase.supplier_id
      );

      // 6. تسجيل التدقيق
      this.auditService.log(
        {
          userId: params.userId,
          action: 'PURCHASE_RETURN_CREATED',
          entityType: 'purchase_return',
          entityId: returnId,
          details: {
            purchaseId: params.purchaseId,
            totalRefund,
            itemsCount: verifiedItems.length,
          },
        },
        db
      );

      return db
        .prepare(`
          SELECT pr.*, s.name as supplier_name, u.display_name as user_name
          FROM purchase_returns pr
          JOIN suppliers s ON pr.supplier_id = s.id
          JOIN users u ON pr.user_id = u.id
          WHERE pr.id = ?
        `)
        .get(returnId) as PurchaseReturn;
    })();
  }

  /**
   * جلب تاريخ تكلفة صنف معين من فواتير الشراء السابقة
   */
  public async getCostHistory(variantId: number): Promise<CostHistoryEntry[]> {
    const db = this.getDb();
    const sql = `
      SELECT 
        p.created_at as purchase_date,
        s.name as supplier_name,
        pi.unit_cost,
        pi.qty,
        p.invoice_no
      FROM purchase_items pi
      JOIN purchases p ON pi.purchase_id = p.id
      JOIN suppliers s ON p.supplier_id = s.id
      WHERE pi.variant_id = ? AND p.status != 'cancelled'
      ORDER BY p.created_at DESC
    `;

    return db.prepare(sql).all(variantId) as CostHistoryEntry[];
  }

  /**
   * مقارنة أسعار التكلفة بين الموردين لنفس الصنف
   */
  public async getCostComparison(variantId: number): Promise<SupplierCostComparison[]> {
    const db = this.getDb();
    const sql = `
      SELECT 
        s.name as supplier_name,
        CAST(AVG(pi.unit_cost) AS INTEGER) as avg_cost,
        MIN(pi.unit_cost) as min_cost,
        MAX(pi.unit_cost) as max_cost,
        COUNT(pi.id) as purchase_count
      FROM purchase_items pi
      JOIN purchases p ON pi.purchase_id = p.id
      JOIN suppliers s ON p.supplier_id = s.id
      WHERE pi.variant_id = ? AND p.status != 'cancelled'
      GROUP BY s.id
      ORDER BY avg_cost ASC
    `;

    return db.prepare(sql).all(variantId) as SupplierCostComparison[];
  }
}

export const purchasesService = new PurchasesService();
