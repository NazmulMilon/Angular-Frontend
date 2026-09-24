/**
 * Create Quick Job — V2 API contract (mirrors RFIJobOps QuickJobDtos.cs).
 *
 * JSON is camelCase (ASP.NET default; matches the rest of the Admin Portal V2 models).
 * The shared response envelope is {@link AssignVendorApiResponse}.
 */

/**
 * Generic GUID-keyed dropdown item returned in {@link QuickJobFormDataDto}
 * (C# `OptionGuidValueDto`). Field names are ASSUMED to be `text` / `value` to match the
 * other dropdown DTOs in this codebase (see {@link VendorContactOption}). If the backend
 * emits `{ key, name }` instead, adjust these two field names in one place.
 */
export interface OptionGuidValueDto {
  text: string | null;
  value: string;
}

/** Constant GUIDs the UI needs for client-side branching (Bid/Project force Vendor DNE to 0, etc.). */
export interface QuickJobConstantsDto {
  bidJobTypeKey: string;
  specialProjectJobTypeKey: string;
  emergencyJobTypeKey: string;
  allTradeKey: string;
}

/** GET /quick-job/form-data — defaults + dropdown data. */
export interface QuickJobFormDataDto {
  initialJobStatusKey: string;
  defaultTeamKey: string;
  nextPoPreview: string | null;
  constants: QuickJobConstantsDto;
  customers: OptionGuidValueDto[];
  trades: OptionGuidValueDto[];
  priorities: OptionGuidValueDto[];
  accountManagers: OptionGuidValueDto[];
  jobStatuses: OptionGuidValueDto[];
  /**
   * Admin-configurable document types (DocumentForID = Jobs) used to tag internal files staged
   * via the temp-files endpoints. Optional: may be absent on API environments where the field
   * isn't deployed yet — the UI falls back to uploading with no type key (backend defaults to a
   * generic "Attachment" type). See {@link QuickJobTempFileDto}.
   */
  documentTypes?: OptionGuidValueDto[];
}

/**
 * GET /quick-job/temp-files — one internal file staged (per logged-in admin) before the job
 * exists; promoted to a real JobFile on job creation. `documentTypeName` is present in the DTO
 * but NOT populated server-side today — resolve the display label client-side by matching
 * `documentTypeKey` against {@link QuickJobFormDataDto.documentTypes}.
 */
export interface QuickJobTempFileDto {
  fileKey: string;
  title: string | null;
  fileName: string | null;
  fileType: string | null;
  documentTypeKey: string | null;
  documentTypeName: string | null;
  addedOn: string;
}

/** Matches C# QuickJobVendorAction. */
export enum QuickJobVendorAction {
  SaveOnly = 0,
  AssignAndSend = 1,
  SearchLater = 2,
  Broadcast = 3,
  DispatchPrimary = 4,
}

export interface QuickJobBroadcastOptions {
  sendToAllVendor: number;
  maxNoOfVendorAccept?: number | null;
  responseTimeLimit?: number | null;
  expandedMilage?: number | null;
  additionalTradeKeys: string[];
}

/** POST /quick-job — create request body. */
export interface CreateQuickJobRequest {
  customerKey: string;
  locationKey: string;
  customerContactKey: string;
  customerRequestorKey?: string | null;
  jobName?: string | null;
  jobTypeKey: string;
  tradeKey: string;
  accountManagerKey?: string | null;
  toTeamKey?: string | null;
  description?: string | null;
  customerDne?: string | null;
  vendorDne?: string | null;
  po?: string | null;

  vendorKey?: string | null;
  vendorContactKey?: string | null;
  talkedToVendor?: number | null;
  vendorEtaLimit?: number | null;
  vendorAction: QuickJobVendorAction;
  broadcastOptions?: QuickJobBroadcastOptions | null;

  duplicateLocationKeys: string[];
  primaryVendorOption: number;
  dismissedPrimaryVendorWarning: boolean;
}

/** Where the frontend should navigate after a successful create. */
export interface QuickJobRedirect {
  /** One of: edit_job | assign_vendor | broadcast | email_work_order | primary_vendor. */
  type: string;
  url: string | null;
  workOrderKey?: string | null;
}

export interface QuickJobDuplicatedJobDto {
  jobKey: string;
  po: string | null;
  locationKey: string;
}

/** POST /quick-job — response body. */
export interface CreateQuickJobResponse {
  success: boolean;
  jobKey: string;
  po: string | null;
  message: string | null;
  redirect: QuickJobRedirect;
  duplicatedJobs: QuickJobDuplicatedJobDto[];
}

/**
 * GET /quick-job/vendor-eta-default — default Vendor ETA window for a given job type
 * (`CreateQuickJobController.GetVendorEtaDefault` in RFIJobOps). Mirrors legacy V1's
 * `ReminderEmailTimeDef` Pkey 1 (days, most job types) / Pkey 8 (hours, Emergency job type)
 * lookup via `MgtJobController.GetTheVendoeETAsetLimitDefaultforSystem`, branching on the same
 * `emergencyJobTypeKey` constant returned in {@link QuickJobConstantsDto}.
 */
export interface VendorEtaDefaultDto {
  timeLimit: number;
  /** true = hours (Emergency job type), false = days. */
  isHourIsDay: boolean;
}

/** POST /quick-job/validate-job-name. */
export interface ValidateJobNameResult {
  isAvailable: boolean;
  message: string | null;
}

/** GET /quick-job/vendors — paged vendor typeahead result. */
export interface PagedOptionResultDto {
  items: OptionGuidValueDto[];
  totalCount: number;
}

/**
 * GET /quick-job/customers/{customerKey}/detail — customer profile defaults used to pre-fill
 * the DNE fields when a customer is selected (mirrors C# `QuickJobCustomerDetailDto`).
 */
export interface QuickJobCustomerDetailDto {
  customerKey: string;
  customerName: string | null;
  /** Standard customer DNE (Customer.CustomerDNE). */
  customerDne: number | null;
  /** Emergency customer DNE (Customer.EmergencyCustomerDNE). */
  emergencyCustomerDne: number | null;
  /** Standard vendor DNE (Customer.VendorDNE). */
  vendorDne: number | null;
  /** Emergency vendor DNE (Customer.VendorEmergencyDNE). */
  vendorEmergencyDne: number | null;
  emergencyUplineOverride: boolean;
  allowCustomerToEnterDne: boolean;
  /** Customer.AccountManagerKey — used to pre-fill the Account Manager dropdown on customer change. */
  accountManagerKey: string | null;
  accountManagerName: string | null;
  /** Customer.Ivrpin — pre-fills the special instruction / description field; empty string if unset. */
  specialInstruction: string;
}
