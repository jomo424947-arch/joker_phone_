-- ============================================================================
-- Migration 011: Repair Invoices & Financial Integration
-- ربط أوامر الصيانة بفواتير البيع الرسمية وتسجيل العرابين وبواقي الحسابات في الخزينة والورديات
-- ============================================================================

-- إضافة حقول ربط الفواتير وطرق الدفع إلى جدول أوامر الصيانة
ALTER TABLE repair_orders ADD COLUMN deposit_invoice_id INTEGER REFERENCES sales(id);
ALTER TABLE repair_orders ADD COLUMN delivery_invoice_id INTEGER REFERENCES sales(id);
ALTER TABLE repair_orders ADD COLUMN deposit_method TEXT DEFAULT 'cash';
ALTER TABLE repair_orders ADD COLUMN delivery_method TEXT DEFAULT 'cash';
