/**
 * خدمة المرتجعات والاستبدال (Returns & Exchange Engine)
 * تدير: التحقق من سياسات الإرجاع، ربط المرتجع بالفاتورة الأصلية والبنود،
 * إعادة المنتجات السليمة للدفعات الأصلية عبر حركات sale_return،
 * استبعاد المنتجات التالفة، رد القيمة نقداً أو كرصيد عميل،
 * وتنفيذ عمليات الاستبدال (مرتجع + بيع جديد) في معاملة ذرية واحدة.
 */

import crypto from 'crypto';
import type Database from 'better-sqlite3';
import { getDatabase } from '../db/connection';
import {
  ReturnInvoice,
  ReturnItem,
  CreateReturnInput,
  ExchangeInput,
  ExchangeResult,
} from '../../shared/types/returns.types';
import { auditService as globalAuditService, AuditService } from './audit.service';
import { SalesService } from './sales.service';

export class ReturnsService {
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
   * معالجة مرتجع مرتبط بفاتورة مبيعات سابقة
   */
  public async createReturn(input: CreateReturnInput): Promise<ReturnInvoice> {
    const db = this.getDb();

    if (!input.items || input.items.length === 0) {
      throw new Error('يجب تحديد البنود المراد إرجاعها');
    }

    return db.transaction(() => {
      // 1. التحقق من وجود الفاتورة الأصلية وصلاحيتها
      const sale = db
        .prepare(`
          SELECT s.*, c.name as customer_name
          FROM sales s
          LEFT JOIN customers c ON s.customer_id = c.id
          WHERE s.id = ?
        `)
        .get(input.sale_id) as any;

      if (!sale) {
        throw new Error(`فاتورة المبيعات رقم ${input.sale_id} غير موجودة`);
      }
      if (sale.status === 'voided') {
        throw new Error('لا يمكن عمل مرتجع لفاتورة بيع تم إلغاؤها بالكامل');
      }

      // 2. فحص مهلة الإرجاع (return_window_days)
      const windowSetting = db
        .prepare("SELECT value FROM settings WHERE key = 'return_window_days'")
        .get() as { value: string } | undefined;
      const windowDays = windowSetting ? parseInt(windowSetting.value, 10) || 14 : 14;

      const daysDiffRow = db
        .prepare(`
          SELECT CAST(julianday(date('now')) - julianday(date(?)) AS INTEGER) as days_diff
        `)
        .get(sale.created_at) as { days_diff: number };

      if (daysDiffRow.days_diff > windowDays) {
        throw new Error(`انتهت فترة السماح بالإرجاع المحددة بـ (${windowDays}) يوماً من تاريخ الفاتورة`);
      }

      // 3. التحقق من البنود والكميات المسموح بإرجاعها وحساب القيمة
      let totalRefund = 0;
      const validatedItems: Array<{
        saleItemId: number;
        variantId: number;
        qty: number;
        condition: 'good' | 'damaged';
        batchId: number;
        unitRefund: number;
      }> = [];

      for (const item of input.items) {
        if (item.qty <= 0) {
          throw new Error('كمية المرتجع يجب أن تكون أكبر من الصفر');
        }

        const saleItem = db
          .prepare('SELECT * FROM sale_items WHERE id = ? AND sale_id = ?')
          .get(item.sale_item_id, input.sale_id) as any;

        if (!saleItem) {
          throw new Error(`بند المبيعات رقم ${item.sale_item_id} غير تابع لهذه الفاتورة`);
        }

        // فحص الكميات المرتجعة سابقاً لنفس البند
        const prevReturned = db
          .prepare('SELECT COALESCE(SUM(qty), 0) as total_ret FROM return_items WHERE sale_item_id = ?')
          .get(item.sale_item_id) as { total_ret: number };

        const availableQty = saleItem.qty - prevReturned.total_ret;
        if (item.qty > availableQty) {
          throw new Error(
            `الكمية المراد إرجاعها (${item.qty}) تتجاوز الكمية المتبقية المسموح بها (${availableQty}) للصنف "${saleItem.product_name}"`
          );
        }

        // سعر الوحدة الفعلي بعد الخصومات المسجلة على السطر بدقة دون فقد كسور القروش
        const lineRefund =
          item.qty === saleItem.qty
            ? saleItem.line_total
            : Math.round((saleItem.line_total * item.qty) / saleItem.qty);
        totalRefund += lineRefund;
        const unitRefund = Math.round(lineRefund / item.qty);

        validatedItems.push({
          saleItemId: saleItem.id,
          variantId: saleItem.variant_id,
          qty: item.qty,
          condition: item.condition,
          batchId: saleItem.batch_id,
          unitRefund,
        });
      }

      // 4. إنشاء سجل المرتجع
      const returnUuid = crypto.randomUUID();
      const insertReturn = db.prepare(`
        INSERT INTO returns (uuid, sale_id, user_id, total_refund, refund_method, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `);

      const retRes = insertReturn.run(
        returnUuid,
        input.sale_id,
        input.user_id,
        totalRefund,
        input.refund_method,
        input.reason ?? null
      );
      const returnId = Number(retRes.lastInsertRowid);

      // 5. إدراج بنود المرتجع وحركات المخزون للبنود الصالحة (good)
      const insertReturnItem = db.prepare(`
        INSERT INTO return_items (return_id, sale_item_id, variant_id, qty, condition, batch_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      const insertMovement = db.prepare(`
        INSERT INTO stock_movements (batch_id, type, qty, ref_type, ref_id, user_id, note, created_at)
        VALUES (?, 'sale_return', ?, 'return', ?, ?, ?, datetime('now'))
      `);

      for (const item of validatedItems) {
        insertReturnItem.run(
          returnId,
          item.saleItemId,
          item.variantId,
          item.qty,
          item.condition,
          item.batchId
        );

        // إذا كان المنتج سليماً، يعود للمخزون على نفس الدفعة التي بيع منها (Trigger يرفع رصيد الدفعة)
        if (item.condition === 'good') {
          insertMovement.run(
            item.batchId,
            item.qty,
            returnId,
            input.user_id,
            `مرتجع بيع #${returnId} لفاتورة #${sale.invoice_no}`
          );
        }
      }

      // 6. تنفيذ طريقة الرد المالي
      if (input.refund_method === 'cash') {
        let targetShiftId = input.shift_id;
        if (!targetShiftId) {
          const openShift = db
            .prepare("SELECT id FROM shifts WHERE status = 'open' ORDER BY id DESC LIMIT 1")
            .get() as { id: number } | undefined;
          targetShiftId = openShift?.id;
        }

        if (!targetShiftId) {
          // فتح وردية تلقائية للمستخدم لضمان عدم تعطل صرف المرتجع النقدي
          const shiftUuid = crypto.randomUUID();
          const shiftRes = db
            .prepare("INSERT INTO shifts (uuid, user_id, opening_balance, status, opened_at, notes) VALUES (?, ?, 0, 'open', datetime('now'), 'وردية تلقائية')")
            .run(shiftUuid, input.user_id);
          targetShiftId = Number(shiftRes.lastInsertRowid);
        }

        db.prepare(`
          INSERT INTO cash_movements (shift_id, user_id, type, amount, ref_type, ref_id, note, created_at)
          VALUES (?, ?, 'refund', ?, 'return', ?, ?, datetime('now'))
        `).run(
          targetShiftId,
          input.user_id,
          -Math.abs(totalRefund),
          returnId,
          `استرداد نقدي لمرتجع مبيعات #${returnId} لفاتورة #${sale.invoice_no}`
        );
      } else if (input.refund_method === 'credit') {
        if (!sale.customer_id) {
          throw new Error('لا يمكن رد المبلغ كرصيد حساب لعميل نقدي بدون تسجيل عميل');
        }
        // تخفيض رصيد العميل المدين
        db.prepare('UPDATE customers SET balance = balance - ? WHERE id = ?').run(
          totalRefund,
          sale.customer_id
        );
      }

      // 7. تسجيل التدقيق
      this.auditService.log(
        {
          userId: input.user_id,
          action: 'RETURN_PROCESSED',
          entityType: 'returns',
          entityId: returnId,
          details: {
            saleId: input.sale_id,
            totalRefund,
            refundMethod: input.refund_method,
            itemsCount: validatedItems.length,
          },
        },
        db
      );

      return this.getByIdInternal(returnId, db)!;
    })();
  }

  /**
   * عملية الاستبدال الكاملة (مرتجع أصناف + شراء أصناف بديلة جديدة) داخل معاملة واحدة
   */
  public async createExchange(input: ExchangeInput): Promise<ExchangeResult> {
    const db = this.getDb();
    const salesService = new SalesService(db, this.auditService);

    // 1. تنفيذ المرتجع مع ضبط طريقة الرد على 'exchange'
    const returnInvoice = this.createReturnInternal(
      {
        ...input.return_input,
        refund_method: 'exchange',
      },
      db
    );

    const refundAmount = returnInvoice.total_refund;

    // 2. حساب إجمالي الأصناف الجديدة المراد شراؤها
    let newSaleSubtotal = 0;
    const saleCartItems: Array<{
      variant_id: number;
      qty: number;
      unit_price: number;
      discount_amount: number;
    }> = [];

    for (const item of input.new_sale_items) {
      const variant = db
        .prepare('SELECT sale_price FROM product_variants WHERE id = ?')
        .get(item.variant_id) as { sale_price: number } | undefined;

      if (!variant) {
        throw new Error(`الصنف الجديد رقم ${item.variant_id} غير موجود`);
      }

      const itemTotal = variant.sale_price * item.qty - (item.discount_amount ?? 0);
      newSaleSubtotal += itemTotal;
      saleCartItems.push({
        variant_id: item.variant_id,
        qty: item.qty,
        unit_price: variant.sale_price,
        discount_amount: item.discount_amount ?? 0,
      });
    }

    // 3. تحديد فرق السعر والتسوية المالية
    const priceDifference = newSaleSubtotal - refundAmount;
    let newSaleId: number | undefined;
    let actionTaken: 'customer_paid' | 'customer_refunded' | 'even_exchange';

    const payments: Array<{ method: 'cash' | 'card' | 'wallet' | 'credit'; amount: number }> = [];

    if (priceDifference > 0) {
      // العميل يدفع الفرق الإضافي
      actionTaken = 'customer_paid';
      payments.push({
        method: 'cash',
        amount: refundAmount,
      });
      payments.push({
        method: (input.difference_payment_method as any) ?? 'cash',
        amount: priceDifference,
      });
    } else if (priceDifference < 0) {
      // المتجر يرد الفارق نقداً للعميل
      actionTaken = 'customer_refunded';
      payments.push({
        method: 'cash',
        amount: newSaleSubtotal,
      });
    } else {
      // تعادل متساوي
      actionTaken = 'even_exchange';
      payments.push({
        method: 'cash',
        amount: newSaleSubtotal,
      });
    }

    // 4. إنشاء فاتورة المبيعات الجديدة إذا وُجدت أصناف
    let shiftId = input.shift_id;
    if (shiftId) {
      const shiftExists = db.prepare('SELECT id FROM shifts WHERE id = ?').get(shiftId);
      if (!shiftExists) shiftId = undefined;
    }
    if (!shiftId) {
      const openShift = db
        .prepare("SELECT id FROM shifts WHERE status = 'open' ORDER BY id DESC LIMIT 1")
        .get() as { id: number } | undefined;
      if (openShift) {
        shiftId = openShift.id;
      } else {
        const shiftUuid = crypto.randomUUID();
        const shiftRes = db
          .prepare("INSERT INTO shifts (uuid, user_id, opening_balance, status, opened_at, notes) VALUES (?, ?, 0, 'open', datetime('now'), 'وردية تلقائية')")
          .run(shiftUuid, input.user_id);
        shiftId = Number(shiftRes.lastInsertRowid);
      }
    }

    if (saleCartItems.length > 0) {
      const newSale = await salesService.createSale(
        {
          items: saleCartItems,
          payments,
          discount_amount: 0,
          notes: `استبدال مرتبط بمرتجع #${returnInvoice.id}`,
        },
        input.user_id,
        shiftId
      );
      newSaleId = newSale.id;
    }

    // إذا كان هناك فارق نقدي مسترد للعميل، تسجيل حركة الخزنة
    if (priceDifference < 0 && shiftId) {
      db.prepare(`
        INSERT INTO cash_movements (shift_id, user_id, type, amount, ref_type, ref_id, note, created_at)
        VALUES (?, ?, 'refund', ?, 'exchange_diff', ?, ?, datetime('now'))
      `).run(
        shiftId,
        input.user_id,
        -Math.abs(priceDifference),
        returnInvoice.id,
        `صرف فارق استبدال نقدي لصالح العميل لمرتجع #${returnInvoice.id}`
      );
    }

    return {
      return_invoice: returnInvoice,
      new_sale_id: newSaleId,
      price_difference: priceDifference,
      action_taken: actionTaken,
    };
  }

  private createReturnInternal(input: CreateReturnInput, db: Database.Database): ReturnInvoice {
    // التحقق من وجود الفاتورة
    const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(input.sale_id) as any;
    if (!sale) throw new Error(`فاتورة المبيعات رقم ${input.sale_id} غير موجودة`);

    let totalRefund = 0;
    const validatedItems: any[] = [];

    for (const item of input.items) {
      const saleItem = db
        .prepare('SELECT * FROM sale_items WHERE id = ? AND sale_id = ?')
        .get(item.sale_item_id, input.sale_id) as any;
      if (!saleItem) throw new Error(`بند المبيعات رقم ${item.sale_item_id} غير موجود`);

      const prevReturned = db
        .prepare('SELECT COALESCE(SUM(qty), 0) as total_ret FROM return_items WHERE sale_item_id = ?')
        .get(item.sale_item_id) as { total_ret: number };

      const availableQty = saleItem.qty - prevReturned.total_ret;
      if (item.qty > availableQty) {
        throw new Error(`الكمية المرتجعة تتجاوز المتاح (${availableQty})`);
      }

      const lineRefund =
        item.qty === saleItem.qty
          ? saleItem.line_total
          : Math.round((saleItem.line_total * item.qty) / saleItem.qty);
      totalRefund += lineRefund;
      const unitRefund = Math.round(lineRefund / item.qty);

      validatedItems.push({
        saleItemId: saleItem.id,
        variantId: saleItem.variant_id,
        qty: item.qty,
        condition: item.condition,
        batchId: saleItem.batch_id,
        unitRefund,
      });
    }

    const returnUuid = crypto.randomUUID();
    const retRes = db
      .prepare(`
        INSERT INTO returns (uuid, sale_id, user_id, total_refund, refund_method, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `)
      .run(returnUuid, input.sale_id, input.user_id, totalRefund, input.refund_method, input.reason ?? null);
    const returnId = Number(retRes.lastInsertRowid);

    const insertReturnItem = db.prepare(`
      INSERT INTO return_items (return_id, sale_item_id, variant_id, qty, condition, batch_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertMovement = db.prepare(`
      INSERT INTO stock_movements (batch_id, type, qty, ref_type, ref_id, user_id, note, created_at)
      VALUES (?, 'sale_return', ?, 'return', ?, ?, ?, datetime('now'))
    `);

    for (const item of validatedItems) {
      insertReturnItem.run(returnId, item.saleItemId, item.variantId, item.qty, item.condition, item.batchId);
      if (item.condition === 'good') {
        insertMovement.run(
          item.batchId,
          item.qty,
          returnId,
          input.user_id,
          `مرتجع استبدال #${returnId}`
        );
      }
    }

    // تسجيل حركة الخزنة لمرتجع الاستبدال لمعادلة الفاتورة الجديدة
    if (input.refund_method === 'exchange') {
      let targetShiftId = input.shift_id;
      if (!targetShiftId) {
        const openShift = db
          .prepare("SELECT id FROM shifts WHERE status = 'open' ORDER BY id DESC LIMIT 1")
          .get() as { id: number } | undefined;
        targetShiftId = openShift?.id;
      }

      if (targetShiftId) {
        db.prepare(`
          INSERT INTO cash_movements (shift_id, user_id, type, amount, ref_type, ref_id, note, created_at)
          VALUES (?, ?, 'refund', ?, 'exchange_return', ?, ?, datetime('now'))
        `).run(
          targetShiftId,
          input.user_id,
          -Math.abs(totalRefund),
          returnId,
          `استرداد مقابل استبدال بضاعة لمرتجع #${returnId}`
        );
      }
    }

    return this.getByIdInternal(returnId, db)!;
  }

  private getByIdInternal(id: number, db: Database.Database): ReturnInvoice | null {
    const row = db
      .prepare(`
        SELECT 
          r.*, s.seq_no as sale_seq_no, s.customer_id,
          u.display_name as user_name, c.name as customer_name
        FROM returns r
        JOIN sales s ON r.sale_id = s.id
        JOIN users u ON r.user_id = u.id
        LEFT JOIN customers c ON s.customer_id = c.id
        WHERE r.id = ?
      `)
      .get(id) as any;

    if (!row) return null;

    const items = db
      .prepare(`
        SELECT 
          ri.*,
          si.product_name, si.variant_name, si.unit_price, si.line_total
        FROM return_items ri
        JOIN sale_items si ON ri.sale_item_id = si.id
        WHERE ri.return_id = ?
      `)
      .all(id) as ReturnItem[];

    return {
      ...row,
      items,
    };
  }

  /**
   * جلب مرتجع بالمعرف
   */
  public async getById(id: number): Promise<ReturnInvoice | null> {
    const db = this.getDb();
    return this.getByIdInternal(id, db);
  }

  /**
   * جلب المرتجعات التابعة لفاتورة مبيعات معينة
   */
  public async getBySaleId(saleId: number): Promise<ReturnInvoice[]> {
    const db = this.getDb();
    const rows = db
      .prepare('SELECT id FROM returns WHERE sale_id = ? ORDER BY id DESC')
      .all(saleId) as { id: number }[];

    return rows.map((r) => this.getByIdInternal(r.id, db)!);
  }

  /**
   * قائمة المرتجعات مع الفلاتر
   */
  public async list(filters?: {
    saleId?: number;
    customerId?: number;
    startDate?: string;
    endDate?: string;
    limit?: number;
  }): Promise<ReturnInvoice[]> {
    const db = this.getDb();
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (filters?.saleId) {
      conditions.push('r.sale_id = ?');
      params.push(filters.saleId);
    }
    if (filters?.customerId) {
      conditions.push('s.customer_id = ?');
      params.push(filters.customerId);
    }
    if (filters?.startDate) {
      conditions.push('r.created_at >= date(?)');
      params.push(filters.startDate);
    }
    if (filters?.endDate) {
      conditions.push("r.created_at <= date(?, '+1 day')");
      params.push(filters.endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.max(1, filters?.limit ?? 50);

    const sql = `
      SELECT r.id
      FROM returns r
      JOIN sales s ON r.sale_id = s.id
      ${whereClause}
      ORDER BY r.id DESC
      LIMIT ?
    `;

    const rows = db.prepare(sql).all(...params, limit) as { id: number }[];
    return rows.map((r) => this.getByIdInternal(r.id, db)!);
  }

  /**
   * وظيفة معالجة المرتجع (متوافقة مع النسخ السابقة)
   */
  public async processReturn(returnInvoice: Partial<ReturnInvoice>): Promise<ReturnInvoice> {
    if (!returnInvoice.sale_id || !returnInvoice.user_id) {
      throw new Error('بيانات المرتجع غير مكتملة');
    }
    return this.createReturn({
      sale_id: returnInvoice.sale_id,
      user_id: returnInvoice.user_id,
      refund_method: returnInvoice.refund_method ?? 'cash',
      reason: returnInvoice.reason,
      items: (returnInvoice.items ?? []).map((i) => ({
        sale_item_id: i.sale_item_id,
        qty: i.qty,
        condition: i.condition,
      })),
    });
  }
}

export const returnsService = new ReturnsService();
