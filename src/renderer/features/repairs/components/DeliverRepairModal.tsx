import React, { useState } from 'react';
import {
  CheckCircle2,
  X,
  Smartphone,
  User,
  Phone,
  DollarSign,
  CreditCard,
  Coins,
  Wallet,
  ShieldCheck,
  FileText,
  AlertCircle,
} from 'lucide-react';
import { Button } from '../../../components/common/Button';
import { Input } from '../../../components/common/Input';
import { RepairOrder, DeliverRepairInput } from '../../../../shared/types/repairs.types';
import { formatMoney } from '../../../../shared/utils/money';
import { useToast } from '../../../components/common/ToastContext';
import { sounds } from '../../../lib/sounds';
import { api } from '../../../lib/api';

interface DeliverRepairModalProps {
  order: RepairOrder;
  userId: number;
  shiftId?: number;
  onClose: () => void;
  onSuccess: (deliveredOrder: RepairOrder) => void;
}

export function DeliverRepairModal({
  order,
  userId,
  shiftId,
  onClose,
  onSuccess,
}: DeliverRepairModalProps): React.ReactElement {
  const { success: toastSuccess, error: toastError } = useToast();

  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'wallet'>('cash');
  const [discountPounds, setDiscountPounds] = useState<string>('0');
  const [finalLaborPounds, setFinalLaborPounds] = useState<string>(
    ((order.laborCost || (order.totalCost - (order.partsCost || 0))) / 100).toFixed(2)
  );
  const [deliveryNote, setDeliveryNote] = useState<string>('تم تسليم الجهاز للعميل واختباره والمحاسبة بالكامل');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // الحسابات اللحظية
  const discountAmount = Math.max(0, Math.round((parseFloat(discountPounds) || 0) * 100));
  const finalLaborCost = Math.max(0, Math.round((parseFloat(finalLaborPounds) || 0) * 100));
  const currentTotal = finalLaborCost + (order.partsCost || 0);
  const netTotal = Math.max(0, currentTotal - discountAmount);
  const remainingToCollect = Math.max(0, netTotal - order.paidAmount);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const input: DeliverRepairInput = {
        id: order.id,
        paymentMethod,
        discountAmount,
        finalLaborCost,
        note: deliveryNote.trim() || undefined,
        userId,
        shiftId,
      };

      const res = await api.deliverRepair(input);
      if (res?.success && res.data) {
        sounds.playSaleSuccess();
        toastSuccess(`تم تسليم الجهاز #${order.repairCode} وإصدار فاتورة التسوية وإضافتها للخزينة بنجاح`);
        onSuccess(res.data);
      } else {
        toastError(res?.error || 'تعذر تسليم الجهاز');
      }
    } catch (err: any) {
      toastError(err.message || 'حدث خطأ أثناء تسليم الجهاز والمحاسبة');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#161B22',
          border: '1px solid #34D399',
          borderRadius: 16,
          width: '100%',
          maxWidth: 620,
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px -15px rgba(16, 185, 129, 0.3)',
          color: '#F0F6FC',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 22px',
            backgroundColor: 'rgba(52, 211, 153, 0.08)',
            borderBottom: '1px solid #262E3D',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                backgroundColor: 'rgba(52, 211, 153, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CheckCircle2 size={24} color="#34D399" />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 17, color: '#34D399' }}>
                تسليم الجهاز والمحاسبة النهائية
              </div>
              <div style={{ fontSize: 12, color: '#94A3B8' }}>
                أمر صيانة: <span style={{ fontWeight: 700, color: '#FFB800' }}>{order.repairCode}</span> • إصدار فاتورة تسوية فورية
              </div>
            </div>
          </div>
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
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} style={{ overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* بيانات العميل والجهاز */}
          <div
            style={{
              backgroundColor: '#0B0E14',
              border: '1px solid #262E3D',
              borderRadius: 12,
              padding: 14,
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 10,
              fontSize: 12,
            }}
          >
            <div>
              <span style={{ color: '#94A3B8' }}>العميل: </span>
              <span style={{ fontWeight: 700 }}>{order.customerName}</span>
            </div>
            <div>
              <span style={{ color: '#94A3B8' }}>الهاتف: </span>
              <span style={{ direction: 'ltr', display: 'inline-block' }}>{order.customerPhone}</span>
            </div>
            <div>
              <span style={{ color: '#94A3B8' }}>الجهاز: </span>
              <span style={{ fontWeight: 700, color: '#FFB800' }}>{order.deviceBrand} {order.deviceModel}</span>
            </div>
            <div>
              <span style={{ color: '#94A3B8' }}>العطل المسجل: </span>
              <span style={{ color: '#CBD5E1' }}>{order.reportedIssue}</span>
            </div>
          </div>

          {/* ملخص الحساب المالي والتسوية */}
          <div
            style={{
              backgroundColor: '#0B0E14',
              border: '1px solid #262E3D',
              borderRadius: 12,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: '#FFB800', borderBottom: '1px solid #1C222D', paddingBottom: 6 }}>
              الحساب المالي للصيانة
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94A3B8' }}>قطع الغيار:</span>
                <span style={{ fontWeight: 700 }}>{formatMoney(order.partsCost || 0)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#94A3B8' }}>أجر المصنعية:</span>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={finalLaborPounds}
                  onChange={(e) => setFinalLaborPounds(e.target.value)}
                  style={{
                    width: 80,
                    padding: '3px 6px',
                    backgroundColor: '#161B22',
                    border: '1px solid #262E3D',
                    borderRadius: 6,
                    color: '#F0F6FC',
                    fontSize: 12,
                    textAlign: 'center',
                  }}
                  title="يمكن تعديل أجر المصنعية قبل التسليم"
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94A3B8' }}>العربون المدفوع سابقاً:</span>
                <span style={{ fontWeight: 700, color: '#10B981' }}>
                  {formatMoney(order.paidAmount)}
                  {order.depositInvoiceNo && (
                    <span style={{ fontSize: 10, color: '#94A3B8', marginRight: 4 }}>
                      (فاتورة #{order.depositInvoiceNo})
                    </span>
                  )}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#94A3B8' }}>خصم التسليم:</span>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={discountPounds}
                  onChange={(e) => setDiscountPounds(e.target.value)}
                  style={{
                    width: 80,
                    padding: '3px 6px',
                    backgroundColor: '#161B22',
                    border: '1px solid #262E3D',
                    borderRadius: 6,
                    color: '#F0F6FC',
                    fontSize: 12,
                    textAlign: 'center',
                  }}
                />
              </div>
            </div>

            {/* بطاقة المبلغ المطلوب تحصيله الآن */}
            <div
              style={{
                marginTop: 6,
                backgroundColor: 'rgba(52, 211, 153, 0.12)',
                border: '1.5px solid #34D399',
                borderRadius: 10,
                padding: '12px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: 12, color: '#94A3B8' }}>المبلغ المطلوب تحصيله وإضافته للخزينة الآن:</div>
                <div style={{ fontSize: 11, color: '#34D399', marginTop: 2 }}>
                  إجمالي التكلفة: {formatMoney(netTotal)} • المسدد: {formatMoney(order.paidAmount)}
                </div>
              </div>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#34D399' }}>
                {formatMoney(remainingToCollect)}
              </div>
            </div>
          </div>

          {/* طريقة تحصيل باقي المبلغ */}
          {remainingToCollect > 0 && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#CBD5E1', display: 'block', marginBottom: 8 }}>
                طريقة تحصيل باقي المبلغ:
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('cash')}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 700,
                    backgroundColor: paymentMethod === 'cash' ? 'rgba(52, 211, 153, 0.2)' : '#0B0E14',
                    border: `1.5px solid ${paymentMethod === 'cash' ? '#34D399' : '#262E3D'}`,
                    color: paymentMethod === 'cash' ? '#34D399' : '#94A3B8',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  <Coins size={16} />
                  <span>نقدي (كاش)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('card')}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 700,
                    backgroundColor: paymentMethod === 'card' ? 'rgba(96, 165, 250, 0.2)' : '#0B0E14',
                    border: `1.5px solid ${paymentMethod === 'card' ? '#60A5FA' : '#262E3D'}`,
                    color: paymentMethod === 'card' ? '#60A5FA' : '#94A3B8',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  <CreditCard size={16} />
                  <span>بطاقة / فيزا</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('wallet')}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 700,
                    backgroundColor: paymentMethod === 'wallet' ? 'rgba(245, 158, 11, 0.2)' : '#0B0E14',
                    border: `1.5px solid ${paymentMethod === 'wallet' ? '#F59E0B' : '#262E3D'}`,
                    color: paymentMethod === 'wallet' ? '#F59E0B' : '#94A3B8',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  <Wallet size={16} />
                  <span>محفظة ذكية</span>
                </button>
              </div>
            </div>
          )}

          {/* تنبيه مالي ذكي */}
          <div
            style={{
              padding: '10px 14px',
              backgroundColor: '#0B0E14',
              borderRadius: 8,
              border: '1px dashed #262E3D',
              fontSize: 11,
              color: '#94A3B8',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <ShieldCheck size={16} color="#34D399" />
            <span>
              {remainingToCollect > 0
                ? `سيتم إصدار فاتورة تسوية رقمية بقيمة ${formatMoney(remainingToCollect)} وإدراجها فوراً في سجل الفواتير وحركات الخزينة وتقرير الوردية اليومي.`
                : 'تم سداد الحساب بالكامل مسبقاً، سيتم ترقية حالة الجهاز إلى "تم التسليم" وإصدار إيصال وضمان التسليم.'}
            </span>
          </div>

          {/* ملاحظات التسليم */}
          <div>
            <label style={{ fontSize: 11, color: '#94A3B8', display: 'block', marginBottom: 4 }}>
              ملاحظات التسليم والضمان:
            </label>
            <Input
              value={deliveryNote}
              onChange={(e) => setDeliveryNote(e.target.value)}
              placeholder="مثال: تم فحص الشاشة وتسليم الجهاز مع كابل الشحن سليم..."
            />
          </div>

          {/* أزرار الإجراء */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 12,
              marginTop: 10,
              paddingTop: 12,
              borderTop: '1px solid #262E3D',
            }}
          >
            <Button variant="outline" type="button" onClick={onClose} disabled={isSubmitting}>
              إلغاء
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={isSubmitting}
              style={{
                backgroundColor: '#10B981',
                borderColor: '#10B981',
                fontWeight: 800,
                padding: '8px 20px',
              }}
            >
              <CheckCircle2 size={16} style={{ marginLeft: 6 }} />
              {remainingToCollect > 0 ? `تحصيل ${formatMoney(remainingToCollect)} وتسليم الجهاز` : 'تأكيد تسليم الجهاز'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
