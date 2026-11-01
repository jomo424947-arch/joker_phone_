/**
 * سكريبت تصفير وإعادة ضبط قاعدة البيانات المحلية بالكامل
 * Mobix POS System - Database Reset Utility
 */
const fs = require('fs');
const path = require('path');

console.log('\n===========================================================');
console.log('🔄 جاري تصفير قاعدة البيانات المحلية لنظام موبيكس (Mobix)...');
console.log('===========================================================\n');

let removedCount = 0;

// 1. مسار AppData (المسار الفعلي للبرنامج أثناء التشغيل)
const appDataPath = process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Preferences' : '/var/local');
const appDataDirs = [
  path.join(appDataPath, 'mobix-pos-system'),
  path.join(appDataPath, 'joker-phone-pos-system')
];

for (const appDataDir of appDataDirs) {
  if (fs.existsSync(appDataDir)) {
    const files = ['cosmetics_pos.db', 'cosmetics_pos.db-wal', 'cosmetics_pos.db-shm'];
    for (const f of files) {
      const fullPath = path.join(appDataDir, f);
      if (fs.existsSync(fullPath)) {
        try {
          fs.unlinkSync(fullPath);
          console.log(`[AppData] تم حذف: ${f}`);
          removedCount++;
        } catch (e) {
          console.warn(`[AppData] تعذر حذف ${f} (قد يكون البرنامج مفتوحاً، يرجى إغلاقه أولاً): ${e.message}`);
        }
      }
    }
  }
}

// 2. مسار مجلد المشروع المحلي
const localDir = process.cwd();
const localFiles = ['cosmetics_pos.db', 'cosmetics_pos.db-wal', 'cosmetics_pos.db-shm'];
for (const f of localFiles) {
  const fullPath = path.join(localDir, f);
  if (fs.existsSync(fullPath)) {
    try {
      fs.unlinkSync(fullPath);
      console.log(`[Local] تم حذف: ${f}`);
      removedCount++;
    } catch (e) {
      console.warn(`[Local] تعذر حذف ${f}: ${e.message}`);
    }
  }
}

console.log('\n-----------------------------------------------------------');
console.log('✨ النتيجة: تم تصفير قاعدة البيانات المحلية بنجاح!');
console.log('📌 عند فتح البرنامج الآن، ستظهر شاشة الإعداد الأولى (معالج التهيئة)');
console.log('   لتتمكن من إدخال اسم المحل، بيانات المالك، وحساب جوجل أو كود التفعيل.');
console.log('===========================================================\n');

