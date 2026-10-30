/**
 * أنواع وبيانات محرك التقارير ولوحة التحكم (Reports & Dashboard Types)
 * جميع المبالغ المالية بالقروش الصحيحة (Integer Piasters)
 */

export interface DashboardKpis {
  today_sales_piasters: number;
  today_invoices_count: number;
  avg_basket_size_piasters: number;
  today_net_profit_piasters: number;
  low_stock_count: number;
  expiring_soon_count: number;
  active_shift: {
    id: number;
    cashier_name: string;
    opened_at: string;
    current_cash_piasters: number;
  } | null;
  top_products_today: {
    id: number;
    name: string;
    quantity_sold: number;
    total_revenue_piasters: number;
  }[];
  hourly_sales_today: {
    hour: number;
    total_sales_piasters: number;
    invoice_count: number;
  }[];
}

export interface DailySalesReportItem {
  date: string;
  invoices_count: number;
  gross_sales_piasters: number;
  discount_piasters: number;
  net_sales_piasters: number;
  tax_piasters: number;
  cogs_piasters: number;
  gross_profit_piasters: number;
  profit_margin_percent: number;
  returns_piasters: number;
}

export interface DailySalesReportTotals {
  total_invoices: number;
  total_gross_sales: number;
  total_discounts: number;
  total_net_sales: number;
  total_tax: number;
  total_cogs: number;
  total_gross_profit: number;
  overall_margin_percent: number;
  total_returns: number;
}

export interface DailySalesReport {
  items: DailySalesReportItem[];
  totals: DailySalesReportTotals;
}

export interface PaymentMethodSummary {
  method: string;
  count: number;
  amount_piasters: number;
  percentage: number;
}

export interface ProfitLossReport {
  start_date: string;
  end_date: string;
  gross_sales: number;
  sales_returns: number;
  net_revenue: number;
  cogs: number;
  gross_profit: number;
  gross_profit_margin_percent: number;
  wallet_commissions_revenue?: number;
  operating_expenses_total: number;
  expenses_breakdown: { category: string; amount_piasters: number }[];
  net_profit: number;
  net_profit_margin_percent: number;
}

export interface ProductPerformanceItem {
  product_id: number;
  product_name: string;
  barcode: string;
  category_name: string;
  units_sold: number;
  revenue_piasters: number;
  profit_piasters: number;
}

export interface DeadStockItem {
  product_id: number;
  product_name: string;
  barcode: string;
  category_name: string;
  current_stock: number;
  cost_value_piasters: number;
  last_sale_date: string | null;
}

export interface ProductPerformanceReport {
  top_sellers: ProductPerformanceItem[];
  dead_stock: DeadStockItem[];
}

export interface CashFlowSummary {
  start_date: string;
  end_date: string;
  inflows: {
    cash_sales: number;
    customer_debt_collections: number;
    cash_deposits: number;
    wallet_cash_in?: number;
    total_inflow: number;
  };
  outflows: {
    cash_refunds: number;
    operating_expenses: number;
    supplier_debt_payments: number;
    cash_purchases?: number;
    wallet_cash_out?: number;
    cash_withdrawals: number;
    total_outflow: number;
  };
  net_cash_flow: number;
}

export interface ReportDateFilter {
  startDate?: string;
  endDate?: string;
  cashierId?: number;
}
