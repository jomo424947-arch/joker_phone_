import React, { useState, useEffect } from 'react';
import {
  Coins,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Lock,
  Unlock,
  Plus,
  Minus,
  CheckCircle2,
  Printer,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Modal } from '../../components/common/Modal';
import { GlassIcon } from '../../components/common/GlassIcon';
import { formatMoney } from '../../../shared/utils/money';
import { sounds } from '../../lib/sounds';
import { useToast } from '../../components/common/ToastContext';
import { MESSAGES } from '../../lib/messages';

interface CashMovement {
  id: number;
  type: 'sale' | 'expense' | 'deposit' | 'withdrawal' | 'refund';
  amount: number;
  note?: string;
  created_at: string;
}

export function CashScreen(): React.ReactElement {
  const { success: toastSuccess, error: toastError } = useToast();
  const [activeShift, setActiveShift] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [movements, setMovements] = useState<CashMovement[]>([]);

  // فتح وردية جديدة
  const [newOpeningCashStr, setNewOpeningCashStr] = useState('500.00');

  // نوافذ العمليات
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isCloseShiftModalOpen, setIsCloseShiftModalOpen] = useState(false);

  // حقول المصروف
  const [expenseAmountStr, setExpenseAmountStr] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('نثريات وضيافة');
  const [expenseNotes, setExpenseNotes] = useState('');

  // حقول الإيداع
  const [depositAmountStr, setDepositAmountStr] = useState('');
  const [depositReason, setDepositReason] = useState('تغذية فكة إضافية للدرج');

  // حقول إغلاق الوردية
  const [countedCashStr, setCountedCashStr] = useState('');
  const [closeNotes, setCloseNotes] = useState('');

  const fetchShiftData = async () => {
    setIsLoading(true);
    try {
      const electron = (window as any).electron;
      if (!electron) return;

      if (electron.getActiveShift) {
        const shiftRes = await electron.getActiveShift();
        if (shiftRes?.success && shiftRes.data) {
          setActiveShift(shiftRes.data);

          // جلب حركات النقدية للوردية
          if (electron.getCashMovements) {
            const movRes = await electron.getCashMovements({ shift_id: shiftRes.data.id });
            if (movRes?.success && Array.isArray(movRes.data)) {
              setMovements(movRes.data);
            } else {
              setMovements([]);
            }
          }
        } else {
          setActiveShift(null);
          setMovements([]);
        }
      }
    } catch (err: any) {
      console.error(err);
      toastError('تعذر جلب بيانات الوردية والخزنة');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchShiftData();
  }, []);

  // حساب الإجماليات من الحركات الفعلية
  const openingBalance = activeShift?.opening_balance || 0;

  const totalSalesCash = movements
    .filter((m) => m.type === 'sale')
    .reduce((sum, m) => sum + (m.amount || 0), 0);

  const totalExpenses = movements
    .filter((m) => m.type === 'expense' || m.type === 'withdrawal' || m.type === 'refund')
    .reduce((sum, m) => sum + Math.abs(m.amount || 0), 0);

  const totalDeposits = movements
    .filter((m) => m.type === 'deposit' && m.note !== 'رصيد افتتاحي للوردية')
    .reduce((sum, m) => sum + (m.amount || 0), 0);

  // إجمالي نقدية الدرج الفعلية المحسوبة
  const currentDrawerCash = movements.reduce((sum, m) => sum + (m.amount || 0), 0);

  // فتح وردية جديدة
  const handleOpenShift = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(newOpeningCashStr);
    if (isNaN(val) || val < 0) {
      sounds.playError();
      toastError('يرجى إدخال رصيد بداية صحيح للوردية');
      return;
    }

    try {
      const electron = (window as any).electron;
      const res = await electron.openShift(1, Math.round(val * 100), 'بداية وردية جديدة');
      if (res?.success) {
        sounds.playSaleSuccess();
        toastSuccess('تم افتتاح الوردية بنجاح');
        fetchShiftData();
      } else {
        throw new Error(res?.error || 'فشل فتح الوردية');
      }
    } catch (err: any) {
      sounds.playError();
      toastError(err.message || 'حدث خطأ أثناء فتح الوردية');
    }
  };

  // فتح الدرج
  const handleOpenDrawer = async () => {
    try {
      const electron = (window as any).electron;
      await electron?.openCashDrawer?.(activeShift?.id, 1, 'فتح يدوي من الشاشة');
      sounds.playCashRegister();
      toastSuccess('تم إرسال أمر فتح درج النقدية');
    } catch {
      toastError('تعذر فتح درج النقدية');
    }
  };

  // تسجيل مصروف
  const handleRecordExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(expenseAmountStr);
    if (isNaN(val) || val <= 0) {
      sounds.playError();
      toastError('يرجى إدخال مبلغ مصروف صحيح');
      return;
    }

    const piasters = Math.round(val * 100);
    if (piasters > currentDrawerCash) {
      sounds.playError();
      toastError('رصيد الدرج النقدي الحالي غير كافٍ لصرف هذا المبلغ');
      return;
    }

    try {
      const electron = (window as any).electron;
      const res = await electron.recordExpense({
        shift_id: activeShift.id,
        user_id: 1,
        category: expenseCategory,
        amount: piasters,
        note: expenseNotes.trim() || undefined,
      });

      if (res?.success) {
        sounds.playSaleSuccess();
        toastSuccess('تم قيد المصروف وخصمه من الدرج بنجاح');
        setIsExpenseModalOpen(false);
        setExpenseAmountStr('');
        setExpenseNotes('');
        fetchShiftData();
      } else {
        throw new Error(res?.error || 'فشل تسجيل المصروف');
      }
    } catch (err: any) {
      sounds.playError();
      toastError(err.message || 'حدث خطأ أثناء تسجيل المصروف');
    }
  };

  // تسجيل إيداع
  const handleRecordDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(depositAmountStr);
    if (isNaN(val) || val <= 0) {
      sounds.playError();
      toastError('يرجى إدخال مبلغ إيداع صحيح');
      return;
    }

    try {
      const electron = (window as any).electron;
      const res = await electron.depositCash(
        activeShift.id,
        1,
        Math.round(val * 100),
        depositReason.trim()
      );

      if (res?.success) {
        sounds.playSaleSuccess();
        toastSuccess('تم تسجيل الإيداع وتغذية الخزنة بنجاح');
        setIsDepositModalOpen(false);
        setDepositAmountStr('');
        fetchShiftData();
      } else {
        throw new Error(res?.error || 'فشل تسجيل الإيداع');
      }
    } catch (err: any) {
      sounds.playError();
      toastError(err.message || 'حدث خطأ أثناء تسجيل الإيداع');
    }
  };

  // إغلاق الوردية
  const handleCloseShift = async (e: React.FormEvent) => {
    e.preventDefault();
    const counted = parseFloat(countedCashStr);
    if (isNaN(counted) || counted < 0) {
      sounds.playError();
      toastError('يرجى إدخال نقدية الدرج الفعلية (العد الأعمى)');
      return;
    }

    try {
      const electron = (window as any).electron;
      const res = await electron.closeShift(
        activeShift.id,
        Math.round(counted * 100),
        closeNotes.trim() || undefined,
        1
      );

      if (res?.success) {
        sounds.playSaleSuccess();
        toastSuccess('تم إغلاق الوردية وتوثيق الفروقات المالية بنجاح');
        setIsCloseShiftModalOpen(false);
        setCountedCashStr('');
        setCloseNotes('');
        fetchShiftData();
      } else {
        throw new Error(res?.error || 'فشل إغلاق الوردية');
      }
    } catch (err: any) {
      sounds.playError();
      toastError(err.message || 'حدث خطأ أثناء إغلاق الوردية');
    }
  };

  const getMovementLabel = (type: string) => {
    switch (type) {
      case 'sale':
        return 'مبيعات كاش';
      case 'expense':
        return 'مصروف نقدي';
      case 'deposit':
        return 'إيداع / فكة';
      case 'withdrawal':
        return 'سحب نقدي';
      case 'refund':
        return 'مرتجع نقدي';
      default:
        return type;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, height: '100%' }}>
      {/* إذا كانت الوردية مغلقة */}
      {!activeShift ? (
        <div
          className="glass-card"
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#161B22',
            border: '1px solid #262E3D',
            padding: 40,
            gap: 20,
          }}
        >
          <GlassIcon icon={Lock} size="xl" variant="gold" glow />
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: 24, fontWeight: 800, color: '#F8FAFC', margin: '0 0 8px 0' }}>
              الوردية مغلقة حالياً
            </h2>
            <p style={{ color: '#94A3B8', fontSize: 14, margin: 0, maxWidth: 450 }}>
              لبدء عمليات البيع واستلام النقدية في الدرج وتتبع المبيعات بدقة، يرجى إدخال الرصيد الافتتاحي وافتتاح الوردية.
            </p>
          </div>

          <form onSubmit={handleOpenShift} style={{ display: 'flex', gap: 12, width: '100%', maxWidth: 420 }}>
            <Input
              type="number"
              step="any"
              placeholder="الرصيد الافتتاحي (ج.م)"
              value={newOpeningCashStr}
              onChange={(e) => setNewOpeningCashStr(e.target.value)}
              required
            />
            <Button type="submit" variant="primary" style={{ height: 44, padding: '0 24px', flexShrink: 0 }}>
              <Unlock size={16} />
              <span>افتتاح الوردية</span>
            </Button>
          </form>
        </div>
      ) : (
        <>
          {/* كروت المؤشرات العلوية */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            <div
              className="glass-card"
              style={{ padding: '16px 18px', backgroundColor: '#161B22', border: '1px solid #262E3D' }}
            >
              <div style={{ fontSize: 13, color: '#94A3B8', fontWeight: 600 }}>نقدية الدرج الحالية</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#FFB800', marginTop: 4 }}>
                {formatMoney(currentDrawerCash)}
              </div>
            </div>

            <div
              className="glass-card"
              style={{ padding: '16px 18px', backgroundColor: '#161B22', border: '1px solid #262E3D' }}
            >
              <div style={{ fontSize: 13, color: '#94A3B8', fontWeight: 600 }}>إجمالي مبيعات الكاش</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#10B981', marginTop: 4 }}>
                {formatMoney(totalSalesCash)}
              </div>
            </div>

            <div
              className="glass-card"
              style={{ padding: '16px 18px', backgroundColor: '#161B22', border: '1px solid #262E3D' }}
            >
              <div style={{ fontSize: 13, color: '#94A3B8', fontWeight: 600 }}>المصروفات والسحوبات</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#EF4444', marginTop: 4 }}>
                {formatMoney(totalExpenses)}
              </div>
            </div>

            <div
              className="glass-card"
              style={{ padding: '16px 18px', backgroundColor: '#161B22', border: '1px solid #262E3D' }}
            >
              <div style={{ fontSize: 13, color: '#94A3B8', fontWeight: 600 }}>الرصيد الافتتاحي</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#38BDF8', marginTop: 4 }}>
                {formatMoney(activeShift.opening_balance || 0)}
              </div>
            </div>
          </div>

          {/* شريط الإجراءات السريعة */}
          <div
            className="glass-card"
            style={{
              padding: '12px 18px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: '#161B22',
              border: '1px solid #262E3D',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="badge badge-success">الوردية #{activeShift.id} مفتوحة نشطة</span>
              <span style={{ fontSize: 13, color: '#94A3B8' }}>
                افتتحت في: {activeShift.opened_at?.slice(0, 16)}
              </span>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <Button
                variant="secondary"
                onClick={() => fetchShiftData()}
                disabled={isLoading}
                style={{ height: 42, padding: '0 14px' }}
              >
                <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
              </Button>

              <Button variant="secondary" onClick={handleOpenDrawer} style={{ height: 42, padding: '0 16px' }}>
                <Printer size={16} />
                <span>فتح الدرج</span>
              </Button>

              <Button
                variant="secondary"
                onClick={() => {
                  sounds.playClick();
                  setIsDepositModalOpen(true);
                }}
                style={{ height: 42, padding: '0 16px' }}
              >
                <Plus size={16} />
                <span>إيداع فكة للدرج</span>
              </Button>

              <Button
                variant="secondary"
                onClick={() => {
                  sounds.playClick();
                  setIsExpenseModalOpen(true);
                }}
                style={{ height: 42, padding: '0 16px' }}
              >
                <Minus size={16} />
                <span>تسجيل مصروف</span>
              </Button>

              <Button
                variant="danger"
                onClick={() => {
                  sounds.playWarning();
                  setIsCloseShiftModalOpen(true);
                }}
                style={{ height: 42, padding: '0 18px' }}
              >
                <Lock size={16} />
                <span>إغلاق وتسليم الوردية</span>
              </Button>
            </div>
          </div>

          {/* سجل حركات النقدية الفعلي */}
          <div
            className="glass-card"
            style={{
              flex: 1,
              padding: 0,
              overflow: 'hidden',
              backgroundColor: '#161B22',
              border: '1px solid #262E3D',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                padding: '14px 20px',
                borderBottom: '1px solid #262E3D',
                backgroundColor: '#1C222D',
                fontWeight: 700,
                fontSize: 15,
                color: '#F8FAFC',
              }}
            >
              سجل حركات الخزنة والدرج للوردية الحالية
            </div>

            <div style={{ overflowY: 'auto', flex: 1 }}>
              {movements.length === 0 ? (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 48,
                    gap: 12,
                    color: '#94A3B8',
                  }}
                >
                  <Coins size={42} style={{ color: '#FFB800', opacity: 0.7 }} />
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#F8FAFC' }}>لا توجد حركات نقدية مسجلة في هذه الوردية بعد</div>
                  <div style={{ fontSize: 13, color: '#94A3B8' }}>
                    تظهر هنا المبيعات النقدية والمصروفات والإيداعات لحظة بلحظة
                  </div>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
                  <thead>
                    <tr style={{ background: '#1C222D', borderBottom: '1.5px solid #262E3D' }}>
                      <th style={{ width: '8%', padding: '12px 16px', textAlign: 'center', color: '#94A3B8', fontWeight: 600 }}>#</th>
                      <th style={{ width: '18%', padding: '12px 16px', color: '#94A3B8', fontWeight: 600 }}>نوع الحركة</th>
                      <th style={{ width: '18%', padding: '12px 16px', textAlign: 'left', color: '#94A3B8', fontWeight: 600 }}>المبلغ</th>
                      <th style={{ width: '38%', padding: '12px 16px', color: '#94A3B8', fontWeight: 600 }}>البيان / الملاحظات</th>
                      <th style={{ width: '18%', padding: '12px 16px', textAlign: 'center', color: '#94A3B8', fontWeight: 600 }}>الوقت</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((m, idx) => (
                      <tr key={m.id} style={{ borderBottom: '1px solid #262E3D' }}>
                        <td style={{ padding: '12px 16px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
                          {idx + 1}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span
                            className={
                              m.type === 'sale' || m.type === 'deposit'
                                ? 'badge badge-success'
                                : 'badge badge-danger'
                            }
                          >
                            {getMovementLabel(m.type)}
                          </span>
                        </td>
                        <td
                          style={{
                            padding: '12px 16px',
                            textAlign: 'left',
                            fontWeight: 800,
                            fontSize: 15,
                            color: m.type === 'sale' || m.type === 'deposit' ? '#10B981' : '#EF4444',
                          }}
                        >
                          {m.type === 'sale' || m.type === 'deposit' ? '+' : '-'} {formatMoney(Math.abs(m.amount))}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: '#F8FAFC' }}>
                          {m.note || '---'}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: 13, color: '#94A3B8' }}>
                          {m.created_at?.slice(11, 16) || '---'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      {/* نافذة تسجيل مصروف */}
      <Modal
        isOpen={isExpenseModalOpen}
        onClose={() => setIsExpenseModalOpen(false)}
        title="صرف نقدية من الدرج (مصروف تشغيلي)"
        icon={<GlassIcon icon={Minus} size="sm" variant="danger" />}
        width={460}
      >
        <form onSubmit={handleRecordExpense} style={{ display: 'flex', flexDirection: 'column', gap: 14, direction: 'rtl' }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>
              المبلغ المصروف (ج.م) *
            </label>
            <Input
              type="number"
              step="any"
              value={expenseAmountStr}
              onChange={(e) => setExpenseAmountStr(e.target.value)}
              placeholder="مثال: 50.00"
              required
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>
              بند المصروف *
            </label>
            <select
              value={expenseCategory}
              onChange={(e) => setExpenseCategory(e.target.value)}
              className="in"
              style={{ height: 44, width: '100%' }}
            >
              <option value="نثريات وضيافة">نثريات وضيافة</option>
              <option value="أدوات ونظافة">أدوات ونظافة</option>
              <option value="صيانة ومرافق">صيانة ومرافق</option>
              <option value="نقل ومواصلات">نقل ومواصلات</option>
              <option value="مصروفات أخرى">مصروفات أخرى</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>
              البيان / التوضيح
            </label>
            <Input
              value={expenseNotes}
              onChange={(e) => setExpenseNotes(e.target.value)}
              placeholder="مثال: شراء شاي وسكر للعمال"
            />
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
            <Button type="submit" variant="danger" style={{ flex: 1, height: 44 }}>
              <CheckCircle2 size={16} />
              <span>صرف وخصم من الدرج</span>
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsExpenseModalOpen(false)}
              style={{ width: 100, height: 44 }}
            >
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>

      {/* نافذة تغذية فكة للدرج */}
      <Modal
        isOpen={isDepositModalOpen}
        onClose={() => setIsDepositModalOpen(false)}
        title="تغذية نقدية وفكة إضافية للدرج"
        icon={<GlassIcon icon={Plus} size="sm" variant="gold" />}
        width={460}
      >
        <form onSubmit={handleRecordDeposit} style={{ display: 'flex', flexDirection: 'column', gap: 14, direction: 'rtl' }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>
              المبلغ المودع (ج.م) *
            </label>
            <Input
              type="number"
              step="any"
              value={depositAmountStr}
              onChange={(e) => setDepositAmountStr(e.target.value)}
              placeholder="مثال: 200.00"
              required
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>
              سبب الإيداع
            </label>
            <Input
              value={depositReason}
              onChange={(e) => setDepositReason(e.target.value)}
              placeholder="مثال: تغذية فكة للدرج"
            />
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
            <Button type="submit" variant="primary" style={{ flex: 1, height: 44 }}>
              <CheckCircle2 size={16} />
              <span>إيداع في الدرج</span>
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsDepositModalOpen(false)}
              style={{ width: 100, height: 44 }}
            >
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>

      {/* نافذة إغلاق الوردية والعد الأعمى */}
      <Modal
        isOpen={isCloseShiftModalOpen}
        onClose={() => setIsCloseShiftModalOpen(false)}
        title="إغلاق وتسليم الوردية (العد الأعمى)"
        icon={<GlassIcon icon={Lock} size="sm" variant="danger" />}
        width={480}
      >
        <form onSubmit={handleCloseShift} style={{ display: 'flex', flexDirection: 'column', gap: 14, direction: 'rtl' }}>
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              backgroundColor: 'rgba(235, 87, 87, 0.08)',
              border: '1px solid rgba(235, 87, 87, 0.2)',
              fontSize: 13,
              color: '#962B34',
            }}
          >
            قم بعد النقدية الموجودة في الدرج فعلياً وإدخالها دون الاعتماد على رصيد الشاشة لضمان الرقابة والنزاهة المالية.
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>
              النقدية الفعلية المحسوبة في الدرج (ج.م) *
            </label>
            <Input
              type="number"
              step="any"
              value={countedCashStr}
              onChange={(e) => setCountedCashStr(e.target.value)}
              placeholder="0.00"
              required
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>
              ملاحظات الإغلاق والتسليم
            </label>
            <Input
              value={closeNotes}
              onChange={(e) => setCloseNotes(e.target.value)}
              placeholder="أي ملاحظات حول العجز أو الزيادة إن وُجدت"
            />
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
            <Button type="submit" variant="danger" style={{ flex: 1, height: 44 }}>
              <Lock size={16} />
              <span>تأكيد إغلاق الوردية</span>
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsCloseShiftModalOpen(false)}
              style={{ width: 100, height: 44 }}
            >
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default CashScreen;
