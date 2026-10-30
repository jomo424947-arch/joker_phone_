/**
 * قنوات الاتصال الداخلي (IPC Channels) بين الواجهة والمعالج الرئيسي
 */

export const IPC_CHANNELS = {
  // Auth
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGIN_PIN: 'auth:login-pin',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_VERIFY_PIN: 'auth:verify-pin',
  AUTH_GET_CURRENT_USER: 'auth:get-current-user',
  AUTH_CHANGE_PASSWORD: 'auth:change-password',
  AUTH_RESET_PIN: 'auth:reset-pin',
  AUTH_CHECK_SETUP_STATUS: 'auth:check-setup-status',
  AUTH_COMPLETE_INITIAL_SETUP: 'auth:complete-initial-setup',
  AUTH_GET_LOGIN_USERS: 'auth:get-login-users',

  // Users Management
  USERS_LIST: 'users:list',
  USERS_GET: 'users:get',
  USERS_CREATE: 'users:create',
  USERS_UPDATE: 'users:update',
  USERS_TOGGLE_ACTIVE: 'users:toggle-active',
  USERS_RESET_PASSWORD: 'users:reset-password',
  USERS_UNLOCK: 'users:unlock',

  // Audit Log
  AUDIT_LIST: 'audit:list',
  AUDIT_EXPORT: 'audit:export',

  // Products & Barcodes
  PRODUCTS_SEARCH: 'products:search',
  PRODUCTS_GET_BY_BARCODE: 'products:get-by-barcode',
  PRODUCTS_LIST: 'products:list',
  PRODUCTS_GET: 'products:get',
  PRODUCTS_CREATE: 'products:create',
  PRODUCTS_UPDATE: 'products:update',
  PRODUCTS_ARCHIVE: 'products:archive',
  PRODUCTS_DELETE: 'products:delete',
  PRODUCTS_GET_PRICE_HISTORY: 'products:get-price-history',
  PRODUCTS_GET_STOCK_CARD: 'products:get-stock-card',
  PRODUCTS_BULK_UPDATE: 'products:bulk-update',
  PRODUCTS_IMPORT_EXCEL: 'products:import-excel',
  PRODUCTS_GENERATE_BARCODE: 'products:generate-barcode',
  BARCODES_PRINT_LABELS: 'barcodes:print-labels',
  PRINTERS_LIST: 'printers:list',
  PRINTERS_CLEAR_QUEUE: 'printers:clear-queue',

  // Promotions & Discounts
  PROMOTIONS_LIST: 'promotions:list',
  PROMOTIONS_GET: 'promotions:get',
  PROMOTIONS_CREATE: 'promotions:create',
  PROMOTIONS_UPDATE: 'promotions:update',
  PROMOTIONS_DELETE: 'promotions:delete',
  PROMOTIONS_CALCULATE: 'promotions:calculate',

  // POS & Sales
  SALES_CREATE: 'sales:create',
  SALES_GET_BY_ID: 'sales:get-by-id',
  SALES_LIST: 'sales:list',
  SALES_VOID: 'sales:void',
  SALES_HOLD: 'sales:hold',
  SALES_GET_HELD: 'sales:get-held',
  SALES_RESUME_HELD: 'sales:resume-held',
  SALES_DELETE_HELD: 'sales:delete-held',
  SALES_PRINT_RECEIPT: 'sales:print-receipt',

  // Inventory & Batches
  INVENTORY_GET_STOCK: 'inventory:get-stock',
  INVENTORY_GET_EXPIRING: 'inventory:get-expiring',
  INVENTORY_RECORD_MOVEMENT: 'inventory:record-movement',
  // INVENTORY_SUBMIT_AUDIT: 'inventory:submit-audit', // محجوز للإصدارات القادمة
  INVENTORY_GET_MOVEMENTS: 'inventory:get-movements',
  INVENTORY_CREATE_COUNT: 'inventory:create-count',
  INVENTORY_GET_COUNTS: 'inventory:get-counts',
  INVENTORY_GET_COUNT_BY_ID: 'inventory:get-count-by-id',
  INVENTORY_SUBMIT_COUNT: 'inventory:submit-count',
  INVENTORY_APPROVE_COUNT: 'inventory:approve-count',
  INVENTORY_CANCEL_COUNT: 'inventory:cancel-count',
  INVENTORY_GET_ALERTS: 'inventory:get-alerts',
  INVENTORY_GET_VALUATION: 'inventory:get-valuation',
  INVENTORY_MARK_EXPIRED: 'inventory:mark-expired',
  INVENTORY_MARK_TESTER: 'inventory:mark-tester',

  // Suppliers
  SUPPLIERS_LIST: 'suppliers:list',
  SUPPLIERS_GET: 'suppliers:get',
  SUPPLIERS_CREATE: 'suppliers:create',
  SUPPLIERS_UPDATE: 'suppliers:update',
  SUPPLIERS_ARCHIVE: 'suppliers:archive',
  SUPPLIERS_STATEMENT: 'suppliers:statement',
  SUPPLIERS_PAY: 'suppliers:pay',

  // Purchases
  PURCHASES_CREATE_INVOICE: 'purchases:create-invoice',
  PURCHASES_GET_SUPPLIERS: 'purchases:get-suppliers',
  PURCHASES_RECORD_PAYMENT: 'purchases:record-payment',
  PURCHASES_LIST: 'purchases:list',
  PURCHASES_GET: 'purchases:get',
  PURCHASES_RETURN: 'purchases:return',
  PURCHASES_COST_HISTORY: 'purchases:cost-history',
  PURCHASES_COST_COMPARISON: 'purchases:cost-comparison',

  // Customers
  CUSTOMERS_LIST: 'customers:list',
  CUSTOMERS_GET: 'customers:get',
  CUSTOMERS_CREATE: 'customers:create',
  CUSTOMERS_UPDATE: 'customers:update',
  CUSTOMERS_ARCHIVE: 'customers:archive',
  CUSTOMERS_PAY: 'customers:pay',
  CUSTOMERS_STATEMENT: 'customers:statement',
  CUSTOMERS_HISTORY: 'customers:history',

  // Returns
  RETURNS_PROCESS: 'returns:process',
  RETURNS_GET_BY_SALE: 'returns:get-by-sale',
  RETURNS_CREATE: 'returns:create',
  RETURNS_EXCHANGE: 'returns:exchange',
  RETURNS_LIST: 'returns:list',
  RETURNS_GET: 'returns:get',

  // Cash & Shifts
  CASH_OPEN_SHIFT: 'cash:open-shift',
  CASH_CLOSE_SHIFT: 'cash:close-shift',
  CASH_GET_ACTIVE_SHIFT: 'cash:get-active-shift',
  CASH_RECORD_EXPENSE: 'cash:record-expense',
  CASH_DRAWER_OPEN: 'cash:drawer-open',
  CASH_DEPOSIT: 'cash:deposit',
  CASH_WITHDRAWAL: 'cash:withdrawal',
  CASH_GET_MOVEMENTS: 'cash:get-movements',
  CASH_GET_EXPENSES: 'cash:get-expenses',
  CASH_GET_SHIFTS: 'cash:get-shifts',
  CASH_GET_SHIFT_SUMMARY: 'cash:get-shift-summary',
  CASH_GET_EXPENSE_CATEGORIES: 'cash:get-expense-categories',

  // Reports
  REPORTS_GET_DASHBOARD: 'reports:get-dashboard',
  REPORTS_GET_DAILY: 'reports:get-daily',
  REPORTS_GET_PROFIT_LOSS: 'reports:get-profit-loss',
  REPORTS_GET_PAYMENT_METHODS: 'reports:get-payment-methods',
  REPORTS_GET_PRODUCT_PERFORMANCE: 'reports:get-product-performance',
  REPORTS_GET_CASH_FLOW: 'reports:get-cash-flow',
  // REPORTS_EXPORT_EXCEL: 'reports:export-excel', // محجوز للإصدارات القادمة

  // Settings & Backup
  SETTINGS_GET_ALL: 'settings:get-all',
  SETTINGS_UPDATE: 'settings:update',
  BACKUP_CREATE: 'backup:create',
  BACKUP_RESTORE: 'backup:restore',
  BACKUP_EXPORT_USB: 'backup:export-usb',
  BACKUP_LIST: 'backup:list',
  BACKUP_VERIFY_INTEGRITY: 'backup:verify-integrity',
  BACKUP_ROTATE: 'backup:rotate',
  BACKUP_SCHEDULE_STATUS: 'backup:schedule-status',

  // System & Screen Lock
  SYSTEM_LOCK: 'system:lock',
  SYSTEM_UNLOCK: 'system:unlock',
  SYSTEM_ACTIVITY: 'system:activity',
  SYSTEM_OVERRIDE_PIN: 'system:override-pin',

  // Database Inspector & Viewer
  DB_INSPECTOR_SELECT_FILE: 'db-inspector:select-file',
  DB_INSPECTOR_INSPECT: 'db-inspector:inspect',
  DB_INSPECTOR_GET_DEFAULT_PATH: 'db-inspector:get-default-path',
  DB_INSPECTOR_LIST_BACKUPS: 'db-inspector:list-backups',

  // Phone Extensions: Repairs & Maintenance Workshop
  REPAIRS_LIST: 'repairs:list',
  REPAIRS_GET: 'repairs:get',
  REPAIRS_CREATE: 'repairs:create',
  REPAIRS_UPDATE: 'repairs:update',
  REPAIRS_UPDATE_STATUS: 'repairs:update-status',
  REPAIRS_DELIVER: 'repairs:deliver',
  REPAIRS_ADD_PART: 'repairs:add-part',
  REPAIRS_REMOVE_PART: 'repairs:remove-part',
  REPAIRS_PRINT_RECEIPT: 'repairs:print-receipt',

  // Phone Extensions: Device Serials & IMEI
  SERIALS_LIST: 'serials:list',
  SERIALS_SEARCH: 'serials:search',
  SERIALS_CREATE: 'serials:create',
  SERIALS_UPDATE_STATUS: 'serials:update-status',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
