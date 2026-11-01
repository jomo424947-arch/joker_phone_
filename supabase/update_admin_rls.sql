-- ============================================================================
-- تفعيل نظام التراخيص والمزامنة الفورية بحسابات جوجل في Supabase
-- انسخ هذا الكود بالكامل، والصقه في Supabase SQL Editor واضغط RUN
-- الرابط: https://supabase.com/dashboard/project/juhhqychhdhxonmvkvpt/sql/new
-- ============================================================================

-- 1. إضافة عمود حساب جوجل / البريد الإلكتروني وكود التفعيل ورقم الهاتف
ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS customer_email TEXT;
ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS license_key TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_licenses_customer_email ON public.licenses(LOWER(customer_email));
CREATE INDEX IF NOT EXISTS idx_licenses_license_key ON public.licenses(license_key);

-- 2. تحديث دالة verify_license لتدعم البحث الفوري بحساب جوجل أو كود التفعيل
CREATE OR REPLACE FUNCTION public.verify_license(
    p_license_key TEXT,
    p_machine_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_rec RECORD;
    v_clean TEXT;
BEGIN
    v_clean := TRIM(p_license_key);

    -- البحث إما بحساب جوجل / البريد الإلكتروني أو كود التفعيل أو الـ UUID
    SELECT * INTO v_rec 
    FROM public.licenses 
    WHERE (LOWER(customer_email) = LOWER(v_clean))
       OR (UPPER(license_key) = UPPER(v_clean))
       OR (id::text = v_clean)
    LIMIT 1;

    -- إذا لم يتم العثور على الحساب
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'error', 'LICENSE_NOT_FOUND',
            'message', 'هذا الحساب أو الكود غير مسجل لدى الإدارة. يرجى التواصل مع المسؤول لإضافة حسابك أولاً.'
        );
    END IF;

    -- إذا كان الترخيص موقوفاً
    IF v_rec.status = 'revoked' THEN
        RETURN jsonb_build_object(
            'error', 'LICENSE_REVOKED',
            'status', 'revoked',
            'updates_until', v_rec.updates_until,
            'message', 'هذا الحساب تم إيقافه من قبل الإدارة.'
        );
    END IF;

    -- ربط جهاز الكمبيوتر تلقائياً عند أول تفعيل
    IF v_rec.machine_id IS NULL OR v_rec.machine_id = '' THEN
        UPDATE public.licenses
        SET machine_id = p_machine_id
        WHERE id = v_rec.id;
        
        v_rec.machine_id := p_machine_id;
    ELSIF v_rec.machine_id <> p_machine_id THEN
        -- منع السرقة واستخدام الحساب في مكان آخر
        RETURN jsonb_build_object(
            'error', 'MACHINE_MISMATCH',
            'message', 'هذا الحساب مفعل بالفعل على جهاز كمبيوتر آخر. يرجى التواصل مع الإدارة لفك ربط الجهاز القديم.'
        );
    END IF;

    -- الحساب معتمد ومفعل
    RETURN jsonb_build_object(
        'valid', true,
        'license_id', v_rec.id,
        'license_key', v_rec.license_key,
        'customer_name', v_rec.customer_name,
        'customer_email', v_rec.customer_email,
        'machine_id', v_rec.machine_id,
        'features', v_rec.features,
        'updates_until', v_rec.updates_until,
        'status', v_rec.status
    );
END;
$$;

-- السماح باستدعاء الدالة لجميع العملاء عبر المفتاح العام (Anon)
GRANT EXECUTE ON FUNCTION public.verify_license(TEXT, TEXT) TO anon, authenticated;

-- 3. صلاحيات الأمان RLS
DROP POLICY IF EXISTS "Admin full access to licenses" ON public.licenses;
CREATE POLICY "Admin full access to licenses"
    ON public.licenses FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Admin full access to backups" ON public.backups;
CREATE POLICY "Admin full access to backups"
    ON public.backups FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);
