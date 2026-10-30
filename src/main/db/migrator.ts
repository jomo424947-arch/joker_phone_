/**
 * مشغل ترحيلات قاعدة البيانات (Database Migrator)
 * المسؤول عن قراءة ملفات SQL المرقمة وتنفيذ غير المطبق منها بالترتيب داخل Transactions
 * والتسجيل في جدول schema_version لضمان ثبات واتساق قاعدة البيانات.
 */

import fs from 'fs';
import path from 'path';
import type Database from 'better-sqlite3';

export interface MigrationResult {
  appliedCount: number;
  currentVersion: number;
}

export interface MigratorOptions {
  migrationsDir?: string;
}

interface MigrationFile {
  version: number;
  name: string;
  filePath: string;
}

/**
 * تحديد مسار مجلد الـ migrations المناسب
 */
function resolveMigrationsDir(customDir?: string): string {
  if (customDir && fs.existsSync(customDir)) {
    return customDir;
  }

  const candidatePaths = [
    // المسار الأقرب: بجانب ملف index.js المبني
    path.join(__dirname, 'migrations'),
    path.join(__dirname, 'db', 'migrations'),
    // مسارات التطوير
    path.resolve(process.cwd(), 'src', 'main', 'db', 'migrations'),
    // مسار الـ dist-electron
    path.resolve(process.cwd(), 'dist-electron', 'main', 'migrations'),
  ];

  // إضافة مسارات Electron في بيئة الإنتاج
  try {
    const { app } = require('electron');
    if (app) {
      const appPath = app.getAppPath();
      candidatePaths.push(
        path.join(appPath, 'dist-electron', 'main', 'migrations'),
        path.join(appPath, 'main', 'migrations'),
      );
      if (process.resourcesPath) {
        candidatePaths.push(
          path.join(process.resourcesPath, 'app', 'dist-electron', 'main', 'migrations'),
          path.join(process.resourcesPath, 'dist-electron', 'main', 'migrations'),
        );
      }
    }
  } catch {
    // بيئة الاختبارات أو بيئة Node العادية - يتم تجاهل الخطأ
  }

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  console.error(
    `[Migrator] تعذر العثور على مجلد الترحيلات. المسارات المفحوصة:`,
    candidatePaths
  );
  throw new Error(
    `تعذر العثور على مجلد الترحيلات (migrations). المسارات المفحوصة: ${candidatePaths.join(', ')}`
  );
}

/**
 * الحصول على رقم الإصدار الحالي لقاعدة البيانات
 */
export function getCurrentSchemaVersion(db: Database.Database): number {
  // التأكد من وجود جدول schema_version
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const row = db
    .prepare('SELECT MAX(version) AS maxVersion FROM schema_version')
    .get() as { maxVersion: number | null } | undefined;

  return row?.maxVersion ?? 0;
}

/**
 * قراءة وفرز ملفات الـ migrations من المجلد
 */
function getMigrationFiles(dirPath: string): MigrationFile[] {
  const files = fs.readdirSync(dirPath);
  const migrationFiles: MigrationFile[] = [];

  for (const file of files) {
    const match = file.match(/^(\d+)_(.+)\.sql$/);
    if (match) {
      const version = parseInt(match[1], 10);
      migrationFiles.push({
        version,
        name: file,
        filePath: path.join(dirPath, file),
      });
    }
  }

  // ترتيب الملفات حسب رقم الإصدار تصاعدياً
  migrationFiles.sort((a, b) => a.version - b.version);
  return migrationFiles;
}

/**
 * تشغيل كافة الترحيلات المعلقة بالترتيب
 */
export function runMigrations(
  db: Database.Database,
  options?: MigratorOptions
): MigrationResult {
  const migrationsDir = resolveMigrationsDir(options?.migrationsDir);
  const currentVersion = getCurrentSchemaVersion(db);
  const allMigrations = getMigrationFiles(migrationsDir);

  const pendingMigrations = allMigrations.filter((m) => m.version > currentVersion);

  if (pendingMigrations.length === 0) {
    return {
      appliedCount: 0,
      currentVersion,
    };
  }

  let appliedCount = 0;
  let newCurrentVersion = currentVersion;

  // إعداد استعلام حفظ الإصدار
  const insertVersionStmt = db.prepare(
    "INSERT INTO schema_version (version, applied_at) VALUES (?, datetime('now'))"
  );

  for (const migration of pendingMigrations) {
    const sqlContent = fs.readFileSync(migration.filePath, 'utf-8');

    // تنفيذ كل ترحيل داخل Transaction مستقل
    const executeMigration = db.transaction(() => {
      db.exec(sqlContent);
      insertVersionStmt.run(migration.version);
    });

    try {
      executeMigration();
      appliedCount += 1;
      newCurrentVersion = migration.version;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `فشل تطبيق الترحيل رقم ${migration.version} (${migration.name}): ${message}`
      );
    }
  }

  return {
    appliedCount,
    currentVersion: newCurrentVersion,
  };
}
