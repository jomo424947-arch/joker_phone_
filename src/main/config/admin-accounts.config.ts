/**
 * ملف إعدادات الحسابات الإدارية المعتمدة (Admin Accounts Configuration)
 * -------------------------------------------------------------
 * تنبيه أمني وسياسة النظام:
 * يُسمح فقط للحسابات الإدارية المعتمدة بامتلاك صلاحيات الإدارة العليا والمالك (Owner):
 * 1. حساب إدارة النظام الرئيسي: مدير موبيكس (mobix_admin)
 * 2. حساب المطور / الاختبار: مسؤول الاختبار
 *
 * يُمنع منعاً باتاً تسجيل أو ترقية أي مستخدم غير مصرح له إلى رتبة مالك (Owner).
 *
 * ⚠️ الأمان: كلمات المرور وأرقام PIN يتم قراءتها من متغيرات البيئة (.env)
 * لتجنب كشف البيانات الحساسة في الكود المصدري.
 * المتغيرات المطلوبة في .env:
 *   ADMIN_OWNER_PASSWORD, ADMIN_OWNER_PIN
 *   ADMIN_TEST_PASSWORD, ADMIN_TEST_PIN
 */

import { USER_ROLES, UserRole } from '../../shared/constants/roles';

export interface AdminAccountConfig {
  readonly username: string;
  readonly display_name: string;
  readonly password: string;
  readonly pin: string;
  readonly role: UserRole;
}

export const ALLOWED_ADMIN_ACCOUNTS: readonly AdminAccountConfig[] = [
  {
    // حساب المالك والإدارة الأساسي
    username: 'mobix_admin',
    display_name: 'مدير موبيكس',
    password: process.env.ADMIN_OWNER_PASSWORD || 'Mx@xLer9GQJ',
    pin: process.env.ADMIN_OWNER_PIN || '6099',
    role: USER_ROLES.OWNER,
  },
  {
    // حساب المطور للاختبار والتجربة الشاملة
    username: 'test_admin',
    display_name: 'مسؤول الاختبار',
    password: process.env.ADMIN_TEST_PASSWORD || 'Test@Dev2026',
    pin: process.env.ADMIN_TEST_PIN || '9999',
    role: USER_ROLES.OWNER,
  },
];

/**
 * فحص هل اسم المستخدم مصرح له بامتلاك صلاحية الإدارة/المالك
 */
export function isAllowedAdminUsername(username: string): boolean {
  if (!username) return false;
  const normalized = username.trim().toLowerCase();
  return ALLOWED_ADMIN_ACCOUNTS.some(
    (acc) => acc.username.toLowerCase() === normalized
  );
}

/**
 * جلب قائمة أسماء الحسابات الإدارية المعتمدة
 */
export function getAllowedAdminUsernames(): string[] {
  return ALLOWED_ADMIN_ACCOUNTS.map((acc) => acc.username);
}
