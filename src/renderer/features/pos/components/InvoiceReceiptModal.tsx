import React, { useState, useEffect, useRef } from 'react';
import {
  Printer,
  X,
  CheckCircle2,
  FileText,
  MapPin,
  Phone,
} from 'lucide-react';
import { Button } from '../../../components/common/Button';
import { GlassIcon } from '../../../components/common/GlassIcon';
import { formatMoney } from '../../../../shared/utils/money';
import { generateCode128Svg } from '../../../../shared/utils/barcode';
import { Sale } from '../../../../shared/types/sales.types';
import { sounds } from '../../../lib/sounds';
import { useToast } from '../../../components/common/ToastContext';
import { formatDateTimeArabic } from '../../../lib/formatters';
import logoImg from '../../../assets/logo.png';

interface InvoiceReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  sale: Sale | null;
  onNewSale?: () => void;
  autoPrint?: boolean;
}

export function InvoiceReceiptModal({
  isOpen,
  onClose,
  sale,
  onNewSale,
  autoPrint = false,
}: InvoiceReceiptModalProps): React.ReactElement | null {
  const { success: toastSuccess, error: toastError } = useToast();
  const [isPrinting, setIsPrinting] = useState(false);
  const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);
  const [storeSettings, setStoreSettings] = useState({
    storeName: 'موبيكس - Mobix',
    storeAddress: 'شريكك الذكي لإدارة محلات الموبايلات',
    storePhone: '01000000000',
    taxNumber: '',
    receiptFooter: 'شكراً لتعاملكم مع موبيكس - ضمان وجودة في كل جهاز',
  });

  const hasAutoPrintedRef = useRef(false);

  // جلب إعدادات المحل والعنوان والهاتف
  useEffect(() => {
    if (!isOpen) {
      setIsSettingsLoaded(false);
      return;
    }

    const fetchSettings = async () => {
      try {
        const electron = (window as any).electron;
        if (electron?.getSettings) {
          const res = await electron.getSettings();
          if (res?.success && res.data) {
            const map = res.data;
            setStoreSettings({
              storeName: map.store_name || 'موبيكس (Mobix)',
              storeAddress: map.store_address || 'شريكك الذكي لإدارة محلات الموبايلات',
              storePhone: map.store_phone || map.store_whatsapp || '01000000000',
              taxNumber: map.tax_registration_no || map.tax_number || '',
              receiptFooter: map.receipt_footer || 'شكراً لتعاملكم مع موبيكس - ضمان وجودة في كل جهاز',
            });
          }
        }
      } catch (e) {
        console.warn('Failed to load store settings for receipt:', e);
      } finally {
        setIsSettingsLoaded(true);
      }
    };

    fetchSettings();
  }, [isOpen]);

  // طباعة تلقائية في الخلفية بدون تعليق الواجهة بعد التأكد من اكتمال تحميل الإعدادات
  useEffect(() => {
    if (isOpen && sale && autoPrint && isSettingsLoaded && !hasAutoPrintedRef.current) {
      hasAutoPrintedRef.current = true;
      handleThermalPrint(true);
    }
    if (!isOpen) {
      hasAutoPrintedRef.current = false;
      setIsSettingsLoaded(false);
    }
  }, [isOpen, sale, autoPrint, isSettingsLoaded]);

  if (!isOpen || !sale) return null;

  // الحسابات
  const items = sale.items || [];
  const payments = sale.payments || [];
  const totalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const changeDue = Math.max(0, totalPaid - sale.total);
  const totalQty = items.reduce((sum, it) => sum + (it.qty || 1), 0);

  // باركود الفاتورة SVG
  const barcodeSvgHtml = generateCode128Svg(sale.invoice_no || `INV-${sale.id}`, 36);

  // طباعة الإيصال الحراري عبر محرك الطابعة بدون تعليق
  const handleThermalPrint = async (silent = false) => {
    if (isPrinting) return;
    setIsPrinting(true);
    try {
      if (!silent) sounds.playClick();
      const electron = (window as any).electron;
      if (electron?.printReceipt) {
        const res = await electron.printReceipt(sale.id);
        if (res?.success) {
          sounds.playSaleSuccess();
          toastSuccess(`تم إرسال الفاتورة #${sale.invoice_no} للطابعة الحرارية`);
        } else {
          sounds.playError();
          toastError(res?.error || 'تعذر إرسال الفاتورة للطابعة الحرارية، تحقق من تشغيل الطابعة وتوصيل الكابل');
        }
      } else {
        window.print();
      }
    } catch (err: any) {
      sounds.playError();
      toastError(err.message || 'فشلت الطباعة الحرارية');
    } finally {
      setIsPrinting(false);
    }
  };

  // طباعة نافذة النظام القياسية A4 / PDF
  const handleSystemPrint = () => {
    sounds.playClick();
    window.print();
  };

  const handleFinish = () => {
    sounds.playClick();
    if (onNewSale) {
      onNewSale();
    }
    onClose();
  };

  // طريقة الدفع
  const getPaymentMethodLabel = () => {
    const methods = payments.map((p) => p.method);
    if (methods.includes('cash') && methods.includes('card')) return 'دفع مختلط (كاش + فيزا)';
    if (methods.includes('card')) return 'بطاقة مصرفية / شبكة';
    if (methods.includes('wallet')) return 'محفظة إلكترونية';
    return 'نقدي (كاش)';
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(15, 23, 42, 0.72)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        direction: 'rtl',
      }}
    >
      <div
        className="glass-card animate-scale-up"
        style={{
          width: '100%',
          maxWidth: 580,
          maxHeight: '92vh',
          backgroundColor: '#161B22',
          borderRadius: 20,
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1.5px solid #262E3D',
        }}
      >
        {/* شريط الإجراءات والترويسة العلوية */}
        <div
          style={{
            padding: '14px 20px',
            backgroundColor: '#1C222D',
            borderBottom: '1.5px solid #262E3D',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <GlassIcon icon={FileText} size="sm" variant="gold" />
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#F8FAFC' }}>
                معاينة الفاتورة قبل الطباعة
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                رقم الفاتورة: <strong style={{ fontFamily: 'monospace', color: '#111827' }}>#{sale.invoice_no}</strong>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              padding: 6,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#E5E7EB')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <X size={20} />
          </button>
        </div>

        {/* جسم الإيصال والورقة الحرارية المصممة لمحاكاة الإيصال الحقيقي */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px 24px',
            backgroundColor: '#F3F4F6',
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          {/* ورقة الإيصال الحراري الفاخرة */}
          <div
            id="receipt-print-area"
            style={{
              width: '100%',
              maxWidth: 420,
              backgroundColor: '#FFFFFF',
              borderRadius: 14,
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0,0,0,0.05)',
              border: '1px solid #E5E7EB',
              padding: '24px 20px',
              color: '#111827',
              fontSize: 12,
              lineHeight: 1.5,
              position: 'relative',
            }}
          >
            {/* 1. الشعار والترويسة */}
            <div style={{ textAlign: 'center', marginBottom: 12 }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: '12px',
                  margin: '0 auto 8px auto',
                  padding: 2,
                  background: 'linear-gradient(135deg, #FFB800 0%, #FF9500 100%)',
                  boxShadow: '0 4px 14px rgba(255, 184, 0, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <img
                  src={logoImg}
                  alt="Store Logo"
                  style={{
                    width: '100%',
                    height: '100%',
                    borderRadius: '10px',
                    objectFit: 'cover',
                    backgroundColor: '#0B0E14',
                  }}
                />
              </div>

              <div
                style={{
                  fontSize: 18,
                  fontWeight: 900,
                  color: '#111827',
                  letterSpacing: '-0.3px',
                }}
              >
                {storeSettings.storeName}
              </div>

              {storeSettings.storeAddress && (
                <div style={{ fontSize: 11.5, color: '#4B5563', marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <MapPin size={12} color="#6B7280" />
                  <span>{storeSettings.storeAddress}</span>
                </div>
              )}

              {storeSettings.storePhone && (
                <div style={{ fontSize: 11.5, color: '#4B5563', marginTop: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <Phone size={12} color="#6B7280" />
                  <span>هاتف: <strong>{storeSettings.storePhone}</strong></span>
                </div>
              )}

              {storeSettings.taxNumber && (
                <div style={{ fontSize: 10.5, color: '#6B7280', marginTop: 1 }}>
                  الرقم الضريبي: <span style={{ fontFamily: 'monospace' }}>{storeSettings.taxNumber}</span>
                </div>
              )}

              <div
                style={{
                  display: 'inline-block',
                  margin: '8px auto 0 auto',
                  padding: '2px 12px',
                  borderRadius: 20,
                  border: '1px dashed #4B5563',
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: '#374151',
                  backgroundColor: '#F9FAFB',
                }}
              >
                ✦ أهلاً بكم في متجرنا ✦
              </div>
            </div>

            {/* فاصل مزدوج */}
            <div style={{ borderTop: '2.5px double #111827', margin: '10px 0' }} />

            {/* 2. بيانات الفاتورة والعملية */}
            <div
              style={{
                backgroundColor: '#F9FAFB',
                border: '1px solid #E5E7EB',
                borderRadius: 8,
                padding: '8px 12px',
                fontSize: 11.5,
                lineHeight: 1.6,
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#6B7280', fontWeight: 600 }}>رقم الفاتورة:</span>
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontWeight: 800,
                    fontSize: 13,
                    backgroundColor: '#FFFFFF',
                    padding: '1px 8px',
                    borderRadius: 4,
                    border: '1px solid #D1D5DB',
                  }}
                >
                  {sale.invoice_no}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#6B7280', fontWeight: 600 }}>التاريخ والوقت:</span>
                <span style={{ fontWeight: 600, direction: 'ltr', fontFamily: 'Space Grotesk, sans-serif' }}>
                  {formatDateTimeArabic(sale.created_at)}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#6B7280', fontWeight: 600 }}>الكاشير:</span>
                <span style={{ fontWeight: 700 }}>{sale.cashier_name || 'كاشير المحل'}</span>
              </div>

              {sale.customer_name && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#6B7280', fontWeight: 600 }}>العميل:</span>
                  <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>
                    {sale.customer_name} {sale.customer_phone ? `(${sale.customer_phone})` : ''}
                  </span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#6B7280', fontWeight: 600 }}>طريقة الدفع:</span>
                <span style={{ fontWeight: 700 }}>{getPaymentMethodLabel()}</span>
              </div>
            </div>

            {/* فاصل منقط */}
            <div style={{ borderTop: '1px dashed #D1D5DB', margin: '12px 0 8px 0' }} />

            {/* 3. جدول الأصناف */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, marginBottom: 8 }}>
              <thead>
                <tr style={{ borderBottom: '1.5px solid #111827', background: '#F3F4F6' }}>
                  <th style={{ padding: '6px 4px', textAlign: 'right', width: '45%' }}>الصنف</th>
                  <th style={{ padding: '6px 4px', textAlign: 'center', width: '15%' }}>العدد</th>
                  <th style={{ padding: '6px 4px', textAlign: 'left', width: '20%' }}>السعر</th>
                  <th style={{ padding: '6px 4px', textAlign: 'left', width: '20%' }}>الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => {
                  const hasVariant =
                    it.variant_name &&
                    !['الافتراضي', 'افتراضي', 'default', 'standard', 'عادي'].includes(
                      it.variant_name.trim().toLowerCase()
                    );

                  return (
                    <tr key={idx} style={{ borderBottom: '1px dotted #E5E7EB' }}>
                      <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                        <div style={{ fontWeight: 700, color: '#111827' }}>{it.product_name}</div>
                        {hasVariant && (
                          <div style={{ fontSize: 10, color: '#6B7280', marginTop: 1 }}>
                            ▫ {it.variant_name}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '6px 4px', textAlign: 'center', fontWeight: 700, verticalAlign: 'top' }}>
                        {it.qty}
                      </td>
                      <td style={{ padding: '6px 4px', textAlign: 'left', verticalAlign: 'top' }}>
                        {formatMoney(it.unit_price)}
                      </td>
                      <td style={{ padding: '6px 4px', textAlign: 'left', fontWeight: 800, verticalAlign: 'top' }}>
                        {formatMoney(it.line_total)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* 4. ملخص الكميات */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 11,
                color: '#4B5563',
                backgroundColor: '#F3F4F6',
                padding: '4px 8px',
                borderRadius: 4,
                marginBottom: 8,
                fontWeight: 600,
              }}
            >
              <span>عدد الأصناف: <strong>{items.length}</strong></span>
              <span>إجمالي القطع: <strong>{totalQty}</strong></span>
            </div>

            {/* 5. الإجماليات والخصومات */}
            <div style={{ fontSize: 12, lineHeight: 1.6, padding: '2px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#4B5563' }}>إجمالي الأصناف:</span>
                <span style={{ fontWeight: 600 }}>{formatMoney(sale.subtotal)}</span>
              </div>

              {sale.discount_amount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#DC2626', fontWeight: 600 }}>
                  <span>الخصم الممنوح:</span>
                  <span>{formatMoney(sale.discount_amount)}-</span>
                </div>
              )}

              {sale.tax_amount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4B5563' }}>
                  <span>ضريبة القيمة المضافة:</span>
                  <span>+{formatMoney(sale.tax_amount)}</span>
                </div>
              )}

              {/* الصافي المطلوب - شريط أسود فخم بارز */}
              <div
                style={{
                  backgroundColor: '#111827',
                  color: '#FFFFFF',
                  borderRadius: 6,
                  padding: '8px 12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  margin: '8px 0',
                }}
              >
                <span style={{ fontSize: 13.5, fontWeight: 800 }}>الصافي المطلوب:</span>
                <span style={{ fontSize: 17, fontWeight: 900, letterSpacing: '-0.2px' }}>
                  {formatMoney(sale.total)}
                </span>
              </div>

              {/* تفاصيل المدفوع والباقي */}
              {totalPaid > 0 && (
                <div style={{ backgroundColor: '#F9FAFB', border: '1px dashed #D1D5DB', borderRadius: 6, padding: '6px 10px', marginTop: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5 }}>
                    <span style={{ color: '#4B5563' }}>المبلغ المدفوع:</span>
                    <span style={{ fontWeight: 700 }}>{formatMoney(totalPaid)}</span>
                  </div>

                  {changeDue > 0 && (
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 12,
                        fontWeight: 800,
                        color: '#15803D',
                        borderTop: '1px dotted #D1D5DB',
                        marginTop: 4,
                        paddingTop: 4,
                      }}
                    >
                      <span>المتبقي للعميل (الفكة):</span>
                      <span>{formatMoney(changeDue)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 6. الباركود الخاص بالفاتورة */}
            <div style={{ textAlign: 'center', margin: '14px 0 8px 0' }}>
              <div dangerouslySetInnerHTML={{ __html: barcodeSvgHtml }} />
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 11.5,
                  fontWeight: 800,
                  letterSpacing: 2,
                  marginTop: 3,
                  color: '#111827',
                }}
              >
                * {sale.invoice_no} *
              </div>
            </div>

            {/* 7. التذييل وسياسة الاستبدال */}
            <div style={{ textAlign: 'center', marginTop: 10 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#111827', marginBottom: 4 }}>
                ✦ {storeSettings.receiptFooter} ✦
              </div>

              <div
                style={{
                  fontSize: 9.5,
                  color: '#6B7280',
                  border: '1px dashed #9CA3AF',
                  borderRadius: 6,
                  padding: '6px 8px',
                  backgroundColor: '#F9FAFB',
                  lineHeight: 1.4,
                }}
              >
                <strong>سياسة الاستبدال والاسترجاع:</strong><br />
                البضاعة المباعة تستبدل أو تسترجع خلال 14 يوماً مع إحضار أصل الفاتورة وبحالتها الأصلية غير المفتوحة.
              </div>

              <div style={{ fontSize: 9, color: '#9CA3AF', marginTop: 6 }}>
                نظام إدارة محلات التليفونات والاكسسوارات والصيانة | موبيكس - Mobix
              </div>
            </div>
          </div>
        </div>

        {/* شريط الأزرار والإجراءات السفلي */}
        <div
          style={{
            padding: '14px 20px',
            backgroundColor: '#161B22',
            borderTop: '1.5px solid #262E3D',
            display: 'flex',
            gap: 10,
            alignItems: 'center',
          }}
        >
          {/* زر طباعة الإيصال الحراري الرئيسي */}
          <Button
            variant="success"
            onClick={() => handleThermalPrint(false)}
            isLoading={isPrinting}
            disabled={isPrinting}
            style={{
              flex: 1.4,
              height: 48,
              fontSize: 15,
              fontWeight: 800,
              gap: 8,
              boxShadow: '0 4px 14px rgba(33, 99, 61, 0.3)',
            }}
          >
            <Printer size={18} />
            <span>طباعة الإيصال الحراري (80mm)</span>
          </Button>

          {/* زر طباعة عبر نافذة النظام القياسية */}
          <Button
            variant="secondary"
            onClick={handleSystemPrint}
            disabled={isPrinting}
            style={{
              flex: 1,
              height: 48,
              fontSize: 13.5,
              gap: 6,
            }}
          >
            <FileText size={16} />
            <span>طباعة A4 / PDF</span>
          </Button>

          {/* زر إنهاء أو عملية بيع جديدة */}
          <Button
            variant="primary"
            onClick={handleFinish}
            disabled={isPrinting}
            style={{
              flex: 1.1,
              height: 48,
              fontSize: 14,
              fontWeight: 700,
              gap: 6,
            }}
          >
            <CheckCircle2 size={17} />
            <span>إنهاء وفاتورة جديدة</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

export default InvoiceReceiptModal;
