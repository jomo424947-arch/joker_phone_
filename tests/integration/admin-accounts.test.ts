import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/main/db/migrator';
import { AuthService } from '../../src/main/services/auth.service';
import { ALLOWED_ADMIN_ACCOUNTS, isAllowedAdminUsername } from '../../src/main/config/admin-accounts.config';
import { USER_ROLES } from '../../src/shared/constants/roles';

describe('فحص تكامل الحسابات الإدارية المعتمدة والأمان (Admin Integration)', () => {
  let db: Database.Database;
  let authService: AuthService;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    authService = new AuthService(db);
  });

  afterEach(() => {
    db.close();
  });

  test('تكوين الحسابات الإدارية يحتوي على الحسابين المعتمدين فقط', () => {
    expect(ALLOWED_ADMIN_ACCOUNTS).toHaveLength(2);

    const owner = ALLOWED_ADMIN_ACCOUNTS.find((a) => a.username === 'mobix_admin');
    expect(owner).toBeDefined();
    expect(owner?.display_name).toBe('مدير موبيكس');
    expect(owner?.role).toBe(USER_ROLES.OWNER);
    expect(owner?.pin).toBeDefined();

    const tester = ALLOWED_ADMIN_ACCOUNTS.find((a) => a.username === 'test_admin');
    expect(tester).toBeDefined();
    expect(tester?.display_name).toBe('مسؤول الاختبار');
    expect(tester?.role).toBe(USER_ROLES.OWNER);
    expect(tester?.pin).toBe('9999');

    expect(isAllowedAdminUsername('mobix_admin')).toBe(true);
    expect(isAllowedAdminUsername('test_admin')).toBe(true);
    expect(isAllowedAdminUsername('hacker')).toBe(false);
    expect(isAllowedAdminUsername('admin')).toBe(false);
  });

  test('زرع الحسابين في قاعدة البيانات بنجاح عند الإقلاع الأول', async () => {
    // إدخال مستخدم قديم مؤقت admin للتأكد من حذفه
    db.prepare(`
      INSERT INTO users (uuid, username, display_name, password_hash, role, is_active, created_at)
      VALUES ('legacy-uuid', 'admin', 'مدير النظام الرئيسي', 'hash', 'owner', 1, datetime('now'))
    `).run();

    const seededOwner = authService.seedDefaultOwnerIfNone();
    expect(seededOwner).not.toBeNull();
    expect(seededOwner?.username).toBe('mobix_admin');

    // التأكد من وجود الحسابين في قاعدة البيانات
    const allUsers = db.prepare('SELECT username, display_name, role, is_active FROM users').all() as any[];
    expect(allUsers).toHaveLength(2);

    const ownerDb = allUsers.find((u) => u.username === 'mobix_admin');
    expect(ownerDb).toBeDefined();
    expect(ownerDb?.role).toBe(USER_ROLES.OWNER);

    const testerDb = allUsers.find((u) => u.username === 'test_admin');
    expect(testerDb).toBeDefined();
    expect(testerDb?.role).toBe(USER_ROLES.OWNER);

    // التأكد من حذف admin القديم
    const oldAdmin = allUsers.find((u) => u.username === 'admin');
    expect(oldAdmin).toBeUndefined();

    // نجاح تسجيل الدخول بكلمة المرور وبالـ PIN لكلا الحسابين
    const ownerLogin = await authService.loginWithPasswordDetailed('mobix_admin', ownerDb ? (ALLOWED_ADMIN_ACCOUNTS.find(a => a.username === 'mobix_admin')?.password || 'Mobix@Admin2026') : 'Mobix@Admin2026');
    expect(ownerLogin.success).toBe(true);
    expect(ownerLogin.user?.display_name).toBe('مدير موبيكس');

    const ownerPinLogin = await authService.loginWithPinDetailed(ALLOWED_ADMIN_ACCOUNTS.find(a => a.username === 'mobix_admin')?.pin || '7777');
    expect(ownerPinLogin.success).toBe(true);
    expect(ownerPinLogin.user?.username).toBe('mobix_admin');

    const testAdminLogin = await authService.loginWithPasswordDetailed('test_admin', 'Test@Dev2026');
    expect(testAdminLogin.success).toBe(true);
    expect(testAdminLogin.user?.display_name).toBe('مسؤول الاختبار');

    const testAdminPinLogin = await authService.loginWithPinDetailed('9999');
    expect(testAdminPinLogin.success).toBe(true);
    expect(testAdminPinLogin.user?.username).toBe('test_admin');
  });

  test('منع إنشاء أو ترقية أي حساب آخر إلى رتبة مالك (Owner)', () => {
    // منع إنشاء حساب جديد برتبة مالك إذا لم يكن في القائمة المعتمدة
    expect(() => {
      authService.createUser({
        username: 'intruder',
        display_name: 'مخترق',
        password: 'pass',
        role: USER_ROLES.OWNER,
      });
    }).toThrow('غير مصرح بتعيين هذا الحساب كمدير/مالك');

    // إنشاء كاشير عادي ثم محاولة ترقيته إلى مالك
    const cashier = authService.createUser({
      username: 'cashier_samy',
      display_name: 'سامي كاشير',
      password: 'pass',
      role: USER_ROLES.CASHIER,
    });

    expect(() => {
      authService.updateUser(cashier.id, {
        role: USER_ROLES.OWNER,
      });
    }).toThrow('غير مصرح بترقية هذا المستخدم إلى مدير/مالك');
  });

  test('السماح بإنشاء كاشير ومدير صالة بصورة طبيعية', () => {
    const manager = authService.createUser({
      username: 'manager_hassan',
      display_name: 'حسن مدير الفرع',
      password: 'pass',
      pin: '3344',
      role: USER_ROLES.MANAGER,
    });
    expect(manager.role).toBe(USER_ROLES.MANAGER);

    const cashier = authService.createUser({
      username: 'cashier_nour',
      display_name: 'نور كاشير',
      password: 'pass',
      pin: '5566',
      role: USER_ROLES.CASHIER,
    });
    expect(cashier.role).toBe(USER_ROLES.CASHIER);
  });
});
