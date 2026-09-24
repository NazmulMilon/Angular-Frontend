import {
  Component,
  HostListener,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe, LowerCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { EMPTY, Subject, finalize, forkJoin, switchMap, takeUntil } from 'rxjs';

import { AccordionComponent } from '../accordion/accordion.component';
import {
  RecallReviewModalComponent,
  RecallReviewResult,
} from '../recall-review-modal/recall-review-modal.component';
import { AssignVendorService } from '../../../services/assign-vendor.service';
import { AuthTokenService } from '../../../services/auth-token.service';
import { DepositApprovalNotificationService } from '../../../features/job/deposit/deposit-approval-notification.service';
import { telHref } from '../../utils/phone-tel.util';
import { isBusinessHours } from '../../utils/business-hours.util';
import {
  AttachmentThumbnailGridComponent,
  AttachmentCardFile,
} from '../attachment-thumbnail-grid/attachment-thumbnail-grid.component';
import { environment } from '../../../../environments/environment';
import {
  AssignedVendorDetail,
  AssignVendorPage,
  BroadcastJobFileDto,
  BroadcastToVendorsRequest,
  BroadcastVendorOptionDto,
  CustomerLocationOptionDto,
  CustomerProfileDne,
  CustomerRequestorOption,
  DuplicateJobRequest,
  DuplicateJobResultDto,
  JobHeaderDetail,
  JobPriorityChangePreview,
  JobPriorityOption,
  JobPriorityVendorCheck,
  JobStatusOption,
  LocationFileItem,
  SaveBroadcastConfigRequest,
  UnassignVendorWithEmailRequest,
  UpdateServiceRequestInstructionsRequest,
  VendorDropdownOption,
  VendorPaperFile,
  CustomerEstimateForApproval,
  VendorForEstimate,
  SendVendorActionMailRequest,
} from '../../../models/assign-vendor.model';

/**
 * Customer-facing document types that must never be broadcast to vendors.
 * Compared case-insensitively because the API returns these with inconsistent casing
 * (e.g. 'CUSTOMER WORK ORDER' vs 'Customer Estimate File').
 */
const VENDOR_EXCLUDED_DOCUMENT_TYPES = new Set([
  'customer work order',
  'customer estimate file',
  'customer additional approval',
]);

/** True when `docTypeName` is a customer-facing type that must not be sent to vendors. */
function isVendorExcludedDocumentType(docTypeName: string | null | undefined): boolean {
  return VENDOR_EXCLUDED_DOCUMENT_TYPES.has((docTypeName ?? '').trim().toLowerCase());
}

/** Quick-nav tab keys for the Customer & Vendor Invoicing page (owns the sections this bar links to). */
export type VendorBillsNavTab =
  | 'job-details'
  | 'check-in-out'
  | 'estimating'
  | 'attachments-estimate'
  | 'invoices'
  | 'attachments-invoice';

@Component({
  selector: 'app-job-details-accordion',
  standalone: true,
  imports: [
    AccordionComponent,
    AttachmentThumbnailGridComponent,
    RecallReviewModalComponent,
    CurrencyPipe,
    DatePipe,
    DecimalPipe,
    LowerCasePipe,
    FormsModule,
  ],
  templateUrl: './job-details-accordion.component.html',
  styleUrl: './job-details-accordion.component.scss',
})
export class JobDetailsAccordionComponent implements OnChanges, OnDestroy {
  private static readonly EMERGENCY_JOB_TYPE_KEY = 'fc078fd5-5ddc-4088-8a9f-d982436e20fd';
  private static readonly BID_JOB_TYPE_KEY = 'b2652bbb-fa8a-4382-9e2b-77ba60fbeae5';
  private static readonly PROJECT_JOB_TYPE_KEY = 'bebc6067-145c-4dc7-9882-b2efa84053c8';
  private static readonly PM_JOB_TYPE_KEY = '3d0a7106-4ef7-4df6-b5a4-b534589167b0';
  private static readonly RECALL_JOB_TYPE_KEY = '4905d351-838e-45f0-a1fb-f1e4af627626';
  /** JobStatus GUID for "Pending Return ETA" — target status when moving a recall job out of Accounting. */
  private static readonly PENDING_RETURN_ETA_STATUS_KEY = 'b7ce1e7d-e2fd-4064-a2eb-5a92b83f261b';
  /** JobStatus.TriggerBit value for the Move-to-Accounting status. */
  private static readonly MOVE_TO_ACCOUNTING_TRIGGER_BIT = 66;
  /** JobStatus.TriggerBit value for the Complete status — the other status a job can be recalled from. */
  private static readonly COMPLETE_TRIGGER_BIT = 6;
  private static readonly SRI_FIELDS = [
    'serviceRequest',
    'additionalApproval',
    'specialInstruction',
    'locationSpecialInstruction',
  ] as const;

  private readonly assignVendorSvc = inject(AssignVendorService);
  private readonly authTokenSvc = inject(AuthTokenService);
  private readonly depositApprovalNotification = inject(DepositApprovalNotificationService);

  readonly hasUnseenDepositDecision = this.depositApprovalNotification.hasUnseenDepositDecision;
  private readonly sanitizer = inject(DomSanitizer);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroy$ = new Subject<void>();

  readonly telHref = telHref;

  jobKey = input('');
  defaultOpen = input(false);
  /** Currently active quick-nav tab, driven by the host page (e.g. VendorBillsComponent). */
  activeNavTab = input<VendorBillsNavTab | null>(null);
  /** Whether to render the bottom quick-nav bar. Hosts without matching sections (e.g. Notes & Activity) pass false. */
  showNav = input(true);
  /** Emitted when a quick-nav button is clicked; host page owns the actual scrolling/section state. */
  navigateSection = output<{ sectionId: string; tab: VendorBillsNavTab }>();
  /** Emitted right when a real (non-null) Trade change save begins — hosts can show a loading popup. */
  tradeChangeStarted = output<void>();
  /**
   * Emitted after Trade successfully saves to a real (non-null) value. Hosts with an AI
   * Sourcing Agent section (e.g. AssignVendorComponent) should show a confirmation and then
   * call their own onStartAISourcing() in response, to re-run sourcing for the new trade.
   */
  tradeChangeSucceeded = output<{ tradeName: string | null }>();
  /** Emitted when a Trade change save fails — hosts should close any loading popup they opened. */
  tradeChangeFailed = output<void>();

  pageContext = signal<AssignVendorPage | null>(null);
  jobHeaderDetail = signal<JobHeaderDetail | null>(null);
  /** True when Job.JobStatusKey's TriggerBit is Complete (6) or Move-to-Accounting (66) — the only statuses a job can be recalled from. */
  canRecall = computed(() => {
    const bit = this.jobHeaderDetail()?.jobStatusTriggerBit;
    return (
      bit === JobDetailsAccordionComponent.COMPLETE_TRIGGER_BIT ||
      bit === JobDetailsAccordionComponent.MOVE_TO_ACCOUNTING_TRIGGER_BIT
    );
  });
  customerProfileDne = signal<CustomerProfileDne | null>(null);
  storeHoursModalOpen = signal(false);

  successMessage = signal('');
  errorMessage = signal('');

  // ── Broadcast configuration modal (pre-vendor-selection) ────────────────
  showBroadcastConfigModal = signal(false);
  broadcastIsEmergency = signal(false);
  broadcastShowMaxAccept = signal(false);
  broadcastEtaLimit = signal<number | null>(null);
  broadcastDefaultEtaLimit = signal(0);
  broadcastExpandedMiles = signal<number | null>(null);
  broadcastDefaultBroadcastRadiusMiles = signal(0);
  /** Total search distance shown in the config modal (common radius + per-job add-on), capped at 150 mi. */
  broadcastSearchDistanceMiles = computed(() => {
    const expanded = this.broadcastExpandedMiles() ?? 0;
    return Math.min(150, (this.broadcastDefaultBroadcastRadiusMiles() ?? 0) + expanded);
  });
  broadcastMaxAccept = signal(0);
  broadcastAdditionalTrades = signal<VendorDropdownOption[]>([]);
  broadcastAvailableTrades = signal<VendorDropdownOption[]>([]);
  broadcastSelectedTradeKey = signal('');

  // ── Broadcast vendor selection modal ─────────────────────────────────────
  broadcastModalOpen   = signal(false);
  broadcastRadius      = signal<number>(50);
  broadcastVendors     = signal<BroadcastVendorOptionDto[]>([]);
  broadcastLoading     = signal(false);
  broadcastSending     = signal(false);
  broadcastSelectedKeys = signal<Set<string>>(new Set());
  broadcastMessage     = signal<string | null>(null);
  broadcastError       = signal<string | null>(null);

  // ── Broadcast file selection ─────────────────────────────────────────────
  broadcastFiles        = signal<BroadcastJobFileDto[]>([]);
  broadcastFilesLoading = signal(false);
  broadcastSelectedFileKeys = signal<Set<string>>(new Set());
  broadcastAttachmentCards = computed<AttachmentCardFile[]>(() =>
    this.broadcastFiles().map(f => ({
      fileKey: f.fileKey,
      fileName: f.title,
      fileUrl: f.fileUrl,
      fileType: f.documentTypeName,
    }))
  );

  private pendingBroadcastFromQuery = false;

  // Broadcast Confirmation Modal
  showBroadcastConfirmModal = signal(false);
  broadcastConfirmChoice = signal<'remove' | 'cancel' | 'keep' | null>(null);
  broadcastConfirmRemoving = signal(false);

  // ── Files & Attachments modal (mirrors legacy MgtJobFile/Index) ──
  filesModalOpen = signal(false);
  filesList = signal<BroadcastJobFileDto[]>([]);
  filesListLoading = signal(false);
  filesModalError = signal<string | null>(null);
  filesModalMessage = signal<string | null>(null);
  filesDeletingKey = signal<string | null>(null);
  deleteConfirmModalOpen = signal(false);
  deleteConfirmFile = signal<BroadcastJobFileDto | null>(null);
  deleteSuccessModalOpen = signal(false);
  filesDocTypes = signal<VendorDropdownOption[]>([]);
  filesDocTypesLoading = signal(false);
  filesUploadDocTypeKey = signal('');
  filesUploadComment = signal('');
  filesToUpload = signal<File[]>([]);
  filesUploading = signal(false);
  filesDragActive = signal(false);
  vendorPapersList = signal<VendorPaperFile[]>([]);
  vendorPapersLoading = signal(false);
  locationFilesList = signal<LocationFileItem[]>([]);
  locationFilesLoading = signal(false);

  /** DocumentType GUID for "Customer Additional Approval" (legacy MgtJobFile flow). */
  private static readonly CUSTOMER_ADDITIONAL_APPROVAL_DOCTYPE = 'f5c85357-f3cc-48c6-b399-141377c32edb';
  /** DocumentType GUID for "Customer Approval" — always prompts the status-change modal. */
  private static readonly CUSTOMER_APPROVAL_DOCTYPE = '76e48b89-87d4-464a-9d89-94f62e0a9658';
  /** DocumentType GUIDs for "Vendor Estimate" variants — prompts Vendor Estimate Received status modal. */
  private static readonly VENDOR_ESTIMATE_DOCTYPES = [
    'd5b2aefd-acac-462a-bc41-1b7d26529581',
    '8c25ed7d-3e44-49ac-b23b-1c4b6874b7d5',
    '6c4b5aec-9e97-49fa-be98-135d1ee03e95',
  ];
  /** TriggerBit for the "Customer Approval" job status (legacy MgtJobFile statusModal). */
  private static readonly CUSTOMER_APPROVAL_TRIGGER_BIT = 14;
  /** TriggerBit for the "Vendor Estimate Received" job status (legacy MgtJobFile statusModalV). */
  private static readonly VENDOR_ESTIMATE_RECEIVED_TRIGGER_BIT = 9;
  /** TriggerBit for "Need Vendor Estimate" — set on the clicked vendor when either Send Estimate
   *  to Vendor button executes (RBR-486). */
  private static readonly NEED_VENDOR_ESTIMATE_TRIGGER_BIT = 8;

  // ── Approve-customer-estimate-on-behalf modal ──
  approveEstimateModalOpen = signal(false);
  approveEstimateList = signal<CustomerEstimateForApproval[]>([]);
  approveEstimateCustomerDne = signal(0);
  /** True while the legacy "approve on behalf" save is in flight (RBR — no-new-tab fix). */
  approveEstimateSaving = signal(false);

  // ── Doc-type-driven "Change Job Status?" confirm modal ──
  statusChangeModalOpen = signal(false);
  statusChangeTargetLabel = signal('');
  statusChangeTriggerBit = signal(0);
  statusChangeNoteTitle = signal('');
  statusChangeNoteMessage = signal('');
  statusChangeSaving = signal(false);

  // ── Send Estimate to Vendor modal (RBR-483) — opens after a vendor-estimate
  //    file is saved, mirroring legacy #ModalSendEstimateToVendor. ──
  sendEstimateModalOpen = signal(false);
  sendEstimateLoading = signal(false);
  sendEstimateVendors = signal<VendorForEstimate[]>([]);
  /** JobVendor.PKey of the currently selected vendor (radio group). */
  sendEstimateSelectedVendorKey = signal<string>('');
  /** Set of selected VendorContact.contactKey values (checkboxes). */
  sendEstimateSelectedContacts = signal<Set<string>>(new Set());
  sendEstimateEmailNote = signal(
    'We received your estimate via email/(call) but please click the Create estimate button here and upload as required for submittal.',
  );
  sendEstimateCustomEmail = signal('');
  sendEstimateError = signal<string | null>(null);
  sendEstimateMessage = signal<string | null>(null);
  sendEstimateSending = signal(false);
  /** True once an estimate request email has been sent — disables the action buttons (legacy hides #btnDIV). */
  sendEstimateSent = signal(false);
  /**
   * RBR-486 flow guard: true once Green/Orange have already moved the vendor to "Need Vendor
   * Estimate" (8) in this modal session. When the modal then closes, its Close-fallback skips
   * the "Vendor Estimate Received" (9) change so it doesn't overwrite the 8 the button just set.
   * A plain Close (neither button pressed) leaves this false → the 9-change fires.
   */
  sendEstimateStatusResolved = signal(false);

  /** Vendors who have accepted and set ETA */
  assignedVendorsWithEta = computed(() => {
    const vendors = this.jobHeaderDetail()?.assignedVendors || [];
    return vendors.filter(v => !v.isDelete && (v.scheduleDateIso || v.scheduleDate));
  });

  /** Vendors who are assigned but haven't set ETA */
  assignedVendorsWithoutEta = computed(() => {
    const vendors = this.jobHeaderDetail()?.assignedVendors || [];
    return vendors.filter(v => !v.isDelete && !v.scheduleDateIso && !v.scheduleDate);
  });

  /**
   * Determines if the "Keep and Broadcast" option should be available
   * Based on business rules:
   * 1. For Bid Request / Project jobs: Allow if assigned count < MaxNoOfVendorAccept (when MaxNoOfVendorAccept > 0)
   * 2. For other job types: Allow if NO vendors have set ETA
   */
  canKeepVendorsAndBroadcast = computed(() => {
    const hd = this.jobHeaderDetail();
    if (!hd) return false;

    const isBidOrProject = this.isBidOrProjectJobType(hd.jobTypeKey);
    const vendorsWithEta = this.assignedVendorsWithEta();
    const allVendors = this.allAssignedVendors();

    if (isBidOrProject) {
      // For Bid/Project: Allow keeping vendors if under the max limit
      // TODO: Need to get MaxNoOfVendorAccept from backend
      // For now, always allow for Bid/Project jobs
      return true;
    } else {
      // For other job types: Allow only if NO vendors have set ETA
      return vendorsWithEta.length === 0 && allVendors.length > 0;
    }
  });

  /** Total assigned vendors (with or without ETA), excluding deleted/inactive vendors */
  allAssignedVendors = computed(() => {
    const vendors = this.jobHeaderDetail()?.assignedVendors || [];
    return vendors.filter(v => !v.isDelete);
  });

  nteCustomer = signal('');
  nteRevCustomer = signal('');
  nteVendor = signal('');
  nteRevVendor = signal('');

  tradeDropdown = signal<VendorDropdownOption[]>([]);
  tradeSaving = signal(false);
  jobStatusList = signal<JobStatusOption[]>([]);
  customerRequestorOptions = signal<CustomerRequestorOption[]>([]);
  customerRequestorSaving = signal(false);
  jobPriorityOptions = signal<JobPriorityOption[]>([]);
  jobPrioritySaving = signal(false);
  originalJobTypeKey = signal('');
  jobPriorityUiKey = signal('');
  jobPriorityVendorCheck = signal<JobPriorityVendorCheck | null>(null);
  jobPriorityChangeModalOpen = signal(false);
  jobPriorityPreview = signal<JobPriorityChangePreview | null>(null);
  jobPriorityPendingKey = signal<string | null>(null);
  jobPriorityChangeStatus = signal<string | null>(null);

  statusDropdownOpen = signal(false);

  duplicateModalOpen = signal(false);
  duplicateLocations = signal<CustomerLocationOptionDto[]>([]);
  duplicateLocLoading = signal(false);
  duplicateSaving = signal(false);
  duplicateSelectedLoc = signal<string | null>(null);
  duplicateMessage = signal<string | null>(null);
  duplicateError = signal<string | null>(null);
  duplicateJobResult = signal<DuplicateJobResultDto | null>(null);
  duplicateSearchQuery = signal('');

  private readonly sriFieldEdits = signal<
    Partial<Record<(typeof JobDetailsAccordionComponent.SRI_FIELDS)[number], string>>
  >({});
  private readonly sriManuallyExpanded = signal<Set<string>>(new Set());
  private readonly sriManuallyCollapsed = signal<Set<string>>(new Set());
  sriSaving = signal(false);

  readonly cleanedServiceRequest = computed(() =>
    this.cleanServiceRequestText(this.jobHeaderDetail()?.serviceRequest ?? ''),
  );
  readonly cleanedSpecialInstruction = computed(
    () => this.jobHeaderDetail()?.specialInstruction ?? '',
  );
  readonly cleanedLocationSpecialInstruction = computed(
    () => this.jobHeaderDetail()?.locationSpecialInstruction ?? '',
  );
  readonly specialInstructionHighlight = computed(() =>
    this.extractHighlightedText(this.jobHeaderDetail()?.specialInstruction ?? ''),
  );
  readonly isPrimary = computed(() => this.pageContext()?.isPrimary === 1);
  readonly primaryVendorKey = computed(() => this.pageContext()?.primaryVendorKey ?? '');
  readonly customerRequestorSelectKey = computed(() => {
    const hd = this.jobHeaderDetail();
    if (!hd) return '';
    return this.resolveCustomerRequestorKey(hd, this.customerRequestorOptions()) ?? '';
  });
  tradeName = computed(() => this.pageContext()?.tradeName ?? '');
  readonly filteredDuplicateLocations = computed(() => {
    const query = this.duplicateSearchQuery().toLowerCase().trim();
    const locations = this.duplicateLocations();
    if (!query) return locations;
    return locations.filter(
      (loc) =>
        loc.lname?.toLowerCase().includes(query) ||
        loc.address?.toLowerCase().includes(query),
    );
  });

  @ViewChild('jobDetailsAccordion') accordion?: AccordionComponent;
  @ViewChild(RecallReviewModalComponent) recallReviewModal?: RecallReviewModalComponent;

  /** Opens the Job Details accordion (used by host pages that scroll to this section). */
  open(): void {
    this.accordion?.isOpen?.set(true);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['jobKey']) {
      const key = this.jobKey()?.trim() ?? '';
      if (key) {
        this.pendingBroadcastFromQuery =
          this.route.snapshot.queryParamMap.get('broadcast') === '1';
        this.loadJobDetails(key);
        this.depositApprovalNotification.watchJob(key);
      }
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSave(): void {
    if (this.hasPendingSriEdits()) {
      this.persistSriEdits();
    }
  }

  onNavigateSection(sectionId: string, tab: VendorBillsNavTab): void {
    this.navigateSection.emit({ sectionId, tab });
  }

  /** Estimating lives on its own job page (RBR-463), not as a Customer & Vendor Invoicing section. */
  onNavigateToEstimates(): void {
    const key = this.jobKey();
    if (!key) return;
    this.depositApprovalNotification.markRead(key);
    void this.router.navigate(['/job', key, 'estimates']);
  }

  // ════════════════════════════════════════════════════════════════
  // BROADCAST TO VENDORS
  // ════════════════════════════════════════════════════════════════

  onBroadcastToVendors(): void {
    const jobKey = this.jobKey();
    if (!jobKey) return;

    const allVendors = this.allAssignedVendors();

    // Check if there are ANY assigned vendors (with or without ETA)
    if (allVendors.length > 0) {
      // Show confirmation modal
      this.showBroadcastConfirmModal.set(true);
      this.broadcastConfirmChoice.set(null);
      return;
    }

    // No assigned vendors at all, proceed to configuration
    this.openBroadcastConfigModal();
  }

  openBroadcastConfigModal(): void {
    this.showBroadcastConfigModal.set(true);
    this.broadcastEtaLimit.set(null);
    this.broadcastDefaultEtaLimit.set(0);
    this.broadcastExpandedMiles.set(null);
    this.broadcastDefaultBroadcastRadiusMiles.set(0);
    this.broadcastMaxAccept.set(0);
    this.broadcastAdditionalTrades.set([]);
    this.broadcastSelectedTradeKey.set('');
    this.loadAvailableTrades();
    this.loadBroadcastConfig();
  }

  closeBroadcastConfigModal(): void {
    this.showBroadcastConfigModal.set(false);
  }

  loadAvailableTrades(): void {
    this.assignVendorSvc.getTradeDropdown()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (trades) => {
          const currentTradeKey = this.pageContext()?.tradeKey;
          this.broadcastAvailableTrades.set(
            trades.filter(t => t.value !== currentTradeKey)
          );
        },
        error: () => this.errorMessage.set('Failed to load trade list')
      });
  }

  loadBroadcastConfig(): void {
    const jobKey = this.jobKey();
    if (!jobKey) return;

    this.assignVendorSvc.getBroadcastConfig(jobKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (res.status && res.data) {
            const config = res.data;
            this.broadcastIsEmergency.set(config.isEmergency);
            this.broadcastShowMaxAccept.set(config.showMaxVendorAccept);
            this.broadcastDefaultEtaLimit.set(config.defaultEtaLimit ?? 0);
            this.broadcastDefaultBroadcastRadiusMiles.set(config.defaultBroadcastRadiusMiles ?? 0);
            this.broadcastEtaLimit.set(config.etaLimit);
            this.broadcastExpandedMiles.set(
              config.expandedMiles == null
                ? null
                : Math.min(
                    Math.max(0, 150 - (config.defaultBroadcastRadiusMiles ?? 0)),
                    Math.max(0, config.expandedMiles)
                  )
            );
            this.broadcastMaxAccept.set(config.maxVendorAccept ?? 0);

            // Map additional trades to dropdown options
            const additionalOptions: VendorDropdownOption[] = config.additionalTrades.map(trade => ({
              value: trade.tradeKey,
              text: trade.tradeName,
              label: trade.tradeName,
            }));
            this.broadcastAdditionalTrades.set(additionalOptions);
          }
        },
        error: () => {
          // If config load fails, just use defaults (already set in openBroadcastConfigModal)
          console.warn('Could not load broadcast config, using defaults');
        }
      });
  }

  onAddBroadcastTrade(): void {
    const tradeKey = this.broadcastSelectedTradeKey();
    if (!tradeKey) return;

    const trade = this.broadcastAvailableTrades().find(t => t.value === tradeKey);
    if (!trade) return;

    const current = this.broadcastAdditionalTrades();
    if (current.some(t => t.value === tradeKey)) return;

    this.broadcastAdditionalTrades.set([...current, trade]);
    this.broadcastSelectedTradeKey.set('');
  }

  onSelectBroadcastTrade(tradeKey: string): void {
    if (!tradeKey) return;

    const trade = this.broadcastAvailableTrades().find(t => t.value === tradeKey);
    if (!trade) return;

    // Check if already added
    const current = this.broadcastAdditionalTrades();
    if (current.some(t => t.value === tradeKey)) {
      // Reset selection if already added
      this.broadcastSelectedTradeKey.set('');
      return;
    }

    // Add to list
    this.broadcastAdditionalTrades.set([...current, trade]);

    // Reset selection
    this.broadcastSelectedTradeKey.set('');
  }

  onBroadcastSearchDistanceInput(totalMiles: number): void {
    const baseRadius = this.broadcastDefaultBroadcastRadiusMiles() ?? 0;
    const cappedTotal = Math.min(150, Math.max(0, totalMiles));
    this.broadcastExpandedMiles.set(Math.max(0, cappedTotal - baseRadius));
  }

  onRemoveBroadcastTrade(tradeKey: string): void {
    this.broadcastAdditionalTrades.set(
      this.broadcastAdditionalTrades().filter(t => t.value !== tradeKey)
    );
  }

  onProceedToBroadcast(): void {
    const jobKey = this.jobKey();
    if (!jobKey) {
      this.errorMessage.set('Job key is missing. Cannot save broadcast configuration.');
      return;
    }

    const showMaxAccept = this.broadcastShowMaxAccept();

    const request: SaveBroadcastConfigRequest = {
      jobKey,
      etaLimit: this.broadcastEtaLimit() ?? this.broadcastDefaultEtaLimit(),
      expandedMiles: this.broadcastExpandedMiles() ?? 0,
      maxVendorAccept: showMaxAccept ? this.broadcastMaxAccept() : null,
      additionalTradeKeys: this.broadcastAdditionalTrades().map(t => t.value),
    };

    this.assignVendorSvc.saveBroadcastConfig(request)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (res.status) {
            // Configuration saved, proceed to vendor selection
            this.closeBroadcastConfigModal();
            this.openBroadcastModal();
          } else {
            this.errorMessage.set(res.message || 'Failed to save broadcast configuration');
          }
        },
        error: () => this.errorMessage.set('Error saving broadcast configuration')
      });
  }

  openBroadcastModal(): void {
    this.broadcastModalOpen.set(true);
    this.broadcastMessage.set(null);
    this.broadcastError.set(null);
    this.broadcastSelectedKeys.set(new Set());
    this.broadcastSelectedFileKeys.set(new Set());
    const searchRadius = this.getBroadcastSearchRadius();
    this.broadcastRadius.set(searchRadius > 0 ? searchRadius : 50);
    this.loadBroadcastVendors();
    this.loadBroadcastFiles();
  }

  loadBroadcastFiles(): void {
    const jobKey = this.jobKey();
    if (!jobKey) return;
    this.broadcastFilesLoading.set(true);
    this.broadcastFiles.set([]);
    this.assignVendorSvc.getJobFilesForBroadcast(jobKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe((res: any) => {
        this.broadcastFilesLoading.set(false);
        if (res.status && Array.isArray(res.data)) {
          this.broadcastFiles.set(
            res.data.filter((f: BroadcastJobFileDto) => !isVendorExcludedDocumentType(f.documentTypeName))
          );
          if (isBusinessHours()) {
            this.selectAllBroadcastFiles();
          }
        }
      });
  }

  toggleBroadcastFile(fileKey: string): void {
    const s = new Set(this.broadcastSelectedFileKeys());
    if (s.has(fileKey)) s.delete(fileKey); else s.add(fileKey);
    this.broadcastSelectedFileKeys.set(s);
  }

  selectAllBroadcastFiles(): void {
    const all = new Set(this.broadcastFiles().map((f: BroadcastJobFileDto) => f.fileKey));
    this.broadcastSelectedFileKeys.set(all);
  }

  deselectAllBroadcastFiles(): void {
    this.broadcastSelectedFileKeys.set(new Set());
  }

  onViewBroadcastAttachment(file: AttachmentCardFile): void {
    if (file.fileUrl) {
      window.open(file.fileUrl, '_blank', 'noopener');
    } else {
      console.warn('Broadcast file has no fileUrl from the API:', file);
      this.broadcastError.set('This file has no viewable URL yet.');
    }
  }

  /** Total vendor search radius: system default + per-job expanded mileage add-on (max 150 mi). */
  private getBroadcastSearchRadius(): number {
    const expandedMiles = this.broadcastExpandedMiles() ?? 0;
    return Math.min(150, (this.broadcastDefaultBroadcastRadiusMiles() ?? 0) + expandedMiles);
  }

  onBroadcastConfirmProceed(): void {
    const choice = this.broadcastConfirmChoice();

    if (choice === 'cancel') {
      this.closeBroadcastConfirmModal();
      return;
    }

    if (choice === 'remove') {
      // Remove all assigned vendors, then open broadcast modal
      const jobKey = this.jobKey();
      const adminKey = this.authTokenSvc.getAdminKeyFromToken() || '';


      if (!jobKey || !adminKey) {
        const missingItems = [];
        if (!jobKey) missingItems.push('jobKey');
        if (!adminKey) missingItems.push('adminKey');

        console.error('❌ Missing required data:', missingItems.join(', '));
        this.errorMessage.set(`Missing required data: ${missingItems.join(', ')}. Please refresh the page.`);
        return;
      }

      const vendorsToRemove = this.allAssignedVendors();

      if (vendorsToRemove.length === 0) {
        this.errorMessage.set('No vendors to remove.');
        return;
      }

      // Show loading state
      this.broadcastConfirmRemoving.set(true);

      // Create unassign requests for all vendors
      const unassignRequests = vendorsToRemove.map(vendor => {
        const request: UnassignVendorWithEmailRequest = {
          jobKey,
          jobVendorKey: vendor.jobVendorKey,
          adminKey,
          comment: ''
        };
        return this.assignVendorSvc.unassignVendorWithEmail(request);
      });

      // Execute all unassign requests in parallel
      forkJoin(unassignRequests)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (results) => {
            this.broadcastConfirmRemoving.set(false);

            // Check if any failed
            const failures = results.filter(r => !r.status);
            if (failures.length > 0) {
              this.errorMessage.set(`Failed to remove ${failures.length} vendor(s). Please try again.`);
              this.closeBroadcastConfirmModal();
              return;
            }

            // Success! Refresh the page data and open broadcast modal
            this.successMessage.set(`Successfully removed ${results.length} vendor(s). Opening broadcast modal...`);
            this.closeBroadcastConfirmModal();

            // Reload the page data to reflect the removals
            this.loadJobDetails(this.jobKey());

            // Open the broadcast config modal after a short delay to allow data to refresh
            setTimeout(() => {
              this.openBroadcastConfigModal();
            }, 500);
          },
          error: (err) => {
            this.broadcastConfirmRemoving.set(false);
            this.errorMessage.set('Failed to remove vendors: ' + (err.error?.message || err.message || 'Unknown error'));
            this.closeBroadcastConfirmModal();
          }
        });
      return;
    }

    if (choice === 'keep') {
      // Keep existing vendors and proceed to configuration
      this.closeBroadcastConfirmModal();
      this.openBroadcastConfigModal();
      return;
    }

    // No choice selected
    this.errorMessage.set('Please select an option before proceeding.');
  }

  closeBroadcastConfirmModal(): void {
    this.showBroadcastConfirmModal.set(false);
    this.broadcastConfirmChoice.set(null);
    this.broadcastConfirmRemoving.set(false);
  }

  onCloseBroadcastModal(): void {
    this.broadcastModalOpen.set(false);
  }

  loadBroadcastVendors(): void {
    const jobKey = this.jobKey();
    if (!jobKey) return;
    this.broadcastLoading.set(true);
    this.broadcastVendors.set([]);
    this.assignVendorSvc.getVendorsForBroadcast(jobKey, this.broadcastRadius())
      .pipe(takeUntil(this.destroy$))
      .subscribe((res: any) => {
        this.broadcastLoading.set(false);
        if (res.status && Array.isArray(res.data)) {
          this.broadcastVendors.set(res.data);
        } else {
          this.broadcastError.set(res.message || 'Failed to load vendors.');
        }
      });
  }

  onBroadcastRadiusChange(miles: number): void {
    this.broadcastRadius.set(miles);
    this.loadBroadcastVendors();
  }

  toggleBroadcastVendor(vendorKey: string): void {
    const s = new Set(this.broadcastSelectedKeys());
    if (s.has(vendorKey)) s.delete(vendorKey); else s.add(vendorKey);
    this.broadcastSelectedKeys.set(s);
  }

  selectAllBroadcastVendors(): void {
    const all = new Set(this.broadcastVendors().map((v: BroadcastVendorOptionDto) => v.vendorKey));
    this.broadcastSelectedKeys.set(all);
  }

  deselectAllBroadcastVendors(): void {
    this.broadcastSelectedKeys.set(new Set());
  }

  onSendBroadcast(): void {
    const jobKey = this.jobKey();
    const selected = Array.from(this.broadcastSelectedKeys());
    if (!jobKey || selected.length === 0) return;
    this.broadcastSending.set(true);
    this.broadcastMessage.set(null);
    this.broadcastError.set(null);
    const fileKeys = Array.from(this.broadcastSelectedFileKeys());
    const req: BroadcastToVendorsRequest = { jobKey, vendorKeys: selected, fileKeys };
    this.assignVendorSvc.broadcastToVendors(req)
      .pipe(takeUntil(this.destroy$))
      .subscribe((res: any) => {
        this.broadcastSending.set(false);
        if (res.status) {
          this.broadcastMessage.set(res.data?.message || 'Broadcast sent successfully.');
          this.broadcastSelectedKeys.set(new Set());
          this.broadcastSelectedFileKeys.set(new Set());
          this.loadBroadcastVendors();
        } else {
          this.broadcastError.set(res.message || 'Broadcast failed.');
        }
      });
  }

  // ════════════════════════════════════════════════════════════════
  // FILES & ATTACHMENTS MODAL (legacy MgtJobFile parity)
  // ════════════════════════════════════════════════════════════════

  onOpenFilesAttachments(): void {
    const jobKey = this.jobKey();
    if (!jobKey) return;
    this.filesModalOpen.set(true);
    this.filesModalError.set(null);
    this.filesModalMessage.set(null);
    this.filesUploadDocTypeKey.set('');
    this.filesUploadComment.set('');
    this.filesToUpload.set([]);
    this.loadFilesList();
    this.loadDocTypes();
    this.loadVendorPapers();
    this.loadLocationFiles();
  }

  onCloseFilesAttachments(): void {
    this.filesModalOpen.set(false);
  }

  private loadDocTypes(): void {
    if (this.filesDocTypes().length > 0) return;
    this.filesDocTypesLoading.set(true);
    this.assignVendorSvc
      .getDocumentTypes(1)
      .pipe(takeUntil(this.destroy$), finalize(() => this.filesDocTypesLoading.set(false)))
      .subscribe({
        next: (types) => this.filesDocTypes.set(types ?? []),
        error: () => this.filesDocTypes.set([]),
      });
  }

  private loadVendorPapers(): void {
    const jobKey = this.jobKey();
    if (!jobKey) return;
    this.vendorPapersLoading.set(true);
    this.assignVendorSvc
      .getVendorPapersForJob(jobKey)
      .pipe(takeUntil(this.destroy$), finalize(() => this.vendorPapersLoading.set(false)))
      .subscribe({
        next: (papers) => this.vendorPapersList.set(papers ?? []),
        error: () => this.vendorPapersList.set([]),
      });
  }

  private loadLocationFiles(): void {
    const jobKey = this.jobKey();
    if (!jobKey) return;
    this.locationFilesLoading.set(true);
    this.assignVendorSvc
      .getLocationFiles(jobKey)
      .pipe(takeUntil(this.destroy$), finalize(() => this.locationFilesLoading.set(false)))
      .subscribe({
        next: (res) => {
          if (res?.status && Array.isArray(res.data)) {
            this.locationFilesList.set(res.data);
          } else {
            this.locationFilesList.set([]);
          }
        },
        error: () => this.locationFilesList.set([]),
      });
  }

  onViewVendorPaper(paper: VendorPaperFile): void {
    if (paper.fileUrl) {
      window.open(paper.fileUrl, '_blank', 'noopener');
    } else {
      // Fallback to the legacy vendor-paper viewer if no secure blob link was resolved.
      const url = `${environment.legacyAdminBaseUrl}/ShowImage/GetVendorPapers?id=${paper.fileKey}`;
      window.open(url, '_blank', 'noopener');
    }
  }

  onViewLocationFile(file: LocationFileItem): void {
    if (file.fileUrl) {
      window.open(file.fileUrl, '_blank', 'noopener');
    } else {
      this.filesModalError.set('This location file has no viewable URL yet.');
    }
  }

  onFilesInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    this.filesToUpload.update((existing) => [...existing, ...Array.from(input.files!)]);
    input.value = '';
  }

  onFilesDragOver(event: DragEvent): void {
    event.preventDefault();
    this.filesDragActive.set(true);
  }

  onFilesDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.filesDragActive.set(false);
  }

  onFilesDrop(event: DragEvent): void {
    event.preventDefault();
    this.filesDragActive.set(false);
    const dropped = event.dataTransfer?.files;
    if (!dropped?.length) return;
    this.filesToUpload.update((existing) => [...existing, ...Array.from(dropped)]);
  }

  onRemovePendingUpload(index: number): void {
    this.filesToUpload.update((files) => files.filter((_, i) => i !== index));
  }

  /**
   * File payload captured at Save-click time, persisted only once any doc-type-driven
   * confirmation prompt resolves. Mirrors legacy: the Save button only ever SHOWS a
   * confirm modal for special doc types — `$("#fileform").submit()` (the actual
   * persist) happens later, inside the modal's Yes/No/Approve handlers.
   */
  private pendingFileUpload: {
    jobKey: string;
    docTypeKey: string;
    comment: string;
    files: File[];
  } | null = null;

  /**
   * RBR-486 flow control. On a Vendor-Estimate upload the status prompt (popup #1) means:
   *   NO  → just upload the file, no status change, no second popup.
   *   YES → upload the file, then open the Send Estimate to Vendor modal (popup #2). The status
   *         change is deferred to popup #2's outcome — Green/Orange → "Need Vendor Estimate" (8),
   *         plain Close → "Vendor Estimate Received" (9) — never stamped at YES-time.
   * This flag is set true only on the Vendor-Estimate YES path so the upload-success handler
   * knows to open popup #2 (and NO / customer-approval paths don't).
   */
  private openEstimateModalAfterUpload = false;

  onSaveFilesUpload(): void {
    const jobKey = this.jobKey();
    const files = this.filesToUpload();
    if (!jobKey) return;
    if (files.length === 0) {
      this.filesModalError.set('Please attach at least one file before saving.');
      return;
    }

    this.filesModalError.set(null);
    this.filesModalMessage.set(null);
    this.openEstimateModalAfterUpload = false;

    const docTypeKey = this.filesUploadDocTypeKey();
    const docTypeKeyLower = docTypeKey.toLowerCase();
    const docTypeText =
      this.filesDocTypes().find((o) => o.value.toLowerCase() === docTypeKeyLower)?.text ?? '';

    this.pendingFileUpload = { jobKey, docTypeKey, comment: this.filesUploadComment(), files };
    this.filesUploading.set(true);

    // Doc-type-driven confirm prompts — file is NOT persisted until the prompt resolves.
    if (docTypeKeyLower === JobDetailsAccordionComponent.CUSTOMER_APPROVAL_DOCTYPE) {
      this.openCustomerApprovalStatusModal();
      return;
    }
    if (docTypeKeyLower === JobDetailsAccordionComponent.CUSTOMER_ADDITIONAL_APPROVAL_DOCTYPE) {
      this.checkCustomerEstimatesForApproval();
      return;
    }
    if (JobDetailsAccordionComponent.VENDOR_ESTIMATE_DOCTYPES.includes(docTypeKeyLower)) {
      const dateStr = new Date().toDateString();
      this.openStatusChangeModal(
        'VENDOR ESTIMATE RECEIVED',
        JobDetailsAccordionComponent.VENDOR_ESTIMATE_RECEIVED_TRIGGER_BIT,
        'Vendor Estimate Attached',
        `Attached ${docTypeText} to this job on ${dateStr}`,
      );
      return;
    }

    // Plain doc type — no confirm prompt, persist immediately (legacy's final else-branch).
    this.performPendingFileUpload();
  }

  /**
   * Persists the file captured by the most recent Save click. Called immediately for
   * plain doc types, or deferred until a confirm/approve prompt resolves for the
   * special doc types — matching legacy's deferred `$("#fileform").submit()`.
   */
  private performPendingFileUpload(onDone?: () => void): void {
    const pending = this.pendingFileUpload;
    if (!pending) {
      this.filesUploading.set(false);
      onDone?.();
      return;
    }

    this.assignVendorSvc
      .adminSaveJobFile(pending.jobKey, pending.docTypeKey || null, pending.comment || null, pending.files)
      .pipe(takeUntil(this.destroy$), finalize(() => this.filesUploading.set(false)))
      .subscribe({
        next: (res) => {
          if (res?.status) {
            this.filesModalMessage.set(res.message || 'Files uploaded successfully.');
            this.filesToUpload.set([]);
            this.filesUploadDocTypeKey.set('');
            this.filesUploadComment.set('');
            this.pendingFileUpload = null;
            this.loadFilesList();
            // RBR-483/486: open the Send Estimate to Vendor modal (popup #2) only on the
            // Vendor-Estimate YES path. NO (and every other doc type) just uploads. The status
            // change is decided by popup #2's outcome, never here.
            if (this.openEstimateModalAfterUpload) {
              this.openEstimateModalAfterUpload = false;
              this.openSendEstimateModal(pending.jobKey);
            }
          } else {
            this.filesModalError.set(res?.message || 'Upload failed.');
          }
          onDone?.();
        },
        error: (err) => {
          this.filesModalError.set(err?.message || 'Upload failed. Please try again.');
          onDone?.();
        },
      });
  }

  private openCustomerApprovalStatusModal(): void {
    const dateStr = new Date().toDateString();
    this.openStatusChangeModal(
      'Customer Approval',
      JobDetailsAccordionComponent.CUSTOMER_APPROVAL_TRIGGER_BIT,
      'Additional Approval Attached',
      `Additional approval has been attached to this job on ${dateStr}`,
    );
  }

  private openStatusChangeModal(
    targetLabel: string,
    triggerBit: number,
    noteTitle: string,
    noteMessage: string,
  ): void {
    this.statusChangeTargetLabel.set(targetLabel);
    this.statusChangeTriggerBit.set(triggerBit);
    this.statusChangeNoteTitle.set(noteTitle);
    this.statusChangeNoteMessage.set(noteMessage);
    this.statusChangeModalOpen.set(true);
  }

  /** "No" — legacy still submits the file form on No, just without the status change/note. */
  onCancelStatusChange(): void {
    this.statusChangeModalOpen.set(false);
    this.performPendingFileUpload();
  }

  /**
   * "Yes" on the status-change prompt.
   *
   * RBR-486 — Vendor-Estimate flow: YES does NOT change any status here. It uploads the file and
   * opens the Send Estimate to Vendor modal (popup #2); the status change is decided entirely by
   * popup #2's outcome (Green/Orange → "Need Vendor Estimate" 8, plain Close → "Vendor Estimate
   * Received" 9), each scoped to the vendor (JobVendor always, Job only if Default). This replaces
   * the old behavior where YES immediately stamped the whole job + every vendor to 9 and then
   * popup #2 wrote a conflicting second time.
   *
   * Customer-approval flow (trigger 14): unchanged — change job status, save the note, persist.
   */
  onConfirmStatusChange(): void {
    const jobKey = this.jobKey();
    if (!jobKey) return;

    if (
      this.statusChangeTriggerBit() ===
      JobDetailsAccordionComponent.VENDOR_ESTIMATE_RECEIVED_TRIGGER_BIT
    ) {
      this.statusChangeModalOpen.set(false);
      this.openEstimateModalAfterUpload = true;
      this.performPendingFileUpload();
      return;
    }

    this.statusChangeSaving.set(true);
    this.assignVendorSvc
      .changeJobStatusByTriggerBit(jobKey, this.statusChangeTriggerBit())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (res?.status) {
            this.assignVendorSvc
              .saveGeneralAdminNote({
                jobKey,
                title: this.statusChangeNoteTitle(),
                comment: this.statusChangeNoteMessage(),
              })
              .pipe(takeUntil(this.destroy$))
              .subscribe({
                next: () => this.finishStatusChangeAndPersist(jobKey, res.message),
                // Status already changed even if the note fails to save; don't block the file save on it.
                error: () => this.finishStatusChangeAndPersist(jobKey, res.message),
              });
          } else {
            this.filesModalError.set(res?.message || 'Failed to change job status.');
            this.finishStatusChangeAndPersist(jobKey, null);
          }
        },
        error: (err) => {
          this.filesModalError.set(err?.message || 'Failed to change job status.');
          this.finishStatusChangeAndPersist(jobKey, null);
        },
      });
  }

  private finishStatusChangeAndPersist(jobKey: string, statusMessage: string | null | undefined): void {
    this.statusChangeModalOpen.set(false);
    this.statusChangeSaving.set(false);
    this.performPendingFileUpload(() => {
      if (statusMessage) {
        this.filesModalMessage.update((current) => (current ? `${current} ${statusMessage}` : statusMessage));
      }
      this.loadJobDetails(jobKey);
    });
  }

  /**
   * Opens the "Vendor Estimates" / Send Estimate to Vendor modal (RBR-483) and loads the
   * job's assigned vendors + contacts. Defaults the selected vendor to the default (or first)
   * and pre-checks each vendor's default contacts, matching legacy GetDefaultVendorContactList.
   */
  private openSendEstimateModal(jobKey: string): void {
    this.sendEstimateModalOpen.set(true);
    this.sendEstimateLoading.set(true);
    this.sendEstimateVendors.set([]);
    this.sendEstimateSelectedVendorKey.set('');
    this.sendEstimateSelectedContacts.set(new Set());
    this.sendEstimateError.set(null);
    this.sendEstimateMessage.set(null);
    this.sendEstimateSending.set(false);
    this.sendEstimateSent.set(false);
    this.sendEstimateStatusResolved.set(false);

    this.assignVendorSvc
      .getVendorContactsForEstimate(jobKey)
      .pipe(takeUntil(this.destroy$), finalize(() => this.sendEstimateLoading.set(false)))
      .subscribe({
        next: (res) => {
          const data = res?.data;
          if (!res?.status || !data?.hasVendors) {
            this.sendEstimateVendors.set([]);
            return;
          }
          this.sendEstimateVendors.set(data.vendors);

          const defaultVendor = data.vendors.find((v) => v.isDefault) ?? data.vendors[0];
          if (defaultVendor) {
            this.sendEstimateSelectedVendorKey.set(defaultVendor.jobVendorKey);
            const preChecked = new Set(
              defaultVendor.contacts.filter((c) => c.isDefault).map((c) => c.contactKey),
            );
            this.sendEstimateSelectedContacts.set(preChecked);
          }
        },
        error: () => this.sendEstimateVendors.set([]),
      });
  }

  /** Radio change — select an assigned vendor and pre-check its default contacts. */
  onSelectSendEstimateVendor(vendor: VendorForEstimate): void {
    this.sendEstimateSelectedVendorKey.set(vendor.jobVendorKey);
    const preChecked = new Set(
      vendor.contacts.filter((c) => c.isDefault).map((c) => c.contactKey),
    );
    this.sendEstimateSelectedContacts.set(preChecked);
  }

  /** Checkbox toggle for a single vendor contact. */
  onToggleSendEstimateContact(contactKey: string): void {
    this.sendEstimateSelectedContacts.update((set) => {
      const next = new Set(set);
      if (next.has(contactKey)) {
        next.delete(contactKey);
      } else {
        next.add(contactKey);
      }
      return next;
    });
  }

  /**
   * Closes the Send Estimate to Vendor modal.
   *
   * RBR-486 — if neither Green nor Orange resolved the flow (a plain Close / X / backdrop after
   * the YES path opened this modal), the vendor moves to "Vendor Estimate Received" (9), scoped
   * to the selected vendor (JobVendor always, Job only if Default). When Green/Orange already
   * moved it to "Need Vendor Estimate" (8), `sendEstimateStatusResolved` is set and this skips
   * the 9-change so it can't overwrite the 8 the button just applied.
   */
  onCloseSendEstimateModal(): void {
    const selectedVendorKey = this.sendEstimateSelectedVendorKey();
    if (!this.sendEstimateStatusResolved() && selectedVendorKey) {
      this.fireChangeVendorStatus(
        selectedVendorKey,
        JobDetailsAccordionComponent.VENDOR_ESTIMATE_RECEIVED_TRIGGER_BIT,
      );
    }

    this.sendEstimateModalOpen.set(false);
    this.sendEstimateVendors.set([]);
    this.sendEstimateSelectedContacts.set(new Set());
    this.sendEstimateSelectedVendorKey.set('');
    this.sendEstimateError.set(null);
    this.sendEstimateMessage.set(null);
    this.sendEstimateSending.set(false);
    this.sendEstimateSent.set(false);
    this.sendEstimateStatusResolved.set(false);
  }

  /**
   * RBR-486: moves a single vendor to the given status by TriggerBit, scoped on the backend to
   * that JobVendor row (Job.JobStatusKey moves too only if it's the Default vendor). Used by the
   * Send Estimate to Vendor modal's three outcomes — Green/Orange pass "Need Vendor Estimate" (8),
   * a plain Close passes "Vendor Estimate Received" (9). Non-blocking: a failure here shouldn't
   * stop the button's primary action (opening the portal / sending the email), so errors are
   * logged rather than surfaced as a modal error.
   */
  private fireChangeVendorStatus(jobVendorKey: string, triggerBit: number): void {
    const jobKey = this.jobKey();
    this.assignVendorSvc
      .changeVendorStatusByTriggerBit(jobVendorKey, triggerBit)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (!res?.status) {
            console.error('changeVendorStatusByTriggerBit failed:', res?.message);
            return;
          }
          if (jobKey) this.loadJobDetails(jobKey);
        },
        error: (err) => console.error('changeVendorStatusByTriggerBit failed:', err),
      });
  }

  /**
   * Resolves the (vendor, contact) pair for the first checked contact, in vendor→contact
   * display order. Mirrors legacy's `$(this).closest('div').attr('name')` resolution: each
   * vendor's contact checkboxes live inside a block named for that vendor's JobVendor.PKey, so
   * the checked contact's *owning* vendor is "the vendor" for this action — not whatever the
   * separate vendor radio currently points to. The radio only matters when no contact is
   * checked at all (the custom-email path — see {@link onSendEstimateEmail}).
   */
  private firstCheckedContact(): { vendorKey: string; contactKey: string } | null {
    const selected = this.sendEstimateSelectedContacts();
    for (const vendor of this.sendEstimateVendors()) {
      for (const contact of vendor.contacts) {
        if (selected.has(contact.contactKey)) {
          return { vendorKey: vendor.jobVendorKey, contactKey: contact.contactKey };
        }
      }
    }
    return null;
  }

  /**
   * GREEN — "Create estimate on behalf of the vendors": opens the vendor portal via SSO
   * (logged in as the admin, landing directly on the create-estimate form for the selected
   * contact). Mirrors legacy #CreateEstimate: requires a selected contact, then opens
   * `{vendorLoginWithTaskOptionsUrl}{jobKey}&ContactKey={contactKey}&Option=1&adminKey={adminKey}`.
   * RBR-486: the vendor moved to "Need Vendor Estimate" is the checked contact's *owning*
   * vendor (legacy never consults the vendor radio here at all).
   */
  onCreateEstimateOnBehalf(): void {
    const jobKey = this.jobKey();
    if (!jobKey) return;

    this.sendEstimateError.set(null);
    this.sendEstimateMessage.set(null);

    const checked = this.firstCheckedContact();
    if (!checked) {
      this.sendEstimateError.set(
        'Please select a contact — it is required for the portal login to open the create-estimate form.',
      );
      return;
    }

    this.sendEstimateStatusResolved.set(true);
    this.fireChangeVendorStatus(
      checked.vendorKey,
      JobDetailsAccordionComponent.NEED_VENDOR_ESTIMATE_TRIGGER_BIT,
    );

    const adminKey = this.authTokenSvc.getAdminKeyFromToken() || '';
    const url =
      `${environment.vendorLoginWithTaskOptionsUrl}${jobKey}` +
      `&ContactKey=${checked.contactKey}&Option=1&adminKey=${adminKey}`;
    window.open(url, '_blank', 'noopener');
    this.onCloseSendEstimateModal();
  }

  /**
   * ORANGE — "Send email to vendor": emails the selected contacts (or a custom email) the
   * "Need Vendor Estimate" request with the create-estimate link. Reuses the Assign Vendor tab's
   * vendor-action email engine (POST vendor-status-action/send-mail, emailType 5 =
   * legacy SendVendorMails). Mirrors legacy #SendEstimate exactly: when a contact is checked,
   * the target vendor is that contact's *owning* vendor (not the radio); the vendor radio is
   * only required as a fallback when sending to a custom email address with no contact checked.
   * RBR-486: same resolved vendor is moved to "Need Vendor Estimate".
   */
  onSendEstimateEmail(): void {
    this.sendEstimateError.set(null);
    this.sendEstimateMessage.set(null);

    const contactKeys = Array.from(this.sendEstimateSelectedContacts());
    const customEmail = this.sendEstimateCustomEmail().trim();

    let jobVendorKey: string;
    if (contactKeys.length > 0) {
      // A contact is checked — legacy resolves the vendor from that contact's own block,
      // ignoring the radio entirely.
      jobVendorKey = this.firstCheckedContact()!.vendorKey;
    } else if (customEmail) {
      // No contact checked — legacy falls back to the vendor radio for the custom-email path.
      jobVendorKey = this.sendEstimateSelectedVendorKey();
      if (!jobVendorKey) {
        this.sendEstimateError.set(
          'Please select a vendor for the customer email address that you have entered.',
        );
        return;
      }
    } else {
      this.sendEstimateError.set('Please select a contact.');
      return;
    }

    const req: SendVendorActionMailRequest = {
      jobVendorKey,
      emailType: 5,
      emailNote: this.sendEstimateEmailNote(),
      vendorContactKeys: contactKeys.length > 0 ? contactKeys : [],
      customEmail: contactKeys.length > 0 ? '' : customEmail,
      estimateKey: null,
    };

    this.sendEstimateStatusResolved.set(true);
    this.fireChangeVendorStatus(
      jobVendorKey,
      JobDetailsAccordionComponent.NEED_VENDOR_ESTIMATE_TRIGGER_BIT,
    );

    this.sendEstimateSending.set(true);
    this.assignVendorSvc
      .sendVendorActionMail(req)
      .pipe(takeUntil(this.destroy$), finalize(() => this.sendEstimateSending.set(false)))
      .subscribe({
        next: (res) => {
          if (res?.status) {
            this.sendEstimateMessage.set(res.message || 'Estimate request sent to the vendor.');
            this.sendEstimateSent.set(true);
          } else {
            this.sendEstimateError.set(res?.message || 'Failed to send the estimate request.');
          }
        },
        error: (err) => this.sendEstimateError.set(err?.message || 'Failed to send the estimate request.'),
      });
  }

  private checkCustomerEstimatesForApproval(): void {
    const jobKey = this.jobKey();
    if (!jobKey) {
      this.performPendingFileUpload();
      return;
    }
    this.assignVendorSvc
      .getCustomerEstimatesForApproval(jobKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          const data = res?.data;
          if (res?.status && data?.hasUnapprovedEstimate && data.estimates.length > 0) {
            this.approveEstimateList.set(data.estimates);
            this.approveEstimateCustomerDne.set(data.customerDne ?? 0);
            this.approveEstimateModalOpen.set(true);
          } else {
            // Legacy fallback: no unapproved estimate present → offer the plain
            // "Change Job status to Customer Approval?" prompt instead.
            this.openCustomerApprovalStatusModal();
          }
        },
        // Can't determine estimate state — don't block the file save on it.
        error: () => this.performPendingFileUpload(),
      });
  }

  /** Dismissing this modal (either way) resolves the prompt — persist the file now. */
  onCloseApproveEstimateModal(): void {
    this.approveEstimateModalOpen.set(false);
    this.approveEstimateList.set([]);
    this.performPendingFileUpload();
  }

  /**
   * Approve a customer estimate on behalf of the customer. The full legacy engine
   * (CheckIfVendorWillBeApproved → SaveAcceptedEstimate, with vendor auto-approval and
   * emails) is not yet ported to RFIJobOps, so this still routes to the proven legacy
   * approval endpoint — but as a background request instead of `window.open(url, '_blank')`.
   * `fetch(..., { mode: 'no-cors' })` sends the legacy admin session cookie along with the
   * GET (same as a normal browser navigation would) without requiring the legacy app to add
   * CORS headers, and without leaving the admin on a new tab. Because the response is opaque
   * we can't read a status back — resolving the fetch just means the legacy save finished
   * running — so on completion we close this modal and refresh every grid the legacy action
   * could have touched (job files, vendor papers, location files).
   */
  onApproveEstimateOnBehalf(estimate: CustomerEstimateForApproval): void {
    const jobKey = this.jobKey();
    const url =
      `${environment.legacyAdminBaseUrl}/MgtJobSalesOrder/SaveAcceptedEstimate` +
      `?JobKey=${jobKey}&EstimateKey=${estimate.mutiEstiIdentifier ?? ''}&SelectedKey=${estimate.invoiceKey}`;

    this.approveEstimateSaving.set(true);
    this.filesModalError.set(null);

    fetch(url, { method: 'GET', mode: 'no-cors', credentials: 'include' })
      .then(() => {
        this.approveEstimateSaving.set(false);
        this.onCloseApproveEstimateModal();
        // Refresh every grid in the Files & Attachments modal — the legacy save can add a
        // customer-approval file/note and change job/vendor status.
        this.loadFilesList();
        this.loadVendorPapers();
        this.loadLocationFiles();
      })
      .catch(() => {
        this.approveEstimateSaving.set(false);
        this.filesModalError.set(
          'Failed to approve the estimate on behalf of the customer. Please try again.',
        );
      });
  }

  private loadFilesList(): void {
    const jobKey = this.jobKey();
    if (!jobKey) return;
    this.filesListLoading.set(true);
    this.assignVendorSvc
      .getJobFilesForBroadcast(jobKey)
      .pipe(takeUntil(this.destroy$), finalize(() => this.filesListLoading.set(false)))
      .subscribe({
        next: (res) => {
          if (res.status && Array.isArray(res.data)) {
            this.filesList.set(res.data);
          } else {
            this.filesModalError.set(res.message || 'Failed to load files.');
          }
        },
        error: () => this.filesModalError.set('Failed to load files.'),
      });
  }

  onViewJobFile(file: BroadcastJobFileDto): void {
    if (file.fileUrl) {
      window.open(file.fileUrl, '_blank', 'noopener');
    } else {
      this.filesModalError.set('This file has no viewable URL yet.');
    }
  }

  onDeleteJobFile(file: BroadcastJobFileDto): void {
    if (!file.fileKey) return;
    this.deleteConfirmFile.set(file);
    this.deleteConfirmModalOpen.set(true);
  }

  onCancelDeleteConfirm(): void {
    this.deleteConfirmModalOpen.set(false);
    this.deleteConfirmFile.set(null);
  }

  onConfirmDelete(): void {
    const file = this.deleteConfirmFile();
    if (!file?.fileKey) return;

    this.deleteConfirmModalOpen.set(false);
    this.filesDeletingKey.set(file.fileKey);
    this.filesModalError.set(null);
    this.filesModalMessage.set(null);

    this.assignVendorSvc
      .adminDeleteJobFile(file.fileKey)
      .pipe(takeUntil(this.destroy$), finalize(() => this.filesDeletingKey.set(null)))
      .subscribe({
        next: (res) => {
          if (res?.status) {
            this.filesList.update((list) => list.filter((f) => f.fileKey !== file.fileKey));
            this.deleteConfirmFile.set(null);
            this.deleteSuccessModalOpen.set(true);
          } else {
            this.deleteConfirmFile.set(null);
            this.filesModalError.set(res?.message || 'Delete failed.');
          }
        },
        error: () => {
          this.deleteConfirmFile.set(null);
          this.filesModalError.set('Delete failed. Please try again.');
        },
      });
  }

  onCloseDeleteSuccess(): void {
    this.deleteSuccessModalOpen.set(false);
  }

  onDuplicateJob(): void {
    const customerKey = this.pageContext()?.customerKey;
    if (!customerKey) return;
    this.duplicateModalOpen.set(true);
    this.duplicateMessage.set(null);
    this.duplicateError.set(null);
    this.duplicateSelectedLoc.set(null);
    this.duplicateJobResult.set(null);
    this.duplicateSearchQuery.set('');
    this.duplicateLocLoading.set(true);
    this.assignVendorSvc
      .getCustomerLocations(customerKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        this.duplicateLocLoading.set(false);
        if (res.status && Array.isArray(res.data)) {
          this.duplicateLocations.set(res.data);
        } else {
          this.duplicateError.set(res.message || 'Failed to load locations.');
        }
      });
  }

  onCloseDuplicateModal(): void {
    this.duplicateModalOpen.set(false);
    this.duplicateSearchQuery.set('');
  }

  onConfirmDuplicate(): void {
    const jobKey = this.jobKey()?.trim();
    const locationKey = this.duplicateSelectedLoc();
    if (!jobKey || !locationKey) return;
    this.duplicateSaving.set(true);
    this.duplicateMessage.set(null);
    this.duplicateError.set(null);
    const req: DuplicateJobRequest = { jobKey, locationKey };
    this.assignVendorSvc
      .duplicateJob(req)
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        this.duplicateSaving.set(false);
        if (res.status && res.data) {
          this.duplicateJobResult.set(res.data);
          this.duplicateMessage.set(res.data.message ?? 'Job duplicated successfully.');
        } else {
          this.duplicateError.set(res.message || 'Duplication failed.');
        }
      });
  }

  navigateToDuplicatedJob(): void {
    const result = this.duplicateJobResult();
    if (result?.newJobKey) {
      window.open(`/job/${result.newJobKey}/assign-vendor`, '_blank');
    }
  }

  onOpenNotesForCustomerEmail(email: string): void {
    this.onNavigateToNotesActivity({ tab: 'customer', email });
  }

  onOpenNotesForLocationEmail(email: string): void {
    this.onNavigateToNotesActivity({ tab: 'all', email });
  }

  normalizeSelectKey(value: string | null | undefined): string {
    return (value ?? '').trim().toLowerCase();
  }

  /**
   * The vendor whose status drives the header status pill/dropdown — always the default
   * vendor (JobVendor.IsDefault=1), whose status is what's kept in sync with Job.JobStatusKey.
   * Falls back to the first assigned vendor only if none is marked default, which shouldn't
   * normally happen. Previously this used assignedVendors[0] unconditionally, which showed
   * (and edited) whichever vendor happened to be first in the list, not necessarily the
   * default one.
   */
  defaultStatusVendor(hd: JobHeaderDetail): AssignedVendorDetail {
    return hd.assignedVendors.find((v) => v.isDefault) ?? hd.assignedVendors[0];
  }

  getVendorJobStatusLabel(vendor: AssignedVendorDetail): string {
    const key = vendor.jobStatusKey?.trim();
    if (key) {
      const match = this.jobStatusList().find(
        (o) => this.normalizeSelectKey(o.value) === this.normalizeSelectKey(key),
      );
      if (match?.text?.trim()) return match.text.trim();
    }
    return (vendor.jobStatusName ?? '').trim();
  }

  vendorJobStatusOptions(vendor: AssignedVendorDetail): JobStatusOption[] {
    const opts = this.jobStatusList();
    const key = vendor.jobStatusKey?.trim();
    const label = this.getVendorJobStatusLabel(vendor);
    if (!key || !label) return opts;

    const normalizedKey = this.normalizeSelectKey(key);
    if (opts.some((o) => this.normalizeSelectKey(o.value) === normalizedKey)) {
      return opts;
    }

    return [{ value: normalizedKey, text: label }, ...opts];
  }

  vendorJobStatusSelectKey(vendor: AssignedVendorDetail): string {
    return this.normalizeSelectKey(vendor.jobStatusKey);
  }

  /** Header status pill color key, matched by keyword since JobStatusOption carries no color of its own. */
  jobStatusColorKey(text: string | null | undefined): string {
    const t = (text ?? '').toLowerCase();
    if (t.includes('cancel')) return 'cancelled';
    if (t.includes('complet')) return 'completed';
    if (t.includes('hold')) return 'onhold';
    if (t.includes('progress')) return 'inprogress';
    if (t.includes('schedul')) return 'scheduled';
    if (t.includes('new')) return 'newjob';
    if (t.includes('pending')) return 'pending';
    if (t.includes('eta') || t.includes('check')) return 'pending';
    return 'default';
  }

  toggleStatusDropdown(): void {
    this.statusDropdownOpen.update((open) => !open);
  }

  closeStatusDropdown(): void {
    this.statusDropdownOpen.set(false);
  }

  @HostListener('document:click')
  onDocumentClickCloseStatusDropdown(): void {
    if (this.statusDropdownOpen()) this.closeStatusDropdown();
  }

  pickVendorJobStatus(vendor: AssignedVendorDetail, opt: JobStatusOption): void {
    this.closeStatusDropdown();
    this.onVendorStatusChange(vendor, this.normalizeSelectKey(opt.value));
  }

  /** Pending recall interception state — set when a status change on a job in Accounting is deferred until the recall modal is confirmed. */
  private pendingRecallVendor: AssignedVendorDetail | null = null;
  private pendingRecallTargetStatusKey: string | null = null;

  onVendorStatusChange(vendor: AssignedVendorDetail, newStatusKey: string): void {
    if (!newStatusKey) return;
    const jobKey = this.jobKey()?.trim();
    if (!jobKey) return;

    // Parity with legacy StatusChangeFunction in EditJob.cshtml: if the job is
    // currently in the Move-to-Accounting status (TriggerBit=66), any status
    // change first opens a Recall vs Additional Approval prompt. Recall runs
    // through the vendor-fault form and forces status = Pending Return ETA;
    // Additional Approval proceeds with the admin's original status pick and
    // leaves JobType untouched.
    if (
      vendor.triggerBit === JobDetailsAccordionComponent.MOVE_TO_ACCOUNTING_TRIGGER_BIT &&
      this.normalizeSelectKey(newStatusKey) !== this.normalizeSelectKey(vendor.jobStatusKey ?? '')
    ) {
      this.pendingRecallVendor = vendor;
      this.pendingRecallTargetStatusKey = newStatusKey;
      // Optimistically show the chosen status while the modal is open.
      // patchLocalAssignedVendor uses spread, so pendingRecallVendor still holds
      // the old object — applyVendorStatusChange captures the correct prev key
      // ("Move to Accounting") for API-failure revert after the user confirms.
      const matchedOpt = this.jobStatusList().find(
        (o) => this.normalizeSelectKey(o.value) === this.normalizeSelectKey(newStatusKey),
      );
      this.patchLocalAssignedVendor(vendor.jobVendorKey, {
        jobStatusKey: newStatusKey,
        jobStatusName: matchedOpt?.text?.trim() ?? vendor.jobStatusName ?? undefined,
        statusActions: [],
      });
      const assignedVendors = this.jobHeaderDetail()?.assignedVendors ?? [];
      this.recallReviewModal?.open(jobKey, assignedVendors);
      return;
    }

    this.applyVendorStatusChange(vendor, newStatusKey);
  }

  /** Applies an accepted status change to the API and refreshes the header detail. */
  private applyVendorStatusChange(vendor: AssignedVendorDetail, newStatusKey: string): void {
    const jobKey = this.jobKey()?.trim();
    if (!jobKey) return;

    const prevStatusKey = vendor.jobStatusKey;
    const prevStatusName = vendor.jobStatusName;
    const prevStatusActions = vendor.statusActions;
    const prevHeaderStatusName = this.jobHeaderDetail()?.jobStatusName ?? null;
    const matchedOption = this.jobStatusList().find(
      (o) => this.normalizeSelectKey(o.value) === this.normalizeSelectKey(newStatusKey),
    );
    const nextStatusName = matchedOption?.text?.trim() ?? vendor.jobStatusName;

    this.patchLocalAssignedVendor(vendor.jobVendorKey, {
      jobStatusKey: newStatusKey,
      jobStatusName: nextStatusName,
      statusActions: [],
    });

    this.assignVendorSvc
      .updateVendorJobStatus(vendor.jobVendorKey, newStatusKey)
      .pipe(
        switchMap((res) => {
          if (!res?.status) {
            this.patchLocalAssignedVendor(vendor.jobVendorKey, {
              jobStatusKey: prevStatusKey,
              jobStatusName: vendor.isDefault ? (prevHeaderStatusName ?? prevStatusName) : prevStatusName,
              statusActions: prevStatusActions,
            });
            return EMPTY;
          }
          return this.assignVendorSvc.loadJobHeaderDetail(jobKey);
        }),
        takeUntil(this.destroy$),
      )
      .subscribe((headerRes) => {
        if (headerRes?.status && headerRes.data) {
          this.jobHeaderDetail.set(headerRes.data);
          this.syncNteDisplay(headerRes.data);
          // Keep the Priority dropdown's own UI-key signal in sync — it isn't derived
          // from jobHeaderDetail directly (see applyJobPriorityOptions), so a status
          // change that also flips JobType (e.g. Recall) would otherwise leave the
          // dropdown showing the pre-change priority until a full page reload.
          this.applyJobPriorityOptions(
            this.jobPriorityOptions(),
            headerRes.data,
            this.pageContext(),
            !this.isJobPriorityEditInProgress(),
          );
        }
      });
  }

  /**
   * Called by the recall modal after the admin picks Recall or Additional Approval.
   * - Recall path: backend already flipped JobType to Recall + wrote audit rows; we
   *   land the status on Pending Return ETA regardless of the original dropdown pick.
   * - Additional Approval path: no backend recall call happened; we apply the
   *   admin's original target status as a plain status change.
   */
  onRecallReviewConfirmed(result: RecallReviewResult): void {
    const vendor = this.pendingRecallVendor;
    const originalTarget = this.pendingRecallTargetStatusKey;
    this.pendingRecallVendor = null;
    this.pendingRecallTargetStatusKey = null;
    if (!vendor) return;

    if (result.choice === 'recall') {
      this.applyVendorStatusChange(vendor, JobDetailsAccordionComponent.PENDING_RETURN_ETA_STATUS_KEY);
    } else if (originalTarget) {
      this.applyVendorStatusChange(vendor, originalTarget);
    }
  }

  /** Called when the admin dismisses the recall modal — no status change is performed. */
  onRecallReviewCancelled(): void {
    this.pendingRecallVendor = null;
    this.pendingRecallTargetStatusKey = null;
  }

  /**
   * Standalone "Recall" button in the Job Details top action bar (beside Broadcast to
   * Vendors). Only enabled per `canRecall()`. Opens the recall modal directly on the
   * Vendor's Fault / Not Vendor's Fault form (no Additional-Approval pre-step) and, on
   * confirm, moves the job's default vendor to Pending Return ETA — same status flow as
   * the existing status-dropdown-triggered recall.
   */
  onRecallClick(): void {
    if (!this.canRecall()) return;
    const jobKey = this.jobKey()?.trim();
    if (!jobKey) return;

    const assignedVendors = this.jobHeaderDetail()?.assignedVendors ?? [];
    const defaultVendor = assignedVendors.find((v) => v.isDefault && !v.isDelete);
    if (!defaultVendor) {
      this.errorMessage.set('This job has no active default vendor to recall.');
      return;
    }

    this.pendingRecallVendor = defaultVendor;
    this.pendingRecallTargetStatusKey = JobDetailsAccordionComponent.PENDING_RETURN_ETA_STATUS_KEY;
    this.recallReviewModal?.open(jobKey, assignedVendors, { skipChoice: true });
  }

  onTradeChange(newTradeKey: string): void {
    const jobKey = this.jobKey()?.trim();
    if (!jobKey) return;

    const tradeKey = newTradeKey || null;
    const previousTradeKey = this.pageContext()?.tradeKey ?? null;

    // A trade, once set, can never be cleared back to none — block locally (the dropdown
    // itself already can't offer a blank option once a trade is set, but guard defensively)
    // and let the backend's own check catch anything this misses.
    if (!tradeKey && previousTradeKey) {
      this.errorMessage.set('Trade cannot be cleared once set.');
      setTimeout(() => this.errorMessage.set(''), 6000);
      return;
    }

    const tradeName = tradeKey
      ? (this.tradeDropdown().find((o) => o.value === tradeKey)?.text ?? null)
      : null;

    this.pageContext.update((pc) => (pc ? { ...pc, tradeKey, tradeName } : pc));

    this.tradeSaving.set(true);
    if (tradeKey) {
      this.tradeChangeStarted.emit();
    }
    this.assignVendorSvc
      .updateJobTrade(jobKey, tradeKey)
      .pipe(takeUntil(this.destroy$), finalize(() => this.tradeSaving.set(false)))
      .subscribe({
        next: (res) => {
          if (!res.status) {
            this.errorMessage.set(res.message || 'Unable to update trade.');
            setTimeout(() => this.errorMessage.set(''), 6000);
            if (tradeKey) this.tradeChangeFailed.emit();
            this.loadJobDetails(jobKey);
            return;
          }
          if (tradeKey) {
            this.tradeChangeSucceeded.emit({ tradeName });
          }
        },
        error: () => {
          if (tradeKey) this.tradeChangeFailed.emit();
          this.loadJobDetails(jobKey);
        },
      });
  }

  onCustomerRequestorChange(newContactKey: string): void {
    const jobKey = this.jobKey()?.trim();
    if (!jobKey) return;

    const contactKey = newContactKey || null;
    const displayName = contactKey
      ? (this.customerRequestorOptions().find(
          (o) => this.normalizeSelectKey(o.value) === this.normalizeSelectKey(contactKey),
        )?.text ?? null)
      : null;

    this.jobHeaderDetail.update((hd) =>
      hd ? { ...hd, customerRequestorKey: contactKey, customerRequestorName: displayName } : hd,
    );

    this.customerRequestorSaving.set(true);
    this.assignVendorSvc
      .updateJobCustomerRequestor(jobKey, contactKey)
      .pipe(takeUntil(this.destroy$), finalize(() => this.customerRequestorSaving.set(false)))
      .subscribe({
        next: (res) => {
          if (!res.status) {
            this.loadJobDetails(jobKey);
          }
        },
        error: () => this.loadJobDetails(jobKey),
      });
  }

  isJobPriorityOptionDisabled(option: JobPriorityOption): boolean {
    return this.isRecallJobPriority(option.value);
  }

  /**
   * Plain-language confirmation lines shown in the priority-change modal. Priority change
   * only flips JobTypeKey and logs a note — it no longer touches DNE, response time, or
   * JobStatus — so this is just the backend's own bullet points (typically one line:
   * "You are changing this job's priority from X to Y.").
   */
  priorityChangeMessageLines(): string[] {
    return this.jobPriorityPreview()?.bulletPoints ?? [];
  }

  onJobPriorityChange(newJobTypeKey: string): void {
    const jobKey = this.jobKey()?.trim();
    const oldKey = this.originalJobTypeKey();
    const newKey = this.normalizeSelectKey(newJobTypeKey);

    this.jobPriorityUiKey.set(newKey);

    if (!jobKey || !newKey || newKey === oldKey) {
      return;
    }

    if (this.isRecallJobPriority(newKey)) {
      this.blockJobPriorityChange(oldKey, 'Job priority cannot be changed to Recall from Edit Job.');
      return;
    }

    const customerKey = this.pageContext()?.customerKey ?? null;
    this.assignVendorSvc
      .getJobPriorityChangePreview(jobKey, oldKey, newKey, customerKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe((preview) => {
        if (!preview?.success) {
          this.blockJobPriorityChange(oldKey, preview?.message || 'Unable to load priority change details.');
          return;
        }

        const pendingKey = this.normalizeSelectKey(preview.newJobTypeKey ?? newKey);
        this.jobPriorityPendingKey.set(pendingKey);
        this.jobPriorityUiKey.set(pendingKey);
        this.jobPriorityPreview.set(preview);
        this.jobPriorityChangeStatus.set(null);
        this.jobPriorityChangeModalOpen.set(true);
      });
  }

  onCancelJobPriorityChange(): void {
    this.jobPriorityUiKey.set(this.originalJobTypeKey());
    this.jobPriorityPendingKey.set(null);
    this.jobPriorityPreview.set(null);
    this.jobPriorityChangeStatus.set(null);
    this.jobPriorityChangeModalOpen.set(false);
  }

  onConfirmJobPriorityChange(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();

    const jobKey = this.jobKey()?.trim();
    const oldKey = this.originalJobTypeKey();
    const newKey = this.normalizeSelectKey(
      this.jobPriorityPendingKey()
        ?? this.jobPriorityPreview()?.newJobTypeKey
        ?? this.jobPriorityUiKey(),
    );

    if (!jobKey) {
      this.jobPriorityChangeStatus.set('Job key is missing. Please reload the page.');
      return;
    }

    if (!newKey) {
      this.jobPriorityChangeStatus.set('Please select a job priority before saving.');
      return;
    }

    if (newKey === oldKey) {
      this.jobPriorityChangeStatus.set('Priority has not changed.');
      return;
    }

    if (this.isRecallJobPriority(newKey)) {
      this.blockJobPriorityChange(oldKey, 'Job priority cannot be changed to Recall from Edit Job.');
      this.onCancelJobPriorityChange();
      return;
    }

    this.jobPrioritySaving.set(true);
    this.jobPriorityChangeStatus.set('Saving priority change...');

    this.assignVendorSvc
      .updateJobJobType(jobKey, newKey)
      .pipe(takeUntil(this.destroy$), finalize(() => this.jobPrioritySaving.set(false)))
      .subscribe({
        next: (res) => {
          const ok = res.status === true || res.data?.flag === 1;
          if (!ok) {
            this.jobPriorityChangeStatus.set(res.message || 'Unable to update job priority.');
            this.jobPriorityUiKey.set(oldKey);
            return;
          }

          const savedKey = this.normalizeSelectKey(newKey);
          const previewSnapshot = this.jobPriorityPreview();

          this.jobPriorityChangeModalOpen.set(false);
          this.jobPriorityPreview.set(null);
          this.jobPriorityPendingKey.set(null);
          this.jobPriorityChangeStatus.set(null);

          if (previewSnapshot) {
            // Priority change only flips JobTypeKey — DNE/status are untouched, so only the
            // priority name/key are patched locally here.
            this.jobHeaderDetail.update((hd) =>
              hd
                ? {
                    ...hd,
                    jobTypeKey: savedKey,
                    jobTypeName: previewSnapshot.newPriorityName ?? hd.jobTypeName,
                  }
                : hd,
            );
            this.pageContext.update((pc) => (pc ? { ...pc, jobTypeKey: savedKey } : pc));
            this.commitOriginalJobPriorityKey(savedKey);
          }

          this.loadJobDetails(jobKey);
        },
        error: () => {
          this.jobPriorityChangeStatus.set('Error updating job priority.');
          this.jobPriorityUiKey.set(oldKey);
        },
      });
  }

  sriFieldValue(field: (typeof JobDetailsAccordionComponent.SRI_FIELDS)[number]): string {
    const edits = this.sriFieldEdits();
    if (edits[field] !== undefined) return edits[field]!;
    const hd = this.jobHeaderDetail();
    return hd ? this.sriPlainFromHeader(hd, field) : '';
  }

  onSriFieldInput(
    field: (typeof JobDetailsAccordionComponent.SRI_FIELDS)[number],
    value: string,
  ): void {
    this.sriFieldEdits.update((edits) => ({ ...edits, [field]: value }));
  }

  onSriFieldBlur(field: (typeof JobDetailsAccordionComponent.SRI_FIELDS)[number]): void {
    this.persistSriEdits(field);
  }

  /**
   * Collapsed rows show "click to add" instead of a full textarea. A row collapses when the
   * user explicitly collapses it, or when it has no data and hasn't been manually expanded.
   */
  sriFieldCollapsed(field: (typeof JobDetailsAccordionComponent.SRI_FIELDS)[number]): boolean {
    if (this.sriManuallyCollapsed().has(field)) return true;
    return !this.sriFieldValue(field) && !this.sriManuallyExpanded().has(field);
  }

  onSriFieldExpand(field: (typeof JobDetailsAccordionComponent.SRI_FIELDS)[number]): void {
    this.sriManuallyExpanded.update((set) => new Set(set).add(field));
    this.sriManuallyCollapsed.update((set) => {
      const next = new Set(set);
      next.delete(field);
      return next;
    });
  }

  onSriFieldCollapse(field: (typeof JobDetailsAccordionComponent.SRI_FIELDS)[number]): void {
    this.sriManuallyCollapsed.update((set) => new Set(set).add(field));
    this.sriManuallyExpanded.update((set) => {
      const next = new Set(set);
      next.delete(field);
      return next;
    });
  }

  vendorDneNumber(value: number | string | null | undefined): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const parsed = Number(String(value).trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }

  isValidPhoneNumber(phone: string | null | undefined): boolean {
    if (!phone) return false;
    const digitsOnly = phone.replace(/\D/g, '');
    if (digitsOnly.length < 10) return false;
    if (/^(\d)\1+$/.test(digitsOnly)) return false;
    return true;
  }

  formatPhoneDisplay(raw: string | null | undefined): string {
    if (!raw) return '';
    const s = String(raw).replace(/^tel:/i, '').replace(/\D/g, '');
    if (s.length === 11 && s.startsWith('1')) {
      const d = s.slice(1);
      return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
    }
    if (s.length === 10) return `(${s.slice(0, 3)}) ${s.slice(3, 6)}-${s.slice(6)}`;
    return String(raw).replace(/^tel:/i, '');
  }

  formatPhoneWithExt(phone: string | null | undefined, ext: string | null | undefined): string {
    const display = this.formatPhoneDisplay(phone);
    if (!display) return '';
    return ext ? `${display} x${ext}` : display;
  }

  getLocationHref(
    address: string | null,
    city: string | null,
    state: string | null,
    zip: string | null,
    locationName: string | null = null,
  ): string {
    const parts = [address, city, state, zip].filter(Boolean);
    const query = parts.length > 0 ? parts.join(', ') : (locationName ?? '').trim();
    const q = encodeURIComponent(query);
    return `https://maps.google.com/?q=${q}`;
  }

  private readonly mapUrlCache = new Map<string, SafeResourceUrl>();

  getLocationMapUrl(
    address: string | null,
    city: string | null,
    state: string | null,
    zip: string | null,
  ): SafeResourceUrl {
    const key = [address, city, state, zip].filter(Boolean).join(', ');
    let cached = this.mapUrlCache.get(key);
    if (!cached) {
      const q = encodeURIComponent(key);
      const url = `https://maps.google.com/maps?q=${q}&output=embed&z=14`;
      cached = this.sanitizer.bypassSecurityTrustResourceUrl(url);
      this.mapUrlCache.set(key, cached);
    }
    return cached;
  }

  legacyCustomerEditUrl(customerKey: string | null | undefined): string {
    if (!customerKey) return '';
    return `${environment.legacyAdminBaseUrl}/MgtCustomer/EditCustomer/${customerKey}`;
  }

  legacyLocationEditUrl(locationKey: string | null | undefined): string {
    if (!locationKey) return '';
    return `${environment.legacyAdminBaseUrl}/MgtLocation/EditLocation/${locationKey}`;
  }

  getTimezoneForState(stateName: string | null | undefined): string {
    if (!stateName) return '';

    const state = stateName.trim().toLowerCase();

    const easternStates = [
      'connecticut', 'delaware', 'florida', 'georgia', 'maine', 'maryland',
      'massachusetts', 'michigan', 'new hampshire', 'new jersey', 'new york',
      'north carolina', 'ohio', 'pennsylvania', 'rhode island', 'south carolina',
      'vermont', 'virginia', 'west virginia', 'washington dc', 'district of columbia',
    ];
    const centralStates = [
      'alabama', 'arkansas', 'illinois', 'iowa', 'kansas', 'kentucky',
      'louisiana', 'minnesota', 'mississippi', 'missouri', 'nebraska',
      'north dakota', 'oklahoma', 'south dakota', 'tennessee', 'texas', 'wisconsin',
    ];
    const mountainStates = [
      'arizona', 'colorado', 'idaho', 'montana', 'new mexico', 'utah', 'wyoming',
    ];
    const pacificStates = ['california', 'nevada', 'oregon', 'washington'];
    const alaskaStates = ['alaska'];
    const hawaiiStates = ['hawaii'];

    if (easternStates.includes(state)) return 'Eastern Time (ET)';
    if (centralStates.includes(state)) return 'Central Time (CT)';
    if (mountainStates.includes(state)) return 'Mountain Time (MT)';
    if (pacificStates.includes(state)) return 'Pacific Time (PT)';
    if (alaskaStates.includes(state)) return 'Alaska Time (AKT)';
    if (hawaiiStates.includes(state)) return 'Hawaii Time (HST)';
    return '';
  }

  private loadJobDetails(jobKey: string): void {
    forkJoin([
      this.assignVendorSvc.loadAssignVendorPage(jobKey),
      this.assignVendorSvc.loadJobHeaderDetail(jobKey),
      this.assignVendorSvc.getTradeDropdown(),
      this.assignVendorSvc.getJobStatusList(),
      this.assignVendorSvc.getJobPriorityOptions(),
      this.assignVendorSvc.getCustomerRequestorOptions(jobKey),
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([pageRes, headerRes, trades, jobStatuses, jobPriorityOpts, customerRequestorOpts]) => {
        this.tradeDropdown.set(trades ?? []);
        this.jobStatusList.set(Array.isArray(jobStatuses) ? jobStatuses : []);

        // The trade list is global reference data and is never legitimately empty. An empty
        // result here means the SystemSetupData load failed (commonly a missing/invalid RFIApiKey
        // header → 401, which the service swallows to []). Surface it instead of silently showing
        // a blank dropdown. See context/HANDOFF-SystemSetupData-Auth-Change.md.
        if ((trades?.length ?? 0) === 0) {
          this.errorMessage.set(
            'Could not load reference data (trades). Check that the RFIApiKey header is configured for SystemSetupData endpoints.',
          );
        }

        if (pageRes?.status && pageRes.data) {
          this.pageContext.set(pageRes.data);
          const customerKey = pageRes.data.customerKey;
          if (customerKey) {
            this.assignVendorSvc
              .getCustomerProfileDne(customerKey)
              .pipe(takeUntil(this.destroy$))
              .subscribe((dne) => {
                this.customerProfileDne.set(dne);
                const hd = this.jobHeaderDetail();
                if (hd) this.syncNteDisplay(hd);
              });
          }
        }

        if (headerRes?.status && headerRes.data) {
          this.jobHeaderDetail.set(headerRes.data);
          this.syncNteDisplay(headerRes.data);
          this.applyJobPriorityOptions(
            jobPriorityOpts,
            headerRes.data,
            pageRes?.status ? pageRes.data ?? null : null,
            !this.isJobPriorityEditInProgress(),
          );
          this.applyCustomerRequestorOptions(
            customerRequestorOpts,
            headerRes.data,
            !this.customerRequestorSaving(),
          );
        }

        this.refreshJobPriorityVendorCheck(jobKey);

        if (this.pendingBroadcastFromQuery) {
          this.pendingBroadcastFromQuery = false;
          this.onBroadcastToVendors();
          void this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { broadcast: null },
            queryParamsHandling: 'merge',
            replaceUrl: true,
          });
        }
      });
  }

  private onNavigateToNotesActivity(options: {
    tab?: string;
    email?: string;
    vendorKey?: string;
  }): void {
    const jobKey = this.jobKey()?.trim();
    if (!jobKey) return;
    const queryParams: Record<string, string> = {};
    if (options.tab) queryParams['tab'] = options.tab;
    if (options.vendorKey?.trim()) queryParams['vendorKey'] = options.vendorKey.trim();
    if (options.email?.trim()) queryParams['email'] = options.email.trim();
    void this.router.navigate(['/job', jobKey, 'notes-activity'], { queryParams });
  }

  private patchLocalAssignedVendor(
    jobVendorKey: string,
    patch: Partial<AssignedVendorDetail>,
  ): void {
    this.jobHeaderDetail.update((current) => {
      if (!current) return current;
      const target = current.assignedVendors.find((v) => v.jobVendorKey === jobVendorKey);
      const syncHeader = target?.isDefault === true && patch.jobStatusName != null;
      return {
        ...current,
        jobStatusName: syncHeader ? patch.jobStatusName! : current.jobStatusName,
        assignedVendors: current.assignedVendors.map((v) =>
          v.jobVendorKey === jobVendorKey ? { ...v, ...patch } : v,
        ),
      };
    });
  }

  private blockJobPriorityChange(revertKey: string, message: string): void {
    this.jobPriorityUiKey.set(revertKey);
    this.jobPriorityChangeStatus.set(
      (message ?? '').trim() || 'Unable to load priority change details.',
    );
  }

  private isRecallJobPriority(jobTypeKey: string | null | undefined): boolean {
    return this.normalizeSelectKey(jobTypeKey ?? '') === JobDetailsAccordionComponent.RECALL_JOB_TYPE_KEY;
  }

  private isJobPriorityEditInProgress(): boolean {
    return this.jobPrioritySaving() || this.jobPriorityChangeModalOpen();
  }

  private refreshJobPriorityVendorCheck(jobKey: string): void {
    this.assignVendorSvc
      .getJobPriorityVendorCheck(jobKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe((check) => this.jobPriorityVendorCheck.set(check));
  }

  private resolveCustomerRequestorKey(
    hd: JobHeaderDetail,
    opts: CustomerRequestorOption[],
  ): string | null {
    const direct = hd.customerRequestorKey?.trim();
    if (direct) return this.normalizeSelectKey(direct);

    const name = hd.customerRequestorName?.trim();
    if (!name) return null;

    const byName = opts.find((o) => (o.text ?? '').trim().toLowerCase() === name.toLowerCase());
    return byName ? this.normalizeSelectKey(byName.value) : null;
  }

  private applyCustomerRequestorOptions(
    opts: CustomerRequestorOption[],
    hd: JobHeaderDetail | null,
    syncSelection = true,
  ): void {
    const merged = this.mergeCustomerRequestorOptions(opts, hd);
    this.customerRequestorOptions.set(merged);

    if (!hd || !syncSelection) return;

    const resolvedKey = this.resolveCustomerRequestorKey(hd, merged);
    if (resolvedKey && this.normalizeSelectKey(hd.customerRequestorKey) !== resolvedKey) {
      const displayName =
        merged.find((o) => o.value === resolvedKey)?.text ?? hd.customerRequestorName;
      this.jobHeaderDetail.update((current) =>
        current
          ? { ...current, customerRequestorKey: resolvedKey, customerRequestorName: displayName }
          : current,
      );
    }
  }

  private mergeCustomerRequestorOptions(
    opts: CustomerRequestorOption[],
    hd: JobHeaderDetail | null,
  ): CustomerRequestorOption[] {
    if (!hd) return opts;

    let contactKey = hd.customerRequestorKey?.trim() || null;
    let contactName = hd.customerRequestorName?.trim() || null;

    if (!contactKey && contactName) {
      const byName = opts.find(
        (o) => (o.text ?? '').trim().toLowerCase() === contactName!.toLowerCase(),
      );
      if (byName) contactKey = byName.value;
    }

    if (!contactKey) return opts;

    const normalizedKey = this.normalizeSelectKey(contactKey);
    const normalizedOpts = opts.map((o) => ({
      ...o,
      value: this.normalizeSelectKey(o.value),
    }));

    if (normalizedOpts.some((o) => o.value === normalizedKey)) {
      return normalizedOpts;
    }

    return [{ value: normalizedKey, text: contactName || 'Current contact' }, ...normalizedOpts];
  }

  private resolveJobPriorityKey(
    hd: JobHeaderDetail | null,
    opts: JobPriorityOption[],
  ): string | null {
    if (!hd) return null;
    if (hd.jobTypeKey?.trim()) {
      return this.normalizeSelectKey(hd.jobTypeKey);
    }
    const name = hd.jobTypeName?.trim();
    if (!name) return null;
    const byName = opts.find((o) => (o.text ?? '').trim().toLowerCase() === name.toLowerCase());
    return byName ? this.normalizeSelectKey(byName.value) : null;
  }

  private applyJobPriorityOptions(
    opts: JobPriorityOption[],
    hd: JobHeaderDetail | null,
    page: AssignVendorPage | null,
    syncUiKey = true,
  ): void {
    const merged = this.mergeJobPriorityOptions(opts, hd, page);
    this.jobPriorityOptions.set(merged);

    if (!hd || !syncUiKey) return;

    const resolvedKey = this.resolveJobPriorityKey(hd, merged)
      ?? (page?.jobTypeKey?.trim() ? this.normalizeSelectKey(page.jobTypeKey) : null);
    if (!resolvedKey) return;

    const displayName =
      merged.find((o) => this.normalizeSelectKey(o.value) === resolvedKey)?.text ?? hd.jobTypeName;

    this.jobHeaderDetail.update((current) =>
      current
        ? { ...current, jobTypeKey: resolvedKey, jobTypeName: displayName ?? current.jobTypeName }
        : current,
    );

    if (page?.jobTypeKey?.trim()) {
      this.commitOriginalJobPriorityKey(resolvedKey);
      return;
    }
    this.pageContext.update((pc) => (pc ? { ...pc, jobTypeKey: resolvedKey } : pc));
    this.commitOriginalJobPriorityKey(resolvedKey);
  }

  private commitOriginalJobPriorityKey(value: string | null | undefined): void {
    const key = this.normalizeSelectKey(value ?? '');
    this.originalJobTypeKey.set(key);
    this.jobPriorityUiKey.set(key);
  }

  private mergeJobPriorityOptions(
    opts: JobPriorityOption[],
    hd: JobHeaderDetail | null,
    page: AssignVendorPage | null,
  ): JobPriorityOption[] {
    let priorityKey = page?.jobTypeKey?.trim() || hd?.jobTypeKey?.trim() || null;
    let priorityName = hd?.jobTypeName?.trim() || null;

    if (!priorityKey && priorityName) {
      const byName = opts.find(
        (o) => (o.text ?? '').trim().toLowerCase() === priorityName!.toLowerCase(),
      );
      if (byName) priorityKey = byName.value;
    }

    if (!priorityKey) return opts;

    const normalizedKey = this.normalizeSelectKey(priorityKey);
    const normalizedOpts = opts.map((o) => ({
      ...o,
      value: this.normalizeSelectKey(o.value),
    }));

    if (normalizedOpts.some((o) => o.value === normalizedKey)) {
      return normalizedOpts;
    }

    return [{ value: normalizedKey, text: priorityName || 'Current priority' }, ...normalizedOpts];
  }

  private hasPendingSriEdits(): boolean {
    const hd = this.jobHeaderDetail();
    if (!hd) return false;
    return JobDetailsAccordionComponent.SRI_FIELDS.some(
      (field) => this.sriFieldValue(field) !== this.sriPlainFromHeader(hd, field),
    );
  }

  private sriPlainFromHeader(
    hd: JobHeaderDetail,
    field: (typeof JobDetailsAccordionComponent.SRI_FIELDS)[number],
  ): string {
    return this.htmlToPlainText(hd[field] ?? '');
  }

  private persistSriEdits(_triggerField?: (typeof JobDetailsAccordionComponent.SRI_FIELDS)[number]): void {
    if (this.sriSaving()) return;

    const jobKey = this.jobKey()?.trim();
    const hd = this.jobHeaderDetail();
    if (!jobKey || !hd) return;

    if (!this.hasPendingSriEdits()) {
      this.sriFieldEdits.set({});
      return;
    }

    const request: UpdateServiceRequestInstructionsRequest = {
      jobKey,
      serviceRequest: this.sriFieldValue('serviceRequest') || null,
      additionalApproval: this.sriFieldValue('additionalApproval') || null,
      specialInstruction: this.sriFieldValue('specialInstruction') || null,
      locationSpecialInstruction: this.sriFieldValue('locationSpecialInstruction') || null,
    };

    this.sriSaving.set(true);

    this.assignVendorSvc
      .updateServiceRequestInstructions(request)
      .pipe(takeUntil(this.destroy$), finalize(() => this.sriSaving.set(false)))
      .subscribe({
        next: (res) => {
          if (!res.status) return;
          this.assignVendorSvc
            .loadJobHeaderDetail(jobKey)
            .pipe(takeUntil(this.destroy$))
            .subscribe((headerRes) => {
              if (headerRes?.status && headerRes.data) {
                this.jobHeaderDetail.set(headerRes.data);
                this.syncNteDisplay(headerRes.data);
              }
              this.sriFieldEdits.set({});
            });
        },
      });
  }

  private htmlToPlainText(raw: string): string {
    if (!raw?.trim()) return '';
    const wrapper = document.createElement('div');
    wrapper.innerHTML = raw.trim();
    const text = wrapper.textContent ?? wrapper.innerText ?? '';
    return text.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  }

  private syncNteDisplay(hd: JobHeaderDetail): void {
    const expected = this.getExpectedNteForPriority(hd);

    const customerNte = this.resolveDefaultCustomerNte(hd, expected.customer);
    const revCustomerNte = this.resolveRevisedCustomerNte(hd, customerNte);

    // Always display the actual stored DNE (falling back to the priority's expected DNE only
    // when nothing is stored yet) — priority changes no longer force Bid/Project DNE to 0 on
    // the backend, so the display must not force it to 0 either.
    const dv = hd.assignedVendors.find((v) => v.isDefault) ?? hd.assignedVendors[0];
    const vendorNte = this.resolveDefaultVendorNte(dv, hd, expected.vendor);
    const revVendorNte = this.resolveRevisedVendorNte(dv, hd, vendorNte);

    this.nteCustomer.set(String(customerNte));
    this.nteRevCustomer.set(String(revCustomerNte));
    this.nteVendor.set(String(vendorNte));
    this.nteRevVendor.set(String(revVendorNte));
  }

  private isBidOrProjectJobType(jobTypeKey: string | null | undefined): boolean {
    const key = (jobTypeKey ?? '').toLowerCase();
    return key === JobDetailsAccordionComponent.BID_JOB_TYPE_KEY
      || key === JobDetailsAccordionComponent.PROJECT_JOB_TYPE_KEY;
  }

  private getExpectedNteForPriority(hd: JobHeaderDetail): { customer: number; vendor: number } {
    const isEmergency = this.isEmergencyJobType(hd.jobTypeKey);
    const isBidOrProject = this.isBidOrProjectJobType(hd.jobTypeKey);
    const profileCustomerStandard = this.getProfileCustomerDne(hd, false);
    const profileCustomerEmergency = this.getProfileCustomerDne(hd, true);
    const profileVendorStandard = this.getProfileVendorDne(hd, false);
    const profileVendorEmergency = this.getProfileVendorDne(hd, true);

    const customer = isEmergency ? profileCustomerEmergency : profileCustomerStandard;
    let vendor = profileVendorStandard;
    if (isBidOrProject) {
      vendor = 0;
    } else if (isEmergency) {
      vendor = profileVendorEmergency;
    }
    return { customer, vendor };
  }

  private isEmergencyJobType(jobTypeKey: string | null | undefined): boolean {
    return (jobTypeKey ?? '').toLowerCase() === JobDetailsAccordionComponent.EMERGENCY_JOB_TYPE_KEY;
  }

  private isJobDneFieldSet(value: string | null | undefined): boolean {
    if (value == null || String(value).trim() === '') return false;
    return this.vendorDneNumber(value) !== 0;
  }

  private resolveDefaultCustomerNte(hd: JobHeaderDetail, profileFallback: number): number {
    if (this.isJobDneFieldSet(hd.customerDne)) {
      return this.vendorDneNumber(hd.customerDne);
    }
    return profileFallback;
  }

  private resolveRevisedCustomerNte(hd: JobHeaderDetail, defaultCustomerNte: number): number {
    if (this.isJobDneFieldSet(hd.revCustomerDne)) {
      return this.vendorDneNumber(hd.revCustomerDne);
    }
    return defaultCustomerNte;
  }

  private isVendorRowDneSet(value: number | null | undefined): boolean {
    return value != null && value !== 0;
  }

  private resolveDefaultVendorNte(
    dv: JobHeaderDetail['assignedVendors'][number] | undefined,
    hd: JobHeaderDetail,
    profileFallback: number,
  ): number {
    if (dv && this.isVendorRowDneSet(dv.vendorDne)) {
      return this.vendorDneNumber(dv.vendorDne);
    }
    if (this.isJobDneFieldSet(hd.vendorDne)) {
      return this.vendorDneNumber(hd.vendorDne);
    }
    return profileFallback;
  }

  private resolveRevisedVendorNte(
    dv: JobHeaderDetail['assignedVendors'][number] | undefined,
    hd: JobHeaderDetail,
    defaultVendorNte: number,
  ): number {
    if (dv && this.isVendorRowDneSet(dv.revVendorDne)) {
      return this.vendorDneNumber(dv.revVendorDne);
    }
    if (this.isJobDneFieldSet(hd.revVendorDne)) {
      return this.vendorDneNumber(hd.revVendorDne);
    }
    return defaultVendorNte;
  }

  private getProfileCustomerDne(hd: JobHeaderDetail, isEmergency: boolean): number {
    const profile = this.customerProfileDne();
    const standard = profile?.customerDne ?? this.vendorDneNumber(hd.customerProfileCustomerDne);
    const emergency =
      profile?.emergencyCustomerDne ??
      this.vendorDneNumber(hd.customerProfileEmergencyCustomerDne ?? standard);
    return isEmergency ? emergency : standard;
  }

  private getProfileVendorDne(hd: JobHeaderDetail, isEmergency: boolean): number {
    const profile = this.customerProfileDne();
    const standard = profile?.vendorDne ?? this.vendorDneNumber(hd.customerProfileVendorDne);
    const emergency =
      profile?.vendorEmergencyDne ??
      this.vendorDneNumber(hd.customerProfileVendorEmergencyDne ?? standard);
    return isEmergency ? emergency : standard;
  }

  private cleanServiceRequestText(raw: string): string {
    if (!raw?.trim()) return '';
    let t = raw.replace(/\r\n/g, '\n').trim();
    t = t.replace(/^[\s]*service\s*request\s*details?\s*[:]\s*/i, '');
    t = t.replace(/^[\s]*service\s*request\s*[:]\s*/i, '');
    t = t.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    return t;
  }

  private extractHighlightedText(raw: string): string {
    if (!raw?.trim()) return '';
    const wrapper = document.createElement('div');
    wrapper.innerHTML = raw.trim();
    const highlighted = wrapper.querySelector('[style*="background-color"], [style*="background:"]');
    const text = highlighted?.textContent ?? '';
    return text.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();
  }
}
