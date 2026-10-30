import React from 'react';
import { CartLineItem } from '../types';
import { formatMoney } from '../../../../shared/utils/money';
import { GlassIcon } from '../../../components/common/GlassIcon';
import { AppIcon } from '../../../components/common/AppIcon';
import { EmptyState } from '../../../components/common/EmptyState';

interface CartTableProps {
  items: CartLineItem[];
  onRemove: (id: string) => void;
  onUpdateQty?: (id: string, qty: number) => void;
  lastScannedId?: string;
  compact?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}

function CartTableComponent({
  items,
  onRemove,
  onUpdateQty,
  lastScannedId,
  compact = false,
  emptyTitle,
  emptyDescription,
}: CartTableProps): React.ReactElement {
  if (items.length === 0) {
    return (
      <EmptyState
        icon="shopping_bag"
        variant="brand"
        title={emptyTitle || "سلة البيع فارغة حالياً"}
        description={
          emptyDescription ||
          "قم بتوجيه قارئ الباركود نحو المنتج، أو أدخل كود المنتج في حقل البحث أعلاه لإضافته إلى الفاتورة"
        }
        style={{
          margin: compact ? '20px auto' : '40px auto',
          padding: compact ? '24px 16px' : '48px 24px',
          border: 'none',
          background: 'transparent',
        }}
      />
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflowY: 'auto',
      }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
        <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: '#1C222D' }}>
          <tr style={{ background: '#1C222D', borderBottom: '1.5px solid #262E3D' }}>
            {!compact && <th style={{ width: '5%', padding: '12px 14px', textAlign: 'center', color: '#94A3B8' }}>#</th>}
            {!compact && <th style={{ width: '18%', padding: '12px 14px', color: '#94A3B8' }}>الباركود</th>}
            <th style={{ width: compact ? '40%' : '32%', padding: compact ? '9px 10px' : '12px 14px', color: '#94A3B8' }}>المنتج / الصنف</th>
            <th style={{ width: compact ? '18%' : '14%', padding: compact ? '9px 8px' : '12px 14px', textAlign: 'left', color: '#94A3B8' }}>السعر</th>
            <th style={{ width: compact ? '22%' : '16%', padding: compact ? '9px 8px' : '12px 14px', textAlign: 'center', color: '#94A3B8' }}>الكمية</th>
            <th style={{ width: compact ? '15%' : '15%', padding: compact ? '9px 8px' : '12px 14px', textAlign: 'left', color: '#94A3B8' }}>الإجمالي</th>
            <th style={{ width: compact ? '5%' : '8%', padding: compact ? '9px 6px' : '12px 14px', textAlign: 'center' }}></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const isLatest = lastScannedId === item.id;
            return (
              <tr
                key={item.id}
                style={{
                  borderBottom: '1px solid #262E3D',
                  backgroundColor: isLatest ? 'rgba(255, 184, 0, 0.12)' : 'transparent',
                  transition: 'background 0.2s ease',
                }}
              >
                {/* تسلسل */}
                {!compact && (
                  <td style={{ padding: '12px 14px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
                    {items.length - index}
                  </td>
                )}

                {/* الباركود */}
                {!compact && (
                  <td style={{ padding: '12px 14px' }}>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 12,
                        fontWeight: 700,
                        color: '#FFB800',
                        backgroundColor: '#0B0E14',
                        padding: '3px 7px',
                        borderRadius: 4,
                        border: '1px solid #262E3D',
                      }}
                    >
                      {item.barcode}
                    </span>
                  </td>
                )}

                {/* اسم المنتج والصنف */}
                <td style={{ padding: compact ? '8px 10px' : '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <div style={{ fontWeight: 700, color: '#F8FAFC', fontSize: compact ? 13 : 14 }}>
                      {item.productName}
                    </div>
                    {item.availableStock !== undefined && (
                      <span
                        style={{
                          fontSize: 10,
                          backgroundColor: '#0B0E14',
                          color: '#FFB800',
                          border: '1px solid #262E3D',
                          padding: '1px 5px',
                          borderRadius: 4,
                          fontWeight: 700,
                        }}
                      >
                        {item.availableStock}
                      </span>
                    )}
                  </div>
                  {(item.variantName || (compact && item.barcode)) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
                      {item.variantName && <span>{item.variantName}</span>}
                      {compact && item.barcode && (
                        <span style={{ fontFamily: 'monospace', fontSize: 10, opacity: 0.8 }}>
                          {item.barcode}
                        </span>
                      )}
                    </div>
                  )}
                </td>

                {/* سعر الوحدة */}
                <td style={{ padding: compact ? '8px 8px' : '12px 14px', textAlign: 'left', fontWeight: 600, fontSize: compact ? 13 : 14, color: '#CBD5E1' }}>
                  {formatMoney(item.unitPrice)}
                </td>

                {/* التحكم بالكمية (+ و -) */}
                <td style={{ padding: compact ? '8px 6px' : '12px 14px' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: compact ? 3 : 6,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => onUpdateQty?.(item.id, item.qty - 1)}
                      title="تقليل الكمية"
                      style={{
                        width: compact ? 24 : 28,
                        height: compact ? 24 : 28,
                        borderRadius: 6,
                        border: '1px solid #262E3D',
                        background: '#0B0E14',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#CBD5E1',
                      }}
                    >
                      <AppIcon name="remove" size={compact ? 12 : 14} />
                    </button>

                    <span
                      style={{
                        minWidth: compact ? 20 : 28,
                        textAlign: 'center',
                        fontWeight: 700,
                        fontSize: compact ? 13 : 14,
                        color: '#FFB800',
                        fontFamily: 'Space Grotesk, sans-serif',
                      }}
                    >
                      {item.qty}
                    </span>

                    <button
                      type="button"
                      onClick={() => onUpdateQty?.(item.id, item.qty + 1)}
                      disabled={item.availableStock !== undefined && item.qty >= item.availableStock}
                      title={
                        item.availableStock !== undefined && item.qty >= item.availableStock
                          ? 'وصلت للحد الأقصى للمخزون المتوفر'
                          : 'زيادة الكمية'
                      }
                      style={{
                        width: compact ? 24 : 28,
                        height: compact ? 24 : 28,
                        borderRadius: 6,
                        border: '1px solid #262E3D',
                        background:
                          item.availableStock !== undefined && item.qty >= item.availableStock
                            ? '#161B22'
                            : '#0B0E14',
                        cursor:
                          item.availableStock !== undefined && item.qty >= item.availableStock
                            ? 'not-allowed'
                            : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color:
                          item.availableStock !== undefined && item.qty >= item.availableStock
                            ? '#64748B'
                            : '#CBD5E1',
                      }}
                    >
                      <AppIcon name="add" size={compact ? 12 : 14} />
                    </button>
                  </div>
                </td>

                {/* الإجمالي */}
                <td
                  style={{
                    padding: compact ? '8px 8px' : '12px 14px',
                    textAlign: 'left',
                    fontWeight: 800,
                    fontSize: compact ? 13.5 : 15,
                    color: '#FFB800',
                    fontFamily: 'Space Grotesk, sans-serif',
                  }}
                >
                  {formatMoney(item.total)}
                </td>

                {/* زر الحذف */}
                <td style={{ padding: compact ? '8px 4px' : '12px 14px', textAlign: 'center' }}>
                  <button
                    type="button"
                    onClick={() => onRemove(item.id)}
                    title="حذف هذا الصنف من الفاتورة"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#EF4444',
                      cursor: 'pointer',
                      padding: compact ? 4 : 6,
                      borderRadius: 6,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.15)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <AppIcon name="delete" size={compact ? 15 : 16} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export const CartTable = React.memo(CartTableComponent);
export default CartTable;
