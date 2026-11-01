/**
 * عميل Supabase للعملية المركزية (Electron Main Process)
 * يعمل بالمفتاح العام المجهول فقط (anon key) وبشكل آمن تماماً
 * في حال غياب الإعدادات، يتم تعطيل الميزات السحابية بمرونة دون إيقاف النظام
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { loadCloudEnv, CloudEnvConfig } from './env-loader';

let supabaseInstance: SupabaseClient | null = null;
let envConfig: CloudEnvConfig | null = null;

// فئة وهمية لـ WebSocket لتجنب خطأ Realtime في بيئة Node.js / Electron
class DummyWebSocket {}

export function getCloudConfig(): CloudEnvConfig {
  if (!envConfig) {
    envConfig = loadCloudEnv();
  }
  return envConfig;
}

export function resetCloudClient(): void {
  supabaseInstance = null;
  envConfig = null;
}

export function getSupabaseClient(): SupabaseClient | null {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  const config = getCloudConfig();

  if (!config.isConfigured) {
    return null;
  }

  try {
    supabaseInstance = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      realtime: {
        transport: (typeof globalThis.WebSocket !== 'undefined' ? globalThis.WebSocket : DummyWebSocket) as any,
      },
    });
    return supabaseInstance;
  } catch (err) {
    console.warn('[Cloud] تعذر تهيئة عميل Supabase، سيتم الاستمرار في الوضع الأوفلاين:', err);
    return null;
  }
}

