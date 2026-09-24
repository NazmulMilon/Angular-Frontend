/**
 * Dynamic Minimum Markup — customer-profile minimum-markup policy.
 * Targets the Job Ops API `/api/DynMinMarkup` endpoints. Responses are wrapped in the
 * standard result envelope; `DynMinMarkupService` unwraps `.data` to these DTOs.
 */

/** One cost-tier rule: over `costOverValue`, require at least `markupPercentage`. */
export interface DynMinMarkupTier {
  costOverValue: number;
  markupPercentage: number;
}

/** A customer's full policy — GET response and PUT request body. */
export interface DynMinMarkupPolicy {
  customerKey: string;
  markupPercentageForEmergency: number;
  markupPercentageForNonEmergency: number;
  overValuesWithMarkupPercentages: DynMinMarkupTier[];
}

/** One option to threshold-check (POST /check-threshold). */
export interface DynMinMarkupOptionCheck {
  optionKey: string;
  hasVendorEstimate: boolean;
  vendorGrandTotal: number;
  customerGrandTotal: number;
  vendorKey?: string | null;
}

/** Request body for POST /check-threshold. */
export interface DynMinMarkupThresholdRequest {
  jobKey: string;
  customerKey: string;
  options: DynMinMarkupOptionCheck[];
}

/** Per-option preview outcome. */
export interface DynMinMarkupOptionResult {
  optionKey: string;
  isWithinThreshold: boolean;
  currentCustomerGrandTotal: number;
  expectedCustomerGrandTotal: number;
  markupPercentageFromDbData: number | null;
  costBasis: number;
  isDne: boolean;
  explanationMessage: string;
  validationErrorMessage: string;
}

/** Response for POST /check-threshold (per-option preview; not a set-level gate). */
export interface DynMinMarkupThresholdResponse {
  options: DynMinMarkupOptionResult[];
}

/**
 * How the admin chose to proceed after seeing a `DynMinMarkupAdjustmentProposal` on a create/update
 * call. Resend the SAME create/update request with this set to actually persist — there is no separate
 * confirm endpoint. `ProceedAnyway` is reserved for the (not yet built) escalation-approval replay path;
 * the UI never sends it directly.
 */
export enum MarkupAdjustmentDecision {
  AcceptProposed = 1,
  ManualOverride = 2,
  ProceedAnyway = 3,
}

/**
 * A concrete, server-computed fix for an under-threshold customer estimate. First, a flat 10% markup
 * is applied to every material line (`materialLineAdjustments`); if that alone doesn't close the
 * shortfall, the REMAINING shortfall is split evenly across every labor line on the estimate
 * (`laborLineAdjustments`, one entry per line, each absorbing an equal dollar share converted to hours
 * at that line's own rate) — never dumped entirely onto a single line, which for a multi-vendor merge
 * (one labor line per vendor) could mean an absurd hour count on one line while sibling labor lines go
 * untouched. Nothing is persisted until the admin accepts this or overrides it — see
 * `MarkupAdjustmentDecision`.
 */
export interface DynMinMarkupAdjustmentProposal {
  optionKey: string;
  shortfallAmount: number;
  /** One entry per material line on the estimate, bumped by a flat markup % applied before labor. */
  materialLineAdjustments: DynMinMarkupMaterialLineAdjustment[];
  /** One entry per labor line on the estimate. Empty when `noLaborLineAvailable` or when the material pass alone closed the shortfall. */
  laborLineAdjustments: DynMinMarkupLaborLineAdjustment[];
  resultingCustomerGrandTotal: number;
  /** True when no labor line exists to target (e.g. a DNE-only option, or every labor line has a $0 rate) — Accept must be disabled; the admin must edit a line manually instead. */
  noLaborLineAvailable: boolean;
  underlying: DynMinMarkupOptionResult;
}

/** One material line's flat markup % bump within a `DynMinMarkupAdjustmentProposal`. */
export interface DynMinMarkupMaterialLineAdjustment {
  lineItemKey: string;
  chargeTypeKey: string;
  currentAmount: number;
  markupPercentApplied: number;
  resultingAmount: number;
  /** `resultingAmount - currentAmount` — this line's contribution toward closing the shortfall. */
  amountAdded: number;
}

/** One labor line's share of a `DynMinMarkupAdjustmentProposal`'s shortfall. */
export interface DynMinMarkupLaborLineAdjustment {
  lineItemKey: string;
  chargeTypeKey: string;
  currentHours: number;
  additionalHours: number;
  resultingHours: number;
  laborRate: number;
  /** The dollar amount this specific line is absorbing (an equal share of the total shortfall). */
  shareOfShortfall: number;
}
