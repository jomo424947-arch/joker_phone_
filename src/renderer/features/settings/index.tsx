import React, { useState, useEffect } from 'react';
import {
  Store,
  Users,
  HardDriveDownload,
  Cloud,
  ShieldCheck,
  Save,
  CheckCircle2,
  Clock,
  Lock,
} from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { GlassIcon, GlassIconVariant } from '../../components/common/GlassIcon';
import { UsersPage } from '../users/UsersPage';
import { BackupPage } from '../backup/BackupPage';
import { AuditLogPage } from '../audit/AuditLogPage';
import { CloudSettingsPage } from './CloudSettingsPage';
import { sounds } from '../../lib/sounds';
import { useToast } from '../../components/common/ToastContext';
import { MESSAGES } from '../../lib/messages';
import logoImg from '../../assets/logo.png';

type SettingsTab = 'store' | 'users' | 'backup' | 'cloud' | 'audit';

interface TabDef {
  id: SettingsTab;
  label: string;
  icon: typeof Store;
  variant: GlassIconVariant;
}

const tabs: TabDef[] = [
  { id: 'store', label: 'بيانات المحل والترويسة', icon: Store, variant: 'brand' },
  { id: 'users', label: 'المستخدمون والصلاحيات', icon: Users, variant: 'primary' },
  { id: 'backup', label: 'النسخ الاحتياطي والأمان', icon: HardDriveDownload, variant: 'gold' },
  { id: 'cloud', label: 'الخدمات السحابية والترخيص', icon: Cloud, variant: 'brand' },
  { id: 'audit', label: 'سجل التدقيق والرقابة', icon: ShieldCheck, variant: 'rose' },
];

export function SettingsScreen(): React.ReactElement {
  const { success: toastSuccess } = useToast();
  const [activeSubTab, setActiveSubTab] = useState<SettingsTab>('store');

  // بيانات المحل
  const [storeName, setStoreName] = useState('موبيكس - Mobix');
  const [storeAddress, setStoreAddress] = useState('شريكك الذكي لإدارة محلات الموبايلات');
  const [storePhone, setStorePhone] = useState('01000000000');
  const [taxNumber, setTaxNumber] = useState('');
  const [receiptFooter, setReceiptFooter] = useState('شكراً لتعاملكم مع موبيكس - ضمان وجودة في كل جهاز');

  // سياسات الأمان
  const [autoLockMinutes, setAutoLockMinutes] = useState('5');
  const [maxFailedAttempts, setMaxFailedAttempts] = useState('5');
  const [lockoutDuration, setLockoutDuration] = useState('15');
  const [retentionDays, setRetentionDays] = useState('30');

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const electron = (window as any).electron;
        if (electron?.getSettings) {
          const res = await electron.getSettings();
          if (res?.success && res.data) {
            const map = res.data;
            if (map.store_name) setStoreName(map.store_name);
            if (map.store_address) setStoreAddress(map.store_address);
            if (map.store_phone) setStorePhone(map.store_phone);
            if (map.tax_number) setTaxNumber(map.tax_number);
            if (map.receipt_footer) setReceiptFooter(map.receipt_footer);
            if (map.auto_lock_minutes) setAutoLockMinutes(map.auto_lock_minutes);
            if (map.max_failed_attempts) setMaxFailedAttempts(map.max_failed_attempts);
            if (map.lockout_duration_minutes) setLockoutDuration(map.lockout_duration_minutes);
            if (map.audit_retention_days) setRetentionDays(map.audit_retention_days);
          }
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchSettings();
  }, []);

  const handleSaveStore = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const electron = (window as any).electron;
      if (electron?.updateSettings) {
        await electron.updateSettings([
          { key: 'store_name', value: storeName },
          { key: 'store_address', value: storeAddress },
          { key: 'store_phone', value: storePhone },
          { key: 'tax_number', value: taxNumber },
          { key: 'receipt_footer', value: receiptFooter },
        ], 1);
      }
      sounds.playSaleSuccess();
      toastSuccess('تم حفظ بيانات المتجر والترويسة بنجاح');
    } catch {
      sounds.playError();
      toastSuccess('فشل حفظ الإعدادات');
    }
  };

  const handleSaveSecurity = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const electron = (window as any).electron;
      if (electron?.updateSettings) {
        await electron.updateSettings([
          { key: 'auto_lock_minutes', value: autoLockMinutes },
          { key: 'max_failed_attempts', value: maxFailedAttempts },
          { key: 'lockout_duration_minutes', value: lockoutDuration },
          { key: 'audit_retention_days', value: retentionDays },
        ], 1);
      }
      sounds.playSaleSuccess();
      toastSuccess('تم تحديث سياسات الأمان والقفل التلقائي بنجاح');
    } catch {
      sounds.playError();
      toastSuccess('فشل حفظ سياسات الأمان');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, direction: 'rtl', height: '100%' }}>
      {/* شريط التبويبات الفرعية الزجاجي */}
      <div
        className="glass-card"
        style={{
          display: 'flex',
          backgroundColor: '#161B22',
          border: '1px solid #262E3D',
          borderRadius: 14,
          padding: 6,
          gap: 6,
        }}
      >
        {tabs.map((tab) => {
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                sounds.playClick();
                setActiveSubTab(tab.id);
              }}
              style={{
                flex: 1,
                padding: '10px 14px',
                border: isActive ? '1px solid rgba(255, 184, 0, 0.35)' : '1px solid transparent',
                borderRadius: 10,
                backgroundColor: isActive ? 'rgba(255, 184, 0, 0.15)' : 'transparent',
                color: isActive ? '#FFB800' : '#94A3B8',
                fontWeight: isActive ? 800 : 600,
                fontSize: 14,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                transition: 'all 0.18s ease',
              }}
            >
              <GlassIcon icon={tab.icon} size="xs" variant={tab.variant} active={isActive} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* محتوى الإعدادات */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {activeSubTab === 'store' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* بطاقة بيانات المتجر */}
            <form onSubmit={handleSaveStore}>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <GlassIcon icon={Store} size="sm" variant="brand" />
                  <h3 style={{ fontSize: 16, fontWeight: 800, color: '#FFB800', margin: 0 }}>
                    بيانات المتجر والترويسة للإيصالات
                  </h3>
                </div>

                {/* الشعار الرسمي للمتجر */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: '12px 16px',
                    borderRadius: 14,
                    backgroundColor: '#0B0E14',
                    border: '1px solid #262E3D',
                  }}
                >
                  <div
                    style={{
                      width: 54,
                      height: 54,
                      minWidth: 54,
                      borderRadius: '14px',
                      padding: 2,
                      background: 'linear-gradient(135deg, #FFB800 0%, #FFA800 100%)',
                      boxShadow: '0 4px 14px rgba(255, 184, 0, 0.35)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <img
                      src={logoImg}
                      alt="موبيكس - Mobix"
                      style={{
                        width: '100%',
                        height: '100%',
                        borderRadius: '12px',
                        objectFit: 'cover',
                        backgroundColor: '#0B0E14',
                      }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#FFB800' }}>
                      الشعار المعتمد: موبيكس (Mobix)
                    </div>
                    <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>
                      مدمج كأيقونة وهوية معتمدة للتطبيق، ملف الـ .exe، إيصالات الصيانة والمبيعات
                    </div>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#F8FAFC', marginBottom: 6 }}>
                    اسم المحل / العلامة التجارية
                  </label>
                  <Input value={storeName} onChange={(e) => setStoreName(e.target.value)} required />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#F8FAFC', marginBottom: 6 }}>
                    العنوان المطبوع بالإيصال
                  </label>
                  <Input value={storeAddress} onChange={(e) => setStoreAddress(e.target.value)} required />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#F8FAFC', marginBottom: 6 }}>
                      رقم الهاتف للتواصل
                    </label>
                    <Input value={storePhone} onChange={(e) => setStorePhone(e.target.value)} required />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#F8FAFC', marginBottom: 6 }}>
                      الرقم الضريبي / السجل
                    </label>
                    <Input value={taxNumber} onChange={(e) => setTaxNumber(e.target.value)} />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#F8FAFC', marginBottom: 6 }}>
                    رسالة تذييل الإيصال الحراري
                  </label>
                  <Input value={receiptFooter} onChange={(e) => setReceiptFooter(e.target.value)} />
                </div>

                <Button type="submit" variant="primary" style={{ height: 44, marginTop: 8 }}>
                  <Save size={16} />
                  <span>حفظ إعدادات المتجر</span>
                </Button>
              </div>
            </form>

            {/* بطاقة سياسات الأمان */}
            <form onSubmit={handleSaveSecurity}>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <GlassIcon icon={Lock} size="sm" variant="gold" />
                  <h3 style={{ fontSize: 16, fontWeight: 800, color: '#FFB800', margin: 0 }}>
                    سياسات الأمان والقفل التلقائي
                  </h3>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#F8FAFC', marginBottom: 6 }}>
                    مهلة القفل التلقائي للشاشة عند خمول الكاشير (بالدقائق)
                  </label>
                  <Input
                    type="number"
                    value={autoLockMinutes}
                    onChange={(e) => setAutoLockMinutes(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#F8FAFC', marginBottom: 6 }}>
                    الحد الأقصى لمحاولات تسجيل الدخول الفاشلة قبل التجميد
                  </label>
                  <Input
                    type="number"
                    value={maxFailedAttempts}
                    onChange={(e) => setMaxFailedAttempts(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#F8FAFC', marginBottom: 6 }}>
                    مدة تجميد الحساب عند تكرار إدخال PIN خاطئ (بالدقائق)
                  </label>
                  <Input
                    type="number"
                    value={lockoutDuration}
                    onChange={(e) => setLockoutDuration(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#F8FAFC', marginBottom: 6 }}>
                    مدة الاحتفاظ بالنسخ الاحتياطية وتدويرها تلقائياً (بالأيام)
                  </label>
                  <Input
                    type="number"
                    value={retentionDays}
                    onChange={(e) => setRetentionDays(e.target.value)}
                    required
                  />
                </div>

                <Button type="submit" variant="secondary" style={{ height: 44, marginTop: 8 }}>
                  <ShieldCheck size={16} />
                  <span>تحديث سياسات الأمان والحماية</span>
                </Button>
              </div>
            </form>
          </div>
        )}

        {activeSubTab === 'users' && <UsersPage />}

        {activeSubTab === 'backup' && <BackupPage />}

        {activeSubTab === 'cloud' && <CloudSettingsPage />}

        {activeSubTab === 'audit' && <AuditLogPage />}
      </div>
    </div>
  );
}

export default SettingsScreen;
