import React, { useState, useEffect } from 'react';
import { Package, History, TrendingUp, Layers, Calendar, User, Clock, AlertCircle } from 'lucide-react';
import { Modal } from '../../../components/common/Modal';
import { Button } from '../../../components/common/Button';
import { GlassIcon } from '../../../components/common/GlassIcon';
import { ProductItemRow } from '../types';
import { formatMoney } from '../../../../shared/utils/money';

interface StockCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: ProductItemRow | null;
}

export function StockCardModal({ isOpen, onClose, product }: StockCardModalProps): React.ReactElement | null {
  const [activeTab, setActiveTab] = useState<'movements' | 'priceHistory'>('movements');
  const [movements, setMovements] = useState<any[]>([]);
  const [priceHistory, setPriceHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen && product) {
      loadData(product.id);
    }
  }, [isOpen, product]);

  const loadData = async (productId: number) => {
    setIsLoading(true);
    try {
      const electron = (window as any).electron;
      if (electron?.getProductStockCard) {
        const res = await electron.getProductStockCard(productId);
        if (res?.success && Array.isArray(res.data)) {
          setMovements(res.data);
        }
      }
      if (electron?.getProductPriceHistory) {
        const pRes = await electron.getProductPriceHistory(productId);
        if (pRes?.success && Array.isArray(pRes.data)) {
          setPriceHistory(pRes.data);
        }
      }
    } catch (err) {
      console.error('فشل تحميل كارت الصنف:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen || !product) return null;

  const getMovementLabel = (type: string) => {
    switch (type) {
      case 'purchase':
        return { label: 'فاتورة شراء', color: '#1B5E20', bg: '#E8F5E9' };
      case 'sale':
        return { label: 'فاتورة بيع', color: '#0D47A1', bg: '#E3F2FD' };
      case 'sale_return':
        return { label: 'مرتجع بيع', color: '#E65100', bg: '#FFF3E0' };
      case 'purchase_return':
        return { label: 'مرتجع شراء', color: '#B71C1C', bg: '#FFEBEE' };
      case 'adjust_in':
        return { label: 'تسوية إضافة (جرد)', color: '#2E7D32', bg: '#E8F5E9' };
      case 'adjust_out':
        return { label: 'تسوية عجز (جرد)', color: '#C62828', bg: '#FFEBEE' };
      case 'expired':
        return { label: 'إهلاك منتهي صلاحية', color: '#880E4F', bg: '#FCE4EC' };
      case 'tester':
        return { label: 'عينة تجربة (تستر)', color: '#4A148C', bg: '#F3E5F5' };
      default:
        return { label: type, color: '#374151', bg: '#F3F4F6' };
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`كارت حركة الصنف: ${product.name}`}
      icon={<GlassIcon icon={Package} size="sm" variant="primary" />}
      width={760}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, direction: 'rtl' }}>
        {/* ملخص المنتج */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 10,
            padding: '12px 16px',
            backgroundColor: '#1C222D',
            borderRadius: 10,
            border: '1px solid #262E3D',
          }}
        >
          <div>
            <div style={{ fontSize: 11, color: '#94A3B8' }}>القسم والماركة</div>
            <div style={{ fontWeight: 700, fontSize: 13, marginTop: 2, color: '#F8FAFC' }}>
              {product.category} - {product.brand}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#94A3B8' }}>الباركود الأساسي</div>
            <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13, marginTop: 2, color: '#F8FAFC' }}>
              {product.primaryBarcode || '---'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#94A3B8' }}>سعر البيع الحالي</div>
            <div style={{ fontWeight: 800, fontSize: 14, color: '#FFB800', marginTop: 2 }}>
              {formatMoney(product.price || 0)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#94A3B8' }}>الرصيد المتبقي</div>
            <div style={{ fontWeight: 800, fontSize: 14, color: product.totalStock > 0 ? '#10B981' : '#EF4444', marginTop: 2 }}>
              {product.totalStock} {product.unit}
            </div>
          </div>
        </div>

        {/* أزرار التبويبات */}
        <div style={{ display: 'flex', gap: 8, borderBottom: '1.5px solid #262E3D', paddingBottom: 6 }}>
          <button
            type="button"
            onClick={() => setActiveTab('movements')}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              backgroundColor: activeTab === 'movements' ? '#FFB800' : 'transparent',
              color: activeTab === 'movements' ? '#0B0E14' : '#94A3B8',
              fontWeight: 800,
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: activeTab === 'movements' ? '0 2px 8px rgba(255, 184, 0, 0.3)' : 'none',
              transition: 'all 0.2s ease',
            }}
          >
            <History size={15} />
            <span>سجل حركات المخزون ({movements.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('priceHistory')}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              backgroundColor: activeTab === 'priceHistory' ? '#FFB800' : 'transparent',
              color: activeTab === 'priceHistory' ? '#0B0E14' : '#94A3B8',
              fontWeight: 800,
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: activeTab === 'priceHistory' ? '0 2px 8px rgba(255, 184, 0, 0.3)' : 'none',
              transition: 'all 0.2s ease',
            }}
          >
            <TrendingUp size={15} />
            <span>تاريخ تغير الأسعار ({priceHistory.length})</span>
          </button>
        </div>

        {/* محتوى التبويب */}
        <div style={{ minHeight: 280, maxHeight: 380, overflowY: 'auto' }}>
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
              جاري تحميل سجل الصنف...
            </div>
          ) : activeTab === 'movements' ? (
            movements.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '50px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                لا توجد حركات مخزنية مسجلة على هذا الصنف بعد
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#1C222D', borderBottom: '1px solid #262E3D', color: '#94A3B8' }}>
                    <th style={{ padding: '8px 10px' }}>التاريخ والوقت</th>
                    <th style={{ padding: '8px 10px' }}>نوع الحركة</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center' }}>الكمية</th>
                    <th style={{ padding: '8px 10px' }}>الدفعة / الصلاحية</th>
                    <th style={{ padding: '8px 10px' }}>المسؤول / الملاحظات</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => {
                    const badge = getMovementLabel(m.type);
                    const isPositive = m.qty > 0;
                    return (
                      <tr key={m.id} style={{ borderBottom: '1px solid #262E3D' }}>
                        <td style={{ padding: '8px 10px', color: '#94A3B8' }}>
                          {m.created_at?.slice(0, 16).replace('T', ' ')}
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <span
                            style={{
                              backgroundColor: badge.bg,
                              color: badge.color,
                              padding: '2px 8px',
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 600,
                            }}
                          >
                            {badge.label}
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 800 }}>
                          <span style={{ color: isPositive ? '#10B981' : '#EF4444' }}>
                            {isPositive ? `+${m.qty}` : m.qty}
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <div style={{ fontFamily: 'monospace', fontWeight: 600, color: '#F8FAFC' }}>{m.batch_no || '---'}</div>
                          {m.expiry_date && (
                            <div style={{ fontSize: 10, color: '#94A3B8' }}>
                              صلاحية: {m.expiry_date}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '8px 10px', color: '#F8FAFC' }}>
                          <div>{m.user_name || 'النظام'}</div>
                          {m.note && <div style={{ fontSize: 10, color: '#94A3B8' }}>{m.note}</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )
          ) : priceHistory.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px 0', color: 'var(--text-muted)', fontSize: 13 }}>
              لم يتم تعديل سعر هذا الصنف منذ إضافته
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#1C222D', borderBottom: '1px solid #262E3D', color: '#94A3B8' }}>
                  <th style={{ padding: '8px 10px' }}>التاريخ والوقت</th>
                  <th style={{ padding: '8px 10px' }}>السعر السابق</th>
                  <th style={{ padding: '8px 10px' }}>السعر الجديد</th>
                  <th style={{ padding: '8px 10px' }}>الفارق</th>
                  <th style={{ padding: '8px 10px' }}>المسؤول والسبب</th>
                </tr>
              </thead>
              <tbody>
                {priceHistory.map((ph) => {
                  const diff = ph.new_price - ph.old_price;
                  const isUp = diff > 0;
                  return (
                    <tr key={ph.id} style={{ borderBottom: '1px solid #262E3D' }}>
                      <td style={{ padding: '8px 10px', color: '#94A3B8' }}>
                        {ph.created_at?.slice(0, 16).replace('T', ' ')}
                      </td>
                      <td style={{ padding: '8px 10px', color: '#94A3B8' }}>
                        {formatMoney(ph.old_price)}
                      </td>
                      <td style={{ padding: '8px 10px', fontWeight: 700, color: '#FFB800' }}>
                        {formatMoney(ph.new_price)}
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <span
                          style={{
                            backgroundColor: isUp ? '#FFEBEE' : '#E8F5E9',
                            color: isUp ? '#C62828' : '#2E7D32',
                            padding: '2px 6px',
                            borderRadius: 4,
                            fontWeight: 700,
                            fontSize: 11,
                          }}
                        >
                          {isUp ? `+${formatMoney(diff)} (زيادة)` : `${formatMoney(diff)} (تخفيض)`}
                        </span>
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <div style={{ fontWeight: 600 }}>{ph.user_name || 'المدير'}</div>
                        {ph.reason && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{ph.reason}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 10, borderTop: '1px solid var(--border-light)' }}>
          <Button variant="secondary" onClick={onClose} style={{ height: 38, padding: '0 24px' }}>
            إغلاق
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default StockCardModal;
