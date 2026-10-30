import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/main/db/migrator';
import { RepairsService } from '../../src/main/services/repairs.service';
import { SerialsService } from '../../src/main/services/serials.service';
import { AuthService } from '../../src/main/services/auth.service';
import { USER_ROLES } from '../../src/shared/constants/roles';

describe('Joker Phone Extensions (Repairs & Serials)', () => {
  let db: Database.Database;
  let repairsService: RepairsService;
  let serialsService: SerialsService;
  let userId: number;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);

    repairsService = new RepairsService(db);
    serialsService = new SerialsService(db);

    const authService = new AuthService(db);
    const user = authService.createUser({
      username: 'tech_joker',
      display_name: 'فني الجوكر فون',
      password: 'password123',
      pin: '5566',
      role: USER_ROLES.MANAGER,
    });
    userId = user.id;

    // إضافة وردية تجريبية
    db.prepare(`
      INSERT INTO shifts (id, uuid, user_id, opening_balance, status, opened_at)
      VALUES (1, 'shift-uuid-1', ?, 50000, 'open', datetime('now'))
    `).run(userId);
  });

  afterEach(() => {
    db.close();
  });

  test('دورة استلام أمر صيانة وتحديث حالته وحساب العربون والمتبقي', async () => {
    // 1. استلام جهاز
    const order = await repairsService.create(
      {
        customerName: 'محمود حسن',
        customerPhone: '01012345678',
        deviceBrand: 'Apple',
        deviceModel: 'iPhone 13 Pro',
        deviceColor: 'أزرق سيرالي',
        reportedIssue: 'كسر باغة وشاشة لا تستجيب للمس',
        estimatedCost: 150000, // 1500 ج.م
        depositAmount: 50000,  // 500 ج.م عربون
        warrantyDays: 60,
      },
      userId,
      1
    );

    expect(order.id).toBeDefined();
    expect(order.repairCode).toBe('REP-0001');
    expect(order.status).toBe('received');
    expect(order.depositAmount).toBe(50000);
    expect(order.remainingAmount).toBe(100000); // 1500 - 500 = 1000 ج.م

    // 2. تحديث الحالة إلى قيد الفحص ثم جاري الإصلاح
    const inspecting = await repairsService.updateStatus(order.id, 'inspecting', userId, 'تم فك الجهاز وبدء الفحص');
    expect(inspecting.status).toBe('inspecting');

    const inProgress = await repairsService.updateStatus(order.id, 'in_progress', userId, 'تركيب شاشة جديدة');
    expect(inProgress.status).toBe('in_progress');

    // 3. الترقية إلى جاهز للتسليم
    const ready = await repairsService.updateStatus(order.id, 'ready', userId, 'الجهاز تم إصلاحه واختباره بنجاح');
    expect(ready.status).toBe('ready');
    expect(ready.readyAt).toBeDefined();

    // 4. تسليم الجهاز والمحاسبة
    const delivered = await repairsService.updateStatus(order.id, 'delivered', userId, 'تم تسليم الجهاز واستلام باقي الحساب');
    expect(delivered.status).toBe('delivered');
    expect(delivered.deliveredAt).toBeDefined();
    expect(delivered.paidAmount).toBe(delivered.totalCost);

    // 5. فحص سجل المراحل
    const finalOrder = await repairsService.getById(order.id);
    expect(finalOrder?.logs?.length).toBe(5); // received + inspecting + in_progress + ready + delivered
  });



  test('تسجيل فاتورة عربون الصيانة في سجل الفواتير والخزينة وتسوية المتبقي عند التسليم بفاتورة منفصلة', async () => {
    // سيناريو المستخدم: استلام جهاز بتكلفة 1000 جنيه، دفع عربون 200 جنيه
    // 1. استلام الجهاز مع عربون 200 ج.م
    const order = await repairsService.create(
      {
        customerName: 'أحمد سعيد',
        customerPhone: '01234567890',
        deviceBrand: 'Apple',
        deviceModel: 'iPhone 14',
        reportedIssue: 'تغيير شاشة كاملة أصلية',
        estimatedCost: 100000, // 1000 ج.م
        depositAmount: 20000,  // 200 ج.م عربون
        depositMethod: 'cash',
      },
      userId,
      1
    );

    expect(order.repairCode).toBe('REP-0001');
    expect(order.totalCost).toBe(100000);
    expect(order.depositAmount).toBe(20000);
    expect(order.paidAmount).toBe(20000);
    expect(order.remainingAmount).toBe(80000); // 800 ج.م متبقي
    expect(order.depositInvoiceNo).toBeDefined(); // تم إصدار رقم فاتورة للعربون
    expect(order.depositInvoiceId).toBeDefined();

    // التحقق من إدراج فاتورة العربون في جدول sales
    const depositSale = db
      .prepare('SELECT * FROM sales WHERE id = ?')
      .get(order.depositInvoiceId) as any;
    expect(depositSale).toBeDefined();
    expect(depositSale.total).toBe(20000);
    expect(depositSale.status).toBe('completed');
    expect(depositSale.notes).toContain(order.repairCode);

    // التحقق من إدراج حركة نقدية موجبة في الوردية والخزينة بقيمة 200 ج.م
    const cashDeposit = db
      .prepare("SELECT * FROM cash_movements WHERE ref_type = 'repair_deposit' AND ref_id = ?")
      .get(order.id) as any;
    expect(cashDeposit).toBeDefined();
    expect(cashDeposit.amount).toBe(20000);

    // 2. ترقية الجهاز إلى جاهز للتسليم
    await repairsService.updateStatus(order.id, 'ready', userId);

    // 3. تسليم الجهاز والمحاسبة على باقي الـ 800 ج.م
    const deliveredOrder = await repairsService.deliverAndSettle({
      id: order.id,
      paymentMethod: 'cash',
      userId,
      shiftId: 1,
      note: 'تم تسليم الجهاز للعميل واختبار الشاشة واستلام باقي الحساب',
    });

    expect(deliveredOrder.status).toBe('delivered');
    expect(deliveredOrder.paidAmount).toBe(100000);
    expect(deliveredOrder.remainingAmount).toBe(0);
    expect(deliveredOrder.deliveryInvoiceNo).toBeDefined();
    expect(deliveredOrder.deliveryInvoiceId).toBeDefined();

    // التحقق من إدراج فاتورة التسوية لباقي المبلغ (800 ج.م) في sales
    const deliverySale = db
      .prepare('SELECT * FROM sales WHERE id = ?')
      .get(deliveredOrder.deliveryInvoiceId) as any;
    expect(deliverySale).toBeDefined();
    expect(deliverySale.total).toBe(80000);
    expect(deliverySale.notes).toContain('تسليم ومحاسبة صيانة');
    expect(deliverySale.notes).toContain(order.repairCode);

    // التحقق من حركة الخزنة لباقي المبلغ (800 ج.م)
    const cashDelivery = db
      .prepare("SELECT * FROM cash_movements WHERE ref_type = 'repair_delivery' AND ref_id = ?")
      .get(order.id) as any;
    expect(cashDelivery).toBeDefined();
    expect(cashDelivery.amount).toBe(80000);

    // إجمالي الفلوس المدخلة في الوردية من هذا الجهاز = 200 + 800 = 1000 ج.م
    const totalRepairCash = db
      .prepare("SELECT SUM(amount) as sum FROM cash_movements WHERE ref_type IN ('repair_deposit', 'repair_delivery') AND ref_id = ?")
      .get(order.id) as any;
    expect(totalRepairCash.sum).toBe(100000); // 1000 ج.م بالضبط!
  });

  test('استلام جهاز وتسليمه بدون فتح وردية مسبقة وبدون معرف وردية ينجح آلياً وبدون أي أخطاء قيود', async () => {
    // إغلاق أي وردية مفتوحة لمحاكاة عدم وجود وردية
    db.prepare("UPDATE shifts SET status = 'closed'").run();

    const order = await repairsService.create(
      {
        customerName: 'طارق علي',
        customerPhone: '01123456789',
        deviceBrand: 'Samsung',
        deviceModel: 'Galaxy S22',
        reportedIssue: 'سوكت الشحن لا يشحن',
        estimatedCost: 60000,
        depositAmount: 20000,
        depositMethod: 'cash',
      },
      userId
      // بدون تمرير shiftId
    );

    expect(order.id).toBeDefined();
    expect(order.depositInvoiceId).toBeDefined();

    // التحقق من إنشاء وردية تلقائياً
    const autoShift = db.prepare("SELECT * FROM shifts WHERE status = 'open'").get() as any;
    expect(autoShift).toBeDefined();

    // تسليم الجهاز بدون تمرير shiftId
    const delivered = await repairsService.deliverAndSettle({
      id: order.id,
      paymentMethod: 'cash',
      userId,
    });

    expect(delivered.status).toBe('delivered');
    expect(delivered.deliveryInvoiceId).toBeDefined();
  });

  test('استلام جهاز بمعرف مستخدم غير موجود يحل المشكلة تلقائياً دون حدوث Foreign Key constraint failed', async () => {
    const order = await repairsService.create(
      {
        customerName: 'كريم فاروق',
        customerPhone: '01511223344',
        deviceBrand: 'Xiaomi',
        deviceModel: 'Redmi Note 12',
        reportedIssue: 'سماعة المكالمات مكتومة',
        estimatedCost: 30000,
        depositAmount: 10000,
      },
      999999 // معرف مستخدم غير موجود إطلاقاً
    );

    expect(order.id).toBeDefined();
    expect(order.userId).toBe(userId); // تم حله للمستخدم الصالح الوحيد في النظام
  });
});
