/** "🧾 Vendor Invoice EDIT MODE" popup -- mirrors RFIJobOps.CustomModel.VendorInvoiceEditDto. */
export interface VendorInvoiceEdit {
  invoiceKey: string;
  invoiceNo: string | null;
  vendorName: string | null;
  isRejectedForResubmission: boolean;
  lines: VendorInvoiceEditLine[];
  grandTotal: number;
  currentRevisedDne: number;
}

export interface VendorInvoiceEditLine {
  lineKey: string;
  /** true = labor (VendorInvoiceDetail1), false = material (VendorInvoiceDetail). */
  isLabor: boolean;
  description: string | null;
  qty: number;
  cost: number;
  rowTotal: number;
  /** Labor lines only (null for material) -- number of techs on site. */
  techOnSite: number | null;
  /** Labor lines only -- true when the ItemName indicates an elevated rate (Overtime/After
   *  Hours/Weekend/Emergency). */
  isAfterHours: boolean;
  /** True when this line has an open, unresolved rejection (RejectedOn set, ClearedOn not). */
  isRejected: boolean;
  rejectedReason: string | null;
  rejectedByName: string | null;
  rejectedOn: string | null;
  rejectionSentOn: string | null;
  clearedOn: string | null;
}

export interface SaveVendorInvoiceEditLine {
  lineKey: string;
  isLabor: boolean;
  qty: number;
  cost: number;
}

export interface RejectVendorInvoiceLine {
  lineKey: string;
  isLabor: boolean;
  reason: string;
  resubmitTemplateKey?: number | null;
}
