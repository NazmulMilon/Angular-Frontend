import { NgClass, NgTemplateOutlet, PercentPipe, DecimalPipe } from '@angular/common';
import {
  Component,
  OnDestroy,
  HostListener,
  ViewChild,
  inject,
  input,
  signal,
  computed,
  effect,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subject, debounceTime, distinctUntilChanged, finalize, takeUntil } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { VendorBillsService } from '../../../services/vendor-bills.service';
import { AssignVendorService } from '../../../services/assign-vendor.service';
import { AuthTokenService } from '../../../services/auth-token.service';
import {
  AdminCustomerDneTracker,
  AdminJobEstimateCard,
  AdminJobEstimateActionTarget,
  AdminJobEstimateOptionSection,
  AdminJobEstimateLineItem,
  AdminJobEstimateStatusDisplay,
  AdminCreateEstimateModalData,
  EstimateManageStatusAction,
  AdminEstimateNegotiation,
  AdminEstimateNegotiationLine,
  NegotiationLineDecisionState,
  AdminJobVendorForEstimate,
  AdminCounterLineAction,
} from '../../../models/vendor-bills.model';
import {
  EstimateManageStatusOption,
  getEstimateManageStatusOptions,
  getNegotiationBadge,
  NegotiationBadge,
} from './estimate-manage-status';
import {
  EstimateApprovalPanelComponent,
  VendorApprovalSubmitEvent,
} from './estimate-approval-panel/estimate-approval-panel.component';
import {
  EstimateRejectPanelComponent,
  VendorRejectSubmitEvent,
} from './estimate-reject-panel/estimate-reject-panel.component';
import {
  EstimateNegotiationLineComponent,
  NegotiationLineEditConfirmEvent,
} from '../../../shared/components/estimate-negotiation-line/estimate-negotiation-line.component';
import {
  EstimateDeclinePanelComponent,
  VendorDeclineSubmitEvent,
} from './estimate-decline-panel/estimate-decline-panel.component';
import { NegotiatingAgentService } from '../../../services/negotiating-agent.service';
import { DynMinMarkupService } from '../../../services/dyn-min-markup.service';
import { DynMinMarkupOptionResult } from '../../../models/dyn-min-markup.model';
import { OnSiteEstimateModalComponent } from '../../../shared/components/on-site-estimate-modal/on-site-estimate-modal.component';
import { CreateCustomerEstimateModalComponent } from '../../../shared/components/create-customer-estimate-modal/create-customer-estimate-modal.component';
import { SendCustomerEstimateModalComponent } from '../../../shared/components/send-customer-estimate-modal/send-customer-estimate-modal.component';
import {
  MultiVendorSelectModalComponent,
  MultiVendorSelectCandidate,
  MultiVendorSelectOption,
} from '../../../shared/components/multi-vendor-select-modal/multi-vendor-select-modal.component';
import {
  EstimateVendorDepositModalComponent,
  VendorDepositCompleteEvent,
} from './estimate-vendor-deposit-modal/estimate-vendor-deposit-modal.component';
import { CreateCustomerInvoiceModalComponent } from '../../../shared/components/create-customer-invoice-modal/create-customer-invoice-modal.component';
import { CreateCustomerInvoiceFromVendorModalComponent } from '../../../shared/components/create-customer-invoice-from-vendor-modal/create-customer-invoice-from-vendor-modal.component';
import { CustomerInvoiceSource } from '../../../models/customer-invoice.model';
import { DepositApprovalSummaryModalComponent } from '../deposit/deposit-approval-summary-modal/deposit-approval-summary-modal.component';
import { DepositApprovalNotificationService } from '../deposit/deposit-approval-notification.service';
import { DepositService } from '../../../services/deposit.service';

/**
 * Estimating / On-Site Approval UI — extracted from Customer & Vendor Invoicing (RBR-463) so it can live on
 * its own job-scoped page. Owns everything estimate-card related: cards, negotiation, the
 * Create Estimate modal, manage-status menu, and the approval/reject/decline panels.
 */
@Component({
  selector: 'app-job-estimates-section',
  standalone: true,
  imports: [
    FormsModule,
    NgClass,
    NgTemplateOutlet,
    PercentPipe,
    DecimalPipe,
    EstimateApprovalPanelComponent,
    EstimateRejectPanelComponent,
    EstimateDeclinePanelComponent,
    EstimateNegotiationLineComponent,
    OnSiteEstimateModalComponent,
    CreateCustomerEstimateModalComponent,
    SendCustomerEstimateModalComponent,
    MultiVendorSelectModalComponent,
    EstimateVendorDepositModalComponent,
    CreateCustomerInvoiceModalComponent,
    CreateCustomerInvoiceFromVendorModalComponent,
    DepositApprovalSummaryModalComponent,
  ],
  templateUrl: './job-estimates-section.component.html',
  styleUrl: './job-estimates-section.component.scss',
})
export class JobEstimatesSectionComponent implements OnDestroy {
  private readonly vendorBillsSvc = inject(VendorBillsService);
  private readonly negotiatingAgentSvc = inject(NegotiatingAgentService);
  private readonly dynMinMarkupSvc = inject(DynMinMarkupService);
  private readonly assignVendorSvc = inject(AssignVendorService);
  private readonly authTokenSvc = inject(AuthTokenService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly depositSvc = inject(DepositService);
  private readonly depositApprovalNotification = inject(DepositApprovalNotificationService);
  private readonly destroy$ = new Subject<void>();
  private readonly estSearch$ = new Subject<string>();

  /** Job key from the host page; loads estimates itself once this becomes truthy. */
  jobKey = input('');

  // ── Estimating / On-Site Approval ───────────────────────────
  estDneTracker = signal<AdminCustomerDneTracker | null>(null);
  estCards = signal<AdminJobEstimateCard[]>([]);
  estTotalRecords = signal(0);
  estIsLoading = signal(false);
  estErrorMessage = signal('');
  estPageSize = signal(25);
  estCurrentPage = signal(1);
  estSearchText = signal('');
  /** Expanded estimate cards (newest open by default after load). */
  estExpandedKeys = signal<Record<string, boolean>>({});

  /** Distinct eligible vendors on this job — "combine" action only makes sense with 2+. */
  estDistinctVendorCount = computed(
    () =>
      new Set(
        this.estCards()
          .filter((card) => !card.isDeleted && !card.isVendorDeleted)
          .map((card) => card.jobVendorKey ?? card.vendorName),
      ).size,
  );
  /** Estimates the user has opened (accordion expanded) at least once this session. */
  estViewedKeys = signal<Record<string, boolean>>({});
  /** Popup message shown when a revision request is blocked until sibling estimates are viewed. */
  estViewOtherError = signal<string | null>(null);
  /** Active option tab per multi-option estimate card (estimateKey → option estimateKey). */
  estActiveOptionKeys = signal<Record<string, string>>({});
  /**
   * Minimum-markup preview per vendor-option estimate (option estimateKey → result). Advisory:
   * shows the minimum customer total each option must reach given its vendor cost + the customer's
   * markup policy. Populated after estimates load for multi-option cards; absent when no policy /
   * customer key / on error (the preview line just doesn't render).
   */
  estMinMarkupPreview = signal<Record<string, DynMinMarkupOptionResult>>({});
  /** General message to vendor, keyed by estimateKey. */
  estGeneralMessages = signal<Record<string, string>>({});
  estSendBusy = signal<Record<string, boolean>>({});
  estSendError = signal<Record<string, string>>({});
  estStubMessage = signal('');
  /** Success banner text (e.g. after a deposit save completes); separate from estStubMessage so it never gets a "coming soon" suffix. */
  estSuccessMessage = signal('');
  /**
   * Blocking acknowledgement shown after a deposit save that left the deposit pending SVC-manager
   * approval — deliberately has no close/backdrop-dismiss, only the "OK, got it" button below, so the
   * admin can't miss that the customer can't be emailed yet. Browser back/refresh/tab-close aren't
   * intercepted (a native beforeunload prompt can't carry this copy and isn't worth fighting).
   */
  estSvcApprovalNoticeOpen = signal(false);


  /** lineItemId of the inline negotiation row whose agent-reasoning popover is open (one at a time). */
  estInfoPopoverOpen = signal<string | null>(null);
  estInfoPopoverPosition = signal<{ top: number; left: number; placement: 'above' | 'below' } | null>(null);
  /** Inline Expand under a line strip: Edit / Info / Message panels (mockup .xp). */
  estLineExpand = signal<{ estimateKey: string; lineItemId: string; mode: 'edit' | 'info' | 'msg' } | null>(null);
  /** The negotiation line whose info popover is currently open, so the popover can show its structured stats plus reasoning. */
  readonly estInfoPopoverLine = computed<AdminEstimateNegotiationLine | null>(() => {
    const lineItemId = this.estInfoPopoverOpen();
    if (!lineItemId) return null;
    for (const negotiation of Object.values(this.estNegotiations())) {
      const line = negotiation.lines.find((l) => l.lineItemId === lineItemId);
      if (line) return line;
    }
    return null;
  });

  // Create Estimate modal (EIndex parity — no redirect to legacy EIndex)
  estCreateModalOpen = signal(false);
  estCreateModalLoading = signal(false);
  estCreateModalData = signal<AdminCreateEstimateModalData | null>(null);
  estCreateModalMessage = signal('');
  estCreateEmailNote = signal('');
  estCreateCustomEmail = signal('');
  estCreateSelectedJobVendorKey = signal('');
  estCreateSelectedContacts = signal<{ contactKey: string; jobVendorKey: string }[]>([]);
  estCreateSending = signal(false);
  estCreateShowActions = signal(true);

  // ── Negotiating agent (per estimate card) ─────────────────────
  estNegotiations = signal<Record<string, AdminEstimateNegotiation>>({});
  estNegotiationLoading = signal<Record<string, boolean>>({});
  estNegotiationErrors = signal<Record<string, string>>({});
  estLineDecisions = signal<Record<string, Record<string, NegotiationLineDecisionState>>>({});
  /** Per-line message to vendor (mockup Message expand), keyed by estimateKey → lineItemId. */
  estLineMessages = signal<Record<string, Record<string, string>>>({});
  /** Agent draft snapshot so we can show "edited" / reset, keyed the same way. */
  estLineMessageDrafts = signal<Record<string, Record<string, string>>>({});

  // ── Additional Approval panel (post-approve send-to-vendor) ─────────────
  /** estimateKey of the card currently showing the Additional Approval panel. */
  estApprovalPanelOpenFor = signal<string | null>(null);
  estApprovalSubmitting = signal(false);
  estApprovalError = signal('');
  estApprovalInfo = signal('');
  /** DNE soft-warning state, keyed by estimateKey; acknowledging lets approve proceed. */
  estDneWarningAcknowledged = signal<Record<string, boolean>>({});

  // ── Reject for Resubmission panel ───────────────────────────────────────
  /** estimateKey of the card currently showing the Reject panel. */
  estRejectPanelOpenFor = signal<string | null>(null);
  estRejectSubmitting = signal(false);
  estRejectError = signal('');

  // ── Decline panel ────────────────────────────────────────────────────────
  /** estimateKey of the card currently showing the Decline panel. */
  estDeclinePanelOpenFor = signal<string | null>(null);
  estDeclineSubmitting = signal(false);
  estDeclineError = signal('');
  /**
   * Job-vendor contacts for the Additional Approval panel's recipient list, loaded eagerly on
   * page load (not tied to the Create Estimate modal, which only loads on demand when opened).
   */
  estJobVendorContacts = signal<AdminJobVendorForEstimate[]>([]);

  readonly estPageSizeOptions = [10, 25, 50];
  readonly estTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.estTotalRecords() / this.estPageSize())),
  );
  readonly estShowingFrom = computed(() =>
    this.estTotalRecords() === 0 ? 0 : (this.estCurrentPage() - 1) * this.estPageSize() + 1,
  );
  readonly estShowingTo = computed(() =>
    Math.min(this.estCurrentPage() * this.estPageSize(), this.estTotalRecords()),
  );
  /** Whether the job has at least one active customer estimate — gates actions that depend on one existing. */
  hasCustomerEstimate = signal(false);
  /** Whether the job's current status is Tech On-Site — gates the "Pending Approval (Estimate)"
   * Manage Status option for a vendor's freshly-resubmitted estimate (see currentManageAction). */
  isJobTechOnSite = signal(false);
  /** Whether the job has any deposit (vendor or customer) — gates the "Deposits on Job" button. */
  hasAnyDeposit = signal(false);
  /** Shared per-admin unseen-decision signal — same one driving the Estimates-tab notification dot. */
  readonly hasUnseenDepositDecision = this.depositApprovalNotification.hasUnseenDepositDecision;

  readonly estDneProgressPercent = computed(() => {
    const dne = this.estDneTracker();
    if (!dne || dne.customerDne <= 0) return 0;
    return Math.min(100, (dne.committedAmount / dne.customerDne) * 100);
  });
  /**
   * Traffic-light state for the DNE tracker bar/card: 'safe' while committed spend is under
   * the minimum-markup threshold (the amount approvable without a customer DNE increase),
   * 'warn' once past that threshold but still under the full customer DNE, 'over' at/above it.
   */
  readonly estDneState = computed<'safe' | 'warn' | 'over'>(() => {
    const dne = this.estDneTracker();
    if (!dne || dne.customerDne <= 0) return 'safe';
    if (dne.committedAmount >= dne.customerDne) return 'over';
    if (dne.committedAmount >= dne.minimumMarkupAmount) return 'warn';
    return 'safe';
  });
  readonly estCreateMultipleVendors = computed(
    () => (this.estCreateModalData()?.vendors.length ?? 0) > 1,
  );

  private readonly onInfoPopoverScroll = (): void => {
    if (this.estInfoPopoverOpen()) {
      this.closeEstInfoPopover();
    }
  };

  /** Refresh estimate cards when the tab regains focus (e.g. after vendor submits on-site approval). */
  private readonly onEstimatePageVisibilityRefresh = (): void => {
    if (document.visibilityState === 'visible' && this.jobKey()) {
      this.loadEstPage();
    }
  };

  @ViewChild(OnSiteEstimateModalComponent) private onSiteEstimateModal?: OnSiteEstimateModalComponent;
  @ViewChild(CreateCustomerEstimateModalComponent)
  private createCustomerEstimateModal?: CreateCustomerEstimateModalComponent;

  @ViewChild(SendCustomerEstimateModalComponent)
  private sendCustomerEstimateModal?: SendCustomerEstimateModalComponent;

  @ViewChild(CreateCustomerInvoiceModalComponent)
  private createCustomerInvoiceModal?: CreateCustomerInvoiceModalComponent;
  @ViewChild(CreateCustomerInvoiceFromVendorModalComponent)
  private createCustomerInvoiceFromVendorModal?: CreateCustomerInvoiceFromVendorModalComponent;
  @ViewChild(MultiVendorSelectModalComponent)
  private multiVendorSelectModal?: MultiVendorSelectModalComponent;
  @ViewChild('invoiceMultiVendorSelectModal')
  private invoiceMultiVendorSelectModal?: MultiVendorSelectModalComponent;
  @ViewChild(EstimateVendorDepositModalComponent)
  private estimateVendorDepositModal?: EstimateVendorDepositModalComponent;
  @ViewChild(DepositApprovalSummaryModalComponent)
  private depositApprovalSummaryModal?: DepositApprovalSummaryModalComponent;

  constructor() {
    document.addEventListener('scroll', this.onInfoPopoverScroll, true);
    document.addEventListener('visibilitychange', this.onEstimatePageVisibilityRefresh);

    this.estSearch$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => {
        this.estCurrentPage.set(1);
        this.loadEstPage();
      });

    let loadedKey = '';
    effect(() => {
      const key = this.jobKey();
      if (!key || key === loadedKey) return;
      loadedKey = key;
      this.loadEstPage();
      this.loadJobVendorContacts();
    });
  }

  ngOnDestroy(): void {
    document.removeEventListener('scroll', this.onInfoPopoverScroll, true);
    document.removeEventListener('visibilitychange', this.onEstimatePageVisibilityRefresh);
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Estimating actions ──────────────────────────────────────

  onCreateEstimateOnBehalf(): void {
    this.openCreateEstimateModal();
  }

  /**
   * "Combine Vendor Estimates" — Step 1: open the multi-select picker over this job's eligible
   * vendor estimates (same eligibility as the single-vendor "Create Customer Estimate" action:
   * excludes deleted estimates / deleted vendors). Step 2 (the merged editor) opens from
   * onMultiVendorSelectionNext below once the admin picks 2+ and clicks Next.
   */
  onCreateCustomerEstimateFromMultiple(): void {
    this.multiVendorSelectModal?.open(this.buildMultiVendorCandidates());
  }

  /** Step 1 confirmed (2+ estimates selected) — open the merged customer-estimate editor. */
  onMultiVendorSelectionNext(vendorEstimateKeys: string[]): void {
    this.createCustomerEstimateModal?.open({
      jobKey: this.jobKey(),
      vendorEstimateKeys,
      vendorNames: this.vendorNamesForKeys(vendorEstimateKeys),
      mode: 'create',
      customerKey: this.estDneTracker()?.customerKey ?? undefined,
      customerEmail: null,
    });
  }

  /** "Combine Vendor Estimates" for an invoice — Step 1: open the invoice-flavored picker. */
  onCreateCustomerInvoiceFromMultiple(): void {
    this.invoiceMultiVendorSelectModal?.open(this.buildMultiVendorCandidates());
  }

  /** Step 1 confirmed (2+ estimates selected) — open the merged customer-invoice editor. */
  onInvoiceMultiVendorSelectionNext(vendorEstimateKeys: string[]): void {
    this.withDepositGate(() =>
      this.createCustomerInvoiceFromVendorModal?.open({
        jobKey: this.jobKey(),
        vendorEstimateKeys,
        vendorNames: this.vendorNamesForKeys(vendorEstimateKeys),
        customerKey: this.estDneTracker()?.customerKey ?? undefined,
      }),
    );
  }

  /** Candidate-building for the multi-vendor picker, shared by the estimate and invoice "combine" flows. */
  private buildMultiVendorCandidates(): MultiVendorSelectCandidate[] {
    return this.estCards()
      .filter((card) => !card.isDeleted && !card.isVendorDeleted)
      .map((card) => {
        const primaryOption: MultiVendorSelectOption = {
          estimateKey: card.estimateKey,
          optionLabel: card.isMultipleOptionEstimate
            ? this.parseOptionSectionTitle(card.estimateTitle, 1).optionLabel
            : null,
          estimateNo: card.estimateNo,
          estimateDateDisplay: card.estimateDateDisplay,
          estimateTotal: card.estimateTotal,
          statusLabel: card.statusLabel,
          lineItems: (card.lineItems ?? []).map((li) => ({
            itemName: li.itemName,
            quantity: li.quantity,
            rate: li.rate,
            rowTotal: li.rowTotal,
          })),
        };
        const otherOptions: MultiVendorSelectOption[] = (card.optionSections ?? []).map(
          (section, index) => {
            const meta = this.parseOptionSectionTitle(section.title, index + 2);
            return {
              estimateKey: section.estimateKey,
              optionLabel: meta.optionLabel,
              estimateNo: card.estimateNo,
              estimateDateDisplay: card.estimateDateDisplay,
              estimateTotal: section.sectionTotal,
              statusLabel: section.statusLabel,
              lineItems: (section.lineItems ?? []).map((li) => ({
                itemName: li.itemName,
                quantity: li.quantity,
                rate: li.rate,
                rowTotal: li.rowTotal,
              })),
            };
          },
        );
        return {
          vendorKey: card.jobVendorKey ?? card.estimateKey,
          vendorName: card.vendorName,
          options: [primaryOption, ...otherOptions],
        };
      });
  }

  /** vendorEstimateKey/optionKey → vendor display name, for the multi-vendor grid's group headers. */
  private vendorNamesForKeys(vendorEstimateKeys: string[]): Record<string, string> {
    const vendorNames: Record<string, string> = {};
    for (const card of this.estCards()) {
      if (vendorEstimateKeys.includes(card.estimateKey)) {
        vendorNames[card.estimateKey] = card.vendorName;
      }
      for (const section of card.optionSections ?? []) {
        if (vendorEstimateKeys.includes(section.estimateKey)) {
          vendorNames[section.estimateKey] = card.vendorName;
        }
      }
    }
    return vendorNames;
  }

  onEstStubAction(label: string): void {
    this.estStubMessage.set(`${label} — coming soon (flow TBD).`);
    window.setTimeout(() => {
      if (this.estStubMessage().startsWith(label)) this.estStubMessage.set('');
    }, 4000);
  }

  // ── Customer invoice creation (Path 1 from scratch, Path 2 from estimate) ────────────

  /**
   * Runs the deposit gate (legacy CheckForDepositInvoice) before opening an invoice flow, then invokes
   * `open` when creation is allowed. A blocked gate surfaces its message in the error alert.
   */
  private withDepositGate(open: () => void): void {
    const jobKey = this.jobKey();
    if (!jobKey) {
      open();
      return;
    }
    this.estErrorMessage.set('');
    this.vendorBillsSvc.checkDepositGate(jobKey).subscribe((res) => {
      if (res.status && res.data && !res.data.canProceed) {
        this.estErrorMessage.set(res.data.message);
        return;
      }
      open();
    });
  }

  /** Path 1 — create a customer invoice from scratch (job-level "Add New Invoice"). */
  onAddNewInvoice(): void {
    this.withDepositGate(() =>
      this.createCustomerInvoiceModal?.open({
        source: CustomerInvoiceSource.Scratch,
        jobKey: this.jobKey(),
        sourceLabel: 'From Scratch',
      }),
    );
  }

  onOpenDepositSummary(): void {
    const key = this.jobKey();
    if (!key) return;
    this.depositApprovalSummaryModal?.open(key);
  }

  /**
   * Path 2 — the Edit Customer Estimate editor asked to save the current estimate as an invoice.
   * Opens the invoice modal seeded (read-only) from that customer estimate.
   */
  onSaveEstimateAsInvoice(event: { customerEstimateKey: string }): void {
    if (!event?.customerEstimateKey) return;
    this.withDepositGate(() =>
      this.createCustomerInvoiceModal?.open({
        source: CustomerInvoiceSource.CustomerEstimate,
        jobKey: this.jobKey(),
        sourceKey: event.customerEstimateKey,
        sourceLabel: 'From Customer Estimate',
      }),
    );
  }

  /** A customer invoice was persisted — refresh the estimate cards. */
  onCustomerInvoiceCreated(_event: { customerInvoiceKey: string; invoiceNo: number | null }): void {
    this.loadEstPage();
  }

  /** A gated customer invoice (from-vendor-estimate, single or multi-vendor) was persisted. */
  onCustomerInvoiceFromVendorCreated(_event: { customerInvoiceKey: string; invoiceNo: number | null }): void {
    this.loadEstPage();
  }

  // ── Vendor / customer deposit flow modal (RBR-466) ───────────────────────
  /**
   * "Agree to Pay Vendor Deposit" — one button per vendor card, scoped to that card's vendor.
   * The customer estimate the card's vendor estimate feeds into supplies the customer side (there is
   * one per job), while `jobVendorKey` tells the modal which vendor's deposit is being set. The modal
   * still loads the whole vendor group so the other vendors' saved deposits count toward the
   * customer-side 35% check, but only this vendor's step is shown and only this vendor is saved.
   */
  openVendorDepositModal(card: { jobVendorKey?: string | null }): void {
    if (!card.jobVendorKey) {
      this.estErrorMessage.set('This estimate has no vendor assignment, so a vendor deposit cannot be set.');
      return;
    }
    const jobVendorKey = card.jobVendorKey;

    this.assignVendorSvc.getCustomerEstimateHistory(this.jobKey()).subscribe({
      next: (res) => {
        const current = res.status ? res.data?.current : null;
        if (!current?.customerEstimateKey) {
          this.estErrorMessage.set('No customer estimate found for this job yet — create one before setting a deposit.');
          return;
        }
        this.estimateVendorDepositModal?.open({
          jobKey: this.jobKey(),
          customerEstimateKey: current.customerEstimateKey,
          jobVendorKey,
          customerEstimateTotal: current.customerTotal,
        });
      },
      error: () => {
        this.estErrorMessage.set('Failed to load the customer estimate for this job.');
      },
    });
  }

  closeVendorDepositModal(): void {
    // The modal manages its own visibility signal; still check for a pending Save & Send hand-off,
    // since dismissing the deposit prompt without saving shouldn't also swallow the send request.
    this.openPendingSendIfAny();
  }

  onVendorDepositComplete(event: VendorDepositCompleteEvent): void {
    // A vendor deposit was paid out and/or a customer deposit was actually collected — this now
    // requires SVC Manager approval (see the deposit approval email flow) before the customer estimate
    // can go out. Any pending Save & Send hand-off is dropped rather than opening the send modal, so
    // the estimate isn't emailed to the customer ahead of that approval.
    const depositWasSet = event.vendorsSaved > 0 || event.customerDepositSet;

    const baseMessage =
      event.type === 'no-customer-deposit'
        ? 'Continuing with no customer deposit — reason recorded.'
        : event.type === 'customer-deposit-saved'
          ? `Customer deposit saved (${event.vendorsSaved} vendor deposit${event.vendorsSaved === 1 ? '' : 's'} set).`
          : 'Vendor deposit saved.';

    this.estSuccessMessage.set(baseMessage);
    window.setTimeout(() => {
      if (this.estSuccessMessage() === baseMessage) this.estSuccessMessage.set('');
    }, 4000);
    this.loadEstPage();

    // Pending SVC-manager approval blocks sending to the customer — surface a blocking
    // acknowledgement rather than folding it into the auto-dismissing toast above.
    if (event.requiresSvcApproval) {
      this.estSvcApprovalNoticeOpen.set(true);
    }

    if (depositWasSet) {
      const ceKey = this.estimateVendorDepositModal?.customerEstimateKey();
      if (ceKey) this.pendingSendKeys.delete(ceKey);
      return;
    }

    this.openPendingSendIfAny();
  }

  /** Dismisses the blocking SVC-manager-approval notice — the only way past it. */
  acknowledgeSvcApprovalNotice(): void {
    this.estSvcApprovalNoticeOpen.set(false);
  }

  /** If the estimate just handled by the deposit modal was a Save & Send, open the email modal now. */
  private openPendingSendIfAny(): void {
    const ceKey = this.estimateVendorDepositModal?.customerEstimateKey();
    if (!ceKey || !this.pendingSendKeys.delete(ceKey)) return;
    this.sendCustomerEstimateModal?.open({ customerEstimateKey: ceKey });
  }

  onEstPageSizeChange(value: string | number): void {
    this.estPageSize.set(Number(value) || 25);
    this.estCurrentPage.set(1);
    this.loadEstPage();
  }

  toggleEstCard(estimateKey: string): void {
    const willExpand = !this.estExpandedKeys()[estimateKey];
    this.estExpandedKeys.update((prev) => ({
      ...prev,
      [estimateKey]: willExpand,
    }));
    // Opening a card counts as "viewing" it; the flag stays set even after collapse.
    if (willExpand) this.markEstimateViewed(estimateKey);
  }

  isEstCardExpanded(estimateKey: string): boolean {
    return !!this.estExpandedKeys()[estimateKey];
  }

  private markEstimateViewed(estimateKey: string): void {
    const key = this.normalizeEstimateKey(estimateKey);
    if (this.estViewedKeys()[key]) return;
    this.estViewedKeys.update((prev) => ({ ...prev, [key]: true }));
  }

  /**
   * Sibling estimate cards on this job that the user has not opened yet. A revision request
   * is blocked until every other estimate on the job has been viewed at least once.
   */
  private unviewedSiblingEstimates(estimateKey: string): AdminJobEstimateCard[] {
    const currentKey = this.normalizeEstimateKey(estimateKey);
    const viewed = this.estViewedKeys();
    return this.estCards().filter((card) => {
      const key = this.normalizeEstimateKey(card.estimateKey);
      if (key === currentKey) return false;
      // Deleted / vendor-deleted estimates can't be opened, so don't require viewing them.
      if (card.isDeleted || card.isVendorDeleted) return false;
      return !viewed[key];
    });
  }

  closeEstViewOtherError(): void {
    this.estViewOtherError.set(null);
  }

  cardForEstimate(estimateKey: string): AdminJobEstimateCard | null {
    return this.findEstimateCard(estimateKey);
  }

  estGeneralMessage(estimateKey: string): string {
    return this.estGeneralMessages()[this.normalizeEstimateKey(estimateKey)] ?? '';
  }

  setEstGeneralMessage(estimateKey: string, message: string): void {
    const key = this.normalizeEstimateKey(estimateKey);
    this.estGeneralMessages.update((prev) => ({ ...prev, [key]: message }));
  }

  estRollup(estimateKey: string): { vendorProposed: number; requestedTotal: number; savings: number } {
    const neg = this.estNegotiationFor(estimateKey);
    const card = this.findEstimateCard(estimateKey);
    const vendorProposed = card ? this.estimateTotalFor(estimateKey, card) : 0;
    if (!neg) return { vendorProposed, requestedTotal: vendorProposed, savings: 0 };

    let requestedTotal = 0;
    for (const line of neg.lines) {
      if (!line.counterThisLine) {
        requestedTotal += line.vendorValue ?? 0;
        continue;
      }
      const decision = this.estLineDecisionFor(estimateKey, line.lineItemId)?.decision ?? 'accept';
      if (decision === 'decline') {
        requestedTotal += line.vendorValue ?? 0;
      } else if (decision === 'edit') {
        const state = this.estLineDecisionFor(estimateKey, line.lineItemId);
        requestedTotal += state?.editedValue ?? line.suggestedValue ?? line.vendorValue ?? 0;
      } else {
        requestedTotal += line.suggestedValue ?? line.vendorValue ?? 0;
      }
    }

    return {
      vendorProposed,
      requestedTotal,
      savings: vendorProposed - requestedTotal,
    };
  }

  canSendRevision(estimateKey: string): boolean {
    if (this.estGeneralMessage(estimateKey).trim().length > 0) return true;
    const key = this.normalizeEstimateKey(estimateKey);
    const decisions = this.estLineDecisions()[key];
    if (!decisions) return false;
    const neg = this.estNegotiationFor(estimateKey);
    if (!neg) return false;
    return neg.lines.some((line) => line.counterThisLine && !!decisions[line.lineItemId]);
  }

  onSendRevisionRequest(estimateKey: string): void {
    const key = this.normalizeEstimateKey(estimateKey);
    const neg = this.estNegotiationFor(estimateKey);
    if (!neg || !this.canSendRevision(estimateKey)) return;

    // Require every other estimate on this job to be opened before a revision can be sent.
    const unviewed = this.unviewedSiblingEstimates(estimateKey);
    if (unviewed.length > 0) {
      const list = unviewed.map((card) => card.estimateNo).join(', ');
      this.estViewOtherError.set(`Please view other Est # ${list}`);
      return;
    }

    const actions: AdminCounterLineAction[] = [];
    for (const line of neg.lines) {
      if (!line.counterThisLine) continue;
      const state = this.estLineDecisionFor(estimateKey, line.lineItemId);
      // The agent requires an action for every proposed line, so we can't skip untouched
      // lines. Default them to "decline", which keeps the vendor's ORIGINAL value (the delivery
      // service leaves declined lines unchanged). Only "Use Counter" (accept) sends the
      // agent-suggested amount; "Edit" sends the admin's edited value.
      const decision = state?.decision ?? 'decline';
      if (decision === 'decline') {
        actions.push({
          lineItemId: line.lineItemId,
          action: 'decline',
          value: line.vendorValue,
          qty: line.suggestedQty ?? null,
          notes: this.estLineMessage(estimateKey, line.lineItemId) || null,
        });
      } else if (decision === 'edit') {
        actions.push({
          lineItemId: line.lineItemId,
          action: 'edit',
          value: state?.editedValue ?? line.suggestedValue,
          qty: state?.editedQty ?? line.suggestedQty ?? null,
          notes: this.estLineMessage(estimateKey, line.lineItemId) || null,
        });
      } else {
        // The negotiating agent requires action=accept to submit its OWN suggested_value
        // exactly (ACCEPT_VALUE_MISMATCH otherwise). A locked vendor rate can raise
        // suggestedValue above the agent's raw recommendation (e.g. a locked trip rate
        // flooring $71.30 to $75.00) — those lines must go through action=edit instead,
        // the only action that lets us submit a value the agent didn't itself suggest.
        actions.push({
          lineItemId: line.lineItemId,
          action: line.lockedRate != null && line.lockedRate > 0 ? 'edit' : 'accept',
          value: line.suggestedValue,
          qty: line.suggestedQty ?? null,
          notes: this.estLineMessage(estimateKey, line.lineItemId) || null,
        });
      }
    }

    this.estSendBusy.update((prev) => ({ ...prev, [key]: true }));
    this.estSendError.update((prev) => ({ ...prev, [key]: '' }));

    this.negotiatingAgentSvc
      .sendCounter(estimateKey, {
        roundNumber: (neg.roundsCount ?? 0) + 1,
        actions,
        notesToVendor: this.estGeneralMessage(estimateKey).trim() || null,
      })
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.estSendBusy.update((prev) => ({ ...prev, [key]: false }));
        }),
      )
      .subscribe((res) => {
        if (!res?.status) {
          this.estSendError.update((prev) => ({
            ...prev,
            [key]: res?.message || 'Failed to send revision request.',
          }));
          return;
        }
        if (res.data) {
          this.patchNegotiation(estimateKey, res.data);
        }
        if (res.data?.estimateEnteredNegotiate) {
          // Any accepted/edited counter puts the estimate into active negotiation ("Negotiate");
          // a general-message-only send (all lines declined, or no negotiable lines) reads as a
          // plain "Revision Requested" — mirrors AdminVendorBillsService.MapStatusZeroLabel.
          const hasAcceptedCounter = actions.some((a) => a.action === 'accept' || a.action === 'edit');
          this.estPatchStatusLocally(estimateKey, {
            action: 'estimate-reject-resubmit',
            label: hasAcceptedCounter ? 'Negotiate' : 'Revision Requested',
            badgeVariant: 'resubmit',
          });
        }
        this.loadEstPage();
      });
  }

  /**
   * Maps the estimate's current displayed status back to the matching manage-status
   * action, so the inline dropdown shows the current status as its selected option.
   * Returns '' (the "Manage Status" placeholder) when no action maps cleanly.
   */
  currentManageAction(target: AdminJobEstimateActionTarget): EstimateManageStatusAction | '' {
    switch (target.statusLabel) {
      case 'Approved':
        return target.statusPillVariant === 'onsite-approval'
          ? 'onsite-approval-approved'
          : 'estimate-approved';
      case 'Declined':
        return 'estimate-declined';
      case 'Revision Requested':
        return 'estimate-reject-resubmit';
      case 'Negotiate':
        return 'negotiate';
      case 'Pending Approval':
        switch (target.statusPillVariant) {
          case 'onsite':
            return 'onsite-approval-requested';
          case 'estimate':
            return 'estimate-submitted';
          case 'change-order':
            return 'change-order-requested';
          default:
            // No pill: a vendor's fresh resubmit (status=0, isEdited && editedByVendor) also
            // displays "Pending Approval" but carries no pill (MapStatusPill returns null for
            // status 0 regardless of case). Reuses the same "Pending Approval (Estimate)" option
            // as the pilled status=4 case, per business rule: treat it as ordinary pending
            // approval unless the job is currently Tech On-Site, in which case there's no clean
            // dropdown mapping and it falls back to the placeholder.
            return this.isJobTechOnSite() ? '' : 'estimate-submitted';
        }
      default:
        return '';
    }
  }

  /** Inline Manage Status dropdown: applies the chosen action directly (no modal). */
  onManageStatusSelect(target: AdminJobEstimateActionTarget, action: string): void {
    if (!action) return;
    const option = this.estManageStatusOptions(target).find((o) => o.action === action);
    if (!option) return;
    this.onManageEstimateStatus(target, option);
  }

  private submitGenericManageStatus(
    target: AdminJobEstimateActionTarget,
    option: EstimateManageStatusOption,
  ): void {
    this.estErrorMessage.set('');
    this.vendorBillsSvc
      .updateEstimateManageStatus(target.estimateKey, {
        action: option.action,
        adminRemark: null,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        if (res?.status) {
          this.estPatchStatusLocally(target.estimateKey, option);
        } else {
          this.estErrorMessage.set(res?.message || 'Failed to update estimate status.');
        }
      });
  }

  openCreateEstimateModal(): void {
    const key = this.jobKey();
    if (!key) return;

    this.estCreateModalOpen.set(true);
    this.estCreateModalLoading.set(true);
    this.estCreateModalMessage.set('');
    this.estCreateCustomEmail.set('');
    this.estCreateSelectedContacts.set([]);
    this.estCreateSelectedJobVendorKey.set('');
    this.estCreateShowActions.set(true);
    this.estCreateSending.set(false);
    this.estCreateModalData.set(null);

    this.vendorBillsSvc
      .getCreateEstimateModal(key)
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        this.estCreateModalLoading.set(false);
        if (!res.status || !res.data) {
          this.estCreateModalMessage.set(res.message || 'Failed to load vendor contacts.');
          return;
        }

        this.estCreateModalData.set(res.data);
        if (!res.data.hasVendors) {
          this.estCreateModalMessage.set('No Vendor assigned.');
          this.estCreateShowActions.set(false);
          this.estCreateEmailNote.set('');
          return;
        }

        this.estCreateEmailNote.set(res.data.defaultEmailNote);
        this.initCreateEstimateSelections(res.data);
      });
  }

  closeCreateEstimateModal(): void {
    this.estCreateModalOpen.set(false);
  }

  private initCreateEstimateSelections(data: AdminCreateEstimateModalData): void {
    const preselectedVendor = data.vendors.find((v) => v.preSelectedAsVendor);
    if (preselectedVendor) {
      this.estCreateSelectedJobVendorKey.set(preselectedVendor.jobVendorKey);
    } else if (data.vendors.length === 1) {
      this.estCreateSelectedJobVendorKey.set(data.vendors[0].jobVendorKey);
    }

    const contacts: { contactKey: string; jobVendorKey: string }[] = [];
    for (const vendor of data.vendors) {
      for (const contact of vendor.contacts) {
        if (contact.preSelected) {
          contacts.push({ contactKey: contact.contactKey, jobVendorKey: vendor.jobVendorKey });
        }
      }
    }
    this.estCreateSelectedContacts.set(contacts);
  }

  isCreateContactSelected(contactKey: string): boolean {
    return this.estCreateSelectedContacts().some((c) => c.contactKey === contactKey);
  }

  toggleCreateContact(contactKey: string, jobVendorKey: string, checked: boolean): void {
    const current = this.estCreateSelectedContacts();
    if (checked) {
      if (!current.some((c) => c.contactKey === contactKey)) {
        this.estCreateSelectedContacts.set([...current, { contactKey, jobVendorKey }]);
      }
    } else {
      this.estCreateSelectedContacts.set(current.filter((c) => c.contactKey !== contactKey));
    }
  }

  submitCreateEstimateOnBehalf(): void {
    const selected = this.estCreateSelectedContacts();
    if (selected.length === 0) {
      this.estCreateModalMessage.set(
        'Please select a contact because it is necessary for the portal login and go directly into the create estimate form.',
      );
      return;
    }

    const data = this.estCreateModalData();
    const prefix = data?.vendorPortalCreateEstimateUrlPrefix;
    if (!prefix) {
      this.estCreateModalMessage.set('Vendor portal URL is not configured.');
      return;
    }

    this.estCreateShowActions.set(false);
    this.estCreateModalMessage.set('Please wait and do not click anywhere.');

    const contactKey = selected[0].contactKey;
    const adminKey = this.authTokenSvc.getAdminKeyFromToken();
    const url = `${prefix}${this.jobKey()}&ContactKey=${contactKey}&Option=1&adminKey=${adminKey}`;
    window.open(url, '_blank', 'noopener');
    this.estCreateModalMessage.set('');
    this.estCreateShowActions.set(true);
  }

  submitSendEstimateEmail(): void {
    const selected = this.estCreateSelectedContacts();
    const customEmail = this.estCreateCustomEmail().trim();
    let jobVendorKey = '';

    if (selected.length === 0) {
      if (!customEmail) {
        this.estCreateModalMessage.set('Please select a contact.');
        return;
      }
      jobVendorKey = this.estCreateSelectedJobVendorKey();
      if (!jobVendorKey) {
        this.estCreateModalMessage.set(
          'Please select a vendor for the customer email address that you have entered.',
        );
        return;
      }
    } else {
      jobVendorKey = selected[selected.length - 1].jobVendorKey;
    }

    this.estCreateShowActions.set(false);
    this.estCreateModalMessage.set('Please wait and do not click anywhere.');
    this.estCreateSending.set(true);

    this.assignVendorSvc
      .sendVendorActionMail({
        jobVendorKey,
        emailType: 5,
        emailNote: this.estCreateEmailNote(),
        vendorContactKeys: selected.map((c) => c.contactKey),
        customEmail: selected.length === 0 ? customEmail : null,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        this.estCreateSending.set(false);
        if (!res?.status) {
          this.estCreateModalMessage.set(res?.message || 'Failed to send email.');
          this.estCreateShowActions.set(true);
          return;
        }
        this.estCreateModalMessage.set(res.data ?? res.message ?? 'Email sent.');
      });
  }

  estGoToPage(page: number): void {
    const p = Math.max(1, Math.min(page, this.estTotalPages()));
    this.estCurrentPage.set(p);
    this.loadEstPage();
  }

  onEstSearchInput(value: string): void {
    this.estSearchText.set(value);
    this.estSearch$.next(value.trim());
  }

  formatCurrency(amount: number | null | undefined): string {
    return (amount ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  }

  /** Renders stored HTML descriptions (legacy MvcHtmlString parity). */
  sanitizeHtml(html: string | null | undefined): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(html ?? '');
  }

  estCardClass(card: AdminJobEstimateCard): string {
    if (card.isDeleted || card.isVendorDeleted) return 'est-card est-card--muted';
    if (card.isNew) return 'est-card est-card--new';
    return 'est-card';
  }

  /** Split legacy titles like "2nd option Estimate: Beta" into badge + readable label. */
  parseOptionSectionTitle(
    title: string | null | undefined,
    fallbackIndex: number,
  ): { optionLabel: string; displayTitle: string } {
    const raw = (title ?? '').trim();
    const legacyMatch = raw.match(/^((?:\d+(?:st|nd|rd|th)?)\s+option)\s*Estimate\s*:\s*(.+)$/i);
    if (legacyMatch) {
      return { optionLabel: legacyMatch[1], displayTitle: legacyMatch[2].trim() };
    }

    const estimateSplit = raw.split(/Estimate\s*:\s*/i);
    if (estimateSplit.length >= 2 && estimateSplit[1].trim()) {
      const prefix = estimateSplit[0].trim();
      return {
        optionLabel: prefix || `Option ${fallbackIndex}`,
        displayTitle: estimateSplit[1].trim(),
      };
    }

    if (!raw || this.isGenericMultiOptionTitle(raw)) {
      return {
        optionLabel: `Option ${fallbackIndex}`,
        displayTitle: fallbackIndex === 1 ? 'Primary' : 'Alternative',
      };
    }

    return { optionLabel: `Option ${fallbackIndex}`, displayTitle: raw };
  }

  isGenericMultiOptionTitle(title: string | null | undefined): boolean {
    return /^multiple\s+option\s+estimate$/i.test((title ?? '').trim());
  }

  showEstimateTitleInHeader(card: AdminJobEstimateCard): boolean {
    const title = card.estimateTitle?.trim();
    return !!title && !card.isMultipleOptionEstimate && !this.isGenericMultiOptionTitle(title);
  }

  /** Active option tab for a multi-option estimate card (defaults to primary). */
  activeOptionKey(card: AdminJobEstimateCard): string {
    return this.estActiveOptionKeys()[card.estimateKey] ?? card.estimateKey;
  }

  setActiveOption(cardEstimateKey: string, optionEstimateKey: string): void {
    this.estActiveOptionKeys.update((m) => ({ ...m, [cardEstimateKey]: optionEstimateKey }));
  }

  /** Minimum-markup preview for a given vendor-option estimate (undefined until loaded / when unavailable). */
  minMarkupPreview(optionEstimateKey: string): DynMinMarkupOptionResult | undefined {
    return this.estMinMarkupPreview()[optionEstimateKey];
  }

  /**
   * Loads a per-option minimum-markup preview for every multi-option card on the page. Advisory only:
   * we send customerGrandTotal = 0 so the response surfaces each option's required minimum
   * (expectedCustomerGrandTotal) and resolved markup %; we don't gate anything here. Best-effort —
   * needs a customerKey and a configured policy; any failure just leaves the preview empty.
   */
  private loadMinMarkupPreview(): void {
    const customerKey = this.estDneTracker()?.customerKey;
    const jobKey = this.jobKey();
    if (!customerKey || !jobKey) {
      this.estMinMarkupPreview.set({});
      return;
    }

    const options = this.estCards()
      .filter((card) => card.isMultipleOptionEstimate)
      .flatMap((card) => [
        // The parent card is itself the primary option; children are the alternatives.
        { estimateKey: card.estimateKey, vendorKey: card.vendorKey, total: card.estimateTotal },
        ...card.optionSections.map((s) => ({
          estimateKey: s.estimateKey,
          vendorKey: card.vendorKey,
          total: s.sectionTotal,
        })),
      ])
      .filter((o) => !!o.estimateKey);

    if (options.length === 0) {
      this.estMinMarkupPreview.set({});
      return;
    }

    this.dynMinMarkupSvc
      .checkThreshold({
        jobKey,
        customerKey,
        options: options.map((o) => ({
          optionKey: o.estimateKey,
          hasVendorEstimate: true,
          vendorGrandTotal: o.total,
          customerGrandTotal: 0,
          vendorKey: o.vendorKey,
        })),
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          const map: Record<string, DynMinMarkupOptionResult> = {};
          for (const r of res.options) {
            map[r.optionKey] = r;
          }
          this.estMinMarkupPreview.set(map);
        },
        error: () => this.estMinMarkupPreview.set({}),
      });
  }

  /** Mockup Vendor Status chip class — Cost Incurred vs Proposed only (Phase 1A). */
  vendorStatusChipClass(line: { costIncurredLabel?: string | null; costIncurredMarker?: number | null }): string {
    if (line.costIncurredMarker === 0) return 'est-status-chip--incurred';
    const label = (line.costIncurredLabel ?? '').toLowerCase();
    if (label.includes('cost incurred') || label.includes('incurred')) return 'est-status-chip--incurred';
    return 'est-status-chip--proposed';
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.closeEstInfoPopover();
  }

  toggleEstInfoPopover(lineItemId: string, event: Event): void {
    event.stopPropagation();
    if (this.estInfoPopoverOpen() === lineItemId) {
      this.closeEstInfoPopover();
      return;
    }
    const btn = event.currentTarget as HTMLElement | undefined;
    if (btn) {
      this.positionEstInfoPopover(btn);
    }
    this.estInfoPopoverOpen.set(lineItemId);
  }

  private closeEstInfoPopover(): void {
    this.estInfoPopoverOpen.set(null);
    this.estInfoPopoverPosition.set(null);
  }

  private positionEstInfoPopover(button: HTMLElement): void {
    const rect = button.getBoundingClientRect();
    const popoverWidth = 320;
    const popoverHeight = 180;
    const spaceAbove = rect.top;
    const placement: 'above' | 'below' = spaceAbove >= popoverHeight + 12 ? 'above' : 'below';
    const top = placement === 'above' ? rect.top - 8 : rect.bottom + 8;
    let left = rect.right - popoverWidth;
    if (left < 8) left = 8;
    if (left + popoverWidth > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - popoverWidth - 8);
    }
    this.estInfoPopoverPosition.set({ top, left, placement });
  }

  @HostListener('window:resize')
  onViewportChange(): void {
    if (this.estInfoPopoverOpen()) {
      this.closeEstInfoPopover();
    }
  }

  estCardActionTarget(card: AdminJobEstimateCard): AdminJobEstimateActionTarget {
    return {
      estimateKey: card.estimateKey,
      jobVendorKey: card.jobVendorKey,
      updateEstimateUrl: card.updateEstimateUrl,
      statusLabel: card.statusLabel,
      statusPillVariant: card.statusPillVariant,
      onsiteApproval: card.onsiteApproval,
      feedsCustomerEstimate: card.feedsCustomerEstimate,
    };
  }

  estOptionActionTarget(section: AdminJobEstimateOptionSection): AdminJobEstimateActionTarget {
    return {
      estimateKey: section.estimateKey,
      jobVendorKey: section.jobVendorKey,
      updateEstimateUrl: section.updateEstimateUrl,
      statusLabel: section.statusLabel,
      statusPillVariant: section.statusPillVariant,
      onsiteApproval: section.onsiteApproval,
      feedsCustomerEstimate: section.feedsCustomerEstimate,
    };
  }

  /** Action target for the currently-active option tab on a multi-option card (falls back to the primary option). */
  estActiveOptionActionTarget(card: AdminJobEstimateCard): AdminJobEstimateActionTarget {
    const activeKey = this.activeOptionKey(card);
    const activeSection = card.optionSections.find((section) => section.estimateKey === activeKey);
    return activeSection ? this.estOptionActionTarget(activeSection) : this.estCardActionTarget(card);
  }

  estHasStatusBanner(display: AdminJobEstimateStatusDisplay | null | undefined): boolean {
    return !!display && display.statusBannerVariant !== 'none';
  }

  estHasStatusContext(display: AdminJobEstimateStatusDisplay | null | undefined): boolean {
    if (!display) return false;
    return (
      this.estHasStatusBanner(display) ||
      display.showNotApprovedByCustomer ||
      (display.showCustomerApprovedEquivalent && !!display.customerApprovalMessage)
    );
  }

  estManageStatusOptions(target: AdminJobEstimateActionTarget): EstimateManageStatusOption[] {
    return getEstimateManageStatusOptions(target);
  }

  onManageEstimateStatus(target: AdminJobEstimateActionTarget, option: EstimateManageStatusOption): void {
    if (option.usesNegotiationFlow) {
      this.openLegacyUrl(target.updateEstimateUrl);
      return;
    }

    if (option.usesApprovalFlow) {
      this.tryApproveEstimate(target);
      return;
    }

    if (option.usesRejectFlow) {
      this.estErrorMessage.set('');
      this.estRejectError.set('');
      this.estRejectPanelOpenFor.set(target.estimateKey);
      return;
    }

    if (option.usesDeclineFlow) {
      this.openEstDeclineModal(target);
      return;
    }

    this.submitGenericManageStatus(target, option);
  }

  // ── Approve → Additional Approval panel chain ───────────────────────────

  private findEstimateCard(estimateKey: string): AdminJobEstimateCard | null {
    for (const card of this.estCards()) {
      if (card.estimateKey === estimateKey) return card;
      if (card.optionSections.some((s) => s.estimateKey === estimateKey)) return card;
    }
    return null;
  }

  private estimateTotalFor(estimateKey: string, card: AdminJobEstimateCard): number {
    if (card.estimateKey === estimateKey) return card.estimateTotal;
    const section = card.optionSections.find((s) => s.estimateKey === estimateKey);
    return section?.sectionTotal ?? card.estimateTotal;
  }

  /** The vendor's ORIGINAL estimate line items for this estimateKey (card or option section). */
  private estLineItemsFor(estimateKey: string): AdminJobEstimateLineItem[] {
    const card = this.findEstimateCard(estimateKey);
    if (!card) return [];
    if (card.estimateKey === estimateKey) return card.lineItems ?? [];
    const section = card.optionSections.find((s) => s.estimateKey === estimateKey);
    return section?.lineItems ?? [];
  }

  /**
   * The vendor's ORIGINAL quantity for a negotiation line, matched by detailKey ↔
   * lineItemKey. Used to seed the Edit panel's qty for lines where the agent
   * doesn't back-calculate a suggestedQty (MATERIAL/TRAVEL/etc. — see
   * openEstLineEdit) — without this, editing those lines had no real qty to
   * derive a per-unit rate from.
   */
  private estOriginalQtyFor(estimateKey: string, negLine: AdminEstimateNegotiationLine): number | null {
    const items = this.estLineItemsFor(estimateKey);
    const match = negLine.detailKey
      ? items.find((li) => li.lineItemKey === negLine.detailKey)
      : undefined;
    return match?.quantity ?? null;
  }

  private tryApproveEstimate(target: AdminJobEstimateActionTarget): void {
    const card = this.findEstimateCard(target.estimateKey);
    if (!card) return;

    // Customer-DNE guardrail (matches the legacy admin portal): hard-block at/above 100% of the
    // customer DNE (backend SetVendorEstimateToApproved enforces the same 422); soft-warn between
    // 80% and 100% (admin acknowledges by clicking Approve again).
    const dne = this.estDneTracker();
    const estimateTotal = this.estimateTotalFor(target.estimateKey, card);
    if (dne && dne.customerDne > 0) {
      if (estimateTotal >= dne.customerDne) {
        this.estApprovalInfo.set('');
        this.estErrorMessage.set(
          'Approval blocked: this estimate meets or exceeds the customer DNE. Raise the customer DNE first if the customer has approved a higher amount.',
        );
        return;
      }
      if (
        estimateTotal > dne.customerDne * 0.8 &&
        !this.estDneWarningAcknowledged()[target.estimateKey]
      ) {
        this.estErrorMessage.set('');
        this.estApprovalInfo.set(
          'This estimate exceeds 80% of the customer DNE. Only proceed if you have approval from the customer. Click Approve again to proceed.',
        );
        this.estDneWarningAcknowledged.update((prev) => ({ ...prev, [target.estimateKey]: true }));
        return;
      }
    }

    this.estDneWarningAcknowledged.update((prev) => ({ ...prev, [target.estimateKey]: false }));
    this.approveEstimate(target);
  }

  private approveEstimate(target: AdminJobEstimateActionTarget): void {
    if (!target.jobVendorKey) {
      this.estErrorMessage.set('Missing vendor assignment for this estimate; cannot approve.');
      return;
    }

    this.estErrorMessage.set('');
    this.estApprovalError.set('');
    this.estApprovalInfo.set('');

    this.vendorBillsSvc
      .setVendorEstimateToApproved({ jobVendorKey: target.jobVendorKey, estimateKey: target.estimateKey })
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        if (!res?.status || !res.data) {
          this.estErrorMessage.set(res?.message || 'Failed to approve estimate.');
          return;
        }

        this.estPatchStatusLocally(target.estimateKey, {
          action: 'estimate-approved',
          label: 'Approved',
          badgeVariant: 'approved',
        });

        if (res.data.requiresAdditionalApproval || res.data.flag === 2) {
          this.estApprovalPanelOpenFor.set(target.estimateKey);
        } else {
          this.loadEstPage();
        }
      });
  }

  closeEstApprovalPanel(): void {
    this.estApprovalPanelOpenFor.set(null);
    this.estApprovalError.set('');
    this.estApprovalInfo.set('');
    this.loadEstPage();
  }

  /** Vendor contacts for the Additional Approval panel's recipient list. */
  estApprovalVendorContacts(estimateKey: string) {
    const card = this.findEstimateCard(estimateKey);
    const jv = card ? this.estJobVendorContacts().find((v) => v.vendorKey === card.vendorKey) : undefined;
    return jv?.contacts ?? [];
  }

  private loadJobVendorContacts(): void {
    const key = this.jobKey();
    if (!key) return;

    this.vendorBillsSvc
      .getCreateEstimateModal(key)
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        if (res?.status && res.data) {
          this.estJobVendorContacts.set(res.data.vendors ?? []);
        }
      });
  }

  onSubmitVendorApproval(event: VendorApprovalSubmitEvent): void {
    const estimateKey = this.estApprovalPanelOpenFor();
    const card = estimateKey ? this.findEstimateCard(estimateKey) : null;
    const jobKey = this.jobKey();
    const vendorKey = card?.vendorKey;
    if (!jobKey || !vendorKey || !card) {
      this.estApprovalError.set('Missing job or vendor for this estimate.');
      return;
    }

    this.estApprovalSubmitting.set(true);
    this.estApprovalError.set('');

    this.vendorBillsSvc
      .saveVendorApprovalData({
        sendToVendor: event.sendToVendor,
        jobKey,
        vendorKey,
        approvalText: event.approvalText,
        revVendorDNE: card.estimateTotal,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        if (!res?.status || !res.data) {
          this.estApprovalSubmitting.set(false);
          this.estApprovalError.set(res?.message || 'Failed to save approval data.');
          return;
        }

        if (!event.sendToVendor || !res.data.workOrderKey) {
          this.estApprovalSubmitting.set(false);
          this.closeEstApprovalPanel();
          return;
        }

        this.vendorBillsSvc
          .sendEmailToVendor({
            jobKey,
            vendorKey,
            workOrderKey: res.data.workOrderKey,
            invoiceType: 33,
            emailBody: event.approvalText,
            recipientEmails: event.recipientEmails,
          })
          .pipe(takeUntil(this.destroy$))
          .subscribe((emailRes) => {
            this.estApprovalSubmitting.set(false);
            if (!emailRes?.status) {
              this.estApprovalError.set(emailRes?.message || 'Approval saved, but the email to the vendor failed to send.');
              return;
            }
            this.closeEstApprovalPanel();
          });
      });
  }

  // ── Reject for Resubmission panel ───────────────────────────────────────

  estRejectPanelOpenForCard(card: AdminJobEstimateCard): boolean {
    const openKey = this.estRejectPanelOpenFor();
    if (!openKey) return false;
    return card.estimateKey === openKey || card.optionSections.some((s) => s.estimateKey === openKey);
  }

  closeEstRejectPanel(): void {
    this.estRejectPanelOpenFor.set(null);
    this.estRejectError.set('');
  }

  onSubmitVendorReject(card: AdminJobEstimateCard, event: VendorRejectSubmitEvent): void {
    const jobKey = this.jobKey();
    const vendorKey = card.vendorKey;
    const estimateKey = this.estRejectPanelOpenFor();
    if (!jobKey || !vendorKey || !estimateKey) {
      this.estRejectError.set('Missing job or vendor for this estimate.');
      return;
    }

    this.estRejectSubmitting.set(true);
    this.estRejectError.set('');

    this.vendorBillsSvc
      .rejectVendorEstimateForResubmission({
        estimateKey,
        jobKey,
        vendorKey,
        adminRemark: event.adminRemark || null,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        this.estRejectSubmitting.set(false);
        if (!res?.status) {
          this.estRejectError.set(res?.message || 'Failed to reject estimate for resubmission.');
          return;
        }

        this.estPatchStatusLocally(estimateKey, {
          action: 'estimate-reject-resubmit',
          label: 'Revision Requested',
          badgeVariant: 'resubmit',
        });
        this.closeEstRejectPanel();
      });
  }

  // ── Decline panel ────────────────────────────────────────────────────────

  openEstDeclineModal(target: AdminJobEstimateActionTarget): void {
    this.estErrorMessage.set('');
    this.estDeclineError.set('');
    this.estDeclinePanelOpenFor.set(target.estimateKey);
  }

  closeEstDeclinePanel(): void {
    this.estDeclinePanelOpenFor.set(null);
    this.estDeclineError.set('');
  }

  onSubmitVendorDecline(event: VendorDeclineSubmitEvent): void {
    const estimateKey = this.estDeclinePanelOpenFor();
    const card = estimateKey ? this.findEstimateCard(estimateKey) : null;
    const jobKey = this.jobKey();
    const vendorKey = card?.vendorKey;
    if (!jobKey || !vendorKey || !estimateKey) {
      this.estDeclineError.set('Missing job or vendor for this estimate.');
      return;
    }

    this.estDeclineSubmitting.set(true);
    this.estDeclineError.set('');

    this.vendorBillsSvc
      .declineVendorEstimate({
        estimateKey,
        jobKey,
        vendorKey,
        adminRemark: event.adminRemark,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        this.estDeclineSubmitting.set(false);
        if (!res?.status) {
          this.estDeclineError.set(res?.message || 'Failed to decline estimate.');
          return;
        }

        this.estPatchStatusLocally(estimateKey, {
          action: 'estimate-declined',
          label: 'Declined',
          badgeVariant: 'declined',
        });
        this.closeEstDeclinePanel();

        if (res.data?.emailSent === false) {
          this.estErrorMessage.set('Estimate declined, but the vendor notification email failed to send.');
        }
      });
  }

  /** Applies the new status to the affected card/option locally, avoiding a full estimates reload. */
  private estPatchStatusLocally(estimateKey: string, option: EstimateManageStatusOption): void {
    this.estCards.update((cards) =>
      cards.map((card) => {
        const patch = {
          statusLabel: option.displayLabel ?? option.label,
          statusBadgeVariant: option.badgeVariant,
          statusPill: option.pill ?? null,
          statusPillVariant: option.pillVariant ?? null,
        };
        if (card.estimateKey === estimateKey) {
          return { ...card, ...patch };
        }
        if (card.optionSections.some((section) => section.estimateKey === estimateKey)) {
          return {
            ...card,
            optionSections: card.optionSections.map((section) =>
              section.estimateKey === estimateKey ? { ...section, ...patch } : section,
            ),
          };
        }
        return card;
      }),
    );
  }

  openLegacyUrl(url: string): void {
    if (!url) return;
    window.open(url, '_blank', 'noopener');
  }

  /** Legacy EIndex parity: VendorLogin/LoginByRCSadmin/{contactKey}?adminKey={adminKey} */
  openVendorLogin(contactKey: string | null | undefined): void {
    if (!contactKey) return;
    const adminKey = this.authTokenSvc.getAdminKeyFromToken();
    if (!adminKey) return;
    const url = `${environment.vendorPortalBaseUrl}/VendorLogin/LoginByRCSadmin/${contactKey}?adminKey=${adminKey}`;
    window.open(url, '_blank', 'noopener');
  }

  legacyEIndexUrl(): string {
    return `${environment.legacyAdminBaseUrl}/MgtVendorInvoice/EIndex/${this.jobKey()}`;
  }

  legacyCustomerDneHistoryUrl(): string {
    const ck = this.estDneTracker()?.customerKey;
    if (!ck) return this.legacyEIndexUrl();
    return `${environment.legacyAdminBaseUrl}/MgtCustomer/EditCustomer/${ck}`;
  }

  legacyRequestDneIncreaseUrl(): string {
    return `${environment.legacyAdminBaseUrl}/MgtJob/EditJob/${this.jobKey()}`;
  }

  notesActivityUrl(): string {
    return `/job/${this.jobKey()}/notes-activity`;
  }

  /** Figma: each estimate card gets its own negotiation sidebar (deleted/vendor-removed cards excluded). */
  showNegotiationPanel(card: AdminJobEstimateCard): boolean {
    return !card.isDeleted && !card.isVendorDeleted;
  }

  showNegotiationPanelForSection(section: AdminJobEstimateOptionSection): boolean {
    return !section.isDeleted;
  }

  private collectNegotiableEstimateKeys(cards: AdminJobEstimateCard[]): string[] {
    const keys = new Set<string>();
    for (const card of cards) {
      if (this.showNegotiationPanel(card)) {
        keys.add(card.estimateKey);
      }
      for (const section of card.optionSections ?? []) {
        if (this.showNegotiationPanelForSection(section)) {
          keys.add(section.estimateKey);
        }
      }
    }
    return [...keys];
  }

  estNegotiationFor(estimateKey: string): AdminEstimateNegotiation | null {
    return this.estNegotiations()[this.normalizeEstimateKey(estimateKey)] ?? null;
  }

  /** Option-tab badge reflecting this option's own negotiating-agent status (falls back to "Pending" when no negotiation has started). */
  estNegotiationBadge(estimateKey: string): NegotiationBadge {
    return getNegotiationBadge(this.estNegotiationFor(estimateKey)?.status);
  }

  /**
   * Joins a table row to its agent recommendation for the inline negotiation column. Matches by
   * `detailKey` first — the backend now resolves each agent line's synthetic `lineItemId` back to a
   * real JobSalesInvoiceDetail/VendorEstimateDetail key (VendorEstimateNegotiationService.BuildLineItemMap),
   * including lines the vendor added mid-negotiation (matched by item description + amount against the
   * estimate's current source lines, not stale array position). Positional index is only a last-resort
   * fallback for the rare case a line truly has no resolvable detailKey.
   */
  estNegotiationLineFor(estimateKey: string, lineItemKey: string | null, index: number): AdminEstimateNegotiationLine | null {
    const lines = this.estNegotiationFor(estimateKey)?.lines ?? [];
    const byDetailKey = lineItemKey ? lines.find((l) => l.detailKey === lineItemKey) : undefined;
    return byDetailKey ?? lines[index] ?? null;
  }

  estLineDecisionFor(estimateKey: string, lineItemId: string): NegotiationLineDecisionState | null {
    const key = this.normalizeEstimateKey(estimateKey);
    return this.estLineDecisions()[key]?.[lineItemId] ?? null;
  }

  /** Accept applies immediately (Edit goes through the shared component's own inline editor; untouched lines auto-decline on submit). */
  setEstLineDecision(estimateKey: string, line: AdminEstimateNegotiationLine, decision: 'accept'): void {
    this.closeEstLineExpand();
    this.closeEstInfoPopover();
    this.onEstLineDecisionChange(estimateKey, { lineItemId: line.lineItemId, state: { decision } });
  }

  /** Mockup "Change" — return the line to pending so Use Counter / Edit show again. */
  reopenEstLineDecision(estimateKey: string, line: AdminEstimateNegotiationLine): void {
    const key = this.normalizeEstimateKey(estimateKey);
    this.estLineDecisions.update((prev) => {
      const nextForEst = { ...(prev[key] ?? {}) };
      delete nextForEst[line.lineItemId];
      return { ...prev, [key]: nextForEst };
    });
    this.closeEstLineExpand();
  }

  isEstLineExpandOpen(estimateKey: string, lineItemId: string, mode: 'edit' | 'info' | 'msg'): boolean {
    const open = this.estLineExpand();
    return !!open
      && open.mode === mode
      && open.lineItemId === lineItemId
      && this.normalizeEstimateKey(open.estimateKey) === this.normalizeEstimateKey(estimateKey);
  }

  closeEstLineExpand(): void {
    this.estLineExpand.set(null);
  }

  /** Bridges the shared negotiation-line component's editConfirm event to the same decision update. */
  onEstLineEditConfirm(
    estimateKey: string,
    line: AdminEstimateNegotiationLine,
    event: NegotiationLineEditConfirmEvent,
  ): void {
    this.onEstLineDecisionChange(estimateKey, {
      lineItemId: line.lineItemId,
      state: { decision: 'edit', editedQty: event.qty, editedValue: event.value },
    });
    this.closeEstLineExpand();
  }

  /** Bridges the shared component's expandModeChange to the existing open/close signal. */
  onEstLineExpandModeChange(estimateKey: string, line: AdminEstimateNegotiationLine, mode: 'edit' | 'info' | 'msg' | null): void {
    if (mode === null) {
      this.closeEstLineExpand();
      return;
    }
    if (mode === 'msg') {
      this.ensureEstLineMessageDraft(estimateKey, line);
    }
    this.closeEstInfoPopover();
    this.estLineExpand.set({ estimateKey: this.normalizeEstimateKey(estimateKey), lineItemId: line.lineItemId, mode });
  }

  /**
   * The effective qty/rate/total for the TOP estimate-lines table (est-lines-grid),
   * once an admin has made a decision on this line — Use Counter / Save counter /
   * Decline all mean "this is what we're actually paying now," not "what the
   * vendor originally asked for." Before any decision, this table intentionally
   * shows the vendor's true original values (from VendorEstimateArchive version 1,
   * via the .NET fix in LoadLineItemsBatchAsync) — this resolver only overrides
   * the display for lines the admin has actually acted on; it never mutates
   * anything server-side.
   */
  private estLineEffectiveQtyRateTotal(
    estimateKey: string,
    negLine: AdminEstimateNegotiationLine,
  ): { qty: number; rate: number; total: number } | null {
    const state = this.estLineDecisionFor(estimateKey, negLine.lineItemId);
    if (!state) return null;

    if (state.decision === 'decline') {
      const total = negLine.vendorValue ?? 0;
      const qty = negLine.suggestedQty ?? this.estOriginalQtyFor(estimateKey, negLine) ?? 1;
      const safeQty = qty > 0 ? qty : 1;
      return { qty: safeQty, rate: total / safeQty, total };
    }

    if (state.decision === 'edit' && state.editedValue != null) {
      const qty = state.editedQty ?? negLine.suggestedQty ?? this.estOriginalQtyFor(estimateKey, negLine) ?? 1;
      const safeQty = qty > 0 ? qty : 1;
      return { qty: safeQty, rate: state.editedValue / safeQty, total: state.editedValue };
    }

    if (state.decision === 'accept') {
      const total = negLine.suggestedValue;
      const qty = negLine.suggestedQty ?? this.estOriginalQtyFor(estimateKey, negLine) ?? 1;
      const safeQty = qty > 0 ? qty : 1;
      return { qty: safeQty, rate: total / safeQty, total };
    }

    return null;
  }

  /** Rate for the top table — negotiated rate once a decision is made, else the vendor's original. */
  estLineDisplayRate(estimateKey: string, line: AdminJobEstimateLineItem, negLine: AdminEstimateNegotiationLine | null): number | null {
    const effective = negLine ? this.estLineEffectiveQtyRateTotal(estimateKey, negLine) : null;
    return effective ? effective.rate : line.rate;
  }

  /** Qty for the top table — negotiated qty once a decision is made, else the vendor's original. */
  estLineDisplayQty(estimateKey: string, line: AdminJobEstimateLineItem, negLine: AdminEstimateNegotiationLine | null): number | null {
    const effective = negLine ? this.estLineEffectiveQtyRateTotal(estimateKey, negLine) : null;
    return effective ? effective.qty : line.quantity;
  }

  /** Row total for the top table — negotiated total once a decision is made, else the vendor's original. */
  estLineDisplayRowTotal(estimateKey: string, line: AdminJobEstimateLineItem, negLine: AdminEstimateNegotiationLine | null): number {
    const effective = negLine ? this.estLineEffectiveQtyRateTotal(estimateKey, negLine) : null;
    return effective ? effective.total : line.rowTotal;
  }

  private agentLineMessageDraft(line: AdminEstimateNegotiationLine): string {
    return (line.llmReasoning?.trim() || line.reasoning?.trim() || '').trim();
  }

  private ensureEstLineMessageDraft(estimateKey: string, line: AdminEstimateNegotiationLine): void {
    const key = this.normalizeEstimateKey(estimateKey);
    const draft = this.agentLineMessageDraft(line);
    this.estLineMessageDrafts.update((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? {}), [line.lineItemId]: draft },
    }));
    const existing = this.estLineMessages()[key]?.[line.lineItemId];
    if (existing === undefined) {
      this.estLineMessages.update((prev) => ({
        ...prev,
        [key]: { ...(prev[key] ?? {}), [line.lineItemId]: draft },
      }));
    }
  }

  estLineMessage(estimateKey: string, lineItemId: string): string {
    const key = this.normalizeEstimateKey(estimateKey);
    return this.estLineMessages()[key]?.[lineItemId] ?? '';
  }

  setEstLineMessage(estimateKey: string, lineItemId: string, message: string): void {
    const key = this.normalizeEstimateKey(estimateKey);
    this.estLineMessages.update((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? {}), [lineItemId]: message },
    }));
  }

  isEstLineMessageEdited(estimateKey: string, lineItemId: string): boolean {
    const key = this.normalizeEstimateKey(estimateKey);
    const current = this.estLineMessages()[key]?.[lineItemId];
    if (current === undefined) return false;
    const draft = this.estLineMessageDrafts()[key]?.[lineItemId] ?? '';
    return current !== draft;
  }

  hasEstLineMessageFlag(estimateKey: string, lineItemId: string): boolean {
    return this.isEstLineMessageEdited(estimateKey, lineItemId) || this.estLineMessage(estimateKey, lineItemId).trim().length > 0;
  }

  resetEstLineMessage(estimateKey: string, line: AdminEstimateNegotiationLine): void {
    const key = this.normalizeEstimateKey(estimateKey);
    const draft = this.estLineMessageDrafts()[key]?.[line.lineItemId] ?? this.agentLineMessageDraft(line);
    this.setEstLineMessage(estimateKey, line.lineItemId, draft);
  }

  /** Prefers the shorter `llmReasoning` one-liner; falls back to the fuller `reasoning` prose only if they differ. */
  agentSuggestionTooltip(line: AdminEstimateNegotiationLine): string {
    const llm = line.llmReasoning?.trim();
    const full = line.reasoning?.trim();
    if (llm && full && llm !== full) return llm;
    return llm || full || '';
  }

  onEstLineDecisionChange(
    estimateKey: string,
    event: { lineItemId: string; state: NegotiationLineDecisionState },
  ): void {
    const key = this.normalizeEstimateKey(estimateKey);
    this.estLineDecisions.update((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] ?? {}),
        [event.lineItemId]: event.state,
      },
    }));
  }

  onEstApproveOnSite(card: AdminJobEstimateCard): void {
    this.tryApproveEstimate(this.estCardActionTarget(card));
  }

  /**
   * Open the single-vendor customer-estimate modal seeded from this vendor estimate
   * (NOTE 17) in the requested mode:
   *
   * - 'create' → editable, non-persisted preview; written only on Save / Save & Send.
   *   Always available — creating another customer estimate is allowed even when one exists.
   * - 'edit'   → load the existing customer estimate, editable, persist in place on Save.
   * - 'view'   → load the existing customer estimate read-only.
   */
  private openCustomerEstimateModal(
    card: AdminJobEstimateCard,
    target: AdminJobEstimateActionTarget,
    mode: 'create' | 'edit' | 'view',
  ): void {
    if (!target.estimateKey) return;
    this.createCustomerEstimateModal?.open({
      jobKey: this.jobKey(),
      vendorEstimateKey: target.estimateKey,
      mode,
      // Customer key drives the live minimum-markup policy lookup in the modal.
      customerKey: this.estDneTracker()?.customerKey ?? undefined,
      vendorName: card.vendorName,
      estimateNo: card.estimateNo,
      // No customer email is exposed to this component; the modal saves fine
      // without it and only needs it for "Save & Send to Customer".
      customerEmail: null,
    });
  }

  /** "Create Customer Estimate": build a new customer estimate from the currently-active option tab. */
  onCreateCustomerEstimate(card: AdminJobEstimateCard, target: AdminJobEstimateActionTarget): void {
    this.openCustomerEstimateModal(card, target, 'create');
  }

  /** "Edit Customer Estimate": open the existing customer estimate for editing. */
  onEditCustomerEstimate(card: AdminJobEstimateCard, target: AdminJobEstimateActionTarget): void {
    this.openCustomerEstimateModal(card, target, 'edit');
  }

  /** "View Customer Estimate": open the existing customer estimate read-only. */
  onViewCustomerEstimate(card: AdminJobEstimateCard, target: AdminJobEstimateActionTarget): void {
    this.openCustomerEstimateModal(card, target, 'view');
  }

  /** "Create Customer Invoice": build a new customer invoice from this vendor estimate/option. */
  onCreateCustomerInvoice(card: AdminJobEstimateCard, target: AdminJobEstimateActionTarget): void {
    if (!target.estimateKey) return;
    this.withDepositGate(() =>
      this.createCustomerInvoiceFromVendorModal?.open({
        jobKey: this.jobKey(),
        vendorEstimateKey: target.estimateKey!,
        customerKey: this.estDneTracker()?.customerKey ?? undefined,
        vendorName: card.vendorName,
        estimateNo: card.estimateNo,
      }),
    );
  }

  /**
   * A customer estimate was just persisted (plain Save or Save & Send) — refresh so the button flips
   * to "View Customer Estimate", then immediately open the vendor deposit modal so the admin decides
   * on vendor/customer deposits right after creating the estimate. If this was a Save & Send, the
   * email recipient-picker opens after the deposit modal is dismissed (see onVendorDepositComplete)
   * rather than being buried underneath it.
   */
  onCustomerEstimateCreated(event: { customerEstimateKey: string; customerTotal: number }): void {
    this.loadEstPage();
    this.estimateVendorDepositModal?.open({
      jobKey: this.jobKey(),
      customerEstimateKey: event.customerEstimateKey,
      customerEstimateTotal: event.customerTotal,
    });
  }

  onCustomerEstimateSent(): void {
    this.loadEstPage();
  }

  /**
   * customerEstimateKey → set when a Save & Send is in flight, so the deposit modal knows to hand off
   * to the email modal once it's dismissed. A plain Resend from view mode has no preceding deposit
   * step, so its key is never added here — onSendRequested opens the email modal for it immediately.
   */
  private readonly pendingSendKeys = new Set<string>();

  /**
   * The estimate modal asked for the send dialog (Save & Send, or Resend from view mode).
   * For Save & Send, the deposit modal (opened from onCustomerEstimateCreated) is already up, so just
   * remember the key and let onVendorDepositComplete open the email modal once it's dismissed. A
   * resend has no deposit step in front of it, so open the email modal right away.
   */
  onSendRequested(event: { customerEstimateKey: string; isResend: boolean }): void {
    if (event.isResend) {
      this.sendCustomerEstimateModal?.open({ customerEstimateKey: event.customerEstimateKey });
      return;
    }
    this.pendingSendKeys.add(event.customerEstimateKey);
  }

  /** Send dialog dismissed without sending — nothing further to clean up. */
  onSendCancelled(): void {}

  /** "Get More Approval from Customer": open the customer estimate comparison/send-email step. */
  onGetMoreApprovalFromCustomer(target: AdminJobEstimateActionTarget): void {
    const jobKey = this.jobKey();
    if (!jobKey || !target.estimateKey) return;
    this.onSiteEstimateModal?.openForReapproval(jobKey, target.estimateKey);
  }

  /** Default general-message text prefilled the first time an estimate's negotiation panel loads. */
  private static readonly DEFAULT_REVISION_MESSAGE =
    'Please review the revised line items and let us know if you can accept the updated costs. ' +
    'Click Approve and Proceed to accept the revised items or click edit estimate to send back a revised estimate to the admin.';

  private patchNegotiation(estimateKey: string, data: AdminEstimateNegotiation): void {
    const key = this.normalizeEstimateKey(data.estimateKey ?? estimateKey);
    const isFirstLoad = !this.estNegotiations()[key];
    this.estNegotiations.update((prev) => ({ ...prev, [key]: data }));

    if (isFirstLoad && !this.estGeneralMessages()[key]) {
      this.estGeneralMessages.update((prev) => ({ ...prev, [key]: JobEstimatesSectionComponent.DEFAULT_REVISION_MESSAGE }));
    }
  }

  private normalizeEstimateKey(estimateKey: string): string {
    return estimateKey.trim().toLowerCase();
  }

  private loadNegotiationsForCards(cards: AdminJobEstimateCard[]): void {
    for (const estimateKey of this.collectNegotiableEstimateKeys(cards)) {
      this.loadNegotiationForEstimate(estimateKey);
    }
  }

  private loadNegotiationForEstimate(estimateKey: string): void {
    const key = this.normalizeEstimateKey(estimateKey);
    if (this.estNegotiationLoading()[key]) return;

    this.estNegotiationLoading.update((prev) => ({ ...prev, [key]: true }));
    this.estNegotiationErrors.update((prev) => ({ ...prev, [key]: '' }));

    this.negotiatingAgentSvc
      .pollNegotiationUntilReady(estimateKey)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.estNegotiationLoading.update((prev) => ({ ...prev, [key]: false }));
        }),
      )
      .subscribe(({ data, errorMessage }) => {
        if (!data) {
          this.estNegotiationErrors.update((prev) => ({
            ...prev,
            [key]: errorMessage || 'Could not load agent recommendations.',
          }));
          return;
        }
        this.patchNegotiation(key, data);
      });
  }

  // ── Data loading ────────────────────────────────────────────

  private loadEstPage(): void {
    const key = this.jobKey();
    if (!key) return;

    this.estIsLoading.set(true);
    this.estErrorMessage.set('');

    this.depositSvc.getJobDepositSummary(key).subscribe({
      next: (res) => this.hasAnyDeposit.set((res.data?.entries.length ?? 0) > 0),
      error: () => this.hasAnyDeposit.set(false),
    });

    const start = (this.estCurrentPage() - 1) * this.estPageSize();

    this.vendorBillsSvc
      .getJobEstimatesPage(key, {
        start,
        length: this.estPageSize(),
        searchValue: this.estSearchText(),
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        this.estIsLoading.set(false);
        if (!res.status || !res.data) {
          this.estErrorMessage.set(res.message || 'Failed to load estimates.');
          this.estCards.set([]);
          this.estTotalRecords.set(0);
          return;
        }
        this.estDneTracker.set(res.data.dneTracker);
        this.hasCustomerEstimate.set(res.data.hasCustomerEstimate);
        this.isJobTechOnSite.set(res.data.isJobTechOnSite);
        const estimates = res.data.estimates;
        const cards = Array.isArray(estimates?.data) ? estimates.data : [];
        this.estCards.set(
          cards.map((card) => ({
            ...card,
            optionSections: card.optionSections ?? [],
            lineItems: card.lineItems ?? [],
          })),
        );
        this.estTotalRecords.set(estimates?.totalRecords ?? cards.length);

        // Expand every card on the job by default.
        const expanded: Record<string, boolean> = { ...this.estExpandedKeys() };
        for (const card of cards) {
          expanded[card.estimateKey] = true;
        }
        this.estExpandedKeys.set(expanded);

        // Any card expanded on load (the newest by default) counts as already viewed.
        const seededViewed: Record<string, boolean> = { ...this.estViewedKeys() };
        for (const card of this.estCards()) {
          if (expanded[card.estimateKey]) {
            seededViewed[this.normalizeEstimateKey(card.estimateKey)] = true;
          }
        }
        this.estViewedKeys.set(seededViewed);

        this.loadMinMarkupPreview();

        this.estNegotiations.set({});
        this.estNegotiationErrors.set({});
        this.loadNegotiationsForCards(this.estCards());
      });
  }
}
