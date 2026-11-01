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
    const { license_id, machine_id, file_name, size_bytes, app_version, retention_count } = body;

    if (!license_id || typeof license_id !== 'string') {
      return jsonResponse({ error: 'INVALID_LICENSE_ID', message: 'معرف الترخيص مطلوب' }, 400);
    }
    if (!machine_id || typeof machine_id !== 'string') {
      return jsonResponse({ error: 'INVALID_MACHINE_ID', message: 'معرف الجهاز مطلوب' }, 400);
    }
    if (!file_name || typeof file_name !== 'string') {
      return jsonResponse({ error: 'INVALID_FILE_NAME', message: 'اسم الملف مطلوب' }, 400);
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
      return jsonResponse({ error: 'LICENSE_INACTIVE', message: 'الترخيص غير نشط أو تم إلغاؤه' }, 403);
    }

    if (!license.machine_id || license.machine_id !== machine_id.trim()) {
      return jsonResponse({ error: 'MACHINE_MISMATCH', message: 'معرف الجهاز غير متطابق مع الترخيص' }, 403);
    }

    // Check cloud_backup feature entitlement
    const features = license.features || [];
    if (!features.includes('cloud_backup')) {
      return jsonResponse({
        error: 'FEATURE_NOT_INCLUDED',
        message: 'ميزة النسخ الاحتياطي السحابي غير مشمولة في باقة ترخيصك',
      }, 403);
    }

    // Retention rotation: Keep only the last N backups (default 7)
    const maxBackups = typeof retention_count === 'number' && retention_count > 0 ? retention_count : 7;
    const { data: existingBackups } = await supabase
      .from('backups')
      .select('id, storage_path')
      .eq('license_id', license.id)
      .order('created_at', { ascending: false });

    if (existingBackups && existingBackups.length >= maxBackups) {
      const toPrune = existingBackups.slice(maxBackups - 1);
      const pathsToRemove = toPrune.map((b) => b.storage_path).filter(Boolean);
      const idsToRemove = toPrune.map((b) => b.id);

      if (pathsToRemove.length > 0) {
        await supabase.storage.from('backups').remove(pathsToRemove);
      }
      if (idsToRemove.length > 0) {
        await supabase.from('backups').delete().in('id', idsToRemove);
      }
    }

    // Generate sanitized storage path in backups bucket: {license_id}/{timestamp}_{filename}
    const safeFileName = file_name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${license.id}/${Date.now()}_${safeFileName}`;

    // Create signed upload URL (expires in 900 seconds / 15 minutes)
    const { data: uploadData, error: uploadUrlError } = await supabase
      .storage
      .from('backups')
      .createSignedUploadUrl(storagePath);

    if (uploadUrlError || !uploadData) {
      return jsonResponse({
        error: 'SIGNED_URL_FAILED',
        message: uploadUrlError?.message || 'فشل توليد رابط الرفع الموقّع',
      }, 500);
    }

    // Record the backup entry in public.backups table
    const { data: backupRecord, error: insertError } = await supabase
      .from('backups')
      .insert({
        license_id: license.id,
        size_bytes: typeof size_bytes === 'number' ? size_bytes : 0,
        storage_path: storagePath,
        app_version: typeof app_version === 'string' ? app_version : null,
      })
      .select('id, created_at, storage_path, size_bytes')
      .single();

    if (insertError || !backupRecord) {
      return jsonResponse({
        error: 'DATABASE_RECORD_FAILED',
        message: insertError?.message || 'فشل تسجيل بيانات النسخة الاحتياطية',
      }, 500);
    }

    return jsonResponse({
      success: true,
      backup_id: backupRecord.id,
      storage_path: storagePath,
      signed_url: uploadData.signedUrl,
      token: uploadData.token,
      created_at: backupRecord.created_at,
    }, 200);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: 'INTERNAL_ERROR', message: msg }, 500);
  }
});
