/**
 * خدمة الإعدادات العامة (Settings Service)
 * تدير: CRUD إعدادات المحل والنظام وسياسات البيع وتهيئة نقطة البيع
 * القاعدة الذهبية: لا يوجد أي متغير تجاري مكتوب Hardcoded في الكود — كل شيء من settings
 */

import type Database from 'better-sqlite3';
import { getDatabase } from '../db/connection';
import { SettingItem, SettingsMap, SettingUpdate } from '../../shared/types/settings.types';
import { auditService as globalAuditService, AuditService } from './audit.service';

export class SettingsService {
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
   * جلب جميع الإعدادات كـ Map (key → value)
   */
  getAll(): SettingsMap {
    const db = this.getDb();
    const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
    const map: SettingsMap = {};
    for (const row of rows) {
      map[row.key] = row.value;
    }
    return map;
  }

  /**
   * جلب جميع الإعدادات كمصفوفة تفصيلية
   */
  getAllDetailed(): SettingItem[] {
    const db = this.getDb();
    return db.prepare('SELECT key, value, updated_at FROM settings ORDER BY key ASC').all() as SettingItem[];
  }

  /**
   * جلب إعداد واحد بالمفتاح
   */
  get(key: string): string | null {
    const db = this.getDb();
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  /**
   * جلب إعداد كـ number (مع القيمة الافتراضية)
   */
  getNumber(key: string, defaultValue: number = 0): number {
    const val = this.get(key);
    if (val === null || val === '') return defaultValue;
    const parsed = Number(val);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  /**
   * جلب إعداد كـ boolean
   */
  getBoolean(key: string, defaultValue: boolean = false): boolean {
    const val = this.get(key);
    if (val === null || val === '') return defaultValue;
    return val === '1' || val === 'true';
  }

  /**
   * تحديث إعداد واحد (يُنشئ إن لم يوجد — UPSERT)
   */
  set(key: string, value: string, userId?: number): void {
    const db = this.getDb();

    const oldValue = this.get(key);

    db.prepare(`
      INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, value);

    if (userId) {
      this.auditService.log({
        userId,
        action: 'UPDATE_SETTING',
        entityType: 'settings',
        entityId: 0,
        details: { key, old_value: oldValue, new_value: value },
      });
    }
  }

  /**
   * تحديث مجموعة إعدادات دفعة واحدة
   */
  bulkUpdate(updates: SettingUpdate[], userId?: number): void {
    const db = this.getDb();

    const bulkTx = db.transaction(() => {
      for (const update of updates) {
        this.set(update.key, update.value, userId);
      }
    });

    bulkTx();
  }

  /**
   * حذف إعداد (نادر — للاستخدام الإداري فقط)
   */
  delete(key: string, userId?: number): boolean {
    const db = this.getDb();
    const result = db.prepare('DELETE FROM settings WHERE key = ?').run(key);

    if (userId && result.changes > 0) {
      this.auditService.log({
        userId,
        action: 'DELETE_SETTING',
        entityType: 'settings',
        entityId: 0,
        details: { key },
      });
    }

    return result.changes > 0;
  }

  /**
   * إعادة تعيين جميع الإعدادات للقيم الافتراضية
   */
  resetDefaults(): void {
    const db = this.getDb();
    const defaults: Record<string, string> = {
      store_name: 'موبيكس - Mobix',
      store_name_en: 'Mobix',
      store_phone: '',
      store_whatsapp: '',
      store_address: '',
      store_logo_path: '',
      currency: 'ج.م',
      currency_symbol: 'ج.م',
      tax_rate: '0',
      tax_registration_no: '',
      commercial_register_no: '',
      receipt_header: 'أهلاً بكم في متجرنا',
      receipt_footer: 'شكراً لزيارتكم ونسعد بخدمتكم دائماً',
      receipt_width_mm: '80',
      receipt_copies: '1',
      receipt_show_tax_no: '0',
      printer_name: '',
      barcode_printer_name: '',
      barcode_label_width_mm: '38',
      barcode_label_height_mm: '25',
      auto_open_drawer_on_cash_sale: '1',
      barcode_scan_increase_qty: '1',
      allow_zero_stock_sale: '0',
      max_cashier_discount: '5',
      max_cashier_discount_percent: '5',
      expiry_alert_days: '30,60,90',
      return_window_days: '14',
      require_manager_return: '1',
      allow_opened_cosmetics_return: '0',
      theme: 'light',
      decimal_places: '2',
      auto_backup_enabled: '1',
      auto_backup_path: '',
      backup_interval_hours: '24',
      max_cashier_expense_limit: '10000',
    };

    const tx = db.transaction(() => {
      for (const [key, value] of Object.entries(defaults)) {
        db.prepare(`
          INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        `).run(key, value);
      }
    });

    tx();
  }
}

export const settingsService = new SettingsService();
