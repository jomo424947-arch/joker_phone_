/**
 * خدمة إدارة العملاء وحسابات البيع بالآجل (Customers & Credit Accounts Service)
 * تدير: تسجيل العملاء، متابعة الحدود الائتمانية، سداد دفعات الآجل، كشوفات الحساب، وسجل المشتريات
 */

import crypto from 'crypto';
import type Database from 'better-sqlite3';
import { getDatabase } from '../db/connection';
import {
  Customer,
  CreateCustomerInput,
  UpdateCustomerInput,
  CustomerPayment,
  CustomerStatement,
  CustomerStatementEntry,
  CustomerPurchaseHistoryItem,
} from '../../shared/types/customers.types';
import { auditService as globalAuditService, AuditService } from './audit.service';

export class CustomersService {
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
   * جلب قائمة العملاء مع البحث وإحصائيات المبيعات
   */
  public async list(filters?: {
    search?: string;
    isActive?: boolean;
    limit?: number;
  }): Promise<Customer[]> {
    const db = this.getDb();
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (filters?.isActive !== undefined) {
      conditions.push('c.is_active = ?');
      params.push(filters.isActive ? 1 : 0);
    }

    if (filters?.search && filters.search.trim().length > 0) {
      conditions.push('(c.name LIKE ? OR c.phone LIKE ?)');
      const term = `%${filters.search.trim()}%`;
      params.push(term, term);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.max(1, filters?.limit ?? 50);

    const sql = `
      SELECT 
        c.id, c.uuid, c.name, c.phone, c.credit_limit, c.balance, c.notes, c.is_active, c.created_at,
        COUNT(s.id) as sales_count,
        COALESCE(SUM(s.total), 0) as total_sales_amount
      FROM customers c
      LEFT JOIN sales s ON s.customer_id = c.id AND s.status != 'voided'
      ${whereClause}
      GROUP BY c.id
      ORDER BY c.id DESC
      LIMIT ?
    `;

    return db.prepare(sql).all(...params, limit) as Customer[];
  }

  /**
   * جلب عميل بالمعرف
   */
  public async getById(id: number): Promise<Customer | null> {
    const db = this.getDb();
    const row = db
      .prepare(`
        SELECT 
          c.id, c.uuid, c.name, c.phone, c.credit_limit, c.balance, c.notes, c.is_active, c.created_at,
          COUNT(s.id) as sales_count,
          COALESCE(SUM(s.total), 0) as total_sales_amount
        FROM customers c
        LEFT JOIN sales s ON s.customer_id = c.id AND s.status != 'voided'
        WHERE c.id = ?
        GROUP BY c.id
      `)
      .get(id) as Customer | undefined;

    return row ?? null;
  }

  /**
   * إنشاء عميل جديد
   */
  public async create(data: CreateCustomerInput, userId: number): Promise<Customer> {
    const db = this.getDb();
    const name = data.name.trim();

    if (!name) {
      throw new Error('اسم العميل مطلوب');
    }

    const uuid = crypto.randomUUID();
    const initialBalance = data.initial_balance ?? 0;
    const creditLimit = Math.max(0, data.credit_limit ?? 0);

    return db.transaction(() => {
      const stmt = db.prepare(`
        INSERT INTO customers (uuid, name, phone, credit_limit, balance, notes, is_active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))
      `);

      const res = stmt.run(
        uuid,
        name,
        data.phone?.trim() ?? null,
        creditLimit,
        initialBalance,
        data.notes?.trim() ?? null
      );
      const customerId = Number(res.lastInsertRowid);

      this.auditService.log(
        {
          userId,
          action: 'CUSTOMER_CREATED',
          entityType: 'customer',
          entityId: customerId,
          details: { name, creditLimit, initialBalance },
        },
        db
      );

      return db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId) as Customer;
    })();
  }

  /**
   * تحديث بيانات عميل
   */
  public async update(id: number, data: UpdateCustomerInput, userId: number): Promise<Customer> {
    const db = this.getDb();

    return db.transaction(() => {
      const existing = db.prepare('SELECT id FROM customers WHERE id = ?').get(id);
      if (!existing) {
        throw new Error(`العميل رقم ${id} غير موجود`);
      }

      const updates: string[] = [];
      const params: (string | number | null)[] = [];

      if (data.name !== undefined) {
        const name = data.name.trim();
        if (!name) throw new Error('اسم العميل لا يمكن أن يكون فارغاً');
        updates.push('name = ?');
        params.push(name);
      }
      if (data.phone !== undefined) {
        updates.push('phone = ?');
        params.push(data.phone ? data.phone.trim() : null);
      }
      if (data.credit_limit !== undefined) {
        updates.push('credit_limit = ?');
        params.push(Math.max(0, data.credit_limit));
      }
      if (data.notes !== undefined) {
        updates.push('notes = ?');
        params.push(data.notes ? data.notes.trim() : null);
      }
      if (data.is_active !== undefined) {
        updates.push('is_active = ?');
        params.push(data.is_active ? 1 : 0);
      }

      if (updates.length > 0) {
        params.push(id);
        db.prepare(`UPDATE customers SET ${updates.join(', ')} WHERE id = ?`).run(...params);
      }

      this.auditService.log(
        {
          userId,
          action: 'CUSTOMER_UPDATED',
          entityType: 'customer',
          entityId: id,
          details: data,
        },
        db
      );

      return db.prepare('SELECT * FROM customers WHERE id = ?').get(id) as Customer;
    })();
  }

  /**
   * أرشفة عميل (تعطيل)
   */
  public async archive(id: number, userId: number): Promise<void> {
    const db = this.getDb();

    db.transaction(() => {
      const customer = db
        .prepare('SELECT id, balance FROM customers WHERE id = ?')
        .get(id) as { id: number; balance: number } | undefined;

      if (!customer) {
        throw new Error(`العميل رقم ${id} غير موجود`);
      }

      if (customer.balance > 0) {
        throw new Error(`لا يمكن أرشفة عميل عليه مديونية متبقية (${customer.balance} قرش)`);
      }

      db.prepare('UPDATE customers SET is_active = 0 WHERE id = ?').run(id);

      this.auditService.log(
        {
          userId,
          action: 'CUSTOMER_ARCHIVED',
          entityType: 'customer',
          entityId: id,
        },
        db
      );
    })();
  }

  /**
   * التحقق من قدرة العميل على الشراء الآجل وفق حده الائتماني
   */
  public async checkCreditLimit(
    customerId: number,
    requestedAmount: number
  ): Promise<{ allowed: boolean; currentBalance: number; creditLimit: number; availableCredit: number }> {
    const customer = await this.getById(customerId);
    if (!customer) {
      throw new Error(`العميل رقم ${customerId} غير موجود`);
    }

    const availableCredit = Math.max(0, customer.credit_limit - customer.balance);
    const allowed = customer.credit_limit === 0 || customer.balance + requestedAmount <= customer.credit_limit;

    return {
      allowed,
      currentBalance: customer.balance,
      creditLimit: customer.credit_limit,
      availableCredit,
    };
  }

  /**
   * تسجيل دفعة سداد من العميل وتخفيض رصيده المدين وتسجيل حركة الخزنة
   */
  public async recordPayment(params: {
    customerId: number;
    amount: number;
    paymentMethod: string;
    note?: string | null;
    userId: number;
    shiftId?: number | null;
  }): Promise<CustomerPayment> {
    if (params.amount <= 0) {
      throw new Error('مبلغ السداد يجب أن يكون أكبر من الصفر');
    }

    const db = this.getDb();
    const paymentUuid = crypto.randomUUID();

    return db.transaction(() => {
      const customer = db
        .prepare('SELECT id, name, balance FROM customers WHERE id = ?')
        .get(params.customerId) as { id: number; name: string; balance: number } | undefined;

      if (!customer) {
        throw new Error(`العميل رقم ${params.customerId} غير موجود`);
      }

      // 1. تسجيل دفعة السداد
      const insertPayment = db.prepare(`
        INSERT INTO customer_payments (uuid, customer_id, amount, payment_method, note, user_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `);

      const res = insertPayment.run(
        paymentUuid,
        params.customerId,
        params.amount,
        params.paymentMethod,
        params.note ?? null,
        params.userId
      );
      const paymentId = Number(res.lastInsertRowid);

      // 2. تخفيض رصيد العميل المدين
      db.prepare(`UPDATE customers SET balance = balance - ? WHERE id = ?`).run(
        params.amount,
        params.customerId
      );

      // 3. في حالة السداد النقدي، تسجيل حركة إيداع في الخزنة
      if (params.paymentMethod === 'cash') {
        let targetShiftId = params.shiftId;
        if (!targetShiftId) {
          const openShift = db
            .prepare("SELECT id FROM shifts WHERE status = 'open' ORDER BY id DESC LIMIT 1")
            .get() as { id: number } | undefined;
          targetShiftId = openShift?.id;
        }

        if (!targetShiftId) {
          // فتح وردية تلقائية للمستخدم لضمان عدم تعطل تسجيل المدفوعات النقدية
          const shiftUuid = crypto.randomUUID();
          const shiftRes = db
            .prepare("INSERT INTO shifts (uuid, user_id, opening_balance, status, opened_at, notes) VALUES (?, ?, 0, 'open', datetime('now'), 'وردية تلقائية')")
            .run(shiftUuid, params.userId);
          targetShiftId = Number(shiftRes.lastInsertRowid);
        }

        db.prepare(`
          INSERT INTO cash_movements (shift_id, user_id, type, amount, ref_type, ref_id, note, created_at)
          VALUES (?, ?, 'deposit', ?, 'customer_payment', ?, ?, datetime('now'))
        `).run(
          targetShiftId,
          params.userId,
          params.amount,
          paymentId,
          `سداد آجل من العميل: ${customer.name} ${params.note ? `(${params.note})` : ''}`.trim()
        );
      }

      this.auditService.log(
        {
          userId: params.userId,
          action: 'CUSTOMER_PAYMENT_RECORDED',
          entityType: 'customer_payment',
          entityId: paymentId,
          details: {
            customerId: params.customerId,
            amount: params.amount,
            method: params.paymentMethod,
          },
        },
        db
      );

      return db
        .prepare(`
          SELECT cp.*, c.name as customer_name, u.display_name as user_name
          FROM customer_payments cp
          JOIN customers c ON cp.customer_id = c.id
          JOIN users u ON cp.user_id = u.id
          WHERE cp.id = ?
        `)
        .get(paymentId) as CustomerPayment;
    })();
  }

  /**
   * استخراج كشف حساب العميل الشامل (مبيعات آجلة + دفعات سداد + مرتجعات رصيد)
   */
  public async getStatement(
    customerId: number,
    dateRange?: { from?: string; to?: string }
  ): Promise<CustomerStatement> {
    const db = this.getDb();

    const customer = await this.getById(customerId);
    if (!customer) {
      throw new Error(`العميل رقم ${customerId} غير موجود`);
    }

    // 1. فواتير البيع الآجل (debit: العميل مدين بها)
    const salesSql = `
      SELECT 'sale' as type, s.created_at as date, sp.amount as debit, 0 as credit,
             ('فاتورة بيع رقم ' || s.seq_no) as description,
             s.id as ref_id
      FROM sales s
      JOIN sale_payments sp ON sp.sale_id = s.id AND sp.method = 'credit'
      WHERE s.customer_id = ? AND s.status != 'voided'
      ${dateRange?.from ? "AND s.created_at >= date(?)" : ''}
      ${dateRange?.to ? "AND s.created_at <= date(?, '+1 day')" : ''}
    `;

    // 2. دفعات السداد (credit: سدد فينقص رصيده المدين)
    const paymentsSql = `
      SELECT 'payment' as type, cp.created_at as date, 0 as debit, cp.amount as credit,
             ('دفعة سداد ' || cp.payment_method || COALESCE(' - ' || cp.note, '')) as description,
             cp.id as ref_id
      FROM customer_payments cp
      WHERE cp.customer_id = ?
      ${dateRange?.from ? "AND cp.created_at >= date(?)" : ''}
      ${dateRange?.to ? "AND cp.created_at <= date(?, '+1 day')" : ''}
    `;

    // 3. مرتجعات الرد كرصيد (credit: رد بضاعة على حسابه فينقص الرصيد المدين)
    const returnsSql = `
      SELECT 'return' as type, r.created_at as date, 0 as debit, r.total_refund as credit,
             ('مرتجع بيع رقم ' || r.id || ' للفاتورة #' || s.seq_no) as description,
             r.id as ref_id
      FROM returns r
      JOIN sales s ON r.sale_id = s.id
      WHERE s.customer_id = ? AND r.refund_method = 'credit'
      ${dateRange?.from ? "AND r.created_at >= date(?)" : ''}
      ${dateRange?.to ? "AND r.created_at <= date(?, '+1 day')" : ''}
    `;

    const statementSql = `
      SELECT * FROM (
        ${salesSql}
        UNION ALL
        ${paymentsSql}
        UNION ALL
        ${returnsSql}
      )
      ORDER BY date ASC, ref_id ASC
    `;

    const rawParams: (string | number)[] = [];
    for (let i = 0; i < 3; i++) {
      rawParams.push(customerId);
      if (dateRange?.from) rawParams.push(dateRange.from);
      if (dateRange?.to) rawParams.push(dateRange.to);
    }

    const rawEntries = db.prepare(statementSql).all(...rawParams) as CustomerStatementEntry[];

    let runningBalance = 0;
    let totalCreditSales = 0;
    let totalPayments = 0;
    let totalReturns = 0;

    const entries = rawEntries.map((e) => {
      if (e.type === 'sale') totalCreditSales += e.debit;
      if (e.type === 'payment') totalPayments += e.credit;
      if (e.type === 'return') totalReturns += e.credit;

      runningBalance += e.debit - e.credit;
      return {
        ...e,
        balance_after: runningBalance,
      };
    });

    return {
      customer,
      total_credit_sales: totalCreditSales,
      total_payments: totalPayments,
      total_returns: totalReturns,
      current_balance: customer.balance,
      entries,
    };
  }

  /**
   * جلب سجل مشتريات العميل
   */
  public async getPurchaseHistory(
    customerId: number,
    limit: number = 20
  ): Promise<CustomerPurchaseHistoryItem[]> {
    const db = this.getDb();
    const sql = `
      SELECT 
        s.id, s.seq_no, s.created_at, s.total, s.status,
        (SELECT method FROM sale_payments WHERE sale_id = s.id LIMIT 1) as payment_method,
        (SELECT COUNT(id) FROM sale_items WHERE sale_id = s.id) as items_count
      FROM sales s
      WHERE s.customer_id = ?
      ORDER BY s.id DESC
      LIMIT ?
    `;

    return db.prepare(sql).all(customerId, limit) as CustomerPurchaseHistoryItem[];
  }
}

export const customersService = new CustomersService();
