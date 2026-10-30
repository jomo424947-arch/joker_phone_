/**
 * معالجات IPC لتتبع أرقام المسلسلات و IMEI (Serials IPC Handlers)
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/constants/ipc-channels';
import { serialsService } from '../../services/serials.service';
import { sessionService } from '../../services/session.service';
import {
  CreateDeviceSerialInput,
  DeviceSerialFilters,
  DeviceSerialStatus,
} from '../../../shared/types/serials.types';

export function registerSerialsIpcHandlers(): void {
  // قائمة السيريالات
  ipcMain.handle(
    IPC_CHANNELS.SERIALS_LIST,
    async (_event, filters?: DeviceSerialFilters) => {
      try {
        const data = await serialsService.list(filters);
        return { success: true, data };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  // بحث سريع بالسيريال أو IMEI
  ipcMain.handle(IPC_CHANNELS.SERIALS_SEARCH, async (_event, query: string) => {
    try {
      const data = await serialsService.search(query);
      return { success: true, data };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // تسجيل سيريال جديد
  ipcMain.handle(
    IPC_CHANNELS.SERIALS_CREATE,
    async (
      _event,
      params: { input: CreateDeviceSerialInput; userId?: number }
    ) => {
      try {
        const effectiveUserId = params.userId || sessionService.getCurrentUserId() || 1;
        const data = await serialsService.create(params.input, effectiveUserId);
        return { success: true, data };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  // تحديث حالة السيريال
  ipcMain.handle(
    IPC_CHANNELS.SERIALS_UPDATE_STATUS,
    async (
      _event,
      params: { id: number; status: DeviceSerialStatus; saleItemId?: number }
    ) => {
      try {
        await serialsService.updateStatus(params.id, params.status, params.saleItemId);
        return { success: true };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );
}
