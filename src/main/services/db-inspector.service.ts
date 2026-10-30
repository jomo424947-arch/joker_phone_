/**
 * خدمة فحص واستعراض قواعد بيانات SQLite (Database Inspector Service)
 * تسمح بفحص أي ملف قاعدة بيانات أو نسخة احتياطية في وضع القراءة فقط (Read-Only)
 * واستخراج: المسجلين، الأرقام (العملاء والموردين)، العمليات، الفواتير، المخزون، والورديات
 */

import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { getDefaultDatabasePath } from '../db/connection';
import {
  DatabaseInspectionResult,
  InspectorKPIs,
  InspectorUser,
  InspectorContact,
  InspectorSale,
  InspectorSaleItem,
  InspectorProduct,
  InspectorShift,
  InspectorAuditLog,
  BackupFileInfo,
} from '../../shared/types/db-inspector.types';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 بايت';
  const k = 1024;
  const sizes = ['بايت', 'كيلوبايت', 'ميجابايت', 'جيجابايت'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function translateAuditAction(action: string): string {
  const map: Record<string, string> = {
    SALE_CREATED: 'إنشاء فاتورة بيع جديدة',
    SALE_VOIDED: 'إلغاء فاتورة بيع',
    PRODUCT_CREATED: 'إضافة منتج جديد',
    PRODUCT_UPDATED: 'تعديل بيانات أو سعر منتج',
    PRODUCT_DELETED: 'حذف منتج نهائياً',
    PRODUCT_ARCHIVED: 'أرشفة وتعطيل منتج',
    LOGIN_SUCCESS: 'تسجيل دخول ناجح',
    LOGIN_FAILED: 'محاولة دخول فاشلة',
    USER_CREATED: 'إضافة مستخدم جديد',
    USER_UPDATED: 'تعديل بيانات مستخدم',
    USER_LOCKED: 'قفل حساب مستخدم',
    BACKUP_CREATED: 'إنشاء نسخة احتياطية',
    BACKUP_RESTORED: 'استعادة قاعدة البيانات',
    PURCHASE_CREATED: 'تسجيل فاتورة توريد / مشتريات',
    RETURN_PROCESSED: 'معالجة مرتجع مبيعات',
    SHIFT_OPENED: 'فتح وردية كاشير جديدة',
    SHIFT_CLOSED: 'إغلاق وردية كاشير',
    EXPENSE_RECORDED: 'تسجيل مصروف نثري',
    CASH_DEPOSIT: 'إيداع نقدية في الخزينة',
    CASH_WITHDRAWAL: 'سحب نقدية من الخزينة',
  };
  return map[action] || action;
}

export class DbInspectorService {
  /**
   * الحصول على مسار قاعدة البيانات الحالية
   */
  getDefaultDbPath(): string {
    return getDefaultDatabasePath();
  }

  /**
   * جلب قائمة النسخ الاحتياطية المتوفرة في النظام
   */
  listBackupFiles(): BackupFileInfo[] {
    const backupDirs: string[] = [];

    // مجلد appData
    const defaultDb = this.getDefaultDbPath();
    if (defaultDb && defaultDb !== ':memory:') {
      backupDirs.push(path.join(path.dirname(defaultDb), 'backups'));
    }

    // مجلد العمل الحالي
    backupDirs.push(path.join(process.cwd(), 'backups'));

    const results: BackupFileInfo[] = [];
    const seenPaths = new Set<string>();

    for (const dir of backupDirs) {
      if (!fs.existsSync(dir)) continue;

      try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          if (!file.endsWith('.db') && !file.endsWith('.sqlite')) continue;

          const fullPath = path.join(dir, file);
          if (seenPaths.has(fullPath)) continue;
          seenPaths.add(fullPath);

          const stat = fs.statSync(fullPath);
          results.push({
            fileName: file,
            filePath: fullPath,
            fileSizeBytes: stat.size,
            fileSizeFormatted: formatBytes(stat.size),
            createdAt: stat.mtime.toISOString(),
          });
        }
      } catch {
        // ignore errors reading directory
      }
    }

    // ترتيب تنازلي حسب الأحدث
    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * فحص شامل لملف قاعدة البيانات في وضع القراءة فقط
   */
  inspectDatabase(customFilePath?: string): DatabaseInspectionResult {
    const filePath = customFilePath || this.getDefaultDbPath();

    if (!fs.existsSync(filePath)) {
      throw new Error(`ملف قاعدة البيانات غير موجود في المسار: ${filePath}`);
    }

    const stat = fs.statSync(filePath);
    const fileName = path.basename(filePath);

    // فتح قاعدة البيانات في وضع القراءة فقط لضمان السلامة التامة
    const targetDb = new Database(filePath, { readonly: true, fileMustExist: true });

    try {
      // 1. فحص سلامة وتكامل الملف
      let integrityOk = true;
      let integrityMessage = 'قاعدة البيانات سليمة وخالية من الأخطاء';
      try {
        const integrityCheck = targetDb.pragma('integrity_check') as Array<{ integrity_check: string }>;
        if (integrityCheck && integrityCheck.length > 0) {
          const res = integrityCheck[0]?.integrity_check;
          if (res && res.toLowerCase() !== 'ok') {
            integrityOk = false;
            integrityMessage = `تحذير سلامة: ${res}`;
          }
        }
      } catch (err: any) {
        integrityOk = false;
        integrityMessage = `خطأ أثناء فحص السلامة: ${err.message}`;
      }

      // 2. الجداول المتوفرة
      const tableRows: any[] = targetDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
      const tables = new Set<string>(tableRows.map((r) => r.name));

      // 3. إصدار المخطط والإعدادات
      let schemaVersion: number | null = null;
      if (tables.has('schema_version')) {
        const vRow: any = targetDb.prepare('SELECT MAX(version) as max_v FROM schema_version').get();
        schemaVersion = vRow?.max_v ?? null;
      }

      let storeName = 'الجوكر فون - JOKER PHONE';
      let storePhone = '';
      if (tables.has('settings')) {
        const sRows: any[] = targetDb
          .prepare("SELECT key, value FROM settings WHERE key IN ('store_name', 'store_phone')")
          .all();
        for (const row of sRows) {
          if (row.key === 'store_name') storeName = row.value;
          if (row.key === 'store_phone') storePhone = row.value;
        }
      }

      // 4. المستخدمين المسجلين (مين مسجل؟)
      const users: InspectorUser[] = [];
      if (tables.has('users')) {
        const uRows: any[] = targetDb
          .prepare(
            `SELECT id, username, display_name, role, is_active, created_at,
             (pin_hash IS NOT NULL AND pin_hash != '') as has_pin
             FROM users ORDER BY id ASC`
          )
          .all();
        for (const u of uRows) {
          users.push({
            id: u.id,
            username: u.username,
            displayName: u.display_name,
            role: u.role,
            roleArabic:
              u.role === 'owner' ? 'مالك النظام' : u.role === 'manager' ? 'مدير فرع' : 'كاشير مبيعات',
            isActive: Boolean(u.is_active),
            hasPin: Boolean(u.has_pin),
            createdAt: u.created_at,
          });
        }
      }

      // 5. الأرقام والتواصل (العملاء والموردين والمتجر)
      const contacts: InspectorContact[] = [];

      // هاتف المتجر إن وجد
      if (storePhone) {
        contacts.push({
          id: 0,
          name: storeName,
          phone: storePhone,
          type: 'المحل',
          balanceEgp: 0,
          notes: 'رقم الهاتف الرسمي للمتجر',
          createdAt: stat.birthtime.toISOString(),
        });
      }

      if (tables.has('customers')) {
        const cRows: any[] = targetDb
          .prepare('SELECT id, name, phone, balance, notes, created_at FROM customers ORDER BY balance DESC, id DESC')
          .all();
        for (const c of cRows) {
          contacts.push({
            id: c.id,
            name: c.name,
            phone: c.phone || 'غير مسجل',
            type: 'عميل',
            balanceEgp: (c.balance || 0) / 100,
            notes: c.notes || undefined,
            createdAt: c.created_at || '',
          });
        }
      }

      if (tables.has('suppliers')) {
        const supRows: any[] = targetDb
          .prepare('SELECT id, name, phone, address, balance, created_at FROM suppliers ORDER BY id DESC')
          .all();
        for (const s of supRows) {
          contacts.push({
            id: s.id,
            name: s.name,
            phone: s.phone || 'غير مسجل',
            type: 'مورد',
            balanceEgp: (s.balance || 0) / 100,
            address: s.address || undefined,
            createdAt: s.created_at || '',
          });
        }
      }

      // 6. العمليات والمبيعات (كل العمليات)
      const sales: InspectorSale[] = [];
      let totalRevenueCents = 0;

      if (tables.has('sales')) {
        // خريطة بنود الفاتورة
        const itemsMap: Record<number, InspectorSaleItem[]> = {};
        if (tables.has('sale_items')) {
          const itemRows: any[] = targetDb
            .prepare(
              `SELECT id, sale_id, product_name, variant_name, qty, unit_price, line_total
               FROM sale_items ORDER BY id ASC`
            )
            .all();
          for (const it of itemRows) {
            if (!itemsMap[it.sale_id]) itemsMap[it.sale_id] = [];
            itemsMap[it.sale_id].push({
              id: it.id,
              productName: it.product_name,
              variantName: it.variant_name || undefined,
              qty: it.qty,
              unitPriceEgp: (it.unit_price || 0) / 100,
              lineTotalEgp: (it.line_total || 0) / 100,
            });
          }
        }

        const saleRows: any[] = targetDb
          .prepare(
            `SELECT s.id, s.invoice_no, s.created_at, s.subtotal, s.discount_amount, s.tax_amount, s.total,
                    s.status, s.void_reason, s.notes,
                    u.display_name as cashier_name,
                    c.name as customer_name, c.phone as customer_phone,
                    (SELECT GROUP_CONCAT(DISTINCT method) FROM sale_payments WHERE sale_id = s.id) as payment_methods
             FROM sales s
             LEFT JOIN users u ON s.user_id = u.id
             LEFT JOIN customers c ON s.customer_id = c.id
             ORDER BY s.id DESC
             LIMIT 1000`
          )
          .all();

        for (const s of saleRows) {
          if (s.status === 'completed') {
            totalRevenueCents += s.total || 0;
          }

          const saleItems = itemsMap[s.id] || [];
          const methodMap: Record<string, string> = {
            cash: 'نقدي (كاش)',
            card: 'بطاقة فيزا',
            wallet: 'محفظة إلكترونية',
            credit: 'آجل (حساب عميل)',
          };

          const formattedMethods = s.payment_methods
            ? s.payment_methods.split(',').map((m: string) => methodMap[m] || m).join(' + ')
            : 'نقدي';

          const statusArabic =
            s.status === 'completed'
              ? 'مكتملة'
              : s.status === 'voided'
              ? 'ملغاة'
              : 'معلقة';

          sales.push({
            id: s.id,
            invoiceNo: s.invoice_no,
            createdAt: s.created_at,
            cashierName: s.cashier_name || 'غير معروف',
            customerName: s.customer_name || undefined,
            customerPhone: s.customer_phone || undefined,
            paymentMethod: formattedMethods,
            subtotalEgp: (s.subtotal || 0) / 100,
            discountEgp: (s.discount_amount || 0) / 100,
            taxEgp: (s.tax_amount || 0) / 100,
            totalEgp: (s.total || 0) / 100,
            status: s.status,
            statusArabic,
            itemsCount: saleItems.reduce((acc, it) => acc + it.qty, 0),
            notes: s.notes || undefined,
            items: saleItems,
          });
        }
      }

      // 7. المنتجات والمخزون
      const products: InspectorProduct[] = [];
      let totalStockUnits = 0;

      if (tables.has('products')) {
        const barcodesMap: Record<number, string[]> = {};
        if (tables.has('product_barcodes') && tables.has('product_variants')) {
          const bRows: any[] = targetDb
            .prepare(
              `SELECT pv.product_id, pb.barcode
               FROM product_barcodes pb
               JOIN product_variants pv ON pb.variant_id = pv.id`
            )
            .all();
          for (const b of bRows) {
            if (!barcodesMap[b.product_id]) barcodesMap[b.product_id] = [];
            barcodesMap[b.product_id].push(b.barcode);
          }
        }

        const pRows: any[] = targetDb
          .prepare(
            `SELECT p.id, p.name_ar, p.unit, p.is_active,
                    c.name as category_name,
                    b.name as brand_name,
                    COALESCE(MIN(pv.sale_price), 0) as sale_price,
                    COALESCE((SELECT SUM(qty_remaining) FROM batches WHERE variant_id IN (SELECT id FROM product_variants WHERE product_id = p.id)), 0) as current_stock,
                    COALESCE((SELECT AVG(unit_cost) FROM batches WHERE variant_id IN (SELECT id FROM product_variants WHERE product_id = p.id)), 0) as unit_cost
             FROM products p
             LEFT JOIN categories c ON p.category_id = c.id
             LEFT JOIN brands b ON p.brand_id = b.id
             LEFT JOIN product_variants pv ON pv.product_id = p.id
             GROUP BY p.id
             ORDER BY p.id DESC`
          )
          .all();

        for (const p of pRows) {
          totalStockUnits += p.current_stock || 0;
          products.push({
            id: p.id,
            nameAr: p.name_ar,
            categoryName: p.category_name || undefined,
            brandName: p.brand_name || undefined,
            barcodes: barcodesMap[p.id] || [],
            salePriceEgp: (p.sale_price || 0) / 100,
            unitCostEgp: (p.unit_cost || 0) / 100,
            currentStock: p.current_stock || 0,
            isActive: Boolean(p.is_active),
            unit: p.unit || 'قطعة',
          });
        }
      }

      // 8. الورديات والخزينة
      const shifts: InspectorShift[] = [];
      if (tables.has('shifts')) {
        const shRows: any[] = targetDb
          .prepare(
            `SELECT s.id, s.opened_at, s.closed_at, s.opening_balance, s.closing_balance,
                    s.expected_balance, s.difference, s.status, s.notes,
                    u.display_name as cashier_name
             FROM shifts s
             LEFT JOIN users u ON s.user_id = u.id
             ORDER BY s.id DESC`
          )
          .all();

        for (const sh of shRows) {
          shifts.push({
            id: sh.id,
            cashierName: sh.cashier_name || 'غير معروف',
            openedAt: sh.opened_at,
            closedAt: sh.closed_at || undefined,
            openingBalanceEgp: (sh.opening_balance || 0) / 100,
            closingBalanceEgp: sh.closing_balance !== null ? sh.closing_balance / 100 : undefined,
            expectedBalanceEgp: sh.expected_balance !== null ? sh.expected_balance / 100 : undefined,
            differenceEgp: sh.difference !== null ? sh.difference / 100 : undefined,
            status: sh.status,
            statusArabic: sh.status === 'open' ? 'مفتوحة حالياً' : 'مغلقة',
            notes: sh.notes || undefined,
          });
        }
      }

      // 9. سجل التدقيق والرقابة (Audit Trail)
      const auditLogs: InspectorAuditLog[] = [];
      if (tables.has('audit_log')) {
        const aRows: any[] = targetDb
          .prepare(
            `SELECT a.id, a.action, a.entity_type, a.entity_id, a.details, a.created_at,
                    u.display_name as user_name
             FROM audit_log a
             LEFT JOIN users u ON a.user_id = u.id
             ORDER BY a.id DESC
             LIMIT 500`
          )
          .all();

        for (const a of aRows) {
          let parsedDetails: any = null;
          try {
            parsedDetails = a.details ? JSON.parse(a.details) : null;
          } catch {
            parsedDetails = a.details;
          }

          auditLogs.push({
            id: a.id,
            userName: a.user_name || 'النظام التلقائي',
            action: a.action,
            actionArabic: translateAuditAction(a.action),
            entityType: a.entity_type,
            entityId: a.entity_id || undefined,
            details: parsedDetails,
            createdAt: a.created_at,
          });
        }
      }

      // 10. تجميع الإحصائيات العامة (KPIs)
      const kpis: InspectorKPIs = {
        totalUsers: users.length,
        totalCustomers: contacts.filter((c) => c.type === 'عميل').length,
        totalSuppliers: contacts.filter((c) => c.type === 'مورد').length,
        totalProducts: products.length,
        totalStockQty: totalStockUnits,
        totalSalesCount: sales.length,
        totalRevenueEgp: totalRevenueCents / 100,
        totalShifts: shifts.length,
        totalAuditLogs: auditLogs.length,
      };

      return {
        meta: {
          filePath,
          fileName,
          fileSizeBytes: stat.size,
          fileSizeFormatted: formatBytes(stat.size),
          lastModified: stat.mtime.toISOString(),
          integrityOk,
          integrityMessage,
          schemaVersion,
          storeName,
          storePhone,
        },
        kpis,
        users,
        contacts,
        sales,
        products,
        shifts,
        auditLogs,
      };
    } finally {
      // إغلاق الاتصال لعدم حجز الملف
      targetDb.close();
    }
  }
}

export const dbInspectorService = new DbInspectorService();
