import {
  AdminJobEstimateActionTarget,
  EstimateManageStatusAction,
} from '../../../models/vendor-bills.model';

export interface EstimateManageStatusOption {
  action: EstimateManageStatusAction;
  /** Text shown in the Manage Status dropdown (the action the admin is choosing). */
  label: string;
  /** Badge variant to apply optimistically once this status is set. */
  badgeVariant: string;
  /**
   * RBR-472: the collapsed status label shown on the card once this action is set
   * (e.g. "Pending Approval"). Falls back to `label` when omitted.
   */
  displayLabel?: string;
  /** RBR-472: optional secondary pill text to apply optimistically (e.g. "On-Site"). */
  pill?: string;
  /** RBR-472: colour variant key for the optimistic pill (e.g. "onsite"). */
  pillVariant?: string;
  /** When true, opens in-app negotiation instead of calling manage-status API. */
  usesNegotiationFlow?: boolean;
  /**
   * When true, this action is NOT sent through the generic manage-status endpoint.
   * "Estimate Approved" instead runs the dedicated approve chain (SetVendorEstimateToApproved
   * → Additional Approval panel → SaveVendorApprovalData → SendWorkOrderEmail) so the DNE
   * flags, sibling-decline, and RevVendorDNE side effects all happen, and so the panel's
   * `flag`/`requiresAdditionalApproval` response is available to drive the panel.
   */
  usesApprovalFlow?: boolean;
  /**
   * When true, this action is NOT sent through the generic manage-status endpoint.
   * "Vendor Estimate Revision Request" instead opens the reject panel, which runs the dedicated
   * RejectVendorEstimateForResubmission endpoint (status 0, admin remark, vendor email).
   */
  usesRejectFlow?: boolean;
  /**
   * When true, this action is NOT sent through the generic manage-status endpoint.
   * "Estimate Declined" instead opens the decline panel, which runs the dedicated
   * DeclineVendorEstimate endpoint (status 3, required admin remark, vendor email).
   * Terminal action — no resubmission path.
   */
  usesDeclineFlow?: boolean;
}

const ALL_MANAGE_STATUS_OPTIONS: EstimateManageStatusOption[] = [
  { action: 'onsite-approval-requested', label: 'Pending Approval (On-Site)', badgeVariant: 'pending', displayLabel: 'Pending Approval', pill: 'On-Site', pillVariant: 'onsite' },
  { action: 'estimate-submitted', label: 'Pending Approval (Estimate)', badgeVariant: 'pending', displayLabel: 'Pending Approval', pill: 'Estimate', pillVariant: 'estimate' },
  { action: 'change-order-requested', label: 'Pending Approval (Change Order)', badgeVariant: 'pending', displayLabel: 'Pending Approval', pill: 'Change Order', pillVariant: 'change-order' },
  { action: 'negotiate', label: 'Negotiate', badgeVariant: 'pending', displayLabel: 'Pending Approval', pill: 'Negotiated', pillVariant: 'negotiated', usesNegotiationFlow: true },
  { action: 'estimate-approved', label: 'Approved', badgeVariant: 'approved', displayLabel: 'Approved', usesApprovalFlow: true },
  { action: 'estimate-declined', label: 'Declined', badgeVariant: 'declined', displayLabel: 'Declined', usesDeclineFlow: true },
  { action: 'onsite-approval-approved', label: 'Approved (On-Site)', badgeVariant: 'Approved (On-Site)', displayLabel: 'Approved', pill: 'On-Site Approval', pillVariant: 'onsite-approval' },
  { action: 'estimate-reject-resubmit', label: 'Revision Requested', badgeVariant: 'resubmit', displayLabel: 'Revision Requested', usesRejectFlow: true },
];

/** Manage Status dropdown options for an estimate (legacy UpdateVendorEstimate parity). */
export function getEstimateManageStatusOptions(_target: AdminJobEstimateActionTarget): EstimateManageStatusOption[] {
  return ALL_MANAGE_STATUS_OPTIONS.filter((opt) => {
    // Regular "Estimate submitted" is hidden once an estimate is flagged as on-site approval.
    if (opt.action === 'estimate-submitted') {
      return !_target.onsiteApproval;
    }
    return true;
  });
}

export interface NegotiationBadge {
  label: string;
  /** CSS modifier suffix for `.est-opt-tab__badge--<variant>`. */
  variant: 'neutral' | 'pending' | 'approved' | 'declined';
}

/** Agent `AgentStatus` string (see VendorEstimateNegotiationService.TerminalStatuses) → tab badge. */
const AGENT_STATUS_BADGES: Record<string, NegotiationBadge> = {
  awaiting_vendor: { label: 'Awaiting Vendor', variant: 'neutral' },
  awaiting_admin: { label: 'Awaiting Admin', variant: 'pending' },
  reviewing: { label: 'Reviewing', variant: 'pending' },
  submitted: { label: 'Submitted', variant: 'neutral' },
  counter_sent: { label: 'Counter Sent', variant: 'pending' },
  approved: { label: 'Approved', variant: 'approved' },
  declined: { label: 'Declined', variant: 'declined' },
  expired: { label: 'Expired', variant: 'declined' },
  rejected_for_resubmission: { label: 'Revision Requested', variant: 'declined' },
};

const DEFAULT_NEGOTIATION_BADGE: NegotiationBadge = { label: 'Pending', variant: 'neutral' };

/** Maps a negotiation's agent status to the option-tab badge shown per option (falls back to "Pending" when negotiation hasn't started or status is unrecognized). */
export function getNegotiationBadge(agentStatus: string | null | undefined): NegotiationBadge {
  if (!agentStatus) return DEFAULT_NEGOTIATION_BADGE;
  return AGENT_STATUS_BADGES[agentStatus.toLowerCase()] ?? DEFAULT_NEGOTIATION_BADGE;
}
