import React, { useState, useEffect } from 'react';
import {
  Banknote,
  CreditCard,
  Layers,
  Smartphone,
  FileText,
  Coins,
  AlertCircle,
  CheckCircle2,
  User,
  UserPlus,
  Users,
  ShieldAlert,
  X,
} from 'lucide-react';
import { Modal } from '../../../components/common/Modal';
import { Button } from '../../../components/common/Button';
import { GlassIcon } from '../../../components/common/GlassIcon';
import { AppIcon } from '../../../components/common/AppIcon';
import { formatMoney } from '../../../../shared/utils/money';
import { CartLineItem } from '../types';
import { sounds } from '../../../lib/sounds';
import { useToast } from '../../../components/common/ToastContext';
import { MESSAGES } from '../../../lib/messages';
import { CustomerSelectModal } from './CustomerSelectModal';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  total: number; // بالقروش
  subtotal: number;
  discount: number;
  cart: CartLineItem[];
  customerId?: number | null;
  customerName?: string;
  onSelectCustomer?: (customer: { id: number; name: string } | null) => void;
  onSaleComplete: (sale: any, autoPrint: boolean) => void;
}

type PaymentMethodType = 'cash' | 'card' | 'wallet' | 'credit' | 'split';

const WALLET_PROVIDERS = [
  { id: 'vodafone_cash', label: 'فودافون كاش' },
  { id: 'instapay', label: 'إنستاباي (InstaPay)' },
  { id: 'orange_cash', label: 'أورنج كاش' },
  { id: 'etisalat_cash', label: 'اتصالات كاش' },
  { id: 'we_pay', label: 'وي باي (WE Pay)' },
  { id: 'other', label: 'أخرى' },
];

export function PaymentModal({
  isOpen,
  onClose,
  total,
  subtotal,
  discount,
  cart,
  customerId,
  customerName,
  onSelectCustomer,
  onSaleComplete,
}: PaymentModalProps): React.ReactElement | null {
  const { success: toastSuccess, error: toastError } = useToast();
  const [method, setMethod] = useState<PaymentMethodType>('cash');
  const [cashAmountStr, setCashAmountStr] = useState<string>('');
  const [cardAmountStr, setCardAmountStr] = useState<string>('');
  const [walletAmountStr, setWalletAmountStr] = useState<string>('');
  const [creditAmountStr, setCreditAmountStr] = useState<string>('');

  const [selectedWalletProvider, setSelectedWalletProvider] = useState<string>('vodafone_cash');
  const [walletReference, setWalletReference] = useState<string>('');

  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(customerId || null);
  const [isCustomerSelectOpen, setIsCustomerSelectOpen] = useState(false);

  const [customerData, setCustomerData] = useState<{
    id: number;
    name: string;
    phone?: string;
    balance: number;
    credit_limit: number;
  } | null>(null);

  const [notes, setNotes] = useState<string>('');
  const [printReceipt, setPrintReceipt] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // تحويل المبلغ الكلي إلى جنيه للعرض والإدخال
  const totalInUnits = total / 100;

  // مزامنة العميل المختار من شاشة البيع عند فتح النافذة
  useEffect(() => {
    if (isOpen) {
      setSelectedCustomerId(customerId || null);
    }
  }, [isOpen, customerId]);

  // جلب بيانات العميل المختار عند تغيره
  useEffect(() => {
    if (isOpen && selectedCustomerId) {
      const electron = (window as any).electron;
      if (electron?.getCustomer) {
        electron
          .getCustomer(selectedCustomerId)
          .then((res: any) => {
            if (res?.success && res.data) {
              setCustomerData(res.data);
            }
          })
          .catch(() => {
            setCustomerData(null);
          });
      }
    } else {
      setCustomerData(null);
    }
  }, [isOpen, selectedCustomerId]);

  useEffect(() => {
    if (isOpen) {
      setMethod('cash');
      setCashAmountStr(totalInUnits.toFixed(2));
      setCardAmountStr('0');
      setWalletAmountStr('0');
      setCreditAmountStr('0');
      setSelectedWalletProvider('vodafone_cash');
      setWalletReference('');
      setNotes('');
      setError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, totalInUnits]);

  if (!isOpen) return null;

  // حساب المبالغ
  const parsedCash = parseFloat(cashAmountStr) || 0;
  const parsedCard = parseFloat(cardAmountStr) || 0;
  const parsedWallet = parseFloat(walletAmountStr) || 0;
  const parsedCredit = parseFloat(creditAmountStr) || 0;

  let totalPaid = 0;
  if (method === 'cash') totalPaid = parsedCash;
  else if (method === 'card') totalPaid = totalInUnits;
  else if (method === 'wallet') totalPaid = totalInUnits;
  else if (method === 'credit') totalPaid = totalInUnits;
  else totalPaid = parsedCash + parsedCard + parsedWallet + parsedCredit;

  const changeDue = Math.max(0, totalPaid - totalInUnits);
  const remainingDue = Math.max(0, totalInUnits - totalPaid);

  const isCreditAllowed = Boolean(selectedCustomerId);
  const isCreditOverLimit =
    customerData &&
    method === 'credit' &&
    customerData.credit_limit > 0 &&
    customerData.balance + total > customerData.credit_limit;

  const isSplitCreditOverLimit =
    customerData &&
    method === 'split' &&
    parsedCredit > 0 &&
    customerData.credit_limit > 0 &&
    customerData.balance + Math.round(parsedCredit * 100) > customerData.credit_limit;

  const isPaymentValid =
    (method === 'credit' ? isCreditAllowed : true) &&
    (method === 'split' && parsedCredit > 0 ? isCreditAllowed : true) &&
    totalPaid >= totalInUnits - 0.001;

  // أزرار الفئات النقدية السريعة
  const quickCashOptions = [
    { label: 'المبلغ بالضبط', val: totalInUnits },
    { label: '+10', val: Math.ceil(totalInUnits / 10) * 10 },
    { label: '+50', val: Math.ceil(totalInUnits / 50) * 50 || 50 },
    { label: '+100', val: Math.ceil(totalInUnits / 100) * 100 || 100 },
    { label: '+200', val: Math.ceil(totalInUnits / 200) * 200 || 200 },
  ];

  const handleQuickCash = (val: number) => {
    sounds.playClick();
    setCashAmountStr(val.toFixed(2));
    setError(null);
  };

  const handleCustomerChosen = (cust: any) => {
    setSelectedCustomerId(cust.id);
    setCustomerData(cust);
    onSelectCustomer?.({ id: cust.id, name: cust.name });
    setIsCustomerSelectOpen(false);
    setError(null);
  };

  const handleCustomerCleared = () => {
    sounds.playClick();
    setSelectedCustomerId(null);
    setCustomerData(null);
    onSelectCustomer?.(null);
  };

  const handleSubmitPayment = async () => {
    if (isSubmitting) return;

    if (method === 'credit' && !selectedCustomerId) {
      sounds.playError();
      setError('يرجى اختيار أو تسجيل عميل لاعتماد البيع بالآجل');
      return;
    }

    if (method === 'split' && parsedCredit > 0 && !selectedCustomerId) {
      sounds.playError();
      setError('لا يمكن إدراج جزء آجل دون اختيار أو تسجيل عميل');
      return;
    }

    if (!isPaymentValid) {
      sounds.playError();
      setError('المبلغ المدفوع غير كافٍ لتغطية إجمالي الفاتورة');
      return;
    }

    if (cart.length === 0) {
      sounds.playError();
      setError(MESSAGES.CART_EMPTY);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const electron = (window as any).electron;

      // تجميع طرق الدفع بالقروش
      const payments = [];
      const totalPiasters = Math.round(totalInUnits * 100);

      if (method === 'cash') {
        payments.push({
          method: 'cash' as const,
          amount: totalPiasters,
        });
      } else if (method === 'card') {
        payments.push({
          method: 'card' as const,
          amount: totalPiasters,
        });
      } else if (method === 'wallet') {
        const providerObj = WALLET_PROVIDERS.find((p) => p.id === selectedWalletProvider);
        const providerName = providerObj ? providerObj.label : 'محفظة إلكترونية';
        const noteDetail = walletReference.trim() ? `${providerName} (${walletReference.trim()})` : providerName;
        payments.push({
          method: 'wallet' as const,
          amount: totalPiasters,
          note: noteDetail,
        });
      } else if (method === 'credit') {
        payments.push({
          method: 'credit' as const,
          amount: totalPiasters,
        });
      } else {
        // split
        if (parsedCash > 0) {
          payments.push({
            method: 'cash' as const,
            amount: Math.round(parsedCash * 100),
          });
        }
        if (parsedCard > 0) {
          payments.push({
            method: 'card' as const,
            amount: Math.round(parsedCard * 100),
          });
        }
        if (parsedWallet > 0) {
          const providerObj = WALLET_PROVIDERS.find((p) => p.id === selectedWalletProvider);
          const providerName = providerObj ? providerObj.label : 'محفظة';
          payments.push({
            method: 'wallet' as const,
            amount: Math.round(parsedWallet * 100),
            note: providerName,
          });
        }
        if (parsedCredit > 0) {
          payments.push({
            method: 'credit' as const,
            amount: Math.round(parsedCredit * 100),
          });
        }
      }

      const salePayload = {
        customer_id: selectedCustomerId || null,
        items: cart.map((item) => ({
          variant_id: item.variantId,
          qty: item.qty,
          unit_price: item.unitPrice,
          discount_amount: item.discount || 0,
        })),
        payments,
        discount_amount: discount || 0,
        notes: notes.trim() || null,
      };

      if (!electron?.createSale) {
        sounds.playError();
        setError('تعذر الاتصال بالخدمة الرئيسية لتسجيل الفاتورة');
        return;
      }

      const res = await electron.createSale(salePayload);
      if (res?.success) {
        sounds.playSaleSuccess();
        sounds.playCashRegister();
        toastSuccess(MESSAGES.SALE_SUCCESS);
        onSaleComplete(res.data, printReceipt);
        onClose();
      } else {
        const errorMsg = res?.error?.message || res?.error || MESSAGES.UNEXPECTED_ERROR;
        sounds.playError();
        setError(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));
      }
    } catch (err: any) {
      sounds.playError();
      setError(err.message || MESSAGES.UNEXPECTED_ERROR);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="إتمام عملية الدفع وإصدار الفاتورة"
      icon={<GlassIcon icon={Coins} size="sm" variant="brand" />}
      width={600}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, direction: 'rtl' }}>
        {/* ملخص المبلغ الكلي */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(255, 184, 0, 0.1) 0%, rgba(22, 27, 34, 0.9) 100%)',
            border: '1px solid rgba(255, 184, 0, 0.3)',
            borderRadius: 14,
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: 13, color: '#94A3B8', fontWeight: 600 }}>المبلغ الإجمالي المستحق</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: '#FFB800' }}>
              {formatMoney(total)}
            </div>
          </div>

          <div style={{ textAlign: 'left', fontSize: 13, color: '#CBD5E1' }}>
            <div>عدد الأصناف: {cart.length}</div>
            {discount > 0 && (
              <div style={{ color: '#EF4444', fontWeight: 700 }}>
                الخصم: {formatMoney(discount)}-
              </div>
            )}
          </div>
        </div>

        {/* اختيار وسيلة الدفع - 5 أزرار رئيسية */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
          {/* كاش */}
          <button
            type="button"
            onClick={() => {
              sounds.playClick();
              setMethod('cash');
              setCashAmountStr(totalInUnits.toFixed(2));
              setError(null);
            }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              padding: '12px 6px',
              borderRadius: 12,
              border: method === 'cash' ? '2px solid #FFB800' : '1px solid #262E3D',
              backgroundColor: method === 'cash' ? 'rgba(255, 184, 0, 0.16)' : '#0B0E14',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <GlassIcon icon={Banknote} size="sm" variant="gold" active={method === 'cash'} />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#F8FAFC' }}>نقدي (كاش)</span>
          </button>

          {/* فيزا / بطاقة */}
          <button
            type="button"
            onClick={() => {
              sounds.playClick();
              setMethod('card');
              setCardAmountStr(totalInUnits.toFixed(2));
              setError(null);
            }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              padding: '12px 6px',
              borderRadius: 12,
              border: method === 'card' ? '2px solid #FFB800' : '1px solid #262E3D',
              backgroundColor: method === 'card' ? 'rgba(255, 184, 0, 0.16)' : '#0B0E14',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <GlassIcon icon={CreditCard} size="sm" variant="gold" active={method === 'card'} />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#F8FAFC' }}>بطاقة بنكية</span>
          </button>

          {/* محفظة ذكية */}
          <button
            type="button"
            onClick={() => {
              sounds.playClick();
              setMethod('wallet');
              setError(null);
            }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              padding: '12px 6px',
              borderRadius: 12,
              border: method === 'wallet' ? '2px solid #FFB800' : '1px solid #262E3D',
              backgroundColor: method === 'wallet' ? 'rgba(255, 184, 0, 0.16)' : '#0B0E14',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <GlassIcon icon={Smartphone} size="sm" variant="gold" active={method === 'wallet'} />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#F8FAFC' }}>محفظة ذكية</span>
          </button>

          {/* آجل (على الحساب) */}
          <button
            type="button"
            onClick={() => {
              sounds.playClick();
              setMethod('credit');
              setError(null);
            }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              padding: '12px 6px',
              borderRadius: 12,
              border: method === 'credit' ? '2px solid #FFB800' : '1px solid #262E3D',
              backgroundColor: method === 'credit' ? 'rgba(255, 184, 0, 0.16)' : '#0B0E14',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <GlassIcon icon={FileText} size="sm" variant="gold" active={method === 'credit'} />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#F8FAFC' }}>آجل (دين)</span>
          </button>

          {/* مجزأ / مختلط */}
          <button
            type="button"
            onClick={() => {
              sounds.playClick();
              setMethod('split');
              setError(null);
            }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              padding: '12px 6px',
              borderRadius: 12,
              border: method === 'split' ? '2px solid #FFB800' : '1px solid #262E3D',
              backgroundColor: method === 'split' ? 'rgba(255, 184, 0, 0.16)' : '#0B0E14',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <GlassIcon icon={Layers} size="sm" variant="gold" active={method === 'split'} />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#F8FAFC' }}>دفع مجزأ</span>
          </button>
        </div>

        {/* حقول الدفع النقدي */}
        {method === 'cash' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#F8FAFC' }}>
                المبلغ المستلم نقداً من العميل:
              </label>
              <input
                type="number"
                step="any"
                value={cashAmountStr}
                onChange={(e) => {
                  setCashAmountStr(e.target.value);
                  setError(null);
                }}
                className="in"
                style={{ fontSize: 18, fontWeight: 700, height: 44, backgroundColor: '#0B0E14', color: '#FFB800', border: '1px solid #262E3D' }}
                autoFocus
              />
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {quickCashOptions.map((opt, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleQuickCash(opt.val)}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 8,
                    border: '1px solid #262E3D',
                    backgroundColor: '#0B0E14',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    color: '#FFB800',
                  }}
                >
                  {opt.label} ({opt.val.toFixed(2)})
                </button>
              ))}
            </div>
          </div>
        )}

        {/* خيارات المحفظة الإلكترونية */}
        {method === 'wallet' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#F8FAFC' }}>
                نوع المحفظة أو وسيلة التحويل:
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {WALLET_PROVIDERS.map((prov) => (
                  <button
                    key={prov.id}
                    type="button"
                    onClick={() => setSelectedWalletProvider(prov.id)}
                    style={{
                      padding: '8px 6px',
                      borderRadius: 8,
                      border: selectedWalletProvider === prov.id ? '2px solid #FFB800' : '1px solid #262E3D',
                      backgroundColor: selectedWalletProvider === prov.id ? 'rgba(255, 184, 0, 0.12)' : '#0B0E14',
                      color: selectedWalletProvider === prov.id ? '#FFB800' : '#E2E8F0',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {prov.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#F8FAFC' }}>
                رقم هاتف العميل المحوّل منه أو كود العملية (اختياري):
              </label>
              <input
                type="text"
                value={walletReference}
                onChange={(e) => setWalletReference(e.target.value)}
                placeholder="مثال: 01012345678 أو كود التحويل"
                className="in"
                style={{ fontSize: 14, height: 40, backgroundColor: '#0B0E14', border: '1px solid #262E3D' }}
              />
            </div>
          </div>
        )}

        {/* تفاصيل البيع بالآجل والتحقق من حساب العميل */}
        {method === 'credit' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {customerData ? (
              <div
                style={{
                  backgroundColor: '#161B22',
                  border: isCreditOverLimit ? '1px solid #EF4444' : '1px solid #262E3D',
                  borderRadius: 12,
                  padding: 14,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <User size={18} color="#FFB800" />
                    <span style={{ fontWeight: 700, color: '#F8FAFC' }}>{customerData.name}</span>
                    {customerData.phone && (
                      <span style={{ fontSize: 12, color: '#94A3B8', direction: 'ltr' }}>{customerData.phone}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => {
                        sounds.playClick();
                        setIsCustomerSelectOpen(true);
                      }}
                      style={{
                        background: 'rgba(255, 184, 0, 0.15)',
                        border: '1px solid rgba(255, 184, 0, 0.3)',
                        borderRadius: 6,
                        color: '#FFB800',
                        fontSize: 11.5,
                        fontWeight: 700,
                        padding: '3px 8px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <Users size={13} />
                      <span>تغيير</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleCustomerCleared}
                      style={{
                        background: 'rgba(239, 68, 68, 0.12)',
                        border: '1px solid rgba(239, 68, 68, 0.25)',
                        borderRadius: 6,
                        color: '#EF4444',
                        fontSize: 11.5,
                        fontWeight: 600,
                        padding: '3px 8px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <X size={13} />
                      <span>إلغاء</span>
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 4 }}>
                  <div style={{ background: '#0B0E14', padding: '8px 12px', borderRadius: 8 }}>
                    <div style={{ fontSize: 11, color: '#94A3B8' }}>المديونية السابقة:</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: customerData.balance > 0 ? '#EF4444' : '#10B981' }}>
                      {formatMoney(customerData.balance)}
                    </div>
                  </div>

                  <div style={{ background: '#0B0E14', padding: '8px 12px', borderRadius: 8 }}>
                    <div style={{ fontSize: 11, color: '#94A3B8' }}>الحد الائتماني المسموح:</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#F8FAFC' }}>
                      {customerData.credit_limit > 0 ? formatMoney(customerData.credit_limit) : 'غير محدد'}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 4,
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: isCreditOverLimit ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.12)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 600, color: isCreditOverLimit ? '#EF4444' : '#10B981' }}>
                    {isCreditOverLimit ? 'تنبيه: يتجاوز الحد الائتماني بمقدار:' : 'الرصيد بعد إضافة الفاتورة:'}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: isCreditOverLimit ? '#EF4444' : '#10B981' }}>
                    {isCreditOverLimit
                      ? formatMoney((customerData.balance + total) - customerData.credit_limit)
                      : formatMoney(customerData.balance + total)}
                  </span>
                </div>
              </div>
            ) : (
              <div
                style={{
                  backgroundColor: 'rgba(255, 184, 0, 0.08)',
                  border: '1px dashed rgba(255, 184, 0, 0.4)',
                  borderRadius: 12,
                  padding: '16px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  alignItems: 'center',
                  textAlign: 'center',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#FFB800' }}>
                  <Users size={22} />
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#F8FAFC' }}>
                    البيع بالآجل يتطلب تحديد عميل مسجل
                  </span>
                </div>
                <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>
                  يرجى اختيار عميل من المسجلين مسبقاً أو تسجيل عميل جديد لتسجيل مديونية هذه الفاتورة عليه
                </p>
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => {
                    sounds.playClick();
                    setIsCustomerSelectOpen(true);
                  }}
                  style={{ height: 40, gap: 8, fontSize: 13, fontWeight: 700, padding: '0 18px' }}
                >
                  <UserPlus size={16} />
                  <span>اختيار أو تسجيل عميل الآن</span>
                </Button>
              </div>
            )}
          </div>
        )}

        {/* الدفع المجزأ (المختلط) */}
        {method === 'split' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                كاش (نقدي):
              </label>
              <input
                type="number"
                step="any"
                value={cashAmountStr}
                onChange={(e) => setCashAmountStr(e.target.value)}
                className="in"
                style={{ fontSize: 15, fontWeight: 700, height: 38 }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                بطاقة (فيزا):
              </label>
              <input
                type="number"
                step="any"
                value={cardAmountStr}
                onChange={(e) => setCardAmountStr(e.target.value)}
                className="in"
                style={{ fontSize: 15, fontWeight: 700, height: 38 }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                محفظة إلكترونية:
              </label>
              <input
                type="number"
                step="any"
                value={walletAmountStr}
                onChange={(e) => setWalletAmountStr(e.target.value)}
                className="in"
                style={{ fontSize: 15, fontWeight: 700, height: 38 }}
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 600 }}>
                  آجل (على الحساب):
                </label>
                {selectedCustomerId ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: '#FFB800', fontWeight: 600 }}>
                      {customerData?.name || 'عميل محدد'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        sounds.playClick();
                        setIsCustomerSelectOpen(true);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#94A3B8',
                        cursor: 'pointer',
                        fontSize: 10,
                        textDecoration: 'underline',
                      }}
                    >
                      تغيير
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      sounds.playClick();
                      setIsCustomerSelectOpen(true);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#FFB800',
                      cursor: 'pointer',
                      fontSize: 11,
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2,
                    }}
                  >
                    <UserPlus size={12} />
                    <span>تحديد عميل</span>
                  </button>
                )}
              </div>
              <input
                type="number"
                step="any"
                disabled={!selectedCustomerId}
                placeholder={!selectedCustomerId ? 'اختر عميل أولاً للتفعيل' : '0'}
                value={creditAmountStr}
                onChange={(e) => setCreditAmountStr(e.target.value)}
                className="in"
                style={{ fontSize: 15, fontWeight: 700, height: 38, opacity: !selectedCustomerId ? 0.6 : 1 }}
              />
            </div>
          </div>
        )}

        {/* عرض المتبقي للعميل أو العجز */}
        {method !== 'credit' && method !== 'wallet' && (
          <div
            style={{
              backgroundColor: remainingDue > 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
              border: remainingDue > 0 ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: 12,
              padding: '10px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: remainingDue > 0 ? '#EF4444' : '#10B981' }}>
              {remainingDue > 0 ? 'المتبقي لتحصيل الفاتورة:' : 'المتبقي للعميل (الفكة):'}
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: remainingDue > 0 ? '#EF4444' : '#10B981' }}>
              {remainingDue > 0 ? `${remainingDue.toFixed(2)} ج.م` : `${changeDue.toFixed(2)} ج.م`}
            </div>
          </div>
        )}

        {/* خيار طباعة الإيصال */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={printReceipt}
              onChange={(e) => setPrintReceipt(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: '#FFB800' }}
            />
            <AppIcon name="print" size={17} color="#FFB800" />
            <span>طباعة الإيصال الحراري تلقائياً</span>
          </label>
        </div>

        {error && (
          <div
            className="animate-slide-up"
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              color: '#EF4444',
              padding: '10px 14px',
              borderRadius: 8,
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <AppIcon name="error" size={17} />
            <span>{error}</span>
          </div>
        )}

        {/* أزرار الإجراءات */}
        <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
          <Button
            variant="success"
            onClick={handleSubmitPayment}
            disabled={isSubmitting || !isPaymentValid}
            isLoading={isSubmitting}
            preventDoubleClick
            style={{
              flex: 1,
              height: 46,
              fontSize: 15,
              fontWeight: 700,
              gap: 8,
            }}
          >
            <AppIcon name="receipt" size={18} />
            <span>تأكيد العملية ومعاينة الفاتورة</span>
          </Button>

          <Button
            variant="secondary"
            onClick={() => {
              sounds.playClick();
              onClose();
            }}
            disabled={isSubmitting}
            style={{ width: 100, height: 46 }}
          >
            إلغاء
          </Button>
        </div>
      </div>

      {/* نافذة اختيار أو تسجيل عميل من داخل نافذة الدفع */}
      <CustomerSelectModal
        isOpen={isCustomerSelectOpen}
        onClose={() => setIsCustomerSelectOpen(false)}
        onSelectCustomer={handleCustomerChosen}
        currentCustomerId={selectedCustomerId}
        zIndex={1200}
      />
    </Modal>
  );
}

export default PaymentModal;
