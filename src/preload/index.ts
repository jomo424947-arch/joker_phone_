/**
 * جسر التواصل الآمن (Preload Script / contextBridge)
 * يعزل بيئة Node.js بالكامل عن واجهة المتصفح، ويكشف دوال مؤمنة ومكتملة لجميع العمليات
 */

import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, IpcChannel } from '../shared/constants/ipc-channels';
import { Permission } from '../shared/constants/permissions';
import { CreateUserInput, UpdateUserInput } from '../shared/types/users.types';
import { AuditFilterOptions } from '../main/services/audit.service';
import { StockCountScopeType, StockMovementType } from '../shared/types/inventory.types';
import { CreateSupplierInput, UpdateSupplierInput, CreatePurchaseInput } from '../shared/types/purchases.types';
import { CreateCustomerInput, UpdateCustomerInput } from '../shared/types/customers.types';
import { CreateReturnInput, ExchangeInput } from '../shared/types/returns.types';
import {
  CreateRepairOrderInput,
  DeliverRepairInput,
  UpdateRepairOrderInput,
  AddRepairPartInput,
  RepairFilterOptions,
  RepairStatus,
} from '../shared/types/repairs.types';
import {
  CreateDeviceSerialInput,
  DeviceSerialFilters,
  DeviceSerialStatus,
} from '../shared/types/serials.types';

// قائمة القنوات المسموح بها في المعالج المساعد invoke/send
const ALLOWED_IPC_CHANNELS = new Set<string>(Object.values(IPC_CHANNELS));

const electronAPI = {
  // ==========================================
  // Auth & Session
  // ==========================================
  login: (credentials: { username?: string; password?: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGIN, credentials),
  loginWithPin: (pin: string, userId?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGIN_PIN, { pin, userId }),
  getLoginUsers: () =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTH_GET_LOGIN_USERS),
  logout: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGOUT),
  getCurrentUser: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_GET_CURRENT_USER),
  verifyPin: (pin: string) => ipcRenderer.invoke(IPC_CHANNELS.AUTH_VERIFY_PIN, pin),
  changePassword: (data: { oldPass: string; newPass: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTH_CHANGE_PASSWORD, data),
  resetPin: (pin: string) => ipcRenderer.invoke(IPC_CHANNELS.AUTH_RESET_PIN, { pin }),
  checkSetupStatus: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_CHECK_SETUP_STATUS),
  completeInitialSetup: (data: {
    storeName: string;
    storePhone?: string;
    storeAddress?: string;
    username: string;
    displayName: string;
    password: string;
    pin: string;
    activationCode: string;
  }) => ipcRenderer.invoke(IPC_CHANNELS.AUTH_COMPLETE_INITIAL_SETUP, data),
  requestOverride: (permission: Permission, pin: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_OVERRIDE_PIN, { permission, pin }),

  // ==========================================
  // Users Management
  // ==========================================
  listUsers: () => ipcRenderer.invoke(IPC_CHANNELS.USERS_LIST),
  getUser: (id: number) => ipcRenderer.invoke(IPC_CHANNELS.USERS_GET, id),
  createUser: (input: CreateUserInput) => ipcRenderer.invoke(IPC_CHANNELS.USERS_CREATE, input),
  updateUser: (id: number, input: UpdateUserInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.USERS_UPDATE, { id, input }),
  toggleUserActive: (id: number) => ipcRenderer.invoke(IPC_CHANNELS.USERS_TOGGLE_ACTIVE, id),
  resetUserPassword: (id: number, newPassword: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.USERS_RESET_PASSWORD, { id, newPassword }),
  unlockUser: (id: number) => ipcRenderer.invoke(IPC_CHANNELS.USERS_UNLOCK, id),

  // ==========================================
  // Audit Log
  // ==========================================
  listAuditLogs: (filters?: AuditFilterOptions) =>
    ipcRenderer.invoke(IPC_CHANNELS.AUDIT_LIST, filters),
  exportAuditLogs: (filters?: AuditFilterOptions) =>
    ipcRenderer.invoke(IPC_CHANNELS.AUDIT_EXPORT, filters),

  // ==========================================
  // Products & Barcodes
  // ==========================================
  searchProducts: (query: string, options?: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.PRODUCTS_SEARCH, query, options),
  getProductByBarcode: (barcode: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.PRODUCTS_GET_BY_BARCODE, barcode),
  listProducts: (options?: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.PRODUCTS_LIST, options),
  getProduct: (id: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.PRODUCTS_GET, id),
  createProduct: (input: any, actorUserId?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.PRODUCTS_CREATE, input, actorUserId),
  updateProduct: (id: number, input: any, actorUserId?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.PRODUCTS_UPDATE, id, input, actorUserId),
  deleteProduct: (id: number, actorUserId?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.PRODUCTS_DELETE, id, actorUserId),
  getProductPriceHistory: (productId: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.PRODUCTS_GET_PRICE_HISTORY, productId),
  getProductStockCard: (productId: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.PRODUCTS_GET_STOCK_CARD, productId),
  archiveProduct: (id: number, actorUserId?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.PRODUCTS_ARCHIVE, id, actorUserId),
  bulkUpdateProducts: (input: any, actorUserId?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.PRODUCTS_BULK_UPDATE, input, actorUserId),
  generateBarcode: () =>
    ipcRenderer.invoke(IPC_CHANNELS.PRODUCTS_GENERATE_BARCODE),
  importProductsExcel: (fileContentOrRows: any, actorUserId?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.PRODUCTS_IMPORT_EXCEL, fileContentOrRows, actorUserId),
  printBarcodeLabels: (labels: any, options?: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.BARCODES_PRINT_LABELS, labels, options),
  getSystemPrinters: (forceRefresh?: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.PRINTERS_LIST, forceRefresh),
  clearPrintQueue: (printerName?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.PRINTERS_CLEAR_QUEUE, printerName),

  // Promotions & Discounts
  listPromotions: (activeOnly?: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROMOTIONS_LIST, activeOnly),
  getPromotion: (id: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROMOTIONS_GET, id),
  createPromotion: (input: any, actorUserId?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROMOTIONS_CREATE, input, actorUserId),
  updatePromotion: (id: number, input: any, actorUserId?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROMOTIONS_UPDATE, id, input, actorUserId),
  deletePromotion: (id: number, actorUserId?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROMOTIONS_DELETE, id, actorUserId),
  calculatePromotions: (items: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROMOTIONS_CALCULATE, items),

  // ==========================================
  // Sales & POS
  // ==========================================
  createSale: (saleData: unknown, userId?: number, shiftId?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.SALES_CREATE, saleData, userId, shiftId),
  getSaleById: (id: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.SALES_GET_BY_ID, id),
  getSale: (id: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.SALES_GET_BY_ID, id),
  listSales: (options?: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.SALES_LIST, options),
  holdSale: (cartData: any, shiftId?: any, userId?: any, customerName?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SALES_HOLD, cartData, shiftId, userId, customerName),
  getHeldSales: () =>
    ipcRenderer.invoke(IPC_CHANNELS.SALES_GET_HELD),
  resumeHeldSale: (holdId: string | number) =>
    ipcRenderer.invoke(IPC_CHANNELS.SALES_RESUME_HELD, holdId),
  deleteHeldSale: (holdId: string | number) =>
    ipcRenderer.invoke(IPC_CHANNELS.SALES_DELETE_HELD, holdId),
  voidSale: (saleId: number, userId: number, reason: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SALES_VOID, saleId, userId, reason),
  printReceipt: (saleOrId: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.SALES_PRINT_RECEIPT, saleOrId),

  // ==========================================
  // Inventory & Batches
  // ==========================================
  getStock: (variantId: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.INVENTORY_GET_STOCK, variantId),
  getExpiringBatches: (days: number = 30) =>
    ipcRenderer.invoke(IPC_CHANNELS.INVENTORY_GET_EXPIRING, days),
  getStockMovements: (filters?: {
    variantId?: number;
    batchId?: number;
    type?: StockMovementType;
    limit?: number;
    offset?: number;
  }) => ipcRenderer.invoke(IPC_CHANNELS.INVENTORY_GET_MOVEMENTS, filters),
  recordStockMovement: (params: {
    batchId: number;
    type: StockMovementType;
    qty: number;
    refType?: string | null;
    refId?: number | null;
    userId: number;
    note?: string | null;
  }) => ipcRenderer.invoke(IPC_CHANNELS.INVENTORY_RECORD_MOVEMENT, params),
  markExpired: (params: { batchId: number; qty: number; userId: number; note?: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.INVENTORY_MARK_EXPIRED, params),
  markTester: (params: { batchId: number; qty: number; userId: number; note?: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.INVENTORY_MARK_TESTER, params),
  createStockCount: (params: {
    scope: StockCountScopeType;
    scopeId?: number | null;
    userId: number;
    variantIds?: number[];
  }) => ipcRenderer.invoke(IPC_CHANNELS.INVENTORY_CREATE_COUNT, params),
  getStockCounts: (filters?: { status?: string; limit?: number }) =>
    ipcRenderer.invoke(IPC_CHANNELS.INVENTORY_GET_COUNTS, filters),
  getStockCountById: (countId: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.INVENTORY_GET_COUNT_BY_ID, countId),
  submitStockCount: (params: {
    countId: number;
    items: Array<{ variantId: number; countedQty: number; note?: string }>;
    userId: number;
  }) => ipcRenderer.invoke(IPC_CHANNELS.INVENTORY_SUBMIT_COUNT, params),
  approveStockCount: (params: { countId: number; approverId: number }) =>
    ipcRenderer.invoke(IPC_CHANNELS.INVENTORY_APPROVE_COUNT, params),
  cancelStockCount: (params: { countId: number; userId: number }) =>
    ipcRenderer.invoke(IPC_CHANNELS.INVENTORY_CANCEL_COUNT, params),
  getInventoryAlerts: () =>
    ipcRenderer.invoke(IPC_CHANNELS.INVENTORY_GET_ALERTS),
  getInventoryValuation: (groupBy?: 'category' | 'brand') =>
    ipcRenderer.invoke(IPC_CHANNELS.INVENTORY_GET_VALUATION, groupBy),

  // ==========================================
  // Suppliers
  // ==========================================
  listSuppliers: (filters?: { search?: string; isActive?: boolean; limit?: number }) =>
    ipcRenderer.invoke(IPC_CHANNELS.SUPPLIERS_LIST, filters),
  getSupplier: (id: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.SUPPLIERS_GET, id),
  createSupplier: (params: { data: CreateSupplierInput; userId: number }) =>
    ipcRenderer.invoke(IPC_CHANNELS.SUPPLIERS_CREATE, params),
  updateSupplier: (params: { id: number; data: UpdateSupplierInput; userId: number }) =>
    ipcRenderer.invoke(IPC_CHANNELS.SUPPLIERS_UPDATE, params),
  archiveSupplier: (params: { id: number; userId: number }) =>
    ipcRenderer.invoke(IPC_CHANNELS.SUPPLIERS_ARCHIVE, params),
  getSupplierStatement: (params: { supplierId: number; dateRange?: { from?: string; to?: string } }) =>
    ipcRenderer.invoke(IPC_CHANNELS.SUPPLIERS_STATEMENT, params),
  paySupplier: (params: {
    supplierId: number;
    amount: number;
    paymentMethod: string;
    note?: string | null;
    userId: number;
    shiftId?: number | null;
  }) => ipcRenderer.invoke(IPC_CHANNELS.SUPPLIERS_PAY, params),

  // ==========================================
  // Purchases
  // ==========================================
  createPurchaseInvoice: (input: CreatePurchaseInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.PURCHASES_CREATE_INVOICE, input),
  listPurchases: (filters?: {
    supplierId?: number;
    status?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }) => ipcRenderer.invoke(IPC_CHANNELS.PURCHASES_LIST, filters),
  getPurchase: (id: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.PURCHASES_GET, id),
  returnPurchase: (params: {
    purchaseId: number;
    items: Array<{ purchaseItemId: number; qty: number }>;
    userId: number;
    note?: string | null;
  }) => ipcRenderer.invoke(IPC_CHANNELS.PURCHASES_RETURN, params),
  getCostHistory: (variantId: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.PURCHASES_COST_HISTORY, variantId),
  getCostComparison: (variantId: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.PURCHASES_COST_COMPARISON, variantId),
  recordPurchasePayment: (params: {
    supplierId: number;
    amount: number;
    paymentMethod: string;
    note?: string | null;
    userId: number;
    shiftId?: number | null;
  }) => ipcRenderer.invoke(IPC_CHANNELS.PURCHASES_RECORD_PAYMENT, params),

  // ==========================================
  // Customers
  // ==========================================
  listCustomers: (filters?: { search?: string; isActive?: boolean; limit?: number }) =>
    ipcRenderer.invoke(IPC_CHANNELS.CUSTOMERS_LIST, filters),
  getCustomer: (id: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.CUSTOMERS_GET, id),
  createCustomer: (params: { data: CreateCustomerInput; userId: number }) =>
    ipcRenderer.invoke(IPC_CHANNELS.CUSTOMERS_CREATE, params),
  updateCustomer: (params: { id: number; data: UpdateCustomerInput; userId: number }) =>
    ipcRenderer.invoke(IPC_CHANNELS.CUSTOMERS_UPDATE, params),
  archiveCustomer: (params: { id: number; userId: number }) =>
    ipcRenderer.invoke(IPC_CHANNELS.CUSTOMERS_ARCHIVE, params),
  payCustomer: (params: {
    customerId: number;
    amount: number;
    paymentMethod: string;
    note?: string | null;
    userId: number;
    shiftId?: number | null;
  }) => ipcRenderer.invoke(IPC_CHANNELS.CUSTOMERS_PAY, params),
  getCustomerStatement: (params: { customerId: number; dateRange?: { from?: string; to?: string } }) =>
    ipcRenderer.invoke(IPC_CHANNELS.CUSTOMERS_STATEMENT, params),
  getCustomerHistory: (params: { customerId: number; limit?: number }) =>
    ipcRenderer.invoke(IPC_CHANNELS.CUSTOMERS_HISTORY, params),

  // ==========================================
  // Returns
  // ==========================================
  createReturn: (input: CreateReturnInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.RETURNS_CREATE, input),
  processReturn: (input: CreateReturnInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.RETURNS_PROCESS, input),
  createExchange: (input: ExchangeInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.RETURNS_EXCHANGE, input),
  getReturnsBySale: (saleId: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.RETURNS_GET_BY_SALE, saleId),
  getReturnById: (id: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.RETURNS_GET, id),
  listReturns: (filters?: {
    saleId?: number;
    customerId?: number;
    startDate?: string;
    endDate?: string;
    limit?: number;
  }) => ipcRenderer.invoke(IPC_CHANNELS.RETURNS_LIST, filters),

  // ==========================================
  // Cash & Shifts
  // ==========================================
  getActiveShift: (userId?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.CASH_GET_ACTIVE_SHIFT, userId),
  openShift: (userId: number, openingCash: number, notes?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CASH_OPEN_SHIFT, userId, openingCash, notes),
  closeShift: (shiftId: number, actualCash: number, notes?: string, actorUserId?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.CASH_CLOSE_SHIFT, shiftId, actualCash, notes, actorUserId),
  recordExpense: (input: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.CASH_RECORD_EXPENSE, input),
  openCashDrawer: (shiftId?: number, userId?: number, reason?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CASH_DRAWER_OPEN, shiftId, userId, reason),
  depositCash: (shiftId: number, userId: number, amount: number, note?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CASH_DEPOSIT, shiftId, userId, amount, note),
  withdrawCash: (shiftId: number, userId: number, amount: number, note?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CASH_WITHDRAWAL, shiftId, userId, amount, note),
  getCashMovements: (filter: { shift_id: number; type?: any }) =>
    ipcRenderer.invoke(IPC_CHANNELS.CASH_GET_MOVEMENTS, filter),
  getExpenses: (filter?: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.CASH_GET_EXPENSES, filter),
  getShifts: (options?: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.CASH_GET_SHIFTS, options),
  getShiftSummary: (shiftId: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.CASH_GET_SHIFT_SUMMARY, shiftId),
  getExpenseCategories: () =>
    ipcRenderer.invoke(IPC_CHANNELS.CASH_GET_EXPENSE_CATEGORIES),

  // ==========================================
  // Reports
  // ==========================================
  getDashboardReport: () =>
    ipcRenderer.invoke(IPC_CHANNELS.REPORTS_GET_DASHBOARD),
  getDailyReport: (filter?: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.REPORTS_GET_DAILY, filter),
  getProfitLossReport: (filter: { startDate: string; endDate: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.REPORTS_GET_PROFIT_LOSS, filter),
  getPaymentMethodsReport: (filter?: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.REPORTS_GET_PAYMENT_METHODS, filter),
  getProductPerformanceReport: (options?: any) =>
    ipcRenderer.invoke(IPC_CHANNELS.REPORTS_GET_PRODUCT_PERFORMANCE, options),
  getCashFlowReport: (filter: { startDate: string; endDate: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.REPORTS_GET_CASH_FLOW, filter),

  // ==========================================
  // Settings & Backup
  // ==========================================
  getSettings: () =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET_ALL),
  updateSettings: (updates: { key: string; value: string }[], userId?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_UPDATE, updates, userId),
  createBackup: (destPath?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.BACKUP_CREATE, destPath),
  restoreBackup: (backupFilePath: string, ownerPassword?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.BACKUP_RESTORE, { backupFilePath, ownerPassword }),
  listBackups: (backupDir?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.BACKUP_LIST, backupDir),
  exportToUsb: (targetPath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.BACKUP_EXPORT_USB, targetPath),
  verifyIntegrity: () =>
    ipcRenderer.invoke(IPC_CHANNELS.BACKUP_VERIFY_INTEGRITY),
  rotateBackups: (maxAgeDays?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.BACKUP_ROTATE, maxAgeDays),
  getBackupScheduleStatus: () =>
    ipcRenderer.invoke(IPC_CHANNELS.BACKUP_SCHEDULE_STATUS),

  // ==========================================
  // Database Inspector & Viewer
  // ==========================================
  selectDatabaseFile: () =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_INSPECTOR_SELECT_FILE),
  inspectDatabase: (filePath?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_INSPECTOR_INSPECT, filePath),
  getDefaultDatabasePath: () =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_INSPECTOR_GET_DEFAULT_PATH),
  listInspectorBackups: () =>
    ipcRenderer.invoke(IPC_CHANNELS.DB_INSPECTOR_LIST_BACKUPS),

  // ==========================================
  // System & Screen Lock
  // ==========================================
  lockScreen: () => ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_LOCK),
  unlockScreen: () => ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_UNLOCK),
  reportActivity: () => ipcRenderer.send(IPC_CHANNELS.SYSTEM_ACTIVITY),
  onLockStateChanged: (callback: (state: { isLocked: boolean }) => void) => {
    const handler = (_event: unknown, data: { isLocked: boolean }) => callback(data);
    ipcRenderer.on('system:lock-state-changed', handler);
    return () => {
      ipcRenderer.removeListener('system:lock-state-changed', handler);
    };
  },

  // ==========================================
  // Repairs & Maintenance Workshop
  // ==========================================
  listRepairs: (filters?: RepairFilterOptions) =>
    ipcRenderer.invoke(IPC_CHANNELS.REPAIRS_LIST, filters),
  getRepair: (id: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.REPAIRS_GET, id),
  createRepair: (params: { input: CreateRepairOrderInput; userId: number; shiftId?: number }) =>
    ipcRenderer.invoke(IPC_CHANNELS.REPAIRS_CREATE, params),
  updateRepair: (params: { id: number; input: UpdateRepairOrderInput; userId: number }) =>
    ipcRenderer.invoke(IPC_CHANNELS.REPAIRS_UPDATE, params),
  updateRepairStatus: (params: { id: number; status: RepairStatus; userId: number; note?: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.REPAIRS_UPDATE_STATUS, params),
  deliverRepair: (params: DeliverRepairInput) =>
    ipcRenderer.invoke(IPC_CHANNELS.REPAIRS_DELIVER, params),
  addRepairPart: (params: { input: AddRepairPartInput; userId: number }) =>
    ipcRenderer.invoke(IPC_CHANNELS.REPAIRS_ADD_PART, params),
  removeRepairPart: (params: { partId: number; userId: number }) =>
    ipcRenderer.invoke(IPC_CHANNELS.REPAIRS_REMOVE_PART, params),

  // ==========================================
  // Device Serials & IMEI Tracking
  // ==========================================
  listSerials: (filters?: DeviceSerialFilters) =>
    ipcRenderer.invoke(IPC_CHANNELS.SERIALS_LIST, filters),
  searchSerials: (query: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SERIALS_SEARCH, query),
  createSerial: (params: { input: CreateDeviceSerialInput; userId: number }) =>
    ipcRenderer.invoke(IPC_CHANNELS.SERIALS_CREATE, params),
  updateSerialStatus: (params: { id: number; status: DeviceSerialStatus; saleItemId?: number }) =>
    ipcRenderer.invoke(IPC_CHANNELS.SERIALS_UPDATE_STATUS, params),

  // ==========================================
  // Generic Whitelisted IPC Bridge
  // ==========================================
  invoke: (channel: string, ...args: unknown[]) => {
    if (!ALLOWED_IPC_CHANNELS.has(channel)) {
      console.warn(`[Security Warning] Blocked call to unauthorized IPC channel: ${channel}`);
      throw new Error(`قناة الاتصال غير مصرح بها: ${channel}`);
    }
    return ipcRenderer.invoke(channel, ...args);
  },
  send: (channel: string, ...args: unknown[]) => {
    if (!ALLOWED_IPC_CHANNELS.has(channel)) {
      console.warn(`[Security Warning] Blocked call to unauthorized IPC channel: ${channel}`);
      return;
    }
    ipcRenderer.send(channel, ...args);
  },
};

contextBridge.exposeInMainWorld('electron', electronAPI);

export type ElectronAPI = typeof electronAPI;
