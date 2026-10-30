import { useState, useCallback, useEffect, useRef } from 'react';
import { CartLineItem } from '../types';
import { sounds } from '../../../lib/sounds';
import { MESSAGES } from '../../../lib/messages';

export function usePos() {
  const [cart, setCart] = useState<CartLineItem[]>([]);
  const [discountAmount, setDiscountAmount] = useState<number>(0); // بالقروش
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [lastScannedItem, setLastScannedItem] = useState<CartLineItem | null>(null);

  // مرجع للسلة الحالية لتجنب إعادة إنشاء callbacks عند كل تغيير في السلة
  const cartRef = useRef<CartLineItem[]>(cart);
  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);

  // حساب الإجمالي والفرعي
  const subtotal = cart.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);
  const totalDiscount = cart.reduce((sum, item) => sum + (item.discount || 0), 0) + discountAmount;
  const total = Math.max(0, subtotal - totalDiscount);
  const totalItemCount = cart.reduce((sum, item) => sum + item.qty, 0);

  /**
   * مسح الباركود وإضافة المنتج للسلة
   */
  const addItemByBarcode = useCallback(
    async (barcode: string): Promise<{ success: boolean; message?: string }> => {
      const cleanBarcode = barcode.trim();
      if (!cleanBarcode) {
        return { success: false, message: MESSAGES.BARCODE_EMPTY };
      }

      setIsLoading(true);
      try {
        const electron = (window as any).electron;
        const currentCart = cartRef.current;

        // التحقق أولاً إذا كان المنتج موجوداً مسبقاً في السلة لزيادة الكمية فوراً
        const existingIndex = currentCart.findIndex((i) => i.barcode === cleanBarcode);
        if (existingIndex >= 0) {
          const item = currentCart[existingIndex];
          if (item.availableStock !== undefined && item.qty + 1 > item.availableStock) {
            sounds.playError();
            return {
              success: false,
              message: `الكمية المطلوبة تتجاوز الرصيد المتوفر بالمخزون (${item.availableStock} قطعة)`,
            };
          }
          sounds.playBarcodeBeep();
          setCart((prev) => {
            const next = [...prev];
            const idx = next.findIndex((i) => i.barcode === cleanBarcode);
            if (idx < 0) return prev;
            const existing = next[idx];
            const newQty = existing.qty + 1;
            const updated = {
              ...existing,
              qty: newQty,
              total: Math.max(0, existing.unitPrice * newQty - (existing.discount || 0)),
            };
            next[idx] = updated;
            // تحديث آخر صنف ممسوح بعد setCart لتجنب double render
            queueMicrotask(() => setLastScannedItem(updated));
            return next;
          });
          return { success: true };
        }

        if (!electron?.getProductByBarcode) {
          sounds.playError();
          return { success: false, message: 'تعذر الاتصال بقاعدة البيانات للتحقق من الباركود' };
        }

        const res = await electron.getProductByBarcode(cleanBarcode);
        if (!res?.success || !res.data) {
          sounds.playError();
          return { success: false, message: MESSAGES.PRODUCT_NOT_FOUND };
        }

        const data = res.data;
        const variant = data.variant;
        const product = data.product;
        const availableStock = Number(data.available_stock) || 0;

        // التحقق الصارم من توفر رصيد لمنع البيع بالسالب
        if (availableStock <= 0) {
          sounds.playError();
          return {
            success: false,
            message: `عذراً، الصنف "${product.name_ar}" نفد من المخزون تماماً (الرصيد المتوفر: 0)`,
          };
        }

        const newItem: CartLineItem = {
          id: `${variant.id}-${Date.now()}`,
          variantId: variant.id,
          productName: product.name_ar,
          variantName: variant.name !== 'الافتراضي' ? variant.name : undefined,
          barcode: cleanBarcode,
          unitPrice: variant.sale_price,
          qty: 1,
          availableStock,
          discount: 0,
          total: variant.sale_price,
        };

        sounds.playBarcodeBeep();
        setCart((prev) => [newItem, ...prev]);
        setLastScannedItem(newItem);
        return { success: true };
      } catch (err: any) {
        sounds.playError();
        return { success: false, message: err.message || MESSAGES.UNEXPECTED_ERROR };
      } finally {
        setIsLoading(false);
      }
    },
    [] // ← لا تعتمد على cart بعد الآن - تستخدم cartRef بدلاً منها
  );

  /**
   * حذف عنصر من السلة
   */
  const removeItem = useCallback((id: string) => {
    sounds.playDelete();
    setCart((prev) => prev.filter((item) => item.id !== id));
  }, []);

  /**
   * تحديث كمية عنصر في السلة مع منع تجاوز المخزون
   */
  const updateQuantity = useCallback((id: string, newQty: number) => {
    sounds.playClick();
    if (newQty <= 0) {
      sounds.playDelete();
      setCart((prev) => prev.filter((item) => item.id !== id));
      return;
    }

    setCart((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          if (item.availableStock !== undefined && newQty > item.availableStock) {
            sounds.playError();
            return item;
          }
          return {
            ...item,
            qty: newQty,
            total: Math.max(0, item.unitPrice * newQty - (item.discount || 0)),
          };
        }
        return item;
      })
    );
  }, []);

  /**
   * تطبيق خصم على صنف محدد
   */
  const applyItemDiscount = useCallback((id: string, discount: number) => {
    sounds.playClick();
    setCart((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const validDiscount = Math.min(item.unitPrice * item.qty, Math.max(0, discount));
          return {
            ...item,
            discount: validDiscount,
            total: Math.max(0, item.unitPrice * item.qty - validDiscount),
          };
        }
        return item;
      })
    );
  }, []);

  /**
   * إفراغ السلة بالكامل
   */
  const clearCart = useCallback(() => {
    sounds.playDelete();
    setCart([]);
    setDiscountAmount(0);
    setCustomerId(null);
    setCustomerName('');
    setLastScannedItem(null);
  }, []);

  /**
   * استبدال محتويات السلة بالكامل (لاستئناف فاتورة معلقة)
   */
  const restoreCart = useCallback(
    (newCart: CartLineItem[], custId?: number | null, custName?: string, discount?: number) => {
      sounds.playClick();
      setCart(newCart);
      if (custId !== undefined) setCustomerId(custId);
      if (custName !== undefined) setCustomerName(custName);
      if (discount !== undefined) setDiscountAmount(discount);
    },
    []
  );

  /**
   * إضافة منتج أو variant مباشرة من الكتالوج بنقرة زر
   */
  const addProductToCart = useCallback(
    (
      product: { id: number; name?: string; name_ar?: string; variants?: any[] },
      variant?: { id: number; name?: string; sale_price?: number; price?: number; total_stock?: number; barcodes?: string[] }
    ): { success: boolean; message?: string } => {
      const targetVariant = variant || product.variants?.[0] || (product as any);
      const variantId = targetVariant?.id || product.id;
      const unitPrice = targetVariant?.sale_price ?? targetVariant?.price ?? (product as any).price ?? 0;
      const productName = product.name_ar || product.name || 'منتج';
      const variantName = targetVariant?.name && targetVariant.name !== 'الافتراضي' ? targetVariant.name : undefined;
      const barcode = targetVariant?.barcodes?.[0] || (product as any).primaryBarcode || `SKU-${variantId}`;
      const availableStock = targetVariant?.total_stock !== undefined ? targetVariant.total_stock : (product as any).totalStock ?? 999;

      const currentCart = cartRef.current;

      // فحص إذا كان الصنف موجوداً مسبقاً في السلة لزيادة الكمية
      const existingIndex = currentCart.findIndex((i) => i.variantId === variantId);
      if (existingIndex >= 0) {
        const item = currentCart[existingIndex];
        if (item.availableStock !== undefined && item.qty + 1 > item.availableStock) {
          sounds.playError();
          return {
            success: false,
            message: `الكمية المطلوبة تتجاوز الرصيد المتوفر بالمخزون (${item.availableStock} قطعة)`,
          };
        }
        sounds.playBarcodeBeep();
        setCart((prev) => {
          const next = [...prev];
          const idx = next.findIndex((i) => i.variantId === variantId);
          if (idx < 0) return prev;
          const existing = next[idx];
          const newQty = existing.qty + 1;
          const updated = {
            ...existing,
            qty: newQty,
            total: Math.max(0, existing.unitPrice * newQty - (existing.discount || 0)),
          };
          next[idx] = updated;
          queueMicrotask(() => setLastScannedItem(updated));
          return next;
        });
        return { success: true };
      }

      // التحقق من الرصيد المتوفر لمنع البيع بالسالب
      if (availableStock <= 0) {
        sounds.playError();
        return {
          success: false,
          message: `عذراً، الصنف "${productName}" نفد من المخزون تماماً (الرصيد: 0)`,
        };
      }

      const newItem: CartLineItem = {
        id: `${variantId}-${Date.now()}`,
        variantId,
        productName,
        variantName,
        barcode,
        unitPrice,
        qty: 1,
        availableStock,
        discount: 0,
        total: unitPrice,
      };

      sounds.playBarcodeBeep();
      setCart((prev) => [newItem, ...prev]);
      setLastScannedItem(newItem);
      return { success: true };
    },
    [] // ← لا تعتمد على cart بعد الآن - تستخدم cartRef
  );

  return {
    cart,
    subtotal,
    discountAmount,
    totalDiscount,
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
    applyItemDiscount,
    removeItem,
    clearCart,
    restoreCart,
  };
}

export default usePos;

