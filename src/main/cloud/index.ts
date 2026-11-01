/**
 * نقطة تصدير وحدة الخدمات السحابية والنسخ الاحتياطي المشفر
 */

export * from './env-loader';
export * from './supabase-client';
export * from './cloud-crypto';
export * from './license.service';
export * from './cloud-backup.service';
export * from './cloud-restore.service';
export * from './retry-queue.service';

import { loadCloudEnv } from './env-loader';
import { cloudLicenseService } from './license.service';
import { cloudBackupService } from './cloud-backup.service';
import { cloudRetryQueueService } from './retry-queue.service';

/**
 * تهيئة الخدمات السحابية غير المتزامنة عند إقلاع التطبيق
 * تفشل بصمت وأمان تام إذا كان الجهاز أوفلاين دون إعاقة أي عملية
 */
export async function initializeCloudFeatures(): Promise<void> {
  // 1. تحميل متغيرات البيئة من .env
  const config = loadCloudEnv();
  if (!config.isConfigured) {
    console.log('[Cloud] المتغيرات السحابية غير معينة (.env فارغ أو غير موجود) - النظام يعمل 100% أوفلاين');
    return;
  }

  console.log('[Cloud] جاري تهيئة الخدمات السحابية الاختيارية...');

  // 2. التحقق من الترخيص بالخلفية
  try {
    const status = await cloudLicenseService.verifyLicenseOnline();
    if (status.isOnline) {
      console.log(`[Cloud] حالة الترخيص: ${status.status} (${status.customerName || 'غير مسمى'})`);
    } else {
      console.log('[Cloud] الجهاز أوفلاين، تم اعتماد حالة الترخيص المحفوظة محلياً');
    }
  } catch (err) {
    console.warn('[Cloud] تعذر التحقق السحابي عند الإقلاع (أوفلاين):', err);
  }

  // 3. جدولة النسخ السحابي التلقائي
  try {
    cloudBackupService.setupAutoBackupScheduler();
  } catch (err) {
    console.warn('[Cloud] تعذر إعداد جدولة النسخ السحابي:', err);
  }

  // 4. تشغيل طابور إعادة المحاولة
  try {
    cloudRetryQueueService.startWorker();
  } catch (err) {
    console.warn('[Cloud] تعذر تشغيل طابور إعادة المحاولة:', err);
  }
}

