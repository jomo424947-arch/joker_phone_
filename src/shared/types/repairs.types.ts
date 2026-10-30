/**
 * أنواع وبيانات نظام الصيانة والورشة (Repairs & Maintenance Types)
 * متوافقة مع جدول repair_orders وجدول repair_parts وجدول repair_status_logs
 */

export type RepairStatus =
  | 'received'          // تم الاستلام
  | 'inspecting'        // قيد الفحص
  | 'pending_approval'  // بانتظار موافقة العميل
  | 'in_progress'       // جاري الإصلاح
  | 'ready'             // تم الإصلاح وجاهز للتسليم
  | 'delivered'         // تم التسليم والمحاسبة
  | 'cancelled';        // تعذر الإصلاح أو ملغي

export interface RepairPart {
  id: number;
  repairId: number;
  variantId: number;
  batchId?: number | null;
  itemName: string;
  qty: number;
  unitCost: number;       // بالقروش
  unitPrice: number;      // بالقروش
  createdAt: string;
}

export interface RepairStatusLog {
  id: number;
  repairId: number;
  oldStatus?: string | null;
  newStatus: string;
  userId: number;
  userName?: string;
  note?: string | null;
  createdAt: string;
}

export interface RepairOrder {
  id: number;
  uuid: string;
  seqNo: number;
  repairCode: string;           // REP-1001
  customerId?: number | null;
  customerName: string;
  customerPhone: string;
  technicianId?: number | null;
  technicianName?: string | null;
  userId: number;
  userName?: string;
  shiftId?: number | null;

  deviceBrand: string;          // Apple, Samsung, etc.
  deviceModel: string;          // iPhone 14 Pro, etc.
  deviceColor?: string | null;
  imeiSerial?: string | null;
  passcodePattern?: string | null;

  reportedIssue: string;
  inspectionNotes?: string | null;
  deviceCondition?: string | null;
  receivedAccessories?: string | null; // JSON string e.g. ["جراب", "شاحن"]

  estimatedCost: number;        // بالقروش
  depositAmount: number;        // العربون بالقروش
  laborCost: number;            // أجر اليد / المصنعية بالقروش
  partsCost: number;            // تكلفة قطع الغيار بالقروش
  totalCost: number;            // الإجمالي بالقروش
  paidAmount: number;           // المدفوع بالقروش
  remainingAmount: number;      // المتبقي بالقروش

  status: RepairStatus;
  warrantyDays: number;
  createdAt: string;
  readyAt?: string | null;
  deliveredAt?: string | null;
  notes?: string | null;

  depositInvoiceId?: number | null;
  deliveryInvoiceId?: number | null;
  depositInvoiceNo?: string | null;
  deliveryInvoiceNo?: string | null;
  depositMethod?: string | null;
  deliveryMethod?: string | null;

  parts?: RepairPart[];
  logs?: RepairStatusLog[];
}

export interface CreateRepairOrderInput {
  customerId?: number | null;
  customerName: string;
  customerPhone: string;
  technicianId?: number | null;
  deviceBrand: string;
  deviceModel: string;
  deviceColor?: string;
  imeiSerial?: string;
  passcodePattern?: string;
  reportedIssue: string;
  inspectionNotes?: string;
  deviceCondition?: string;
  receivedAccessories?: string[];
  estimatedCost?: number;       // بالقروش
  depositAmount?: number;       // العربون بالقروش
  depositMethod?: 'cash' | 'card' | 'wallet';
  laborCost?: number;           // بالقروش
  warrantyDays?: number;
  notes?: string;
}

export interface DeliverRepairInput {
  id: number;
  paymentMethod?: 'cash' | 'card' | 'wallet';
  discountAmount?: number;      // بالقروش
  finalLaborCost?: number;      // بالقروش
  note?: string;
  userId: number;
  shiftId?: number;
}

export interface UpdateRepairOrderInput {
  technicianId?: number | null;
  reportedIssue?: string;
  inspectionNotes?: string;
  deviceCondition?: string;
  receivedAccessories?: string[];
  estimatedCost?: number;
  laborCost?: number;
  warrantyDays?: number;
  notes?: string;
}

export interface AddRepairPartInput {
  repairId: number;
  variantId: number;
  batchId?: number | null;
  itemName: string;
  qty: number;
  unitCost: number;
  unitPrice: number;
}

export interface RepairFilterOptions {
  search?: string;
  status?: RepairStatus;
  technicianId?: number;
  startDate?: string;
  endDate?: string;
  paymentStatus?: 'all' | 'paid' | 'pending';
  limit?: number;
}

