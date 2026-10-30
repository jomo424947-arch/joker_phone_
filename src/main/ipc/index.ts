/**
 * نقطة تسجيل جميع معالجات IPC مع تأكيد الحماية والتحقق
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants/ipc-channels';
import { registerAuthIpcHandlers } from './handlers/auth.ipc';
import { registerUsersIpcHandlers } from './handlers/users.ipc';
import { registerAuditIpcHandlers } from './handlers/audit.ipc';
import { registerProductsIpcHandlers } from './handlers/products.ipc';
import { registerSalesIpcHandlers } from './handlers/sales.ipc';
import { registerInventoryIpcHandlers } from './handlers/inventory.ipc';
import { registerPurchasesIpcHandlers } from './handlers/purchases.ipc';
import { registerCustomersIpcHandlers } from './handlers/customers.ipc';
import { registerReturnsIpcHandlers } from './handlers/returns.ipc';
import { registerCashIpcHandlers } from './handlers/cash.ipc';
import { registerReportsIpcHandlers } from './handlers/reports.ipc';
import { registerSettingsIpcHandlers } from './handlers/settings.ipc';
import { registerBackupIpcHandlers } from './handlers/backup.ipc';
import { registerDbInspectorIpcHandlers } from './handlers/db-inspector.ipc';
import { registerRepairsIpcHandlers } from './handlers/repairs.ipc';
import { registerSerialsIpcHandlers } from './handlers/serials.ipc';
import { autoLockService } from '../services/autolock.service';

export function registerAllIpcHandlers(): void {
  registerAuthIpcHandlers();
  registerUsersIpcHandlers();
  registerAuditIpcHandlers();
  registerProductsIpcHandlers();
  registerSalesIpcHandlers();
  registerInventoryIpcHandlers();
  registerPurchasesIpcHandlers();
  registerCustomersIpcHandlers();
  registerReturnsIpcHandlers();
  registerCashIpcHandlers();
  registerReportsIpcHandlers();
  registerSettingsIpcHandlers();
  registerBackupIpcHandlers();
  registerDbInspectorIpcHandlers();
  registerRepairsIpcHandlers();
  registerSerialsIpcHandlers();

  // معالجات قفل الشاشة والنشاط
  ipcMain.handle(IPC_CHANNELS.SYSTEM_LOCK, () => {
    autoLockService.lock();
    return { success: true, isLocked: true };
  });

  ipcMain.handle(IPC_CHANNELS.SYSTEM_UNLOCK, () => {
    autoLockService.unlock();
    return { success: true, isLocked: false };
  });

  ipcMain.on(IPC_CHANNELS.SYSTEM_ACTIVITY, () => {
    autoLockService.recordActivity();
  });
}
