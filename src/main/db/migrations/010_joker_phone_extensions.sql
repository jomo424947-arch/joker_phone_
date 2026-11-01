-- ============================================================================
-- Migration 010: Mobix Store Extensions
-- تمديدات وهيكلة نظام موبيكس لإدارة محلات الموبايلات والاكسسوارات والصيانة
-- ============================================================================

-- 1. تحديث الإعدادات الافتراضية إلى هوية موبيكس
UPDATE settings 
SET value = 'موبيكس - Mobix', updated_at = datetime('now')
WHERE key = 'store_name' AND value IN ('محل مستحضرات التجميل', 'بوتيك جوري - Boutique Gouri', 'الجوكر فون - JOKER PHONE');

UPDATE settings 
SET value = 'موبيكس - شريكك الذكي لإدارة محلات الموبايلات', updated_at = datetime('now')
WHERE key = 'receipt_header';

UPDATE settings 
SET value = 'شكراً لتعاملكم مع موبيكس - ضمان وجودة في كل جهاز', updated_at = datetime('now')
WHERE key = 'receipt_footer';

INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES 
    ('warranty_default_days', '30', datetime('now')),
    ('repair_receipt_header', 'موبيكس - إيصال استلام صيانة', datetime('now')),
    ('repair_terms', '1. المحل غير مسؤول عن الأجهزة المتروكة أكثر من 30 يوماً بعد إبلاغ العميل بالجاهزية.\n2. الضمان لا يشمل سوء الاستخدام أو الكسر أو التعرض للماء أو محاولة فك الجهاز خارج المحل.', datetime('now'));

-- 2. عداد متسلسل لأوامر الصيانة بدون فجوات
INSERT OR IGNORE INTO counters (name, value) VALUES ('repair_seq', 0);
INSERT OR IGNORE INTO counters (name, value) VALUES ('used_purchase_seq', 0);

-- 3. جدول تتبع سيريال الأجهزة والـ IMEI الفردي لكل هاتف
CREATE TABLE IF NOT EXISTS device_serials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    variant_id INTEGER NOT NULL REFERENCES product_variants(id),
    imei_1 TEXT NOT NULL UNIQUE,
    imei_2 TEXT,
    serial_no TEXT,
    battery_health INTEGER,                                  -- نسبة صحة البطارية للأجهزة المستعملة (مثلاً 85)
    condition TEXT NOT NULL DEFAULT 'new' CHECK (condition IN ('new', 'used_like_new', 'used_good', 'used_fair')),
    status TEXT NOT NULL DEFAULT 'in_stock' CHECK (status IN ('in_stock', 'sold', 'in_repair', 'returned', 'reserved')),
    warranty_months INTEGER NOT NULL DEFAULT 12,            -- مدة الضمان بالأشهر
    sale_item_id INTEGER REFERENCES sale_items(id),         -- ربط مع البند المباع في الفاتورة
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 4. جدول أوامر الصيانة الشامل (Repair Orders)
CREATE TABLE IF NOT EXISTS repair_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE,
    seq_no INTEGER NOT NULL UNIQUE,                         -- ترقيم متسلسل محاسبي
    repair_code TEXT NOT NULL UNIQUE,                       -- كود مقروء للعميل مثل REP-1001
    customer_id INTEGER REFERENCES customers(id),
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    technician_id INTEGER REFERENCES users(id),             -- الفني المعين
    user_id INTEGER NOT NULL REFERENCES users(id),          -- المستخدم المستلم للجهاز
    shift_id INTEGER REFERENCES shifts(id),                 -- وردية الاستلام
    
    device_brand TEXT NOT NULL,                             -- Apple, Samsung, Xiaomi...
    device_model TEXT NOT NULL,                             -- iPhone 13 Pro Max, Galaxy S23...
    device_color TEXT,
    imei_serial TEXT,
    passcode_pattern TEXT,                                  -- كلمة المرور أو النمط لاختبار الجهاز
    
    reported_issue TEXT NOT NULL,                           -- العطل المشتكى منه
    inspection_notes TEXT,                                  -- ملاحظات الفني الأولية
    device_condition TEXT,                                  -- حالة الجهاز (خدوش، كسور...)
    received_accessories TEXT,                              -- ملحقات مستلمة مع الجهاز (جراب، شاحن...) JSON
    
    estimated_cost INTEGER NOT NULL DEFAULT 0,              -- التكلفة المبدئية بالقروش
    deposit_amount INTEGER NOT NULL DEFAULT 0,              -- العربون المدفوع بالقروش
    labor_cost INTEGER NOT NULL DEFAULT 0,                  -- تكلفة المصنعية / أجر اليد بالقروش
    parts_cost INTEGER NOT NULL DEFAULT 0,                  -- تكلفة قطع الغيار بالقروش
    total_cost INTEGER NOT NULL DEFAULT 0,                  -- التكلفة الإجمالية بالقروش
    paid_amount INTEGER NOT NULL DEFAULT 0,                 -- إجمالي المدفوع بالقروش
    
    status TEXT NOT NULL DEFAULT 'received' CHECK (status IN (
        'received',         -- تم الاستلام
        'inspecting',       -- قيد الفحص
        'pending_approval', -- بانتظار موافقة العميل على التكلفة
        'in_progress',      -- جاري الإصلاح
        'ready',            -- تم الإصلاح وجاهز للتسليم
        'delivered',        -- تم التسليم والمحاسبة
        'cancelled'         -- تعذر الإصلاح أو ملغي
    )),
    
    warranty_days INTEGER NOT NULL DEFAULT 30,              -- فترة ضمان الصيانة بالأيام
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    ready_at TEXT,
    delivered_at TEXT,
    notes TEXT
);

-- 5. جدول قطع الغيار المستخدمة في أمر الصيانة (Repair Consumed Parts)
CREATE TABLE IF NOT EXISTS repair_parts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repair_id INTEGER NOT NULL REFERENCES repair_orders(id) ON DELETE CASCADE,
    variant_id INTEGER NOT NULL REFERENCES product_variants(id),
    batch_id INTEGER REFERENCES batches(id),
    item_name TEXT NOT NULL,                                -- اسم القطعة لقطة وقت الاستهلاك
    qty INTEGER NOT NULL DEFAULT 1 CHECK (qty > 0),
    unit_cost INTEGER NOT NULL DEFAULT 0,                   -- تكلفة القطعة بالقروش
    unit_price INTEGER NOT NULL DEFAULT 0,                  -- السعر المحسوب على العميل بالقروش
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 6. سجل مراحل وحالات أمر الصيانة (Repair Logs)
CREATE TABLE IF NOT EXISTS repair_status_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repair_id INTEGER NOT NULL REFERENCES repair_orders(id) ON DELETE CASCADE,
    old_status TEXT,
    new_status TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id),
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 7. جدول معاملات المحافظ الإلكترونية وشحن الرصيد (Vodafone Cash, InstaPay, etc.)
CREATE TABLE IF NOT EXISTS wallet_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shift_id INTEGER NOT NULL REFERENCES shifts(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    wallet_type TEXT NOT NULL CHECK (wallet_type IN ('vodafone_cash', 'instapay', 'orange_cash', 'etisalat_cash', 'we_pay', 'other')),
    tx_type TEXT NOT NULL CHECK (tx_type IN ('cash_in', 'cash_out')), -- cash_in = إيداع للعميل، cash_out = سحب كاش من العميل
    customer_phone TEXT,
    amount INTEGER NOT NULL CHECK (amount > 0),              -- المبلغ بالقروش
    fee_commission INTEGER NOT NULL DEFAULT 0,              -- عمولة المحل بالقروش
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 8. عقود شراء واستبدال الأجهزة المستعملة (Trade-In / Used Purchases)
CREATE TABLE IF NOT EXISTS used_phone_purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE,
    seq_no INTEGER NOT NULL UNIQUE,
    purchase_code TEXT NOT NULL UNIQUE,                     -- كود الشراء المستعمل مثل USE-1001
    seller_name TEXT NOT NULL,                              -- اسم العميل البائع
    seller_national_id TEXT,                                -- الرقم القومي للعميل لحماية المحل
    seller_phone TEXT NOT NULL,
    device_brand TEXT NOT NULL,
    device_model TEXT NOT NULL,
    imei_1 TEXT NOT NULL,
    imei_2 TEXT,
    serial_no TEXT,
    device_condition TEXT,
    purchase_price INTEGER NOT NULL CHECK (purchase_price >= 0), -- سعر الشراء بالقروش
    suggested_sale_price INTEGER NOT NULL CHECK (suggested_sale_price >= 0),
    user_id INTEGER NOT NULL REFERENCES users(id),
    shift_id INTEGER REFERENCES shifts(id),
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 9. الفهارس لتسريع البحث
CREATE INDEX IF NOT EXISTS idx_device_serials_imei1 ON device_serials(imei_1);
CREATE INDEX IF NOT EXISTS idx_device_serials_variant ON device_serials(variant_id);
CREATE INDEX IF NOT EXISTS idx_device_serials_status ON device_serials(status);
CREATE INDEX IF NOT EXISTS idx_repair_orders_code ON repair_orders(repair_code);
CREATE INDEX IF NOT EXISTS idx_repair_orders_customer_phone ON repair_orders(customer_phone);
CREATE INDEX IF NOT EXISTS idx_repair_orders_status ON repair_orders(status);
CREATE INDEX IF NOT EXISTS idx_repair_orders_created ON repair_orders(created_at);
CREATE INDEX IF NOT EXISTS idx_repair_parts_repair ON repair_parts(repair_id);
CREATE INDEX IF NOT EXISTS idx_repair_status_logs_repair ON repair_status_logs(repair_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_shift ON wallet_transactions(shift_id);
CREATE INDEX IF NOT EXISTS idx_used_purchases_imei ON used_phone_purchases(imei_1);

-- 10. التصنيفات الافتراضية لمحلات الهواتف والاكسسوارات والصيانة
INSERT OR IGNORE INTO categories (uuid, name, is_active, created_at) VALUES
    ('cat-phones-01', 'هواتف ذكية (Smartphones)', 1, datetime('now')),
    ('cat-phones-02', 'هواتف مستعملة ومجددة (Used Phones)', 1, datetime('now')),
    ('cat-phones-03', 'شواحن وكابلات شحن (Chargers & Cables)', 1, datetime('now')),
    ('cat-phones-04', 'سماعات وايرلس وسلكية (Headphones & Audio)', 1, datetime('now')),
    ('cat-phones-05', 'جرابات واسكرينات حماية (Cases & Screen Protectors)', 1, datetime('now')),
    ('cat-phones-06', 'باور بانك وبطاريات (Power Banks & Batteries)', 1, datetime('now')),
    ('cat-phones-07', 'قطع غيار وشاشات (Spare Parts & Screens)', 1, datetime('now')),
    ('cat-phones-08', 'ساعات وسوارات ذكية (Smart Watches & Bands)', 1, datetime('now')),
    ('cat-phones-09', 'خدمات الصيانة والورشة (Repairs & Services)', 1, datetime('now')),
    ('cat-phones-10', 'خدمات دفع وشحن محافظ (Electronic Wallets)', 1, datetime('now'));

-- 11. الماركات والبراندات التجارية الأكثر طلباً في سوق الهواتف
INSERT OR IGNORE INTO brands (uuid, name, is_active, created_at) VALUES
    ('br-01', 'Apple', 1, datetime('now')),
    ('br-02', 'Samsung', 1, datetime('now')),
    ('br-03', 'Xiaomi', 1, datetime('now')),
    ('br-04', 'Realme', 1, datetime('now')),
    ('br-05', 'Oppo', 1, datetime('now')),
    ('br-06', 'Vivo', 1, datetime('now')),
    ('br-07', 'Infinix', 1, datetime('now')),
    ('br-08', 'Huawei', 1, datetime('now')),
    ('br-09', 'Honor', 1, datetime('now')),
    ('br-10', 'Anker', 1, datetime('now')),
    ('br-11', 'Joyroom', 1, datetime('now')),
    ('br-12', 'Oraimo', 1, datetime('now')),
    ('br-13', 'Baseus', 1, datetime('now')),
    ('br-14', 'LDNIO', 1, datetime('now')),
    ('br-15', 'JBL', 1, datetime('now'));
