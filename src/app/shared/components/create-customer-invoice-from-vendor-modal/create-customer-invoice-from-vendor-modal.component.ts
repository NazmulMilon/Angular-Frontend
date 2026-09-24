import { Component, inject, signal, computed, output } from '@angular/core';
import { CommonModule, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { VendorBillsService } from '../../../services/vendor-bills.service';
import { DynMinMarkupService } from '../../../services/dyn-min-markup.service';
import { DynMinMarkupPolicy, DynMinMarkupAdjustmentProposal, MarkupAdjustmentDecision } from '../../../models/dyn-min-markup.model';
import { VendorPortionTitle, CUSTOM_CHARGE_TYPE_OPTIONS, CustomChargeTypeOption } from '../../../models/on-site-estimate.model';
import {
  CustomerInvoiceRichLineItem,
  CreateCustomerInvoiceFromVendorResponse,
  UpdateCustomerInvoiceFromVendorLineItemRequest,
  CreateCustomerInvoiceFromVendorRequest,
  CreateMultiVendorCustomerInvoiceRequest,
  CustomerInvoiceRichDetailResponse,
  UpdateCustomerInvoiceFromVendorRequest,
  UpdateCustomerInvoiceFromVendorResponse,
} from '../../../models/customer-invoice-from-vendor.model';

/**
 * Create / Edit / View Customer Invoice from Vendor Estimate (single or multi-vendor merge).
 *
 * Ported from create-customer-estimate-modal — same vendor-row/customer-row grid, minimum-markup
 * propose-then-confirm gate, multi-vendor merge with portion titles, and Trip→Labor cross-write
 * proposal, now with `mode: 'create'|'edit'|'view'` mirroring that component's pattern. Deliberately
 * DOES NOT port the estimate side's archived-version history ("Previous" tab) or "Save & Send to
 * Customer" — invoices have no archived-invoice concept, and sending stays a separate action from the
 * invoice list (Email to Customer / Send Again), not bundled into this modal's footer. See
 * /Users/cole-sathngam/.claude/plans/fizzy-sprouting-valiant.md for the full design.
 */

/** Local editable row: a live invoice line plus its immutable vendor source. */
interface CivRow {
  chargeType: string;
  chargeTypeKey: string;
  description: string;

  vendorRate: number;
  vendorQty: number;
  vendorAmount: number;

  customerRate: number;
  customerQty: number;

  profileMarkupPercent?: number;
  lineType: CustomerInvoiceRichLineItem['lineType'];
  costIncurred: number;

  /** JobSalesInvoiceDetail.DetailKey once computed (create-only — never edits an existing invoice). */
  customerEstimateDetailKey?: string;
  /** Link back to the source vendor estimate detail (materials/trip detail key or labor key). */
  vendorEstimateDetailKey?: string;
  /** Ad-hoc admin-added charge (no vendor counterpart). */
  isCustomLineItem: boolean;
  /** The vendor estimate this line originated from, for multi-vendor merges. */
  sourceVendorEstimateKey?: string;
  /** Admin-entered portion title for this line's vendor group, echoed from the backend. */
  sourcePortionTitle?: string;
}

/** A group of rows sharing the same source vendor, for the multi-vendor grid's section headers. */
interface VendorRowGroup {
  vendorEstimateKey: string | undefined;
  vendorName: string;
  portionTitle: string;
  rows: CivRow[];
  subtotal: number;
}

@Component({
  selector: 'app-create-customer-invoice-from-vendor-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, NgTemplateOutlet],
  templateUrl: './create-customer-invoice-from-vendor-modal.component.html',
  styleUrls: ['./create-customer-invoice-from-vendor-modal.component.scss'],
})
export class CreateCustomerInvoiceFromVendorModalComponent {
  private readonly vendorBillsSvc = inject(VendorBillsService);
  private readonly dynMinMarkupSvc = inject(DynMinMarkupService);

  /** Fired once the invoice is persisted, so the host can refresh the invoices/estimates grid. */
  readonly customerInvoiceCreated = output<{ customerInvoiceKey: string; invoiceNo: number | null }>();

  // ── Visibility / context ──────────────────────────────────────
  readonly isVisible = signal(false);
  /**
   * - 'create' = build a NEW invoice from the vendor estimate(s) (editable; nothing persisted until
   *   Save). - 'edit' = load an already-persisted invoice (by customerInvoiceKey) and edit it in
   *   place. - 'view' = load it read-only. No archived-history tab, unlike the estimate modal.
   */
  readonly mode = signal<'create' | 'edit' | 'view'>('create');
  readonly isReadOnly = computed(() => this.mode() === 'view');
  readonly isEditable = computed(() => this.mode() !== 'view');
  /** True once the loaded data reflects an already-persisted invoice — drives create-vs-update on Save. */
  readonly isPersisted = signal(false);
  /**
   * Set in edit/view mode when the invoice was already sent to the customer or paid — mirrors
   * EditInvoiceModalComponent's exact guard. The editable grid is not loaded at all in that case.
   */
  readonly blockedMessage = signal('');
  readonly jobKey = signal<string>('');
  readonly vendorEstimateKey = signal<string>('');
  /** Set (2+ entries) when this session is a multi-vendor merge. */
  readonly vendorEstimateKeys = signal<string[]>([]);
  readonly isMultiVendor = computed(() => this.vendorEstimateKeys().length >= 2);
  /** vendorEstimateKey → display name, for grouping the multi-vendor grid by vendor. */
  readonly vendorNamesByKey = signal<Record<string, string>>({});
  readonly customerKey = signal<string>('');
  readonly vendorName = signal<string>('');
  readonly estimateNo = signal<string>('');

  /** Emergency job → 50% minimum markup floor; otherwise 40%. */
  readonly isEmergency = signal(false);

  /**
   * The customer's dynamic minimum-markup policy, loaded on open from GET /api/DynMinMarkup. Null
   * until loaded; the save gate falls back to the legacy 50/40 defaults in that case.
   */
  readonly minMarkupPolicy = signal<DynMinMarkupPolicy | null>(null);

  // ── State ─────────────────────────────────────────────────────
  readonly isLoading = signal(false);
  readonly isSaving = signal(false);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');

  readonly customerInvoiceKey = signal<string | null>(null);
  readonly terms = signal('');
  readonly worksPerformed = signal('');
  readonly rows = signal<CivRow[]>([]);
  readonly extras = signal<CivRow[]>([]);
  /** Admin-edited portion titles for a multi-vendor merge's vendor groups, keyed by vendorEstimateKey. */
  readonly portionTitleOverrides = signal<Map<string, string>>(new Map());
  readonly adminOn = signal(false);
  readonly adminMarkupPercent = signal(0);
  readonly adminMarkupLineItemKey = signal<string | null>(null);

  /**
   * Post-save "Send this invoice to the prep manager for review?" Yes/No prompt (mirrors legacy V1's
   * "Send for Manager Review" confirmation). Set once the invoice is successfully created; the modal
   * stays open showing this prompt until the admin answers either way.
   */
  readonly pendingPrepReviewInvoiceKey = signal<string | null>(null);
  readonly sendingPrepReview = signal(false);
  readonly stagingPrepReviewFiles = signal(false);
  readonly prepReviewFileNames = signal<string[]>([]);
  prepReviewNote = '';
  private prepReviewStagedFileKeys: string[] = [];

  /**
   * Edit mode only: DetailKeys of rows removed from the grid this session. UpdateCustomerInvoiceAsync
   * only removes a persisted line when it's explicitly sent back with isDeleted:true — simply omitting
   * a row from the save payload (as create mode does, since nothing is persisted yet to omit FROM)
   * does not delete it server-side. Cleared on open()/successful save.
   */
  private deletedLineItemKeys: string[] = [];

  /**
   * Server-computed propose-then-confirm fix for an under-minimum-markup invoice, from the
   * `adjustmentProposal` field on the preview/create response. Non-null means nothing was persisted
   * by the call that produced it — the admin must accept, override, or proceed anyway before anything
   * saves.
   */
  readonly adjustmentProposal = signal<DynMinMarkupAdjustmentProposal | null>(null);
  readonly pendingDecisionMode = signal<boolean>(false);
  /**
   * True once the admin has seen a proposal and chosen to edit manually rather than accept it. The
   * NEXT Save is then sent as ManualOverride with the current grid contents.
   */
  readonly awaitingManualMarkupFix = signal(false);
  /**
   * A proposal the admin accepted. Accepting only applies the numbers to the grid locally (nothing is
   * persisted); this holds the accepted proposal so the NEXT Save commits it as AcceptProposed.
   */
  readonly acceptedProposal = signal<DynMinMarkupAdjustmentProposal | null>(null);

  /**
   * Client-side-only propose-then-confirm proposal: editing a Trip charge row's Qty or Rate computes
   * the $ delta that edit caused and offers to REDIRECT it entirely to the first Labor row on the same
   * grid. Creation-mode only — this modal has no other mode, so the gate is unconditional.
   */
  readonly tripCrossWriteProposal = signal<{
    tripRowIndex: number;
    laborRowIndex: number;
    delta: number;
    currentHours: number;
    additionalHours: number;
    resultingHours: number;
    laborRate: number;
    originalTripQty: number;
    originalTripRate: number;
  } | null>(null);

  // Delete-confirmation modal.
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
   * multi-vendor grid's section headers. Only meaningful when {@link isMultiVendor} is true.
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
  readonly sortedMinMarkupTiers = computed(() => {
    const policy = this.minMarkupPolicy();
    if (!policy) return [];
    return [...policy.overValuesWithMarkupPercentages].sort(
      (a, b) => a.costOverValue - b.costOverValue,
    );
  });

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
   * Open the modal in one of three modes:
   * - `mode: 'create'` (default) — build a NEW invoice from the vendor estimate(s). Pass
   *   `vendorEstimateKeys` (2+ entries, with `vendorNames`) for a multi-vendor merge.
   * - `mode: 'edit'`/`'view'` — load the already-persisted invoice identified by
   *   `customerInvoiceKey` (required for these two modes; invoices have no jobKey-scoped "the current
   *   one" the way estimates do, since a job can have several).
   */
  open(opts: {
    jobKey: string;
    vendorEstimateKey?: string;
    vendorEstimateKeys?: string[];
    vendorNames?: Record<string, string>;
    customerKey?: string;
    vendorName?: string;
    estimateNo?: string;
    isEmergency?: boolean;
    mode?: 'create' | 'edit' | 'view';
    customerInvoiceKey?: string;
  }): void {
    const mode = opts.mode ?? 'create';
    const multiKeys = mode === 'create' ? (opts.vendorEstimateKeys ?? []).filter(Boolean) : [];
    this.mode.set(mode);
    this.jobKey.set(opts.jobKey);
    this.vendorEstimateKey.set(opts.vendorEstimateKey ?? '');
    this.vendorEstimateKeys.set(multiKeys.length >= 2 ? multiKeys : []);
    this.vendorNamesByKey.set(opts.vendorNames ?? {});
    this.customerKey.set(opts.customerKey ?? '');
    this.vendorName.set(opts.vendorName ?? '');
    this.estimateNo.set(opts.estimateNo ?? '');
    this.isEmergency.set(opts.isEmergency ?? false);

    this.isVisible.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');
    this.blockedMessage.set('');
    this.adjustmentProposal.set(null);
    this.pendingDecisionMode.set(false);
    this.awaitingManualMarkupFix.set(false);
    this.acceptedProposal.set(null);
    this.tripCrossWriteProposal.set(null);
    this.customerInvoiceKey.set(mode === 'create' ? null : opts.customerInvoiceKey ?? null);
    this.isPersisted.set(mode !== 'create');
    this.terms.set('');
    this.worksPerformed.set('');
    this.rows.set([]);
    this.extras.set([]);
    this.portionTitleOverrides.set(new Map());
    this.adminOn.set(false);
    this.adminMarkupPercent.set(0);
    this.adminMarkupLineItemKey.set(null);
    this.pendingPrepReviewInvoiceKey.set(null);
    this.sendingPrepReview.set(false);
    this.resetPrepReviewState();
    this.deletedLineItemKeys = [];
    this.minMarkupPolicy.set(null);

    this.loadMinMarkupPolicy();

    if (mode === 'create') {
      this.loadPreview();
    } else if (opts.customerInvoiceKey) {
      this.loadExisting(opts.customerInvoiceKey);
    } else {
      this.errorMessage.set('No invoice specified to load.');
    }
  }

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

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value || 0);
  }

  /** Per-line markup %, compared amount-to-amount (not rate-to-rate). */
  actualMarkup(r: CivRow): number {
    const vendorAmount = r.vendorRate * r.vendorQty;
    return vendorAmount > 0 ? (r.customerRate * r.customerQty - vendorAmount) / vendorAmount * 100 : 0;
  }

  requestDelete(index: number, isExtra: boolean): void {
    this.pendingDelete.set({ index, isExtra });
  }

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

  cancelDelete(): void {
    this.pendingDelete.set(null);
  }

  // ── Load ──────────────────────────────────────────────────────

  private loadPreview(): void {
    this.isLoading.set(true);

    if (this.isMultiVendor()) {
      this.vendorBillsSvc
        .previewMultiVendorCustomerInvoice(this.vendorEstimateKeys())
        .subscribe((res) => {
          this.isLoading.set(false);
          if (res.status && res.data) {
            this.applyResponse(res.data);
            this.adjustmentProposal.set(res.data.adjustmentProposal ?? null);
          } else {
            this.errorMessage.set(res.message || 'Failed to build customer invoice preview.');
          }
        });
      return;
    }

    this.vendorBillsSvc
      .previewGatedInvoiceFromVendorEstimate(this.vendorEstimateKey())
      .subscribe((res) => {
        this.isLoading.set(false);
        if (res.status && res.data) {
          this.applyResponse(res.data);
          this.adjustmentProposal.set(res.data.adjustmentProposal ?? null);
        } else {
          this.errorMessage.set(res.message || 'Failed to build customer invoice preview.');
        }
      });
  }

  /**
   * EDIT/VIEW mode: loads an already-persisted invoice by key. Mirrors EditInvoiceModalComponent's
   * exact sentToCustomer/invoicePaid block-edit guard — if blocked, sets blockedMessage and never
   * loads the editable grid at all.
   */
  private loadExisting(customerInvoiceKey: string): void {
    this.isLoading.set(true);
    this.vendorBillsSvc.getCustomerInvoiceRichDetail(customerInvoiceKey).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        if (!res.status || !res.data) {
          this.errorMessage.set(res.message || 'Failed to load customer invoice.');
          return;
        }

        if (res.data.sentToCustomer || res.data.invoicePaid) {
          this.blockedMessage.set(
            'This invoice has already been sent to the customer or paid, and can no longer be edited.',
          );
          return;
        }

        // The invoice list only knows the invoice key going in — customerKey/isEmergency (needed for
        // the minimum-markup gate/popover) only become known once this detail response arrives, unlike
        // create mode where the caller already has them from the job/estimate context.
        this.customerKey.set(res.data.customerKey ?? '');
        this.isEmergency.set(res.data.isEmergencyJob);
        this.loadMinMarkupPolicy();

        this.applyDetailResponse(res.data);

        // Surface an already-under-threshold invoice's proposal immediately on open, matching what
        // Save would otherwise only reveal after a round-trip.
        if (res.data.adjustmentProposal) {
          this.adjustmentProposal.set(res.data.adjustmentProposal);
          this.pendingDecisionMode.set(true);
        }
      },
      error: () => {
        this.isLoading.set(false);
        this.errorMessage.set('Failed to load customer invoice.');
      },
    });
  }

  /** Maps the rich GET-detail response (edit/view) into the same CivRow grid applyResponse builds
   *  for create/preview — field names differ on the wire (see CustomerInvoiceRichDetailLineItem's doc
   *  comment), so this is a separate mapper rather than reusing applyResponse. */
  private applyDetailResponse(data: CustomerInvoiceRichDetailResponse): void {
    this.customerInvoiceKey.set(data.customerInvoiceKey);
    this.adminMarkupLineItemKey.set(data.adminMarkupLineItemKey ?? null);
    this.terms.set(data.terms ?? '');
    this.worksPerformed.set(data.worksPerformed ?? '');

    const rows: CivRow[] = [];
    const extras: CivRow[] = [];
    let adminPct = 0;

    for (const li of data.lineItems ?? []) {
      if (li.chargeTypeKey === 'ADMIN_MARKUP' || /admin\s*fee/i.test(li.chargeType ?? '')) {
        adminPct = li.profileMarkupPercent ?? li.calculatedMarkupPercent ?? 0;
        if (li.detailKey) this.adminMarkupLineItemKey.set(li.detailKey);
        continue;
      }
      const row: CivRow = {
        chargeType: li.chargeType ?? '',
        chargeTypeKey: li.chargeTypeKey ?? '',
        description: li.description ?? '',
        vendorRate: li.vendorRate ?? 0,
        vendorQty: li.vendorQty ?? 0,
        vendorAmount: li.vendorAmount ?? 0,
        customerRate: li.rate,
        customerQty: li.qty,
        profileMarkupPercent: li.profileMarkupPercent,
        lineType: (li.lineType as CivRow['lineType']) ?? 'custom',
        costIncurred: li.costIncurred ?? 1,
        customerEstimateDetailKey: li.detailKey,
        vendorEstimateDetailKey: li.vendorEstimateDetailKey ?? li.vendorEstimateLaborKey,
        isCustomLineItem: !li.vendorEstimateDetailKey && !li.vendorEstimateLaborKey,
        sourceVendorEstimateKey: li.sourceVendorEstimateKey,
        sourcePortionTitle: li.sourcePortionTitle,
      };
      if (row.isCustomLineItem) extras.push(row);
      else rows.push(row);
    }

    this.rows.set(rows);
    this.extras.set(extras);
    this.adminMarkupPercent.set(adminPct);
    this.adminOn.set(adminPct > 0);
  }

  private applyResponse(data: CreateCustomerInvoiceFromVendorResponse): void {
    this.customerInvoiceKey.set(data.customerInvoiceKey || null);
    this.adminMarkupLineItemKey.set(data.adminMarkupLineItemKey ?? null);

    const rows: CivRow[] = [];
    const extras: CivRow[] = [];
    let adminPct = 0;

    for (const li of data.lineItems ?? []) {
      if (li.chargeTypeKey === 'ADMIN_MARKUP' || /admin\s*fee/i.test(li.chargeType)) {
        adminPct = li.profileMarkupPercent ?? li.calculatedMarkupPercent ?? 0;
        if (li.customerEstimateDetailKey) this.adminMarkupLineItemKey.set(li.customerEstimateDetailKey);
        continue;
      }
      const row: CivRow = {
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
    if (this.isReadOnly()) return;
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

    // Trip→Labor cross-write proposal — creation mode only, matching the estimate modal's own guard.
    if (this.mode() === 'create' && field !== 'description' && before?.lineType === 'trip') {
      this.computeTripCrossWriteProposal(index, beforeAmount, before.customerQty, before.customerRate);
    }
  }

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
        lineType: opt.lineType as CivRow['lineType'],
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

  save(): void {
    if (this.isReadOnly()) return;
    // No client-side threshold pre-check: the server's adjustmentProposal is the single source of truth.
    const accepted = this.acceptedProposal();
    if (accepted) {
      this.acceptedProposal.set(null);
      this.persist(MarkupAdjustmentDecision.AcceptProposed, undefined, accepted);
      return;
    }

    if (this.awaitingManualMarkupFix()) {
      this.awaitingManualMarkupFix.set(false);
      this.persist(MarkupAdjustmentDecision.ManualOverride, this.buildUpdateLineItems());
      return;
    }
    this.persist();
  }

  acceptProposedAdjustment(): void {
    const proposal = this.adjustmentProposal();
    if (!proposal) return;

    this.adjustmentProposal.set(null);
    this.pendingDecisionMode.set(false);
    this.awaitingManualMarkupFix.set(false);

    this.applyAcceptedProposalLocally(proposal);
    this.acceptedProposal.set(proposal);
  }

  dismissProposedAdjustment(): void {
    this.adjustmentProposal.set(null);
    this.awaitingManualMarkupFix.set(true);
  }

  private buildUpdateLineItems(): UpdateCustomerInvoiceFromVendorLineItemRequest[] {
    const items: UpdateCustomerInvoiceFromVendorLineItemRequest[] = [];
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
        vendorEstimateDetailKey: r.vendorEstimateDetailKey,
        sourceVendorEstimateKey: r.sourceVendorEstimateKey,
      });
    }

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
    // for deletion — UpdateCustomerInvoiceAsync never infers a delete from a row's mere absence (see
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
    markupAdjustmentDecision?: MarkupAdjustmentDecision,
    markupOverrideLineItems?: UpdateCustomerInvoiceFromVendorLineItemRequest[],
    acceptedProposal?: DynMinMarkupAdjustmentProposal,
  ): void {
    this.isSaving.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    if (this.isPersisted() && this.customerInvoiceKey()) {
      this.runUpdate(this.customerInvoiceKey()!, markupAdjustmentDecision, markupOverrideLineItems, acceptedProposal);
      return;
    }

    if (this.isMultiVendor()) {
      const request: CreateMultiVendorCustomerInvoiceRequest = {
        vendorEstimateKeys: this.vendorEstimateKeys(),
        vendorPortionTitles: this.buildVendorPortionTitles(),
        terms: this.terms() || null,
        worksPerformed: this.worksPerformed() || null,
        lineItems: this.buildUpdateLineItems(),
        markupAdjustmentDecision,
        markupOverrideLineItems,
        addAdminFee: this.adminOn() && this.adminMarkupPercent() > 0,
        adminFeePercent: this.adminOn() ? this.adminMarkupPercent() : null,
        sendToPrepManager: false, // handled post-save via the Yes/No prompt, not at create time
      };
      this.vendorBillsSvc.createMultiVendorCustomerInvoiceFromVendorEstimates(request).subscribe({
        next: (res) => this.handlePersistResponse(res, acceptedProposal),
        error: () => {
          this.isSaving.set(false);
          this.errorMessage.set('Failed to create customer invoice.');
        },
      });
      return;
    }

    const request: CreateCustomerInvoiceFromVendorRequest = {
      vendorEstimateKey: this.vendorEstimateKey(),
      terms: this.terms() || null,
      worksPerformed: this.worksPerformed() || null,
      lineItems: this.buildUpdateLineItems(),
      markupAdjustmentDecision,
      markupOverrideLineItems,
      addAdminFee: this.adminOn() && this.adminMarkupPercent() > 0,
      adminFeePercent: this.adminOn() ? this.adminMarkupPercent() : null,
      sendToPrepManager: false, // handled post-save via the Yes/No prompt, not at create time
    };
    this.vendorBillsSvc.createCustomerInvoiceFromVendorEstimate(request).subscribe({
      next: (res) => this.handlePersistResponse(res, acceptedProposal),
      error: () => {
        this.isSaving.set(false);
        this.errorMessage.set('Failed to create customer invoice.');
      },
    });
  }

  /** EDIT mode: persists changes to an already-existing invoice via PUT, with the same markup-gate
   *  decision threading as create's persist(). On success, re-opens the "send for review?" prompt,
   *  per the user's decision that edits should re-trigger it (not just first-time creation). */
  private runUpdate(
    customerInvoiceKey: string,
    markupAdjustmentDecision?: MarkupAdjustmentDecision,
    markupOverrideLineItems?: UpdateCustomerInvoiceFromVendorLineItemRequest[],
    acceptedProposal?: DynMinMarkupAdjustmentProposal,
  ): void {
    const request: UpdateCustomerInvoiceFromVendorRequest = {
      customerInvoiceKey,
      terms: this.terms() || null,
      worksPerformed: this.worksPerformed() || null,
      lineItems: this.buildUpdateLineItems(),
      markupAdjustmentDecision,
      markupOverrideLineItems,
    };

    this.vendorBillsSvc.updateCustomerInvoiceFromVendor(request).subscribe({
      next: (res) => this.handleUpdateResponse(res, acceptedProposal),
      error: () => {
        this.isSaving.set(false);
        this.errorMessage.set('Failed to save customer invoice.');
      },
    });
  }

  private handleUpdateResponse(
    res: { status: boolean; message?: string; data?: UpdateCustomerInvoiceFromVendorResponse | null },
    acceptedProposal?: DynMinMarkupAdjustmentProposal,
  ): void {
    if (!res.status || !res.data) {
      this.isSaving.set(false);
      this.errorMessage.set(res.message || 'Failed to save customer invoice.');
      return;
    }

    if (res.data.adjustmentProposal) {
      this.isSaving.set(false);
      this.adjustmentProposal.set(res.data.adjustmentProposal);
      this.pendingDecisionMode.set(true);
      return;
    }

    if (acceptedProposal) {
      this.applyAcceptedProposalLocally(acceptedProposal);
    }

    this.deletedLineItemKeys = [];
    this.isSaving.set(false);
    this.successMessage.set('Customer invoice saved.');
    this.customerInvoiceCreated.emit({
      customerInvoiceKey: res.data.customerInvoiceKey,
      invoiceNo: null,
    });
    // Edits re-trigger the same "send for review?" prompt as a first-time creation.
    this.pendingPrepReviewInvoiceKey.set(res.data.customerInvoiceKey);
  }

  private handlePersistResponse(
    res: { status: boolean; message?: string; data?: CreateCustomerInvoiceFromVendorResponse | null },
    acceptedProposal?: DynMinMarkupAdjustmentProposal,
  ): void {
    if (!res.status || !res.data) {
      this.isSaving.set(false);
      this.errorMessage.set(res.message || 'Failed to create customer invoice.');
      return;
    }

    if (res.data.adjustmentProposal) {
      // Under minimum markup, nothing persisted — show the proposal instead.
      this.isSaving.set(false);
      this.adjustmentProposal.set(res.data.adjustmentProposal);
      this.pendingDecisionMode.set(true);
      return;
    }

    if (acceptedProposal) {
      this.applyAcceptedProposalLocally(acceptedProposal);
    }

    this.isSaving.set(false);
    this.successMessage.set('Customer invoice saved.');
    this.customerInvoiceKey.set(res.data.customerInvoiceKey);
    this.customerInvoiceCreated.emit({
      customerInvoiceKey: res.data.customerInvoiceKey,
      invoiceNo: res.data.invoiceNo ?? null,
    });
    // Ask "send for review?" before closing — a Yes/No follow-up call, not part of the save itself
    // (mirrors legacy V1's "Send for Manager Review" prompt shown right after an invoice is created).
    this.pendingPrepReviewInvoiceKey.set(res.data.customerInvoiceKey);
  }

  /** Stage picked files (TempFileStock) as soon as they're selected, so send only needs the keys. */
  onPrepReviewFilesSelected(event: Event): void {
    const invoiceKey = this.pendingPrepReviewInvoiceKey();
    const input = event.target as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    if (!invoiceKey || files.length === 0) return;

    this.stagingPrepReviewFiles.set(true);
    this.vendorBillsSvc.stagePrepReviewAttachments(invoiceKey, files).subscribe({
      next: (res) => {
        this.stagingPrepReviewFiles.set(false);
        if (!res.status || !res.data) {
          this.errorMessage.set(res.message || 'Failed to upload attachment(s).');
          return;
        }
        this.prepReviewStagedFileKeys.push(...res.data);
        this.prepReviewFileNames.set([...this.prepReviewFileNames(), ...files.map((f) => f.name)]);
      },
      error: () => {
        this.stagingPrepReviewFiles.set(false);
        this.errorMessage.set('Failed to upload attachment(s).');
      },
    });
    input.value = '';
  }

  /** Admin answered "Yes, send for review" on the post-save prompt. */
  confirmSendForPrepReview(): void {
    const invoiceKey = this.pendingPrepReviewInvoiceKey();
    if (!invoiceKey) return;
    this.pendingPrepReviewInvoiceKey.set(null);
    this.sendingPrepReview.set(true);

    const note = this.prepReviewNote;
    const attachmentFileKeys = this.prepReviewStagedFileKeys;

    this.vendorBillsSvc.sendInvoiceForPrepManagerReview(invoiceKey, note, attachmentFileKeys).subscribe({
      next: (res) => {
        this.sendingPrepReview.set(false);
        if (!res.status) {
          this.errorMessage.set(res.message || 'Failed to send invoice for review.');
          return;
        }
        this.resetPrepReviewState();
        this.isVisible.set(false);
      },
      error: () => {
        this.sendingPrepReview.set(false);
        this.errorMessage.set('Failed to send invoice for review.');
      },
    });
  }

  /** Admin answered "No" — the invoice stays saved as-is, no review email is sent. */
  declineSendForPrepReview(): void {
    this.pendingPrepReviewInvoiceKey.set(null);
    this.resetPrepReviewState();
    this.isVisible.set(false);
  }

  private resetPrepReviewState(): void {
    this.prepReviewNote = '';
    this.prepReviewStagedFileKeys = [];
    this.prepReviewFileNames.set([]);
  }

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
}
