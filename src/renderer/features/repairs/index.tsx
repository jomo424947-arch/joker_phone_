import React, { useState, useEffect } from 'react';
import {
  Wrench,
  Search,
  Plus,
  RefreshCw,
  Printer,
  Eye,
  CheckCircle2,
  Clock,
  Smartphone,
  Phone,
  AlertCircle,
  Coins,
  Filter,
  DollarSign,
  FileText,
} from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { EmptyState } from '../../components/common/EmptyState';
import { formatMoney } from '../../../shared/utils/money';
import { RepairOrder, RepairStatus } from '../../../shared/types/repairs.types';
import { formatDateArabic, formatTimeArabic } from '../../lib/formatters';
import { useToast } from '../../components/common/ToastContext';
import { api } from '../../lib/api';
import { NewRepairModal } from './components/NewRepairModal';
import { RepairDetailsModal } from './components/RepairDetailsModal';
import { DeliverRepairModal } from './components/DeliverRepairModal';
import { RepairReceiptModal } from './components/RepairReceiptModal';

const STATUS_CONFIG: Record<
  RepairStatus,
  { label: string; color: string; bg: string; border: string }
> = {
  received: { label: 'تم الاستلام', color: '#60A5FA', bg: 'rgba(96, 165, 250, 0.15)', border: '#3B82F6' },
  inspecting: { label: 'قيد الفحص', color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.15)', border: '#D97706' },
  pending_approval: { label: 'بانتظار الموافقة', color: '#A855F7', bg: 'rgba(168, 85, 247, 0.15)', border: '#9333EA' },
  in_progress: { label: 'جاري الإصلاح', color: '#FFB800', bg: 'rgba(255, 184, 0, 0.15)', border: '#FFB800' },
  ready: { label: 'جاهز للتسليم', color: '#10B981', bg: 'rgba(16, 185, 129, 0.15)', border: '#059669' },
  delivered: { label: 'تم التسليم', color: '#34D399', bg: 'rgba(52, 211, 153, 0.15)', border: '#10B981' },
  cancelled: { label: 'ملغي / تعذر', color: '#EF4444', bg: 'rgba(239, 68, 68, 0.15)', border: '#DC2626' },
};

export function RepairsScreen(): React.ReactElement {
  const { success: toastSuccess, error: toastError } = useToast();

  const [repairs, setRepairs] = useState<RepairOrder[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'pending' | 'paid'>('all');
  const [isLoading, setIsLoading] = useState(false);

  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [deliverOrder, setDeliverOrder] = useState<RepairOrder | null>(null);
  const [receiptOrder, setReceiptOrder] = useState<RepairOrder | null>(null);

  const [currentUserId, setCurrentUserId] = useState<number>(1);
  const [activeShiftId, setActiveShiftId] = useState<number | undefined>();

  const fetchCurrentUserAndShift = async () => {
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

  const fetchRepairs = async () => {
    setIsLoading(true);
    try {
      const res = await api.listRepairs();
      if (res?.success && Array.isArray(res.data)) {
        setRepairs(res.data);
      } else {
        setRepairs([]);
      }
    } catch (err: any) {
      toastError(err.message || 'تعذر جلب سجل الصيانة');
      setRepairs([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCurrentUserAndShift();
    fetchRepairs();
  }, []);

  const filteredRepairs = repairs.filter((r) => {
    const matchQuery =
      !searchQuery.trim() ||
      r.repairCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.customerPhone.includes(searchQuery) ||
      r.deviceModel.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.imeiSerial && r.imeiSerial.includes(searchQuery));

    const matchStatus = statusFilter === 'all' || r.status === statusFilter;

    let matchPayment = true;
    if (paymentFilter === 'pending') {
      matchPayment = r.remainingAmount > 0;
    } else if (paymentFilter === 'paid') {
      matchPayment = r.remainingAmount <= 0;
    }

    return matchQuery && matchStatus && matchPayment;
  });

  // إحصائيات سريعة وشاملة
  const totalCount = repairs.length;
  const inProgressCount = repairs.filter((r) =>
    ['received', 'inspecting', 'pending_approval', 'in_progress'].includes(r.status)
  ).length;
  const readyCount = repairs.filter((r) => r.status === 'ready').length;
  const deliveredCount = repairs.filter((r) => r.status === 'delivered').length;
  const totalPendingAmount = repairs
    .filter((r) => r.status !== 'delivered' && r.status !== 'cancelled')
    .reduce((sum, r) => sum + (r.remainingAmount || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%', width: '100%' }}>
      {/* بطاقات الإحصائيات العلوية الخمسة */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14 }}>
        <div
          className="glass-card"
          style={{ padding: '14px 16px', backgroundColor: '#161B22', border: '1px solid #262E3D' }}
        >
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>إجمالي أجهزة الورشة</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#FFB800', marginTop: 4 }}>
            {totalCount} جهاز
          </div>
        </div>

        <div
          className="glass-card"
          style={{ padding: '14px 16px', backgroundColor: '#161B22', border: '1px solid #262E3D' }}
        >
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>قيد الفحص والإصلاح</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#F59E0B', marginTop: 4 }}>
            {inProgressCount} جهاز
          </div>
        </div>

        <div
          className="glass-card"
          style={{ padding: '14px 16px', backgroundColor: '#161B22', border: '1px solid #262E3D' }}
        >
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>جاهز للتسليم للعميل</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#10B981', marginTop: 4 }}>
            {readyCount} جهاز
          </div>
        </div>

        <div
          className="glass-card"
          style={{ padding: '14px 16px', backgroundColor: '#161B22', border: '1px solid #262E3D' }}
        >
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>تم التسليم والمحاسبة</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#34D399', marginTop: 4 }}>
            {deliveredCount} جهاز
          </div>
        </div>

        <div
          className="glass-card"
          style={{ padding: '14px 16px', backgroundColor: '#161B22', border: '1px solid rgba(255, 184, 0, 0.4)' }}
        >
          <div style={{ fontSize: 12, color: '#FFB800' }}>متبقيات مستحقة للتحصيل</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#FFB800', marginTop: 4 }}>
            {formatMoney(totalPendingAmount)}
          </div>
        </div>
      </div>

      {/* شريط الإجراءات والبحث المنسق */}
      <div
        className="glass-card"
        style={{
          padding: '12px 18px',
          backgroundColor: '#161B22',
          border: '1px solid #262E3D',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', gap: 10, flex: 1, maxWidth: 750, alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <Input
              placeholder="بحث بكود الصيانة، اسم العميل، الهاتف، موديل الجهاز أو IMEI..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              prefix={<Search size={16} color="var(--text-muted)" />}
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: '8px 12px',
              backgroundColor: '#0B0E14',
              border: '1px solid #262E3D',
              borderRadius: 8,
              color: '#F0F6FC',
              fontSize: 13,
              outline: 'none',
              cursor: 'pointer',
              minWidth: 140,
            }}
          >
            <option value="all">جميع الحالات</option>
            <option value="received">تم الاستلام</option>
            <option value="inspecting">قيد الفحص</option>
            <option value="in_progress">جاري الإصلاح</option>
            <option value="ready">جاهز للتسليم</option>
            <option value="delivered">تم التسليم</option>
            <option value="cancelled">ملغي / تعذر</option>
          </select>

          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value as any)}
            style={{
              padding: '8px 12px',
              backgroundColor: '#0B0E14',
              border: '1px solid #262E3D',
              borderRadius: 8,
              color: '#F0F6FC',
              fontSize: 13,
              outline: 'none',
              cursor: 'pointer',
              minWidth: 140,
            }}
          >
            <option value="all">جميع الحسابات</option>
            <option value="pending">عليه متبقي للتحصيل</option>
            <option value="paid">مسدد بالكامل</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="outline" size="sm" onClick={fetchRepairs} disabled={isLoading}>
            <RefreshCw size={15} className={isLoading ? 'spin' : ''} style={{ marginLeft: 4 }} />
            تحديث
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowNewModal(true)}
            style={{
              backgroundColor: '#FFB800',
              color: '#000000',
              fontWeight: 800,
              padding: '8px 16px',
            }}
          >
            <Plus size={16} style={{ marginLeft: 6 }} />
            استلام جهاز جديد للصيانة
          </Button>
        </div>
      </div>

      {/* جدول أوامر الصيانة بكامل العرض وبأبعاد منسقة */}
      <div
        className="glass-card"
        style={{
          flex: 1,
          backgroundColor: '#161B22',
          border: '1px solid #262E3D',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {filteredRepairs.length === 0 ? (
          <EmptyState
            title="لا توجد أوامر صيانة مسجلة"
            description="يمكنك استلام جهاز عميل جديد وبدء تسجيل عطل ومراحل الإصلاح وقبض العربون."
            actionLabel="استلام جهاز الآن"
            onAction={() => setShowNewModal(true)}
          />
        ) : (
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', tableLayout: 'auto' }}>
              <thead>
                <tr
                  style={{
                    backgroundColor: '#0B0E14',
                    borderBottom: '1px solid #262E3D',
                    color: '#94A3B8',
                    fontSize: 12,
                    position: 'sticky',
                    top: 0,
                    zIndex: 2,
                  }}
                >
                  <th style={{ padding: '12px 14px', width: '9%' }}>كود الصيانة</th>
                  <th style={{ padding: '12px 14px', width: '14%' }}>العميل</th>
                  <th style={{ padding: '12px 14px', width: '14%' }}>الجهاز والموديل</th>
                  <th style={{ padding: '12px 14px', width: '18%' }}>العطل المشتكى منه</th>
                  <th style={{ padding: '12px 14px', width: '10%' }}>الحالة</th>
                  <th style={{ padding: '12px 14px', width: '8%' }}>الإجمالي</th>
                  <th style={{ padding: '12px 14px', width: '8%' }}>العربون/المدفوع</th>
                  <th style={{ padding: '12px 14px', width: '9%' }}>المتبقي</th>
                  <th style={{ padding: '12px 14px', width: '8%' }}>التاريخ</th>
                  <th style={{ padding: '12px 14px', textAlign: 'center', width: '10%' }}>إجراءات</th>
                </tr>
              </thead>
              <tbody style={{ fontSize: 13 }}>
                {filteredRepairs.map((order) => {
                  const statusConf = STATUS_CONFIG[order.status] || STATUS_CONFIG.received;
                  const isDelivered = order.status === 'delivered';
                  const hasRemaining = order.remainingAmount > 0;

                  return (
                    <tr
                      key={order.id}
                      style={{
                        borderBottom: '1px solid #1C222D',
                        cursor: 'pointer',
                        transition: 'background-color 0.15s ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1C222D')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      onClick={() => setSelectedOrderId(order.id)}
                    >
                      {/* كود الصيانة */}
                      <td style={{ padding: '12px 14px', fontWeight: 800, color: '#FFB800' }}>
                        <div>{order.repairCode}</div>
                        {order.depositInvoiceNo && (
                          <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 500 }}>
                            عربون: #{order.depositInvoiceNo}
                          </div>
                        )}
                        {order.deliveryInvoiceNo && (
                          <div style={{ fontSize: 10, color: '#34D399', fontWeight: 500 }}>
                            تسليم: #{order.deliveryInvoiceNo}
                          </div>
                        )}
                      </td>

                      {/* العميل */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 600 }}>{order.customerName}</div>
                        <div style={{ fontSize: 11, color: '#94A3B8', direction: 'ltr', textAlign: 'right' }}>
                          {order.customerPhone}
                        </div>
                      </td>

                      {/* الجهاز والموديل */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 700 }}>
                          {order.deviceBrand} {order.deviceModel}
                        </div>
                        {order.deviceColor && (
                          <div style={{ fontSize: 11, color: '#94A3B8' }}>{order.deviceColor}</div>
                        )}
                      </td>

                      {/* العطل */}
                      <td style={{ padding: '12px 14px', maxWidth: 220 }}>
                        <div
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            color: '#CBD5E1',
                          }}
                          title={order.reportedIssue}
                        >
                          {order.reportedIssue}
                        </div>
                      </td>

                      {/* الحالة */}
                      <td style={{ padding: '12px 14px' }}>
                        <span
                          style={{
                            backgroundColor: statusConf.bg,
                            color: statusConf.color,
                            border: `1px solid ${statusConf.border}`,
                            padding: '3px 10px',
                            borderRadius: 12,
                            fontSize: 11,
                            fontWeight: 700,
                            display: 'inline-block',
                          }}
                        >
                          {statusConf.label}
                        </span>
                      </td>

                      {/* الإجمالي */}
                      <td style={{ padding: '12px 14px', fontWeight: 700 }}>
                        {formatMoney(order.totalCost || order.estimatedCost)}
                      </td>

                      {/* العربون / المدفوع */}
                      <td style={{ padding: '12px 14px', fontWeight: 600, color: '#10B981' }}>
                        {formatMoney(order.paidAmount)}
                      </td>

                      {/* المتبقي */}
                      <td style={{ padding: '12px 14px' }}>
                        {hasRemaining ? (
                          <span
                            style={{
                              backgroundColor: 'rgba(255, 184, 0, 0.12)',
                              color: '#FFB800',
                              border: '1px solid rgba(255, 184, 0, 0.3)',
                              padding: '2px 8px',
                              borderRadius: 6,
                              fontSize: 12,
                              fontWeight: 800,
                              display: 'inline-block',
                            }}
                          >
                            {formatMoney(order.remainingAmount)}
                          </span>
                        ) : (
                          <span
                            style={{
                              backgroundColor: 'rgba(52, 211, 153, 0.12)',
                              color: '#34D399',
                              border: '1px solid rgba(52, 211, 153, 0.3)',
                              padding: '2px 8px',
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 700,
                              display: 'inline-block',
                            }}
                          >
                            خالص ومسدد
                          </span>
                        )}
                      </td>

                      {/* التاريخ */}
                      <td style={{ padding: '12px 14px', fontSize: 11, color: '#94A3B8' }}>
                        {formatDateArabic(order.createdAt)}
                      </td>

                      {/* الإجراءات */}
                      <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                        <div
                          style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* زر التسليم السريع للمحاسبة */}
                          {!isDelivered && order.status !== 'cancelled' && (
                            <Button
                              variant="primary"
                              size="sm"
                              style={{
                                backgroundColor: order.status === 'ready' ? '#10B981' : '#161B22',
                                borderColor: order.status === 'ready' ? '#10B981' : '#34D399',
                                color: order.status === 'ready' ? '#FFFFFF' : '#34D399',
                                padding: '3px 8px',
                                fontSize: 11,
                                fontWeight: 700,
                              }}
                              onClick={() => setDeliverOrder(order)}
                              title="تسليم الجهاز للعميل والمحاسبة الفورية"
                            >
                              <CheckCircle2 size={13} style={{ marginLeft: 3 }} />
                              تسليم
                            </Button>
                          )}

                          <Button
                            variant="outline"
                            size="sm"
                            style={{ padding: '4px 8px' }}
                            onClick={() => setSelectedOrderId(order.id)}
                            title="عرض وتعديل أمر الصيانة"
                          >
                            <Eye size={14} />
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            style={{ padding: '4px 8px' }}
                            onClick={() => setReceiptOrder(order)}
                            title="طباعة إيصال الصيانة أو التسليم"
                          >
                            <Printer size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* نوافذ الحوار المنبثقة */}
      {showNewModal && (
        <NewRepairModal
          userId={currentUserId}
          shiftId={activeShiftId}
          onClose={() => setShowNewModal(false)}
          onSuccess={(order) => {
            setShowNewModal(false);
            fetchRepairs();
            setReceiptOrder(order);
          }}
        />
      )}

      {selectedOrderId !== null && (
        <RepairDetailsModal
          orderId={selectedOrderId}
          userId={currentUserId}
          onClose={() => setSelectedOrderId(null)}
          onUpdate={fetchRepairs}
        />
      )}

      {deliverOrder && (
        <DeliverRepairModal
          order={deliverOrder}
          userId={currentUserId}
          shiftId={activeShiftId}
          onClose={() => setDeliverOrder(null)}
          onSuccess={(delivered) => {
            setDeliverOrder(null);
            fetchRepairs();
            setReceiptOrder(delivered);
          }}
        />
      )}

      {receiptOrder && (
        <RepairReceiptModal order={receiptOrder} onClose={() => setReceiptOrder(null)} />
      )}
    </div>
  );
}
