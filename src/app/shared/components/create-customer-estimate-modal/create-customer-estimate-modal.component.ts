import { Component, inject, signal, computed, output } from '@angular/core';
import { CommonModule, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AssignVendorService } from '../../../services/assign-vendor.service';
import { DynMinMarkupService } from '../../../services/dyn-min-markup.service';
import { DepositService } from '../../../services/deposit.service';
import { DynMinMarkupPolicy, DynMinMarkupAdjustmentProposal, MarkupAdjustmentDecision } from '../../../models/dyn-min-markup.model';
import {
  CreateCustomerEstimateResponse,
  CustomerEstimateLineItem,
  ArchivedCustomerEstimateSummary,
  UpdateCustomerEstimateLineItemRequest,
  UpdateCustomerEstimateRequest,
  CUSTOM_CHARGE_TYPE_OPTIONS,
  CustomChargeTypeOption,
  VendorPortionTitle,
} from '../../../models/on-site-estimate.model';

/**
 * Create Customer Estimate (single vendor estimate → customer estimate).
 *
 * Ports the "Creating customer estimate from vendor estimate" flow from the
 * Estimates V2 mockup (context/Estimates V2.html, custEstModal + openCustEst,
 * NOTE 17 / 17a / 17b), wired to the real backend via AssignVendorService:
 *   1. POST /create-customer-estimate   — seed the customer estimate from the vendor estimate
 *   2. PUT  /update-customer-estimate    — persist edits (qty/rate/description, custom lines, admin fee)
 *   3. POST /send-customer-estimate-email — "Save & Send to Customer"
 *
 * Layout is interleaved & sectioned: each customer line renders full width and
 * inline-editable, with its read-only vendor source row directly above it.
 * Below the lines sits the shared "Admin Markup and Added Charge Types" block
 * (admin-fee line + custom added charges) and the GRAND TOTAL.
 *
 * The minimum-markup save gate (Emergency 50% / Non-Emergency 40% of vendor
 * cost, per NOTE 17a) blocks a plain Save below the floor but allows an explicit
 * "Send For Approval" override.
 */

/** Local editable row: a live customer line plus its immutable vendor source. */
interface CeRow {
  chargeType: string;
  chargeTypeKey: string;
  description: string;

  vendorRate: number;
  vendorQty: number;
  vendorAmount: number;

  customerRate: number;
  customerQty: number;

  profileMarkupPercent?: number;
  lineType: CustomerEstimateLineItem['lineType'];
  costIncurred: number;

  /** Present once persisted; blank for a brand-new custom charge. */
  customerEstimateDetailKey?: string;
  /**
   * Link back to the source vendor estimate detail (materials/trip detail key or labor key).
   * Echoed back on save so a seeded vendor line re-inserted server-side keeps its vendor linkage —
   * otherwise its vendorRate/qty/amount read back as 0. Absent for admin-added custom charges.
   */
  vendorEstimateDetailKey?: string;
  /** Ad-hoc admin-added charge (no vendor counterpart). */
  isCustomLineItem: boolean;
  /**
   * The vendor estimate this line originated from, for multi-vendor merges (see
   * {@link CreateCustomerEstimateModalComponent.open}'s `vendorEstimateKeys` option). Used to render
   * vendor section headers in the grid. Undefined for single-vendor estimates.
   */
  sourceVendorEstimateKey?: string;
  /**
   * Admin-entered portion title for this line's vendor group (e.g. "Plumbing Portion of Quote"),
   * echoed from the backend's JobSalesOrderToVestimate.PortionTitle. Undefined when no title was
   * set for that vendor — the group header falls back to the plain vendor name.
   */
  sourcePortionTitle?: string;
}

/** A group of rows sharing the same source vendor, for the multi-vendor grid's section headers. */
interface VendorRowGroup {
  vendorEstimateKey: string | undefined;
  vendorName: string;
  /** Admin-editable portion title for this vendor's section (e.g. "Plumbing Portion of Quote"). */
  portionTitle: string;
  rows: CeRow[];
  subtotal: number;
}

@Component({
  selector: 'app-create-customer-estimate-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, NgTemplateOutlet],
  templateUrl: './create-customer-estimate-modal.component.html',
  styleUrls: ['./create-customer-estimate-modal.component.scss'],
})
export class CreateCustomerEstimateModalComponent {
  private readonly assignVendorSvc = inject(AssignVendorService);
  private readonly dynMinMarkupSvc = inject(DynMinMarkupService);
  private readonly depositSvc = inject(DepositService);

  /** Fired the first time a customer estimate is persisted, so the host can refresh (e.g. flip the button to "View"). */
  readonly customerEstimateCreated = output<{ customerEstimateKey: string; customerTotal: number }>();

  /**
   * Asks the host to open the send-to-customer dialog for a persisted estimate. `isResend` is true
   * for a plain resend, so the host can skip post-creation follow-ups such as the deposit prompt.
   */
  readonly sendRequested = output<{ customerEstimateKey: string; isResend: boolean }>();

  /**
   * Path 2 — "Save As Invoice": asks the host to convert THIS saved customer estimate into a customer
   * invoice. Only meaningful for an already-persisted estimate (edit/view mode); the host opens the
   * Create Customer Invoice modal seeded from this key.
   */
  readonly saveAsInvoiceRequested = output<{ customerEstimateKey: string }>();

  // ── Visibility / context ──────────────────────────────────────
  readonly isVisible = signal(false);
  readonly jobKey = signal<string>('');
  readonly vendorEstimateKey = signal<string>('');
  /**
   * Set (2+ entries) when this session is a multi-vendor merge ("Combine Vendor Estimates").
   * Empty for the ordinary single-vendor flow, which continues to use `vendorEstimateKey` alone.
   */
  readonly vendorEstimateKeys = signal<string[]>([]);
  readonly isMultiVendor = computed(() => this.vendorEstimateKeys().length >= 2);
  /** vendorEstimateKey → display name, for grouping the multi-vendor grid by vendor. */
  readonly vendorNamesByKey = signal<Record<string, string>>({});
  readonly customerKey = signal<string>('');
  readonly vendorName = signal<string>('');
  readonly estimateNo = signal<string>('');
  readonly customerEmail = signal<string | null>(null);

  /** Emergency job → 50% minimum markup floor; otherwise 40% (NOTE 17a). */
  readonly isEmergency = signal(false);

  /**
   * The customer's dynamic minimum-markup policy, loaded on open from GET /api/DynMinMarkup.
   * Null until loaded (or when no customerKey was supplied); the save gate falls back to the
   * legacy 50/40 defaults in that case so behaviour is safe if the policy can't be fetched.
   */
  readonly minMarkupPolicy = signal<DynMinMarkupPolicy | null>(null);

  /**
   * - 'create' = build a NEW customer estimate from the vendor estimate (editable;
   *   nothing persisted until Save / Save & Send). Allowed even when one already exists.
   * - 'edit'   = load the existing customer estimate and edit it in place (editable).
   * - 'view'   = load the existing customer estimate read-only.
   */
  readonly mode = signal<'create' | 'edit' | 'view'>('create');
  readonly isReadOnly = computed(() => this.mode() === 'view');
  /** Both create and edit render editable inputs and can persist. */
  readonly isEditable = computed(() => this.mode() !== 'view');
  /**
   * True once the loaded data reflects a persisted customer estimate (view mode, or a
   * create-mode session whose preview endpoint wasn't available and fell back to the
   * persisting create endpoint). Drives create-vs-update on Save.
   */
  readonly isPersisted = signal(false);

  // ── State ─────────────────────────────────────────────────────
  readonly isLoading = signal(false);
  readonly isSaving = signal(false);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');

  readonly customerEstimateKey = signal<string | null>(null);
  readonly estimateTitle = signal('');
  readonly rows = signal<CeRow[]>([]);
  readonly extras = signal<CeRow[]>([]);
  /**
   * Admin-edited portion titles for a multi-vendor merge's vendor groups (e.g. "Plumbing Portion of
   * Quote"), keyed by vendorEstimateKey. Seeded from each row's `sourcePortionTitle` on load/create,
   * then edited in place via the per-group title input; sent back as `vendorPortionTitles` on save.
   * Empty for single-vendor estimates.
   */
  readonly portionTitleOverrides = signal<Map<string, string>>(new Map());
  readonly adminOn = signal(true);
  readonly adminMarkupPercent = signal(0);
  readonly adminMarkupLineItemKey = signal<string | null>(null);

  /**
   * Edit mode only: customerEstimateDetailKeys of rows removed from the grid this session.
   * UpdateCustomerEstimateAsync only removes a persisted line when it's explicitly sent back with
   * isDeleted:true — simply omitting a row from the save payload (as create mode does, since
   * nothing is persisted yet to omit FROM) does not delete it server-side. Cleared on open()/save.
   */
  private deletedLineItemKeys: string[] = [];

  // ── History tabs (view/edit) ──────────────────────────────────
  // The immediately-previous, archived estimate (read-only summary), or null when there's no history.
  readonly previousEstimate = signal<ArchivedCustomerEstimateSummary | null>(null);
  /**
   * Create mode only: the prior customer estimate's deposit amount, when that deposit was set but
   * never paid. Creating a new customer estimate replaces the job's live JobSalesInvoice row, and the
   * deposit fields (Isdeposit/DepositAmount) do NOT carry forward onto the replacement — so an unpaid
   * deposit decision on the estimate being superseded would otherwise be silently dropped with no
   * indication to the admin. Populated by a best-effort lookup in loadPreview(); left at 0 (no banner)
   * if the job has no prior estimate, the prior deposit was already paid, or the lookup fails.
   */
  readonly priorUnpaidCustomerDeposit = signal(0);
  readonly showPriorDepositNotice = computed(() => this.priorUnpaidCustomerDeposit() > 0);
  readonly priorDepositNoticeText = computed(
    () =>
      `The current customer estimate for this job has an unpaid deposit of ` +
      `${this.formatCurrency(this.priorUnpaidCustomerDeposit())} set on it. Creating a new customer ` +
      `estimate will replace it, and that deposit will no longer be tracked — set the deposit again ` +
      `on the new estimate if it's still needed.`,
  );
  /**
   * True while THIS estimate's own customer deposit is routed to an SVC manager and still awaiting
   * approval (DepositApprovalFromSVCmanager.IsApproved == null for some recipient). Refreshed by
   * {@link refreshDepositApprovalStatus} whenever applyResponse() loads a persisted estimate — Save &
   * Send / Resend must not fire while this is true, since the deposit hasn't cleared yet.
   */
  readonly customerDepositApprovalPending = signal(false);
  // Which tab is active in view/edit: 'current' (the live estimate) or 'previous' (read-only archive).
  readonly activeTab = signal<'current' | 'previous'>('current');
  // True while the Previous tab is selected — the whole grid is read-only and vendor columns are hidden.
  readonly viewingArchived = computed(() => this.activeTab() === 'previous');

  /**
   * Server-computed propose-then-confirm fix for an under-minimum-markup estimate, from the
   * `adjustmentProposal` field on the preview/create/update response. Non-null means nothing was
   * persisted by the call that produced it — the admin must accept, override, or edit and retry
   * before anything saves. This (not the client-side minMarkupPercent()/activeMinMarkupRow() math,
   * which remain informational-only for the "Minimum Markup Values" popover) is the single source of
   * truth for blocking Save.
   */
  readonly adjustmentProposal = signal<DynMinMarkupAdjustmentProposal | null>(null);
  /** Which Save button (plain save vs. save & mail) triggered the in-flight proposal. */
  readonly pendingDecisionMode = signal<'save' | 'mail' | null>(null);
  /**
   * True once the admin has seen a proposal and chosen to edit manually rather than accept it. The
   * NEXT Save is then sent as ManualOverride with the current grid contents, instead of a fresh
   * (undecided) attempt that would just surface the same proposal again.
   */
  readonly awaitingManualMarkupFix = signal(false);
  /**
   * A proposal the admin accepted. Accepting only applies the numbers to the grid locally (nothing
   * is persisted and no email is sent) — this holds the accepted proposal so the NEXT Save commits
   * it as AcceptProposed rather than as a fresh, undecided attempt.
   */
  readonly acceptedProposal = signal<DynMinMarkupAdjustmentProposal | null>(null);

  /**
   * Client-side-only propose-then-confirm proposal: editing a Trip charge row's Qty or Rate computes
   * the $ delta that edit caused and offers to REDIRECT it entirely to the first Labor row on the same
   * grid — accepting reverts the Trip row to its pre-edit Qty/Rate and adds the equivalent hours to
   * Labor instead, so the Trip charge itself never actually changes. Deliberately reconsidered from the
   * legacy V1 behavior documented in context/TripChargeToLaborCrossWrite_Handoff.md — V1 applied
   * silently, kept the Trip edit AND bumped Labor (additive, not a redirect), and rounded up to the
   * nearest 0.5; this version requires an explicit accept, never changes Trip's rate/qty, and solves
   * exactly for the delta (no step-rounding). Creation-mode grid (`rows()`) only — never `extras()`,
   * and never on the separate edit-existing-estimate flow, matching V1's own scope. Purely local: no
   * HTTP call backs this, unlike `adjustmentProposal` above.
   */
  readonly tripCrossWriteProposal = signal<{
    tripRowIndex: number;
    laborRowIndex: number;
    delta: number;
    currentHours: number;
    additionalHours: number;
    resultingHours: number;
    laborRate: number;
    /** Trip row's Qty/Rate before the edit that triggered this proposal — restored on accept. */
    originalTripQty: number;
    originalTripRate: number;
  } | null>(null);

  // Delete-confirmation modal. Holds the line targeted for deletion until the
  // admin confirms; null when the modal is closed.
  readonly pendingDelete = signal<{ index: number; isExtra: boolean } | null>(null);

  // "Add more line item" controls
  readonly customChargeTypeOptions: CustomChargeTypeOption[] = CUSTOM_CHARGE_TYPE_OPTIONS;
  readonly newChargeKey = signal<string>('');
  readonly newRate = signal<number>(0);
  readonly newQty = signal<number>(1);
  readonly newCostIncurred = signal<number>(1); // 1 = Proposed, 0 = Incurred

  /** Minimum-markup popover toggle (template-only local state). */
  showMinPop = false;

  /**
   * Rows bucketed by source vendor, in the order each vendor's group first appears — for the
   * multi-vendor grid's section headers ("Vendor A — N lines"). Only meaningful when
   * {@link isMultiVendor} is true; the template falls back to the flat `rows()` list otherwise.
   */
  readonly groupedRows = computed<VendorRowGroup[]>(() => {
    const names = this.vendorNamesByKey();
    const overrides = this.portionTitleOverrides();
    const groups: VendorRowGroup[] = [];
    const byKey = new Map<string, VendorRowGroup>();

    for (const row of this.rows()) {
      const key = row.sourceVendorEstimateKey ?? '';
      let group = byKey.get(key);
      if (!group) {
        group = {
          vendorEstimateKey: row.sourceVendorEstimateKey,
          vendorName: names[key] || 'Vendor',
          portionTitle: overrides.get(key) ?? row.sourcePortionTitle ?? '',
          rows: [],
          subtotal: 0,
        };
        byKey.set(key, group);
        groups.push(group);
      }
      group.rows.push(row);
      group.subtotal += row.customerRate * row.customerQty;
    }
    return groups;
  });

  /** Admin edits a vendor group's portion title (multi-vendor merge only). */
  setPortionTitle(vendorEstimateKey: string | undefined, title: string): void {
    if (!vendorEstimateKey) return;
    const next = new Map(this.portionTitleOverrides());
    next.set(vendorEstimateKey, title);
    this.portionTitleOverrides.set(next);
  }

  /**
   * Builds the `vendorPortionTitles` save payload from the current groups' titles. Blank titles are
   * still included (as `undefined`/empty) rather than omitted, so clearing a previously-set title
   * actually clears it server-side instead of leaving the old value in place.
   */
  private buildVendorPortionTitles(): VendorPortionTitle[] {
    return this.groupedRows()
      .filter((g) => g.vendorEstimateKey)
      .map((g) => ({
        vendorEstimateKey: g.vendorEstimateKey!,
        portionTitle: g.portionTitle.trim() || undefined,
      }));
  }

  // ── Derived totals ────────────────────────────────────────────
  readonly vendorTotal = computed(() =>
    this.rows().reduce((sum, r) => sum + r.vendorAmount, 0),
  );
  readonly lineSubtotal = computed(() =>
    this.rows().reduce((sum, r) => sum + r.customerRate * r.customerQty, 0),
  );
  readonly extrasSubtotal = computed(() =>
    this.extras().reduce((sum, r) => sum + r.customerRate * r.customerQty, 0),
  );
  readonly adminFee = computed(() =>
    this.adminOn() ? (this.lineSubtotal() + this.extrasSubtotal()) * this.adminMarkupPercent() / 100 : 0,
  );
  readonly grandTotal = computed(() => this.lineSubtotal() + this.extrasSubtotal() + this.adminFee());
  readonly grandMarkupPercent = computed(() => {
    const v = this.vendorTotal();
    return v > 0 ? (this.grandTotal() - v) / v * 100 : 0;
  });
  /**
   * Cost tiers for the minimum-markup popover table, sorted ascending by cost-over-value
   * (lowest first) for display. The backend returns them in save/RowNumber order, which isn't
   * necessarily cost order, so this is a display-only sort — {@link minMarkupPercent} and
   * {@link activeMinMarkupRow} keep their own separate (descending) sorted copy for precedence.
   */
  readonly sortedMinMarkupTiers = computed(() => {
    const policy = this.minMarkupPolicy();
    if (!policy) return [];
    return [...policy.overValuesWithMarkupPercentages].sort(
      (a, b) => a.costOverValue - b.costOverValue,
    );
  });

  /**
   * Required minimum markup %, resolved from the customer's policy against the current vendor
   * total (mirrors the backend precedence, §6.2: highest cost tier the vendor total strictly
   * exceeds wins; else emergency/non-emergency). Falls back to the legacy 50/40 when no policy
   * is loaded, so the gate still works if the API is unreachable.
   */
  readonly minMarkupPercent = computed(() => {
    const policy = this.minMarkupPolicy();
    const fallback = this.isEmergency() ? 50 : 40;
    if (!policy) {
      return fallback;
    }

    const basis = this.vendorTotal();
    const tier = [...policy.overValuesWithMarkupPercentages]
      .filter((t) => t.costOverValue > 0 && t.markupPercentage > 0)
      .sort((a, b) => b.costOverValue - a.costOverValue)
      .find((t) => basis > t.costOverValue);
    if (tier) {
      return tier.markupPercentage;
    }

    const pct = this.isEmergency()
      ? policy.markupPercentageForEmergency
      : policy.markupPercentageForNonEmergency;
    return pct > 0 ? pct : fallback;
  });

  /**
   * Identifies WHICH row of the minimum-markup popover table is currently in effect for this
   * estimate's vendor total, so the popover can highlight it. Mirrors {@link minMarkupPercent}'s
   * precedence exactly (cost tier the vendor total strictly exceeds wins; else emergency/non-emergency)
   * but returns the row identity instead of just the percentage. Null when no policy is loaded (the
   * popover falls back to the static 50/40 table in that case, with nothing to highlight against).
   */
  readonly activeMinMarkupRow = computed<{ kind: 'emergency' | 'nonEmergency' | 'tier'; costOverValue?: number } | null>(() => {
    const policy = this.minMarkupPolicy();
    if (!policy) {
      return null;
    }

    const basis = this.vendorTotal();
    const tier = [...policy.overValuesWithMarkupPercentages]
      .filter((t) => t.costOverValue > 0 && t.markupPercentage > 0)
      .sort((a, b) => b.costOverValue - a.costOverValue)
      .find((t) => basis > t.costOverValue);
    if (tier) {
      return { kind: 'tier', costOverValue: tier.costOverValue };
    }

    return { kind: this.isEmergency() ? 'emergency' : 'nonEmergency' };
  });

  // ── Public API ────────────────────────────────────────────────

  /**
   * Open the modal for the given vendor estimate in one of three modes:
   *
   * - `mode: 'create'` (default) → build a NEW customer estimate: shows a non-persisted
   *   preview (via previewCustomerEstimate, falling back to createCustomerEstimate if that
   *   endpoint isn't available yet). Nothing is written until Save / Save & Send. Allowed
   *   even when a customer estimate already exists — this spawns another one.
   * - `mode: 'edit'` → load the already-existing customer estimate, fully editable, and
   *   persist changes in place on Save.
   * - `mode: 'view'` → load the already-existing customer estimate read-only.
   *
   * `jobKey` and one of `vendorEstimateKey` / `vendorEstimateKeys` are required; the rest tune the
   * header and save-gate copy. Pass `vendorEstimateKeys` (2+ entries, with `vendorNames` for the
   * grid's group headers) for a multi-vendor merge ("Combine Vendor Estimates") — only valid with
   * `mode: 'create'`; edit/view always load a single already-persisted customer estimate by job.
   */
  open(opts: {
    jobKey: string;
    vendorEstimateKey?: string;
    vendorEstimateKeys?: string[];
    vendorNames?: Record<string, string>;
    mode?: 'create' | 'edit' | 'view';
    customerKey?: string;
    vendorName?: string;
    estimateNo?: string;
    customerEmail?: string | null;
    isEmergency?: boolean;
  }): void {
    const mode = opts.mode ?? 'create';
    const multiKeys = mode === 'create' ? (opts.vendorEstimateKeys ?? []).filter(Boolean) : [];
    this.jobKey.set(opts.jobKey);
    this.vendorEstimateKey.set(opts.vendorEstimateKey ?? '');
    this.vendorEstimateKeys.set(multiKeys.length >= 2 ? multiKeys : []);
    this.vendorNamesByKey.set(opts.vendorNames ?? {});
    this.customerKey.set(opts.customerKey ?? '');
    this.vendorName.set(opts.vendorName ?? '');
    this.estimateNo.set(opts.estimateNo ?? '');
    this.customerEmail.set(opts.customerEmail ?? null);
    this.isEmergency.set(opts.isEmergency ?? false);
    this.mode.set(mode);

    this.isVisible.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');
    this.adjustmentProposal.set(null);
    this.pendingDecisionMode.set(null);
    this.awaitingManualMarkupFix.set(false);
    this.acceptedProposal.set(null);
    this.tripCrossWriteProposal.set(null);
    this.customerEstimateKey.set(null);
    this.isPersisted.set(false);
    this.estimateTitle.set('');
    this.previousEstimate.set(null);
    this.priorUnpaidCustomerDeposit.set(0);
    this.customerDepositApprovalPending.set(false);
    this.activeTab.set('current');
    this.rows.set([]);
    this.extras.set([]);
    this.portionTitleOverrides.set(new Map());
    this.adminOn.set(true);
    this.adminMarkupPercent.set(0);
    this.adminMarkupLineItemKey.set(null);
    this.deletedLineItemKeys = [];
    this.minMarkupPolicy.set(null);

    this.loadMinMarkupPolicy();

    // Create builds a fresh preview from the vendor estimate(s); edit and view both load
    // the existing customer estimate (edit stays editable, view is read-only).
    if (mode === 'create') {
      this.loadPreview();
      this.checkPriorUnpaidDeposit();
    } else {
      this.loadExisting();
    }
  }

  /**
   * Create mode only: looks up whether the job's current (about-to-be-superseded) customer estimate
   * has an unpaid deposit set, so the admin can be warned before that decision is silently dropped —
   * see {@link priorUnpaidCustomerDeposit}. Best-effort: any failure (no prior estimate, network
   * error) just leaves the notice hidden rather than blocking estimate creation.
   */
  private checkPriorUnpaidDeposit(): void {
    this.assignVendorSvc.getCustomerEstimateHistory(this.jobKey()).subscribe({
      next: (historyRes) => {
        const priorKey = historyRes.status ? historyRes.data?.current?.customerEstimateKey : null;
        if (!priorKey) return;

        this.depositSvc.getDepositContextForCustomerEstimate(priorKey).subscribe({
          next: (depositRes) => {
            if (depositRes.status && depositRes.data?.customerDepositUnpaid) {
              this.priorUnpaidCustomerDeposit.set(depositRes.data.customerDepositAmount);
            }
          },
          error: () => {}, // best-effort — no notice on failure
        });
      },
      error: () => {}, // best-effort — no notice on failure
    });
  }

  /**
   * Refreshes {@link customerDepositApprovalPending} for the estimate now on screen. Best-effort: a
   * lookup failure leaves the previous value in place rather than resetting to false, since silently
   * clearing a real pending-approval block on a transient network error would let Save & Send /
   * Resend through when they shouldn't be.
   */
  private refreshDepositApprovalStatus(customerEstimateKey: string): void {
    this.depositSvc.getDepositContextForCustomerEstimate(customerEstimateKey).subscribe({
      next: (res) => {
        if (res.status && res.data) {
          this.customerDepositApprovalPending.set(res.data.customerDepositApprovalPending);
        }
      },
      error: () => {}, // best-effort — leave the prior value in place
    });
  }

  /**
   * Opens the in-app modal that warns the admin about deleting a line item and
   * asks for confirmation. The actual removal happens in confirmDelete() once
   * the admin confirms; cancelDelete() dismisses without changes.
   */
  requestDelete(index: number, isExtra: boolean): void {
    this.pendingDelete.set({ index, isExtra });
  }

  /** Confirm the pending deletion and remove the targeted line. */
  confirmDelete(): void {
    const pending = this.pendingDelete();
    if (!pending) return;
    if (pending.isExtra) {
      this.deleteExtra(pending.index);
    } else {
      this.deleteRow(pending.index);
    }
    this.pendingDelete.set(null);
  }

  /** Dismiss the delete-confirmation modal without removing anything. */
  cancelDelete(): void {
    this.pendingDelete.set(null);
  }

  /**
   * Loads the customer's dynamic minimum-markup policy so the save gate and the reference
   * popover reflect live values. Best-effort: on any failure (no customerKey, network, 404)
   * the policy stays null and the gate falls back to the legacy 50/40 defaults.
   */
  private loadMinMarkupPolicy(): void {
    const customerKey = this.customerKey();
    if (!customerKey) {
      return;
    }
    this.dynMinMarkupSvc.getPolicy(customerKey).subscribe({
      next: (policy) => this.minMarkupPolicy.set(policy),
      error: () => this.minMarkupPolicy.set(null),
    });
  }

  close(): void {
    this.isVisible.set(false);
  }

  /** Path 2: "Save As Invoice" is available only for an already-saved estimate (edit/view mode). */
  readonly canSaveAsInvoice = computed(
    () => this.mode() !== 'create' && this.isPersisted() && !!this.customerEstimateKey(),
  );

  /** Emit the Save-As-Invoice request to the host and close this editor. */
  requestSaveAsInvoice(): void {
    const key = this.customerEstimateKey();
    if (!key) return;
    this.saveAsInvoiceRequested.emit({ customerEstimateKey: key });
    this.isVisible.set(false);
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value || 0);
  }

  /**
   * Per-line markup %, compared amount-to-amount (not rate-to-rate) — a rate-only comparison
   * would miss any change to qty/hours entirely (e.g. accepting the minimum-markup proposal's
   * hours bump changes customerAmount but never customerRate).
   */
  actualMarkup(r: CeRow): number {
    const vendorAmount = r.vendorRate * r.vendorQty;
    return vendorAmount > 0 ? (r.customerRate * r.customerQty - vendorAmount) / vendorAmount * 100 : 0;
  }

  // ── Load ──────────────────────────────────────────────────────

  /**
   * CREATE mode: show a non-persisted preview. Tries the dry-run preview endpoint first;
   * if it isn't available yet (404 / error), falls back to createCustomerEstimate — which
   * DOES persist, so in that case we mark the session as already-persisted.
   */
  private loadPreview(): void {
    this.isLoading.set(true);

    if (this.isMultiVendor()) {
      this.assignVendorSvc
        .previewMultiVendorCustomerEstimate(this.vendorEstimateKeys())
        .subscribe({
          next: (res) => {
            if (res.status && res.data) {
              this.isLoading.set(false);
              this.applyResponse(res.data, false);
              // Advisory on preview — nothing persisted either way, but surface it up front.
              this.adjustmentProposal.set(res.data.adjustmentProposal ?? null);
            } else {
              this.fallbackCreate();
            }
          },
          error: () => this.fallbackCreate(),
        });
      return;
    }

    this.assignVendorSvc
      .previewCustomerEstimate(this.vendorEstimateKey())
      .subscribe({
        next: (res) => {
          if (res.status && res.data) {
            this.isLoading.set(false);
            this.applyResponse(res.data, false); // preview only — not yet persisted
            // Advisory on preview — nothing persisted either way, but surface it up front.
            this.adjustmentProposal.set(res.data.adjustmentProposal ?? null);
          } else {
            // Preview endpoint not built yet (or failed) — fall back to the persisting create.
            this.fallbackCreate();
          }
        },
        error: () => this.fallbackCreate(),
      });
  }

  private fallbackCreate(): void {
    const request = this.isMultiVendor()
      ? { vendorEstimateKey: '', vendorEstimateKeys: this.vendorEstimateKeys() }
      : { vendorEstimateKey: this.vendorEstimateKey() };

    this.assignVendorSvc
      .createCustomerEstimate(request)
      .subscribe({
        next: (res) => {
          this.isLoading.set(false);
          if (res.status && res.data) {
            this.applyResponse(res.data, true); // create endpoint persists
          } else {
            this.errorMessage.set(res.message || 'Failed to build customer estimate.');
          }
        },
        error: () => {
          this.isLoading.set(false);
          this.errorMessage.set('Failed to build customer estimate.');
        },
      });
  }

  /**
   * VIEW/EDIT mode: load the job's customer-estimate history — the current live estimate plus, if it
   * superseded one, a read-only summary of the immediately-previous archived version (rendered as a
   * second tab). The current estimate populates the editable grid via applyResponse.
   */
  private loadExisting(): void {
    this.isLoading.set(true);
    this.assignVendorSvc
      .getCustomerEstimateHistory(this.jobKey())
      .subscribe({
        next: (res) => {
          this.isLoading.set(false);
          if (res.status && res.data) {
            this.previousEstimate.set(res.data.previous);
            if (res.data.current) {
              this.applyResponse(res.data.current, true);
            } else {
              this.errorMessage.set('No customer estimate found for this job.');
            }
          } else {
            this.errorMessage.set(res.message || 'Failed to load customer estimate.');
          }
        },
        error: () => {
          this.isLoading.set(false);
          this.errorMessage.set('Failed to load customer estimate.');
        },
      });
  }

  private applyResponse(data: CreateCustomerEstimateResponse, persisted: boolean): void {
    this.isPersisted.set(persisted);
    this.customerEstimateKey.set(data.customerEstimateKey);
    this.adminMarkupLineItemKey.set(data.adminMarkupLineItemKey ?? null);

    // Only a persisted estimate has a meaningful key/approval state to check — a non-persisted
    // preview's customerEstimateKey is empty, and nothing can be sent from it anyway.
    if (persisted && data.customerEstimateKey) {
      this.refreshDepositApprovalStatus(data.customerEstimateKey);
    } else {
      this.customerDepositApprovalPending.set(false);
    }

    const rows: CeRow[] = [];
    const extras: CeRow[] = [];
    let adminPct = 0;

    for (const li of data.lineItems ?? []) {
      // The backend appends the synthetic "Admin Fee" row into lineItems; pull
      // its percent out for the admin block rather than showing it as a line.
      if (li.chargeTypeKey === 'ADMIN_MARKUP' || /admin\s*fee/i.test(li.chargeType)) {
        adminPct = li.profileMarkupPercent ?? li.calculatedMarkupPercent ?? 0;
        if (li.customerEstimateDetailKey) this.adminMarkupLineItemKey.set(li.customerEstimateDetailKey);
        continue;
      }
      const row: CeRow = {
        chargeType: li.chargeType,
        chargeTypeKey: li.chargeTypeKey,
        description: li.description,
        vendorRate: li.vendorRate,
        vendorQty: li.vendorQty,
        vendorAmount: li.vendorAmount,
        customerRate: li.customerRate,
        customerQty: li.customerQty,
        profileMarkupPercent: li.profileMarkupPercent,
        lineType: li.lineType,
        costIncurred: li.costIncurred,
        customerEstimateDetailKey: li.customerEstimateDetailKey,
        // The backend stores labor keys in the same VendorEstimateDetailKey column, so prefer it and
        // fall back to the labor key. Echoed back on save to preserve the vendor linkage.
        vendorEstimateDetailKey: li.vendorEstimateDetailKey ?? li.vendorEstimateLaborKey,
        isCustomLineItem: !!li.isCustomLineItem,
        sourceVendorEstimateKey: li.sourceVendorEstimateKey,
        sourcePortionTitle: li.sourcePortionTitle,
      };
      if (li.isCustomLineItem) extras.push(row);
      else rows.push(row);
    }

    this.rows.set(rows);
    this.extras.set(extras);
    this.adminMarkupPercent.set(adminPct);
    this.adminOn.set(adminPct > 0);
  }

  // ── Editing ───────────────────────────────────────────────────

  editRow(index: number, field: 'description' | 'customerQty' | 'customerRate', value: string): void {
    const before = this.rows()[index];
    const beforeAmount = before ? before.customerRate * before.customerQty : 0;

    this.rows.update((rows) => {
      const next = [...rows];
      const r = { ...next[index] };
      if (field === 'description') r.description = value;
      else if (field === 'customerQty') r.customerQty = parseFloat(value) || 0;
      else r.customerRate = parseFloat(value) || 0;
      next[index] = r;
      return next;
    });

    // Trip→Labor cross-write proposal — creation mode, main grid only (see tripCrossWriteProposal doc).
    if (this.mode() === 'create' && field !== 'description' && before?.lineType === 'trip') {
      this.computeTripCrossWriteProposal(index, beforeAmount, before.customerQty, before.customerRate);
    }
  }

  /**
   * Computes (but does not apply) a propose-then-confirm Trip→Labor redirect after a Trip row's
   * Qty/Rate changed. No-op if the edit didn't change the row's dollar amount, or if there's no Labor
   * row on the grid to target. Captures the Trip row's pre-edit Qty/Rate so accepting can revert it —
   * accepting redirects the change to Labor entirely, it never leaves Trip modified.
   */
  private computeTripCrossWriteProposal(
    tripRowIndex: number,
    beforeAmount: number,
    originalTripQty: number,
    originalTripRate: number,
  ): void {
    const rows = this.rows();
    const tripRow = rows[tripRowIndex];
    if (!tripRow) return;

    const afterAmount = tripRow.customerRate * tripRow.customerQty;
    const delta = Math.abs(afterAmount - beforeAmount);
    if (delta === 0) {
      return;
    }

    const laborRowIndex = rows.findIndex((r) => r.lineType === 'labor');
    if (laborRowIndex === -1) {
      return;
    }

    const laborRow = rows[laborRowIndex];
    if (laborRow.customerRate <= 0) {
      return;
    }

    const additionalHours = delta / laborRow.customerRate;

    this.tripCrossWriteProposal.set({
      tripRowIndex,
      laborRowIndex,
      delta,
      currentHours: laborRow.customerQty,
      additionalHours,
      resultingHours: laborRow.customerQty + additionalHours,
      laborRate: laborRow.customerRate,
      originalTripQty,
      originalTripRate,
    });
  }

  /**
   * Admin accepts the Trip→Labor cross-write proposal: the Trip row reverts to its pre-edit Qty/Rate
   * (the trip charge itself never actually changes) and the equivalent hours are added to the Labor
   * row instead — a redirect, not an additional change on top of the Trip edit.
   */
  applyTripCrossWrite(): void {
    const proposal = this.tripCrossWriteProposal();
    if (!proposal) return;

    this.rows.update((rows) => {
      const next = [...rows];
      const tripRow = next[proposal.tripRowIndex];
      if (tripRow) {
        next[proposal.tripRowIndex] = {
          ...tripRow,
          customerQty: proposal.originalTripQty,
          customerRate: proposal.originalTripRate,
        };
      }
      const laborRow = next[proposal.laborRowIndex];
      if (laborRow) {
        next[proposal.laborRowIndex] = { ...laborRow, customerQty: proposal.resultingHours };
      }
      return next;
    });

    this.tripCrossWriteProposal.set(null);
  }

  /** Admin declines the Trip→Labor cross-write proposal — the Labor row is left untouched. */
  dismissTripCrossWrite(): void {
    this.tripCrossWriteProposal.set(null);
  }

  deleteRow(index: number): void {
    const removed = this.rows()[index];
    if (removed?.customerEstimateDetailKey) this.deletedLineItemKeys.push(removed.customerEstimateDetailKey);
    this.rows.update((rows) => rows.filter((_, i) => i !== index));
  }

  editExtra(index: number, field: 'description' | 'customerQty' | 'customerRate', value: string): void {
    this.extras.update((extras) => {
      const next = [...extras];
      const r = { ...next[index] };
      if (field === 'description') r.description = value;
      else if (field === 'customerQty') r.customerQty = parseFloat(value) || 0;
      else r.customerRate = parseFloat(value) || 0;
      next[index] = r;
      return next;
    });
  }

  deleteExtra(index: number): void {
    const removed = this.extras()[index];
    if (removed?.customerEstimateDetailKey) this.deletedLineItemKeys.push(removed.customerEstimateDetailKey);
    this.extras.update((extras) => extras.filter((_, i) => i !== index));
  }

  addLine(): void {
    const opt = this.customChargeTypeOptions.find((o) => o.key === this.newChargeKey());
    if (!opt) {
      this.errorMessage.set('Choose a charge type to add.');
      return;
    }
    this.errorMessage.set('');
    this.extras.update((extras) => [
      ...extras,
      {
        chargeType: opt.label,
        chargeTypeKey: opt.key,
        description: this.newCostIncurred() === 0 ? 'Cost Incurred (added line)' : 'Proposed (added line)',
        vendorRate: 0,
        vendorQty: 0,
        vendorAmount: 0,
        customerRate: this.newRate(),
        customerQty: this.newQty(),
        lineType: opt.lineType,
        costIncurred: this.newCostIncurred(),
        isCustomLineItem: true,
      },
    ]);
    this.newChargeKey.set('');
    this.newRate.set(0);
    this.newQty.set(1);
  }

  removeAdminFee(): void {
    this.adminOn.set(false);
  }

  restoreAdminFee(): void {
    this.adminOn.set(true);
  }

  // ── Save + minimum-markup gate ────────────────────────────────

  save(mode: 'save' | 'mail'): void {
    if (this.isReadOnly()) return;
    // A plain Save is still allowed while a deposit approval is pending — only sending to the
    // customer (mail) must wait for it to clear. Mirrors canResendEmail's gate on the read-only side.
    if (mode === 'mail' && this.customerDepositApprovalPending()) {
      this.errorMessage.set('This estimate has a customer deposit awaiting SVC-manager approval — it cannot be sent to the customer until that approval clears.');
      return;
    }
    // No client-side threshold pre-check: the server's adjustmentProposal (surfaced via
    // persist()/runUpdate() below) is the single source of truth for whether this is blocked.

    // The admin accepted the server's proposal and it's already reflected in the grid — commit it
    // as AcceptProposed so the server applies its own known-accepted numbers.
    const accepted = this.acceptedProposal();
    if (accepted) {
      this.acceptedProposal.set(null);
      this.persist(mode, MarkupAdjustmentDecision.AcceptProposed, undefined, accepted);
      return;
    }

    // If the admin dismissed a proposal to edit manually, this attempt is their fix —
    // send it as ManualOverride with whatever's currently in the grid, rather than an undecided
    // attempt that would just surface the same proposal again unchanged.
    if (this.awaitingManualMarkupFix()) {
      this.awaitingManualMarkupFix.set(false);
      this.persist(mode, MarkupAdjustmentDecision.ManualOverride, this.buildUpdateLineItems());
      return;
    }
    this.persist(mode);
  }

  /**
   * Admin accepts the server-proposed labor-hours adjustment. This only writes the proposed numbers
   * into the grid — nothing is persisted and no email is sent. Closing the proposal modal reveals
   * the updated hours and total in the grid itself, so no separate confirmation is shown. The admin
   * reviews, then clicks Save or Save & Send themselves, and that save goes as AcceptProposed (see
   * save() above). Deliberately does NOT resume the originally-clicked action: accepting a pricing
   * fix shouldn't silently commit or email an estimate the admin hasn't seen adjusted.
   */
  acceptProposedAdjustment(): void {
    const proposal = this.adjustmentProposal();
    if (!proposal) return;

    this.adjustmentProposal.set(null);
    this.pendingDecisionMode.set(null);
    this.awaitingManualMarkupFix.set(false);

    this.applyAcceptedProposalLocally(proposal);
    this.acceptedProposal.set(proposal);
  }

  /**
   * Admin wants to fix the shortfall themselves instead of accepting the proposal. Closes the
   * banner so they can edit the existing grid; the next Save resends as ManualOverride with the
   * current grid contents (see awaitingManualMarkupFix / save() above).
   */
  dismissProposedAdjustment(): void {
    this.adjustmentProposal.set(null);
    this.awaitingManualMarkupFix.set(true);
  }

  private buildUpdateLineItems(): UpdateCustomerEstimateLineItemRequest[] {
    const items: UpdateCustomerEstimateLineItemRequest[] = [];
    let tempIndex = 0;

    for (const r of [...this.rows(), ...this.extras()]) {
      items.push({
        lineItemKey: r.customerEstimateDetailKey ?? '',
        chargeType: r.chargeType,
        chargeTypeKey: r.chargeTypeKey,
        description: r.description,
        costIncurred: r.costIncurred,
        customerQty: r.customerQty,
        customerRate: r.customerRate,
        customerAmount: r.customerRate * r.customerQty,
        isNewLineItem: !r.customerEstimateDetailKey,
        tempIndex: tempIndex++,
        // Echo the vendor linkage so a seeded vendor line re-inserted server-side keeps its
        // vendor rate/qty/amount (see CeRow.vendorEstimateDetailKey). Undefined for admin-added lines.
        vendorEstimateDetailKey: r.vendorEstimateDetailKey,
        // Echo the source vendor so a re-saved line keeps its vendor-group label (multi-vendor only).
        sourceVendorEstimateKey: r.sourceVendorEstimateKey,
      });
    }

    // Synthetic Admin Fee row, recomputed from the current subtotal.
    if (this.adminOn() && this.adminMarkupPercent() > 0) {
      items.push({
        lineItemKey: this.adminMarkupLineItemKey() ?? '',
        chargeType: 'Admin Fee',
        chargeTypeKey: 'ADMIN_MARKUP',
        description: `Admin fee ${this.adminMarkupPercent().toFixed(2)}% mark-up`,
        customerQty: 1,
        customerRate: this.adminFee(),
        customerAmount: this.adminFee(),
        isNewLineItem: !this.adminMarkupLineItemKey(),
        tempIndex: tempIndex++,
      });
    }

    // Edit mode only: rows removed from the grid this session must be sent back explicitly flagged
    // for deletion — UpdateCustomerEstimateAsync never infers a delete from a row's mere absence (see
    // deletedLineItemKeys' doc comment). Meaningless in create mode (nothing persisted yet to delete).
    if (this.isPersisted()) {
      for (const key of this.deletedLineItemKeys) {
        items.push({
          lineItemKey: key,
          isDeleted: true,
          customerQty: 0,
          customerRate: 0,
          customerAmount: 0,
          tempIndex: tempIndex++,
        });
      }
    }

    return items;
  }

  private persist(
    mode: 'save' | 'mail',
    markupAdjustmentDecision?: MarkupAdjustmentDecision,
    markupOverrideLineItems?: UpdateCustomerEstimateLineItemRequest[],
    acceptedProposal?: DynMinMarkupAdjustmentProposal,
  ): void {
    // Read-only view mode never writes.
    if (this.isReadOnly()) return;

    this.isSaving.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    // If this session is still just a preview (nothing persisted), create the customer estimate now,
    // sending the admin's edited line items WITH the create so they persist in a single atomic call.
    // (Previously this did create-then-update, which recomputed default pricing and then had to correct
    // it — fragile and prone to duplicate rows / lost edits like a typed labor rate.)
    if (!this.isPersisted() || !this.customerEstimateKey()) {
      this.assignVendorSvc
        .createCustomerEstimate({
          vendorEstimateKey: this.vendorEstimateKey(),
          ...(this.isMultiVendor()
            ? { vendorEstimateKeys: this.vendorEstimateKeys(), vendorPortionTitles: this.buildVendorPortionTitles() }
            : {}),
          lineItems: this.buildUpdateLineItems(),
          markupAdjustmentDecision,
          markupOverrideLineItems,
        })
        .subscribe({
          next: (res) => {
            if (!res.status || !res.data) {
              this.isSaving.set(false);
              this.errorMessage.set(res.message || 'Failed to create customer estimate.');
              return;
            }

            if (res.data.adjustmentProposal) {
              // Under minimum markup, nothing persisted — show the proposal instead.
              this.isSaving.set(false);
              this.adjustmentProposal.set(res.data.adjustmentProposal);
              this.pendingDecisionMode.set(mode);
              return;
            }

            this.customerEstimateKey.set(res.data.customerEstimateKey);
            this.isPersisted.set(true);
            this.customerEstimateCreated.emit({
              customerEstimateKey: res.data.customerEstimateKey,
              customerTotal: res.data.customerTotal,
            });
            // Re-hydrate rows from the persisted result so keys/computed fields (admin fee, markup%)
            // reflect what was saved; the admin's edits are already baked in by the backend overlay.
            this.applyResponse(res.data, true);

            if (mode === 'mail') {
              this.sendEmail(res.data.customerEstimateKey);
            } else {
              this.isSaving.set(false);
              this.successMessage.set('Customer estimate saved.');
            }
          },
          error: () => {
            this.isSaving.set(false);
            this.errorMessage.set('Failed to create customer estimate.');
          },
        });
      return;
    }

    this.runUpdate(this.customerEstimateKey()!, mode, markupAdjustmentDecision, markupOverrideLineItems, acceptedProposal);
  }

  private runUpdate(
    ceKey: string,
    mode: 'save' | 'mail',
    markupAdjustmentDecision?: MarkupAdjustmentDecision,
    markupOverrideLineItems?: UpdateCustomerEstimateLineItemRequest[],
    acceptedProposal?: DynMinMarkupAdjustmentProposal,
  ): void {
    const request: UpdateCustomerEstimateRequest = {
      customerEstimateKey: ceKey,
      lineItems: this.buildUpdateLineItems(),
      markupAdjustmentDecision,
      markupOverrideLineItems,
    };

    this.assignVendorSvc.updateCustomerEstimate(request).subscribe({
      next: (res) => {
        if (!res.status) {
          this.isSaving.set(false);
          this.errorMessage.set(res.message || 'Failed to save customer estimate.');
          return;
        }

        if (res.data?.adjustmentProposal) {
          // Under minimum markup, nothing persisted — show the proposal instead.
          this.isSaving.set(false);
          this.adjustmentProposal.set(res.data.adjustmentProposal);
          this.pendingDecisionMode.set(mode);
          return;
        }

        // Persist any newly-created keys so a subsequent save updates instead of duplicating.
        this.reconcileCreatedKeys(res.data);
        this.deletedLineItemKeys = [];

        // The update response carries only counts/totals, not lineItems — if the server just applied
        // an accepted proposal, patch the local grid with the known-accepted hours/total ourselves,
        // otherwise it keeps showing the pre-adjustment numbers even though the save succeeded.
        if (acceptedProposal) {
          this.applyAcceptedProposalLocally(acceptedProposal);
        }

        if (mode === 'mail') {
          this.sendEmail(ceKey);
        } else {
          this.isSaving.set(false);
          this.successMessage.set('Customer estimate saved.');
        }
      },
      error: () => {
        this.isSaving.set(false);
        this.errorMessage.set('Failed to save customer estimate.');
      },
    });
  }

  private reconcileCreatedKeys(data: unknown): void {
    const created = (data as { createdLineItems?: { tempIndex: number; lineItemKey: string }[] })
      ?.createdLineItems;
    if (!created?.length) return;

    // tempIndex ordering matches buildUpdateLineItems(): rows, then extras, then admin fee.
    const rows = this.rows();
    const extras = this.extras();
    for (const c of created) {
      if (c.tempIndex < rows.length) {
        rows[c.tempIndex] = { ...rows[c.tempIndex], customerEstimateDetailKey: c.lineItemKey };
      } else if (c.tempIndex < rows.length + extras.length) {
        const ei = c.tempIndex - rows.length;
        extras[ei] = { ...extras[ei], customerEstimateDetailKey: c.lineItemKey };
      } else {
        this.adminMarkupLineItemKey.set(c.lineItemKey);
      }
    }
    this.rows.set([...rows]);
    this.extras.set([...extras]);
  }

  /**
   * Applies an accepted minimum-markup proposal to the local grid, using the proposal's own
   * known-accepted numbers (computed server-side) rather than re-deriving anything client-side.
   *
   * Called twice in the accept flow: once when the admin accepts (so they can review the adjusted
   * estimate before saving) and again after the resulting save, because the update response carries
   * only counts/totals and no lineItems to re-hydrate from. Assigning resultingHours absolutely
   * rather than adjusting relatively keeps that second call harmless.
   */
  private applyAcceptedProposalLocally(proposal: DynMinMarkupAdjustmentProposal): void {
    const rows = this.rows();
    const next = [...rows];

    for (const adjustment of proposal.materialLineAdjustments) {
      const index = next.findIndex((r) => r.customerEstimateDetailKey === adjustment.lineItemKey);
      if (index === -1) continue;
      const row = next[index];
      const rate = row.customerQty !== 0 ? adjustment.resultingAmount / row.customerQty : row.customerRate;
      next[index] = { ...row, customerRate: rate };
    }

    for (const adjustment of proposal.laborLineAdjustments) {
      const index = next.findIndex((r) => r.customerEstimateDetailKey === adjustment.lineItemKey);
      if (index === -1) continue;
      next[index] = { ...next[index], customerQty: adjustment.resultingHours };
    }

    this.rows.set(next);
  }

  /**
   * The estimate is saved; hand off to the send dialog to choose recipients. Persisting and sending
   * are deliberately separate — this component owns the save, the send modal owns delivery.
   */
  private sendEmail(ceKey: string): void {
    this.isSaving.set(false);
    this.successMessage.set('Customer estimate saved. Choose who to send it to.');
    this.sendRequested.emit({ customerEstimateKey: ceKey, isResend: false });
  }

  /**
   * True when the estimate on screen has been persisted and so can be emailed again without
   * saving. Drives the read-only "Resend to Customer" action. Blocked while this estimate's own
   * customer deposit is still awaiting SVC-manager approval — the estimate must not reach the
   * customer until that deposit decision has cleared.
   */
  readonly canResendEmail = computed(
    () =>
      this.isPersisted() &&
      !!this.customerEstimateKey() &&
      !this.viewingArchived() &&
      !this.customerDepositApprovalPending(),
  );

  /**
   * Re-emails an already-saved customer estimate. Writes nothing first - a pure send, so no
   * minimum-markup gate applies. Available from view mode, where the estimate is read-only.
   * `isResend` tells the host not to re-run post-creation follow-ups such as the deposit prompt.
   */
  resendToCustomer(): void {
    const ceKey = this.customerEstimateKey();
    if (!ceKey || !this.isPersisted()) return;

    this.errorMessage.set('');
    this.successMessage.set('');
    this.sendRequested.emit({ customerEstimateKey: ceKey, isResend: true });
  }
}
