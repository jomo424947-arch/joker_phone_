/**
 * مدير اتصال وتكوين قاعدة بيانات SQLite (Better-SQLite3)
 * يوفر اتصالاً آمناً وسريعاً مضبوطاً بـ WAL Mode و Foreign Keys و Synchronous FULL
 * ويدعم التهيئة التلقائية للبيانات وقواعد الاختبارات (In-Memory)
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { runMigrations, MigrationResult } from './migrator';

export interface DatabaseConnectionOptions {
  filename?: string;
  verbose?: boolean;
  migrationsDir?: string;
  autoMigrate?: boolean;
}

let dbInstance: Database.Database | null = null;

/**
 * الحصول على المسار الافتراضي لملف قاعدة البيانات
 */
export function getDefaultDatabasePath(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require('electron');
    if (app && typeof app.getPath === 'function') {
      const userDataDir = app.getPath('userData');
      return path.join(userDataDir, 'cosmetics_pos.db');
    }
  } catch {
    // بيئة الاختبارات أو بيئة Node العادية
  }

  return path.resolve(process.cwd(), 'cosmetics_pos.db');
}

/**
 * فتح اتصال قاعدة البيانات مع ضبط الـ PRAGMAs الأساسية للأداء والنزاهة
 */
export function getDatabase(options?: DatabaseConnectionOptions): Database.Database {
  if (dbInstance) {
    return dbInstance;
  }

  const dbPath = options?.filename || getDefaultDatabasePath();

  // إنشاء المجلد الأب إذا لم يكن موجوداً (في حال لم تكن قاعدة بيانات بالذاكرة)
  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  dbInstance = new Database(dbPath, {
    verbose: options?.verbose ? console.log : undefined,
  });

  // تفعيل إعدادات الأمان والأداء الصارمة ومنع التجمد والقفل التلقائي
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');
  dbInstance.pragma('synchronous = NORMAL'); // الأداء القياسي الآمن في نمط WAL لتفادي تعليق القرص
  dbInstance.pragma('busy_timeout = 15000'); // مهلة 15 ثانية لتفادي أخطاء database locked
  dbInstance.pragma('wal_autocheckpoint = 1000');
  dbInstance.pragma('cache_size = -64000'); // ذاكرة كاش 64 ميجابايت لتسريع القراءة
  dbInstance.pragma('temp_store = MEMORY');

  return dbInstance;
}

/**
 * تهيئة قاعدة البيانات بالكامل (فتح الاتصال + تطبيق الترحيلات + زرع الحسابات الافتراضية)
 */
export function initializeDatabase(options?: DatabaseConnectionOptions): {
  db: Database.Database;
  migrationResult: MigrationResult;
} {
  const db = getDatabase(options);

  const migrationResult = runMigrations(db, {
    migrationsDir: options?.migrationsDir,
  });

  // التأكد من وجود الحسابات الإدارية المعتمدة وتفعيل النظام تلقائياً
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { authService } = require('../services/auth.service');
    if (authService && typeof authService.seedDefaultOwnerIfNone === 'function') {
      authService.seedDefaultOwnerIfNone();
    }
  } catch (err) {
    console.error('تنبيه أثناء التحقق من الحسابات الافتراضية:', err);
  }

  return {
    db,
    migrationResult,
  };
}

/**
 * إغلاق اتصال قاعدة البيانات الحالي وتحرير الذاكرة
 */
export function closeDatabase(): void {
  if (dbInstance) {
    try {
      dbInstance.close();
    } finally {
      dbInstance = null;
    }
  }
}
