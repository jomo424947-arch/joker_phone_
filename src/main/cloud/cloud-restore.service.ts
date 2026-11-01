/**
 * خدمة استعادة النسخة الاحتياطية السحابية (Cloud Restore Service)
 * تدير: جلب رابط التحميل الموقع، تنزيل الملف، فك التشفير بـ AES-256-GCM،
 * فحص سلامة وتكامل البيانات (PRAGMA integrity_check)، عمل نسخة أمان محلية للقاعدة الحالية،
 * استبدال الملف وإعادة تشغيل التطبيق.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import Database from 'better-sqlite3';
import { getDatabase, closeDatabase, getDefaultDatabasePath } from '../db/connection';
import { getSupabaseClient, getCloudConfig } from './supabase-client';
import { cloudLicenseService } from './license.service';
import { decryptBackupBuffer } from './cloud-crypto';

export interface RestoreResult {
  success: boolean;
  message?: string;
  safetyCopyPath?: string;
  error?: string;
}

export class CloudRestoreService {
  /**
   * استعادة قاعدة البيانات من نسخة سحابية محددة
   */
  async restoreFromCloud(backupId: string): Promise<RestoreResult> {
    const config = getCloudConfig();
    if (!config.isConfigured) {
      return { success: false, error: 'الخدمات السحابية غير مهيأة (.env غير مضبوط)' };
    }

    const licenseStatus = cloudLicenseService.getLocalLicenseStatus();
    if (!licenseStatus.licenseId) {
      return { success: false, error: 'لا يوجد ترخيص معتمد لاستعادة النسخة' };
    }

    const client = getSupabaseClient();
    if (!client) {
      return { success: false, error: 'تعذر الاتصال بـ Supabase (أوفلاين)' };
    }

    const licenseId = licenseStatus.licenseId;
    const machineId = licenseStatus.machineId;

    try {
      // 1. طلب رابط التحميل الموقّع من الدالة السحابية get-backup-download-url
      const { data: downloadInfo, error: funcError } = await client.functions.invoke('get-backup-download-url', {
        body: {
          license_id: licenseId,
          machine_id: machineId,
          backup_id: backupId,
        },
      });

      if (funcError || !downloadInfo || !downloadInfo.download_url) {
        return {
          success: false,
          error: downloadInfo?.message || funcError?.message || 'فشل توليد رابط تحميل النسخة الموقّع',
        };
      }

      // 2. تنزيل محتوى الملف المشفر
      const downloadRes = await fetch(downloadInfo.download_url);
      if (!downloadRes.ok) {
        return {
          success: false,
          error: `فشل تنزيل ملف النسخة السحابية (كود الحالة: ${downloadRes.status})`,
        };
      }

      const arrayBuffer = await downloadRes.arrayBuffer();
      const encryptedBuffer = Buffer.from(arrayBuffer);

      // 3. فك التشفير وفك الضغط
      const decryptedDbBuffer = decryptBackupBuffer(encryptedBuffer, licenseId, machineId);

      // 4. كتابة الملف في مسار مؤقت لفحص سلامته
      const tempRestoredPath = path.join(
        os.tmpdir(),
        `mobix_restore_check_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.db`
      );
      fs.writeFileSync(tempRestoredPath, decryptedDbBuffer);

      // 5. فحص سلامة وتكامل النسخة المستعادة عبر PRAGMA integrity_check
      const testDb = new Database(tempRestoredPath, { readonly: true });
      try {
        const integrity = testDb.pragma('integrity_check') as { integrity_check: string }[];
        if (integrity[0]?.integrity_check !== 'ok') {
          throw new Error('فشل فحص سلامة وتكامل النسخة المستعادة (بيانات تالفة أو غير صالحة)');
        }
      } finally {
        testDb.close();
      }

      // 6. إنشاء نسخة أمان محلية احتياطية من قاعدة البيانات الحالية قبل الاستبدال
      const liveDbPath = getDefaultDatabasePath();
      const safetyCopyPath = `${liveDbPath}.safety_pre_restore_${Date.now()}.bak`;

      if (fs.existsSync(liveDbPath)) {
        fs.copyFileSync(liveDbPath, safetyCopyPath);
        console.log(`[CloudRestore] تم حفظ نسخة أمان محلية في: ${safetyCopyPath}`);
      }

      // 7. إغلاق الاتصال الحالي واستبدال ملف قاعدة البيانات
      closeDatabase();

      // حذف ملفات WAL و SHM القديمة لضمان بدء نظيف مع النسخة المستبدلة
      const walPath = `${liveDbPath}-wal`;
      const shmPath = `${liveDbPath}-shm`;
      if (fs.existsSync(walPath)) {
        try { fs.unlinkSync(walPath); } catch {}
      }
      if (fs.existsSync(shmPath)) {
        try { fs.unlinkSync(shmPath); } catch {}
      }

      // استبدال الملف الحي بالنسخة المستعادة
      fs.copyFileSync(tempRestoredPath, liveDbPath);

      // تنظيف الملف المؤقت
      try { fs.unlinkSync(tempRestoredPath); } catch {}

      console.log('[CloudRestore] تمت استعادة قاعدة البيانات بنجاح، جاري إعادة تشغيل التطبيق...');

      // 8. إعادة تشغيل التطبيق تلقائياً
      setTimeout(() => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { app } = require('electron');
          if (app && typeof app.relaunch === 'function') {
            app.relaunch();
            app.exit(0);
          }
        } catch (err) {
          console.warn('[CloudRestore] يرجى إعادة تشغيل التطبيق يدوياً:', err);
        }
      }, 1000);

      return {
        success: true,
        message: 'تمت استعادة البيانات بنجاح، جاري إعادة تشغيل النظام...',
        safetyCopyPath,
      };
    } catch (err: any) {
      console.error('[CloudRestore] فشل استعادة النسخة السحابية:', err);
      return {
        success: false,
        error: err.message || 'حدث خطأ غير متوقع أثناء استعادة النسخة السحابية',
      };
    }
  }
}

export const cloudRestoreService = new CloudRestoreService();

