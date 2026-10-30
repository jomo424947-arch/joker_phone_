/**
 * معالجات IPC للعملاء وحسابات الآجل
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/constants/ipc-channels';
import { customersService } from '../../services/customers.service';
import { sessionService } from '../../services/session.service';
import {
  CreateCustomerInput,
  UpdateCustomerInput,
} from '../../../shared/types/customers.types';

export function registerCustomersIpcHandlers(): void {
  // قائمة العملاء
  ipcMain.handle(
    IPC_CHANNELS.CUSTOMERS_LIST,
    async (
      _event,
      filters?: { search?: string; isActive?: boolean; limit?: number }
    ) => {
      try {
        const data = await customersService.list(filters);
        return { success: true, data };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  // تفاصيل عميل
  ipcMain.handle(IPC_CHANNELS.CUSTOMERS_GET, async (_event, id: number) => {
    try {
      const data = await customersService.getById(id);
      return { success: true, data };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // إنشاء عميل
  ipcMain.handle(
    IPC_CHANNELS.CUSTOMERS_CREATE,
    async (_event, params: { data: CreateCustomerInput; userId?: number }) => {
      try {
        const effectiveUserId = params?.userId || sessionService.getCurrentUserId() || 1;
        const data = await customersService.create(params.data, effectiveUserId);
        return { success: true, data };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  // تحديث بيانات عميل
  ipcMain.handle(
    IPC_CHANNELS.CUSTOMERS_UPDATE,
    async (_event, params: { id: number; data: UpdateCustomerInput; userId?: number }) => {
      try {
        const effectiveUserId = params?.userId || sessionService.getCurrentUserId() || 1;
        const data = await customersService.update(params.id, params.data, effectiveUserId);
        return { success: true, data };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  // أرشفة عميل
  ipcMain.handle(
    IPC_CHANNELS.CUSTOMERS_ARCHIVE,
    async (_event, params: { id: number; userId?: number }) => {
      try {
        const effectiveUserId = params?.userId || sessionService.getCurrentUserId() || 1;
        await customersService.archive(params.id, effectiveUserId);
        return { success: true };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  // سداد دفعة آجل من العميل
  ipcMain.handle(
    IPC_CHANNELS.CUSTOMERS_PAY,
    async (
      _event,
      params: {
        customerId: number;
        amount: number;
        paymentMethod: string;
        note?: string | null;
        userId?: number;
        shiftId?: number | null;
      }
    ) => {
      try {
        const effectiveUserId = params?.userId || sessionService.getCurrentUserId() || 1;
        const data = await customersService.recordPayment({
          ...params,
          userId: effectiveUserId,
        });
        return { success: true, data };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  // كشف حساب العميل
  ipcMain.handle(
    IPC_CHANNELS.CUSTOMERS_STATEMENT,
    async (
      _event,
      params: { customerId: number; dateRange?: { from?: string; to?: string } }
    ) => {
      try {
        const data = await customersService.getStatement(params.customerId, params.dateRange);
        return { success: true, data };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  // سجل مشتريات العميل
  ipcMain.handle(
    IPC_CHANNELS.CUSTOMERS_HISTORY,
    async (_event, params: { customerId: number; limit?: number }) => {
      try {
        const data = await customersService.getPurchaseHistory(params.customerId, params.limit);
        return { success: true, data };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );
}
