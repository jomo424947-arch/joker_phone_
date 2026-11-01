import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { getSupabaseAdmin, LicenseRow } from '../_shared/supabaseAdmin.ts';

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'METHOD_NOT_ALLOWED', message: 'الطريقة غير مسموح بها' }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { license_id, machine_id } = body;

    if (!license_id || typeof license_id !== 'string') {
      return jsonResponse({ error: 'INVALID_LICENSE_ID', message: 'معرف الترخيص مطلوب وغير صالح' }, 400);
    }

    if (!machine_id || typeof machine_id !== 'string') {
      return jsonResponse({ error: 'INVALID_MACHINE_ID', message: 'معرف الجهاز مطلوب' }, 400);
    }

    const supabase = getSupabaseAdmin();
    const rawKey = license_id.trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawKey);

    let query = supabase.from('licenses').select('*');
    if (isUuid) {
      query = query.or(`id.eq.${rawKey},license_key.eq.${rawKey},customer_email.ilike.${rawKey}`);
    } else {
      query = query.or(`customer_email.ilike.${rawKey},license_key.eq.${rawKey}`);
    }

    const { data: license, error: fetchError } = await query.maybeSingle<LicenseRow>();

    if (fetchError || !license) {
      return jsonResponse({ error: 'LICENSE_NOT_FOUND', message: 'حساب جوجل أو الترخيص غير مسجل لدى الإدارة في قاعدة البيانات' }, 404);
    }

    // Check license status
    if (license.status === 'revoked') {
      return jsonResponse({
        error: 'LICENSE_REVOKED',
        message: 'تم إلغاء أو إيقاف هذا الترخيص من قبل الإدارة',
        status: 'revoked',
        updates_until: license.updates_until,
      }, 403);
    }

    // Hardware machine binding
    if (!license.machine_id) {
      // First activation or transferred license: bind to this machine
      const { error: updateError } = await supabase
        .from('licenses')
        .update({ machine_id: machine_id.trim() })
        .eq('id', license.id);

      if (updateError) {
        return jsonResponse({ error: 'BINDING_FAILED', message: 'فشل ربط الجهاز بالترخيص' }, 500);
      }
      license.machine_id = machine_id.trim();
    } else if (license.machine_id !== machine_id.trim()) {
      return jsonResponse({
        error: 'MACHINE_MISMATCH',
        message: 'هذا الترخيص مفعّل بالفعل على جهاز كمبيوتر آخر! لنقل الترخيص يجب فك ربطه من لوحة الأدمن أولاً.',
      }, 403);
    }

    return jsonResponse({
      valid: true,
      license_id: license.id,
      license_key: license.license_key || license.id,
      customer_email: license.customer_email,
      status: license.status,
      customer_name: license.customer_name,
      features: license.features ?? [],
      updates_until: license.updates_until,
      machine_id: license.machine_id,
    }, 200);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: 'INTERNAL_ERROR', message: msg }, 500);
  }
});
