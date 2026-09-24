/** "2 · Invoice Customer" job-level card -- mirrors RFIJobOps.CustomModel.InvoiceCustomerCardDto. */
export interface InvoiceCustomerCard {
  hasInvoice: boolean;
  customerInvoiceKey: string | null;
  invoiceNo: number | null;
  terms: string | null;

  customerName: string | null;
  serviceLocationName: string | null;
  po: string | null;
  completionDate: string | null;
  /** Job.Description, HTML-stripped -- shown at the foot of the invoice document. */
  serviceRequest: string | null;

  /** 0 = no active invoice at all, 1-6 = the RFI-25 tier. */
  tierNumber: number;
  tierLabel: string;
  /** All six tier labels in order, e.g. "1 · Invoice already present" .. "6 · From scratch". */
  allTierLabels: string[];

  bannerIcon: string;
  bannerText: string;

  lineItems: InvoiceCustomerLine[];
  invoiceTotal: number;
  depositAmount: number | null;
  balanceDue: number;

  sentToCustomer: boolean;
  sentAt: string | null;
  invoicePaid: boolean;
  pushedToQuickBooks: boolean;
  qbRefNo: string | null;
  qbManualAmount: number | null;

  /** "✓ Approve Customer Invoice" (2026-09-16). */
  approvedByAm: boolean;
  approvedOn: string | null;
  approvedByName: string | null;
  approvedTotal: number | null;
  pinnedApprovalNotes: { noteKey: string; comment: string | null; addedOn: string | null; addedByName: string | null; relatedLabel: string | null }[];

  isDepositInvoice: boolean;
  portalUploadedDeposit: boolean;
  portalUploadedDepositAt: string | null;
  portalUploadedFinal: boolean;
  portalUploadedFinalAt: string | null;

  customerProfile: InvoiceCustomerProfile;
  grossProfit: InvoiceCustomerGrossProfit;

  lateVendorInvoiceCallouts: LateVendorInvoiceCallout[];
}

export interface InvoiceCustomerLine {
  detailKey: string | null;
  chargeTypeKey: string | null;
  chargeType: string | null;
  description: string | null;
  qty: number;
  rate: number;
  amount: number;
  costIncurred: number | null;
  display: number | null;
  /** "💲 Apply customer discount / adjustment" (2026-09-16). */
  isAdjustmentLine: boolean;
  isReversed: boolean;
}

export interface InvoiceCustomerProfile {
  accountingContactName: string | null;
  accountingContactEmail: string | null;
  signoffRequired: boolean;
  afterPicsRequired: boolean;
  aiBotCallsAllowed: boolean;
  minMarkupRulesLabel: string;
  specialInstructions: string | null;
  portalUrl: string | null;
  portalUploadRequired: boolean;
}

export interface InvoiceCustomerGrossProfitVendorRow {
  vendorName: string | null;
  cost: number;
  payable: boolean;
}

export interface InvoiceCustomerGrossProfit {
  vendorRows: InvoiceCustomerGrossProfitVendorRow[];
  combinedVendorCost: number;
  customerInvoiceTotal: number;
  grossProfit: number;
  profitMarginPercent: number | null;
  markupPercent: number | null;
  minMarkupTargetPercent: number | null;
  minMarkupTargetRuleLabel: string | null;
  belowMinimumMarkup: boolean;
}

export interface LateVendorInvoiceCallout {
  vendorKey: string;
  vendorName: string | null;
  vendorInvoiceKey: string;
  vendorInvoiceNo: string | null;
  vendorInvoiceTotal: number;
  revisedVendorDneTotal: number;
  delta: number;
}

export interface ReflectVendorInvoiceChangeRequest {
  vendorKey: string;
}

/** Pushed once automatic invoice creation (2026-09-15) finishes for a job -- whether it actually
 *  created an invoice or found nothing eligible, so the open card always ends its "creating…" state. */
/** One selectable file/photo in the Approve/Send-to-Customer popups (2026-09-16). Mirrors
 *  RFIJobOps.CustomModel.InvoiceAttachmentOptionDto. */
export interface InvoiceAttachmentOption {
  key: string;
  kind: 'job-file' | 'vendor-upload';
  fileName: string | null;
  fileType: string | null;
  vendorName: string | null;
  uploadedOn: string | null;
  isCheckoutPhoto: boolean;
}

export interface InvoiceCustomerCardChangedDto {
  jobKey: string;
  changeType: 'invoice-auto-created' | 'invoice-auto-create-skipped';
}
