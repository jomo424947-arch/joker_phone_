import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { getSupabaseAdmin, LicenseRow, BackupRow } from '../_shared/supabaseAdmin.ts';

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'METHOD_NOT_ALLOWED', message: 'الطريقة غير مسموح بها' }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { license_id, machine_id, backup_id } = body;

    if (!license_id || typeof license_id !== 'string') {
      return jsonResponse({ error: 'INVALID_LICENSE_ID', message: 'معرف الترخيص مطلوب' }, 400);
    }
    if (!machine_id || typeof machine_id !== 'string') {
      return jsonResponse({ error: 'INVALID_MACHINE_ID', message: 'معرف الجهاز مطلوب' }, 400);
    }
    if (!backup_id || typeof backup_id !== 'string') {
      return jsonResponse({ error: 'INVALID_BACKUP_ID', message: 'معرف النسخة الاحتياطية مطلوب' }, 400);
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

    // Fetch specific backup row ensuring ownership
    const { data: backup, error: backupError } = await supabase
      .from('backups')
      .select('*')
      .eq('id', backup_id.trim())
      .eq('license_id', license.id)
      .single<BackupRow>();

    if (backupError || !backup) {
      return jsonResponse({
        error: 'BACKUP_NOT_FOUND',
        message: 'ملف النسخة الاحتياطية غير موجود أو لا ينتمي لهذا الترخيص',
      }, 404);
    }

    // Generate short-lived signed download URL (expires in 300 seconds / 5 minutes)
    const { data: signedData, error: signedError } = await supabase
      .storage
      .from('backups')
      .createSignedUrl(backup.storage_path, 300);

    if (signedError || !signedData?.signedUrl) {
      return jsonResponse({
        error: 'SIGNED_URL_FAILED',
        message: signedError?.message || 'تعذر إنشاء رابط التحميل الموقّع',
      }, 500);
    }

    return jsonResponse({
      success: true,
      download_url: signedData.signedUrl,
      backup: {
        id: backup.id,
        storage_path: backup.storage_path,
        size_bytes: backup.size_bytes,
        created_at: backup.created_at,
        app_version: backup.app_version,
      },
    }, 200);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: 'INTERNAL_ERROR', message: msg }, 500);
  }
});
