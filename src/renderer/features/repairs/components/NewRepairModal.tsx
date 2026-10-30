import React, { useState } from 'react';
import {
  Wrench,
  X,
  Smartphone,
  User,
  Phone,
  Key,
  ShieldCheck,
  DollarSign,
  AlertTriangle,
  Layers,
  FileText,
  CreditCard,
  Coins,
  Wallet,
  Info,
} from 'lucide-react';
import { Button } from '../../../components/common/Button';
import { Input } from '../../../components/common/Input';
import { CreateRepairOrderInput, RepairOrder } from '../../../../shared/types/repairs.types';
import { formatMoney } from '../../../../shared/utils/money';
import { useToast } from '../../../components/common/ToastContext';
import { sounds } from '../../../lib/sounds';
import { api } from '../../../lib/api';

interface NewRepairModalProps {
  onClose: () => void;
  onSuccess: (order: RepairOrder) => void;
  userId: number;
  shiftId?: number;
}

const COMMON_BRANDS = [
  'Apple',
  'Samsung',
  'Xiaomi',
  'Realme',
  'Oppo',
  'Vivo',
  'Infinix',
  'Huawei',
  'Honor',
  'Tecno',
  'Nokia',
  'أخرى',
];

const ACCESSORY_OPTIONS = [
  'جراب حماية',
  'شاحن أصلي',
  'كابل USB',
  'شريحة خط (SIM)',
  'كارت ميموري',
  'بدون أي ملحقات',
];

export function NewRepairModal({
  onClose,
  onSuccess,
  userId,
  shiftId,
}: NewRepairModalProps): React.ReactElement {
  const { success: toastSuccess, error: toastError } = useToast();

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deviceBrand, setDeviceBrand] = useState('Apple');
  const [customBrand, setCustomBrand] = useState('');
  const [deviceModel, setDeviceModel] = useState('');
  const [deviceColor, setDeviceColor] = useState('');
  const [imeiSerial, setImeiSerial] = useState('');
  const [passcodePattern, setPasscodePattern] = useState('');
  const [reportedIssue, setReportedIssue] = useState('');
  const [inspectionNotes, setInspectionNotes] = useState('');
  const [deviceCondition, setDeviceCondition] = useState('سليم مع علامات استخدام طبيعية');
  const [selectedAccessories, setSelectedAccessories] = useState<string[]>([]);
  const [estimatedCostPounds, setEstimatedCostPounds] = useState('');
  const [depositAmountPounds, setDepositAmountPounds] = useState('');
  const [depositMethod, setDepositMethod] = useState<'cash' | 'card' | 'wallet'>('cash');
  const [warrantyDays, setWarrantyDays] = useState('30');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // حسابات حية
  const estimatedCost = estimatedCostPounds ? Math.round(parseFloat(estimatedCostPounds) * 100) : 0;
  const depositAmount = depositAmountPounds ? Math.round(parseFloat(depositAmountPounds) * 100) : 0;
  const remainingPreview = Math.max(0, estimatedCost - depositAmount);

  const toggleAccessory = (acc: string) => {
    if (acc === 'بدون أي ملحقات') {
      setSelectedAccessories(['بدون أي ملحقات']);
      return;
    }
    const filtered = selectedAccessories.filter((a) => a !== 'بدون أي ملحقات');
    if (filtered.includes(acc)) {
      setSelectedAccessories(filtered.filter((a) => a !== acc));
    } else {
      setSelectedAccessories([...filtered, acc]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!customerName.trim()) {
      toastError('يرجى إدخال اسم العميل');
      return;
    }
    if (!customerPhone.trim()) {
      toastError('يرجى إدخال رقم هاتف العميل');
      return;
    }
    const finalBrand = deviceBrand === 'أخرى' ? customBrand.trim() : deviceBrand;
    if (!finalBrand) {
      toastError('يرجى تحديد ماركة الجهاز');
      return;
    }
    if (!deviceModel.trim()) {
      toastError('يرجى إدخال موديل الجهاز (مثال: iPhone 13 Pro)');
      return;
    }
    if (!reportedIssue.trim()) {
      toastError('يرجى توضيح العطل أو المشكلة المشتكى منها');
      return;
    }

    if (depositAmount > estimatedCost && estimatedCost > 0) {
      toastError('قيمة العربون لا يمكن أن تتجاوز التكلفة التقديرية الإجمالية');
      return;
    }

    setIsSubmitting(true);
    try {
      const input: CreateRepairOrderInput = {
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        deviceBrand: finalBrand,
        deviceModel: deviceModel.trim(),
        deviceColor: deviceColor.trim() || undefined,
        imeiSerial: imeiSerial.trim() || undefined,
        passcodePattern: passcodePattern.trim() || undefined,
        reportedIssue: reportedIssue.trim(),
        inspectionNotes: inspectionNotes.trim() || undefined,
        deviceCondition: deviceCondition.trim() || undefined,
        receivedAccessories: selectedAccessories,
        estimatedCost,
        depositAmount,
        depositMethod,
        laborCost: estimatedCost,
        warrantyDays: parseInt(warrantyDays, 10) || 30,
        notes: notes.trim() || undefined,
      };

      const res = await api.createRepair({ input, userId, shiftId });
      if (res?.success && res.data) {
        sounds.playSaleSuccess();
        const msg =
          depositAmount > 0
            ? `تم تسجيل استلام الجهاز #${res.data.repairCode} وإصدار فاتورة العربون #${res.data.depositInvoiceNo || ''} بنجاح`
            : `تم تسجيل استلام الجهاز بنجاح: #${res.data.repairCode}`;
        toastSuccess(msg);
        onSuccess(res.data);
      } else {
        toastError(res?.error || 'حدث خطأ أثناء حفظ أمر الصيانة');
      }
    } catch (err: any) {
      toastError(err.message || 'تعذر حفظ أمر الصيانة');
    } finally {
      setIsSubmitting(false);
    }
  };

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
          maxWidth: 780,
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.8)',
          color: '#F0F6FC',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* شريط العنوان */}
        <div
          style={{
            padding: '16px 22px',
            borderBottom: '1px solid #262E3D',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#0B0E14',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
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
              <div style={{ fontWeight: 800, fontSize: 16, color: '#FFB800' }}>
                استلام جهاز جديد للصيانة
              </div>
              <div style={{ fontSize: 12, color: '#94A3B8' }}>
                تسجيل العطل ومواصفات الجهاز، وقبض العربون بفاتورة رسمية وإضافته للخزينة
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

        {/* نموذج الاستلام */}
        <form
          onSubmit={handleSubmit}
          style={{
            overflowY: 'auto',
            padding: '20px 24px',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          {/* 1. بيانات العميل */}
          <div
            style={{
              backgroundColor: '#0B0E14',
              border: '1px solid #262E3D',
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: '#FFB800',
                marginBottom: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <User size={15} />
              <span>بيانات العميل</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, marginBottom: 5, color: '#CBD5E1' }}>
                  اسم العميل <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <Input
                  placeholder="الاسم ثلاثي أو ثنائي"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, marginBottom: 5, color: '#CBD5E1' }}>
                  رقم الهاتف (واتساب) <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <Input
                  placeholder="01XXXXXXXXX"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  required
                />
              </div>
            </div>
          </div>

          {/* 2. مواصفات الجهاز المستلم */}
          <div
            style={{
              backgroundColor: '#0B0E14',
              border: '1px solid #262E3D',
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: '#FFB800',
                marginBottom: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Smartphone size={15} />
              <span>مواصفات الهاتف المستلم</span>
            </div>

            {/* أزرار اختيار البراند السريعة */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 6, color: '#CBD5E1' }}>
                ماركة الجهاز:
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {COMMON_BRANDS.map((brand) => (
                  <button
                    key={brand}
                    type="button"
                    onClick={() => setDeviceBrand(brand)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: deviceBrand === brand ? 700 : 500,
                      border: `1px solid ${deviceBrand === brand ? '#FFB800' : '#262E3D'}`,
                      backgroundColor: deviceBrand === brand ? 'rgba(255, 184, 0, 0.15)' : '#161B22',
                      color: deviceBrand === brand ? '#FFB800' : '#CBD5E1',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {brand}
                  </button>
                ))}
              </div>
              {deviceBrand === 'أخرى' && (
                <div style={{ marginTop: 8 }}>
                  <Input
                    placeholder="اكتب ماركة الجهاز..."
                    value={customBrand}
                    onChange={(e) => setCustomBrand(e.target.value)}
                  />
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, marginBottom: 5, color: '#CBD5E1' }}>
                  موديل الجهاز <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <Input
                  placeholder="مثال: iPhone 14 Pro Max / Galaxy S23"
                  value={deviceModel}
                  onChange={(e) => setDeviceModel(e.target.value)}
                  required
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, marginBottom: 5, color: '#CBD5E1' }}>
                  لون الجهاز
                </label>
                <Input
                  placeholder="أسود، أزرق، ذهبي..."
                  value={deviceColor}
                  onChange={(e) => setDeviceColor(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, marginBottom: 5, color: '#CBD5E1' }}>
                  رمز القفل أو النمط (Passcode / Pattern)
                </label>
                <Input
                  placeholder="رمز الفتح لاختبار وظائف الجهاز"
                  value={passcodePattern}
                  onChange={(e) => setPasscodePattern(e.target.value)}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, marginBottom: 5, color: '#CBD5E1' }}>
                  السيريال أو IMEI (اختياري)
                </label>
                <Input
                  placeholder="رقم الـ IMEI المكون من 15 رقم"
                  value={imeiSerial}
                  onChange={(e) => setImeiSerial(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* 3. العطل المشتكى منه والملحقات */}
          <div
            style={{
              backgroundColor: '#0B0E14',
              border: '1px solid #262E3D',
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: '#FFB800',
                marginBottom: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <AlertTriangle size={15} />
              <span>تفاصيل العطل والملحقات</span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 5, color: '#CBD5E1' }}>
                العطل المشتكى منه <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <textarea
                rows={2}
                value={reportedIssue}
                onChange={(e) => setReportedIssue(e.target.value)}
                placeholder="مثال: الشاشة لا تعمل وبها كسر، الجهاز يسخن ولا يشحن، قاطع باور..."
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  backgroundColor: '#161B22',
                  border: '1px solid #262E3D',
                  borderRadius: 8,
                  color: '#F0F6FC',
                  fontSize: 13,
                  outline: 'none',
                  resize: 'none',
                }}
                required
              />
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 5, color: '#CBD5E1' }}>
                حالة الجهاز الظاهرية (خدوش، كسور سابقة...)
              </label>
              <Input
                value={deviceCondition}
                onChange={(e) => setDeviceCondition(e.target.value)}
                placeholder="سليم مع علامات استخدام طبيعية"
              />
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 6, color: '#CBD5E1' }}>
                الملحقات المستلمة مع الهاتف:
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {ACCESSORY_OPTIONS.map((acc) => {
                  const isChecked = selectedAccessories.includes(acc);
                  return (
                    <button
                      key={acc}
                      type="button"
                      onClick={() => toggleAccessory(acc)}
                      style={{
                        padding: '5px 12px',
                        borderRadius: 20,
                        fontSize: 12,
                        fontWeight: 600,
                        border: `1px solid ${isChecked ? '#FFB800' : '#262E3D'}`,
                        backgroundColor: isChecked ? 'rgba(255, 184, 0, 0.15)' : '#161B22',
                        color: isChecked ? '#FFB800' : '#94A3B8',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {acc}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 4. الحساب المالي والعربون (الربط المالي الكامل) */}
          <div
            style={{
              backgroundColor: '#0B0E14',
              border: '1px solid #FFB800',
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: '#FFB800',
                marginBottom: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <DollarSign size={16} />
              <span>الحساب المالي، العربون وسند القبض</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 0.8fr', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, marginBottom: 5, color: '#CBD5E1' }}>
                  التكلفة المتفق عليها / التقديرية (ج.م)
                </label>
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  placeholder="مثال: 1000"
                  value={estimatedCostPounds}
                  onChange={(e) => setEstimatedCostPounds(e.target.value)}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, marginBottom: 5, color: '#34D399', fontWeight: 700 }}>
                  العربون المستلم مقدماً (ج.م)
                </label>
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  placeholder="مثال: 200"
                  value={depositAmountPounds}
                  onChange={(e) => setDepositAmountPounds(e.target.value)}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, marginBottom: 5, color: '#CBD5E1' }}>
                  فترة الضمان (أيام)
                </label>
                <Input
                  type="number"
                  min="0"
                  value={warrantyDays}
                  onChange={(e) => setWarrantyDays(e.target.value)}
                />
              </div>
            </div>

            {/* طريقة دفع العربون عند وجود عربون */}
            {depositAmount > 0 && (
              <div style={{ marginTop: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#CBD5E1', display: 'block', marginBottom: 8 }}>
                  طريقة تحصيل العربون:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => setDepositMethod('cash')}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 700,
                      backgroundColor: depositMethod === 'cash' ? 'rgba(52, 211, 153, 0.2)' : '#161B22',
                      border: `1.5px solid ${depositMethod === 'cash' ? '#34D399' : '#262E3D'}`,
                      color: depositMethod === 'cash' ? '#34D399' : '#94A3B8',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                  >
                    <Coins size={15} />
                    <span>نقدي (كاش)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDepositMethod('card')}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 700,
                      backgroundColor: depositMethod === 'card' ? 'rgba(96, 165, 250, 0.2)' : '#161B22',
                      border: `1.5px solid ${depositMethod === 'card' ? '#60A5FA' : '#262E3D'}`,
                      color: depositMethod === 'card' ? '#60A5FA' : '#94A3B8',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                  >
                    <CreditCard size={15} />
                    <span>بطاقة / فيزا</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDepositMethod('wallet')}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 700,
                      backgroundColor: depositMethod === 'wallet' ? 'rgba(245, 158, 11, 0.2)' : '#161B22',
                      border: `1.5px solid ${depositMethod === 'wallet' ? '#F59E0B' : '#262E3D'}`,
                      color: depositMethod === 'wallet' ? '#F59E0B' : '#94A3B8',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                  >
                    <Wallet size={15} />
                    <span>محفظة ذكية</span>
                  </button>
                </div>
              </div>
            )}

            {/* معاينة الحساب الحي */}
            <div
              style={{
                marginTop: 14,
                backgroundColor: '#161B22',
                border: '1px solid #262E3D',
                borderRadius: 10,
                padding: '12px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: 12, color: '#94A3B8' }}>المتبقي للتحصيل عند تسليم الجهاز:</div>
                <div style={{ fontSize: 11, color: '#34D399', marginTop: 2 }}>
                  التكلفة: {formatMoney(estimatedCost)} • العربون: {formatMoney(depositAmount)}
                </div>
              </div>
              <div style={{ fontSize: 20, fontWeight: 900, color: remainingPreview > 0 ? '#FFB800' : '#10B981' }}>
                {formatMoney(remainingPreview)}
              </div>
            </div>

            {/* إشعار الربط المالي */}
            <div
              style={{
                marginTop: 10,
                padding: '8px 12px',
                backgroundColor: 'rgba(255, 184, 0, 0.08)',
                border: '1px dashed #FFB800',
                borderRadius: 8,
                fontSize: 11,
                color: '#FFB800',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Info size={16} />
              <span>
                {depositAmount > 0
                  ? `سيتم تلقائياً إصدار فاتورة بيع رسمية للعربون بقيمة ${formatMoney(depositAmount)} وإدراجها في سجل الفواتير وحركات الخزينة وإجمالي اليوم.`
                  : 'استلام الجهاز بدون عربون مقدم، وسيتم تحصيل الحساب بالكامل عند التسليم.'}
              </span>
            </div>
          </div>

          {/* أزرار الإجراءات */}
          <div
            style={{
              marginTop: 10,
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 12,
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
                backgroundColor: '#FFB800',
                color: '#000000',
                fontWeight: 800,
                padding: '8px 22px',
              }}
            >
              <Wrench size={16} style={{ marginLeft: 6 }} />
              {isSubmitting ? 'جاري التسجيل...' : 'تسجيل أمر الصيانة وإصدار الإيصال'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
