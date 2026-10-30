/**
 * معالجات IPC للمنتجات والباركود والاستيراد والطباعة
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/constants/ipc-channels';
import { productsService } from '../../services/products.service';
import { promotionsService } from '../../services/promotions.service';
import { importService } from '../../services/import.service';
import { barcodePrinter } from '../../printing/barcode-printer';
import { sessionService } from '../../services/session.service';

export function registerProductsIpcHandlers(): void {
  // بحث المنتجات
  ipcMain.handle(IPC_CHANNELS.PRODUCTS_SEARCH, async (_event, query, options) => {
    try {
      const products = await productsService.searchProducts(query, options);
      return { success: true, data: products };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // فحص بالباركود
  ipcMain.handle(IPC_CHANNELS.PRODUCTS_GET_BY_BARCODE, async (_event, barcode) => {
    try {
      const product = await productsService.getProductByBarcode(barcode);
      return { success: true, data: product };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // قائمة المنتجات
  ipcMain.handle(IPC_CHANNELS.PRODUCTS_LIST, async (_event, options) => {
    try {
      const products = await productsService.searchProducts('', options);
      return { success: true, data: products };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // تفاصيل منتج واحد
  ipcMain.handle(IPC_CHANNELS.PRODUCTS_GET, async (_event, id) => {
    try {
      const product = productsService.getProductDetails(id);
      return { success: true, data: product };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // إنشاء منتج
  ipcMain.handle(IPC_CHANNELS.PRODUCTS_CREATE, async (_event, input, actorUserId) => {
    try {
      const effectiveUserId = actorUserId || sessionService.getCurrentUserId() || 1;
      const product = await productsService.createProduct(input, effectiveUserId);
      return { success: true, data: product };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // تحديث منتج وأسعاره وباركوده
  ipcMain.handle(IPC_CHANNELS.PRODUCTS_UPDATE, async (_event, id, input, actorUserId) => {
    try {
      const effectiveUserId = actorUserId || sessionService.getCurrentUserId() || 1;
      const product = await productsService.updateProduct(id, input, effectiveUserId);
      return { success: true, data: product };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // حذف منتج (ذكي: حذف نهائي إذا لم تكن له مبيعات، أو أرشفة آمنة إذا كانت له مبيعات سابقة)
  ipcMain.handle(IPC_CHANNELS.PRODUCTS_DELETE, async (_event, id, actorUserId) => {
    try {
      const effectiveUserId = actorUserId || sessionService.getCurrentUserId() || 1;
      const result = await productsService.deleteProduct(id, effectiveUserId);
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // سجل تغير أسعار المنتج
  ipcMain.handle(IPC_CHANNELS.PRODUCTS_GET_PRICE_HISTORY, async (_event, productId) => {
    try {
      const history = productsService.getProductPriceHistory(productId);
      return { success: true, data: history };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // كارت حركة الصنف
  ipcMain.handle(IPC_CHANNELS.PRODUCTS_GET_STOCK_CARD, async (_event, productId) => {
    try {
      const card = productsService.getProductStockCard(productId);
      return { success: true, data: card };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // أرشفة منتج
  ipcMain.handle(IPC_CHANNELS.PRODUCTS_ARCHIVE, async (_event, id, actorUserId) => {
    try {
      const effectiveUserId = actorUserId || sessionService.getCurrentUserId() || 1;
      await productsService.archiveProduct(id, effectiveUserId);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // --- معالجات العروض الترويجية (Promotions) ---
  ipcMain.handle(IPC_CHANNELS.PROMOTIONS_LIST, async (_event, activeOnly) => {
    try {
      const promos = promotionsService.getPromotions(activeOnly);
      return { success: true, data: promos };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROMOTIONS_GET, async (_event, id) => {
    try {
      const promo = promotionsService.getPromotionById(id);
      return { success: true, data: promo };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROMOTIONS_CREATE, async (_event, input, actorUserId) => {
    try {
      const promo = promotionsService.createPromotion(input, actorUserId);
      return { success: true, data: promo };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROMOTIONS_UPDATE, async (_event, id, input, actorUserId) => {
    try {
      const promo = promotionsService.updatePromotion(id, input, actorUserId);
      return { success: true, data: promo };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROMOTIONS_DELETE, async (_event, id, actorUserId) => {
    try {
      const deleted = promotionsService.deletePromotion(id, actorUserId);
      return { success: true, data: { deleted } };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROMOTIONS_CALCULATE, async (_event, items) => {
    try {
      const discounts = promotionsService.calculateDiscounts(items);
      return { success: true, data: discounts };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // تحديث بالجملة
  ipcMain.handle(IPC_CHANNELS.PRODUCTS_BULK_UPDATE, async (_event, input, actorUserId) => {
    try {
      const count = await productsService.bulkUpdate(input, actorUserId);
      return { success: true, data: { updatedCount: count } };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // توليد باركود داخلي
  ipcMain.handle(IPC_CHANNELS.PRODUCTS_GENERATE_BARCODE, async () => {
    try {
      const barcode = await productsService.generateInternalBarcode();
      return { success: true, data: barcode };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // استيراد ملف إكسيل / CSV
  ipcMain.handle(IPC_CHANNELS.PRODUCTS_IMPORT_EXCEL, async (_event, fileContentOrRows, actorUserId) => {
    try {
      let rows: any[] = [];
      if (typeof fileContentOrRows === 'string') {
        rows = importService.parseCsv(fileContentOrRows);
      } else if (Array.isArray(fileContentOrRows)) {
        rows = fileContentOrRows;
      }

      const validation = importService.validateRows(rows);
      if (validation.invalidRows.length > 0 && validation.validRows.length === 0) {
        return {
          success: false,
          error: 'فشل استيراد الملف لوجود أخطاء في جميع الأسطر',
          validation,
        };
      }

      const result = await importService.executeImport(validation.validRows, actorUserId);
      return { success: true, data: result, validation };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // طباعة ملصقات الباركود
  ipcMain.handle(IPC_CHANNELS.BARCODES_PRINT_LABELS, async (_event, labels, options) => {
    try {
      const result = await barcodePrinter.printLabels(labels, options);
      return result;
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // جلب قائمة الطابعات المثبتة وتصنيف طابعات الباركود الحرارية
  ipcMain.handle(IPC_CHANNELS.PRINTERS_LIST, async (_event, forceRefresh?: boolean) => {
    try {
      const printers = await barcodePrinter.getSystemPrinters(forceRefresh);
      return { success: true, data: printers };
    } catch (err: any) {
      return { success: false, error: err.message, data: [] };
    }
  });

  // تفريغ قائمة الطباعة وإلغاء المهام العالقة
  ipcMain.handle(IPC_CHANNELS.PRINTERS_CLEAR_QUEUE, async (_event, printerName?: string) => {
    try {
      const res = await barcodePrinter.clearPrintQueue(printerName);
      return res;
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });
}
