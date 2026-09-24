/**
 * Assign Vendor Tab — TypeScript interfaces.
 * Matches Layer 1 C# DTOs in AssignVendorTabDTO.cs and AdminJobVendorDTO.cs exactly.
 *
 * The API wrapper shape mirrors the C# ApiResponse<T> class (camelCase serialized).
 * The existing ApiResponse in vendor.model.ts uses "success"; this one uses "status"
 * to match what the .NET controller actually returns.
 */

// ──────────────────────────────────────────────────────────────
//  Generic API response wrapper (matches C# ApiResponse<T>)
// ──────────────────────────────────────────────────────────────

export interface AssignVendorApiResponse<T = unknown> {
  status: boolean;
  responseCode: number;
  message: string;
  data: T;
  details: ApiErrorDetail[];
  unixTime: number;
  traceId: string | null;
  /**
   * Populated only when this object is synthesized by {@link AssignVendorService} from an HTTP failure
   * (not returned by the API on success paths).
   */
  clientOperation?: string;
  /** Request URL Angular used (from {@link HttpErrorResponse.url}) for correlating failures without DevTools. */
  requestUrl?: string | null;
  /** Whether `Authorization: Bearer` was attached by the client interceptor for this logical call. */
  authorizationSent?: boolean;
}

export interface ApiErrorDetail {
  message: string;
  code: string | null;
  field: string | null;
}

/** Matches Job Ops {@code OnlyJobKeyVendorKey} — POST check-if-consolidator / send-mail-qc-manager-consolidator-dispatch */
export interface OnlyJobKeyVendorKeyRequest {
  jobKey: string;
  vendorKey: string;
}

// ──────────────────────────────────────────────────────────────
//  SRS 4.1 — Page Initialization Response (AssignVendorPageDto)
// ──────────────────────────────────────────────────────────────

export interface AssignVendorPage {
  jobKey: string;
  jobName: string;
  locationKey: string | null;
  tradeKey: string | null;
  jobTypeKey: string | null;
  customerKey: string | null;
  tradeName: string | null;
  /** Composite: "TradeName,CityName,StateName,ZIPcode" */
  locationDetail: string | null;
  /** 0 = not from customer, 1 = from customer */
  fromCustomer: number;
  /** Minutes elapsed since job creation */
  minutesLeft: number;
  /** 0 = no primary vendor, 1 = primary vendor exists */
  isPrimary: number;
  /** Primary vendor GUID (empty GUID string when none) */
  primaryVendorKey: string;
  /** 0 = never assigned, 1 = previously assigned */
  primaryVendorAlreadyAssignedOnce: number;
  /** Flash message displayed on page load */
  message: string | null;
  /** Highlight: new estimate exists */
  isNewEstimate: boolean;
  /** Highlight: new note exists */
  isNewNote: boolean;
  /** Highlight: new file/attachment exists */
  isNewFileAndAttachment: boolean;
}

// ──────────────────────────────────────────────────────────────
//  Customer profile DNE (Edit Customer / CustomerProfile API)
// ──────────────────────────────────────────────────────────────

/** DNE values from <c>api/CustomerProfile/dne/{customerKey}</c>. */
export interface CustomerProfileDne {
  customerKey: string;
  customerDne: number;
  vendorDne: number;
  vendorEmergencyDne: number;
  emergencyCustomerDne: number;
}

// ──────────────────────────────────────────────────────────────
//  Job Header Detail (mirrors ProjectRCS GetJobHeaderDetail
//  + GetServiceRequestForJob)
// ──────────────────────────────────────────────────────────────

export interface JobHeaderDetail {
  // Job Information
  accountManagerKey: string | null;
  accountManagerName: string | null;
  entryDate: string | null;
  completionDate: string | null;

  // Job Core
  po: string | null;
  /** Job.JobStatusKey — the job's own current status, independent of any per-vendor status. */
  jobStatusKey: string | null;
  /** JobStatus.TriggerBit for the job's own current status — drives status-gated actions like Recall. */
  jobStatusTriggerBit: number | null;
  jobStatusName: string | null;
  /** Selected job priority (JobType) key — drives the Priority dropdown. */
  jobTypeKey: string | null;
  jobTypeName: string | null;
  /** Job trade (e.g. "Electrical / Lighting") — added to the API for Accounting V2's Job Details panel. */
  tradeKey: string | null;
  tradeName: string | null;
  customerDne: string | null;
  revCustomerDne: string | null;
  /** Standard customer DNE from the customer profile. */
  customerProfileCustomerDne: string | null;
  /** Emergency customer DNE from the customer profile. */
  customerProfileEmergencyCustomerDne: string | null;
  /** Standard vendor DNE from the customer profile. */
  customerProfileVendorDne: string | null;
  /** Emergency vendor DNE from the customer profile. */
  customerProfileVendorEmergencyDne: string | null;
  /** Job-level vendor DNE at creation — mirrors Job.VendorDne. */
  vendorDne: string | null;
  /** Job-level revised vendor DNE — mirrors Job.RevVendorDne. */
  revVendorDne: string | null;
  serviceRequest: string | null;
  serviceRequestPreview: string | null;

  // Customer
  customerName: string | null;
  customerContactName: string | null;
  customerContactTitle: string | null;
  customerContactEmail: string | null;
  customerContactPhone: string | null;
  customerContactPhoneExt: string | null;
  customerContactAltPhone: string | null;
  customerContactAltPhoneExt: string | null;
  hasCustomerContract: boolean;
  customerContractKey: string | null;
  customerNotice: string | null;
  /** Selected requestor contact key — drives the Customer Requestor dropdown. */
  customerRequestorKey: string | null;
  /** Display name for the selected requestor, e.g. "Jane Doe (Customer)". */
  customerRequestorName: string | null;

  // Location
  locationName: string | null;
  locationAddress: string | null;
  locationAddress2: string | null;
  cityName: string | null;
  stateName: string | null;
  zipCode: string | null;
  locationPhone: string | null;
  locationContactName: string | null;
  locationContactTitle: string | null;
  locationContactEmail: string | null;
  locationContactPhone: string | null;
  locationContactPhoneExt: string | null;
  locationContactAltPhone: string | null;
  locationContactAltPhoneExt: string | null;
  /** Weekly business hours for the location — shown in the store hours panel. */
  storeHours?: StoreHoursEntry[] | null;

  // Additional text panels
  specialInstruction?: string | null;
  locationSpecialInstruction?: string | null;
  additionalApproval?: string | null;

  // Assigned Vendors
  assignedVendors: AssignedVendorDetail[];
}

/** One row in the store hours panel (e.g. { day: "Monday", hours: "9:00 AM – 8:00 PM" }). */
export interface StoreHoursEntry {
  day: string;
  hours: string;
}

export interface AssignedVendorDetail {
  jobVendorKey: string;
  vendorKey: string;
  vendorName: string | null;
  isDefault: boolean;
  jobStatusKey: string | null;
  jobStatusName: string | null;
  vendorDne: number | null;
  revVendorDne: number | null;
  /** Pre-formatted with timezone */
  scheduleDate: string | null;
  /** Location wall time (YYYY-MM-DDTHH:mm) at service location for datetime-local editing */
  scheduleDateIso: string | null;
  /** Pre-formatted with timezone */
  returnScheduleDate: string | null;
  /** Location wall time (YYYY-MM-DDTHH:mm) at service location for datetime-local editing */
  returnScheduleDateIso: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactPhoneExt: string | null;
  contactAltPhone: string | null;
  contactAltPhoneExt: string | null;
  hasEstimate: boolean;
  /** True when this vendor has an approved estimate (estimating checkout → return ETA path). */
  hasApprovedEstimate?: boolean;
  /** True when an active VendorCheckInOut row exists for this vendor+job. */
  isCheckedIn: boolean;
  /** CheckinKey of the active check-in row; null when not checked in. */
  activeCheckinKey: string | null;
  /** JobStatus.TriggerBit — drives which status action buttons are shown. */
  triggerBit: number | null;
  /** Status-specific vendor action buttons from the API (mirrors legacy TriggerBit rules). */
  statusActions: VendorStatusAction[];
  /** Current schedule ETA confirmed by admin (legacy "Admin confirmed ETA"). */
  etaConfirmedByAdmin?: boolean;
  /** Current schedule ETA confirmed by vendor/tech. */
  etaConfirmedByVendor?: boolean;
  /** Current return schedule confirmed by admin. */
  returnEtaConfirmedByAdmin?: boolean;
  /** Current return schedule confirmed by vendor/tech. */
  returnEtaConfirmedByVendor?: boolean;
  /** True when vendor has been unassigned/deleted from this job. */
  isDelete?: boolean;
  /** Admin key who deleted/unassigned this vendor. */
  deletedBy?: string | null;
  /** Timestamp when vendor was deleted/unassigned. */
  deletedOn?: string | null;
}

export interface VendorEstimateListGroup {
  invoiceKey: string;
  totalAmount?: number | null;
}

export interface VendorEstimateListResult {
  estimates: VendorEstimateListGroup[];
}

/** One vendor-card footer action returned by job-header-detail API. */
export interface VendorStatusAction {
  actionId: string;
  label: string;
  variant: 'primary' | 'outline' | 'info';
  isStatusLabel: boolean;
  /** Legacy emailType for SendVendorMails when applicable. */
  emailType?: number | null;
}

// ──────────────────────────────────────────────────────────────
//  Vendor status action (SendVendorMails port)
// ──────────────────────────────────────────────────────────────

export interface VendorActionContact {
  contactKey: string;
  vendorKey: string;
  cname: string;
  title?: string | null;
  phone?: string | null;
  email?: string | null;
  isDefault: boolean;
}

export interface VendorActionCustomerContact {
  contactKey: string;
  cname: string;
  email?: string | null;
  isDefault: boolean;
}

export interface VendorActionEstimateOption {
  estimateKey: string;
  label: string;
  total: number;
}

export interface VendorActionMailContext {
  emailType: number;
  modalTitle: string;
  defaultEmailNote: string;
  warningMessage?: string | null;
  requiresEstimateSelection: boolean;
  allowNoEstimateSelection: boolean;
  contacts: VendorActionContact[];
  estimates: VendorActionEstimateOption[];
  po?: string | null;
}

export interface SendVendorActionMailRequest {
  jobVendorKey: string;
  emailType: number;
  emailNote?: string | null;
  vendorContactKeys?: string[] | null;
  customEmail?: string | null;
  estimateKey?: string | null;
}

export interface ConfirmEtaManuallyRequest {
  jobVendorKey: string;
  confirmedDate: string;
  comment?: string | null;
}

export interface VendorEstimateNavigation {
  flag: number;
  jobKey: string;
  estimateKey?: string | null;
  navigationPath: string;
}

export interface LatestCustomerEstimate {
  hasEstimate: boolean;
  customerEstimateKey?: string | null;
  navigationPath: string;
}

export interface ApproveVendorContext {
  hasWorkOrder: boolean;
  revVendorDne?: number | null;
  vendorDne?: number | null;
  workOrderKey?: string | null;
  description?: string | null;
  estimates: VendorActionEstimateOption[];
  contacts: VendorActionContact[];
}

export interface SendAdditionalApprovalRequest {
  jobVendorKey: string;
  emailNote?: string | null;
  vendorContactKeys?: string[] | null;
  customEmail?: string | null;
  revVendorDne: number;
  vendorDne: number;
  approvalText: string;
  workOrderKey: string;
  estimateKey?: string | null;
}

export interface SetVendorEstimateApprovedRequest {
  jobVendorKey: string;
  estimateKey: string;
}

export interface SetVendorEstimateApprovedResult {
  flag: number;
  requiresAdditionalApproval: boolean;
}

export interface CustomerReminderContext {
  modalTitle: string;
  defaultEmailNote: string;
  po?: string | null;
  contacts: VendorActionCustomerContact[];
}

export interface SendCustomerReminderRequest {
  jobVendorKey: string;
  emailNote?: string | null;
  customerContactKeys?: string[] | null;
  customEmail?: string | null;
}

// ──────────────────────────────────────────────────────────────
//  Admin Check-In / Check-Out DTOs
// ──────────────────────────────────────────────────────────────

export interface AdminCheckInStatusDto {
  isCheckedIn: boolean;
  activeCheckinKey: string | null;
  currentTriggerBit: number | null;
}

export interface AdminCheckInResultDto {
  checkinKey: string;
  /** 4 = first visit, 17 = return visit */
  triggerBit: number;
}

export interface AdminSaveCheckInRequest {
  jobVendorKey: string;
  /** UTC ISO string */
  checkInDate: string;
  noOfTech: number;
}

export interface AdminSendCheckoutEmailRequest {
  jobVendorKey: string;
  emailNote?: string | null;
  vendorContactKeys?: string[] | null;
  customEmail?: string | null;
}

export interface AdminSaveCheckOutRequest {
  jobVendorKey: string;
  /** 5=COMPLETE, 6=ESTIMATING, 7=NOT COMPLETE, 8=ORDERING MATERIALS */
  checkoutStatus: number;
  workPerformed: boolean;
  workDetails?: string | null;
  /** UTC ISO string */
  checkOutDate: string;
}

// ──────────────────────────────────────────────────────────────
//  Job Status Option (for dropdowns)
// ──────────────────────────────────────────────────────────────

export interface JobStatusOption {
  text: string | null;
  value: string;
}

/** One option in the Customer Requestor dropdown. Matches C# CustomerRequestorOptionDto. */
export interface CustomerRequestorOption {
  text: string;
  value: string;
}

/** One option in the Account Manager dropdown. Matches C# AccountManagerOptionDto. */
export interface AccountManagerOption {
  text: string;
  value: string;
}

/** One option in the Job Priority dropdown. Same shape as AccountManagerOptionDto. */
export type JobPriorityOption = AccountManagerOption;

/** GET job-priority-vendor-check — whether priority can be changed on this job. */
export interface JobPriorityVendorCheck {
  hasVendors: boolean;
  vendorCount: number;
  workOrderSent: boolean;
  canChangePriority: boolean;
  blockMessage: string | null;
}

/**
 * GET job-priority-change-preview — confirmation modal payload.
 * Priority change no longer touches DNE or response time (it only flips JobTypeKey and
 * logs a note) — the backend stopped populating the DNE/response-time fields below. They
 * stay optional here only so the unreachable legacy preview UI in
 * features/job/assign-vendor/assign-vendor.component.ts (dead code — no template element
 * there triggers onJobPriorityChange/jobPriorityChangeModalOpen; see job-details-accordion
 * for the live implementation) still compiles; do not populate or rely on them.
 */
export interface JobPriorityChangePreview {
  success: boolean;
  message: string | null;
  hasVendors: boolean;
  vendorCount: number;
  bulletPoints: string[];
  oldPriorityName: string | null;
  newPriorityName: string | null;
  oldJobTypeKey?: string | null;
  newJobTypeKey?: string | null;
  /** @deprecated no longer populated by the backend */
  oldCustomerDne?: number;
  /** @deprecated no longer populated by the backend */
  newCustomerDne?: number;
  /** @deprecated no longer populated by the backend */
  oldVendorDne?: number;
  /** @deprecated no longer populated by the backend */
  newVendorDne?: number;
  /** @deprecated no longer populated by the backend */
  oldResponseTime?: string | null;
  /** @deprecated no longer populated by the backend */
  newResponseTime?: string | null;
  /** @deprecated no longer populated by the backend */
  customerDneChanged?: boolean;
  /** @deprecated no longer populated by the backend */
  vendorDneChanged?: boolean;
}

// ──────────────────────────────────────────────────────────────
//  SRS 4.2 — Vendor List Item (VendorListItemDto)
// ──────────────────────────────────────────────────────────────

export interface VendorListItem {
  vendorKey: string;
  jobKey: string | null;
  vname: string | null;
  address: string | null;
  contactName: string | null;
  email: string | null;
  /** Formatted as "tel:1XXXXXXXXXX" */
  phone: string | null;
  altPhone: string | null;
  phoneEXT: string | null;
  altPhoneEXT: string | null;
  /** Comma-separated trade names */
  tName: string | null;
  radiusInMiles: number;
  /** Haversine distance from job location in miles */
  distanceFromLocation: number;
  /** Count of completed vendor invoices */
  jobCount: number;
  /** True when vendor is flagged Do-Not-Use */
  dnUenabled: boolean;
  /** "CONTRACT" when registered; empty otherwise */
  registerLink: string | null;
  /** Total number of trades the vendor covers */
  noOfTrade: number;
  /** Hex colour for vendor status dot */
  vendorStatColor: string | null;
  /** Vendor status name (e.g. "New", "Neutral") */
  vendorStatName: string | null;
  isPrimaryVendor: boolean;
  /** True when vendor has Subcontracting == true */
  isFullConsolidator: boolean;
  /** True when RadiusInMiles > 200 or broad coverage */
  isPossibleConsolidator: boolean;
  /** Vendor registration date formatted as MM/dd/yyyy */
  enteredDate?: string | null;
  /** Standard service call minimum from VendorRequest */
  serviceCallMinimum?: number | null;
  /** Raw VendorLabel from JobStatus (may contain HTML img tag) */
  vendorLabel?: string | null;
  /**
   * Optional consolidator nvarchar when Job Ops includes it on vendor-list DTOs (e.g. all-vendors).
   * Same meaning as {@link LocationHistoryVendor#consolidator}; grid shows {@code --} when absent or {@code Not Consolidator}.
   */
  consolidator?: string | null;
  /** Score (for score type column) — populated from scorecard job_specific_score */
  score?: number | null;
  /** Score letter (A/B/C/D/F for score type column) */
  scoreLetter?: string | null;
  /** Score color (hex for score type column arc) */
  scoreColor?: string | null;
  /** Scorecard score_tier: 'excellent' | 'good' | 'average' | 'needs_improvement' | 'N/A' */
  scoreTier?: string | null;
  /** Workload flag — non-null when vendor has ≥5 active jobs */
  workloadFlag?: VendorWorkloadFlag | null;
  /** Pillar scores breakdown for tooltip */
  pillarScores?: Record<string, { score: number; weight: number }> | null;
  /** 1-based scorecard rank (0 = N/A) */
  scoreRank?: number | null;
  /** Completed jobs count from scorecard */
  completedJobs?: number | null;
  /** Human-readable scorecard flags */
  scoreFlags?: string[] | null;
  /** 0–100 signal-based fit composite for N/A vendors (< 5 completed jobs) */
  unscoredRankScore?: number | null;
  /** Individual signal scores (distance, llm_job_fit, trade_match, etc.) */
  signalScores?: Record<string, number> | null;
  /** LLM fit explanation for N/A vendors */
  llmReasoning?: string | null;
}

/**
 * Maps {@link VendorListItem} (e.g. vendors-trade-radius API) to {@link LocationHistoryVendor}
 * so the default vendor grid columns and row actions match vendors-in-radius / SP-backed lists.
 */
export function mapVendorListItemToLocationHistoryVendor(v: VendorListItem): LocationHistoryVendor {
  return {
    dnUenabled: v.dnUenabled,
    phone: v.phone,
    phoneEXT: v.phoneEXT,
    altPhoneEXT: v.altPhoneEXT,
    altPhone: v.altPhone,
    email: v.email,
    contactName: v.contactName,
    jobCount: v.jobCount,
    distanceFromLocation: v.distanceFromLocation,
    registerLink: v.registerLink,
    vendorAddress: v.address,
    radiusInMiles: v.radiusInMiles,
    tradeList: v.tName,
    vendorLabel: v.vendorLabel ?? null,
    vendorKey: v.vendorKey,
    noOfTrade: v.noOfTrade != null ? String(v.noOfTrade) : null,
    jobKey: v.jobKey,
    contactKey: null,
    enteredDate: v.enteredDate ?? null,
    serviceCallMinimum: v.serviceCallMinimum ?? null,
    highCost: null,
    vendorStat: null,
    vendorName: v.vname,
    /** Align vendor-name column badges with neutral/new/DNU styling from the list DTO. */
    vCategory: v.vendorStatName ?? null,
    vCategorycolor: v.vendorStatColor ?? null,
    /** Match JobVendorObjectForLocationHistory / SP rows: non-primary uses '-' so vendor-name badges behave like vendors-in-radius. */
    primaryVendorMarker: v.isPrimaryVendor ? 'PRIMARY' : '-',
    remarks: null,
    isVendorAssigned: null,
    pinKey: null,
    noMaybe: null,
    /** Discovery lists do not expose job-vendor status; keep null like vendors-in-radius rows. */
    statusName: null,
    isDelete: null,
    isDefault: null,
    vendorLoginLink: null,
    jobVendorKey: null,
    workorderEmailSent: null,
    latestVNote: null,
    consolidator: v.consolidator ?? null,
    fullConsolidator: v.isFullConsolidator,
    possibleConsolidator: v.isPossibleConsolidator,
    score: v.score ?? null,
    scoreLetter: v.scoreLetter ?? null,
    scoreColor: v.scoreColor ?? null,
    unscoredRankScore: v.unscoredRankScore ?? null,
    signalScores: v.signalScores ?? null,
    llmReasoning: v.llmReasoning ?? null,
  };
}

// ──────────────────────────────────────────────────────────────
//  Location History — Vendors Who Previously Serviced This Location
//  (Maps to JobVendorObjectForLocationHistory from the SP
//   dbo.JobVendorGetVENDORSservicedInThisLocation)
// ──────────────────────────────────────────────────────────────

export interface LocationHistoryVendor {
  dnUenabled: boolean | null;
  phone: string | null;
  phoneEXT: string | null;
  altPhoneEXT: string | null;
  altPhone: string | null;
  email: string | null;
  contactName: string | null;
  jobCount: number | null;
  distanceFromLocation: number | null;
  registerLink: string | null;
  vendorAddress: string | null;
  radiusInMiles: number | null;
  tradeList: string | null;
  /** Raw HTML img tag from JobStatus */
  vendorLabel: string | null;
  vendorKey: string | null;
  noOfTrade: string | null;
  jobKey: string | null;
  contactKey: string | null;
  enteredDate: string | null;
  serviceCallMinimum: number | null;
  highCost: string | null;
  vendorStat: number | null;
  /** Clean vendor display name (no embedded badge keywords) */
  vendorName: string | null;
  /** Vendor category label for badge display */
  vCategory: string | null;
  /** Hex colour for the VCategory badge */
  vCategorycolor: string | null;
  /** Primary vendor marker from SP — display PRIMARY badge when not '-' */
  primaryVendorMarker: string | null;
  /** Remarks from the pinned vendors SP */
  remarks: string | null;
  /** Whether the vendor is already assigned to the job */
  isVendorAssigned: boolean | null;
  /** Primary key of JobVendorPin — used for single-row Unpin (pinned vendors only) */
  pinKey: string | null;
  /** Pin choice from JobVendorPin — "No" or "Maybe" (pinned vendors only) */
  noMaybe: string | null;
  /** Job-vendor status name (assigned vendors SP) */
  statusName: string | null;
  /** Soft-delete flag for the job-vendor row */
  isDelete: boolean | null;
  /** Whether this vendor is the default for the job */
  isDefault: boolean | null;
  /** Vendor portal login URL */
  vendorLoginLink: string | null;
  /** Primary key of the JobVendor row (PKey from assigned vendors SP) */
  jobVendorKey: string | null;
  /** Whether work order email was sent (0/1 or count) */
  workorderEmailSent: number | null;
  /** Latest vendor note text from SP */
  latestVNote: string | null;
  /**
   * Consolidator text from vendor-list stored procedures (nvarchar(MAX) via Job Ops API).
   * Shown as plain text under the company name in the shared grid {@code vendor-name} cell.
   */
  consolidator?: string | null;
  /** SP / DTO full flag (used elsewhere, e.g. row styling / modals). */
  fullConsolidator?: boolean | null;
  /** SP / DTO possible flag (used elsewhere, e.g. row styling / modals). */
  possibleConsolidator?: boolean | null;
  /** Score (for score type column) — populated from scorecard job_specific_score */
  score?: number | null;
  /** Score letter (A/B/C/D/F for score type column) */
  scoreLetter?: string | null;
  /** Score color (hex for score type column arc) */
  scoreColor?: string | null;
  /** Scorecard score_tier: 'excellent' | 'good' | 'average' | 'needs_improvement' | 'N/A' */
  scoreTier?: string | null;
  /** Workload flag — non-null when vendor has ≥5 active jobs */
  workloadFlag?: VendorWorkloadFlag | null;
  /** Pillar scores breakdown for tooltip */
  pillarScores?: Record<string, { score: number; weight: number }> | null;
  /** 1-based scorecard rank (0 = N/A) */
  scoreRank?: number | null;
  /** Completed jobs count from scorecard */
  completedJobs?: number | null;
  /** Human-readable scorecard flags */
  scoreFlags?: string[] | null;
  /** 0–100 signal-based fit composite for N/A vendors (< 5 completed jobs) */
  unscoredRankScore?: number | null;
  /** Individual signal scores (distance, llm_job_fit, trade_match, etc.) */
  signalScores?: Record<string, number> | null;
  /** LLM fit explanation for N/A vendors */
  llmReasoning?: string | null;
}

// ──────────────────────────────────────────────────────────────
//  SRS 4.3 — Assigned Vendor Item (AssignedVendorDto)
// ──────────────────────────────────────────────────────────────

export interface AssignedVendorItem extends VendorListItem {
  /** PKey from the JobVendor table */
  jobVendorKey: string;
  isDefault: boolean;
  workOrderSent: boolean;
  workOrderKey: string | null;
  workOrderSentDate: string | null;
  /** Current job-vendor status label */
  status: string | null;
  /** True when JobVendor.IsDelete == false */
  isActive: boolean;
  /** URL to vendor portal login */
  vendorLoginLink: string | null;
}

// ──────────────────────────────────────────────────────────────
//  SRS 12 — Pinned Vendor Display DTO (PinnedVendorDto)
// ──────────────────────────────────────────────────────────────

export interface PinnedVendorItem extends VendorListItem {
  /** PKey from JobVendorPin — used for unpin calls */
  pinKey: string;
  /** "No" or "Maybe" */
  noMaybe: string | null;
  /** User-entered pin note text */
  specialNotes: string | null;
}

// ──────────────────────────────────────────────────────────────
//  SRS 4.9 — Quick Vendor Creation Request (QuickVendorRequest)
// ──────────────────────────────────────────────────────────────

export interface QuickVendorRequest {
  companyName: string;
  contactName: string;
  companyemail: string;
  contactemail: string;
  phone: string;
  address: string;
  address1?: string | null;
  stateKey: number;
  cityKey: number;
  zip: string;
  tradeKey: string;
  flatTrip: number;
  standardHourly: number;
  helperStandard: number;
  emergencyFlat: number;
  emergencyStandard: number;
  emergencyHelper: number;
  wcom: boolean;
  genL: boolean;
  accName?: string | null;
  accEmail?: string | null;
  accPhone?: string | null;
}

// ──────────────────────────────────────────────────────────────
//  SRS 21.3 — Vendor Note Item (VendorNoteDTO)
// ──────────────────────────────────────────────────────────────

export interface VendorNoteItem {
  noteKey: string;
  vendorKey: string;
  title: string | null;
  /** HTML content from Summernote editor */
  comment: string | null;
  addedOn: string | null;
  addedBy: string | null;
}

// ──────────────────────────────────────────────────────────────
//  SRS 21.4 — Save / Update Vendor Note Request
// ──────────────────────────────────────────────────────────────

export interface SaveVendorNoteRequest {
  /** Optional for new notes (newNote == 1); required for edits (newNote == 0) */
  noteKey?: string | null;
  vendorKey: string;
  noteTitle: string | null;
  /** Rich-text HTML from the editor */
  notesDetail: string | null;
  /** 1 = create new, 0 = update existing */
  newNote: number;
}

// ──────────────────────────────────────────────────────────────
//  POST save-general-admin-note — Admin action log on the job (AdminJobVendorController)
// ──────────────────────────────────────────────────────────────

/** Request body for POST /api/v1/admin/job-vendor/save-general-admin-note (C# SaveGeneralAdminNoteRequest). */
export interface SaveGeneralAdminNoteRequest {
  jobKey: string;
  title: string;
  comment: string;
}

// ──────────────────────────────────────────────────────────────
//  SRS 23.5 — Add Pinned Vendor Request (AddPinnedVendorRequest)
// ──────────────────────────────────────────────────────────────

export interface AddPinnedVendorRequest {
  jobKey: string;
  vendorKey: string;
  /** "No" or "Maybe" — maps to API property No */
  no: string;
  notes?: string | null;
}

// ──────────────────────────────────────────────────────────────
//  SRS 23.8 — Duplicate Vendor Check Request
// ──────────────────────────────────────────────────────────────

export interface CheckDuplicateVendorRequest {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}

// ──────────────────────────────────────────────────────────────
//  DataReturnDTO (from AdminJobVendorDTO.cs)
// ──────────────────────────────────────────────────────────────

export interface DataReturn {
  flag: number;
  message: string;
  key: string | null;
  vendorKey: string | null;
  workOrderKey?: string | null;
  jobStatusKey?: string | null;
  jobStatusName?: string | null;
  triggerBit?: number | null;
  statusActions?: VendorStatusAction[] | null;
  etaConfirmedByAdmin?: boolean;
  etaConfirmedByVendor?: boolean;
  returnEtaConfirmedByAdmin?: boolean;
  returnEtaConfirmedByVendor?: boolean;
}

// ──────────────────────────────────────────────────────────────
//  Vendor Dropdown Option (VendorContactDropdownItem)
// ──────────────────────────────────────────────────────────────

export interface VendorDropdownOption {
  text: string;
  value: string;
  /** Consolidator label from Job Ops dropdown API (e.g. Full Consolidator, Possible consolidator, --). */
  consolidator?: string | null;
}

// ──────────────────────────────────────────────────────────────
//  Vendor Contact Option (VendorContactDropdownItem with isDefault)
// ──────────────────────────────────────────────────────────────

export interface VendorContactOption {
  text: string;
  value: string;
  isDefault: boolean;
  /** Contact email — used by the Send Login Email modal. */
  email: string | null;
}

/** Request body for POST send-vendor-login-email. */
export interface SendVendorLoginEmailRequest {
  jobKey: string;
  vendorKey: string;
  email: string;
  loginEmailNote?: string | null;
}

/** Request body for POST update-service-request-instructions. */
export interface UpdateServiceRequestInstructionsRequest {
  jobKey: string;
  serviceRequest?: string | null;
  additionalApproval?: string | null;
  specialInstruction?: string | null;
  locationSpecialInstruction?: string | null;
}

// ──────────────────────────────────────────────────────────────
//  Integer-keyed dropdown (State, City — matches C# OptionDto)
// ──────────────────────────────────────────────────────────────

export interface IntDropdownOption {
  text: string;
  value: number;
}

// ──────────────────────────────────────────────────────────────
//  Service Charge Result (matches C# GetServiceChargeResult)
// ──────────────────────────────────────────────────────────────

export interface ServiceChargeResult {
  serviceCharge: number | null;
  radiusInMiles: number | null;
  laborKey: string | null;
  /** Calculated distance from job location to vendor in miles. */
  distanceFromLocation: number | null;
}

// ──────────────────────────────────────────────────────────────
//  Vendor Rates (matches C# VendorRatesDTO)
// ──────────────────────────────────────────────────────────────

export interface VendorRates {
  rateKey: string | null;
  hourlyRate: number | null;
  tripCharge: number | null;
  serviceCharge: number | null;
  emergencyHourlyRate: number | null;
  emergencyTripCharge: number | null;
  emergencyServiceCharge: number | null;
}

// ──────────────────────────────────────────────────────────────
//  Registered Vendor Packet (matches C# RegisteredVendorPacketDto)
// ──────────────────────────────────────────────────────────────

export interface RegisteredVendorPacket {
  contactName: string | null;
  contactTitle: string | null;
  contactEmail: string | null;
  contactPhone: string | null;

  companyName: string | null;
  addressLine2: string | null;
  address: string | null;
  cityName: string | null;
  stateName: string | null;
  zipCode: string | null;
  nonUsaAddress: boolean | null;
  companyEmail: string | null;
  companyPhone: string | null;

  flatRate: string | null;
  standardHourlyRate: string | null;
  standardServiceCallMinimum: string | null;

  overtimeFlatRate: string | null;
  overtimeHourlyRate: string | null;
  overtimeWeekendMinimum: string | null;

  workersCompString: string | null;
  generalLiabilityString: string | null;
  taxId: string | null;
  percentageOfBusiness: string | null;
  agreeToPaymentTermString: string | null;
  notes: string | null;
  coverageArea: string | null;
  radiusInMiles: string | null;
  radiusInMilesInhouseTech: string | null;

  tradeName: string | null;
  helperRates: number | null;
  emergencyHelperRates: number | null;

  fallbackMessage: string | null;
}

// ──────────────────────────────────────────────────────────────
//  Create Vendor Context (GET create-vendor-context/{jobKey})
// ──────────────────────────────────────────────────────────────

export interface CreateVendorContext {
  isPrimary: number;
  fromCustomer: number;
  minutesLeft: number;
  primaryVendorKey: string;
  primaryVendorAlreadyAssignedToThisJobOnce: number;
  jobVendorModel: { minutesLeft: number };
}

// ──────────────────────────────────────────────────────────────
//  Upline Override (POST save-upline-override)
// ──────────────────────────────────────────────────────────────

export interface UplineOverrideRequest {
  jobKey: string;
  reason: string;
  adminKey: string;
}

// ──────────────────────────────────────────────────────────────
//  Send & Select W/O — Save Vendor Request (POST save-vendor-to-job)
// ──────────────────────────────────────────────────────────────

export interface SaveVendorToJobRequest {
  jobKey: string;
  vendorKey: string;
  defaultValue: string;
  sendWorkOrder: number;
  talkedToVendor: number | null;
  etaLimit: number | null;
  etaDate: string | null;
  savedDNE: number | null;
}

// ──────────────────────────────────────────────────────────────
//  Send & Select W/O — Save Vendor With Files (POST save-vendor-to-job-with-files)
// ──────────────────────────────────────────────────────────────

export interface SaveVendorToJobWithFilesRequest {
  jobKey: string;
  vendorKey: string;
  defaultValue: string;
  sendWorkOrder: number;
  checkedFileList: string[];
  locationFile: string[];
  talkedToVendor: number | null;
  etaLimit: number | null;
  etaDate: string | null;
  savedDNE: number | null;
}

export interface UpdateVendorScheduleDatesRequest {
  jobVendorKey: string;
  scheduleDate: string | null;
  returnScheduleDate: string | null;
}

// ──────────────────────────────────────────────────────────────
//  Send & Select W/O — Work Order Email (POST send-work-order-email/{jobVendorKey})
// ──────────────────────────────────────────────────────────────

export interface SendWorkOrderEmailRequest {
  talkedToVendor: number | null;
  etaDate: string | null;
  locationFile: string[] | null;
  workOrderKey?: string | null;
  /** JobFile.FileKey values checked in work order popup (email Layer 2 fallback). */
  checkedFileList?: string[] | null;
}

// ──────────────────────────────────────────────────────────────
//  Send & Select W/O — Bulk Cancellation (POST send-bulk-cancellation)
// ──────────────────────────────────────────────────────────────

export interface BulkCancellationRequest {
  notesJobKey: string;
  notes: string;
  vendorEmailList: string[];
  adminKey: string;
}

// ──────────────────────────────────────────────────────────────
//  Set Vendor as Default (POST set-vendor-as-default)
// ──────────────────────────────────────────────────────────────

export interface SetVendorAsDefaultRequest {
  jobKey: string;
  jobVendorKey: string;
  vendorKey: string;
  keepOtherVendors: boolean;
}

// ──────────────────────────────────────────────────────────────
//  Reassign Vendor From Inactive (POST reassign-from-inactive)
//  Replicates legacy Admin Portal AssignFromInactive -> ReassignVendor/ReassignVendorOnly
// ──────────────────────────────────────────────────────────────

export interface ReassignVendorFromInactiveRequest {
  jobKey: string;
  jobVendorKey: string;
  /**
   * When true, restores the vendor's previous state (ETA, status, DNE) back to the job.
   * Send explicitly with {@link resetStatusAndSchedule} — backend defaults this to false when omitted.
   */
  restorePreviousState?: boolean;
  /**
   * When true, resets job status to "New" and clears schedule dates.
   * Send explicitly with {@link restorePreviousState} — backend defaults this to true when omitted.
   */
  resetStatusAndSchedule?: boolean;
}

// ──────────────────────────────────────────────────────────────
//  Send & Select W/O — Job File Item (GET job-files/{jobKey})
// ──────────────────────────────────────────────────────────────

export interface JobFileItem {
  fileKey: string;
  fileName: string | null;
  fileType: string | null;
  fileUrl: string | null;
}

// ──────────────────────────────────────────────────────────────
//  Vendor Papers (GET /api/v2/admin-activity/jobs/{jobKey}/files/vendor)
//  Sourced from sp_GetVendorFilesForNote — returns JobBillVendorUploads
//  joined with document type / staff for the "Vendor Papers Under this Job"
//  section of the Files & Attachments modal.
// ──────────────────────────────────────────────────────────────

export interface VendorPaperFile {
  fileKey: string;
  jobKey: string | null;
  vendorKey: string | null;
  fileName: string | null;
  /** Document type name (or free-text type) — maps to the API's fileType field. */
  fileType: string | null;
  vendorName: string | null;
  /** Uploader label — staff "PName ( Designation )" or vendor name. */
  staffName: string | null;
  comment: string | null;
  uploadDate: string | null;
  isNew: boolean;
  fileUrl: string | null;
}

// ──────────────────────────────────────────────────────────────
//  Customer Additional Approval — unapproved estimate list
//  (GET /api/v1/files/customer-estimates-for-approval/{jobKey})
// ──────────────────────────────────────────────────────────────

export interface CustomerEstimateForApproval {
  invoiceKey: string;
  mcEstimate: number | null;
  estimateTitle: string | null;
  mutiEstiIdentifier: string | null;
  total: number;
}

export interface CustomerEstimatesForApprovalResult {
  hasUnapprovedEstimate: boolean;
  customerDne: number;
  estimates: CustomerEstimateForApproval[];
}

// ──────────────────────────────────────────────────────────────
//  Send Estimate to Vendor (RBR-483) — vendor contacts for the
//  "Vendor Estimates" modal that opens after a vendor-estimate file
//  is saved (GET /api/v1/files/vendor-contacts-for-estimate/{jobKey})
// ──────────────────────────────────────────────────────────────

export interface VendorContactForEstimate {
  contactKey: string;
  cname: string | null;
  email: string | null;
  isDefault: boolean;
}

export interface VendorForEstimate {
  /** JobVendor.PKey — the legacy radio-group value identifying the assigned vendor row. */
  jobVendorKey: string;
  vendorKey: string | null;
  vendorName: string | null;
  isDefault: boolean;
  contacts: VendorContactForEstimate[];
}

export interface VendorContactsForEstimateResult {
  hasVendors: boolean;
  vendors: VendorForEstimate[];
}

// ──────────────────────────────────────────────────────────────
//  Send & Select W/O — Location File Item (GET location-files/{jobKey})
// ──────────────────────────────────────────────────────────────

export interface LocationFileItem {
  fileKey: string;
  fileName: string | null;
  fileType: string | null;
  fileUrl: string | null;
}

// ──────────────────────────────────────────────────────────────
//  Send & Select W/O — Primary Vendor Check Result
//  (GET check-primary-vendor?jobKey=&locationKey=&tradeKey=)
// ──────────────────────────────────────────────────────────────

export interface PrimaryVendorCheckResult {
  flag: number;
  message: string;
}

// ──────────────────────────────────────────────────────────────
//  Scorecard Agent — per-vendor score (GET scorecard-scores/{jobKey})
//  Matches VendorScoreEntryDto from RFIJobOps.CustomModel
// ──────────────────────────────────────────────────────────────

/** Raw API payload — matches VendorScorecardScoresResultDto from RFIJobOps.CustomModel */
export interface VendorScorecardScoresApiResult {
  scores: VendorScorecardScore[];
  /** pending | ready | failed */
  agentStatus: 'pending' | 'ready' | 'failed';
  /** Join key from the newest successful scorecard run for this job. */
  scoringRunUid?: string | null;
}

/** Normalized lookup returned by AssignVendorService.getScorecardScores */
export interface VendorScorecardScoresLookup {
  scores: Record<string, VendorScorecardScore>;
  agentStatus: 'pending' | 'ready' | 'failed';
  scoringRunUid?: string | null;
}

export interface VendorScorecardScore {
  vendorKey: string;
  /** job_specific_score — overall_score × distance_multiplier; determines rank */
  jobSpecificScore: number;
  /** overall_score — rule-based 0-100 weighted score */
  overallScore: number;
  /** score_tier: 'excellent' | 'good' | 'average' | 'needs_improvement' | 'N/A' */
  scoreTier: string;
  /** 1-based rank in list; 0 for N/A (insufficient data) vendors */
  rank: number;
  /** Approved-invoice count — must be ≥5 for a full score */
  completedJobs: number;
  /** Human-readable flags, e.g. 'insufficient_data', 'DNU Risk' */
  flags: string[];
  /** Pillar score breakdown; empty {} for N/A vendors */
  pillarScores: Record<string, { score: number; weight: number; explanation?: string | null }> | null;
  /** Non-null when vendor has ≥5 active jobs (score reduced) */
  workloadFlag: VendorWorkloadFlag | null;
  /** Plain-English overall summary across all pillars. null when LLM unavailable. */
  aiExplanation?: string | null;
  /** 0–100 signal-based fit composite for N/A vendors (< 5 completed jobs). NOT a performance score. */
  unscoredRankScore?: number | null;
  /** Individual signal scores keyed by signal name (distance, llm_job_fit, trade_match, etc.) */
  signalScores?: Record<string, number> | null;
  /** One sentence per signal for N/A vendors. Empty when unavailable (legacy cache). */
  signalExplanations?: Record<string, string> | null;
  /** LLM one-sentence fit explanation for N/A vendors. null when LLM was unavailable. */
  llmReasoning?: string | null;
}

export interface VendorWorkloadFlag {
  activeJobs: number;
  scorePenalty: number;
  tooltip: string | null;
}

// ──────────────────────────────────────────────────────────────
//  AI Sourcing Agent — Social Media Links
// ──────────────────────────────────────────────────────────────

export interface AISocialMediaLinks {
  facebook: string | null;
  linkedin: string | null;
  instagram: string | null;
}

// ──────────────────────────────────────────────────────────────
//  AI Sourcing Agent — Website Enrichment (scraped data)
// ──────────────────────────────────────────────────────────────

/** Website enrichment (snake_case to match Job Ops API SourcingSearchResult) */
export interface AIWebsiteEnrichment {
  services_list: string[] | null;
  alternate_emails: string[] | null;
  alternate_phones: string[] | null;
  emergency_service: boolean;
  commercial_residential: string | null;
  years_in_business: number | null;
  service_area: string | null;
  website_summary: string | null;
  social_media: Record<string, string> | null;
  license_info: string | null;
  insurance_info: string | null;
  contact_form_url: string | null;
}

// ──────────────────────────────────────────────────────────────
//  Broadcast Configuration (GET broadcast-config/{jobKey}, POST save-broadcast-config)
// ──────────────────────────────────────────────────────────────

export interface BroadcastConfigTradeDto {
  tradeKey: string;
  tradeName: string;
}

export interface BroadcastConfigDto {
  jobKey: string;
  currentTradeKey: string | null;
  currentTradeName: string | null;
  isEmergency: boolean;
  showMaxVendorAccept: boolean;
  /** Job-level saved ETA; null when not set on the job. */
  etaLimit: number | null;
  etaLimitUnit: string;
  /** System default ETA from ReminderEmailTimeDef. */
  defaultEtaLimit: number;
  defaultEtaLimitUnit: string;
  /** Per-job expanded mileage add-on; null when not set on the job. */
  expandedMiles: number | null;
  /** Common broadcast radius from BroadcastRadiusOfVendor (Pkey = 1). */
  defaultBroadcastRadiusMiles: number;
  maxVendorAccept: number | null;
  additionalTrades: BroadcastConfigTradeDto[];
}

export interface SaveBroadcastConfigRequest {
  jobKey: string;
  etaLimit: number;
  expandedMiles: number;
  maxVendorAccept?: number | null;
  additionalTradeKeys: string[];
}

// ──────────────────────────────────────────────────────────────
//  AI Sourcing Agent — Vendor Result (from Service Bus / Job Ops API)
//  Property names match API snake_case (SourcingSearchResult.vendors).
// ──────────────────────────────────────────────────────────────

export interface AISourcingVendor {
  rank: number;
  company_name: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  distance_miles: number | null;
  trades: string[];
  license_number: string | null;
  license_valid: boolean | null;
  insurance_mentioned: boolean;
  avg_rating: number | null;
  review_count: number | null;
  latest_review_date: string | null;
  years_in_business: number | null;
  source_count: number;
  sources: string[];
  confidence_score: number;
  freshness_score: number;
  relevance_score: number;
  is_duplicate_of_internal: boolean;
  social_media: AISocialMediaLinks | null;
  ai_notes: string | null;
  is_franchise: boolean;
  franchise_source: string | null;
  google_maps_uri: string | null;
  primary_type: string | null;
  business_status: string | null;
  opening_hours: Record<string, unknown> | null;
  review_summary: string | null;
  editorial_summary: string | null;
  is_service_area_business: boolean | null;
  website_enrichment: AIWebsiteEnrichment | null;
  is_backfill: boolean;
  scrape_error: string | null;
}

// ──────────────────────────────────────────────────────────────
//  AI Sourcing Agent — Sourcing Status Response (GET /api/sourcing/status/{jobKey})
//  API returns camelCase (SourcingStatusResponse in Job Ops API).
// ──────────────────────────────────────────────────────────────

export interface AISourcingStatus {
  jobKey: string;
  status: string;
  searchId: string | null;
  vendorsFound: number | null;
  processingTimeMs: number | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

// ──────────────────────────────────────────────────────────────
//  AI Sourcing Agent — Request Sourcing Response (POST /api/sourcing/request)
//  API returns camelCase.
// ──────────────────────────────────────────────────────────────

export interface AISourcingRequestResponse {
  jobKey: string;
  status: string;
  message: string;
  requestedAt: string;
  warnings: string[] | null;
}

// ──────────────────────────────────────────────────────────────
//  AI Sourcing — persist user-entered email (PUT /api/sourcing/vendors/{jobKey}/email)
//  JSON uses camelCase; matches UpdateSourcedVendorEmailRequest in Job Ops API.
// ──────────────────────────────────────────────────────────────

export interface UpdateSourcedVendorEmailRequest {
  email: string;
  googleMapsUri?: string | null;
  companyName?: string | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
}

/** Unwrapped .data from successful email save response. */
export interface SourcingVendorEmailSavedResponse {
  email: string;
  vendorKeyHash: string;
}

// ──────────────────────────────────────────────────────────────
//  Support Contact Info (Company Info API)
// ──────────────────────────────────────────────────────────────

/** Support contact information for Retail Fix It. */
export interface SupportContactInfo {
  /** Primary phone number. */
  primaryPhone: string;
  /** Secondary phone number. */
  secondaryPhone: string;
  /** Support email address. */
  email: string;
  /** Formatted display string combining all contact info. */
  formattedDisplay: string;
}

// ──────────────────────────────────────────────────────────────
//  Vendor Recruitment — Send recruitment email to AI-sourced vendor
//  POST /api/vendor-recruitment/send (Email Service API)
// ──────────────────────────────────────────────────────────────

export interface RecruitmentEmailRequest {
  /** Recipient email address (the external vendor being recruited). */
  toEmail: string;
  /** Email subject line. */
  subject: string;
  /** HTML email body content for the recruitment email. */
  body: string;
  /** Company name of the vendor being recruited. */
  companyName: string;
  /** Registration URL for the vendor to sign up. */
  registrationUrl: string;
}

/** Response from the recruitment email API (DataReturn). */
export interface RecruitmentEmailResponse {
  flag: number;
  mess: string | null;
}

// ──────────────────────────────────────────────────────────────
//  Unassign Vendor (RemoveVendorProcess1 replication)
// ──────────────────────────────────────────────────────────────

/** Result of CheckIfVendorBillExist check. */
export interface VendorBillCheckResult {
  /** 1 = vendor bill exists, 0 = no vendor bill */
  result: number;
}

/** Result of CheckIfThereIsAnyPendingApproval check. */
export interface PendingApprovalCheckResult {
  /**
   * 0 = no pending approvals (proceed with unassign)
   * 1 = has pending approval estimates (show UnassignEstimateModal)
   * 2 = has default vendor estimate not approved (show special modal)
   */
  result: number;
}

/** Result of CheckForMoreThan1Vendor check. */
export interface VendorCountCheckResult {
  /**
   * 0 = no vendors
   * 1 = exactly 1 vendor
   * 2 = exactly 2 vendors
   * 3 = more than 2 vendors
   */
  result: number;
}

/** Result of CheckIfThisIsTheDefaultVendor check. */
export interface DefaultVendorCheckResult {
  /** 1 = is default vendor, 0 = not default vendor */
  result: number;
}

/** Vendor item for radio selection when choosing new default. */
export interface VendorRadioOption {
  jobVendorKey: string;
  vendorName: string;
}

/** Request to set one of the other vendors as default before removing the current default. */
export interface SetOtherVendorDefaultRequest {
  jobVendorKey: string;
  toRemoveVendor: string;
}

/** Request to atomically promote one vendor to default and unassign another in a single call. */
export interface UnassignDefaultVendorAndPromoteRequest {
  jobKey: string;
  jobVendorKeyToRemove: string;
  jobVendorKeyToPromote: string;
  adminKey: string;
  insufficient?: number | null;
  reason?: string | null;
}

/** Request for unassigning a vendor from job without sending email. */
export interface UnassignVendorRequest {
  jobKey: string;
  jobVendorKey: string;
  adminKey: string;
  insufficient?: number | null;
  reason?: string | null;
}

/** Request for unassigning a vendor and sending cancellation email. */
export interface UnassignVendorWithEmailRequest {
  jobKey: string;
  jobVendorKey: string;
  adminKey: string;
  comment?: string | null;
  insufficient?: number | null;
  reason?: string | null;
}

/** Request to handle pending estimate and then unassign vendor. */
export interface HandleEstimateAndUnassignRequest {
  jobKey: string;
  jobVendorKey: string;
  adminKey: string;
  setEstimateToNotApproved: boolean;
}

// ──────────────────────────────────────────────────────────────
//  Distant Vendor Approval Workflow
//  Used when assigning a vendor beyond the configured distance rule
// ──────────────────────────────────────────────────────────────

/** Response from checking the distance rule. */
export interface CheckDistanceRuleResponse {
  exceedsRule: boolean;
  distance: number;
  ruleValue: number;
  vendorName: string | null;
  jobPO: string | null;
  /** QC Manager's StaffKey. If logged-in user matches this, they can bypass approval. */
  qcManagerKey: string | null;
}

/** Request to create a distant vendor approval request. */
export interface CreateDistantVendorApprovalRequest {
  jobKey: string;
  vendorKey: string;
  distance: number;
}

/** Response from creating a distant vendor approval request. */
export interface CreateDistantVendorApprovalResponse {
  approvalKey: string;
  message: string;
}

/** Full details for displaying on the approval/decline page. */
export interface DistantVendorApprovalDetailsResponse {
  approvalKey: string;
  jobKey: string;
  vendorKey: string;
  
  // Job details
  jobPO: string | null;
  jobName: string | null;
  jobDescription: string | null;
  locationName: string | null;
  locationAddress: string | null;
  locationCity: string | null;
  locationState: string | null;
  locationZip: string | null;
  tradeName: string | null;
  tradeKey: string | null;
  
  // Vendor details
  vendorName: string | null;
  vendorEmail: string | null;
  vendorPhone: string | null;
  vendorAddress: string | null;
  vendorCity: string | null;
  vendorState: string | null;
  vendorZip: string | null;
  
  // Vendor rates
  hourlyRate: number | null;
  tripCharge: number | null;
  serviceCharge: number | null;
  helperRate: number | null;
  
  // Trade-specific rates
  tradeHourlyRate: number | null;
  tradeTripCharge: number | null;
  tradeServiceCharge: number | null;
  hasTradeSpecificRate: boolean;
  
  // Distance info (matches backend property names)
  distanceFromLocation: number;
  distanceRuleValue: number;
  
  // Approval status
  sentForApproval: string | null;
  isApproved: boolean | null;
  processedAndDeployed: boolean | null;
  sentByAdminName: string | null;
}

/** Request to process an approval. */
export interface ProcessDistantVendorApprovalRequest {
  remark?: string | null;
}

/** Request to process a decline. */
export interface ProcessDistantVendorDeclineRequest {
  remark: string;
}

/** Response from processing approval or decline. */
export interface ProcessDistantVendorResponse {
  success: boolean;
  message: string;
  redirectUrl: string | null;
}

// ─────────────────────────────────────────────────────────────
// UPDATE NTE
// ─────────────────────────────────────────────────────────────
export interface UpdateNteRequest {
  jobKey: string;
  customerDne: string | null;
  revCustomerDne: string | null;
  vendorDne: string | null;
  revVendorDne: string | null;
}

// ─────────────────────────────────────────────────────────────
// BROADCAST TO VENDORS
// ─────────────────────────────────────────────────────────────
export interface BroadcastVendorOptionDto {
  vendorKey: string;
  contactKey: string | null;
  vname: string | null;
  contactName: string | null;
  email: string | null;
  distanceMiles: number | null;
}

export interface BroadcastToVendorsRequest {
  jobKey: string;
  vendorKeys: string[];
  fileKeys: string[];
}

export interface BroadcastJobFileDto {
  fileKey: string;
  title: string | null;
  documentTypeName: string | null;
  addedOn: string | null;
  addedByName: string | null;
  fileUrl: string | null;
}

// ─────────────────────────────────────────────────────────────
// DUPLICATE JOB
// ─────────────────────────────────────────────────────────────
export interface CustomerLocationOptionDto {
  locationKey: string;
  lname: string | null;
  address: string | null;
}

export interface DuplicateJobRequest {
  jobKey: string;
  locationKey: string;
}

export interface DuplicateJobResultDto {
  newJobKey: string;
  newJobPo: string | null;
  message: string | null;
}

// ──────────────────────────────────────────────────────────────
//  Account Manager — Vendor Selection Survey (work order flow)
// ──────────────────────────────────────────────────────────────

export interface AccountManagerSurveySetupItem {
  scoreCardResponseKey: string;
  reasonCode: string;
  displayLabel: string;
}

export interface AccountManagerSurveyWorkOrderResponse {
  reasonCode: string;
  responseValue: string;
}

/** One vendor row captured at dispatch for ML training (matches DisplayedVendorCaptureDto). */
export interface DisplayedVendorCapture {
  vendorKey: string;
  score: number;
  isScored: boolean;
}

export interface AccountManagerSurveyWorkOrderSaveRequest {
  jobKey: string;
  chosenVendorKey: string;
  responses: AccountManagerSurveyWorkOrderResponse[];
  mainRemark: string;
  /** Exact join key to the scorecard run that built the list on screen. */
  scoringRunUid?: string | null;
  /** Score shown for the chosen vendor at dispatch. */
  chosenVendorScore?: number | null;
  /** Final filtered vendor view at dispatch. */
  displayedVendors?: DisplayedVendorCapture[] | null;
}

export interface AccountManagerSurveyWorkOrderSaveResult {
  aiVendorSelectionId: string;
  savedResponseCount: number;
}

// ──────────────────────────────────────────────────────────────
//  ETA Set Email Notification (new flow)
// ──────────────────────────────────────────────────────────────

export interface SetEtaEmailPromptResponse {
  success: boolean;
  message: string;
  vendorContacts: VendorActionContactDto[];
  defaultEmailNote: string;
  scheduleDateDisplay: string;
  po: string | null;
  vendorName: string | null;
  emailType: number;
  jobVendorKey: string;
  promptTitle: string;  // NEW: Dynamic modal title
  isEtaConfirmed: boolean;  // NEW: Whether ETA is already confirmed
}

export interface VendorActionContactDto {
  contactKey: string;
  vendorKey: string;
  cname: string;
  title: string | null;
  phone: string | null;
  email: string;
  isDefault: boolean;
}

export interface SendEtaSetEmailRequest {
  jobVendorKey: string;
  emailNote: string | null;
  vendorContactKeys: string[] | null;
  customEmail: string | null;
}
