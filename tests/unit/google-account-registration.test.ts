import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/main/db/migrator';
import { AuthService } from '../../src/main/services/auth.service';
import { CloudLicenseService } from '../../src/main/cloud/license.service';

describe('نظام التسجيل والترخيص بحساب جوجل (Google Account Registration & Licensing)', () => {
  let db: Database.Database;
  let authService: AuthService;
  let licenseService: CloudLicenseService;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    authService = new AuthService(db);
    licenseService = new CloudLicenseService(db);
  });

  afterEach(() => {
    db.close();
  });

  test('تخزين واسترجاع حساب جوجل المعتمد في خدمة التراخيص محلياً', () => {
    db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('cloud_customer_email', 'store.owner@gmail.com', datetime('now'))").run();
    db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('cloud_license_id', 'lic-uuid-9999', datetime('now'))").run();
    db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('cloud_customer_name', 'سنتر الأمل للموبايل', datetime('now'))").run();

    const status = licenseService.getLocalLicenseStatus();
    expect(status.customerEmail).toBe('store.owner@gmail.com');
    expect(status.customerName).toBe('سنتر الأمل للموبايل');
    expect(status.licenseId).toBe('lic-uuid-9999');
    expect(status.machineId).toBeDefined();
    expect(status.machineId.startsWith('JKR-')).toBe(true);
  });

  test('فشل التهيئة في حال عدم تقديم حساب جوجل أو ترخيص', async () => {
    const res = await authService.completeInitialSetup({
      storeName: 'محل النصر',
      username: 'owner_user',
      displayName: 'صاحب المحل',
      password: 'password123',
      pin: '1234',
      activationCode: '',
      googleAccount: '',
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain('حساب جوجل المعتمد مطلوب');
  });

  test('نجاح التهيئة الأولية وتفعيل النظام بالكامل عبر حساب جوجل المعتمد', async () => {
    // محاكاة كود تفعيل ماستر أو ترخيص سحابي ناجح
    const masterCode = '2784-ACA5-A4E7-B14C';

    const res = await authService.completeInitialSetup({
      storeName: 'موبيكس فرع الإسكندرية',
      storePhone: '01012345678',
      storeAddress: 'محطة الرمل',
      username: 'mobix_alex',
      displayName: 'أحمد موبيكس',
      password: 'SecurePassword2026',
      pin: '5555',
      googleAccount: 'mobix.alex@gmail.com',
      activationCode: masterCode,
    });

    expect(res.success).toBe(true);
    expect(res.user).toBeDefined();
    expect(res.user?.username).toBe('mobix_alex');
    expect(res.user?.role).toBe('owner');

    // التحقق من الإعدادات المحفوظة
    const isCompleted = authService.isSetupCompleted();
    expect(isCompleted).toBe(true);

    const storeName = db.prepare("SELECT value FROM settings WHERE key = 'store_name'").get() as any;
    expect(storeName.value).toBe('موبيكس فرع الإسكندرية');

    const licenseActivated = db.prepare("SELECT value FROM settings WHERE key = 'license_activated'").get() as any;
    expect(licenseActivated.value).toBe('1');

    const googleAccount = db.prepare("SELECT value FROM settings WHERE key = 'google_account'").get() as any;
    expect(googleAccount.value).toBe('mobix.alex@gmail.com');

    const customerEmail = db.prepare("SELECT value FROM settings WHERE key = 'cloud_customer_email'").get() as any;
    expect(customerEmail.value).toBe('mobix.alex@gmail.com');
  });

  test('منع إعادة التهيئة إذا كان النظام مفعلاً ومسجلاً مسبقاً', async () => {
    // تفعيل أول مرة
    await authService.completeInitialSetup({
      storeName: 'محل 1',
      username: 'owner_one',
      displayName: 'المالك 1',
      password: 'password123',
      pin: '1111',
      googleAccount: 'owner1@gmail.com',
      activationCode: '2784-ACA5-A4E7-B14C',
    });

    // محاولة تفعيل ثانية
    const secondTry = await authService.completeInitialSetup({
      storeName: 'محل 2',
      username: 'owner_two',
      displayName: 'المالك 2',
      password: 'password456',
      pin: '2222',
      googleAccount: 'owner2@gmail.com',
      activationCode: '2784-ACA5-A4E7-B14C',
    });

    expect(secondTry.success).toBe(false);
    expect(secondTry.error).toContain('تم إعداد النظام وتفعيله مسبقاً');
  });
});
