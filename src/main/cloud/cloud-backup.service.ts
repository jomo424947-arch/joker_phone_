/**
 * خدمة النسخ الاحتياطي السحابي المشفر (Cloud Backup Service)
 * تدير: أخذ لقطة ذرية بـ VACUUM INTO، ضغط Gzip، تشفير AES-256-GCM،
 * طلب الرابط الموقع، رفع الملف المشفر، وتطبيق سياسة الاحتفاظ بـ N نسخ.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import type Database from 'better-sqlite3';
import { getDatabase } from '../db/connection';
import { getSupabaseClient, getCloudConfig } from './supabase-client';
import { cloudLicenseService } from './license.service';
import { encryptBackupBuffer } from './cloud-crypto';
import { cloudRetryQueueService } from './retry-queue.service';

export interface CloudBackupItem {
  id: string;
  license_id: string;
  created_at: string;
  size_bytes: number;
  storage_path: string;
  app_version?: string | null;
}

export interface CloudBackupResult {
  success: boolean;
  backupId?: string;
  createdAt?: string;
  sizeBytes?: number;
  error?: string;
  enqueued?: boolean;
}

export class CloudBackupService {
  private db?: Database.Database;
  private autoBackupTimer: NodeJS.Timeout | null = null;

  constructor(db?: Database.Database) {
    this.db = db;
    // ربط منفذ إعادة المحاولة بطابور المهام
    cloudRetryQueueService.setBackupExecutor(async () => {
      const res = await this.performBackup(false);
      return res.success;
    });
  }

  private getDb(): Database.Database {
    return this.db ?? getDatabase();
  }

  /**
   * جلب إصدار التطبيق الحالي
   */
  private getAppVersion(): string {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { app } = require('electron');
      if (app && typeof app.getVersion === 'function') {
        return app.getVersion();
      }
    } catch {
      // بيئة الاختبار
    }
    return '2.0.0';
  }

  /**
   * قراءة إعداد الاحتفاظ بعدد النسخ (الافتراضي: 7)
   */
  getRetentionCount(): number {
    try {
      const db = this.getDb();
      const row = db
        .prepare("SELECT value FROM settings WHERE key = 'cloud_backup_retention_count'")
        .get() as { value: string } | undefined;
      const count = parseInt(row?.value || '7', 10);
      return isNaN(count) || count < 1 ? 7 : count;
    } catch {
      return 7;
    }
  }

  /**
   * فحص هل النسخ السحابي التلقائي مفعل
   */
  isAutoBackupEnabled(): boolean {
    try {
      const db = this.getDb();
      const row = db
        .prepare("SELECT value FROM settings WHERE key = 'cloud_auto_backup_enabled'")
        .get() as { value: string } | undefined;
      return row?.value === '1' || row?.value === 'true';
    } catch {
      return false;
    }
  }

  /**
   * ضبط تفعيل أو إيقاف النسخ السحابي التلقائي
   */
  setAutoBackup(enabled: boolean, intervalHours: number = 24): void {
    const db = this.getDb();
    const val = enabled ? '1' : '0';
    db.prepare(`
      INSERT INTO settings (key, value, updated_at) VALUES ('cloud_auto_backup_enabled', ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(val);

    db.prepare(`
      INSERT INTO settings (key, value, updated_at) VALUES ('cloud_auto_backup_interval_hours', ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(intervalHours.toString());

    this.setupAutoBackupScheduler();
  }

  /**
   * إعداد وتشغيل جدول النسخ السحابي التلقائي الدوري
   */
  setupAutoBackupScheduler(): void {
    if (this.autoBackupTimer) {
      clearInterval(this.autoBackupTimer);
      this.autoBackupTimer = null;
    }

    if (!this.isAutoBackupEnabled()) return;

    let intervalHours = 24;
    try {
      const db = this.getDb();
      const row = db
        .prepare("SELECT value FROM settings WHERE key = 'cloud_auto_backup_interval_hours'")
        .get() as { value: string } | undefined;
      if (row?.value) {
        const parsed = parseInt(row.value, 10);
        if (!isNaN(parsed) && parsed > 0) intervalHours = parsed;
      }
    } catch {
      // تجاهل
    }

    const intervalMs = intervalHours * 60 * 60 * 1000;
    this.autoBackupTimer = setInterval(() => {
      this.performBackup(true).catch((err) => {
        console.warn('[CloudBackup] خطأ في النسخ الدوري:', err);
      });
    }, intervalMs);
  }

  /**
   * أخذ لقطة ذرية آمنة لقاعدة البيانات بواسطة VACUUM INTO
   */
  private takeSafeDatabaseSnapshot(): Buffer {
    const db = this.getDb();
    const tempDir = os.tmpdir();
    const tempSnapshotPath = path.join(tempDir, `mobix_cloud_snap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.db`);

    try {
      db.exec(`VACUUM INTO '${tempSnapshotPath.replace(/'/g, "''")}'`);
      const buffer = fs.readFileSync(tempSnapshotPath);
      return buffer;
    } finally {
      if (fs.existsSync(tempSnapshotPath)) {
        try {
          fs.unlinkSync(tempSnapshotPath);
        } catch {
          // تنظيف هادئ
        }
      }
    }
  }

  /**
   * تنفيذ النسخ الاحتياطي السحابي الكامل
   */
  async performBackup(enqueueOnFailure: boolean = true): Promise<CloudBackupResult> {
    const config = getCloudConfig();
    if (!config.isConfigured) {
      return { success: false, error: 'الخدمات السحابية غير مهيأة (.env غير مضبوط)' };
    }

    const licenseStatus = await cloudLicenseService.verifyLicenseOnline();
    if (!licenseStatus.isValid || !licenseStatus.licenseId) {
      return {
        success: false,
        error: licenseStatus.message || 'الترخيص غير صالح أو غير مفعّل',
      };
    }

    if (!licenseStatus.hasCloudBackupFeature) {
      return {
        success: false,
        error: 'ميزة النسخ الاحتياطي السحابي غير مشمولة في باقة ترخيصك الحالية',
      };
    }

    const client = getSupabaseClient();
    if (!client) {
      if (enqueueOnFailure) {
        cloudRetryQueueService.enqueue('backup');
        return { success: false, enqueued: true, error: 'تعذر الاتصال بـ Supabase، تم حفظ العملية لإعادة المحاولة' };
      }
      return { success: false, error: 'تعذر تهيئة اتصال Supabase' };
    }

    const machineId = licenseStatus.machineId;
    const licenseId = licenseStatus.licenseId;

    try {
      // 1. أخذ لقطة ذرية من قاعدة البيانات الحالية
      const dbBuffer = this.takeSafeDatabaseSnapshot();

      // 2. ضغط وتشفير الملف بـ AES-256-GCM
      const encryptedBuffer = encryptBackupBuffer(dbBuffer, licenseId, machineId);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const fileName = `mobix_backup_${timestamp}.db.gz.enc`;
      const retentionCount = this.getRetentionCount();
      const appVersion = this.getAppVersion();

      // 3. طلب الرابط الموقّع من دالة create-backup-upload-url
      const { data: uploadInfo, error: funcError } = await client.functions.invoke('create-backup-upload-url', {
        body: {
          license_id: licenseId,
          machine_id: machineId,
          file_name: fileName,
          size_bytes: encryptedBuffer.length,
          app_version: appVersion,
          retention_count: retentionCount,
        },
      });

      if (funcError || !uploadInfo || !uploadInfo.signed_url) {
        const errorMsg = uploadInfo?.message || funcError?.message || 'فشل الحصول على رابط الرفع الموقّع';
        if (enqueueOnFailure) {
          cloudRetryQueueService.enqueue('backup');
          return { success: false, enqueued: true, error: errorMsg };
        }
        return { success: false, error: errorMsg };
      }

      // 4. رفع الملف المشفر إلى Supabase Storage عبر الرابط الموقّع (Signed URL)
      const uploadRes = await fetch(uploadInfo.signed_url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        body: new Uint8Array(encryptedBuffer),
      });

      if (!uploadRes.ok) {
        const statusText = uploadRes.statusText || `${uploadRes.status}`;
        const errorMsg = `فشل رفع الملف المشفر إلى التخزين السحابي (${statusText})`;
        if (enqueueOnFailure) {
          cloudRetryQueueService.enqueue('backup');
          return { success: false, enqueued: true, error: errorMsg };
        }
        return { success: false, error: errorMsg };
      }

      // 5. تسجيل وقت النسخ الناجح في الإعدادات المحلية
      const nowIso = new Date().toISOString();
      const db = this.getDb();
      try {
        db.prepare(`
          INSERT INTO settings (key, value, updated_at) VALUES ('last_cloud_backup', ?, datetime('now'))
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        `).run(nowIso);
      } catch {
        // تجاهل
      }

      console.log(`[CloudBackup] تم رفع النسخة الاحتياطية بنجاح (${encryptedBuffer.length} بايت)`);

      return {
        success: true,
        backupId: uploadInfo.backup_id,
        createdAt: uploadInfo.created_at || nowIso,
        sizeBytes: encryptedBuffer.length,
      };
    } catch (err: any) {
      console.warn('[CloudBackup] فشل إنشاء النسخة السحابية:', err.message);
      if (enqueueOnFailure) {
        cloudRetryQueueService.enqueue('backup');
        return {
          success: false,
          enqueued: true,
          error: `انقطع الاتصال، تم حفظ النسخة للمحاولة تلقائياً عند عودة الإنترنت (${err.message})`,
        };
      }
      return { success: false, error: err.message };
    }
  }

  /**
   * جلب قائمة النسخ السحابية التابعة لهذا الترخيص حصراً
   */
  async listCloudBackups(): Promise<{ success: boolean; backups?: CloudBackupItem[]; error?: string }> {
    const config = getCloudConfig();
    if (!config.isConfigured) {
      return { success: false, error: 'الخدمات السحابية غير مهيأة (.env غير مضبوط)' };
    }

    const licenseStatus = cloudLicenseService.getLocalLicenseStatus();
    if (!licenseStatus.licenseId) {
      return { success: false, error: 'لا يوجد ترخيص مسجل لعرض نسخه' };
    }

    const client = getSupabaseClient();
    if (!client) {
      return { success: false, error: 'تعذر الاتصال بـ Supabase (أوفلاين)' };
    }

    try {
      const { data, error } = await client.functions.invoke('list-backups', {
        body: {
          license_id: licenseStatus.licenseId,
          machine_id: licenseStatus.machineId,
        },
      });

      if (error || !data) {
        return {
          success: false,
          error: data?.message || error?.message || 'فشل جلب قائمة النسخ السحابية',
        };
      }

      if (data.error) {
        return { success: false, error: data.message || data.error };
      }

      return {
        success: true,
        backups: data.backups || [],
      };
    } catch (err: any) {
      return { success: false, error: `تعذر الاتصال بالخادم: ${err.message}` };
    }
  }
}

export const cloudBackupService = new CloudBackupService();
