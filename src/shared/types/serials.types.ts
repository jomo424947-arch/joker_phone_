/**
 * أنواع وبيانات تتبع أرقام المسلسلات و IMEI (Device Serials & IMEI Types)
 */

export type DeviceCondition = 'new' | 'used_like_new' | 'used_good' | 'used_fair';
export type DeviceSerialStatus = 'in_stock' | 'sold' | 'in_repair' | 'returned' | 'reserved';

export interface DeviceSerial {
  id: number;
  variantId: number;
  productName?: string;
  variantName?: string;
  barcode?: string;
  imei1: string;
  imei2?: string | null;
  serialNo?: string | null;
  batteryHealth?: number | null;
  condition: DeviceCondition;
  status: DeviceSerialStatus;
  warrantyMonths: number;
  saleItemId?: number | null;
  notes?: string | null;
  createdAt: string;
}

export interface CreateDeviceSerialInput {
  variantId: number;
  imei1: string;
  imei2?: string;
  serialNo?: string;
  batteryHealth?: number;
  condition?: DeviceCondition;
  warrantyMonths?: number;
  notes?: string;
}

export interface DeviceSerialFilters {
  search?: string;
  variantId?: number;
  status?: DeviceSerialStatus;
  condition?: DeviceCondition;
  limit?: number;
}
