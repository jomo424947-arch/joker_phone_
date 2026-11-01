/**
 * وحدة التشفير وفك التشفير للنسخ الاحتياطية السحابية
 * تعتمد خوارزمية AES-256-GCM مع اشتقاق المفاتيح عبر PBKDF2 والضغط عبر Gzip
 * بنية الترويسة المدمجة (Header):
 * - [0..3]: Magic Bytes 'JKBC' (4 bytes)
 * - [4..35]: Random Salt (32 bytes)
 * - [36..47]: Random IV (12 bytes)
 * - [48..63]: GCM Auth Tag (16 bytes)
 * - [64..end]: AES-256-GCM Ciphertext (المحتوى المضغوط)
 */

import crypto from 'crypto';
import zlib from 'zlib';

const MAGIC_BYTES = Buffer.from('JKBC', 'utf-8'); // 4 bytes
const SALT_LENGTH = 32;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const HEADER_LENGTH = MAGIC_BYTES.length + SALT_LENGTH + IV_LENGTH + TAG_LENGTH; // 64 bytes
const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH = 32; // 256 bits

/**
 * اشتقاق مفتاح التشفير من معرف الترخيص ومعرف الجهاز
 */
function deriveKey(secret: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(secret, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
}

/**
 * ضغط وتشفير ملف قاعدة البيانات
 */
export function encryptBackupBuffer(dbBuffer: Buffer, licenseId: string, machineId: string): Buffer {
  const secret = `${licenseId.trim()}:${machineId.trim()}`;

  // 1. ضغط البيانات بواسطة gzip
  const gzipped = zlib.gzipSync(dbBuffer, { level: 9 });

  // 2. توليد Salt و IV عشوائيين فائقين الأمان
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);

  // 3. اشتقاق المفتاح
  const key = deriveKey(secret, salt);

  // 4. التشفير بـ AES-256-GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(gzipped), cipher.final()]);
  const tag = cipher.getAuthTag();

  // 5. تجميع الملف المشفر مع الترويسة
  return Buffer.concat([MAGIC_BYTES, salt, iv, tag, ciphertext]);
}

/**
 * فك تشفير وفك ضغط النسخة الاحتياطية
 */
export function decryptBackupBuffer(encryptedBuffer: Buffer, licenseId: string, machineId: string): Buffer {
  if (encryptedBuffer.length < HEADER_LENGTH) {
    throw new Error('الملف المشفر تالف أو أصغر من الترويسة المطلوبة');
  }

  // التحقق من البايتات السحرية
  const magic = encryptedBuffer.subarray(0, 4);
  if (!magic.equals(MAGIC_BYTES)) {
    throw new Error('تنسيق ملف النسخة السحابية غير صالح أو غير مدعوم (شفرة مجهولة)');
  }

  const salt = encryptedBuffer.subarray(4, 36);
  const iv = encryptedBuffer.subarray(36, 48);
  const tag = encryptedBuffer.subarray(48, 64);
  const ciphertext = encryptedBuffer.subarray(64);

  const secret = `${licenseId.trim()}:${machineId.trim()}`;
  const key = deriveKey(secret, salt);

  // فك تشفير AES-256-GCM
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  let decryptedGzipped: Buffer;
  try {
    decryptedGzipped = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new Error('فشل فك التشفير: مفتاح الترخيص أو معرف الجهاز غير متطابقين، أو الملف تم العبث به');
  }

  // فك ضغط Gzip
  try {
    return zlib.gunzipSync(decryptedGzipped);
  } catch (err: any) {
    throw new Error(`فشل فك ضغط ملف النسخة الاحتياطية: ${err.message}`);
  }
}

