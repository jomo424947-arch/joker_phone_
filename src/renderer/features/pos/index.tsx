import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '../../components/common/Button';
import { GlassIcon } from '../../components/common/GlassIcon';
import { AppIcon } from '../../components/common/AppIcon';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { useToast } from '../../components/common/ToastContext';
import { BarcodeInput } from './components/BarcodeInput';
import { CartTable } from './components/CartTable';
import { ProductCatalog } from './components/ProductCatalog';
import { PaymentModal } from './components/PaymentModal';
import { CustomerSelectModal } from './components/CustomerSelectModal';
import { HeldSalesModal } from './components/HeldSalesModal';
import { InvoiceReceiptModal } from './components/InvoiceReceiptModal';
import { usePos } from './hooks/usePos';
import { formatMoney } from '../../../shared/utils/money';
import { Sale } from '../../../shared/types/sales.types';
import { sounds } from '../../lib/sounds';
import { MESSAGES } from '../../lib/messages';

export function PosScreen(): React.ReactElement {
  const {
    cart,
    subtotal,
    discountAmount,
    total,
    totalItemCount,
    customerId,
    customerName,
    isLoading,
    lastScannedItem,
    setDiscountAmount,
    setCustomerId,
    setCustomerName,
    addItemByBarcode,
    addProductToCart,
    updateQuantity,
    removeItem,
    clearCart,
    restoreCart,
  } = usePos();

  const { success: toastSuccess, error: toastError, warning: toastWarning } = useToast();
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isHeldModalOpen, setIsHeldModalOpen] = useState(false);
  const [previewSale, setPreviewSale] = useState<Sale | null>(null);
  const [autoPrintAfterSale, setAutoPrintAfterSale] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showDiscountInput, setShowDiscountInput] = useState(false);
  const [customDiscountStr, setCustomDiscountStr] = useState('0');
  const [catalogRefreshTrigger, setCatalogRefreshTrigger] = useState(0);

  // مرجع ثابت للسلة لمنع إعادة تسجيل مستمع لوحة المفاتيح
  const cartRef = useRef(cart);
  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);

  const handleScan = useCallback(
    async (barcode: string) => {
      const res = await addItemByBarcode(barcode);
      if (!res.success && res.message) {
        toastError(res.message);
      }
    },
    [addItemByBarcode]
  );

  const handleSelectCatalogProduct = useCallback(
    (product: any, variant?: any) => {
      const res = addProductToCart(product, variant);
      if (!res.success && res.message) {
        toastError(res.message);
      }
    },
    [addProductToCart]
  );

  const handleHoldSale = useCallback(async () => {
    const currentCart = cartRef.current;
    if (currentCart.length === 0) {
      toastWarning(MESSAGES.CART_EMPTY);
      return;
    }

    try {
      const electron = (window as any).electron;
      if (electron?.holdSale) {
        await electron.holdSale(currentCart, null, null, customerName || 'عميل نقدي');
      } else if (electron?.invoke) {
        await electron.invoke('sales:hold', currentCart, null, null, customerName || 'عميل نقدي');
      }
      sounds.playClick();
      toastSuccess(MESSAGES.SALE_HELD_SUCCESS);
      clearCart();
    } catch (err: any) {
      toastError(err.message || 'تعذر تعليق الفاتورة');
    }
  }, [customerName, clearCart]);

  // الاستماع لاختصارات لوحة المفاتيح المخصصة لشاشة البيع
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // تجنب تشويش الاختصارات عند فتح المودالات
      if (isPaymentOpen || isHeldModalOpen || showClearConfirm) return;

      const currentCart = cartRef.current;
      if (e.key === 'F4') {
        e.preventDefault();
        if (currentCart.length === 0) {
          toastWarning(MESSAGES.CART_EMPTY);
          return;
        }
        sounds.playClick();
        setIsPaymentOpen(true);
      } else if (e.key === 'F6') {
        e.preventDefault();
        handleHoldSale();
      } else if (e.key === 'F7') {
        e.preventDefault();
        sounds.playClick();
        setIsHeldModalOpen(true);
      } else if (e.key === 'Escape' && currentCart.length > 0) {
        e.preventDefault();
        sounds.playWarning();
        setShowClearConfirm(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPaymentOpen, isHeldModalOpen, showClearConfirm, handleHoldSale]);

  const handleApplyDiscount = () => {
    const val = parseFloat(customDiscountStr) || 0;
    const piasters = Math.round(val * 100);
    if (piasters > subtotal) {
      toastError(MESSAGES.DISCOUNT_EXCEEDED);
      return;
    }
    sounds.playClick();
    setDiscountAmount(piasters);
    setShowDiscountInput(false);
    toastSuccess('تم تطبيق الخصم على الفاتورة');
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 420px',
        gap: 16,
        height: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* القسم الرئيسي الأيمن: الباركود وشريط الاختصارات وكتالوج المنتجات المتسع بالكامل */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          minWidth: 0,
          height: '100%',
          overflow: 'hidden',
        }}
      >
        {/* شريط الإدخال السريع للباركود */}
        <BarcodeInput onScan={handleScan} isLoading={isLoading} />

        {/* كتالوج المنتجات المتسع والكامل بكامل المساحة */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <ProductCatalog
            onSelectProduct={handleSelectCatalogProduct}
            refreshTrigger={catalogRefreshTrigger}
            style={{ height: '100%', minWidth: 0 }}
          />
        </div>
      </div>

      {/* القسم الجانبي الأيسر: العميل، سلة المبيعات الحالية، ملخص الإجمالي، وأزرار الدفع والإجراءات */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          height: '100%',
          minWidth: 0,
          overflow: 'hidden',
        }}
      >
        {/* بطاقة العميل الحالي */}
        <div
          className="glass-card"
          style={{
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#161B22',
            border: '1px solid #262E3D',
            borderRadius: 12,
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <GlassIcon icon="person" size="xs" variant="gold" />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#F8FAFC' }}>
                {customerName || 'عميل نقدي سريع'}
              </div>
              <div style={{ fontSize: 11, color: customerId ? '#10B981' : '#94A3B8' }}>
                {customerId ? 'عميل مسجل في الحسابات' : 'نقاط الولاء: 0 نقطة'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {customerId ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    sounds.playClick();
                    setIsCustomerModalOpen(true);
                  }}
                  title="تغيير العميل"
                  style={{
                    background: 'rgba(255, 184, 0, 0.15)',
                    border: '1px solid rgba(255, 184, 0, 0.3)',
                    color: '#FFB800',
                    fontSize: 11.5,
                    fontWeight: 700,
                    padding: '4px 8px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <AppIcon name="edit" size={13} />
                  <span>تغيير</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sounds.playClick();
                    setCustomerId(null);
                    setCustomerName('');
                    toastSuccess('تمت العودة إلى وضع العميل النقدي');
                  }}
                  title="إلغاء التحديد والعودة لعميل نقدي"
                  style={{
                    background: 'rgba(239, 68, 68, 0.12)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    color: '#EF4444',
                    fontSize: 11.5,
                    fontWeight: 600,
                    padding: '4px 8px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <AppIcon name="close" size={13} />
                  <span>إلغاء</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => {
                  sounds.playClick();
                  setIsCustomerModalOpen(true);
                }}
                title="تحديد أو تسجيل عميل"
                style={{
                  background: 'rgba(255, 184, 0, 0.12)',
                  border: '1px solid rgba(255, 184, 0, 0.3)',
                  color: '#FFB800',
                  fontSize: 12,
                  fontWeight: 700,
                  padding: '5px 10px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <AppIcon name="person_add" size={14} />
                <span>تحديد عميل</span>
              </button>
            )}
          </div>
        </div>

        {/* كارد سلة المبيعات الحالية (تم نقلها هنا لتوسيع كتالوج المنتجات) */}
        <div
          className="glass-card"
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#161B22',
            borderRadius: 14,
            overflow: 'hidden',
            border: '1px solid #262E3D',
            padding: 0,
          }}
        >
          {/* شريط ترويسة السلة */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              backgroundColor: '#1C222D',
              borderBottom: '1.5px solid #262E3D',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AppIcon name="shopping_cart" size={17} color="#FFB800" />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#F8FAFC' }}>
                سلة المبيعات الحالية
              </span>
              <span
                className="kbd-badge"
                style={{
                  backgroundColor: '#0B0E14',
                  color: '#FFB800',
                  padding: '2px 8px',
                  fontFamily: 'Space Grotesk, sans-serif',
                  fontSize: 11,
                  fontWeight: 700,
                  borderColor: '#262E3D',
                }}
              >
                {cart.length} صنف
              </span>
            </div>

            {cart.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  sounds.playWarning();
                  setShowClearConfirm(true);
                }}
                title="مسح وتفريغ السلة"
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#EF4444',
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '2px 6px',
                  borderRadius: 6,
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.15)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <AppIcon name="delete_sweep" size={14} />
                <span>تفريغ السلة</span>
              </button>
            )}
          </div>

          {/* محتوى جدول السلة القابل للتمرير بوضع compact */}
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            <CartTable
              items={cart}
              onRemove={removeItem}
              onUpdateQty={updateQuantity}
              lastScannedId={lastScannedItem?.id}
              compact={true}
              emptyTitle="سلة البيع فارغة"
              emptyDescription="انقر على أي منتج من الكتالوج لإضافته، أو وجّه قارئ الباركود"
            />
          </div>
        </div>

        {/* بطاقة ملخص الإجمالي وأزرار السداد والإجراءات */}
        <div
          className="glass-card"
          style={{
            padding: '14px 16px',
            backgroundColor: '#161B22',
            borderRadius: 14,
            border: '1px solid #262E3D',
            boxShadow: 'none',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {/* ملخص الإجمالي */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: 8,
              borderBottom: '1px solid #262E3D',
            }}
          >
            <div>
              <div style={{ fontSize: 13, color: '#94A3B8', fontWeight: 600 }}>
                إجمالي الفاتورة النهائي
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 11.5,
                  color: '#94A3B8',
                  marginTop: 3,
                }}
              >
                <span>عدد الأصناف: <strong style={{ color: '#F8FAFC' }}>{cart.length}</strong></span>
                <span>•</span>
                <span>إجمالي القطع: <strong style={{ color: '#F8FAFC' }}>{totalItemCount}</strong></span>
              </div>
            </div>

            <div style={{ textAlign: 'left' }}>
              <div
                className="num-stat font-display"
                style={{
                  fontSize: 28,
                  fontWeight: 800,
                  color: '#FFB800',
                  lineHeight: 1.1,
                  letterSpacing: '-0.5px',
                }}
              >
                {formatMoney(total)}
              </div>
              {discountAmount > 0 && (
                <div
                  style={{
                    marginTop: 3,
                    fontSize: 11,
                    color: '#EF4444',
                    fontWeight: 600,
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    padding: '2px 6px',
                    borderRadius: 4,
                    display: 'inline-block',
                  }}
                >
                  خصم: {formatMoney(discountAmount)}-
                </div>
              )}
            </div>
          </div>

          {/* حقل إدخال الخصم إن كان مفعلاً */}
          {showDiscountInput && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="number"
                placeholder="قيمة الخصم ج.م"
                value={customDiscountStr}
                onChange={(e) => setCustomDiscountStr(e.target.value)}
                className="in"
                style={{ height: 36, fontSize: 13 }}
                autoFocus
              />
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleApplyDiscount}
                style={{ height: 36, padding: '0 12px', fontSize: 12.5 }}
              >
                تطبيق
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowDiscountInput(false)}
                style={{ height: 36, padding: '0 10px', fontSize: 12.5 }}
              >
                إلغاء
              </button>
            </div>
          )}

          {/* زر إتمام الدفع والسداد الرئيسي (بتدرج الروز الفاخر المطابق لصفحة الدخول) */}
          <Button
            variant="primary"
            style={{
              height: 48,
              fontSize: 15.5,
              fontWeight: 700,
              boxShadow: '0 4px 16px rgba(255, 149, 165, 0.4)',
              gap: 10,
            }}
            disabled={cart.length === 0}
            onClick={() => {
              sounds.playClick();
              setIsPaymentOpen(true);
            }}
          >
            <AppIcon name="credit_card" size={20} />
            <span>إتمام الدفع والسداد</span>
          </Button>

          {/* أزرار الإجراءات الثانوية بشبكة 2x2 منظمة وسريعة */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
            {/* إضافة خصم */}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                sounds.playClick();
                setShowDiscountInput(!showDiscountInput);
              }}
              style={{ height: 36, fontSize: 12, gap: 6, padding: '0 8px', justifyContent: 'center' }}
            >
              <AppIcon name="percent" size={15} color="var(--color-primary)" />
              <span>إضافة خصم</span>
            </button>

            {/* تعليق الفاتورة */}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleHoldSale}
              disabled={cart.length === 0}
              style={{ height: 36, fontSize: 12, gap: 6, padding: '0 8px', justifyContent: 'center' }}
            >
              <AppIcon name="pause_circle" size={15} color="var(--color-primary)" />
              <span>تعليق</span>
            </button>

            {/* الفواتير المعلقة */}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                sounds.playClick();
                setIsHeldModalOpen(true);
              }}
              style={{ height: 36, fontSize: 12, gap: 6, padding: '0 8px', justifyContent: 'center' }}
            >
              <AppIcon name="pending_actions" size={15} color="var(--color-gold)" />
              <span>معلقة</span>
            </button>

            {/* إلغاء ومسح */}
            <button
              type="button"
              className="btn btn-danger-outline"
              onClick={() => {
                sounds.playWarning();
                setShowClearConfirm(true);
              }}
              disabled={cart.length === 0}
              style={{ height: 36, fontSize: 12, gap: 6, padding: '0 8px', justifyContent: 'center' }}
            >
              <AppIcon name="delete_sweep" size={15} color="var(--color-danger)" />
              <span>إلغاء</span>
            </button>
          </div>
        </div>
      </div>

      {/* نافذة الدفع */}
      <PaymentModal
        isOpen={isPaymentOpen}
        onClose={() => setIsPaymentOpen(false)}
        total={total}
        subtotal={subtotal}
        discount={discountAmount}
        cart={cart}
        customerId={customerId}
        customerName={customerName}
        onSelectCustomer={(cust) => {
          if (cust) {
            setCustomerId(cust.id);
            setCustomerName(cust.name);
          } else {
            setCustomerId(null);
            setCustomerName('');
          }
        }}
        onSaleComplete={(createdSale, autoPrint) => {
          clearCart();
          setIsPaymentOpen(false);
          setAutoPrintAfterSale(autoPrint);
          setPreviewSale(createdSale);
          setCatalogRefreshTrigger((prev) => prev + 1);
        }}
      />

      {/* نافذة تحديد أو إضافة عميل للشاشة الرئيسية */}
      <CustomerSelectModal
        isOpen={isCustomerModalOpen}
        onClose={() => setIsCustomerModalOpen(false)}
        onSelectCustomer={(cust) => {
          sounds.playClick();
          setCustomerId(cust.id);
          setCustomerName(cust.name);
          setIsCustomerModalOpen(false);
          toastSuccess(`تم تحديد العميل: ${cust.name}`);
        }}
        currentCustomerId={customerId}
        zIndex={1100}
      />

      {/* نافذة معاينة الفاتورة قبل الطباعة */}
      <InvoiceReceiptModal
        isOpen={Boolean(previewSale)}
        onClose={() => setPreviewSale(null)}
        sale={previewSale}
        autoPrint={autoPrintAfterSale}
        onNewSale={() => {
          setPreviewSale(null);
          clearCart();
        }}
      />

      {/* نافذة الفواتير المعلقة */}
      <HeldSalesModal
        isOpen={isHeldModalOpen}
        onClose={() => setIsHeldModalOpen(false)}
        onResume={(items, custName) => restoreCart(items, null, custName)}
      />

      {/* تأكيد مسح الفاتورة */}
      <ConfirmDialog
        isOpen={showClearConfirm}
        title="تأكيد إلغاء الفاتورة"
        message="هل أنت متأكد من رغبتك في إلغاء وتفريغ سلة المبيعات بالكامل؟ سيتم مسح جميع الأصناف الممسوحة حالياً."
        confirmLabel="إلغاء الفاتورة"
        cancelLabel="تراجع"
        isDangerous
        onConfirm={() => {
          clearCart();
          setShowClearConfirm(false);
          toastSuccess(MESSAGES.SALE_VOIDED);
        }}
        onCancel={() => setShowClearConfirm(false)}
      />
    </div>
  );
}

export * from './types';
export * from './hooks/usePos';
export default PosScreen;
