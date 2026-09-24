/** "Approve Vendor(s) Payables" per-vendor card -- mirrors RFIJobOps.CustomModel.VendorPayableCardDto. */
export interface VendorPayableCard {
  vendorKey: string;
  vendorName: string | null;
  tradeName: string | null;

  /** 'removed' once this vendor's decision is 'remove' (Non-Payable) -- overrides whatever EQ2
   *  would otherwise compute, since a decided-non-payable vendor is neither ready nor blocked. */
  level: 'done' | 'blocked' | 'ready' | 'removed';
  blockers: string[];
  green: string[];
  open: string[];

  revVendorDne: number | null;
  /** Original JobVendor.VendorDNE, before any estimate/on-site-approval revision -- struck-through
   *  in the "Revised Vendor DNE" box when it differs from revVendorDne. */
  dne: number | null;
  hasVendorInvoice: boolean;
  invoiceKey: string | null;
  invoiceNo: string | null;
  invoiceTotal: number | null;

  hasApprovedEstimate: boolean;
  approvedEstimateKey: string | null;
  /** true = "On-Site Approval", false = "Vendor Estimate" -- same document, different label. */
  isOnsiteApproval: boolean;

  /** This vendor's own "🏷 Add note about this vendor bill" notes, pinned right on the card. */
  pinnedNotes: VendorBillNote[];

  afterPhotoCount: number;
  /** True once at least one completion photo has been admin-APPROVED -- kept for the "reviews
   *  done" payable-eligibility gate. Prefer afterPhotoReviewStatus for display. */
  afterPhotoVerified: boolean;
  /** "✓ Review check-out pics" step-chip's tri-state color: 'rejected' (red, takes priority),
   *  'approved' (green), 'pending' (grey, nothing decided yet). */
  afterPhotoReviewStatus: 'pending' | 'approved' | 'rejected';
  /** Completion photos still awaiting an admin decision (approve/reject). */
  afterPhotoPendingReviewCount: number;
  hasSignOffUpload: boolean;
  signOffFileName: string | null;
  /** "✍ Review sign-off" step-chip's tri-state color -- same rule as afterPhotoReviewStatus. */
  signOffReviewStatus: 'pending' | 'approved' | 'rejected';
  /** True only when signOffReviewStatus == 'approved' -- the "reviews done" gate. */
  signOffVerified: boolean;
  insuranceOk: boolean;
  /** "Vendor Insurance Validation" step-chip subtitle numbers -- without opening the popup. */
  glExpiry: string | null;
  wcExpiry: string | null;
  insuranceProblems: string[];

  /** Job-level (same value on every vendor card on this job) -- true once a completion call for
   *  the job's current completion cycle got a YES. */
  completionCallVerified: boolean;

  hoursReviewed: boolean;
  costReviewed: boolean;
  scopeReviewed: boolean;

  /** "⚠ Waive check-in requirement (AM)" -- true once waived for this vendor's current review cycle. */
  checkInWaived: boolean;
  /** True once "⚖ Reduce invoice labor hours to match check-in/out" has been applied and not undone. */
  hoursMatchReductionApplied: boolean;

  /** "Check-in/out vs billed" step-chip subtitle numbers -- mirrors complete-screen-v2.html's
   *  timeSub. Same raw-duration on-site calc as the EQ2 badge/popup, not hrs×techs. */
  hasCheckIns: boolean;
  hoursOnsite: number;
  hoursBilled: number;

  decision: 'payable-performed' | 'payable-cost-incurred' | 'remove' | null;
  approvedAmount: number | null;
  costIncurredReason: string | null;
  confirmedOn: string | null;
  cancellationEmailSent: boolean;
  /** Reason on file for a 'remove' (Non-Payable) decision. */
  removeReason: string | null;
  /** True once the vendor was actually unassigned from the job as part of 'remove'. */
  unassignPerformed: boolean | null;
  /** True when unassign was skipped because this vendor is the job's default vendor and other
   *  vendors remain assigned -- vendor stays assigned, only marked Non-Payable. */
  defaultVendorExceptionApplied: boolean | null;

  qboTransactionNumber: string | null;
  qboEnteredOn: string | null;

  scope: VendorScopeCompletion;
  insuranceOverride: VendorInsuranceOverrideState | null;
}

/** "🔍 Verify Scope Completion" 4-panel comparison -- mirrors RFIJobOps.CustomModel.VendorScopeCompletionDto. */
export interface VendorScopeCompletion {
  /** 1 · Original Service Requested (Job.Description) -- identical across every vendor on the job. */
  requested: string | null;

  /** 2 · Quoted. */
  hasApprovedEstimate: boolean;
  /** "on-site approval" or "estimate". */
  estimateTypeLabel: string;
  quotedLabor: ScopeLineItem[];
  quotedMaterials: ScopeLineItem[];
  quotedOther: ScopeLineItem[];

  /** 3 · Our estimate/invoice to customer, attributed per vendor. */
  customerLines: ScopeLineItem[];
  /** "invoice" or "estimate"; null when customerLines is empty. */
  customerLineSource: string | null;

  /** 4 · Completed. */
  visits: ScopeVisit[];
  signOff: ScopeSignOff | null;

  flags: string[];
}

export interface ScopeLineItem {
  description: string | null;
  qty: number;
  cost: number;
  /** 'this-vendor' | 'other-vendor' | 'unmatched'. */
  attribution: string;
  otherVendorName: string | null;
}

export interface ScopeVisit {
  visitNumber: number;
  techName: string | null;
  techCount: number | null;
  checkInTime: string | null;
  checkOutTime: string | null;
  /** true = Works Performed Y, false = N, null = unknown. */
  workPerformed: boolean | null;
  workDescription: string | null;
}

export interface ScopeSignOff {
  name: string | null;
  signedOn: string | null;
  comments: string | null;
}

/** "🏷 Add note about this vendor bill to Accounting" -- one AdminActionNotes row with FeatureID=3
 *  (job-level trail, shared with "Approve Vendor(s) Payables"' own system notes). */
export interface VendorBillNote {
  noteKey: string;
  comment: string | null;
  addedOn: string | null;
  addedByName: string | null;
  relatedLabel: string | null;
}

export interface VendorInsuranceOverrideState {
  pKey: string;
  glReasonApplied: boolean;
  glDeductionPercent: number | null;
  wcReasonApplied: boolean;
  wcDeductionPercent: number | null;
  originalAmount: number;
  reducedAmount: number;
  appliedOn: string;
  appliedByName: string | null;
  emailSent: boolean;
  emailSentTo: string | null;
  /** Only populated on the ApplyInsuranceOverride response for the call that actually sent the
   *  email this turn -- drives the "✉ Flag emailed" as-sent preview popup. Null otherwise. */
  emailSubject: string | null;
  emailBodyPreviewText: string | null;
}

export interface VendorPayableChangedDto {
  jobKey: string;
  vendorKey: string;
  changeType: string;
}

/** "📷 {Vendor} — Check-out Complete uploads" -- mirrors RFIJobOps.CustomModel.CompletionPhotoDto. */
export interface CompletionPhoto {
  uploadKey: string;
  fileName: string | null;
  fileType: string | null;
  uploadDate: string | null;
  url: string | null;
  /** true = admin-approved, false = admin-rejected, null = still awaiting review. */
  verified: boolean | null;
  verifiedOn: string | null;
}

export interface CompletionPhotoState {
  photos: CompletionPhoto[];
  pendingReviewCount: number;
  anyVerified: boolean;
}

/** "✍ Manager Sign-off — {Vendor}" popup -- mirrors RFIJobOps.CustomModel.SignOffStateDto. */
export interface SignOffState {
  hasSignOff: boolean;
  typedName: string | null;
  comments: string | null;
  signedOn: string | null;
  signatureUrl: string | null;
  signOffSheetUrl: string | null;
  signOffSheetFileName: string | null;
  /** true = admin-accepted, false = admin-rejected, null = still awaiting review. */
  verified: boolean | null;
  verifiedOn: string | null;
  pendingReviewCount: number;
  hasNegativeSentiment: boolean;
}

/** "⏱ Check-in / Out & Hours vs Billed — {Vendor}" popup -- mirrors RFIJobOps.CustomModel.HoursReconStateDto.
 *  On-site hours use the SAME raw-duration calc as the EQ2 hours-tolerance badge already shown on
 *  the card, not the mockup's hrs×techs model -- the two numbers never disagree. */
export interface HoursReconState {
  checkIns: HoursReconCheckInRow[];
  onsiteHours: number;

  billedLaborLines: HoursReconLaborLine[];
  billedHours: number;
  hasVendorInvoice: boolean;
  invoiceSourceLabel: string | null;

  diff: number;
  canApplyReduction: boolean;

  checkInWaived: boolean;
  checkInWaiveReason: string | null;
  checkInWaivedBy: string | null;
  checkInWaivedByName: string | null;
  checkInWaivedOn: string | null;

  hasUndo: boolean;
  undoRestoreToTotal: number | null;
}

export interface HoursReconCheckInRow {
  checkinKey: string;
  techName: string | null;
  checkInTime: string | null;
  checkOutTime: string | null;
  hours: number;
  techCount: number | null;
  /** Y/N "Works Performed" indicator -- the column header; the free-text description renders in
   *  its own row below (see workDescription), matching complete-screen-v2.html exactly. */
  workPerformed: boolean | null;
  workDescription: string | null;
}

export interface HoursReconLaborLine {
  laborKey: string;
  description: string | null;
  hours: number;
  rate: number;
  total: number;
}

/** "🛡 Vendor Insurance Validation" popup -- mirrors RFIJobOps.CustomModel.VendorInsuranceValidationStateDto. */
export interface VendorInsuranceValidationState {
  gl: VendorInsuranceTypeState;
  wc: VendorInsuranceTypeState;
  problems: string[];
  verified: boolean;
}

export interface VendorInsuranceTypeState {
  carry: boolean;
  /** 'not-required' | 'current' | 'expired' | 'missing'. */
  state: string;
  expiry: string | null;
  fileName: string | null;
  fileUrl: string | null;
  pending: VendorPendingInsurance | null;
}

export interface VendorPendingInsurance {
  pkey: string;
  proposedExpiry: string | null;
  fileName: string | null;
  fileUrl: string | null;
  submittedOn: string | null;
}

export interface RejectPendingInsuranceRequest {
  notes: string;
}
