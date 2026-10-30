/**
 * خدمة إدارة الموردين وحساباتهم (Suppliers & Accounts Service)
 * تدير: تسجيل الموردين، كشوفات الحساب، دفعات السداد النقدية والآجلة، والأرشفة
 */

import crypto from 'crypto';
import type Database from 'better-sqlite3';
import { getDatabase } from '../db/connection';
import {
  Supplier,
  CreateSupplierInput,
  UpdateSupplierInput,
  SupplierPayment,
  SupplierStatement,
  SupplierStatementEntry,
} from '../../shared/types/purchases.types';
import { auditService as globalAuditService, AuditService } from './audit.service';

export class SuppliersService {
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
   * جلب قائمة الموردين مع البحث وإحصائيات الفواتير
   */
  public async list(filters?: {
    search?: string;
    isActive?: boolean;
    limit?: number;
  }): Promise<Supplier[]> {
    const db = this.getDb();
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (filters?.isActive !== undefined) {
      conditions.push('s.is_active = ?');
      params.push(filters.isActive ? 1 : 0);
    }

    if (filters?.search && filters.search.trim().length > 0) {
      conditions.push('(s.name LIKE ? OR s.phone LIKE ?)');
      const term = `%${filters.search.trim()}%`;
      params.push(term, term);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.max(1, filters?.limit ?? 50);

    const sql = `
      SELECT 
        s.id, s.uuid, s.name, s.phone, s.address, s.balance, s.balance as current_balance, s.is_active, s.created_at,
        COUNT(p.id) as purchases_count,
        COALESCE(SUM(p.total), 0) as total_purchases_amount
      FROM suppliers s
      LEFT JOIN purchases p ON p.supplier_id = s.id AND p.status != 'cancelled'
      ${whereClause}
      GROUP BY s.id
      ORDER BY s.id DESC
      LIMIT ?
    `;

    return db.prepare(sql).all(...params, limit) as Supplier[];
  }

  /**
   * جلب مورد بالمعرف
   */
  public async getById(id: number): Promise<Supplier | null> {
    const db = this.getDb();
    const row = db
      .prepare(`
        SELECT 
          s.id, s.uuid, s.name, s.phone, s.address, s.balance, s.balance as current_balance, s.is_active, s.created_at,
          COUNT(p.id) as purchases_count,
          COALESCE(SUM(p.total), 0) as total_purchases_amount
        FROM suppliers s
        LEFT JOIN purchases p ON p.supplier_id = s.id AND p.status != 'cancelled'
        WHERE s.id = ?
        GROUP BY s.id
      `)
      .get(id) as Supplier | undefined;

    return row ?? null;
  }

  /**
   * إنشاء مورد جديد
   */
  public async create(data: CreateSupplierInput, userId: number): Promise<Supplier> {
    const db = this.getDb();
    const name = data.name.trim();

    if (!name) {
      throw new Error('اسم المورد مطلوب');
    }

    const uuid = crypto.randomUUID();
    const initialBalance = data.initial_balance ?? 0;

    return db.transaction(() => {
      const stmt = db.prepare(`
        INSERT INTO suppliers (uuid, name, phone, address, balance, is_active, created_at)
        VALUES (?, ?, ?, ?, ?, 1, datetime('now'))
      `);

      const res = stmt.run(
        uuid,
        name,
        data.phone?.trim() ?? null,
        data.address?.trim() ?? null,
        initialBalance
      );
      const supplierId = Number(res.lastInsertRowid);

      this.auditService.log(
        {
          userId,
          action: 'SUPPLIER_CREATED',
          entityType: 'supplier',
          entityId: supplierId,
          details: { name, initialBalance },
        },
        db
      );

      return db
        .prepare('SELECT *, balance as current_balance FROM suppliers WHERE id = ?')
        .get(supplierId) as Supplier;
    })();
  }

  /**
   * تحديث بيانات مورد
   */
  public async update(id: number, data: UpdateSupplierInput, userId: number): Promise<Supplier> {
    const db = this.getDb();

    return db.transaction(() => {
      const existing = db.prepare('SELECT id FROM suppliers WHERE id = ?').get(id);
      if (!existing) {
        throw new Error(`المورد رقم ${id} غير موجود`);
      }

      const updates: string[] = [];
      const params: (string | number | null)[] = [];

      if (data.name !== undefined) {
        const name = data.name.trim();
        if (!name) throw new Error('اسم المورد لا يمكن أن يكون فارغاً');
        updates.push('name = ?');
        params.push(name);
      }
      if (data.phone !== undefined) {
        updates.push('phone = ?');
        params.push(data.phone ? data.phone.trim() : null);
      }
      if (data.address !== undefined) {
        updates.push('address = ?');
        params.push(data.address ? data.address.trim() : null);
      }
      if (data.is_active !== undefined) {
        updates.push('is_active = ?');
        params.push(data.is_active ? 1 : 0);
      }

      if (updates.length > 0) {
        params.push(id);
        db.prepare(`UPDATE suppliers SET ${updates.join(', ')} WHERE id = ?`).run(...params);
      }

      this.auditService.log(
        {
          userId,
          action: 'SUPPLIER_UPDATED',
          entityType: 'supplier',
          entityId: id,
          details: data,
        },
        db
      );

      return db
        .prepare('SELECT *, balance as current_balance FROM suppliers WHERE id = ?')
        .get(id) as Supplier;
    })();
  }

  /**
   * أرشفة مورد (تعطيل)
   */
  public async archive(id: number, userId: number): Promise<void> {
    const db = this.getDb();

    db.transaction(() => {
      const supplier = db
        .prepare('SELECT id, balance FROM suppliers WHERE id = ?')
        .get(id) as { id: number; balance: number } | undefined;

      if (!supplier) {
        throw new Error(`المورد رقم ${id} غير موجود`);
      }

      if (supplier.balance > 0) {
        throw new Error(`لا يمكن أرشفة مورد له رصيد متبقي مستحق (${supplier.balance} قرش)`);
      }

      db.prepare('UPDATE suppliers SET is_active = 0 WHERE id = ?').run(id);

      this.auditService.log(
        {
          userId,
          action: 'SUPPLIER_ARCHIVED',
          entityType: 'supplier',
          entityId: id,
        },
        db
      );
    })();
  }

  /**
   * تسجيل دفعة سداد للمورد
   */
  public async recordPayment(params: {
    supplierId: number;
    amount: number;
    paymentMethod: string;
    note?: string | null;
    userId: number;
    shiftId?: number | null;
  }): Promise<SupplierPayment> {
    if (params.amount <= 0) {
      throw new Error('مبلغ السداد يجب أن يكون أكبر من الصفر');
    }

    const db = this.getDb();
    const paymentUuid = crypto.randomUUID();

    return db.transaction(() => {
      const supplier = db
        .prepare('SELECT id, name, balance FROM suppliers WHERE id = ?')
        .get(params.supplierId) as { id: number; name: string; balance: number } | undefined;

      if (!supplier) {
        throw new Error(`المورد رقم ${params.supplierId} غير موجود`);
      }

      // 1. تسجيل دفعة السداد
      const insertPayment = db.prepare(`
        INSERT INTO supplier_payments (uuid, supplier_id, amount, payment_method, note, user_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `);

      const res = insertPayment.run(
        paymentUuid,
        params.supplierId,
        params.amount,
        params.paymentMethod,
        params.note ?? null,
        params.userId
      );
      const paymentId = Number(res.lastInsertRowid);

      // 2. تخفيض رصيد المورد (مديونية المتجر للمورد تنقص)
      db.prepare(`UPDATE suppliers SET balance = balance - ? WHERE id = ?`).run(
        params.amount,
        params.supplierId
      );

      // 3. في حالة السداد النقدي، تسجيل حركة صرف من الخزنة
      if (params.paymentMethod === 'cash') {
        // التحقق من وجود وردية نشطة إن تم تمرير shiftId أو جلب الوردية المفتوحة
        let targetShiftId = params.shiftId;
        if (!targetShiftId) {
          const openShift = db
            .prepare("SELECT id FROM shifts WHERE status = 'open' ORDER BY id DESC LIMIT 1")
            .get() as { id: number } | undefined;
          targetShiftId = openShift?.id;
        }

        if (!targetShiftId) {
          // فتح وردية تلقائية للمستخدم لضمان عدم تعطل السداد للمورد
          const shiftUuid = crypto.randomUUID();
          const shiftRes = db
            .prepare("INSERT INTO shifts (uuid, user_id, opening_balance, status, opened_at, notes) VALUES (?, ?, 0, 'open', datetime('now'), 'وردية تلقائية')")
            .run(shiftUuid, params.userId);
          targetShiftId = Number(shiftRes.lastInsertRowid);
        }

        db.prepare(`
          INSERT INTO cash_movements (shift_id, user_id, type, amount, ref_type, ref_id, note, created_at)
          VALUES (?, ?, 'withdrawal', ?, 'supplier_payment', ?, ?, datetime('now'))
        `).run(
          targetShiftId,
          params.userId,
          params.amount,
          paymentId,
          `سداد للمورد: ${supplier.name} ${params.note ? `(${params.note})` : ''}`.trim()
        );
      }

      this.auditService.log(
        {
          userId: params.userId,
          action: 'SUPPLIER_PAYMENT_RECORDED',
          entityType: 'supplier_payment',
          entityId: paymentId,
          details: {
            supplierId: params.supplierId,
            amount: params.amount,
            method: params.paymentMethod,
          },
        },
        db
      );

      return db
        .prepare(`
          SELECT sp.*, s.name as supplier_name, u.display_name as user_name
          FROM supplier_payments sp
          JOIN suppliers s ON sp.supplier_id = s.id
          JOIN users u ON sp.user_id = u.id
          WHERE sp.id = ?
        `)
        .get(paymentId) as SupplierPayment;
    })();
  }

  /**
   * استخراج كشف حساب المورد الشامل
   */
  public async getStatement(
    supplierId: number,
    dateRange?: { from?: string; to?: string }
  ): Promise<SupplierStatement> {
    const db = this.getDb();

    const supplier = await this.getById(supplierId);
    if (!supplier) {
      throw new Error(`المورد رقم ${supplierId} غير موجود`);
    }

    const conditions: string[] = ['supplier_id = ?'];
    const params: (string | number)[] = [supplierId];

    if (dateRange?.from) {
      conditions.push("created_at >= date(?)");
      params.push(dateRange.from);
    }
    if (dateRange?.to) {
      conditions.push("created_at <= date(?, '+1 day')");
      params.push(dateRange.to);
    }

    // 1. فواتير الشراء (debit: المورد دائن لنا بقيمة الفاتورة)
    const purchasesSql = `
      SELECT 'purchase' as type, created_at as date, total as debit, 0 as credit,
             ('فاتورة شراء رقم ' || id || COALESCE(' (' || invoice_no || ')', '')) as description,
             id as ref_id
      FROM purchases
      WHERE supplier_id = ? AND status != 'cancelled'
      ${dateRange?.from ? "AND created_at >= date(?)" : ''}
      ${dateRange?.to ? "AND created_at <= date(?, '+1 day')" : ''}
    `;

    // 2. دفعات السداد (credit: سددنا له فتنقص مديونيته)
    const paymentsSql = `
      SELECT 'payment' as type, created_at as date, 0 as debit, amount as credit,
             ('دفعة سداد ' || payment_method || COALESCE(' - ' || note, '')) as description,
             id as ref_id
      FROM supplier_payments
      WHERE supplier_id = ?
      ${dateRange?.from ? "AND created_at >= date(?)" : ''}
      ${dateRange?.to ? "AND created_at <= date(?, '+1 day')" : ''}
    `;

    // 3. مرتجعات الشراء (credit: رد بضاعة فينقص رصيده)
    const returnsSql = `
      SELECT 'return' as type, created_at as date, 0 as debit, total_refund as credit,
             ('مرتجع شراء رقم ' || id || COALESCE(' - ' || note, '')) as description,
             id as ref_id
      FROM purchase_returns
      WHERE supplier_id = ?
      ${dateRange?.from ? "AND created_at >= date(?)" : ''}
      ${dateRange?.to ? "AND created_at <= date(?, '+1 day')" : ''}
    `;

    const statementSql = `
      SELECT * FROM (
        ${purchasesSql}
        UNION ALL
        ${paymentsSql}
        UNION ALL
        ${returnsSql}
      )
      ORDER BY date ASC, ref_id ASC
    `;

    const rawParams: (string | number)[] = [];
    // نضيف الباراميترات لكل استعلام فرعي
    for (let i = 0; i < 3; i++) {
      rawParams.push(supplierId);
      if (dateRange?.from) rawParams.push(dateRange.from);
      if (dateRange?.to) rawParams.push(dateRange.to);
    }

    const rawEntries = db.prepare(statementSql).all(...rawParams) as SupplierStatementEntry[];

    let runningBalance = 0;
    let totalPurchases = 0;
    let totalPayments = 0;
    let totalReturns = 0;

    const entries = rawEntries.map((e) => {
      if (e.type === 'purchase') totalPurchases += e.debit;
      if (e.type === 'payment') totalPayments += e.credit;
      if (e.type === 'return') totalReturns += e.credit;

      runningBalance += e.debit - e.credit;
      return {
        ...e,
        balance_after: runningBalance,
      };
    });

    return {
      supplier,
      total_purchases: totalPurchases,
      total_payments: totalPayments,
      total_returns: totalReturns,
      current_balance: supplier.balance,
      entries,
    };
  }
}

export const suppliersService = new SuppliersService();
