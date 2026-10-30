import React, { useState, useEffect } from 'react';
import {
  Wrench,
  X,
  Smartphone,
  User,
  Phone,
  Clock,
  Printer,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Package,
  Layers,
  History,
} from 'lucide-react';
import { Button } from '../../../components/common/Button';
import { Input } from '../../../components/common/Input';
import { formatMoney } from '../../../../shared/utils/money';
import {
  RepairOrder,
  RepairStatus,
  RepairPart,
} from '../../../../shared/types/repairs.types';
import { formatDateArabic, formatTimeArabic } from '../../../lib/formatters';
import { useToast } from '../../../components/common/ToastContext';
import { sounds } from '../../../lib/sounds';
import { api } from '../../../lib/api';
import { RepairReceiptModal } from './RepairReceiptModal';
import { DeliverRepairModal } from './DeliverRepairModal';

interface RepairDetailsModalProps {
  orderId: number;
  userId: number;
  onClose: () => void;
  onUpdate: () => void;
}

const STATUS_CONFIG: Record<
  RepairStatus,
  { label: string; color: string; bg: string; border: string }
> = {
  received: { label: 'تم الاستلام', color: '#60A5FA', bg: 'rgba(96, 165, 250, 0.15)', border: '#3B82F6' },
  inspecting: { label: 'قيد الفحص', color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.15)', border: '#D97706' },
  pending_approval: { label: 'بانتظار الموافقة', color: '#A855F7', bg: 'rgba(168, 85, 247, 0.15)', border: '#9333EA' },
  in_progress: { label: 'جاري الإصلاح', color: '#FFB800', bg: 'rgba(255, 184, 0, 0.15)', border: '#FFB800' },
  ready: { label: 'جاهز للتسليم', color: '#10B981', bg: 'rgba(16, 185, 129, 0.15)', border: '#059669' },
  delivered: { label: 'تم التسليم والمحاسبة', color: '#34D399', bg: 'rgba(52, 211, 153, 0.15)', border: '#10B981' },
  cancelled: { label: 'ملغي / تعذر الإصلاح', color: '#EF4444', bg: 'rgba(239, 68, 68, 0.15)', border: '#DC2626' },
};

const STATUS_STEPS: RepairStatus[] = [
  'received',
  'inspecting',
  'in_progress',
  'ready',
  'delivered',
];

export function RepairDetailsModal({
  orderId,
  userId,
  onClose,
  onUpdate,
}: RepairDetailsModalProps): React.ReactElement {
  const { success: toastSuccess, error: toastError } = useToast();

  const [order, setOrder] = useState<RepairOrder | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showReceipt, setShowReceipt] = useState(false);
  const [showDeliverModal, setShowDeliverModal] = useState(false);

  // حالة إضافة قطعة غيار
  const [showAddPart, setShowAddPart] = useState(false);
  const [partSearch, setPartSearch] = useState('');
  const [partResults, setPartResults] = useState<any[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<any | null>(null);
  const [partQty, setPartQty] = useState('1');
  const [partPricePounds, setPartPricePounds] = useState('');
  const [isAddingPart, setIsAddingPart] = useState(false);

  // تكلفة المصنعية
  const [laborCostPounds, setLaborCostPounds] = useState('');
  const [isUpdatingLabor, setIsUpdatingLabor] = useState(false);

  const fetchOrder = async () => {
    try {
      const res = await api.getRepair(orderId);
      if (res?.success && res.data) {
        setOrder(res.data);
        setLaborCostPounds((res.data.laborCost / 100).toFixed(2));
      } else {
        toastError('تعذر جلب بيانات أمر الصيانة');
      }
    } catch (err: any) {
      toastError(err.message || 'خطأ في جلب بيانات أمر الصيانة');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrder();
  }, [orderId]);

  const handleStatusChange = async (newStatus: RepairStatus) => {
    if (!order) return;
    if (newStatus === 'delivered') {
      setShowDeliverModal(true);
      return;
    }
    try {
      const res = await api.updateRepairStatus({
        id: order.id,
        status: newStatus,
        userId,
      });
      if (res?.success) {
        sounds.playSuccess();
        toastSuccess(`تم تحديث الحالة إلى: ${STATUS_CONFIG[newStatus].label}`);
        fetchOrder();
        onUpdate();
      } else {
        toastError(res?.error || 'تعذر تحديث الحالة');
      }
    } catch (err: any) {
      toastError(err.message || 'خطأ في تحديث الحالة');
    }
  };

  const handleSearchParts = async (query: string) => {
    setPartSearch(query);
    if (!query.trim()) {
      setPartResults([]);
      return;
    }
    try {
      const res = await api.searchProducts(query);
      if (res?.success && Array.isArray(res.data)) {
        setPartResults(res.data);
      }
    } catch {
      setPartResults([]);
    }
  };

  const handleSelectProduct = (product: any) => {
    const variant = product.variants?.[0];
    if (!variant) return;
    setSelectedVariant({
      ...variant,
      productName: product.name_ar,
    });
    setPartPricePounds((variant.retail_price / 100).toFixed(2));
    setPartResults([]);
  };

  const handleAddPartSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order || !selectedVariant) return;

    const qty = parseInt(partQty, 10);
    if (isNaN(qty) || qty <= 0) {
      toastError('يرجى إدخال كمية صحيحة');
      return;
    }

    const unitPrice = Math.round(parseFloat(partPricePounds) * 100);

    setIsAddingPart(true);
    try {
      const res = await api.addRepairPart({
        input: {
          repairId: order.id,
          variantId: selectedVariant.id,
          itemName: `${selectedVariant.productName} - ${selectedVariant.variant_name || ''}`,
          qty,
          unitCost: selectedVariant.cost_price || 0,
          unitPrice,
        },
        userId,
      });

      if (res?.success) {
        sounds.playSuccess();
        toastSuccess('تمت إضافة قطعة الغيار واحتساب التكلفة');
        setShowAddPart(false);
        setSelectedVariant(null);
        setPartSearch('');
        fetchOrder();
        onUpdate();
      } else {
        toastError(res?.error || 'تعذر إضافة قطعة الغيار');
      }
    } catch (err: any) {
      toastError(err.message || 'خطأ في إضافة قطعة الغيار');
    } finally {
      setIsAddingPart(false);
    }
  };

  const handleRemovePart = async (partId: number) => {
    try {
      const res = await api.removeRepairPart({ partId, userId });
      if (res?.success) {
        sounds.playSuccess();
        toastSuccess('تم حذف قطعة الغيار وتحديث الإجمالي');
        fetchOrder();
        onUpdate();
      } else {
        toastError(res?.error || 'تعذر حذف قطعة الغيار');
      }
    } catch (err: any) {
      toastError(err.message || 'خطأ أثناء الحذف');
    }
  };

  const handleUpdateLabor = async () => {
    if (!order) return;
    const labor = Math.round(parseFloat(laborCostPounds) * 100);
    setIsUpdatingLabor(true);
    try {
      const res = await api.updateRepair({
        id: order.id,
        input: { laborCost: labor },
        userId,
      });
      if (res?.success) {
        toastSuccess('تم تحديث أجر اليد والمصنعية');
        fetchOrder();
        onUpdate();
      }
    } catch (err: any) {
      toastError(err.message || 'تعذر تحديث المصنعية');
    } finally {
      setIsUpdatingLabor(false);
    }
  };

  if (isLoading || !order) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          color: '#FFB800',
        }}
      >
        جاري تحميل تفاصيل أمر الصيانة...
      </div>
    );
  }

  const currentStatusConf = STATUS_CONFIG[order.status];

  return (
    <>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: 16,
        }}
        onClick={onClose}
      >
        <div
          style={{
            backgroundColor: '#161B22',
            border: '1px solid #262E3D',
            borderRadius: 16,
            width: '100%',
            maxWidth: 840,
            maxHeight: '92vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
            color: '#F0F6FC',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* شريط العنوان العلوي */}
          <div
            style={{
              padding: '16px 22px',
              borderBottom: '1px solid #262E3D',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  backgroundColor: 'rgba(255, 184, 0, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Wrench size={22} color="#FFB800" />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontWeight: 800, fontSize: 17, color: '#FFB800' }}>
                    أمر صيانة: {order.repairCode}
                  </span>
                  <span
                    style={{
                      backgroundColor: currentStatusConf.bg,
                      color: currentStatusConf.color,
                      border: `1px solid ${currentStatusConf.border}`,
                      padding: '2px 10px',
                      borderRadius: 12,
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {currentStatusConf.label}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#94A3B8' }}>
                  {order.deviceBrand} {order.deviceModel} • {order.customerName} ({order.customerPhone})
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Button variant="outline" size="sm" onClick={() => setShowReceipt(true)}>
                <Printer size={15} style={{ marginLeft: 4 }} />
                طباعة الإيصال
              </Button>
              <button
                onClick={onClose}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94A3B8',
                  cursor: 'pointer',
                  padding: 6,
                }}
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* محتوى التفاصيل */}
          <div style={{ overflowY: 'auto', padding: '20px 22px', flex: 1, display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* مسار مراحل الصيانة (Workflow Pipeline) */}
            <div
              style={{
                backgroundColor: '#0B0E14',
                border: '1px solid #262E3D',
                borderRadius: 12,
                padding: '14px 18px',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: '#94A3B8', marginBottom: 10 }}>
                مراحل الصيانة: اضغط للترقية الفورية للحالة
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                {STATUS_STEPS.map((step, idx) => {
                  const conf = STATUS_CONFIG[step];
                  const isCurrent = order.status === step;
                  return (
                    <button
                      key={step}
                      onClick={() => handleStatusChange(step)}
                      style={{
                        flex: 1,
                        minWidth: 110,
                        padding: '8px 10px',
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: isCurrent ? 800 : 600,
                        backgroundColor: isCurrent ? conf.bg : '#161B22',
                        border: `1px solid ${isCurrent ? conf.border : '#262E3D'}`,
                        color: isCurrent ? conf.color : '#CBD5E1',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {isCurrent && <CheckCircle2 size={14} />}
                      <span>{conf.label}</span>
                    </button>
                  );
                })}
                <button
                  onClick={() => handleStatusChange('cancelled')}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: order.status === 'cancelled' ? 800 : 500,
                    backgroundColor: order.status === 'cancelled' ? 'rgba(239,68,68,0.15)' : '#161B22',
                    border: '1px solid #EF4444',
                    color: '#EF4444',
                    cursor: 'pointer',
                  }}
                >
                  إلغاء / تعذر
                </button>
              </div>
            </div>

            {/* بطاقات معلومات الجهاز والحسابات */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 16 }}>
              {/* بطاقة تفاصيل الجهاز */}
              <div
                style={{
                  backgroundColor: '#0B0E14',
                  border: '1px solid #262E3D',
                  borderRadius: 12,
                  padding: 16,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: '#FFB800', marginBottom: 12 }}>
                  مواصفات الجهاز وملاحظات العطل
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12 }}>
                  <div>
                    <span style={{ color: '#94A3B8' }}>الماركة والموديل: </span>
                    <span style={{ fontWeight: 700 }}>{order.deviceBrand} {order.deviceModel}</span>
                  </div>
                  {order.deviceColor && (
                    <div>
                      <span style={{ color: '#94A3B8' }}>اللون: </span>
                      <span>{order.deviceColor}</span>
                    </div>
                  )}
                  {order.imeiSerial && (
                    <div style={{ gridColumn: 'span 2' }}>
                      <span style={{ color: '#94A3B8' }}>السيريال / IMEI: </span>
                      <span style={{ direction: 'ltr', display: 'inline-block', fontWeight: 600 }}>{order.imeiSerial}</span>
                    </div>
                  )}
                  {order.passcodePattern && (
                    <div>
                      <span style={{ color: '#94A3B8' }}>رمز القفل: </span>
                      <span style={{ fontWeight: 800, color: '#FFB800' }}>{order.passcodePattern}</span>
                    </div>
                  )}
                  <div>
                    <span style={{ color: '#94A3B8' }}>تاريخ الاستلام: </span>
                    <span>{formatDateArabic(order.createdAt)}</span>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 12,
                    backgroundColor: '#161B22',
                    padding: 10,
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                >
                  <div style={{ fontWeight: 700, color: '#F87171', marginBottom: 4 }}>العطل المشروح:</div>
                  <div>{order.reportedIssue}</div>
                </div>

                {order.deviceCondition && (
                  <div style={{ marginTop: 8, fontSize: 11, color: '#94A3B8' }}>
                    <span style={{ fontWeight: 600 }}>حالة الجهاز: </span>
                    {order.deviceCondition}
                  </div>
                )}
              </div>

              {/* بطاقة الحساب المالي والمدفوعات */}
              <div
                style={{
                  backgroundColor: '#0B0E14',
                  border: '1px solid #262E3D',
                  borderRadius: 12,
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#FFB800', marginBottom: 12 }}>
                    الحساب المالي للصيانة
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#94A3B8' }}>قطع الغيار:</span>
                      <span style={{ fontWeight: 700 }}>{formatMoney(order.partsCost)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#94A3B8' }}>المصنعية (أجر اليد):</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input
                          type="number"
                          value={laborCostPounds}
                          onChange={(e) => setLaborCostPounds(e.target.value)}
                          style={{
                            width: 75,
                            padding: '3px 6px',
                            backgroundColor: '#161B22',
                            border: '1px solid #262E3D',
                            borderRadius: 6,
                            color: '#F0F6FC',
                            fontSize: 12,
                            textAlign: 'center',
                          }}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleUpdateLabor}
                          disabled={isUpdatingLabor}
                          style={{ padding: '3px 8px', fontSize: 11 }}
                        >
                          حفظ
                        </Button>
                      </div>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        borderTop: '1px solid #262E3D',
                        paddingTop: 8,
                        fontWeight: 800,
                        fontSize: 15,
                        color: '#FFB800',
                      }}
                    >
                      <span>التكلفة الإجمالية:</span>
                      <span>{formatMoney(order.totalCost)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#10B981' }}>
                      <span>العربون / المدفوع:</span>
                      <span style={{ fontWeight: 700 }}>{formatMoney(order.paidAmount)}</span>
                    </div>
                    {order.depositInvoiceNo && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94A3B8', borderTop: '1px dashed #1C222D', paddingTop: 4 }}>
                        <span>فاتورة العربون:</span>
                        <span style={{ fontWeight: 700, color: '#FFB800' }}>#{order.depositInvoiceNo}</span>
                      </div>
                    )}
                    {order.deliveryInvoiceNo && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94A3B8' }}>
                        <span>فاتورة التسليم والمحاسبة:</span>
                        <span style={{ fontWeight: 700, color: '#34D399' }}>#{order.deliveryInvoiceNo}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    backgroundColor: 'rgba(255, 184, 0, 0.1)',
                    border: '1px dashed #FFB800',
                    borderRadius: 8,
                    padding: 10,
                    textAlign: 'center',
                    marginTop: 12,
                  }}
                >
                  <div style={{ fontSize: 11, color: '#94A3B8' }}>المبلغ المتبقي للتحصيل عند التسليم:</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: order.remainingAmount > 0 ? '#FFB800' : '#34D399', marginTop: 2 }}>
                    {formatMoney(order.remainingAmount)}
                  </div>
                </div>

                {order.status !== 'delivered' && order.status !== 'cancelled' && (
                  <Button
                    variant="primary"
                    size="sm"
                    style={{
                      backgroundColor: '#10B981',
                      borderColor: '#10B981',
                      color: '#FFFFFF',
                      fontWeight: 800,
                      width: '100%',
                      marginTop: 10,
                      padding: '8px 12px',
                    }}
                    onClick={() => setShowDeliverModal(true)}
                  >
                    <CheckCircle2 size={16} style={{ marginLeft: 6 }} />
                    <span>تسليم الجهاز والمحاسبة {order.remainingAmount > 0 ? `(${formatMoney(order.remainingAmount)})` : ''}</span>
                  </Button>
                )}
              </div>
            </div>

            {/* قسم قطع الغيار المستهلكة */}
            <div
              style={{
                backgroundColor: '#0B0E14',
                border: '1px solid #262E3D',
                borderRadius: 12,
                padding: 16,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#FFB800', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Package size={16} />
                  <span>قطع الغيار المستهلكة من المخزون ({order.parts?.length || 0})</span>
                </div>
                {order.status !== 'delivered' && order.status !== 'cancelled' && (
                  <Button variant="outline" size="sm" onClick={() => setShowAddPart(true)}>
                    <Plus size={14} style={{ marginLeft: 4 }} />
                    إضافة قطعة غيار
                  </Button>
                )}
              </div>

              {/* نافذة فرعية لإضافة قطعة الغيار */}
              {showAddPart && (
                <div
                  style={{
                    backgroundColor: '#161B22',
                    border: '1px solid #FFB800',
                    borderRadius: 8,
                    padding: 14,
                    marginBottom: 14,
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 12, color: '#FFB800', marginBottom: 8 }}>
                    بحث واختيار قطعة الغيار من المخزون:
                  </div>
                  <div style={{ position: 'relative' }}>
                    <Input
                      placeholder="ابحث باسم الشاشة أو البطارية أو الكود..."
                      value={partSearch}
                      onChange={(e) => handleSearchParts(e.target.value)}
                    />
                    {partResults.length > 0 && (
                      <div
                        style={{
                          position: 'absolute',
                          top: '100%',
                          right: 0,
                          left: 0,
                          backgroundColor: '#161B22',
                          border: '1px solid #262E3D',
                          borderRadius: 8,
                          maxHeight: 180,
                          overflowY: 'auto',
                          zIndex: 10,
                          marginTop: 4,
                          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
                        }}
                      >
                        {partResults.map((p) => (
                          <div
                            key={p.id}
                            onClick={() => handleSelectProduct(p)}
                            style={{
                              padding: '8px 12px',
                              borderBottom: '1px solid #262E3D',
                              cursor: 'pointer',
                              display: 'flex',
                              justifyContent: 'space-between',
                              fontSize: 12,
                            }}
                          >
                            <span>{p.name_ar}</span>
                            <span style={{ color: '#FFB800', fontWeight: 600 }}>
                              {formatMoney(p.variants?.[0]?.retail_price || 0)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {selectedVariant && (
                    <form onSubmit={handleAddPartSubmit} style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 12, marginBottom: 8, color: '#34D399' }}>
                        القطعة المحددة: {selectedVariant.productName} ({selectedVariant.variant_name || 'أساسي'})
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, alignItems: 'flex-end' }}>
                        <div>
                          <label style={{ fontSize: 11, color: '#94A3B8', display: 'block', marginBottom: 4 }}>
                            الكمية
                          </label>
                          <Input
                            type="number"
                            min="1"
                            value={partQty}
                            onChange={(e) => setPartQty(e.target.value)}
                            required
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: '#94A3B8', display: 'block', marginBottom: 4 }}>
                            سعر البيع على العميل (ج.م)
                          </label>
                          <Input
                            type="number"
                            min="0"
                            step="0.5"
                            value={partPricePounds}
                            onChange={(e) => setPartPricePounds(e.target.value)}
                            required
                          />
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <Button variant="primary" size="sm" type="submit" disabled={isAddingPart}>
                            تأكيد الإضافة
                          </Button>
                          <Button variant="outline" size="sm" type="button" onClick={() => setShowAddPart(false)}>
                            إلغاء
                          </Button>
                        </div>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {/* جدول قطع الغيار */}
              {!order.parts || order.parts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '16px 0', color: '#94A3B8', fontSize: 12 }}>
                  لم يتم استهلاك أي قطع غيار في هذا الجهاز حتى الآن.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #262E3D', color: '#94A3B8', textAlign: 'right' }}>
                      <th style={{ padding: '8px 10px' }}>اسم القطعة</th>
                      <th style={{ padding: '8px 10px' }}>الكمية</th>
                      <th style={{ padding: '8px 10px' }}>سعر الوحدة</th>
                      <th style={{ padding: '8px 10px' }}>الإجمالي</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center' }}>إجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.parts.map((p) => (
                      <tr key={p.id} style={{ borderBottom: '1px solid #1C222D' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 600 }}>{p.itemName}</td>
                        <td style={{ padding: '8px 10px' }}>{p.qty}</td>
                        <td style={{ padding: '8px 10px' }}>{formatMoney(p.unitPrice)}</td>
                        <td style={{ padding: '8px 10px', color: '#FFB800', fontWeight: 700 }}>
                          {formatMoney(p.qty * p.unitPrice)}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          {order.status !== 'delivered' && (
                            <button
                              onClick={() => handleRemovePart(p.id)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#EF4444',
                                cursor: 'pointer',
                                padding: 4,
                              }}
                              title="حذف القطعة"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* سجل تاريخ الحالات والرقابة */}
            {order.logs && order.logs.length > 0 && (
              <div
                style={{
                  backgroundColor: '#0B0E14',
                  border: '1px solid #262E3D',
                  borderRadius: 12,
                  padding: 16,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: '#FFB800', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <History size={15} />
                  <span>سجل تغييرات الحالة ومراحل الورشة</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {order.logs.map((log) => (
                    <div
                      key={log.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: 11,
                        padding: '6px 10px',
                        backgroundColor: '#161B22',
                        borderRadius: 6,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 700, color: '#FFB800' }}>
                          {STATUS_CONFIG[log.newStatus as RepairStatus]?.label || log.newStatus}
                        </span>
                        {log.note && <span style={{ color: '#CBD5E1' }}>- {log.note}</span>}
                      </div>
                      <div style={{ color: '#94A3B8' }}>
                        بواسطة {log.userName || 'النظام'} • {formatDateArabic(log.createdAt)} {formatTimeArabic(log.createdAt)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showReceipt && (
        <RepairReceiptModal order={order} onClose={() => setShowReceipt(false)} />
      )}

      {showDeliverModal && order && (
        <DeliverRepairModal
          order={order}
          userId={userId}
          onClose={() => setShowDeliverModal(false)}
          onSuccess={(deliveredOrder) => {
            setShowDeliverModal(false);
            setOrder(deliveredOrder);
            onUpdate();
            setShowReceipt(true);
          }}
        />
      )}
    </>
  );
}
