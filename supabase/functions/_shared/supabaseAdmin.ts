import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

export function getSupabaseAdmin() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('MISSING_SERVICE_ROLE_CONFIGURATION');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export interface LicenseRow {
  id: string;
  license_key?: string | null;
  customer_name: string;
  customer_phone?: string | null;
  machine_id: string | null;
  features: string[];
  updates_until: string;
  status: 'active' | 'revoked';
  created_at: string;
}

export interface BackupRow {
  id: string;
  license_id: string;
  created_at: string;
  size_bytes: number;
  storage_path: string;
  app_version: string | null;
}
