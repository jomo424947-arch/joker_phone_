import React, { useState, useEffect, useMemo } from 'react';
import { AppIcon } from '../../../components/common/AppIcon';
import { GlassIcon } from '../../../components/common/GlassIcon';
import { formatMoney } from '../../../../shared/utils/money';
import { sounds } from '../../../lib/sounds';
import { useToast } from '../../../components/common/ToastContext';

export interface ProductCatalogProps {
  onSelectProduct: (product: any, variant?: any) => void;
  className?: string;
  style?: React.CSSProperties;
  refreshTrigger?: number;
}

// تطبيع النصوص العربية لتحقيق بحث سلس ودقيق بغض النظر عن اختلاف الهمزات
function normalizeArabic(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\u064B-\u065F]/g, '');
}

const categoryIconMap: Record<string, string> = {
  الكل: 'grid_view',
  'هواتف ذكية': 'smartphone',
  'هواتف مستعملة': 'phone_android',
  'شواحن وكابلات': 'power',
  'سماعات وايرلس': 'headphones',
  'جرابات وحماية': 'shield',
  'باور بانك': 'battery_charging_full',
  'قطع غيار': 'build',
  'ساعات ذكية': 'watch',
  صيانة: 'home_repair_service',
  'محافظ وكروت': 'account_balance_wallet',
  إكسسوارات: 'cable',
  عام: 'inventory_2',
};

const PAGE_SIZE = 48;

export function ProductCatalogComponent({
  onSelectProduct,
  className = '',
  style = {},
  refreshTrigger,
}: ProductCatalogProps): React.ReactElement {
  const { warning: toastWarning } = useToast();
  const [products, setProducts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('الكل');
  const [variantModalProduct, setVariantModalProduct] = useState<any | null>(null);
  const [displayLimit, setDisplayLimit] = useState<number>(PAGE_SIZE);

  // تحميل المنتجات الحقيقية المسجلة من قاعدة البيانات
  const fetchCatalog = async () => {
    setIsLoading(true);
    try {
      const electron = (window as any).electron;
      if (electron?.searchProducts) {
        const res = await electron.searchProducts('', { isActive: true, limit: 1000 });
        if (res?.success && Array.isArray(res.data)) {
          const activeOnly = res.data.filter((p: any) => p.is_active !== 0);
          setProducts(activeOnly);
          return;
        }
      }
      setProducts([]);
    } catch {
      setProducts([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCatalog();
  }, [refreshTrigger]);

  // إعادة ضبط حد العرض عند تغيير البحث أو التصنيف
  useEffect(() => {
    setDisplayLimit(PAGE_SIZE);
  }, [searchQuery, selectedCategory]);

  // استخراج قائمة التصنيفات الفريدة مع حساب عدد المنتجات في كل تصنيف
  const categoriesWithCounts = useMemo(() => {
    const counts: Record<string, number> = { الكل: products.length };
    products.forEach((p) => {
      const cat = p.category_name || p.category || 'عام';
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return Object.entries(counts);
  }, [products]);

  // تصفية المنتجات حسب التصنيف وعبارة البحث (مع دعم الباركود والـ SKU وتطبيع الحروف)
  const filteredProducts = useMemo(() => {
    const qNorm = normalizeArabic(searchQuery.trim());
    return products.filter((p) => {
      const name = p.name_ar || p.name || '';
      const brand = p.brand_name || p.brand || '';
      const cat = p.category_name || p.category || 'عام';

      const matchCat = selectedCategory === 'الكل' || cat === selectedCategory;
      if (!matchCat) return false;

      if (!qNorm) return true;

      const nameNorm = normalizeArabic(name);
      const brandNorm = normalizeArabic(brand);

      if (nameNorm.includes(qNorm) || brandNorm.includes(qNorm)) {
        return true;
      }

      // مطابقة الباركود أو الـ SKU المباشر
      const hasBarcodeOrSku = p.variants?.some((v: any) =>
        v.barcodes?.some((b: string) => b.toLowerCase().includes(searchQuery.trim().toLowerCase())) ||
        (v.sku && v.sku.toLowerCase().includes(searchQuery.trim().toLowerCase()))
      );

      return Boolean(hasBarcodeOrSku);
    });
  }, [products, selectedCategory, searchQuery]);

  // المنتجات المعروضة فقط لتخفيف الحمل على DOM والذاكرة
  const displayedProducts = useMemo(() => {
    return filteredProducts.slice(0, displayLimit);
  }, [filteredProducts, displayLimit]);

  // إضافة المنتج للسلة بنقرة زر
  const handleProductClick = (product: any) => {
    const variants = product.variants || [];
    if (variants.length > 1) {
      // فتح نافذة اختيار الدرجة أو الحجم إذا كان للمنتج أكثر من خيار
      sounds.playClick();
      setVariantModalProduct(product);
    } else {
      // إضافة فورية مباشرة
      onSelectProduct(product, variants[0]);
    }
  };

  const handleSelectVariant = (variant: any) => {
    if (variantModalProduct) {
      onSelectProduct(variantModalProduct, variant);
      setVariantModalProduct(null);
    }
  };

  return (
    <div
      className={`glass-card ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: '#161B22',
        borderRadius: 14,
        padding: 14,
        gap: 12,
        overflow: 'hidden',
        boxSizing: 'border-box',
        border: '1px solid #262E3D',
        ...style,
      }}
    >
      {/* ترويسة الكتالوج: شريط البحث والأصناف والتحديث */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {/* حقل البحث السريع بالاسم */}
        <div
          style={{
            flex: 1,
            minWidth: 200,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            backgroundColor: '#0B0E14',
            border: '1px solid #262E3D',
            borderRadius: 10,
            padding: '0 12px',
            height: 38,
            transition: 'border-color 0.15s ease',
          }}
        >
          <AppIcon name="search" size={17} color="#94A3B8" />
          <input
            type="text"
            placeholder="بحث سريع في قائمة المنتجات..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: 13,
              fontFamily: 'var(--font-family)',
              color: '#F8FAFC',
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#94A3B8',
                padding: 2,
              }}
            >
              <AppIcon name="close" size={15} />
            </button>
          )}
        </div>

        {/* عداد المنتجات وزر التحديث */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              fontSize: 12,
              color: '#94A3B8',
              fontWeight: 600,
              fontFamily: 'Space Grotesk, sans-serif',
            }}
          >
            {filteredProducts.length} منتج
          </span>

          <button
            type="button"
            onClick={fetchCatalog}
            title="تحديث قائمة المنتجات"
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              border: '1px solid #262E3D',
              backgroundColor: '#0B0E14',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#FFB800',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1C222D')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#0B0E14')}
          >
            <AppIcon name="sync" size={16} />
          </button>
        </div>
      </div>

      {/* شريط التصنيفات (Category Chips Bar) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          overflowX: 'auto',
          paddingBottom: 4,
          scrollbarWidth: 'none',
          userSelect: 'none',
        }}
      >
        {categoriesWithCounts.map(([cat, count]) => {
          const isSelected = selectedCategory === cat;
          const icon = categoryIconMap[cat] || 'inventory_2';
          return (
            <button
              key={cat}
              type="button"
              onClick={() => {
                sounds.playClick();
                setSelectedCategory(cat);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 20,
                border: isSelected ? '1px solid #FFB800' : '1px solid #262E3D',
                backgroundColor: isSelected ? 'rgba(255, 184, 0, 0.15)' : '#0B0E14',
                color: isSelected ? '#FFB800' : '#CBD5E1',
                fontWeight: isSelected ? 700 : 500,
                fontSize: 12,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
                boxShadow: isSelected ? '0 1px 6px rgba(255, 184, 0, 0.25)' : 'none',
              }}
            >
              <AppIcon name={icon} size={15} color={isSelected ? '#FFB800' : '#94A3B8'} />
              <span>{cat}</span>
              <span
                style={{
                  fontSize: 10,
                  opacity: 0.9,
                  padding: '1px 5px',
                  borderRadius: 10,
                  backgroundColor: isSelected ? '#FFB800' : '#161B22',
                  color: isSelected ? '#0B0E14' : '#CBD5E1',
                  fontWeight: 700,
                  fontFamily: 'Space Grotesk, sans-serif',
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* شبكة بطاقات المنتجات القابلة للتمرير */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '2px 4px 6px',
        }}
      >
        {products.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: 12,
              color: '#94A3B8',
              padding: 40,
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: '50%',
                backgroundColor: 'rgba(255, 184, 0, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 4,
              }}
            >
              <AppIcon name="inventory_2" size={30} color="#FFB800" />
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#F8FAFC' }}>
              قاعدة البيانات جاهزة للبدء
            </div>
            <div style={{ fontSize: 13, color: '#94A3B8', maxWidth: 360, lineHeight: 1.6 }}>
              لا توجد منتجات مسجلة في المتجر حالياً. يمكنك البدء بإضافة منتجاتك وأسعارك من شاشة المنتجات والباركود.
            </div>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: 10,
              color: '#94A3B8',
              padding: 40,
              textAlign: 'center',
            }}
          >
            <AppIcon name="search_off" size={40} color="#64748B" />
            <div style={{ fontSize: 14, fontWeight: 600, color: '#F8FAFC' }}>لم يتم العثور على منتجات تطابق البحث</div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('الكل');
              }}
              style={{ height: 34, fontSize: 12, padding: '0 14px' }}
            >
              إعادة ضبط الفلاتر
            </button>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(185px, 1fr))',
              gap: 12,
            }}
          >
            {displayedProducts.map((product) => {
              const primaryVariant = product.variants?.[0] || {};
              const price = primaryVariant.sale_price ?? product.price ?? 0;
              const totalStock =
                product.variants?.reduce((s: number, v: any) => s + (v.total_stock || 0), 0) ??
                product.totalStock ??
                999;
              const hasMultipleVariants = (product.variants?.length || 0) > 1;
              const catName = product.category_name || product.category || 'عام';
              const catIcon = categoryIconMap[catName] || 'smartphone';

              const isOutOfStock = totalStock <= 0;
              const isLowStock = totalStock > 0 && totalStock <= 5;

              return (
                <div
                  key={product.id}
                  onClick={() => {
                    if (isOutOfStock) {
                      sounds.playWarning();
                      toastWarning(`المنتج "${product.name_ar || product.name}" غير متوفر بالمخزون حالياً (الرصيد: 0)`);
                    } else {
                      handleProductClick(product);
                    }
                  }}
                  className="glass-card"
                  style={{
                    backgroundColor: isOutOfStock ? '#12161F' : '#161B22',
                    borderRadius: 12,
                    padding: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    border: '1px solid #262E3D',
                    cursor: isOutOfStock ? 'not-allowed' : 'pointer',
                    opacity: isOutOfStock ? 0.65 : 1,
                    transition: 'all 0.16s ease',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                  onMouseEnter={(e) => {
                    if (!isOutOfStock) {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.borderColor = '#FFB800';
                      e.currentTarget.style.boxShadow = '0 6px 20px rgba(255, 184, 0, 0.18)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isOutOfStock) {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.borderColor = '#262E3D';
                      e.currentTarget.style.boxShadow = 'none';
                    }
                  }}
                >
                  {/* الشريط العلوي للبطاقة: أيقونة التصنيف وشارة المخزون */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 7,
                        backgroundColor: 'rgba(255, 184, 0, 0.12)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <AppIcon name={catIcon} size={15} color="#FFB800" />
                    </div>

                    {/* شارة المخزون */}
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: 6,
                        fontFamily: 'Space Grotesk, sans-serif',
                        backgroundColor: isOutOfStock
                          ? 'rgba(239, 68, 68, 0.15)'
                          : isLowStock
                          ? 'rgba(245, 158, 11, 0.15)'
                          : 'rgba(16, 185, 129, 0.15)',
                        color: isOutOfStock
                          ? '#EF4444'
                          : isLowStock
                          ? '#F59E0B'
                          : '#10B981',
                      }}
                    >
                      {isOutOfStock ? 'نفد' : isLowStock ? `باقي ${totalStock}` : `متوفر ${totalStock}`}
                    </span>
                  </div>

                  {/* اسم المنتج والماركة */}
                  <div style={{ marginBottom: 10, flex: 1 }}>
                    <h4
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: '#F8FAFC',
                        margin: 0,
                        lineHeight: 1.35,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {product.name_ar || product.name}
                    </h4>

                    <div
                      style={{
                        fontSize: 11,
                        color: '#94A3B8',
                        marginTop: 3,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {product.brand_name || product.brand || catName}
                    </div>
                  </div>

                  {/* الشريط السفلي: السعر وزر الإضافة */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingTop: 8,
                      borderTop: '1px dashed #262E3D',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 800,
                          color: '#FFB800',
                          fontFamily: 'Space Grotesk, sans-serif',
                        }}
                      >
                        {formatMoney(price)}
                      </div>
                      {hasMultipleVariants && (
                        <div style={{ fontSize: 9.5, color: '#FFB800', fontWeight: 600 }}>
                          {product.variants.length} درجات / خيارات
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={isOutOfStock}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!isOutOfStock) handleProductClick(product);
                      }}
                      title="إضافة للسلة"
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 8,
                        backgroundColor: '#FFB800',
                        border: 'none',
                        color: '#0B0E14',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: isOutOfStock ? 'not-allowed' : 'pointer',
                        transition: 'all 0.15s ease',
                        boxShadow: '0 2px 8px rgba(255, 184, 0, 0.3)',
                      }}
                    >
                      <AppIcon name="add" size={17} color="#0B0E14" />
                    </button>
                  </div>
                </div>
              );
            })}

            {filteredProducts.length > displayLimit && (
              <div
                style={{
                  gridColumn: '1 / -1',
                  display: 'flex',
                  justifyContent: 'center',
                  padding: '16px 0',
                }}
              >
                <button
                  type="button"
                  onClick={() => setDisplayLimit((prev) => prev + PAGE_SIZE)}
                  style={{
                    padding: '9px 24px',
                    fontSize: 13,
                    fontWeight: 700,
                    borderRadius: 10,
                    background: 'rgba(255, 184, 0, 0.1)',
                    border: '1.5px solid rgba(255, 184, 0, 0.35)',
                    color: '#FFB800',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 184, 0, 0.2)';
                    e.currentTarget.style.borderColor = '#FFB800';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 184, 0, 0.1)';
                    e.currentTarget.style.borderColor = 'rgba(255, 184, 0, 0.35)';
                  }}
                >
                  <AppIcon name="expand_more" size={16} />
                  <span>عرض المزيد من المنتجات ({filteredProducts.length - displayLimit} متبقي)</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* نافذة سريعة لاختيار الدرجة / الحجم في حال كان للمنتج أكثر من Variant */}
      {variantModalProduct && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(6px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={() => setVariantModalProduct(null)}
        >
          <div
            className="glass-card animate-scale-in"
            style={{
              width: '100%',
              maxWidth: 420,
              backgroundColor: '#161B22',
              border: '1px solid #262E3D',
              borderRadius: 16,
              padding: 20,
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#F8FAFC', margin: 0 }}>
                  اختر النوع أو السعة المطلوبة
                </h3>
                <span style={{ fontSize: 12, color: '#94A3B8' }}>
                  {variantModalProduct.name_ar || variantModalProduct.name}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setVariantModalProduct(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#94A3B8',
                  padding: 4,
                }}
              >
                <AppIcon name="close" size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
              {variantModalProduct.variants?.map((v: any) => {
                const isOutOfStock = (v.total_stock ?? 0) <= 0;
                return (
                  <button
                    key={v.id}
                    type="button"
                    disabled={isOutOfStock}
                    onClick={() => handleSelectVariant(v)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderRadius: 10,
                      border: '1px solid #262E3D',
                      backgroundColor: '#0B0E14',
                      cursor: isOutOfStock ? 'not-allowed' : 'pointer',
                      opacity: isOutOfStock ? 0.5 : 1,
                      textAlign: 'right',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!isOutOfStock) e.currentTarget.style.backgroundColor = '#1C222D';
                    }}
                    onMouseLeave={(e) => {
                      if (!isOutOfStock) e.currentTarget.style.backgroundColor = '#0B0E14';
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#F8FAFC' }}>
                        {v.name || v.variant_name || 'الافتراضي'}
                      </div>
                      <div style={{ fontSize: 11, color: isOutOfStock ? '#EF4444' : '#94A3B8' }}>
                        {isOutOfStock ? 'غير متوفر بالمخزون' : `المتوفر: ${v.total_stock ?? 0} قطعة`}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 800,
                          color: '#FFB800',
                          fontFamily: 'Space Grotesk, sans-serif',
                        }}
                      >
                        {formatMoney(v.sale_price ?? 0)}
                      </span>
                      <AppIcon name="add_circle" size={20} color="#FFB800" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const ProductCatalog = React.memo(ProductCatalogComponent);
export default ProductCatalog;
