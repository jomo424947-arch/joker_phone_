/**
 * معالجات IPC للمشتريات والموردين
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/constants/ipc-channels';
import { purchasesService } from '../../services/purchases.service';
import { suppliersService } from '../../services/suppliers.service';
import { sessionService } from '../../services/session.service';
import {
  CreatePurchaseInput,
  CreateSupplierInput,
  UpdateSupplierInput,
} from '../../../shared/types/purchases.types';

export function registerPurchasesIpcHandlers(): void {
  // ==========================================
  // Suppliers Handlers
  // ==========================================

  // قائمة الموردين
  ipcMain.handle(
    IPC_CHANNELS.SUPPLIERS_LIST,
    async (
      _event,
      filters?: { search?: string; isActive?: boolean; limit?: number }
    ) => {
      try {
        const data = await suppliersService.list(filters);
        return { success: true, data };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  // متوافق مع القناة السابقة
  ipcMain.handle(IPC_CHANNELS.PURCHASES_GET_SUPPLIERS, async () => {
    try {
      const data = await suppliersService.list({ isActive: true });
      return { success: true, data };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // تفاصيل مورد
  ipcMain.handle(IPC_CHANNELS.SUPPLIERS_GET, async (_event, id: number) => {
    try {
      const data = await suppliersService.getById(id);
      return { success: true, data };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // إنشاء مورد
  ipcMain.handle(
    IPC_CHANNELS.SUPPLIERS_CREATE,
    async (_event, params: { data: CreateSupplierInput; userId?: number }) => {
      try {
        const effectiveUserId = params?.userId || sessionService.getCurrentUserId() || 1;
        const data = await suppliersService.create(params.data, effectiveUserId);
        return { success: true, data };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  // تحديث مورد
  ipcMain.handle(
    IPC_CHANNELS.SUPPLIERS_UPDATE,
    async (_event, params: { id: number; data: UpdateSupplierInput; userId?: number }) => {
      try {
        const effectiveUserId = params?.userId || sessionService.getCurrentUserId() || 1;
        const data = await suppliersService.update(params.id, params.data, effectiveUserId);
        return { success: true, data };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  // أرشفة مورد
  ipcMain.handle(
    IPC_CHANNELS.SUPPLIERS_ARCHIVE,
    async (_event, params: { id: number; userId?: number }) => {
      try {
        const effectiveUserId = params?.userId || sessionService.getCurrentUserId() || 1;
        await suppliersService.archive(params.id, effectiveUserId);
        return { success: true };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  // كشف حساب مورد
  ipcMain.handle(
    IPC_CHANNELS.SUPPLIERS_STATEMENT,
    async (
      _event,
      params: { supplierId: number; dateRange?: { from?: string; to?: string } }
    ) => {
      try {
        const data = await suppliersService.getStatement(params.supplierId, params.dateRange);
        return { success: true, data };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  // سداد دفعة للمورد
  const recordPaymentHandler = async (
    _event: unknown,
    params: {
      supplierId: number;
      amount: number;
      paymentMethod: string;
      note?: string | null;
      userId?: number;
      shiftId?: number | null;
    }
  ) => {
    try {
      const effectiveUserId = params?.userId || sessionService.getCurrentUserId() || 1;
      const data = await suppliersService.recordPayment({
        ...params,
        userId: effectiveUserId,
      });
      return { success: true, data };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  };

  ipcMain.handle(IPC_CHANNELS.SUPPLIERS_PAY, recordPaymentHandler);
  ipcMain.handle(IPC_CHANNELS.PURCHASES_RECORD_PAYMENT, recordPaymentHandler);

  // ==========================================
  // Purchases Handlers
  // ==========================================

  // إنشاء فاتورة شراء
  ipcMain.handle(
    IPC_CHANNELS.PURCHASES_CREATE_INVOICE,
    async (_event, input: CreatePurchaseInput) => {
      try {
        const effectiveUserId = input.user_id || sessionService.getCurrentUserId() || 1;
        const data = await purchasesService.create({
          ...input,
          user_id: effectiveUserId,
        });
        return { success: true, data };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  // قائمة فواتير الشراء
  ipcMain.handle(
    IPC_CHANNELS.PURCHASES_LIST,
    async (
      _event,
      filters?: {
        supplierId?: number;
        status?: string;
        startDate?: string;
        endDate?: string;
        limit?: number;
        offset?: number;
      }
    ) => {
      try {
        const data = await purchasesService.list(filters);
        return { success: true, data };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  // جلب فاتورة شراء بالمعرف
  ipcMain.handle(IPC_CHANNELS.PURCHASES_GET, async (_event, id: number) => {
    try {
      const data = await purchasesService.getById(id);
      return { success: true, data };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // مرتجع شراء
  ipcMain.handle(
    IPC_CHANNELS.PURCHASES_RETURN,
    async (
      _event,
      params: {
        purchaseId: number;
        items: Array<{ purchaseItemId: number; qty: number }>;
        userId: number;
        note?: string | null;
      }
    ) => {
      try {
        const data = await purchasesService.createReturn(params);
        return { success: true, data };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  // تاريخ تكلفة الصنف
  ipcMain.handle(IPC_CHANNELS.PURCHASES_COST_HISTORY, async (_event, variantId: number) => {
    try {
      const data = await purchasesService.getCostHistory(variantId);
      return { success: true, data };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // مقارنة تكلفة الصنف بين الموردين
  ipcMain.handle(IPC_CHANNELS.PURCHASES_COST_COMPARISON, async (_event, variantId: number) => {
    try {
      const data = await purchasesService.getCostComparison(variantId);
      return { success: true, data };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}
