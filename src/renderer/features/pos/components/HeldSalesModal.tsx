import React, { useState, useEffect, useCallback } from 'react';
import { PauseCircle, PlayCircle, Clock, Trash2, ShoppingBag } from 'lucide-react';
import { Modal } from '../../../components/common/Modal';
import { Button } from '../../../components/common/Button';
import { GlassIcon } from '../../../components/common/GlassIcon';
import { EmptyState } from '../../../components/common/EmptyState';
import { formatMoney } from '../../../../shared/utils/money';
import { sounds } from '../../../lib/sounds';
import { useToast } from '../../../components/common/ToastContext';
import { MESSAGES } from '../../../lib/messages';

interface HeldSale {
  id: string;
  hold_no?: number;
  customer_name?: string;
  total_amount?: number;
  item_count?: number;
  created_at: string;
  cart_data?: string;
  payload?: string;
}

interface HeldSalesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onResume: (cartItems: any[], customerName?: string) => void;
}

export function HeldSalesModal({
  isOpen,
  onClose,
  onResume,
}: HeldSalesModalProps): React.ReactElement | null {
  const { success: toastSuccess, error: toastError } = useToast();
  const [heldList, setHeldList] = useState<HeldSale[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;

    const fetchHeld = async () => {
      setIsLoading(true);
      try {
        const electron = (window as any).electron;
        if (electron?.getHeldSales) {
          const res = await electron.getHeldSales();
          if (res?.success && Array.isArray(res.data)) {
            setHeldList(res.data);
          }
        }
      } catch (err: any) {
        toastError(err.message || 'تعذر تحميل الفواتير المعلقة');
      } finally {
        setIsLoading(false);
      }
    };

    fetchHeld();
  }, [isOpen]);

  if (!isOpen) return null;

  /**
   * استخراج عناصر السلة من بيانات الفاتورة المعلقة بأمان
   */
  const extractCartItems = (sale: HeldSale): any[] => {
    // أولاً: محاولة cart_data (الحقل الذي يُرجعه الـ service بعد الإصلاح)
    const rawData = sale.cart_data || sale.payload;
    if (!rawData) return [];

    try {
      let parsed = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;

      // لو الـ payload كان يحتوي على { cart, customerName }
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.cart) {
        parsed = parsed.cart;
      }

      // لو كان string مغلف مرتين
      if (typeof parsed === 'string') {
        parsed = JSON.parse(parsed);
      }

      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const handleDelete = async (saleId: string) => {
    sounds.playDelete();
    try {
      const electron = (window as any).electron;
      if (electron?.deleteHeldSale) {
        await electron.deleteHeldSale(saleId);
      } else if (electron?.invoke) {
        await electron.invoke('sales:delete-held', saleId);
      }
      setHeldList((prev) => prev.filter((item) => item.id !== saleId));
      toastSuccess('تم إلغاء وحذف الفاتورة المعلقة');
    } catch (err: any) {
      toastError(err.message || 'تعذر حذف الفاتورة');
    }
  };

  const handleResume = async (sale: HeldSale) => {
    sounds.playClick();
    try {
      const electron = (window as any).electron;
      const parsedItems = extractCartItems(sale);

      if (parsedItems.length === 0) {
        toastError('بيانات الفاتورة المعلقة فارغة أو تالفة');
        return;
      }

      // حذف الفاتورة المعلقة من قاعدة البيانات
      if (electron?.resumeHeldSale) {
        const res = await electron.resumeHeldSale(sale.id);
        if (res && res.success === false) {
          throw new Error(res.error || 'تعذر استئناف الفاتورة');
        }
      } else if (electron?.invoke) {
        const res = await electron.invoke('sales:resume-held', sale.id);
        if (res && res.success === false) {
          throw new Error(res.error || 'تعذر استئناف الفاتورة');
        }
      }

      toastSuccess(MESSAGES.SALE_RESUMED);
      onResume(parsedItems, sale.customer_name);
      onClose();
    } catch (err: any) {
      toastError(err.message || 'تعذر استئناف الفاتورة');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="قائمة الفواتير المعلقة"
      icon={<GlassIcon icon={PauseCircle} size="sm" variant="gold" />}
      width={600}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, direction: 'rtl' }}>
        {heldList.length === 0 ? (
          <EmptyState
            icon={ShoppingBag}
            variant="gold"
            title="لا توجد فواتير معلقة حالياً"
            description="يمكنك تعليق أي فاتورة جارية بالضغط على F6 واستئنافها في أي وقت"
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 400, overflowY: 'auto' }}>
            {heldList.map((item) => {
              const safeTotal = typeof item.total_amount === 'number' && !isNaN(item.total_amount)
                ? item.total_amount
                : 0;
              const safeCount = typeof item.item_count === 'number' && !isNaN(item.item_count)
                ? item.item_count
                : 0;

              return (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 16px',
                    borderRadius: 12,
                    border: '1px solid rgba(255, 184, 0, 0.25)',
                    backgroundColor: 'rgba(255, 184, 0, 0.08)',
                    transition: 'background 0.15s ease',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#F8FAFC' }}>
                      {item.customer_name || 'عميل نقدي سريع'}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={13} color="#FFB800" />
                        <span>{new Date(item.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <span>•</span>
                      <span>{safeCount || 1} منتجات</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontSize: 17, fontWeight: 800, color: '#FFB800', marginLeft: 4 }}>
                      {formatMoney(safeTotal)}
                    </div>
                    <Button
                      variant="primary"
                      onClick={() => handleResume(item)}
                      style={{ height: 38, padding: '0 14px', fontSize: 13 }}
                    >
                      <PlayCircle size={15} />
                      <span>استئناف</span>
                    </Button>
                    <button
                      type="button"
                      title="حذف الفاتورة المعلقة"
                      onClick={() => handleDelete(item.id)}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        color: '#EF4444',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.25)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
          <Button
            variant="secondary"
            onClick={() => {
              sounds.playClick();
              onClose();
            }}
          >
            إغلاق
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default HeldSalesModal;

