import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CurrencyPipe, DatePipe } from '@angular/common';

import { forkJoin } from 'rxjs';

import { AccountingJobDetailsComponent } from '../../../shared/components/accounting-job-details/accounting-job-details.component';
import { JobNotesActivityModalComponent } from '../../../shared/components/job-notes-activity-modal/job-notes-activity-modal.component';
import { NotesToAccountingModalComponent } from '../../../shared/components/notes-to-accounting-modal/notes-to-accounting-modal.component';
import { JobAttachmentsModalComponent } from '../../../shared/components/job-attachments-modal/job-attachments-modal.component';
import { SendChangeRequestModalComponent } from '../../../shared/components/send-change-request-modal/send-change-request-modal.component';
import { ChangeRequestStatusModalComponent } from '../../../shared/components/change-request-status-modal/change-request-status-modal.component';
import { SettingsThresholdsModalComponent } from '../../../shared/components/settings-thresholds-modal/settings-thresholds-modal.component';
import { StoreManagerVerificationModalComponent } from '../../../shared/components/store-manager-verification-modal/store-manager-verification-modal.component';
import { StoreManagerEmailPreviewModalComponent } from '../../../shared/components/store-manager-email-preview-modal/store-manager-email-preview-modal.component';
import { VendorProfileModalComponent } from '../../../shared/components/vendor-profile-modal/vendor-profile-modal.component';
import { ViewVendorEstimateModalComponent } from '../../../shared/components/view-vendor-estimate-modal/view-vendor-estimate-modal.component';
import { AddVendorBillNoteModalComponent } from '../../../shared/components/add-vendor-bill-note-modal/add-vendor-bill-note-modal.component';
import { VendorInvoiceEditModalComponent } from '../../../shared/components/vendor-invoice-edit-modal/vendor-invoice-edit-modal.component';
import { CompletionCallModalComponent } from '../../../shared/components/completion-call-modal/completion-call-modal.component';
import { CompletionPhotoModalComponent } from '../../../shared/components/completion-photo-modal/completion-photo-modal.component';
import { SignoffModalComponent } from '../../../shared/components/signoff-modal/signoff-modal.component';
import { HoursReconModalComponent } from '../../../shared/components/hours-recon-modal/hours-recon-modal.component';
import { InsuranceValidationModalComponent } from '../../../shared/components/insurance-validation-modal/insurance-validation-modal.component';
import { InsuranceOverrideConfirmModalComponent } from '../../../shared/components/insurance-override-confirm-modal/insurance-override-confirm-modal.component';
import { SendBackToServiceModalComponent } from '../../../shared/components/send-back-to-service-modal/send-back-to-service-modal.component';
import { SendBackToServiceStatusModalComponent } from '../../../shared/components/send-back-to-service-status-modal/send-back-to-service-status-modal.component';
import { VendorPayableCardComponent } from '../../../shared/components/vendor-payable-card/vendor-payable-card.component';
import { InvoiceCustomerCardComponent } from '../../../shared/components/invoice-customer-card/invoice-customer-card.component';
import { AccountingFinalizePanelComponent } from '../../../shared/components/accounting-finalize-panel/accounting-finalize-panel.component';
import { StoreManagerVerificationService } from './store-manager-verification.service';
import { AccountingInvoiceCustomerService } from '../../../services/accounting-invoice-customer.service';
import { NotesActivityService } from '../../../services/notes-activity.service';
import { AssignVendorService } from '../../../services/assign-vendor.service';
import { AccountingNotesNotificationService } from './accounting-notes-notification.service';
import { ChangeRequestNotificationService } from './change-request-notification.service';
import { SendBackToServiceNotificationService } from './send-back-to-service-notification.service';
import { JobRoutingNotificationService } from './job-routing-notification.service';
import { StoreManagerVerificationNotificationService } from './store-manager-verification-notification.service';
import { Eq1ReadinessService } from './eq1-readiness.service';
import { Eq1Readiness } from './eq1-readiness.model';
import { VendorPayableNotificationService } from './vendor-payable-notification.service';
import { InvoiceCustomerJobRow } from '../../../models/accounting-invoice-customer.model';
import { AccountingBillsService } from '../../../services/accounting-bills.service';
import { AccountingBillsJobRow } from '../../../models/accounting-bills.model';
import { AccountingPayablesReceivablesService } from '../../../services/accounting-payables-receivables.service';
import { AccountingPayablesReceivablesJobRow } from '../../../models/accounting-payables-receivables.model';

/** The 6 top-level destinations from complete-screen-v2.html's tab bar. 'deposit' has no spec yet
 *  and stays permanently disabled — it isn't a placeholder tab, it just isn't buildable yet. */
export type AccountingScreenTab = 'complete' | 'bills' | 'pr' | 'recalls' | 'archive';

const PAGE_LENGTH = 10;

/**
 * V2 · Complete → Move to Accounting — page shell.
 *
 * This is Phase 1–4 of the build (per Nahid, 8/27/26): the page shell only —
 *   1. Left job list panel (search + "Show more" paging, live from
 *      AdminAccountingInvoiceCustomerController).
 *   2. Top tab bar, with "1 · Invoice the Customer" wired up for real.
 *   3. Job Details panel — {@link AccountingJobDetailsComponent}, reused as-is.
 *   4. The other four tabs (Unapproved Vendor Bills, Payables & Receivables, Recalls, Archive)
 *      exist as placeholders — real tab buttons, but with no data source and an empty-state
 *      main panel. "Deposit" mirrors the prototype's own disabled state ("SPEC COMING").
 *
 * Everything BELOW Job Details on the prototype (stepper, AI-agents banner, EQ1/EQ2 autonomy
 * panels, Store Manager email block, vendor payables cards) is intentionally NOT built yet —
 * that is the next phase, once the EQ1/EQ2 rules-engine backend work is scoped.
 *
 * Cross-job dashboard, not job-scoped — unlike `job/:jobKey/...` legacy routes, job selection
 * happens in-page (left list), so there is no jobKey route param.
 */
@Component({
  selector: 'app-move-to-accounting',
  standalone: true,
  imports: [
    FormsModule,
    CurrencyPipe,
    DatePipe,
    AccountingJobDetailsComponent,
    JobNotesActivityModalComponent,
    NotesToAccountingModalComponent,
    JobAttachmentsModalComponent,
    SendChangeRequestModalComponent,
    ChangeRequestStatusModalComponent,
    SettingsThresholdsModalComponent,
    StoreManagerVerificationModalComponent,
    StoreManagerEmailPreviewModalComponent,
    VendorProfileModalComponent,
    ViewVendorEstimateModalComponent,
    AddVendorBillNoteModalComponent,
    VendorInvoiceEditModalComponent,
    CompletionCallModalComponent,
    CompletionPhotoModalComponent,
    SignoffModalComponent,
    HoursReconModalComponent,
    InsuranceValidationModalComponent,
    InsuranceOverrideConfirmModalComponent,
    SendBackToServiceModalComponent,
    SendBackToServiceStatusModalComponent,
    VendorPayableCardComponent,
    InvoiceCustomerCardComponent,
    AccountingFinalizePanelComponent,
  ],
  templateUrl: './move-to-accounting.component.html',
  styleUrl: './move-to-accounting.component.scss',
})
export class MoveToAccountingComponent implements OnInit {
  private readonly svc = inject(AccountingInvoiceCustomerService);
  private readonly route = inject(ActivatedRoute);
  private readonly notesSvc = inject(NotesActivityService);
  private readonly assignVendorSvc = inject(AssignVendorService);
  private readonly acctNotesNotificationSvc = inject(AccountingNotesNotificationService);
  private readonly changeRequestNotificationSvc = inject(ChangeRequestNotificationService);
  private readonly sendBackToServiceNotificationSvc = inject(SendBackToServiceNotificationService);
  private readonly jobRoutingNotificationSvc = inject(JobRoutingNotificationService);
  private readonly storeManagerVerificationNotificationSvc = inject(StoreManagerVerificationNotificationService);
  private readonly storeManagerVerificationSvc = inject(StoreManagerVerificationService);
  private readonly eq1ReadinessSvc = inject(Eq1ReadinessService);
  readonly vendorPayableNotificationSvc = inject(VendorPayableNotificationService);
  private readonly billsSvc = inject(AccountingBillsService);
  private readonly prSvc = inject(AccountingPayablesReceivablesService);

  readonly activeTab = signal<AccountingScreenTab>('complete');

  // ── Tab 1 · Invoice the Customer — the only tab with a real data source right now ──
  readonly invoiceCustomerJobs = signal<InvoiceCustomerJobRow[]>([]);
  readonly invoiceCustomerCount = signal(0);
  readonly invoiceCustomerFilteredCount = signal(0);
  readonly loadingJobs = signal(false);
  readonly loadError = signal('');
  readonly searchValue = signal('');
  private nextStart = 0;

  readonly hasMoreJobs = computed(
    () => this.invoiceCustomerJobs().length < this.invoiceCustomerFilteredCount(),
  );

  // ── Tab 2 · Unapproved Vendor Bills ──
  readonly billsJobs = signal<AccountingBillsJobRow[]>([]);
  readonly billsCount = signal(0);
  readonly billsFilteredCount = signal(0);
  readonly billsLoading = signal(false);
  readonly billsLoadError = signal('');
  private billsNextStart = 0;
  readonly hasMoreBillsJobs = computed(() => this.billsJobs().length < this.billsFilteredCount());

  // ── Tab 3 · Payables & Receivables ──
  readonly prJobs = signal<AccountingPayablesReceivablesJobRow[]>([]);
  readonly prCount = signal(0);
  readonly prFilteredCount = signal(0);
  readonly prLoading = signal(false);
  readonly prLoadError = signal('');
  private prNextStart = 0;
  readonly hasMorePrJobs = computed(() => this.prJobs().length < this.prFilteredCount());

  // -- JobRoutingLog job-list flags: "with {name} — sent {time}" / "Back from Service" --
  /** Routing status per job, keyed by jobKey -- a job absent from this map has no open routing
   *  entry. Kept live via JobRoutingNotificationService (SignalR's JobRoutingChanged event). */
  readonly jobRoutingStatusByJobKey = this.jobRoutingNotificationSvc.statusByJobKey;
  /** Count of jobs currently "returned" (back from Service, unacknowledged) -- the blinking
   *  callout next to the job list header. Global, not scoped to the visible page. */
  readonly jobRoutingReturnedCount = this.jobRoutingNotificationSvc.returnedCount;

  readonly selectedJobKey = signal<string | null>(null);

  // ── JOB-LEVEL row — "📋 Job Notes / Activity" popup (complete-screen-v2.html commonBarHTML) ──
  /** Total note count for the selected job, shown as the trigger button's badge. Null while
   *  unknown/loading so the badge can render nothing rather than a misleading "0". */
  readonly selectedJobNotesCount = signal<number | null>(null);
  readonly notesModalOpen = signal(false);

  // -- JOB-LEVEL row -- "🏷 Notes To Accounting" popup (complete-screen-v2.html showNotesToAcct) --
  /** Accounting-notes count for the selected job, shown as this trigger button's badge. Thin
   *  proxy over AccountingNotesNotificationService -- that service is the single source of truth
   *  now (it keeps the count live via SignalR's AccountingNoteChanged event, not just on
   *  self-triggered reloads), so this component does not keep its own copy. */
  readonly selectedAccountingNotesCount = this.acctNotesNotificationSvc.accountingNotesCount;
  readonly accountingNotesModalOpen = signal(false);

  // -- JOB-LEVEL row -- "📎 View All Job Attachments" popup (complete-screen-v2.html showAllAttachments) --
  /** Combined Files-under-this-job + Vendor-papers-under-this-job count for the selected job,
   *  shown as this trigger button's badge. Computed client-side from the two existing reused
   *  service calls (getJobFilesForBroadcast + getVendorPapersForJob) -- no new backend endpoint
   *  was added just to count these. Null while unknown/loading, same convention as the other
   *  two JOB-LEVEL badge counts above. */
  readonly selectedAttachmentsCount = signal<number | null>(null);
  readonly attachmentsModalOpen = signal(false);

  // -- JOB-LEVEL row -- "🔁 Send Change Request to Account Manager" (complete-screen-v2.html showChangeReq) --
  /** Change-request state (none/awaiting/completed) for the selected job, shown as this trigger
   *  button's label/badge. ChangeRequestNotificationService is the single source of truth -- it
   *  keeps this live via SignalR's ChangeRequestChanged event (both this API's own direct pushes
   *  AND the poll-detected Account Manager write from legacy Admin Portal V1). */
  readonly selectedChangeRequestState = this.changeRequestNotificationSvc.state;
  readonly selectedSendBackToServiceState = this.sendBackToServiceNotificationSvc.state;
  readonly sendChangeRequestModalOpen = signal(false);
  readonly changeRequestStatusModalOpen = signal(false);

  // -- JOB-LEVEL bar -- "✉ Store Manager Verification — Email" (complete-screen-v2.html smVerifyBarHTML) --
  /** Sent/responded state for the selected job. StoreManagerVerificationNotificationService is the
   *  single source of truth -- both the send (legacy Admin Portal V1) and the response (RCS_app's
   *  landing page) happen outside this API's own process, so SignalR (via
   *  StoreManagerVerificationMonitor's poll) is the ONLY way this ever updates after initial load;
   *  there is no self-triggered action on this screen to refresh it early. */
  readonly selectedStoreManagerVerificationState = this.storeManagerVerificationNotificationSvc.state;
  readonly storeManagerVerificationModalOpen = signal(false);

  /** "👁 View email (full scope)" preview popup + the bar's own editable email textbox/"📧 Send
   *  again" button (complete-screen-v2.html's showSmEmailPreview()/sendSmVerifyEmail()). */
  readonly emailPreviewModalOpen = signal(false);
  readonly smEmailInput = signal('');
  readonly smEmailSending = signal(false);
  readonly smEmailSendError = signal('');

  // -- "EQ1 · Customer invoice → QB + send" readiness checklist --
  readonly eq1Readiness = signal<Eq1Readiness | null>(null);
  readonly eq1Loading = signal(false);

  // -- Location phone/contact for the "📞 Call & Verify Completion" popup --
  readonly selectedLocationName = signal<string | null>(null);
  readonly selectedLocationPhone = signal<string | null>(null);
  readonly selectedLocationContactName = signal<string | null>(null);

  /** PO of the currently selected job, for the popup title ("Notes & Activity — PO {po}"). */
  readonly selectedJobPo = computed(
    () => this.invoiceCustomerJobs().find((j) => j.jobKey === this.selectedJobKey())?.po ?? null,
  );

  /** Tab display labels. Everything except 'complete' is a Phase-4 placeholder — no backend
   *  list yet, so those tabs always show empty. 'complete' is included so template lookups
   *  (`tabLabels[activeTab()]`) type-check without narrowing tricks. */
  readonly tabLabels: Record<AccountingScreenTab, string> = {
    complete: '1 · Invoice the Customer',
    bills: '2 · Unapproved Vendor Bills',
    pr: '3 · Payables & Receivables',
    recalls: '↩ Recalls',
    archive: '🗄 Archive',
  };

  /** 'bills'/'pr' now have real data sources (see billsJobs/prJobs) -- only Recalls/Archive
   *  remain placeholders. */
  readonly remainingPlaceholderTabs: Exclude<AccountingScreenTab, 'complete' | 'bills' | 'pr'>[] = [
    'recalls',
    'archive',
  ];

  ngOnInit(): void {
    this.loadCount();
    this.loadJobs(true);

    // "?jobKey=..." deep link (e.g. the QC Manager override-approval email, via
    // AdminPortalV2Controller.MarkupOverrideApproval) -- select that job directly rather than
    // requiring it to already be on the visible "Show more" page.
    const deepLinkJobKey = this.route.snapshot.queryParamMap.get('jobKey');
    if (deepLinkJobKey) {
      this.activeTab.set('complete');
      this.selectJob(deepLinkJobKey);
    }
  }

  switchTab(tab: AccountingScreenTab): void {
    this.activeTab.set(tab);
    this.selectedJobKey.set(null);
    this.selectedJobNotesCount.set(null);
    this.acctNotesNotificationSvc.accountingNotesCount.set(null);
    this.selectedAttachmentsCount.set(null);
    this.changeRequestNotificationSvc.clear();
    this.sendBackToServiceNotificationSvc.clear();
    this.storeManagerVerificationNotificationSvc.clear();

    if (tab === 'bills') {
      if (!this.billsJobs().length) this.loadBillsJobs(true);
      else {
        this.jobRoutingNotificationSvc.watchJobs(this.billsJobs().map((j) => j.jobKey));
        this.selectJob(this.billsJobs()[0].jobKey);
      }
    }
    if (tab === 'pr') {
      if (!this.prJobs().length) this.loadPrJobs(true);
      else {
        this.jobRoutingNotificationSvc.watchJobs(this.prJobs().map((j) => j.jobKey));
        this.selectJob(this.prJobs()[0].jobKey);
      }
    }
    if (tab === 'complete') {
      this.jobRoutingNotificationSvc.watchJobs(this.invoiceCustomerJobs().map((j) => j.jobKey));
      if (this.invoiceCustomerJobs().length) this.selectJob(this.invoiceCustomerJobs()[0].jobKey);
    }
  }

  onSearchInput(value: string): void {
    this.searchValue.set(value);
    this.loadJobs(true);
  }

  selectJob(jobKey: string): void {
    this.selectedJobKey.set(jobKey);
    this.loadSelectedJobNotesCount(jobKey);
    this.acctNotesNotificationSvc.watchJob(jobKey);
    this.loadSelectedAttachmentsCount(jobKey);
    this.changeRequestNotificationSvc.watchJob(jobKey);
    this.sendBackToServiceNotificationSvc.watchJob(jobKey);
    this.storeManagerVerificationNotificationSvc.watchJob(jobKey);
    this.loadSmEmailInputSeed(jobKey);
    this.loadEq1Readiness(jobKey);
    this.vendorPayableNotificationSvc.watchJob(jobKey);
    this.loadSelectedLocationContact(jobKey);
  }

  /** Seeds the "📞 Call & Verify Completion" popup's phone/contact display -- same
   *  stale-response guard as loadEq1Readiness/loadSmEmailInputSeed. */
  private loadSelectedLocationContact(jobKey: string): void {
    this.assignVendorSvc.loadJobHeaderDetail(jobKey).subscribe({
      next: (res) => {
        if (this.selectedJobKey() !== jobKey) return;
        if (res.status && res.data) {
          this.selectedLocationName.set(res.data.locationName);
          this.selectedLocationPhone.set(res.data.locationPhone);
          this.selectedLocationContactName.set(res.data.locationContactName);
        }
      },
    });
  }

  /** Seeds the "✉ Store Manager Verification" bar's editable email textbox with the location's
   *  email ONCE per job selection (complete-screen-v2.html: `value="${esc(j.x.locEmail||'')}"`) --
   *  a dedicated one-off fetch (not the shared, live-updating notification-service state) so a
   *  slow response for a job the user has already navigated away from can never clobber the box
   *  with a stale address -- guarded the same way loadEq1Readiness/loadEq2Readiness are. */
  private loadSmEmailInputSeed(jobKey: string): void {
    this.smEmailSendError.set('');
    this.storeManagerVerificationSvc.getState(jobKey).subscribe({
      next: (res) => {
        if (this.selectedJobKey() !== jobKey) return;
        if (res.status && res.data) this.smEmailInput.set(res.data.sentTo || '');
      },
    });
  }

  /** Loads the "EQ1 · Customer invoice → QB + send" readiness checklist for the selected job.
   *  No live SignalR wiring yet -- refetched on selection, and self-triggered from
   *  onChangeRequestUpdated() since a send/acknowledge there can change EQ1's completion-call
   *  and content-source lines. */
  loadEq1Readiness(jobKey: string): void {
    this.eq1Loading.set(true);
    this.eq1ReadinessSvc.get(jobKey).subscribe({
      next: (res) => {
        if (this.selectedJobKey() !== jobKey) return;
        this.eq1Loading.set(false);
        if (res.status) this.eq1Readiness.set(res.data);
      },
      error: () => {
        if (this.selectedJobKey() !== jobKey) return;
        this.eq1Loading.set(false);
      },
    });
  }

  showMore(): void {
    this.loadJobs(false);
  }

  // ── JOB-LEVEL row — "📋 Job Notes / Activity" popup ──

  openNotesModal(): void {
    if (!this.selectedJobKey()) return;
    this.notesModalOpen.set(true);
  }

  closeNotesModal(): void {
    this.notesModalOpen.set(false);
    // A note may have been added/emailed/pinned while the popup was open — refresh the
    // trigger button's badge count so it doesn't go stale.
    const jobKey = this.selectedJobKey();
    if (jobKey) this.loadSelectedJobNotesCount(jobKey);
  }

  private loadSelectedJobNotesCount(jobKey: string): void {
    this.selectedJobNotesCount.set(null);
    this.notesSvc.getConsolidatedNotes(jobKey).subscribe({
      next: (res) => {
        if (res.status && this.selectedJobKey() === jobKey) {
          this.selectedJobNotesCount.set(res.data.allNotes.length);
        }
      },
    });
  }

  // -- JOB-LEVEL row -- "🏷 Notes To Accounting" popup --

  openAccountingNotesModal(): void {
    if (!this.selectedJobKey()) return;
    this.accountingNotesModalOpen.set(true);
  }

  closeAccountingNotesModal(): void {
    this.accountingNotesModalOpen.set(false);
  }

  /** Keeps the trigger button's `({{ n }})` badge in sync immediately after the popup's OWN
   *  (re)load -- self-triggered edits don't need to wait on the SignalR round-trip since the
   *  popup already has the fresh count in hand. A live AccountingNoteChanged event from another
   *  admin updates the same service signal independently (see AccountingNotesNotificationService). */
  onAccountingNotesCountChanged(count: number): void {
    this.acctNotesNotificationSvc.accountingNotesCount.set(count);
  }

  // -- JOB-LEVEL row -- "📎 View All Job Attachments" popup --

  openAttachmentsModal(): void {
    if (!this.selectedJobKey()) return;
    this.attachmentsModalOpen.set(true);
  }

  closeAttachmentsModal(): void {
    this.attachmentsModalOpen.set(false);
    // A file may have been uploaded/deleted while the popup was open -- refresh the trigger
    // button's badge count so it doesn't go stale, same refresh-on-close discipline as
    // closeNotesModal() above.
    const jobKey = this.selectedJobKey();
    if (jobKey) this.loadSelectedAttachmentsCount(jobKey);
  }

  /** Combined count = job files (getJobFilesForBroadcast) + vendor papers (getVendorPapersForJob)
   *  -- the prototype's single `j.attachments` array covers both files and vendor-uploaded
   *  papers in one list, but the real backend splits them into two separate sources, so the
   *  accurate count is the sum of both loads rather than either one alone. */
  private loadSelectedAttachmentsCount(jobKey: string): void {
    this.selectedAttachmentsCount.set(null);
    forkJoin({
      files: this.assignVendorSvc.getJobFilesForBroadcast(jobKey),
      papers: this.assignVendorSvc.getVendorPapersForJob(jobKey),
    }).subscribe({
      next: ({ files, papers }) => {
        if (this.selectedJobKey() !== jobKey) return;
        const filesCount = files.status && Array.isArray(files.data) ? files.data.length : 0;
        const papersCount = Array.isArray(papers) ? papers.length : 0;
        this.selectedAttachmentsCount.set(filesCount + papersCount);
      },
    });
  }

  // -- JOB-LEVEL row -- "🔁 Send Change Request to Account Manager" popups --

  /** Opens whichever of the two popups matches the job's current state -- the compose/send popup
   *  when there's no active request, or the awaiting/completed status popup otherwise. */
  openChangeRequestModal(): void {
    if (!this.selectedJobKey()) return;
    if (this.selectedChangeRequestState().status === 'none') {
      this.sendChangeRequestModalOpen.set(true);
    } else {
      this.changeRequestStatusModalOpen.set(true);
    }
  }

  closeSendChangeRequestModal(): void {
    this.sendChangeRequestModalOpen.set(false);
  }

  closeChangeRequestStatusModal(): void {
    this.changeRequestStatusModalOpen.set(false);
  }

  // -- "↩ Send Back to Service" popup (vendor-card button) --

  readonly sendBackToServiceModalOpen = signal(false);
  readonly sendBackToServiceStatusModalOpen = signal(false);

  /** Opens whichever of the two popups matches the job's current state -- the compose/send popup
   *  when there's no active request, or the awaiting/completed status popup (which shows the AM's
   *  remark) otherwise. Mirrors openChangeRequestModal(). */
  openSendBackToServiceModal(): void {
    if (!this.selectedJobKey()) return;
    if (this.selectedSendBackToServiceState().status === 'none') {
      this.sendBackToServiceModalOpen.set(true);
    } else {
      this.sendBackToServiceStatusModalOpen.set(true);
    }
  }

  closeSendBackToServiceModal(): void {
    this.sendBackToServiceModalOpen.set(false);
  }

  closeSendBackToServiceStatusModal(): void {
    this.sendBackToServiceStatusModalOpen.set(false);
  }

  /** Refreshes the shared job-level state immediately after a successful send -- a live
   *  SendBackToServiceChanged event also updates the same signal independently, same discipline
   *  as onChangeRequestUpdated(). */
  onSendBackToServiceUpdated(): void {
    const jobKey = this.selectedJobKey();
    if (jobKey) this.sendBackToServiceNotificationSvc.refresh(jobKey);
  }

  // -- JOB-LEVEL bar -- "✉ Store Manager Verification — Email" popup --

  openStoreManagerVerificationModal(): void {
    if (!this.selectedJobKey()) return;
    this.storeManagerVerificationModalOpen.set(true);
  }

  closeStoreManagerVerificationModal(): void {
    this.storeManagerVerificationModalOpen.set(false);
  }

  /** Refreshes the bar's state immediately after a successful submit from the popup -- a live
   *  StoreManagerVerificationChanged event (broadcast directly by RFIJobOps right after the
   *  submit succeeds) also updates the same signal independently, so this is a belt-and-braces
   *  immediate refresh, same discipline as onChangeRequestUpdated(). */
  onStoreManagerVerificationSubmitted(): void {
    const jobKey = this.selectedJobKey();
    if (jobKey) this.storeManagerVerificationNotificationSvc.refresh(jobKey);
  }

  // -- JOB-LEVEL bar -- "👁 View email (full scope)" popup + "📧 Send again" --

  openEmailPreviewModal(): void {
    if (!this.selectedJobKey()) return;
    this.emailPreviewModalOpen.set(true);
  }

  closeEmailPreviewModal(): void {
    this.emailPreviewModalOpen.set(false);
  }

  onSmEmailInput(value: string): void {
    this.smEmailInput.set(value);
  }

  /** Sends to whichever address is currently in the textbox, even if the admin changed it away
   *  from the location's email on file (complete-screen-v2.html's sendSmVerifyEmail()). */
  sendVerificationEmail(): void {
    const jobKey = this.selectedJobKey();
    const toEmail = this.smEmailInput().trim();
    if (!jobKey || this.smEmailSending()) return;
    if (!toEmail || !toEmail.includes('@')) {
      this.smEmailSendError.set('Enter a valid email address.');
      return;
    }

    this.smEmailSending.set(true);
    this.smEmailSendError.set('');
    this.storeManagerVerificationSvc.sendEmail(jobKey, toEmail).subscribe({
      next: (res) => {
        this.smEmailSending.set(false);
        if (res.status) {
          this.storeManagerVerificationNotificationSvc.refresh(jobKey);
        } else {
          this.smEmailSendError.set(res.message || 'Failed to send the verification email.');
        }
      },
      error: () => {
        this.smEmailSending.set(false);
        this.smEmailSendError.set('Failed to send the verification email. Please try again.');
      },
    });
  }

  // -- "⚙ Settings & thresholds" popup (read-only view of RuleThresholdForCustomerInvoice) --

  readonly settingsThresholdsModalOpen = signal(false);

  openSettingsThresholdsModal(): void {
    this.settingsThresholdsModalOpen.set(true);
  }

  closeSettingsThresholdsModal(): void {
    this.settingsThresholdsModalOpen.set(false);
  }

  // -- "👤 Vendor Profile" popup (read-only registration snapshot) --

  readonly vendorProfileModalOpen = signal(false);
  readonly selectedVendorProfileKey = signal<string | null>(null);

  openVendorProfileModal(vendorKey: string): void {
    this.selectedVendorProfileKey.set(vendorKey);
    this.vendorProfileModalOpen.set(true);
  }

  closeVendorProfileModal(): void {
    this.vendorProfileModalOpen.set(false);
  }

  // -- "📄 View Estimate (approved to proceed)" popup (read-only) --

  readonly viewEstimateModalOpen = signal(false);
  readonly selectedViewEstimateVendorKey = signal<string | null>(null);

  openViewEstimateModal(vendorKey: string): void {
    this.selectedViewEstimateVendorKey.set(vendorKey);
    this.viewEstimateModalOpen.set(true);
  }

  closeViewEstimateModal(): void {
    this.viewEstimateModalOpen.set(false);
  }

  // -- "🏷 Add note about this vendor bill to Accounting" popup --

  readonly addVendorBillNoteModalOpen = signal(false);
  readonly selectedAddNoteVendorKey = signal<string | null>(null);
  readonly selectedAddNoteVendorName = signal<string | null>(null);

  openAddVendorBillNoteModal(target: { vendorKey: string; vendorName: string | null }): void {
    this.selectedAddNoteVendorKey.set(target.vendorKey);
    this.selectedAddNoteVendorName.set(target.vendorName);
    this.addVendorBillNoteModalOpen.set(true);
  }

  closeAddVendorBillNoteModal(): void {
    this.addVendorBillNoteModalOpen.set(false);
  }

  // -- "⚠ Override insurance block…" confirmation popup --

  readonly insuranceOverrideConfirmModalOpen = signal(false);
  readonly selectedInsuranceOverrideVendorKey = signal<string | null>(null);
  readonly selectedInsuranceOverrideVendorName = signal<string | null>(null);
  readonly selectedInsuranceOverrideProblems = signal<string[]>([]);

  openInsuranceOverrideConfirmModal(target: { vendorKey: string; vendorName: string | null; problems: string[] }): void {
    this.selectedInsuranceOverrideVendorKey.set(target.vendorKey);
    this.selectedInsuranceOverrideVendorName.set(target.vendorName);
    this.selectedInsuranceOverrideProblems.set(target.problems);
    this.insuranceOverrideConfirmModalOpen.set(true);
  }

  closeInsuranceOverrideConfirmModal(): void {
    this.insuranceOverrideConfirmModalOpen.set(false);
  }

  // -- "🧾 Vendor Invoice EDIT MODE" popup --

  readonly invoiceEditModalOpen = signal(false);
  readonly selectedInvoiceEditVendorKey = signal<string | null>(null);

  openInvoiceEditModal(vendorKey: string): void {
    this.selectedInvoiceEditVendorKey.set(vendorKey);
    this.invoiceEditModalOpen.set(true);
  }

  /** "📄 View vendor invoice" from the Invoice Customer card's late-vendor-invoice callout --
   *  reuses the same "🧾 Vendor Invoice EDIT MODE" popup other cards use to view/edit a vendor's
   *  invoice; no separate read-only viewer needed. */
  onViewVendorInvoiceFromInvoiceCustomerCard(event: { vendorKey: string; vendorInvoiceKey: string }): void {
    this.openInvoiceEditModal(event.vendorKey);
  }

  closeInvoiceEditModal(): void {
    this.invoiceEditModalOpen.set(false);
  }

  // -- "📷 {Vendor} — Check-out Complete uploads" popup ("✓ Review check-out pics" step-chip) --

  readonly completionPhotoModalOpen = signal(false);
  readonly selectedCompletionPhotoVendorKey = signal<string | null>(null);
  readonly selectedCompletionPhotoVendorName = signal<string | null>(null);

  openCompletionPhotoModal(target: { vendorKey: string; vendorName: string | null }): void {
    this.selectedCompletionPhotoVendorKey.set(target.vendorKey);
    this.selectedCompletionPhotoVendorName.set(target.vendorName);
    this.completionPhotoModalOpen.set(true);
  }

  closeCompletionPhotoModal(): void {
    this.completionPhotoModalOpen.set(false);
  }

  /** Refreshes the card (afterPhotoVerified/afterPhotoPendingReviewCount) right after this
   *  admin's own approve/reject -- doesn't wait on the SignalR round-trip. */
  onCompletionPhotosChanged(): void {
    const jobKey = this.selectedJobKey();
    if (jobKey) this.vendorPayableNotificationSvc.refresh(jobKey);
  }

  // -- "✍ Manager Sign-off — {Vendor}" popup ("✓ Review sign-off" step-chip) --

  readonly signOffModalOpen = signal(false);
  readonly selectedSignOffVendorKey = signal<string | null>(null);
  readonly selectedSignOffVendorName = signal<string | null>(null);

  openSignOffModal(target: { vendorKey: string; vendorName: string | null }): void {
    this.selectedSignOffVendorKey.set(target.vendorKey);
    this.selectedSignOffVendorName.set(target.vendorName);
    this.signOffModalOpen.set(true);
  }

  closeSignOffModal(): void {
    this.signOffModalOpen.set(false);
  }

  /** Refreshes the card (signOffVerified/signOffReviewStatus) right after this admin's own
   *  accept/reject -- doesn't wait on the SignalR round-trip. */
  onSignOffChanged(): void {
    const jobKey = this.selectedJobKey();
    if (jobKey) this.vendorPayableNotificationSvc.refresh(jobKey);
  }

  // -- "⏱ Check-in / Out & Hours vs Billed — {Vendor}" popup ("Check-in/out vs billed" step-chip) --

  readonly hoursReconModalOpen = signal(false);
  readonly selectedHoursReconVendorKey = signal<string | null>(null);
  readonly selectedHoursReconVendorName = signal<string | null>(null);

  openHoursReconModal(target: { vendorKey: string; vendorName: string | null }): void {
    this.selectedHoursReconVendorKey.set(target.vendorKey);
    this.selectedHoursReconVendorName.set(target.vendorName);
    this.hoursReconModalOpen.set(true);
  }

  closeHoursReconModal(): void {
    this.hoursReconModalOpen.set(false);
  }

  /** Refreshes the card (checkInWaived/hoursMatchReductionApplied/revVendorDne, and EQ2's
   *  hours-tolerance line) right after this admin's own edit/waiver/reduction/undo. */
  onHoursReconChanged(): void {
    const jobKey = this.selectedJobKey();
    if (jobKey) this.vendorPayableNotificationSvc.refresh(jobKey);
  }

  // -- "🛡 Vendor Insurance Validation" popup ("Vendor Insurance Validation" step-chip) --

  readonly insuranceModalOpen = signal(false);
  readonly selectedInsuranceVendorKey = signal<string | null>(null);
  readonly selectedInsuranceVendorName = signal<string | null>(null);

  openInsuranceModal(target: { vendorKey: string; vendorName: string | null }): void {
    this.selectedInsuranceVendorKey.set(target.vendorKey);
    this.selectedInsuranceVendorName.set(target.vendorName);
    this.insuranceModalOpen.set(true);
  }

  closeInsuranceModal(): void {
    this.insuranceModalOpen.set(false);
  }

  /** Refreshes the card (insuranceOk/glExpiry/wcExpiry/insuranceProblems, and EQ2's insurance
   *  blockers) right after this admin's own save/resend. */
  onInsuranceChanged(): void {
    const jobKey = this.selectedJobKey();
    if (jobKey) this.vendorPayableNotificationSvc.refresh(jobKey);
  }

  // -- "📞 Call & Verify Completion" popup (stepper Step 1) --

  readonly completionCallModalOpen = signal(false);

  openCompletionCallModal(): void {
    this.completionCallModalOpen.set(true);
  }

  closeCompletionCallModal(): void {
    this.completionCallModalOpen.set(false);
  }

  /** EQ1 reads JobCompletionCallVerification live on every computation -- re-fetching it here
   *  is the "dynamic recompute" (no separate backend recompute step needed). Also refreshes the
   *  vendor-payable cards -- "📞 Call & verify completion"'s job-level done/green state lives on
   *  VendorPayableCardDto.CompletionCallVerified, not just EQ1, and doesn't wait on the SignalR
   *  round-trip for this admin's own action. */
  onCompletionCallLogged(): void {
    const jobKey = this.selectedJobKey();
    if (jobKey) {
      this.loadEq1Readiness(jobKey);
      this.vendorPayableNotificationSvc.refresh(jobKey);
    }
  }

  /** Refreshes the trigger button's state immediately after this admin's own send/acknowledge --
   *  self-triggered edits don't need to wait on the SignalR round-trip. A live ChangeRequestChanged
   *  event from another source (the AM's V1 write, or another admin) updates the same service
   *  signal independently (see ChangeRequestNotificationService). */
  onChangeRequestUpdated(): void {
    const jobKey = this.selectedJobKey();
    if (jobKey) this.changeRequestNotificationSvc.refresh(jobKey);
    // Acknowledging also closes the "back from Service" JobRoutingLog highlight server-side
    // (ChangeRequestService.AcknowledgeChangeRequest) -- refetch here so it clears immediately
    // instead of waiting on the SignalR round-trip.
    this.jobRoutingNotificationSvc.watchJobs(this.invoiceCustomerJobs().map((j) => j.jobKey));
    if (jobKey) {
      this.loadEq1Readiness(jobKey);
      this.vendorPayableNotificationSvc.refresh(jobKey);
    }
  }

  /** The invoice-customer card reloads itself on the RFI-25 auto-create SignalR event (or any of
   *  its own actions) and emits (cardChanged) when it does -- but EQ1's "active customer invoice"
   *  check and Change Request's eligible-invoice list both read the same JobSalesInvoice row and
   *  were never wired to that event, only to selectJob() and their own SignalR events. Bug found
   *  2026-09-17 (PO 26054): a job opened in Move to Accounting just before its invoice auto-created
   *  kept showing EQ1 "No active customer invoice" and a disabled Change Request button
   *  indefinitely, since nothing ever re-fetched either after the invoice appeared. */
  onInvoiceCustomerCardChanged(): void {
    const jobKey = this.selectedJobKey();
    if (jobKey) {
      this.loadEq1Readiness(jobKey);
      this.changeRequestNotificationSvc.refresh(jobKey);
    }
  }

  private loadCount(): void {
    this.svc.getCount().subscribe({
      next: (res) => {
        if (res.status) {
          this.invoiceCustomerCount.set(res.data);
        }
      },
    });
    this.billsSvc.getCount().subscribe({
      next: (res) => {
        if (res.status) this.billsCount.set(res.data);
      },
    });
    this.prSvc.getCount().subscribe({
      next: (res) => {
        if (res.status) this.prCount.set(res.data);
      },
    });
  }

  showMoreBills(): void {
    this.loadBillsJobs(false);
  }

  showMorePr(): void {
    this.loadPrJobs(false);
  }

  private loadBillsJobs(reset: boolean): void {
    if (reset) {
      this.billsNextStart = 0;
      this.billsJobs.set([]);
      if (this.activeTab() === 'bills') this.selectedJobKey.set(null);
    }
    this.billsLoading.set(true);
    this.billsLoadError.set('');
    this.billsSvc.getJobsPage(this.billsNextStart, PAGE_LENGTH, this.searchValue() || null).subscribe({
      next: (res) => {
        this.billsLoading.set(false);
        if (res.status && res.data) {
          const page = res.data;
          this.billsJobs.update((existing) => (reset ? page.data : [...existing, ...page.data]));
          this.billsFilteredCount.set(page.filteredRecords);
          this.billsNextStart += page.data.length;
          // "Back from Service" flags + the returned-count bubble were only ever wired for Tab 1's
          // own list (watchJobs() never called with Tab 2's jobs) -- found live 2026-09-16: a job
          // sent back to Service from Tab 2 never showed the live return flag there. Same fix as
          // Tab 1's loadJobs().
          this.jobRoutingNotificationSvc.watchJobs(this.billsJobs().map((j) => j.jobKey));
          if (!this.selectedJobKey() && this.activeTab() === 'bills' && this.billsJobs().length) {
            this.selectJob(this.billsJobs()[0].jobKey);
          }
        } else {
          this.billsLoadError.set(res.message || 'Failed to load jobs.');
        }
      },
      error: () => {
        this.billsLoading.set(false);
        this.billsLoadError.set('Failed to load jobs.');
      },
    });
  }

  private loadPrJobs(reset: boolean): void {
    if (reset) {
      this.prNextStart = 0;
      this.prJobs.set([]);
      if (this.activeTab() === 'pr') this.selectedJobKey.set(null);
    }
    this.prLoading.set(true);
    this.prLoadError.set('');
    this.prSvc.getJobsPage(this.prNextStart, PAGE_LENGTH, this.searchValue() || null).subscribe({
      next: (res) => {
        this.prLoading.set(false);
        if (res.status && res.data) {
          const page = res.data;
          this.prJobs.update((existing) => (reset ? page.data : [...existing, ...page.data]));
          this.prFilteredCount.set(page.filteredRecords);
          this.prNextStart += page.data.length;
          this.jobRoutingNotificationSvc.watchJobs(this.prJobs().map((j) => j.jobKey));
          if (!this.selectedJobKey() && this.activeTab() === 'pr' && this.prJobs().length) {
            this.selectJob(this.prJobs()[0].jobKey);
          }
        } else {
          this.prLoadError.set(res.message || 'Failed to load jobs.');
        }
      },
      error: () => {
        this.prLoading.set(false);
        this.prLoadError.set('Failed to load jobs.');
      },
    });
  }

  /** "🚀 Finalize" succeeded -- the job's tab membership may have just changed (it's computed live
   *  server-side from the same fields the finalize gate validated), so refresh every tab's count
   *  and whichever list(s) are already loaded so the move is visible immediately. */
  onJobFinalized(): void {
    this.loadCount();
    this.loadJobs(true);
    if (this.billsJobs().length || this.activeTab() === 'bills') this.loadBillsJobs(true);
    if (this.prJobs().length || this.activeTab() === 'pr') this.loadPrJobs(true);
  }

  /** "with Alysha — sent 2h ago" style relative time for the job-list routing flags. */
  timeAgo(iso: string | null | undefined): string {
    if (!iso) return '';
    const diffMs = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  // -- JobRoutingLog -- "Back from Service" acknowledgement --

  /** Clicked on the pulsing "Back from Service" highlight -- clears it everywhere (frontend
   *  refetch here is a belt-and-braces immediate update; the SignalR JobRoutingChanged broadcast
   *  from the backend keeps every other open tab/session in sync independently). */
  acknowledgeJobRouting(jobKey: string, event: MouseEvent): void {
    event.stopPropagation(); // don't also trigger the job card's own (click)="selectJob(...)"
    this.jobRoutingNotificationSvc.acknowledge(jobKey).subscribe({
      next: (res) => {
        if (res.status) {
          this.jobRoutingNotificationSvc.watchJobs(this.invoiceCustomerJobs().map((j) => j.jobKey));
        }
      },
    });
  }

  private loadJobs(reset: boolean): void {
    if (reset) {
      this.nextStart = 0;
      this.invoiceCustomerJobs.set([]);
      this.selectedJobKey.set(null);
    }
    this.loadingJobs.set(true);
    this.loadError.set('');
    this.svc.getJobsPage(this.nextStart, PAGE_LENGTH, this.searchValue() || null).subscribe({
      next: (res) => {
        this.loadingJobs.set(false);
        if (res.status && res.data) {
          const page = res.data;
          this.invoiceCustomerJobs.update((existing) =>
            reset ? page.data : [...existing, ...page.data],
          );
          this.invoiceCustomerFilteredCount.set(page.filteredRecords);
          this.nextStart += page.data.length;
          this.jobRoutingNotificationSvc.watchJobs(this.invoiceCustomerJobs().map((j) => j.jobKey));
          if (!this.selectedJobKey() && this.invoiceCustomerJobs().length) {
            this.selectJob(this.invoiceCustomerJobs()[0].jobKey);
          }
        } else {
          this.loadError.set(res.message || 'Failed to load jobs.');
        }
      },
      error: () => {
        this.loadingJobs.set(false);
        this.loadError.set('Failed to load jobs.');
      },
    });
  }
}
