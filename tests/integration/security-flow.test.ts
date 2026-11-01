import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { runMigrations } from '../../src/main/db/migrator';
import { AuthService } from '../../src/main/services/auth.service';
import { RbacService } from '../../src/main/services/rbac.service';
import { BackupService } from '../../src/main/services/backup.service';
import { AuditService } from '../../src/main/services/audit.service';
import { SessionService } from '../../src/main/services/session.service';
import { PERMISSIONS } from '../../src/shared/constants/permissions';
import { USER_ROLES } from '../../src/shared/constants/roles';

describe('Security & Backup Integration Flow (سيناريو الأمان والرقابة المتكامل)', () => {
  let db: Database.Database;
  let auditService: AuditService;
  let sessionService: SessionService;
  let authService: AuthService;
  let rbacService: RbacService;
  let backupService: BackupService;
  let tempDir: string;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);

    auditService = new AuditService(db);
    sessionService = new SessionService();
    authService = new AuthService(db, auditService, sessionService);
    rbacService = new RbacService(db, sessionService, auditService, authService);
    backupService = new BackupService(db, auditService);

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cosmetics-security-test-'));
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('دورة أمان متكاملة: دخول كاشير -> طلب تفويض مدير -> اعتماد الخصم -> رصد تدقيق -> تجميد اختراق -> نسخ احتياطي', async () => {
    // 1. إنشاء الحسابات الأساسية
    const owner = authService.seedDefaultOwnerIfNone()!;
    expect(owner.username).toBe('mobix_admin');

    const manager = authService.createUser({
      username: 'manager_safwat',
      display_name: 'صفوت المدير',
      password: 'manager_pass',
      pin: '5566',
      role: USER_ROLES.MANAGER,
    });

    const cashier = authService.createUser({
      username: 'cashier_mona',
      display_name: 'منى كاشير',
      password: 'cashier_pass',
      pin: '7788',
      role: USER_ROLES.CASHIER,
    });

    // 2. الكاشير تسجل الدخول برمز الـ PIN
    const loginResult = await authService.loginWithPinDetailed('7788');
    expect(loginResult.success).toBe(true);
    expect(sessionService.getCurrentUserId()).toBe(cashier.id);

    // 3. الكاشير تحاول تطبيق خصم استثنائي مرتفع (مثلاً 15%)
    const discountAuth = rbacService.authorize(PERMISSIONS.POS_APPLY_DISCOUNT_HIGH);
    expect(discountAuth.allowed).toBe(false);
    expect(discountAuth.requiredOverride).toBe('manager_pin');

    // 4. المدير يتدخل ويدخل رمز PIN لاعتماد الخصم
    const override = await rbacService.authorizeWithOverridePin(
      PERMISSIONS.POS_APPLY_DISCOUNT_HIGH,
      '5566',
      cashier.id
    );
    expect(override.success).toBe(true);
    expect(override.authorizedBy).toBe('manager_safwat');

    // 5. محاولة اختراق: إدخال 5 كلمات مرور خاطئة لحساب الكاشير
    for (let i = 0; i < 5; i++) {
      await authService.loginWithPasswordDetailed('cashier_mona', 'wrong_guess');
    }

    // الحساب الآن أصبح مجمداً
    const lockedTry = await authService.loginWithPasswordDetailed('cashier_mona', 'cashier_pass');
    expect(lockedTry.success).toBe(false);
    expect(lockedTry.error).toContain('تجميد');

    // 6. المالك يأخذ نسخة احتياطية ذرية للنظام
    sessionService.setCurrentUser(owner);
    const backupResult = await backupService.createBackup(tempDir, owner.id);
    expect(fs.existsSync(backupResult.filePath)).toBe(true);

    // 7. التحقق من سلامة سجل التدقيق الأمني (Audit Log) واحتوائه على كل الحركات
    const { logs, total } = auditService.listLogs();
    expect(total).toBeGreaterThanOrEqual(5);

    const actions = logs.map((l) => l.action);
    expect(actions).toContain('LOGIN_PIN');
    expect(actions).toContain('SECURITY_OVERRIDE_GRANTED');
    expect(actions).toContain('SECURITY_ACCOUNT_LOCKED');
    expect(actions).toContain('BACKUP_CREATED');
  }, 30000);
});
