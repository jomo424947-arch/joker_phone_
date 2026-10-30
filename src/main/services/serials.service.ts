/**
 * خدمة تتبع سيريال الأجهزة وأرقام IMEI (Device Serials & IMEI Tracking Service)
 * تدير: تسجيل الهواتف الفردية، التحقق من عدم تكرار IMEI، تتبع الضمان وصحة البطارية
 */

import type Database from 'better-sqlite3';
import { getDatabase } from '../db/connection';
import {
  DeviceSerial,
  CreateDeviceSerialInput,
  DeviceSerialFilters,
  DeviceSerialStatus,
} from '../../shared/types/serials.types';
import { auditService as globalAuditService, AuditService } from './audit.service';

export class SerialsService {
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
   * جلب قائمة السيريالات مع الفلاتر
   */
  public async list(filters?: DeviceSerialFilters): Promise<DeviceSerial[]> {
    const db = this.getDb();
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (filters?.variantId) {
      conditions.push('s.variant_id = ?');
      params.push(filters.variantId);
    }

    if (filters?.status) {
      conditions.push('s.status = ?');
      params.push(filters.status);
    }

    if (filters?.condition) {
      conditions.push('s.condition = ?');
      params.push(filters.condition);
    }

    if (filters?.search && filters.search.trim().length > 0) {
      const term = `%${filters.search.trim()}%`;
      conditions.push('(s.imei_1 LIKE ? OR s.imei_2 LIKE ? OR s.serial_no LIKE ? OR p.name_ar LIKE ?)');
      params.push(term, term, term, term);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.max(1, filters?.limit ?? 100);

    const sql = `
      SELECT 
        s.*,
        p.name_ar AS product_name,
        pv.variant_name,
        pv.barcode
      FROM device_serials s
      JOIN product_variants pv ON pv.id = s.variant_id
      JOIN products p ON p.id = pv.product_id
      ${whereClause}
      ORDER BY s.id DESC
      LIMIT ?
    `;

    params.push(limit);

    const rows = db.prepare(sql).all(...params) as any[];
    return rows.map((r) => this.mapRow(r));
  }

  /**
   * بحث سريع برقم IMEI أو السيريال
   */
  public async search(query: string): Promise<DeviceSerial[]> {
    if (!query || query.trim().length === 0) return [];
    return this.list({ search: query, limit: 20 });
  }

  /**
   * البحث عن سيريال بواسطة IMEI 1
   */
  public async getByImei(imei: string): Promise<DeviceSerial | null> {
    const db = this.getDb();
    const row = db.prepare(`
      SELECT 
        s.*,
        p.name_ar AS product_name,
        pv.variant_name,
        pv.barcode
      FROM device_serials s
      JOIN product_variants pv ON pv.id = s.variant_id
      JOIN products p ON p.id = pv.product_id
      WHERE s.imei_1 = ? OR s.imei_2 = ? OR s.serial_no = ?
    `).get(imei.trim(), imei.trim(), imei.trim()) as any;

    return row ? this.mapRow(row) : null;
  }

  /**
   * تسجيل سيريال / IMEI جديد لجهاز
   */
  public async create(input: CreateDeviceSerialInput, userId: number): Promise<DeviceSerial> {
    const db = this.getDb();

    const imei1 = input.imei1?.trim();
    if (!imei1) {
      throw new Error('رقم IMEI الأساسي مطلوب');
    }

    // فحص عدم التكرار
    const existing = db.prepare('SELECT id FROM device_serials WHERE imei_1 = ?').get(imei1);
    if (existing) {
      throw new Error(`رقم IMEI (${imei1}) مسجل مسبقاً في النظام`);
    }

    const result = db.prepare(`
      INSERT INTO device_serials (
        variant_id, imei_1, imei_2, serial_no, battery_health,
        condition, status, warranty_months, notes, created_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, 'in_stock', ?, ?, datetime('now')
      )
    `).run(
      input.variantId,
      imei1,
      input.imei2?.trim() ?? null,
      input.serialNo?.trim() ?? null,
      input.batteryHealth ?? null,
      input.condition ?? 'new',
      input.warrantyMonths ?? 12,
      input.notes?.trim() ?? null
    );

    const newId = Number(result.lastInsertRowid);

    await this.auditService.log({
      userId,
      action: 'serial:create',
      entityType: 'device_serials',
      entityId: newId,
      details: {
        imei1,
        variantId: input.variantId,
        condition: input.condition ?? 'new',
      },
    });

    const created = await this.list({ search: imei1, limit: 1 });
    return created[0];
  }

  /**
   * تحديث حالة السيريال (عند البيع، المرتجع، أو الصيانة)
   */
  public async updateStatus(
    id: number,
    status: DeviceSerialStatus,
    saleItemId?: number
  ): Promise<void> {
    const db = this.getDb();
    db.prepare(`
      UPDATE device_serials
      SET status = ?, sale_item_id = COALESCE(?, sale_item_id)
      WHERE id = ?
    `).run(status, saleItemId ?? null, id);
  }

  private mapRow(row: any): DeviceSerial {
    return {
      id: row.id,
      variantId: row.variant_id,
      productName: row.product_name,
      variantName: row.variant_name,
      barcode: row.barcode,
      imei1: row.imei_1,
      imei2: row.imei_2,
      serialNo: row.serial_no,
      batteryHealth: row.battery_health,
      condition: row.condition,
      status: row.status,
      warrantyMonths: row.warranty_months ?? 12,
      saleItemId: row.sale_item_id,
      notes: row.notes,
      createdAt: row.created_at,
    };
  }
}

export const serialsService = new SerialsService();
