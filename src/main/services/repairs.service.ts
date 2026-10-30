/**
 * خدمة إدارة أوامر الصيانة وورشة الجوكر فون (Repairs & Maintenance Workshop Service)
 * تدير: استلام الأجهزة، مراحل الفحص والإصلاح، استهلاك قطع الغيار من المخزون،
 * وحساب تكاليف الصيانة والضمان، والربط المالي الكامل مع الفواتير وسجل المبيعات وحركات الخزينة
 */

import crypto from 'crypto';
import type Database from 'better-sqlite3';
import { getDatabase } from '../db/connection';
import {
  RepairOrder,
  RepairPart,
  RepairStatusLog,
  RepairStatus,
  CreateRepairOrderInput,
  DeliverRepairInput,
  UpdateRepairOrderInput,
  AddRepairPartInput,
  RepairFilterOptions,
} from '../../shared/types/repairs.types';
import { auditService as globalAuditService, AuditService } from './audit.service';
import { inventoryService as globalInventoryService, InventoryService } from './inventory.service';
import { sessionService as globalSessionService } from './session.service';
import { authService as globalAuthService } from './auth.service';

export class RepairsService {
  private db?: Database.Database;
  private auditService: AuditService;
  private inventoryService: InventoryService;

  constructor(db?: Database.Database, audit?: AuditService, inventory?: InventoryService) {
    this.db = db;
    this.auditService = audit ?? (db ? new AuditService(db) : globalAuditService);
    this.inventoryService = inventory ?? (db ? new InventoryService(db) : globalInventoryService);
  }

  private getDb(): Database.Database {
    return this.db ?? getDatabase();
  }

  /**
   * التحقق من معرف المستخدم وضمان وجوده في قاعدة البيانات لتفادي أخطاء الـ Foreign Key
   */
  private resolveUserId(db: Database.Database, proposedUserId?: number): number {
    if (proposedUserId && proposedUserId > 0) {
      const user = db.prepare('SELECT id FROM users WHERE id = ? AND is_active = 1').get(proposedUserId) as { id: number } | undefined;
      if (user) return user.id;
    }

    const sessionUserId = globalSessionService.getCurrentUserId();
    if (sessionUserId) {
      const u = db.prepare('SELECT id FROM users WHERE id = ? AND is_active = 1').get(sessionUserId) as { id: number } | undefined;
      if (u) return u.id;
    }

    const firstUser = db.prepare('SELECT id FROM users WHERE is_active = 1 ORDER BY id ASC LIMIT 1').get() as { id: number } | undefined;
    if (firstUser) return firstUser.id;

    try {
      const seeded = globalAuthService.seedDefaultOwnerIfNone();
      if (seeded) return seeded.id;
    } catch {
      // ignore
    }

    const anyUser = db.prepare('SELECT id FROM users ORDER BY id ASC LIMIT 1').get() as { id: number } | undefined;
    return anyUser ? anyUser.id : 1;
  }

  /**
   * التحقق من الوردية وضمان كونها مفتوحة وموجودة في قاعدة البيانات (وإنشاؤها تلقائياً عند الحاجة)
   */
  private resolveShiftId(db: Database.Database, proposedShiftId?: number, userId?: number): number {
    if (proposedShiftId && proposedShiftId > 0) {
      const shift = db.prepare("SELECT id FROM shifts WHERE id = ? AND status = 'open'").get(proposedShiftId) as { id: number } | undefined;
      if (shift) return shift.id;
    }

    const openShift = db.prepare("SELECT id FROM shifts WHERE status = 'open' ORDER BY id DESC LIMIT 1").get() as { id: number } | undefined;
    if (openShift) return openShift.id;

    // إذا لم تكن هناك أي وردية مفتوحة، نفتح وردية جديدة بحالة 'open' تلقائياً لضمان سلامة العمليات والخزنة
    const shiftUuid = crypto.randomUUID();
    const effectiveUserId = (userId && userId > 0) ? userId : this.resolveUserId(db);
    const res = db.prepare(`
      INSERT INTO shifts (uuid, user_id, opening_balance, status, opened_at, notes)
      VALUES (?, ?, 0, 'open', datetime('now'), 'وردية تلقائية لعمليات الصيانة')
    `).run(shiftUuid, effectiveUserId);
    return Number(res.lastInsertRowid);
  }

  /**
   * التحقق من وجود الفني المعين
   */
  private resolveTechnicianId(db: Database.Database, proposedTechId?: number | null): number | null {
    if (!proposedTechId || proposedTechId <= 0) return null;
    const tech = db.prepare('SELECT id FROM users WHERE id = ?').get(proposedTechId) as { id: number } | undefined;
    return tech ? tech.id : null;
  }

  /**
   * التحقق من وجود العميل
   */
  private resolveCustomerId(db: Database.Database, proposedCustomerId?: number | null): number | null {
    if (!proposedCustomerId || proposedCustomerId <= 0) return null;
    const cust = db.prepare('SELECT id FROM customers WHERE id = ?').get(proposedCustomerId) as { id: number } | undefined;
    return cust ? cust.id : null;
  }

  /**
   * التأكد من وجود صنف خدمة صيانة في جدول المنتجات لإدراجه في فواتير العربون والتسوية بشكل محصن ضد أي تصادم
   */
  private ensureRepairServiceItem(db: Database.Database): { variantId: number; batchId: number } {
    let existingVariant = db
      .prepare("SELECT id FROM product_variants WHERE sku = 'REPAIR-SRV' LIMIT 1")
      .get() as { id: number } | undefined;

    if (existingVariant) {
      let batch = db
        .prepare('SELECT id FROM batches WHERE variant_id = ? ORDER BY id DESC LIMIT 1')
        .get(existingVariant.id) as { id: number } | undefined;
      if (!batch) {
        const batchRes = db
          .prepare(
            "INSERT INTO batches (variant_id, batch_no, unit_cost, qty_remaining, received_at) VALUES (?, 'REPAIR-BATCH', 0, 0, datetime('now'))"
          )
          .run(existingVariant.id);
        batch = { id: Number(batchRes.lastInsertRowid) };
      }
      return { variantId: existingVariant.id, batchId: batch.id };
    }

    // إنشاء تصنيف إن لم يوجد (محصن ضد تصادم الاسم الفريد)
    let cat = db
      .prepare("SELECT id FROM categories WHERE name LIKE '%صيانة%' OR name = 'خدمات الصيانة والورشة' LIMIT 1")
      .get() as { id: number } | undefined;
    if (!cat) {
      db.prepare(
        "INSERT OR IGNORE INTO categories (uuid, name, is_active, created_at) VALUES (?, 'خدمات الصيانة والورشة', 1, datetime('now'))"
      ).run(crypto.randomUUID());
      cat = db.prepare("SELECT id FROM categories WHERE name = 'خدمات الصيانة والورشة'").get() as { id: number } | undefined;
      if (!cat) {
        cat = db.prepare("SELECT id FROM categories ORDER BY id ASC LIMIT 1").get() as { id: number } | undefined;
      }
    }

    const catId = cat ? cat.id : null;

    // فحص هل منتج الخدمة موجود مسبقاً
    let prod = db
      .prepare("SELECT id FROM products WHERE name_ar = 'خدمات صيانة الجوكر فون' LIMIT 1")
      .get() as { id: number } | undefined;

    if (!prod) {
      const prodRes = db
        .prepare(`
          INSERT INTO products (uuid, category_id, name_ar, name_en, unit, is_active, created_at, updated_at)
          VALUES (?, ?, 'خدمات صيانة الجوكر فون', 'Joker Phone Repair Services', 'خدمة', 1, datetime('now'), datetime('now'))
        `)
        .run(crypto.randomUUID(), catId);
      prod = { id: Number(prodRes.lastInsertRowid) };
    }

    // إنشاء الـ variant إن لم يكن موجوداً
    let varId: number;
    existingVariant = db
      .prepare("SELECT id FROM product_variants WHERE sku = 'REPAIR-SRV' LIMIT 1")
      .get() as { id: number } | undefined;

    if (existingVariant) {
      varId = existingVariant.id;
    } else {
      const varRes = db
        .prepare(`
          INSERT INTO product_variants (uuid, product_id, sku, name, sale_price, min_stock, is_active)
          VALUES (?, ?, 'REPAIR-SRV', 'خدمات صيانة عامة وقطع غيار', 0, 0, 1)
        `)
        .run(crypto.randomUUID(), prod.id);
      varId = Number(varRes.lastInsertRowid);
    }

    // إنشاء الدفعة الافتراضية
    let batch = db
      .prepare('SELECT id FROM batches WHERE variant_id = ? ORDER BY id DESC LIMIT 1')
      .get(varId) as { id: number } | undefined;

    if (!batch) {
      const batchRes = db
        .prepare(`
          INSERT INTO batches (variant_id, batch_no, unit_cost, qty_remaining, received_at)
          VALUES (?, 'REPAIR-BATCH', 0, 0, datetime('now'))
        `)
        .run(varId);
      batch = { id: Number(batchRes.lastInsertRowid) };
    }

    return { variantId: varId, batchId: batch.id };
  }

  /**
   * جلب قائمة أوامر الصيانة مع الفلاتر والبحث
   */
  public async list(filters?: RepairFilterOptions): Promise<RepairOrder[]> {
    const db = this.getDb();
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (filters?.status) {
      conditions.push('r.status = ?');
      params.push(filters.status);
    }

    if (filters?.technicianId) {
      conditions.push('r.technician_id = ?');
      params.push(filters.technicianId);
    }

    if (filters?.startDate) {
      conditions.push('date(r.created_at) >= date(?)');
      params.push(filters.startDate);
    }

    if (filters?.endDate) {
      conditions.push('date(r.created_at) <= date(?)');
      params.push(filters.endDate);
    }

    if (filters?.paymentStatus === 'paid') {
      conditions.push('(r.total_cost - r.paid_amount) <= 0');
    } else if (filters?.paymentStatus === 'pending') {
      conditions.push('(r.total_cost - r.paid_amount) > 0');
    }

    if (filters?.search && filters.search.trim().length > 0) {
      const term = `%${filters.search.trim()}%`;
      conditions.push(
        '(r.repair_code LIKE ? OR r.customer_name LIKE ? OR r.customer_phone LIKE ? OR r.device_model LIKE ? OR r.imei_serial LIKE ?)'
      );
      params.push(term, term, term, term, term);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.max(1, filters?.limit ?? 150);

    const sql = `
      SELECT 
        r.*,
        u.display_name AS user_name,
        tech.display_name AS technician_name,
        (r.total_cost - r.paid_amount) AS remaining_amount,
        dep_s.invoice_no AS deposit_invoice_no,
        del_s.invoice_no AS delivery_invoice_no
      FROM repair_orders r
      LEFT JOIN users u ON u.id = r.user_id
      LEFT JOIN users tech ON tech.id = r.technician_id
      LEFT JOIN sales dep_s ON dep_s.id = r.deposit_invoice_id
      LEFT JOIN sales del_s ON del_s.id = r.delivery_invoice_id
      ${whereClause}
      ORDER BY r.id DESC
      LIMIT ?
    `;

    params.push(limit);

    const rows = db.prepare(sql).all(...params) as any[];

    return rows.map((row) => this.mapOrderRow(row));
  }

  /**
   * جلب تفاصيل أمر صيانة محدد مع قطع الغيار وسجل الحالات
   */
  public async getById(id: number): Promise<RepairOrder | null> {
    const db = this.getDb();

    const row = db
      .prepare(
        `SELECT 
          r.*,
          u.display_name AS user_name,
          tech.display_name AS technician_name,
          (r.total_cost - r.paid_amount) AS remaining_amount,
          dep_s.invoice_no AS deposit_invoice_no,
          del_s.invoice_no AS delivery_invoice_no
        FROM repair_orders r
        LEFT JOIN users u ON u.id = r.user_id
        LEFT JOIN users tech ON tech.id = r.technician_id
        LEFT JOIN sales dep_s ON dep_s.id = r.deposit_invoice_id
        LEFT JOIN sales del_s ON del_s.id = r.delivery_invoice_id
        WHERE r.id = ?`
      )
      .get(id) as any;

    if (!row) return null;

    const parts = db
      .prepare(`SELECT * FROM repair_parts WHERE repair_id = ? ORDER BY id ASC`)
      .all(id) as any[];

    const logs = db
      .prepare(
        `SELECT 
          l.*,
          u.display_name AS user_name
        FROM repair_status_logs l
        LEFT JOIN users u ON u.id = l.user_id
        WHERE l.repair_id = ?
        ORDER BY l.id ASC`
      )
      .all(id) as any[];

    const order = this.mapOrderRow(row);
    order.parts = parts.map((p) => ({
      id: p.id,
      repairId: p.repair_id,
      variantId: p.variant_id,
      batchId: p.batch_id,
      itemName: p.item_name,
      qty: p.qty,
      unitCost: p.unit_cost,
      unitPrice: p.unit_price,
      createdAt: p.created_at,
    }));

    order.logs = logs.map((l) => ({
      id: l.id,
      repairId: l.repair_id,
      oldStatus: l.old_status,
      newStatus: l.new_status,
      userId: l.user_id,
      userName: l.user_name,
      note: l.note,
      createdAt: l.created_at,
    }));

    return order;
  }

  /**
   * إنشاء أمر صيانة جديد مع تسجيل فاتورة العربون وحركة الخزينة تلقائياً
   */
  public async create(
    input: CreateRepairOrderInput,
    userId: number,
    shiftId?: number
  ): Promise<RepairOrder> {
    const db = this.getDb();

    if (!input.customerName || !input.customerPhone) {
      throw new Error('اسم العميل ورقم الهاتف مطلوبان لاستلام أمر الصيانة');
    }
    if (!input.deviceBrand || !input.deviceModel) {
      throw new Error('نوع وموديل الجهاز مطلوبان');
    }
    if (!input.reportedIssue) {
      throw new Error('يجب تحديد العطل أو المشكلة المشتكى منها');
    }

    const estimatedCost = Math.max(0, input.estimatedCost ?? 0);
    const depositAmount = Math.max(0, input.depositAmount ?? 0);
    const laborCost = Math.max(0, input.laborCost ?? estimatedCost);
    const totalCost = estimatedCost > 0 ? estimatedCost : laborCost;
    const paidAmount = depositAmount;
    const depositMethod = input.depositMethod || 'cash';

    const accessoriesJson =
      input.receivedAccessories && input.receivedAccessories.length > 0
        ? JSON.stringify(input.receivedAccessories)
        : null;

    const uuid = crypto.randomUUID();

    // التحقق المسبق من صحة الكيانات المرتبطة لمنع أي خطأ Foreign Key
    const effectiveUserId = this.resolveUserId(db, userId);
    const effectiveShiftId = this.resolveShiftId(db, shiftId, effectiveUserId);
    const resolvedCustomerId = this.resolveCustomerId(db, input.customerId);
    const resolvedTechnicianId = this.resolveTechnicianId(db, input.technicianId);

    const orderId = db.transaction(() => {
      // 1. زيادة العداد المتسلسل لأمر الصيانة مع التحصين التام ضد أي تصادم فريد (Unique Collision Safe)
      const maxRepairRow = db
        .prepare('SELECT COALESCE(MAX(seq_no), 0) as max_seq FROM repair_orders')
        .get() as { max_seq: number };
      const counterRow = db
        .prepare("SELECT value FROM counters WHERE name = 'repair_seq'")
        .get() as { value: number } | undefined;
      let seqNo = Math.max((counterRow?.value ?? 0) + 1, maxRepairRow.max_seq + 1);

      while (
        db
          .prepare('SELECT 1 FROM repair_orders WHERE seq_no = ? OR repair_code = ?')
          .get(seqNo, `REP-${String(seqNo).padStart(4, '0')}`)
      ) {
        seqNo++;
      }
      db.prepare("INSERT OR REPLACE INTO counters (name, value) VALUES ('repair_seq', ?)").run(seqNo);
      const repairCode = `REP-${String(seqNo).padStart(4, '0')}`;

      // 2. في حال وجود عربون، إصدار فاتورة بيع وسند قبض رسمي بدون تصادم
      let depositSaleId: number | null = null;
      let depositInvoiceNo: string | null = null;

      if (depositAmount > 0) {
        // زيادة عداد الفواتير بدون أي تصادم فريد
        const maxSaleRow = db
          .prepare('SELECT COALESCE(MAX(seq_no), 0) as max_seq FROM sales')
          .get() as { max_seq: number };
        const saleSeqRow = db
          .prepare("SELECT value FROM counters WHERE name = 'sale_seq'")
          .get() as { value: number } | undefined;
        let saleSeq = Math.max((saleSeqRow?.value ?? 0) + 1, maxSaleRow.max_seq + 1);

        while (
          db
            .prepare('SELECT 1 FROM sales WHERE seq_no = ? OR invoice_no = ?')
            .get(saleSeq, `INV-${String(saleSeq).padStart(5, '0')}`)
        ) {
          saleSeq++;
        }
        db.prepare("INSERT OR REPLACE INTO counters (name, value) VALUES ('sale_seq', ?)").run(saleSeq);
        depositInvoiceNo = `INV-${String(saleSeq).padStart(5, '0')}`;
        const saleUuid = crypto.randomUUID();

        const saleNote = `عربون استلام صيانة [${repairCode}] - عميل: ${input.customerName.trim()} (${input.customerPhone.trim()}) - جهاز: ${input.deviceBrand.trim()} ${input.deviceModel.trim()} - العطل: ${input.reportedIssue.trim()}`;

        const saleRes = db
          .prepare(`
            INSERT INTO sales (
              uuid, seq_no, invoice_no, user_id, shift_id, customer_id,
              subtotal, discount_amount, tax_amount, total, status, notes, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 'completed', ?, datetime('now'))
          `)
          .run(
            saleUuid,
            saleSeq,
            depositInvoiceNo,
            effectiveUserId,
            effectiveShiftId ?? null,
            resolvedCustomerId ?? null,
            depositAmount,
            depositAmount,
            saleNote
          );
        depositSaleId = Number(saleRes.lastInsertRowid);

        // إدراج بند الفاتورة
        const srvItem = this.ensureRepairServiceItem(db);
        db.prepare(`
          INSERT INTO sale_items (
            sale_id, variant_id, batch_id, product_name, variant_name,
            qty, unit_price, unit_cost, discount_amount, line_total
          ) VALUES (?, ?, ?, ?, ?, 1, ?, 0, 0, ?)
        `).run(
          depositSaleId,
          srvItem.variantId,
          srvItem.batchId,
          `عربون استلام صيانة [${repairCode}]`,
          `${input.deviceBrand.trim()} ${input.deviceModel.trim()}`,
          depositAmount,
          depositAmount
        );

        // إدراج الدفع
        db.prepare(`
          INSERT INTO sale_payments (sale_id, method, amount)
          VALUES (?, ?, ?)
        `).run(depositSaleId, depositMethod, depositAmount);
      }

      // 3. إدراج أمر الصيانة في الجدول
      const insertStmt = db.prepare(`
        INSERT INTO repair_orders (
          uuid, seq_no, repair_code, customer_id, customer_name, customer_phone,
          technician_id, user_id, shift_id, device_brand, device_model, device_color,
          imei_serial, passcode_pattern, reported_issue, inspection_notes,
          device_condition, received_accessories, estimated_cost, deposit_amount,
          labor_cost, parts_cost, total_cost, paid_amount, status, warranty_days,
          deposit_invoice_id, deposit_method, notes, created_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, 0, ?, ?, 'received', ?,
          ?, ?, ?, datetime('now')
        )
      `);

      const result = insertStmt.run(
        uuid,
        seqNo,
        repairCode,
        resolvedCustomerId ?? null,
        input.customerName.trim(),
        input.customerPhone.trim(),
        resolvedTechnicianId ?? null,
        effectiveUserId,
        effectiveShiftId ?? null,
        input.deviceBrand.trim(),
        input.deviceModel.trim(),
        input.deviceColor?.trim() ?? null,
        input.imeiSerial?.trim() ?? null,
        input.passcodePattern?.trim() ?? null,
        input.reportedIssue.trim(),
        input.inspectionNotes?.trim() ?? null,
        input.deviceCondition?.trim() ?? null,
        accessoriesJson,
        estimatedCost,
        depositAmount,
        laborCost,
        totalCost,
        paidAmount,
        input.warrantyDays ?? 30,
        depositSaleId,
        depositMethod,
        input.notes?.trim() ?? null
      );

      const newId = Number(result.lastInsertRowid);

      // 4. تسجيل حركة الخزنة إن وجد عربون نقدي والوردية مفتوحة
      if (depositSaleId && depositMethod === 'cash' && effectiveShiftId) {
        db.prepare(`
          INSERT INTO cash_movements (
            shift_id, user_id, type, amount, ref_type, ref_id, note, created_at
          ) VALUES (?, ?, 'sale', ?, 'repair_deposit', ?, ?, datetime('now'))
        `).run(
          effectiveShiftId,
          effectiveUserId,
          depositAmount,
          newId,
          `عربون صيانة [${repairCode}] - ${input.deviceBrand.trim()} ${input.deviceModel.trim()}`
        );
      }

      // 5. تسجيل الحالة الأولية في السجل
      const logNote =
        depositAmount > 0
          ? `استلام الجهاز المبدئي وقبض عربون (${depositAmount / 100} ج.م) بفاتورة #${depositInvoiceNo}`
          : 'استلام الجهاز المبدئي (بدون عربون)';

      db.prepare(`
        INSERT INTO repair_status_logs (repair_id, old_status, new_status, user_id, note, created_at)
        VALUES (?, NULL, 'received', ?, ?, datetime('now'))
      `).run(newId, effectiveUserId, logNote);

      return newId;
    })();

    const created = await this.getById(orderId);
    if (!created) {
      throw new Error('حدث خطأ أثناء إنشاء أمر الصيانة');
    }

    // تسجيل في سجل الرقابة
    await this.auditService.log({
      userId: effectiveUserId,
      action: 'repair:create',
      entityType: 'repair_orders',
      entityId: orderId,
      details: {
        repairCode: created.repairCode,
        customerName: created.customerName,
        device: `${created.deviceBrand} ${created.deviceModel}`,
        deposit: created.depositAmount,
        depositInvoice: created.depositInvoiceNo,
      },
    });

    return created;
  }

  /**
   * تسليم الجهاز والمحاسبة النهائية وإصدار فاتورة التسوية وإدراجها في الخزينة وسجل الفواتير
   */
  public async deliverAndSettle(input: DeliverRepairInput): Promise<RepairOrder> {
    const db = this.getDb();
    const existing = await this.getById(input.id);
    if (!existing) {
      throw new Error(`أمر الصيانة رقم ${input.id} غير موجود`);
    }

    if (existing.status === 'delivered') {
      return existing;
    }

    const effectiveUserId = this.resolveUserId(db, input.userId);
    const effectiveShiftId = this.resolveShiftId(db, input.shiftId, effectiveUserId);
    const resolvedCustomerId = this.resolveCustomerId(db, existing.customerId);

    const paymentMethod = input.paymentMethod || 'cash';
    const discountAmount = Math.max(0, input.discountAmount ?? 0);
    const finalLaborCost =
      input.finalLaborCost !== undefined
        ? Math.max(0, input.finalLaborCost)
        : (existing.laborCost > 0 ? existing.laborCost : Math.max(0, existing.totalCost - existing.partsCost));
    const totalCost = Math.max(0, finalLaborCost + existing.partsCost - discountAmount);
    const remainingAmount = Math.max(0, totalCost - existing.paidAmount);

    db.transaction(() => {
      let deliverySaleId: number | null = null;
      let deliveryInvoiceNo: string | null = null;

      // إصدار فاتورة تسوية للمبلغ المتبقي إن وجد
      if (remainingAmount > 0) {
        const maxSaleRow = db
          .prepare('SELECT COALESCE(MAX(seq_no), 0) as max_seq FROM sales')
          .get() as { max_seq: number };
        const saleSeqRow = db
          .prepare("SELECT value FROM counters WHERE name = 'sale_seq'")
          .get() as { value: number } | undefined;
        let saleSeq = Math.max((saleSeqRow?.value ?? 0) + 1, maxSaleRow.max_seq + 1);

        while (
          db
            .prepare('SELECT 1 FROM sales WHERE seq_no = ? OR invoice_no = ?')
            .get(saleSeq, `INV-${String(saleSeq).padStart(5, '0')}`)
        ) {
          saleSeq++;
        }
        db.prepare("INSERT OR REPLACE INTO counters (name, value) VALUES ('sale_seq', ?)").run(saleSeq);
        deliveryInvoiceNo = `INV-${String(saleSeq).padStart(5, '0')}`;
        const saleUuid = crypto.randomUUID();

        const saleNote = `تسليم ومحاسبة صيانة [${existing.repairCode}] - عميل: ${existing.customerName} (${existing.customerPhone}) - جهاز: ${existing.deviceBrand} ${existing.deviceModel} - الإجمالي: ${totalCost / 100} ج.م - المسدد مسبقاً: ${existing.paidAmount / 100} ج.م - المسدد الآن: ${remainingAmount / 100} ج.م`;

        const saleRes = db
          .prepare(`
            INSERT INTO sales (
              uuid, seq_no, invoice_no, user_id, shift_id, customer_id,
              subtotal, discount_amount, tax_amount, total, status, notes, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 'completed', ?, datetime('now'))
          `)
          .run(
            saleUuid,
            saleSeq,
            deliveryInvoiceNo,
            effectiveUserId,
            effectiveShiftId ?? null,
            resolvedCustomerId ?? null,
            remainingAmount,
            remainingAmount,
            saleNote
          );
        deliverySaleId = Number(saleRes.lastInsertRowid);

        // حساب التكلفة الحقيقية لقطع الغيار المستخدمة
        const partsCostRow = db
          .prepare('SELECT COALESCE(SUM(qty * unit_cost), 0) as total_parts_cost FROM repair_parts WHERE repair_id = ?')
          .get(existing.id) as { total_parts_cost: number };
        const partsTotalCost = partsCostRow?.total_parts_cost ?? 0;

        // إدراج بند الفاتورة مع التكلفة الحقيقية
        const srvItem = this.ensureRepairServiceItem(db);
        db.prepare(`
          INSERT INTO sale_items (
            sale_id, variant_id, batch_id, product_name, variant_name,
            qty, unit_price, unit_cost, discount_amount, line_total
          ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, 0, ?)
        `).run(
          deliverySaleId,
          srvItem.variantId,
          srvItem.batchId,
          `تسوية ومتبقي صيانة [${existing.repairCode}]`,
          `${existing.deviceBrand} ${existing.deviceModel}`,
          remainingAmount,
          partsTotalCost,
          remainingAmount
        );

        // إدراج الدفع
        db.prepare(`
          INSERT INTO sale_payments (sale_id, method, amount)
          VALUES (?, ?, ?)
        `).run(deliverySaleId, paymentMethod, remainingAmount);

        // إدراج حركة الخزنة إن كان الدفع نقدياً والوردية مفتوحة
        if (paymentMethod === 'cash' && effectiveShiftId) {
          db.prepare(`
            INSERT INTO cash_movements (
              shift_id, user_id, type, amount, ref_type, ref_id, note, created_at
            ) VALUES (?, ?, 'sale', ?, 'repair_delivery', ?, ?, datetime('now'))
          `).run(
            effectiveShiftId,
            effectiveUserId,
            remainingAmount,
            existing.id,
            `تسوية ومحاسبة صيانة [${existing.repairCode}] - تسليم الجهاز`
          );
        }
      }

      // 3. تحديث أمر الصيانة إلى حالة تم التسليم والمحاسبة
      db.prepare(`
        UPDATE repair_orders
        SET 
          status = 'delivered',
          delivered_at = datetime('now'),
          labor_cost = ?,
          total_cost = ?,
          paid_amount = ?,
          delivery_invoice_id = COALESCE(?, delivery_invoice_id),
          delivery_method = ?
        WHERE id = ?
      `).run(
        finalLaborCost,
        totalCost,
        totalCost,
        deliverySaleId,
        paymentMethod,
        input.id
      );

      // 4. تسجيل في سجل مراحل الصيانة
      const logMessage =
        input.note?.trim() ??
        (remainingAmount > 0
          ? `تم تسليم الجهاز للعميل وتحصيل باقي المبلغ (${remainingAmount / 100} ج.م) بفاتورة #${deliveryInvoiceNo}`
          : 'تم تسليم الجهاز للعميل والمحاسبة بالكامل');

      db.prepare(`
        INSERT INTO repair_status_logs (repair_id, old_status, new_status, user_id, note, created_at)
        VALUES (?, ?, 'delivered', ?, ?, datetime('now'))
      `).run(input.id, existing.status, effectiveUserId, logMessage);
    })();

    await this.auditService.log({
      userId: effectiveUserId,
      action: 'repair:deliver',
      entityType: 'repair_orders',
      entityId: input.id,
      details: {
        repairCode: existing.repairCode,
        totalCost,
        remainingCollected: remainingAmount,
        paymentMethod,
      },
    });

    const updated = await this.getById(input.id);
    return updated!;
  }

  /**
   * تحديث بيانات أمر الصيانة
   */
  public async update(
    id: number,
    input: UpdateRepairOrderInput,
    userId: number
  ): Promise<RepairOrder> {
    const db = this.getDb();
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error(`أمر الصيانة رقم ${id} غير موجود`);
    }

    const accessoriesJson =
      input.receivedAccessories !== undefined
        ? input.receivedAccessories.length > 0
          ? JSON.stringify(input.receivedAccessories)
          : null
        : existing.receivedAccessories;

    const laborCost =
      input.laborCost !== undefined ? Math.max(0, input.laborCost) : existing.laborCost;
    const totalCost = laborCost + existing.partsCost;

    db.prepare(`
      UPDATE repair_orders
      SET 
        technician_id = COALESCE(?, technician_id),
        reported_issue = COALESCE(?, reported_issue),
        inspection_notes = COALESCE(?, inspection_notes),
        device_condition = COALESCE(?, device_condition),
        received_accessories = ?,
        estimated_cost = COALESCE(?, estimated_cost),
        labor_cost = ?,
        total_cost = ?,
        warranty_days = COALESCE(?, warranty_days),
        notes = COALESCE(?, notes)
      WHERE id = ?
    `).run(
      input.technicianId !== undefined ? input.technicianId : existing.technicianId,
      input.reportedIssue?.trim() ?? null,
      input.inspectionNotes?.trim() ?? null,
      input.deviceCondition?.trim() ?? null,
      accessoriesJson,
      input.estimatedCost !== undefined ? input.estimatedCost : null,
      laborCost,
      totalCost,
      input.warrantyDays !== undefined ? input.warrantyDays : null,
      input.notes?.trim() ?? null,
      id
    );

    const updated = await this.getById(id);
    return updated!;
  }

  /**
   * تحديث حالة أمر الصيانة (دورة حياة الجهاز)
   */
  public async updateStatus(
    id: number,
    newStatus: RepairStatus,
    userId: number,
    note?: string
  ): Promise<RepairOrder> {
    const db = this.getDb();
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error(`أمر الصيانة رقم ${id} غير موجود`);
    }

    if (existing.status === newStatus) {
      return existing;
    }

    const effectiveUserId = this.resolveUserId(db, userId);

    // إذا كانت الحالة المطلوبة هي التسليم:
    if (newStatus === 'delivered') {
      return this.deliverAndSettle({
        id,
        paymentMethod: 'cash',
        userId: effectiveUserId,
        note,
      });
    }

    db.transaction(() => {
      let readyAtSql = '';
      if (newStatus === 'ready' && !existing.readyAt) {
        readyAtSql = ", ready_at = datetime('now')";
      }

      db.prepare(`
        UPDATE repair_orders
        SET status = ? ${readyAtSql}
        WHERE id = ?
      `).run(newStatus, id);

      db.prepare(`
        INSERT INTO repair_status_logs (repair_id, old_status, new_status, user_id, note, created_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `).run(id, existing.status, newStatus, effectiveUserId, note?.trim() ?? null);
    })();

    await this.auditService.log({
      userId: effectiveUserId,
      action: 'repair:update_status',
      entityType: 'repair_orders',
      entityId: id,
      details: {
        repairCode: existing.repairCode,
        oldStatus: existing.status,
        newStatus,
        note,
      },
    });

    const updated = await this.getById(id);
    return updated!;
  }

  /**
   * إضافة قطعة غيار مستهلكة في الإصلاح
   */
  public async addPart(input: AddRepairPartInput, userId: number): Promise<RepairOrder> {
    const db = this.getDb();
    const repair = await this.getById(input.repairId);
    if (!repair) {
      throw new Error(`أمر الصيانة رقم ${input.repairId} غير موجود`);
    }

    if (repair.status === 'delivered' || repair.status === 'cancelled') {
      throw new Error('لا يمكن إضافة قطع غيار لأمر صيانة منتهي أو ملغي');
    }

    const effectiveUserId = this.resolveUserId(db, userId);

    db.transaction(() => {
      // تحديد الدفعة المناسبة لخصم المخزون
      let resolvedBatchId = input.batchId ?? null;
      if (!resolvedBatchId) {
        const availableBatch = db
          .prepare('SELECT id FROM batches WHERE variant_id = ? AND qty_remaining >= ? ORDER BY id DESC LIMIT 1')
          .get(input.variantId, input.qty) as { id: number } | undefined;
        if (availableBatch) {
          resolvedBatchId = availableBatch.id;
        } else {
          const anyBatch = db
            .prepare('SELECT id FROM batches WHERE variant_id = ? ORDER BY id DESC LIMIT 1')
            .get(input.variantId) as { id: number } | undefined;
          resolvedBatchId = anyBatch ? anyBatch.id : null;
        }
      }

      // 1. تسجيل قطعة الغيار
      db.prepare(`
        INSERT INTO repair_parts (repair_id, variant_id, batch_id, item_name, qty, unit_cost, unit_price, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        input.repairId,
        input.variantId,
        resolvedBatchId,
        input.itemName,
        input.qty,
        input.unitCost,
        input.unitPrice
      );

      // 2. خصم المخزون فعلياً بحركة stock_movement
      if (resolvedBatchId) {
        db.prepare(`
          INSERT INTO stock_movements (batch_id, type, qty, ref_type, ref_id, user_id, note, created_at)
          VALUES (?, 'adjust_out', ?, 'repair_part', ?, ?, ?, datetime('now'))
        `).run(
          resolvedBatchId,
          -Math.abs(input.qty),
          input.repairId,
          effectiveUserId,
          `استهلاك قطعة غيار [${input.itemName}] لأمر صيانة [${repair.repairCode}]`
        );
      }

      // 3. تحديث تكلفة قطع الغيار والإجمالي في أمر الصيانة
      const sumRow = db
        .prepare(`
          SELECT COALESCE(SUM(qty * unit_price), 0) AS total_parts
          FROM repair_parts
          WHERE repair_id = ?
        `)
        .get(input.repairId) as { total_parts: number };

      const partsCost = sumRow.total_parts;
      const totalCost = repair.laborCost + partsCost;

      db.prepare(`
        UPDATE repair_orders
        SET parts_cost = ?, total_cost = ?
        WHERE id = ?
      `).run(partsCost, totalCost, input.repairId);
    })();

    const updated = await this.getById(input.repairId);
    return updated!;
  }

  /**
   * حذف قطعة غيار من أمر الصيانة
   */
  public async removePart(partId: number, userId: number): Promise<RepairOrder> {
    const db = this.getDb();
    const part = db.prepare('SELECT * FROM repair_parts WHERE id = ?').get(partId) as any;
    if (!part) {
      throw new Error('قطعة الغيار غير موجودة');
    }

    const repairId = part.repair_id;
    const effectiveUserId = this.resolveUserId(db, userId);

    db.transaction(() => {
      // إعادة الكمية للمخزون
      if (part.batch_id) {
        db.prepare(`
          INSERT INTO stock_movements (batch_id, type, qty, ref_type, ref_id, user_id, note, created_at)
          VALUES (?, 'adjust_in', ?, 'repair_part_cancel', ?, ?, ?, datetime('now'))
        `).run(
          part.batch_id,
          Math.abs(part.qty),
          repairId,
          effectiveUserId,
          `إلغاء استهلاك قطعة غيار [${part.item_name}] من أمر صيانة #${repairId}`
        );
      }

      db.prepare('DELETE FROM repair_parts WHERE id = ?').run(partId);

      const sumRow = db
        .prepare(`
          SELECT COALESCE(SUM(qty * unit_price), 0) AS total_parts
          FROM repair_parts
          WHERE repair_id = ?
        `)
        .get(repairId) as { total_parts: number };

      const repair = db
        .prepare('SELECT labor_cost FROM repair_orders WHERE id = ?')
        .get(repairId) as any;
      const partsCost = sumRow.total_parts;
      const totalCost = (repair?.labor_cost ?? 0) + partsCost;

      db.prepare(`
        UPDATE repair_orders
        SET parts_cost = ?, total_cost = ?
        WHERE id = ?
      `).run(partsCost, totalCost, repairId);
    })();

    const updated = await this.getById(repairId);
    return updated!;
  }

  private mapOrderRow(row: any): RepairOrder {
    let accessories: string[] = [];
    if (row.received_accessories) {
      try {
        accessories = JSON.parse(row.received_accessories);
      } catch {
        accessories = [];
      }
    }

    return {
      id: row.id,
      uuid: row.uuid,
      seqNo: row.seq_no,
      repairCode: row.repair_code,
      customerId: row.customer_id,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      technicianId: row.technician_id,
      technicianName: row.technician_name,
      userId: row.user_id,
      userName: row.user_name,
      shiftId: row.shift_id,
      deviceBrand: row.device_brand,
      deviceModel: row.device_model,
      deviceColor: row.device_color,
      imeiSerial: row.imei_serial,
      passcodePattern: row.passcode_pattern,
      reportedIssue: row.reported_issue,
      inspectionNotes: row.inspection_notes,
      deviceCondition: row.device_condition,
      receivedAccessories: row.received_accessories,
      estimatedCost: row.estimated_cost ?? 0,
      depositAmount: row.deposit_amount ?? 0,
      laborCost: row.labor_cost ?? 0,
      partsCost: row.parts_cost ?? 0,
      totalCost: row.total_cost ?? 0,
      paidAmount: row.paid_amount ?? 0,
      remainingAmount: (row.total_cost ?? 0) - (row.paid_amount ?? 0),
      status: row.status as RepairStatus,
      warrantyDays: row.warranty_days ?? 30,
      createdAt: row.created_at,
      readyAt: row.ready_at,
      deliveredAt: row.delivered_at,
      depositInvoiceId: row.deposit_invoice_id ?? null,
      deliveryInvoiceId: row.delivery_invoice_id ?? null,
      depositInvoiceNo: row.deposit_invoice_no ?? null,
      deliveryInvoiceNo: row.delivery_invoice_no ?? null,
      depositMethod: row.deposit_method ?? null,
      deliveryMethod: row.delivery_method ?? null,
      notes: row.notes,
    };
  }
}

export const repairsService = new RepairsService();
