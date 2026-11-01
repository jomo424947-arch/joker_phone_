import React, { useState, useEffect } from 'react';
import {
  Cloud,
  CloudUpload,
  CloudDownload,
  ShieldCheck,
  RotateCcw,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Wifi,
  WifiOff,
  Key,
  Clock,
  HardDrive,
  Copy,
  Info,
} from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { GlassIcon } from '../../components/common/GlassIcon';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { sounds } from '../../lib/sounds';
import { useToast } from '../../components/common/ToastContext';
import { api } from '../../lib/api';

interface CloudLicenseInfo {
  isConfigured: boolean;
  isOnline: boolean;
  isValid: boolean;
  licenseId: string | null;
  customerName: string | null;
  customerEmail?: string | null;
  machineId: string;
  status: 'active' | 'revoked' | 'unlicensed';
  features: string[];
  updatesUntil: string | null;
  hasCloudBackupFeature: boolean;
  inGracePeriod: boolean;
  graceDaysRemaining: number;
  lastVerifiedAt: string | null;
  message?: string;
}

interface CloudBackupItem {
  id: string;
  created_at: string;
  size_bytes: number;
  storage_path: string;
  app_version?: string | null;
}

export function CloudSettingsPage(): React.ReactElement {
  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();

  const [licenseInfo, setLicenseInfo] = useState<CloudLicenseInfo | null>(null);
  const [backups, setBackups] = useState<CloudBackupItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [licenseKeyInput, setLicenseKeyInput] = useState('');

  // إعدادات النسخ التلقائي
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(false);
  const [autoBackupInterval, setAutoBackupInterval] = useState('24');

  // استعادة نسخة سحابية
  const [selectedBackupForRestore, setSelectedBackupForRestore] = useState<CloudBackupItem | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  const fetchCloudData = async () => {
    setIsLoading(true);
    try {
      if (api?.cloudGetStatus) {
        const statusRes = await api.cloudGetStatus();
        if (statusRes?.success && statusRes.data) {
          setLicenseInfo(statusRes.data as CloudLicenseInfo);
          if (statusRes.data.customerEmail) {
            setLicenseKeyInput(statusRes.data.customerEmail);
          } else if (statusRes.data.licenseId) {
            setLicenseKeyInput(statusRes.data.licenseId);
          }
        }
      }

      // جلب إعداد النسخ السحابي التلقائي من settings
      if (api?.getSettings) {
        const settingsRes = await api.getSettings();
        if (settingsRes?.success && settingsRes.data) {
          const map = settingsRes.data;
          setAutoBackupEnabled(map.cloud_auto_backup_enabled === '1' || map.cloud_auto_backup_enabled === 'true');
          if (map.cloud_auto_backup_interval_hours) {
            setAutoBackupInterval(map.cloud_auto_backup_interval_hours);
          }
        }
      }

      // جلب قائمة النسخ
      if (api?.cloudListBackups) {
        const listRes = await api.cloudListBackups();
        if (listRes?.success && Array.isArray(listRes.backups)) {
          setBackups(listRes.backups);
        }
      }
    } catch (err: any) {
      console.warn('تعذر تحميل بيانات السحابة:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCloudData();
  }, []);

  // التحقق من الترخيص أونلاين
  const handleVerifyLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!licenseKeyInput.trim()) return;

    setIsVerifying(true);
    try {
      if (api?.cloudVerifyLicense) {
        const res = await api.cloudVerifyLicense(licenseKeyInput.trim());
        if (res?.success && res.data) {
          setLicenseInfo(res.data as CloudLicenseInfo);
          sounds.playSaleSuccess();
          toastSuccess('تم التحقق من الترخيص وتحديث الصلاحيات بنجاح');
          // تحديث قائمة النسخ
          if (api.cloudListBackups) {
            const listRes = await api.cloudListBackups();
            if (listRes?.success && Array.isArray(listRes.backups)) {
              setBackups(listRes.backups);
            }
          }
        } else {
          sounds.playError();
          toastError(res?.error || 'فشل التحقق من الترخيص');
        }
      }
    } catch (err: any) {
      sounds.playError();
      toastError(err.message || 'خطأ أثناء الاتصال بالخادم السحابي');
    } finally {
      setIsVerifying(false);
    }
  };

  // أخذ نسخة سحابية الآن
  const handleBackupNow = async () => {
    setIsBackingUp(true);
    try {
      if (api?.cloudBackupNow) {
        const res = await api.cloudBackupNow();
        if (res?.success) {
          sounds.playSaleSuccess();
          toastSuccess('تم رفع النسخة الاحتياطية المشفرة بنجاح إلى السحابة');
          await fetchCloudData();
        } else if (res?.enqueued) {
          sounds.playWarning();
          toastInfo(res.error || 'تم حفظ مهمة النسخ وستتم المحاولة تلقائياً عند عودة الإنترنت');
        } else {
          sounds.playError();
          toastError(res?.error || 'فشل إنشاء النسخة السحابية');
        }
      }
    } catch (err: any) {
      sounds.playError();
      toastError(err.message || 'حدث خطأ أثناء إجراء النسخ السحابي');
    } finally {
      setIsBackingUp(false);
    }
  };

  // حفظ إعداد النسخ السحابي التلقائي
  const handleSaveAutoBackup = async (enabled: boolean, hours: string) => {
    setAutoBackupEnabled(enabled);
    setAutoBackupInterval(hours);
    try {
      if (api?.cloudSetAutoBackup) {
        await api.cloudSetAutoBackup(enabled, parseInt(hours, 10));
        toastSuccess(enabled ? 'تم تفعيل النسخ السحابي التلقائي' : 'تم تعطيل النسخ السحابي التلقائي');
      }
    } catch (err: any) {
      toastError(err.message || 'فشل حفظ إعداد النسخ التلقائي');
    }
  };

  // تنفيذ استعادة النسخة السحابية
  const handleConfirmRestore = async () => {
    if (!selectedBackupForRestore) return;

    setIsRestoring(true);
    try {
      if (api?.cloudRestore) {
        const res = await api.cloudRestore(selectedBackupForRestore.id);
        if (res?.success) {
          sounds.playSaleSuccess();
          toastSuccess('تمت الاستعادة بنجاح! سيتم إعادة تشغيل البرنامج الآن...');
          // التطبيق سيعيد تشغيل نفسه
        } else {
          sounds.playError();
          toastError(res?.error || 'فشلت عملية استعادة النسخة السحابية');
          setIsRestoring(false);
          setSelectedBackupForRestore(null);
        }
      }
    } catch (err: any) {
      sounds.playError();
      toastError(err.message || 'خطأ أثناء استعادة البيانات');
      setIsRestoring(false);
      setSelectedBackupForRestore(null);
    }
  };

  const copyMachineId = () => {
    if (licenseInfo?.machineId) {
      navigator.clipboard.writeText(licenseInfo.machineId);
      toastSuccess('تم نسخ معرّف الجهاز إلى الحافظة');
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 بايت';
    const k = 1024;
    const sizes = ['بايت', 'ك.ب', 'م.ب', 'ج.ب'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('ar-EG', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, direction: 'rtl' }}>
      {/* 1. تنبيهات ورسائل الحالة الودية (Friendly Arabic Messages) */}
      {!licenseInfo?.isConfigured && (
        <div
          className="glass-card"
          style={{
            padding: '16px 20px',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            borderColor: 'rgba(239, 68, 68, 0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <GlassIcon icon={AlertTriangle} size="sm" variant="danger" />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, color: '#F87171', fontSize: 14 }}>
              الخدمات السحابية معطلة حالياً (لم يتم ضبط ملف .env)
            </div>
            <div style={{ fontSize: 13, color: '#CBD5E1', marginTop: 3 }}>
              لم يتم تزويد مفاتيح الاتصال <code>SUPABASE_URL</code> و <code>SUPABASE_ANON_KEY</code>.
              يعمل البرنامج حالياً بكامل طاقته ونظامه محلياً 100% دون أي قيود على عمليات البيع والصيانة.
            </div>
          </div>
        </div>
      )}

      {licenseInfo?.isConfigured && !licenseInfo.isOnline && (
        <div
          className="glass-card"
          style={{
            padding: '14px 18px',
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            borderColor: 'rgba(245, 158, 11, 0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <GlassIcon icon={WifiOff} size="sm" variant="gold" />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: '#FBBF24', fontSize: 13.5 }}>
              لا يوجد اتصال بالإنترنت (الوضع الأوفلاين نشط)
            </div>
            <div style={{ fontSize: 12.5, color: '#CBD5E1', marginTop: 2 }}>
              يستمر البرنامج في العمل الطبيعي باستخدام بيانات الترخيص المحفوظة محلياً، وأي نسخ احتياطي فاشل سيتم حفظه وإعادة رفعه تلقائياً فور عودة الإنترنت.
            </div>
          </div>
        </div>
      )}

      {licenseInfo?.status === 'revoked' && (
        <div
          className="glass-card"
          style={{
            padding: '16px 20px',
            backgroundColor: 'rgba(220, 38, 38, 0.15)',
            borderColor: 'rgba(220, 38, 38, 0.4)',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <GlassIcon icon={AlertTriangle} size="sm" variant="danger" />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, color: '#EF4444', fontSize: 14 }}>
              الترخيص غير نشط أو تم إلغاؤه من الإدارة
            </div>
            <div style={{ fontSize: 13, color: '#CBD5E1', marginTop: 3 }}>
              {licenseInfo.inGracePeriod
                ? `أنت حالياً في فترة السماح (متبقي ${licenseInfo.graceDaysRemaining} يوماً). يرجى مراجعة إدارة النظام لتجديد الترخيص قبل إيقاف الخدمات السحابية.`
                : 'انتهت فترة السماح وتم تعطيل الميزات السحابية. نقطة البيع المحلية تعمل بدون توقف.'}
            </div>
          </div>
        </div>
      )}

      {licenseInfo?.isValid && !licenseInfo.hasCloudBackupFeature && (
        <div
          className="glass-card"
          style={{
            padding: '14px 18px',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderColor: 'rgba(59, 130, 246, 0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <GlassIcon icon={Info} size="sm" variant="brand" />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: '#60A5FA', fontSize: 13.5 }}>
              ميزة النسخ السحابي غير مشمولة في باقة ترخيصك
            </div>
            <div style={{ fontSize: 12.5, color: '#CBD5E1', marginTop: 2 }}>
              ترخيصك الحالي سارٍ للوظائف الأساسية، ولكن ميزة <code>cloud_backup</code> غير مفعلة في باقة الترخيص المسجلة.
            </div>
          </div>
        </div>
      )}

      {/* 2. بطاقة بيانات الترخيص ومعرف الجهاز */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20 }}>
        {/* معلومات الترخيص والتفعيل */}
        <div
          className="glass-card"
          style={{
            padding: 24,
            backgroundColor: '#161B22',
            border: '1px solid #262E3D',
            borderRadius: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <GlassIcon icon={Key} size="sm" variant="brand" />
              <h3 style={{ fontSize: 16, fontWeight: 800, color: '#FFB800', margin: 0 }}>
                الترخيص الرقمي والربط بالجهاز
              </h3>
            </div>
            {licenseInfo?.isValid ? (
              <span className="badge badge-success">
                <CheckCircle2 size={13} />
                ترخيص معتمد
              </span>
            ) : (
              <span className="badge badge-warn">
                <AlertTriangle size={13} />
                غير مفعل سحابياً
              </span>
            )}
          </div>

          <form onSubmit={handleVerifyLicense} style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <Input
                placeholder="أدخل حساب جوجل المعتمد (Google Account / Email)..."
                value={licenseKeyInput}
                onChange={(e) => setLicenseKeyInput(e.target.value)}
                required
              />
            </div>
            <Button
              type="submit"
              variant="primary"
              disabled={isVerifying || !licenseInfo?.isConfigured}
            >
              <RefreshCw size={16} className={isVerifying ? 'animate-spin' : ''} />
              {isVerifying ? 'جاري التحقق...' : 'تحقق وتفعيل'}
            </Button>
          </form>

          {/* تفاصيل الترخيص */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12,
              padding: '14px 16px',
              backgroundColor: '#0B0E14',
              borderRadius: 12,
              border: '1px solid #262E3D',
            }}
          >
            <div>
              <span style={{ fontSize: 11.5, color: '#94A3B8' }}>اسم العميل المعتمد:</span>
              <div style={{ fontWeight: 700, color: '#F8FAFC', fontSize: 13, marginTop: 2 }}>
                {licenseInfo?.customerName || 'غير مسجل'}
              </div>
            </div>
            <div>
              <span style={{ fontSize: 11.5, color: '#94A3B8' }}>حساب جوجل المعتمد:</span>
              <div style={{ fontWeight: 700, color: '#38BDF8', fontSize: 13, marginTop: 2, direction: 'ltr', textAlign: 'right' }}>
                {licenseInfo?.customerEmail || 'غير مسجل'}
              </div>
            </div>
            <div>
              <span style={{ fontSize: 11.5, color: '#94A3B8' }}>صلاحية التحديثات حتى:</span>
              <div style={{ fontWeight: 700, color: '#FFB800', fontSize: 13, marginTop: 2 }}>
                {licenseInfo?.updatesUntil || 'غير محدد'}
              </div>
            </div>
            <div>
              <span style={{ fontSize: 11.5, color: '#94A3B8' }}>حالة الترخيص:</span>
              <div style={{ marginTop: 2 }}>
                {licenseInfo?.status === 'active' && <span style={{ color: '#34D399', fontWeight: 700 }}>نشط (Active)</span>}
                {licenseInfo?.status === 'revoked' && <span style={{ color: '#F87171', fontWeight: 700 }}>ملغي (Revoked)</span>}
                {licenseInfo?.status === 'unlicensed' && <span style={{ color: '#94A3B8' }}>غير مسجل</span>}
              </div>
            </div>
            <div>
              <span style={{ fontSize: 11.5, color: '#94A3B8' }}>الميزات المشمولة:</span>
              <div style={{ fontSize: 12, color: '#CBD5E1', marginTop: 2 }}>
                {licenseInfo?.features && licenseInfo.features.length > 0
                  ? licenseInfo.features.join(' ، ')
                  : 'الخدمات الأساسية'}
              </div>
            </div>
          </div>

          {/* معرف الجهاز الثابت */}
          <div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#CBD5E1', marginBottom: 6 }}>
              معرّف هذا الجهاز (Hardware Machine ID):
            </label>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                backgroundColor: '#0B0E14',
                borderRadius: 10,
                border: '1px solid #30394A',
                fontFamily: 'monospace',
                fontSize: 13,
                color: '#FFB800',
              }}
            >
              <span>{licenseInfo?.machineId || 'جاري القراءة...'}</span>
              <button
                type="button"
                onClick={copyMachineId}
                title="نسخ معرف الجهاز"
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94A3B8',
                  cursor: 'pointer',
                  padding: 4,
                }}
              >
                <Copy size={16} />
              </button>
            </div>
            <span style={{ fontSize: 11, color: '#64748B', marginTop: 4, display: 'block' }}>
              يُربط الترخيص بهذا المعرف لمنع استخدام نفس النسخة على أجهزة غير مصرح بها.
            </span>
          </div>
        </div>

        {/* إعدادات النسخ الاحتياطي التلقائي وسياسة الأمان */}
        <div
          className="glass-card"
          style={{
            padding: 24,
            backgroundColor: '#161B22',
            border: '1px solid #262E3D',
            borderRadius: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <GlassIcon icon={Cloud} size="sm" variant="gold" />
            <h3 style={{ fontSize: 16, fontWeight: 800, color: '#FFB800', margin: 0 }}>
              النسخ السحابي التلقائي والتشفير
            </h3>
          </div>

          {/* تبديل التفعيل */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 18px',
              backgroundColor: '#0B0E14',
              borderRadius: 12,
              border: '1px solid #262E3D',
            }}
          >
            <div>
              <div style={{ fontWeight: 700, color: '#F8FAFC', fontSize: 13.5 }}>
                تفعيل النسخ السحابي التلقائي
              </div>
              <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>
                رفع نسخة مشفرة تلقائياً في الخلفية بدون أي تعطيل للبيع
              </div>
            </div>
            <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24 }}>
              <input
                type="checkbox"
                checked={autoBackupEnabled}
                onChange={(e) => handleSaveAutoBackup(e.target.checked, autoBackupInterval)}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span
                style={{
                  position: 'absolute',
                  cursor: 'pointer',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: autoBackupEnabled ? '#FFB800' : '#30394A',
                  transition: '0.2s',
                  borderRadius: 24,
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    content: '""',
                    height: 18,
                    width: 18,
                    left: autoBackupEnabled ? 22 : 3,
                    bottom: 3,
                    backgroundColor: autoBackupEnabled ? '#000000' : '#FFFFFF',
                    transition: '0.2s',
                    borderRadius: '50%',
                  }}
                />
              </span>
            </label>
          </div>

          {/* معدل التكرار */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#CBD5E1', marginBottom: 6 }}>
              معدل تكرار النسخ الاحتياطي:
            </label>
            <select
              value={autoBackupInterval}
              onChange={(e) => handleSaveAutoBackup(autoBackupEnabled, e.target.value)}
              className="in"
              style={{ width: '100%', height: 42 }}
            >
              <option value="6">كل 6 ساعات</option>
              <option value="12">كل 12 ساعة</option>
              <option value="24">كل 24 ساعة (يومياً - موصى به)</option>
              <option value="48">كل 48 ساعة (يومين)</option>
            </select>
          </div>

          {/* تنبيه سياسة التشفير والاحتفاظ */}
          <div
            style={{
              padding: '12px 14px',
              backgroundColor: 'rgba(255, 184, 0, 0.06)',
              borderRadius: 10,
              border: '1px dashed rgba(255, 184, 0, 0.25)',
              fontSize: 12,
              color: '#CBD5E1',
              lineHeight: 1.6,
            }}
          >
            🔒 <strong style={{ color: '#FFB800' }}>أمان التشفير:</strong> تشفر النسخ قبل خروجها من جهازك بخوارزمية <code>AES-256-GCM</code> بمفتاح مشتق من بصمة الجهاز والترخيص، ويتم الاحتفاظ بآخر 7 نسخ فقط تلقائياً.
          </div>

          {/* زر أخذ نسخة الآن */}
          <Button
            type="button"
            variant="primary"
            onClick={handleBackupNow}
            disabled={isBackingUp || !licenseInfo?.hasCloudBackupFeature || !licenseInfo?.isConfigured}
            style={{ width: '100%', height: 44, marginTop: 'auto' }}
          >
            <CloudUpload size={18} className={isBackingUp ? 'animate-spin' : ''} />
            {isBackingUp ? 'جاري التشفير والرفع...' : 'أخذ نسخة سحابية الآن (Backup Now)'}
          </Button>
        </div>
      </div>

      {/* 3. جدول النسخ السحابية المتوفرة وخيار الاستعادة */}
      <div
        className="glass-card"
        style={{
          padding: 24,
          backgroundColor: '#161B22',
          border: '1px solid #262E3D',
          borderRadius: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <GlassIcon icon={CloudDownload} size="sm" variant="brand" />
            <h3 style={{ fontSize: 16, fontWeight: 800, color: '#FFB800', margin: 0 }}>
              النسخ الاحتياطية السحابية المتاحة ({backups.length})
            </h3>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={fetchCloudData}
            disabled={isLoading}
            style={{ height: 36, padding: '0 12px', fontSize: 12.5 }}
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            تحديث القائمة
          </Button>
        </div>

        {backups.length === 0 ? (
          <div
            style={{
              padding: '36px 20px',
              textAlign: 'center',
              backgroundColor: '#0B0E14',
              borderRadius: 12,
              border: '1px solid #262E3D',
              color: '#94A3B8',
            }}
          >
            <HardDrive size={38} color="#475569" style={{ margin: '0 auto 10px auto' }} />
            <div style={{ fontSize: 14, fontWeight: 700, color: '#CBD5E1' }}>لا توجد نسخ احتياطية سحابية مسجلة بعد</div>
            <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 4 }}>
              اضغط على "أخذ نسخة سحابية الآن" لرفع أول نسخة مشفرة لقاعدة بيانات المحل.
            </div>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>تاريخ وتوقيت النسخة</th>
                  <th>حجم الملف المشفر</th>
                  <th>إصدار التطبيق</th>
                  <th>المسار السحابي</th>
                  <th style={{ textAlign: 'center' }}>الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.id}>
                    <td style={{ fontWeight: 700, color: '#F8FAFC' }}>
                      {formatDate(b.created_at)}
                    </td>
                    <td style={{ fontFamily: 'monospace', color: '#FFB800' }}>
                      {formatBytes(b.size_bytes)}
                    </td>
                    <td>
                      <span className="badge badge-neutral">{b.app_version || '2.0.0'}</span>
                    </td>
                    <td style={{ fontSize: 12, color: '#94A3B8', fontFamily: 'monospace' }}>
                      {b.storage_path}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <Button
                        type="button"
                        variant="danger"
                        onClick={() => setSelectedBackupForRestore(b)}
                        style={{ height: 34, padding: '0 14px', fontSize: 12.5 }}
                      >
                        <RotateCcw size={14} />
                        استعادة
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* حوار التأكيد لاستعادة النسخة السحابية */}
      <ConfirmDialog
        isOpen={Boolean(selectedBackupForRestore)}
        title="تأكيد استعادة النسخة الاحتياطية السحابية"
        message={`هل أنت متأكد من رغبتك في استعادة النسخة المؤرخة في (${selectedBackupForRestore ? formatDate(selectedBackupForRestore.created_at) : ''})؟
\nسيقوم النظام تلقائياً بأخذ نسخة أمان محلية من قاعدة بياناتك الحالية قبل الاستبدال، ثم فك التشفير والتحقق من سلامة البيانات، وأخيراً إعادة تشغيل التطبيق فوراً.`}
        confirmLabel={isRestoring ? 'جاري الاستعادة...' : 'تأكيد الاستعادة والتشغيل'}
        cancelLabel="إلغاء الأمر"
        isDangerous={true}
        onConfirm={handleConfirmRestore}
        onCancel={() => {
          if (!isRestoring) setSelectedBackupForRestore(null);
        }}
      />
    </div>
  );
}

