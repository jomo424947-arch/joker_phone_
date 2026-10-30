/**
 * خدمة محرك التقارير ولوحة التحكم (Reports & Analytics Service)
 * توفر إحصائيات مالية، أرباح دقيقة، أداء المنتجات، والتدفق النقدي
 */

import type Database from 'better-sqlite3';
import { getDatabase } from '../db/connection';
import {
  DashboardKpis,
  DailySalesReport,
  DailySalesReportItem,
  PaymentMethodSummary,
  ProfitLossReport,
  ProductPerformanceReport,
  CashFlowSummary,
  ReportDateFilter,
} from '../../shared/types/reports.types';

export class ReportsService {
  private db?: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db;
  }

  private getDb(): Database.Database {
    return this.db ?? getDatabase();
  }

  /**
   * مؤشرات لوحة التحكم اللحظية (Executive Dashboard KPIs)
   */
  getDashboardKpis(): DashboardKpis {
    const db = this.getDb();

    // 1. مبيعات اليوم وعدد الفواتير
    const todaySalesRow = db
      .prepare(`
        SELECT 
          COALESCE(SUM(total), 0) AS total_sales,
          COUNT(*) AS invoices_count
        FROM sales
        WHERE status = 'completed' AND date(created_at) = date('now')
      `)
      .get() as { total_sales: number; invoices_count: number };

    const todaySales = todaySalesRow.total_sales;
    const invoicesCount = todaySalesRow.invoices_count;
    const avgBasketSize = invoicesCount > 0 ? Math.round(todaySales / invoicesCount) : 0;

    // 2. صافي الأرباح المقدرة اليوم (سعر البيع - تكلفة الدفعة)
    const todayProfitRow = db
      .prepare(`
        SELECT COALESCE(SUM(si.qty * (si.unit_price - si.unit_cost) - si.discount_amount), 0) AS net_profit
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        WHERE s.status = 'completed' AND date(s.created_at) = date('now')
      `)
      .get() as { net_profit: number };

    // 3. النواقص وحد الطلب
    const lowStockRow = db
      .prepare(`
        SELECT COUNT(*) AS cnt
        FROM product_variants pv
        WHERE pv.is_active = 1 AND pv.min_stock > 0 AND (
          SELECT COALESCE(SUM(b.qty_remaining), 0)
          FROM batches b
          WHERE b.variant_id = pv.id AND b.qty_remaining > 0
        ) <= pv.min_stock
      `)
      .get() as { cnt: number };

    // 4. تواريخ الصلاحية القريبة (< 30 يوماً)
    const expiringSoonRow = db
      .prepare(`
        SELECT COUNT(*) AS cnt
        FROM batches b
        WHERE b.qty_remaining > 0 AND b.expiry_date IS NOT NULL 
          AND b.expiry_date <= date('now', '+30 days')
      `)
      .get() as { cnt: number };

    // 5. الوردية النشطة
    const activeShiftRow = db
      .prepare(`
        SELECT s.id, u.display_name AS cashier_name, s.opened_at,
               (SELECT COALESCE(SUM(amount), 0) FROM cash_movements WHERE shift_id = s.id) AS current_cash
        FROM shifts s
        JOIN users u ON s.user_id = u.id
        WHERE s.status = 'open'
        ORDER BY s.id DESC LIMIT 1
      `)
      .get() as { id: number; cashier_name: string; opened_at: string; current_cash: number } | undefined;

    // 6. أكثر 5 منتجات مبيعاً اليوم
    const topProductsToday = db
      .prepare(`
        SELECT 
          si.variant_id AS id, 
          COALESCE(si.product_name || CASE WHEN si.variant_name IS NOT NULL AND si.variant_name != '' THEN ' - ' || si.variant_name ELSE '' END, si.product_name) AS name, 
          SUM(si.qty) AS quantity_sold, 
          SUM(si.line_total) AS total_revenue
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        WHERE s.status = 'completed' AND date(s.created_at) = date('now')
        GROUP BY si.variant_id, name
        ORDER BY total_revenue DESC LIMIT 5
      `)
      .all() as { id: number; name: string; quantity_sold: number; total_revenue: number }[];

    // 7. منحنى المبيعات الساعي اليوم
    const hourlyRows = db
      .prepare(`
        SELECT 
          CAST(strftime('%H', created_at) AS INTEGER) AS hour,
          SUM(total) AS total_sales,
          COUNT(*) AS invoice_count
        FROM sales
        WHERE status = 'completed' AND date(created_at) = date('now')
        GROUP BY hour
        ORDER BY hour ASC
      `)
      .all() as { hour: number; total_sales: number; invoice_count: number }[];

    return {
      today_sales_piasters: todaySales,
      today_invoices_count: invoicesCount,
      avg_basket_size_piasters: avgBasketSize,
      today_net_profit_piasters: todayProfitRow.net_profit,
      low_stock_count: lowStockRow.cnt,
      expiring_soon_count: expiringSoonRow.cnt,
      active_shift: activeShiftRow
        ? {
            id: activeShiftRow.id,
            cashier_name: activeShiftRow.cashier_name,
            opened_at: activeShiftRow.opened_at,
            current_cash_piasters: activeShiftRow.current_cash,
          }
        : null,
      top_products_today: topProductsToday.map((p) => ({
        id: p.id,
        name: p.name,
        quantity_sold: p.quantity_sold,
        total_revenue_piasters: p.total_revenue,
      })),
      hourly_sales_today: hourlyRows.map((h) => ({
        hour: h.hour,
        total_sales_piasters: h.total_sales,
        invoice_count: h.invoice_count,
      })),
    };
  }

  /**
   * تقرير المبيعات اليومي والدوري (Daily & Periodic Sales Report)
   */
  getDailySalesReport(filter?: ReportDateFilter): DailySalesReport {
    const db = this.getDb();
    const startDate = filter?.startDate ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const endDate = filter?.endDate ?? new Date().toISOString().slice(0, 10);

    let cashierClause = '';
    const queryParams: any[] = [startDate, endDate];
    if (filter?.cashierId) {
      cashierClause = 'AND s.user_id = ?';
      queryParams.push(filter.cashierId);
    }

    // استعلام تجميع المبيعات حسب التاريخ
    const salesRows = db
      .prepare(`
        SELECT 
          date(s.created_at) AS sale_date,
          COUNT(DISTINCT s.id) AS invoices_count,
          SUM(s.subtotal) AS gross_sales,
          SUM(s.discount_amount) AS total_discount,
          SUM(s.total) AS net_sales,
          SUM(s.tax_amount) AS total_tax,
          COALESCE((
            SELECT SUM(si.qty * si.unit_cost)
            FROM sale_items si
            JOIN sales s2 ON si.sale_id = s2.id
            WHERE date(s2.created_at) = date(s.created_at) AND s2.status = 'completed'
          ), 0) AS cogs
        FROM sales s
        WHERE s.status = 'completed'
          AND date(s.created_at) >= ?
          AND date(s.created_at) <= ?
          ${cashierClause}
        GROUP BY sale_date
        ORDER BY sale_date DESC
      `)
      .all(...queryParams) as any[];

    // استعلام تجميع المرتجعات حسب التاريخ
    const returnRows = db
      .prepare(`
        SELECT date(created_at) AS ret_date, SUM(total_refund) AS total_returns
        FROM returns
        WHERE date(created_at) >= ? AND date(created_at) <= ?
        GROUP BY ret_date
      `)
      .all(startDate, endDate) as { ret_date: string; total_returns: number }[];

    const returnsMap = new Map<string, number>();
    for (const r of returnRows) {
      returnsMap.set(r.ret_date, r.total_returns);
    }

    const items: DailySalesReportItem[] = salesRows.map((row) => {
      const grossSales = row.gross_sales ?? 0;
      const discount = row.total_discount ?? 0;
      const netSales = row.net_sales ?? 0;
      const tax = row.total_tax ?? 0;
      const cogs = row.cogs ?? 0;
      const grossProfit = netSales - cogs;
      const margin = netSales > 0 ? Number(((grossProfit / netSales) * 100).toFixed(2)) : 0;
      const returns = returnsMap.get(row.sale_date) ?? 0;

      return {
        date: row.sale_date,
        invoices_count: row.invoices_count,
        gross_sales_piasters: grossSales,
        discount_piasters: discount,
        net_sales_piasters: netSales,
        tax_piasters: tax,
        cogs_piasters: cogs,
        gross_profit_piasters: grossProfit,
        profit_margin_percent: margin,
        returns_piasters: returns,
      };
    });

    let totalInvoices = 0;
    let totalGross = 0;
    let totalDiscount = 0;
    let totalNet = 0;
    let totalTax = 0;
    let totalCogs = 0;
    let totalGrossProfit = 0;
    let totalReturns = 0;

    for (const item of items) {
      totalInvoices += item.invoices_count;
      totalGross += item.gross_sales_piasters;
      totalDiscount += item.discount_piasters;
      totalNet += item.net_sales_piasters;
      totalTax += item.tax_piasters;
      totalCogs += item.cogs_piasters;
      totalGrossProfit += item.gross_profit_piasters;
      totalReturns += item.returns_piasters;
    }

    const overallMargin = totalNet > 0 ? Number(((totalGrossProfit / totalNet) * 100).toFixed(2)) : 0;

    return {
      items,
      totals: {
        total_invoices: totalInvoices,
        total_gross_sales: totalGross,
        total_discounts: totalDiscount,
        total_net_sales: totalNet,
        total_tax: totalTax,
        total_cogs: totalCogs,
        total_gross_profit: totalGrossProfit,
        overall_margin_percent: overallMargin,
        total_returns: totalReturns,
      },
    };
  }

  /**
   * تقرير المبيعات حسب طرق الدفع (Sales by Payment Method)
   */
  getSalesByPaymentMethod(filter?: ReportDateFilter): PaymentMethodSummary[] {
    const db = this.getDb();
    const startDate = filter?.startDate ?? '2000-01-01';
    const endDate = filter?.endDate ?? '2099-12-31';

    const rows = db
      .prepare(`
        SELECT sp.method, COUNT(DISTINCT s.id) AS count, SUM(sp.amount) AS amount
        FROM sale_payments sp
        JOIN sales s ON sp.sale_id = s.id
        WHERE s.status = 'completed'
          AND date(s.created_at) >= ?
          AND date(s.created_at) <= ?
        GROUP BY sp.method
        ORDER BY amount DESC
      `)
      .all(startDate, endDate) as { method: string; count: number; amount: number }[];

    const totalAmount = rows.reduce((sum, r) => sum + r.amount, 0);

    return rows.map((r) => ({
      method: r.method,
      count: r.count,
      amount_piasters: r.amount,
      percentage: totalAmount > 0 ? Number(((r.amount / totalAmount) * 100).toFixed(2)) : 0,
    }));
  }

  /**
   * تقرير الأرباح والخسائر الشامل (Profit & Loss Statement)
   */
  getProfitLossReport(filter: { startDate: string; endDate: string }): ProfitLossReport {
    const db = this.getDb();

    // 1. إجمالي المبيعات
    const salesRow = db
      .prepare(`
        SELECT COALESCE(SUM(total), 0) AS gross_sales
        FROM sales
        WHERE status = 'completed'
          AND date(created_at) >= ? AND date(created_at) <= ?
      `)
      .get(filter.startDate, filter.endDate) as { gross_sales: number };

    // 2. المرتجعات
    const returnsRow = db
      .prepare(`
        SELECT COALESCE(SUM(total_refund), 0) AS total_returns
        FROM returns
        WHERE date(created_at) >= ? AND date(created_at) <= ?
      `)
      .get(filter.startDate, filter.endDate) as { total_returns: number };

    // 3. تكلفة البضاعة المباعة (COGS)
    const cogsRow = db
      .prepare(`
        SELECT COALESCE(SUM(si.qty * si.unit_cost), 0) AS cogs
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        WHERE s.status = 'completed'
          AND date(s.created_at) >= ? AND date(s.created_at) <= ?
      `)
      .get(filter.startDate, filter.endDate) as { cogs: number };

    // 4. المصروفات التشغيلية
    const expenseRows = db
      .prepare(`
        SELECT category, SUM(amount) AS amount
        FROM expenses
        WHERE date(created_at) >= ? AND date(created_at) <= ?
        GROUP BY category
        ORDER BY amount DESC
      `)
      .all(filter.startDate, filter.endDate) as { category: string; amount: number }[];

    const grossSales = salesRow.gross_sales;
    const salesReturns = returnsRow.total_returns;
    const netRevenue = grossSales - salesReturns;
    const cogs = cogsRow.cogs;
    const grossProfit = netRevenue - cogs;
    const grossMarginPercent = netRevenue > 0 ? Number(((grossProfit / netRevenue) * 100).toFixed(2)) : 0;

    // 5. عمولات المحافظ الإلكترونية وشحن الرصيد السابقة (إن وجدت)
    let walletCommissions = 0;
    try {
      const walletCommissionsRow = db
        .prepare(`
          SELECT COALESCE(SUM(fee_commission), 0) AS total_commission
          FROM wallet_transactions
          WHERE date(created_at) >= ? AND date(created_at) <= ?
        `)
        .get(filter.startDate, filter.endDate) as { total_commission: number } | undefined;
      walletCommissions = walletCommissionsRow?.total_commission ?? 0;
    } catch {
      walletCommissions = 0;
    }

    const operatingExpensesTotal = expenseRows.reduce((sum, e) => sum + e.amount, 0);
    const netProfit = grossProfit + walletCommissions - operatingExpensesTotal;
    const totalRevenueWithCommissions = netRevenue + walletCommissions;
    const netProfitMarginPercent =
      totalRevenueWithCommissions > 0
        ? Number(((netProfit / totalRevenueWithCommissions) * 100).toFixed(2))
        : 0;

    return {
      start_date: filter.startDate,
      end_date: filter.endDate,
      gross_sales: grossSales,
      sales_returns: salesReturns,
      net_revenue: netRevenue,
      cogs,
      gross_profit: grossProfit,
      gross_profit_margin_percent: grossMarginPercent,
      wallet_commissions_revenue: walletCommissions,
      operating_expenses_total: operatingExpensesTotal,
      expenses_breakdown: expenseRows.map((e) => ({
        category: e.category,
        amount_piasters: e.amount,
      })),
      net_profit: netProfit,
      net_profit_margin_percent: netProfitMarginPercent,
    };
  }

  /**
   * تقرير أداء المنتجات: الأعلى مبيعاً والأصناف الراكدة (Product Performance & Dead Stock)
   */
  getProductPerformanceReport(options?: { days?: number; limit?: number }): ProductPerformanceReport {
    const db = this.getDb();
    const days = options?.days ?? 30;
    const limit = options?.limit ?? 20;

    // الأصناف الأعلى مبيعاً
    const topSellersRows = db
      .prepare(`
        SELECT 
          pv.id AS product_id,
          COALESCE(si.product_name || CASE WHEN si.variant_name IS NOT NULL AND si.variant_name != '' THEN ' - ' || si.variant_name ELSE '' END, si.product_name) AS product_name,
          (SELECT barcode FROM product_barcodes WHERE variant_id = pv.id LIMIT 1) AS barcode,
          COALESCE(c.name, 'عام') AS category_name,
          SUM(si.qty) AS units_sold,
          SUM(si.line_total) AS revenue,
          SUM(si.qty * (si.unit_price - si.unit_cost) - si.discount_amount) AS profit
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        JOIN product_variants pv ON si.variant_id = pv.id
        JOIN products p ON pv.product_id = p.id
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE s.status = 'completed'
          AND date(s.created_at) >= date('now', '-' || ? || ' days')
        GROUP BY pv.id
        ORDER BY revenue DESC
        LIMIT ?
      `)
      .all(days, limit) as any[];

    // الأصناف الراكدة: كميتها في المخزن > 0 ولم تبع خلال N أيام
    const deadStockRows = db
      .prepare(`
        SELECT 
          pv.id AS product_id,
          COALESCE(p.name_ar || CASE WHEN pv.name IS NOT NULL AND pv.name != '' THEN ' - ' || pv.name ELSE '' END, p.name_ar) AS product_name,
          (SELECT barcode FROM product_barcodes WHERE variant_id = pv.id LIMIT 1) AS barcode,
          COALESCE(c.name, 'عام') AS category_name,
          (SELECT COALESCE(SUM(b.qty_remaining), 0) FROM batches b WHERE b.variant_id = pv.id AND b.qty_remaining > 0) AS current_stock,
          (SELECT COALESCE(SUM(b.qty_remaining * b.unit_cost), 0) FROM batches b WHERE b.variant_id = pv.id AND b.qty_remaining > 0) AS cost_value,
          (
            SELECT MAX(s.created_at)
            FROM sale_items si
            JOIN sales s ON si.sale_id = s.id
            WHERE si.variant_id = pv.id AND s.status = 'completed'
          ) AS last_sale_date
        FROM product_variants pv
        JOIN products p ON pv.product_id = p.id
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE pv.is_active = 1
          AND (SELECT COALESCE(SUM(b.qty_remaining), 0) FROM batches b WHERE b.variant_id = pv.id AND b.qty_remaining > 0) > 0
          AND pv.id NOT IN (
            SELECT DISTINCT si.variant_id
            FROM sale_items si
            JOIN sales s ON si.sale_id = s.id
            WHERE s.status = 'completed'
              AND date(s.created_at) >= date('now', '-' || ? || ' days')
          )
        ORDER BY cost_value DESC
        LIMIT ?
      `)
      .all(days, limit) as any[];

    return {
      top_sellers: topSellersRows.map((r) => ({
        product_id: r.product_id,
        product_name: r.product_name,
        barcode: r.barcode,
        category_name: r.category_name,
        units_sold: r.units_sold,
        revenue_piasters: r.revenue,
        profit_piasters: r.profit,
      })),
      dead_stock: deadStockRows.map((r) => ({
        product_id: r.product_id,
        product_name: r.product_name,
        barcode: r.barcode,
        category_name: r.category_name,
        current_stock: r.current_stock,
        cost_value_piasters: r.cost_value,
        last_sale_date: r.last_sale_date ?? null,
      })),
    };
  }

  /**
   * تقرير التدفق النقدي الشامل (Cash Flow Summary)
   */
  getCashFlowSummary(filter: { startDate: string; endDate: string }): CashFlowSummary {
    const db = this.getDb();

    // 1. مبيعات النقد
    const cashSalesRow = db
      .prepare(`
        SELECT COALESCE(SUM(sp.amount), 0) AS total
        FROM sale_payments sp
        JOIN sales s ON sp.sale_id = s.id
        WHERE s.status = 'completed' AND sp.method = 'cash'
          AND date(s.created_at) >= ? AND date(s.created_at) <= ?
      `)
      .get(filter.startDate, filter.endDate) as { total: number };

    // 2. تحصيلات ديون العملاء
    const debtCollectionsRow = db
      .prepare(`
        SELECT COALESCE(SUM(amount), 0) AS total
        FROM customer_payments
        WHERE payment_method = 'cash'
          AND date(created_at) >= ? AND date(created_at) <= ?
      `)
      .get(filter.startDate, filter.endDate) as { total: number };

    // 3. الإيداعات النقدية الأخرى بالخزنة (استبعاد سداد ديون العملاء وإيداعات المحافظ لمنع الازدواج، واستبعاد الافتتاحي)
    const depositsRow = db
      .prepare(`
        SELECT COALESCE(SUM(amount), 0) AS total
        FROM cash_movements
        WHERE type = 'deposit' AND note != 'رصيد افتتاحي للوردية'
          AND (ref_type IS NULL OR ref_type NOT IN ('customer_payment', 'wallet_cash_in'))
          AND date(created_at) >= ? AND date(created_at) <= ?
      `)
      .get(filter.startDate, filter.endDate) as { total: number };

    // 4. إيداعات كاش للمحافظ الإلكترونية (مبالغ استلمها المحل نقداً من العملاء لتحويلها)
    const walletCashInRow = db
      .prepare(`
        SELECT COALESCE(SUM(amount), 0) AS total
        FROM cash_movements
        WHERE type = 'deposit' AND ref_type = 'wallet_cash_in'
          AND date(created_at) >= ? AND date(created_at) <= ?
      `)
      .get(filter.startDate, filter.endDate) as { total: number };

    // 5. مرتجعات النقد للزبائن
    const refundsRow = db
      .prepare(`
        SELECT COALESCE(SUM(ABS(amount)), 0) AS total
        FROM cash_movements
        WHERE type = 'refund'
          AND date(created_at) >= ? AND date(created_at) <= ?
      `)
      .get(filter.startDate, filter.endDate) as { total: number };

    // 6. المصروفات التشغيلية
    const expensesRow = db
      .prepare(`
        SELECT COALESCE(SUM(amount), 0) AS total
        FROM expenses
        WHERE date(created_at) >= ? AND date(created_at) <= ?
      `)
      .get(filter.startDate, filter.endDate) as { total: number };

    // 7. سداد مستحقات الموردين نقداً
    const supplierPaymentsRow = db
      .prepare(`
        SELECT COALESCE(SUM(amount), 0) AS total
        FROM supplier_payments
        WHERE payment_method = 'cash'
          AND date(created_at) >= ? AND date(created_at) <= ?
      `)
      .get(filter.startDate, filter.endDate) as { total: number };

    // 8. مشتريات بضاعة نقدية من الدرج
    const cashPurchasesRow = db
      .prepare(`
        SELECT COALESCE(SUM(ABS(amount)), 0) AS total
        FROM cash_movements
        WHERE type = 'withdrawal' AND ref_type = 'purchase'
          AND date(created_at) >= ? AND date(created_at) <= ?
      `)
      .get(filter.startDate, filter.endDate) as { total: number };

    // 9. سحوبات كاش للمحافظ الإلكترونية (مبالغ كاش خرجت من الدرج للعميل مقابل استلام رصيد محفظة)
    const walletCashOutRow = db
      .prepare(`
        SELECT COALESCE(SUM(ABS(amount)), 0) AS total
        FROM cash_movements
        WHERE type = 'withdrawal' AND ref_type = 'wallet_cash_out'
          AND date(created_at) >= ? AND date(created_at) <= ?
      `)
      .get(filter.startDate, filter.endDate) as { total: number };

    // 10. سحوبات نقدية عامة / توريد للمالك (استبعاد سداد الموردين والمشتريات والمحافظ لمنع الازدواج)
    const withdrawalsRow = db
      .prepare(`
        SELECT COALESCE(SUM(ABS(amount)), 0) AS total
        FROM cash_movements
        WHERE type = 'withdrawal'
          AND (ref_type IS NULL OR ref_type NOT IN ('supplier_payment', 'purchase', 'wallet_cash_out'))
          AND date(created_at) >= ? AND date(created_at) <= ?
      `)
      .get(filter.startDate, filter.endDate) as { total: number };

    const totalInflow =
      cashSalesRow.total +
      debtCollectionsRow.total +
      depositsRow.total +
      walletCashInRow.total;

    const totalOutflow =
      refundsRow.total +
      expensesRow.total +
      supplierPaymentsRow.total +
      cashPurchasesRow.total +
      walletCashOutRow.total +
      withdrawalsRow.total;

    const netCashFlow = totalInflow - totalOutflow;

    return {
      start_date: filter.startDate,
      end_date: filter.endDate,
      inflows: {
        cash_sales: cashSalesRow.total,
        customer_debt_collections: debtCollectionsRow.total,
        cash_deposits: depositsRow.total,
        wallet_cash_in: walletCashInRow.total,
        total_inflow: totalInflow,
      },
      outflows: {
        cash_refunds: refundsRow.total,
        operating_expenses: expensesRow.total,
        supplier_debt_payments: supplierPaymentsRow.total,
        cash_purchases: cashPurchasesRow.total,
        wallet_cash_out: walletCashOutRow.total,
        cash_withdrawals: withdrawalsRow.total,
        total_outflow: totalOutflow,
      },
      net_cash_flow: netCashFlow,
    };
  }
}

export const reportsService = new ReportsService();
