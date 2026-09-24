/**
 * On-Site Approval Estimate Models
 * Maps to new .NET backend endpoints for creating vendor estimates from the field.
 */

import { DynMinMarkupAdjustmentProposal, MarkupAdjustmentDecision } from './dyn-min-markup.model';

// ──────────────────────────────────────────────────────────────
//  Step 1: Initialization Response (GET /initialize/{jobKey})
// ──────────────────────────────────────────────────────────────

export interface OnSiteEstimateInitResponse {
  /** Temporary estimate key (GUID) for tracking this session */
  tempEstimateKey: string;
  
  /** Job information */
  jobKey: string;
  jobName: string;
  jobPo: string | null;
  jobType: string | null;
  jobTypeKey?: string | null;
  locationName: string | null;

  /** Trade information */
  tradeKey: string | null;
  
  /** Vendor information */
  vendorKey: string;
  vendorName: string | null;
  
  /** Current DNE values */
  vendorDne: number;
  customerDne: number;
  
  /** Document types for file uploads */
  documentTypes: DocumentTypeLabel[];
}

export interface DocumentTypeLabel {
  documentTypeKey: string;
  label: string;
}

// ──────────────────────────────────────────────────────────────
//  Step 2-4: Estimate Line Items (Trip, Materials, Labor)
// ──────────────────────────────────────────────────────────────

export enum ChargeType {
  TripCharge = 'trip',
  Material = 'material',
  Labor = 'labor',
}

export enum CostIncurredType {
  Incurred = 0,  // 0 = Already charged/completed (trip charges, completed work)
  Proposed = 1,  // 1 = Work to be done (labor, materials not yet purchased)
}

export enum RateType {
  Flat = 'flat',
  Emergency = 'emergency',
  Standard = 'standard',
  Overtime = 'overtime',
}

export enum LaborCategory {
  MainTech = 'main',
  Helper = 'helper',
}

/** Base line item interface */
export interface EstimateLineItem {
  chargeType: ChargeType;
  costIncurred: CostIncurredType;
  description?: string | null;
  displayLevel?: number;
}

/** Trip charge line item */
export interface TripChargeLineItem extends EstimateLineItem {
  chargeType: ChargeType.TripCharge;
  rateType: RateType.Flat | RateType.Emergency;
  amount: number;
}

/** Material line item */
export interface MaterialLineItem extends EstimateLineItem {
  chargeType: ChargeType.Material;
  itemName: string;
  quantity: number;
  rate: number;
}

/** Labor line item */
export interface LaborLineItem extends EstimateLineItem {
  chargeType: ChargeType.Labor;
  laborCategory: LaborCategory;
  rateType: RateType.Standard | RateType.Overtime;
  techCount: number;
  laborHours: number;
  laborRate: number;
  workDescription: string;
}

// ──────────────────────────────────────────────────────────────
//  Save Estimate Request (POST /save-estimate)
// ──────────────────────────────────────────────────────────────

/** Frontend model for creating estimate line items in the UI */
export interface SaveOnSiteEstimateRequest {
  tempEstimateKey: string;
  jobKey: string;
  vendorKey: string;
  lineItems: (TripChargeLineItem | MaterialLineItem | LaborLineItem)[];
}

/** Backend API format - what the server actually expects */
export interface SaveOnSiteEstimateApiRequest {
  vendorEstimateKey: string;  // Backend uses this name instead of tempEstimateKey
  jobKey: string;
  vendorKey: string;
  lineItems: BackendLineItem[];
}

/** Backend line item format - matches the API contract exactly */
export interface BackendLineItem {
  chargeTypeKey: string;      // e.g., "Flat Trip Charge", "Standard Hourly Rate", "MATERIALS"
  itemName: string;            // Display name
  costIncurred: number;        // 0 = Proposed, 1 = Incurred
  description: string;         // HTML description
  displayLevel: string;        // Usually "1"
  rate: number;                // Hourly rate or unit price
  quantity: number;            // For materials/trip (0 for labor)
  laborHours: number | null;   // For labor only
  techCount: number | null;    // For labor only
  isLabor: boolean;            // true = labor, false = material/trip
}

export interface SaveOnSiteEstimateResponse {
  invoiceKey: string;  // Backend returns this field name (also known as estimateKey)
  message: string;
  
  // Legacy field names (for backwards compatibility)
  estimateKey?: string;
  invoiceNo?: string | null;
}

// ──────────────────────────────────────────────────────────────
//  Submit for Approval (POST /submit-for-customer-approval)
// ──────────────────────────────────────────────────────────────

export interface SubmitForCustomerApprovalRequest {
  estimateKey: string;
}

export interface SubmitForCustomerApprovalResponse {
  success: boolean;
  message: string;
  estimateKey: string;
}

// ──────────────────────────────────────────────────────────────
//  Create Customer Estimate (POST /create-customer-estimate)
// ──────────────────────────────────────────────────────────────

export interface CreateCustomerEstimateRequest {
  vendorEstimateKey: string;
  /**
   * Multiple vendor estimate keys to MERGE into a single customer estimate ("Combine Vendor
   * Estimates"). When supplied with 2+ entries, the backend routes to the multi-vendor merge path
   * instead of the single-vendor path. Omit (or supply exactly one entry) for the ordinary
   * single-vendor create — use `vendorEstimateKey` in that case instead.
   */
  vendorEstimateKeys?: string[];
  /**
   * Optional per-vendor portion titles for a multi-vendor merge (e.g. "Plumbing Portion of Quote"),
   * keyed by `vendorEstimateKey`. Omit entirely, or omit a given vendor's entry, to leave that
   * vendor's group showing its plain vendor name (the existing default) — purely additive, no effect
   * on single-vendor creates or merges that don't supply titles.
   */
  vendorPortionTitles?: VendorPortionTitle[];
  /**
   * Optional admin-edited line items to persist directly on create, making a "create + apply edits"
   * save one atomic call (no fragile create-then-update). When omitted, the backend persists its own
   * computed default pricing. Same per-line shape as the update endpoint.
   */
  lineItems?: UpdateCustomerEstimateLineItemRequest[];
  /**
   * How to proceed when the computed customer total is under the customer's dynamic minimum-markup
   * policy. Omit on the first call: if under threshold, nothing is persisted and the response carries
   * `adjustmentProposal` instead. Resend this same request with this set to actually persist.
   */
  markupAdjustmentDecision?: MarkupAdjustmentDecision;
  /** Admin-supplied replacement line items, used when `markupAdjustmentDecision` is `ManualOverride`. */
  markupOverrideLineItems?: UpdateCustomerEstimateLineItemRequest[];
}

/** Request to preview a merged customer estimate from multiple vendor estimates. */
export interface PreviewMultiVendorCustomerEstimateRequest {
  vendorEstimateKeys: string[];
}

/** One vendor's optional portion title within a multi-vendor merge. See `CreateCustomerEstimateRequest.vendorPortionTitles`. */
export interface VendorPortionTitle {
  vendorEstimateKey: string;
  portionTitle?: string;
}

export interface CreateCustomerEstimateResponse {
  customerEstimateKey: string;
  lineItems: CustomerEstimateLineItem[];
  vendorTotal: number;
  customerTotal: number;
  message: string;
  /**
   * NEW (optional) - if the backend inserts an "Admin Fee" JobSalesInvoiceDetail row at
   * creation time (per docs/Customer-Markup-API-Documentation.md), it should return that
   * row's DetailKey here so the frontend can seed `adminMarkupLineItemKey` immediately
   * instead of treating the first edit-triggered save as a brand new insert (which would
   * otherwise create a duplicate Admin Fee row).
   */
  adminMarkupLineItemKey?: string;
  /**
   * Populated (with nothing else on this response persisted — `customerEstimateKey` is empty) when the
   * computed customer total is under the customer's dynamic minimum-markup policy and no
   * `markupAdjustmentDecision` was supplied on the request. Null/absent when within threshold, or when a
   * decision was supplied and the save proceeded.
   */
  adjustmentProposal?: DynMinMarkupAdjustmentProposal | null;
}

/**
 * A job's customer-estimate history for the tabbed modal: the current live estimate plus, if the
 * current one superseded an earlier estimate, a read-only summary of the immediately-previous
 * (archived) version. One level of history is retained. Either field may be null.
 */
export interface CustomerEstimateHistoryResponse {
  current: CreateCustomerEstimateResponse | null;
  previous: ArchivedCustomerEstimateSummary | null;
}

/**
 * Read-only snapshot of an archived (superseded) customer estimate. Customer-side pricing only —
 * vendor comparison fields are not archived, so the frontend renders this tab read-only with the
 * vendor columns hidden.
 */
export interface ArchivedCustomerEstimateSummary {
  customerEstimateKey: string;
  estimateTitle: string | null;
  createdDate: string | null;
  wasSentToCustomer: boolean;
  customerTotal: number;
  lineItems: ArchivedCustomerEstimateLineItem[];
}

export interface ArchivedCustomerEstimateLineItem {
  chargeType: string;
  description: string;
  customerRate: number;
  customerQty: number;
  customerAmount: number;
  costIncurred: number;
}

export interface CustomerEstimateLineItem {
  chargeType: string;
  chargeTypeKey: string;
  description: string;

  // Vendor pricing
  vendorRate: number;
  vendorQty: number;
  vendorAmount: number;
  
  // Customer pricing
  customerRate: number;
  customerQty: number;
  customerAmount: number;
  
  // Markup analysis
  calculatedMarkupPercent: number;  // Actual markup achieved
  profileMarkupPercent?: number;    // Target markup from customer profile (Materials: customer.MaterialMarkUp, Labor/Trip: customer.LaborAndTrip)
  
  // Labor hour adjustment (only for labor items)
  originalHours?: number;
  adjustedHours?: number;
  wasHourAdjusted: boolean;
  techCount?: number;
  
  // Metadata
  lineType: 'labor' | 'material' | 'trip' | 'custom';
  costIncurred: number;
  displayLevel?: number;

  /** True for ad-hoc charges added by an admin directly on the customer estimate (no vendor-side counterpart). */
  isCustomLineItem?: boolean;
  
  // Keys for linking to database records
  customerEstimateDetailKey?: string;  // REQUIRED for updates - Links to JobSalesInvoiceDetail.DetailKey
  vendorEstimateDetailKey?: string;    // Links to vendor material/trip estimate
  vendorEstimateLaborKey?: string;     // Links to vendor labor estimate

  /**
   * The vendor estimate (VendorEstimate.InvoiceKey) this line originated from. Only populated for
   * multi-vendor merges, so the grid can group/label rows by originating vendor. Undefined for
   * single-vendor estimates.
   */
  sourceVendorEstimateKey?: string;

  /**
   * Admin-entered portion title for `sourceVendorEstimateKey`'s group (e.g. "Plumbing Portion of
   * Quote"), from JobSalesOrderToVestimate.PortionTitle. Undefined when no title was set for that
   * vendor - the grid falls back to the plain vendor name.
   */
  sourcePortionTitle?: string;
}

/**
 * Fixed set of charge types an admin can pick from when adding a custom
 * (non vendor-sourced) charge to a customer estimate. `key` is a client-side
 * slug used until the backend confirms/returns the real ChargeType GUIDs
 * (see docs/CustomerEstimate-Frontend-Integration.md - chargeTypeKey is a
 * GUID FK into a ChargeType lookup table, e.g. "Standard Hourly Rate(Tech 1)"
 * -> "FBD282B5-9B58-455B-A11F-04707561F439"). The backend update endpoint
 * needs to resolve `chargeTypeKey`/`chargeType` sent here to the matching
 * real ChargeType row when inserting the new JobSalesInvoiceDetail record.
 */
export interface CustomChargeTypeOption {
  key: string;
  label: string;
  lineType: 'labor' | 'material' | 'trip';
  techCount?: number;
  isEmergency: boolean;
}

export const CUSTOM_CHARGE_TYPE_OPTIONS: CustomChargeTypeOption[] = [
  { key: 'LABOR', label: 'Labor', lineType: 'labor', techCount: 1, isEmergency: false },
  { key: 'LABOR_TECH2', label: 'Labor (Tech 2)', lineType: 'labor', techCount: 2, isEmergency: false },
  { key: 'EMERGENCY_LABOR', label: 'Emergency Labor', lineType: 'labor', techCount: 1, isEmergency: true },
  { key: 'EMERGENCY_LABOR_TECH2', label: 'Emergency Labor (Tech 2)', lineType: 'labor', techCount: 2, isEmergency: true },
  { key: 'TRIP', label: 'Trip', lineType: 'trip', isEmergency: false },
  { key: 'EMERGENCY_TRIP', label: 'Emergency Trip', lineType: 'trip', isEmergency: true },
  { key: 'MATERIAL', label: 'Material', lineType: 'material', isEmergency: false },
];

// ──────────────────────────────────────────────────────────────
//  Send Customer Estimate Email (POST /send-customer-estimate-email)
// ──────────────────────────────────────────────────────────────

/**
 * A single line item sent to PUT /update-customer-estimate.
 * When `lineItemKey` is empty, the backend should INSERT a new
 * JobSalesInvoiceDetail row (a custom, admin-added charge) instead of
 * updating an existing one, and return the generated key so the
 * frontend can persist it for subsequent edits.
 *
 * NOTE: The frontend also appends a synthetic "Admin Fee" entry to this array
 * (chargeTypeKey: 'ADMIN_MARKUP') whenever the customer has an admin markup %
 * configured, recalculated from the CURRENT subtotal every time line items
 * change (added/removed/edited). The backend should upsert this into the
 * same "Admin Fee" JobSalesInvoiceDetail row it may already create at
 * estimate-creation time (matched by `lineItemKey` once known), rather than
 * creating a new row on every save.
 */
export interface UpdateCustomerEstimateLineItemRequest {
  lineItemKey: string;          // Existing customerEstimateDetailKey, or '' for a new custom charge
  chargeType?: string;          // Display label, e.g. "Labor", "Emergency Trip" - only meaningful for new items
  chargeTypeKey?: string;       // Client-side slug (see CUSTOM_CHARGE_TYPE_OPTIONS) - backend maps this to the real ChargeType GUID
  description?: string;
  /**
   * 0 = Incurred (already charged/completed), 1 = Proposed (work/cost not yet incurred).
   * Matches CostIncurredType and the convention used across the vendor Trip/Material/Labor
   * forms elsewhere in this app. Only meaningful for new custom charges.
   */
  costIncurred?: number;
  customerQty: number;
  customerRate: number;
  customerAmount: number;
  isNewLineItem?: boolean;      // Explicit hint mirroring `!lineItemKey`, sent for backend clarity
  /**
   * True to delete this persisted line (must have a valid, existing lineItemKey; all other fields
   * are ignored). The backend never infers a delete from a row's mere absence from this array —
   * omitting a row that used to exist does NOT remove it server-side, it just isn't touched. Edit
   * mode must explicitly send removed rows back flagged like this.
   */
  isDeleted?: boolean;
  tempIndex?: number;           // Array position at request time - echoed back in createdLineItems so the frontend can match the generated key to this row
  /**
   * Link back to the source vendor estimate detail (materials/trip detail key or labor key).
   * Echoed from the value received on preview/read so a seeded vendor line re-inserted server-side
   * keeps its vendor linkage; without it the insert nulls the key and vendor rate/qty/amount read
   * back as 0. Omit for genuine admin-added custom charges (no vendor source).
   */
  vendorEstimateDetailKey?: string;

  /**
   * The vendor estimate this line originated from, for multi-vendor merges. Echoed from
   * `CustomerEstimateLineItem.sourceVendorEstimateKey` on read so a re-saved line keeps its vendor
   * group label. Omit for single-vendor estimates.
   */
  sourceVendorEstimateKey?: string;
}

export interface UpdateCustomerEstimateRequest {
  customerEstimateKey: string;
  lineItems: UpdateCustomerEstimateLineItemRequest[];
  /** See `CreateCustomerEstimateRequest.markupAdjustmentDecision` — same propose-then-confirm semantics. */
  markupAdjustmentDecision?: MarkupAdjustmentDecision;
  /** See `CreateCustomerEstimateRequest.markupOverrideLineItems`. */
  markupOverrideLineItems?: UpdateCustomerEstimateLineItemRequest[];
}

/**
 * Backend supports insert (new custom charges), update, and delete of line items.
 * `createdLineItems` echoes back the generated key(s) for any inserted rows, matched by
 * `tempIndex`, so the frontend can store them in `customerEstimateDetailKey` for future
 * edits/saves (without this, a custom charge would be re-inserted as a duplicate on every
 * subsequent auto-save).
 */
export interface UpdateCustomerEstimateResponse {
  updatedLineItems: number;
  customerTotal: number;
  vendorTotal: number;
  markupPercent: number;
  createdLineItems?: { tempIndex: number; lineItemKey: string }[];
  deletedLineItems?: number;
  /** See `CreateCustomerEstimateResponse.adjustmentProposal` — same propose-then-confirm semantics. */
  adjustmentProposal?: DynMinMarkupAdjustmentProposal | null;
}

/** A contact that can receive the customer estimate email. */
export interface CustomerEstimateRecipient {
  contactKey: string;
  name: string | null;
  title: string | null;
  email: string | null;
  /** True for account-level contacts, false for contacts on the job's location. */
  isAccountContact: boolean;
  /** The job's default contact — pre-selected in the picker. */
  isJobDefaultContact: boolean;
}

/** GET /customer-estimate-recipients/{key} — candidate recipients, split as on the legacy compose screen. */
export interface CustomerEstimateRecipientsResponse {
  customerEstimateKey: string;
  jobKey: string;
  accountContacts: CustomerEstimateRecipient[];
  locationContacts: CustomerEstimateRecipient[];
}

/** A file that can be attached to the customer estimate email. */
export interface CustomerEstimateAttachment {
  /** JobFile.FileKey for job files, JobBillVendorUploads.UploadKey for vendor uploads. */
  fileKey: string;
  fileName: string | null;
  fileType: string | null;
  documentType: string | null;
  addedOn: string | null;
  /** Only set for vendor uploads. */
  vendorName: string | null;
  /** Short-lived secure link for previewing the file. Null when it couldn't be generated. */
  fileUrl: string | null;
}

/**
 * GET /customer-estimate-attachments/{key}. Kept in two lists because the keys address different
 * tables — jobFiles keys go to attachJobFiles, vendorFiles keys to attachVendorFiles.
 */
export interface CustomerEstimateAttachmentsResponse {
  jobFiles: CustomerEstimateAttachment[];
  vendorFiles: CustomerEstimateAttachment[];
}

/** Per-recipient outcome, so a partial send failure stays visible. */
export interface CustomerEstimateSendResult {
  contactKey: string;
  email: string;
  sent: boolean;
  message: string | null;
}

export interface SendCustomerEstimateEmailRequest {
  customerEstimateKey: string;
  /** Contacts chosen from the recipients endpoint. Preferred over customerEmail. */
  contactKeys?: string[] | null;
  /** Explicit address, for recipients that aren't saved contacts. Optional when contactKeys is set. */
  customerEmail?: string;
  customNotes?: string | null;
  ccEmails?: string[] | null;
  attachJobFiles?: string[] | null;
  attachVendorFiles?: string[] | null;
}

export interface SendCustomerEstimateEmailResponse {
  success: boolean;
  message: string;
  /** First address that received it; see results for the full picture. */
  sentToEmail: string;
  emailSubject: string;
  results: CustomerEstimateSendResult[];
  sentCount: number;
  failedCount: number;
}

// ──────────────────────────────────────────────────────────────
//  Direct Approval (POST /approve-vendor-estimate)
// ──────────────────────────────────────────────────────────────

export interface ApproveVendorEstimateRequest {
  estimateKey: string;
  bypassDneCheck?: boolean;
}

export interface ApproveVendorEstimateResponse {
  success: boolean;
  message: string;
  requiresAdditionalApproval: boolean;
  estimateKey?: string;
  jobKey?: string;
  vendorKey?: string;
  workOrderKey?: string;
  invoiceType?: number;
  /** 65% Customer DNE validation details */
  dneValidation?: {
    estimateTotal: number;
    customerDne: number;
    sixtyFivePercentThreshold: number;
    exceedsThreshold: boolean;
  };
}

// ──────────────────────────────────────────────────────────────
//  File Upload (POST /upload-files)
// ──────────────────────────────────────────────────────────────

export interface UploadEstimateFilesRequest {
  tempEstimateKey: string;
  documentTypeKey: string;
}

export interface UploadEstimateFilesResponse {
  filesUploaded: number;  // Backend returns this field name
  message: string;
  uploadedFiles: Array<{
    uploadKey: string;
    fileName: string;
    documentTypeKey: string;
  }>;
  
  // Legacy field names (for backwards compatibility)
  uploadedCount?: number;
  uploadKeys?: string[];
}

// ──────────────────────────────────────────────────────────────
//  Get Uploaded Files (GET /files/{jobKey})
// ──────────────────────────────────────────────────────────────

export interface EstimateUploadedFile {
  uploadKey: string;
  fileName: string;
  documentTypeName: string;
  uploadDate: string;
  fileType: string;
  documentTypeKey?: string;
  /** Signed URL for viewing/downloading the file directly (from BlobFileService). */
  secureUrl?: string;
}

// ──────────────────────────────────────────────────────────────
//  Get Customer DNE Calculation (GET /customer-dne/{jobKey})
// ──────────────────────────────────────────────────────────────

export interface CustomerDneCalculationResponse {
  customerDne: number;
  sixtyFivePercentAmount: number;
}

// ──────────────────────────────────────────────────────────────
//  Customer Markup (GET /customer-markups/*)
// ──────────────────────────────────────────────────────────────

export interface CustomerMarkupResponse {
  customerKey: string;
  customerName: string;
  materialMarkupPercent: number | null;
  laborAndTripMarkupPercent: number | null;
  adminMarkupPercent: number | null;
  companyEmail: string | null;
  companyPhone: string | null;
  markupStatus: 'No Markup Configured' | 'Full Markup Configured' | 'Partial Markup Configured';
}

export interface CustomerMarkupStatisticsResponse {
  totalActiveCustomers: number;
  customersWithMaterialMarkup: number;
  customersWithLaborTripMarkup: number;
  customersWithAdminMarkup: number;
  avgMaterialMarkup: number | null;
  avgLaborTripMarkup: number | null;
  avgAdminMarkup: number | null;
  minMaterialMarkup: number | null;
  maxMaterialMarkup: number | null;
  minLaborTripMarkup: number | null;
  maxLaborTripMarkup: number | null;
}

// ──────────────────────────────────────────────────────────────
//  Vendor Rates (GET /vendor-rates/*)
// ──────────────────────────────────────────────────────────────

export interface VendorRateResponse {
  vendorKey: string;
  vendorName: string | null;
  hourlyRate: number | null;
  tripCharge: number | null;
  serviceCharge: number | null;
  emergencyHourlyRate: number | null;
  emergencyTripCharge: number | null;
  emergencyServiceCharge: number | null;
  helperRates: number | null;
  emergencyHelperRates: number | null;
}

export interface VendorTradeRateResponse {
  pkey: string;
  vendorKey: string;
  vendorName: string | null;
  tradeKey: string | null;
  tradeName: string | null;
  isPrimary: boolean | null;
  hourlyRate: number | null;
  tripCharge: number | null;
  serviceCharge: number | null;
  emergencyHourlyRate: number | null;
  emergencyTripCharge: number | null;
  emergencyServiceCharge: number | null;
  helperRates: number | null;
  emergencyHelperRates: number | null;
}

/**
 * Legacy-style vendor rate result with hierarchical fallback
 * GET /api/v1/admin/on-site-approval/vendor-rates-legacy?vendorKey={guid}&tradeKey={guid}&jobTypeKey={guid}
 */
export interface VendorRateLegacyResponse {
  success: boolean;
  errorMessage: string | null;
  vendorKey: string;
  tradeKey: string | null;
  hourlyRate: number;
  tripCharge: number;
  emergencyHourlyRate: number;
  emergencyTripCharge: number;
  helperRate: number;
  emergencyHelperRate: number;
  serviceCharge: number;
  emergencyServiceCharge: number;
  rateSource: string;
}

// ──────────────────────────────────────────────────────────────
//  Edit Estimate (GET /edit-estimate/{estimateKey})
// ──────────────────────────────────────────────────────────────

export interface EditEstimateResponse {
  vendorEstimateKey: string;
  jobKey: string;
  vendorKey: string;
  jobName: string;
  locationName: string;
  vendorName: string;
  vendorDNE: number;
  customerDNE: number;
  isEmergency: number;
  tempHeader: string;  // "1" = editable, "3" = approved, "33" = deleted, "99" = blocked
  isApproved: boolean;
  invoiceDate: string;
  lineItems: EditEstimateLineItem[];
  documentTypes: {
    estimateDocLabel: string;
    estimateDocKey: string;
    signOffLabel: string;
    signOffKey: string;
    jobPicturesLabel: string;
    jobPicturesKey: string;
  };
}

export interface EditEstimateLineItem {
  detailKey: string;
  chargeTypeKey: string;
  itemName: string;
  costIncurred: number;
  description: string;
  displayLevel: string;
  rate: number;
  quantity: number;
  laborHours: number | null;
  techCount: number | null;
  isLabor: boolean;
  markNotNeededCmt: string | null;
}

// ──────────────────────────────────────────────────────────────
//  Update Estimate (PUT /update-estimate)
// ──────────────────────────────────────────────────────────────

export interface UpdateEstimateRequest {
  vendorEstimateKey: string;
  jobKey: string;
  vendorKey: string;
  lineItems: UpdateEstimateLineItem[];
}

export interface UpdateEstimateLineItem {
  detailKey: string;  // Existing GUID or "00000000-0000-0000-0000-000000000000" for new items
  chargeTypeKey: string;
  itemName: string;
  costIncurred: number;
  description: string;
  displayLevel: string;
  rate: number;
  quantity: number;
  isLabor: boolean;
  laborHours?: number | null;
  techCount?: number | null;
}

export interface UpdateEstimateResponse {
  invoiceKey: string;
  archiveInvoiceKey: string;
  archiveVersion: number;
  message: string;
}

// ──────────────────────────────────────────────────────────────
//  Client-side wizard state
// ──────────────────────────────────────────────────────────────

export interface OnSiteEstimateWizardState {
  /** Current step (1=trip, 2=materials, 3=labor, 4=review) */
  currentStep: number;
  
  /** Initialization data from backend */
  initData: OnSiteEstimateInitResponse | null;
  
  /** All line items collected so far */
  lineItems: (TripChargeLineItem | MaterialLineItem | LaborLineItem)[];
  
  /** Uploaded files */
  uploadedFiles: EstimateUploadedFile[];
  
  /** Calculated total */
  estimateTotal: number;
  
  /** Saved estimate key (after save-estimate call) */
  savedEstimateKey: string | null;
}

// ──────────────────────────────────────────────────────────────
//  Additional Approval Workflow
// ──────────────────────────────────────────────────────────────

export interface SaveVendorApprovalDataRequest {
  jobKey: string;
  vendorKey: string;
  estimateKey: string;
  fifthApprovalOption: number; // 1=SetReturnETA, 2=Checkout, 4=CreateInvoice, 5=SaveAndClose
  approvalText: string;
}

export interface SaveVendorApprovalDataResponse {
  success: boolean;
  message: string;
  workOrderKey: string;
  invoiceType: number;
  requiresEmail: boolean;
}

export interface CheckBeforeActionRequest {
  jobKey: string;
  vendorKey: string;
}

export interface CheckBeforeActionResponse {
  canProceed: boolean;
  message: string;
  tempHeader?: string; // "1" if checked in, "2" if checked out
}

export interface SaveTechCheckInRequest {
  jobKey: string;
  vendorKey: string;
  checkInDateTime: string;
  techCount: number;
}

export interface SaveTechCheckOutRequest {
  checkInKey: string;
  checkOutDateTime: string;
  workPerformed: string;
}

export interface VendorContactDTO {
  contactKey: string;
  name: string;
  email: string;
  isDefault: boolean;
}

export interface EmailWorkOrderComposeResponse {
  workOrderKey: string;
  jobKey: string;
  vendorKey: string;
  invoiceType: number;
  jobStatusTrigger: number;
  jobPO: string;
  emailBody: string;
  jobDefaultContactKey: string;
  vendorContactList: VendorContactDTO[];
}

export interface SendWorkOrderEmailRequest {
  workOrderKey: string;
  jobKey: string;
  vendorKey: string;
  invoiceType: number;
  jobStatusTrigger: number;
  recipientEmails: string[];
  emailBody: string;
  attachedFileKeys?: string[];
  useAdminEmail?: boolean;
}

export interface SendWorkOrderEmailResponse {
  success: boolean;
  emailsSent: number;
  message: string;
  jobStatusUpdated: boolean;
  newJobStatus: string | null;
}
