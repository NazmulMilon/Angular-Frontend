/** One sibling option in a multi-option estimate (rows sharing a MutiEstiIdentifier). */
export interface ThreadEstimateOptionDto {
  estimateKey: string;
  optionLabel: string;
  total: number;
  status?: number;
  statusLabel?: string;
  isVendorPick?: boolean;
  isSelected?: boolean;
}

/** Response from ProjectRCS GET /JobOpsChat/GetThreadEstimate */
export interface ThreadEstimateDto {
  ok: boolean;
  error?: string;
  message?: string;
  hasEstimate?: boolean;
  estimateKey?: string;
  jobKey?: string;
  vendorKey?: string;
  status?: number;
  statusLabel?: string;
  onsiteApproval?: boolean;
  html?: string;
  originalHtml?: string;
  hasComparison?: boolean;
  allowedActions?: string[];
  canAct?: boolean;
  approveDisabled?: boolean;
  approveDisabledReason?: string;
  approveDneMessage?: string;
  approveHardBlocked?: boolean;
  estimateOptionCount?: number;
  /** Populated only when there's more than one sibling estimate on this job/vendor. */
  options?: ThreadEstimateOptionDto[];
  reviewingPosted?: boolean;
  isCancelled?: boolean;
  needsReview?: boolean;
  vendorResubmitted?: boolean;
  createdInvoiceForIncurredAfterDeclined?: boolean;
  hasUnbilledIncurredLines?: boolean;
  invoiceTotal?: number;
  oldTotal?: number | null;
  totalsChanged?: boolean;
  editedByVendor?: boolean;
  isEdited?: boolean;
  isNew?: boolean;
  hasArchive?: boolean;
  archiveVersion?: number | null;
  vendorClearedReject?: boolean;
  previousEstimateLabel?: string;
  /** Relative path — MgtVendorInvoice/UpdateVendorEstimate (full V1 vendor estimate page). */
  manageUrl?: string;
  /** Relative path — MgtVendorInvoice/EIndex for all estimates on the job. */
  billsUrl?: string;
  /** Relative path to the vendor→customer estimate split-screen builder (Get Customer Approval flow). */
  splitScreenUrl?: string;
}

export interface OnsiteEstimateActionRequest {
  estimateKey: string;
  action: 'approve' | 'reject' | 'decline';
  adminRemark?: string;
  forceApprove?: boolean;
}

/** Shared request shape for the two customer-approval actions that only need an estimateKey. */
export interface CustomerApprovalActionRequest {
  estimateKey: string;
}

export interface GetCustomerApprovalResult {
  ok: boolean;
  error?: string;
  message?: string;
  /** Vendor→customer estimate split-screen builder URL to open in a new tab. */
  splitScreenUrl?: string;
}

export interface ApproveOnBehalfAndVendorRequest {
  estimateKey: string;
  /** Required — how the customer approved (contact name, verbal approval, or reference to uploaded proof). */
  customerConversation: string;
}

export interface OnsiteEstimateActionResult {
  ok: boolean;
  error?: string;
  message?: string;
  messageKey?: string;
}

export interface GoHomeRequest {
  estimateKey: string;
  adminRemark?: string;
}

/** Line from GET /JobOpsChat/GetOnsiteNegotiateLines */
export interface OnsiteNegotiateLine {
  detailKey: string;
  labor: 'material' | 'labor';
  itemName?: string;
  chargeTypeKey?: string;
  description?: string;
  rate?: number;
  qty?: number;
  hour?: number;
  tech?: number;
  costIncurred?: number;
  display?: number;
  /** False for labor and trip charge — admin may only change qty/hours/tech. */
  rateEditable?: boolean;
}

export interface OnsiteNegotiateLinesResult {
  ok: boolean;
  error?: string;
  message?: string;
  estimateKey?: string;
  jobKey?: string;
  vendorKey?: string;
  lines?: OnsiteNegotiateLine[];
}

export interface OnsiteNegotiateRequest {
  estimateKey: string;
  adminRemark?: string | null;
  lines: OnsiteNegotiateLine[];
}

export interface OnsiteNegotiateResult {
  ok: boolean;
  error?: string;
  message?: string;
}

/** Line from GET /JobOpsChat/GetOnsiteDeclineIncurredLines */
export interface OnsiteDeclineIncurredLine {
  detailKey: string;
  whichTable: number;
  itemName?: string;
  description?: string;
  amount?: number;
  qty?: number;
  rowTotal?: number;
}

export interface OnsiteDeclineIncurredLinesResult {
  ok: boolean;
  error?: string;
  message?: string;
  estimateKey?: string;
  jobKey?: string;
  vendorKey?: string;
  hasIncurredLines?: boolean;
  alreadyInvoiced?: boolean;
  lines?: OnsiteDeclineIncurredLine[];
}

export interface OnsiteDeclineIncurredSelection {
  detailKey: string;
  whichTable: number;
}

export interface OnsiteDeclineIncurredInvoiceRequest {
  estimateKey: string;
  jobKey: string;
  vendorKey: string;
  detailList: OnsiteDeclineIncurredSelection[];
}

export interface OnsiteDeclineIncurredInvoiceResult {
  ok: boolean;
  error?: string;
  message?: string;
  vendorInvoiceKey?: string;
  invoiceUrl?: string;
}
