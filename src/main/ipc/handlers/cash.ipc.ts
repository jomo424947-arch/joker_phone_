/**
 * معالجات IPC للخزنة والورديات والمصروفات ودرج النقدية
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/constants/ipc-channels';
import { cashService } from '../../services/cash.service';
import { sessionService } from '../../services/session.service';
import { receiptPrinter } from '../../printing/receipt-printer';

export function registerCashIpcHandlers(): void {
  // جلب الوردية النشطة
  ipcMain.handle(IPC_CHANNELS.CASH_GET_ACTIVE_SHIFT, async (_event, userId?: number) => {
    try {
      const shift = await cashService.getActiveShift(userId);
      return { success: true, data: shift };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // فتح وردية جديدة
  ipcMain.handle(IPC_CHANNELS.CASH_OPEN_SHIFT, async (_event, userId: number, openingCash: number, notes?: string) => {
    try {
      const effectiveUserId = userId || sessionService.getCurrentUserId() || 1;
      const shift = await cashService.openShift(effectiveUserId, openingCash, notes);
      return { success: true, data: shift };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // إغلاق وردية بالعد الأعمى
  ipcMain.handle(IPC_CHANNELS.CASH_CLOSE_SHIFT, async (_event, shiftId: number, actualCash: number, notes?: string, actorUserId?: number) => {
    try {
      const effectiveActorId = actorUserId || sessionService.getCurrentUserId() || 1;
      const summary = await cashService.closeShift(shiftId, actualCash, notes, effectiveActorId);
      return { success: true, data: summary };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // تسجيل مصروف
  ipcMain.handle(IPC_CHANNELS.CASH_RECORD_EXPENSE, async (_event, input) => {
    try {
      const effectiveUserId = input?.user_id || sessionService.getCurrentUserId() || 1;
      const expense = await cashService.recordExpense({
        ...input,
        user_id: effectiveUserId,
      });
      return { success: true, data: expense };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // فتح درج النقدية
  ipcMain.handle(IPC_CHANNELS.CASH_DRAWER_OPEN, async (_event, shiftId?: number, userId?: number, reason?: string) => {
    try {
      const opened = await receiptPrinter.openCashDrawer();
      const effectiveUserId = userId || sessionService.getCurrentUserId() || 1;
      if (shiftId) {
        await cashService.logDrawerOpen(shiftId, effectiveUserId, reason);
      }
      return { success: true, data: { opened } };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // تسجيل إيداع نقدي
  ipcMain.handle(IPC_CHANNELS.CASH_DEPOSIT, async (_event, shiftId: number, userId: number, amount: number, note?: string) => {
    try {
      const effectiveUserId = userId || sessionService.getCurrentUserId() || 1;
      const movement = await cashService.recordDeposit(shiftId, effectiveUserId, amount, note);
      return { success: true, data: movement };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // تسجيل سحب نقدي (Cash Drop)
  ipcMain.handle(IPC_CHANNELS.CASH_WITHDRAWAL, async (_event, shiftId: number, userId: number, amount: number, note?: string) => {
    try {
      const effectiveUserId = userId || sessionService.getCurrentUserId() || 1;
      const movement = await cashService.recordWithdrawal(shiftId, effectiveUserId, amount, note);
      return { success: true, data: movement };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // جلب حركات النقدية للوردية
  ipcMain.handle(IPC_CHANNELS.CASH_GET_MOVEMENTS, async (_event, filter: { shift_id: number; type?: any }) => {
    try {
      const movements = await cashService.getCashMovements(filter);
      return { success: true, data: movements };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // استعراض المصروفات
  ipcMain.handle(IPC_CHANNELS.CASH_GET_EXPENSES, async (_event, filter?: any) => {
    try {
      const expenses = await cashService.getExpenses(filter);
      return { success: true, data: expenses };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // سجل الورديات
  ipcMain.handle(IPC_CHANNELS.CASH_GET_SHIFTS, async (_event, options?: any) => {
    try {
      const shifts = await cashService.getShiftHistory(options);
      return { success: true, data: shifts };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // ملخص الوردية (Z-Report)
  ipcMain.handle(IPC_CHANNELS.CASH_GET_SHIFT_SUMMARY, async (_event, shiftId: number) => {
    try {
      const summary = cashService.getShiftSummary(shiftId);
      return { success: true, data: summary };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // جلب تصنيفات المصروفات
  ipcMain.handle(IPC_CHANNELS.CASH_GET_EXPENSE_CATEGORIES, async () => {
    try {
      const categories = cashService.getExpenseCategories();
      return { success: true, data: categories };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });
}
