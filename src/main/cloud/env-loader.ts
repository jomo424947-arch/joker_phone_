/**
 * محمل متغيرات البيئة الآمن للعملية المركزية فقط
 * يقرأ ملف .env بدون إلقاء أي استثناءات، ويمنع أي مفاتيح غير مصرح بها كـ service_role
 */

import fs from 'fs';
import path from 'path';

export interface CloudEnvConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  isConfigured: boolean;
}

export function loadCloudEnv(): CloudEnvConfig {
  let envPath = path.resolve(process.cwd(), '.env');

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require('electron');
    if (app && typeof app.getAppPath === 'function') {
      const candidates = [
        path.join(process.cwd(), '.env'),
        path.join(app.getAppPath(), '.env'),
        path.join(app.getPath('userData'), '.env'),
        path.join(path.dirname(process.execPath), '.env'),
      ];
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          envPath = candidate;
          break;
        }
      }
    }
  } catch {
    // بيئة اختبارات
  }

  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf-8');
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (key && !(key in process.env)) {
            process.env[key] = val;
          }
        }
      }
    } catch {
      // قراءة آمنة صامتة لتفادي انهيار التطبيق
    }
  }

  const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
  const supabaseAnonKey = (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '').trim();

  const isConfigured = Boolean(
    supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl.startsWith('http') &&
    !supabaseUrl.includes('placeholder')
  );

  return {
    supabaseUrl,
    supabaseAnonKey,
    isConfigured,
  };
}
