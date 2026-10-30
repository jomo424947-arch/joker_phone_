/**
 * نقطة الدخول الرئيسية للعملية المركزية (Electron Main Process)
 * تطبق مبادئ الأمان والنزاهة الفائقة:
 * - contextIsolation: true
 * - nodeIntegration: false
 * - ترحيل قاعدة البيانات التلقائي (Auto Migrations)
 * - فحص السلامة الدوري التلقائي (Integrity Check)
 * - حماية الخمول بالقفل التلقائي (Auto Lock)
 * - النسخ الاحتياطي التلقائي عند إغلاق التطبيق
 */

import { app, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import { registerAllIpcHandlers } from './ipc';
import { initializeDatabase, closeDatabase } from './db';
import { authService } from './services/auth.service';
import { backupService } from './services/backup.service';
import { autoLockService } from './services/autolock.service';

let mainWindow: BrowserWindow | null = null;

function getAppIconPath(): string {
  const candidates = [
    path.join(__dirname, '../../build/icon.ico'),
    path.join(__dirname, '../../public/icon.ico'),
    path.join(__dirname, '../public/icon.ico'),
    path.join(process.resourcesPath || '', 'build/icon.ico'),
    path.join(process.resourcesPath || '', 'public/icon.ico'),
    path.join(process.cwd(), 'build/icon.ico'),
    path.join(process.cwd(), 'public/icon.ico'),
    path.join(__dirname, '../../build/icon.png'),
    path.join(process.cwd(), 'build/icon.png'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return path.join(__dirname, '../../build/icon.ico');
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: 'الجوكر فون | JOKER PHONE — نظام إدارة محلات التليفونات والاكسسوارات والصيانة',
    icon: getAppIconPath(),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
  });

  // التسجيل والتهيئة لمعالجات IPC
  registerAllIpcHandlers();

  // تفعيل خدمة القفل التلقائي للنافذة
  autoLockService.initialize(mainWindow);

  // إظهار النافذة بعد اكتمال التحميل لمنع الوميض الأبيض
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }
}

app.whenReady().then(async () => {
  // ضبط معرف التطبيق في شريط مهام ويندوز لعرض الأيقونة والشعار الصحيح
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.jokerphone.pos');
  }

  // فتح قاعدة البيانات وتطبيق أي ترحيلات جديدة
  try {
    initializeDatabase();
    // فحص سلامة قاعدة البيانات الأسبوعي الخفيف في الخلفية
    backupService.weeklyIntegrityCheck();
  } catch (err) {
    console.error('خطأ في تهيئة قاعدة البيانات:', err);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', async () => {
  try {
    // إجراء نسخ احتياطي تلقائي قبل الإغلاق التام
    await backupService.runAutoBackup();
  } catch (err) {
    console.error('خطأ أثناء النسخ الاحتياطي عند الإغلاق:', err);
  } finally {
    closeDatabase();
    if (process.platform !== 'darwin') {
      app.quit();
    }
  }
});
