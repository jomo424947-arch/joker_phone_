/**
 * خدمة المخزون والصلاحية والجرد (Inventory & FEFO Service)
 * تدير: تتبع الدفعات (Batches)، خوارزمية FEFO، حركات المخزون المعيارية،
 * دورة الجرد والتسوية (Stocktaking)، تنبيهات الصلاحية والنواقص والراكد، وتقييم المخزون.
 */

import crypto from 'crypto';
import type Database from 'better-sqlite3';
import { getDatabase } from '../db/connection';
import {
  Batch,
  StockMovement,
  StockMovementWithDetails,
  StockMovementType,
  ExpiryAlertItem,
  BatchAllocation,
  StockCount,
  StockCountItem,
  StockCountScopeType,
  VariantStockInfo,
  InventoryAlert,
  InventoryValuation,
  ValuationCategoryGroup,
  ValuationBrandGroup,
} from '../../shared/types/inventory.types';
import { auditService as globalAuditService, AuditService } from './audit.service';

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

export class InventoryService {
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
   * إنشاء دفعة افتراضية للصنف عند الحاجة لتسوية إضافة رصيد إن لم تكن هناك دفعات سابقة
   */
  private getOrCreateBatchForVariant(
    variantId: number,
    txDb?: Database.Database
  ): Batch {
    const db = txDb ?? this.getDb();
    const existing = db
      .prepare(
        'SELECT * FROM batches WHERE variant_id = ? ORDER BY id DESC LIMIT 1'
      )
      .get(variantId) as Batch | undefined;

    if (existing) {
      return existing;
    }

    const res = db
      .prepare(
        `INSERT INTO batches (variant_id, batch_no, expiry_date, unit_cost, qty_remaining, received_at)
         VALUES (?, 'ADJUST-INIT', NULL, 0, 0, datetime('now'))`
      )
      .run(variantId);

    return db
      .prepare('SELECT * FROM batches WHERE id = ?')
      .get(Number(res.lastInsertRowid)) as Batch;
  }

  /**
   * خوارزمية FEFO (First Expiry, First Out) لتوزيع الكميات المطلوبة
   * تستبعد الدفعات منتهية الصلاحية افتراضياً إلا إذا طلب خلاف ذلك
   */
  public allocateBatchesFEFO(
    variantId: number,
    requestedQty: number,
    allowExpired: boolean = false,
    txDb?: Database.Database
  ): BatchAllocation[] {
    if (requestedQty <= 0) {
      return [];
    }

    const db = txDb ?? this.getDb();

    const expiryFilter = allowExpired
      ? ''
      : "AND (expiry_date IS NULL OR expiry_date >= date('now'))";

    const sql = `
      SELECT id, qty_remaining, unit_cost, expiry_date
      FROM batches
      WHERE variant_id = ? AND qty_remaining > 0
      ${expiryFilter}
      ORDER BY 
        CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END,
        expiry_date ASC,
        id ASC
    `;

    const batches = db.prepare(sql).all(variantId) as {
      id: number;
      qty_remaining: number;
      unit_cost: number;
      expiry_date: string | null;
    }[];

    const allocations: BatchAllocation[] = [];
    let remaining = requestedQty;

    for (const batch of batches) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, batch.qty_remaining);
      allocations.push({
        batchId: batch.id,
        qty: take,
        unitCost: batch.unit_cost,
      });
      remaining -= take;
    }

    if (remaining > 0) {
      throw new Error(`الكمية المطلوبة (${requestedQty}) غير متوفرة في المخزون الصالح للصنف #${variantId}`);
    }

    return allocations;
  }

  /**
   * جلب رصيد الصنف وتفاصيل دفعاته النشطة
   */
  public async getVariantStock(variantId: number): Promise<VariantStockInfo> {
    const db = this.getDb();

    const variant = db
      .prepare(`
        SELECT pv.id as variant_id, p.name_ar as product_name, pv.name as variant_name, pv.sku, pv.min_stock
        FROM product_variants pv
        JOIN products p ON pv.product_id = p.id
        WHERE pv.id = ?
      `)
      .get(variantId) as {
        variant_id: number;
        product_name: string;
        variant_name: string | null;
        sku: string;
        min_stock: number;
      } | undefined;

    if (!variant) {
      throw new Error(`الصنف رقم ${variantId} غير موجود`);
    }

    const batches = db
      .prepare(`
        SELECT id, variant_id, batch_no, expiry_date, unit_cost, qty_remaining, received_at
        FROM batches
        WHERE variant_id = ? AND qty_remaining > 0
        ORDER BY 
          CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END,
          expiry_date ASC,
          id ASC
      `)
      .all(variantId) as Batch[];

    const totalQty = batches.reduce((sum, b) => sum + b.qty_remaining, 0);

    return {
      variant_id: variant.variant_id,
      product_name: variant.product_name,
      variant_name: variant.variant_name ?? undefined,
      sku: variant.sku,
      min_stock: variant.min_stock,
      total_qty: totalQty,
      batches,
    };
  }

  /**
   * استعراض سجل حركات المخزون مع التفاصيل
   */
  public async getStockMovements(filters?: {
    variantId?: number;
    batchId?: number;
    type?: StockMovementType;
    limit?: number;
    offset?: number;
  }): Promise<{ movements: StockMovementWithDetails[]; total: number }> {
    const db = this.getDb();
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (filters?.variantId) {
      conditions.push('b.variant_id = ?');
      params.push(filters.variantId);
    }
    if (filters?.batchId) {
      conditions.push('sm.batch_id = ?');
      params.push(filters.batchId);
    }
    if (filters?.type) {
      conditions.push('sm.type = ?');
      params.push(filters.type);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.max(1, filters?.limit ?? 50);
    const offset = Math.max(0, filters?.offset ?? 0);

    const countSql = `
      SELECT COUNT(*) as cnt
      FROM stock_movements sm
      JOIN batches b ON sm.batch_id = b.id
      ${whereClause}
    `;
    const totalRow = db.prepare(countSql).get(...params) as { cnt: number };

    const querySql = `
      SELECT 
        sm.id, sm.batch_id, sm.type, sm.qty, sm.ref_type, sm.ref_id, sm.user_id, sm.note, sm.created_at,
        p.name_ar as product_name, pv.name as variant_name, pv.sku, b.batch_no, u.username as username
      FROM stock_movements sm
      JOIN batches b ON sm.batch_id = b.id
      JOIN product_variants pv ON b.variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      JOIN users u ON sm.user_id = u.id
      ${whereClause}
      ORDER BY sm.id DESC
      LIMIT ? OFFSET ?
    `;

    const movements = db.prepare(querySql).all(...params, limit, offset) as StockMovementWithDetails[];

    return { movements, total: totalRow.cnt };
  }

  /**
   * تسجيل حركة مخزون معيارية
   * ملاحظة: المشغل trg_movement_apply في قاعدة البيانات سيقوم تلقائياً بتحديث qty_remaining في الدفعة
   */
  public async recordMovement(
    params: {
      batchId: number;
      type: StockMovementType;
      qty: number;
      refType?: string | null;
      refId?: number | null;
      userId: number;
      note?: string | null;
    },
    txDb?: Database.Database
  ): Promise<number> {
    const db = txDb ?? this.getDb();

    if (params.qty === 0) {
      throw new Error('لا يمكن تسجيل حركة مخزون بكمية صفر');
    }

    const execute = () => {
      // التحقق من وجود الدفعة
      const batch = db
        .prepare('SELECT id, qty_remaining FROM batches WHERE id = ?')
        .get(params.batchId) as { id: number; qty_remaining: number } | undefined;

      if (!batch) {
        throw new Error(`الدفعة رقم ${params.batchId} غير موجودة`);
      }

      // إذا كانت الحركة خروج سالبة، نتحقق من توفر الرصيد
      if (params.qty < 0 && batch.qty_remaining + params.qty < 0) {
        throw new Error(`رصيد الدفعة الحالى (${batch.qty_remaining}) غير كافٍ لخصم (${Math.abs(params.qty)})`);
      }

      const effectiveUserId = resolveUserId(db, params.userId);
      const stmt = db.prepare(`
        INSERT INTO stock_movements (batch_id, type, qty, ref_type, ref_id, user_id, note, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `);

      const res = stmt.run(
        params.batchId,
        params.type,
        params.qty,
        params.refType ?? null,
        params.refId ?? null,
        effectiveUserId,
        params.note ?? null
      );

      return Number(res.lastInsertRowid);
    };

    if (txDb) {
      return execute();
    } else {
      return db.transaction(execute)();
    }
  }

  /**
   * تسجيل كمية منتهية الصلاحية وإخراجها من المخزون
   */
  public async markExpired(
    batchId: number,
    qty: number,
    userId: number,
    note?: string
  ): Promise<void> {
    if (qty <= 0) {
      throw new Error('يجب تحديد كمية صالحة أكبر من الصفر');
    }

    const db = this.getDb();
    const effectiveUserId = resolveUserId(db, userId);
    db.transaction(() => {
      this.recordMovement(
        {
          batchId,
          type: 'expired',
          qty: -Math.abs(qty),
          refType: 'manual_expired',
          userId: effectiveUserId,
          note: note ?? 'إهلاك منتهي الصلاحية',
        },
        db
      );

      this.auditService.log(
        {
          userId: effectiveUserId,
          action: 'INVENTORY_MARK_EXPIRED',
          entityType: 'batch',
          entityId: batchId,
          details: { qty, note },
        },
        db
      );
    })();
  }

  /**
   * تسجيل كمية كتستر أو عينة وإخراجها من المخزون
   */
  public async markTester(
    batchId: number,
    qty: number,
    userId: number,
    note?: string
  ): Promise<void> {
    if (qty <= 0) {
      throw new Error('يجب تحديد كمية صالحة أكبر من الصفر');
    }

    const db = this.getDb();
    const effectiveUserId = resolveUserId(db, userId);
    db.transaction(() => {
      this.recordMovement(
        {
          batchId,
          type: 'tester',
          qty: -Math.abs(qty),
          refType: 'manual_tester',
          userId: effectiveUserId,
          note: note ?? 'استخدام تستر / عينة',
        },
        db
      );

      this.auditService.log(
        {
          userId: effectiveUserId,
          action: 'INVENTORY_MARK_TESTER',
          entityType: 'batch',
          entityId: batchId,
          details: { qty, note },
        },
        db
      );
    })();
  }

  /**
   * جلب الدفعات التي تنتهي صلاحيتها خلال عدد أيام معين
   */
  public async getExpiringBatches(days: number): Promise<ExpiryAlertItem[]> {
    const db = this.getDb();
    const includeNullExpiry = days >= 1000 ? 1 : 0;
    const sql = `
      SELECT 
        b.id as batch_id,
        b.variant_id,
        p.name_ar as product_name,
        pv.name as variant_name,
        b.batch_no,
        b.expiry_date,
        CASE 
          WHEN b.expiry_date IS NOT NULL 
          THEN CAST(julianday(b.expiry_date) - julianday(date('now')) AS INTEGER)
          ELSE NULL 
        END as days_remaining,
        b.qty_remaining,
        b.unit_cost
      FROM batches b
      JOIN product_variants pv ON b.variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      WHERE (
        (b.expiry_date IS NOT NULL AND b.expiry_date <= date('now', '+' || ? || ' days'))
        OR (? = 1 AND b.expiry_date IS NULL)
      )
      AND b.qty_remaining > 0
      ORDER BY 
        CASE WHEN b.expiry_date IS NULL THEN 1 ELSE 0 END ASC,
        b.expiry_date ASC
    `;

    return db.prepare(sql).all(days, includeNullExpiry) as ExpiryAlertItem[];
  }

  // ==========================================
  // نظام الجرد الفعلي والتسوية (Stocktaking)
  // ==========================================

  /**
   * إنشاء دورة جرد جديدة وحساب رصيد النظام (system_qty) لجميع الأصناف في النطاق المحدد
   */
  public async createStockCount(params: {
    scope: StockCountScopeType;
    scopeId?: number | null;
    userId: number;
    variantIds?: number[];
  }): Promise<StockCount> {
    const db = this.getDb();
    const countUuid = crypto.randomUUID();
    const effectiveUserId = resolveUserId(db, params.userId);

    return db.transaction(() => {
      const insertCount = db.prepare(`
        INSERT INTO stock_counts (uuid, scope, scope_id, status, user_id, created_at)
        VALUES (?, ?, ?, 'in_progress', ?, datetime('now'))
      `);

      const res = insertCount.run(
        countUuid,
        params.scope,
        params.scopeId ?? null,
        effectiveUserId
      );
      const countId = Number(res.lastInsertRowid);

      // تحديد الأصناف الخاضعة للجرد وفق النطاق المحدد
      let variantSelectSql = `
        SELECT pv.id as variant_id, COALESCE(SUM(b.qty_remaining), 0) as system_qty
        FROM product_variants pv
        JOIN products p ON pv.product_id = p.id
        LEFT JOIN batches b ON b.variant_id = pv.id AND b.qty_remaining > 0
        WHERE pv.is_active = 1
      `;
      const queryParams: (number | string)[] = [];

      if (params.scope === 'category') {
        if (!params.scopeId) throw new Error('يجب تحديد رقم القسم لنطاق الجرد بالقسم');
        variantSelectSql += ' AND p.category_id = ?';
        queryParams.push(params.scopeId);
      } else if (params.scope === 'brand') {
        if (!params.scopeId) throw new Error('يجب تحديد رقم الماركة لنطاق الجرد بالماركة');
        variantSelectSql += ' AND p.brand_id = ?';
        queryParams.push(params.scopeId);
      } else if (params.scope === 'manual') {
        if (!params.variantIds || params.variantIds.length === 0) {
          throw new Error('يجب تحديد قائمة الأصناف المراد جردها في النطاق اليدوي');
        }
        const placeholders = params.variantIds.map(() => '?').join(',');
        variantSelectSql += ` AND pv.id IN (${placeholders})`;
        queryParams.push(...params.variantIds);
      }

      variantSelectSql += ' GROUP BY pv.id';

      const variants = db.prepare(variantSelectSql).all(...queryParams) as {
        variant_id: number;
        system_qty: number;
      }[];

      const insertItemStmt = db.prepare(`
        INSERT INTO stock_count_items (count_id, variant_id, system_qty)
        VALUES (?, ?, ?)
      `);

      for (const item of variants) {
        insertItemStmt.run(countId, item.variant_id, item.system_qty);
      }

      this.auditService.log(
        {
          userId: params.userId,
          action: 'STOCK_COUNT_CREATED',
          entityType: 'stock_count',
          entityId: countId,
          details: { scope: params.scope, scopeId: params.scopeId, itemsCount: variants.length },
        },
        db
      );

      return db.prepare('SELECT * FROM stock_counts WHERE id = ?').get(countId) as StockCount;
    })();
  }

  /**
   * جلب قائمة دورات الجرد
   */
  public async getStockCounts(filters?: {
    status?: string;
    limit?: number;
  }): Promise<StockCount[]> {
    const db = this.getDb();
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (filters?.status) {
      conditions.push('sc.status = ?');
      params.push(filters.status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.max(1, filters?.limit ?? 20);

    const sql = `
      SELECT 
        sc.id, sc.uuid, sc.scope, sc.scope_id, sc.status, sc.user_id, sc.approved_by, sc.created_at, sc.completed_at,
        u.display_name as user_name,
        appr.display_name as approver_name,
        COUNT(sci.id) as items_count,
        SUM(COALESCE(sci.difference, 0)) as total_difference
      FROM stock_counts sc
      JOIN users u ON sc.user_id = u.id
      LEFT JOIN users appr ON sc.approved_by = appr.id
      LEFT JOIN stock_count_items sci ON sci.count_id = sc.id
      ${whereClause}
      GROUP BY sc.id
      ORDER BY sc.id DESC
      LIMIT ?
    `;

    return db.prepare(sql).all(...params, limit) as StockCount[];
  }

  /**
   * جلب تفاصيل دورة جرد مع جميع بنودها والأصناف
   */
  public async getStockCountById(countId: number): Promise<{
    count: StockCount;
    items: StockCountItem[];
  }> {
    const db = this.getDb();

    const count = db
      .prepare(`
        SELECT 
          sc.id, sc.uuid, sc.scope, sc.scope_id, sc.status, sc.user_id, sc.approved_by, sc.created_at, sc.completed_at,
          u.display_name as user_name,
          appr.display_name as approver_name
        FROM stock_counts sc
        JOIN users u ON sc.user_id = u.id
        LEFT JOIN users appr ON sc.approved_by = appr.id
        WHERE sc.id = ?
      `)
      .get(countId) as StockCount | undefined;

    if (!count) {
      throw new Error(`دورة الجرد رقم ${countId} غير موجودة`);
    }

    const items = db
      .prepare(`
        SELECT 
          sci.id, sci.count_id, sci.variant_id, sci.system_qty, sci.counted_qty, sci.difference, sci.note,
          p.name_ar as product_name, pv.name as variant_name, pv.sku
        FROM stock_count_items sci
        JOIN product_variants pv ON sci.variant_id = pv.id
        JOIN products p ON pv.product_id = p.id
        WHERE sci.count_id = ?
        ORDER BY sci.id ASC
      `)
      .all(countId) as StockCountItem[];

    return { count, items };
  }

  /**
   * إرسال العد الفعلي وتحديث الفروقات
   */
  public async submitCount(
    countId: number,
    items: Array<{ variantId: number; countedQty: number; note?: string }>,
    userId: number
  ): Promise<void> {
    const db = this.getDb();

    db.transaction(() => {
      const count = db
        .prepare('SELECT id, status FROM stock_counts WHERE id = ?')
        .get(countId) as { id: number; status: string } | undefined;

      if (!count) {
        throw new Error(`دورة الجرد رقم ${countId} غير موجودة`);
      }
      if (count.status !== 'in_progress') {
        throw new Error(`لا يمكن تعديل عداد جرد بحالة: ${count.status}`);
      }

      const updateStmt = db.prepare(`
        UPDATE stock_count_items
        SET counted_qty = ?, difference = ? - system_qty, note = ?
        WHERE count_id = ? AND variant_id = ?
      `);

      for (const item of items) {
        updateStmt.run(item.countedQty, item.countedQty, item.note ?? null, countId, item.variantId);
      }

      db.prepare(`UPDATE stock_counts SET status = 'reviewed' WHERE id = ?`).run(countId);

      const effectiveUserId = resolveUserId(db, userId);
      this.auditService.log(
        {
          userId: effectiveUserId,
          action: 'STOCK_COUNT_SUBMITTED',
          entityType: 'stock_count',
          entityId: countId,
          details: { submittedItemsCount: items.length },
        },
        db
      );
    })();
  }

  /**
   * اعتماد دورة الجرد وإجراء حركات التسوية المخزنية (adjust_in / adjust_out) تلقائياً
   */
  public async approveCount(countId: number, approverId: number): Promise<void> {
    const db = this.getDb();

    db.transaction(() => {
      const count = db
        .prepare('SELECT id, status FROM stock_counts WHERE id = ?')
        .get(countId) as { id: number; status: string } | undefined;

      if (!count) {
        throw new Error(`دورة الجرد رقم ${countId} غير موجودة`);
      }
      if (count.status === 'approved' || count.status === 'cancelled') {
        throw new Error(`لا يمكن اعتماد دورة جرد حالتها: ${count.status}`);
      }

      // جلب جميع البنود التي بها فروقات وتم عدّها
      const diffItems = db
        .prepare(`
          SELECT id, variant_id, system_qty, counted_qty, difference, note
          FROM stock_count_items
          WHERE count_id = ? AND counted_qty IS NOT NULL AND difference != 0
        `)
        .all(countId) as StockCountItem[];

      const effectiveApproverId = resolveUserId(db, approverId);
      for (const item of diffItems) {
        const diff = item.difference ?? 0;
        if (diff > 0) {
          // زيادة بالمخزون -> adjust_in
          const batch = this.getOrCreateBatchForVariant(item.variant_id, db);
          this.recordMovement(
            {
              batchId: batch.id,
              type: 'adjust_in',
              qty: diff,
              refType: 'stock_count',
              refId: countId,
              userId: effectiveApproverId,
              note: `تسوية جرد بالزيادة (دورة #${countId}): ${item.note ?? ''}`.trim(),
            },
            db
          );
        } else if (diff < 0) {
          // عجز بالمخزون -> adjust_out
          const deductionNeeded = Math.abs(diff);
          const allocations = this.allocateBatchesFEFO(item.variant_id, deductionNeeded, true, db);

          for (const alloc of allocations) {
            this.recordMovement(
              {
                batchId: alloc.batchId,
                type: 'adjust_out',
                qty: -alloc.qty,
                refType: 'stock_count',
                refId: countId,
                userId: effectiveApproverId,
                note: `تسوية جرد بالنقص (دورة #${countId}): ${item.note ?? ''}`.trim(),
              },
              db
            );
          }
        }
      }

      db.prepare(`
        UPDATE stock_counts 
        SET status = 'approved', approved_by = ?, completed_at = datetime('now')
        WHERE id = ?
      `).run(effectiveApproverId, countId);

      this.auditService.log(
        {
          userId: effectiveApproverId,
          action: 'STOCK_COUNT_APPROVED',
          entityType: 'stock_count',
          entityId: countId,
          details: { adjustedItemsCount: diffItems.length },
        },
        db
      );
    })();
  }

  /**
   * إلغاء دورة الجرد
   */
  public async cancelCount(countId: number, userId: number): Promise<void> {
    const db = this.getDb();

    db.transaction(() => {
      const count = db
        .prepare('SELECT id, status FROM stock_counts WHERE id = ?')
        .get(countId) as { id: number; status: string } | undefined;

      if (!count) {
        throw new Error(`دورة الجرد رقم ${countId} غير موجودة`);
      }
      if (count.status === 'approved') {
        throw new Error('لا يمكن إلغاء دورة جرد معتمدة بالفعل');
      }

      const effectiveUserId = resolveUserId(db, userId);
      db.prepare(`
        UPDATE stock_counts 
        SET status = 'cancelled', completed_at = datetime('now')
        WHERE id = ?
      `).run(countId);

      this.auditService.log(
        {
          userId: effectiveUserId,
          action: 'STOCK_COUNT_CANCELLED',
          entityType: 'stock_count',
          entityId: countId,
        },
        db
      );
    })();
  }

  // ==========================================
  // محرك التنبيهات (Alerts Engine)
  // ==========================================

  /**
   * جلب كافة التنبيهات النشطة:
   * 1. منتهية الصلاحية
   * 2. وشيكة الانتهاء (حرجة <=30 يوم، تحذير 31-60 يوم، إشعار 61-90 يوم)
   * 3. النواقص (أقل من الحد الأدنى min_stock)
   * 4. الأصناف الراكدة (لم تُبع منذ dead_stock_days)
   */
  public async getAlerts(): Promise<InventoryAlert[]> {
    const db = this.getDb();
    const alerts: InventoryAlert[] = [];

    // جلب إعداد عدد أيام الركود (الافتراضي 90)
    const deadStockSetting = db
      .prepare("SELECT value FROM settings WHERE key = 'dead_stock_days'")
      .get() as { value: string } | undefined;
    const deadStockDays = deadStockSetting ? parseInt(deadStockSetting.value, 10) || 90 : 90;

    // 1 & 2: تنبيهات الصلاحية من الدفعات النشطة
    const batchExpiryRows = db
      .prepare(`
        SELECT 
          b.id as batch_id,
          b.batch_no,
          b.variant_id,
          b.expiry_date,
          b.qty_remaining,
          CAST(julianday(b.expiry_date) - julianday(date('now')) AS INTEGER) as days_remaining,
          p.name_ar as product_name,
          pv.name as variant_name,
          pv.sku
        FROM batches b
        JOIN product_variants pv ON b.variant_id = pv.id
        JOIN products p ON pv.product_id = p.id
        WHERE b.expiry_date IS NOT NULL AND b.qty_remaining > 0
        ORDER BY b.expiry_date ASC
      `)
      .all() as {
        batch_id: number;
        batch_no: string | null;
        variant_id: number;
        expiry_date: string;
        qty_remaining: number;
        days_remaining: number;
        product_name: string;
        variant_name: string | null;
        sku: string;
      }[];

    for (const row of batchExpiryRows) {
      if (row.days_remaining < 0) {
        alerts.push({
          type: 'expired',
          severity: 'danger',
          variant_id: row.variant_id,
          product_name: row.product_name,
          variant_name: row.variant_name ?? undefined,
          sku: row.sku,
          batch_id: row.batch_id,
          batch_no: row.batch_no ?? undefined,
          expiry_date: row.expiry_date,
          days_remaining: row.days_remaining,
          qty_remaining: row.qty_remaining,
          message: `انتهت صلاحية الدفعة منذ ${Math.abs(row.days_remaining)} يوم (الكمية: ${row.qty_remaining})`,
        });
      } else if (row.days_remaining <= 30) {
        alerts.push({
          type: 'expiring_critical',
          severity: 'danger',
          variant_id: row.variant_id,
          product_name: row.product_name,
          variant_name: row.variant_name ?? undefined,
          sku: row.sku,
          batch_id: row.batch_id,
          batch_no: row.batch_no ?? undefined,
          expiry_date: row.expiry_date,
          days_remaining: row.days_remaining,
          qty_remaining: row.qty_remaining,
          message: `تنتهي الصلاحية خلال ${row.days_remaining} يوم (حرجة، الكمية: ${row.qty_remaining})`,
        });
      } else if (row.days_remaining <= 60) {
        alerts.push({
          type: 'expiring_warning',
          severity: 'warning',
          variant_id: row.variant_id,
          product_name: row.product_name,
          variant_name: row.variant_name ?? undefined,
          sku: row.sku,
          batch_id: row.batch_id,
          batch_no: row.batch_no ?? undefined,
          expiry_date: row.expiry_date,
          days_remaining: row.days_remaining,
          qty_remaining: row.qty_remaining,
          message: `تنتهي الصلاحية خلال ${row.days_remaining} يوم (تحذير)`,
        });
      } else if (row.days_remaining <= 90) {
        alerts.push({
          type: 'expiring_notice',
          severity: 'info',
          variant_id: row.variant_id,
          product_name: row.product_name,
          variant_name: row.variant_name ?? undefined,
          sku: row.sku,
          batch_id: row.batch_id,
          batch_no: row.batch_no ?? undefined,
          expiry_date: row.expiry_date,
          days_remaining: row.days_remaining,
          qty_remaining: row.qty_remaining,
          message: `تنتهي الصلاحية خلال ${row.days_remaining} يوم (إشعار)`,
        });
      }
    }

    // 3: النواقص (أقل من الحد الأدنى min_stock)
    const lowStockRows = db
      .prepare(`
        SELECT 
          pv.id as variant_id,
          p.name_ar as product_name,
          pv.name as variant_name,
          pv.sku,
          pv.min_stock,
          COALESCE(SUM(b.qty_remaining), 0) as total_qty
        FROM product_variants pv
        JOIN products p ON pv.product_id = p.id
        LEFT JOIN batches b ON b.variant_id = pv.id AND b.qty_remaining > 0
        WHERE pv.is_active = 1 AND pv.min_stock > 0
        GROUP BY pv.id
        HAVING total_qty < pv.min_stock
      `)
      .all() as {
        variant_id: number;
        product_name: string;
        variant_name: string | null;
        sku: string;
        min_stock: number;
        total_qty: number;
      }[];

    for (const row of lowStockRows) {
      alerts.push({
        type: 'low_stock',
        severity: 'danger',
        variant_id: row.variant_id,
        product_name: row.product_name,
        variant_name: row.variant_name ?? undefined,
        sku: row.sku,
        qty_remaining: row.total_qty,
        min_stock: row.min_stock,
        message: `الرصيد الحالي (${row.total_qty}) أقل من الحد الأدنى (${row.min_stock})`,
      });
    }

    // 4: الأصناف الراكدة (لم تُبع منذ deadStockDays ولها رصيد بالمخزون)
    const deadStockRows = db
      .prepare(`
        SELECT 
          pv.id as variant_id,
          p.name_ar as product_name,
          pv.name as variant_name,
          pv.sku,
          SUM(b.qty_remaining) as total_qty
        FROM product_variants pv
        JOIN products p ON pv.product_id = p.id
        JOIN batches b ON b.variant_id = pv.id AND b.qty_remaining > 0
        WHERE pv.is_active = 1
          AND pv.id NOT IN (
            SELECT DISTINCT si.variant_id
            FROM sale_items si
            JOIN sales s ON si.sale_id = s.id
            WHERE s.created_at >= datetime('now', '-' || ? || ' days')
              AND s.status != 'voided'
          )
        GROUP BY pv.id
      `)
      .all(deadStockDays) as {
        variant_id: number;
        product_name: string;
        variant_name: string | null;
        sku: string;
        total_qty: number;
      }[];

    for (const row of deadStockRows) {
      alerts.push({
        type: 'dead_stock',
        severity: 'warning',
        variant_id: row.variant_id,
        product_name: row.product_name,
        variant_name: row.variant_name ?? undefined,
        sku: row.sku,
        qty_remaining: row.total_qty,
        message: `صنف راكد لم يشهد أي حركة بيع خلال آخر ${deadStockDays} يوم (الرصيد: ${row.total_qty})`,
      });
    }

    return alerts;
  }

  // ==========================================
  // تقييم المخزون (Inventory Valuation)
  // ==========================================

  /**
   * تقرير القيمة المالية للمخزون بالتكلفة وبسعر البيع وحساب الربح المتوقع
   */
  public async getValuation(groupBy?: 'category' | 'brand'): Promise<InventoryValuation> {
    const db = this.getDb();

    // القيمة الإجمالية
    const totalsRow = db
      .prepare(`
        SELECT 
          COALESCE(SUM(b.qty_remaining * b.unit_cost), 0) AS total_cost_value,
          COALESCE(SUM(b.qty_remaining * pv.sale_price), 0) AS total_sale_value,
          COALESCE(SUM(b.qty_remaining), 0) AS total_items_count
        FROM batches b
        JOIN product_variants pv ON b.variant_id = pv.id
        WHERE b.qty_remaining > 0 AND pv.is_active = 1
      `)
      .get() as {
        total_cost_value: number;
        total_sale_value: number;
        total_items_count: number;
      };

    const expectedProfit = totalsRow.total_sale_value - totalsRow.total_cost_value;

    const result: InventoryValuation = {
      total_cost_value: totalsRow.total_cost_value,
      total_sale_value: totalsRow.total_sale_value,
      expected_profit: expectedProfit,
      total_items_count: totalsRow.total_items_count,
    };

    if (groupBy === 'category') {
      const catRows = db
        .prepare(`
          SELECT 
            c.id as category_id,
            COALESCE(c.name, 'بدون قسم') as category_name,
            COALESCE(SUM(b.qty_remaining * b.unit_cost), 0) AS cost_value,
            COALESCE(SUM(b.qty_remaining * pv.sale_price), 0) AS sale_value,
            COALESCE(SUM(b.qty_remaining), 0) AS total_qty
          FROM batches b
          JOIN product_variants pv ON b.variant_id = pv.id
          JOIN products p ON pv.product_id = p.id
          LEFT JOIN categories c ON p.category_id = c.id
          WHERE b.qty_remaining > 0 AND pv.is_active = 1
          GROUP BY c.id
          ORDER BY sale_value DESC
        `)
        .all() as {
          category_id: number | null;
          category_name: string;
          cost_value: number;
          sale_value: number;
          total_qty: number;
        }[];

      result.by_category = catRows.map((r) => ({
        category_id: r.category_id ?? undefined,
        category_name: r.category_name,
        cost_value: r.cost_value,
        sale_value: r.sale_value,
        expected_profit: r.sale_value - r.cost_value,
        total_qty: r.total_qty,
      }));
    } else if (groupBy === 'brand') {
      const brandRows = db
        .prepare(`
          SELECT 
            br.id as brand_id,
            COALESCE(br.name, 'بدون ماركة') as brand_name,
            COALESCE(SUM(b.qty_remaining * b.unit_cost), 0) AS cost_value,
            COALESCE(SUM(b.qty_remaining * pv.sale_price), 0) AS sale_value,
            COALESCE(SUM(b.qty_remaining), 0) AS total_qty
          FROM batches b
          JOIN product_variants pv ON b.variant_id = pv.id
          JOIN products p ON pv.product_id = p.id
          LEFT JOIN brands br ON p.brand_id = br.id
          WHERE b.qty_remaining > 0 AND pv.is_active = 1
          GROUP BY br.id
          ORDER BY sale_value DESC
        `)
        .all() as {
          brand_id: number | null;
          brand_name: string;
          cost_value: number;
          sale_value: number;
          total_qty: number;
        }[];

      result.by_brand = brandRows.map((r) => ({
        brand_id: r.brand_id ?? undefined,
        brand_name: r.brand_name,
        cost_value: r.cost_value,
        sale_value: r.sale_value,
        expected_profit: r.sale_value - r.cost_value,
        total_qty: r.total_qty,
      }));
    }

    return result;
  }
}

export const inventoryService = new InventoryService();
