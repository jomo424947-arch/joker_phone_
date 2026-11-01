-- ============================================================================
-- Migration 011: Mobix Rebranding & Identity Migration
-- ترحيل الهوية بالكامل إلى نظام موبيكس (Mobix) وإزالة بيانات الجوكر فون
-- ============================================================================

-- 1. تحديث إعدادات المتجر إلى هوية موبيكس الجديدة
UPDATE settings 
SET value = 'موبيكس - Mobix', updated_at = datetime('now')
WHERE key = 'store_name' AND (value LIKE '%الجوكر%' OR value LIKE '%JOKER%');

UPDATE settings 
SET value = 'Mobix', updated_at = datetime('now')
WHERE key = 'store_name_en' AND (value LIKE '%الجوكر%' OR value LIKE '%JOKER%');

UPDATE settings 
SET value = 'موبيكس - شريكك الذكي لإدارة محلات الموبايلات', updated_at = datetime('now')
WHERE key = 'receipt_header' AND (value LIKE '%الجوكر%' OR value LIKE '%JOKER%');

UPDATE settings 
SET value = 'شكراً لتعاملكم مع موبيكس - ضمان وجودة في كل جهاز', updated_at = datetime('now')
WHERE key = 'receipt_footer' AND (value LIKE '%الجوكر%' OR value LIKE '%JOKER%');

UPDATE settings 
SET value = 'موبيكس - إيصال استلام صيانة', updated_at = datetime('now')
WHERE key = 'repair_receipt_header' AND (value LIKE '%الجوكر%' OR value LIKE '%JOKER%');

-- 2. تحديث مسميات خدمات الصيانة
UPDATE products
SET name_ar = 'خدمات صيانة موبيكس',
    name_en = 'Mobix Repair Services',
    updated_at = datetime('now')
WHERE name_ar LIKE '%الجوكر%' OR name_en LIKE '%Joker%';

-- 3. حذف حساب وبيانات محمد الجوكر نهائياً
DELETE FROM users 
WHERE username = 'mohamed_joker' 
   OR display_name LIKE '%الجوكر%';
