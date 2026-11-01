/**
 * خدمة الخزنة والورديات (Cash & Shifts Service)
 * تدير: فتح وإغلاق الوردية، العد الأعمى للكاشير، تسجيل حركات النقدية والمصروفات،
 * وإصدار تقرير الإغلاق المالي (Z-Report)
 */

import crypto from 'crypto';
import type Database from 'better-sqlite3';
import { getDatabase } from '../db/connection';
import { Shift, CashMovement, Expense, CashMovementType, CashMovementsFilter, ExpensesFilter } from '../../shared/types/cash.types';
import { auditService as globalAuditService, AuditService } from './audit.service';

export interface ShiftSummary {
  shift: Shift;
  cashier_name: string;
  opening_balance: number;
  total_cash_sales: number;
  total_card_sales: number;
  total_wallet_sales: number;
  total_credit_sales: number;
  total_sales: number;
  total_refunds: number;
  total_expenses: number;
  total_deposits: number;
  total_withdrawals: number;
  expected_balance: number;
  actual_balance?: number | null;
  difference?: number | null;
  expenses_by_category: { category: string; amount: number }[];
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
    VALUES (?, ?, 0, 'open', datetime('now'), 'وردية تلقائية')
  `).run(uuid, effectiveUserId);
  return Number(res.lastInsertRowid);
}

export class CashService {
  private db?: Database.Database;
  private auditService: AuditService;

  constructor(db?: Database.Database, audit?: AuditService) {
    this.db = db;
    this.auditService = audit ?? (db ? new AuditService(db) : globalAuditService);
  }

  private getDb(): Database.Database {
    return this.db ?? getDatabase();
  }

  private mapShift(row: any): Shift {
    return {
      id: row.id,
      uuid: row.uuid,
      user_id: row.user_id,
      opening_balance: row.opening_balance,
      closing_balance: row.closing_balance,
      expected_balance: row.expected_balance,
      difference: row.difference,
      status: row.status,
      opened_at: row.opened_at,
      closed_at: row.closed_at,
      notes: row.notes,
      opening_cash: row.opening_balance,
      actual_closing_cash: row.closing_balance,
      expected_closing_cash: row.expected_balance,
      difference_amount: row.difference,
      cashier_name: row.cashier_name ?? row.display_name,
    };
  }

  /**
   * جلب الوردية المفتوحة حالياً لمستخدم أو للنظام ككل
   */
  async getActiveShift(userId?: number): Promise<Shift | null> {
    const db = this.getDb();
    let row: any;

    if (userId) {
      row = db
        .prepare("SELECT * FROM shifts WHERE user_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1")
        .get(userId);
    } else {
      row = db
        .prepare("SELECT * FROM shifts WHERE status = 'open' ORDER BY id DESC LIMIT 1")
        .get();
    }

    return row ? this.mapShift(row) : null;
  }

  /**
   * فتح وردية جديدة
   */
  async openShift(userId: number, openingCash: number, notes?: string): Promise<Shift> {
    const db = this.getDb();
    let newShiftId = 0;

    const openTx = db.transaction(() => {
      const effectiveUserId = resolveUserId(db, userId);
      // التأكد من عدم وجود وردية مفتوحة بالفعل لنفس المستخدم
      const existing = db
        .prepare("SELECT id FROM shifts WHERE user_id = ? AND status = 'open'")
        .get(effectiveUserId);
      if (existing) {
        throw new Error('توجد وردية مفتوحة بالفعل لهذا المستخدم، يجب إغلاقها أولاً');
      }

      const shiftUuid = crypto.randomUUID();
      const insertShift = db.prepare(`
        INSERT INTO shifts (uuid, user_id, opening_balance, status, opened_at, notes)
        VALUES (?, ?, ?, 'open', datetime('now'), ?)
      `);

      const res = insertShift.run(shiftUuid, effectiveUserId, openingCash, notes ?? null);
      newShiftId = Number(res.lastInsertRowid);

      // تسجيل الرصيد الافتتاحي كحركة إيداع في الخزنة
      db.prepare(`
        INSERT INTO cash_movements (shift_id, user_id, type, amount, note, created_at)
        VALUES (?, ?, 'deposit', ?, 'رصيد افتتاحي للوردية', datetime('now'))
      `).run(newShiftId, effectiveUserId, openingCash);

      this.auditService.log({
        userId: effectiveUserId,
        action: 'OPEN_SHIFT',
        entityType: 'shifts',
        entityId: newShiftId,
        details: { opening_balance: openingCash },
      });
    });

    openTx();
    const createdRow = db.prepare('SELECT * FROM shifts WHERE id = ?').get(newShiftId);
    return this.mapShift(createdRow);
  }

  /**
   * تسجيل حركة نقدية في الخزنة (بيع، مرتجع، إيداع، سحب، مصروف)
   */
  async recordCashMovement(
    movement: {
      shift_id: number;
      user_id?: number | null;
      type: CashMovementType;
      amount: number;
      ref_type?: string | null;
      ref_id?: number | null;
      note?: string | null;
    },
    txDb?: Database.Database
  ): Promise<CashMovement> {
    const db = txDb ?? this.getDb();
    const effectiveUserId = movement.user_id ? resolveUserId(db, movement.user_id) : null;
    const effectiveShiftId = resolveShiftId(db, movement.shift_id, effectiveUserId ?? undefined);

    const stmt = db.prepare(`
      INSERT INTO cash_movements (shift_id, user_id, type, amount, ref_type, ref_id, note, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    const result = stmt.run(
      effectiveShiftId,
      effectiveUserId,
      movement.type,
      movement.amount,
      movement.ref_type ?? null,
      movement.ref_id ?? null,
      movement.note ?? null
    );

    const insertedId = Number(result.lastInsertRowid);
    const row = db.prepare('SELECT * FROM cash_movements WHERE id = ?').get(insertedId) as any;

    return {
      id: row.id,
      shift_id: row.shift_id,
      user_id: row.user_id,
      type: row.type,
      amount: row.amount,
      ref_type: row.ref_type,
      ref_id: row.ref_id,
      note: row.note,
      reason: row.note,
      created_at: row.created_at,
    };
  }

  /**
   * تسجيل مصروف نثري أو تشغيلي وربطه بحركة خزنة سالبة
   */
  async recordExpense(input: {
    shift_id: number;
    user_id: number;
    category: string;
    amount: number;
    note?: string | null;
  }): Promise<Expense> {
    const db = this.getDb();
    let expenseId = 0;

    const expenseTx = db.transaction(() => {
      const effectiveUserId = resolveUserId(db, input.user_id);
      const effectiveShiftId = resolveShiftId(db, input.shift_id, effectiveUserId);
      const expenseUuid = crypto.randomUUID();
      const res = db
        .prepare(`
          INSERT INTO expenses (uuid, shift_id, user_id, category, amount, note, created_at)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        `)
        .run(
          expenseUuid,
          effectiveShiftId,
          effectiveUserId,
          input.category.trim(),
          input.amount,
          input.note?.trim() ?? null
        );

      expenseId = Number(res.lastInsertRowid);

      // تسجيل حركة الخزنة السالبة
      db.prepare(`
        INSERT INTO cash_movements (shift_id, user_id, type, amount, ref_type, ref_id, note, created_at)
        VALUES (?, ?, 'expense', ?, 'expense', ?, ?, datetime('now'))
      `).run(
        effectiveShiftId,
        effectiveUserId,
        -Math.abs(input.amount),
        expenseId,
        input.note?.trim() ?? `مصروف: ${input.category}`
      );

      this.auditService.log({
        userId: effectiveUserId,
        action: 'RECORD_EXPENSE',
        entityType: 'expenses',
        entityId: expenseId,
        details: { category: input.category, amount: input.amount },
      });
    });

    expenseTx();
    const row = db.prepare('SELECT * FROM expenses WHERE id = ?').get(expenseId) as any;
    return {
      id: row.id,
      uuid: row.uuid,
      shift_id: row.shift_id,
      user_id: row.user_id,
      category: row.category,
      amount: row.amount,
      note: row.note,
      created_at: row.created_at,
    };
  }

  /**
   * إغلاق الوردية بالعد الأعمى وحساب المتوقع والفارق (Z-Report)
   */
  async closeShift(
    shiftId: number,
    actualCash: number,
    notes?: string,
    actorUserId?: number
  ): Promise<ShiftSummary> {
    const db = this.getDb();

    const closeTx = db.transaction(() => {
      const shift = db
        .prepare("SELECT * FROM shifts WHERE id = ? AND status = 'open'")
        .get(shiftId) as any;

      if (!shift) {
        throw new Error(`الوردية رقم ${shiftId} غير موجودة أو تم إغلاقها مسبقاً`);
      }

      // حساب رصيد النقد المتوقع في الدرج من مجموع حركات النقدية
      const movementsSumRow = db
        .prepare('SELECT COALESCE(SUM(amount), 0) AS expected_cash FROM cash_movements WHERE shift_id = ?')
        .get(shiftId) as { expected_cash: number };

      const expectedCash = movementsSumRow.expected_cash;
      const difference = actualCash - expectedCash; // سالب: عجز، موجب: زيادة

      db.prepare(`
        UPDATE shifts
        SET closing_balance = ?, expected_balance = ?, difference = ?, status = 'closed',
            closed_at = datetime('now'), notes = COALESCE(?, notes)
        WHERE id = ?
      `).run(actualCash, expectedCash, difference, notes ?? null, shiftId);

      this.auditService.log({
        userId: actorUserId ?? shift.user_id,
        action: 'CLOSE_SHIFT',
        entityType: 'shifts',
        entityId: shiftId,
        details: {
          actual_cash: actualCash,
          expected_cash: expectedCash,
          difference,
        },
      });
    });

    closeTx();
    return this.getShiftSummary(shiftId);
  }

  /**
   * استخراج التقرير الشامل للوردية (Z-Report)
   */
  getShiftSummary(shiftId: number): ShiftSummary {
    const db = this.getDb();
    const shiftRow = db.prepare('SELECT * FROM shifts WHERE id = ?').get(shiftId) as any;
    if (!shiftRow) {
      throw new Error(`الوردية رقم ${shiftId} غير موجودة`);
    }

    const cashier = db
      .prepare('SELECT display_name FROM users WHERE id = ?')
      .get(shiftRow.user_id) as { display_name: string } | undefined;

    // مبيعات النقد
    const cashSalesRow = db
      .prepare("SELECT COALESCE(SUM(amount), 0) as total FROM cash_movements WHERE shift_id = ? AND type = 'sale'")
      .get(shiftId) as { total: number };

    // مبيعات الفيزا والمحافظ من sale_payments المرتبطة بفواتير الوردية
    const paymentsRows = db
      .prepare(`
        SELECT sp.method, COALESCE(SUM(sp.amount), 0) as total
        FROM sale_payments sp
        JOIN sales s ON sp.sale_id = s.id
        WHERE s.shift_id = ? AND s.status = 'completed'
        GROUP BY sp.method
      `)
      .all(shiftId) as { method: string; total: number }[];

    let cardSales = 0;
    let walletSales = 0;
    let creditSales = 0;

    for (const p of paymentsRows) {
      if (p.method === 'card') cardSales = p.total;
      else if (p.method === 'wallet') walletSales = p.total;
      else if (p.method === 'credit') creditSales = p.total;
    }

    // المرتجعات
    const refundsRow = db
      .prepare("SELECT COALESCE(SUM(ABS(amount)), 0) as total FROM cash_movements WHERE shift_id = ? AND type = 'refund'")
      .get(shiftId) as { total: number };

    // المصروفات
    const expensesRow = db
      .prepare("SELECT COALESCE(SUM(ABS(amount)), 0) as total FROM cash_movements WHERE shift_id = ? AND type = 'expense'")
      .get(shiftId) as { total: number };

    // الإيداعات الإضافية (بخلاف الافتتاحي)
    const depositsRow = db
      .prepare(`
        SELECT COALESCE(SUM(amount), 0) as total 
        FROM cash_movements 
        WHERE shift_id = ? AND type = 'deposit' AND note != 'رصيد افتتاحي للوردية'
      `)
      .get(shiftId) as { total: number };

    // السحوبات
    const withdrawalsRow = db
      .prepare("SELECT COALESCE(SUM(ABS(amount)), 0) as total FROM cash_movements WHERE shift_id = ? AND type = 'withdrawal'")
      .get(shiftId) as { total: number };

    // المصروفات حسب التصنيف
    const expensesByCategory = db
      .prepare(`
        SELECT category, SUM(amount) as amount
        FROM expenses
        WHERE shift_id = ?
        GROUP BY category
        ORDER BY amount DESC
      `)
      .all(shiftId) as { category: string; amount: number }[];

    const expectedCashRow = db
      .prepare('SELECT COALESCE(SUM(amount), 0) as total FROM cash_movements WHERE shift_id = ?')
      .get(shiftId) as { total: number };

    return {
      shift: this.mapShift(shiftRow),
      cashier_name: cashier?.display_name ?? 'غير معروف',
      opening_balance: shiftRow.opening_balance,
      total_cash_sales: cashSalesRow.total,
      total_card_sales: cardSales,
      total_wallet_sales: walletSales,
      total_credit_sales: creditSales,
      total_sales: cashSalesRow.total + cardSales + walletSales + creditSales,
      total_refunds: refundsRow.total,
      total_expenses: expensesRow.total,
      total_deposits: depositsRow.total,
      total_withdrawals: withdrawalsRow.total,
      expected_balance: expectedCashRow.total,
      actual_balance: shiftRow.closing_balance,
      difference: shiftRow.difference,
      expenses_by_category: expensesByCategory,
    };
  }

  /**
   * تسجيل إيداع نقدي بالدرج (Cash In)
   */
  async recordDeposit(
    shiftId: number,
    userId: number,
    amount: number,
    note?: string
  ): Promise<CashMovement> {
    if (amount <= 0) {
      throw new Error('مبلغ الإيداع يجب أن يكون أكبر من الصفر');
    }
    const db = this.getDb();
    const effectiveUserId = resolveUserId(db, userId);
    const effectiveShiftId = resolveShiftId(db, shiftId, effectiveUserId);

    const movement = await this.recordCashMovement({
      shift_id: effectiveShiftId,
      user_id: effectiveUserId,
      type: 'deposit',
      amount: Math.abs(amount),
      ref_type: 'deposit',
      note: note ?? 'إيداع نقدي إضافي بالدرج',
    });

    this.auditService.log({
      userId: effectiveUserId,
      action: 'CASH_DEPOSIT',
      entityType: 'shifts',
      entityId: effectiveShiftId,
      details: { amount, note },
    });

    return movement;
  }

  /**
   * تسجيل سحب نقدي من الدرج / توريد للخزنة (Cash Drop / Withdrawal)
   */
  async recordWithdrawal(
    shiftId: number,
    userId: number,
    amount: number,
    note?: string
  ): Promise<CashMovement> {
    if (amount <= 0) {
      throw new Error('مبلغ السحب يجب أن يكون أكبر من الصفر');
    }
    const db = this.getDb();
    const effectiveUserId = resolveUserId(db, userId);
    const effectiveShiftId = resolveShiftId(db, shiftId, effectiveUserId);

    const movement = await this.recordCashMovement({
      shift_id: effectiveShiftId,
      user_id: effectiveUserId,
      type: 'withdrawal',
      amount: -Math.abs(amount),
      ref_type: 'withdrawal',
      note: note ?? 'سحب نقدي / توريد للخزنة (Cash Drop)',
    });

    this.auditService.log({
      userId: effectiveUserId,
      action: 'CASH_DROP',
      entityType: 'shifts',
      entityId: effectiveShiftId,
      details: { amount, note },
    });

    return movement;
  }

  /**
   * جلب حركات النقدية لوردية معينة مع خيار التصفية بالنوع
   */
  async getCashMovements(filter: { shift_id: number; type?: CashMovementType }): Promise<CashMovement[]> {
    const db = this.getDb();
    let query = 'SELECT * FROM cash_movements WHERE shift_id = ?';
    const params: any[] = [filter.shift_id];

    if (filter.type) {
      query += ' AND type = ?';
      params.push(filter.type);
    }

    query += ' ORDER BY id ASC';
    const rows = db.prepare(query).all(...params) as any[];

    return rows.map((row) => ({
      id: row.id,
      shift_id: row.shift_id,
      user_id: row.user_id,
      type: row.type,
      amount: row.amount,
      ref_type: row.ref_type,
      ref_id: row.ref_id,
      note: row.note,
      reason: row.note,
      created_at: row.created_at,
    }));
  }

  /**
   * استعراض المصروفات مع الفلترة
   */
  async getExpenses(filter?: ExpensesFilter): Promise<Expense[]> {
    const db = this.getDb();
    let query = 'SELECT * FROM expenses WHERE 1=1';
    const params: any[] = [];

    if (filter?.shift_id) {
      query += ' AND shift_id = ?';
      params.push(filter.shift_id);
    }
    if (filter?.category) {
      query += ' AND category = ?';
      params.push(filter.category);
    }
    if (filter?.date_from) {
      query += ' AND created_at >= ?';
      params.push(filter.date_from);
    }
    if (filter?.date_to) {
      query += ' AND created_at <= ?';
      params.push(filter.date_to);
    }

    query += ' ORDER BY id DESC';
    const rows = db.prepare(query).all(...params) as any[];

    return rows.map((row) => ({
      id: row.id,
      uuid: row.uuid,
      shift_id: row.shift_id,
      user_id: row.user_id,
      category: row.category,
      amount: row.amount,
      note: row.note,
      created_at: row.created_at,
    }));
  }

  /**
   * سجل الورديات السابقة لمراجعة تقارير Z-Report
   */
  async getShiftHistory(options?: { userId?: number; limit?: number; offset?: number }): Promise<Shift[]> {
    const db = this.getDb();
    let query = `
      SELECT s.*, u.display_name AS cashier_name
      FROM shifts s
      LEFT JOIN users u ON s.user_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (options?.userId) {
      query += ' AND s.user_id = ?';
      params.push(options.userId);
    }

    query += ' ORDER BY s.id DESC LIMIT ? OFFSET ?';
    params.push(options?.limit ?? 50, options?.offset ?? 0);

    const rows = db.prepare(query).all(...params) as any[];
    return rows.map((row) => this.mapShift(row));
  }

  /**
   * تسجيل فتح درج النقدية في سجل التدقيق
   */
  async logDrawerOpen(shiftId: number, userId: number, reason?: string): Promise<void> {
    const db = this.getDb();
    const effectiveUserId = resolveUserId(db, userId);
    const effectiveShiftId = resolveShiftId(db, shiftId, effectiveUserId);
    this.auditService.log({
      userId: effectiveUserId,
      action: 'DRAWER_OPEN',
      entityType: 'shifts',
      entityId: effectiveShiftId,
      details: { reason: reason ?? 'فتح يدوي لدرج النقدية' },
    });
  }

  /**
   * التصنيفات الافتراضية والمسجلة للمصروفات
   */
  getExpenseCategories(): string[] {
    const db = this.getDb();
    const defaults = [
      'إيجار ومرافق',
      'أدوات نظافة ومستلزمات',
      'شحن ونقل بضاعة',
      'وجبات وضيافة المحل',
      'صيانة دورية وإصلاحات',
      'مسحوبات شخصية للمالك',
      'أخرى',
    ];
    try {
      const distinct = db.prepare('SELECT DISTINCT category FROM expenses WHERE category IS NOT NULL').all() as { category: string }[];
      const set = new Set([...defaults, ...distinct.map((d) => d.category)]);
      return Array.from(set);
    } catch {
      return defaults;
    }
  }
}

export const cashService = new CashService();
