import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  FileSpreadsheet,
  Coins,
  CreditCard,
  ShoppingBag,
  Award,
  Calendar,
  Sparkles,
  RefreshCw,
  Package,
} from 'lucide-react';
import { Button } from '../../components/common/Button';
import { GlassIcon } from '../../components/common/GlassIcon';
import { formatMoney } from '../../../shared/utils/money';
import { sounds } from '../../lib/sounds';
import { useToast } from '../../components/common/ToastContext';

interface TopProduct {
  name: string;
  category: string;
  soldQty: number;
  totalRevenue: number;
}

export function ReportsScreen(): React.ReactElement {
  const { success: toastSuccess, error: toastError } = useToast();
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today');
  const [isLoading, setIsLoading] = useState(false);

  // إحصائيات حقيقية من قاعدة البيانات
  const [stats, setStats] = useState({
    totalSales: 0,
    invoiceCount: 0,
    avgTicket: 0,
    totalProfit: 0,
    cashSales: 0,
    cardSales: 0,
    discountsGiven: 0,
  });

  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);

  const getDateRange = (selectedPeriod: 'today' | 'week' | 'month') => {
    const end = new Date().toISOString().slice(0, 10);
    const startDateObj = new Date();
    if (selectedPeriod === 'week') {
      startDateObj.setDate(startDateObj.getDate() - 7);
    } else if (selectedPeriod === 'month') {
      startDateObj.setDate(startDateObj.getDate() - 30);
    }
    const start = startDateObj.toISOString().slice(0, 10);
    return { startDate: start, endDate: end };
  };

  const fetchReports = async () => {
    setIsLoading(true);
    try {
      const electron = (window as any).electron;
      if (!electron) return;

      const { startDate, endDate } = getDateRange(period);

      // 1. استرجاع التقرير اليومي/الدوري
      const dailyRes = await electron.getDailyReport?.({ startDate, endDate });
      let totalSales = 0;
      let invoiceCount = 0;
      let totalProfit = 0;
      let discountsGiven = 0;

      if (dailyRes?.success && dailyRes.data?.totals) {
        const t = dailyRes.data.totals;
        totalSales = t.total_net_sales ?? 0;
        invoiceCount = t.total_invoices ?? 0;
        totalProfit = t.total_gross_profit ?? 0;
        discountsGiven = t.total_discounts ?? 0;
      }

      // 2. استرجاع توزيع طرق الدفع
      const paymentsRes = await electron.getPaymentMethodsReport?.({ startDate, endDate });
      let cashSales = 0;
      let cardSales = 0;

      if (paymentsRes?.success && Array.isArray(paymentsRes.data)) {
        paymentsRes.data.forEach((p: any) => {
          if (p.method === 'cash') cashSales += p.amount_piasters || 0;
          if (p.method === 'card') cardSales += p.amount_piasters || 0;
        });
      }

      // 3. استرجاع أكثر المنتجات مبيعاً
      const topRes = await electron.getProductPerformanceReport?.({
        startDate,
        endDate,
        limit: 10,
        sortBy: 'revenue',
      });

      let mappedTopProducts: TopProduct[] = [];
      if (topRes?.success && Array.isArray(topRes.data)) {
        mappedTopProducts = topRes.data
          .filter((item: any) => (item.quantity_sold ?? 0) > 0)
          .map((item: any) => ({
            name: item.name || 'منتج غير محدد',
            category: item.category_name || 'عام',
            soldQty: item.quantity_sold ?? 0,
            totalRevenue: item.total_revenue_piasters ?? 0,
          }));
      }

      // حساب متوسط الفاتورة
      const avgTicket = invoiceCount > 0 ? Math.round(totalSales / invoiceCount) : 0;

      setStats({
        totalSales,
        invoiceCount,
        avgTicket,
        totalProfit,
        cashSales,
        cardSales,
        discountsGiven,
      });

      setTopProducts(mappedTopProducts);
    } catch (err: any) {
      console.error('Error loading reports:', err);
      toastError('تعذر تحميل بيانات التقارير');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [period]);

  const handleExportExcel = () => {
    sounds.playSaleSuccess();
    try {
      const csvRows = [
        ['المؤشر', 'القيمة'],
        ['إجمالي المبيعات (ج.م)', (stats.totalSales / 100).toFixed(2)],
        ['عدد الفواتير', stats.invoiceCount.toString()],
        ['صافي الربح التقديري (ج.م)', (stats.totalProfit / 100).toFixed(2)],
        ['متوسط الفاتورة (ج.م)', (stats.avgTicket / 100).toFixed(2)],
        ['المبيعات النقدية كاش (ج.م)', (stats.cashSales / 100).toFixed(2)],
        ['المبيعات بالفيزا والبطاقات (ج.م)', (stats.cardSales / 100).toFixed(2)],
        ['إجمالي الخصومات (ج.م)', (stats.discountsGiven / 100).toFixed(2)],
        [],
        ['أكثر المنتجات مبيعاً', 'القسم', 'الكمية المباعة', 'الإيراد المحقق (ج.م)'],
        ...topProducts.map((p) => [
          p.name,
          p.category,
          p.soldQty.toString(),
          (p.totalRevenue / 100).toFixed(2),
        ]),
      ];

      const csvContent = '\uFEFF' + csvRows.map((e) => e.map((val) => `"${val}"`).join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `تقرير_المبيعات_${period}_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toastSuccess('تم تصدير التقرير بنجاح إلى ملف CSV/Excel');
    } catch {
      toastError('فشل تصدير التقرير');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, height: '100%' }}>
      {/* شريط اختيار الفترة والتصدير */}
      <div
        className="glass-card"
        style={{
          padding: '12px 18px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#161B22',
          border: '1px solid #262E3D',
        }}
      >
        <div style={{ display: 'flex', gap: 6, backgroundColor: '#0B0E14', border: '1px solid #262E3D', padding: 4, borderRadius: 10 }}>
          <button
            type="button"
            onClick={() => {
              sounds.playClick();
              setPeriod('today');
            }}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: period === 'today' ? '#FFB800' : 'transparent',
              fontWeight: period === 'today' ? 800 : 600,
              color: period === 'today' ? '#0B0E14' : '#94A3B8',
              cursor: 'pointer',
              fontSize: 13,
              boxShadow: period === 'today' ? '0 2px 10px rgba(255, 184, 0, 0.35)' : 'none',
              transition: 'all 0.2s ease',
            }}
          >
            تقرير اليوم
          </button>
          <button
            type="button"
            onClick={() => {
              sounds.playClick();
              setPeriod('week');
            }}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: period === 'week' ? '#FFB800' : 'transparent',
              fontWeight: period === 'week' ? 800 : 600,
              color: period === 'week' ? '#0B0E14' : '#94A3B8',
              cursor: 'pointer',
              fontSize: 13,
              boxShadow: period === 'week' ? '0 2px 10px rgba(255, 184, 0, 0.35)' : 'none',
              transition: 'all 0.2s ease',
            }}
          >
            هذا الأسبوع
          </button>
          <button
            type="button"
            onClick={() => {
              sounds.playClick();
              setPeriod('month');
            }}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: period === 'month' ? '#FFB800' : 'transparent',
              fontWeight: period === 'month' ? 800 : 600,
              color: period === 'month' ? '#0B0E14' : '#94A3B8',
              cursor: 'pointer',
              fontSize: 13,
              boxShadow: period === 'month' ? '0 2px 10px rgba(255, 184, 0, 0.35)' : 'none',
              transition: 'all 0.2s ease',
            }}
          >
            هذا الشهر
          </button>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <Button
            variant="secondary"
            onClick={() => fetchReports()}
            disabled={isLoading}
            style={{ height: 42, padding: '0 14px' }}
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            <span>تحديث</span>
          </Button>

          <Button
            variant="secondary"
            onClick={handleExportExcel}
            style={{ height: 42, padding: '0 18px' }}
          >
            <FileSpreadsheet size={16} color="#21633D" />
            <span>تصدير التقرير إلى Excel</span>
          </Button>
        </div>
      </div>

      {/* بطاقات المؤشرات المالية الرئيسية */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <div
          className="glass-card"
          style={{ padding: '16px 18px', backgroundColor: '#161B22', border: '1px solid #262E3D' }}
        >
          <div style={{ fontSize: 12.5, color: '#94A3B8', fontWeight: 600 }}>إجمالي المبيعات</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#FFB800', marginTop: 4 }}>
            {formatMoney(stats.totalSales)}
          </div>
        </div>

        <div
          className="glass-card"
          style={{ padding: '16px 18px', backgroundColor: '#161B22', border: '1px solid #262E3D' }}
        >
          <div style={{ fontSize: 12.5, color: '#94A3B8', fontWeight: 600 }}>عدد الفواتير الصادرة</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#F8FAFC', marginTop: 4 }}>
            {stats.invoiceCount} فاتورة
          </div>
        </div>

        <div
          className="glass-card"
          style={{ padding: '16px 18px', backgroundColor: '#161B22', border: '1px solid #262E3D' }}
        >
          <div style={{ fontSize: 12.5, color: '#94A3B8', fontWeight: 600 }}>صافي الربح التقديري</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#10B981', marginTop: 4 }}>
            {formatMoney(stats.totalProfit)}
          </div>
        </div>

        <div
          className="glass-card"
          style={{ padding: '16px 18px', backgroundColor: '#161B22', border: '1px solid #262E3D' }}
        >
          <div style={{ fontSize: 12.5, color: '#94A3B8', fontWeight: 600 }}>متوسط الفاتورة للعميل</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#FFB800', marginTop: 4 }}>
            {formatMoney(stats.avgTicket)}
          </div>
        </div>
      </div>

      {/* قسم توزيع وسائل الدفع + المنتجات الأكثر مبيعاً */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 18, flex: 1, minHeight: 0 }}>
        {/* توزيع طرق الدفع */}
        <div
          className="glass-card"
          style={{
            padding: 20,
            backgroundColor: '#161B22',
            border: '1px solid #262E3D',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <GlassIcon icon={Coins} size="sm" variant="gold" />
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-brand-deep)', margin: 0 }}>
              توزيع وسائل الدفع
            </h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8 }}>
            <div
              style={{
                padding: '14px 16px',
                borderRadius: 12,
                backgroundColor: 'rgba(255, 184, 0, 0.12)',
                border: '1px solid rgba(255, 184, 0, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Coins size={18} color="#FFB800" />
                <span style={{ fontSize: 14, fontWeight: 700, color: '#F8FAFC' }}>الدفع النقدي (كاش)</span>
              </div>
              <div style={{ fontWeight: 800, fontSize: 16, color: '#FFB800' }}>
                {formatMoney(stats.cashSales)}
              </div>
            </div>

            <div
              style={{
                padding: '14px 16px',
                borderRadius: 12,
                backgroundColor: 'rgba(255, 184, 0, 0.12)',
                border: '1px solid rgba(255, 184, 0, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <CreditCard size={18} color="#FFB800" />
                <span style={{ fontSize: 14, fontWeight: 700, color: '#F8FAFC' }}>البطاقات والفيزا (شبكة)</span>
              </div>
              <div style={{ fontWeight: 800, fontSize: 16, color: '#FFB800' }}>
                {formatMoney(stats.cardSales)}
              </div>
            </div>

            <div
              style={{
                padding: '12px 16px',
                borderRadius: 12,
                backgroundColor: 'rgba(255, 184, 0, 0.06)',
                border: '1px solid rgba(255, 184, 0, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ fontSize: 13, color: '#FFB800', fontWeight: 700 }}>
                إجمالي الخصومات الممنوحة
              </span>
              <span style={{ fontWeight: 800, fontSize: 15, color: '#FFB800' }}>
                {formatMoney(stats.discountsGiven)}
              </span>
            </div>
          </div>
        </div>

        {/* المنتجات الأكثر مبيعاً */}
        <div
          className="glass-card"
          style={{
            padding: 0,
            overflow: 'hidden',
            backgroundColor: '#161B22',
            border: '1px solid #262E3D',
            borderRadius: 14,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid #262E3D',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              backgroundColor: '#1C222D',
            }}
          >
            <GlassIcon icon={Award} size="sm" variant="gold" glow />
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#F8FAFC', margin: 0 }}>
              أكثر المنتجات مبيعاً وطلباً (Top Sellers)
            </h3>
          </div>

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {topProducts.length === 0 ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 48,
                  gap: 12,
                  color: '#94A3B8',
                }}
              >
                <Package size={42} opacity={0.4} color="#94A3B8" />
                <div style={{ fontSize: 15, fontWeight: 600 }}>
                  لا توجد مبيعات مسجلة في هذه الفترة بعد
                </div>
                <div style={{ fontSize: 12 }}>
                  عند إتمام مبيعات من شاشة البيع، ستظهر أكثر المنتجات مبيعاً وإيراداً هنا تلقائياً
                </div>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
                <thead>
                  <tr style={{ background: '#1C222D', borderBottom: '1px solid #262E3D' }}>
                    <th style={{ width: '8%', padding: '12px 16px', textAlign: 'center', color: '#94A3B8', fontSize: 13, fontWeight: 700 }}>الترتيب</th>
                    <th style={{ width: '42%', padding: '12px 16px', color: '#94A3B8', fontSize: 13, fontWeight: 700 }}>اسم المنتج</th>
                    <th style={{ width: '20%', padding: '12px 16px', color: '#94A3B8', fontSize: 13, fontWeight: 700 }}>القسم</th>
                    <th style={{ width: '15%', padding: '12px 16px', textAlign: 'center', color: '#94A3B8', fontSize: 13, fontWeight: 700 }}>الكمية المباعة</th>
                    <th style={{ width: '15%', padding: '12px 16px', textAlign: 'left', color: '#94A3B8', fontSize: 13, fontWeight: 700 }}>الإيراد المحقق</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((p, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #262E3D' }}>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <span
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: '50%',
                            backgroundColor: idx === 0 ? '#C59B27' : idx === 1 ? '#9E9E9E' : '#A0A6A2',
                            color: '#FFFFFF',
                            fontSize: 12,
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {idx + 1}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 700, color: '#F8FAFC' }}>
                        {p.name}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-muted)' }}>
                        <span className="badge badge-neutral">{p.category}</span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700 }}>
                        {p.soldQty} قطعة
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#21633D' }}>
                        {formatMoney(p.totalRevenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ReportsScreen;
