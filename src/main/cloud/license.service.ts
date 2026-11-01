/**
 * خدمة إدارة والتحقق من التراخيص السحابية (License Service)
 * - تتحقق من الترخيص عند إقلاع التطبيق أونلاين
 * - تدعم العمل أوفلاين بالكامل 100% بالاعتماد على الحالة المحلية المحفوظة
 * - تطبق فترة سماح (Grace Period) مدتها 30 يوماً عند الإلغاء أو انتهاء الصلاحية
 * - لا تعطل نقطة البيع (POS) إطلاقاً تحت أي ظرف
 */

import os from 'os';
import crypto from 'crypto';
import type Database from 'better-sqlite3';
import { getDatabase } from '../db/connection';
import { getSupabaseClient, getCloudConfig } from './supabase-client';

export interface LicenseStatusResult {
  isConfigured: boolean;
  isOnline: boolean;
  isValid: boolean;
  licenseId: string | null;
  customerName: string | null;
  customerEmail?: string | null;
  machineId: string;
  status: 'active' | 'revoked' | 'unlicensed';
  features: string[];
  updatesUntil: string | null;
  hasCloudBackupFeature: boolean;
  inGracePeriod: boolean;
  graceDaysRemaining: number;
  lastVerifiedAt: string | null;
  message?: string;
}

export class CloudLicenseService {
  private db?: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db;
  }

  private getDb(): Database.Database {
    return this.db ?? getDatabase();
  }

  /**
   * جلب إعداد من جدول الإعدادات
   */
  private getSetting(key: string): string | null {
    try {
      const db = this.getDb();
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
      return row?.value ?? null;
    } catch {
      return null;
    }
  }

  /**
   * حفظ إعداد في جدول الإعدادات
   */
  private setSetting(key: string, value: string): void {
    try {
      const db = this.getDb();
      db.prepare(`
        INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `).run(key, value);
    } catch (err) {
      console.warn(`[License] تعذر حفظ الإعداد ${key}:`, err);
    }
  }

  /**
   * توليد معرف جهاز ثابت وفريد للكمبيوتر الحالي (Machine Fingerprint)
   */
  getMachineId(): string {
    const existing = this.getSetting('cloud_machine_id');
    if (existing && existing.trim()) {
      return existing.trim();
    }

    try {
      const host = os.hostname() || 'unknown-host';
      const user = os.userInfo()?.username || 'user';
      const cpus = os.cpus()?.[0]?.model || 'cpu';
      const platform = os.platform();
      const arch = os.arch();

      const raw = `${host}:${user}:${cpus}:${platform}:${arch}`;
      const hash = crypto.createHash('sha256').update(raw).digest('hex').toUpperCase();
      const formatted = `JKR-${hash.slice(0, 4)}-${hash.slice(4, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}`;

      this.setSetting('cloud_machine_id', formatted);
      return formatted;
    } catch {
      const fallback = `JKR-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
      this.setSetting('cloud_machine_id', fallback);
      return fallback;
    }
  }

  /**
   * حفظ مفتاح الترخيص محلياً في الإعدادات
   */
  setLicenseId(licenseId: string): void {
    this.setSetting('cloud_license_id', licenseId.trim());
  }

  /**
   * جلب مفتاح الترخيص الحالي المحفوظ
   */
  getLicenseId(): string | null {
    return this.getSetting('cloud_license_id');
  }

  /**
   * فحص فترة السماح (30 يوماً)
   */
  private evaluateGracePeriod(
    status: 'active' | 'revoked',
    updatesUntil: string | null
  ): { inGracePeriod: boolean; graceDaysRemaining: number; isAllowed: boolean } {
    const now = Date.now();
    const MS_PER_DAY = 24 * 60 * 60 * 1000;

    // 1. إذا كان الترخيص ملغياً (Revoked)
    if (status === 'revoked') {
      let firstRevokedStr = this.getSetting('cloud_first_revoked_at');
      if (!firstRevokedStr) {
        firstRevokedStr = new Date().toISOString();
        this.setSetting('cloud_first_revoked_at', firstRevokedStr);
      }

      const firstRevokedMs = new Date(firstRevokedStr).getTime();
      const elapsedDays = (now - firstRevokedMs) / MS_PER_DAY;

      if (elapsedDays <= 30) {
        const remaining = Math.max(0, Math.ceil(30 - elapsedDays));
        return { inGracePeriod: true, graceDaysRemaining: remaining, isAllowed: true };
      }

      return { inGracePeriod: false, graceDaysRemaining: 0, isAllowed: false };
    }

    // 2. إذا كان الترخيص منتهي الصلاحية (Expired updates_until)
    if (updatesUntil) {
      const expiryMs = new Date(updatesUntil).getTime();
      if (now > expiryMs) {
        const elapsedDays = (now - expiryMs) / MS_PER_DAY;
        if (elapsedDays <= 30) {
          const remaining = Math.max(0, Math.ceil(30 - elapsedDays));
          return { inGracePeriod: true, graceDaysRemaining: remaining, isAllowed: true };
        }
        return { inGracePeriod: false, graceDaysRemaining: 0, isAllowed: false };
      }
    }

    // الترخيص نشط وساري
    return { inGracePeriod: false, graceDaysRemaining: 30, isAllowed: true };
  }

  /**
   * جلب الحالة الحالية محلياً (Offline Local State)
   */
  getLocalLicenseStatus(): LicenseStatusResult {
    const config = getCloudConfig();
    const machineId = this.getMachineId();
    const licenseId = this.getLicenseId();

    if (!licenseId) {
      return {
        isConfigured: config.isConfigured,
        isOnline: false,
        isValid: false,
        licenseId: null,
        customerName: null,
        customerEmail: null,
        machineId,
        status: 'unlicensed',
        features: [],
        updatesUntil: null,
        hasCloudBackupFeature: false,
        inGracePeriod: false,
        graceDaysRemaining: 0,
        lastVerifiedAt: this.getSetting('cloud_last_verified_at'),
        message: !config.isConfigured
          ? 'الخدمات السحابية غير مهيأة (.env غير مكتمل)'
          : 'لم يتم إدخال حساب الترخيص بعد',
      };
    }

    const localStatus = (this.getSetting('cloud_license_status') as 'active' | 'revoked') || 'active';
    const customerName = this.getSetting('cloud_customer_name');
    const customerEmail = this.getSetting('cloud_customer_email');
    const featuresStr = this.getSetting('cloud_features') || '';
    const features = featuresStr ? featuresStr.split(',').map((f) => f.trim()).filter(Boolean) : [];
    const updatesUntil = this.getSetting('cloud_updates_until');
    const lastVerifiedAt = this.getSetting('cloud_last_verified_at');

    const grace = this.evaluateGracePeriod(localStatus, updatesUntil);

    return {
      isConfigured: config.isConfigured,
      isOnline: false,
      isValid: grace.isAllowed,
      licenseId,
      customerName,
      customerEmail,
      machineId,
      status: localStatus,
      features,
      updatesUntil,
      hasCloudBackupFeature: features.includes('cloud_backup'),
      inGracePeriod: grace.inGracePeriod,
      graceDaysRemaining: grace.graceDaysRemaining,
      lastVerifiedAt,
      message: grace.inGracePeriod
        ? `أنت في فترة السماح (متبقي ${grace.graceDaysRemaining} يوماً)`
        : undefined,
    };
  }

  /**
   * التحقق من الترخيص مع خادم Supabase
   * في حال عدم وجود اتصال، يعود فوراً إلى الحالة المحلية دون تعطيل شيء
   */
  async verifyLicenseOnline(customLicenseId?: string): Promise<LicenseStatusResult> {
    const config = getCloudConfig();
    const machineId = this.getMachineId();
    const licenseId = (customLicenseId || this.getLicenseId() || '').trim();

    if (!config.isConfigured) {
      return this.getLocalLicenseStatus();
    }

    if (!licenseId) {
      return this.getLocalLicenseStatus();
    }

    const client = getSupabaseClient();
    if (!client) {
      return this.getLocalLicenseStatus();
    }

    try {
      let data: any = null;
      let error: any = null;

      // 1. الاستدعاء المباشر عبر قاعدة البيانات (RPC) وهو الأسرع والأكثر اعتمادية
      try {
        const rpcRes = await client.rpc('verify_license', {
          p_license_key: licenseId,
          p_machine_id: machineId,
        });
        if (rpcRes.data) {
          data = rpcRes.data;
          error = null;
        } else if (rpcRes.error) {
          error = rpcRes.error;
        }
      } catch (e: any) {
        error = e;
      }

      // 2. إذا لم تكن دالة RPC متاحة، المحاولة عبر الدالة السحابية Edge Function
      if (error || !data) {
        try {
          const fnRes = await client.functions.invoke('verify-license', {
            body: {
              license_id: licenseId,
              machine_id: machineId,
            },
          });
          if (fnRes.data) {
            data = fnRes.data;
            error = null;
          }
        } catch {
          // تجاهل
        }
      }

      // 3. محاولة مباشرة احتياطية عبر قراءة جدول licenses في Supabase
      if (error || !data) {
        try {
          const isEmail = licenseId.includes('@');
          let q = client.from('licenses').select('*');
          if (isEmail) {
            q = q.ilike('customer_email', licenseId);
          } else {
            q = q.or(`license_key.eq.${licenseId},id.eq.${licenseId}`);
          }
          const { data: row, error: qErr } = await q.maybeSingle();
          if (row && !qErr) {
            if (row.status === 'revoked') {
              data = {
                error: 'LICENSE_REVOKED',
                status: 'revoked',
                updates_until: row.updates_until,
                message: 'هذا الحساب تم إيقافه من قبل الإدارة.',
              };
            } else if (!row.machine_id || row.machine_id === machineId) {
              data = {
                valid: true,
                license_id: row.id,
                license_key: row.license_key,
                customer_name: row.customer_name,
                customer_email: row.customer_email,
                machine_id: machineId,
                features: row.features,
                updates_until: row.updates_until,
                status: row.status,
              };
            } else {
              data = {
                error: 'MACHINE_MISMATCH',
                message: 'هذا الحساب مفعل بالفعل على جهاز كمبيوتر آخر. يرجى التواصل مع الإدارة لفك ربط الجهاز القديم.',
              };
            }
            error = null;
          }
        } catch {
          // تجاهل
        }
      }

      if (error || !data) {
        // فشل الاتصال بالإنترنت أو خطأ في الدالة: الاستمرار بالحالة المحلية
        console.warn('[Cloud] تعذر الاتصال بـ verify-license، استخدام الحالة المحلية:', error?.message);
        const local = this.getLocalLicenseStatus();
        local.isOnline = false;
        return local;
      }

      if (data.error) {
        if (data.status === 'revoked' || data.error === 'LICENSE_REVOKED') {
          this.setSetting('cloud_license_status', 'revoked');
          const grace = this.evaluateGracePeriod('revoked', data.updates_until || null);
          return {
            isConfigured: true,
            isOnline: true,
            isValid: grace.isAllowed,
            licenseId,
            customerName: this.getSetting('cloud_customer_name'),
            customerEmail: this.getSetting('cloud_customer_email'),
            machineId,
            status: 'revoked',
            features: [],
            updatesUntil: data.updates_until || null,
            hasCloudBackupFeature: false,
            inGracePeriod: grace.inGracePeriod,
            graceDaysRemaining: grace.graceDaysRemaining,
            lastVerifiedAt: new Date().toISOString(),
            message: grace.inGracePeriod
              ? `تم إلغاء الترخيص، فترة السماح جارية (${grace.graceDaysRemaining} يوماً)`
              : 'تم إلغاء الترخيص وتجاوزت فترة السماح',
          };
        }

        return {
          isConfigured: true,
          isOnline: true,
          isValid: false,
          licenseId,
          customerName: null,
          customerEmail: null,
          machineId,
          status: 'unlicensed',
          features: [],
          updatesUntil: null,
          hasCloudBackupFeature: false,
          inGracePeriod: false,
          graceDaysRemaining: 0,
          lastVerifiedAt: new Date().toISOString(),
          message: data.message || 'فشل التحقق من الترخيص',
        };
      }

      // ترخيص صحيح وناجح: تحديث السجل المحلي
      const finalLicenseId = data.license_id || licenseId;
      this.setSetting('cloud_license_id', finalLicenseId);
      this.setSetting('cloud_customer_name', data.customer_name || '');
      if (data.customer_email || (licenseId && licenseId.includes('@'))) {
        this.setSetting('cloud_customer_email', data.customer_email || licenseId);
      }
      if (data.license_key) {
        this.setSetting('cloud_license_key', data.license_key);
      }
      this.setSetting('cloud_license_status', data.status || 'active');
      this.setSetting('cloud_features', Array.isArray(data.features) ? data.features.join(',') : '');
      this.setSetting('cloud_updates_until', data.updates_until || '');
      this.setSetting('cloud_last_verified_at', new Date().toISOString());

      // تصفير مؤقت الإلغاء إذا عاد نشطاً
      try {
        const db = this.getDb();
        db.prepare("DELETE FROM settings WHERE key = 'cloud_first_revoked_at'").run();
      } catch {
        // تجاهل
      }

      const features: string[] = Array.isArray(data.features) ? data.features : [];
      const grace = this.evaluateGracePeriod(data.status, data.updates_until);

      return {
        isConfigured: true,
        isOnline: true,
        isValid: grace.isAllowed,
        licenseId: finalLicenseId,
        customerName: data.customer_name,
        customerEmail: data.customer_email || this.getSetting('cloud_customer_email'),
        machineId,
        status: data.status,
        features,
        updatesUntil: data.updates_until,
        hasCloudBackupFeature: features.includes('cloud_backup'),
        inGracePeriod: grace.inGracePeriod,
        graceDaysRemaining: grace.graceDaysRemaining,
        lastVerifiedAt: new Date().toISOString(),
        message: grace.inGracePeriod
          ? `فترة السماح نشطة (متبقي ${grace.graceDaysRemaining} يوماً)`
          : undefined,
      };
    } catch (networkErr: any) {
      console.warn('[Cloud] خطأ في شبكة التحقق من الترخيص، استمرار العمل أوفلاين:', networkErr.message);
      const local = this.getLocalLicenseStatus();
      local.isOnline = false;
      return local;
    }
  }
}

export const cloudLicenseService = new CloudLicenseService();
