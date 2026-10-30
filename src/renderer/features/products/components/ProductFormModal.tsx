import React, { useState, useEffect } from 'react';
import { Tag, Edit3, Barcode, CheckCircle2, ShieldAlert } from 'lucide-react';
import { Modal } from '../../../components/common/Modal';
import { Button } from '../../../components/common/Button';
import { Input } from '../../../components/common/Input';
import { GlassIcon } from '../../../components/common/GlassIcon';
import { sounds } from '../../../lib/sounds';
import { useToast } from '../../../components/common/ToastContext';
import { MESSAGES } from '../../../lib/messages';
import { ProductItemRow } from '../types';

interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  productToEdit?: ProductItemRow | null;
}

export function ProductFormModal({
  isOpen,
  onClose,
  onSuccess,
  productToEdit,
}: ProductFormModalProps): React.ReactElement | null {
  const { success: toastSuccess, error: toastError } = useToast();
  const [nameAr, setNameAr] = useState('');
  const [categoryName, setCategoryName] = useState('هواتف ذكية (Smartphones)');
  const [brandName, setBrandName] = useState('');
  const [priceStr, setPriceStr] = useState('');
  const [barcode, setBarcode] = useState('');
  const [initialStockStr, setInitialStockStr] = useState('10');
  const [priceReason, setPriceReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const isEditing = !!productToEdit;

  useEffect(() => {
    if (productToEdit) {
      setNameAr(productToEdit.name || '');
      setCategoryName(productToEdit.category || 'هواتف ذكية (Smartphones)');
      setBrandName(productToEdit.brand === 'بدون علامة' ? '' : productToEdit.brand || '');
      setPriceStr(productToEdit.price ? (productToEdit.price / 100).toString() : '0');
      setBarcode(productToEdit.primaryBarcode === '---' ? '' : productToEdit.primaryBarcode || '');
      setInitialStockStr((productToEdit.totalStock ?? 0).toString());
      setPriceReason('');
    } else {
      setNameAr('');
      setCategoryName('هواتف ذكية (Smartphones)');
      setBrandName('');
      setPriceStr('');
      setBarcode('');
      setInitialStockStr('10');
      setPriceReason('');
    }
  }, [productToEdit, isOpen]);

  if (!isOpen) return null;

  const handleGenerateBarcode = () => {
    sounds.playClick();
    const randomSeq = Math.floor(100000000 + Math.random() * 900000000);
    const code = `200${randomSeq}`.slice(0, 13);
    setBarcode(code);
    toastSuccess('تم توليد باركود داخلي جديد بنجاح');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameAr.trim()) {
      sounds.playError();
      toastError('يرجى إدخال اسم المنتج باللغة العربية');
      return;
    }

    const priceNum = parseFloat(priceStr);
    if (isNaN(priceNum) || priceNum <= 0) {
      sounds.playError();
      toastError('يرجى إدخال سعر بيع صحيح أكبر من الصفر');
      return;
    }

    setIsLoading(true);
    try {
      const electron = (window as any).electron;
      const piasters = Math.round(priceNum * 100);

      if (isEditing && productToEdit) {
        // تحديث منتج قائم
        const stockNum = parseInt(initialStockStr, 10);
        const updatePayload: any = {
          name_ar: nameAr.trim(),
          category_name: categoryName.trim() || 'عام',
          brand_name: brandName.trim() || null,
          sale_price: piasters,
          barcode: barcode.trim() || null,
          variant_id: productToEdit.variantId,
          price_change_reason: priceReason.trim() || undefined,
        };

        if (!isNaN(stockNum) && stockNum >= 0 && stockNum !== productToEdit.totalStock) {
          updatePayload.stock = stockNum;
        }

        let res: any;
        if (electron?.updateProduct) {
          res = await electron.updateProduct(productToEdit.id, updatePayload);
        } else if (electron?.invoke) {
          res = await electron.invoke('products:update', productToEdit.id, updatePayload);
        }

        if (res && res.success === false) {
          throw new Error(res.error || 'تعذر تحديث بيانات المنتج');
        }

        sounds.playSaleSuccess();
        toastSuccess('تم تحديث بيانات وسعر ومخزون المنتج بنجاح');
      } else {
        // إنشاء منتج جديد
        const stock = parseInt(initialStockStr, 10) || 0;
        const payload = {
          name_ar: nameAr.trim(),
          category_name: categoryName.trim() || 'عام',
          brand_name: brandName.trim() || null,
          unit: 'قطعة',
          variants: [
            {
              name: 'الافتراضي',
              sale_price: piasters,
              min_stock: 5,
              initial_stock: stock,
              barcodes: barcode.trim() ? [barcode.trim()] : [],
            },
          ],
        };

        let res: any;
        if (electron?.createProduct) {
          res = await electron.createProduct(payload);
        } else if (electron?.invoke) {
          res = await electron.invoke('products:create', payload);
        }

        if (res && res.success === false) {
          throw new Error(res.error || 'تعذر حفظ المنتج الجديد');
        }

        sounds.playSaleSuccess();
        toastSuccess(MESSAGES.PRODUCT_SAVED);
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      sounds.playError();
      toastError(err.message || 'تعذر حفظ التغييرات');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? `تعديل بيانات وسعر: ${productToEdit?.name}` : 'إضافة منتج وصنف جديد'}
      icon={<GlassIcon icon={isEditing ? Edit3 : Tag} size="sm" variant="primary" />}
      width={560}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, direction: 'rtl' }}>
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#F8FAFC', marginBottom: 5 }}>
            اسم المنتج (بالعربية) *
          </label>
          <Input
            value={nameAr}
            onChange={(e) => setNameAr(e.target.value)}
            placeholder="مثال: iPhone 14 Pro Max 256GB أو شاحن أنكر 20W"
            style={{ backgroundColor: '#0B0E14', color: '#F8FAFC', border: '1.5px solid #262E3D', fontWeight: 600 }}
            autoFocus
            required
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#F8FAFC', marginBottom: 5 }}>
              القسم / التصنيف
            </label>
            <select
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              style={{
                width: '100%',
                height: 42,
                borderRadius: 8,
                border: '1.5px solid #262E3D',
                padding: '0 10px',
                fontSize: 13,
                fontWeight: 600,
                backgroundColor: '#0B0E14',
                color: '#F8FAFC',
                outline: 'none',
              }}
            >
              <option value="هواتف ذكية (Smartphones)">هواتف ذكية (Smartphones)</option>
              <option value="هواتف مستعملة ومجددة (Used Phones)">هواتف مستعملة ومجددة (Used Phones)</option>
              <option value="شواحن وكابلات (Chargers & Cables)">شواحن وكابلات (Chargers & Cables)</option>
              <option value="سماعات وايرلس وصوتيات (Headphones & Audio)">سماعات وايرلس وصوتيات (Headphones & Audio)</option>
              <option value="جرابات واسكرينات حماية (Cases & Screen Protectors)">جرابات واسكرينات حماية (Cases & Screen Protectors)</option>
              <option value="باور بانك وبطاريات (Power Banks & Batteries)">باور بانك وبطاريات (Power Banks & Batteries)</option>
              <option value="قطع غيار وشاشات (Spare Parts & Screens)">قطع غيار وشاشات (Spare Parts & Screens)</option>
              <option value="ساعات وسوارات ذكية (Smart Watches)">ساعات وسوارات ذكية (Smart Watches)</option>
              <option value="صيانة وخدمات (Repairs & Services)">صيانة وخدمات (Repairs & Services)</option>
              <option value="كروت شحن وبطاقات (Cards & Recharge)">كروت شحن وبطاقات (Cards & Recharge)</option>
              <option value="إكسسوارات عامة (Accessories)">إكسسوارات عامة (Accessories)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#F8FAFC', marginBottom: 5 }}>
              الماركة / البراند
            </label>
            <Input
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder="مثال: Apple, Samsung, Anker..."
              style={{ backgroundColor: '#0B0E14', color: '#F8FAFC', border: '1.5px solid #262E3D', fontWeight: 600 }}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#F8FAFC', marginBottom: 5 }}>
              سعر البيع (ج.م) *
            </label>
            <Input
              type="number"
              step="any"
              value={priceStr}
              onChange={(e) => setPriceStr(e.target.value)}
              placeholder="مثال: 450.00"
              style={{ backgroundColor: '#0B0E14', color: '#FFB800', border: '1.5px solid #262E3D', fontWeight: 700 }}
              required
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#F8FAFC', marginBottom: 5 }}>
              {isEditing ? 'رصيد المخزون (قطعة)' : 'رصيد المخزون الافتتاحي'}
            </label>
            <Input
              type="number"
              value={initialStockStr}
              onChange={(e) => setInitialStockStr(e.target.value)}
              placeholder="10"
              min={0}
              style={{ backgroundColor: '#0B0E14', color: '#F8FAFC', border: '1.5px solid #262E3D', fontWeight: 700 }}
            />
          </div>
        </div>

        {isEditing && (
          <div style={{ backgroundColor: '#0B0E14', padding: '10px 12px', borderRadius: 8, border: '1px solid #262E3D' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#FFB800', marginBottom: 5, fontWeight: 600 }}>
              <ShieldAlert size={14} color="#FFB800" />
              <span>سبب تعديل السعر (اختياري - يوثق تلقائياً في سجل الرقابة والتاريخ):</span>
            </div>
            <Input
              value={priceReason}
              onChange={(e) => setPriceReason(e.target.value)}
              placeholder="مثال: زيادة تسعيرة المورد، خصم خاص، تعديل دوري..."
              style={{ backgroundColor: '#161B22', color: '#F8FAFC', border: '1.5px solid #262E3D' }}
            />
          </div>
        )}

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
            <label style={{ fontSize: 13, fontWeight: 700, color: '#F8FAFC' }}>الباركود الدولي أو الداخلي</label>
            <button
              type="button"
              onClick={handleGenerateBarcode}
              style={{
                background: 'none',
                border: 'none',
                color: '#FFB800',
                fontSize: 12,
                cursor: 'pointer',
                fontWeight: 700,
                textDecoration: 'underline',
              }}
            >
              + توليد باركود تلقائي
            </button>
          </div>
          <Input
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            placeholder="امسح بالباركود أو اتركه للتوليد التلقائي"
            icon={<Barcode size={18} color="#94A3B8" />}
            style={{ backgroundColor: '#0B0E14', color: '#F8FAFC', border: '1.5px solid #262E3D', fontWeight: 600 }}
          />
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
          <Button
            type="submit"
            variant="primary"
            isLoading={isLoading}
            style={{ flex: 1, height: 44, fontSize: 14 }}
          >
            <CheckCircle2 size={16} />
            <span>{isEditing ? 'حفظ التعديلات وتوثيق السعر' : 'حفظ المنتج والباركود'}</span>
          </Button>

          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              sounds.playClick();
              onClose();
            }}
            style={{ width: 100, height: 44 }}
          >
            إلغاء
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default ProductFormModal;
