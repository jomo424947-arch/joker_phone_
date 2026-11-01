/**
 * خدمة استيراد المنتجات والباركود (Product Import Service)
 * تدعم: قراءة ملفات CSV/Excel، التحقق الشامل (Validation) قبل الحفظ،
 * إنشاء الأقسام والماركات تلقائياً، توليد باركودات داخلية للأصناف التي لا تمتلك باركود،
 * وحفظ البيانات والمخزون الافتتاحي في Transaction واحد
 */

import crypto from 'crypto';
import type Database from 'better-sqlite3';
import { getDatabase } from '../db/connection';
import {
  ImportRow,
  importRowSchema,
  ImportValidationResult,
  ImportExecutionResult,
} from '../../shared/schemas/import.schema';
import { ProductsService, productsService as globalProductsService } from './products.service';
import { auditService as globalAuditService, AuditService } from './audit.service';
import { generateInternalBarcode } from '../../shared/utils/barcode';

export class ImportService {
  private db?: Database.Database;
  private productsService: ProductsService;
  private auditService: AuditService;

  constructor(
    db?: Database.Database,
    products?: ProductsService,
    audit?: AuditService
  ) {
    this.db = db;
    this.productsService = products ?? (db ? new ProductsService(db) : globalProductsService);
    this.auditService = audit ?? (db ? new AuditService(db) : globalAuditService);
  }

  private getDb(): Database.Database {
    return this.db ?? getDatabase();
  }

  /**
   * تحليل نص ملف CSV وتحويله إلى كائنات بيانات مهيأة
   */
  parseCsv(content: string): any[] {
    const lines = content
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length < 2) return [];

    const delimiter = lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : ',';
    const rawHeaders = lines[0].split(delimiter).map((h) => h.replace(/^["']|["']$/g, '').trim());

    // قاموس ربط الأعمدة العربية والإنجليزية
    const headerMap: Record<string, keyof ImportRow> = {
      'اسم المنتج': 'name_ar',
      'الاسم': 'name_ar',
      name: 'name_ar',
      name_ar: 'name_ar',
      'الاسم بالإنجليزية': 'name_en',
      name_en: 'name_en',
      'القسم': 'category_name',
      'التصنيف': 'category_name',
      category: 'category_name',
      'الماركة': 'brand_name',
      brand: 'brand_name',
      'درجة اللون': 'variant_name',
      'الحجم': 'variant_name',
      variant: 'variant_name',
      'كود الصنف': 'sku',
      sku: 'sku',
      'سعر البيع': 'selling_price',
      price: 'selling_price',
      sale_price: 'selling_price',
      'سعر التكلفة': 'cost_price',
      cost: 'cost_price',
      cost_price: 'cost_price',
      'الباركود': 'barcode',
      barcode: 'barcode',
      'الرصيد الافتتاحي': 'initial_stock',
      'الكمية': 'initial_stock',
      stock: 'initial_stock',
      initial_stock: 'initial_stock',
    };

    const mappedHeaders = rawHeaders.map((h) => headerMap[h] ?? (h as keyof ImportRow));
    const records: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(delimiter).map((p) => p.replace(/^["']|["']$/g, '').trim());
      if (parts.length === 0 || (parts.length === 1 && !parts[0])) continue;

      const rowObj: any = {};
      mappedHeaders.forEach((header, index) => {
        if (!header) return;
        const val = parts[index] ?? '';
        if (header === 'selling_price' || header === 'cost_price' || header === 'initial_stock') {
          // تحويل الأسعار من جنيهات لقروش إذا كانت أرقام عشرية
          const num = parseFloat(val);
          if (isNaN(num)) {
            rowObj[header] = 0;
          } else if (header === 'initial_stock') {
            rowObj[header] = Math.round(num);
          } else {
            // إذا كان السعر أقل من 1000 ويحتوي فاصلة أو عادي، يعتبر بالجنيه ويحول لقروش
            rowObj[header] = Math.round(num * 100);
          }
        } else {
          rowObj[header] = val || undefined;
        }
      });

      records.push(rowObj);
    }

    return records;
  }

  /**
   * فحص وتحقق شامل من البيانات قبل الاستيراد (Preview & Validation)
   */
  validateRows(rawRows: any[]): ImportValidationResult {
    const db = this.getDb();
    const validRows: ImportRow[] = [];
    const invalidRows: ImportValidationResult['invalidRows'] = [];
    const seenBarcodesInBatch = new Set<string>();

    for (let index = 0; index < rawRows.length; index++) {
      const row = rawRows[index];
      const parsed = importRowSchema.safeParse(row);

      if (!parsed.success) {
        invalidRows.push({
          rowIndex: index + 1,
          data: row,
          errors: parsed.error.issues.map((i) => i.message),
        });
        continue;
      }

      const validData = parsed.data;

      // فحص تكرار الباركود في نفس الملف
      if (validData.barcode) {
        const cleanBc = validData.barcode.trim();
        if (seenBarcodesInBatch.has(cleanBc)) {
          invalidRows.push({
            rowIndex: index + 1,
            data: row,
            errors: [`الباركود (${cleanBc}) مكرر في نفس الملف`],
          });
          continue;
        }

        // فحص وجود الباركود مسبقاً في قاعدة البيانات
        const existsInDb = db
          .prepare('SELECT id FROM product_barcodes WHERE barcode = ?')
          .get(cleanBc);
        if (existsInDb) {
          invalidRows.push({
            rowIndex: index + 1,
            data: row,
            errors: [`الباركود (${cleanBc}) مستخدم بالفعل لمنتج مسجل مسبقاً`],
          });
          continue;
        }

        seenBarcodesInBatch.add(cleanBc);
      }

      validRows.push(validData);
    }

    return {
      totalRows: rawRows.length,
      validRows,
      invalidRows,
    };
  }

  /**
   * تنفيذ الاستيراد الفعلي لجميع الأسطر الصحيحة داخل Transaction واحد
   */
  async executeImport(
    validRows: ImportRow[],
    actorUserId?: number
  ): Promise<ImportExecutionResult> {
    const db = this.getDb();
    let importedProductsCount = 0;
    let importedVariantsCount = 0;

    const importTx = db.transaction(() => {
      // تجميع الأسطر حسب اسم المنتج والقسم والماركة
      const grouped = new Map<string, ImportRow[]>();
      for (const row of validRows) {
        const groupKey = `${row.name_ar}___${row.category_name ?? ''}___${row.brand_name ?? ''}`;
        if (!grouped.has(groupKey)) {
          grouped.set(groupKey, []);
        }
        grouped.get(groupKey)!.push(row);
      }

      for (const [, rows] of grouped.entries()) {
        const first = rows[0];

        // 1. إنشاء أو جلب القسم والماركة
        const categoryId = first.category_name
          ? this.productsService.getOrCreateCategory(first.category_name)
          : null;
        const brandId = first.brand_name
          ? this.productsService.getOrCreateBrand(first.brand_name)
          : null;

        // 2. إنشاء المنتج
        const productUuid = crypto.randomUUID();
        const pRes = db
          .prepare(`
            INSERT INTO products (
              uuid, category_id, brand_id, name_ar, name_en, unit, is_active, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, 'قطعة', 1, datetime('now'), datetime('now'))
          `)
          .run(
            productUuid,
            categoryId,
            brandId,
            first.name_ar.trim(),
            first.name_en?.trim() ?? null
          );
        const productId = Number(pRes.lastInsertRowid);
        importedProductsCount++;

        // 3. إنشاء الـ Variants والباركود والدفعات الافتتاحية
        for (const vRow of rows) {
          const variantUuid = crypto.randomUUID();
          const vRes = db
            .prepare(`
              INSERT INTO product_variants (
                uuid, product_id, sku, name, sale_price, min_stock, is_active
              ) VALUES (?, ?, ?, ?, ?, 0, 1)
            `)
            .run(
              variantUuid,
              productId,
              vRow.sku?.trim() ?? null,
              vRow.variant_name?.trim() ?? null,
              vRow.selling_price
            );
          const variantId = Number(vRes.lastInsertRowid);
          importedVariantsCount++;

          // ربط أو توليد الباركود
          let barcodeToSave = vRow.barcode?.trim();
          let isInternal = 0;

          if (!barcodeToSave) {
            db.prepare(`
              INSERT INTO counters (name, value) VALUES ('internal_barcode_seq', 1)
              ON CONFLICT(name) DO UPDATE SET value = value + 1
            `).run();
            const seqRow = db
              .prepare("SELECT value FROM counters WHERE name = 'internal_barcode_seq'")
              .get() as { value: number };
                        barcodeToSave = generateInternalBarcode(seqRow.value, '200');
            isInternal = 1;
          }

          db.prepare(`
            INSERT INTO product_barcodes (variant_id, barcode, is_internal)
            VALUES (?, ?, ?)
          `).run(variantId, barcodeToSave, isInternal);

          // 4. تسجيل الرصيد الافتتاحي في المخزون إن وُجد
          const stockQty = vRow.initial_stock ?? 0;
          const costPrice = vRow.cost_price ?? 0;

          const batchRes = db
            .prepare(`
              INSERT INTO batches (variant_id, batch_no, expiry_date, unit_cost, qty_remaining, received_at)
              VALUES (?, 'OPENING-STOCK', NULL, ?, ?, datetime('now'))
            `)
            .run(variantId, costPrice, stockQty);
          const batchId = Number(batchRes.lastInsertRowid);

          if (stockQty > 0 && actorUserId) {
            db.prepare(`
              INSERT INTO stock_movements (
                batch_id, type, qty, ref_type, ref_id, user_id, note, created_at
              ) VALUES (?, 'adjust_in', ?, 'import', ?, ?, 'رصيد افتتاحي عبر الاستيراد', datetime('now'))
            `).run(batchId, stockQty, productId, actorUserId);
          }
        }
      }

      if (actorUserId) {
        this.auditService.log({
          userId: actorUserId,
          action: 'IMPORT_PRODUCTS',
          entityType: 'products',
          details: {
            importedProducts: importedProductsCount,
            importedVariants: importedVariantsCount,
          },
        });
      }
    });

    importTx();

    return {
      success: true,
      importedProductsCount,
      importedVariantsCount,
      failedCount: 0,
      errors: [],
    };
  }
}

export const importService = new ImportService();
