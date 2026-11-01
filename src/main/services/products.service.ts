/**
 * خدمة إدارة المنتجات والأصناف والباركود (Products Service)
 * تدير: إنشاء وتحديث المنتجات، إدارة الـ Variants، البحث بالاسم والباركود والـ SKU،
 * توليد باركود EAN-13 الداخلي، والتحديث بالجملة
 */

import crypto from 'crypto';
import type Database from 'better-sqlite3';
import { getDatabase } from '../db/connection';
import {
  Product,
  ProductVariant,
  ProductWithVariants,
  VariantDetail,
  ProductLookupResult,
  Batch,
  ProductPriceHistory,
  DeleteProductResult,
  StockCardItem,
} from '../../shared/types/products.types';
import {
  CreateProductInput,
  UpdateProductInput,
  BulkUpdateProductsInput,
} from '../../shared/schemas/products.schema';
import { generateInternalBarcode, validateEan13 } from '../../shared/utils/barcode';
import { auditService as globalAuditService, AuditService } from './audit.service';

export interface ProductSearchOptions {
  categoryId?: number;
  brandId?: number;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export class ProductsService {
  private db?: Database.Database;
  private auditService: AuditService;

  constructor(db?: Database.Database, audit?: AuditService) {
    this.db = db;
    this.auditService = audit ?? (db ? new AuditService(db) : globalAuditService);
  }

  private getDb(): Database.Database {
    return this.db ?? getDatabase();
  }

  /**
   * توليد باركود داخلي فريد EAN-13 يبدأ بالبادئة 200
   */
  async generateInternalBarcode(): Promise<string> {
    const db = this.getDb();
    let barcode = '';

    const generateTx = db.transaction(() => {
      db.prepare(`
        INSERT INTO counters (name, value) VALUES ('internal_barcode_seq', 1)
        ON CONFLICT(name) DO UPDATE SET value = value + 1
      `).run();

      const row = db
        .prepare("SELECT value FROM counters WHERE name = 'internal_barcode_seq'")
        .get() as { value: number };

      const seq = row?.value ?? 1;
      barcode = generateInternalBarcode(seq, '200');

      // التأكد من عدم وجود الباركود مسبقاً (احتياط أمان)
      const existing = db
        .prepare('SELECT id FROM product_barcodes WHERE barcode = ?')
        .get(barcode);
      if (existing) {
        // إذا تصادف وجوده، نقفز للرقم التالي
        db.prepare(
          "UPDATE counters SET value = value + 1 WHERE name = 'internal_barcode_seq'"
        ).run();
        const nextRow = db
          .prepare("SELECT value FROM counters WHERE name = 'internal_barcode_seq'")
          .get() as { value: number };
        barcode = generateInternalBarcode(nextRow.value, '200');
      }
    });

    generateTx();
    return barcode;
  }

  /**
   * التحقق من معرف المستخدم وضمان وجوده في قاعدة البيانات لتفادي أخطاء الـ Foreign Key
   */
  private resolveUserId(db: Database.Database, userId?: number): number {
    if (userId && userId > 0) {
      const u = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
      if (u) return userId;
    }
    const anyUser = db.prepare('SELECT id FROM users ORDER BY id ASC LIMIT 1').get() as { id: number } | undefined;
    if (anyUser) return anyUser.id;

    try {
      db.prepare(`
        INSERT OR IGNORE INTO users (id, username, password_hash, display_name, role, is_active, created_at)
        VALUES (1, 'system', 'system', 'نظام موبيكس', 'admin', 1, datetime('now'))
      `).run();
      return 1;
    } catch {
      return 1;
    }
  }

  /**
   * إنشاء تصنيف إن لم يكن موجوداً
   */
  getOrCreateCategory(name: string): number {
    const db = this.getDb();
    const cleanName = name.trim();
    const existing = db
      .prepare('SELECT id FROM categories WHERE name = ?')
      .get(cleanName) as { id: number } | undefined;

    if (existing) {
      return existing.id;
    }

    const uuid = crypto.randomUUID();
    const result = db
      .prepare(
        "INSERT INTO categories (uuid, name, is_active, created_at) VALUES (?, ?, 1, datetime('now'))"
      )
      .run(uuid, cleanName);

    return Number(result.lastInsertRowid);
  }

  /**
   * إنشاء ماركة تجارية إن لم تكن موجودة
   */
  getOrCreateBrand(name: string): number {
    const db = this.getDb();
    const cleanName = name.trim();
    const existing = db
      .prepare('SELECT id FROM brands WHERE name = ?')
      .get(cleanName) as { id: number } | undefined;

    if (existing) {
      return existing.id;
    }

    const uuid = crypto.randomUUID();
    const result = db
      .prepare(
        "INSERT INTO brands (uuid, name, is_active, created_at) VALUES (?, ?, 1, datetime('now'))"
      )
      .run(uuid, cleanName);

    return Number(result.lastInsertRowid);
  }

  /**
   * إنشاء منتج كامل مع الـ Variants والباركود داخل Transaction واحد
   */
  async createProduct(
    input: CreateProductInput,
    actorUserId?: number
  ): Promise<ProductWithVariants> {
    const db = this.getDb();
    let productId = 0;

    const createTx = db.transaction(() => {
      const productUuid = crypto.randomUUID();

      let categoryId = input.category_id ?? null;
      if (!categoryId && (input as any).category_name) {
        categoryId = this.getOrCreateCategory((input as any).category_name);
      }

      let brandId = input.brand_id ?? null;
      if (!brandId && (input as any).brand_name) {
        brandId = this.getOrCreateBrand((input as any).brand_name);
      }

      const insertProduct = db.prepare(`
        INSERT INTO products (
          uuid, category_id, brand_id, name_ar, name_en, unit, image_path, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
      `);

      const pResult = insertProduct.run(
        productUuid,
        categoryId,
        brandId,
        input.name_ar.trim(),
        input.name_en?.trim() ?? null,
        input.unit ?? 'قطعة',
        (input as any).image_path ?? null
      );
      productId = Number(pResult.lastInsertRowid);

      const insertVariant = db.prepare(`
        INSERT INTO product_variants (
          uuid, product_id, sku, name, sale_price, min_stock, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, 1)
      `);

      const insertBarcode = db.prepare(`
        INSERT INTO product_barcodes (variant_id, barcode, is_internal)
        VALUES (?, ?, ?)
      `);

      for (const vInput of input.variants) {
        const variantUuid = crypto.randomUUID();
        const salePrice = vInput.sale_price ?? vInput.selling_price ?? 0;
        const variantName = vInput.variant_name ?? vInput.name ?? null;
        const minStock = vInput.min_stock ?? vInput.min_stock_level ?? 0;
        const sku = vInput.sku?.trim() || null;

        const vResult = insertVariant.run(
          variantUuid,
          productId,
          sku,
          variantName,
          salePrice,
          minStock
        );
        const variantId = Number(vResult.lastInsertRowid);

        const barcodes = vInput.barcodes && vInput.barcodes.length > 0 ? vInput.barcodes : [];

        if (barcodes.length === 0) {
          // توليد باركود داخلي تلقائي للـ variant في حال لم يحدد المستخدم باركود
          db.prepare(`
            INSERT INTO counters (name, value) VALUES ('internal_barcode_seq', 1)
            ON CONFLICT(name) DO UPDATE SET value = value + 1
          `).run();
          const row = db
            .prepare("SELECT value FROM counters WHERE name = 'internal_barcode_seq'")
            .get() as { value: number };
          const autoBarcode = generateInternalBarcode(row.value, '200');
          insertBarcode.run(variantId, autoBarcode, 1);
        } else {
          barcodes.forEach((bCode) => {
            const cleanCode = bCode.trim();
            if (!cleanCode) return;

            // فحص هل الباركود مستخدم بالفعل لصنف آخر
            const existingBarcode = db
              .prepare('SELECT id, variant_id FROM product_barcodes WHERE barcode = ?')
              .get(cleanCode) as { id: number; variant_id: number } | undefined;

            if (existingBarcode) {
              const otherProd = db
                .prepare(
                  'SELECT is_active, name_ar FROM products WHERE id = (SELECT product_id FROM product_variants WHERE id = ?)'
                )
                .get(existingBarcode.variant_id) as { is_active: number; name_ar: string } | undefined;

              if (otherProd && otherProd.is_active === 0) {
                // الصنف السابق غير نشط/مؤرشف، نحرر الباركود لاستخدامه للصنف الجديد
                db.prepare('DELETE FROM product_barcodes WHERE id = ?').run(existingBarcode.id);
              } else {
                throw new Error(`الباركود "${cleanCode}" مسجل مسبقاً للصنف "${otherProd?.name_ar || 'آخر'}"`);
              }
            }

            const isInternal = cleanCode.startsWith('20') ? 1 : 0;
            insertBarcode.run(variantId, cleanCode, isInternal);
          });
        }

        // إنشاء الدفعة الافتتاحية للمخزون إذا تم إدخال رصيد أولي أكبر من الصفر
        const initialStock = Number((vInput as any).initial_stock) || 0;
        if (initialStock > 0) {
          const effectiveUserId = this.resolveUserId(db, actorUserId);
          const batchNo = `INIT-${Date.now().toString().slice(-6)}`;
          const batchRes = db.prepare(`
            INSERT INTO batches (variant_id, batch_no, expiry_date, unit_cost, qty_remaining, received_at)
            VALUES (?, ?, NULL, ?, 0, datetime('now'))
          `).run(variantId, batchNo, (vInput as any).cost_price ?? 0);
          const batchId = Number(batchRes.lastInsertRowid);

          // إدراج حركة المخزون (سيقوم مشغل trg_movement_apply بزيادة qty_remaining في الدفعة)
          db.prepare(`
            INSERT INTO stock_movements (batch_id, type, qty, ref_type, ref_id, user_id, note, created_at)
            VALUES (?, 'adjust_in', ?, 'initial_stock', ?, ?, 'رصيد مخزون افتتاحي عند إضافة المنتج', datetime('now'))
          `).run(batchId, initialStock, productId, effectiveUserId);
        }
      }

      const effectiveAuditUserId = this.resolveUserId(db, actorUserId);
      this.auditService.log({
        userId: effectiveAuditUserId,
        action: 'CREATE_PRODUCT',
        entityType: 'products',
        entityId: productId,
        details: { name_ar: input.name_ar, variants_count: input.variants.length },
      });
    });

    createTx();
    return this.getProductDetails(productId);
  }

  /**
   * تحديث بيانات المنتج والأسعار والـ Variants وتوثيق الفروقات بدقة
   */
  async updateProduct(
    id: number,
    input: UpdateProductInput,
    actorUserId?: number
  ): Promise<ProductWithVariants> {
    const db = this.getDb();

    const updateTx = db.transaction(() => {
      // 1. جلب البيانات القديمة للمقارنة وتوثيق الفروقات
      const oldProduct = this.getProductDetails(id);
      const primaryVariant = oldProduct.variants[0];

      let categoryId = input.category_id;
      if (categoryId === undefined && input.category_name && input.category_name.trim()) {
        categoryId = this.getOrCreateCategory(input.category_name);
      }

      let brandId = input.brand_id;
      if (brandId === undefined && input.brand_name && input.brand_name.trim()) {
        brandId = this.getOrCreateBrand(input.brand_name);
      } else if (input.brand_name === null || input.brand_name === '') {
        brandId = null;
      }

      const updates: string[] = ["updated_at = datetime('now')"];
      const params: any[] = [];

      if (input.name_ar !== undefined) {
        updates.push('name_ar = ?');
        params.push(input.name_ar.trim());
      }
      if (input.name_en !== undefined) {
        updates.push('name_en = ?');
        params.push(input.name_en?.trim() ?? null);
      }
      if (categoryId !== undefined) {
        updates.push('category_id = ?');
        params.push(categoryId);
      }
      if (brandId !== undefined) {
        updates.push('brand_id = ?');
        params.push(brandId);
      }
      if (input.unit !== undefined) {
        updates.push('unit = ?');
        params.push(input.unit);
      }
      if ((input as any).image_path !== undefined) {
        updates.push('image_path = ?');
        params.push((input as any).image_path ?? null);
      }
      if (input.is_active !== undefined) {
        updates.push('is_active = ?');
        params.push(input.is_active);
      }

      params.push(id);
      db.prepare(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`).run(...params);

      // 2. تحديث الـ Variant والأسعار
      const targetVariantId = input.variant_id || primaryVariant?.id;
      const targetSalePrice = input.sale_price !== undefined ? input.sale_price : input.selling_price;

      if (targetVariantId) {
        const vUpdates: string[] = [];
        const vParams: any[] = [];

        if (targetSalePrice !== undefined) {
          vUpdates.push('sale_price = ?');
          vParams.push(targetSalePrice);

          // فحص هل تغير السعر
          const oldPrice = primaryVariant?.sale_price ?? 0;
          if (oldPrice !== targetSalePrice) {
            // تسجيل في تاريخ تغير الأسعار
            try {
              db.prepare(`
                INSERT INTO product_price_history (variant_id, old_price, new_price, user_id, reason, created_at)
                VALUES (?, ?, ?, ?, ?, datetime('now'))
              `).run(
                targetVariantId,
                oldPrice,
                targetSalePrice,
                actorUserId ?? null,
                input.price_change_reason || 'تعديل السعر من بطاقة الصنف'
              );
            } catch {
              // احتياط أمان
            }

            // توثيق حركة تغيير السعر في سجل الرقابة
            if (actorUserId) {
              this.auditService.log({
                userId: actorUserId,
                action: 'PRODUCT_PRICE_CHANGED',
                entityType: 'products',
                entityId: id,
                details: {
                  product_name: input.name_ar || oldProduct.name_ar,
                  old_price: oldPrice,
                  new_price: targetSalePrice,
                  reason: input.price_change_reason,
                },
              });
            }
          }
        }

        if (input.min_stock !== undefined) {
          vUpdates.push('min_stock = ?');
          vParams.push(input.min_stock);
        }

        if (vUpdates.length > 0) {
          vParams.push(targetVariantId);
          db.prepare(`UPDATE product_variants SET ${vUpdates.join(', ')} WHERE id = ?`).run(...vParams);
        }

        // 3. تحديث الباركود
        const hasExplicitBarcode = input.barcodes !== undefined || input.barcode !== undefined;
        if (hasExplicitBarcode) {
          const barcodeList = input.barcodes || (input.barcode ? [input.barcode.trim()] : []);
          if (barcodeList.length === 0) {
            db.prepare('DELETE FROM product_barcodes WHERE variant_id = ?').run(targetVariantId);
          } else {
            const barcode = barcodeList[0].trim();
            if (barcode) {
              const existingSame = db
                .prepare('SELECT id FROM product_barcodes WHERE variant_id = ? AND barcode = ?')
                .get(targetVariantId, barcode);

              if (!existingSame) {
                const existingOther = db
                  .prepare('SELECT id, variant_id FROM product_barcodes WHERE barcode = ?')
                  .get(barcode) as { id: number; variant_id: number } | undefined;

                if (existingOther && existingOther.variant_id !== targetVariantId) {
                  // فحص ما إذا كان الباركود ينتمي لصنف غير نشط/مؤرشف لتحريره
                  const otherProd = db
                    .prepare(
                      'SELECT is_active FROM products WHERE id = (SELECT product_id FROM product_variants WHERE id = ?)'
                    )
                    .get(existingOther.variant_id) as { is_active: number } | undefined;

                  if (otherProd && otherProd.is_active === 0) {
                    db.prepare('DELETE FROM product_barcodes WHERE id = ?').run(existingOther.id);
                  } else {
                    throw new Error(`الباركود "${barcode}" مستخدم بالفعل لمنتج آخر`);
                  }
                }

                db.prepare('DELETE FROM product_barcodes WHERE variant_id = ?').run(targetVariantId);
                const isInternal = barcode.startsWith('20') ? 1 : 0;
                db.prepare('INSERT INTO product_barcodes (variant_id, barcode, is_internal) VALUES (?, ?, ?)').run(
                  targetVariantId,
                  barcode,
                  isInternal
                );
              }
            }
          }
        }

        // 4. تسوية رصيد المخزون في حال تم تحديده
        if ((input as any).stock !== undefined && (input as any).stock !== null) {
          const newStock = Number((input as any).stock);
          if (!isNaN(newStock) && newStock >= 0) {
            const effectiveUserId = this.resolveUserId(db, actorUserId);
            const batch = db
              .prepare('SELECT id, qty_remaining FROM batches WHERE variant_id = ? ORDER BY id ASC LIMIT 1')
              .get(targetVariantId) as { id: number; qty_remaining: number } | undefined;

            if (batch) {
              const diff = newStock - batch.qty_remaining;
              if (diff !== 0) {
                const moveType = diff > 0 ? 'adjust_in' : 'adjust_out';
                // مشغل trg_movement_apply يقوم تلقائياً بزيادة NEW.qty إلى batches.qty_remaining
                // لذلك يجب إدراج diff بإشارته (+ للزيادة، - للنقصان) بدون تعديل يدوي مباشر للدفعة
                db.prepare(`
                  INSERT INTO stock_movements (batch_id, type, qty, ref_type, ref_id, user_id, note, created_at)
                  VALUES (?, ?, ?, 'manual_adjustment', ?, ?, 'تسوية يدوية للرصيد من تعديل الصنف', datetime('now'))
                `).run(batch.id, moveType, diff, id, effectiveUserId);
              }
            } else if (newStock > 0) {
              const batchRes = db.prepare(`
                INSERT INTO batches (variant_id, batch_no, expiry_date, unit_cost, qty_remaining, received_at)
                VALUES (?, ?, NULL, 0, 0, datetime('now'))
              `).run(targetVariantId, `B-INIT-${id}`);
              const newBatchId = Number(batchRes.lastInsertRowid);
              db.prepare(`
                INSERT INTO stock_movements (batch_id, type, qty, ref_type, ref_id, user_id, note, created_at)
                VALUES (?, 'adjust_in', ?, 'initial_stock', ?, ?, 'رصيد مخزون من تعديل الصنف', datetime('now'))
              `).run(newBatchId, newStock, id, effectiveUserId);
            }
          }
        }
      }

      // 5. توثيق التحديث العام في سجل الرقابة
      const effectiveAuditUserId = this.resolveUserId(db, actorUserId);
      const changes: Record<string, { old: any; new: any }> = {};
      if (input.name_ar !== undefined && input.name_ar !== oldProduct.name_ar) {
        changes.name_ar = { old: oldProduct.name_ar, new: input.name_ar };
      }
      if (targetSalePrice !== undefined && targetSalePrice !== primaryVariant?.sale_price) {
        changes.sale_price = { old: primaryVariant?.sale_price, new: targetSalePrice };
      }
      if (input.unit !== undefined && input.unit !== oldProduct.unit) {
        changes.unit = { old: oldProduct.unit, new: input.unit };
      }

      this.auditService.log({
        userId: effectiveAuditUserId,
        action: 'UPDATE_PRODUCT',
        entityType: 'products',
        entityId: id,
        details: {
          changes,
          input_summary: input,
        },
      });
    });

    updateTx();
    return this.getProductDetails(id);
  }

  /**
   * حذف ذكي للمنتج (حذف نهائي إذا لم تكن له حركات، أو أرشفة آمنة إذا كانت له مبيعات/حركات سابقة)
   */
  async deleteProduct(id: number, actorUserId?: number): Promise<DeleteProductResult> {
    const db = this.getDb();
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id) as Product | undefined;
    if (!product) {
      throw new Error(`المنتج برقم ${id} غير موجود`);
    }

    const variants = db
      .prepare('SELECT id FROM product_variants WHERE product_id = ?')
      .all(id) as { id: number }[];
    const variantIds = variants.map((v) => v.id);

    let hasSales = false;
    let hasMovements = false;
    let hasPurchases = false;
    let hasRepairs = false;
    let hasReturns = false;
    let hasSoldSerials = false;
    let hasStockCounts = false;

    if (variantIds.length > 0) {
      const placeholders = variantIds.map(() => '?').join(',');

      // 1. فحص المبيعات
      const saleCount = db
        .prepare(`SELECT COUNT(*) as count FROM sale_items WHERE variant_id IN (${placeholders})`)
        .get(...variantIds) as { count: number };
      if (saleCount.count > 0) hasSales = true;

      // 2. فحص المشتريات
      const purchaseCount = db
        .prepare(`SELECT COUNT(*) as count FROM purchase_items WHERE variant_id IN (${placeholders})`)
        .get(...variantIds) as { count: number };
      if (purchaseCount.count > 0) hasPurchases = true;

      // 3. فحص قطع الغيار في الصيانة
      try {
        const repairCount = db
          .prepare(`SELECT COUNT(*) as count FROM repair_parts WHERE variant_id IN (${placeholders})`)
          .get(...variantIds) as { count: number };
        if (repairCount.count > 0) hasRepairs = true;
      } catch { }

      // 4. فحص المرتجعات
      try {
        const returnCount = db
          .prepare(`SELECT COUNT(*) as count FROM return_items WHERE variant_id IN (${placeholders})`)
          .get(...variantIds) as { count: number };
        const purchaseRetCount = db
          .prepare(`SELECT COUNT(*) as count FROM purchase_return_items WHERE variant_id IN (${placeholders})`)
          .get(...variantIds) as { count: number };
        if (returnCount.count > 0 || purchaseRetCount.count > 0) hasReturns = true;
      } catch { }

      // 5. فحص أجهزة الهواتف والسيريالات المباعة
      try {
        const soldSerialCount = db
          .prepare(`
            SELECT COUNT(*) as count FROM device_serials 
            WHERE variant_id IN (${placeholders}) AND (status = 'sold' OR sale_item_id IS NOT NULL)
          `)
          .get(...variantIds) as { count: number };
        if (soldSerialCount.count > 0) hasSoldSerials = true;
      } catch { }

      // 6. فحص عمليات الجرد
      try {
        const countCount = db
          .prepare(`SELECT COUNT(*) as count FROM stock_count_items WHERE variant_id IN (${placeholders})`)
          .get(...variantIds) as { count: number };
        if (countCount.count > 0) hasStockCounts = true;
      } catch { }

      // 7. فحص الدفعات ذات الرصيد أو الحركات
      const batches = db
        .prepare(`SELECT id, qty_remaining FROM batches WHERE variant_id IN (${placeholders})`)
        .all(...variantIds) as { id: number; qty_remaining: number }[];

      if (batches.length > 0) {
        const batchIds = batches.map((b) => b.id);
        const bPlaceholders = batchIds.map(() => '?').join(',');
        const moveCount = db
          .prepare(
            `SELECT COUNT(*) as count FROM stock_movements WHERE batch_id IN (${bPlaceholders}) AND type NOT IN ('adjust_in')`
          )
          .get(...batchIds) as { count: number };
        if (moveCount.count > 0) hasMovements = true;
      }
    }

    const hasHistory =
      hasSales || hasMovements || hasPurchases || hasRepairs || hasReturns || hasSoldSerials || hasStockCounts;

    const performSoftDelete = () => {
      db.transaction(() => {
        db.prepare("UPDATE products SET is_active = 0, updated_at = datetime('now') WHERE id = ?").run(id);
        if (variantIds.length > 0) {
          const placeholders = variantIds.map(() => '?').join(',');
          db.prepare(`UPDATE product_variants SET is_active = 0 WHERE id IN (${placeholders})`).run(...variantIds);
          // تحرير الباركودات المرتبطة لكي يتمكن المتجر من إعادة استخدامها إن رغب
          try {
            db.prepare(`DELETE FROM product_barcodes WHERE variant_id IN (${placeholders})`).run(...variantIds);
          } catch { }
        }

        if (actorUserId) {
          this.auditService.log({
            userId: actorUserId,
            action: 'ARCHIVE_PRODUCT',
            entityType: 'products',
            entityId: id,
            details: {
              product_name: product.name_ar,
              reason: 'أرشفة المنتج لوجود حركات مبيعات أو مشتريات أو صيانة سابقة',
              has_sales: hasSales,
              has_movements: hasMovements,
              has_repairs: hasRepairs,
            },
          });
        }
      })();
    };

    if (hasHistory) {
      // أرشفة آمنة (Soft Delete)
      performSoftDelete();

      return {
        success: true,
        action: 'archived',
        message: `تم أرشفة المنتج "${product.name_ar}" وإخفاؤه بنجاح نظراً لوجود مبيعات أو مشتريات أو عمليات صيانة سابقة مرتبطة به.`,
      };
    } else {
      // محاولة حذف نهائي كامل (Hard Delete) مع حماية أمان تلقائية
      try {
        db.transaction(() => {
          if (variantIds.length > 0) {
            const placeholders = variantIds.map(() => '?').join(',');

            // 1. حذف أجهزة وسيريالات الهواتف غير المباعة (in_stock) المرتبطة بالصنف
            try {
              db.prepare(`DELETE FROM device_serials WHERE variant_id IN (${placeholders})`).run(...variantIds);
            } catch { }

            // 2. حذف بنود الجرد المعلقة إن وجدت
            try {
              db.prepare(`DELETE FROM stock_count_items WHERE variant_id IN (${placeholders})`).run(...variantIds);
            } catch { }

            // 3. حذف حركات المخزون التابعة للـ batches أولاً لتفادي تعارض الـ Foreign Key
            const batchRows = db
              .prepare(`SELECT id FROM batches WHERE variant_id IN (${placeholders})`)
              .all(...variantIds) as { id: number }[];

            if (batchRows.length > 0) {
              const bPlaceholders = batchRows.map(() => '?').join(',');
              db.prepare(`DELETE FROM stock_movements WHERE batch_id IN (${bPlaceholders})`).run(
                ...batchRows.map((b) => b.id)
              );
            }

            db.prepare(`DELETE FROM product_barcodes WHERE variant_id IN (${placeholders})`).run(...variantIds);
            db.prepare(`DELETE FROM batches WHERE variant_id IN (${placeholders})`).run(...variantIds);

            try {
              db.prepare(`DELETE FROM product_price_history WHERE variant_id IN (${placeholders})`).run(...variantIds);
            } catch { }

            try {
              db.prepare(`DELETE FROM promotion_items WHERE variant_id IN (${placeholders}) OR product_id = ?`).run(...variantIds, id);
            } catch { }

            db.prepare(`DELETE FROM product_variants WHERE product_id = ?`).run(id);
          }

          db.prepare('DELETE FROM products WHERE id = ?').run(id);

          if (actorUserId) {
            this.auditService.log({
              userId: actorUserId,
              action: 'DELETE_PRODUCT',
              entityType: 'products',
              entityId: id,
              details: {
                product_name: product.name_ar,
                note: 'حذف نهائي لعدم وجود أي مبيعات أو حركات مخزون سابقة',
              },
            });
          }
        })();

        return {
          success: true,
          action: 'deleted',
          message: `تم حذف المنتج "${product.name_ar}" نهائياً من قاعدة البيانات بنجاح.`,
        };
      } catch (hardDeleteErr) {
        // في حال وجود أي قيد خارجي لم نتوقعه، نتحول تلقائياً للأرشفة الآمنة لمنع إحباط المستخدم
        performSoftDelete();
        return {
          success: true,
          action: 'archived',
          message: `تم أرشفة المنتج "${product.name_ar}" وإخفاؤه بنجاح لوجود ارتباطات سابقة به في النظام.`,
        };
      }
    }
  }

  /**
   * جلب سجل وتاريخ تغير أسعار المنتج
   */
  getProductPriceHistory(productId: number): ProductPriceHistory[] {
    const db = this.getDb();
    try {
      const rows = db
        .prepare(`
          SELECT 
            h.id,
            h.variant_id,
            h.old_price,
            h.new_price,
            h.user_id,
            u.display_name as user_name,
            h.reason,
            h.created_at
          FROM product_price_history h
          JOIN product_variants v ON h.variant_id = v.id
          LEFT JOIN users u ON h.user_id = u.id
          WHERE v.product_id = ?
          ORDER BY h.id DESC
        `)
        .all(productId) as ProductPriceHistory[];
      return rows;
    } catch {
      return [];
    }
  }

  /**
   * جلب كارت حركة الصنف (Stock Card)
   */
  getProductStockCard(productId: number): StockCardItem[] {
    const db = this.getDb();
    try {
      const rows = db
        .prepare(`
          SELECT 
            sm.id,
            sm.type,
            sm.qty,
            sm.ref_type,
            sm.ref_id,
            u.display_name as user_name,
            sm.note,
            sm.created_at,
            b.batch_no,
            b.expiry_date
          FROM stock_movements sm
          JOIN batches b ON sm.batch_id = b.id
          JOIN product_variants v ON b.variant_id = v.id
          LEFT JOIN users u ON sm.user_id = u.id
          WHERE v.product_id = ?
          ORDER BY sm.id DESC
          LIMIT 100
        `)
        .all(productId) as StockCardItem[];
      return rows;
    } catch {
      return [];
    }
  }

  /**
   * جلب تفاصيل منتج بالكامل مع جميع الـ variants والباركود والدفعات الحالية
   */
  getProductDetails(id: number): ProductWithVariants {
    const db = this.getDb();
    const product = db
      .prepare(`
        SELECT p.*, c.name as category_name, b.name as brand_name
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN brands b ON p.brand_id = b.id
        WHERE p.id = ?
      `)
      .get(id) as (Product & { category_name?: string; brand_name?: string }) | undefined;

    if (!product) {
      throw new Error(`المنتج غير موجود برقم: ${id}`);
    }

    const variants = db
      .prepare(`
        SELECT * FROM product_variants WHERE product_id = ? ORDER BY id ASC
      `)
      .all(id) as ProductVariant[];

    const variantDetails: VariantDetail[] = variants.map((v) => {
      const barcodes = db
        .prepare('SELECT barcode FROM product_barcodes WHERE variant_id = ? ORDER BY id ASC')
        .all(v.id) as { barcode: string }[];

      const stockRow = db
        .prepare(`
          SELECT COALESCE(SUM(qty_remaining), 0) AS total_stock
          FROM batches
          WHERE variant_id = ? AND qty_remaining > 0
        `)
        .get(v.id) as { total_stock: number } | undefined;

      const batches = db
        .prepare(`
          SELECT * FROM batches
          WHERE variant_id = ? AND qty_remaining > 0
          ORDER BY expiry_date ASC NULLS LAST, id ASC
        `)
        .all(v.id) as Batch[];

      return {
        ...v,
        selling_price: v.sale_price,
        sale_price: v.sale_price,
        variant_name: v.name,
        name: v.name,
        cost_price: 0,
        min_stock_level: v.min_stock,
        min_stock: v.min_stock,
        barcodes: barcodes.map((b) => b.barcode),
        total_stock: stockRow?.total_stock ?? 0,
        batches,
      };
    });

    return {
      ...product,
      variants: variantDetails,
    };
  }

  /**
   * البحث عن منتج بواسطة الباركود (مخصص لشاشة البيع POS)
   * يرجع تفاصيل المنتج + الـ Variant المطابق + الرصيد المتاح
   */
  async getProductByBarcode(barcode: string): Promise<ProductLookupResult | null> {
    const db = this.getDb();
    const cleanBarcode = barcode.trim();

    const row = db
      .prepare(`
        SELECT 
          pb.barcode,
          v.id as variant_id,
          v.product_id
        FROM product_barcodes pb
        JOIN product_variants v ON pb.variant_id = v.id
        JOIN products p ON v.product_id = p.id
        WHERE pb.barcode = ? AND p.is_active = 1 AND v.is_active = 1
      `)
      .get(cleanBarcode) as { barcode: string; variant_id: number; product_id: number } | undefined;

    if (!row) {
      return null;
    }

    const fullProduct = this.getProductDetails(row.product_id);
    const matchedVariant = fullProduct.variants.find((v) => v.id === row.variant_id);

    if (!matchedVariant) {
      return null;
    }

    return {
      product: fullProduct,
      variant: matchedVariant,
      matched_barcode: cleanBarcode,
      category_name: fullProduct.category_name,
      brand_name: fullProduct.brand_name,
      available_stock: matchedVariant.total_stock,
    };
  }

  /**
   * بحث سريع بالاسم والباركود و SKU مع دعم الفلاتر والصفحات
   */
  async searchProducts(
    query: string,
    options?: ProductSearchOptions
  ): Promise<ProductWithVariants[]> {
    const db = this.getDb();
    const limit = options?.limit ?? 500;
    const offset = ((options?.page ?? 1) - 1) * limit;

    const whereClauses: string[] = [];
    const params: any[] = [];

    const rawQuery = query.trim();
    if (rawQuery) {
      // توليد أنماط البحث العربية لتغطية كافة أشكال الهمزات والياء والتاء المربوطة
      const patterns = new Set<string>();
      patterns.add(rawQuery);
      patterns.add(rawQuery.replace(/[أإآ]/g, 'ا'));
      if (rawQuery.startsWith('ا')) {
        patterns.add('أ' + rawQuery.slice(1));
        patterns.add('إ' + rawQuery.slice(1));
        patterns.add('آ' + rawQuery.slice(1));
      }
      patterns.add(rawQuery.replace(/ة/g, 'ه'));
      patterns.add(rawQuery.replace(/ه/g, 'ة'));
      patterns.add(rawQuery.replace(/ى/g, 'ي'));
      patterns.add(rawQuery.replace(/ي/g, 'ى'));

      const subClauses: string[] = [];
      for (const p of patterns) {
        subClauses.push('p.name_ar LIKE ?');
        params.push(`%${p}%`);
      }
      // البحث أيضاً في الاسم الإنجليزي والـ SKU والباركود بالاستعلام
      subClauses.push('p.name_en LIKE ?');
      params.push(`%${rawQuery}%`);
      subClauses.push('v.sku LIKE ?');
      params.push(`%${rawQuery}%`);
      subClauses.push('pb.barcode LIKE ?');
      params.push(`%${rawQuery}%`);

      whereClauses.push(`(${subClauses.join(' OR ')})`);
    }

    if (options?.categoryId) {
      whereClauses.push('p.category_id = ?');
      params.push(options.categoryId);
    }

    if (options?.brandId) {
      whereClauses.push('p.brand_id = ?');
      params.push(options.brandId);
    }

    if (options?.isActive !== undefined) {
      whereClauses.push('p.is_active = ?');
      params.push(options.isActive ? 1 : 0);
    } else {
      // إرجاع الأصناف النشطة فقط افتراضياً واستبعاد المحذوف والمؤرشف
      whereClauses.push('p.is_active = 1');
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const productIdsRows = db
      .prepare(`
        SELECT DISTINCT p.id
        FROM products p
        LEFT JOIN product_variants v ON p.id = v.product_id
        LEFT JOIN product_barcodes pb ON v.id = pb.variant_id
        ${whereSql}
        ORDER BY p.id DESC
        LIMIT ? OFFSET ?
      `)
      .all(...params, limit, offset) as { id: number }[];

    return productIdsRows.map((r) => this.getProductDetails(r.id));
  }

  /**
   * أرشفة منتج (تعطيل النشاط)
   */
  async archiveProduct(id: number, actorUserId?: number): Promise<boolean> {
    const db = this.getDb();
    const archiveTx = db.transaction(() => {
      db.prepare("UPDATE products SET is_active = 0, updated_at = datetime('now') WHERE id = ?").run(id);
      db.prepare("UPDATE product_variants SET is_active = 0, updated_at = datetime('now') WHERE product_id = ?").run(id);

      if (actorUserId) {
        this.auditService.log({
          userId: actorUserId,
          action: 'ARCHIVE_PRODUCT',
          entityType: 'products',
          entityId: id,
        });
      }
    });

    archiveTx();
    return true;
  }

  /**
   * التحديث بالجملة للمنتجات (تعديل الأسعار، تغيير التصنيف، الأرشفة الجماعية)
   */
  async bulkUpdate(input: BulkUpdateProductsInput, actorUserId?: number): Promise<number> {
    const db = this.getDb();
    let updatedCount = 0;

    const bulkTx = db.transaction(() => {
      // 1. تحديث المنتجات المحددة
      if (input.product_ids && input.product_ids.length > 0) {
        const placeholders = input.product_ids.map(() => '?').join(',');
        if (input.category_id !== undefined) {
          db.prepare(`UPDATE products SET category_id = ? WHERE id IN (${placeholders})`).run(
            input.category_id,
            ...input.product_ids
          );
        }
        if (input.brand_id !== undefined) {
          db.prepare(`UPDATE products SET brand_id = ? WHERE id IN (${placeholders})`).run(
            input.brand_id,
            ...input.product_ids
          );
        }
        if (input.is_active !== undefined) {
          db.prepare(`UPDATE products SET is_active = ? WHERE id IN (${placeholders})`).run(
            input.is_active,
            ...input.product_ids
          );
          db.prepare(`UPDATE product_variants SET is_active = ? WHERE product_id IN (${placeholders})`).run(
            input.is_active,
            ...input.product_ids
          );
        }
        updatedCount += input.product_ids.length;
      }

      // 2. تعديل الأسعار للـ Variants
      if (input.price_adjustment) {
        let variantIds: number[] = input.variant_ids ?? [];
        if (variantIds.length === 0 && input.product_ids && input.product_ids.length > 0) {
          const placeholders = input.product_ids.map(() => '?').join(',');
          const vRows = db
            .prepare(`SELECT id FROM product_variants WHERE product_id IN (${placeholders})`)
            .all(...input.product_ids) as { id: number }[];
          variantIds = vRows.map((r) => r.id);
        }

        if (variantIds.length > 0) {
          for (const vId of variantIds) {
            const variant = db
              .prepare('SELECT sale_price FROM product_variants WHERE id = ?')
              .get(vId) as { sale_price: number } | undefined;

            if (variant) {
              let newPrice = variant.sale_price;
              if (input.price_adjustment.type === 'fixed') {
                newPrice = Math.max(0, newPrice + input.price_adjustment.value);
              } else if (input.price_adjustment.type === 'percentage') {
                const delta = Math.round((newPrice * input.price_adjustment.value) / 100);
                newPrice = Math.max(0, newPrice + delta);
              }

              db.prepare('UPDATE product_variants SET sale_price = ? WHERE id = ?').run(
                newPrice,
                vId
              );
            }
          }
        }
      }

      if (actorUserId) {
        this.auditService.log({
          userId: actorUserId,
          action: 'BULK_UPDATE_PRODUCTS',
          entityType: 'products',
          details: input as Record<string, unknown>,
        });
      }
    });

    bulkTx();
    return updatedCount;
  }
}

export const productsService = new ProductsService();
