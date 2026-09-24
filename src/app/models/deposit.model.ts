/**
 * Deposit flow — vendor deposits (money paid out) and customer deposit (money collected),
 * matching RFIJobOps CustomModel/DepositDto.cs exactly (camelCase serialized).
 */

/** One vendor's deposit amount, kept (paying) or removed (clearing an existing deposit). */
export interface VendorDepositItem {
  jobVendorKey: string;
  depositAmount: number;
}

/** Override reason authorizing a vendor deposit that exceeds 50% of that vendor's smallest estimate. */
export interface DepositOverrideItem {
  jobVendorKey: string;
  depositAmount: number;
  remark?: string | null;
}

export interface SaveDepositRequest {
  jobKey: string;
  /** Required only when the job has more than one candidate deposit estimate. */
  customerEstimateKey?: string | null;
  vendorDepositList: VendorDepositItem[];
  vendorDepositRemovedList: VendorDepositItem[];
  customerDepoAmount: number;
  /** Required when customerDepoAmount is 0 and a vendor deposit is being paid (or is already on record). */
  reasonForNoCustomerDeposit?: string | null;
  vendorDepositOverrideList: DepositOverrideItem[];
  /** Required when the customer deposit is below the vendor total or the 35%-best-practice floor. */
  customerDepositOverrideReason?: string | null;
}

export interface SaveDepositResult {
  vendorsSaved: number;
  vendorsRemoved: number;
  depositBillsCreated: number;
  customerDepositSet: boolean;
  customerDepositRemoved: boolean;
  /** True when the deposit is now pending SVC-manager approval (self-approval left this false). */
  requiresSvcApproval: boolean;
  notes: string[];
}

/**
 * One vendor participating in a customer estimate, for seeding the deposit modal's per-vendor step.
 * A single-vendor estimate resolves to exactly one entry; a multi-vendor merge resolves to one per
 * combined vendor estimate.
 */
export interface DepositVendorInfo {
  jobVendorKey: string;
  vendorName: string;
  /** This vendor's own (smallest live) estimate total, for the >50% soft-limit warning. */
  vendorEstimateTotal: number;
  /** This vendor's deposit already on record, or 0. Prefills the amount and feeds the job-wide 35% basis. */
  existingDepositAmount: number;
}

/** Everything the deposit modal needs to seed itself for one customer estimate. */
export interface DepositEstimateContext {
  vendors: DepositVendorInfo[];
  /** Customer deposit currently set on the estimate, or 0. */
  customerDepositAmount: number;
  /** True when that deposit is set but not yet paid — the only state in which it is safely editable. */
  customerDepositUnpaid: boolean;
  /**
   * Sum of vendor deposits already on record for this JOB belonging to a vendor NOT in `vendors` above
   * — i.e. tied to a different customer estimate on the same job (multi-estimate jobs). The server's
   * 35%-best-practice save check is job-wide, so this must be added into the modal's basis or a save
   * that looks fine locally can still be rejected by the server.
   */
  otherVendorDepositsOnRecordJobWide: number;
  /**
   * True when this estimate's customer deposit was routed to an SVC manager for approval and is
   * still pending (at least one recipient hasn't responded yet). False when self-approved, already
   * approved, or no deposit was ever set. The estimate must not be sent/resent while this is true.
   */
  customerDepositApprovalPending: boolean;
}

/** One customer estimate's deposit + approval state, one row of the job-wide deposit summary. */
export interface JobDepositSummaryEntry {
  customerEstimateKey: string;
  vendors: DepositVendorInfo[];
  customerDepositAmount: number;
  /** Null when no approval decision has been recorded for this estimate yet. */
  depositApprovalFromSvCmanagerKey?: string | null;
  /** Null = still pending; true/false = decided. */
  isApproved?: boolean | null;
  approvedDeclinedOn?: string | null;
  approvingDecliningRemark?: string | null;
  generalRemark?: string | null;
  /** True when this entry has a decided approval the requesting admin has not yet acknowledged. */
  isUnseenByRequestingAdmin: boolean;
}

/** Job-wide deposit summary backing the "Deposits on Job" button and the Estimates-tab dot. */
export interface JobDepositSummary {
  entries: JobDepositSummaryEntry[];
  hasAnyUnseenDecision: boolean;
}
