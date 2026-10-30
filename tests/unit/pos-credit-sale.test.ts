import { describe, test, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/main/db/migrator';
import { SalesService } from '../../src/main/services/sales.service';
import { ProductsService } from '../../src/main/services/products.service';
import { CustomersService } from '../../src/main/services/customers.service';
import { CashService } from '../../src/main/services/cash.service';
import { AuthService } from '../../src/main/services/auth.service';
import { USER_ROLES } from '../../src/shared/constants/roles';

describe('POS Credit Sale & Customer Workflow (البيع بالآجل وتحديد العميل)', () => {
  let db: Database.Database;
  let salesService: SalesService;
  let productsService: ProductsService;
  let customersService: CustomersService;
  let cashService: CashService;
  let authService: AuthService;

  let cashierId: number;
  let shiftId: number;
  let variantId: number;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);

    salesService = new SalesService(db);
    productsService = new ProductsService(db);
    customersService = new CustomersService(db);
    cashService = new CashService(db);
    authService = new AuthService(db);

    const cashier = authService.createUser({
      username: 'pos_cashier',
      display_name: 'كاشير نقطة البيع',
      password: 'pos',
      pin: '1234',
      role: USER_ROLES.CASHIER,
    });
    cashierId = cashier.id;

    const shift = await cashService.openShift(cashierId, 100000);
    shiftId = shift.id;

    // إنشاء صنف تليفون / إكسسوار
    const product = await productsService.createProduct({
      name_ar: 'سماعة بلوتوث لاسلكية',
      variants: [
        {
          variant_name: 'أسود',
          selling_price: 25000, // 250 ج.م
          barcodes: ['6221000200300'],
        },
      ],
    });
    variantId = product.variants[0].id;

    // إضافة رصيد مخزني
    db.prepare(`
      INSERT INTO batches (variant_id, batch_no, expiry_date, unit_cost, qty_remaining, received_at)
      VALUES (?, 'BATCH-001', '2028-01-01', 15000, 20, datetime('now'))
    `).run(variantId);
  });

  test('منع إتمام البيع بالآجل دون تحديد معرف العميل', async () => {
    await expect(
      salesService.createSale(
        {
          items: [{ variant_id: variantId, qty: 1, unit_price: 25000, discount_amount: 0 }],
          payments: [{ method: 'credit', amount: 25000 }],
          discount_amount: 0,
        },
        cashierId,
        shiftId
      )
    ).rejects.toThrow('لا يمكن إتمام البيع الآجل دون تحديد عميل مسجل في النظام');
  });

  test('تسجيل عميل جديد وإتمام البيع بالآجل وتحديث رصيد المديونية تلقائياً', async () => {
    // 1. تسجيل عميل جديد
    const customer = await customersService.create(
      {
        name: 'أحمد محمود التاجر',
        phone: '01012345678',
        credit_limit: 100000, // 1,000 ج.م حد ائتماني
      },
      cashierId
    );

    expect(customer.id).toBeDefined();
    expect(customer.balance).toBe(0);

    // 2. إتمام عملية بيع بالآجل (250 ج.م)
    const sale = await salesService.createSale(
      {
        customer_id: customer.id,
        items: [{ variant_id: variantId, qty: 1, unit_price: 25000, discount_amount: 0 }],
        payments: [{ method: 'credit', amount: 25000 }],
        discount_amount: 0,
      },
      cashierId,
      shiftId
    );

    expect(sale.id).toBeDefined();
    expect(sale.total).toBe(25000);

    // 3. التحقق من تحديث رصيد العميل المدين
    const updatedCustomer = await customersService.getById(customer.id);
    expect(updatedCustomer?.balance).toBe(25000); // 250 ج.م
  });

  test('منع تجاوز الحد الائتماني المسموح به للعميل', async () => {
    // عميل بحد ائتماني 200 ج.م فقط
    const customer = await customersService.create(
      {
        name: 'عميل محدود الائتمان',
        phone: '01122334455',
        credit_limit: 20000, // 200 ج.م
      },
      cashierId
    );

    // محاولة بيع بالآجل بقيمة 250 ج.م (تتجاوز الـ 200 ج.م)
    await expect(
      salesService.createSale(
        {
          customer_id: customer.id,
          items: [{ variant_id: variantId, qty: 1, unit_price: 25000, discount_amount: 0 }],
          payments: [{ method: 'credit', amount: 25000 }],
          discount_amount: 0,
        },
        cashierId,
        shiftId
      )
    ).rejects.toThrow(/يتجاوز الحد الائتماني/);
  });

  test('دعم البيع بالدفع المجزأ (كاش + آجل) وتحديث مديونية العميل بالجزء الآجل فقط', async () => {
    const customer = await customersService.create(
      {
        name: 'كريم عبد الله',
        phone: '01299887766',
        credit_limit: 50000, // 500 ج.م
      },
      cashierId
    );

    // شراء قطعتين بقيمة 500 ج.م: دفع 200 ج.م كاش و 300 ج.م آجل
    const sale = await salesService.createSale(
      {
        customer_id: customer.id,
        items: [{ variant_id: variantId, qty: 2, unit_price: 25000, discount_amount: 0 }],
        payments: [
          { method: 'cash', amount: 20000 }, // 200 ج.م
          { method: 'credit', amount: 30000 }, // 300 ج.م
        ],
        discount_amount: 0,
      },
      cashierId,
      shiftId
    );

    expect(sale.id).toBeDefined();

    // رصيد مديونية العميل يجب أن يصبح 300 ج.م فقط
    const updatedCustomer = await customersService.getById(customer.id);
    expect(updatedCustomer?.balance).toBe(30000);
  });
});
