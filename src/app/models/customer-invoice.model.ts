/**
 * Native customer-invoice creation models (Phase 2) — mirror RFIJobOps
 * CustomModel/CustomerInvoiceDTO.cs. The four legacy paths collapse to one source enum; the API
 * has no string-enum converter, so `source` is sent as a NUMBER.
 */

export const CustomerInvoiceSource = {
  Scratch: 0,
  VendorInvoice: 1,
  VendorEstimate: 2,
  CustomerEstimate: 3,
} as const;

export type CustomerInvoiceSourceValue =
  (typeof CustomerInvoiceSource)[keyof typeof CustomerInvoiceSource];

export interface CustomerInvoiceLineItem {
  /** JobSalesInvoiceDetail.DetailKey when this line already exists (read paths only). */
  detailKey?: string | null;
  chargeTypeKey?: string | null;
  /** Persisted to JobSalesInvoiceDetail.ItemName. */
  chargeType?: string | null;
  description?: string | null;
  rate: number;
  qty: number;
  /** Server recomputes Amt = round(rate*qty, 2); this is informational. */
  amount?: number | null;
  markupPercent?: number | null;
  costIncurred?: number | null;
  display?: number | null;
  lineType?: string | null;
  vendorEstimateDetailKey?: string | null;
}

export interface CreateCustomerInvoiceRequest {
  source: CustomerInvoiceSourceValue;
  jobKey?: string | null;
  sourceKey?: string | null;
  vendorEstimateKeys?: string[] | null;
  terms?: string | null;
  worksPerformed?: string | null;
  lineItems?: CustomerInvoiceLineItem[] | null;
  addAdminFee: boolean;
  adminFeePercent?: number | null;
  /** Route for manager review: auto-approves if the creator is an approving agent, else emails the prep manager. */
  sendToPrepManager?: boolean;
}

export interface CreateCustomerInvoiceResponse {
  customerInvoiceKey: string;
  invoiceNo?: number | null;
  lineItems: CustomerInvoiceLineItem[];
  invoiceTotal: number;
  depositAmount: number;
  message: string;
}

export interface PreviewCustomerInvoiceResponse {
  jobKey?: string | null;
  terms?: string | null;
  worksPerformed?: string | null;
  lineItems: CustomerInvoiceLineItem[];
  invoiceTotal: number;
  depositAmount: number;
  message: string;
}

export interface ActiveCustomerInvoiceCheckResponse {
  hasActiveInvoice: boolean;
  message?: string | null;
}

export interface DepositGateResponse {
  canProceed: boolean;
  message: string;
}

export interface VendorCostCheckResponse {
  vendorTotal: number;
  invoiceTotal: number;
  exceeds: boolean;
  message: string;
}

// ── Terms dropdown (legacy MgtJobSalesOrder.Index VendorNetTerm SelectList) ───

/** One selectable payment-term option for the scratch invoice modal's Terms dropdown. */
export interface CustomerInvoiceTermOption {
  /** The stored/display value (VendorNetTerm.TermName, e.g. "Net +30"). */
  termName: string;
  /** Term length in days (VendorNetTerm.TermValue), informational only. */
  termValue?: number | null;
}

/** Terms dropdown seed: every configured term plus the one to preselect for the job's customer. */
export interface CustomerInvoiceTermsOptionsResponse {
  options: CustomerInvoiceTermOption[];
  /** The customer's configured NET term, else the "Net +10" default. */
  defaultTerm: string;
}

// ── List (legacy SaleEstimated grid, invoice rows only) ──────────────────────

export interface CustomerInvoiceListItem {
  customerInvoiceKey: string;
  invoiceNo?: number | null;
  createdDate?: string | null;
  checkNo?: string | null;
  invoiceTotal: number;
  depositAmount: number;
  /** "Deposit Invoice" while the deposit row is unpaid, else "Invoice" (legacy FillInvoiceList). */
  estimateStatus: string;
  isPrepped: boolean;
  sentToCustomer: boolean;
  invoicePaid: boolean;
  invoiceManuallyPushedToQuickBook: boolean;
  manuallySentToCustomer: boolean;
  /** Null = not yet reviewed by the prep manager, true = approved, false = change requested. */
  prepReviewDecision: boolean | null;
  prepReviewDeclineNote: string | null;
}

export interface CustomerInvoiceListResponse {
  invoices: CustomerInvoiceListItem[];
}

export interface CustomerInvoiceDetailResponse {
  customerInvoiceKey: string;
  invoiceNo?: number | null;
  terms?: string | null;
  worksPerformed?: string | null;
  lineItems: CustomerInvoiceLineItem[];
  invoiceTotal: number;
  sentToCustomer: boolean;
  invoicePaid: boolean;
}

// ── Mark paid / QuickBooks push / manually sent / mark unpaid ────────────────

export const InvoiceReceivableAction = {
  PushToQuickBooks: 1,
  MarkPaid: 2,
  ManuallySentToCustomer: 3,
  MarkUnpaid: 4,
} as const;

export type InvoiceReceivableActionValue =
  (typeof InvoiceReceivableAction)[keyof typeof InvoiceReceivableAction];

export interface UpdateInvoiceReceivablesRequest {
  invoiceKey: string;
  action: InvoiceReceivableActionValue;
  checkNo?: string | null;
  isDeposit: boolean;
  note?: string | null;
}

export interface UpdateInvoiceReceivablesResponse {
  invoiceKey: string;
  action: InvoiceReceivableActionValue;
  message: string;
}

// ── Recipients ─────────────────────────────────────────────────────────────────

export interface CustomerInvoiceRecipient {
  contactKey: string;
  name?: string | null;
  title?: string | null;
  email?: string | null;
  isAccountContact: boolean;
  isJobDefaultContact: boolean;
}

export interface CustomerInvoiceRecipientsResponse {
  customerInvoiceKey: string;
  jobKey?: string | null;
  accountContacts: CustomerInvoiceRecipient[];
  locationContacts: CustomerInvoiceRecipient[];
}

// ── Send invoice to customer ──────────────────────────────────────────────────

export interface SendCustomerInvoiceEmailRequest {
  customerInvoiceKey: string;
  contactKeys?: string[] | null;
  customerEmail?: string | null;
  customNotes?: string | null;
  ccEmails?: string[] | null;
}

export interface CustomerInvoiceSendResultDto {
  contactKey: string;
  email: string;
  sent: boolean;
  message?: string | null;
}

export interface SendCustomerInvoiceEmailResponse {
  success: boolean;
  message: string;
  emailSubject: string;
  results: CustomerInvoiceSendResultDto[];
  sentCount: number;
  failedCount: number;
}

// ── Void / resubmit ────────────────────────────────────────────────────────────

export interface VoidCustomerInvoiceRequest {
  customerInvoiceKey: string;
  reason?: string | null;
}

export interface VoidCustomerInvoiceResponse {
  customerInvoiceKey: string;
  message: string;
}

export interface ResubmitCustomerInvoiceRequest {
  customerInvoiceKey: string;
  resubmitRemark?: string | null;
}

export interface ResubmitCustomerInvoiceResponse {
  customerInvoiceKey: string;
  message: string;
}
