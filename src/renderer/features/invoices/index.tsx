import React, { useState, useEffect } from 'react';
import {
  FileText,
  Search,
  RefreshCw,
  Printer,
  Eye,
  CheckCircle2,
  XCircle,
  Coins,
  CreditCard,
  Layers,
  Calendar,
  User,
  ShoppingBag,
} from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Modal } from '../../components/common/Modal';
import { EmptyState } from '../../components/common/EmptyState';
import { InvoiceReceiptModal } from '../pos/components/InvoiceReceiptModal';
import { formatMoney } from '../../../shared/utils/money';
import { Sale } from '../../../shared/types/sales.types';
import { sounds } from '../../lib/sounds';
import { useToast } from '../../components/common/ToastContext';
import { formatDateArabic, formatTimeArabic } from '../../lib/formatters';

export function InvoicesScreen(): React.ReactElement {
  const { success: toastSuccess, error: toastError } = useToast();
  const [sales, setSales] = useState<Sale[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'sales' | 'repairs'>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

  const fetchSales = async () => {
    setIsLoading(true);
    try {
      const electron = (window as any).electron;
      if (electron?.listSales) {
        const res = await electron.listSales();
        if (res?.success && Array.isArray(res.data)) {
          setSales(res.data);
          return;
        }
      }
      setSales([]);
    } catch (err: any) {
      toastError(err.message || 'تعذر جلب سجل الفواتير');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSales();
  }, []);

  const handlePrintReceipt = async (sale: Sale) => {
    try {
      sounds.playClick();
      const electron = (window as any).electron;
      if (electron?.printReceipt) {
        const res = await electron.printReceipt(sale.id);
        if (res && !res.success) {
          sounds.playError();
          toastError(res.error || 'تعذر إرسال الفاتورة للطابعة الحرارية');
          return;
        }
        sounds.playSaleSuccess();
        toastSuccess(`تم إرسال الفاتورة #${sale.invoice_no} للطباعة`);
      }
    } catch (err: any) {
      sounds.playError();
      toastError(err.message || 'فشلت إعادة الطباعة');
    }
  };

  const getMethodBadge = (sale: Sale) => {
    const methods = sale.payments?.map((p) => p.method) || [];
    if (methods.includes('cash') && methods.includes('card')) {
      return (
        <span
          style={{
            backgroundColor: 'rgba(255, 184, 0, 0.15)',
            color: '#FFB800',
            border: '1px solid rgba(255, 184, 0, 0.3)',
            padding: '3px 8px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Layers size={13} />
          <span>مختلط (كاش + فيزا)</span>
        </span>
      );
    }
    if (methods.includes('card')) {
      return (
        <span
          style={{
            backgroundColor: 'rgba(59, 130, 246, 0.15)',
            color: '#60A5FA',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            padding: '3px 8px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <CreditCard size={13} />
          <span>بطاقة / فيزا</span>
        </span>
      );
    }
    return (
      <span
        style={{
          backgroundColor: 'rgba(16, 185, 129, 0.15)',
          color: '#34D399',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          padding: '3px 8px',
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 700,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <Coins size={13} />
        <span>نقدي (كاش)</span>
      </span>
    );
  };

  const filteredSales = sales.filter((s) => {
    const isRepair = s.notes?.includes('صيانة') || s.notes?.includes('REP-');

    const matchQuery =
      s.invoice_no?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(s.seq_no).includes(searchQuery) ||
      (s.notes && s.notes.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchStatus = statusFilter === 'all' || s.status === statusFilter;

    let matchType = true;
    if (typeFilter === 'repairs') {
      matchType = !!isRepair;
    } else if (typeFilter === 'sales') {
      matchType = !isRepair;
    }

    let matchMethod = true;
    if (methodFilter !== 'all') {
      const methods = s.payments?.map((p) => p.method) || [];
      matchMethod = methods.includes(methodFilter as any);
    }

    return matchQuery && matchStatus && matchType && matchMethod;
  });

  const totalFilteredAmount = filteredSales
    .filter((s) => s.status === 'completed')
    .reduce((sum, s) => sum + s.total, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      {/* بطاقات الإحصائيات العلوية */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <div
          className="glass-card"
          style={{ padding: '16px 18px', backgroundColor: '#161B22', border: '1px solid #262E3D' }}
        >
          <div style={{ fontSize: 12.5, color: '#94A3B8', fontWeight: 600 }}>إجمالي الفواتير المسجلة</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#FFB800', marginTop: 4 }}>
            {sales.length} فاتورة
          </div>
        </div>

        <div
          className="glass-card"
          style={{ padding: '16px 18px', backgroundColor: '#161B22', border: '1px solid #262E3D' }}
        >
          <div style={{ fontSize: 12.5, color: '#94A3B8', fontWeight: 600 }}>إجمالي قيمة الفواتير المعروضة</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#10B981', marginTop: 4 }}>
            {formatMoney(totalFilteredAmount)}
          </div>
        </div>

        <div
          className="glass-card"
          style={{ padding: '16px 18px', backgroundColor: '#161B22', border: '1px solid #262E3D' }}
        >
          <div style={{ fontSize: 12.5, color: '#94A3B8', fontWeight: 600 }}>فواتير مكتملة وناجحة</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#F8FAFC', marginTop: 4 }}>
            {sales.filter((s) => s.status === 'completed').length}
          </div>
        </div>

        <div
          className="glass-card"
          style={{ padding: '16px 18px', backgroundColor: '#161B22', border: '1px solid #262E3D' }}
        >
          <div style={{ fontSize: 12.5, color: '#94A3B8', fontWeight: 600 }}>فواتير ملغاة (Voided)</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#EF4444', marginTop: 4 }}>
            {sales.filter((s) => s.status === 'voided').length}
          </div>
        </div>
      </div>

      {/* شريط الفلاتر والبحث */}
      <div
        className="glass-card"
        style={{
          padding: '12px 18px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#161B22',
          border: '1px solid #262E3D',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flex: 1 }}>
          <div style={{ width: 280 }}>
            <Input
              placeholder="بحث برقم الفاتورة..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              icon={<Search size={15} />}
            />
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
            className="in"
            style={{ width: 160, height: 40, fontSize: 13, backgroundColor: '#0B0E14', color: '#F8FAFC', border: '1px solid #262E3D' }}
          >
            <option value="all">جميع أنواع الفواتير</option>
            <option value="sales">مبيعات المتجر</option>
            <option value="repairs">صيانة وورشة (عربون وتسوية)</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="in"
            style={{ width: 150, height: 40, fontSize: 13, backgroundColor: '#0B0E14', color: '#F8FAFC', border: '1px solid #262E3D' }}
          >
            <option value="all">جميع الحالات</option>
            <option value="completed">مكتملة فقط</option>
            <option value="voided">ملغاة فقط</option>
          </select>

          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
            className="in"
            style={{ width: 150, height: 40, fontSize: 13, backgroundColor: '#0B0E14', color: '#F8FAFC', border: '1px solid #262E3D' }}
          >
            <option value="all">جميع طرق الدفع</option>
            <option value="cash">نقدي (كاش)</option>
            <option value="card">بطاقة / فيزا</option>
          </select>
        </div>

        <Button
          variant="secondary"
          onClick={() => {
            sounds.playClick();
            fetchSales();
            toastSuccess('تم تحديث سجل الفواتير');
          }}
          style={{ height: 40 }}
        >
          <RefreshCw size={15} />
          <span>تحديث</span>
        </Button>
      </div>

      {/* جدول الفواتير */}
      {/* جدول الفواتير */}
      <div
        className="glass-card"
        style={{
          flex: 1,
          padding: 0,
          overflow: 'hidden',
          backgroundColor: '#161B22',
          border: '1px solid #262E3D',
          borderRadius: 14,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {filteredSales.length === 0 ? (
          <EmptyState
            icon={FileText}
            variant="brand"
            title="لا توجد فواتير مسجلة"
            description="لم يتم العثور على أي فاتورة مبيعات مطابقة لمعايير البحث في قاعدة البيانات"
          />
        ) : (
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
              <thead>
                <tr style={{ background: '#1C222D', borderBottom: '1px solid #262E3D' }}>
                  <th style={{ width: '5%', padding: '12px 14px', textAlign: 'center', color: '#94A3B8', fontSize: 13, fontWeight: 700 }}>#</th>
                  <th style={{ width: '16%', padding: '12px 14px', color: '#94A3B8', fontSize: 13, fontWeight: 700 }}>رقم الفاتورة</th>
                  <th style={{ width: '18%', padding: '12px 14px', color: '#94A3B8', fontSize: 13, fontWeight: 700 }}>التاريخ والوقت</th>
                  <th style={{ width: '14%', padding: '12px 14px', color: '#94A3B8', fontSize: 13, fontWeight: 700 }}>طريقة الدفع</th>
                  <th style={{ width: '12%', padding: '12px 14px', textAlign: 'center', color: '#94A3B8', fontSize: 13, fontWeight: 700 }}>عدد الأصناف</th>
                  <th style={{ width: '15%', padding: '12px 14px', textAlign: 'left', color: '#94A3B8', fontSize: 13, fontWeight: 700 }}>الإجمالي الصافي</th>
                  <th style={{ width: '10%', padding: '12px 14px', textAlign: 'center', color: '#94A3B8', fontSize: 13, fontWeight: 700 }}>الحالة</th>
                  <th style={{ width: '10%', padding: '12px 14px', textAlign: 'center', color: '#94A3B8', fontSize: 13, fontWeight: 700 }}>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredSales.map((s, idx) => {
                  const isVoided = s.status === 'voided';
                  const itemsCount = s.items?.reduce((sum, it) => sum + it.qty, 0) || 0;

                  return (
                    <tr
                      key={s.id}
                      style={{
                        borderBottom: '1px solid #262E3D',
                        backgroundColor: isVoided ? 'rgba(239, 68, 68, 0.08)' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '12px 14px', textAlign: 'center', color: '#64748B', fontSize: 13 }}>
                        {idx + 1}
                      </td>

                      <td style={{ padding: '12px 14px' }}>
                        {(() => {
                          const isRepair = s.notes?.includes('صيانة') || s.notes?.includes('REP-');
                          const isDeposit = s.notes?.includes('عربون');
                          return (
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <span
                                  style={{
                                    fontFamily: 'monospace',
                                    fontWeight: 700,
                                    fontSize: 13,
                                    color: '#FFB800',
                                    backgroundColor: '#0B0E14',
                                    border: '1px solid #262E3D',
                                    padding: '3px 8px',
                                    borderRadius: 6,
                                  }}
                                >
                                  {s.invoice_no}
                                </span>
                                {isRepair && isDeposit && (
                                  <span
                                    style={{
                                      backgroundColor: 'rgba(245, 158, 11, 0.15)',
                                      color: '#FBBF24',
                                      padding: '2px 8px',
                                      borderRadius: 6,
                                      fontSize: 11,
                                      fontWeight: 700,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4,
                                    }}
                                  >
                                    <span>عربون صيانة</span>
                                  </span>
                                )}
                                {isRepair && !isDeposit && (
                                  <span
                                    style={{
                                      backgroundColor: 'rgba(16, 185, 129, 0.15)',
                                      color: '#34D399',
                                      padding: '2px 8px',
                                      borderRadius: 6,
                                      fontSize: 11,
                                      fontWeight: 700,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4,
                                    }}
                                  >
                                    <span>تسوية صيانة</span>
                                  </span>
                                )}
                              </div>
                              {s.notes && (
                                <div
                                  style={{
                                    fontSize: 11,
                                    color: '#94A3B8',
                                    marginTop: 4,
                                    maxWidth: 320,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                  title={s.notes}
                                >
                                  {s.notes}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </td>

                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#F8FAFC' }}>
                            {formatDateArabic(s.created_at)}
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              color: '#94A3B8',
                              direction: 'ltr',
                              textAlign: 'right',
                              fontFamily: 'Space Grotesk, sans-serif',
                            }}
                          >
                            {formatTimeArabic(s.created_at)}
                          </span>
                        </div>
                      </td>

                      <td style={{ padding: '12px 14px' }}>
                        {getMethodBadge(s)}
                      </td>

                      <td style={{ padding: '12px 14px', textAlign: 'center', fontSize: 13, fontWeight: 600, color: '#CBD5E1' }}>
                        {itemsCount} قطعة
                      </td>

                      <td style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 800, fontSize: 15, color: isVoided ? '#EF4444' : '#FFB800' }}>
                        {formatMoney(s.total)}
                      </td>

                      <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                        {isVoided ? (
                          <span className="badge badge-danger">ملغاة</span>
                        ) : (
                          <span className="badge badge-success">مكتملة</span>
                        )}
                      </td>

                      <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                          <button
                            type="button"
                            onClick={() => {
                              sounds.playClick();
                              setSelectedSale(s);
                            }}
                            className="btn btn-secondary"
                            style={{ height: 30, padding: '0 8px', fontSize: 12 }}
                            title="عرض تفاصيل الفاتورة"
                          >
                            <Eye size={13} />
                          </button>

                          <button
                            type="button"
                            onClick={() => handlePrintReceipt(s)}
                            className="btn btn-secondary"
                            style={{ height: 30, padding: '0 8px', fontSize: 12 }}
                            title="إعادة طباعة الإيصال الحراري"
                          >
                            <Printer size={13} />
                          </button>
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

      {/* نافذة عرض ومعاينة الفاتورة قبل الطباعة */}
      <InvoiceReceiptModal
        isOpen={Boolean(selectedSale)}
        onClose={() => setSelectedSale(null)}
        sale={selectedSale}
      />
    </div>
  );
}

export default InvoicesScreen;
