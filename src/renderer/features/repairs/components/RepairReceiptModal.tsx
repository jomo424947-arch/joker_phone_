import React, { useRef } from 'react';
import { Printer, X, Wrench, ShieldCheck, Phone, Smartphone, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '../../../components/common/Button';
import { formatMoney } from '../../../../shared/utils/money';
import { RepairOrder } from '../../../../shared/types/repairs.types';
import { formatDateArabic, formatTimeArabic } from '../../../lib/formatters';
import logoImg from '../../../assets/logo.png';

interface RepairReceiptModalProps {
  order: RepairOrder;
  onClose: () => void;
}

export function RepairReceiptModal({ order, onClose }: RepairReceiptModalProps): React.ReactElement {
  const printRef = useRef<HTMLDivElement>(null);

  const isDelivered = order.status === 'delivered';

  const handlePrint = () => {
    window.print();
  };

  let accessories: string[] = [];
  if (order.receivedAccessories) {
    try {
      accessories = JSON.parse(order.receivedAccessories);
    } catch {
      accessories = [];
    }
  }

  const deliverySettlementAmount = Math.max(0, order.paidAmount - order.depositAmount);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1200,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#161B22',
          border: `1px solid ${isDelivered ? '#34D399' : '#FFB800'}`,
          borderRadius: 16,
          width: '100%',
          maxWidth: 460,
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)',
          color: '#F0F6FC',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* شريط الإجراءات العلوي */}
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid #262E3D',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isDelivered ? <CheckCircle2 size={18} color="#34D399" /> : <Wrench size={18} color="#FFB800" />}
            <span style={{ fontWeight: 700, fontSize: 15, color: isDelivered ? '#34D399' : '#FFB800' }}>
              {isDelivered ? `فاتورة تسليم وضمان: ${order.repairCode}` : `إيصال استلام صيانة: ${order.repairCode}`}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="primary" size="sm" onClick={handlePrint}>
              <Printer size={15} style={{ marginLeft: 4 }} />
              طباعة
            </Button>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: '#94A3B8',
                cursor: 'pointer',
                padding: 4,
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* جسم الإيصال القابل للطباعة والمعاينة */}
        <div style={{ overflowY: 'auto', padding: 18 }}>
          <div
            ref={printRef}
            id="repair-receipt-content"
            style={{
              backgroundColor: '#FFFFFF',
              color: '#000000',
              padding: '24px 20px',
              borderRadius: 8,
              fontSize: 12,
              fontFamily: "'Courier New', Courier, monospace, Tahoma",
              lineHeight: 1.5,
              direction: 'rtl',
            }}
          >
            {/* ترويسة الإيصال */}
            <div style={{ textAlign: 'center', borderBottom: '1px dashed #666', paddingBottom: 12 }}>
              <img
                src={logoImg}
                alt="Mobix Logo"
                style={{ width: 64, height: 64, objectFit: 'contain', margin: '0 auto 6px' }}
              />
              <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: 0.5 }}>موبيكس - Mobix</div>
              <div style={{ fontSize: 11, color: '#333' }}>شريكك الذكي لإدارة محلات الموبايلات</div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  marginTop: 6,
                  display: 'inline-block',
                  backgroundColor: isDelivered ? '#D1FAE5' : '#FEF3C7',
                  color: isDelivered ? '#065F46' : '#92400E',
                  padding: '2px 10px',
                  borderRadius: 4,
                }}
              >
                {isDelivered ? 'فاتورة تسوية وضمان صيانة نهائي' : 'إيصال استلام جهاز وقبض عربون'}
              </div>
            </div>

            {/* بيانات أمر الصيانة والعميل */}
            <div style={{ borderBottom: '1px dashed #666', padding: '10px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontWeight: 700 }}>رقم الصيانة:</span>
                <span style={{ fontWeight: 900, fontSize: 14 }}>{order.repairCode}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span>تاريخ الاستلام:</span>
                <span>{formatDateArabic(order.createdAt)} {formatTimeArabic(order.createdAt)}</span>
              </div>
              {isDelivered && order.deliveredAt && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontWeight: 700 }}>تاريخ التسليم:</span>
                  <span style={{ fontWeight: 700 }}>{formatDateArabic(order.deliveredAt)} {formatTimeArabic(order.deliveredAt)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontWeight: 700 }}>اسم العميل:</span>
                <span style={{ fontWeight: 700 }}>{order.customerName}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span>رقم الهاتف:</span>
                <span style={{ direction: 'ltr' }}>{order.customerPhone}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>المستلم / الفني:</span>
                <span>{order.technicianName || order.userName || 'موبيكس'}</span>
              </div>
            </div>

            {/* بيانات الجهاز والعطل */}
            <div style={{ borderBottom: '1px dashed #666', padding: '10px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontWeight: 700 }}>الجهاز والموديل:</span>
                <span style={{ fontWeight: 800 }}>{order.deviceBrand} {order.deviceModel}</span>
              </div>
              {order.deviceColor && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span>اللون:</span>
                  <span>{order.deviceColor}</span>
                </div>
              )}
              {order.imeiSerial && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span>السيريال / IMEI:</span>
                  <span style={{ direction: 'ltr', fontSize: 11 }}>{order.imeiSerial}</span>
                </div>
              )}
              <div style={{ marginTop: 6, backgroundColor: '#f5f5f5', padding: 6, borderRadius: 4 }}>
                <span style={{ fontWeight: 700 }}>العطل المسجل: </span>
                <span>{order.reportedIssue}</span>
              </div>
              {accessories.length > 0 && (
                <div style={{ marginTop: 6, fontSize: 11 }}>
                  <span style={{ fontWeight: 700 }}>الملحقات المستلمة: </span>
                  <span>{accessories.join('، ')}</span>
                </div>
              )}
            </div>

            {/* الحسابات المالية والفواتير المرتبطة */}
            <div style={{ borderBottom: '1px dashed #666', padding: '10px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span>إجمالي تكلفة الصيانة:</span>
                <span style={{ fontWeight: 800 }}>{formatMoney(order.totalCost || order.estimatedCost)}</span>
              </div>

              {order.depositAmount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span>العربون المسدد مسبقاً:</span>
                  <span style={{ fontWeight: 700 }}>
                    {formatMoney(order.depositAmount)}
                    {order.depositInvoiceNo && ` (#${order.depositInvoiceNo})`}
                  </span>
                </div>
              )}

              {isDelivered && deliverySettlementAmount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span>المسدد عند التسليم:</span>
                  <span style={{ fontWeight: 700 }}>
                    {formatMoney(deliverySettlementAmount)}
                    {order.deliveryInvoiceNo && ` (#${order.deliveryInvoiceNo})`}
                  </span>
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 13,
                  marginTop: 6,
                  paddingTop: 6,
                  borderTop: '1px dashed #ccc',
                }}
              >
                <span style={{ fontWeight: 900 }}>{isDelivered ? 'إجمالي المدفوع:' : 'المتبقي المستحق عند التسليم:'}</span>
                <span style={{ fontWeight: 900, color: isDelivered ? '#059669' : '#000000' }}>
                  {isDelivered ? formatMoney(order.paidAmount) : formatMoney(order.remainingAmount)}
                </span>
              </div>

              {isDelivered && (
                <div style={{ textAlign: 'center', marginTop: 4, color: '#059669', fontWeight: 800, fontSize: 11 }}>
                  ✓ خالص ومسدد بالكامل
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11 }}>
                <span>فترة ضمان الصيانة:</span>
                <span style={{ fontWeight: 800 }}>{order.warrantyDays} يوم ضد عيوب الإصلاح</span>
              </div>
            </div>

            {/* شروط الصيانة والتنبيهات */}
            <div style={{ paddingTop: 10, fontSize: 10, color: '#444' }}>
              <div style={{ fontWeight: 800, marginBottom: 4 }}>شروط الاستلام والضمان:</div>
              <ol style={{ paddingRight: 16, margin: 0 }}>
                <li>المحل غير مسؤول عن الجهاز بعد مرور 30 يوماً من إبلاغ العميل بالجاهزية.</li>
                <li>يجب إبراز هذا الإيصال أو إثبات الشخصية عند استلام الجهاز.</li>
                <li>الضمان يسري على القطع المستبدلة فقط ولا يشمل سوء الاستخدام أو الكسر أو التعرض للماء.</li>
              </ol>
              <div style={{ textAlign: 'center', marginTop: 12, fontWeight: 700, fontSize: 11 }}>
                شكراً لثقتكم في موبيكس - خدماتك في أمان تام!
              </div>
            </div>
          </div>
        </div>

        {/* زر سفلي للإغلاق */}
        <div
          style={{
            padding: '12px 18px',
            borderTop: '1px solid #262E3D',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
          }}
        >
          <Button variant="outline" size="sm" onClick={onClose}>
            إغلاق
          </Button>
          <Button variant="primary" size="sm" onClick={handlePrint}>
            <Printer size={15} style={{ marginLeft: 4 }} />
            طباعة الإيصال
          </Button>
        </div>
      </div>
    </div>
  );
}
