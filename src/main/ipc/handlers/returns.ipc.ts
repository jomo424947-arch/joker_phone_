/**
 * معالجات IPC للمرتجعات والاستبدال
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/constants/ipc-channels';
import { returnsService } from '../../services/returns.service';
import { sessionService } from '../../services/session.service';
import { CreateReturnInput, ExchangeInput } from '../../../shared/types/returns.types';

export function registerReturnsIpcHandlers(): void {
  // إنشاء مرتجع
  ipcMain.handle(IPC_CHANNELS.RETURNS_CREATE, async (_event, input: CreateReturnInput) => {
    try {
      const effectiveUserId = input.user_id || sessionService.getCurrentUserId() || 1;
      const data = await returnsService.createReturn({ ...input, user_id: effectiveUserId });
      return { success: true, data };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // معالجة مرتجع (متوافق مع الاسم القديم)
  ipcMain.handle(IPC_CHANNELS.RETURNS_PROCESS, async (_event, input: CreateReturnInput) => {
    try {
      const effectiveUserId = input.user_id || sessionService.getCurrentUserId() || 1;
      const data = await returnsService.createReturn({ ...input, user_id: effectiveUserId });
      return { success: true, data };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // عملية استبدال بضاعة
  ipcMain.handle(IPC_CHANNELS.RETURNS_EXCHANGE, async (_event, input: ExchangeInput) => {
    try {
      const effectiveUserId = input.user_id || sessionService.getCurrentUserId() || 1;
      const data = await returnsService.createExchange({ ...input, user_id: effectiveUserId });
      return { success: true, data };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // جلب مرتجعات فاتورة مبيعات معينة
  ipcMain.handle(IPC_CHANNELS.RETURNS_GET_BY_SALE, async (_event, saleId: number) => {
    try {
      const data = await returnsService.getBySaleId(saleId);
      return { success: true, data };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // جلب مرتجع بالمعرف
  ipcMain.handle(IPC_CHANNELS.RETURNS_GET, async (_event, id: number) => {
    try {
      const data = await returnsService.getById(id);
      return { success: true, data };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // قائمة المرتجعات مع الفلاتر
  ipcMain.handle(
    IPC_CHANNELS.RETURNS_LIST,
    async (
      _event,
      filters?: {
        saleId?: number;
        customerId?: number;
        startDate?: string;
        endDate?: string;
        limit?: number;
      }
    ) => {
      try {
        const data = await returnsService.list(filters);
        return { success: true, data };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );
}
