/**
 * معالجات IPC للخدمات السحابية والترخيص والنسخ الاحتياطي المشفر
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/constants/ipc-channels';
import {
  cloudLicenseService,
  cloudBackupService,
  cloudRestoreService,
} from '../../cloud';

export function registerCloudIpcHandlers(): void {
  // 1. جلب حالة الترخيص والاتصال السحابي
  ipcMain.handle(IPC_CHANNELS.CLOUD_GET_STATUS, async () => {
    try {
      const status = cloudLicenseService.getLocalLicenseStatus();
      return { success: true, data: status };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // 2. التحقق من الترخيص أونلاين وتحديث البيانات
  ipcMain.handle(IPC_CHANNELS.CLOUD_VERIFY_LICENSE, async (_event, licenseKey?: string) => {
    try {
      const status = await cloudLicenseService.verifyLicenseOnline(licenseKey);
      return { success: true, data: status };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // 3. أخذ نسخة احتياطية سحابية مشفرة فوراً
  ipcMain.handle(IPC_CHANNELS.CLOUD_BACKUP_NOW, async () => {
    try {
      const result = await cloudBackupService.performBackup(true);
      return { success: result.success, data: result, error: result.error };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // 4. جلب قائمة النسخ السحابية التابعة للترخيص
  ipcMain.handle(IPC_CHANNELS.CLOUD_LIST_BACKUPS, async () => {
    try {
      const result = await cloudBackupService.listCloudBackups();
      return result;
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // 5. استعادة قاعدة البيانات من نسخة سحابية محددة
  ipcMain.handle(IPC_CHANNELS.CLOUD_RESTORE, async (_event, backupId: string) => {
    try {
      if (!backupId || typeof backupId !== 'string') {
        throw new Error('معرف النسخة الاحتياطية مطلوب للاستعادة');
      }
      const result = await cloudRestoreService.restoreFromCloud(backupId);
      return result;
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // 6. تفعيل أو تعديل جدولة النسخ السحابي التلقائي
  ipcMain.handle(
    IPC_CHANNELS.CLOUD_SET_AUTO_BACKUP,
    async (_event, payload: { enabled: boolean; intervalHours?: number }) => {
      try {
        const { enabled, intervalHours } = payload;
        cloudBackupService.setAutoBackup(enabled, intervalHours ?? 24);
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
  );
}

