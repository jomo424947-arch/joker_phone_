import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  UserPlus,
  UserCheck,
  Phone,
  Coins,
  ShieldCheck,
  X,
  Plus,
  Check,
  Loader2,
  Users,
} from 'lucide-react';
import { Modal } from '../../../components/common/Modal';
import { Button } from '../../../components/common/Button';
import { GlassIcon } from '../../../components/common/GlassIcon';
import { formatMoney } from '../../../../shared/utils/money';
import { Customer, CreateCustomerInput } from '../../../../shared/types/customers.types';
import { sounds } from '../../../lib/sounds';
import { api } from '../../../lib/api';
import { useToast } from '../../../components/common/ToastContext';

interface CustomerSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCustomer: (customer: Customer) => void;
  currentCustomerId?: number | null;
  zIndex?: number;
}

export function CustomerSelectModal({
  isOpen,
  onClose,
  onSelectCustomer,
  currentCustomerId,
  zIndex = 1100,
}: CustomerSelectModalProps): React.ReactElement | null {
  const { success: toastSuccess, error: toastError } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAddingNew, setIsAddingNew] = useState(false);

  // حقول إضافة عميل جديد
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newCreditLimitEgp, setNewCreditLimitEgp] = useState('5000');
  const [isSubmittingNew, setIsSubmittingNew] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const newNameInputRef = useRef<HTMLInputElement>(null);

  // جلب العملاء عند فتح النافذة أو تغيير البحث
  const fetchCustomers = async (query = '') => {
    setIsLoading(true);
    try {
      if (api?.listCustomers) {
        const res = await api.listCustomers({
          search: query.trim() || undefined,
          isActive: true,
          limit: 40,
        });
        if (res?.success && Array.isArray(res.data)) {
          setCustomers(res.data);
        } else if (Array.isArray(res)) {
          setCustomers(res as any);
        } else {
          setCustomers([]);
        }
      }
    } catch (err: any) {
      console.error('Failed to list customers:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setIsAddingNew(false);
      setSearchQuery('');
      setNewName('');
      setNewPhone('');
      setNewCreditLimitEgp('5000');
      fetchCustomers('');
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || isAddingNew) return;
    const timer = setTimeout(() => {
      fetchCustomers(searchQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery, isOpen, isAddingNew]);

  useEffect(() => {
    if (isAddingNew) {
      setTimeout(() => {
        newNameInputRef.current?.focus();
      }, 100);
    }
  }, [isAddingNew]);

  const handleSelect = (customer: Customer) => {
    sounds.playClick();
    onSelectCustomer(customer);
    onClose();
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newName.trim();
    if (!cleanName) {
      sounds.playError();
      toastError('يرجى إدخال اسم العميل');
      return;
    }

    setIsSubmittingNew(true);
    try {
      const creditLimitPiasters = Math.round((parseFloat(newCreditLimitEgp) || 0) * 100);
      const input: CreateCustomerInput = {
        name: cleanName,
        phone: newPhone.trim() || null,
        credit_limit: creditLimitPiasters,
        initial_balance: 0,
      };

      const res = await api.createCustomer({ data: input, userId: 1 });
      if (res?.success && res.data) {
        sounds.playSuccess();
        toastSuccess(`تم تسجيل العميل "${cleanName}" واختياره بنجاح`);
        onSelectCustomer(res.data);
        onClose();
      } else {
        sounds.playError();
        toastError(res?.error?.message || 'فشل في إضافة العميل');
      }
    } catch (err: any) {
      sounds.playError();
      toastError(err?.message || 'خطأ أثناء تسجيل العميل');
    } finally {
      setIsSubmittingNew(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isAddingNew ? 'تسجيل عميل جديد سريعاً' : 'تحديد عميل المبيعات / الآجل'}
      icon={<GlassIcon icon={Users} size="sm" variant="brand" />}
      width={560}
      zIndex={zIndex}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, direction: 'rtl' }}>
        {/* شريط الإجراءات والتبديل */}
        {!isAddingNew ? (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div
              style={{
                flex: 1,
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Search
                size={18}
                style={{
                  position: 'absolute',
                  right: 12,
                  color: '#94A3B8',
                  pointerEvents: 'none',
                }}
              />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث بالاسم أو رقم الهاتف..."
                className="in"
                style={{
                  paddingRight: 38,
                  height: 42,
                  fontSize: 14,
                  width: '100%',
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  style={{
                    position: 'absolute',
                    left: 10,
                    background: 'none',
                    border: 'none',
                    color: '#94A3B8',
                    cursor: 'pointer',
                    padding: 4,
                  }}
                >
                  <X size={16} />
                </button>
              )}
            </div>

            <Button
              variant="primary"
              onClick={() => {
                sounds.playClick();
                setNewName(searchQuery);
                setIsAddingNew(true);
              }}
              style={{
                height: 42,
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '0 14px',
              }}
            >
              <Plus size={16} />
              <span>عميل جديد</span>
            </Button>
          </div>
        ) : (
          /* نموذج إضافة عميل جديد سريع */
          <form
            onSubmit={handleCreateCustomer}
            style={{
              background: '#161B22',
              border: '1px solid #262E3D',
              borderRadius: 12,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#F8FAFC', marginBottom: 6 }}>
                اسم العميل <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <input
                ref={newNameInputRef}
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="أدخل اسم العميل ثلاثي أو الاسم التجاري..."
                className="in"
                style={{ height: 40, fontSize: 14 }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#F8FAFC', marginBottom: 6 }}>
                  رقم الهاتف (اختياري)
                </label>
                <input
                  type="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="01XXXXXXXXX"
                  className="in"
                  style={{ height: 40, fontSize: 14 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#F8FAFC', marginBottom: 6 }}>
                  الحد الائتماني (ج.م)
                </label>
                <input
                  type="number"
                  step="any"
                  value={newCreditLimitEgp}
                  onChange={(e) => setNewCreditLimitEgp(e.target.value)}
                  placeholder="5000"
                  className="in"
                  style={{ height: 40, fontSize: 14 }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
              <Button
                variant="secondary"
                type="button"
                onClick={() => {
                  sounds.playClick();
                  setIsAddingNew(false);
                }}
                disabled={isSubmittingNew}
              >
                إلغاء والعودة
              </Button>
              <Button
                variant="primary"
                type="submit"
                disabled={isSubmittingNew}
                style={{ minWidth: 130 }}
              >
                {isSubmittingNew ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Loader2 size={16} className="animate-spin" />
                    <span>جاري الحفظ...</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <UserPlus size={16} />
                    <span>حفظ واختيار</span>
                  </div>
                )}
              </Button>
            </div>
          </form>
        )}

        {/* قائمة استعراض العملاء */}
        {!isAddingNew && (
          <div
            style={{
              maxHeight: 340,
              overflowY: 'auto',
              borderRadius: 12,
              border: '1px solid #262E3D',
              background: '#0B0E14',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {isLoading ? (
              <div
                style={{
                  padding: 30,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 10,
                  color: '#94A3B8',
                }}
              >
                <Loader2 size={24} className="animate-spin" color="#FFB800" />
                <span style={{ fontSize: 13 }}>جاري تحميل بيانات العملاء...</span>
              </div>
            ) : customers.length === 0 ? (
              <div
                style={{
                  padding: '30px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                  gap: 10,
                }}
              >
                <Users size={32} color="#64748B" />
                <div style={{ fontSize: 14, fontWeight: 700, color: '#F8FAFC' }}>
                  {searchQuery ? `لم يتم العثور على عميل باسم "${searchQuery}"` : 'لا يوجد عملاء مسجلين حالياً'}
                </div>
                <div style={{ fontSize: 12, color: '#94A3B8' }}>
                  يمكنك تسجيل هذا العميل فوراً بالنقر على الزر أدناه
                </div>
                <Button
                  variant="primary"
                  onClick={() => {
                    sounds.playClick();
                    setNewName(searchQuery);
                    setIsAddingNew(true);
                  }}
                  style={{ marginTop: 8 }}
                >
                  <Plus size={16} />
                  <span>تسجيل "{searchQuery || 'عميل جديد'}" الآن</span>
                </Button>
              </div>
            ) : (
              customers.map((c) => {
                const isSelected = currentCustomerId === c.id;
                const hasDebt = (c.balance || 0) > 0;

                return (
                  <div
                    key={c.id}
                    onClick={() => handleSelect(c)}
                    style={{
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderBottom: '1px solid #1C222D',
                      cursor: 'pointer',
                      transition: 'background 0.15s ease',
                      backgroundColor: isSelected
                        ? 'rgba(255, 184, 0, 0.12)'
                        : 'transparent',
                      borderRight: isSelected ? '4px solid #FFB800' : '4px solid transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = '#161B22';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: '50%',
                          backgroundColor: isSelected ? '#FFB800' : '#1C222D',
                          color: isSelected ? '#000' : '#FFB800',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 800,
                          fontSize: 15,
                        }}
                      >
                        {c.name.charAt(0)}
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#F8FAFC' }}>
                            {c.name}
                          </span>
                          {isSelected && (
                            <span
                              style={{
                                fontSize: 10.5,
                                padding: '1px 6px',
                                borderRadius: 4,
                                backgroundColor: '#FFB800',
                                color: '#000',
                                fontWeight: 800,
                              }}
                            >
                              المحدد حالياً
                            </span>
                          )}
                        </div>
                        {c.phone ? (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              fontSize: 12,
                              color: '#94A3B8',
                              marginTop: 2,
                            }}
                          >
                            <Phone size={11} />
                            <span style={{ direction: 'ltr' }}>{c.phone}</span>
                          </div>
                        ) : (
                          <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                            بدون رقم هاتف
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 11, color: '#94A3B8' }}>المديونية:</span>
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 800,
                            color: hasDebt ? '#EF4444' : '#10B981',
                          }}
                        >
                          {formatMoney(c.balance || 0)}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: '#64748B' }}>
                        الحد الائتماني: {formatMoney(c.credit_limit || 0)}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* زر إغلاق بالأسفل */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4 }}>
          <Button variant="secondary" onClick={onClose} style={{ minWidth: 90 }}>
            إغلاق
          </Button>
        </div>
      </div>
    </Modal>
  );
}
