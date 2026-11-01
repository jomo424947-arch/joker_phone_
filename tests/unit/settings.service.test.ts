import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/main/db/migrator';
import { SettingsService } from '../../src/main/services/settings.service';
import { AuthService } from '../../src/main/services/auth.service';
import { USER_ROLES } from '../../src/shared/constants/roles';

describe('SettingsService (خدمة الإعدادات العامة)', () => {
  let db: Database.Database;
  let settingsService: SettingsService;
  let adminId: number;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    settingsService = new SettingsService(db);

    const authService = new AuthService(db);
    const admin = authService.createUser({
      username: 'settings_admin',
      display_name: 'مدير الإعدادات',
      password: 'password',
      pin: '1122',
      role: USER_ROLES.MANAGER,
    });
    adminId = admin.id;
  });

  afterEach(() => {
    db.close();
  });

  test('جلب جميع الإعدادات المحفوظة والتفصيلية', () => {
    const all = settingsService.getAll();
    expect(all).toBeDefined();
    expect(all['store_name']).toBeDefined();

    const detailed = settingsService.getAllDetailed();
    expect(detailed.length).toBeGreaterThan(0);
    expect(detailed[0]).toHaveProperty('key');
    expect(detailed[0]).toHaveProperty('value');
    expect(detailed[0]).toHaveProperty('updated_at');
  });

  test('قراءة الإعدادات بأنواعها (string, number, boolean) مع القيم الافتراضية', () => {
    settingsService.set('test_str', 'Hello World');
    settingsService.set('test_num', '1250');
    settingsService.set('test_bool_true', '1');
    settingsService.set('test_bool_false', '0');

    expect(settingsService.get('test_str')).toBe('Hello World');
    expect(settingsService.getNumber('test_num')).toBe(1250);
    expect(settingsService.getNumber('non_existent', 99)).toBe(99);

    expect(settingsService.getBoolean('test_bool_true')).toBe(true);
    expect(settingsService.getBoolean('test_bool_false')).toBe(false);
    expect(settingsService.getBoolean('non_existent', true)).toBe(true);
  });

  test('تحديث إعداد واحد وتسجيل الحركة في سجل الرقابة (Audit Log)', () => {
    settingsService.set('store_name', 'صيدلية وجمال النخبة', adminId);

    expect(settingsService.get('store_name')).toBe('صيدلية وجمال النخبة');

    const auditEntry = db
      .prepare(`SELECT * FROM audit_log WHERE action = 'UPDATE_SETTING' ORDER BY id DESC LIMIT 1`)
      .get() as any;

    expect(auditEntry).toBeDefined();
    expect(auditEntry.user_id).toBe(adminId);
    expect(auditEntry.entity_type).toBe('settings');
    const details = JSON.parse(auditEntry.details);
    expect(details.key).toBe('store_name');
    expect(details.new_value).toBe('صيدلية وجمال النخبة');
  });

  test('تحديث دفعة إعدادات متزامنة (Bulk Update) داخل Transaction', () => {
    settingsService.bulkUpdate(
      [
        { key: 'store_phone', value: '01001234567' },
        { key: 'tax_rate', value: '14' },
        { key: 'theme', value: 'dark' },
      ],
      adminId
    );

    expect(settingsService.get('store_phone')).toBe('01001234567');
    expect(settingsService.getNumber('tax_rate')).toBe(14);
    expect(settingsService.get('theme')).toBe('dark');
  });

  test('حذف إعداد وإعادة تعيين القيم الافتراضية (Reset Defaults)', () => {
    settingsService.set('custom_temp_key', 'temp_val');
    expect(settingsService.get('custom_temp_key')).toBe('temp_val');

    const deleted = settingsService.delete('custom_temp_key', adminId);
    expect(deleted).toBe(true);
    expect(settingsService.get('custom_temp_key')).toBeNull();

    // إعادة الضبط للافتراضي
    settingsService.set('store_name', 'اسم تجريبي مؤقت');
    settingsService.resetDefaults();
    expect(settingsService.get('store_name')).toBe('موبيكس - Mobix');
  });
});
