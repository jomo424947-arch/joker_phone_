import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/main/db/migrator';
import { ProductsService } from '../../src/main/services/products.service';

describe('ProductsService', () => {
  let db: Database.Database;
  let productsService: ProductsService;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    productsService = new ProductsService(db);
  });

  afterEach(() => {
    db.close();
  });

  test('توليد باركود داخلي EAN-13 قياسي بالبادئة 200 وزيادة العداد', async () => {
    const barcode1 = await productsService.generateInternalBarcode();
    const barcode2 = await productsService.generateInternalBarcode();

    expect(barcode1.startsWith('200')).toBe(true);
    expect(barcode2.startsWith('200')).toBe(true);
    expect(barcode1.length).toBe(13);
    expect(barcode2.length).toBe(13);
    expect(barcode1).not.toBe(barcode2);
  });

  test('إنشاء منتج كامل مع variants و barcodes والبحث عنه بالباركود', async () => {
    const categoryId = productsService.getOrCreateCategory('العناية بالبشرة');
    const brandId = productsService.getOrCreateBrand('L\'Oreal');

    const product = await productsService.createProduct({
      name_ar: 'سيروم هيالورونيك أسيد',
      name_en: 'Hyaluronic Acid Serum',
      category_id: categoryId,
      brand_id: brandId,
      unit: 'عبوة',
      variants: [
        {
          variant_name: '30ml',
          sku: 'HYAL-30',
          cost_price: 15000,
          selling_price: 25000,
          min_stock_level: 5,
          barcodes: ['6221234567890'],
        },
        {
          variant_name: '50ml',
          sku: 'HYAL-50',
          cost_price: 22000,
          selling_price: 36000,
          min_stock_level: 3,
          barcodes: ['6221234567891'],
        },
      ],
    });

    expect(product.id).toBeDefined();
    expect(product.name_ar).toBe('سيروم هيالورونيك أسيد');
    expect(product.category_name).toBe('العناية بالبشرة');
    expect(product.brand_name).toBe("L'Oreal");
    expect(product.variants.length).toBe(2);
    expect(product.variants[0].barcodes).toContain('6221234567890');

    // فحص البحث بالباركود المخصص لنقطة البيع POS
    const lookup = await productsService.getProductByBarcode('6221234567890');
    expect(lookup).not.toBeNull();
    expect(lookup?.product.id).toBe(product.id);
    expect(lookup?.variant.variant_name).toBe('30ml');
    expect(lookup?.variant.selling_price).toBe(25000);
    expect(lookup?.matched_barcode).toBe('6221234567890');
  });

  test('البحث النصي المركب بالاسم والـ SKU', async () => {
    await productsService.createProduct({
      name_ar: 'أحمر شفاه مطفي',
      name_en: 'Matte Lipstick',
      variants: [
        {
          variant_name: 'أحمر كلاسيكي',
          sku: 'LIP-RED-01',
          selling_price: 12000,
          barcodes: ['1122334455667'],
        },
      ],
    });

    // بحث بالاسم العربي
    const searchAr = await productsService.searchProducts('شفاه');
    expect(searchAr.length).toBe(1);

    // بحث بالـ SKU
    const searchSku = await productsService.searchProducts('LIP-RED');
    expect(searchSku.length).toBe(1);

    // بحث بالباركود
    const searchBarcode = await productsService.searchProducts('1122334455667');
    expect(searchBarcode.length).toBe(1);

    // بحث غير مطابق
    const searchEmpty = await productsService.searchProducts('غير موجود');
    expect(searchEmpty.length).toBe(0);
  });

  test('تحديث الأسعار بالجملة bulkUpdate', async () => {
    const product = await productsService.createProduct({
      name_ar: 'كريم مرطب',
      variants: [
        {
          variant_name: 'حجم عادي',
          selling_price: 10000, // 100 ج.م
          barcodes: ['9988776655443'],
        },
      ],
    });

    // زيادة بنسبة 10%
    await productsService.bulkUpdate({
      product_ids: [product.id],
      price_adjustment: {
        type: 'percentage',
        value: 10,
      },
    });

    const updated = productsService.getProductDetails(product.id);
    expect(updated.variants[0].selling_price).toBe(11000); // 110 ج.م
  });

  test('أرشفة المنتج وتعطيل نشاطه ودرجاته بنجاح archiveProduct', async () => {
    const product = await productsService.createProduct({
      name_ar: 'ماسكارا لتكثيف الرموش',
      variants: [
        {
          variant_name: 'أسود داكن',
          selling_price: 8500,
          barcodes: ['7766554433221'],
        },
      ],
    });

    const archiveSuccess = await productsService.archiveProduct(product.id);
    expect(archiveSuccess).toBe(true);

    const row = db
      .prepare('SELECT is_active, updated_at FROM products WHERE id = ?')
      .get(product.id) as { is_active: number; updated_at: string };
    expect(row.is_active).toBe(0);
    expect(row.updated_at).toBeDefined();

    const variantRow = db
      .prepare('SELECT is_active, updated_at FROM product_variants WHERE product_id = ?')
      .get(product.id) as { is_active: number; updated_at: string };
    expect(variantRow.is_active).toBe(0);
    expect(variantRow.updated_at).toBeDefined();
  });

  test('حذف منتج بدون حركات سابقة يتم حذفه نهائياً بنجاح (Hard Delete)', async () => {
    const product = await productsService.createProduct({
      name_ar: 'جراب سليكون آيفون 13',
      variants: [
        {
          variant_name: 'شفاف',
          selling_price: 5000,
          barcodes: ['1234567890128'],
        },
      ],
    });

    const res = await productsService.deleteProduct(product.id);
    expect(res.success).toBe(true);
    expect(res.action).toBe('deleted');

    const check = db.prepare('SELECT id FROM products WHERE id = ?').get(product.id);
    expect(check).toBeUndefined();
  });

  test('حذف منتج مرتبط بقطع غيار صيانة أو سيريالات يتم أرشفته آلياً دون أي خطأ (Soft Delete)', async () => {
    const product = await productsService.createProduct({
      name_ar: 'شاشة آيفون 12 برو أصلية',
      variants: [
        {
          variant_name: 'أسود',
          selling_price: 350000,
          barcodes: ['1234567890999'],
        },
      ],
    });

    const variantId = product.variants[0].id;

    // إنشاء مستخدم للنظام ومحاكاة استهلاك القطعة في أمر صيانة
    db.prepare(`
      INSERT INTO users (id, uuid, username, display_name, role, password_hash, created_at)
      VALUES (1, 'user-uuid-1', 'admin', 'مدير', 'owner', 'hash123', datetime('now'))
    `).run();

    db.prepare(`
      INSERT INTO repair_orders (uuid, seq_no, repair_code, customer_name, customer_phone, user_id, device_brand, device_model, reported_issue)
      VALUES ('repair-test-uuid', 9999, 'REP-9999', 'عميل تجربة', '01000000000', 1, 'Apple', 'iPhone 12 Pro', 'شاشة مكسورة')
    `).run();

    const repair = db.prepare("SELECT id FROM repair_orders WHERE repair_code = 'REP-9999'").get() as { id: number };

    db.prepare(`
      INSERT INTO repair_parts (repair_id, variant_id, item_name, qty, unit_cost, unit_price)
      VALUES (?, ?, 'شاشة آيفون 12 برو', 1, 200000, 350000)
    `).run(repair.id, variantId);

    // محاولة حذف المنتج
    const res = await productsService.deleteProduct(product.id);
    expect(res.success).toBe(true);
    expect(res.action).toBe('archived');

    // المنتج أصبح غير نشط
    const p = db.prepare('SELECT is_active FROM products WHERE id = ?').get(product.id) as { is_active: number };
    expect(p.is_active).toBe(0);
  });
});
