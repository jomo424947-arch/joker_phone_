import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  UserPlus,
  Phone,
  Search,
  RefreshCw,
  FileText,
  DollarSign,
  CheckCircle2,
  Edit2,
  Printer,
  X,
  CreditCard,
  Banknote,
  Coins,
  ShieldAlert,
  ArrowDownLeft,
} from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Modal } from '../../components/common/Modal';
import { GlassIcon } from '../../components/common/GlassIcon';
import { EmptyState } from '../../components/common/EmptyState';
import { formatMoney } from '../../../shared/utils/money';
import { formatDateTimeArabic } from '../../lib/formatters';
import { useToast } from '../../components/common/ToastContext';
import { sounds } from '../../lib/sounds';
import { api } from '../../lib/api';
import {
  Customer,
  CreateCustomerInput,
  UpdateCustomerInput,
  CustomerStatement,
} from '../../../shared/types/customers.types';

export function CustomersScreen(): React.ReactElement {
  const { success: toastSuccess, error: toastError } = useToast();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'debtors' | 'zero'>('all');

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showStatementModal, setShowStatementModal] = useState(false);

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [statementData, setStatementData] = useState<CustomerStatement | null>(null);
  const [isStatementLoading, setIsStatementLoading] = useState(false);

  // Forms state
  const [formData, setFormData] = useState<{
    name: string;
    phone: string;
    creditLimitEgp: string;
    initialBalanceEgp: string;
    notes: string;
  }>({
    name: '',
    phone: '',
    creditLimitEgp: '5000',
    initialBalanceEgp: '0',
    notes: '',
  });

  // Payment collection form state
  const [paymentData, setPaymentData] = useState<{
    amountEgp: string;
    paymentMethod: 'cash' | 'card';
    note: string;
  }>({
    amountEgp: '',
    paymentMethod: 'cash',
    note: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [currentUserId, setCurrentUserId] = useState<number>(1);
  const [activeShiftId, setActiveShiftId] = useState<number>(1);

  const fetchSessionInfo = async () => {
    try {
      if (api?.getCurrentUser) {
        const u = await api.getCurrentUser();
        if (u?.success && (u as any).data?.id) {
          setCurrentUserId((u as any).data.id);
        }
      }
      if (api?.getActiveShift) {
        const s = await api.getActiveShift();
        if (s?.success && (s as any).data?.id) {
          setActiveShiftId((s as any).data.id);
        }
      }
    } catch {
      // ignore
    }
  };

  const fetchCustomers = async () => {
    setIsLoading(true);
    try {
      if (api?.listCustomers) {
        const res = await api.listCustomers();
        if (res?.success && Array.isArray(res.data)) {
          setCustomers(res.data);
        } else if (Array.isArray(res)) {
          setCustomers(res as any);
        }
      }
    } catch (err: any) {
      toastError(err?.message || 'فشل في تحميل قائمة العملاء');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSessionInfo();
    fetchCustomers();
  }, []);

  // Filtered customers
  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        c.name.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(q));

      if (!matchesSearch) return false;

      if (filterType === 'debtors') {
        return c.balance > 0;
      }
      if (filterType === 'zero') {
        return c.balance <= 0;
      }
      return true;
    });
  }, [customers, searchQuery, filterType]);

  // KPIs
  const totalReceivables = useMemo(() => {
    return customers.reduce((sum, c) => sum + (c.balance > 0 ? c.balance : 0), 0);
  }, [customers]);

  const debtorsCount = useMemo(() => {
    return customers.filter((c) => c.balance > 0).length;
  }, [customers]);

  // Open Add Modal
  const handleOpenAdd = () => {
    sounds.playClick();
    setFormData({
      name: '',
      phone: '',
      creditLimitEgp: '5000',
      initialBalanceEgp: '0',
      notes: '',
    });
    setShowAddModal(true);
  };

  // Submit Add Customer
  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      sounds.playError();
      toastError('اسم العميل مطلوب');
      return;
    }

    setIsSubmitting(true);
    try {
      const creditLimitPiasters = Math.round((parseFloat(formData.creditLimitEgp) || 0) * 100);
      const initialBalancePiasters = Math.round((parseFloat(formData.initialBalanceEgp) || 0) * 100);

      const input: CreateCustomerInput = {
        name: formData.name.trim(),
        phone: formData.phone.trim() || null,
        credit_limit: creditLimitPiasters,
        initial_balance: initialBalancePiasters,
        notes: formData.notes.trim() || null,
      };

      const res = await api.createCustomer({ data: input, userId: currentUserId });
      if (res?.success) {
        sounds.playSuccess();
        toastSuccess('تمت إضافة العميل بنجاح');
        setShowAddModal(false);
        fetchCustomers();
      } else {
        sounds.playError();
        toastError(typeof res?.error === 'string' ? res.error : res?.error?.message || 'فشل في حفظ بيانات العميل');
      }
    } catch (err: any) {
      sounds.playError();
      toastError(err?.message || 'خطأ أثناء إضافة العميل');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (customer: Customer) => {
    sounds.playClick();
    setSelectedCustomer(customer);
    setFormData({
      name: customer.name,
      phone: customer.phone || '',
      creditLimitEgp: (customer.credit_limit / 100).toFixed(2),
      initialBalanceEgp: '0',
      notes: customer.notes || '',
    });
    setShowEditModal(true);
  };

  // Submit Edit Customer
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;

    setIsSubmitting(true);
    try {
      const creditLimitPiasters = Math.round((parseFloat(formData.creditLimitEgp) || 0) * 100);

      const input: UpdateCustomerInput = {
        name: formData.name.trim(),
        phone: formData.phone.trim() || null,
        credit_limit: creditLimitPiasters,
        notes: formData.notes.trim() || null,
      };

      const res = await api.updateCustomer({
        id: selectedCustomer.id,
        data: input,
        userId: currentUserId,
      });

      if (res?.success) {
        sounds.playSuccess();
        toastSuccess('تم تحديث بيانات العميل بنجاح');
        setShowEditModal(false);
        fetchCustomers();
      } else {
        sounds.playError();
        toastError(typeof res?.error === 'string' ? res.error : res?.error?.message || 'فشل في تحديث بيانات العميل');
      }
    } catch (err: any) {
      sounds.playError();
      toastError(err?.message || 'خطأ أثناء تحديث بيانات العميل');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Payment Collection Modal
  const handleOpenPayment = (customer: Customer) => {
    sounds.playClick();
    setSelectedCustomer(customer);
    const suggestedAmount = customer.balance > 0 ? (customer.balance / 100).toFixed(2) : '100';
    setPaymentData({
      amountEgp: suggestedAmount,
      paymentMethod: 'cash',
      note: `سداد دفعة من مديونية العميل ${customer.name}`,
    });
    setShowPaymentModal(true);
  };

  // Submit Payment Collection
  const handleCollectPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;

    const amountInPiasters = Math.round((parseFloat(paymentData.amountEgp) || 0) * 100);
    if (amountInPiasters <= 0) {
      sounds.playError();
      toastError('يرجى إدخال مبلغ سداد صحيح أكبر من الصفر');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.payCustomer({
        customerId: selectedCustomer.id,
        amount: amountInPiasters,
        paymentMethod: paymentData.paymentMethod,
        note: paymentData.note.trim() || undefined,
        userId: currentUserId,
        shiftId: activeShiftId,
      });

      if (res?.success) {
        sounds.playSaleSuccess();
        sounds.playCashRegister();
        toastSuccess('تم تسجيل سند القبض وإيداع المبلغ في الخزنة بنجاح');
        setShowPaymentModal(false);
        fetchCustomers();
      } else {
        sounds.playError();
        toastError(typeof res?.error === 'string' ? res.error : res?.error?.message || 'فشل في تسجيل السداد');
      }
    } catch (err: any) {
      sounds.playError();
      toastError(err?.message || 'خطأ أثناء تسجيل السداد');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Statement Modal
  const handleOpenStatement = async (customer: Customer) => {
    sounds.playClick();
    setSelectedCustomer(customer);
    setShowStatementModal(true);
    setIsStatementLoading(true);
    try {
      const res = await api.getCustomerStatement({ customerId: customer.id });
      if (res?.success && res.data) {
        setStatementData(res.data);
      } else {
        toastError('تعذر جلب كشف حساب العميل');
      }
    } catch (err: any) {
      toastError(err?.message || 'خطأ في جلب كشف الحساب');
    } finally {
      setIsStatementLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, direction: 'rtl' }}>
      {/* شريط الإحصائيات العلوية KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {/* إجمالي العملاء */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(22, 27, 34, 0.9) 0%, rgba(15, 18, 24, 0.9) 100%)',
            border: '1px solid #262E3D',
            borderRadius: 16,
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: 13, color: '#94A3B8', fontWeight: 600 }}>إجمالي العملاء المسجلين</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: '#F8FAFC', marginTop: 4 }}>
              {customers.length} عميل
            </div>
          </div>
          <GlassIcon icon={Users} size="md" variant="brand" />
        </div>

        {/* إجمالي الديون المستحقة */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(22, 27, 34, 0.9) 100%)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 16,
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: 13, color: '#FCA5A5', fontWeight: 600 }}>إجمالي مديونيات العملاء (الآجل)</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: '#EF4444', marginTop: 4 }}>
              {formatMoney(totalReceivables)}
            </div>
          </div>
          <GlassIcon icon={ArrowDownLeft} size="md" variant="danger" />
        </div>

        {/* عدد العملاء المدينين */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(255, 184, 0, 0.08) 0%, rgba(22, 27, 34, 0.9) 100%)',
            border: '1px solid rgba(255, 184, 0, 0.3)',
            borderRadius: 16,
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: 13, color: '#FCD34D', fontWeight: 600 }}>عملاء عليهم مستحقات مالية</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: '#FFB800', marginTop: 4 }}>
              {debtorsCount} عميل مدين
            </div>
          </div>
          <GlassIcon icon={Coins} size="md" variant="gold" />
        </div>
      </div>

      {/* شريط البحث والتصفية والإجراءات */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          backgroundColor: '#161B22',
          padding: '14px 18px',
          borderRadius: 14,
          border: '1px solid #262E3D',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, maxWidth: 650 }}>
          {/* حقل البحث */}
          <div style={{ position: 'relative', flex: 1 }}>
            <Search
              size={18}
              color="#94A3B8"
              style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }}
            />
            <input
              type="text"
              placeholder="ابحث بالاسم أو رقم الهاتف..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="in"
              style={{
                width: '100%',
                height: 42,
                paddingRight: 38,
                fontSize: 14,
                backgroundColor: '#0B0E14',
                border: '1px solid #262E3D',
              }}
            />
          </div>

          {/* أزرار الفلترة */}
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              onClick={() => {
                sounds.playClick();
                setFilterType('all');
              }}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                fontSize: 12.5,
                fontWeight: 700,
                cursor: 'pointer',
                border: filterType === 'all' ? '1px solid #FFB800' : '1px solid #262E3D',
                backgroundColor: filterType === 'all' ? 'rgba(255, 184, 0, 0.15)' : '#0B0E14',
                color: filterType === 'all' ? '#FFB800' : '#94A3B8',
              }}
            >
              الكل ({customers.length})
            </button>

            <button
              type="button"
              onClick={() => {
                sounds.playClick();
                setFilterType('debtors');
              }}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                fontSize: 12.5,
                fontWeight: 700,
                cursor: 'pointer',
                border: filterType === 'debtors' ? '1px solid #EF4444' : '1px solid #262E3D',
                backgroundColor: filterType === 'debtors' ? 'rgba(239, 68, 68, 0.15)' : '#0B0E14',
                color: filterType === 'debtors' ? '#EF4444' : '#94A3B8',
              }}
            >
              عليهم ديون ({debtorsCount})
            </button>

            <button
              type="button"
              onClick={() => {
                sounds.playClick();
                setFilterType('zero');
              }}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                fontSize: 12.5,
                fontWeight: 700,
                cursor: 'pointer',
                border: filterType === 'zero' ? '1px solid #10B981' : '1px solid #262E3D',
                backgroundColor: filterType === 'zero' ? 'rgba(16, 185, 129, 0.15)' : '#0B0E14',
                color: filterType === 'zero' ? '#10B981' : '#94A3B8',
              }}
            >
              خالصة المديونية
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <Button
            variant="secondary"
            onClick={() => {
              sounds.playClick();
              fetchCustomers();
            }}
            isLoading={isLoading}
            style={{ height: 42, padding: '0 14px' }}
          >
            <RefreshCw size={16} />
            <span>تحديث</span>
          </Button>

          <Button
            variant="primary"
            onClick={handleOpenAdd}
            style={{ height: 42, padding: '0 18px', gap: 8, fontWeight: 700 }}
          >
            <UserPlus size={18} />
            <span>إضافة عميل جديد</span>
          </Button>
        </div>
      </div>

      {/* جدول العملاء */}
      <div
        style={{
          backgroundColor: '#161B22',
          borderRadius: 16,
          border: '1px solid #262E3D',
          overflow: 'hidden',
        }}
      >
        {filteredCustomers.length === 0 ? (
          <div style={{ padding: 40 }}>
            <EmptyState
              icon={Users}
              title="لا يوجد عملاء مطابقين"
              description="لم يتم العثور على أي عميل يتطابق مع معايير البحث الحالية."
              actionLabel="إضافة عميل جديد"
              onAction={handleOpenAdd}
            />
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
            <thead>
              <tr style={{ backgroundColor: '#0B0E14', borderBottom: '1px solid #262E3D' }}>
                <th style={{ padding: '14px 18px', fontSize: 13, color: '#94A3B8', fontWeight: 600 }}>العميل</th>
                <th style={{ padding: '14px 18px', fontSize: 13, color: '#94A3B8', fontWeight: 600 }}>رقم الهاتف</th>
                <th style={{ padding: '14px 18px', fontSize: 13, color: '#94A3B8', fontWeight: 600 }}>المديونية الحالية</th>
                <th style={{ padding: '14px 18px', fontSize: 13, color: '#94A3B8', fontWeight: 600 }}>الحد الائتماني</th>
                <th style={{ padding: '14px 18px', fontSize: 13, color: '#94A3B8', fontWeight: 600 }}>المتبقي من الحد</th>
                <th style={{ padding: '14px 18px', fontSize: 13, color: '#94A3B8', fontWeight: 600, textAlign: 'center' }}>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map((cust) => {
                const remainingLimit = cust.credit_limit - cust.balance;
                const isOverLimit = cust.balance > cust.credit_limit;

                return (
                  <tr
                    key={cust.id}
                    style={{
                      borderBottom: '1px solid #21262D',
                      transition: 'background-color 0.15s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.02)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    {/* اسم العميل */}
                    <td style={{ padding: '14px 18px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: '50%',
                            backgroundColor: cust.balance > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: cust.balance > 0 ? '#EF4444' : '#10B981',
                            fontWeight: 800,
                            fontSize: 14,
                          }}
                        >
                          {cust.name.slice(0, 1)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, color: '#F8FAFC', fontSize: 14 }}>{cust.name}</div>
                          {cust.notes && (
                            <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>{cust.notes}</div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* الهاتف */}
                    <td style={{ padding: '14px 18px', fontSize: 13, color: '#CBD5E1' }}>
                      {cust.phone ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Phone size={13} color="#94A3B8" />
                          <span style={{ direction: 'ltr' }}>{cust.phone}</span>
                        </div>
                      ) : (
                        <span style={{ color: '#64748B' }}>---</span>
                      )}
                    </td>

                    {/* المديونية الحالية */}
                    <td style={{ padding: '14px 18px' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '4px 10px',
                          borderRadius: 8,
                          fontSize: 13,
                          fontWeight: 800,
                          backgroundColor: cust.balance > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.12)',
                          color: cust.balance > 0 ? '#EF4444' : '#10B981',
                        }}
                      >
                        {formatMoney(cust.balance)}
                      </span>
                    </td>

                    {/* الحد الائتماني */}
                    <td style={{ padding: '14px 18px', fontSize: 13, color: '#E2E8F0', fontWeight: 600 }}>
                      {formatMoney(cust.credit_limit)}
                    </td>

                    {/* المتبقي من الحد */}
                    <td style={{ padding: '14px 18px' }}>
                      <span
                        style={{
                          fontSize: 12.5,
                          fontWeight: 700,
                          color: isOverLimit ? '#EF4444' : remainingLimit < 50000 ? '#F59E0B' : '#94A3B8',
                        }}
                      >
                        {isOverLimit ? 'متجاوز الحد!' : formatMoney(remainingLimit)}
                      </span>
                    </td>

                    {/* أزرار الإجراءات */}
                    <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        {/* زر تحصيل دفعة */}
                        <Button
                          variant="success"
                          size="sm"
                          onClick={() => handleOpenPayment(cust)}
                          style={{ height: 32, fontSize: 12, padding: '0 10px', gap: 4 }}
                          title="تحصيل دفعة وسند قبض"
                        >
                          <Coins size={14} />
                          <span>تحصيل</span>
                        </Button>

                        {/* كشف حساب */}
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleOpenStatement(cust)}
                          style={{ height: 32, fontSize: 12, padding: '0 10px', gap: 4 }}
                          title="كشف حساب تفصيلي"
                        >
                          <FileText size={14} />
                          <span>كشف</span>
                        </Button>

                        {/* تعديل */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenEdit(cust)}
                          style={{ height: 32, width: 32, padding: 0 }}
                          title="تعديل بيانات العميل"
                        >
                          <Edit2 size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* نافذة إضافة عميل جديد */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="إضافة عميل جديد"
        icon={<GlassIcon icon={UserPlus} size="sm" variant="brand" />}
        width={480}
      >
        <form onSubmit={handleSaveCustomer} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#F8FAFC' }}>
              اسم العميل * :
            </label>
            <input
              type="text"
              required
              placeholder="مثال: أحمد محمد علي"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="in"
              style={{ width: '100%', height: 40 }}
              autoFocus
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#F8FAFC' }}>
              رقم الهاتف:
            </label>
            <input
              type="text"
              placeholder="010xxxxxxxx"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="in"
              style={{ width: '100%', height: 40 }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#F8FAFC' }}>
                الحد الائتماني (ج.م):
              </label>
              <input
                type="number"
                step="any"
                value={formData.creditLimitEgp}
                onChange={(e) => setFormData({ ...formData, creditLimitEgp: e.target.value })}
                className="in"
                style={{ width: '100%', height: 40 }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#F8FAFC' }}>
                رصيد مدين افتتاحي (ج.م):
              </label>
              <input
                type="number"
                step="any"
                value={formData.initialBalanceEgp}
                onChange={(e) => setFormData({ ...formData, initialBalanceEgp: e.target.value })}
                className="in"
                style={{ width: '100%', height: 40 }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#F8FAFC' }}>
              ملاحظات أو عنوان العميل:
            </label>
            <textarea
              rows={2}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="in"
              style={{ width: '100%', padding: 8 }}
            />
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <Button
              type="submit"
              variant="primary"
              disabled={isSubmitting}
              isLoading={isSubmitting}
              style={{ flex: 1, height: 42 }}
            >
              حفظ العميل
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowAddModal(false)}
              disabled={isSubmitting}
              style={{ width: 100, height: 42 }}
            >
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>

      {/* نافذة تعديل بيانات العميل */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="تعديل بيانات العميل"
        icon={<GlassIcon icon={Edit2} size="sm" variant="brand" />}
        width={480}
      >
        <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#F8FAFC' }}>
              اسم العميل * :
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="in"
              style={{ width: '100%', height: 40 }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#F8FAFC' }}>
              رقم الهاتف:
            </label>
            <input
              type="text"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="in"
              style={{ width: '100%', height: 40 }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#F8FAFC' }}>
              الحد الائتماني الأقصى (ج.م):
            </label>
            <input
              type="number"
              step="any"
              value={formData.creditLimitEgp}
              onChange={(e) => setFormData({ ...formData, creditLimitEgp: e.target.value })}
              className="in"
              style={{ width: '100%', height: 40 }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#F8FAFC' }}>
              ملاحظات:
            </label>
            <textarea
              rows={2}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="in"
              style={{ width: '100%', padding: 8 }}
            />
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <Button
              type="submit"
              variant="primary"
              disabled={isSubmitting}
              isLoading={isSubmitting}
              style={{ flex: 1, height: 42 }}
            >
              حفظ التعديلات
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowEditModal(false)}
              disabled={isSubmitting}
              style={{ width: 100, height: 42 }}
            >
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>

      {/* نافذة تحصيل دفعة (سند قبض كاش بالخزنة) */}
      <Modal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        title="تحصيل دفعة مالية وإصدار سند قبض"
        icon={<GlassIcon icon={Coins} size="sm" variant="gold" />}
        width={480}
      >
        <form onSubmit={handleCollectPayment} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {selectedCustomer && (
            <div
              style={{
                backgroundColor: '#161B22',
                border: '1px solid #262E3D',
                borderRadius: 12,
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ fontSize: 12, color: '#94A3B8' }}>العميل المسدد:</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#F8FAFC' }}>{selectedCustomer.name}</div>
              </div>

              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 12, color: '#94A3B8' }}>المديونية الحالية:</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#EF4444' }}>
                  {formatMoney(selectedCustomer.balance)}
                </div>
              </div>
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#F8FAFC' }}>
              المبلغ المحصل (ج.م) * :
            </label>
            <input
              type="number"
              step="any"
              required
              value={paymentData.amountEgp}
              onChange={(e) => setPaymentData({ ...paymentData, amountEgp: e.target.value })}
              className="in"
              style={{
                width: '100%',
                height: 46,
                fontSize: 20,
                fontWeight: 800,
                color: '#FFB800',
                backgroundColor: '#0B0E14',
                border: '1px solid #262E3D',
              }}
              autoFocus
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#F8FAFC' }}>
              طريقة الاستلام (توريد للخزنة):
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button
                type="button"
                onClick={() => setPaymentData({ ...paymentData, paymentMethod: 'cash' })}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: paymentData.paymentMethod === 'cash' ? '2px solid #FFB800' : '1px solid #262E3D',
                  backgroundColor: paymentData.paymentMethod === 'cash' ? 'rgba(255, 184, 0, 0.15)' : '#0B0E14',
                  color: paymentData.paymentMethod === 'cash' ? '#FFB800' : '#E2E8F0',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <Banknote size={18} />
                <span>نقدي (خزنة الدرج)</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentData({ ...paymentData, paymentMethod: 'card' })}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: paymentData.paymentMethod === 'card' ? '2px solid #FFB800' : '1px solid #262E3D',
                  backgroundColor: paymentData.paymentMethod === 'card' ? 'rgba(255, 184, 0, 0.15)' : '#0B0E14',
                  color: paymentData.paymentMethod === 'card' ? '#FFB800' : '#E2E8F0',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <CreditCard size={18} />
                <span>بطاقة / فيزا</span>
              </button>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#F8FAFC' }}>
              بيان / ملاحظات سند القبض:
            </label>
            <input
              type="text"
              value={paymentData.note}
              onChange={(e) => setPaymentData({ ...paymentData, note: e.target.value })}
              className="in"
              style={{ width: '100%', height: 40 }}
            />
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <Button
              type="submit"
              variant="success"
              disabled={isSubmitting}
              isLoading={isSubmitting}
              style={{ flex: 1, height: 44, fontSize: 15, fontWeight: 700 }}
            >
              تأكيد تحصيل الدفعة وحفظ السند
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowPaymentModal(false)}
              disabled={isSubmitting}
              style={{ width: 100, height: 44 }}
            >
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>

      {/* نافذة كشف الحساب التفصيلي */}
      <Modal
        isOpen={showStatementModal}
        onClose={() => setShowStatementModal(false)}
        title={`كشف حساب تفصيلي: ${selectedCustomer?.name || ''}`}
        icon={<GlassIcon icon={FileText} size="sm" variant="brand" />}
        width={720}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {isStatementLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8' }}>
              جاري تجهيز كشف الحساب وحساب الأرصدة...
            </div>
          ) : statementData ? (
            <>
              {/* بطاقة ملخص كشف الحساب */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: 10,
                  backgroundColor: '#161B22',
                  padding: 14,
                  borderRadius: 12,
                  border: '1px solid #262E3D',
                }}
              >
                <div>
                  <div style={{ fontSize: 11, color: '#94A3B8' }}>إجمالي فواتير الآجل</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#EF4444', marginTop: 2 }}>
                    {formatMoney(statementData.total_credit_sales)}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 11, color: '#94A3B8' }}>إجمالي المسددات</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#10B981', marginTop: 2 }}>
                    {formatMoney(statementData.total_payments)}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 11, color: '#94A3B8' }}>المرتجعات المقيدة</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#3B82F6', marginTop: 2 }}>
                    {formatMoney(statementData.total_returns)}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 11, color: '#94A3B8' }}>صافي الرصيد المستحق</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#FFB800', marginTop: 2 }}>
                    {formatMoney(statementData.current_balance)}
                  </div>
                </div>
              </div>

              {/* جدول حركات كشف الحساب */}
              <div
                style={{
                  maxHeight: 340,
                  overflowY: 'auto',
                  borderRadius: 10,
                  border: '1px solid #262E3D',
                }}
              >
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead style={{ position: 'sticky', top: 0, backgroundColor: '#0B0E14', zIndex: 1 }}>
                    <tr style={{ borderBottom: '1px solid #262E3D' }}>
                      <th style={{ padding: '10px 14px', color: '#94A3B8' }}>التاريخ والوقت</th>
                      <th style={{ padding: '10px 14px', color: '#94A3B8' }}>البيان / العملية</th>
                      <th style={{ padding: '10px 14px', color: '#EF4444' }}>مدين (+)</th>
                      <th style={{ padding: '10px 14px', color: '#10B981' }}>دائن (-)</th>
                      <th style={{ padding: '10px 14px', color: '#FFB800' }}>الرصيد التراكمي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statementData.entries.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ padding: 24, textAlign: 'center', color: '#64748B' }}>
                          لا توجد عمليات مسجلة في كشف حساب هذا العميل حتى الآن.
                        </td>
                      </tr>
                    ) : (
                      statementData.entries.map((entry, idx) => (
                        <tr
                          key={idx}
                          style={{
                            borderBottom: '1px solid #21262D',
                            backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.01)',
                          }}
                        >
                          <td style={{ padding: '8px 14px', color: '#CBD5E1' }}>
                            {formatDateTimeArabic(entry.date)}
                          </td>
                          <td style={{ padding: '8px 14px', color: '#F8FAFC', fontWeight: 600 }}>
                            {entry.description}
                          </td>
                          <td style={{ padding: '8px 14px', color: '#EF4444', fontWeight: 700 }}>
                            {entry.debit > 0 ? formatMoney(entry.debit) : '---'}
                          </td>
                          <td style={{ padding: '8px 14px', color: '#10B981', fontWeight: 700 }}>
                            {entry.credit > 0 ? formatMoney(entry.credit) : '---'}
                          </td>
                          <td style={{ padding: '8px 14px', color: '#FFB800', fontWeight: 800 }}>
                            {entry.balance_after !== undefined ? formatMoney(entry.balance_after) : '---'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* أزرار الإجراءات في كشف الحساب */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
                <Button
                  variant="secondary"
                  onClick={() => {
                    sounds.playClick();
                    window.print();
                  }}
                  style={{ height: 38, gap: 6 }}
                >
                  <Printer size={15} />
                  <span>طباعة كشف الحساب</span>
                </Button>
                <Button
                  variant="primary"
                  onClick={() => setShowStatementModal(false)}
                  style={{ width: 90, height: 38 }}
                >
                  إغلاق
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}

export default CustomersScreen;
