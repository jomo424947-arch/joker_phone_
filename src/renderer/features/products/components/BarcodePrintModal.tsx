import React, { useState, useEffect, useRef } from 'react';
import {
  Printer,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Zap,
  Sliders,
  Layers,
  ChevronDown,
} from 'lucide-react';
import JsBarcode from 'jsbarcode';
import { Modal } from '../../../components/common/Modal';
import { Button } from '../../../components/common/Button';
import { Input } from '../../../components/common/Input';
import { GlassIcon } from '../../../components/common/GlassIcon';
import { sounds } from '../../../lib/sounds';
import { useToast } from '../../../components/common/ToastContext';

interface BarcodePrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  productName: string;
  variantName?: string;
  priceFormatted: string;
  barcode: string;
}

interface SystemPrinter {
  name: string;
  displayName: string;
  isDefault: boolean;
  status: number;
  statusText: string;
  isThermalRecommended: boolean;
}

const LABEL_SIZES = [
  { id: '38x25', label: '38 × 25 مم (الافتراضي للباركود)', width: 38, height: 25 },
  { id: '40x25', label: '40 × 25 مم', width: 40, height: 25 },
  { id: '50x25', label: '50 × 25 مم', width: 50, height: 25 },
  { id: '50x30', label: '50 × 30 مم', width: 50, height: 30 },
  { id: '58x40', label: '58 × 40 مم', width: 58, height: 40 },
];

export function BarcodePrintModal({
  isOpen,
  onClose,
  productName,
  variantName,
  priceFormatted,
  barcode,
}: BarcodePrintModalProps): React.ReactElement | null {
  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();
  const [copies, setCopies] = useState('1');
  const [isPrinting, setIsPrinting] = useState(false);
  const [isTestPrinting, setIsTestPrinting] = useState(false);
  const [isClearingQueue, setIsClearingQueue] = useState(false);
  const [isRefreshingPrinters, setIsRefreshingPrinters] = useState(false);
  const [printers, setPrinters] = useState<SystemPrinter[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>('');
  const [selectedSizeId, setSelectedSizeId] = useState<string>('38x25');
  const [storeName, setStoreName] = useState<string>('الجوكر فون');

  const previewSvgRef = useRef<SVGSVGElement | null>(null);

  // جلب الطابعات وإعدادات المتجر عند فتح المودال مع اختيار الطابعة النشطة تلقائياً
  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;

    const loadPrintersAndSettings = async () => {
      try {
        const electron = (window as any).electron;
        if (!electron) return;

        let savedPrinter = '';

        // 1. جلب الإعدادات المحفوظة
        if (electron.getSettings) {
          const sRes = await electron.getSettings();
          if (mounted && sRes?.success && sRes.data) {
            if (sRes.data.store_name) setStoreName(sRes.data.store_name);
            if (sRes.data.barcode_printer_name) {
              savedPrinter = sRes.data.barcode_printer_name;
            }
            if (sRes.data.barcode_label_size) {
              setSelectedSizeId(sRes.data.barcode_label_size);
            }
          }
        }

        // 2. جلب قائمة طابعات النظام مع حالة الاتصال الحقيقية
        if (electron.getSystemPrinters) {
          const res = await electron.getSystemPrinters();
          if (mounted && res?.success && Array.isArray(res.data)) {
            setPrinters(res.data);

            const savedExists = res.data.find(
              (p: SystemPrinter) => p.name.toLowerCase() === savedPrinter.toLowerCase()
            );
            const savedIsOnline = savedExists && savedExists.status === 0;

            if (savedIsOnline) {
              setSelectedPrinter(savedExists.name);
            } else {
              // إذا كانت الطابعة المحفوظة غير متصلة أو فارغة، نختار الطابعة الحرارية المتصلة تلقائياً
              const onlineThermals = res.data.filter(
                (p: SystemPrinter) => p.isThermalRecommended && p.status === 0
              );
              const bestThermalOnline =
                onlineThermals.find((p: SystemPrinter) => p.isDefault) ||
                onlineThermals[0] ||
                res.data.find((p: SystemPrinter) => p.isDefault && p.status === 0) ||
                res.data.find((p: SystemPrinter) => p.status === 0);

              const chosen = bestThermalOnline?.name || savedPrinter || (res.data[0]?.name ?? '');
              setSelectedPrinter(chosen);

              // حفظ الطابعة النشطة تلقائياً إن كانت مختلفة
              if (bestThermalOnline && bestThermalOnline.name !== savedPrinter && electron.updateSettings) {
                electron.updateSettings([
                  { key: 'barcode_printer_name', value: bestThermalOnline.name },
                ]);
              }
            }
          }
        }
      } catch (err) {
        console.warn('تعذر جلب الطابعات والإعدادات:', err);
      }
    };

    loadPrintersAndSettings();

    return () => {
      mounted = false;
    };
  }, [isOpen]);

  // رسم باركود حقيقي عالي التباين في شاشة المعاينة
  useEffect(() => {
    if (!isOpen || !previewSvgRef.current || !barcode) return;

    try {
      const cleanCode = barcode.trim();
      const is13 = /^\d{13}$/.test(cleanCode);

      try {
        JsBarcode(previewSvgRef.current, cleanCode, {
          format: is13 ? 'EAN13' : 'CODE128',
          displayValue: false,
          width: 2,
          height: 38,
          margin: 0,
          background: '#ffffff',
          lineColor: '#000000',
        });
      } catch {
        JsBarcode(previewSvgRef.current, cleanCode, {
          format: 'CODE128',
          displayValue: false,
          width: 2,
          height: 38,
          margin: 0,
          background: '#ffffff',
          lineColor: '#000000',
        });
      }
    } catch (e) {
      console.warn('خطأ في رسم معاينة الباركود:', e);
    }
  }, [isOpen, barcode, selectedSizeId]);

  if (!isOpen) return null;

  const currentSize =
    LABEL_SIZES.find((s) => s.id === selectedSizeId) || LABEL_SIZES[0];
  const activePrinterInfo = printers.find(
    (p) => p.name.toLowerCase() === (selectedPrinter || '').toLowerCase()
  );
  const isSelectedOnline = activePrinterInfo?.status === 0;

  // البحث عن أي طابعة حرارية أخرى متصلة إن كانت الحالية غير متصلة
  const alternativeOnlinePrinter = printers.find(
    (p) => p.name.toLowerCase() !== (selectedPrinter || '').toLowerCase() && p.status === 0
  );

  const handlePrinterChange = async (printerName: string) => {
    setSelectedPrinter(printerName);
    try {
      const electron = (window as any).electron;
      if (electron?.updateSettings) {
        await electron.updateSettings([
          { key: 'barcode_printer_name', value: printerName },
        ]);
      }
    } catch {
      // ignore
    }
  };

  const handleSizeChange = async (sizeId: string) => {
    setSelectedSizeId(sizeId);
    try {
      const electron = (window as any).electron;
      const sizeDef = LABEL_SIZES.find((s) => s.id === sizeId);
      if (electron?.updateSettings && sizeDef) {
        await electron.updateSettings([
          { key: 'barcode_label_size', value: sizeId },
          { key: 'barcode_label_width_mm', value: String(sizeDef.width) },
          { key: 'barcode_label_height_mm', value: String(sizeDef.height) },
        ]);
      }
    } catch {
      // ignore
    }
  };

  // تحديث قائمة الطابعات وحالتها
  const handleRefreshPrinters = async () => {
    setIsRefreshingPrinters(true);
    try {
      const electron = (window as any).electron;
      if (electron?.getSystemPrinters) {
        const res = await electron.getSystemPrinters(true);
        if (res?.success && Array.isArray(res.data)) {
          setPrinters(res.data);
          toastSuccess('تم تحديث قائمة الطابعات وفحص الاتصال بنجاح');
        }
      }
    } catch (err: any) {
      toastError('تعذر تحديث قائمة الطابعات');
    } finally {
      setIsRefreshingPrinters(false);
    }
  };

  // تفريغ قائمة الطباعة وإلغاء التعليق
  const handleClearQueue = async () => {
    setIsClearingQueue(true);
    try {
      const electron = (window as any).electron;
      if (electron?.clearPrintQueue) {
        const res = await electron.clearPrintQueue(selectedPrinter);
        if (res?.success) {
          sounds.playSaleSuccess();
          toastSuccess('تم تفريغ قائمة الطباعة وإلغاء الأوامر العالقة بنجاح');

          // تحديث قائمة الطابعات بعد فك التعليق
          if (electron.getSystemPrinters) {
            const pRes = await electron.getSystemPrinters(true);
            if (pRes?.success && Array.isArray(pRes.data)) {
              setPrinters(pRes.data);
            }
          }
        } else {
          toastError(res?.message || 'تعذر تفريغ قائمة الطباعة');
        }
      }
    } catch (err: any) {
      toastError(err?.message || 'فشل فك تعليق الطابعة');
    } finally {
      setIsClearingQueue(false);
    }
  };

  // طباعة ملصق تجريبي واحد
  const handleTestPrint = async () => {
    setIsTestPrinting(true);
    try {
      const electron = (window as any).electron;
      const labels = [
        {
          productName,
          variantName,
          priceFormatted,
          barcode,
          copiesCount: 1,
        },
      ];

      const options = {
        printerName: selectedPrinter || undefined,
        labelWidthMm: currentSize.width,
        labelHeightMm: currentSize.height,
      };

      if (electron?.printBarcodeLabels) {
        const res = await electron.printBarcodeLabels(labels, options);
        if (!res?.success) {
          throw new Error(res?.error || 'فشلت طباعة الملصق التجريبي');
        }
      }

      sounds.playSaleSuccess();
      toastSuccess(`تمت طباعة ملصق تجريبي بنجاح على (${selectedPrinter || 'الطابعة'})`);
    } catch (err: any) {
      sounds.playError();
      toastError(err.message || 'تعذر إتمام طباعة الملصق التجريبي');
    } finally {
      setIsTestPrinting(false);
    }
  };

  // طباعة عدد الملصقات المطلوب
  const handlePrint = async (e: React.FormEvent) => {
    e.preventDefault();
    const count = parseInt(copies, 10);
    if (isNaN(count) || count <= 0) {
      sounds.playError();
      toastError('يرجى إدخال عدد ملصقات صحيح أكبر من الصفر');
      return;
    }

    setIsPrinting(true);
    try {
      const electron = (window as any).electron;
      const labels = [
        {
          productName,
          variantName,
          priceFormatted,
          barcode,
          copiesCount: count,
        },
      ];

      const options = {
        printerName: selectedPrinter || undefined,
        labelWidthMm: currentSize.width,
        labelHeightMm: currentSize.height,
      };

      if (electron?.printBarcodeLabels) {
        const res = await electron.printBarcodeLabels(labels, options);
        if (!res?.success) {
          throw new Error(res?.error || 'فشلت عملية الطباعة المباشرة');
        }
      }

      sounds.playSaleSuccess();
      toastSuccess(`تم إرسال ${count} ملصق للطابعة (${selectedPrinter || 'الافتراضية'}) بنجاح`);
      onClose();
    } catch (err: any) {
      sounds.playError();
      toastError(err.message || 'تعذر إتمام طباعة ملصق الباركود');
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="طباعة ملصقات الباركود للمنتج"
      icon={<GlassIcon icon={Printer} size="sm" variant="primary" />}
      width={520}
    >
      <form onSubmit={handlePrint} style={{ display: 'flex', flexDirection: 'column', gap: 14, direction: 'rtl' }}>
        
        {/* اختيار الطابعة وحالتها المباشرة (ظاهرة دائماً وواضحة) */}
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 10,
            backgroundColor: isSelectedOnline ? '#F5FAF7' : '#FEF2F2',
            border: isSelectedOnline ? '1px solid #CDE5D8' : '1px solid #FECACA',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <label style={{ fontSize: 13, fontWeight: 700, color: '#1B2B24', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Printer size={15} style={{ color: isSelectedOnline ? '#059669' : '#DC2626' }} />
              <span>طابعة الباركود المحددة:</span>
            </label>

            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                onClick={handleRefreshPrinters}
                disabled={isRefreshingPrinters}
                title="تحديث قائمة الطابعات وفحص الاتصال"
                style={{
                  padding: '5px 8px',
                  borderRadius: 6,
                  border: '1px solid #262E3D',
                  backgroundColor: '#0B0E14',
                  color: '#FFB800',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <RefreshCw size={11} className={isRefreshingPrinters ? 'spin-animation' : ''} />
                <span>تحديث</span>
              </button>

              <button
                type="button"
                onClick={handleClearQueue}
                disabled={isClearingQueue}
                title="تفريغ مهام الطباعة المعلقة وفك تعليق الطابعة"
                style={{
                  padding: '5px 8px',
                  borderRadius: 6,
                  border: '1px solid #EF4444',
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  color: '#EF4444',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Zap size={11} className={isClearingQueue ? 'spin-animation' : ''} />
                <span>فك التعليق</span>
              </button>
            </div>
          </div>

          {/* قائمة اختيار الطابعة */}
          <select
            value={selectedPrinter}
            onChange={(e) => handlePrinterChange(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 10px',
              borderRadius: 7,
              border: isSelectedOnline ? '1.5px solid #10B981' : '1.5px solid #EF4444',
              backgroundColor: '#0B0E14',
              fontSize: 13,
              fontWeight: 700,
              color: '#F8FAFC',
              direction: 'ltr',
              textAlign: 'right',
            }}
          >
            {printers.length === 0 ? (
              <option value="">لا توجد طابعات مكتشفة في الويندوز</option>
            ) : (
              printers.map((p) => {
                const online = p.status === 0;
                return (
                  <option key={p.name} value={p.name}>
                    {online ? '🟢 متصلة: ' : '🔴 غير متصلة: '}
                    {p.name} {p.isThermalRecommended ? '⭐ (طابعة ملصقات)' : ''}
                    {p.isDefault ? ' [الافتراضية]' : ''}
                  </option>
                );
              })
            )}
          </select>

          {/* سطر الحالة والتنبيه الذكي */}
          <div style={{ fontSize: 11.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {isSelectedOnline ? (
              <span style={{ color: '#047857', fontWeight: 600 }}>
                🟢 الطابعة متصلة وجاهزة للطباعة الحرارية المباشرة
              </span>
            ) : (
              <span style={{ color: '#B91C1C', fontWeight: 700 }}>
                🔴 هذه الطابعة غير متصلة حالياً (Offline)
              </span>
            )}

            {/* إذا كانت الطابعة الحالية غير متصلة ويوجد طابعة متصلة، زر تبديل سريع بنقرة واحدة */}
            {!isSelectedOnline && alternativeOnlinePrinter && (
              <button
                type="button"
                onClick={() => handlePrinterChange(alternativeOnlinePrinter.name)}
                style={{
                  padding: '3px 8px',
                  borderRadius: 5,
                  backgroundColor: '#059669',
                  color: '#FFFFFF',
                  border: 'none',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                التبديل إلى: {alternativeOnlinePrinter.name} 🟢
              </button>
            )}
          </div>
        </div>

        {/* مقاس ورق الملصق */}
        <div>
          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, marginBottom: 6, color: '#F8FAFC' }}>
            مقاس ورق الملصق (Label Size):
          </label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {LABEL_SIZES.map((size) => (
              <button
                key={size.id}
                type="button"
                onClick={() => handleSizeChange(size.id)}
                style={{
                  padding: '6px 11px',
                  borderRadius: 6,
                  border:
                    selectedSizeId === size.id
                      ? '1.5px solid #FFB800'
                      : '1px solid #262E3D',
                  backgroundColor:
                    selectedSizeId === size.id ? '#FFB800' : '#1C222D',
                  color:
                    selectedSizeId === size.id ? '#0B0E14' : '#CBD5E1',
                  fontSize: 11.5,
                  fontWeight: selectedSizeId === size.id ? 800 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {size.label}
              </button>
            ))}
          </div>
        </div>

        {/* معاينة شكل ملصق الباركود الحراري الحقيقي */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 6 }}>
            معاينة ملصق الباركود المباشر ({currentSize.width} × {currentSize.height} مم)
          </div>

          <div
            style={{
              display: 'inline-flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#FFFFFF',
              border: '2px solid #1B2B24',
              borderRadius: 6,
              padding: '8px 16px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
              width: 250,
              minHeight: 140,
              boxSizing: 'border-box',
            }}
          >
            {/* الترويسة واسم المتجر */}
            <div
              style={{
                width: '100%',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px dashed #DDD',
                paddingBottom: 3,
                marginBottom: 2,
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 800, color: '#1B2B24' }}>
                {storeName}
              </span>
              {variantName && variantName !== 'الافتراضي' && (
                <span
                  style={{
                    fontSize: 9.5,
                    fontWeight: 700,
                    color: '#000',
                    border: '1px solid #000',
                    padding: '1px 5px',
                    borderRadius: 3,
                  }}
                >
                  {variantName}
                </span>
              )}
            </div>

            {/* اسم المنتج */}
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 900,
                color: '#000000',
                maxWidth: 220,
                textOverflow: 'ellipsis',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                margin: '2px 0',
              }}
            >
              {productName}
            </div>

            {/* خطوط الباركود الحقيقية فائقة التباين */}
            <div
              style={{
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '3px 0',
              }}
            >
              <svg
                ref={previewSvgRef}
                style={{
                  width: '95%',
                  height: 40,
                  shapeRendering: 'crispEdges',
                  display: 'block',
                }}
              />
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: 2,
                  color: '#000000',
                  marginTop: 2,
                }}
              >
                {barcode}
              </div>
            </div>

            {/* السعر النهائي البارز */}
            <div
              style={{
                width: '100%',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'baseline',
                gap: 6,
                borderTop: '1px solid #000000',
                paddingTop: 3,
                marginTop: 2,
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, color: '#000000' }}>السعر:</span>
              <span style={{ fontSize: 14, fontWeight: 900, color: '#000000' }}>
                {priceFormatted}
              </span>
            </div>
          </div>
        </div>

        {/* عدد النسخ */}
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
            عدد الملصقات المطلوب طباعتها:
          </label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Input
              type="number"
              min="1"
              max="1000"
              value={copies}
              onChange={(e) => setCopies(e.target.value)}
              placeholder="1"
              style={{ fontSize: 16, fontWeight: 700, textAlign: 'center' }}
              required
              autoFocus
            />
            {['1', '5', '10', '20', '50'].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setCopies(preset)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: copies === preset ? '1.5px solid #FFB800' : '1px solid #262E3D',
                  backgroundColor: copies === preset ? '#FFB800' : '#1C222D',
                  color: copies === preset ? '#0B0E14' : '#CBD5E1',
                  fontWeight: copies === preset ? 800 : 600,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        {/* أزرار الإجراءات مع زر طباعة ملصق تجريبي */}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          {/* زر طباعة ملصق تجريبي (1) للتأكد السريع */}
          <Button
            type="button"
            variant="secondary"
            onClick={handleTestPrint}
            isLoading={isTestPrinting}
            disabled={isPrinting}
            title="طباعة ملصق واحد فقط للتأكد من المقاس وجودة الطباعة"
            style={{
              height: 46,
              fontSize: 13,
              fontWeight: 700,
              backgroundColor: '#F3F4F6',
              border: '1px solid #D1D5DB',
              color: '#374151',
              whiteSpace: 'nowrap',
              padding: '0 12px',
            }}
          >
            <Printer size={15} />
            <span>تجربة ملصق (1)</span>
          </Button>

          {/* زر الطباعة الرئيسي لعدد النسخ */}
          <Button
            type="submit"
            variant="primary"
            isLoading={isPrinting}
            disabled={isTestPrinting}
            style={{ flex: 1, height: 46, fontSize: 14.5, fontWeight: 700 }}
          >
            <Printer size={17} />
            <span>
              {isPrinting ? 'جارٍ إرسال أمر الطباعة...' : `طباعة الملصقات الآن (${copies})`}
            </span>
          </Button>

          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            style={{ width: 80, height: 46 }}
          >
            إلغاء
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default BarcodePrintModal;
