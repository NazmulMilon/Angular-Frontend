import { Component, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DepositService } from '../../../../services/deposit.service';
import { DepositVendorInfo, SaveDepositRequest, VendorDepositItem, DepositOverrideItem } from '../../../../models/deposit.model';

/** Which step of the deposit flow is on screen. */
export type DepositStep = 'pick' | 'vendor' | 'customer' | 'confirm';

/** Emitted once the deposit has actually been persisted, so the parent can refresh/close. */
export interface VendorDepositCompleteEvent {
  type: 'vendor-deposit-saved' | 'customer-deposit-saved' | 'no-customer-deposit';
  vendorsSaved: number;
  customerDepositSet: boolean;
  /** True when the deposit is now pending SVC-manager approval (self-approval left this false). */
  requiresSvcApproval: boolean;
}

/** Per-vendor working state for one page of the vendor step. */
interface VendorDepositPage {
  info: DepositVendorInfo;
  choice: 'yes' | 'no' | null;
  dollar: string;
  percent: string;
  showWarning: boolean;
  overrideReason: string;
}

/**
 * Vendor / customer deposit flow modal (RBR-466). Replicates the legacy "Paying vendor deposit"
 * → _PartialVendorCustomerDeposit flow (EIndex.cshtml / ManageCustomerVendorDeposit.js).
 *
 * Two entry points, differing only in scope:
 *
 * 1. Per-vendor — each vendor card's "Agree to Pay Vendor Deposit" button passes that card's
 *    `jobVendorKey`, and only that vendor's step is shown. No picker.
 * 2. Group-wide — after a customer estimate is created, `open()` is called with no `jobVendorKey`
 *    and a 'pick' step lists every vendor on the estimate so the admin chooses which ones to set
 *    deposits for. Unpicked vendors are skipped entirely and left untouched. A single-vendor
 *    estimate skips the picker, since there is nothing to choose.
 *
 * Either way the vendor group is fetched in full, because vendors NOT being edited still contribute
 * their already-saved deposits to the job-wide total that the customer-side 35% rule is checked
 * against — the customer deposit is one job-level number shared across vendors. Saving a subset never
 * disturbs the rest: the backend upserts per JobKey+VendorKey.
 *
 * Owns its own save call (POST api/v1/deposits/save), consistent with how
 * CreateCustomerEstimateModalComponent owns its own save calls — the parent only needs to react to
 * `complete`/`close`.
 */
@Component({
  selector: 'app-estimate-vendor-deposit-modal',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './estimate-vendor-deposit-modal.component.html',
  styleUrl: './estimate-vendor-deposit-modal.component.scss',
})
export class EstimateVendorDepositModalComponent {
  private readonly depositSvc = inject(DepositService);

  // ── Context, seeded on open() ──────────────────────────────────
  readonly isVisible = signal(false);
  readonly jobKey = signal('');
  readonly customerEstimateKey = signal('');
  /**
   * Existing customer deposit that is still unpaid; when > 0 the customer step prefills + shows a
   * notice that the amount can be changed. Loaded from the backend on open() — a deposit that has
   * already been paid deliberately stays 0 here, so it is never presented as freely editable.
   */
  readonly existingCustomerDeposit = signal(0);
  /** Live customer estimate total — customer deposit can never exceed this (mirrors backend invoice-total check). */
  readonly customerEstimateTotal = signal(0);
  /**
   * Vendor deposits already on record for this JOB tied to a vendor NOT part of this customer
   * estimate (a different estimate on the same job). The server's 35%-best-practice check is
   * job-wide, so this must feed the same basis here or a save that looks fine locally can still be
   * rejected by the server.
   */
  private readonly otherVendorDepositsOnRecordJobWide = signal(0);

  readonly isLoading = signal(false);
  readonly loadError = signal('');
  readonly isSaving = signal(false);
  readonly saveError = signal('');

  readonly close = output<void>();
  readonly complete = output<VendorDepositCompleteEvent>();

  // ── flow state ──────────────────────────────────────────────
  readonly step = signal<DepositStep>('vendor');

  // Step 0 (group-wide entry only) — every vendor on the estimate, and which ones the admin picked.
  // `vendorPages` is built from the picked subset, so every downstream step stays unaware of the
  // picker's existence.
  readonly allVendors = signal<DepositVendorInfo[]>([]);
  readonly pickedVendorKeys = signal<ReadonlySet<string>>(new Set());
  readonly canProceedPick = computed(() => this.pickedVendorKeys().size > 0);
  /** True when this launch went through the picker, so the vendor step can navigate back to it. */
  private readonly isGroupWideEntry = signal(false);
  readonly hasPickStep = computed(() => this.isGroupWideEntry() && this.allVendors().length > 1);

  // Step 1 — one page per vendor participating in the customer estimate.
  readonly vendorPages = signal<VendorDepositPage[]>([]);
  readonly vendorPageIndex = signal(0);
  readonly currentVendorPage = computed<VendorDepositPage | null>(() => {
    const pages = this.vendorPages();
    const i = this.vendorPageIndex();
    return i >= 0 && i < pages.length ? pages[i] : null;
  });
  readonly isMultiVendor = computed(() => this.vendorPages().length > 1);
  readonly isFirstVendorPage = computed(() => this.vendorPageIndex() === 0);
  readonly isLastVendorPage = computed(() => this.vendorPageIndex() === this.vendorPages().length - 1);

  // Step 2 — customer
  readonly customerDollar = signal('');
  readonly customerPercent = signal('');
  readonly showCustomerWarning = signal(false);
  readonly customerOverrideReason = signal('');

  // Step 3 — no-customer-deposit confirmation
  readonly reason = signal('');

  // ── header (per step) ───────────────────────────────────────
  readonly headerBadge = computed<'vendor' | 'customer' | 'confirm'>(() => {
    if (this.step() === 'pick' || this.step() === 'vendor') return 'vendor';
    return this.step() === 'confirm' ? 'confirm' : 'customer';
  });
  readonly headerTitle = computed(() => {
    if (this.step() === 'pick') return 'Vendor Deposits';
    return this.step() === 'vendor' ? 'Vendor Deposit' : 'Customer Deposit';
  });
  readonly headerSub = computed(() => {
    if (this.step() === 'pick') return 'Choose which vendors to set a deposit for';
    if (this.step() === 'vendor') return 'Confirm deposit requirements before proceeding';
    if (this.step() === 'customer') return 'Confirm the amount to collect from the customer';
    return '';
  });
  readonly railWidth = computed(() => {
    if (this.step() === 'pick') return '20%';
    return this.step() === 'vendor' ? '50%' : '100%';
  });
  readonly onSecondDot = computed(() => this.step() !== 'pick' && this.step() !== 'vendor');

  readonly vendorInitials = computed(() => {
    const name = this.currentVendorPage()?.info.vendorName ?? '';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '—';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  });

  readonly vendorWarningText = computed(() => {
    const page = this.currentVendorPage();
    if (!page) return '';
    const amt = parseFloat(page.dollar);
    if (Number.isNaN(amt)) return '';
    return (
      `Attention, vendor deposit amount $${amt.toFixed(2)} was greater than 50% of the vendor ` +
      `estimate total $${page.info.vendorEstimateTotal.toFixed(2)} (${page.info.vendorName})`
    );
  });

  readonly showExistingCustomerNotice = computed(() => this.existingCustomerDeposit() > 0);
  readonly existingCustomerNoticeText = computed(() => {
    const trimmed = String(Math.round(this.existingCustomerDeposit() * 100) / 100);
    return (
      `Customer Deposit of $${trimmed} has already been set but it has not been paid. ` +
      `You can change the amount and save this new amount.`
    );
  });

  /**
   * Deposits already on record for vendors NOT being edited in this flow — the ones a per-vendor
   * launch left out of scope, or the ones the admin didn't pick. The customer deposit covers the
   * whole job, so these have to be part of the 35% basis; otherwise vendors saved separately would
   * each be compared against their own amount alone and a job-wide under-deposit would slip through.
   * Mirrors the server's job-wide check. Derived (not a snapshot) so re-picking stays consistent.
   */
  private readonly otherVendorsDepositOnRecord = computed(() => {
    const onScreen = new Set(this.vendorPages().map((p) => p.info.jobVendorKey));
    const sameEstimateOthers = this.allVendors()
      .filter((v) => !onScreen.has(v.jobVendorKey))
      .reduce((sum, v) => sum + (v.existingDepositAmount || 0), 0);
    // Plus vendor deposits tied to a DIFFERENT customer estimate on the same job — allVendors()
    // only ever resolves vendors linked to THIS estimate, so it can never see those on its own.
    return sameEstimateOthers + this.otherVendorDepositsOnRecordJobWide();
  });

  /** Sum of every "Yes" vendor's entered dollar amount, across the pages on screen. */
  private readonly totalVendorDepositEntered = computed(() =>
    this.vendorPages()
      .filter((p) => p.choice === 'yes')
      .reduce((sum, p) => sum + (parseFloat(p.dollar) || 0), 0),
  );

  /** Job-wide vendor deposit total — what's being entered here plus what other vendors already have. */
  private readonly totalVendorDepositJobWide = computed(
    () => this.totalVendorDepositEntered() + this.otherVendorsDepositOnRecord(),
  );

  /** Hard cap: customer deposit can never exceed the customer estimate's own total (mirrors backend invoice-total check). */
  readonly exceedsCustomerEstimateTotal = computed(() => {
    const estimateTotal = this.customerEstimateTotal();
    const customerAmt = parseFloat(this.customerDollar()) || 0;
    return estimateTotal > 0 && customerAmt > estimateTotal;
  });

  readonly customerWarningText = computed(() => {
    const customerAmt = parseFloat(this.customerDollar()) || 0;
    const estimateTotal = this.customerEstimateTotal();
    if (this.exceedsCustomerEstimateTotal()) {
      return (
        `Customer deposit $${customerAmt.toFixed(2)} exceeds the customer estimate total ` +
        `$${estimateTotal.toFixed(2)}.`
      );
    }

    const total = this.totalVendorDepositJobWide();
    if (total <= 0) return '';
    if (customerAmt < total) {
      return (
        `Customer deposit $${customerAmt.toFixed(2)} is less than the total vendor deposit ` +
        `$${total.toFixed(2)}.`
      );
    }
    if (customerAmt < total * 1.35) {
      return (
        `Customer deposit $${customerAmt.toFixed(2)} is not at least 35% greater than the total vendor ` +
        `deposit $${total.toFixed(2)} (best practice: $${(total * 1.35).toFixed(2)} or more).`
      );
    }
    return '';
  });

  // ── validation ──────────────────────────────────────────────
  readonly canProceedVendor = computed(() => {
    const page = this.currentVendorPage();
    if (!page) return false;
    if (page.choice === 'no') return true;
    if (page.choice === 'yes') return !!(page.dollar.trim() || page.percent.trim());
    return false;
  });
  readonly canSaveCustomer = computed(
    () => !!(this.customerDollar().trim() || this.customerPercent().trim()),
  );
  /**
   * Mirrors the backend (DepositService.ValidateAsync): a reason is only required to waive the
   * customer deposit when a vendor deposit is being paid this request or is already on record.
   * With no vendor deposit anywhere, a $0 customer deposit needs no reason.
   */
  readonly noCustomerDepositReasonRequired = computed(() => this.totalVendorDepositJobWide() > 0);
  readonly canContinueNoDeposit = computed(
    () => !this.noCustomerDepositReasonRequired() || this.reason().trim().length > 0,
  );

  // ── Public API ────────────────────────────────────────────────

  /**
   * Opens the modal for the given customer estimate. Fetches the vendor group via DepositService,
   * then either scopes straight to `jobVendorKey` (per-vendor entry, from a vendor card) or opens the
   * 'pick' step so the admin chooses vendors (group-wide entry, after creating a customer estimate).
   * Vendors left out either way contribute their already-saved deposits to the job-wide 35% basis.
   * The existing customer deposit comes from the same fetch, so callers don't supply it.
   */
  open(opts: {
    jobKey: string;
    customerEstimateKey: string;
    /** JobVendor.PKey of the vendor card this was launched from — scopes the flow to that vendor. */
    jobVendorKey?: string;
    customerEstimateTotal?: number;
  }): void {
    this.jobKey.set(opts.jobKey);
    this.customerEstimateKey.set(opts.customerEstimateKey);
    this.existingCustomerDeposit.set(0);
    this.customerEstimateTotal.set(opts.customerEstimateTotal ?? 0);

    this.isVisible.set(true);
    this.isLoading.set(true);
    this.loadError.set('');
    this.saveError.set('');
    this.step.set('vendor');
    this.vendorPages.set([]);
    this.vendorPageIndex.set(0);
    this.customerDollar.set('');
    this.customerPercent.set('');
    this.showCustomerWarning.set(false);
    this.customerOverrideReason.set('');
    this.reason.set('');
    this.allVendors.set([]);
    this.otherVendorDepositsOnRecordJobWide.set(0);
    this.pickedVendorKeys.set(new Set());
    this.isGroupWideEntry.set(!opts.jobVendorKey);

    this.depositSvc.getDepositContextForCustomerEstimate(opts.customerEstimateKey).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        if (!res.status || !res.data) {
          this.loadError.set(res.message || 'Failed to load vendor information for this estimate.');
          return;
        }

        const vendors = res.data.vendors ?? [];
        this.allVendors.set(vendors);
        this.otherVendorDepositsOnRecordJobWide.set(res.data.otherVendorDepositsOnRecordJobWide ?? 0);

        // Only an unpaid deposit is offered up for editing; a paid one stays out of the prefill so the
        // customer step can't quietly rewrite money that has already been collected.
        this.existingCustomerDeposit.set(
          res.data.customerDepositUnpaid ? res.data.customerDepositAmount : 0,
        );

        // Per-vendor entry: scope straight to the clicked vendor. If it isn't in the group the
        // estimate resolves to, that's a real mismatch (wrong card, or the estimate was rebuilt) —
        // say so rather than silently falling back to some other vendor's deposit.
        if (opts.jobVendorKey) {
          const scoped = vendors.filter((v) => v.jobVendorKey === opts.jobVendorKey);
          if (scoped.length === 0) {
            this.loadError.set('This vendor is not part of the current customer estimate.');
            return;
          }
          this.seedVendorPages(scoped);
          this.step.set('vendor');
          return;
        }

        // Group-wide entry: let the admin pick, defaulting to all vendors checked. With only one
        // vendor there is nothing to choose, so skip the picker entirely.
        this.pickedVendorKeys.set(new Set(vendors.map((v) => v.jobVendorKey)));
        if (vendors.length <= 1) {
          this.seedVendorPages(vendors);
          this.step.set('vendor');
        } else {
          this.step.set('pick');
        }
      },
      error: () => {
        this.isLoading.set(false);
        this.loadError.set('Failed to load vendor information for this estimate.');
      },
    });
  }

  onClose(): void {
    this.close.emit();
    this.isVisible.set(false);
  }

  /**
   * Builds the vendor step's pages from the vendors actually being edited, prefilling any deposit
   * already on record so re-opening shows the current amount as "Yes" rather than an empty form that
   * reads as "no deposit set".
   */
  private seedVendorPages(vendors: DepositVendorInfo[]): void {
    this.vendorPageIndex.set(0);
    this.vendorPages.set(
      vendors.map((info) => ({
        info,
        choice: info.existingDepositAmount > 0 ? 'yes' : null,
        dollar: info.existingDepositAmount > 0 ? String(info.existingDepositAmount) : '',
        percent:
          info.existingDepositAmount > 0 && info.vendorEstimateTotal > 0
            ? String(Math.round((info.existingDepositAmount / info.vendorEstimateTotal) * 10000) / 100)
            : '',
        showWarning: false,
        overrideReason: '',
      })),
    );
  }

  /** Currency for display only — amounts posted to the API stay raw numbers. */
  formatMoney(value: number): string {
    return `$${(value || 0).toFixed(2)}`;
  }

  // ── step 0 (picker) actions ─────────────────────────────────
  isVendorPicked(jobVendorKey: string): boolean {
    return this.pickedVendorKeys().has(jobVendorKey);
  }

  toggleVendorPick(jobVendorKey: string): void {
    this.pickedVendorKeys.update((prev) => {
      const next = new Set(prev);
      if (!next.delete(jobVendorKey)) next.add(jobVendorKey);
      return next;
    });
  }

  /** Confirms the picked vendors and moves into the per-vendor step for that subset only. */
  onPickNext(): void {
    if (!this.canProceedPick()) return;
    const picked = this.pickedVendorKeys();
    this.seedVendorPages(this.allVendors().filter((v) => picked.has(v.jobVendorKey)));
    this.step.set('vendor');
  }

  // ── step 1 actions ──────────────────────────────────────────
  private updateCurrentPage(patch: Partial<VendorDepositPage>): void {
    this.vendorPages.update((pages) => {
      const i = this.vendorPageIndex();
      if (i < 0 || i >= pages.length) return pages;
      const next = [...pages];
      next[i] = { ...next[i], ...patch };
      return next;
    });
  }

  selectYes(): void {
    this.updateCurrentPage({ choice: 'yes' });
  }

  selectNo(): void {
    this.updateCurrentPage({ choice: 'no', dollar: '', percent: '', showWarning: false });
  }

  setVendorDollar(value: string): void {
    const page = this.currentVendorPage();
    const basis = page?.info.vendorEstimateTotal ?? 0;
    const amt = parseFloat(value);
    const percent = basis > 0 && !Number.isNaN(amt) ? String(Math.round((amt / basis) * 10000) / 100) : '';
    this.updateCurrentPage({ dollar: value, percent });
  }

  setVendorPercent(value: string): void {
    const page = this.currentVendorPage();
    const basis = page?.info.vendorEstimateTotal ?? 0;
    const pct = parseFloat(value);
    const dollar = basis > 0 && !Number.isNaN(pct) ? String(Math.round(((pct / 100) * basis) * 100) / 100) : '';
    this.updateCurrentPage({ percent: value, dollar });
  }

  setVendorOverrideReason(value: string): void {
    this.updateCurrentPage({ overrideReason: value });
  }

  onVendorNext(): void {
    const page = this.currentVendorPage();
    if (!page || !this.canProceedVendor()) return;

    if (page.choice === 'yes') {
      const amt = parseFloat(page.dollar);
      if (!Number.isNaN(amt) && amt > page.info.vendorEstimateTotal * 0.5 && !page.showWarning) {
        this.updateCurrentPage({ showWarning: true });
        return;
      }
    }
    this.advancePastVendorPage();
  }

  reduceVendorDeposit(): void {
    this.updateCurrentPage({ showWarning: false });
  }

  overrideVendorDeposit(): void {
    const page = this.currentVendorPage();
    if (!page?.overrideReason.trim()) return; // reason required before override is accepted
    this.advancePastVendorPage();
  }

  private advancePastVendorPage(): void {
    if (this.isLastVendorPage()) {
      this.goToCustomerStep();
    } else {
      this.vendorPageIndex.update((i) => i + 1);
    }
  }

  backFromVendorPage(): void {
    if (!this.isFirstVendorPage()) {
      this.vendorPageIndex.update((i) => i - 1);
    } else if (this.hasPickStep()) {
      this.step.set('pick'); // back to the roster rather than out of the flow
    } else {
      this.onClose();
    }
  }

  // ── step 2 actions ──────────────────────────────────────────
  private goToCustomerStep(): void {
    if (this.existingCustomerDeposit() > 0 && !this.customerDollar().trim()) {
      this.customerDollar.set(String(Math.round(this.existingCustomerDeposit() * 100) / 100));
    }
    this.step.set('customer');
  }

  backToVendorStep(): void {
    this.vendorPageIndex.set(this.vendorPages().length - 1);
    this.step.set('vendor');
  }

  /** Basis for the customer $↔% conversion: the customer estimate total when known, else the vendor deposit total. */
  private readonly customerPercentBasis = computed(
    () => this.customerEstimateTotal() || this.totalVendorDepositJobWide(),
  );

  onCustomerDollarChange(value: string): void {
    const basis = this.customerPercentBasis();
    const amt = parseFloat(value);
    const percent = basis > 0 && !Number.isNaN(amt) ? String(Math.round((amt / basis) * 10000) / 100) : '';
    this.customerDollar.set(value);
    this.customerPercent.set(percent);
    this.showCustomerWarning.set(false);
  }

  onCustomerPercentChange(value: string): void {
    const basis = this.customerPercentBasis();
    const pct = parseFloat(value);
    const dollar = basis > 0 && !Number.isNaN(pct) ? String(Math.round(((pct / 100) * basis) * 100) / 100) : '';
    this.customerPercent.set(value);
    this.customerDollar.set(dollar);
    this.showCustomerWarning.set(false);
  }

  saveCustomerDeposit(): void {
    if (!this.canSaveCustomer()) return;

    // Hard cap — cannot be overridden, mirrors the backend's invoice-total rejection.
    if (this.exceedsCustomerEstimateTotal()) {
      this.showCustomerWarning.set(true);
      return;
    }

    const total = this.totalVendorDepositJobWide();
    const customerAmt = parseFloat(this.customerDollar()) || 0;
    const needsOverride = total > 0 && (customerAmt < total || customerAmt < total * 1.35);
    if (needsOverride && !this.showCustomerWarning() && !this.customerOverrideReason().trim()) {
      this.showCustomerWarning.set(true);
      return;
    }
    if (needsOverride && !this.customerOverrideReason().trim()) return; // reason required to override

    this.persist('customer-deposit-saved');
  }

  customerNotNeeded(): void {
    this.step.set('confirm');
  }

  // ── step 3 actions ──────────────────────────────────────────
  requireCustomerDeposit(): void {
    this.step.set('customer');
  }

  continueNoCustomerDeposit(): void {
    if (!this.canContinueNoDeposit()) return;
    this.persist('no-customer-deposit');
  }

  // ── save ──────────────────────────────────────────────────────

  private buildRequest(type: VendorDepositCompleteEvent['type']): SaveDepositRequest {
    const vendorDepositList: VendorDepositItem[] = [];
    const vendorDepositRemovedList: VendorDepositItem[] = [];
    const vendorDepositOverrideList: DepositOverrideItem[] = [];

    for (const page of this.vendorPages()) {
      if (page.choice === 'no') {
        // Answering No must actively clear a deposit already on record, not just omit it — the
        // backend deletes VendorDepositSet rows for this list. Vendors with nothing on record are
        // left out entirely so the save reports an accurate removal count.
        if (page.info.existingDepositAmount > 0) {
          vendorDepositRemovedList.push({
            jobVendorKey: page.info.jobVendorKey,
            depositAmount: page.info.existingDepositAmount,
          });
        }
        continue;
      }
      if (page.choice !== 'yes') continue;
      const amount = parseFloat(page.dollar) || 0;
      vendorDepositList.push({ jobVendorKey: page.info.jobVendorKey, depositAmount: amount });
      if (page.overrideReason.trim()) {
        vendorDepositOverrideList.push({
          jobVendorKey: page.info.jobVendorKey,
          depositAmount: amount,
          remark: page.overrideReason.trim(),
        });
      }
    }

    const customerDepoAmount = type === 'no-customer-deposit' ? 0 : parseFloat(this.customerDollar()) || 0;

    return {
      jobKey: this.jobKey(),
      customerEstimateKey: this.customerEstimateKey(),
      vendorDepositList,
      vendorDepositRemovedList,
      customerDepoAmount,
      reasonForNoCustomerDeposit: type === 'no-customer-deposit' ? this.reason().trim() : null,
      vendorDepositOverrideList,
      customerDepositOverrideReason: this.customerOverrideReason().trim() || null,
    };
  }

  /**
   * The backend recomputes the job-wide vendor total fresh from the DB at save time, so it can reject
   * a customer-deposit save as needing an override even when this client's own (possibly stale) calc
   * thought the amount already cleared the 35% bar and never showed the override field. Fall back to
   * revealing it here so the user isn't stuck with no way to supply a reason.
   */
  private maybeRevealOverrideOnRejection(type: VendorDepositCompleteEvent['type'], message: string): void {
    if (type === 'customer-deposit-saved' && /override reason/i.test(message)) {
      this.showCustomerWarning.set(true);
    }
  }

  private persist(type: VendorDepositCompleteEvent['type']): void {
    this.isSaving.set(true);
    this.saveError.set('');

    this.depositSvc.saveDeposit(this.buildRequest(type)).subscribe({
      next: (res) => {
        this.isSaving.set(false);
        if (res.status && res.data) {
          this.complete.emit({
            type,
            vendorsSaved: res.data.vendorsSaved,
            customerDepositSet: res.data.customerDepositSet,
            requiresSvcApproval: res.data.requiresSvcApproval,
          });
          this.isVisible.set(false);
        } else {
          const message = res.message || 'Failed to save deposit.';
          this.saveError.set(message);
          this.maybeRevealOverrideOnRejection(type, message);
        }
      },
      error: (err) => {
        this.isSaving.set(false);
        const message = err?.error?.message || 'Failed to save deposit.';
        this.saveError.set(message);
        this.maybeRevealOverrideOnRejection(type, message);
      },
    });
  }
}
