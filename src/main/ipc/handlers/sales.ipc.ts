/**
 * معالجات IPC لعمليات البيع والفواتير والإيصالات الحرارية
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/constants/ipc-channels';
import { createSaleSchema } from '../../../shared/schemas/sales.schema';
import { salesService } from '../../services/sales.service';
import { sessionService } from '../../services/session.service';
import { cashService } from '../../services/cash.service';
import { receiptPrinter } from '../../printing/receipt-printer';
import { auditService } from '../../services/audit.service';

export function registerSalesIpcHandlers(): void {
  // إنشاء فاتورة جديدة
  ipcMain.handle(IPC_CHANNELS.SALES_CREATE, async (_event, input, userId, shiftId) => {
    try {
      const parsed = createSaleSchema.safeParse(input);
      if (!parsed.success) {
        return {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'بيانات الفاتورة غير صحيحة',
            details: parsed.error.format(),
          },
        };
      }

      const resolvedUserId = userId || sessionService.getCurrentUser()?.id || 1;
      let resolvedShiftId = shiftId;
      if (!resolvedShiftId) {
        const activeShift = await cashService.getActiveShift(resolvedUserId);
        if (activeShift) {
          resolvedShiftId = activeShift.id;
        } else {
          // فتح وردية جديدة تلقائية عند أول عملية بيع إذا لم تكن مفتوحة مسبقاً
          const newShift = await cashService.openShift(
            resolvedUserId,
            0,
            'وردية مفتوحة تلقائياً لبدء عمليات البيع'
          );
          resolvedShiftId = newShift.id;
        }
      }

      const sale = await salesService.createSale(parsed.data, resolvedUserId, resolvedShiftId);

      // إرجاع الفاتورة فوراً للواجهة للمعاينة السلسة وتفادي أي تعليق في الشاشة
      return { success: true, data: sale };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // جلب فاتورة بواسطة المعرف
  ipcMain.handle(IPC_CHANNELS.SALES_GET_BY_ID, async (_event, id) => {
    try {
      const sale = salesService.getSaleById(id);
      return { success: true, data: sale };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // قائمة الفواتير مع فلاتر
  ipcMain.handle(IPC_CHANNELS.SALES_LIST, async (_event, options) => {
    try {
      const sales = await salesService.listSales(options);
      return { success: true, data: sales };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // تعليق فاتورة
  ipcMain.handle(IPC_CHANNELS.SALES_HOLD, async (_event, cartData, shiftId, userId, customerName) => {
    try {
      const effectiveUserId = userId || sessionService.getCurrentUserId() || 1;
      const holdId = await salesService.holdSale(cartData, shiftId, effectiveUserId, customerName);
      return { success: true, data: { holdId } };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // قائمة الفواتير المعلقة
  ipcMain.handle(IPC_CHANNELS.SALES_GET_HELD, async () => {
    try {
      const held = await salesService.getHeldSales();
      return { success: true, data: held };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // استئناف فاتورة معلقة
  ipcMain.handle(IPC_CHANNELS.SALES_RESUME_HELD, async (_event, holdId) => {
    try {
      const resumed = await salesService.resumeHeldSale(holdId);
      return { success: true, data: resumed };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // حذف فاتورة معلقة دون استئنافها
  ipcMain.handle(IPC_CHANNELS.SALES_DELETE_HELD, async (_event, holdId) => {
    try {
      const deleted = await salesService.deleteHeldSale(holdId);
      return { success: true, data: deleted };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // إلغاء فاتورة مبيعات
  ipcMain.handle(IPC_CHANNELS.SALES_VOID, async (_event, saleId, userId, reason) => {
    try {
      const effectiveUserId = userId || sessionService.getCurrentUserId() || 1;
      const voided = await salesService.voidSale(saleId, effectiveUserId, reason);
      return { success: true, data: voided };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // إعادة طباعة إيصال
  ipcMain.handle(IPC_CHANNELS.SALES_PRINT_RECEIPT, async (_event, saleOrId) => {
    try {
      const sale = typeof saleOrId === 'number' ? salesService.getSaleById(saleOrId) : saleOrId;
      if (!sale) {
        return { success: false, error: 'الفاتورة غير موجودة' };
      }
      const printed = await receiptPrinter.printSaleReceipt(sale);
      if (!printed) {
        return {
          success: false,
          error: 'تعذر إرسال الفاتورة للطابعة الحرارية. يرجى التحقق من توصيل الطابعة وتشغيلها أو فك تعليق المهام.',
          data: { printed: false },
        };
      }

      // توثيق عملية الطباعة في سجل التدقيق الأمني
      try {
        const currentUserId = sessionService.getCurrentUser()?.id || sale.user_id || 1;
        auditService.log({
          userId: currentUserId,
          action: 'PRINT_RECEIPT',
          entityType: 'sale',
          entityId: sale.id,
          details: {
            invoiceNo: sale.invoice_no,
            total: sale.total,
          },
        });
      } catch {}

      return { success: true, data: { printed: true } };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });
}

