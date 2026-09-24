/** Standard API envelope (matches RFIJobOps ApiResponse). */
export interface VendorBillsApiResponse<T> {
  status: boolean;
  responseCode: number;
  message: string;
  data: T;
  details: { message?: string }[];
  unixTime: number;
  traceId: string | null;
}

export interface PagedResult<T> {
  draw: number;
  totalRecords: number;
  filteredRecords: number;
  data: T[];
  errorMessage?: string | null;
}

export interface AdminJobCheckInOutRow {
  checkinKey: string;
  vendorKey: string | null;
  vendorName: string;
  vendorTradeName: string | null;
  checkOutStatus: string | null;
  checkOutStatusDisplay: string;
  statusBadgeVariant: 'estimating' | 'complete' | 'ordering' | 'default';
  checkInTime: string | null;
  checkInDisplay: string;
  checkOutTime: string | null;
  checkOutDisplay: string;
  techCount: number | null;
  workPerformedDisplay: string;
  notes: string;
  isSelected: boolean;
  isVendorDeleted: boolean;
  isCheckedOut: boolean;
  editCheckInLocal: string | null;
  editCheckOutLocal: string | null;
}

export interface AdminJobCheckInOutVendorOption {
  jobVendorKey: string;
  vendorKey: string;
  vendorName: string;
  isCurrentlyCheckedIn: boolean;
}

export interface AdminEditCheckInOutRequest {
  checkinKey: string;
  newCheckInTime: string | null;
  newCheckOutTime: string | null;
  adminNote: string;
}

export interface AdminSaveCheckInRequest {
  jobVendorKey: string;
  checkInDate: string;
  noOfTech: number;
}

export interface AdminCustomerDneTracker {
  customerDne: number;
  minimumMarkupPercent: number;
  minimumMarkupAmount: number;
  committedAmount: number;
  customerKey: string | null;
}

export interface AdminJobEstimateLineItem {
  lineItemKey: string | null;
  itemName: string;
  description: string;
  rate: number | null;
  quantity: number | null;
  rowTotal: number;
  costIncurredLabel: string;
  costIncurredMarker: number | null;
  itemCategory: string;
}

export interface AdminJobEstimateStatusDisplay {
  statusBannerVariant: 'declined' | 'approved' | 'change-order' | 'info' | 'deleted' | 'none';
  statusBannerTitle: string | null;
  remarks: string | null;
  otherRemark: string | null;
  customerEstimateRemark: string | null;
  showNotApprovedByCustomer: boolean;
  showCustomerApprovedEquivalent: boolean;
  /** Short bold heading, matching the other status banners. */
  customerApprovalTitle: string | null;
  customerApprovalMessage: string | null;
}

export interface AdminJobEstimateOptionSection {
  estimateKey: string;
  jobVendorKey: string | null;
  title: string;
  sectionTotal: number;
  statusLabel: string;
  statusBadgeVariant: string;
  /** Optional secondary pill text shown beside the status label (RBR-472). */
  statusPill?: string | null;
  /** Colour variant key for the status pill (RBR-472). */
  statusPillVariant?: string | null;
  statusCode: number | null;
  isDeleted: boolean;
  isEdited: boolean;
  vendorEdited: boolean;
  onsiteApproval: boolean;
  printUrl: string;
  updateEstimateUrl: string;
  /** See {@link AdminJobEstimateCard.feedsCustomerEstimate}. Judged per option, not per parent. */
  feedsCustomerEstimate: boolean;
  statusDisplay: AdminJobEstimateStatusDisplay;
  lineItems: AdminJobEstimateLineItem[];
}

/** Per-estimate (or per multi-option section) target for manage-status actions. */
export interface AdminJobEstimateActionTarget {
  estimateKey: string;
  jobVendorKey: string | null;
  updateEstimateUrl: string;
  statusLabel: string;
  statusPillVariant?: string | null;
  onsiteApproval: boolean;
  /** See {@link AdminJobEstimateCard.feedsCustomerEstimate} — gates the vendor-deposit action. */
  feedsCustomerEstimate: boolean;
}

export interface AdminJobEstimateCard {
  estimateKey: string;
  jobVendorKey: string | null;
  estimateNo: string;
  estimateDate: string | null;
  estimateDateDisplay: string;
  vendorKey: string | null;
  contactKey: string | null;
  vendorName: string;
  isDefaultVendor: boolean;
  statusLabel: string;
  statusBadgeVariant: string;
  /** Optional secondary pill text shown beside the status label (RBR-472). */
  statusPill?: string | null;
  /** Colour variant key for the status pill (RBR-472). */
  statusPillVariant?: string | null;
  statusCode: number | null;
  isDeleted: boolean;
  isVendorDeleted: boolean;
  isNew: boolean;
  isEdited: boolean;
  vendorEdited: boolean;
  onsiteApproval: boolean;
  showOnsiteBanner: boolean;
  vendorNote: string | null;
  adminRemark: string | null;
  estimateTotal: number;
  showOverDneWarning: boolean;
  isMultipleOptionEstimate: boolean;
  estimateTitle: string | null;
  printUrl: string;
  updateEstimateUrl: string;
  vendorPortalLoginUrl: string;
  /** Per-vendor DNE for this estimate's job vendor (RevVendorDne preferred). */
  vendorDne?: number | null;
  /**
   * True when this vendor estimate actually feeds one of the job's active customer estimates. False for
   * estimates that were never selected (losing bids in a multi-vendor selection, or anything not
   * chosen) — a vendor deposit can't be anchored to those, so the deposit action is hidden.
   */
  feedsCustomerEstimate: boolean;
  statusDisplay: AdminJobEstimateStatusDisplay;
  lineItems: AdminJobEstimateLineItem[];
  optionSections: AdminJobEstimateOptionSection[];
  negotiationSummary?: AdminEstimateNegotiationSummary | null;
}

export interface AdminEstimateNegotiationSummary {
  proposalId?: string | null;
  agentStatus?: string | null;
  recommendationsReady: boolean;
  showPanel: boolean;
}

export type NegotiationLineDecision = 'accept' | 'edit' | 'decline' | null;

export interface NegotiationLineDecisionState {
  decision: NegotiationLineDecision;
  editedValue?: number;
  editedQty?: number;
}

export interface AdminEstimateNegotiation {
  estimateKey?: string | null;
  proposalId?: string | null;
  status?: string | null;
  roundsCount: number;
  recommendationsReady: boolean;
  showPanel: boolean;
  errorMessage?: string | null;
  infoMessage?: string | null;
  estimateUpdated?: boolean;
  estimateEnteredNegotiate?: boolean;
  agentUpdated?: boolean;
  partialFailure?: boolean;
  /**
   * True when the vendor edited/resubmitted this estimate while the proposal was still
   * awaiting_admin — before the admin ever sent a counter. The negotiating agent has no way to
   * accept an update to a still-pending pre-counter proposal, so the recommendations/values below
   * may not reflect the vendor's latest numbers. Check the estimate's live line items directly.
   */
  vendorEditedSinceSubmission?: boolean;
  summary?: AdminEstimateNegotiationSummaryBlock | null;
  lines: AdminEstimateNegotiationLine[];
  dneSummary?: AdminEstimateNegotiationDneSummary | null;
}

export interface AdminEstimateNegotiationSummaryBlock {
  vendorProposedTotal: number;
  suggestedCounterTotal: number;
  dneStatus?: string | null;
  overallConfidence?: number | null;
  incurredTotal: number;
}

export interface AdminEstimateNegotiationLine {
  lineItemId: string;
  detailKey?: string | null;
  itemCode?: string | null;
  itemName?: string | null;
  itemDescription?: string | null;
  vendorValue: number;
  suggestedValue: number;
  suggestedQty?: number | null;
  /** Vendor's locked rate-card rate (labor $/hr or trip flat fee), when one applies to this line.
   * Exact by construction — prefer this over deriving suggestedValue/suggestedQty, which can drift
   * slightly due to qty rounding. */
  lockedRate?: number | null;
  floor?: number | null;
  ceiling?: number | null;
  confidence?: number | null;
  deltaPct?: number | null;
  reasoning?: string | null;
  llmReasoning?: string | null;
  flags: AdminEstimateNegotiationFlag[];
  counterThisLine: boolean;
  displaySuggestion: string;
}

export interface AdminEstimateNegotiationFlag {
  type?: string | null;
  code?: string | null;
  detail?: string | null;
}

export interface AdminEstimateNegotiationDneSummary {
  customerDne: number;
  ceiling50Pct: number;
  revisedDne: number;
}

export interface AdminSendCounterRequest {
  roundNumber: number;
  actions: AdminCounterLineAction[];
  notesToVendor?: string | null;
}

export interface AdminCounterLineAction {
  lineItemId: string;
  action: 'accept' | 'edit' | 'decline';
  value: number;
  qty?: number | null;
  notes?: string | null;
}

export interface AdminJobEstimatesPage {
  dneTracker: AdminCustomerDneTracker;
  estimates: PagedResult<AdminJobEstimateCard>;
  hasCustomerEstimate: boolean;
  /** True when the job's current status is Tech On-Site (or the return-visit variant). */
  isJobTechOnSite: boolean;
}

export type EstimateManageStatusAction =
  | 'onsite-approval-requested'
  | 'estimate-submitted'
  | 'change-order-requested'
  | 'negotiate'
  | 'onsite-approval-approved'
  | 'estimate-approved'
  | 'estimate-declined'
  | 'estimate-reject-resubmit';

export interface UpdateEstimateManageStatusRequest {
  action: EstimateManageStatusAction;
  adminRemark?: string | null;
}

// ── Approve → Additional Approval panel → send-to-vendor chain ─────────────
// (SetVendorEstimateToApproved → SaveVendorApprovalData → SendWorkOrderEmail)

export interface SetVendorEstimateApprovedRequest {
  jobVendorKey: string;
  estimateKey: string;
}

export interface SetVendorEstimateApprovedResultDto {
  flag: number;
  requiresAdditionalApproval: boolean;
}

export interface SaveVendorApprovalDataRequest {
  sendToVendor: boolean;
  jobKey: string;
  vendorKey: string;
  approvalText: string;
  revVendorDNE: number;
}

export interface SaveVendorApprovalDataResponse {
  workOrderKey?: string | null;
  invoiceType?: number | null;
  sendEmail: boolean;
  jobStatusTrigger?: number | null;
  message: string;
}

export interface SendWorkOrderEmailToVendorRequest {
  jobKey: string;
  vendorKey: string;
  workOrderKey: string;
  invoiceType: number;
  emailBody: string;
  recipientEmails: string[];
  attachedFileKeys?: string[] | null;
}

export interface SendWorkOrderEmailResponse {
  success: boolean;
  emailsSent: number;
  message: string;
  jobStatusUpdated: boolean;
  newJobStatus?: string | null;
}

// ── Reject for Resubmission (dedicated status-0 chain) ──────────────────

export interface RejectVendorEstimateRequest {
  estimateKey: string;
  jobKey: string;
  vendorKey: string;
  adminRemark?: string | null;
}

export interface RejectVendorEstimateResultDto {
  emailSent: boolean;
}

// ── Decline (terminal, status-3 chain) ──────────────────────────────────

export interface DeclineVendorEstimateRequest {
  estimateKey: string;
  jobKey: string;
  vendorKey: string;
  adminRemark: string;
}

export interface DeclineVendorEstimateResultDto {
  emailSent: boolean;
}

export interface AdminVendorContactForEstimate {
  contactKey: string;
  name: string;
  email: string;
  isDefault: boolean;
  preSelected: boolean;
}

export interface AdminJobVendorForEstimate {
  jobVendorKey: string;
  vendorKey: string;
  vendorName: string;
  isDefault: boolean;
  preSelectedAsVendor: boolean;
  contacts: AdminVendorContactForEstimate[];
}

export interface AdminCreateEstimateModalData {
  hasVendors: boolean;
  defaultEmailNote: string;
  vendorPortalCreateEstimateUrlPrefix: string;
  vendors: AdminJobVendorForEstimate[];
}

export interface AdminVendorPaperRow {
  uploadKey: string;
  fileName: string;
  fileType: string;
  uploadDateDisplay: string;
  uploadedByDisplay: string;
  isNew: boolean;
  isVendorDeleted: boolean;
  fileUrl: string;
  remark: string | null;
  vendorName: string;
}

export interface AdminVendorPapersPage {
  papers: AdminVendorPaperRow[];
  hasNewPapers: boolean;
}

export interface AdminVendorPaperVendorOption {
  vendorKey: string;
  vendorName: string;
}

export interface AdminDocumentTypeOption {
  id: string;
  name: string;
}

export interface AdminUploadVendorPapersModal {
  jobKey: string;
  jobName: string;
  checkKey: string;
  vendors: AdminVendorPaperVendorOption[];
  documentTypes: AdminDocumentTypeOption[];
  papers: AdminVendorPaperRow[];
}

export interface SaveVendorPapersRequest {
  jobKey: string;
  checkKey: string;
  vendorKey: string;
  documentTypeKey: string;
  remark?: string | null;
}

/** Vendor bill attachment stage — estimate (2006) or invoice (legacy all-non-estimate). */
export type VendorBillAttachmentStage = 'estimate' | 'invoice';

export interface AdminJobBillRow {
  billKey: string;
  billNo: string;
  billDateDisplay: string;
  vendorKey: string | null;
  vendorName: string;
  customerName: string;
  statusLabel: string;
  dueDateDisplay: string;
  paymentLabel: string;
  isDeleted: boolean;
  isVendorDeleted: boolean;
  isDeposit: boolean;
  invoicePaid: boolean;
  payByCc: boolean;
  showPayCcButton: boolean;
  showEditPaymentButton: boolean;
  showDeleteButton: boolean;
  showEditButton: boolean;
  previewUrl: string;
  editUrl: string;
  accountingUrl: string;
  rowVariant: 'default' | 'muted' | 'new';
}

export interface AdminVendorSubmittedInvoiceRow {
  invoiceKey: string;
  invoiceNo: string;
  invoiceDateDisplay: string;
  vendorKey: string | null;
  vendorName: string;
  statusLabel: string;
  statusBadgeVariant: string;
  remarks: string;
  isNew: boolean;
  isVendorDeleted: boolean;
  contactKey: string | null;
  portalLoginUrl: string;
  viewUrl: string;
  manageUrl: string;
  unhighlightUrl: string | null;
  createRcsInvoiceLegacyUrl: string;
  ratesLegacyUrl: string;
  rowVariant: 'default' | 'muted' | 'new';
  // Native customer-invoice creation (Phase 2).
  vendorInvoiceKey: string;
  vendorEstimateKey: string | null;
  canCreateInvoice: boolean;
}

export interface AdminInvoicesPage {
  jobName: string;
  alertMessage: string | null;
  hasActiveCustomerInvoice: boolean;
  bills: AdminJobBillRow[];
  vendorInvoices: AdminVendorSubmittedInvoiceRow[];
}
