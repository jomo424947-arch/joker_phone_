/**
 * محرك طباعة ملصقات الباركود الحرارية الاحترافي (Professional Thermal Barcode Label Engine)
 * يدعم:
 * - توليد باركود حقيقي عالي الكثافة والتباين (EAN-13 و Code-128) عبر JsBarcode
 * - إيقاف التنعيم المضاد للتشويش (shape-rendering: crispEdges) لمنع بهتان الخطوط في الطابعات الحرارية
 * - مقاسات ملصقات قياسية متنوعة (38x25mm، 40x25mm، 50x30mm، 50x25mm، 58x40mm)
 * - استهداف الطابعة النشطة تلقائياً (مثل Xprinter XP-235B) وحفظ اختيار المستخدم
 * - مهلة أمان قصوى (10 ثوانٍ) لمنع تعليق زر الطباعة نهائياً
 * - تفريغ قائمة الطباعة وإلغاء الأوامر العالقة تلقائياً أو يدوياً
 */

import JsBarcode from 'jsbarcode';
import { DOMImplementation, XMLSerializer } from '@xmldom/xmldom';
import { BrowserWindow } from 'electron';
import { exec } from 'child_process';
import { promisify } from 'util';
import type Database from 'better-sqlite3';
import { getDatabase } from '../db/connection';
import { printEngine } from './print-engine';

const execAsync = promisify(exec);

export interface BarcodeLabelData {
  productName: string;
  variantName?: string;
  priceFormatted: string;
  barcode: string;
  copiesCount: number;
}

export interface BarcodePrintOptions {
  printerName?: string;
  labelWidthMm?: number;
  labelHeightMm?: number;
}

export interface SystemPrinterInfo {
  name: string;
  displayName: string;
  isDefault: boolean;
  status: number;
  statusText: string;
  isThermalRecommended: boolean;
}

export class BarcodePrinter {
  private db?: Database.Database;
  private printersCache: { data: SystemPrinterInfo[]; timestamp: number } | null = null;
  private readonly CACHE_TTL_MS = 30000; // تخزين مؤقت لقائمة الطابعات لمدة 30 ثانية لتسريع الطباعة الفوري

  constructor(db?: Database.Database) {
    this.db = db;
  }

  private getDb(): Database.Database {
    return this.db ?? getDatabase();
  }

  /**
   * جلب اسم المتجر المحفوظ في الإعدادات لعرضه على الملصق
   */
  getStoreName(): string {
    try {
      const db = this.getDb();
      const row = db.prepare("SELECT value FROM settings WHERE key = 'store_name'").get() as
        | { value: string }
        | undefined;
      return row?.value || 'موبيكس';
    } catch {
      return 'موبيكس';
    }
  }

  /**
   * جلب اسم طابعة الباركود المفضلة من الإعدادات
   */
  getConfiguredPrinterName(): string {
    try {
      const db = this.getDb();
      const row = db
        .prepare("SELECT value FROM settings WHERE key = 'barcode_printer_name'")
        .get() as { value: string } | undefined;
      return row?.value || '';
    } catch {
      return '';
    }
  }

  /**
   * توليد كود SVG حقيقي للباركود (EAN-13 أو Code-128) فائق التباين ومناسب للطباعة الحرارية
   */
  generateBarcodeSvg(code: string, width = 2, height = 45): string {
    const cleanCode = (code || '').trim();
    if (!cleanCode) return '';

    try {
      const doc = new DOMImplementation().createDocument(
        'http://www.w3.org/1999/xhtml',
        'html',
        null
      );
      const svgNode = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');

      // فحص هل الكود مكون من 13 رقماً مطابقاً لمعيار EAN-13
      const is13Digits = /^\d{13}$/.test(cleanCode);
      let rendered = false;

      if (is13Digits) {
        try {
          JsBarcode(svgNode, cleanCode, {
            xmlDocument: doc as any,
            format: 'EAN13',
            displayValue: false,
            width,
            height,
            margin: 0,
            background: '#ffffff',
            lineColor: '#000000',
          });
          rendered = true;
        } catch {
          // إذا كان فحص Checksum الخاص بـ EAN-13 غير صحيح نتحول تلقائياً لـ CODE128
        }
      }

      if (!rendered) {
        JsBarcode(svgNode, cleanCode, {
          xmlDocument: doc as any,
          format: 'CODE128',
          displayValue: false,
          width,
          height,
          margin: 0,
          background: '#ffffff',
          lineColor: '#000000',
        });
      }

      // تفعيل خصائص الحواف الصلبة لمنع أي بهتان ناتج عن الـ Anti-aliasing في الطابعات الحرارية
      svgNode.setAttribute('shape-rendering', 'crispEdges');
      svgNode.setAttribute('class', 'barcode-svg');

      return new XMLSerializer().serializeToString(svgNode);
    } catch (err) {
      console.error('خطأ أثناء توليد كود SVG للباركود:', err);
      return '';
    }
  }

  /**
   * توليد قالب HTML لملصقات الباركود بمقاس دقيق وخطوط سوداء داكنة
   */
  generateLabelsHtml(
    labels: BarcodeLabelData[],
    labelWidthMm = 38,
    labelHeightMm = 25
  ): string {
    const storeName = this.getStoreName();
    const labelItems: string[] = [];

    // ضبط أبعاد خطوط الباركود بحسب مساحة الملصق
    const barcodeHeightPx = labelHeightMm >= 30 ? 55 : 42;
    const barcodeModuleWidth = labelWidthMm >= 50 ? 2 : 2;

    for (const item of labels) {
      const count = Math.max(1, item.copiesCount);
      const barcodeSvg = this.generateBarcodeSvg(
        item.barcode,
        barcodeModuleWidth,
        barcodeHeightPx
      );

      for (let i = 0; i < count; i++) {
        labelItems.push(`
          <div class="label-card">
            <div class="header-row">
              <span class="store-name">${storeName}</span>
              ${item.variantName && item.variantName !== 'الافتراضي'
            ? `<span class="variant-tag">${item.variantName}</span>`
            : ''
          }
            </div>

            <div class="product-title">${item.productName}</div>

            <div class="barcode-wrapper">
              <div class="barcode-svg-container">
                ${barcodeSvg}
              </div>
              <div class="barcode-digits">${item.barcode}</div>
            </div>

            <div class="footer-row">
              <span class="price-label">السعر:</span>
              <span class="price-val">${item.priceFormatted}</span>
            </div>
          </div>
        `);
      }
    }

    return `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8">
        <title>طباعة ملصقات الباركود</title>
        <style>
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          @page {
            margin: 0;
            size: ${labelWidthMm}mm ${labelHeightMm}mm;
          }
          html, body {
            margin: 0;
            padding: 0;
            background: #ffffff;
            color: #000000;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Tahoma, Arial, sans-serif;
            direction: rtl;
          }
          .label-card {
            width: ${labelWidthMm}mm;
            height: ${labelHeightMm}mm;
            max-width: ${labelWidthMm}mm;
            max-height: ${labelHeightMm}mm;
            padding: 1.2mm 1.5mm 1mm 1.5mm;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            align-items: center;
            text-align: center;
            page-break-after: always;
            break-after: page;
            overflow: hidden;
            background: #ffffff;
          }
          .header-row {
            width: 100%;
            display: flex;
            justify-content: space-between;
            align-items: center;
            line-height: 1;
            padding-bottom: 0.3mm;
          }
          .store-name {
            font-size: 6.5pt;
            font-weight: 800;
            color: #000000;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 70%;
            text-align: right;
          }
          .variant-tag {
            font-size: 6pt;
            font-weight: 700;
            color: #000000;
            border: 0.5pt solid #000000;
            padding: 0.2mm 1mm;
            border-radius: 1mm;
            white-space: nowrap;
          }
          .product-title {
            font-size: 8pt;
            font-weight: 900;
            color: #000000;
            line-height: 1.15;
            max-height: 2.3em;
            overflow: hidden;
            text-overflow: ellipsis;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            word-break: break-word;
            width: 100%;
          }
          .barcode-wrapper {
            width: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            margin: 0.3mm 0;
            flex-grow: 1;
          }
          .barcode-svg-container {
            width: 100%;
            display: flex;
            justify-content: center;
            align-items: center;
            max-height: 12mm;
            overflow: hidden;
          }
          .barcode-svg {
            width: 96%;
            max-width: 96%;
            height: auto;
            max-height: 11.5mm;
            shape-rendering: crispEdges !important;
            image-rendering: pixelated !important;
            display: block;
          }
          .barcode-digits {
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 7.5pt;
            font-weight: 800;
            letter-spacing: 1.5px;
            color: #000000;
            line-height: 1;
            margin-top: 0.4mm;
          }
          .footer-row {
            width: 100%;
            display: flex;
            justify-content: center;
            align-items: baseline;
            gap: 2mm;
            border-top: 0.75pt solid #000000;
            padding-top: 0.4mm;
            line-height: 1;
          }
          .price-label {
            font-size: 6.5pt;
            font-weight: 700;
            color: #000000;
          }
          .price-val {
            font-size: 9pt;
            font-weight: 900;
            color: #000000;
          }
        </style>
      </head>
      <body>
        ${labelItems.join('')}
      </body>
      </html>
    `;
  }

  /**
   * جلب قائمة الطابعات المثبتة على نظام التشغيل مع فحص حالة الاتصال الحقيقية (Online/Offline)
   * مدعوم بتخزين مؤقت عالي الأداء لتفادي تعليق واجهة المستخدم
   */
  async getSystemPrinters(forceRefresh = false): Promise<SystemPrinterInfo[]> {
    // إرجاع القائمة المخزنة مؤقتاً لتسريع الاستجابة الفوري (0ms) إلا إذا طُلب التحديث الإجباري
    if (
      !forceRefresh &&
      this.printersCache &&
      Date.now() - this.printersCache.timestamp < this.CACHE_TTL_MS
    ) {
      return this.printersCache.data;
    }

    try {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) {
        return this.printersCache?.data || [];
      }

      const rawPrinters = await win.webContents.getPrintersAsync();

      // فحص حالة الاتصال الفعلية لويندوز (WorkOffline) بشكل غير متزامن لتفادي تجميد الـ Event Loop
      const offlineSet = new Set<string>();
      if (process.platform === 'win32') {
        try {
          const { stdout } = await execAsync(
            'powershell -NoProfile -Command "Get-CimInstance Win32_Printer | Select-Object Name, WorkOffline | ConvertTo-Json"',
            { timeout: 1500 }
          );
          if (stdout && stdout.trim()) {
            const parsed = JSON.parse(stdout);
            const list = Array.isArray(parsed) ? parsed : [parsed];
            for (const item of list) {
              if (item && item.WorkOffline === true && item.Name) {
                offlineSet.add(item.Name.toLowerCase().trim());
              }
            }
          }
        } catch {
          // في حال تأخر أو فشل أمر PowerShell نعتمد على بيانات إلكترون المباشرة دون تجميد النظام
        }
      }

      const result: SystemPrinterInfo[] = rawPrinters.map((p: any) => {
        const lowerName = (p.name || '').toLowerCase().trim();
        const isThermal =
          lowerName.includes('xp-') ||
          lowerName.includes('xprinter') ||
          lowerName.includes('235') ||
          lowerName.includes('365') ||
          lowerName.includes('barcode') ||
          lowerName.includes('label') ||
          lowerName.includes('thermal') ||
          lowerName.includes('pos');

        const isOffline = offlineSet.has(lowerName);
        let statusText = 'جاهزة ومتصلة';
        if (isOffline) {
          statusText = 'غير متصلة (Offline)';
        } else if (p.status !== 0) {
          statusText = 'بها خطأ / مشغولة';
        }

        return {
          name: p.name,
          displayName: p.displayName || p.name,
          isDefault: Boolean(p.isDefault),
          status: isOffline ? 128 : p.status,
          statusText,
          isThermalRecommended: isThermal,
        };
      });

      // حفظ القائمة في الذاكرة المؤقتة
      this.printersCache = {
        data: result,
        timestamp: Date.now(),
      };

      return result;
    } catch (err) {
      console.error('فشل جلب قائمة الطابعات من النظام:', err);
      return this.printersCache?.data || [];
    }
  }

  /**
   * تحديد اسم الطابعة الأكثر ملاءمة لطباعة الباركود
   * تفضل تلقائياً الطابعة الحرارية الافتراضية المتصلة بنجاح
   */
  async resolveTargetPrinter(
    explicitName?: string,
    providedPrinters?: SystemPrinterInfo[]
  ): Promise<string | undefined> {
    const printers = providedPrinters || (await this.getSystemPrinters());
    if (printers.length === 0) return undefined;

    // 1. إذا تم تحديد طابعة صريحة وهي متصلة (Online)
    if (explicitName && explicitName.trim()) {
      const match = printers.find((p) => p.name.toLowerCase() === explicitName.trim().toLowerCase());
      if (match && match.status === 0) return match.name;
    }

    // 2. الطابعة المحفوظة في الإعدادات إن كانت متصلة (Online)
    const configured = this.getConfiguredPrinterName();
    if (configured && configured.trim()) {
      const match = printers.find((p) => p.name.toLowerCase() === configured.trim().toLowerCase());
      if (match && match.status === 0) return match.name;
    }

    // 3. الطابعة الحرارية الافتراضية لويندوز والمتصلة (Online)
    const defaultThermalOnline = printers.find((p) => p.isThermalRecommended && p.isDefault && p.status === 0);
    if (defaultThermalOnline) return defaultThermalOnline.name;

    // 4. أي طابعة باركود حرارية متصلة (Online)
    const anyThermalOnline = printers.find((p) => p.isThermalRecommended && p.status === 0);
    if (anyThermalOnline) return anyThermalOnline.name;

    // 5. أي طابعة افتراضية متصلة (Online)
    const defaultOnline = printers.find((p) => p.isDefault && p.status === 0);
    if (defaultOnline) return defaultOnline.name;

    // 6. أي طابعة متصلة بالنظام
    const anyOnline = printers.find((p) => p.status === 0);
    if (anyOnline) return anyOnline.name;

    // 7. إذا لم تكن هناك أي طابعة متصلة، نرجع الطابعة المحددة أو الافتراضية
    if (explicitName && explicitName.trim()) return explicitName.trim();
    const defaultPrinter = printers.find((p) => p.isDefault);
    if (defaultPrinter) return defaultPrinter.name;

    return printers[0]?.name;
  }

  /**
   * تفريغ قائمة انتظار الطباعة وإلغاء أي مهام عالقة أو متوقفة بسبب أخطاء الاتصال
   */
  async clearPrintQueue(
    printerName?: string
  ): Promise<{ success: boolean; message: string }> {
    // إبطال التخزين المؤقت لتحديث الحالة فوراً
    this.printersCache = null;

    try {
      if (process.platform === 'win32') {
        if (printerName) {
          const sanitized = printerName.replace(/["';`$]/g, '');
          await execAsync(
            `powershell -NoProfile -Command "Get-PrintJob -PrinterName '${sanitized}' -ErrorAction SilentlyContinue | Remove-PrintJob -ErrorAction SilentlyContinue"`
          );
        } else {
          await execAsync(
            `powershell -NoProfile -Command "Get-Printer | ForEach-Object { Get-PrintJob -PrinterName $_.Name -ErrorAction SilentlyContinue | Remove-PrintJob -ErrorAction SilentlyContinue }"`
          );
        }
      }

      return {
        success: true,
        message: 'تم تفريغ قائمة مهام الطباعة وإلغاء الأوامر العالقة بنجاح',
      };
    } catch (err: any) {
      console.error('فشل تفريغ قائمة الطباعة:', err);
      return {
        success: false,
        message: err?.message || 'تعذر تفريغ قائمة الطباعة',
      };
    }
  }

  /**
   * طباعة ملصقات الباركود بسرعة فائقة عبر محرك الطباعة المركزي printEngine
   */
  async printLabels(
    labels: BarcodeLabelData[],
    options?: BarcodePrintOptions
  ): Promise<{ success: boolean; error?: string }> {
    const widthMm = options?.labelWidthMm || 38;
    const heightMm = options?.labelHeightMm || 25;

    try {
      // جلب قائمة الطابعات وتحديد الطابعة المستهدفة في خطوة واحدة بدون استدعاءات مكررة
      const systemPrinters = await this.getSystemPrinters();
      const targetPrinterName = await this.resolveTargetPrinter(options?.printerName, systemPrinters);
      const targetedInfo = systemPrinters.find(
        (p) => p.name.toLowerCase() === (targetPrinterName || '').toLowerCase()
      );

      // إذا كانت الطابعة المستهدفة غير متصلة (Offline) بشكل قاطع ولا يوجد بديل متصل
      if (targetedInfo && targetedInfo.status !== 0) {
        return {
          success: false,
          error: `الطابعة (${targetPrinterName}) غير متصلة بالكمبيوتر حالياً (Offline). يرجى التأكد من تشغيل الطابعة وتوصيل كابل USB، أو اختيار الطابعة الأخرى من القائمة.`,
        };
      }

      const html = this.generateLabelsHtml(labels, widthMm, heightMm);

      // إرسال المهمة لمحرك الطباعة السريع مع إعادة استخدام النافذة الخفية
      const res = await printEngine.print({
        html,
        deviceName: targetPrinterName,
        silent: true,
        printBackground: true,
        color: false,
        pageSize: {
          width: widthMm * 1000,
          height: heightMm * 1000,
        },
        calculateDynamicHeight: false, // ملصقات الباركود محددة الأبعاد مسبقاً بدقة
        timeoutMs: 8000,
      });

      if (!res.success) {
        return {
          success: false,
          error: res.failureReason || 'رفضت الطابعة أمر الطباعة المباشر، تحقق من تشغيل الطابعة وتوصيل USB',
        };
      }

      return { success: true };
    } catch (err: any) {
      console.error('Barcode printer error:', err);
      return { success: false, error: err?.message || 'حدث خطأ غير متوقع أثناء الطباعة' };
    }
  }
}

export const barcodePrinter = new BarcodePrinter();

