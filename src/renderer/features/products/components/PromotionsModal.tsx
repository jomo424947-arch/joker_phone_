import React, { useState, useEffect } from 'react';
import { Sparkles, Plus, Trash2, CheckCircle2, Calendar, Percent, Tag, Gift, ToggleLeft, ToggleRight } from 'lucide-react';
import { Modal } from '../../../components/common/Modal';
import { Button } from '../../../components/common/Button';
import { Input } from '../../../components/common/Input';
import { GlassIcon } from '../../../components/common/GlassIcon';
import { sounds } from '../../../lib/sounds';
import { useToast } from '../../../components/common/ToastContext';
import { Promotion } from '../../../../shared/types/promotions.types';
import { formatMoney } from '../../../../shared/utils/money';

interface PromotionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PromotionsModal({ isOpen, onClose }: PromotionsModalProps): React.ReactElement | null {
  const { success: toastSuccess, error: toastError } = useToast();
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // حقول إضافة عرض جديد
  const [name, setName] = useState('');
  const [type, setType] = useState<'percentage' | 'fixed_amount' | 'bogo'>('percentage');
  const [discountValue, setDiscountValue] = useState('15');
  const [minQty, setMinQty] = useState('1');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadPromotions();
    }
  }, [isOpen]);

  const loadPromotions = async () => {
    setIsLoading(true);
    try {
      const electron = (window as any).electron;
      if (electron?.listPromotions) {
        const res = await electron.listPromotions(false);
        if (res?.success && Array.isArray(res.data)) {
          setPromotions(res.data);
        }
      }
    } catch (err: any) {
      toastError(err.message || 'تعذر تحميل العروض');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toastError('يرجى كتابة اسم العرض الترويجي');
      return;
    }

    const val = parseFloat(discountValue);
    if (isNaN(val) || val <= 0) {
      toastError('يرجى تحديد قيمة خصم صحيحة');
      return;
    }

    setIsLoading(true);
    try {
      const electron = (window as any).electron;
      const payload = {
        name: name.trim(),
        type,
        discount_value: type === 'percentage' ? Math.round(val) : Math.round(val * 100),
        min_qty: parseInt(minQty, 10) || 1,
        start_date: startDate || null,
        end_date: endDate || null,
        notes: notes.trim() || null,
        is_active: 1,
      };

      if (electron?.createPromotion) {
        await electron.createPromotion(payload);
      }

      sounds.playSaleSuccess();
      toastSuccess('تم تفعيل وحفظ العرض الترويجي بنجاح');
      setIsAdding(false);
      setName('');
      setDiscountValue('15');
      setMinQty('1');
      setStartDate('');
      setEndDate('');
      setNotes('');
      loadPromotions();
    } catch (err: any) {
      sounds.playError();
      toastError(err.message || 'تعذر إنشاء العرض');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: number, promoName: string) => {
    if (!window.confirm(`هل أنت متأكد من حذف العرض "${promoName}"؟`)) return;

    try {
      const electron = (window as any).electron;
      if (electron?.deletePromotion) {
        await electron.deletePromotion(id);
      }
      sounds.playClick();
      toastSuccess('تم حذف العرض بنجاح');
      loadPromotions();
    } catch (err: any) {
      toastError(err.message || 'تعذر حذف العرض');
    }
  };

  const handleToggleActive = async (promo: Promotion) => {
    try {
      const electron = (window as any).electron;
      if (electron?.updatePromotion) {
        await electron.updatePromotion(promo.id, {
          is_active: promo.is_active === 1 ? 0 : 1,
        });
      }
      sounds.playClick();
      loadPromotions();
    } catch (err: any) {
      toastError(err.message || 'تعذر تحديث حالة العرض');
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="إدارة العروض الترويجية والخصومات الخاصة"
      icon={<GlassIcon icon={Sparkles} size="sm" variant="gold" />}
      width={780}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, direction: 'rtl' }}>
        {/* شريط الإجراء العلوي */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            يمكنك إنشاء عروض نسب مئوية أو مبالغ ثابتة أو اشترِ 1 واحصل على 1 مجاناً، وتُطبق تلقائياً على الكاشير.
          </div>
          <Button
            variant={isAdding ? 'secondary' : 'primary'}
            onClick={() => {
              sounds.playClick();
              setIsAdding(!isAdding);
            }}
            style={{ height: 38, padding: '0 16px', fontSize: 13 }}
          >
            {isAdding ? 'عرض قائمة العروض' : '+ إضافة عرض ترويجي'}
          </Button>
        </div>

        {isAdding ? (
          /* نموذج إضافة عرض جديد */
          <form
            onSubmit={handleCreate}
            style={{
              backgroundColor: '#1C222D',
              padding: 16,
              borderRadius: 10,
              border: '1px solid #262E3D',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 14, color: '#FFB800' }}>
              تفاصيل العرض الترويجي الجديد
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>
                اسم العرض الترويجي *
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: خصم 20% على باقة العيد، عرض اشتر 1 واحصل على 1"
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>
                  نوع العرض
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as any)}
                  style={{
                    width: '100%',
                    height: 42,
                    borderRadius: 8,
                    border: '1.5px solid #262E3D',
                    padding: '0 10px',
                    fontSize: 13,
                    backgroundColor: '#0B0E14',
                    color: '#F8FAFC',
                  }}
                >
                  <option value="percentage">نسبة مئوية (%)</option>
                  <option value="fixed_amount">مبلغ خصم ثابت (ج.م)</option>
                  <option value="bogo">اشترِ واحصل على هدية (BOGO)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>
                  {type === 'percentage'
                    ? 'نسبة الخصم (%) *'
                    : type === 'fixed_amount'
                    ? 'قيمة الخصم (ج.م) *'
                    : 'الكمية المطلوبة للهدية'}
                </label>
                <Input
                  type="number"
                  step="any"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  placeholder={type === 'percentage' ? 'مثال: 20' : 'مثال: 50'}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>
                  الحد الأدنى للكمية لتفعيل العرض
                </label>
                <Input
                  type="number"
                  value={minQty}
                  onChange={(e) => setMinQty(e.target.value)}
                  placeholder="1"
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>
                  تاريخ البداية (اختياري)
                </label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>
                  تاريخ الانتهاء (اختياري)
                </label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
              <Button type="submit" variant="primary" isLoading={isLoading} style={{ height: 42, flex: 1 }}>
                <CheckCircle2 size={16} />
                <span>حفظ وتفعيل العرض الآن</span>
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsAdding(false)}
                style={{ height: 42, width: 100 }}
              >
                إلغاء
              </Button>
            </div>
          </form>
        ) : (
          /* جدول استعراض العروض */
          <div style={{ minHeight: 280, maxHeight: 380, overflowY: 'auto' }}>
            {promotions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '50px 0', color: 'var(--text-muted)' }}>
                لا توجد عروض ترويجية مسجلة حالياً. اضغط على "+ إضافة عرض ترويجي" لإنشاء عرضك الأول.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#1C222D', borderBottom: '1.5px solid #262E3D', color: '#94A3B8' }}>
                    <th style={{ padding: '10px 12px' }}>اسم العرض</th>
                    <th style={{ padding: '10px 12px' }}>نوع الخصم</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center' }}>القيمة</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center' }}>الحد الأدنى</th>
                    <th style={{ padding: '10px 12px' }}>فترة السريان</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center' }}>الحالة</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center' }}>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {promotions.map((p) => {
                    const isActive = p.is_active === 1;
                    return (
                      <tr key={p.id} style={{ borderBottom: '1px solid #262E3D' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: '#F8FAFC' }}>
                          {p.name}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span
                            style={{
                              backgroundColor: 'rgba(255, 184, 0, 0.15)',
                              color: '#FFB800',
                              padding: '2px 8px',
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 600,
                            }}
                          >
                            {p.type === 'percentage'
                              ? 'نسبة مئوية'
                              : p.type === 'fixed_amount'
                              ? 'مبلغ ثابت'
                              : 'اشتر X واحصل على Y'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 800 }}>
                          {p.type === 'percentage'
                            ? `${p.discount_value}%`
                            : p.type === 'fixed_amount'
                            ? formatMoney(p.discount_value)
                            : `قطعة هدية لكل ${p.min_qty}`}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          {p.min_qty} قطع
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: 11, color: 'var(--text-muted)' }}>
                          {p.start_date || p.end_date
                            ? `${p.start_date || 'الآن'} إلى ${p.end_date || 'مفتوح'}`
                            : 'سارٍ دائماً'}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => handleToggleActive(p)}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              color: isActive ? '#1B5E20' : '#757575',
                              fontWeight: 700,
                              fontSize: 12,
                            }}
                          >
                            {isActive ? <ToggleRight size={22} color="#2E7D32" /> : <ToggleLeft size={22} color="#9E9E9E" />}
                            <span>{isActive ? 'نشط' : 'متوقف'}</span>
                          </button>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => handleDelete(p.id, p.name)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#C62828',
                              cursor: 'pointer',
                              padding: 4,
                              borderRadius: 4,
                            }}
                            title="حذف العرض"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 10, borderTop: '1px solid var(--border-light)' }}>
          <Button variant="secondary" onClick={onClose} style={{ height: 38, padding: '0 24px' }}>
            إغلاق
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default PromotionsModal;
