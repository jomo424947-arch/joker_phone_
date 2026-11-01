import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/main/db/migrator';
import { CloudLicenseService } from '../../src/main/cloud/license.service';

describe('CloudLicenseService (إدارة التراخيص، فترة السماح 30 يوماً، والعمل أوفلاين)', () => {
  let db: Database.Database;
  let licenseService: CloudLicenseService;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    licenseService = new CloudLicenseService(db);
  });

  afterEach(() => {
    db.close();
  });

  test('توليد معرف جهاز ثابت وحفظه في الإعدادات', () => {
    const id1 = licenseService.getMachineId();
    expect(id1).toBeDefined();
    expect(id1.startsWith('JKR-')).toBe(true);

    // التحقق من الثبات
    const id2 = licenseService.getMachineId();
    expect(id2).toBe(id1);
  });

  test('حفظ واسترجاع مفتاح الترخيص محلياً', () => {
    licenseService.setLicenseId('test-uuid-1234');
    expect(licenseService.getLicenseId()).toBe('test-uuid-1234');
  });

  test('العمل أوفلاين بدون انقطاع أو أخطاء عند عدم وجود إعدادات سحابية', () => {
    const status = licenseService.getLocalLicenseStatus();
    expect(status.isOnline).toBe(false);
    expect(status.machineId).toBeDefined();
    // لا يمنع النظام من العمل
    expect(status.status).toBe('unlicensed');
  });

  test('فترة السماح (Grace Period) مدتها 30 يوماً عند إلغاء الترخيص', () => {
    const licenseId = '7b960b76-4d1a-46be-9f17-b76543210000';
    licenseService.setLicenseId(licenseId);

    // تعيين الترخيص كملغي حديثاً (اليوم)
    db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('cloud_license_status', 'revoked', datetime('now'))").run();
    db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('cloud_first_revoked_at', datetime('now'), datetime('now'))").run();

    // فحص الحالة محلياً
    const status = licenseService.getLocalLicenseStatus();
    expect(status.status).toBe('revoked');
    expect(status.inGracePeriod).toBe(true);
    expect(status.graceDaysRemaining).toBe(30);
    expect(status.isValid).toBe(true); // مسموح له خلال فترة السماح
  });

  test('انتهاء فترة السماح بعد مرور أكثر من 30 يوماً على الإلغاء', () => {
    const licenseId = '7b960b76-4d1a-46be-9f17-b76543210000';
    licenseService.setLicenseId(licenseId);

    // تعيين الإلغاء قبل 35 يوماً
    const thirtyFiveDaysAgo = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('cloud_license_status', 'revoked', datetime('now'))").run();
    db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('cloud_first_revoked_at', ?, datetime('now'))").run(thirtyFiveDaysAgo);

    const status = licenseService.getLocalLicenseStatus();
    expect(status.status).toBe('revoked');
    expect(status.inGracePeriod).toBe(false);
    expect(status.graceDaysRemaining).toBe(0);
    expect(status.isValid).toBe(false); // غير صالح بعد انتهاء المهلة
  });
});
