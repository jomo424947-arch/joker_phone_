import { describe, test, expect } from 'vitest';
import { encryptBackupBuffer, decryptBackupBuffer } from '../../src/main/cloud/cloud-crypto';

describe('CloudCrypto (تشفير وفك تشفير النسخ الاحتياطية السحابية بـ AES-256-GCM)', () => {
  const licenseId = '7b960b76-4d1a-46be-9f17-b76543210000';
  const machineId = 'JKR-1A2B-3C4D-5E6F-7G8H';
  const sampleSqliteData = Buffer.from(
    'SQLite format 3\0\x10\0\x01\x01\0@  \0\0\0\x01\0\0\0\x04\0\0\0\0\0\0\0\0\0\0\0\x01\0\0\0\0\0\0\0\0\0\0\0\x01\0\0\0\0' +
      '-- Test payload table contents with sensitive data -- '.repeat(20)
  );

  test('تشفير وفك تشفير ملف قاعدة البيانات بنجاح واستعادة البيانات الأصلية 100%', () => {
    const encrypted = encryptBackupBuffer(sampleSqliteData, licenseId, machineId);

    // التحقق من أن الناتج مشفر ويحتوي على ترويسة JKBC
    expect(encrypted.length).toBeGreaterThan(64);
    expect(encrypted.subarray(0, 4).toString('utf-8')).toBe('JKBC');

    // فك التشفير
    const decrypted = decryptBackupBuffer(encrypted, licenseId, machineId);
    expect(decrypted.equals(sampleSqliteData)).toBe(true);
  });

  test('فشل فك التشفير عند استخدام معرف ترخيص خاطئ', () => {
    const encrypted = encryptBackupBuffer(sampleSqliteData, licenseId, machineId);
    const wrongLicenseId = '00000000-0000-0000-0000-000000000000';

    expect(() => {
      decryptBackupBuffer(encrypted, wrongLicenseId, machineId);
    }).toThrow(/مفتاح الترخيص أو معرف الجهاز غير متطابقين/);
  });

  test('فشل فك التشفير عند استخدام معرف جهاز مختلف', () => {
    const encrypted = encryptBackupBuffer(sampleSqliteData, licenseId, machineId);
    const wrongMachineId = 'JKR-FFFF-FFFF-FFFF-FFFF';

    expect(() => {
      decryptBackupBuffer(encrypted, licenseId, wrongMachineId);
    }).toThrow(/مفتاح الترخيص أو معرف الجهاز غير متطابقين/);
  });

  test('اكتشاف التلاعب بالملف المشفر وتفعيل حماية النزاهة في GCM Auth Tag', () => {
    const encrypted = encryptBackupBuffer(sampleSqliteData, licenseId, machineId);
    // تلاعب في بايت داخل المحتوى المشفر
    const tampered = Buffer.from(encrypted);
    tampered[tampered.length - 5] ^= 0xff;

    expect(() => {
      decryptBackupBuffer(tampered, licenseId, machineId);
    }).toThrow();
  });

  test('رفض الملفات التي لا تحتوي على الترويسة الصحيحة', () => {
    const invalidHeader = Buffer.from('FAKE-HEADER-TOO-SHORT');

    expect(() => {
      decryptBackupBuffer(invalidHeader, licenseId, machineId);
    }).toThrow();
  });
});

