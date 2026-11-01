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
      return jsonResponse({ error: 'INVALID_LICENSE_ID', message: 'معرف الترخيص مطلوب' }, 400);
    }
    if (!machine_id || typeof machine_id !== 'string') {
      return jsonResponse({ error: 'INVALID_MACHINE_ID', message: 'معرف الجهاز مطلوب' }, 400);
    }

    const supabase = getSupabaseAdmin();
    const rawKey = license_id.trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawKey);

    let query = supabase.from('licenses').select('*');
    if (isUuid) {
      query = query.or(`id.eq.${rawKey},license_key.eq.${rawKey}`);
    } else {
      query = query.eq('license_key', rawKey);
    }

    const { data: license, error: licenseError } = await query.maybeSingle<LicenseRow>();

    if (licenseError || !license) {
      return jsonResponse({ error: 'LICENSE_NOT_FOUND', message: 'الترخيص غير موجود' }, 404);
    }

    if (license.status !== 'active') {
      return jsonResponse({ error: 'LICENSE_INACTIVE', message: 'الترخيص غير نشط' }, 403);
    }

    if (!license.machine_id || license.machine_id !== machine_id.trim()) {
      return jsonResponse({ error: 'MACHINE_MISMATCH', message: 'معرف الجهاز غير متطابق' }, 403);
    }

    // Check cloud_backup feature
    const features = license.features || [];
    if (!features.includes('cloud_backup')) {
      return jsonResponse({
        error: 'FEATURE_NOT_INCLUDED',
        message: 'ميزة النسخ السحابي غير مشمولة في الترخيص',
      }, 403);
    }

    // List backups belonging to this license only
    const { data: backups, error: backupsError } = await supabase
      .from('backups')
      .select('id, license_id, created_at, size_bytes, storage_path, app_version')
      .eq('license_id', license.id)
      .order('created_at', { ascending: false });

    if (backupsError) {
      return jsonResponse({
        error: 'LIST_FAILED',
        message: backupsError.message || 'فشل جلب قائمة النسخ الاحتياطية',
      }, 500);
    }

    return jsonResponse({
      success: true,
      backups: backups || [],
    }, 200);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: 'INTERNAL_ERROR', message: msg }, 500);
  }
});
