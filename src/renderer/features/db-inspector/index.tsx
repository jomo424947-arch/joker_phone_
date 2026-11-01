import React, { useState, useEffect, useMemo } from 'react';
import {
  Database,
  FolderOpen,
  FileText,
  Users,
  Phone,
  Receipt,
  Package,
  Clock,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Download,
  Search,
  RefreshCw,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Layers,
  Sparkles,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { GlassIcon } from '../../components/common/GlassIcon';
import { Modal } from '../../components/common/Modal';
import { useToast } from '../../components/common/ToastContext';
import { sounds } from '../../lib/sounds';
import {
  DatabaseInspectionResult,
  BackupFileInfo,
  InspectorSale,
  InspectorContact,
  InspectorUser,
  InspectorProduct,
  InspectorShift,
  InspectorAuditLog,
} from '../../../shared/types/db-inspector.types';

type InspectorTab = 'overview' | 'users' | 'contacts' | 'sales' | 'products' | 'shifts' | 'audit';

export function DatabaseInspectorScreen(): React.ReactElement {
  const { success: toastSuccess, error: toastError } = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<DatabaseInspectionResult | null>(null);
  const [backups, setBackups] = useState<BackupFileInfo[]>([]);
  const [activeTab, setActiveTab] = useState<InspectorTab>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [contactFilter, setContactFilter] = useState<'all' | 'customer' | 'supplier' | 'debt'>('all');
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);
  const [selectedSale, setSelectedSale] = useState<InspectorSale | null>(null);

  // جلب النسخ الاحتياطية المتوفرة تلقائياً عند فتح الشاشة
  useEffect(() => {
    fetchAvailableBackups();
    // تحميل تلقائي لقاعدة البيانات الحالية
    loadActiveDatabase();
  }, []);

  const fetchAvailableBackups = async () => {
    try {
      const electron = (window as any).electron;
      if (electron?.listInspectorBackups) {
        const res = await electron.listInspectorBackups();
        if (res?.success && Array.isArray(res.data)) {
          setBackups(res.data);
        }
      }
    } catch (err) {
      console.error('Failed to list backups:', err);
    }
  };

  const loadActiveDatabase = async () => {
    setIsLoading(true);
    try {
      const electron = (window as any).electron;
      if (electron?.inspectDatabase) {
        const res = await electron.inspectDatabase();
        if (res?.success && res.data) {
          setData(res.data);
          sounds.playSaleSuccess();
          return;
        } else if (res?.error) {
          toastError(res.error);
        }
      }
    } catch (err: any) {
      toastError(err.message || 'فشل فحص قاعدة البيانات الحالية');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectFile = async () => {
    try {
      const electron = (window as any).electron;
      if (!electron?.selectDatabaseFile) {
        toastError('ميزة اختيار الملفات غير متوفرة في هذا المتصفح');
        return;
      }

      const res = await electron.selectDatabaseFile();
      if (res?.canceled) return;

      if (res?.success && res.filePath) {
        await inspectSpecificFile(res.filePath);
      } else if (res?.error) {
        toastError(res.error);
      }
    } catch (err: any) {
      toastError(err.message || 'حدث خطأ أثناء فتح نافذة الملفات');
    }
  };

  const inspectSpecificFile = async (filePath: string) => {
    setIsLoading(true);
    try {
      const electron = (window as any).electron;
      const res = await electron.inspectDatabase(filePath);
      if (res?.success && res.data) {
        setData(res.data);
        sounds.playSaleSuccess();
        toastSuccess(`تم فحص ملف: ${res.data.meta.fileName} بنجاح`);
      } else {
        sounds.playError();
        toastError(res?.error || 'فشل فحص الملف المحدد');
      }
    } catch (err: any) {
      sounds.playError();
      toastError(err.message || 'خطأ أثناء فحص الملف');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyPhone = (phone: string) => {
    navigator.clipboard.writeText(phone);
    setCopiedPhone(phone);
    toastSuccess(`تم نسخ الرقم: ${phone}`);
    setTimeout(() => setCopiedPhone(null), 2000);
  };

  const handleExportJson = () => {
    if (!data) return;
    try {
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `database_audit_${data.meta.fileName.replace('.db', '')}_${Date.now()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      sounds.playSaleSuccess();
      toastSuccess('تم تصدير ملف التقرير الكامل بصيغة JSON بنجاح');
    } catch (err: any) {
      toastError('فشل تصدير التقرير: ' + err.message);
    }
  };

  // تصفية جهات الاتصال والأرقام
  const filteredContacts = useMemo(() => {
    if (!data) return [];
    return data.contacts.filter((c) => {
      const matchQuery =
        !searchQuery.trim() ||
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.phone.includes(searchQuery) ||
        (c.address && c.address.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchQuery) return false;

      if (contactFilter === 'customer') return c.type === 'عميل';
      if (contactFilter === 'supplier') return c.type === 'مورد';
      if (contactFilter === 'debt') return c.balanceEgp > 0;
      return true;
    });
  }, [data, searchQuery, contactFilter]);

  // تصفية العمليات
  const filteredSales = useMemo(() => {
    if (!data) return [];
    if (!searchQuery.trim()) return data.sales;
    const q = searchQuery.toLowerCase();
    return data.sales.filter(
      (s) =>
        s.invoiceNo.toLowerCase().includes(q) ||
        s.cashierName.toLowerCase().includes(q) ||
        (s.customerName && s.customerName.toLowerCase().includes(q)) ||
        (s.customerPhone && s.customerPhone.includes(q)) ||
        s.paymentMethod.toLowerCase().includes(q)
    );
  }, [data, searchQuery]);

  // تصفية المستخدمين
  const filteredUsers = useMemo(() => {
    if (!data) return [];
    if (!searchQuery.trim()) return data.users;
    const q = searchQuery.toLowerCase();
    return data.users.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        u.displayName.toLowerCase().includes(q) ||
        u.roleArabic.toLowerCase().includes(q)
    );
  }, [data, searchQuery]);

  // تصفية المنتجات
  const filteredProducts = useMemo(() => {
    if (!data) return [];
    if (!searchQuery.trim()) return data.products;
    const q = searchQuery.toLowerCase();
    return data.products.filter(
      (p) =>
        p.nameAr.toLowerCase().includes(q) ||
        (p.categoryName && p.categoryName.toLowerCase().includes(q)) ||
        p.barcodes.some((b) => b.includes(q))
    );
  }, [data, searchQuery]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        gap: 18,
        padding: '24px 32px',
        overflowY: 'auto',
        backgroundColor: '#F8FAFC',
        color: '#1E293B',
        direction: 'rtl',
      }}
    >
      {/* 1. ترويسة الصفحة وأزرار التحكم الرئيسية */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          backgroundColor: '#161B22',
          border: '1px solid #262E3D',
          padding: '20px 24px',
          borderRadius: 16,
          boxShadow: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: 'linear-gradient(135deg, #FFB800 0%, #FFA800 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 16px -4px rgba(255, 184, 0, 0.35)',
              color: '#0B0E14',
            }}
          >
            <Database size={26} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#F8FAFC' }}>
              مستكشف وفاحص قواعد البيانات SQLite
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94A3B8' }}>
              رفع واستعراض محتويات أي ملف قاعدة بيانات أو نسخة احتياطية (.db) في وضع القراءة الآمن (المسجلين، الأرقام،
              والعمليات)
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Button
            onClick={handleSelectFile}
            disabled={isLoading}
            variant="primary"
            style={{
              background: 'linear-gradient(135deg, #FFB800 0%, #FFA800 100%)',
              color: '#0B0E14',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 18px',
              borderRadius: 10,
              boxShadow: '0 6px 14px -3px rgba(255, 184, 0, 0.35)',
            }}
          >
            <FolderOpen size={18} />
            <span>رفع / اختيار ملف قاعدة بيانات (.db)</span>
          </Button>

          <Button
            onClick={loadActiveDatabase}
            disabled={isLoading}
            variant="secondary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 16px',
              borderRadius: 10,
              fontWeight: 600,
            }}
          >
            <RefreshCw size={17} className={isLoading ? 'animate-spin' : ''} />
            <span>فحص القاعدة النشطة الحالية</span>
          </Button>

          {data && (
            <Button
              onClick={handleExportJson}
              variant="secondary"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 16px',
                borderRadius: 10,
                fontWeight: 600,
                borderColor: '#CBD5E1',
              }}
            >
              <Download size={17} />
              <span>تصدير تقرير JSON</span>
            </Button>
          )}
        </div>
      </div>

      {/* 2. شريط النسخ الاحتياطية المتوفرة للاختيار السريع */}
      {backups.length > 0 && (
        <div
          style={{
            backgroundColor: '#161B22',
            borderRadius: 14,
            padding: '14px 20px',
            border: '1px solid #262E3D',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            overflowX: 'auto',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13,
              fontWeight: 700,
              color: '#CBD5E1',
              whiteSpace: 'nowrap',
            }}
          >
            <Layers size={17} color="#FFB800" />
            <span>نسخ احتياطية متوفرة:</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, overflowX: 'auto' }}>
            {backups.slice(0, 5).map((b) => (
              <button
                key={b.filePath}
                onClick={() => inspectSpecificFile(b.filePath)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: data?.meta.filePath === b.filePath ? '1.5px solid #FFB800' : '1px solid #262E3D',
                  backgroundColor: data?.meta.filePath === b.filePath ? 'rgba(255, 184, 0, 0.12)' : '#0B0E14',
                  color: data?.meta.filePath === b.filePath ? '#FFB800' : '#CBD5E1',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.2s ease',
                }}
              >
                <span>{b.fileName}</span>
                <span style={{ fontSize: 11, color: '#94A3B8' }}>({b.fileSizeFormatted})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 3. بطاقة بيانات الملف المفحوص وحالة السلامة */}
      {data && (
        <div
          style={{
            backgroundColor: '#161B22',
            borderRadius: 16,
            padding: '18px 24px',
            border: '1px solid #262E3D',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                backgroundColor: data.meta.integrityOk ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: data.meta.integrityOk ? '#34D399' : '#EF4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {data.meta.integrityOk ? <CheckCircle2 size={24} /> : <AlertTriangle size={24} />}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: '#F8FAFC' }}>{data.meta.fileName}</span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 6,
                    backgroundColor: data.meta.integrityOk ? 'rgba(34, 197, 94, 0.18)' : 'rgba(239, 68, 68, 0.18)',
                    color: data.meta.integrityOk ? '#34D399' : '#EF4444',
                  }}
                >
                  {data.meta.integrityMessage}
                </span>
                {data.meta.schemaVersion && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 6,
                      backgroundColor: '#1C222D',
                      color: '#FFB800',
                      border: '1px solid #262E3D',
                    }}
                  >
                    مخطط V{data.meta.schemaVersion}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 4, wordBreak: 'break-all' }}>
                المسار: <code style={{ backgroundColor: '#0B0E14', padding: '2px 6px', borderRadius: 4, color: '#FFB800', border: '1px solid #262E3D' }}>{data.meta.filePath}</code>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 20, fontSize: 13, color: '#CBD5E1' }}>
            <div>
              حجم الملف: <strong style={{ color: '#F8FAFC' }}>{data.meta.fileSizeFormatted}</strong>
            </div>
            <div style={{ width: 1, height: 24, backgroundColor: '#262E3D' }} />
            <div>
              المتجر: <strong style={{ color: '#FFB800' }}>{data.meta.storeName || 'موبيكس'}</strong>
            </div>
            {data.meta.storePhone && (
              <>
                <div style={{ width: 1, height: 24, backgroundColor: '#262E3D' }} />
                <div>
                  هاتف المتجر: <strong style={{ color: '#F8FAFC' }}>{data.meta.storePhone}</strong>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 4. بطاقات الإحصائيات الشاملة (KPIs Cards) */}
      {data && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 14,
          }}
        >
          {/* المستخدمون المسجلون */}
          <div
            onClick={() => setActiveTab('users')}
            style={{
              backgroundColor: activeTab === 'users' ? '#1C222D' : '#161B22',
              borderColor: activeTab === 'users' ? '#FFB800' : '#262E3D',
              borderWidth: 1.5,
              borderStyle: 'solid',
              borderRadius: 14,
              padding: '16px 18px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: activeTab === 'users' ? '0 0 14px rgba(255, 184, 0, 0.2)' : 'none',
            }}
          >
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#CBD5E1' }}>المستخدمين المسجلين</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#F8FAFC', marginTop: 4 }}>
                {data.kpis.totalUsers}
              </div>
            </div>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 10,
                backgroundColor: 'rgba(255, 184, 0, 0.12)',
                color: '#FFB800',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Users size={22} />
            </div>
          </div>

          {/* دليل الأرقام والتواصل */}
          <div
            onClick={() => setActiveTab('contacts')}
            style={{
              backgroundColor: activeTab === 'contacts' ? '#1C222D' : '#161B22',
              borderColor: activeTab === 'contacts' ? '#FFB800' : '#262E3D',
              borderWidth: 1.5,
              borderStyle: 'solid',
              borderRadius: 14,
              padding: '16px 18px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: activeTab === 'contacts' ? '0 0 14px rgba(255, 184, 0, 0.2)' : 'none',
            }}
          >
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#CBD5E1' }}>الأرقام والتواصل</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#34D399', marginTop: 4 }}>
                {data.contacts.length}
              </div>
            </div>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 10,
                backgroundColor: 'rgba(52, 211, 153, 0.12)',
                color: '#34D399',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Phone size={22} />
            </div>
          </div>

          {/* فواتير وعمليات البيع */}
          <div
            onClick={() => setActiveTab('sales')}
            style={{
              backgroundColor: activeTab === 'sales' ? '#1C222D' : '#161B22',
              borderColor: activeTab === 'sales' ? '#FFB800' : '#262E3D',
              borderWidth: 1.5,
              borderStyle: 'solid',
              borderRadius: 14,
              padding: '16px 18px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: activeTab === 'sales' ? '0 0 14px rgba(255, 184, 0, 0.2)' : 'none',
            }}
          >
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#CBD5E1' }}>عمليات وفواتير البيع</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#FFB800', marginTop: 4 }}>
                {data.kpis.totalSalesCount}
              </div>
            </div>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 10,
                backgroundColor: 'rgba(255, 184, 0, 0.12)',
                color: '#FFB800',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Receipt size={22} />
            </div>
          </div>

          {/* إجمالي الإيرادات */}
          <div
            onClick={() => setActiveTab('sales')}
            style={{
              backgroundColor: '#161B22',
              borderColor: '#262E3D',
              borderWidth: 1,
              borderStyle: 'solid',
              borderRadius: 14,
              padding: '16px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
            }}
          >
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#CBD5E1' }}>إجمالي المبيعات المحققة</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#FFB800', marginTop: 4 }}>
                {data.kpis.totalRevenueEgp.toLocaleString()} <span style={{ fontSize: 12, fontWeight: 500, color: '#CBD5E1' }}>ج.م</span>
              </div>
            </div>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 10,
                backgroundColor: 'rgba(255, 184, 0, 0.12)',
                color: '#FFB800',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Sparkles size={22} />
            </div>
          </div>

          {/* المنتجات المسجلة */}
          <div
            onClick={() => setActiveTab('products')}
            style={{
              backgroundColor: activeTab === 'products' ? '#1C222D' : '#161B22',
              borderColor: activeTab === 'products' ? '#FFB800' : '#262E3D',
              borderWidth: 1.5,
              borderStyle: 'solid',
              borderRadius: 14,
              padding: '16px 18px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: activeTab === 'products' ? '0 0 14px rgba(255, 184, 0, 0.2)' : 'none',
            }}
          >
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#CBD5E1' }}>المنتجات والأصناف</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#F8FAFC', marginTop: 4 }}>
                {data.kpis.totalProducts}
              </div>
            </div>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 10,
                backgroundColor: 'rgba(255, 184, 0, 0.12)',
                color: '#FFB800',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Package size={22} />
            </div>
          </div>

          {/* الورديات */}
          <div
            onClick={() => setActiveTab('shifts')}
            style={{
              backgroundColor: activeTab === 'shifts' ? '#1C222D' : '#161B22',
              borderColor: activeTab === 'shifts' ? '#FFB800' : '#262E3D',
              borderWidth: 1.5,
              borderStyle: 'solid',
              borderRadius: 14,
              padding: '16px 18px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: activeTab === 'shifts' ? '0 0 14px rgba(255, 184, 0, 0.2)' : 'none',
            }}
          >
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#CBD5E1' }}>الورديات والخزينة</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#F8FAFC', marginTop: 4 }}>
                {data.kpis.totalShifts}
              </div>
            </div>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 10,
                backgroundColor: 'rgba(255, 184, 0, 0.12)',
                color: '#FFB800',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Clock size={22} />
            </div>
          </div>

          {/* سجلات الرقابة والتدقيق */}
          <div
            onClick={() => setActiveTab('audit')}
            style={{
              backgroundColor: activeTab === 'audit' ? '#1C222D' : '#161B22',
              borderColor: activeTab === 'audit' ? '#FFB800' : '#262E3D',
              borderWidth: 1.5,
              borderStyle: 'solid',
              borderRadius: 14,
              padding: '16px 18px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: activeTab === 'audit' ? '0 0 14px rgba(255, 184, 0, 0.2)' : 'none',
            }}
          >
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#CBD5E1' }}>سجلات الرقابة</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#F8FAFC', marginTop: 4 }}>
                {data.kpis.totalAuditLogs}
              </div>
            </div>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 10,
                backgroundColor: 'rgba(255, 184, 0, 0.12)',
                color: '#FFB800',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ShieldCheck size={22} />
            </div>
          </div>
        </div>
      )}

      {/* 5. شريط التبويبات والبحث الشامل */}
      {data && (
        <div
          style={{
            backgroundColor: '#161B22',
            borderRadius: 16,
            padding: '16px 20px',
            border: '1px solid #262E3D',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 14,
              borderBottom: '1px solid #262E3D',
              paddingBottom: 14,
            }}
          >
            {/* التبويبات */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <button
                onClick={() => setActiveTab('overview')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 16px',
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 700,
                  border: 'none',
                  backgroundColor: activeTab === 'overview' ? '#FFB800' : 'transparent',
                  color: activeTab === 'overview' ? '#0B0E14' : '#CBD5E1',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <Database size={16} />
                <span>نظرة عامة</span>
              </button>

              <button
                onClick={() => setActiveTab('users')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 16px',
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 700,
                  border: 'none',
                  backgroundColor: activeTab === 'users' ? '#FFB800' : 'transparent',
                  color: activeTab === 'users' ? '#0B0E14' : '#CBD5E1',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <Users size={16} />
                <span>المستخدمين المسجلين ({data.users.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('contacts')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 16px',
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 700,
                  border: 'none',
                  backgroundColor: activeTab === 'contacts' ? '#FFB800' : 'transparent',
                  color: activeTab === 'contacts' ? '#0B0E14' : '#CBD5E1',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <Phone size={16} />
                <span>دليل الأرقام والتواصل ({data.contacts.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('sales')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 16px',
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 700,
                  border: 'none',
                  backgroundColor: activeTab === 'sales' ? '#FFB800' : 'transparent',
                  color: activeTab === 'sales' ? '#0B0E14' : '#CBD5E1',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <Receipt size={16} />
                <span>فواتير العمليات ({data.sales.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('products')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 16px',
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 700,
                  border: 'none',
                  backgroundColor: activeTab === 'products' ? '#FFB800' : 'transparent',
                  color: activeTab === 'products' ? '#0B0E14' : '#CBD5E1',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <Package size={16} />
                <span>المنتجات والمخزون ({data.products.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('shifts')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 16px',
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 700,
                  border: 'none',
                  backgroundColor: activeTab === 'shifts' ? '#FFB800' : 'transparent',
                  color: activeTab === 'shifts' ? '#0B0E14' : '#CBD5E1',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <Clock size={16} />
                <span>الورديات ({data.shifts.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('audit')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 16px',
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 700,
                  border: 'none',
                  backgroundColor: activeTab === 'audit' ? '#FFB800' : 'transparent',
                  color: activeTab === 'audit' ? '#0B0E14' : '#CBD5E1',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <ShieldCheck size={16} />
                <span>سجل الرقابة ({data.auditLogs.length})</span>
              </button>
            </div>

            {/* حقل البحث السريع */}
            {activeTab !== 'overview' && (
              <div style={{ position: 'relative', width: 280 }}>
                <Search
                  size={17}
                  color="#FFB800"
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }}
                />
                <input
                  type="text"
                  placeholder="بحث سريع في النتائج..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 36px 8px 12px',
                    borderRadius: 8,
                    border: '1px solid #262E3D',
                    backgroundColor: '#0B0E14',
                    color: '#F8FAFC',
                    fontSize: 13,
                    outline: 'none',
                    direction: 'rtl',
                  }}
                />
              </div>
            )}
          </div>

          {/* محتوى التبويب المختار */}
          <div>
            {/* 1. تبويب نظرة عامة */}
            {activeTab === 'overview' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
                  {/* ملخص المستخدمين الأحدث */}
                  <div
                    style={{
                      border: '1px solid #262E3D',
                      borderRadius: 12,
                      padding: 16,
                      backgroundColor: '#1C222D',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 12,
                      }}
                    >
                      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#F8FAFC' }}>
                        👥 المستخدمون المسجلون ({data.users.length})
                      </h3>
                      <button
                        onClick={() => setActiveTab('users')}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#FFB800',
                          fontWeight: 700,
                          fontSize: 12,
                          cursor: 'pointer',
                        }}
                      >
                        عرض الكل ←
                      </button>
                    </div>
                    {data.users.length === 0 ? (
                      <div style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', padding: '20px 0' }}>
                        لا يوجد مستخدمون مسجلون في هذه القاعدة
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {data.users.slice(0, 5).map((u) => (
                          <div
                            key={u.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '8px 12px',
                              backgroundColor: '#0B0E14',
                              borderRadius: 8,
                              border: '1px solid #262E3D',
                            }}
                          >
                            <div>
                              <strong style={{ fontSize: 13, color: '#F8FAFC' }}>{u.displayName}</strong>
                              <span style={{ fontSize: 12, color: '#94A3B8', marginRight: 6 }}>@{u.username}</span>
                            </div>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                padding: '2px 8px',
                                borderRadius: 6,
                                backgroundColor:
                                  u.role === 'owner'
                                    ? 'rgba(255, 184, 0, 0.15)'
                                    : u.role === 'manager'
                                      ? 'rgba(56, 189, 248, 0.15)'
                                      : 'rgba(52, 211, 153, 0.15)',
                                color:
                                  u.role === 'owner'
                                    ? '#FFB800'
                                    : u.role === 'manager'
                                      ? '#38BDF8'
                                      : '#34D399',
                                border: '1px solid #262E3D',
                              }}
                            >
                              {u.roleArabic}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ملخص الأرقام والتواصل */}
                  <div
                    style={{
                      border: '1px solid #262E3D',
                      borderRadius: 12,
                      padding: 16,
                      backgroundColor: '#1C222D',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 12,
                      }}
                    >
                      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#F8FAFC' }}>
                        📞 أحدث أرقام التواصل والعملاء ({data.contacts.length})
                      </h3>
                      <button
                        onClick={() => setActiveTab('contacts')}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#FFB800',
                          fontWeight: 700,
                          fontSize: 12,
                          cursor: 'pointer',
                        }}
                      >
                        عرض الكل ←
                      </button>
                    </div>
                    {data.contacts.length === 0 ? (
                      <div style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', padding: '20px 0' }}>
                        لا توجد أرقام مسجلة في هذه القاعدة
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {data.contacts.slice(0, 5).map((c) => (
                          <div
                            key={c.id + c.name}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '8px 12px',
                              backgroundColor: '#0B0E14',
                              borderRadius: 8,
                              border: '1px solid #262E3D',
                            }}
                          >
                            <div>
                              <strong style={{ fontSize: 13, color: '#F8FAFC' }}>{c.name}</strong>
                              <span
                                style={{
                                  fontSize: 11,
                                  color: '#CBD5E1',
                                  marginRight: 6,
                                  backgroundColor: '#1C222D',
                                  padding: '1px 6px',
                                  borderRadius: 4,
                                  border: '1px solid #262E3D',
                                }}
                              >
                                {c.type}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#FFB800', direction: 'ltr' }}>
                                {c.phone}
                              </span>
                              {c.phone && c.phone !== 'غير مسجل' && (
                                <button
                                  onClick={() => handleCopyPhone(c.phone)}
                                  title="نسخ الرقم"
                                  style={{
                                    border: 'none',
                                    background: 'none',
                                    color: copiedPhone === c.phone ? '#34D399' : '#94A3B8',
                                    cursor: 'pointer',
                                    padding: 2,
                                  }}
                                >
                                  {copiedPhone === c.phone ? <Check size={14} /> : <Copy size={14} />}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* أحدث العمليات والفواتير */}
                <div
                  style={{
                    border: '1px solid #262E3D',
                    borderRadius: 12,
                    padding: 16,
                    backgroundColor: '#1C222D',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 12,
                    }}
                  >
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#F8FAFC' }}>
                      🧾 أحدث فواتير البيع المسجلة
                    </h3>
                    <button
                      onClick={() => setActiveTab('sales')}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#FFB800',
                        fontWeight: 700,
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      عرض جميع الفواتير ({data.sales.length}) ←
                    </button>
                  </div>
                  {data.sales.length === 0 ? (
                    <div style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', padding: '20px 0' }}>
                      لا توجد فواتير مبيعات مسجلة في قاعدة البيانات المحددة
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ backgroundColor: '#161B22', color: '#CBD5E1', textAlign: 'right', borderBottom: '1px solid #262E3D' }}>
                            <th style={{ padding: '8px 12px' }}>رقم الفاتورة</th>
                            <th style={{ padding: '8px 12px' }}>التاريخ والوقت</th>
                            <th style={{ padding: '8px 12px' }}>الكاشير</th>
                            <th style={{ padding: '8px 12px' }}>العميل</th>
                            <th style={{ padding: '8px 12px' }}>طريقة الدفع</th>
                            <th style={{ padding: '8px 12px' }}>الصافي</th>
                            <th style={{ padding: '8px 12px' }}>الحالة</th>
                            <th style={{ padding: '8px 12px' }}>التفاصيل</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.sales.slice(0, 5).map((s) => (
                            <tr key={s.id} style={{ borderBottom: '1px solid #262E3D' }}>
                              <td style={{ padding: '8px 12px', fontWeight: 700, color: '#FFB800' }}>{s.invoiceNo}</td>
                              <td style={{ padding: '8px 12px', color: '#CBD5E1' }}>
                                {new Date(s.createdAt).toLocaleString('ar-EG')}
                              </td>
                              <td style={{ padding: '8px 12px', color: '#F8FAFC' }}>{s.cashierName}</td>
                              <td style={{ padding: '8px 12px', color: '#CBD5E1' }}>{s.customerName || 'عميل نقدي'}</td>
                              <td style={{ padding: '8px 12px', color: '#CBD5E1' }}>{s.paymentMethod}</td>
                              <td style={{ padding: '8px 12px', fontWeight: 700, color: '#FFB800' }}>
                                {s.totalEgp.toFixed(2)} ج.م
                              </td>
                              <td style={{ padding: '8px 12px' }}>
                                <span
                                  style={{
                                    fontSize: 11,
                                    padding: '2px 6px',
                                    borderRadius: 4,
                                    backgroundColor: s.status === 'completed' ? 'rgba(52, 211, 153, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                    color: s.status === 'completed' ? '#34D399' : '#EF4444',
                                    fontWeight: 700,
                                    border: '1px solid #262E3D',
                                  }}
                                >
                                  {s.statusArabic}
                                </span>
                              </td>
                              <td style={{ padding: '8px 12px' }}>
                                <button
                                  onClick={() => setSelectedSale(s)}
                                  style={{
                                    padding: '3px 8px',
                                    borderRadius: 6,
                                    border: '1px solid #262E3D',
                                    backgroundColor: '#0B0E14',
                                    color: '#FFB800',
                                    fontSize: 11,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                  }}
                                >
                                  عرض الأصناف
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 2. تبويب المستخدمين المسجلين */}
            {activeTab === 'users' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 13, color: '#CBD5E1' }}>
                  قائمة بجميع حسابات الموظفين والمديرين المسجلين في قاعدة البيانات وأدوارهم:
                </div>
                <div style={{ overflowX: 'auto', border: '1px solid #262E3D', borderRadius: 10 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ backgroundColor: '#161B22', borderBottom: '1px solid #262E3D', color: '#CBD5E1', textAlign: 'right' }}>
                        <th style={{ padding: '10px 14px' }}>#</th>
                        <th style={{ padding: '10px 14px' }}>الاسم الكامل</th>
                        <th style={{ padding: '10px 14px' }}>اسم المستخدم (Username)</th>
                        <th style={{ padding: '10px 14px' }}>الدور والصلاحية</th>
                        <th style={{ padding: '10px 14px' }}>رمز PIN سريع</th>
                        <th style={{ padding: '10px 14px' }}>حالة الحساب</th>
                        <th style={{ padding: '10px 14px' }}>تاريخ التسجيل</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', padding: 24, color: '#94A3B8' }}>
                            لا توجد نتائج مطابقة لبحثك
                          </td>
                        </tr>
                      ) : (
                        filteredUsers.map((u) => (
                          <tr key={u.id} style={{ borderBottom: '1px solid #262E3D' }}>
                            <td style={{ padding: '10px 14px', color: '#CBD5E1' }}>{u.id}</td>
                            <td style={{ padding: '10px 14px', fontWeight: 700, color: '#F8FAFC' }}>{u.displayName}</td>
                            <td style={{ padding: '10px 14px', color: '#CBD5E1' }}>
                              <code style={{ backgroundColor: '#0B0E14', padding: '2px 6px', borderRadius: 4, color: '#FFB800', border: '1px solid #262E3D' }}>
                                @{u.username}
                              </code>
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 700,
                                  padding: '3px 8px',
                                  borderRadius: 6,
                                  backgroundColor:
                                    u.role === 'owner'
                                      ? 'rgba(255, 184, 0, 0.15)'
                                      : u.role === 'manager'
                                        ? 'rgba(56, 189, 248, 0.15)'
                                        : 'rgba(52, 211, 153, 0.15)',
                                  color:
                                    u.role === 'owner'
                                      ? '#FFB800'
                                      : u.role === 'manager'
                                        ? '#38BDF8'
                                        : '#34D399',
                                  border: '1px solid #262E3D',
                                }}
                              >
                                {u.roleArabic}
                              </span>
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              {u.hasPin ? (
                                <span style={{ color: '#34D399', fontSize: 12, fontWeight: 700 }}>✓ مسجل</span>
                              ) : (
                                <span style={{ color: '#94A3B8', fontSize: 12 }}>—</span>
                              )}
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 700,
                                  padding: '2px 8px',
                                  borderRadius: 4,
                                  backgroundColor: u.isActive ? 'rgba(52, 211, 153, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                  color: u.isActive ? '#34D399' : '#EF4444',
                                  border: '1px solid #262E3D',
                                }}
                              >
                                {u.isActive ? 'حساب نشط' : 'معطل'}
                              </span>
                            </td>
                            <td style={{ padding: '10px 14px', color: '#CBD5E1' }}>
                              {new Date(u.createdAt).toLocaleDateString('ar-EG')}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 3. تبويب دليل الأرقام والتواصل (العملاء والموردين) */}
            {activeTab === 'contacts' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      onClick={() => setContactFilter('all')}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 700,
                        border: '1px solid #262E3D',
                        backgroundColor: contactFilter === 'all' ? '#FFB800' : '#0B0E14',
                        color: contactFilter === 'all' ? '#0B0E14' : '#CBD5E1',
                        cursor: 'pointer',
                      }}
                    >
                      الكل ({data.contacts.length})
                    </button>
                    <button
                      onClick={() => setContactFilter('customer')}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 700,
                        border: '1px solid #262E3D',
                        backgroundColor: contactFilter === 'customer' ? '#0284C7' : '#0B0E14',
                        color: contactFilter === 'customer' ? '#FFFFFF' : '#CBD5E1',
                        cursor: 'pointer',
                      }}
                    >
                      العملاء ({data.contacts.filter((c) => c.type === 'عميل').length})
                    </button>
                    <button
                      onClick={() => setContactFilter('supplier')}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 700,
                        border: '1px solid #262E3D',
                        backgroundColor: contactFilter === 'supplier' ? '#8B5CF6' : '#0B0E14',
                        color: contactFilter === 'supplier' ? '#FFFFFF' : '#CBD5E1',
                        cursor: 'pointer',
                      }}
                    >
                      الموردين ({data.contacts.filter((c) => c.type === 'مورد').length})
                    </button>
                    <button
                      onClick={() => setContactFilter('debt')}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 700,
                        border: '1px solid #262E3D',
                        backgroundColor: contactFilter === 'debt' ? '#EF4444' : '#0B0E14',
                        color: contactFilter === 'debt' ? '#FFFFFF' : '#CBD5E1',
                        cursor: 'pointer',
                      }}
                    >
                      أصحاب المديونيات ({data.contacts.filter((c) => c.balanceEgp > 0).length})
                    </button>
                  </div>

                  <span style={{ fontSize: 12, color: '#CBD5E1' }}>
                    إجمالي النتائج المعروضة: <strong style={{ color: '#FFB800' }}>{filteredContacts.length}</strong> رقم
                  </span>
                </div>

                <div style={{ overflowX: 'auto', border: '1px solid #262E3D', borderRadius: 10 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ backgroundColor: '#161B22', borderBottom: '1px solid #262E3D', color: '#CBD5E1', textAlign: 'right' }}>
                        <th style={{ padding: '10px 14px' }}>الاسم</th>
                        <th style={{ padding: '10px 14px' }}>رقم الهاتف</th>
                        <th style={{ padding: '10px 14px' }}>النوع</th>
                        <th style={{ padding: '10px 14px' }}>الرصيد / المديونية</th>
                        <th style={{ padding: '10px 14px' }}>العنوان / ملاحظات</th>
                        <th style={{ padding: '10px 14px' }}>إجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredContacts.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ textAlign: 'center', padding: 24, color: '#94A3B8' }}>
                            لا توجد جهات اتصال مطابقة لبحثك
                          </td>
                        </tr>
                      ) : (
                        filteredContacts.map((c) => (
                          <tr key={c.id + c.name} style={{ borderBottom: '1px solid #262E3D' }}>
                            <td style={{ padding: '10px 14px', fontWeight: 700, color: '#F8FAFC' }}>{c.name}</td>
                            <td style={{ padding: '10px 14px' }}>
                              <span style={{ fontWeight: 700, color: '#FFB800', direction: 'ltr', display: 'inline-block' }}>
                                {c.phone}
                              </span>
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 700,
                                  padding: '2px 8px',
                                  borderRadius: 6,
                                  backgroundColor:
                                    c.type === 'عميل' ? 'rgba(2, 132, 199, 0.15)' : c.type === 'مورد' ? 'rgba(124, 58, 237, 0.15)' : 'rgba(255, 184, 0, 0.15)',
                                  color:
                                    c.type === 'عميل' ? '#38BDF8' : c.type === 'مورد' ? '#A78BFA' : '#FFB800',
                                  border: '1px solid #262E3D',
                                }}
                              >
                                {c.type}
                              </span>
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              {c.balanceEgp > 0 ? (
                                <span style={{ color: '#EF4444', fontWeight: 700 }}>
                                  عليه مديونية: {c.balanceEgp.toFixed(2)} ج.م
                                </span>
                              ) : c.balanceEgp < 0 ? (
                                <span style={{ color: '#34D399', fontWeight: 700 }}>
                                  دائن له: {Math.abs(c.balanceEgp).toFixed(2)} ج.م
                                </span>
                              ) : (
                                <span style={{ color: '#94A3B8' }}>0.00 ج.م</span>
                              )}
                            </td>
                            <td style={{ padding: '10px 14px', color: '#CBD5E1' }}>
                              {c.address || c.notes || '—'}
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              {c.phone && c.phone !== 'غير مسجل' && (
                                <button
                                  onClick={() => handleCopyPhone(c.phone)}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '4px 10px',
                                    borderRadius: 6,
                                    border: '1px solid #262E3D',
                                    backgroundColor: '#0B0E14',
                                    fontSize: 12,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    color: copiedPhone === c.phone ? '#34D399' : '#FFB800',
                                  }}
                                >
                                  {copiedPhone === c.phone ? <Check size={14} /> : <Copy size={14} />}
                                  <span>{copiedPhone === c.phone ? 'تم النسخ' : 'نسخ الرقم'}</span>
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 4. تبويب العمليات والفواتير */}
            {activeTab === 'sales' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, color: '#CBD5E1' }}>
                  <span>سجل كامل لجميع حركات وفواتير المبيعات المسجلة في القاعدة:</span>
                  <span>العدد: <strong style={{ color: '#FFB800' }}>{filteredSales.length}</strong> فاتورة</span>
                </div>

                <div style={{ overflowX: 'auto', border: '1px solid #262E3D', borderRadius: 10 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ backgroundColor: '#161B22', borderBottom: '1px solid #262E3D', color: '#CBD5E1', textAlign: 'right' }}>
                        <th style={{ padding: '10px 14px' }}>رقم الفاتورة</th>
                        <th style={{ padding: '10px 14px' }}>التاريخ والوقت</th>
                        <th style={{ padding: '10px 14px' }}>الكاشير</th>
                        <th style={{ padding: '10px 14px' }}>العميل ورقم الهاتف</th>
                        <th style={{ padding: '10px 14px' }}>طريقة الدفع</th>
                        <th style={{ padding: '10px 14px' }}>الإجمالي</th>
                        <th style={{ padding: '10px 14px' }}>الخصم</th>
                        <th style={{ padding: '10px 14px' }}>الصافي المدفوع</th>
                        <th style={{ padding: '10px 14px' }}>الحالة</th>
                        <th style={{ padding: '10px 14px' }}>الأصناف</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSales.length === 0 ? (
                        <tr>
                          <td colSpan={10} style={{ textAlign: 'center', padding: 24, color: '#94A3B8' }}>
                            لا توجد فواتير مطابقة لبحثك
                          </td>
                        </tr>
                      ) : (
                        filteredSales.map((s) => (
                          <tr key={s.id} style={{ borderBottom: '1px solid #262E3D' }}>
                            <td style={{ padding: '10px 14px', fontWeight: 800, color: '#FFB800' }}>
                              {s.invoiceNo}
                            </td>
                            <td style={{ padding: '10px 14px', color: '#CBD5E1' }}>
                              {new Date(s.createdAt).toLocaleString('ar-EG')}
                            </td>
                            <td style={{ padding: '10px 14px', fontWeight: 600, color: '#F8FAFC' }}>{s.cashierName}</td>
                            <td style={{ padding: '10px 14px' }}>
                              {s.customerName ? (
                                <div>
                                  <strong style={{ color: '#F8FAFC' }}>{s.customerName}</strong>
                                  {s.customerPhone && (
                                    <div style={{ fontSize: 11, color: '#FFB800', direction: 'ltr' }}>
                                      {s.customerPhone}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span style={{ color: '#94A3B8' }}>عميل نقدي</span>
                              )}
                            </td>
                            <td style={{ padding: '10px 14px', color: '#CBD5E1' }}>{s.paymentMethod}</td>
                            <td style={{ padding: '10px 14px', color: '#CBD5E1' }}>{s.subtotalEgp.toFixed(2)} ج.م</td>
                            <td style={{ padding: '10px 14px', color: s.discountEgp > 0 ? '#EF4444' : '#94A3B8' }}>
                              {s.discountEgp > 0 ? `-${s.discountEgp.toFixed(2)}` : '0.00'}
                            </td>
                            <td style={{ padding: '10px 14px', fontWeight: 800, color: '#FFB800', fontSize: 14 }}>
                              {s.totalEgp.toFixed(2)} ج.م
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 700,
                                  padding: '3px 8px',
                                  borderRadius: 6,
                                  backgroundColor: s.status === 'completed' ? 'rgba(52, 211, 153, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                  color: s.status === 'completed' ? '#34D399' : '#EF4444',
                                  border: '1px solid #262E3D',
                                }}
                              >
                                {s.statusArabic}
                              </span>
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              <button
                                onClick={() => setSelectedSale(s)}
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: 6,
                                  border: '1px solid #262E3D',
                                  backgroundColor: '#0B0E14',
                                  fontSize: 12,
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  color: '#FFB800',
                                }}
                              >
                                عرض البنود ({s.itemsCount})
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 5. تبويب المنتجات والمخزون */}
            {activeTab === 'products' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, color: '#CBD5E1' }}>
                  <span>كتالوج المنتجات والمخزون والأسعار المسجلة في القاعدة:</span>
                  <span>العدد: <strong style={{ color: '#FFB800' }}>{filteredProducts.length}</strong> منتج</span>
                </div>

                <div style={{ overflowX: 'auto', border: '1px solid #262E3D', borderRadius: 10 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ backgroundColor: '#161B22', borderBottom: '1px solid #262E3D', color: '#CBD5E1', textAlign: 'right' }}>
                        <th style={{ padding: '10px 14px' }}>#</th>
                        <th style={{ padding: '10px 14px' }}>اسم المنتج</th>
                        <th style={{ padding: '10px 14px' }}>التصنيف والماركة</th>
                        <th style={{ padding: '10px 14px' }}>الباركود</th>
                        <th style={{ padding: '10px 14px' }}>سعر البيع</th>
                        <th style={{ padding: '10px 14px' }}>تكلفة الشراء</th>
                        <th style={{ padding: '10px 14px' }}>الرصيد المتبقي</th>
                        <th style={{ padding: '10px 14px' }}>الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProducts.length === 0 ? (
                        <tr>
                          <td colSpan={8} style={{ textAlign: 'center', padding: 24, color: '#94A3B8' }}>
                            لا توجد منتجات مطابقة للبحث
                          </td>
                        </tr>
                      ) : (
                        filteredProducts.map((p) => (
                          <tr key={p.id} style={{ borderBottom: '1px solid #262E3D' }}>
                            <td style={{ padding: '10px 14px', color: '#CBD5E1' }}>{p.id}</td>
                            <td style={{ padding: '10px 14px', fontWeight: 700, color: '#F8FAFC' }}>{p.nameAr}</td>
                            <td style={{ padding: '10px 14px', color: '#CBD5E1' }}>
                              {p.categoryName || 'عام'} {p.brandName && `• ${p.brandName}`}
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              {p.barcodes.length > 0 ? (
                                <code style={{ backgroundColor: '#0B0E14', padding: '2px 6px', borderRadius: 4, fontSize: 12, color: '#FFB800', border: '1px solid #262E3D' }}>
                                  {p.barcodes[0]}
                                </code>
                              ) : (
                                <span style={{ color: '#94A3B8' }}>بدون باركود</span>
                              )}
                            </td>
                            <td style={{ padding: '10px 14px', fontWeight: 800, color: '#FFB800' }}>
                              {p.salePriceEgp.toFixed(2)} ج.م
                            </td>
                            <td style={{ padding: '10px 14px', color: '#CBD5E1' }}>
                              {p.unitCostEgp > 0 ? `${p.unitCostEgp.toFixed(2)} ج.م` : '—'}
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              <span
                                style={{
                                  fontWeight: 800,
                                  color: p.currentStock > 5 ? '#34D399' : p.currentStock > 0 ? '#FFB800' : '#EF4444',
                                }}
                              >
                                {p.currentStock} {p.unit}
                              </span>
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 700,
                                  padding: '2px 8px',
                                  borderRadius: 4,
                                  backgroundColor: p.isActive ? 'rgba(52, 211, 153, 0.15)' : '#1C222D',
                                  color: p.isActive ? '#34D399' : '#94A3B8',
                                  border: '1px solid #262E3D',
                                }}
                              >
                                {p.isActive ? 'نشط للبيع' : 'مؤرشف'}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 6. تبويب الورديات والخزينة */}
            {activeTab === 'shifts' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 13, color: '#CBD5E1' }}>
                  سجل ورديات الكاشير وحركة الإيداع والإغلاق والعجز/الزيادة:
                </div>
                <div style={{ overflowX: 'auto', border: '1px solid #262E3D', borderRadius: 10 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ backgroundColor: '#161B22', borderBottom: '1px solid #262E3D', color: '#CBD5E1', textAlign: 'right' }}>
                        <th style={{ padding: '10px 14px' }}># الوردية</th>
                        <th style={{ padding: '10px 14px' }}>الكاشير المسؤول</th>
                        <th style={{ padding: '10px 14px' }}>وقت الفتح</th>
                        <th style={{ padding: '10px 14px' }}>وقت الإغلاق</th>
                        <th style={{ padding: '10px 14px' }}>رصيد البداية</th>
                        <th style={{ padding: '10px 14px' }}>المتوقع</th>
                        <th style={{ padding: '10px 14px' }}>الفعلي (الإغلاق)</th>
                        <th style={{ padding: '10px 14px' }}>الفارق (عجز/زيادة)</th>
                        <th style={{ padding: '10px 14px' }}>الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.shifts.length === 0 ? (
                        <tr>
                          <td colSpan={9} style={{ textAlign: 'center', padding: 24, color: '#94A3B8' }}>
                            لا توجد ورديات مسجلة
                          </td>
                        </tr>
                      ) : (
                        data.shifts.map((sh) => (
                          <tr key={sh.id} style={{ borderBottom: '1px solid #262E3D' }}>
                            <td style={{ padding: '10px 14px', fontWeight: 700, color: '#FFB800' }}>#{sh.id}</td>
                            <td style={{ padding: '10px 14px', fontWeight: 600, color: '#F8FAFC' }}>{sh.cashierName}</td>
                            <td style={{ padding: '10px 14px', color: '#CBD5E1' }}>
                              {new Date(sh.openedAt).toLocaleString('ar-EG')}
                            </td>
                            <td style={{ padding: '10px 14px', color: '#CBD5E1' }}>
                              {sh.closedAt ? new Date(sh.closedAt).toLocaleString('ar-EG') : '—'}
                            </td>
                            <td style={{ padding: '10px 14px', color: '#CBD5E1' }}>{sh.openingBalanceEgp.toFixed(2)} ج.م</td>
                            <td style={{ padding: '10px 14px', color: '#CBD5E1' }}>
                              {sh.expectedBalanceEgp !== undefined ? `${sh.expectedBalanceEgp.toFixed(2)} ج.م` : '—'}
                            </td>
                            <td style={{ padding: '10px 14px', fontWeight: 700, color: '#F8FAFC' }}>
                              {sh.closingBalanceEgp !== undefined ? `${sh.closingBalanceEgp.toFixed(2)} ج.م` : '—'}
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              {sh.differenceEgp !== undefined ? (
                                sh.differenceEgp === 0 ? (
                                  <span style={{ color: '#34D399', fontWeight: 700 }}>متطابق (0)</span>
                                ) : sh.differenceEgp > 0 ? (
                                  <span style={{ color: '#34D399', fontWeight: 700 }}>
                                    +{sh.differenceEgp.toFixed(2)} زيادة
                                  </span>
                                ) : (
                                  <span style={{ color: '#EF4444', fontWeight: 700 }}>
                                    {sh.differenceEgp.toFixed(2)} عجز
                                  </span>
                                )
                              ) : (
                                '—'
                              )}
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 700,
                                  padding: '2px 8px',
                                  borderRadius: 4,
                                  backgroundColor: sh.status === 'open' ? 'rgba(255, 184, 0, 0.15)' : '#1C222D',
                                  color: sh.status === 'open' ? '#FFB800' : '#CBD5E1',
                                  border: '1px solid #262E3D',
                                }}
                              >
                                {sh.statusArabic}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 7. تبويب سجل التدقيق والرقابة */}
            {activeTab === 'audit' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 13, color: '#CBD5E1' }}>
                  سجل غير قابل للتعديل يوثق جميع الحركات والأحداث الأمنية التي تمت على هذا النظام:
                </div>
                <div style={{ overflowX: 'auto', border: '1px solid #262E3D', borderRadius: 10 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ backgroundColor: '#161B22', borderBottom: '1px solid #262E3D', color: '#CBD5E1', textAlign: 'right' }}>
                        <th style={{ padding: '10px 14px' }}>التاريخ والوقت</th>
                        <th style={{ padding: '10px 14px' }}>المستخدم الفاعل</th>
                        <th style={{ padding: '10px 14px' }}>نوع العملية</th>
                        <th style={{ padding: '10px 14px' }}>الكيان المرتبط</th>
                        <th style={{ padding: '10px 14px' }}>التفاصيل الموثقة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.auditLogs.length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', padding: 24, color: '#94A3B8' }}>
                            لا توجد سجلات تدقيق
                          </td>
                        </tr>
                      ) : (
                        data.auditLogs.map((a) => (
                          <tr key={a.id} style={{ borderBottom: '1px solid #262E3D' }}>
                            <td style={{ padding: '10px 14px', color: '#CBD5E1' }}>
                              {new Date(a.createdAt).toLocaleString('ar-EG')}
                            </td>
                            <td style={{ padding: '10px 14px', fontWeight: 700, color: '#F8FAFC' }}>{a.userName}</td>
                            <td style={{ padding: '10px 14px' }}>
                              <span
                                style={{
                                  fontSize: 12,
                                  fontWeight: 700,
                                  color: '#FFB800',
                                }}
                              >
                                {a.actionArabic}
                              </span>
                            </td>
                            <td style={{ padding: '10px 14px', color: '#CBD5E1' }}>
                              {a.entityType} {a.entityId && `#${a.entityId}`}
                            </td>
                            <td style={{ padding: '10px 14px', color: '#CBD5E1', maxWidth: 350 }}>
                              <pre
                                style={{
                                  margin: 0,
                                  fontSize: 11,
                                  whiteSpace: 'pre-wrap',
                                  fontFamily: 'monospace',
                                  backgroundColor: '#0B0E14',
                                  padding: '4px 8px',
                                  borderRadius: 4,
                                  color: '#CBD5E1',
                                  border: '1px solid #262E3D',
                                }}
                              >
                                {typeof a.details === 'object' ? JSON.stringify(a.details) : a.details || '—'}
                              </pre>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* نافذة تفاصيل بنود الفاتورة المحددة */}
      {selectedSale && (
        <Modal
          isOpen={Boolean(selectedSale)}
          onClose={() => setSelectedSale(null)}
          title={`تفاصيل الفاتورة: ${selectedSale.invoiceNo}`}
          width={680}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 12,
                backgroundColor: '#0B0E14',
                border: '1px solid #262E3D',
                padding: 14,
                borderRadius: 10,
                fontSize: 13,
                color: '#CBD5E1',
              }}
            >
              <div>
                الكاشير: <strong style={{ color: '#F8FAFC' }}>{selectedSale.cashierName}</strong>
              </div>
              <div>
                العميل: <strong style={{ color: '#F8FAFC' }}>{selectedSale.customerName || 'عميل نقدي'}</strong>
              </div>
              <div>
                طريقة الدفع: <strong style={{ color: '#F8FAFC' }}>{selectedSale.paymentMethod}</strong>
              </div>
              <div>
                التاريخ: <strong style={{ color: '#F8FAFC' }}>{new Date(selectedSale.createdAt).toLocaleString('ar-EG')}</strong>
              </div>
              <div>
                الإجمالي قبل الخصم: <strong style={{ color: '#F8FAFC' }}>{selectedSale.subtotalEgp.toFixed(2)} ج.م</strong>
              </div>
              <div>
                الصافي النهائي: <strong style={{ color: '#FFB800' }}>{selectedSale.totalEgp.toFixed(2)} ج.م</strong>
              </div>
            </div>

            <h4 style={{ margin: '8px 0 0', fontSize: 14, fontWeight: 700, color: '#F8FAFC' }}>بنود ومنتجات الفاتورة:</h4>
            {selectedSale.items.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 20, color: '#94A3B8', fontSize: 13 }}>
                لا توجد بنود مفصلة لهذه الفاتورة
              </div>
            ) : (
              <div style={{ border: '1px solid #262E3D', borderRadius: 8, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ backgroundColor: '#1C222D', textAlign: 'right', color: '#CBD5E1', borderBottom: '1px solid #262E3D' }}>
                      <th style={{ padding: '8px 12px' }}>اسم المنتج</th>
                      <th style={{ padding: '8px 12px' }}>الدرجة / الحجم</th>
                      <th style={{ padding: '8px 12px' }}>الكمية</th>
                      <th style={{ padding: '8px 12px' }}>سعر القطعة</th>
                      <th style={{ padding: '8px 12px' }}>إجمالي السطر</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedSale.items.map((it) => (
                      <tr key={it.id} style={{ borderBottom: '1px solid #262E3D' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 600, color: '#F8FAFC' }}>{it.productName}</td>
                        <td style={{ padding: '8px 12px', color: '#CBD5E1' }}>{it.variantName || '—'}</td>
                        <td style={{ padding: '8px 12px', fontWeight: 700, color: '#F8FAFC' }}>{it.qty}</td>
                        <td style={{ padding: '8px 12px', color: '#CBD5E1' }}>{it.unitPriceEgp.toFixed(2)} ج.م</td>
                        <td style={{ padding: '8px 12px', fontWeight: 700, color: '#FFB800' }}>
                          {it.lineTotalEgp.toFixed(2)} ج.م
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
              <Button onClick={() => setSelectedSale(null)} variant="secondary">
                إغلاق
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
export default DatabaseInspectorScreen;
