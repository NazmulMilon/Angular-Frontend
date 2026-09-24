import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  afterNextRender,
  Injector,
  ViewChild,
  HostListener,
} from '@angular/core';
import type { NotesActivityTabId } from '../notes-activity/notes-activity.component';
import { DecimalPipe } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  ReactiveFormsModule,
  FormsModule,
  FormBuilder,
  FormGroup,
  Validators,
  AbstractControl,
  ValidationErrors,
} from '@angular/forms';
import { Subject, takeUntil, forkJoin, timer, merge, switchMap, takeWhile, of, map, distinctUntilChanged, finalize, from, concatMap, Observable, EMPTY, filter, tap, catchError, shareReplay } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { AccordionComponent } from '../../../shared/components/accordion/accordion.component';
import {
  DataGridComponent,
  GridColumn,
} from '../../../shared/components/data-grid/data-grid.component';
import { SearchableSelectComponent } from '../../../shared/components/searchable-select/searchable-select.component';
import { NotesActivityComponent } from '../notes-activity/notes-activity.component';
import { OnSiteEstimateModalComponent } from '../../../shared/components/on-site-estimate-modal/on-site-estimate-modal.component';
import { AssignVendorService } from '../../../services/assign-vendor.service';
import { AuthTokenService } from '../../../services/auth-token.service';
import { telHref } from '../../../shared/utils/phone-tel.util';
import { isBusinessHours } from '../../../shared/utils/business-hours.util';
import { AttachmentThumbnailGridComponent } from '../../../shared/components/attachment-thumbnail-grid/attachment-thumbnail-grid.component';
import { JobDetailsAccordionComponent } from '../../../shared/components/job-details-accordion/job-details-accordion.component';
import {
  RecallReviewModalComponent,
  RecallReviewResult,
} from '../../../shared/components/recall-review-modal/recall-review-modal.component';
import { VendorBillsService } from '../../../services/vendor-bills.service';
import { resolveEstimateChatInterstitial } from '../../../shared/utils/estimate-chat-interstitial.util';
import {
  EstimateChatInterstitialModalComponent,
} from '../../../shared/components/estimate-chat-interstitial-modal/estimate-chat-interstitial-modal.component';
import {
  AssignVendorPage,
  JobHeaderDetail,
  CustomerProfileDne,
  AssignVendorApiResponse,
  ApiErrorDetail,
  VendorListItem,
  LocationHistoryVendor,
  VendorDropdownOption,
  VendorContactOption,
  IntDropdownOption,
  QuickVendorRequest,
  SaveVendorNoteRequest,
  CheckDuplicateVendorRequest,
  DataReturn,
  VendorRates,
  VendorNoteItem,
  RegisteredVendorPacket,
  JobFileItem,
  LocationFileItem,
  AccountManagerSurveySetupItem,
  AccountManagerSurveyWorkOrderResponse,
  DisplayedVendorCapture,
  AISourcingVendor,
  AISourcingStatus,
  UpdateSourcedVendorEmailRequest,
  RecruitmentEmailRequest,
  SaveGeneralAdminNoteRequest,
  SupportContactInfo,
  VendorRadioOption,
  UpdateVendorScheduleDatesRequest,
  JobStatusOption,
  CustomerRequestorOption,
  JobPriorityOption,
  JobPriorityVendorCheck,
  JobPriorityChangePreview,
  AssignedVendorDetail,
  VendorStatusAction,
  VendorActionMailContext,
  ApproveVendorContext,
  CustomerReminderContext,
  SendVendorLoginEmailRequest,
  UpdateServiceRequestInstructionsRequest,
  UpdateNteRequest,
  SetEtaEmailPromptResponse,
  SendEtaSetEmailRequest,
  UnassignVendorRequest,
  ReassignVendorFromInactiveRequest,
  BroadcastJobFileDto,
  CustomerLocationOptionDto,
  DuplicateJobRequest,
  DuplicateJobResultDto,
  VendorScorecardScore,
  AdminSaveCheckInRequest,
  AdminSendCheckoutEmailRequest,
  AdminSaveCheckOutRequest,
  VendorEstimateListResult,
} from '../../../models/assign-vendor.model';

/**
 * Assign Vendor Tab — main component for managing vendor assignments within a job.
 *
 * Sections (per SRS §6):
 *   A — Assigned Vendors Grid
 *   B — Vendor Selection Form (reactive)
 *   C — Vendors Who Serviced This Location
 *   D — Vendor Search Panel (reactive)
 *   E — Default Vendor List / Search Results
 *   F — Pinned Vendors Grid
 *
 * Modals (component-scoped state, template rendered in Layer 6):
 *   Quick Vendor Creation (WF-8, SRS §20)
 *   Vendor Notes          (WF-9, SRS §21)
 *   Notes & Activity      (full feature modal from Selected Vendors — Send Msg)
 *   Pin Vendor             (WF-5, SRS §17)
 *
 * All API calls go through AssignVendorService (Layer 4).
 */

/**
 * Document types that are customer-facing and must never be sendable to vendors
 * (neither shown nor auto-selected in the broadcast or individual work-order file lists).
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

@Component({
  selector: 'app-assign-vendor',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    FormsModule,
    DecimalPipe,
    AccordionComponent,
    DataGridComponent,
    SearchableSelectComponent,
    NotesActivityComponent,
    OnSiteEstimateModalComponent,
    RouterLink,
    AttachmentThumbnailGridComponent,
    JobDetailsAccordionComponent,
    EstimateChatInterstitialModalComponent,
    RecallReviewModalComponent,
  ],
  templateUrl: './assign-vendor.component.html',
  styleUrl: './assign-vendor.component.scss',
})
export class AssignVendorComponent implements OnInit, OnDestroy {
  /** Job priority key for Emergency — matches legacy CreateJob.js / SystemStaticID.Emergency. */
  private static readonly EMERGENCY_JOB_TYPE_KEY = 'fc078fd5-5ddc-4088-8a9f-d982436e20fd';
  private static readonly RECALL_JOB_TYPE_KEY = '4905d351-838e-45f0-a1fb-f1e4af627626';
  /** JobStatus GUID for "Pending Return ETA" — target status when moving a recall job out of Accounting. */
  private static readonly PENDING_RETURN_ETA_STATUS_KEY = 'b7ce1e7d-e2fd-4064-a2eb-5a92b83f261b';
  /** JobStatus.TriggerBit value for the Move-to-Accounting status. */
  private static readonly MOVE_TO_ACCOUNTING_TRIGGER_BIT = 66;
  private static readonly BID_JOB_TYPE_KEY = 'b2652bbb-fa8a-4382-9e2b-77ba60fbeae5';
  private static readonly PROJECT_JOB_TYPE_KEY = 'bebc6067-145c-4dc7-9882-b2efa84053c8';
  private static readonly PM_JOB_TYPE_KEY = '3d0a7106-4ef7-4df6-b5a4-b534589167b0';
  private static readonly HIGH_PRIORITY_JOB_TYPE_KEY = 'f76bb31b-82ef-43bc-8299-8ac390add80f';
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly assignVendorSvc = inject(AssignVendorService);
  private readonly authTokenSvc = inject(AuthTokenService);
  private readonly injector = inject(Injector);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly vendorBillsSvc = inject(VendorBillsService);
  private readonly destroy$ = new Subject<void>();
  /** Incremented when score polling restarts for a new job; only the latest poll may update UI. */
  private latestScoreLoadId = 0;
  /** Cancels in-flight scorecard polling when the job changes or polling should stop. */
  private readonly scorePollingStop$ = new Subject<void>();
  /** Union of vendor keys awaiting scorecard data across all grids on this page. */
  private readonly expectedScoreVendorKeys = new Set<string>();
  /** Job key for the active score poll (reset when route job changes). */
  private scorePollJobKey: string | null = null;
  /** True while the scorecard agent is known to have failed for the current job. */
  private scoreAgentFailed = signal(false);
  /** True while an RxJS score poll sequence is running. */
  private scorePollingActive = signal(false);
  /** Stops an in-flight AI sourcing status poll when starting a new one (e.g. Retry after error). */
  private readonly aiSourcingPollingStop$ = new Subject<void>();
  /** Stops job details polling when the page is destroyed. */
  private readonly jobDetailsPollingStop$ = new Subject<void>();
  /** Debounce timer for visibility/focus job details refresh (avoids duplicate GETs). */
  private jobDetailsRefreshDebounceId: ReturnType<typeof setTimeout> | null = null;
  /** Poll interval for syncing job details changes made outside this page. */
  private static readonly JOB_DETAILS_POLL_MS = 15_000;

  /** Exposed for template use (e.g. Math.min in @let). */
  readonly Math = Math;
  readonly telHref = telHref;

  // ═══════════════════════════════════════════════════════════════
  //  STATE SIGNALS
  // ═══════════════════════════════════════════════════════════════

  jobKey = signal('');
  pageContext = signal<AssignVendorPage | null>(null);
  jobHeaderDetail = signal<JobHeaderDetail | null>(null);
  /** Controls whether the Store Hours modal is open. */
  storeHoursModalOpen = signal(false);

  // ── Vendor Login Email modal ────────────────────────────────────
  /** The vendor card (key + name + vendorKey) for which the login email modal is open. */
  loginEmailVendor = signal<{ jobVendorKey: string; vendorKey: string; vendorName: string | null } | null>(null);
  /** Contacts loaded for the login email modal. */
  loginEmailContacts = signal<VendorContactOption[]>([]);
  /** Selected contact keys in the login email modal. */
  loginEmailSelected = signal<Set<string>>(new Set());
  /** Optional note entered in the login email modal. */
  loginEmailNote = signal('');
  /** Loading state for contact list fetch. */
  loginEmailContactsLoading = signal(false);
  /** Sending state. */
  loginEmailSending = signal(false);

  // ── NOT TO EXCEED editable form state ──────────────────────────
  nteCustomer    = signal<string>('');
  nteRevCustomer = signal<string>('');
  nteVendor      = signal<string>('');
  nteRevVendor   = signal<string>('');
  nteSaving      = signal(false);
  /** Customer profile DNE from Edit Customer (CustomerProfile API). */
  customerProfileDne = signal<CustomerProfileDne | null>(null);
  // ── Duplicate Job modal state ────────────────────────────────────────────
  duplicateModalOpen   = signal(false);
  duplicateLocations   = signal<CustomerLocationOptionDto[]>([]);
  duplicateLocLoading  = signal(false);
  duplicateSaving      = signal(false);
  duplicateSelectedLoc = signal<string | null>(null);
  duplicateMessage     = signal<string | null>(null);
  duplicateError       = signal<string | null>(null);
  duplicateJobResult   = signal<DuplicateJobResultDto | null>(null);
  duplicateSearchQuery = signal('');

  /** Filtered locations based on search query */
  filteredDuplicateLocations = computed(() => {
    const query = this.duplicateSearchQuery().toLowerCase().trim();
    const locations = this.duplicateLocations();
    
    if (!query) return locations;
    
    return locations.filter(loc => 
      loc.lname?.toLowerCase().includes(query) ||
      loc.address?.toLowerCase().includes(query)
    );
  });

  /** Cleaned service request text with "Service Request:" prefix removed */
  cleanedServiceRequest = computed(() => {
    const raw = this.jobHeaderDetail()?.serviceRequest ?? '';
    return this.cleanServiceRequestText(raw);
  });

  /** Cleaned service request preview with "Service Request:" prefix removed */
  cleanedServiceRequestPreview = computed(() => {
    const raw = this.jobHeaderDetail()?.serviceRequestPreview ?? '';
    return this.cleanServiceRequestText(raw);
  });

  /** Plain-text Special Instruction for Job Details display. */
  cleanedSpecialInstruction = computed(() =>
    this.jobHeaderDetail()?.specialInstruction ?? ''
  );

  /** Plain-text Location Special Instruction for Job Details display. */
  cleanedLocationSpecialInstruction = computed(() =>
    this.jobHeaderDetail()?.locationSpecialInstruction ?? ''
  );

  /** Text from the first highlighted HTML segment inside Special Instruction. */
  specialInstructionHighlight = computed(() =>
    this.extractHighlightedText(this.jobHeaderDetail()?.specialInstruction ?? '')
  );



  /** Assigned vendors with default vendor first (leftmost chip / primary). */
  orderedAssignedVendors = computed(() => {
    const vendors = this.jobHeaderDetail()?.assignedVendors ?? [];
    if (vendors.length <= 1) return vendors;
    const defaultVendor = vendors.find((v) => v.isDefault);
    if (!defaultVendor) return vendors;
    return [defaultVendor, ...vendors.filter((v) => !v.isDefault)];
  });

  /** Vendor used by the Job Details schedule panel: default vendor first, otherwise first assigned vendor. */
  jobManagementVendor = computed(() => {
    const vendors = this.orderedAssignedVendors();
    return vendors[0] ?? null;
  });

  assignedVendors = signal<LocationHistoryVendor[]>([]);
  locationHistoryVendors = signal<LocationHistoryVendor[]>([]);
  defaultVendors = signal<LocationHistoryVendor[]>([]);
  searchResults = signal<VendorListItem[]>([]);
  pinnedVendors = signal<LocationHistoryVendor[]>([]);
  /** Pin choice cache keyed by vendorKey — used when API omits noMaybe on pinned rows. */
  private readonly pinnedNoMaybeCache = signal<Record<string, string>>({});
  vendorDropdown = signal<VendorDropdownOption[]>([]);
  contactDropdown = signal<VendorContactOption[]>([]);
  tradeDropdown = signal<VendorDropdownOption[]>([]);
  stateDropdown = signal<IntDropdownOption[]>([]);
  cityDropdown = signal<IntDropdownOption[]>([]);

  selectedVendorDistance = signal<number | null>(null);
  selectedVendorServiceCharge = signal<number | null>(null);
  selectedVendorConsolidator = signal<string | null>(null);
  selectedVendorLaborKey = signal('');

  isLoading = signal(false);
  isSubmitting = signal(false);
  errorMessage = signal('');
  successMessage = signal('');
  showAlreadyAssignedModal = signal(false);

  /** Blocking overlay for long-running operations (e.g., sending approval emails) */
  processingOverlayMessage = signal<string | null>(null);

  /** Quick-vendor modal visibility */
  showQuickVendorModal = signal(false);
  /** Construction Trades modal visibility */
  showTradeModal = signal(false);
  /** Vendor name shown in the trade modal header */
  tradeModalVendorName = signal('');
  /** Parsed trade list shown in the trade modal */
  tradeModalTrades = signal<string[]>([]);
  /** Vendor notes modal visibility */
  showNotesModal = signal(false);
  /** Full Notes & Activity feature (opened from Selected Vendors grid — Send Msg) */
  showNotesActivityModal = signal(false);
  /** Vendor key passed into the Notes & Activity modal for Vendor tab pre-selection */
  notesActivityModalVendorKey = signal('');
  /** Pin-vendor modal visibility */
  showPinModal = signal(false);
  /** View pinned note modal visibility and data */
  showPinNoteModal = signal<{ vendorName: string; noMaybe: string; notes: string } | null>(null);
  /** Duplicate-vendor warning visibility */
  showDuplicateWarning = signal(false);
  duplicateResult = signal<DataReturn | null>(null);

  /** Tracks the currently selected vendor key for detailed view in the Vendors tab accordion. */
  selectedVendorDetailKey = signal<string | null>(null);

  /** Frontend-only selected status value per vendor card in the Financial section. */
  selectedVendorFinancialStatuses = signal<Record<string, string>>({});

  /** Frontend-only edited vendor DNE value per vendor card in the Financial section. */
  selectedVendorFinancialDnes = signal<Record<string, string>>({});
  /** Per-row saving state for vendor DNE updates (keyed by jobVendorKey). */
  vendorDneSaving = signal<Record<string, boolean>>({});

  /** Frontend-only draft datetime-local values keyed by JobVendor row. */
  vendorScheduleDrafts = signal<Record<string, { scheduleDate: string; returnScheduleDate: string }>>({});
  /** Per-row saving state for schedule updates. */
  vendorScheduleSaving = signal<Record<string, boolean>>({});
  /** Available job status options for the JOB STATUS dropdown. */
  jobStatusList = signal<JobStatusOption[]>([]);
  /** Available contact options for the Customer Requestor dropdown. */
  customerRequestorOptions = signal<CustomerRequestorOption[]>([]);
  /** Whether the Customer Requestor save is in progress. */
  customerRequestorSaving = signal(false);
  /** Available JobType options for the Job Priority dropdown. */
  jobPriorityOptions = signal<JobPriorityOption[]>([]);
  /** Normalized key bound to the Job Priority select. */
  jobPrioritySelectKey = computed(() => {
    const pc = this.pageContext();
    const hd = this.jobHeaderDetail();
    if (pc?.jobTypeKey?.trim()) {
      return this.normalizeSelectKey(pc.jobTypeKey);
    }
    if (hd?.jobTypeKey?.trim()) {
      return this.normalizeSelectKey(hd.jobTypeKey);
    }
    return this.resolveJobPriorityKey(hd, this.jobPriorityOptions()) ?? '';
  });
  /** Whether the Job Priority save is in progress. */
  jobPrioritySaving = signal(false);
  /** Original priority key — reverted on cancel / used for preview old value. */
  originalJobTypeKey = signal('');
  /** UI-bound priority key for the dropdown. */
  jobPriorityUiKey = signal('');
  /** Vendor / work-order guard for priority changes. */
  jobPriorityVendorCheck = signal<JobPriorityVendorCheck | null>(null);
  jobPriorityChangeModalOpen = signal(false);
  jobPriorityPreview = signal<JobPriorityChangePreview | null>(null);
  jobPriorityPendingKey = signal<string | null>(null);
  jobPriorityChangeStatus = signal<string | null>(null);
  /** Assigned vendors whose RevVendorDne has been manually revised away from VendorDne, captured when the priority-change modal opens. */
  jobPriorityRevisedVendors = signal<AssignedVendorDetail[]>([]);
  /** Per-vendor Keep/Change choice for revised vendors, keyed by jobVendorKey. */
  jobPriorityVendorDneChoices = signal<Record<string, 'keep' | 'change'>>({});
  /** Whether the Trade save is in progress. */
  tradeSaving = signal(false);
  /** jobVendorKey while Set to Default is saving (vendor card). */
  setDefaultVendorSaving = signal<string | null>(null);

  // ── Service Request & Instructions editing (inline, save on blur) ──
  private static readonly SRI_FIELDS = [
    'serviceRequest',
    'additionalApproval',
    'specialInstruction',
    'locationSpecialInstruction',
  ] as const;
  private readonly sriFieldEdits = signal<
    Partial<Record<(typeof AssignVendorComponent.SRI_FIELDS)[number], string>>
  >({});
  sriSaving = signal(false);
  /** Fields the user has manually expanded from their collapsed "click to add" state. */
  private readonly sriManuallyExpanded = signal<Set<string>>(new Set());

  /** Vendor key context for the currently open notes modal */
  notesVendorKey = signal('');
  /** Loaded vendor notes list */
  vendorNotes = signal<VendorNoteItem[]>([]);
  notesLoading = signal(false);
  noteMessage = signal('');
  notesSearchTerm = signal('');
  filteredNotes = computed(() => {
    const term = this.notesSearchTerm().toLowerCase().trim();
    const notes = this.vendorNotes();
    let result = notes;
    if (term) {
      result = notes.filter(n =>
        (n.title ?? '').toLowerCase().includes(term) ||
        (n.comment ?? '').replace(/<[^>]*>/g, '').toLowerCase().includes(term) ||
        (n.addedBy ?? '').toLowerCase().includes(term) ||
        (n.addedOn ?? '').toLowerCase().includes(term)
      );
    }
    return [...result].sort((a, b) => {
      const dateA = new Date(a.addedOn ?? 0).getTime();
      const dateB = new Date(b.addedOn ?? 0).getTime();
      return dateB - dateA;
    });
  });

  /** Vendor rates popup state */
  showRatesModal = signal(false);
  ratesVendorName = signal('');
  ratesData = signal<VendorRates | null>(null);
  ratesLoading = signal(false);

  /** Registered vendor packet popup state */
  showPacketModal = signal(false);
  packetVendorName = signal('');
  packetVendorKey = signal('');
  packetData = signal<RegisteredVendorPacket | null>(null);
  packetLoading = signal(false);

  /** Upline approval modal: customer did not approve — show Override / Cancel */
  showUplineModal = signal(false);
  /** When true, show the upline reason section and Save in the upline modal */
  showUplineOverrideSection = signal(false);
  /** Upline override reason text (bound to textarea) */
  uplineOverrideReason = signal('');
  uplineOverrideSaving = signal(false);

  /** Wait popup: primary vendor or emergency broadcast in progress — block form for 3 minutes */
  showWaitPopup = signal(false);
  waitPopupMessage = signal('');
  /** When true, form is blocked and wait popup is shown; after 3 min we reload and clear */
  formBlockedByWait = signal(false);
  private waitPopupTimeoutId: ReturnType<typeof setTimeout> | null = null;

  /** Continuation callback when user clicks Proceed on consolidator API precheck modal */
  private consolidatorPrecheckPendingContinue: (() => void) | null = null;
  private consolidatorPrecheckPendingKeys: { jobKey: string; vendorKey: string } | null = null;
  private consolidatorPrecheckPendingSource: 'addVendor' | 'grid' | null = null;

  /**
   * Existing-vendor/trade check results prefetched in parallel by
   * {@link onSendAndSelectWorkOrder}, consumed once by {@link woProcessSaveVendor} /
   * {@link woCheckTradeThenAssign} instead of being refetched.
   */
  private woPrefetchedExistingVendorResult: AssignVendorApiResponse<number> | null = null;
  private woPrefetchedTradeResult: AssignVendorApiResponse<number> | null = null;

  /** vendorKey of the row whose Send & Select W/O prechecks are in flight, if any. */
  sendAndSelectWorkOrderLoadingVendorKey = signal<string | null>(null);

  // ═══════════════════════════════════════════════════════════════
  //  SEND & SELECT W/O — STATE SIGNALS
  // ═══════════════════════════════════════════════════════════════

  /** Vendor selected from any grid for the Send & Select W/O flow */
  woSelectedVendorKey = signal('');
  woSelectedVendorName = signal('');
  woIsConsolidator = signal(false);

  /** "0" = additional vendor, "1" = default/replace */
  woDefaultVendorValue = signal('1');

  /** Modal visibility signals */
  showConsolidatorModal = signal(false);
  showPrimaryVendorModal = signal(false);
  showDefaultVendorModal = signal(false);
  showUnassignAllModal = signal(false);
  showDistanceExceededModal = signal(false);

  /** Data for the distance exceeded modal */
  distanceExceededData = signal<{ vendorKey: string; vendorName: string; distance: number; ruleValue: number } | null>(null);
  showNewTradeModal = signal(false);
  showWorkOrderModal = signal(false);
  showDNEWarningModal = signal(false);

  /**
   * Job Ops POST check-if-consolidator ({@code CheckIfVendorIs}) — gate before Add Vendor / Assign & Send W/O.
   * When {@code data} is true, message text is shown in this modal until user proceeds or cancels.
   */
  showConsolidatorPrecheckModal = signal(false);
  consolidatorPrecheckMessage = signal('');
  /** Outcome after POST send-mail-qc-manager-consolidator-dispatch (following successful WO / primary dispatch) */
  showQcDispatchOutcomeModal = signal(false);
  qcDispatchOutcomeMessage = signal('');
  /**
   * After user confirms consolidator precheck: QC notification runs once assign + WO email succeeds,
   * or after send-to-primary-vendor succeeds.
   */
  pendingPostWoQcDispatch = signal<{ jobKey: string; vendorKey: string } | null>(null);

  /** Assign Vendor modal — shown when reassigning inactive vendor and active vendors exist */
  showAssignVendorModal = signal(false);
  assignVendorModalJobVendorKey = signal('');
  assignVendorModalVendorName = signal('');
  assignVendorModalProcessing = signal(false);
  assignVendorModalMessage = signal('');

  // ═══════════════════════════════════════════════════════════════
  //  UNASSIGN VENDOR MODAL STATE (RemoveVendorProcess1 replication)
  // ═══════════════════════════════════════════════════════════════

  /** Current unassign vendor flow state */
  unassignJobKey = signal('');
  unassignJobVendorKey = signal('');
  unassignVendorName = signal('');
  unassignProcessing = signal(false);
  unassignMessage = signal('');

  /** Modal: Vendor Bill Exists */
  showUnassignBillExistsModal = signal(false);

  /** Modal: Pending Estimate Approval */
  showUnassignEstimateModal = signal(false);
  unassignEstimateType = signal<1 | 2>(1);

  /** Modal: Delete Vendor Confirmation */
  showUnassignConfirmModal = signal(false);
  unassignInsufficientPerformance = signal(false);
  unassignInsufficientReason = signal('');
  unassignSendCancellationEmail = signal(false);
  /** When true, confirm modal proceeds via handle-estimate-and-unassign first. */
  unassignRequiresEstimateHandling = signal(false);

  /** Modal: Select New Default Vendor (when removing default with >2 vendors) */
  showUnassignSelectDefaultModal = signal(false);
  unassignNewDefaultOptions = signal<VendorRadioOption[]>([]);
  unassignSelectedNewDefault = signal('');

  unassignEmailComment = signal('');

  /** Reassign inactive vendor modal */
  showReassignModal = signal(false);
  reassignVendor = signal<AssignedVendorDetail | null>(null);
  reassignProcessing = signal(false);

  /** Primary vendor decision modal message from API */
  woPrimaryVendorMessage = signal('');

  /** Work order form state */
  woTalkedToVendor = signal<number | null>(null);
  woHaveScheduleDate = signal<boolean | null>(null);
  /** Schedule date+time as a native datetime-local value, e.g. "2026-07-14T13:30". */
  woScheduleDateTime = signal('');
  woConvertedScheduleDate = signal('');
  woEtaLimitDays = signal<number | null>(null);
  woCurrentDNE = signal<number | null>(null);
  woChangeDNE = signal<number | null>(null);

  /** File management */
  woJobFiles = signal<JobFileItem[]>([]);
  woLocationFiles = signal<LocationFileItem[]>([]);
  /** job-files/{jobKey} is loaded after the modal opens so it doesn't block it. */
  woJobFilesLoading = signal(false);
  /** location-files/{jobKey} is slow (observed ~4s); loaded after the modal opens so it doesn't block it. */
  woLocationFilesLoading = signal(false);
  woSelectedJobFileKeys = signal<string[]>([]);
  woSelectedLocationFileKeys = signal<string[]>([]);
  woUploadedFiles = signal<File[]>([]);

  /** Processing state */
  woSaving = signal(false);
  woMessage = signal('');

  /** Vendor Selection Survey (legacy AccountManagerSurveyWorkOrder.js parity) */
  private static readonly WO_SURVEY_OTHER_REASON = 'OTHER_REASON';
  woSurveyOptions = signal<AccountManagerSurveySetupItem[]>([]);
  woSurveyLoading = signal(false);
  woSurveySaving = signal(false);
  woSurveyError = signal('');
  woSurveySelectedCodes = signal<string[]>([]);
  woSurveyOtherReason = signal(false);
  woSurveyOtherRemark = signal('');
  woSurveyMainRemark = signal('');
  private woSurveySavedSignature = signal<string | null>(null);

  /** Tracks DNE warning flow: "0" = first time, "2" = without files path */
  woSendFromWhere = signal('0');

  /** Unassign All modal state */
  woUnassignVendors = signal<{ pKey: string; vendorName: string; checked: boolean }[]>([]);
  woCancellationNotes = signal('');
  woSelectAllUnassign = signal(false);
  /** Validation message for unassign modal */
  woUnassignValidationMessage = signal('');

  /** Stores the last function used to load the Vendor List grid so it can be replayed after pin */
  private lastVendorListLoader: (() => void) | null = null;

  // ═══════════════════════════════════════════════════════════════
  //  AI SOURCING AGENT — STATE SIGNALS
  // ═══════════════════════════════════════════════════════════════

  aiSourcingVendors = signal<AISourcingVendor[]>([]);
  /** Last status from GET /api/sourcing/status (for empty-state messaging). */
  aiSourcingStatus = signal<AISourcingStatus | null>(null);
  aiSourcingLoading = signal(false);
  aiSourcingPolling = signal(false);
  aiSourcingError = signal('');
  aiSourcingStarting = signal(false);
  aiSourcingSearch = signal('');
  /** Search query for the "Vendors Who Previously Serviced This Location" table. */
  locationHistorySearch = signal('');

  /** Per-vendor scorecard scores keyed by lowercase vendorKey. Updated after vendor lists load. */
  vendorScores   = signal<Record<string, VendorScorecardScore>>({});
  /** Join key from the newest scorecard run for this job (updated on each score poll). */
  scoringRunUid  = signal<string | null>(null);
  /** True while expected vendor scores are still being fetched — drives score skeleton cells. */
  scoresLoading  = signal(false);

  // ── Admin Check-In / Check-Out modal state ────────────────────────────────

  /** Vendor currently being checked in; non-null while the check-in modal is open. */
  checkInModalVendor = signal<AssignedVendorDetail | null>(null);
  checkInSaving      = signal(false);
  checkInError       = signal('');
  checkInDraft       = signal<{ checkInDate: string; noOfTech: number }>({ checkInDate: '', noOfTech: 1 });

  /**
   * Set after a successful check-in to show the "Send checkout email?" step
   * inside the same modal.  Contains the vendor + the new checkinKey.
   */
  postCheckInState = signal<{ vendor: AssignedVendorDetail; checkinKey: string } | null>(null);
  checkoutEmailNote            = signal('');
  checkoutEmailSending         = signal(false);
  checkoutEmailContacts        = signal<VendorContactOption[]>([]);
  checkoutEmailSelectedContacts = signal<Set<string>>(new Set());
  checkoutEmailContactsLoading = signal(false);
  checkoutEmailError           = signal('');

  /** Vendor currently being checked out; non-null while the checkout modal is open. */
  checkOutModalVendor = signal<AssignedVendorDetail | null>(null);
  checkOutSaving      = signal(false);
  checkOutError       = signal('');
  checkOutDraft       = signal<{
    checkoutStatus: number;
    workPerformed: boolean;
    workDetails: string;
    checkOutDate: string;
  }>({ checkoutStatus: 5, workPerformed: true, workDetails: '', checkOutDate: '' });

  // ── Vendor status action modals (SendVendorMails port) ───────────────────

  vendorActionModal = signal<{
    vendor: AssignedVendorDetail;
    action: VendorStatusAction;
    ctx: VendorActionMailContext;
  } | null>(null);
  vendorActionSending = signal(false);
  vendorActionError = signal('');
  vendorActionSelectedContacts = signal<string[]>([]);
  vendorActionCustomEmail = signal('');
  vendorActionEmailNote = signal('');
  vendorActionSelectedEstimate = signal<string | null>(null);
  vendorActionResultHtml = signal('');

  confirmEtaModal = signal<{ vendor: AssignedVendorDetail; isReturn: boolean } | null>(null);
  confirmEtaSaving = signal(false);
  confirmEtaError = signal('');
  confirmEtaDraft = signal({ confirmedDate: '', comment: '' });

  // ETA Set Email Notification Modal
  showEtaEmailModal = signal<SetEtaEmailPromptResponse | null>(null);
  etaSending = signal(false);
  etaEmailError = signal('');
  etaEmailNote = '';
  etaCustomEmail = '';
  etaSelectedContacts = new Set<string>();

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

  approveVendorModal = signal<{ vendor: AssignedVendorDetail; ctx: ApproveVendorContext; title: string } | null>(null);
  approveVendorSending = signal(false);
  approveVendorError = signal('');
  approveVendorEmailNote = signal('');
  approveVendorCustomEmail = signal('');
  approveVendorSelectedContacts = signal<string[]>([]);
  approveVendorSelectedEstimate = signal<string | null>(null);
  approveVendorText = signal('');

  customerReminderModal = signal<{
    vendor: AssignedVendorDetail;
    ctx: CustomerReminderContext;
  } | null>(null);
  customerReminderSending = signal(false);
  customerReminderError = signal('');
  customerReminderEmailNote = signal('');
  customerReminderCustomEmail = signal('');
  customerReminderSelectedContacts = signal<string[]>([]);
  customerReminderResultHtml = signal('');

  onSiteApprovalLoading = signal(false);
  /** Legacy multi-estimate picker before opening EditEstimate. */
  onSiteEstimatePickerModal = signal<{
    vendor: AssignedVendorDetail;
    estimates: { invoiceKey: string; totalAmount?: number | null }[];
  } | null>(null);

  /** Filtered list for the location history table — score data merged in when available. */
  filteredLocationHistoryVendors = computed(() => {
    const term = this.locationHistorySearch().toLowerCase().trim();
    const all = this.enrichWithScores(this.locationHistoryVendors());
    if (!term) return all;
    return all.filter((v) =>
      v.vendorName?.toLowerCase().includes(term) ||
      v.contactName?.toLowerCase().includes(term) ||
      v.tradeList?.toLowerCase().includes(term)
    );
  });

  /** Pinned vendors with resolved Maybe/No choice and scorecard data merged in. */
  displayPinnedVendors = computed(() => {
    const cache = this.pinnedNoMaybeCache();
    const withPinChoice = this.pinnedVendors().map((v) => {
      const choice = this.resolvePinnedMaybeNoChoice(v, cache);
      let row = choice ? { ...v, noMaybe: choice, _pinChoice: choice } : v;
      if (!row.vendorKey && row.vendorName) {
        const name = row.vendorName.toLowerCase();
        const match = [...this.defaultVendors(), ...this.searchResults()].find((d) => {
          const r = d as unknown as Record<string, unknown>;
          const candidate = String(r['vendorName'] ?? r['vname'] ?? '');
          return candidate.toLowerCase() === name;
        });
        if (match?.vendorKey) row = { ...row, vendorKey: match.vendorKey };
      }
      return row;
    });
    return this.enrichWithScores(withPinChoice);
  });

  /** Active quick-nav tab identifier. */
  activeNavTab = signal<string>('dispatching');

  @ViewChild('jobDetailsAccordion') private jobDetailsAccordion?: JobDetailsAccordionComponent;
  @ViewChild(RecallReviewModalComponent) private recallReviewModal?: RecallReviewModalComponent;
  /** Pending recall interception state — set when a status change on a job in Accounting is deferred until the recall modal is confirmed. */
  private pendingRecallVendor: AssignedVendorDetail | null = null;
  private pendingRecallTargetStatusKey: string | null = null;
  @ViewChild('vendorsAccordion')    private vendorsAccordion?: AccordionComponent;
  @ViewChild('sourcingAccordion')   private sourcingAccordion?: AccordionComponent;
  @ViewChild('addVendorAccordion')  private addVendorAccordion?: AccordionComponent;
  @ViewChild('internalVendorsAccordion') private internalVendorsAccordion?: AccordionComponent;
  @ViewChild('onSiteEstimateModal') private onSiteEstimateModal?: OnSiteEstimateModalComponent;
  @ViewChild(EstimateChatInterstitialModalComponent)
  private estimateChatInterstitialModal?: EstimateChatInterstitialModalComponent;

  onEstimatesTabClick(): void {
    const key = this.jobKey();
    if (!key) return;
    resolveEstimateChatInterstitial(this.vendorBillsSvc, key, ({ shouldIntercept, vendorKey }) => {
      if (shouldIntercept) {
        this.estimateChatInterstitialModal?.open({ jobKey: key, vendorKey });
      } else {
        void this.router.navigate(['/job', key, 'estimates']);
      }
    });
  }

  /** Maps each nav-tab key to the accordion that owns it. */
  private accordionForTab(tab: string): AccordionComponent | undefined {
    switch (tab) {
      case 'dispatching':
      case 'selected':      return this.vendorsAccordion;
      case 'sourcing':      return this.sourcingAccordion;
      case 'internal-vendors': return this.internalVendorsAccordion;
      case 'prev-serviced':
      case 'add-vendor':    return this.addVendorAccordion;
      default:              return undefined;
    }
  }

  /** Toggles the accordion for the given tab, or opens it and scrolls to the section. */
  scrollToSection(sectionId: string, tab: string): void {
    // Job Details lives in the shared JobDetailsAccordionComponent, which exposes open() rather
    // than an AccordionComponent isOpen signal — open it and scroll without toggle-collapse.
    if (tab === 'job-details') {
      this.activeNavTab.set(tab);
      this.jobDetailsAccordion?.open();
      setTimeout(() => {
        const el = document.getElementById(sectionId);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      return;
    }

    const accordion = this.accordionForTab(tab);
    const isSameTab = this.activeNavTab() === tab;

    if (accordion?.isOpen() && isSameTab) {
      accordion.isOpen.set(false);
      return;
    }

    this.activeNavTab.set(tab);
    if (accordion && !accordion.isOpen()) {
      accordion.isOpen.set(true);
    }
    // Give Angular one tick to expand before scrolling
    setTimeout(() => {
      const el = document.getElementById(sectionId);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  /** Search query for the SCORECARD AGENT (internal vendors in radius) table. */
  internalVendorSearch = signal('');
  internalScoringFilter = signal<'all' | 'scored' | 'unscored'>('all');

  /** Opens the score detail modal for any vendor row. */
  scoreModal = signal<Record<string, unknown> | null>(null);

  /** Filtered list for the SCORECARD AGENT table — uses searchResults if present, else defaultVendors. Score data merged in. */
  filteredInternalVendors = computed(() => {
    const term = this.internalVendorSearch().toLowerCase().trim();
    const filter = this.internalScoringFilter();
    const raw = this.searchResults().length > 0
      ? (this.searchResults() as unknown as LocationHistoryVendor[])
      : this.defaultVendors();
    let all = this.enrichWithScores(raw);
    if (filter === 'scored') {
      all = all.filter(v => {
        const t = (v as unknown as Record<string, unknown>)['scoreTier'];
        return t != null && t !== 'N/A';
      });
    } else if (filter === 'unscored') {
      all = all.filter(v => {
        const t = (v as unknown as Record<string, unknown>)['scoreTier'];
        return t == null || t === 'N/A';
      });
    }
    if (!term) return all;
    return all.filter((v) => {
      const sv = v as unknown as Record<string, unknown>;
      return (
        (sv['vendorName'] as string | undefined)?.toLowerCase().includes(term) ||
        (sv['vname'] as string | undefined)?.toLowerCase().includes(term) ||
        (sv['contactName'] as string | undefined)?.toLowerCase().includes(term) ||
        (sv['tradeName'] as string | undefined)?.toLowerCase().includes(term)
      );
    });
  });

  filteredAiVendors = computed(() => {
    const term = this.aiSourcingSearch().toLowerCase().trim();
    const all = this.aiSourcingVendors();
    if (!term) return all;
    return all.filter((v) => {
      const sv = v as unknown as Record<string, unknown>;
      return (
        v.company_name?.toLowerCase().includes(term) ||
        v.phone?.toLowerCase().includes(term) ||
        v.email?.toLowerCase().includes(term) ||
        (sv['address'] as string | null)?.toLowerCase().includes(term)
      );
    });
  });
  showAIInfoModal = signal(false);
  selectedAIVendor = signal<AISourcingVendor | null>(null);
  /** When true, Alternate Emails in the More Info modal shows all; otherwise first 2 + Read More */
  alternateEmailsExpanded = signal(false);
  showRecruitEmailModal = signal(false);
  recruitEmailVendor = signal<AISourcingVendor | null>(null);
  /** Editable recruitment email fields (opened from AI sourcing grid). */
  recruitEmailSubject = signal('');
  recruitEmailBody = signal('');
  recruitEmailTo = signal('');
  /** True while sending the recruitment email via API. */
  recruitEmailSending = signal(false);
  /** Cached support contact info for email footer. */
  supportContactInfo = signal<SupportContactInfo | null>(null);

  // ── Bulk Recruit Email (Send to all sourced vendors with email) ─────────────
  /** Bulk send modal visibility. */
  showBulkRecruitEmailModal = signal(false);
  /** Editable subject for the bulk recruitment email. */
  bulkRecruitSubject = signal('');
  /** Editable body template for the bulk email. Uses {{companyName}} placeholder. */
  bulkRecruitBody = signal('');
  /** True while a bulk send batch is in-flight. */
  bulkRecruitSending = signal(false);
  /** Progress counters during a bulk send. */
  bulkRecruitProgress = signal<{ sent: number; failed: number; total: number } | null>(null);
  /** Per-recipient send outcomes (populated as the batch runs). */
  bulkRecruitResults = signal<Array<{ company: string; email: string; success: boolean; error?: string }>>([]);

  /** Vendors in the current AI sourcing result that have a usable email address. */
  bulkRecruitRecipients = computed<Array<{ vendor: AISourcingVendor; email: string }>>(() => {
    return this.aiSourcingVendors()
      .map((v) => ({ vendor: v, email: this.resolveRecruitEmailAddress(v) }))
      .filter((r) => !!r.email && r.email.includes('@'));
  });

  /** Stable reference for data-grid default sort by distance (radius). */
  readonly aiSourcingGridInitialSort = { field: 'distance_miles', direction: 'asc' as const };

  /** Default sort for Vendor List from RFI internal system grid. */
  readonly vendorListInitialSort = { field: 'distanceFromLocation', direction: 'asc' as const };

  // ═══════════════════════════════════════════════════════════════
  //  COMPUTED VALUES
  // ═══════════════════════════════════════════════════════════════

  assignedVendorCount = computed(() => this.assignedVendors().length);
  tradeName = computed(() => this.pageContext()?.tradeName ?? '');
  locationDetail = computed(() => this.pageContext()?.locationDetail ?? '');
  isPrimary = computed(() => this.pageContext()?.isPrimary === 1);
  primaryVendorKey = computed(() => this.pageContext()?.primaryVendorKey ?? '');
  minutesLeft = computed(() => this.pageContext()?.minutesLeft ?? 0);

  /** ETA label: "No of hours" for Emergency, "No of days" otherwise (SRS §5.3 step 6) */
  etaLabel = computed(() =>
    this.isEmergencyJobType(this.pageContext()?.jobTypeKey) ? 'No of hours' : 'No of days',
  );

  /** Tab highlight flags (SRS §5.2 step 7) */
  isNewEstimate = computed(() => this.pageContext()?.isNewEstimate ?? false);
  isNewNote = computed(() => this.pageContext()?.isNewNote ?? false);
  isNewFile = computed(() => this.pageContext()?.isNewFileAndAttachment ?? false);

  // ═══════════════════════════════════════════════════════════════
  //  REACTIVE FORMS
  // ═══════════════════════════════════════════════════════════════

  /** Section B — Vendor Selection Form (SRS §8) */
  vendorForm!: FormGroup;

  /** Section D — Vendor Search Panel (SRS §10) */
  searchForm!: FormGroup;

  /** WF-8 — Quick Vendor Creation (SRS §20) */
  quickVendorForm!: FormGroup;

  /** WF-9 — Vendor Notes (SRS §21) */
  vendorNoteForm!: FormGroup;

  /** WF-5 — Pin Vendor (SRS §17) */
  pinForm!: FormGroup;

  // ═══════════════════════════════════════════════════════════════
  //  GRID COLUMN DEFINITIONS
  // ═══════════════════════════════════════════════════════════════

  readonly assignedColumns: GridColumn[] = [
    {
      field: 'vendorName', header: 'Company Name', width: '20%',
      type: 'vendor-name',
      linkBaseUrl: environment.legacyAdminBaseUrl,
      categoryField: 'vCategory',
      categoryColorField: 'vCategorycolor',
      primaryMarkerField: 'primaryVendorMarker',
      defaultField: 'isDefault',
      deletedField: 'isDelete',
      contractHandler: (row: Record<string, unknown>) => this.onShowVendorPacket(row),
      setDefaultHandler: (row: Record<string, unknown>) => this.onSetVendorAsDefault(row),
    },
    {
      field: 'isDelete', header: 'Active/Inactive', headerLines: ['Active/', 'Inactive'], width: '8%',
      type: 'vendor-status',
      deletedField: 'isDelete',
      reassignHandler: (row: Record<string, unknown>) => this.onReassignFromInactive(row),
      unassignHandler: (row: Record<string, unknown>) => this.onUnassignVendor(row),
    },
    { field: 'jobCount', header: 'Qty of Jobs', width: '7%', type: 'jobcount-label', htmlField: 'vendorLabel' },
    { field: 'enteredDate', header: 'Date Registered', width: '6%' },
    {
      field: 'vendorAddress', header: 'Address', width: '11%',
      formatter: (value: unknown) => this.cleanAddress(String(value ?? '')),
    },
    {
      field: 'contactName', header: 'Contact', width: '11%', sortable: false, type: 'contact-detail',
      vendorLoginUrlBuilder: (row: Record<string, unknown>) => this.buildVendorLoginUrl(row),
      sendMessageHandler: (row: Record<string, unknown>) => this.onOpenNotesActivityModal(row),
    },
    { field: 'radiusInMiles', header: 'Radius', width: '5%', type: 'miles' },
    { field: 'distanceFromLocation', header: 'Distance', width: '6%', type: 'miles' },
    {
      field: 'serviceCallMinimum', header: 'Svc Call Min', width: '8%',
      hideZero: true,
      badgeField: 'highCost', badgeExcludeValue: '--', badgeLabel: 'High Cost', badgeColor: '#F82F2F',
      rateHandler: (row: Record<string, unknown>) => this.onShowVendorRates(row),
      noteHandler: (row: Record<string, unknown>) => this.onOpenNotes(row['vendorKey'] as string),
      noteTooltipLoader: (row: Record<string, unknown>) => this.loadNoteTooltip(row),
    },
    { field: 'tradeList', header: 'Trade', width: '10%', type: 'truncate', truncateLength: 25 },
  ];

  // Figma node 1:1151 — "Internal vendors in radius" (Scorecard Agent) table
  readonly vendorListColumns: GridColumn[] = [
    {
      field: '_maybeNo', header: 'Maybe / No', width: '7%', sortable: false,
      type: 'maybe-no',
      noHandler:    (row: Record<string, unknown>) => this.onOpenPinModal(row, 'No'),
      maybeHandler: (row: Record<string, unknown>) => this.onOpenPinModal(row, 'Maybe'),
    },
    {
      field: 'score', header: 'Score', width: '6%', sortable: false,
      type: 'score',
      scoreLetterField:   'scoreLetter',
      scoreColorField:    'scoreColor',
      scoreTierField:     'scoreTier',
      scoreWorkloadField: 'workloadFlag',
      scorePillarField:   'pillarScores',
      scoreUnscoredField: 'unscoredRankScore',
      scoreSignalField:   'signalScores',
      scoreClickHandler:  (row) => this.onOpenScoreModal(row),
    },
    {
      field: 'vendorName', header: 'Company Name', width: '20%',
      type: 'vendor-company',
      categoryField: 'vCategory',
      categoryColorField: 'vCategorycolor',
      emailField: 'email',
      emailClickHandler: (row) =>
        this.onNavigateToNotesActivity({
          tab: 'vendor',
          vendorKey: String(row['vendorKey'] ?? ''),
          email: String(row['email'] ?? ''),
        }),
      companyLinkHandler: (row) => this.legacyVendorEditUrl(row['vendorKey'] as string),
      vendorLoginHandler: (row) => this.onVendorLogin(row),
    },
    {
      field: 'contactName', header: 'Vendor', width: '13%', sortable: false,
      type: 'vendor-contact-cell',
      phoneField: 'phone',
    },
    { field: 'radiusInMiles', header: 'Radius', width: '6%', type: 'miles' },
    { field: 'distanceFromLocation', header: 'Distance', width: '7%', type: 'miles' },
    {
      field: 'serviceCallMinimum', header: 'SVC Call Min', headerLines: ['SVC Call', 'Min'], width: '10%',
      type: 'svc-call',
      hideZero: true,
      rateHandler: (row: Record<string, unknown>) => this.onShowVendorRates(row),
      noteHandler: (row: Record<string, unknown>) => this.onOpenNotes(row['vendorKey'] as string),
      noteTooltipLoader: (row: Record<string, unknown>) => this.loadNoteTooltip(row),
    },
    {
      field: 'tradeList', header: 'Trade', width: '12%',
      type: 'trade-badge',
      tradeClickHandler: (row) => this.onViewTrade(row),
    },
  ];

  // Figma node 1:1151 — "Vendors Who Previously Serviced This Location" table
  readonly locationHistoryColumns: GridColumn[] = [
    { field: 'jobCount', header: 'Qty Jobs', width: '6%', type: 'jobcount-label', htmlField: 'vendorLabel' },
    {
      field: 'score', header: 'Score', width: '6%', sortable: false,
      type: 'score',
      scoreTierField:     'scoreTier',
      scoreWorkloadField: 'workloadFlag',
      scorePillarField:   'pillarScores',
      scoreUnscoredField: 'unscoredRankScore',
      scoreSignalField:   'signalScores',
      scoreClickHandler:  (row) => this.onOpenScoreModal(row),
    },
    {
      field: 'vendorName', header: 'Company Name', width: '20%',
      type: 'vendor-company',
      categoryField: 'vCategory',
      categoryColorField: 'vCategorycolor',
      emailField: 'email',
      emailClickHandler: (row) =>
        this.onNavigateToNotesActivity({
          tab: 'vendor',
          vendorKey: String(row['vendorKey'] ?? ''),
          email: String(row['email'] ?? ''),
        }),
      companyLinkHandler: (row) => this.legacyVendorEditUrl(row['vendorKey'] as string),
      vendorLoginHandler: (row) => this.onVendorLogin(row),
    },
    {
      field: 'contactName', header: 'Vendor', width: '13%', sortable: false,
      type: 'vendor-contact-cell',
      phoneField: 'phone',
    },
    { field: 'radiusInMiles', header: 'Radius', width: '6%', type: 'miles' },
    { field: 'distanceFromLocation', header: 'Distance', width: '6%', type: 'miles' },
    {
      field: 'serviceCallMinimum', header: 'SVC Call Min', headerLines: ['SVC Call', 'Min'], width: '10%',
      type: 'svc-call',
      hideZero: true,
      rateHandler: (row: Record<string, unknown>) => this.onShowVendorRates(row),
      noteHandler: (row: Record<string, unknown>) => this.onOpenNotes(row['vendorKey'] as string),
      noteTooltipLoader: (row: Record<string, unknown>) => this.loadNoteTooltip(row),
    },
    {
      field: 'tradeList', header: 'Trade', width: '12%',
      type: 'trade-badge',
      tradeClickHandler: (row) => this.onViewTrade(row),
    },
  ];

  /** Browse / "All Vendors" search rows (VendorListItem shape). Uses same scorecard columns as vendorListColumns. */
  readonly searchResultColumns: GridColumn[] = [
    {
      field: '_maybeNo', header: 'Maybe / No', width: '7%', sortable: false,
      type: 'maybe-no',
      noHandler:    (row: Record<string, unknown>) => this.onOpenPinModal(row, 'No'),
      maybeHandler: (row: Record<string, unknown>) => this.onOpenPinModal(row, 'Maybe'),
    },
    {
      field: 'score', header: 'Score', width: '6%', sortable: false,
      type: 'score',
      scoreLetterField:   'scoreLetter',
      scoreColorField:    'scoreColor',
      scoreTierField:     'scoreTier',
      scoreWorkloadField: 'workloadFlag',
      scorePillarField:   'pillarScores',
      scoreUnscoredField: 'unscoredRankScore',
      scoreSignalField:   'signalScores',
      scoreClickHandler:  (row) => this.onOpenScoreModal(row),
    },
    {
      field: 'vname', header: 'Company Name', width: '20%',
      type: 'vendor-company',
      categoryField: 'vendorStatName',
      categoryColorField: 'vendorStatColor',
      emailField: 'email',
      emailClickHandler: (row) =>
        this.onNavigateToNotesActivity({
          tab: 'vendor',
          vendorKey: String(row['vendorKey'] ?? ''),
          email: String(row['email'] ?? ''),
        }),
      companyLinkHandler: (row) => this.legacyVendorEditUrl(row['vendorKey'] as string),
      vendorLoginHandler: (row) => this.onVendorLogin(row),
    },
    {
      field: 'contactName', header: 'Vendor', width: '13%', sortable: false,
      type: 'vendor-contact-cell',
      phoneField: 'phone',
    },
    { field: 'radiusInMiles', header: 'Radius', width: '6%', type: 'miles' },
    { field: 'distanceFromLocation', header: 'Distance', width: '7%', type: 'miles' },
    {
      field: 'serviceCallMinimum', header: 'SVC Call Min', headerLines: ['SVC Call', 'Min'], width: '10%',
      type: 'svc-call',
      hideZero: true,
      rateHandler: (row: Record<string, unknown>) => this.onShowVendorRates(row),
      noteHandler: (row: Record<string, unknown>) => this.onOpenNotes(row['vendorKey'] as string),
      noteTooltipLoader: (row: Record<string, unknown>) => this.loadNoteTooltip(row),
    },
    { field: 'tName', header: 'Trade', width: '14%', type: 'truncate', truncateLength: 20 },
  ];

  readonly searchResultActions = [
    {
      label: 'Assign & Send W/O',
      variant: 'primary' as const,
      handler: (row: Record<string, unknown>) => this.onSendAndSelectWorkOrder(row),
      visibleWhen: (row: Record<string, unknown>) => row['isVendorAssigned'] !== true,
      loadingWhen: (row: Record<string, unknown>) =>
        this.sendAndSelectWorkOrderLoadingVendorKey() === row['vendorKey'],
    },
    {
      label: 'Selected',
      variant: 'chip' as const,
      handler: () => {},
      visibleWhen: (row: Record<string, unknown>) => row['isVendorAssigned'] === true,
    },
  ];

  readonly pinnedColumns: GridColumn[] = [
    ...this.vendorListColumns.map(col => {
      if (col.field === '_maybeNo') {
        return {
          ...col,
          maybeNoSelectedField: '_pinChoice',
          maybeNoReadOnly: true,
          noHandler: undefined,
          maybeHandler: undefined,
        };
      }
      return col;
    }),
  ];

  // ═══════════════════════════════════════════════════════════════
  //  GRID ROW ACTIONS
  // ═══════════════════════════════════════════════════════════════

  readonly vendorListActions = [
    {
      label: 'Assign & Send W/O',
      variant: 'primary' as const,
      cssClass: 'btnCustomClass',
      handler: (row: Record<string, unknown>) => this.onSendAndSelectWorkOrder(row),
      visibleWhen: (row: Record<string, unknown>) => row['isVendorAssigned'] !== true,
      loadingWhen: (row: Record<string, unknown>) =>
        this.sendAndSelectWorkOrderLoadingVendorKey() === row['vendorKey'],
    },
    {
      label: 'Selected',
      variant: 'chip' as const,
      handler: () => {},
      visibleWhen: (row: Record<string, unknown>) => row['isVendorAssigned'] === true,
    },
  ];

  readonly locationHistoryActions = [
    {
      label: 'Assign & Send W/O',
      variant: 'primary' as const,
      cssClass: 'btnCustomClass',
      handler: (row: Record<string, unknown>) => this.onSendAndSelectWorkOrder(row),
      visibleWhen: (row: Record<string, unknown>) => row['isVendorAssigned'] !== true,
      loadingWhen: (row: Record<string, unknown>) =>
        this.sendAndSelectWorkOrderLoadingVendorKey() === row['vendorKey'],
    },
    {
      label: 'Already selected',
      variant: 'chip' as const,
      handler: () => {},
      visibleWhen: (row: Record<string, unknown>) => row['isVendorAssigned'] === true,
    },
  ];

  readonly pinnedActions = [
    {
      label: 'View Note',
      variant: 'default' as const,
      handler: (row: Record<string, unknown>) => this.onViewPinnedNote(row),
      visibleWhen: (row: Record<string, unknown>) => !!row['notes'] || !!row['noMaybe'],
    },
    {
      label: 'Assign & Send W/O',
      variant: 'primary' as const,
      cssClass: 'btnCustomClass',
      handler: (row: Record<string, unknown>) => this.onSendAndSelectWorkOrder(row),
      visibleWhen: (row: Record<string, unknown>) => row['isVendorAssigned'] !== true,
      loadingWhen: (row: Record<string, unknown>) =>
        this.sendAndSelectWorkOrderLoadingVendorKey() === row['vendorKey'],
    },
    {
      label: 'Unpin',
      variant: 'danger' as const,
      handler: (row: Record<string, unknown>) => this.onUnpinVendor(row),
    },
  ];

  // ═══════════════════════════════════════════════════════════════
  //  AI SOURCING AGENT — GRID COLUMNS & ACTIONS
  // ═══════════════════════════════════════════════════════════════

  /** Tooltip for the recruitment Email button in the AI sourcing grid. */
  readonly aiRecruitEmailButtonTooltip =
    'Automatically emails this vendor an invite to register and accept the service request. ' +
    "If no email is on file, the message is copied so you can paste it into the vendor's website contact form shown in bottom of the pop-up on click.";

  readonly aiSourcingColumns: GridColumn[] = [
    {
      field: 'company_name', header: 'Company Name', width: '17%',
      type: 'ai-vendor-name',
    },
    {
      field: 'relevance_score',
      header: 'Relevance Score',
      headerLines: ['Relevance', 'Score'],
      headerTooltip: 'Most relevant vendor for trade,',
      width: '6%',
      type: 'relevance-percent',
    },
    { field: 'distance_miles', header: 'Distance', width: '5%', type: 'miles' },
    {
      field: 'trades', header: 'Trade', width: '14%',
      type: 'ai-trade',
    },
    {
      field: 'phone', header: 'Phone', width: '7%',
      type: 'ai-phone',
    },
    {
      field: 'email', header: 'Email', width: '14%',
      type: 'ai-email',
      emailSaveHandler: (row: Record<string, unknown>, email: string) =>
        this.persistAiSourcingVendorEmail(row, email),
      emailActionButton: {
        label: 'Email',
        variant: 'mail',
        tooltip: this.aiRecruitEmailButtonTooltip,
        handler: (row: Record<string, unknown>) => this.onOpenRecruitEmail(row),
      },
    },
    {
      field: 'website_enrichment.contact_form_url',
      header: 'Contact Page',
      headerLines: ['Contact', 'Page'],
      width: '6%',
      type: 'link',
      linkCopyOnClick: (row: Record<string, unknown>) => this.getPlainTextForContactFormClipboard(row),
    },
    {
      field: '_info', header: 'Info', width: '7%',
      type: 'ai-info',
      sortable: false,
      infoHandler: (row: Record<string, unknown>) => this.onOpenAIVendorInfo(row),
    },
  ];

  // ═══════════════════════════════════════════════════════════════
  //  ROW HIGHLIGHTING (SRS §7.3)
  // ═══════════════════════════════════════════════════════════════

  assignedRowClass = (row: Record<string, unknown>): string => {
    if (row['isDefault']) return 'row--default-vendor';
    if (row['isPrimaryVendor']) return 'row--primary-vendor';
    if (row['isFullConsolidator']) return 'row--full-consolidator';
    if (row['isPossibleConsolidator']) return 'row--possible-consolidator';
    return '';
  };

  /** Row highlighting for Add Vendor search / location history grids. */
  vendorListRowClass = (row: Record<string, unknown>): string => {
    if (row['fullConsolidator'] === true || row['isFullConsolidator'] === true) {
      return 'row--full-consolidator';
    }
    if (row['possibleConsolidator'] === true || row['isPossibleConsolidator'] === true) {
      return 'row--possible-consolidator';
    }
    const label = this.formatConsolidatorLabel(
      typeof row['consolidator'] === 'string' ? row['consolidator'] : null,
    );
    if (label === 'Full Consolidator') return 'row--full-consolidator';
    if (label === 'Possible consolidator') return 'row--possible-consolidator';
    return '';
  };

  /** Normalizes consolidator labels for display; hides empty and {@code --}. */
  formatConsolidatorLabel(value: string | null | undefined): string | null {
    const trimmed = (value ?? '').trim();
    if (!trimmed || trimmed === '--') return null;
    return trimmed;
  }

  getPriorityClass(priority: string | null): string {
    const lower = (priority ?? '').toLowerCase().trim();
    if (lower.includes('emergency')) return 'emergency';
    if (lower.includes('standard')) return 'standard';
    if (lower.includes('high')) return 'high';
    if (lower.includes('medium')) return 'medium';
    if (lower.includes('low')) return 'low';
    return 'default';
  };

  boundOnReassignFromInactive = (row: Record<string, unknown>): void => {
    this.onReassignFromInactive(row);
  };

  boundOnUnassignVendor = (row: Record<string, unknown>): void => {
    this.onUnassignVendor(row);
  };

  // ═══════════════════════════════════════════════════════════════
  //  LIFECYCLE
  // ═══════════════════════════════════════════════════════════════

  ngOnInit(): void {
    // Component-lifetime setup that must run exactly once. The per-job load below can fire
    // repeatedly when the :jobKey param changes while this instance is reused (Angular reuses
    // the component when only a route param changes — e.g. Quick Job's "Save and Route to
    // Assign Vendor" navigating here while already on an assign-vendor page).
    this.subscribeToDataStreams();
    document.addEventListener('visibilitychange', this.onPageVisibilityRefresh);
    window.addEventListener('focus', this.onWindowFocusRefresh);

    this.route.paramMap
      .pipe(
        map((pm) => pm.get('jobKey') ?? ''),
        distinctUntilChanged(),
        takeUntil(this.destroy$),
      )
      .subscribe((jobKey) => this.loadForJobKey(jobKey));
  }

  /**
   * Loads (or reloads) everything scoped to a single job. Called on first init and again
   * whenever the :jobKey route param changes on a reused component instance. Tears down the
   * previous job's per-job state (polling, form edits) before loading the new one so a job
   * switch never shows stale data or leaves a duplicate poll running.
   */
  private loadForJobKey(jobKey: string): void {
    // Stop the previous job's poll and clear any editable per-job form state before switching.
    this.jobDetailsPollingStop$.next();
    this.buildForms();

    this.jobKey.set(jobKey);
    this.errorMessage.set('');

    if (!jobKey) {
      this.errorMessage.set('No job key provided. Please navigate from a valid job.');
      return;
    }

    this.loadAndApplyScores(jobKey);
    this.runFormLoadWithUplineCheck(jobKey);
    this.startJobDetailsPolling();
  }

  // ════════════════════════════════════════════════════════════════
  // SAVE (NTE) BUTTON
  // ════════════════════════════════════════════════════════════════

  // ════════════════════════════════════════════════════════════════
  // REASSIGN INACTIVE VENDOR
  // ════════════════════════════════════════════════════════════════

  onReassignInactiveVendor(vendor: AssignedVendorDetail): void {
    const jobKey = this.jobKey();
    if (!jobKey) {
      this.errorMessage.set('Missing job key.');
      return;
    }

    // Store vendor and show modal for user to choose reassign option
    this.reassignVendor.set(vendor);
    this.showReassignModal.set(true);
    this.successMessage.set('');
    this.errorMessage.set('');
  }

  /** Handle reassign with status reset (reset to "Pending ETA" and clear schedule dates) */
  onReassignWithReset(): void {
    this.executeReassignVendor(false, true);
  }

  /** Handle reassign without reset (keep current status and schedule) */
  onReassignWithoutReset(): void {
    this.executeReassignVendor(false, false);
  }

  /** Cancel reassign modal */
  onCancelReassign(): void {
    this.showReassignModal.set(false);
    this.reassignVendor.set(null);
  }

  /** Both flags sent explicitly so backend logs intent (reset defaults to true if omitted). */
  private buildReassignFromInactiveRequest(
    jobKey: string,
    jobVendorKey: string,
    options: { restorePreviousState: boolean; resetStatusAndSchedule: boolean },
  ): ReassignVendorFromInactiveRequest {
    return { jobKey, jobVendorKey, ...options };
  }

  /** Execute the reassign vendor API call */
  private executeReassignVendor(restorePreviousState: boolean, resetStatusAndSchedule: boolean): void {
    const vendor = this.reassignVendor();
    const jobKey = this.jobKey();

    if (!vendor || !jobKey) {
      this.errorMessage.set('Missing vendor or job information.');
      return;
    }

    this.showReassignModal.set(false);
    this.reassignProcessing.set(true);

    const request = this.buildReassignFromInactiveRequest(jobKey, vendor.jobVendorKey, {
      restorePreviousState,
      resetStatusAndSchedule,
    });

    this.assignVendorSvc
      .reassignFromInactive(request)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.reassignProcessing.set(false);
          if (res.status) {
            this.successMessage.set(
              res.message?.trim()
                || (resetStatusAndSchedule
                  ? `${vendor.vendorName} has been reassigned with status reset to Pending ETA.`
                  : `${vendor.vendorName} has been reassigned with current status preserved.`),
            );
            // Refresh data
            this.assignVendorSvc.loadJobHeaderDetail(jobKey).pipe(takeUntil(this.destroy$)).subscribe();
            if (this.lastVendorListLoader) {
              this.lastVendorListLoader();
            }
          } else {
            this.errorMessage.set(res.message || 'Failed to reassign vendor.');
          }
          this.reassignVendor.set(null);
        },
        error: (err) => {
          this.reassignProcessing.set(false);
          this.errorMessage.set(err.error?.message || err.message || 'Unknown error');
          this.reassignVendor.set(null);
        },
      });
  }

  // ════════════════════════════════════════════════════════════════
  // DUPLICATE JOB
  // ════════════════════════════════════════════════════════════════

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
    this.assignVendorSvc.getCustomerLocations(customerKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe((res: any) => {
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
    const jobKey = this.jobKey();
    const locationKey = this.duplicateSelectedLoc();
    if (!jobKey || !locationKey) return;
    this.duplicateSaving.set(true);
    this.duplicateMessage.set(null);
    this.duplicateError.set(null);
    const req: DuplicateJobRequest = { jobKey, locationKey };
    this.assignVendorSvc.duplicateJob(req)
      .pipe(takeUntil(this.destroy$))
      .subscribe((res: any) => {
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

  ngOnDestroy(): void {
    if (this.waitPopupTimeoutId != null) {
      clearTimeout(this.waitPopupTimeoutId);
      this.waitPopupTimeoutId = null;
    }
    if (this.jobDetailsRefreshDebounceId != null) {
      clearTimeout(this.jobDetailsRefreshDebounceId);
      this.jobDetailsRefreshDebounceId = null;
    }
    this.jobDetailsPollingStop$.next();
    document.removeEventListener('visibilitychange', this.onPageVisibilityRefresh);
    window.removeEventListener('focus', this.onWindowFocusRefresh);
    this.aiSourcingPolling.set(false);
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ═══════════════════════════════════════════════════════════════
  //  FORM BUILDERS
  // ═══════════════════════════════════════════════════════════════

  private buildForms(): void {
    this.buildVendorForm();
    this.buildSearchForm();
    this.buildQuickVendorForm();
    this.buildVendorNoteForm();
    this.buildPinForm();
  }

  /** SRS §8.1 — Vendor Selection Form */
  private buildVendorForm(): void {
    this.vendorForm = this.fb.group({
      vendorKey: ['', Validators.required],
      contactKey: ['', Validators.required],
    });
  }

  /** SRS §10 — Vendor Search Panel */
  private buildSearchForm(): void {
    this.searchForm = this.fb.group({
      radius: [70, [Validators.required, Validators.min(0.01)]],
      searchType: [1],
    });
  }

  /** SRS §20.3 / §25.3 — Quick Vendor Creation with all validation rules */
  private buildQuickVendorForm(): void {
    this.quickVendorForm = this.fb.group(
      {
        companyName: ['', Validators.required],
        companyemail: ['', [Validators.required, Validators.email]],
        phone: ['', Validators.required],
        address: ['', Validators.required],
        address1: [''],
        stateKey: [0, [Validators.required, Validators.min(1)]],
        cityKey: [0, [Validators.required, Validators.min(1)]],
        zip: ['', Validators.required],
        tradeKey: ['', Validators.required],
        contactName: ['', Validators.required],
        contactemail: ['', [Validators.required, Validators.email]],
        flatTrip: [0],
        standardHourly: [0],
        helperStandard: [0],
        emergencyFlat: [0],
        emergencyStandard: [0],
        emergencyHelper: [0],
        wcom: [null as boolean | null, Validators.required],
        genL: [null as boolean | null, Validators.required],
        accName: [''],
        accEmail: [''],
        accPhone: [''],
      },
      { validators: AssignVendorComponent.accountingFieldsValidator },
    );
  }

  /** SRS §21.4 / §25.4 — Vendor Notes Form */
  private buildVendorNoteForm(): void {
    this.vendorNoteForm = this.fb.group({
      noteKey: [''],
      vendorKey: ['', Validators.required],
      noteTitle: ['', Validators.required],
      notesDetail: ['', Validators.required],
      newNote: [1],
    });
  }

  /** SRS §17.2 — Pin Vendor Form */
  private buildPinForm(): void {
    this.pinForm = this.fb.group({
      vendorKey: ['', Validators.required],
      vendorName: [''],
      noMaybe: ['No'],
      notes: [''],
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  CROSS-FIELD VALIDATORS
  // ═══════════════════════════════════════════════════════════════

  /**
   * SRS §25.3: "If ANY accounting field filled, ALL three required."
   * Message: "Please fill all accounting contact fields"
   */
  static accountingFieldsValidator(group: AbstractControl): ValidationErrors | null {
    const name = group.get('accName')?.value?.trim();
    const email = group.get('accEmail')?.value?.trim();
    const phone = group.get('accPhone')?.value?.trim();
    const any = !!name || !!email || !!phone;
    const all = !!name && !!email && !!phone;
    if (any && !all) {
      return { accountingIncomplete: true };
    }
    return null;
  }

  // ═══════════════════════════════════════════════════════════════
  //  VALIDATION ERROR MESSAGES (SRS §25)
  // ═══════════════════════════════════════════════════════════════

  /** Format a tel: value for display (strip tel: prefix, optional US formatting). */
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

  /** Returns the first validation error message for a control (client or server). */
  getErrorMessage(form: FormGroup, field: string): string {
    const control = form.get(field);
    if (!control || !control.errors || !control.touched) return '';

    if (control.errors['serverError']) {
      return control.errors['serverError'];
    }
    if (control.errors['required']) {
      return this.requiredMessages[field] ?? 'This field is required';
    }
    if (control.errors['email']) {
      return field === 'contactemail'
        ? 'Please enter valid Contact Email'
        : 'Please enter a valid email address';
    }
    if (control.errors['min']) {
      return field === 'radius' ? 'Please enter a valid number' : 'Value must be positive';
    }
    return '';
  }

  /** SRS §25.1 / §25.3 — exact error wording per field */
  private readonly requiredMessages: Record<string, string> = {
    vendorKey: 'Please select a vendor',
    contactKey: 'Please select a contact person',
    radius: 'Please enter a radius value',
    companyName: 'Please enter Company Name',
    companyemail: 'Please enter a valid email address',
    phone: 'Please enter Phone',
    address: 'Please enter Address',
    stateKey: 'Please select State',
    cityKey: 'Please select City',
    zip: 'Please enter ZIP',
    tradeKey: 'Please select a Trade',
    contactName: 'Please enter Contact Name',
    contactemail: 'Please enter valid Contact Email',
    wcom: 'Please select Workers Compensation / General Liability',
    genL: 'Please select Workers Compensation / General Liability',
    noteTitle: 'Please enter a title',
    notesDetail: 'Please enter note details',
  };

  // ═══════════════════════════════════════════════════════════════
  //  DATA STREAM SUBSCRIPTIONS
  // ═══════════════════════════════════════════════════════════════

  private subscribeToDataStreams(): void {
    this.assignVendorSvc.pageContext$
      .pipe(takeUntil(this.destroy$))
      .subscribe((ctx) => {
        if (this.tradeSaving() && ctx) {
          const current = this.pageContext();
          this.pageContext.set(
            current ? { ...ctx, tradeKey: current.tradeKey, tradeName: current.tradeName } : ctx,
          );
          return;
        }
        this.pageContext.set(ctx);
      });

    this.assignVendorSvc.jobHeaderDetail$
      .pipe(takeUntil(this.destroy$))
      .subscribe((hd) => {
        this.jobHeaderDetail.set(hd);
        if (hd) {
          this.syncNteDisplay(hd);

          this.applyJobPriorityOptions(
            this.jobPriorityOptions(),
            hd,
            this.pageContext(),
            !this.isJobPriorityEditInProgress(),
          );
          this.applyCustomerRequestorOptions(
            this.customerRequestorOptions(),
            hd,
            !this.customerRequestorSaving(),
          );

          // Auto-select default vendor if no selection exists
          if (!this.selectedVendorDetailKey()) {
            const defaultVendor = hd.assignedVendors.find((v) => v.isDefault);
            if (defaultVendor) {
              this.selectedVendorDetailKey.set(defaultVendor.vendorKey);
            } else if (hd.assignedVendors[0]) {
              this.selectedVendorDetailKey.set(hd.assignedVendors[0].vendorKey);
            }
          }

          this.syncVendorScheduleDrafts(hd.assignedVendors);
        }
      });

    this.assignVendorSvc.assignedVendors$
      .pipe(takeUntil(this.destroy$))
      .subscribe((v) => this.assignedVendors.set(v));

    this.assignVendorSvc.locationHistory$
      .pipe(takeUntil(this.destroy$))
      .subscribe((v) => {
        this.locationHistoryVendors.set(v);
        if (v.length > 0) {
          const key = v[0].jobKey ?? this.jobKey();
          if (key) {
            this.loadAndApplyScores(
              key,
              v.map((row) => row.vendorKey).filter((vk): vk is string => !!vk),
            );
          }
        }
      });

    this.assignVendorSvc.defaultVendors$
      .pipe(takeUntil(this.destroy$))
      .subscribe((v) => {
        this.defaultVendors.set(v);
        if (v.length > 0) {
          const key = v[0].jobKey ?? this.jobKey();
          if (key) {
            this.loadAndApplyScores(
              key,
              v.map((row) => row.vendorKey).filter((vk): vk is string => !!vk),
            );
          }
        }
      });

    this.assignVendorSvc.searchResults$
      .pipe(takeUntil(this.destroy$))
      .subscribe((v) => {
        this.searchResults.set(v);
        if (v.length > 0) {
          const key = (v[0] as unknown as Record<string, unknown>)['jobKey'] as string | undefined
            ?? this.jobKey();
          if (key) {
            this.loadAndApplyScores(
              key,
              v.map((row) => row.vendorKey).filter((vk): vk is string => !!vk),
            );
          }
        }
      });

    this.assignVendorSvc.pinnedVendors$
      .pipe(takeUntil(this.destroy$))
      .subscribe((v) => {
        this.pinnedVendors.set(v);
        const nextCache = { ...this.pinnedNoMaybeCache() };
        let changed = false;
        for (const row of v) {
          const key = (row.vendorKey ?? '').toLowerCase();
          const nameKey = (row.vendorName ?? '').trim().toLowerCase();
          const choice = row.noMaybe?.trim();
          if (choice) {
            if (key) nextCache[key] = choice;
            if (nameKey) nextCache[`name:${nameKey}`] = choice;
            changed = true;
          }
        }
        if (changed) this.pinnedNoMaybeCache.set(nextCache);
      });

    this.assignVendorSvc.vendorDropdown$
      .pipe(takeUntil(this.destroy$))
      .subscribe((v) => this.vendorDropdown.set(v));

    this.assignVendorSvc.contactDropdown$
      .pipe(takeUntil(this.destroy$))
      .subscribe((v) => this.contactDropdown.set(v));

    this.assignVendorSvc.tradeDropdown$
      .pipe(takeUntil(this.destroy$))
      .subscribe((v) => this.tradeDropdown.set(v));

    this.assignVendorSvc.stateDropdown$
      .pipe(takeUntil(this.destroy$))
      .subscribe((v) => this.stateDropdown.set(v));

    this.assignVendorSvc.cityDropdown$
      .pipe(takeUntil(this.destroy$))
      .subscribe((v) => this.cityDropdown.set(v));

    this.assignVendorSvc.loading$
      .pipe(takeUntil(this.destroy$))
      .subscribe((v) => this.isLoading.set(v));

    this.assignVendorSvc.aiSourcingVendors$
      .pipe(takeUntil(this.destroy$))
      .subscribe((v) => this.aiSourcingVendors.set(v));

    this.assignVendorSvc.aiSourcingStatus$
      .pipe(takeUntil(this.destroy$))
      .subscribe((s) => this.aiSourcingStatus.set(s));
  }

  // ═══════════════════════════════════════════════════════════════
  //  INITIAL DATA LOADING (SRS §5.3)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Form load: check upline approval first, then branch. When upline is 0 or 2 we load data;
   * when 0 we also run create-vendor-context and possibly check-primary-vendor-intro.
   */
  private runFormLoadWithUplineCheck(jobKey: string): void {
    this.assignVendorSvc
      .checkUplineApproval(jobKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          const value = typeof res?.data === 'number' ? res.data : -1;
          if (value === 0) {
            this.loadInitialData(jobKey, () => this.runCreateVendorContextAndIntroCheck(jobKey));
          } else if (value === 2) {
            this.loadInitialData(jobKey);
          } else {
            this.showUplineModal.set(true);
            this.loadInitialData(jobKey);
          }
        },
        error: () => {
          this.errorMessage.set('Failed to check upline approval. Please try again.');
        },
      });
  }

  /**
   * After page load when upline returned 0: call create-vendor-context; if FromCustomer===1 and
   * MinutesLeft<=4, call check-primary-vendor-intro and handle "1" / "2" (popup + block 3 min + reload).
   */
  private runCreateVendorContextAndIntroCheck(jobKey: string): void {
    this.assignVendorSvc
      .getCreateVendorContext(jobKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (!res?.status || !res.data) return;
          const ctx = res.data;
          const fromCustomer = ctx.fromCustomer === 1;
          const minutesLeft = ctx.minutesLeft ?? ctx.jobVendorModel?.minutesLeft ?? 0;
          if (!fromCustomer || minutesLeft > 4) return;

          this.assignVendorSvc
            .checkPrimaryVendorIntro(jobKey)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
              next: (introRes) => {
                const data = introRes?.data;
                const code = typeof data === 'string' ? data : String(data ?? '');
                if (code === '1') {
                  this.waitPopupMessage.set(
                    'This job is in process of assigning primary vendor from the system. Please wait for few minutes to proceed with this job...'
                  );
                  this.showWaitPopup.set(true);
                  this.formBlockedByWait.set(true);
                  this.scheduleWaitPopupReload(jobKey);
                } else if (code === '2') {
                  this.waitPopupMessage.set(
                    'This job is in process of emergency broadcast from the system. Please wait for few minutes to proceed with this job...'
                  );
                  this.showWaitPopup.set(true);
                  this.formBlockedByWait.set(true);
                  this.scheduleWaitPopupReload(jobKey);
                }
              },
            });
        },
      });
  }

  /** Schedules reload after 3 minutes and clears wait popup / form block. */
  private scheduleWaitPopupReload(jobKey: string): void {
    if (this.waitPopupTimeoutId != null) clearTimeout(this.waitPopupTimeoutId);
    this.waitPopupTimeoutId = setTimeout(() => {
      this.waitPopupTimeoutId = null;
      this.showWaitPopup.set(false);
      this.formBlockedByWait.set(false);
      this.waitPopupMessage.set('');
      this.loadInitialData(jobKey);
    }, 3 * 60 * 1000);
  }

  /** Upline modal: Cancel — close modal. */
  onUplineCancel(): void {
    this.showUplineModal.set(false);
    this.showUplineOverrideSection.set(false);
    this.uplineOverrideReason.set('');
  }

  /** Upline modal: Override Upline Approval — show reason section. */
  onUplineOverrideClick(): void {
    this.showUplineOverrideSection.set(true);
  }

  /** Upline modal: Save override — call save-upline-override then close. */
  onUplineSave(): void {
    const reason = this.uplineOverrideReason().trim();
    if (!reason) return;
    const jobKey = this.jobKey();
    const adminKey = this.authTokenSvc.getAdminKeyFromToken();
    if (!adminKey) {
      this.errorMessage.set('Unable to identify logged-in admin. Please log in again.');
      return;
    }
    this.uplineOverrideSaving.set(true);
    this.assignVendorSvc
      .saveUplineOverride({ jobKey, reason, adminKey })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.uplineOverrideSaving.set(false);
          if (res?.status) {
            this.onUplineCancel();
          } else {
            this.errorMessage.set(res?.message ?? 'Failed to save upline override.');
          }
        },
        error: () => {
          this.uplineOverrideSaving.set(false);
          this.errorMessage.set('Failed to save upline override. Please try again.');
        },
      });
  }

  private loadInitialData(jobKey: string, onSuccess?: () => void): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    // Load vendor list independently — it's slow and shouldn't block the page.
    // Initial page load uses vendors-no-radius; "Search Vendors" still uses the search form (type 1 → vendors-in-radius).
    this.assignVendorSvc
      .loadVendorsNoRadius(jobKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe();

    forkJoin([
      this.assignVendorSvc.loadAssignVendorPage(jobKey),
      this.assignVendorSvc.getActiveVendorsDropdown(jobKey),
      this.assignVendorSvc.loadJobHeaderDetail(jobKey),
      this.assignVendorSvc.getTradeDropdown(),
      this.assignVendorSvc.getStateDropdown(),
      this.assignVendorSvc.getJobStatusList(),
      this.assignVendorSvc.getJobPriorityOptions(),
      this.assignVendorSvc.getCustomerRequestorOptions(jobKey),
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ([pageRes, activeVendorsRes, headerRes, _tradeRes, _stateRes, jobStatuses, jobPriorityOpts, customerRequestorOpts]) => {
          this.jobStatusList.set(Array.isArray(jobStatuses) ? jobStatuses : []);
          const failedLoads: string[] = [];
          const pushFailure = (label: string, res: AssignVendorApiResponse<unknown> | undefined | null) => {
            if (res && !res.status) {
              failedLoads.push(`${this.assignVendorSvc.formatHttpFailureForUi(res)} [grid: ${label}]`);
            }
          };
          pushFailure('assign-page', pageRes);
          pushFailure('active-vendors', activeVendorsRes);
          pushFailure('job-header-detail', headerRes);
          if (failedLoads.length > 0) {
            this.errorMessage.set(this.consolidateParallelLoadFailures(failedLoads));
          }

          const headerData = headerRes?.status ? headerRes.data ?? null : this.jobHeaderDetail();
          if (headerData) {
            this.applyJobPriorityOptions(jobPriorityOpts, headerData, pageRes?.status ? pageRes.data ?? null : null);
            this.applyCustomerRequestorOptions(customerRequestorOpts, headerData);
          }

          this.refreshJobPriorityVendorCheck(jobKey);

          if (pageRes.status && pageRes.data) {
            const page = pageRes.data;

            if (page.customerKey) {
              this.loadCustomerProfileDne(page.customerKey);
            }

            this.assignVendorSvc
              .loadAssignedVendors(jobKey)
              .pipe(takeUntil(this.destroy$))
              .subscribe((assignedRes) => {
                if (!assignedRes?.status) {
                  const line = `${this.assignVendorSvc.formatHttpFailureForUi(assignedRes)} [grid: assigned-vendors]`;
                  this.errorMessage.update((prev) => (prev ? `${prev}\n${line}` : line));
                }
              });
            this.assignVendorSvc
              .loadLocationHistoryVendors(jobKey)
              .pipe(takeUntil(this.destroy$))
              .subscribe((locRes) => {
                if (!locRes?.status) {
                  const line = `${this.assignVendorSvc.formatHttpFailureForUi(locRes)} [grid: location-history]`;
                  this.errorMessage.update((prev) => (prev ? `${prev}\n${line}` : line));
                }
              });
            this.assignVendorSvc
              .loadPinnedVendors(jobKey)
              .pipe(takeUntil(this.destroy$))
              .subscribe((pinRes) => {
                if (!pinRes?.status) {
                  const line = `${this.assignVendorSvc.formatHttpFailureForUi(pinRes)} [grid: pinned-vendors]`;
                  this.errorMessage.update((prev) => (prev ? `${prev}\n${line}` : line));
                }
              });

            this.loadAISourcingData(jobKey);

            if (page.message) {
              this.successMessage.set(page.message);
              setTimeout(() => this.successMessage.set(''), 5000);
            }
          }

          this.isLoading.set(false);
          onSuccess?.();
        },
        error: () => {
          this.errorMessage.set('Failed to load job data. Please try again.');
          this.isLoading.set(false);
        },
      });
  }

  /**
   * When forkJoin loads fail together with the same network unreachable error, show one concise line
   * pointing at {@link environment.apiBaseUrl} instead of repeating full diagnostics per operation.
   */
  private consolidateParallelLoadFailures(lines: string[]): string {
    if (lines.length <= 1) {
      return lines.join('\n');
    }
    const unreachable = lines.every(
      (l) =>
        l.includes('Could not connect to the Job Ops API') ||
        l.includes('Unable to reach the Job Ops API') ||
        l.includes('Unable to reach the server'),
    );
    if (unreachable) {
      return (
        `Could not load this page because the Job Ops API was unreachable (${environment.apiBaseUrl}). ` +
        `If you are not signed in, open Assign Vendor from legacy Admin so the URL includes ?token=. ` +
        `If you are signed in, verify the API is running (especially for localhost), firewall/VPN access, ` +
        `and apiBaseUrl in src/environments/environment.ts. (${lines.length} startup requests failed.)`
      );
    }
    return lines.join('\n');
  }

  // ═══════════════════════════════════════════════════════════════
  //  VENDOR SELECTION HANDLERS (SRS §8.2)
  // ═══════════════════════════════════════════════════════════════

  /** When a vendor is selected from the dropdown — loads contacts & service charge */
  onVendorSelected(): void {
    const vendorKey = this.vendorForm.get('vendorKey')?.value;
    if (!vendorKey) {
      this.vendorForm.patchValue({ contactKey: '' });
      this.contactDropdown.set([]);
      this.selectedVendorDistance.set(null);
      this.selectedVendorServiceCharge.set(null);
      this.selectedVendorConsolidator.set(null);
      this.selectedVendorLaborKey.set('');
      return;
    }

    const vendorOption = this.vendorDropdown().find((v) => v.value === vendorKey);
    this.selectedVendorConsolidator.set(this.formatConsolidatorLabel(vendorOption?.consolidator));

    this.vendorForm.patchValue({ contactKey: '' });
    this.selectedVendorDistance.set(null);
    this.selectedVendorServiceCharge.set(null);
    this.selectedVendorLaborKey.set('');

    this.assignVendorSvc
      .getVendorContacts(vendorKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        if (res?.status && res.data?.length) {
          const defaultContact = res.data.find((c) => c.isDefault);
          if (defaultContact) {
            this.vendorForm.patchValue({ contactKey: defaultContact.value });
          }
        }
      });

    const ctx = this.pageContext();
    if (ctx?.tradeKey) {
      this.assignVendorSvc
        .getServiceCharge(ctx.jobKey, vendorKey, ctx.tradeKey, ctx.customerKey, ctx.jobTypeKey)
        .pipe(takeUntil(this.destroy$))
        .subscribe((res) => {
          if (res?.status && res.data) {
            this.selectedVendorDistance.set(res.data.distanceFromLocation);
            this.selectedVendorServiceCharge.set(res.data.serviceCharge);
            this.selectedVendorLaborKey.set(res.data.laborKey ?? '');
          }
        });
    }
  }

  /** Cascading dropdown: load cities when the state changes */
  onStateChange(): void {
    const stateKey = this.quickVendorForm.get('stateKey')?.value as number;
    this.quickVendorForm.patchValue({ cityKey: 0 });
    if (stateKey && stateKey > 0) {
      this.assignVendorSvc
        .getCityDropdown(stateKey)
        .pipe(takeUntil(this.destroy$))
        .subscribe();
    } else {
      this.cityDropdown.set([]);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  ADD VENDOR TO JOB (WF-1, SRS §13)
  // ═══════════════════════════════════════════════════════════════

  /**
   * ADD VENDOR TO THIS JOB — Entry point (mirrors legacy SaveVendor).
   * Validates vendor/contact selection, runs Job Ops consolidator pre-check ({@code CheckIfVendorIs}),
   * then distance rule, then sets up WO state and runs avProcessSaveVendor().
   */
  onAddVendorToJob(): void {
    this.vendorForm.markAllAsTouched();
    if (this.vendorForm.invalid) return;

    const vendorKey = this.vendorForm.get('vendorKey')?.value as string;
    const contactKey = this.vendorForm.get('contactKey')?.value as string;

    if (!vendorKey || !contactKey) {
      this.errorMessage.set('Please select a vendor and contact.');
      return;
    }

    const vendorOption = this.vendorDropdown().find(v => v.value === vendorKey);
    const vendorName = vendorOption?.text ?? '';

    const jobKey = this.jobKey();
    if (!jobKey) {
      this.errorMessage.set('Missing job context.');
      return;
    }

    this.clearMessages();

    this.runVendorConsolidatorPrecheck(jobKey, vendorKey, 'addVendor', () =>
      this.runAddVendorDistanceFlow(vendorKey, vendorName),
    );
  }

  /**
   * Distance rule check then proceed — same behavior as before consolidator pre-check was added.
   */
  private runAddVendorDistanceFlow(vendorKey: string, vendorName: string): void {
    this.isSubmitting.set(true);

    // Check distance rule before proceeding with vendor assignment
    this.assignVendorSvc
      .checkDistanceRule(this.jobKey(), vendorKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.isSubmitting.set(false);
          if (res?.status && res.data?.exceedsRule) {
            // Check if logged-in user is the QC Manager — if so, bypass approval
            const loggedInAdminKey = this.authTokenSvc.getAdminKeyFromToken();
            const qcManagerKey = res.data.qcManagerKey;

            if (loggedInAdminKey && qcManagerKey && loggedInAdminKey.toLowerCase() === qcManagerKey.toLowerCase()) {
              // QC Manager override: proceed with normal flow without approval
              this.proceedWithAddVendor(vendorKey, vendorName);
            } else {
              // Vendor exceeds distance rule - show confirmation modal
              this.distanceExceededData.set({
                vendorKey,
                vendorName,
                distance: res.data.distance,
                ruleValue: res.data.ruleValue,
              });
              this.showDistanceExceededModal.set(true);
            }
          } else {
            // Distance rule not exceeded - proceed normally
            this.proceedWithAddVendor(vendorKey, vendorName);
          }
        },
        error: () => {
          // If distance check fails, proceed normally to avoid blocking workflow
          this.isSubmitting.set(false);
          console.warn('Distance rule check failed, proceeding with vendor assignment.');
          this.proceedWithAddVendor(vendorKey, vendorName);
        },
      });
  }

  /**
   * Job Ops POST check-if-consolidator: if {@code data} is true, user must confirm; if false, continue immediately.
   */
  private runVendorConsolidatorPrecheck(
    jobKey: string,
    vendorKey: string,
    source: 'addVendor' | 'grid',
    onContinue: () => void,
  ): void {
    this.assignVendorSvc
      .checkIfVendorIsConsolidator(jobKey, vendorKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (!res?.status) {
            this.errorMessage.set(res?.message ?? 'Unable to verify vendor. Please try again.');
            return;
          }
          if (res.data !== true) {
            onContinue();
            return;
          }
          this.consolidatorPrecheckPendingContinue = onContinue;
          this.consolidatorPrecheckPendingKeys = { jobKey, vendorKey };
          this.consolidatorPrecheckPendingSource = source;
          this.consolidatorPrecheckMessage.set(res.message ?? '');
          this.showConsolidatorPrecheckModal.set(true);
        },
        error: () => {
          this.errorMessage.set('Unable to verify vendor. Please try again.');
        },
      });
  }

  /** Consolidator API precheck — Proceed: remember keys for QC mail after successful WO / primary dispatch, then continue existing flow */
  onConsolidatorPrecheckProceed(): void {
    const cb = this.consolidatorPrecheckPendingContinue;
    const keys = this.consolidatorPrecheckPendingKeys;
    this.showConsolidatorPrecheckModal.set(false);
    this.consolidatorPrecheckPendingContinue = null;
    this.consolidatorPrecheckPendingKeys = null;
    this.consolidatorPrecheckPendingSource = null;

    if (keys) {
      this.pendingPostWoQcDispatch.set(keys);
    }
    cb?.();
  }

  /** Consolidator API precheck — Cancel: stop; reset vendor form when opened from Add Vendor */
  onConsolidatorPrecheckCancel(): void {
    const src = this.consolidatorPrecheckPendingSource;
    this.showConsolidatorPrecheckModal.set(false);
    this.consolidatorPrecheckPendingContinue = null;
    this.consolidatorPrecheckPendingKeys = null;
    this.consolidatorPrecheckPendingSource = null;

    if (src === 'addVendor') {
      this.resetVendorSelectionForm();
    }
  }

  /** Clears vendor + contact selection (Assign Vendor form Section B). */
  private resetVendorSelectionForm(): void {
    this.vendorForm.patchValue({ vendorKey: '', contactKey: '' });
  }

  /** After POST send-mail-qc-manager-consolidator-dispatch — close then reload */
  onQcDispatchOutcomeClose(): void {
    this.showQcDispatchOutcomeModal.set(false);
    window.location.reload();
  }

  /**
   * Calls QC manager dispatch API and shows outcome modal (after consolidator precheck + successful assign/WO or primary dispatch).
   */
  private invokeQcManagerDispatchThenShowOutcome(): void {
    const pend = this.pendingPostWoQcDispatch();
    if (!pend) {
      return;
    }
    this.pendingPostWoQcDispatch.set(null);

    this.assignVendorSvc
      .sendMailQcManagerConsolidatorDispatch(pend.jobKey, pend.vendorKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          const raw = res?.message ?? '';
          const msg = raw.trim().length
            ? raw
            : res?.status
              ? 'Request completed.'
              : 'Request failed.';
          this.qcDispatchOutcomeMessage.set(msg);
          this.showQcDispatchOutcomeModal.set(true);
        },
        error: (err: Error & { error?: { message?: string } }) => {
          this.qcDispatchOutcomeMessage.set(
            err?.error?.message ?? err?.message ?? 'Failed to notify QC manager.',
          );
          this.showQcDispatchOutcomeModal.set(true);
        },
      });
  }

  /** Clears pending QC dispatch when assign/WO pipeline fails mid-flight */
  private clearPendingPostWoQcDispatch(): void {
    this.pendingPostWoQcDispatch.set(null);
  }

  /** User chose to send approval request to QC Manager */
  onDistanceExceededSendApproval(): void {
    const data = this.distanceExceededData();
    if (!data) return;
    this.showDistanceExceededModal.set(false);
    this.createDistantVendorApprovalRequest(data.vendorKey, data.distance);
    this.distanceExceededData.set(null);
  }

  /** User chose to cancel and select another vendor */
  onDistanceExceededCancel(): void {
    this.showDistanceExceededModal.set(false);
    this.distanceExceededData.set(null);
  }

  /**
   * Creates a distant vendor approval request and shows success message.
   * Called when vendor exceeds the configured distance rule.
   * Shows a blocking overlay as this operation involves email sending and may take longer.
   */
  private createDistantVendorApprovalRequest(vendorKey: string, distance: number): void {
    this.isSubmitting.set(true);
    this.processingOverlayMessage.set('Sending approval request to manager... Please wait.');
    this.clearMessages();

    this.assignVendorSvc
      .createDistantVendorApprovalRequest({
        jobKey: this.jobKey(),
        vendorKey,
        distance,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.isSubmitting.set(false);
          this.processingOverlayMessage.set(null);
          if (res?.status && res.data) {
            this.successMessage.set(
              `This vendor is ${distance.toFixed(2)} miles away, which exceeds the configured distance limit. ` +
              `An approval request has been sent to the designated admin. ` +
              `The vendor will be assigned once approved.`
            );
          } else {
            this.errorMessage.set(res?.message ?? 'Failed to create approval request. Please try again.');
          }
        },
        error: (err) => {
          this.isSubmitting.set(false);
          this.processingOverlayMessage.set(null);
          const errorMsg = err?.name === 'TimeoutError'
            ? 'Request timed out. The server may still be processing. Please check back shortly.'
            : 'Failed to create approval request. Please try again.';
          this.errorMessage.set(errorMsg);
        },
      });
  }

  /**
   * Proceeds with the standard vendor assignment flow after distance check passes.
   */
  private proceedWithAddVendor(vendorKey: string, vendorName: string): void {
    this.woSelectedVendorKey.set(vendorKey);
    this.woSelectedVendorName.set(vendorName);
    this.woDefaultVendorValue.set('1');
    this.woSendFromWhere.set('0');
    this.woMessage.set('');
    this.woResetWorkOrderForm();

    this.avProcessSaveVendor();
  }

  /**
   * Add Vendor flow Step 1: Check existing vendor, then same vendor, then branch.
   * Mirrors legacy SaveVendor() exactly — no Consolidator/Primary/Default modals.
   */
  private avProcessSaveVendor(): void {
    const jobKey = this.jobKey();
    const vendorKey = this.woSelectedVendorKey();

    this.assignVendorSvc
      .checkForExistingVendor(jobKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (existingRes) => {
          const hasExisting = existingRes?.data === 1;

          this.assignVendorSvc
            .checkForSameVendor(jobKey, vendorKey)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
              next: (sameRes) => {
                if (sameRes?.data === 1) {
                  this.isSubmitting.set(false);
                  this.showAlreadyAssignedModal.set(true);
                } else {
                  if (hasExisting) {
                    this.woDefaultVendorValue.set('');
                  } else {
                    this.woDefaultVendorValue.set('1');
                  }
                  this.woCheckTradeThenAssign();
                }
              },
              error: () => {
                this.isSubmitting.set(false);
                this.errorMessage.set('Error checking vendor assignment. Please try again.');
              },
            });
        },
        error: () => {
          this.isSubmitting.set(false);
          this.errorMessage.set('Error checking existing vendors. Please try again.');
        },
      });
  }

  // ═══════════════════════════════════════════════════════════════
  //  VENDOR SEARCH (SRS §10)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Execute vendor search based on search type and radius (SRS §10.3).
   * Types 1–3 load into {@link AssignVendorService} streams consumed by the same grids as documented;
   * type 2 responses are mapped server-shape → {@link LocationHistoryVendor} so the
   * “Vendor List from RFI internal system” grid uses `vendorListColumns` / `vendorListActions` like type 1.
   */
  onSearchVendors(): void {
    this.searchForm.markAllAsTouched();
    const key = this.jobKey();
    if (!key || this.searchForm.invalid) return;

    this.clearMessages();
    this.enqueueVendorListLoadForCurrentSearch(key);
  }

  /**
   * Sets {@link lastVendorListLoader} and runs it so pin/refresh replay the same request.
   * Reads radius and search type from {@link searchForm} when the loader runs (latest values).
   *
   * @param jobKey Current job key
   */
  private enqueueVendorListLoadForCurrentSearch(jobKey: string): void {
    this.lastVendorListLoader = () => {
      const radiusMiles = Number(this.searchForm.get('radius')?.value);
      const searchTypeNum = Number(this.searchForm.get('searchType')?.value);

      switch (searchTypeNum) {
        case 1:
          this.assignVendorSvc
            .loadVendorsInRadius(jobKey, radiusMiles)
            .pipe(takeUntil(this.destroy$))
            .subscribe();
          break;
        case 2:
          this.assignVendorSvc
            .loadVendorsTradeRadius(jobKey, radiusMiles)
            .pipe(takeUntil(this.destroy$))
            .subscribe();
          break;
        case 3:
          this.assignVendorSvc
            .loadVendorsLocationHistory(jobKey)
            .pipe(takeUntil(this.destroy$))
            .subscribe();
          break;
      }
    };
    this.lastVendorListLoader();
  }

  /** Load all vendors into the same grid as form load — uses vendors-no-radius (SRS §11 browse) */
  onLoadAllVendors(): void {
    const key = this.jobKey();
    if (!key) return;
    this.lastVendorListLoader = () => {
      this.assignVendorSvc
        .loadVendorsNoRadius(key)
        .pipe(takeUntil(this.destroy$))
        .subscribe();
    };
    this.lastVendorListLoader();
  }

  // ═══════════════════════════════════════════════════════════════
  //  GRID ACTION HANDLERS
  // ═══════════════════════════════════════════════════════════════

  /** Select a vendor from any grid into the selection form (SRS §8.2) */
  onSelectVendorFromGrid(row: Record<string, unknown>): void {
    this.vendorForm.patchValue({ vendorKey: row['vendorKey'] as string });
    this.onVendorSelected();
    const name = (row['vendorName'] ?? '') as string;
    this.successMessage.set(`Vendor "${name}" selected. Choose a contact and click Add Vendor.`);
  }

  /** Set vendor as default (WF-4, SRS §16) */
  onSetDefault(row: Record<string, unknown>): void {
    this.successMessage.set(`Set-default flow for "${row['vendorName']}" — modal integration in Layer 6.`);
  }

  /** Send work order (WF-2, SRS §14) */
  onSendWorkOrder(row: Record<string, unknown>): void {
    this.successMessage.set(`Work order flow for "${row['vendorName']}" — modal integration in Layer 6.`);
  }

  /** Resend work order (WF-10, SRS §22) */
  onResendWorkOrder(row: Record<string, unknown>): void {
    this.successMessage.set(`Resend W/O for "${row['vendorName']}" — modal integration in Layer 6.`);
  }

  /** Send cancellation email (SRS §15.3 / §23.4) */
  onSendCancellationEmail(row: Record<string, unknown>): void {
    const jvKey = row['jobVendorKey'] as string;
    if (!jvKey || !confirm(`Send cancellation email to "${row['vendorName']}"?`)) return;

    this.isSubmitting.set(true);
    this.clearMessages();

    this.assignVendorSvc
      .sendCancellationEmail(jvKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        this.isSubmitting.set(false);
        if (res.status) {
          this.successMessage.set('Cancellation email sent successfully.');
          this.refreshGrids();
        } else {
          this.errorMessage.set(res.message || 'Failed to send cancellation email.');
        }
      });
  }

  // ═══════════════════════════════════════════════════════════════
  //  VENDOR RATES POPUP
  // ═══════════════════════════════════════════════════════════════

  /**
   * Strips legacy HTML from a raw trade list string.
   * The old system truncated trade names and hid the remainder inside a
   * <button value="...">Show More</button>. We inline the value attribute so
   * the full trade name is reconstructed, then strip all remaining tags.
   */
  private cleanTradeHtml(raw: string): string {
    // Inline button value (continues the text immediately before the button)
    let s = raw.replace(
      /<button[^>]*\bvalue="([^"]*)"[^>]*>[\s\S]*?<\/button>/gi,
      (_, val) => val
    );
    // Decode common HTML entities
    s = s.replace(/&amp;/g, '&').replace(/&lt;/g, '<')
         .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    // Strip any remaining HTML tags
    s = s.replace(/<[^>]*>/g, '');
    // Only replace "and"/"or" when they sit between newlines (legacy list separator),
    // NOT when they appear inside a trade name like "Painting and Decorating"
    s = s.replace(/\r?\n\s*\band\b\s*\r?\n/gi, ',');
    s = s.replace(/\r?\n\s*\bor\b\s*\r?\n/gi, ',');
    // Remaining newlines → comma
    s = s.replace(/\r?\n/g, ',');
    // Collapse runs of commas and strip leading/trailing comma
    s = s.replace(/,+/g, ',').replace(/^,|,$/g, '').trim();
    return s;
  }

  /** Splits a cleaned, comma-separated trade list while respecting parentheses. */
  private splitTradeList(raw: string): string[] {
    const cleaned = this.cleanTradeHtml(raw);
    const result: string[] = [];
    let depth = 0;
    let current = '';
    for (const ch of cleaned) {
      if (ch === '(') { depth++; current += ch; }
      else if (ch === ')') { depth = Math.max(0, depth - 1); current += ch; }
      else if (ch === ',' && depth === 0) {
        const trimmed = current.trim();
        // Skip bare connector words that slipped through
        if (trimmed && !/^(and|or)$/i.test(trimmed)) result.push(trimmed);
        current = '';
      } else {
        current += ch;
      }
    }
    const trimmed = current.trim();
    if (trimmed && !/^(and|or)$/i.test(trimmed)) result.push(trimmed);
    return result;
  }

  onViewTrade(row: Record<string, unknown>): void {
    const rawList = (row['tradeList'] as string | null) ?? '';
    const trades = rawList ? this.splitTradeList(rawList) : [];
    this.tradeModalTrades.set(trades);
    this.tradeModalVendorName.set((row['vendorName'] as string | null) ?? '');
    this.showTradeModal.set(true);
  }

  onShowVendorRates(row: Record<string, unknown>): void {
    const vendorKey = row['vendorKey'] as string;
    if (!vendorKey) return;

    this.ratesVendorName.set((row['vendorName'] as string) ?? 'Vendor');
    this.ratesData.set(null);
    this.ratesLoading.set(true);
    this.showRatesModal.set(true);

    this.assignVendorSvc
      .getVendorRates(vendorKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        this.ratesLoading.set(false);
        if (res?.status) {
          this.ratesData.set(res.data);
        }
      });
  }

  // ═══════════════════════════════════════════════════════════════
  //  REGISTERED VENDOR PACKET POPUP
  // ═══════════════════════════════════════════════════════════════

  onShowVendorPacket(row: Record<string, unknown>): void {
    const vendorKey = row['vendorKey'] as string;
    if (!vendorKey) return;

    this.packetVendorName.set(
      ((row['vendorName'] ?? row['vname']) as string | null | undefined) ?? 'Vendor',
    );
    this.packetVendorKey.set(vendorKey);
    this.packetData.set(null);
    this.packetLoading.set(true);
    this.showPacketModal.set(true);

    this.assignVendorSvc
      .getRegisteredVendorPacket(vendorKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        this.packetLoading.set(false);
        if (res?.status) {
          this.packetData.set(res.data);
        }
      });
  }

  // ═══════════════════════════════════════════════════════════════
  //  SET VENDOR AS DEFAULT
  // ═══════════════════════════════════════════════════════════════

  onSetVendorAsDefault(row: AssignedVendorDetail | Record<string, unknown>): void {
    const r = row as Record<string, unknown>;
    const jobVendorKey = r['jobVendorKey'] as string;
    const vendorKey = r['vendorKey'] as string;
    const vendorName = (r['vendorName'] as string) ?? 'Vendor';

    if (!jobVendorKey || !vendorKey) {
      this.errorMessage.set('Unable to set default: missing vendor information.');
      return;
    }

    const jobKey = this.jobKey();
    if (!jobKey) {
      this.errorMessage.set('Unable to set default: no job context.');
      return;
    }

    this.setDefaultVendorSaving.set(jobVendorKey);
    this.successMessage.set('');
    this.errorMessage.set('');

    this.assignVendorSvc
      .setVendorAsDefault({
        jobKey,
        jobVendorKey,
        vendorKey,
        keepOtherVendors: true,
      })
      .pipe(takeUntil(this.destroy$), finalize(() => this.setDefaultVendorSaving.set(null)))
      .subscribe({
        next: (res) => {
          if (res?.status) {
            this.successMessage.set(`${vendorName} has been set as default vendor.`);
            this.selectedVendorDetailKey.set(vendorKey);
            this.assignVendorSvc.loadAssignedVendors(jobKey).pipe(takeUntil(this.destroy$)).subscribe();
            this.assignVendorSvc
              .loadJobHeaderDetail(jobKey)
              .pipe(takeUntil(this.destroy$))
              .subscribe();
          } else {
            this.errorMessage.set(res?.message ?? 'Failed to set vendor as default.');
          }
        },
        error: () => {
          this.errorMessage.set('Error setting vendor as default. Please try again.');
        },
      });
  }

  isSetDefaultVendorSaving(jobVendorKey: string): boolean {
    return this.setDefaultVendorSaving() === jobVendorKey;
  }

  /**
   * Reassigns a previously unassigned (deleted) vendor back to the job.
   * Replicates legacy Admin Portal AssignFromInactive flow:
   * 1. Checks if there are existing active vendors on the job
   * 2. If no existing vendors: directly reassigns with reset (ReassignVendor behavior)
   * 3. If existing vendors: shows "Assign Vendor" modal with two options:
   *    - "Assign vendor and reset status and schedule date to new" (ReassignVendor)
   *    - "Assign vendor and don't reset" (ReassignVendorOnly)
   */
  onReassignFromInactive(row: Record<string, unknown>): void {
    const jobVendorKey = row['jobVendorKey'] as string;
    const vendorName = row['vendorName'] as string;

    if (!jobVendorKey) {
      this.errorMessage.set('Unable to reassign: missing vendor information.');
      return;
    }

    const jobKey = this.jobKey();
    if (!jobKey) {
      this.errorMessage.set('Unable to reassign: no job context.');
      return;
    }

    this.isLoading.set(true);
    this.successMessage.set('');
    this.errorMessage.set('');

    // Check if there are existing active vendors on this job
    this.assignVendorSvc
      .checkForExistingVendor(jobKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.isLoading.set(false);
          if (res?.status) {
            const hasExistingVendor = res.data === 1;
            if (hasExistingVendor) {
              // Show the Assign Vendor modal with two options
              this.assignVendorModalJobVendorKey.set(jobVendorKey);
              this.assignVendorModalVendorName.set(vendorName);
              this.assignVendorModalMessage.set('');
              this.showAssignVendorModal.set(true);
            } else {
              // No existing vendor, directly reassign with reset
              this.executeReassignFromInactive(jobKey, jobVendorKey, vendorName, true);
            }
          } else {
            this.errorMessage.set(res?.message ?? 'Failed to check existing vendors.');
          }
        },
        error: () => {
          this.isLoading.set(false);
          this.errorMessage.set('Error checking existing vendors. Please try again.');
        },
      });
  }

  /**
   * Handles "Assign vendor and reset status and schedule date to new" button click.
   * Calls the API with resetStatusAndSchedule = true.
   */
  onAssignVendorWithReset(): void {
    const jobKey = this.jobKey();
    const jobVendorKey = this.assignVendorModalJobVendorKey();
    const vendorName = this.assignVendorModalVendorName();

    if (!jobKey || !jobVendorKey) return;

    this.assignVendorModalProcessing.set(true);
    this.assignVendorModalMessage.set('Please do not close this window. Please wait while we process...');

    this.executeReassignFromInactive(jobKey, jobVendorKey, vendorName, true);
  }

  /**
   * Handles "Assign vendor and don't reset" button click.
   * Calls the API with resetStatusAndSchedule = false.
   */
  onAssignVendorWithoutReset(): void {
    const jobKey = this.jobKey();
    const jobVendorKey = this.assignVendorModalJobVendorKey();
    const vendorName = this.assignVendorModalVendorName();

    if (!jobKey || !jobVendorKey) return;

    this.assignVendorModalProcessing.set(true);
    this.assignVendorModalMessage.set('Please do not close this window. Please wait while we process...');

    this.executeReassignFromInactive(jobKey, jobVendorKey, vendorName, false);
  }

  /**
   * Executes the reassign from inactive API call.
   */
  private executeReassignFromInactive(
    jobKey: string,
    jobVendorKey: string,
    vendorName: string,
    resetStatusAndSchedule: boolean
  ): void {
    this.assignVendorSvc
      .reassignVendorFromInactive(
        this.buildReassignFromInactiveRequest(jobKey, jobVendorKey, {
          restorePreviousState: false,
          resetStatusAndSchedule,
        }),
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.assignVendorModalProcessing.set(false);
          this.showAssignVendorModal.set(false);
          this.isLoading.set(false);

          if (res?.status) {
            this.successMessage.set(
              res.message?.trim()
                || (resetStatusAndSchedule
                  ? `${vendorName} has been reassigned. Status and schedule date reset to new.`
                  : `${vendorName} has been reassigned.`),
            );
            this.assignVendorSvc.loadAssignedVendors(jobKey).pipe(takeUntil(this.destroy$)).subscribe();
          } else {
            this.errorMessage.set(res?.message ?? 'Failed to reassign vendor.');
          }
        },
        error: () => {
          this.assignVendorModalProcessing.set(false);
          this.showAssignVendorModal.set(false);
          this.isLoading.set(false);
          this.errorMessage.set('Error reassigning vendor. Please try again.');
        },
      });
  }

  // ═══════════════════════════════════════════════════════════════
  //  UNASSIGN VENDOR (RemoveVendorProcess1 replication)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Initiates the unassign vendor flow (RemoveVendorProcess1).
   * Steps:
   * 1. Check if vendor bill exists → show bill exists modal if yes
   * 2. Check for pending estimate approvals → show estimate modal if yes
   * 3. Check vendor count:
   *    - 1-2 vendors: show delete confirmation
   *    - >2 vendors: check if default vendor being removed → show select new default modal
   * 4. After confirmation: unassign vendor
   * 5. Show send email modal
   */
  onUnassignVendor(row: Record<string, unknown>): void {
    const jobVendorKey = row['jobVendorKey'] as string;
    const vendorName = row['vendorName'] as string;
    const jobKey = this.jobKey();

    if (!jobVendorKey || !jobKey) {
      this.errorMessage.set('Unable to unassign: missing vendor or job information.');
      return;
    }

    // Reset all unassign state
    this.unassignJobKey.set(jobKey);
    this.unassignJobVendorKey.set(jobVendorKey);
    this.unassignVendorName.set(vendorName);
    this.unassignProcessing.set(true);
    this.unassignMessage.set('');
    this.unassignInsufficientPerformance.set(false);
    this.unassignInsufficientReason.set('');
    this.unassignSendCancellationEmail.set(false);
    this.unassignRequiresEstimateHandling.set(false);
    this.unassignEmailComment.set('');
    this.unassignSelectedNewDefault.set('');
    this.successMessage.set('');
    this.errorMessage.set('');

    // Step 1: Check if vendor bill exists
    this.assignVendorSvc
      .checkIfVendorBillExist(jobVendorKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (res?.status && res.data?.result === 1) {
            // Vendor bill exists - show warning modal
            this.unassignProcessing.set(false);
            this.showUnassignBillExistsModal.set(true);
          } else {
            // No bill - proceed to pending approval check
            this.checkPendingApprovalForUnassign();
          }
        },
        error: () => {
          this.unassignProcessing.set(false);
          this.errorMessage.set('Error checking vendor bill. Please try again.');
        },
      });
  }

  /** Handle vendor bill exists modal - Cancel */
  onUnassignBillExistsCancel(): void {
    this.showUnassignBillExistsModal.set(false);
    this.unassignProcessing.set(false);
  }

  /** Handle vendor bill exists modal - Remove and Delete (proceed anyway) */
  onUnassignBillExistsProceed(): void {
    this.showUnassignBillExistsModal.set(false);
    this.unassignProcessing.set(true);
    this.checkPendingApprovalForUnassign();
  }

  /** Check for pending estimate approvals */
  private checkPendingApprovalForUnassign(): void {
    const jobVendorKey = this.unassignJobVendorKey();

    this.assignVendorSvc
      .checkIfThereIsAnyPendingApproval(jobVendorKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (res?.status) {
            const result = res.data?.result ?? 0;
            if (result === 1 || result === 2) {
              // Has pending approval - show estimate modal
              this.unassignEstimateType.set(result as 1 | 2);
              this.unassignProcessing.set(false);
              this.showUnassignEstimateModal.set(true);
            } else {
              // No pending approval - proceed to vendor count check
              this.checkVendorCountForUnassign();
            }
          } else {
            this.unassignProcessing.set(false);
            this.errorMessage.set(res?.message ?? 'Failed to check pending approvals.');
          }
        },
        error: () => {
          this.unassignProcessing.set(false);
          this.errorMessage.set('Error checking pending approvals. Please try again.');
        },
      });
  }

  /** Handle estimate modal - "Not Now" (cancel unassign) */
  onUnassignEstimateNotNow(): void {
    this.showUnassignEstimateModal.set(false);
    this.unassignProcessing.set(false);
  }

  /** Handle estimate modal - "Yes" (set to NOT APPROVED and show remove confirmation) */
  onUnassignEstimateYes(): void {
    this.showUnassignEstimateModal.set(false);
    this.unassignRequiresEstimateHandling.set(true);
    this.showUnassignConfirmModal.set(true);
  }

  /** Check vendor count to determine unassign flow */
  private checkVendorCountForUnassign(): void {
    const jobKey = this.unassignJobKey();

    this.assignVendorSvc
      .checkForMoreThan1Vendor(jobKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (res?.status) {
            const count = res.data?.result ?? 0;
            if (count <= 2) {
              // 1-2 vendors: show simple delete confirmation
              this.unassignProcessing.set(false);
              this.showUnassignConfirmModal.set(true);
            } else {
              // >2 vendors: check if this is the default vendor
              this.checkIfDefaultVendorForUnassign();
            }
          } else {
            this.unassignProcessing.set(false);
            this.errorMessage.set(res?.message ?? 'Failed to check vendor count.');
          }
        },
        error: () => {
          this.unassignProcessing.set(false);
          this.errorMessage.set('Error checking vendor count. Please try again.');
        },
      });
  }

  /** Check if the vendor being removed is the default vendor */
  private checkIfDefaultVendorForUnassign(): void {
    const jobVendorKey = this.unassignJobVendorKey();

    this.assignVendorSvc
      .checkIfThisIsTheDefaultVendor(jobVendorKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (res?.status) {
            const isDefault = res.data?.result === 1;
            if (isDefault) {
              // Default vendor being removed - load other vendors and show select modal
              this.loadVendorsForNewDefault();
            } else {
              // Not default - show simple delete confirmation
              this.unassignProcessing.set(false);
              this.showUnassignConfirmModal.set(true);
            }
          } else {
            this.unassignProcessing.set(false);
            this.errorMessage.set(res?.message ?? 'Failed to check default vendor.');
          }
        },
        error: () => {
          this.unassignProcessing.set(false);
          this.errorMessage.set('Error checking default vendor. Please try again.');
        },
      });
  }

  /** Load available vendors for new default selection */
  private loadVendorsForNewDefault(): void {
    const jobKey = this.unassignJobKey();

    this.assignVendorSvc
      .getVendorsExceptDefault(jobKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.unassignProcessing.set(false);
          if (res?.status && res.data) {
            this.unassignNewDefaultOptions.set(res.data);
            this.unassignSelectedNewDefault.set('');
            this.showUnassignSelectDefaultModal.set(true);
          } else {
            this.errorMessage.set(res?.message ?? 'Failed to load vendors for selection.');
          }
        },
        error: () => {
          this.unassignProcessing.set(false);
          this.errorMessage.set('Error loading vendors. Please try again.');
        },
      });
  }

  /** Handle delete confirmation - "No" (cancel) */
  onUnassignConfirmNo(): void {
    this.showUnassignConfirmModal.set(false);
    this.unassignRequiresEstimateHandling.set(false);
    this.unassignProcessing.set(false);
  }

  /** Handle delete confirmation - proceed with unassign (and optional cancellation email / note). */
  onUnassignConfirmYes(): void {
    this.showUnassignConfirmModal.set(false);
    this.unassignProcessing.set(true);

    if (this.unassignRequiresEstimateHandling()) {
      this.unassignRequiresEstimateHandling.set(false);
      this.handleEstimateThenFinalize();
      return;
    }

    this.finalizeUnassign();
  }

  /** Handle select new default modal - "Close" (cancel) */
  onUnassignSelectDefaultClose(): void {
    this.showUnassignSelectDefaultModal.set(false);
    this.unassignProcessing.set(false);
  }

  /** Handle select new default modal - "Save as Default" (set new default and proceed) */
  onUnassignSelectDefaultSave(): void {
    const newDefaultKey = this.unassignSelectedNewDefault();
    if (!newDefaultKey) {
      this.unassignMessage.set('Please select a vendor to set as default.');
      return;
    }

    this.showUnassignSelectDefaultModal.set(false);
    this.unassignProcessing.set(true);
    this.unassignMessage.set('');

    const jobKey = this.unassignJobKey();
    const jobVendorKey = this.unassignJobVendorKey();
    const adminKey = this.authTokenSvc.getAdminKeyFromToken() ?? '';
    const comment = this.unassignEmailComment().trim() || null;
    const insufficient = this.unassignInsufficientPerformance() ? 1 : null;
    const reason = this.unassignInsufficientReason().trim() || null;

    this.assignVendorSvc
      .unassignDefaultVendorAndPromote({
        jobKey,
        jobVendorKeyToRemove: jobVendorKey,
        jobVendorKeyToPromote: newDefaultKey,
        adminKey,
        insufficient,
        reason,
      })
      .pipe(
        takeUntil(this.destroy$),
        switchMap((res) => {
          if (!res?.status || !comment) {
            return of({ res, noteRes: null });
          }
          return this.saveUnassignNote(comment).pipe(map((noteRes) => ({ res, noteRes })));
        }),
        finalize(() => {
          this.unassignProcessing.set(false);
          this.refreshAssignedVendors();
          if (this.lastVendorListLoader) {
            this.lastVendorListLoader();
          }
        }),
      )
      .subscribe({
        next: ({ res, noteRes }) => {
          if (!res?.status) {
            this.errorMessage.set(res?.message ?? 'Failed to remove vendor and promote new default.');
            return;
          }
          this.completeUnassignSuccess(false);
          if (noteRes && !noteRes.status) {
            this.errorMessage.set(noteRes.message ?? 'Vendor removed, but saving the note failed.');
          }
        },
        error: () => {
          this.errorMessage.set('Error removing vendor and promoting new default. Please try again.');
        },
      });
  }

  /** Unassign vendor, optionally send cancellation email, and save optional note. */
  private finalizeUnassign(): void {
    const jobKey = this.unassignJobKey();
    const jobVendorKey = this.unassignJobVendorKey();
    const adminKey = this.authTokenSvc.getAdminKeyFromToken() ?? '';
    const comment = this.unassignEmailComment().trim() || null;
    const sendEmail = this.unassignSendCancellationEmail();
    const insufficient = this.unassignInsufficientPerformance() ? 1 : null;
    const reason = this.unassignInsufficientReason().trim() || null;

    const unassign$ = sendEmail
      ? this.assignVendorSvc.unassignVendorWithEmail({
          jobKey,
          jobVendorKey,
          adminKey,
          comment,
          insufficient,
          reason,
        })
      : this.assignVendorSvc.unassignVendor({
          jobKey,
          jobVendorKey,
          adminKey,
          insufficient,
          reason,
        });

    unassign$
      .pipe(
        takeUntil(this.destroy$),
        switchMap((res) => {
          if (!res?.status) {
            return of({ res, noteRes: null });
          }
          if (!comment) {
            return of({ res, noteRes: null });
          }
          return this.saveUnassignNote(comment).pipe(map((noteRes) => ({ res, noteRes })));
        }),
        finalize(() => {
          this.unassignProcessing.set(false);
          this.refreshAssignedVendors();
          if (this.lastVendorListLoader) {
            this.lastVendorListLoader();
          }
        }),
      )
      .subscribe({
        next: ({ res, noteRes }) => {
          if (!res?.status) {
            this.errorMessage.set(res?.message ?? 'Failed to remove vendor.');
            return;
          }
          this.completeUnassignSuccess(sendEmail);
          if (noteRes && !noteRes.status) {
            this.errorMessage.set(noteRes.message ?? 'Vendor removed, but saving the note failed.');
          }
        },
        error: () => {
          this.errorMessage.set(
            sendEmail
              ? 'Error removing vendor or sending cancellation email.'
              : 'Error removing vendor. Please try again.',
          );
        },
      });
  }

  /** Pending estimate approval path: unassign first, then optional email + note. */
  private handleEstimateThenFinalize(): void {
    this.assignVendorSvc
      .handleEstimateAndUnassign({
        jobKey: this.unassignJobKey(),
        jobVendorKey: this.unassignJobVendorKey(),
        adminKey: this.authTokenSvc.getAdminKeyFromToken() ?? '',
        setEstimateToNotApproved: true,
      })
      .pipe(
        takeUntil(this.destroy$),
        switchMap((res) => {
          if (!res?.status) {
            return of({ phase: 'failed' as const, res });
          }
          return this.finalizeUnassignPostRemoval$().pipe(
            map((out) => ({ phase: 'done' as const, res, ...out })),
          );
        }),
        finalize(() => {
          this.unassignProcessing.set(false);
          this.refreshAssignedVendors();
          if (this.lastVendorListLoader) {
            this.lastVendorListLoader();
          }
        }),
      )
      .subscribe({
        next: (out) => {
          if (out.phase === 'failed') {
            this.errorMessage.set(out.res?.message ?? 'Failed to unassign vendor.');
            return;
          }
          if (out.emailFailed) {
            this.errorMessage.set(out.emailRes?.message ?? 'Vendor removed, but cancellation email failed.');
            return;
          }
          this.completeUnassignSuccess(this.unassignSendCancellationEmail());
          if (out.noteRes && !out.noteRes.status) {
            this.errorMessage.set(out.noteRes.message ?? 'Vendor removed, but saving the note failed.');
          }
        },
        error: () => this.errorMessage.set('Error unassigning vendor. Please try again.'),
      });
  }

  private finalizeUnassignPostRemoval$(): Observable<{
    emailRes: { status: boolean; message?: string | null } | null;
    emailFailed: boolean;
    noteRes: { status: boolean; message?: string | null } | null;
  }> {
    const jobKey = this.unassignJobKey();
    const jobVendorKey = this.unassignJobVendorKey();
    const adminKey = this.authTokenSvc.getAdminKeyFromToken() ?? '';
    const comment = this.unassignEmailComment().trim() || null;
    const sendEmail = this.unassignSendCancellationEmail();

    if (sendEmail) {
      return this.assignVendorSvc
        .unassignVendorWithEmail({
          jobKey,
          jobVendorKey,
          adminKey,
          comment,
        })
        .pipe(
          switchMap((emailRes) => {
            if (!emailRes?.status) {
              return of({ emailRes, emailFailed: true, noteRes: null });
            }
            if (!comment) {
              return of({ emailRes, emailFailed: false, noteRes: null });
            }
            return this.saveUnassignNote(comment).pipe(
              map((noteRes) => ({ emailRes, emailFailed: false, noteRes })),
            );
          }),
        );
    }

    if (comment) {
      return this.saveUnassignNote(comment).pipe(
        map((noteRes) => ({ emailRes: null, emailFailed: false, noteRes })),
      );
    }

    return of({ emailRes: null, emailFailed: false, noteRes: null });
  }

  private saveUnassignNote(comment: string): Observable<{ status: boolean; message?: string | null }> {
    return this.assignVendorSvc.saveGeneralAdminNote({
      jobKey: this.unassignJobKey(),
      title: `Vendor removed — ${this.unassignVendorName()}`,
      comment,
    });
  }

  private completeUnassignSuccess(sentEmail: boolean): void {
    const name = this.unassignVendorName();
    this.successMessage.set(
      sentEmail
        ? `${name} has been removed and cancellation email sent.`
        : `${name} has been removed from the job.`,
    );
  }

  /** Refresh assigned vendors grid and job header detail (DNE fields) after unassign */
  private refreshAssignedVendors(): void {
    const jobKey = this.jobKey();
    if (jobKey) {
      // Add a small delay to ensure backend has processed the unassignment
      timer(500).pipe(
        takeUntil(this.destroy$),
        switchMap(() => this.assignVendorSvc.loadAssignedVendors(jobKey)),

        switchMap(() => {
          return this.assignVendorSvc.loadJobHeaderDetail(jobKey);
        }),
      ).subscribe();
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  PIN / UNPIN (WF-5, SRS §17 / §12)
  // ═══════════════════════════════════════════════════════════════

  /** Open the pin modal pre-populated for a vendor row */
  onOpenPinModal(row: Record<string, unknown>, noMaybe: string): void {
    this.pinForm.patchValue({
      vendorKey: row['vendorKey'] as string,
      vendorName: (row['vendorName'] ?? row['vname'] ?? '') as string,
      noMaybe,
      notes: '',
    });
    this.showPinModal.set(true);
  }

  /** Submit pin (SRS §17.2 step 5) — calls API add-pinned-vendor, then reloads pinned grid */
  onSubmitPin(): void {
    if (this.pinForm.invalid) return;

    const jobKey = this.jobKey();
    if (!jobKey) {
      this.errorMessage.set('No job context. Cannot add pinned vendor.');
      return;
    }

    const v = this.pinForm.value;
    const vendorKey = v.vendorKey as string;
    const vendorName = String(v.vendorName ?? '').trim();
    const pinChoice = (v.noMaybe as string) || 'No';
    const request = {
      jobKey,
      vendorKey,
      no: pinChoice,
      notes: (v.notes as string) || null,
    };

    this.assignVendorSvc
      .addPinnedVendor(request)
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        this.showPinModal.set(false);
        if (res.status) {
          this.pinnedNoMaybeCache.update((m) => {
            const next = { ...m };
            if (vendorKey) next[vendorKey.toLowerCase()] = pinChoice;
            if (vendorName) next[`name:${vendorName.toLowerCase()}`] = pinChoice;
            return next;
          });
          this.successMessage.set(res.message || 'Vendor pinned successfully.');
          this.lastVendorListLoader?.();
        } else {
          this.errorMessage.set(res.message || 'Failed to add pinned vendor.');
        }
      });
  }

  /** Unpin a single vendor (SRS §12.2) */
  /**
   * Shows a modal displaying the note that was created when the vendor was pinned.
   * This allows admins to view the reason why the vendor was pinned with "Maybe" or "No".
   */
  onViewPinnedNote(row: Record<string, unknown>): void {
    const vendorName = (row['vendorName'] ?? row['vname'] ?? 'Unknown Vendor') as string;
    const noMaybe = row['noMaybe'] as string | null;
    let specialNotes = row['specialNotes'] as string | null;

    // Clean up the notes: strip HTML tags and remove "Maybe" or "No" prefix
    if (specialNotes) {
      // Remove HTML tags
      specialNotes = specialNotes.replace(/<[^>]*>/g, ' ').trim();

      // Remove "Maybe" or "No" prefix if it's at the start
      specialNotes = specialNotes
        .replace(/^(Maybe|No)\s*/i, '')
        .trim();

      // If nothing left after cleanup, set to null
      if (specialNotes === '') {
        specialNotes = null;
      }
    }

    // Show modal with the pin information
    this.showPinNoteModal.set({
      vendorName,
      noMaybe: noMaybe || 'N/A',
      notes: specialNotes || 'No note provided',
    });
  }

  onUnpinVendor(row: Record<string, unknown>): void {
    const pinKey = row['pinKey'] as string;
    const key = this.jobKey();
    if (!pinKey || !key) return;

    this.assignVendorSvc
      .unpinVendor(pinKey, key)
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        if (res.status) {
          this.successMessage.set('Vendor unpinned.');
          // Reload the internal vendors table to show the unpinned vendor
          if (this.lastVendorListLoader) {
            this.lastVendorListLoader();
          }
        } else {
          this.errorMessage.set(res.message || 'Failed to unpin vendor.');
        }
      });
  }

  /** Unpin all vendors (SRS §12.3) */
  onUnpinAll(): void {
    const key = this.jobKey();
    if (!key) return;

    this.assignVendorSvc
      .unpinAllVendors(key)
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        if (res.status) {
          this.successMessage.set('All vendors unpinned.');
          // Reload the internal vendors table to show all unpinned vendors
          if (this.lastVendorListLoader) {
            this.lastVendorListLoader();
          }
        } else {
          this.errorMessage.set(res.message || 'Failed to unpin vendors.');
        }
      });
  }

  // ═══════════════════════════════════════════════════════════════
  //  QUICK VENDOR CREATION (WF-8, SRS §20)
  // ═══════════════════════════════════════════════════════════════

  /** Open the quick vendor modal and reset the form */
  onOpenQuickVendor(): void {
    this.quickVendorForm.reset({
      companyName: '',
      companyemail: '',
      phone: '',
      address: '',
      address1: '',
      stateKey: 0,
      cityKey: 0,
      zip: '',
      tradeKey: '',
      contactName: '',
      contactemail: '',
      flatTrip: 0,
      standardHourly: 0,
      helperStandard: 0,
      emergencyFlat: 0,
      emergencyStandard: 0,
      emergencyHelper: 0,
      wcom: null,
      genL: null,
      accName: '',
      accEmail: '',
      accPhone: '',
    });
    this.showDuplicateWarning.set(false);
    this.duplicateResult.set(null);
    this.showQuickVendorModal.set(true);
  }

  /** Close the quick vendor modal */
  onCloseQuickVendor(): void {
    this.showQuickVendorModal.set(false);
  }

  /**
   * Submit quick vendor (SRS §20.4 + §20.5).
   * Step 1: Duplicate check.
   * Step 2: Save if no duplicate or user chose to proceed.
   */
  onSubmitQuickVendor(skipDuplicateCheck = false): void {
    this.quickVendorForm.markAllAsTouched();
    if (this.quickVendorForm.invalid) return;

    const values = this.quickVendorForm.value;

    if (!skipDuplicateCheck) {
      this.checkDuplicateBeforeSave(values);
      return;
    }

    this.saveQuickVendor(values);
  }

  /** SRS §20.4 — POST /api/vendor/check-duplicate before saving */
  private checkDuplicateBeforeSave(values: Record<string, unknown>): void {
    const request: CheckDuplicateVendorRequest = {
      name: values['companyName'] as string,
      email: values['companyemail'] as string,
      phone: values['phone'] as string,
    };

    this.isSubmitting.set(true);
    this.assignVendorSvc
      .checkDuplicateVendor(request)
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        this.isSubmitting.set(false);
        if (res.status && res.data?.flag === 1) {
          this.duplicateResult.set(res.data);
          this.showDuplicateWarning.set(true);
        } else {
          this.saveQuickVendor(values);
        }
      });
  }

  /** SRS §20.5 — POST /api/vendor/save-quick */
  private saveQuickVendor(values: Record<string, unknown>): void {
    this.showDuplicateWarning.set(false);
    this.isSubmitting.set(true);
    this.clearMessages();

    const request: QuickVendorRequest = {
      companyName: values['companyName'] as string,
      contactName: values['contactName'] as string,
      companyemail: values['companyemail'] as string,
      contactemail: values['contactemail'] as string,
      phone: values['phone'] as string,
      address: values['address'] as string,
      address1: (values['address1'] as string) || undefined,
      stateKey: values['stateKey'] as number,
      cityKey: values['cityKey'] as number,
      zip: values['zip'] as string,
      tradeKey: values['tradeKey'] as string,
      flatTrip: (values['flatTrip'] as number) || 0,
      standardHourly: (values['standardHourly'] as number) || 0,
      helperStandard: (values['helperStandard'] as number) || 0,
      emergencyFlat: (values['emergencyFlat'] as number) || 0,
      emergencyStandard: (values['emergencyStandard'] as number) || 0,
      emergencyHelper: (values['emergencyHelper'] as number) || 0,
      wcom: !!values['wcom'],
      genL: !!values['genL'],
      accName: (values['accName'] as string) || undefined,
      accEmail: (values['accEmail'] as string) || undefined,
      accPhone: (values['accPhone'] as string) || undefined,
    };

    this.assignVendorSvc
      .saveQuickVendor(request)
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        this.isSubmitting.set(false);
        if (res.status && res.data?.flag === 1) {
          this.showQuickVendorModal.set(false);
          this.successMessage.set(res.data.message || 'Vendor created successfully.');

          const jobKey = this.jobKey();
          const rawVendorKey = res.data.vendorKey || res.data.key;
          const newVendorKey = rawVendorKey ? String(rawVendorKey) : null;

          if (jobKey) {
            this.assignVendorSvc
              .getActiveVendorsDropdown(jobKey)
              .pipe(takeUntil(this.destroy$))
              .subscribe((ddRes) => {
                if (ddRes.status) {
                  this.vendorDropdown.set(ddRes.data);
                  if (newVendorKey) {
                    setTimeout(() => {
                      this.vendorForm.get('vendorKey')?.setValue(newVendorKey);
                      this.onVendorSelected();
                    }, 100);
                  }
                }
              });
          } else if (newVendorKey) {
            this.vendorForm.get('vendorKey')?.setValue(newVendorKey);
            this.onVendorSelected();
          }
        } else if (res.details?.length > 0) {
          this.handleApiError(res, this.quickVendorForm);
        } else {
          this.errorMessage.set(res.data?.message || res.message || 'Failed to create vendor.');
        }
      });
  }

  // ═══════════════════════════════════════════════════════════════
  //  VENDOR NOTES (WF-9, SRS §21)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Formats a vendor note’s {@code addedOn} value for the Vendor Notes modal table only.
   * Does not mutate model or API data; on parse failure returns the original string.
   */
  formatVendorNoteAddedOn(addedOn: string | null | undefined): string {
    if (addedOn == null) return '';
    const s = String(addedOn).trim();
    if (s === '') return '';
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleString(undefined, {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  /**
   * Opens the full Notes & Activity UI in a large modal, with Vendor tab active and the row’s vendor
   * pre-selected in the dropdown (same rules as the standalone Notes & Activity Vendor tab).
   */
  onOpenNotesActivityModal(row: Record<string, unknown>): void {
    const vendorKey = (row['vendorKey'] as string | null | undefined)?.trim() ?? '';
    if (!vendorKey) return;
    this.notesActivityModalVendorKey.set(vendorKey);
    this.showNotesActivityModal.set(true);
  }

  /** Navigate to Notes & Activity with optional tab, vendor, and pre-selected recipient email. */
  onNavigateToNotesActivity(options?: {
    tab?: NotesActivityTabId;
    vendorKey?: string;
    email?: string;
  }): void {
    const jobKey = this.jobKey();
    if (!jobKey) return;
    const queryParams: Record<string, string> = {};
    if (options?.tab) queryParams['tab'] = options.tab;
    if (options?.vendorKey?.trim()) queryParams['vendorKey'] = options.vendorKey.trim();
    if (options?.email?.trim()) queryParams['email'] = options.email.trim();
    void this.router.navigate(['/job', jobKey, 'notes-activity'], { queryParams });
  }

  onOpenNotesForVendorEmail(vendorKey: string, email?: string | null): void {
    this.onNavigateToNotesActivity({
      tab: 'vendor',
      vendorKey,
      email: email ?? undefined,
    });
  }

  /** Close Notes & Activity modal and clear vendor context */
  onCloseNotesActivityModal(): void {
    this.showNotesActivityModal.set(false);
    this.notesActivityModalVendorKey.set('');
  }

  /** Open notes modal — loads existing notes and resets the add/edit form */
  onOpenNotes(vendorKey: string): void {
    if (!vendorKey) {
      this.errorMessage.set('Cannot load notes: vendor key is missing for this row.');
      return;
    }
    this.notesVendorKey.set(vendorKey);
    this.vendorNotes.set([]);
    this.noteMessage.set('');
    this.notesSearchTerm.set('');
    this.vendorNoteForm.reset({
      noteKey: '',
      vendorKey,
      noteTitle: '',
      notesDetail: '',
      newNote: 1,
    });
    this.showNotesModal.set(true);
    this.loadNotesForVendor(vendorKey);
  }

  /** Fetch notes list from API */
  private loadNotesForVendor(vendorKey: string): void {
    this.notesLoading.set(true);
    this.noteMessage.set('Please wait loading....');
    this.assignVendorSvc
      .loadVendorNotes(vendorKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        this.notesLoading.set(false);
        this.noteMessage.set('');
        if (res?.status) {
          this.vendorNotes.set(res.data ?? []);
        } else {
          this.noteMessage.set(res?.message || 'Failed to load notes.');
        }
      });
  }

  /** Lazy-load latest note comment as tooltip text on hover, caches result on the row */
  private loadNoteTooltip(row: Record<string, unknown>): void {
    if (row['_noteTooltip'] !== undefined) return;
    const vendorKey = row['vendorKey'] as string;
    if (!vendorKey) return;
    row['_noteTooltip'] = 'Loading...';
    this.assignVendorSvc
      .loadVendorNotes(vendorKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          const notes = res?.data ?? [];
          if (notes.length > 0) {
            const latest = notes[0];
            const plainText = (latest.comment ?? '').replace(/<[^>]*>/g, '').trim();
            row['_noteTooltip'] = plainText.length > 200 ? plainText.substring(0, 200) + '...' : plainText;
          } else {
            row['_noteTooltip'] = 'No notes';
          }
        },
        error: () => { row['_noteTooltip'] = 'Failed to load'; },
      });
  }

  /** Clear cached tooltip so it re-fetches on next hover */
  private invalidateNoteTooltipCache(vendorKey: string): void {
    const allRowSets: Record<string, unknown>[][] = [
      this.locationHistoryVendors() as unknown as Record<string, unknown>[],
      this.pinnedVendors() as unknown as Record<string, unknown>[],
      this.defaultVendors() as unknown as Record<string, unknown>[],
      this.searchResults() as unknown as Record<string, unknown>[],
    ];
    for (const rows of allRowSets) {
      const row = rows.find(r => r['vendorKey'] === vendorKey);
      if (row) delete row['_noteTooltip'];
    }
  }

  /**
   * Builds the vendor login URL for the "Vendor login" link in the Contact column.
   * URL format: {vendorPortalBaseUrl}/VendorLogin/LoginByRCSadmin/{contactKey}?adminKey={adminKey}
   */
  private buildVendorLoginUrl(row: Record<string, unknown>): string {
    const contactKey = row['contactKey'] as string ?? '';
    const adminKey = this.authTokenSvc.getAdminKeyFromToken();
    return `${environment.vendorPortalBaseUrl}/VendorLogin/LoginByRCSadmin/${contactKey}?adminKey=${adminKey}`;
  }

  /**
   * Cleans up address string by removing extra commas and whitespace.
   * Handles cases like "Address, , , " or ", City, State" gracefully.
   */
  private cleanAddress(address: string): string {
    return address
      .replace(/,\s*,+/g, ',')      // Replace multiple commas with single comma
      .replace(/^,\s*/g, '')         // Remove leading comma
      .replace(/,\s*$/g, '')         // Remove trailing comma
      .replace(/\s+/g, ' ')          // Normalize whitespace
      .trim();
  }

  /** Close notes modal and clear state */
  onCloseNotes(): void {
    this.showNotesModal.set(false);
    this.notesVendorKey.set('');
    this.vendorNotes.set([]);
    this.noteMessage.set('');
    this.notesSearchTerm.set('');
    this.vendorNoteForm.reset();
  }

  /** Populate form fields from an existing note row for editing */
  onEditNote(note: VendorNoteItem): void {
    this.vendorNoteForm.patchValue({
      noteKey: note.noteKey,
      noteTitle: note.title,
      notesDetail: note.comment,
      newNote: 0,
    });
    this.noteMessage.set('');
  }

  // ── VENDOR CARD HELPERS ────────────────────────────────────────

  /**
   * Maps a job-status label to a colour token used by `.vc-card__status-badge--<token>`.
   * amber = estimate/financial; green = on-site/complete; red = cancel/fail; blue = default.
   */
  vcStatusColor(status: string | null): string {
    if (!status) return 'blue';
    const s = status.toLowerCase();
    if (s.includes('estimate') || s.includes('invoice') || s.includes('pending payment')) return 'amber';
    if (s.includes('on-site') || s.includes('complete') || s.includes('done') || s.includes('closed')) return 'green';
    if (s.includes('cancel') || s.includes('fail') || s.includes('reject')) return 'red';
    return 'blue';
  }

  /** Resolves vendor status text from the same jobStatusList used by the FINANCIAL STATUS dropdown. */
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

  /** FINANCIAL STATUS dropdown options, including the vendor's current status when missing from the list. */
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
  statusDropdownOpen = signal(false);

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

  /** Frontend-only dropdown options for vendor financial status, sourced from loaded vendor card data. */
  vendorFinancialStatusOptions(currentStatus: string | null): string[] {
    const options = new Set<string>();
    const initial = (currentStatus ?? '').trim();
    if (initial) options.add(initial);

    for (const vendor of this.jobHeaderDetail()?.assignedVendors ?? []) {
      const status = (vendor.jobStatusName ?? '').trim();
      if (status) options.add(status);
    }

    return Array.from(options);
  }

  /** Returns the currently displayed frontend status selection for a vendor card. */
  getVendorFinancialStatus(vendorKey: string, currentStatus: string | null): string {
    return this.selectedVendorFinancialStatuses()[vendorKey] ?? currentStatus ?? '';
  }

  /** Updates the frontend-only status dropdown selection for a vendor card. */
  setVendorFinancialStatus(vendorKey: string, value: string): void {
    this.selectedVendorFinancialStatuses.update((current) => ({
      ...current,
      [vendorKey]: value,
    }));
  }

  /** True when job priority is Emergency (legacy CreateJob.js SetTheEmergencyDNE). */
  isEmergencyJobType(jobTypeKey: string | null | undefined): boolean {
    return this.normalizeSelectKey(jobTypeKey ?? '') === AssignVendorComponent.EMERGENCY_JOB_TYPE_KEY;
  }

  isBidOrProjectJobType(jobTypeKey: string | null | undefined): boolean {
    const key = this.normalizeSelectKey(jobTypeKey ?? '');
    return key === AssignVendorComponent.BID_JOB_TYPE_KEY
      || key === AssignVendorComponent.PROJECT_JOB_TYPE_KEY;
  }

  /** Expected job-level NTE from priority + customer profile (mirrors Job Ops UpdateJobJobType). */
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

  /** Loads DNE values from the customer profile (legacy Edit Customer / JobOpsCustomerDneLoad). */
  private loadCustomerProfileDne(customerKey: string): void {
    this.assignVendorSvc
      .getCustomerProfileDne(customerKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe((dne) => {
        this.customerProfileDne.set(dne);
        const hd = this.jobHeaderDetail();
        if (hd) this.syncNteDisplay(hd);
      });
  }

  /**
   * Job DNE was explicitly set at creation.
   * Legacy stores "0" when the user leaves DNE blank — treat 0 as unset and use customer profile.
   */
  private isJobDneFieldSet(value: string | null | undefined): boolean {
    if (value == null || String(value).trim() === '') return false;
    return this.vendorDneNumber(value) !== 0;
  }

  /** Job.CustomerDne only — profile fallback when unset; never RevCustomerDne. */
  private resolveDefaultCustomerNte(hd: JobHeaderDetail, profileFallback: number): number {
    if (this.isJobDneFieldSet(hd.customerDne)) {
      return this.vendorDneNumber(hd.customerDne);
    }
    return profileFallback;
  }

  /** Job.RevCustomerDne when set; otherwise matches default customer NTE. */
  private resolveRevisedCustomerNte(hd: JobHeaderDetail, defaultCustomerNte: number): number {
    if (this.isJobDneFieldSet(hd.revCustomerDne)) {
      return this.vendorDneNumber(hd.revCustomerDne);
    }
    return defaultCustomerNte;
  }

  private isVendorRowDneSet(value: number | null | undefined): boolean {
    return value != null && value !== 0;
  }

  /** JobVendor.VendorDne (original) — never RevVendorDne. */
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

  /** JobVendor.RevVendorDne when set; otherwise job RevVendorDne, then default. */
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

  /**
   * Job Details NTE panel:
   * - Customer NTE: job creation values when set, else customer profile (standard/emergency).
   * - Vendor NTE: default assigned vendor JobVendor DNE (assign/send WO), else job creation, else profile.
   * - Bid/Project: vendor DNE is always 0 (job row "0" is valid — not legacy unset).
   */
  private syncNteDisplay(hd: JobHeaderDetail): void {
    
    const expected = this.getExpectedNteForPriority(hd);
    const isBidOrProject = this.isBidOrProjectJobType(hd.jobTypeKey);

    // Default customer NTE = Job.CustomerDne (original). Never use RevCustomerDne here —
    // after estimate approval only RevCustomerDne changes; CustomerDne preserves pre-approval value.
    const customerNte = this.resolveDefaultCustomerNte(hd, expected.customer);
    const revCustomerNte = this.resolveRevisedCustomerNte(hd, customerNte);

    const dv = hd.assignedVendors.find((v) => v.isDefault) ?? hd.assignedVendors[0];
    
    let vendorNte: number;
    let revVendorNte: number;

    if (isBidOrProject) {
      vendorNte = 0;
      revVendorNte = 0;
    } else {
      vendorNte = this.resolveDefaultVendorNte(dv, hd, expected.vendor);
      revVendorNte = this.resolveRevisedVendorNte(dv, hd, vendorNte);
    }

    this.nteCustomer.set(String(customerNte));
    this.nteRevCustomer.set(String(revCustomerNte));
    this.nteVendor.set(String(vendorNte));
    this.nteRevVendor.set(String(revVendorNte));
  }

  /** Vendor card FINANCIAL DNE — per-vendor JobVendor row (original VendorDne only). */
  getVendorCardVendorDne(vendorDne: number | null, revVendorDne: number | null): number {
    if (this.isVendorRowDneSet(vendorDne)) {
      return this.vendorDneNumber(vendorDne);
    }
    return this.vendorDneNumber(this.nteVendor());
  }

  getVendorCardRevVendorDne(vendorDne: number | null, revVendorDne: number | null): number {
    if (this.isVendorRowDneSet(revVendorDne)) {
      return this.vendorDneNumber(revVendorDne);
    }
    if (this.isVendorRowDneSet(vendorDne)) {
      return this.vendorDneNumber(vendorDne);
    }
    return this.vendorDneNumber(this.nteRevVendor());
  }

  /** Normalizes vendor DNE for display — legacy always shows a number, defaulting to 0. */
  vendorDneNumber(value: number | string | null | undefined): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const parsed = Number(String(value).trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private resolveVendorDneForDisplay(
    vendorValue: number | null | undefined,
    jobValue: string | null | undefined,
  ): number {
    if (vendorValue != null) return vendorValue;
    return this.vendorDneNumber(jobValue);
  }

  /** Returns the editable Vendor DNE string shown in the Vendors accordion. */
  getVendorFinancialDne(vendorKey: string, vendorDne: number | null, revVendorDne: number | null): string {
    const local = this.selectedVendorFinancialDnes()[vendorKey];
    if (local != null) return local;
    const value = this.isVendorRowDneSet(vendorDne) ? vendorDne : revVendorDne;
    return String(this.vendorDneNumber(value));
  }

  /** Returns the numeric DNE value currently displayed for Revised Vendor DNE. */
  getVendorFinancialDneNumber(vendorKey: string, vendorDne: number | null, revVendorDne: number | null): number {
    const raw = this.getVendorFinancialDne(vendorKey, vendorDne, revVendorDne).trim();
    const fallback = this.isVendorRowDneSet(revVendorDne) ? revVendorDne : vendorDne;
    return this.vendorDneNumber(raw || fallback);
  }

  /** Updates the frontend-only Vendor DNE input for a vendor card. */
  setVendorFinancialDne(vendorKey: string, value: string): void {
    this.selectedVendorFinancialDnes.update((current) => ({
      ...current,
      [vendorKey]: value,
    }));
  }

  /** Returns true while the save is in progress for a given jobVendorKey. */
  isVendorDneSaving(jobVendorKey: string): boolean {
    return this.vendorDneSaving()[jobVendorKey] === true;
  }

  /** Saves the edited Vendor DNE for a vendor card to the backend. */
  onSaveVendorDne(vendor: { jobVendorKey: string; vendorKey: string; vendorDne: number | null; revVendorDne: number | null }): void {
    const rawValue = this.getVendorFinancialDne(vendor.vendorKey, vendor.vendorDne, vendor.revVendorDne);
    const parsed = parseFloat(rawValue);
    if (!rawValue.trim() || !Number.isFinite(parsed)) {
      this.errorMessage.set('Please enter a valid number for Vendor DNE.');
      return;
    }

    this.vendorDneSaving.update((s) => ({ ...s, [vendor.jobVendorKey]: true }));
    this.assignVendorSvc
      .updateVendorDne(vendor.jobVendorKey, parsed)
      .pipe(takeUntil(this.destroy$), finalize(() => this.vendorDneSaving.update((s) => ({ ...s, [vendor.jobVendorKey]: false }))))
      .subscribe({
        next: (res) => {
          if (!res.status) {
            this.errorMessage.set(res.message || 'Unable to save Vendor DNE.');
          } else {
            // Update the local vendor detail so both fields reflect the saved value
            this.jobHeaderDetail.update((hd) => {
              if (!hd) return hd;
              const next = {
                ...hd,
                assignedVendors: hd.assignedVendors.map((v) =>
                  v.jobVendorKey === vendor.jobVendorKey
                    ? { ...v, vendorDne: parsed, revVendorDne: parsed }
                    : v,
                ),
              };
              this.syncNteDisplay(next);
              return next;
            });
            // Clear the draft so the input reflects the saved value
            this.selectedVendorFinancialDnes.update((d) => {
              const next = { ...d };
              delete next[vendor.vendorKey];
              return next;
            });
            this.successMessage.set('Vendor DNE saved.');
            setTimeout(() => this.successMessage.set(''), 3000);
          }
        },
        error: () => this.errorMessage.set('Error saving Vendor DNE.'),
      });
  }

  private syncVendorScheduleDrafts(vendors: JobHeaderDetail['assignedVendors']): void {
    const next: Record<string, { scheduleDate: string; returnScheduleDate: string }> = {};
    for (const vendor of vendors) {
      next[vendor.jobVendorKey] = {
        scheduleDate: this.toDateTimeLocalValue(vendor.scheduleDateIso) || this.parseDisplayScheduleToLocalValue(vendor.scheduleDate),
        returnScheduleDate: this.toDateTimeLocalValue(vendor.returnScheduleDateIso) || this.parseDisplayScheduleToLocalValue(vendor.returnScheduleDate),
      };
    }
    this.vendorScheduleDrafts.set(next);
  }

  /**
   * Converts backend schedule ISO into datetime-local value.
   * API returns wall-clock time at the service location (yyyy-MM-ddTHH:mm), not UTC.
   */
  private toDateTimeLocalValue(rawIso: string | null): string {
    if (!rawIso?.trim()) return '';
    const trimmed = rawIso.trim();
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    // Legacy payloads with Z or offset: convert instant to location display is not available here;
    // fall back to browser-local interpretation of the instant.
    const hasOffset = /(?:Z|[+-]\d{2}:\d{2})$/i.test(trimmed);
    const dt = new Date(hasOffset ? trimmed : `${trimmed}Z`);
    if (Number.isNaN(dt.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  }

  /**
   * Parses the backend display strings into "YYYY-MM-DDTHH:mm".
   * Prefers service-location time when present:
   *   non-EST: "5/8/2026 at 9:00 AM (Pacific) 1:00 PM EST" → 9:00 AM
   *   EST:     "5/8/2026 9:00 AM EST"
   */
  private parseDisplayScheduleToLocalValue(displayValue: string | null): string {
    if (!displayValue?.trim()) return '';
    const atLocal = displayValue.match(
      /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+at\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i,
    );
    const m =
      atLocal ??
      displayValue.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!m) return '';
    const [, mon, day, year, rawHour, min, ampm] = m;
    let h = parseInt(rawHour, 10);
    if (ampm.toUpperCase() === 'AM' && h === 12) h = 0;
    if (ampm.toUpperCase() === 'PM' && h !== 12) h += 12;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${year}-${pad(parseInt(mon, 10))}-${pad(parseInt(day, 10))}T${pad(h)}:${pad(parseInt(min, 10))}`;
  }

  /**
   * Sends datetime-local value to the API as location wall time (YYYY-MM-DDTHH:mm).
   * Backend converts to UTC using the job service location time zone (legacy parity).
   */
  private toScheduleLocalIsoString(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed) ? trimmed : null;
  }

  /**
   * Builds a schedule field payload for save: null = omit (unchanged), '' = clear, value = set/update.
   * Prevents re-sending an unchanged regular ETA when only the return ETA was edited.
   */
  private buildScheduleFieldPayload(
    vendor: AssignedVendorDetail | undefined,
    draftValue: string,
    savedIso: string | null | undefined,
    canEdit: boolean,
  ): string | null {
    if (!canEdit) return null;

    const saved = (savedIso ?? '').trim();
    const draftTrimmed = draftValue.trim();

    if (!draftTrimmed) {
      return saved ? '' : null;
    }

    const draftIso = this.toScheduleLocalIsoString(draftTrimmed);
    if (draftIso == null) return null;
    if (draftIso === saved) return null;

    return draftIso;
  }

  /** Trigger bits where return schedule may be edited (return-visit workflow). */
  private static readonly RETURN_SCHEDULE_EDIT_TRIGGER_BITS = new Set([15, 16, 17, 18, 22]);

  /** Trigger bits where the vendor is on-site — schedule ETA cannot be edited. */
  private static readonly SCHEDULE_DATE_LOCKED_TRIGGER_BITS = new Set([4, 17]);

  /** Schedule ETA is locked after check-in (legacy: must check out or use on-site approval). */
  canEditScheduleDate(vendor: AssignedVendorDetail): boolean {
    if (vendor.isCheckedIn) return false;
    const bit = vendor.triggerBit;
    return bit == null || !AssignVendorComponent.SCHEDULE_DATE_LOCKED_TRIGGER_BITS.has(bit);
  }

  /** Return schedule is editable only after the job reaches Pending Return ETA or later. */
  canEditReturnScheduleDate(vendor: AssignedVendorDetail): boolean {
    const bit = vendor.triggerBit;
    if (bit != null && AssignVendorComponent.RETURN_SCHEDULE_EDIT_TRIGGER_BITS.has(bit)) return true;
    return bit === 8 && vendor.hasApprovedEstimate === true;
  }

  getVendorScheduleDraft(
    jobVendorKey: string,
    field: 'scheduleDate' | 'returnScheduleDate',
    fallbackIso: string | null,
    fallbackDisplay: string | null,
  ): string {
    const local = this.vendorScheduleDrafts()[jobVendorKey]?.[field] ?? '';
    if (local.trim()) return local;
    return this.toDateTimeLocalValue(fallbackIso) || this.parseDisplayScheduleToLocalValue(fallbackDisplay);
  }

  setVendorScheduleDraft(
    jobVendorKey: string,
    field: 'scheduleDate' | 'returnScheduleDate',
    value: string,
    vendor?: AssignedVendorDetail,
  ): void {
    if (field === 'scheduleDate' && vendor && !this.canEditScheduleDate(vendor)) {
      return;
    }
    if (field === 'returnScheduleDate' && vendor && !this.canEditReturnScheduleDate(vendor)) {
      return;
    }
    this.vendorScheduleDrafts.update((current) => ({
      ...current,
      [jobVendorKey]: { ...(current[jobVendorKey] ?? { scheduleDate: '', returnScheduleDate: '' }), [field]: value },
    }));
  }

  isVendorScheduleSaving(jobVendorKey: string): boolean {
    return this.vendorScheduleSaving()[jobVendorKey] === true;
  }

  /** True when the vendor card exposes a given status action (e.g. confirm_eta_manually). */
  vendorHasStatusAction(vendor: AssignedVendorDetail | undefined, actionId: string): boolean {
    return !!vendor?.statusActions?.some((a) => a.actionId === actionId);
  }

  /** Maps legacy trigger bit to job status option for immediate UI updates after schedule save. */
  private resolveJobStatusFromTrigger(triggerBit: number): {
    jobStatusKey: string;
    jobStatusName: string;
    triggerBit: number;
  } | null {
    const patterns: Record<number, RegExp> = {
      2: /pending eta(?!.*return)/i,
      3: /pending check[- ]?in(?!.*return)/i,
      15: /pending return eta/i,
      16: /pending return check/i,
    };
    const pattern = patterns[triggerBit];
    if (!pattern) return null;
    const opt = this.jobStatusList().find((o) => pattern.test((o.text ?? '').trim()));
    if (!opt?.value) return null;
    return {
      jobStatusKey: opt.value,
      jobStatusName: (opt.text ?? '').trim(),
      triggerBit,
    };
  }

  /** Applies vendor row + header status immediately after schedule save (before reload completes). */
  private applyVendorScheduleStatusUpdate(
    jobVendorKey: string,
    patch: Partial<AssignedVendorDetail> & {
      jobStatusKey?: string | null;
      jobStatusName?: string | null;
      triggerBit?: number | null;
    },
  ): void {
    this.assignVendorSvc.patchAssignedVendor(jobVendorKey, patch);
  }

  private scheduleSaveResultFromDataReturn(res: {
    status?: boolean;
    data?: DataReturn | SetEtaEmailPromptResponse | null;
    message?: string;
  }): {
    status: boolean;
    message: string;
    vendorPatch: Partial<AssignedVendorDetail> | null;
  } {
    const data = res.data;

    // Check if this is a SetEtaEmailPromptResponse (has vendorContacts property)
    const isEtaPrompt = data && 'vendorContacts' in data;
    if (isEtaPrompt) {
      // For ETA prompt responses, return success with no vendor patch
      // The actual patch is handled separately in the save handler
      return {
        status: res.status ?? false,
        message: res.message || 'Schedule saved successfully.',
        vendorPatch: null,
      };
    }

    // Original logic for DataReturn responses
    const vendorPatch: Partial<AssignedVendorDetail> = {};

    if (data && 'jobStatusKey' in data && 'jobStatusName' in data && 'triggerBit' in data && data.triggerBit != null) {
      vendorPatch.jobStatusKey = (data as DataReturn).jobStatusKey;
      vendorPatch.jobStatusName = (data as DataReturn).jobStatusName;
      vendorPatch.triggerBit = (data as DataReturn).triggerBit;
    } else if (data && 'triggerBit' in data && data.triggerBit != null) {
      const triggerBit = (data as DataReturn).triggerBit;
      if (typeof triggerBit === 'number') {
        const resolved = this.resolveJobStatusFromTrigger(triggerBit);
        if (resolved) {
          vendorPatch.jobStatusKey = resolved.jobStatusKey;
          vendorPatch.jobStatusName = resolved.jobStatusName;
          vendorPatch.triggerBit = resolved.triggerBit;
        }
      }
    }

    if (data?.statusActions) {
      vendorPatch.statusActions = data.statusActions;
    }
    if (data?.etaConfirmedByAdmin != null) {
      vendorPatch.etaConfirmedByAdmin = data.etaConfirmedByAdmin;
    }
    if (data?.etaConfirmedByVendor != null) {
      vendorPatch.etaConfirmedByVendor = data.etaConfirmedByVendor;
    }
    if (data?.returnEtaConfirmedByAdmin != null) {
      vendorPatch.returnEtaConfirmedByAdmin = data.returnEtaConfirmedByAdmin;
    }
    if (data?.returnEtaConfirmedByVendor != null) {
      vendorPatch.returnEtaConfirmedByVendor = data.returnEtaConfirmedByVendor;
    }

    return {
      status: !!res.status,
      message: res.message || data?.message || '',
      vendorPatch: Object.keys(vendorPatch).length > 0 ? vendorPatch : null,
    };
  }

  saveVendorSchedule(jobVendorKey: string, vendor?: AssignedVendorDetail): void {
    const draft = this.vendorScheduleDrafts()[jobVendorKey] ?? { scheduleDate: '', returnScheduleDate: '' };

    if (
      draft.scheduleDate.trim() &&
      vendor &&
      !this.canEditScheduleDate(vendor)
    ) {
      this.errorMessage.set('ETA cannot be changed after the vendor has checked in.');
      return;
    }

    if (
      draft.returnScheduleDate.trim() &&
      vendor &&
      !this.canEditReturnScheduleDate(vendor)
    ) {
      this.errorMessage.set(
        'Return schedule date can only be changed after the job reaches Pending Return ETA or later.',
      );
      return;
    }

    const scheduleDate = this.buildScheduleFieldPayload(
      vendor,
      draft.scheduleDate,
      vendor?.scheduleDateIso,
      !vendor || this.canEditScheduleDate(vendor),
    );
    const returnScheduleDate = this.buildScheduleFieldPayload(
      vendor,
      draft.returnScheduleDate,
      vendor?.returnScheduleDateIso,
      !vendor || this.canEditReturnScheduleDate(vendor),
    );

    if (scheduleDate == null && returnScheduleDate == null) {
      this.errorMessage.set('No schedule changes to save.');
      return;
    }

    this.errorMessage.set('');
    this.vendorScheduleSaving.update((current) => ({ ...current, [jobVendorKey]: true }));

    this.assignVendorSvc
      .updateVendorScheduleDates({
        jobVendorKey,
        scheduleDate,
        returnScheduleDate,
      })
      .pipe(
        switchMap((res) => {
          this.vendorScheduleSaving.update((current) => ({ ...current, [jobVendorKey]: false }));

          // Check if this is a first-time ETA set (backend returns email prompt data)
          if (res.status && res.data && res.data.vendorContacts && res.data.vendorContacts.length > 0) {
            // First-time ETA set - show email confirmation modal
            this.openEtaEmailModal(res.data);

            // Still update the vendor card with the new schedule
            const draftPatch: Partial<AssignedVendorDetail> = {};
            if (scheduleDate) {
              draftPatch.scheduleDateIso = scheduleDate;
            }
            if (returnScheduleDate) {
              draftPatch.returnScheduleDateIso = returnScheduleDate;
            }
            this.applyVendorScheduleStatusUpdate(jobVendorKey, draftPatch);
            return EMPTY;
          }

          // Regular ETA update (not first-time) - proceed as normal
          const mapped = this.scheduleSaveResultFromDataReturn(res);
          if (!mapped.status) {
            this.errorMessage.set(mapped.message || 'Unable to save schedule dates.');
            return EMPTY;
          }

          const draftPatch: Partial<AssignedVendorDetail> = {};
          if (scheduleDate) {
            draftPatch.scheduleDateIso = scheduleDate;
          }
          if (returnScheduleDate) {
            draftPatch.returnScheduleDateIso = returnScheduleDate;
          }

          if (mapped.vendorPatch || Object.keys(draftPatch).length > 0) {
            this.applyVendorScheduleStatusUpdate(jobVendorKey, {
              ...draftPatch,
              ...mapped.vendorPatch,
            });
          }

          const statusName = mapped.vendorPatch?.jobStatusName;
          const apiMessage = mapped.message?.trim();
          const msg = apiMessage
            || (statusName ? `Schedule saved. Status updated to ${statusName}.` : 'Schedule updated successfully.');
          this.successMessage.set(msg);
          setTimeout(() => this.successMessage.set(''), 5000);

          const jobKey = this.jobKey();
          if (!jobKey) return EMPTY;
          return this.assignVendorSvc.loadJobHeaderDetail(jobKey);
        }),
        takeUntil(this.destroy$),
      )
      .subscribe();
  }

  // ── VENDOR LOGIN EMAIL MODAL ───────────────────────────────────

  // ── ETA SET EMAIL NOTIFICATION MODAL ────────────────────────────

  /** Opens the ETA set email modal with vendor contact data */
  openEtaEmailModal(data: SetEtaEmailPromptResponse): void {
    this.showEtaEmailModal.set(data);
    this.etaEmailNote = data.defaultEmailNote || '';
    this.etaCustomEmail = '';
    this.etaSending.set(false);
    this.etaEmailError.set('');

    // Pre-select default contacts
    this.etaSelectedContacts.clear();
    data.vendorContacts.forEach(contact => {
      if (contact.isDefault) {
        this.etaSelectedContacts.add(contact.contactKey);
      }
    });
  }

  /** Checks if a contact is currently selected */
  isContactSelected(contactKey: string): boolean {
    return this.etaSelectedContacts.has(contactKey);
  }

  /** Toggles contact selection */
  onToggleContact(contactKey: string, event: Event): void {
    const checkbox = event.target as HTMLInputElement;
    if (checkbox.checked) {
      this.etaSelectedContacts.add(contactKey);
    } else {
      this.etaSelectedContacts.delete(contactKey);
    }
  }

  /** Sends the ETA set email notification */
  onSendEtaEmail(): void {
    const etaData = this.showEtaEmailModal();
    if (!etaData) return;

    // Validate that at least one contact or custom email is provided
    const selectedKeys = Array.from(this.etaSelectedContacts);
    if (selectedKeys.length === 0 && !this.etaCustomEmail.trim()) {
      this.etaEmailError.set('Please select at least one contact or provide a custom email.');
      return;
    }

    const request: SendEtaSetEmailRequest = {
      jobVendorKey: etaData.jobVendorKey,
      emailNote: this.etaEmailNote.trim() || null,
      vendorContactKeys: selectedKeys.length > 0 ? selectedKeys : null,
      customEmail: this.etaCustomEmail.trim() || null,
    };

    this.etaSending.set(true);
    this.etaEmailError.set('');

    this.assignVendorSvc
      .sendEtaSetNotification(request)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.etaSending.set(false);
          if (res.status) {
            this.successMessage.set(res.message || 'ETA saved and notification sent!');
            setTimeout(() => this.successMessage.set(''), 5000);
            this.onCloseEtaEmailModal();

            // Refresh job header detail
            const jobKey = this.jobKey();
            if (jobKey) {
              this.assignVendorSvc.loadJobHeaderDetail(jobKey).pipe(takeUntil(this.destroy$)).subscribe();
            }
          } else {
            this.etaEmailError.set(res.message || 'Failed to send email notification.');
          }
        },
        error: () => {
          this.etaSending.set(false);
          this.etaEmailError.set('Failed to send email. Please try again.');
        },
      });
  }

  /** Skips the email notification */
  onSkipEtaEmail(): void {
    this.successMessage.set('ETA saved. Email notification skipped.');
    setTimeout(() => this.successMessage.set(''), 5000);
    this.onCloseEtaEmailModal();

    // Refresh job header detail
    const jobKey = this.jobKey();
    if (jobKey) {
      this.assignVendorSvc.loadJobHeaderDetail(jobKey).pipe(takeUntil(this.destroy$)).subscribe();
    }
  }

  /** Closes the ETA email modal */
  onCloseEtaEmailModal(): void {
    this.showEtaEmailModal.set(null);
    this.etaEmailError.set('');
    this.etaEmailNote = '';
    this.etaCustomEmail = '';
    this.etaSelectedContacts.clear();
  }

  // ── VENDOR LOGIN EMAIL MODAL ───────────────────────────────────

  /** Opens the login email modal for a given vendor card and loads its contacts. */
  openLoginEmailModal(vendor: { jobVendorKey: string; vendorKey: string; vendorName: string | null }): void {
    this.loginEmailVendor.set(vendor);
    this.loginEmailSelected.set(new Set());
    this.loginEmailNote.set('');
    this.loginEmailContactsLoading.set(true);
    this.assignVendorSvc
      .getVendorContactList(vendor.vendorKey)
      .pipe(takeUntil(this.destroy$), finalize(() => this.loginEmailContactsLoading.set(false)))
      .subscribe((contacts) => {
        this.loginEmailContacts.set(contacts);
        // Pre-select the default contact
        const defaultKeys = new Set(contacts.filter((c) => c.isDefault).map((c) => c.value));
        this.loginEmailSelected.set(defaultKeys);
      });
  }

  closeLoginEmailModal(): void {
    this.loginEmailVendor.set(null);
    this.loginEmailContacts.set([]);
    this.loginEmailSelected.set(new Set());
    this.loginEmailNote.set('');
  }

  toggleLoginEmailContact(contactKey: string): void {
    this.loginEmailSelected.update((sel) => {
      const next = new Set(sel);
      if (next.has(contactKey)) next.delete(contactKey);
      else next.add(contactKey);
      return next;
    });
  }

  isLoginContactSelected(contactKey: string): boolean {
    return this.loginEmailSelected().has(contactKey);
  }

  /** Sends login email to each selected contact in sequence. */
  sendLoginEmails(): void {
    const vendor = this.loginEmailVendor();
    const jobKey = this.jobKey();
    if (!vendor || !jobKey) return;

    const selectedContacts = this.loginEmailContacts().filter((c) => this.loginEmailSelected().has(c.value));
    if (selectedContacts.length === 0) {
      this.errorMessage.set('Please select at least one contact.');
      return;
    }

    const note = this.loginEmailNote();
    this.loginEmailSending.set(true);

    const requests = selectedContacts
      .filter((c) => c.email)
      .map((c) =>
        this.assignVendorSvc.sendVendorLoginEmail({
          jobKey,
          vendorKey: vendor.vendorKey,
          email: c.email!,
          loginEmailNote: note || null,
        }),
      );

    if (requests.length === 0) {
      this.loginEmailSending.set(false);
      this.errorMessage.set('No email addresses found for the selected contacts.');
      return;
    }

    forkJoin(requests)
      .pipe(takeUntil(this.destroy$), finalize(() => this.loginEmailSending.set(false)))
      .subscribe({
        next: () => {
          this.successMessage.set(`Login email sent to ${requests.length} contact(s).`);
          setTimeout(() => this.successMessage.set(''), 4000);
          this.closeLoginEmailModal();
        },
        error: () => this.errorMessage.set('Error sending login email.'),
      });
  }

  // ── CUSTOMER REQUESTOR DROPDOWN ───────────────────────────────

  /** Called when the Customer Requestor dropdown selection changes. */
  /** Normalizes a GUID string so native select value matching is reliable. */
  normalizeSelectKey(value: string | null | undefined): string {
    return (value ?? '').trim().toLowerCase();
  }

  private resolveCustomerRequestorKey(hd: JobHeaderDetail, opts: CustomerRequestorOption[]): string | null {
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

  /** Ensures the job's current requestor contact is present in the dropdown options. */
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
      if (byName) {
        contactKey = byName.value;
      }
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

  private resolveJobPriorityKey(hd: JobHeaderDetail | null, opts: JobPriorityOption[]): string | null {
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
    this.pageContext.update((pc) =>
      pc ? { ...pc, jobTypeKey: resolvedKey } : pc,
    );
    this.commitOriginalJobPriorityKey(resolvedKey);
  }

  private commitOriginalJobPriorityKey(value: string | null | undefined): void {
    const key = this.normalizeSelectKey(value ?? '');
    this.originalJobTypeKey.set(key);
    this.jobPriorityUiKey.set(key);
  }

  private refreshJobPriorityVendorCheck(jobKey: string): void {
    this.assignVendorSvc
      .getJobPriorityVendorCheck(jobKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe((check) => this.jobPriorityVendorCheck.set(check));
  }

  isRecallJobPriority(jobTypeKey: string | null | undefined): boolean {
    return this.normalizeSelectKey(jobTypeKey ?? '') === AssignVendorComponent.RECALL_JOB_TYPE_KEY;
  }


  formatPriorityCurrency(amount: number | null | undefined): string {
    const value = Number(amount);
    const safe = Number.isFinite(value) ? value : 0;
    return safe.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  }

  priorityResponseTimeChanged(preview: JobPriorityChangePreview | null): boolean {
    if (!preview) return false;
    return (preview.oldResponseTime ?? '') !== (preview.newResponseTime ?? '');
  }

  /** Classifies a priority (from its job-type key / display name) into one of the five buckets. */
  private classifyPriorityKind(
    key: string | null | undefined,
    name: string | null | undefined,
  ): 'standard' | 'emergency' | 'bid' | 'project' | 'pm' | 'high priority' {
    const k = this.normalizeSelectKey(key ?? '');
    const n = (name ?? '').toLowerCase();

    if (k === AssignVendorComponent.EMERGENCY_JOB_TYPE_KEY || n.includes('emergency')) {
      return 'emergency';
    }
    if (k === AssignVendorComponent.HIGH_PRIORITY_JOB_TYPE_KEY || n.includes('high')) {
      return 'high priority';
    }
    if (k === AssignVendorComponent.BID_JOB_TYPE_KEY || n.includes('bid')) {
      return 'bid';
    }
    if (k === AssignVendorComponent.PROJECT_JOB_TYPE_KEY || n.includes('project')) {
      return 'project';

    
    }
    if (
      k === AssignVendorComponent.PM_JOB_TYPE_KEY
      || n === 'pm'
      || n.includes('preventat')
      || n.includes('maintenance')
    ) {
      return 'pm';
    }
    return 'standard';
  }

  /** Human-friendly label used inside the confirmation copy for a target priority. */
  private priorityLabel(kind: 'standard' | 'emergency' | 'bid' | 'project' | 'pm' | 'high priority'): string {
    switch (kind) {
      case 'emergency': return 'Emergency';
      case 'bid': return 'Bid Request';
      case 'project': return 'Project';
      case 'pm': return 'PM';
      case 'high priority': return 'High Priority';
      default: return 'Standard';
    }
  }

  /**
   * Builds the plain-language confirmation lines shown in the priority-change modal.
   * Covers the full "from → to" matrix defined in RBR-456…RBR-460, driven by the preview data
   * (vendor DNE change + response-time change) so every source/target combination is handled.
   */
  priorityChangeMessageLines(): string[] {
    const preview = this.jobPriorityPreview();
    if (!preview) return [];

    const fromKind = this.classifyPriorityKind(preview.oldJobTypeKey, preview.oldPriorityName);
    const toKind = this.classifyPriorityKind(preview.newJobTypeKey, preview.newPriorityName);
    const targetLabel = this.priorityLabel(toKind);

    const assignedVendors = this.jobHeaderDetail()?.assignedVendors ?? [];
    const primaryVendor = assignedVendors.find((v) => v.isDefault) ?? assignedVendors[0];
    const oldVendorDneIsRevised = !!primaryVendor && this.vendorHasManuallyRevisedDne(primaryVendor);
    const oldVendorDneNumber = oldVendorDneIsRevised
      ? this.vendorExistingDneNumber(primaryVendor)
      : preview.oldVendorDne;
    const oldVendorDne = this.formatPriorityCurrency(oldVendorDneNumber);
    const newVendorDne = this.formatPriorityCurrency(preview.newVendorDne);
    const oldResponseTime = preview.oldResponseTime?.trim() || 'not configured';
    const newResponseTime = preview.newResponseTime?.trim() || 'not configured';
    const vendorDneChanged = preview.vendorDneChanged;
    const responseTimeChanged = this.priorityResponseTimeChanged(preview);

    const lines: string[] = [];

    switch (toKind) {
      case 'emergency':
        lines.push('You are changing this job to an Emergency.');
        break;
      case 'bid':
        lines.push('You are changing this job to a Bid Request.');
        break;
      case 'project':
        lines.push('You are changing this job to a Project.');
        break;
      case 'pm':
        lines.push('You are changing this job to a PM.');
        lines.push('Make sure that this job is a Preventative Maintenance Job or do cancel this change.');
        break;
      case 'high priority':
        lines.push('You are changing this job to a High Priority.');
        break;
      default:
        lines.push('You are changing this to a Standard Priority.');
        break;
    }

    // When the primary vendor has a manually-revised DNE, the admin's Keep/Change choice for
    // that vendor overrides whether the DNE (and its email notice) actually changes — the
    // backend's vendorDneChanged flag only reflects the priority's default DNE.
    const choices = this.jobPriorityVendorDneChoices();
    const revisedVendors = this.jobPriorityRevisedVendors();
    const primaryVendorKeepsRevisedDne =
      !!primaryVendor
      && oldVendorDneIsRevised
      && revisedVendors.some((v) => v.jobVendorKey === primaryVendor.jobVendorKey)
      && choices[primaryVendor.jobVendorKey] === 'keep';

    const dneWillActuallyChange = vendorDneChanged && !primaryVendorKeepsRevisedDne;

    if (dneWillActuallyChange) {
      if (toKind === 'emergency' && fromKind === 'standard') {
        lines.push(
          oldVendorDneIsRevised
            ? `Your vendor has already received a Non-Emergency work order and a Revised DNE of ${oldVendorDne}.`
            : `Your vendor has already received a Non-Emergency work order and a DNE of ${oldVendorDne}.`,
        );
      } else {
        lines.push(
          oldVendorDneIsRevised
            ? `Your vendor has already received a Revised DNE of ${oldVendorDne}.`
            : `Your vendor has already received a ${oldVendorDne} DNE.`,
        );
      }
      lines.push(`Clicking Continue will change Priority to "${targetLabel}" and change DNE to ${newVendorDne}.`);
      lines.push(`This will email a revised ${newVendorDne} DNE to the vendor.`);
    } else if (toKind === 'project') {
      lines.push('"Project" Priority is when a job will be a large cost job and likely take multiple visits to complete.');
    }

    if (responseTimeChanged) {
      lines.push(`The Response time that the vendor can accept and set the ETA is changing from ${oldResponseTime} to ${newResponseTime}.`);
    }

    // Revised-DNE vendors the admin chose to "Change" get their own email notice, even when
    // the priority's default DNE isn't moving (vendorDneChanged only reflects the default).
    if (!dneWillActuallyChange) {
      const changingToNewDne = revisedVendors.some((v) => choices[v.jobVendorKey] === 'change');
      if (changingToNewDne) {
        lines.push(`This will email a revised ${newVendorDne} DNE to the vendor.`);
      }
    }

    return lines;
  }

  /** The vendor's current effective DNE (manually-revised value if set, otherwise the base DNE). */
  vendorExistingDneNumber(vendor: AssignedVendorDetail): number {
    if (this.isVendorRowDneSet(vendor.revVendorDne)) {
      return this.vendorDneNumber(vendor.revVendorDne);
    }
    return this.vendorDneNumber(vendor.vendorDne);
  }

  /** True only when the vendor's DNE has been manually revised away from its base value. */
  private vendorHasManuallyRevisedDne(vendor: AssignedVendorDetail): boolean {
    return (
      this.isVendorRowDneSet(vendor.revVendorDne) &&
      this.vendorDneNumber(vendor.revVendorDne) !== this.vendorDneNumber(vendor.vendorDne)
    );
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

  /** Called when the Job Priority dropdown selection changes. */
  /** Sets the Keep/Change choice for a revised vendor's DNE in the priority-change modal. */
  onJobPriorityVendorDneChoiceChange(jobVendorKey: string, choice: 'keep' | 'change'): void {
    this.jobPriorityVendorDneChoices.update((choices) => ({ ...choices, [jobVendorKey]: choice }));
  }

  private blockJobPriorityChange(revertKey: string, message: string): void {
    this.jobPriorityUiKey.set(revertKey);
    const text = (message ?? '').trim();
    this.errorMessage.set(
      !text || text.toLowerCase() === 'ok'
        ? 'Unable to load priority change details.'
        : text,
    );
    setTimeout(() => this.errorMessage.set(''), 6000);
  }

  onCancelJobPriorityChange(): void {
    this.jobPriorityUiKey.set(this.originalJobTypeKey());
    this.jobPriorityPendingKey.set(null);
    this.jobPriorityPreview.set(null);
    this.jobPriorityChangeStatus.set(null);
    this.jobPriorityChangeModalOpen.set(false);
    this.jobPriorityRevisedVendors.set([]);
    this.jobPriorityVendorDneChoices.set({});
  }

  onConfirmJobPriorityChange(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();

    const jobKey = this.jobKey();
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
          const revisedVendors = this.jobPriorityRevisedVendors();
          const vendorDneChoices = this.jobPriorityVendorDneChoices();
          const newVendorDne = previewSnapshot?.newVendorDne;

          this.jobPriorityChangeModalOpen.set(false);
          this.jobPriorityPreview.set(null);
          this.jobPriorityPendingKey.set(null);
          this.jobPriorityChangeStatus.set(null);
          this.jobPriorityRevisedVendors.set([]);
          this.jobPriorityVendorDneChoices.set({});
          this.successMessage.set('Job priority updated.');
          setTimeout(() => this.successMessage.set(''), 3000);

          if (previewSnapshot) {
            this.nteCustomer.set(String(previewSnapshot.newCustomerDne));
            this.nteRevCustomer.set(String(previewSnapshot.newCustomerDne));
            this.nteVendor.set(String(previewSnapshot.newVendorDne));
            this.nteRevVendor.set(String(previewSnapshot.newVendorDne));
            this.jobHeaderDetail.update((hd) =>
              hd
                ? {
                    ...hd,
                    jobTypeKey: savedKey,
                    jobTypeName: previewSnapshot.newPriorityName ?? hd.jobTypeName,
                    customerDne: String(previewSnapshot.newCustomerDne),
                    revCustomerDne: String(previewSnapshot.newCustomerDne),
                    vendorDne: String(previewSnapshot.newVendorDne),
                    revVendorDne: String(previewSnapshot.newVendorDne),
                  }
                : hd,
            );
            this.pageContext.update((pc) => (pc ? { ...pc, jobTypeKey: savedKey } : pc));
            this.commitOriginalJobPriorityKey(savedKey);
          }

          if (newVendorDne != null) {
            const vendorsToChange = revisedVendors.filter(
              (v) => vendorDneChoices[v.jobVendorKey] === 'change',
            );
            this.applyRevisedVendorDneChanges(vendorsToChange, newVendorDne, jobKey);
          } else {
            this.loadInitialData(jobKey);
          }
        },
        error: () => {
          this.jobPriorityChangeStatus.set('Error updating job priority.');
          this.jobPriorityUiKey.set(oldKey);
        },
      });
  }

  /** After a priority change is saved, applies the admin's "Change" choice to each affected vendor's DNE. */
  private applyRevisedVendorDneChanges(
    vendors: AssignedVendorDetail[],
    newVendorDne: number,
    jobKey: string,
  ): void {
    if (vendors.length === 0) {
      this.loadInitialData(jobKey);
      return;
    }

    forkJoin(
      vendors.map((v) =>
        this.assignVendorSvc.updateVendorDne(v.jobVendorKey, newVendorDne).pipe(
          map((res) => ({ vendor: v, ok: res.status === true || res.data?.flag === 1 })),
          catchError(() => of({ vendor: v, ok: false })),
        ),
      ),
    )
      .pipe(takeUntil(this.destroy$))
      .subscribe((results) => {
        const failed = results.filter((r) => !r.ok);
        if (failed.length > 0) {
          const names = failed.map((r) => r.vendor.vendorName || 'a vendor').join(', ');
          this.errorMessage.set(`Job priority was updated, but the DNE could not be updated for: ${names}.`);
          setTimeout(() => this.errorMessage.set(''), 8000);
        }
        this.loadInitialData(jobKey);
      });
  }

  // ── SERVICE REQUEST & INSTRUCTIONS ────────────────────────────

  sriFieldValue(field: (typeof AssignVendorComponent.SRI_FIELDS)[number]): string {
    const edits = this.sriFieldEdits();
    if (edits[field] !== undefined) return edits[field]!;
    const hd = this.jobHeaderDetail();
    return hd ? this.sriPlainFromHeader(hd, field) : '';
  }

  onSriFieldInput(
    field: (typeof AssignVendorComponent.SRI_FIELDS)[number],
    value: string,
  ): void {
    this.sriFieldEdits.update((edits) => ({ ...edits, [field]: value }));
  }

  onSriFieldBlur(field: (typeof AssignVendorComponent.SRI_FIELDS)[number]): void {
    this.persistSriEdits(field);
  }

  /** Collapsed rows show "click to add" instead of a full textarea until there's data or the user expands them. */
  sriFieldCollapsed(field: (typeof AssignVendorComponent.SRI_FIELDS)[number]): boolean {
    return !this.sriFieldValue(field) && !this.sriManuallyExpanded().has(field);
  }

  onSriFieldExpand(field: (typeof AssignVendorComponent.SRI_FIELDS)[number]): void {
    this.sriManuallyExpanded.update((set) => new Set(set).add(field));
  }

  private hasPendingSriEdits(): boolean {
    const hd = this.jobHeaderDetail();
    if (!hd) return false;
    return AssignVendorComponent.SRI_FIELDS.some(
      (field) => this.sriFieldValue(field) !== this.sriPlainFromHeader(hd, field),
    );
  }

  private sriPlainFromHeader(
    hd: JobHeaderDetail,
    field: (typeof AssignVendorComponent.SRI_FIELDS)[number],
  ): string {
    return this.htmlToPlainText(hd[field] ?? '');
  }

  private persistSriEdits(_triggerField?: (typeof AssignVendorComponent.SRI_FIELDS)[number]): void {
    if (this.sriSaving()) return;

    const jobKey = this.jobKey();
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
          if (!res.status) {
            this.errorMessage.set(res.message || 'Unable to save instructions.');
          } else {
            this.assignVendorSvc.loadJobHeaderDetail(jobKey)
              .pipe(takeUntil(this.destroy$))
              .subscribe(() => {
                this.sriFieldEdits.set({});
                this.successMessage.set('Instructions saved.');
                setTimeout(() => this.successMessage.set(''), 3000);
              });
          }
        },
        error: () => this.errorMessage.set('Error saving instructions.'),
      });
  }

  // ── JOB STATUS DROPDOWN ────────────────────────────────────────

  /** Called when the JOB STATUS select changes in the JOB MANAGEMENT panel. */
  onVendorStatusChange(vendor: AssignedVendorDetail, newStatusKey: string): void {
    if (!newStatusKey) return;
    const jobKey = this.jobKey();
    if (!jobKey) return;

    // Parity with legacy StatusChangeFunction in EditJob.cshtml: if the job is
    // currently in the Move-to-Accounting status (TriggerBit=66), any status
    // change first opens a Recall vs Additional Approval prompt. Recall runs
    // through the vendor-fault form and forces status = Pending Return ETA;
    // Additional Approval proceeds with the admin's original status pick.
    if (
      vendor.triggerBit === AssignVendorComponent.MOVE_TO_ACCOUNTING_TRIGGER_BIT &&
      this.normalizeSelectKey(newStatusKey) !== this.normalizeSelectKey(vendor.jobStatusKey ?? '')
    ) {
      this.pendingRecallVendor = vendor;
      this.pendingRecallTargetStatusKey = newStatusKey;
      // Optimistically show the chosen status in the dropdown while the modal is
      // open. patchAssignedVendor uses spread, so pendingRecallVendor still holds
      // the old object — applyVendorStatusChange will capture the correct prev key
      // ("Move to Accounting") for API-failure revert after the user confirms.
      const matchedOpt = this.jobStatusList().find(
        (o) => this.normalizeSelectKey(o.value) === this.normalizeSelectKey(newStatusKey),
      );
      this.assignVendorSvc.patchAssignedVendor(vendor.jobVendorKey, {
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
    const jobKey = this.jobKey();
    if (!jobKey) return;

    const prevStatusKey = vendor.jobStatusKey;
    const prevStatusName = vendor.jobStatusName;
    const prevStatusActions = vendor.statusActions;
    const prevHeaderStatusName = this.jobHeaderDetail()?.jobStatusName ?? null;
    const matchedOption = this.jobStatusList().find(
      (o) => this.normalizeSelectKey(o.value) === this.normalizeSelectKey(newStatusKey),
    );
    const nextStatusName = matchedOption?.text?.trim() ?? vendor.jobStatusName;

    this.assignVendorSvc.patchAssignedVendor(vendor.jobVendorKey, {
      jobStatusKey: newStatusKey,
      jobStatusName: nextStatusName,
      statusActions: [],
    });

    this.assignVendorSvc
      .updateVendorJobStatus(vendor.jobVendorKey, newStatusKey)
      .pipe(
        switchMap((res) => {
          if (!res?.status) {
            this.assignVendorSvc.patchAssignedVendor(vendor.jobVendorKey, {
              jobStatusKey: prevStatusKey,
              jobStatusName: vendor.isDefault ? (prevHeaderStatusName ?? prevStatusName) : prevStatusName,
              statusActions: prevStatusActions,
            });
            this.errorMessage.set((res as { message?: string })?.message || 'Unable to update job status.');
            return EMPTY;
          }
          this.successMessage.set('Job status updated.');
          return this.assignVendorSvc.loadJobHeaderDetail(jobKey);
        }),
        takeUntil(this.destroy$),
      )
      .subscribe();
  }

  /**
   * Called by the recall modal after the admin picks Recall or Additional Approval.
   * - Recall path: backend already flipped JobType to Recall + wrote audit rows;
   *   we land the status on Pending Return ETA regardless of the original dropdown pick.
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
      this.applyVendorStatusChange(vendor, AssignVendorComponent.PENDING_RETURN_ETA_STATUS_KEY);
    } else if (originalTarget) {
      this.applyVendorStatusChange(vendor, originalTarget);
    }
  }

  /** Called when the admin dismisses the recall modal — no status change is performed. */
  onRecallReviewCancelled(): void {
    this.pendingRecallVendor = null;
    this.pendingRecallTargetStatusKey = null;
  }

  // ── LOCATION MAP ───────────────────────────────────────────────

  /** Returns a plain Google Maps URL for location links. */
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

  /** Returns a sanitized Google Maps embed URL for the location panel. */
  getLocationMapUrl(
    address: string | null,
    city: string | null,
    state: string | null,
    zip: string | null
  ): SafeResourceUrl {
    const parts = [address, city, state, zip].filter(Boolean);
    const q = encodeURIComponent(parts.join(', '));
    const url = `https://maps.google.com/maps?q=${q}&output=embed&z=14`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  /** Returns the URL to edit a vendor in the legacy admin portal. */
  legacyVendorEditUrl(vendorKey: string | null | undefined): string {
    if (!vendorKey) return '';
    return `${environment.legacyAdminBaseUrl}/MgtVendor/EditVendor/${vendorKey}`;
  }

  // ── NOT TO EXCEED ─────────────────────────────────────────────

  /** Save DNE Change — persists edited Revised Customer/Vendor NTE values. */
  onSaveDneChange(): void {
    const jobKey = this.jobKey();
    if (!jobKey) return;
    if (this.nteSaving()) return;
    this.nteSaving.set(true);
    this.errorMessage.set('');
    const req: UpdateNteRequest = {
      jobKey,
      customerDne:    this.nteCustomer() || null,
      revCustomerDne: this.nteRevCustomer() || null,
      vendorDne:      this.nteVendor() || null,
      revVendorDne:   this.nteRevVendor() || null,
    };
    this.assignVendorSvc.updateNte(req)
      .pipe(takeUntil(this.destroy$))
      .subscribe((res: any) => {
        this.nteSaving.set(false);
        if (res.status) {
          this.successMessage.set('NTE values saved successfully.');
        } else {
          this.errorMessage.set(res.message || 'Failed to save NTE values.');
        }
      });
  }

  /** 
   * On-site approval button label for vendor cards (mirrors legacy GetOnSiteButtonLabel).
   * Shows for both default and secondary vendors.
   */
  onSiteApprovalButtonLabel(vendor: AssignedVendorDetail): string {
    return vendor.hasEstimate ? 'Update / Edit on-site approval' : 'Provide on-site approval';
  }

  /**
   * Opens the modern on-site estimate modal after saving NTE values.
   * (Replaces legacy MdtVendorEstimateNew CreateEstimate / EditEstimate).
   * 
   * NOTE: Now supports BOTH default and secondary vendors (matching legacy system behavior).
   * Each vendor can have their own independent estimate.
   * 
   * If vendor.hasEstimate is true, loads the existing estimate for editing.
   * Otherwise, creates a new estimate.
   */
  onProvideOnsiteApproval(vendor: AssignedVendorDetail): void {
    const jobKey = this.jobKey();
    if (!jobKey || this.onSiteApprovalLoading()) return;

    this.onSiteApprovalLoading.set(true);
    this.errorMessage.set('');

    // If vendor already has an estimate, load it for editing
    if (vendor.hasEstimate && vendor.jobVendorKey) {
      this.assignVendorSvc
        .getVendorEstimateList(vendor.jobVendorKey)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (estimateListRes) => {
            this.onSiteApprovalLoading.set(false);
            if (estimateListRes.status && estimateListRes.data?.estimates?.length > 0) {
              // Get the most recent estimate (first in the list)
              const latestEstimate = estimateListRes.data.estimates[0];
              const estimateKey = latestEstimate.invoiceKey;
              
              this.onSiteEstimateModal?.openForEdit(estimateKey);
            } else {
              this.errorMessage.set('Could not load existing estimate');
            }
          },
          error: (err: Error) => {
            this.onSiteApprovalLoading.set(false);
            this.errorMessage.set(err.message || 'Could not load existing estimate');
          },
        });
      return;
    }

    // Create new estimate flow
    const nteReq: UpdateNteRequest = {
      jobKey,
      customerDne: this.nteCustomer() || null,
      revCustomerDne: this.nteRevCustomer() || null,
      vendorDne: this.nteVendor() || null,
      revVendorDne: this.nteRevVendor() || null,
    };

    this.assignVendorSvc.updateNte(nteReq)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (nteRes) => {
          this.onSiteApprovalLoading.set(false);
          if (!nteRes?.status) {
            this.errorMessage.set(nteRes?.message || 'Failed to save NTE values.');
            return;
          }
          // Open the modern on-site estimate modal with customer email
          const jobHeader = this.jobHeaderDetail();

          const customerEmail = jobHeader?.customerContactEmail || null;
          
          // Get DNE values to pass to modal
          const customerDne = this.vendorDneNumber(this.nteCustomer());
          const vendorDne = this.vendorDneNumber(this.nteVendor());

          // Get trade key from page context
          const tradeKey = this.pageContext()?.tradeKey || null;

          const jobTypeKey = this.pageContext()?.jobTypeKey
            || jobHeader?.jobTypeKey
            || null;

          this.onSiteEstimateModal?.open(
            jobKey,
            vendor.vendorKey,
            customerEmail,
            customerDne,
            vendorDne,
            tradeKey,
            jobTypeKey,
          );
        },
        error: (err: Error) => {
          this.onSiteApprovalLoading.set(false);
          this.errorMessage.set(err.message || 'Could not open on-site approval.');
        },
      });
  }

  onCloseOnSiteEstimatePickerModal(): void {
    this.onSiteEstimatePickerModal.set(null);
  }

  onSelectOnSiteEstimate(invoiceKey: string): void {
    this.onSiteEstimatePickerModal.set(null);
    this.openLegacyOnSiteEditEstimate(invoiceKey);
  }

  private openLegacyOnSiteCreateEstimate(jobKey: string, vendorKey: string): void {
    const url = `${environment.legacyAdminBaseUrl}/MdtVendorEstimateNew/CreateEstimate/${jobKey}?id2=${vendorKey}`;
    window.open(url, '_blank', 'noopener');
  }

  private openLegacyOnSiteEditEstimate(invoiceKey: string): void {
    const url = `${environment.legacyAdminBaseUrl}/MdtVendorEstimateNew/EditEstimate/${invoiceKey}?id1=1`;
    window.open(url, '_blank', 'noopener');
  }

  /** Save vendor note — create or update, then reload the list */
  onSaveVendorNote(): void {
    this.vendorNoteForm.markAllAsTouched();
    if (this.vendorNoteForm.invalid) return;

    const titleVal = (this.vendorNoteForm.get('noteTitle')?.value ?? '').trim();
    const detailVal = (this.vendorNoteForm.get('notesDetail')?.value ?? '').trim();

    let msg = '';
    if (!titleVal) msg += 'Please enter Title. ';
    if (!detailVal) msg += 'Please enter Note.';
    if (msg) {
      this.noteMessage.set(msg);
      return;
    }

    this.noteMessage.set('Saving....');
    this.isSubmitting.set(true);

    const formVal = this.vendorNoteForm.value;
    const request: SaveVendorNoteRequest = {
      ...formVal,
      noteKey: formVal.newNote === 1 ? null : (formVal.noteKey || null),
    };

    this.assignVendorSvc
      .saveVendorNote(request)
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        this.isSubmitting.set(false);
        if (res.status) {
          this.vendorNoteForm.patchValue({
            noteTitle: '', notesDetail: '', newNote: 1, noteKey: '',
          });
          this.vendorNoteForm.markAsUntouched();
          this.noteMessage.set('');
          this.invalidateNoteTooltipCache(this.notesVendorKey());
          this.loadNotesForVendor(this.notesVendorKey());
        } else {
          if (res.details && res.details.length > 0) {
            this.handleApiError(res, this.vendorNoteForm);
            this.noteMessage.set('');
          } else {
            this.errorMessage.set(this.assignVendorSvc.formatHttpFailureForUi(res));
            this.noteMessage.set('');
          }
        }
      });
  }

  // ═══════════════════════════════════════════════════════════════
  //  UPLOADED FILES (SRS §23.8)
  // ═══════════════════════════════════════════════════════════════

  /** Check uploaded temp file count */
  onCheckUploadedFiles(): void {
    const key = this.jobKey();
    if (!key) return;

    this.assignVendorSvc
      .checkUploadedFiles(key)
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        if (res.status) {
          this.successMessage.set(`${res.data} file(s) uploaded.`);
        }
      });
  }

  /** Remove all temp uploaded files */
  onRemoveUploadedFiles(): void {
    const key = this.jobKey();
    if (!key) return;

    this.assignVendorSvc
      .removeUploadedFiles(key)
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        if (res.status) this.successMessage.set('Uploaded files removed.');
        else this.errorMessage.set(res.message || 'Failed to remove files.');
      });
  }

  // ═══════════════════════════════════════════════════════════════
  //  REFRESH & UTILITIES
  // ═══════════════════════════════════════════════════════════════

  /** Refresh all page data */
  onRefresh(): void {
    const key = this.jobKey();
    if (key) {
      this.clearMessages();
      this.loadInitialData(key);
    }
  }

  /**
   * Polls job details while the page is visible so changes from the vendor portal,
   * legacy admin, or other sessions appear without a manual reload.
   */
  private startJobDetailsPolling(): void {
    this.jobDetailsPollingStop$.next();
    timer(AssignVendorComponent.JOB_DETAILS_POLL_MS, AssignVendorComponent.JOB_DETAILS_POLL_MS)
      .pipe(
        takeUntil(merge(this.destroy$, this.jobDetailsPollingStop$)),
        filter(() => document.visibilityState === 'visible'),
        switchMap(() => {
          const key = this.jobKey();
          if (!key) return EMPTY;
          return this.refreshJobDetailsQuietly(key);
        }),
      )
      .subscribe();
  }

  /** Refresh Job Details when the tab or window regains focus. */
  private readonly onPageVisibilityRefresh = (): void => {
    if (document.visibilityState === 'visible') {
      this.scheduleJobDetailsRefresh();
    }
  };

  private readonly onWindowFocusRefresh = (): void => {
    this.scheduleJobDetailsRefresh();
  };

  /** Debounced Job Details refresh to coalesce visibility + focus events. */
  private scheduleJobDetailsRefresh(): void {
    if (this.jobDetailsRefreshDebounceId != null) {
      clearTimeout(this.jobDetailsRefreshDebounceId);
    }
    this.jobDetailsRefreshDebounceId = setTimeout(() => {
      this.jobDetailsRefreshDebounceId = null;
      const key = this.jobKey();
      if (!key) return;
      this.refreshJobDetailsQuietly(key).pipe(takeUntil(this.destroy$)).subscribe();
    }, 300);
  }

  /** True while a user edit should block background Job Details sync. */
  private isJobDetailsRefreshBlocked(): boolean {
    return (
      this.tradeSaving()
      || this.jobPrioritySaving()
      || this.customerRequestorSaving()
      || this.jobPriorityChangeModalOpen()
    );
  }

  private isJobPriorityEditInProgress(): boolean {
    return this.jobPrioritySaving() || this.jobPriorityChangeModalOpen();
  }

  /**
   * Quietly reloads Job Details data sources (header, page context, contacts, profile DNE)
   * without triggering the global loading indicator or toasts.
   */
  private refreshJobDetailsQuietly(jobKey: string): Observable<void> {
    if (this.isJobDetailsRefreshBlocked()) {
      return EMPTY;
    }

    return this.assignVendorSvc.loadAssignVendorPage(jobKey, { quiet: true }).pipe(
      switchMap((pageRes) => {
        const customerKey =
          (pageRes?.status ? pageRes.data?.customerKey : null)
          ?? this.pageContext()?.customerKey
          ?? null;

        return forkJoin({
          header: this.assignVendorSvc.loadJobHeaderDetail(jobKey),
          requestors: this.assignVendorSvc.getCustomerRequestorOptions(jobKey),
          profileDne: customerKey
            ? this.assignVendorSvc.getCustomerProfileDne(customerKey)
            : of(null as CustomerProfileDne | null),
          page: of(pageRes),
        });
      }),
      tap(({ requestors, profileDne, page }) => {
        this.applyCustomerRequestorOptions(
          requestors,
          this.jobHeaderDetail(),
          !this.customerRequestorSaving(),
        );

        if (profileDne) {
          this.customerProfileDne.set(profileDne);
        }

        const hd = this.jobHeaderDetail();
        if (hd) {
          this.syncNteDisplay(hd);
        }

        if (hd && !this.isJobPriorityEditInProgress()) {
          this.applyJobPriorityOptions(
            this.jobPriorityOptions(),
            hd,
            page?.status ? page.data ?? null : this.pageContext(),
            true,
          );
        }
      }),
      map(() => void 0),
    );
  }

  /** Refresh only the grid data streams */
  private refreshGrids(): void {
    const key = this.jobKey();
    if (key) {
      this.assignVendorSvc.refreshAllGrids(key);
    }
  }

  /** Reset vendor selection form to empty state */
  onResetVendorForm(): void {
    this.vendorForm.reset({ vendorKey: '', contactKey: '' });
    this.vendorForm.markAsUntouched();
    this.contactDropdown.set([]);
    this.selectedVendorDistance.set(null);
    this.selectedVendorServiceCharge.set(null);
    this.selectedVendorConsolidator.set(null);
    this.selectedVendorLaborKey.set('');
  }

  /** Clear both error and success messages */
  private clearMessages(): void {
    this.errorMessage.set('');
    this.successMessage.set('');
  }

  // ═══════════════════════════════════════════════════════════════
  //  SERVER-SIDE ERROR MAPPING (Layer 7)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Maps API `details[]` field errors back to the correct FormControls.
   * API field names arrive in PascalCase; form control names are camelCase.
   * Non-field errors are collected and returned as the global message.
   */
  applyServerErrors(details: ApiErrorDetail[], form: FormGroup): string {
    const unmapped: string[] = [];

    for (const detail of details) {
      if (!detail.field) {
        unmapped.push(detail.message);
        continue;
      }

      const camelField = detail.field.charAt(0).toLowerCase() + detail.field.slice(1);
      const control = form.get(camelField);

      if (control) {
        control.setErrors({ serverError: detail.message });
        control.markAsTouched();
      } else {
        unmapped.push(detail.message);
      }
    }

    return unmapped.join('. ');
  }

  /**
   * Handles a failed API response for a mutation endpoint.
   * If details[] contains field errors, maps them to the given form;
   * otherwise sets the global errorMessage.
   */
  handleApiError<T>(res: AssignVendorApiResponse<T>, form?: FormGroup): void {
    if (form && res.details?.length > 0) {
      const global = this.applyServerErrors(res.details, form);
      this.errorMessage.set(global || res.message || 'Validation failed.');
    } else {
      this.errorMessage.set(
        res.clientOperation
          ? this.assignVendorSvc.formatHttpFailureForUi(res)
          : res.message || 'An unexpected error occurred.',
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  SEARCH TYPE HELPERS (for template radio buttons)
  // ═══════════════════════════════════════════════════════════════

  get searchTypeOptions() {
    return [
      { value: 1, label: 'All vendors in radius' },
      { value: 2, label: 'Vendors in selected trade within radius' },
      { value: 3, label: 'Vendors in current location history' },
    ];
  }

  // ═══════════════════════════════════════════════════════════════
  //  SEND & SELECT W/O — FLOW ORCHESTRATION
  // ═══════════════════════════════════════════════════════════════

  /**
   * Entry point: user clicks "Send & Select W/O" on any vendor grid row.
   * Runs Job Ops consolidator pre-check ({@code CheckIfVendorIs}), then legacy grid consolidator UI + WO flow.
   */
  /**
   * Opens the vendor portal in a new tab, logging in as the vendor contact.
   * This allows admins to see what the vendor sees for troubleshooting and support.
   * URL format: {vendorPortalBaseUrl}/VendorLogin/LoginByRCSadmin/{contactKey}?adminKey={adminKey}
   */
  onVendorLogin(row: Record<string, unknown>): void {
    const contactKey = row['contactKey'] as string | null | undefined;
    if (!contactKey) {
      console.warn('No contactKey available for vendor login');
      return;
    }

    // Get admin key from JWT token for audit trail
    const adminKey = this.authTokenSvc.getAdminKeyFromToken();
    if (!adminKey) {
      console.warn('No admin key available in token');
      return;
    }

    // Construct vendor login URL
    const vendorLoginUrl = `${environment.vendorPortalBaseUrl}/VendorLogin/LoginByRCSadmin/${contactKey}?adminKey=${adminKey}`;

    // Open in new tab
    window.open(vendorLoginUrl, '_blank', 'noopener,noreferrer');
  }

  onSendAndSelectWorkOrder(row: Record<string, unknown>): void {
    const vendorKey = (row['vendorKey'] ?? '') as string;
    if (!vendorKey) return;

    const jobKey = this.jobKey();
    if (!jobKey) {
      this.errorMessage.set('Missing job context.');
      return;
    }

    const tradeKey = this.pageContext()?.tradeKey ?? '';

    this.sendAndSelectWorkOrderLoadingVendorKey.set(vendorKey);

    // Consolidator/existing-vendor/trade prechecks only depend on jobKey/vendorKey/tradeKey
    // (known upfront), so fire them together instead of waiting on each one sequentially.
    forkJoin([
      this.assignVendorSvc.checkIfVendorIsConsolidator(jobKey, vendorKey),
      this.assignVendorSvc.checkForExistingVendor(jobKey),
      this.assignVendorSvc.checkVendorTrade(jobKey, vendorKey, tradeKey),
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ([consolidatorRes, existingVendorRes, tradeRes]) => {
          this.sendAndSelectWorkOrderLoadingVendorKey.set(null);
          this.handleSendAndSelectWorkOrderPrechecks(row, consolidatorRes, existingVendorRes, tradeRes);
        },
        error: () => {
          this.sendAndSelectWorkOrderLoadingVendorKey.set(null);
          this.errorMessage.set('Unable to verify vendor. Please try again.');
        },
      });
  }

  /**
   * Branches on the results of the parallelized consolidator/existing-vendor/trade prechecks,
   * replaying the same decision logic that {@link runVendorConsolidatorPrecheck},
   * {@link woProcessSaveVendor}, and {@link woCheckTradeThenAssign} apply when run sequentially.
   */
  private handleSendAndSelectWorkOrderPrechecks(
    row: Record<string, unknown>,
    consolidatorRes: AssignVendorApiResponse<boolean>,
    existingVendorRes: AssignVendorApiResponse<number>,
    tradeRes: AssignVendorApiResponse<number>,
  ): void {
    const vendorKey = (row['vendorKey'] ?? '') as string;
    const jobKey = this.jobKey();

    if (!consolidatorRes?.status) {
      this.errorMessage.set(consolidatorRes?.message ?? 'Unable to verify vendor. Please try again.');
      return;
    }
    if (consolidatorRes.data === true) {
      this.consolidatorPrecheckPendingContinue = () =>
        this.continueSendAndSelectWorkOrderAfterPrechecks(row, existingVendorRes, tradeRes);
      this.consolidatorPrecheckPendingKeys = { jobKey, vendorKey };
      this.consolidatorPrecheckPendingSource = 'grid';
      this.consolidatorPrecheckMessage.set(consolidatorRes.message ?? '');
      this.showConsolidatorPrecheckModal.set(true);
      return;
    }

    this.continueSendAndSelectWorkOrderAfterPrechecks(row, existingVendorRes, tradeRes);
  }

  /**
   * Continues Send & Select W/O using the already-fetched existing-vendor/trade results
   * (instead of re-fetching them via woProcessSaveVendor/woCheckTradeThenAssign) once the
   * consolidator precheck has been satisfied.
   */
  private continueSendAndSelectWorkOrderAfterPrechecks(
    row: Record<string, unknown>,
    existingVendorRes: AssignVendorApiResponse<number>,
    tradeRes: AssignVendorApiResponse<number>,
  ): void {
    this.woPrefetchedExistingVendorResult = existingVendorRes;
    this.woPrefetchedTradeResult = tradeRes;
    this.executeSendAndSelectWorkOrder(row);
  }

  /**
   * Original Send & Select W/O pipeline after consolidator API allows (grid flags + WO orchestration unchanged).
   */
  private executeSendAndSelectWorkOrder(row: Record<string, unknown>): void {
    const vendorKey = (row['vendorKey'] ?? '') as string;
    const vendorName = (row['vendorName'] ?? row['vname'] ?? '') as string;

    this.woSelectedVendorKey.set(vendorKey);
    this.woSelectedVendorName.set(vendorName);
    this.woDefaultVendorValue.set('1');
    this.woSendFromWhere.set('0');
    this.woMessage.set('');
    this.woResetWorkOrderForm();

    const consolidatorStr =
      typeof row['consolidator'] === 'string' ? (row['consolidator'] as string).trim().toLowerCase() : '';
    const fromConsolidatorColumn =
      consolidatorStr === 'consolidator' || consolidatorStr === 'full consolidator';
    const fullFromGrid =
      row['fullConsolidator'] === true ||
      row['fullConsolidator'] === 1 ||
      (typeof row['fullConsolidator'] === 'string' &&
        String(row['fullConsolidator']).trim().toLowerCase() === 'consolidator');
    const isConsolidator = fullFromGrid || fromConsolidatorColumn;
    this.woIsConsolidator.set(isConsolidator);

    if (isConsolidator) {
      this.showConsolidatorModal.set(true);
    } else {
      this.woSendWorkOrderStep1();
    }
  }

  /** Consolidator modal: "Proceed With this Vendor" */
  onConsolidatorProceed(): void {
    this.showConsolidatorModal.set(false);
    this.woSendWorkOrderStep1();
  }

  /** Consolidator modal: "Cancel and Go Back" */
  onConsolidatorCancel(): void {
    this.showConsolidatorModal.set(false);
  }

  /**
   * Step 1: Check primary vendor conditions.
   * If IsPrimary==1 AND selected != primary AND PrimaryVendorAlreadyAssignedOnce==1 → check primary vendor API.
   */
  private woSendWorkOrderStep1(): void {
    const page = this.pageContext();
    if (!page) { this.woProcessSaveVendor(); return; }

    const isPrimary = page.isPrimary === 1;
    const selectedIsNotPrimary = this.woSelectedVendorKey() !== page.primaryVendorKey;
    const alreadyAssignedOnce = page.primaryVendorAlreadyAssignedOnce === 1;

    if (isPrimary && selectedIsNotPrimary && alreadyAssignedOnce) {
      this.assignVendorSvc
        .checkForPrimaryVendor(this.jobKey(), page.locationKey ?? '', page.tradeKey ?? '')
        .pipe(takeUntil(this.destroy$))
        .subscribe(res => {
          if (!res?.status || !res.data) { this.woProcessSaveVendor(); return; }
          const flag = res.data.flag;
          if (flag === 0) {
            this.woProcessSaveVendor();
          } else if (flag === 1) {
            const dontShow = localStorage.getItem('DontShowPrimaryVen');
            if (dontShow !== '1') {
              this.woPrimaryVendorMessage.set(res.data.message || 'There is a primary/preferred vendor for this area and trade.');
              this.showPrimaryVendorModal.set(true);
            } else {
              this.woProcessSaveVendor();
            }
          } else {
            this.errorMessage.set(res.data.message || 'Error checking primary vendor.');
          }
        });
    } else {
      this.woProcessSaveVendor();
    }
  }

  /** Primary Vendor modal: "Dispatch To the Primary Vendor Now" */
  onPrimaryVendorDispatch(): void {
    this.showPrimaryVendorModal.set(false);
    this.assignVendorSvc
      .sendToPrimaryVendor(this.jobKey())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (res?.status) {
            if (this.pendingPostWoQcDispatch()) {
              this.invokeQcManagerDispatchThenShowOutcome();
              return;
            }
            this.successMessage.set('Primary vendor dispatch initiated. Reloading...');
            setTimeout(() => window.location.reload(), 1500);
          } else {
            this.clearPendingPostWoQcDispatch();
            this.errorMessage.set(res?.message ?? 'Failed to dispatch to primary vendor.');
          }
        },
        error: () => {
          this.clearPendingPostWoQcDispatch();
          this.errorMessage.set('Failed to dispatch to primary vendor.');
        },
      });
  }

  /** Primary Vendor modal: "Continue Assigning Selected Vendor" */
  onPrimaryVendorContinue(): void {
    this.showPrimaryVendorModal.set(false);
    localStorage.setItem('DontShowPrimaryVen', '1');
    this.woProcessSaveVendor();
  }

  /**
   * Step 2: Check for existing vendor on job.
   * If returns 1 → check same vendor → show default vendor modal.
   * If returns 0 → auto-set default, check trade.
   */
  private woProcessSaveVendor(): void {
    const prefetched = this.woPrefetchedExistingVendorResult;
    this.woPrefetchedExistingVendorResult = null;

    const existingVendor$ = prefetched
      ? of(prefetched)
      : this.assignVendorSvc.checkForExistingVendor(this.jobKey());

    existingVendor$.pipe(takeUntil(this.destroy$)).subscribe(res => {
      if (!res?.status) { this.errorMessage.set(res?.message ?? 'Error.'); return; }
      const existing = res.data;
      if (existing === 1) {
        this.assignVendorSvc
          .checkForSameVendor(this.jobKey(), this.woSelectedVendorKey())
          .pipe(takeUntil(this.destroy$))
          .subscribe(sameRes => {
            if (sameRes?.data === 1) {
              this.showAlreadyAssignedModal.set(true);
            } else {
              this.showDefaultVendorModal.set(true);
            }
          });
      } else {
        this.woDefaultVendorValue.set('1');
        this.woCheckTradeThenAssign();
      }
    });
  }

  /** Default Vendor modal: "Replace and unassign previous vendor(s)" */
  onDefaultVendorReplace(): void {
    this.showDefaultVendorModal.set(false);
    this.woDefaultVendorValue.set('1');
    this.woLoadUnassignVendors();
  }

  /** Default Vendor modal: "Add as additional vendor" */
  onDefaultVendorAdd(): void {
    this.showDefaultVendorModal.set(false);
    this.woDefaultVendorValue.set('0');
    this.woCheckTradeThenAssign();
  }

  /** Load assigned vendors for unassign modal */
  private woLoadUnassignVendors(): void {
    const assigned = this.assignedVendors();
    const vendors = assigned.map(v => ({
      pKey: v.jobVendorKey ?? '',
      vendorName: v.vendorName ?? '',
      checked: false,
    }));
    this.woUnassignVendors.set(vendors);
    this.woCancellationNotes.set('');
    this.woSelectAllUnassign.set(false);
    this.woUnassignValidationMessage.set('');
    this.showUnassignAllModal.set(true);
  }

  /** Unassign All modal: toggle individual checkbox */
  onUnassignToggle(pKey: string): void {
    const updated = this.woUnassignVendors().map(v =>
      v.pKey === pKey ? { ...v, checked: !v.checked } : v
    );
    this.woUnassignVendors.set(updated);
    this.woSelectAllUnassign.set(updated.every(v => v.checked));
  }

  /** Unassign All modal: toggle select all */
  onUnassignSelectAll(): void {
    const newVal = !this.woSelectAllUnassign();
    this.woSelectAllUnassign.set(newVal);
    this.woUnassignVendors.set(this.woUnassignVendors().map(v => ({ ...v, checked: newVal })));
  }

  /** Unassign All modal: "Send Mail" - validates vendor selection and notes per legacy logic */
  onUnassignSendMail(): void {
    this.woUnassignValidationMessage.set('');
    let validationMsg = '';
    let isValid = true;

    const selected = this.woUnassignVendors().filter(v => v.checked).map(v => v.pKey);
    if (selected.length === 0) {
      validationMsg += 'Please Select a vendor. ';
      isValid = false;
    }

    if (!this.woCancellationNotes().trim()) {
      validationMsg += 'Please enter notes.';
      isValid = false;
    }

    if (!isValid) {
      this.woUnassignValidationMessage.set(validationMsg.trim());
      return;
    }

    this.showUnassignAllModal.set(false);
    this.woMessage.set('Please wait while the cancellation message is being sent.');
    this.woSaving.set(true);

    const adminKey = this.authTokenSvc.getAdminKeyFromToken();
    if (!adminKey) {
      this.woSaving.set(false);
      this.woMessage.set('');
      this.errorMessage.set('Unable to identify logged-in admin. Please log in again.');
      return;
    }

    this.assignVendorSvc
      .sendBulkCancellationWithEmail({
        notesJobKey: this.jobKey(),
        notes: this.woCancellationNotes(),
        vendorEmailList: selected,
        adminKey: adminKey,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.woSaving.set(false);
          if (res?.status) {
            this.woMessage.set(res.message || 'Cancellation emails sent successfully.');
            setTimeout(() => {
              this.woMessage.set('');
              this.woDefaultVendorValue.set('1');
              this.woCheckTradeThenAssign();
            }, 1500);
          } else {
            this.woMessage.set('');
            this.errorMessage.set(res?.message || 'Failed to send cancellation emails.');
            this.woDefaultVendorValue.set('1');
            this.woCheckTradeThenAssign();
          }
        },
        error: (err) => {
          this.woSaving.set(false);
          this.woMessage.set('');
          this.errorMessage.set(err?.message || 'Failed to send cancellation emails. Please try again.');
          this.woDefaultVendorValue.set('1');
          this.woCheckTradeThenAssign();
        },
      });
  }

  /** Unassign All modal: "Don't Send" - skips email but proceeds with vendor assignment */
  onUnassignDontSend(): void {
    this.showUnassignAllModal.set(false);
    this.woUnassignValidationMessage.set('');
    this.woCancellationNotes.set('');
    this.woUnassignVendors.set(this.woUnassignVendors().map(v => ({ ...v, checked: false })));
    this.woSelectAllUnassign.set(false);
    this.woDefaultVendorValue.set('1');
    this.woCheckTradeThenAssign();
  }

  /**
   * Unassign All modal: header close — dismiss without sending mail or continuing the
   * work-order assignment flow. Re-opens the Default Vendor modal (this popup is only
   * entered from the replace-and-unassign path).
   */
  onUnassignAllModalClose(): void {
    this.showUnassignAllModal.set(false);
    this.woUnassignValidationMessage.set('');
    this.woCancellationNotes.set('');
    this.woUnassignVendors.set(this.woUnassignVendors().map(v => ({ ...v, checked: false })));
    this.woSelectAllUnassign.set(false);
    this.showDefaultVendorModal.set(true);
  }

  /**
   * Step 3: Check vendor trade → show New Trade modal if needed, otherwise show Work Order modal.
   */
  private woCheckTradeThenAssign(): void {
    const prefetched = this.woPrefetchedTradeResult;
    this.woPrefetchedTradeResult = null;

    const trade$ = prefetched
      ? of(prefetched)
      : this.assignVendorSvc.checkVendorTrade(
          this.jobKey(),
          this.woSelectedVendorKey(),
          this.pageContext()?.tradeKey ?? '',
        );

    trade$.pipe(takeUntil(this.destroy$)).subscribe(res => {
      if (res?.data === 1) {
        this.woLoadDNEAndShowModal();
      } else {
        this.showNewTradeModal.set(true);
      }
    });
  }

  /** New Trade modal: "YES (ADD THIS TRADE TO THE VENDOR SELECTED)" */
  onNewTradeAdd(): void {
    this.showNewTradeModal.set(false);
    const page = this.pageContext();
    const tradeKey = page?.tradeKey ?? '';
    this.assignVendorSvc
      .addTradeToVendor(this.woSelectedVendorKey(), tradeKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe(addRes => {
        if (addRes?.data?.flag === 1) {
          this.assignVendorSvc
            .checkIfVendorAlreadyAssigned(this.woSelectedVendorKey(), this.jobKey())
            .pipe(takeUntil(this.destroy$))
            .subscribe(assignRes => {
              if (assignRes?.data === 1) {
                this.errorMessage.set('Cannot assign same vendor twice.');
              } else {
                this.woLoadDNEAndShowModal();
              }
            });
        } else {
          this.errorMessage.set(addRes?.data?.message ?? 'Failed to add trade.');
        }
      });
  }

  /** New Trade modal: "CHOOSE ANOTHER VENDOR WHO HAS THIS TRADE" */
  onNewTradeChooseAnother(): void {
    this.showNewTradeModal.set(false);
  }

  /**
   * Load DNE and survey, then show the Work Order modal.
   * job-files/{jobKey}, location-files/{jobKey}, and job-files-for-broadcast/{jobKey} are
   * all excluded from this batch and loaded separately by {@link woLoadJobFiles} /
   * {@link woLoadLocationFiles} after the modal opens, so none of those slower endpoints
   * hold up the whole modal.
   */
  private woLoadDNEAndShowModal(): void {
    this.resetWoSurveyForm();
    this.woSurveyLoading.set(true);
    this.woJobFiles.set([]);
    this.woLocationFiles.set([]);
    this.woSelectedJobFileKeys.set([]);
    this.woSelectedLocationFileKeys.set([]);
    forkJoin([
      this.assignVendorSvc.getVendorDNE(this.jobKey(), this.woSelectedVendorKey()),
      this.assignVendorSvc.getAccountManagerSurveyItems(),
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([dneRes, surveyRes]) => {
        this.woCurrentDNE.set(dneRes?.data ?? null);
        this.woChangeDNE.set(dneRes?.data ?? null);

        this.woSurveyOptions.set(surveyRes?.status ? (surveyRes.data ?? []) : []);
        if (!surveyRes?.status) {
          this.woSurveyError.set('Could not load the survey factors.');
        }
        this.woSurveyLoading.set(false);
        this.woApplyWorkOrderModalDefaults();
        this.showWorkOrderModal.set(true);

        const broadcastFileByKey$ = this.assignVendorSvc.getJobFilesForBroadcast(this.jobKey()).pipe(
          map(broadcastFilesRes => new Map(
            (broadcastFilesRes?.data ?? []).map((f: BroadcastJobFileDto) => [f.fileKey, f])
          )),
          takeUntil(this.destroy$),
          shareReplay(1),
        );

        this.woLoadJobFiles(broadcastFileByKey$);
        this.woLoadLocationFiles(broadcastFileByKey$);
      });
  }

  /**
   * Loads job-files/{jobKey} after the Work Order modal is already open, overlaying
   * documentTypeName/fileUrl once both it and job-files-for-broadcast (also loaded after
   * the modal opens) resolve.
   * Stopgap: job-files/{jobKey} returns fileType as a MIME type (not a document
   * category) and no fileUrl at all, until the backend fixes job-files/{jobKey} directly.
   */
  private woLoadJobFiles(broadcastFileByKey$: Observable<Map<string, BroadcastJobFileDto>>): void {
    this.woJobFilesLoading.set(true);
    forkJoin([this.assignVendorSvc.getJobFiles(this.jobKey()), broadcastFileByKey$])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([jobFilesRes, broadcastFileByKey]) => {
        const jobFilesWithDocType = (jobFilesRes?.data ?? []).map((jf: JobFileItem) => {
          const match = broadcastFileByKey.get(jf.fileKey);
          return {
            ...jf,
            fileType: match?.documentTypeName ?? jf.fileType,
            fileUrl: match?.fileUrl ?? jf.fileUrl,
          };
        });
        const filteredJobFiles = jobFilesWithDocType.filter(
          (jf: JobFileItem) => !isVendorExcludedDocumentType(jf.fileType)
        );
        this.woJobFiles.set(filteredJobFiles);
        if (isBusinessHours()) {
          this.woSelectedJobFileKeys.set(filteredJobFiles.map((jf: JobFileItem) => jf.fileKey));
        }
        this.woJobFilesLoading.set(false);
      });
  }

  /**
   * Loads location-files/{jobKey} after the Work Order modal is already open, overlaying
   * documentTypeName/fileUrl once both it and job-files-for-broadcast resolve (same
   * stopgap {@link woLoadJobFiles} applies to job files).
   */
  private woLoadLocationFiles(broadcastFileByKey$: Observable<Map<string, BroadcastJobFileDto>>): void {
    this.woLocationFilesLoading.set(true);
    forkJoin([this.assignVendorSvc.getLocationFiles(this.jobKey()), broadcastFileByKey$])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([locFilesRes, broadcastFileByKey]) => {
        const filteredLocationFiles = (locFilesRes?.data ?? [])
          .map((lf: LocationFileItem) => {
            const match = broadcastFileByKey.get(lf.fileKey);
            return {
              ...lf,
              fileType: match?.documentTypeName ?? lf.fileType,
              fileUrl: match?.fileUrl ?? lf.fileUrl,
            };
          })
          // Filter after the overlay so we compare against the real document-type name
          // (documentTypeName), not the raw MIME type that location-files/{jobKey} returns.
          .filter((lf: LocationFileItem) => !isVendorExcludedDocumentType(lf.fileType));
        this.woLocationFiles.set(filteredLocationFiles);
        if (isBusinessHours()) {
          this.woSelectedLocationFileKeys.set(filteredLocationFiles.map((lf: LocationFileItem) => lf.fileKey));
        }
        this.woLocationFilesLoading.set(false);
      });
  }

  /** Default selections when the Send Work Order modal opens (Assign & Send W/O flow). */
  private woApplyWorkOrderModalDefaults(): void {
    this.woTalkedToVendor.set(2);
    this.woHaveScheduleDate.set(false);
    this.woSurveyOtherReason.set(true);
  }

  /** Work Order modal: job file checkbox — use event.checked (not toggle) to stay in sync with [checked] binding. */
  onToggleJobFile(fileKey: string, checked: boolean): void {
    if (!fileKey) return;
    const current = this.woSelectedJobFileKeys();
    if (checked) {
      if (!current.includes(fileKey)) {
        this.woSelectedJobFileKeys.set([...current, fileKey]);
      }
    } else {
      this.woSelectedJobFileKeys.set(current.filter(k => k !== fileKey));
    }
  }

  /** Work Order modal: view a job file in a new tab */
  onViewJobFile(file: JobFileItem): void {
    if (file.fileUrl) {
      window.open(file.fileUrl, '_blank', 'noopener');
    } else {
      console.warn('Job file has no fileUrl from the API:', file);
    }
  }

  /** Work Order modal: view a location file in a new tab */
  onViewLocationFile(file: LocationFileItem): void {
    if (file.fileUrl) {
      window.open(file.fileUrl, '_blank', 'noopener');
    } else {
      console.warn('Location file has no fileUrl from the API:', file);
    }
  }

  /** Work Order modal: location file checkbox */
  onToggleLocationFile(fileKey: string, checked: boolean): void {
    if (!fileKey) return;
    const current = this.woSelectedLocationFileKeys();
    if (checked) {
      if (!current.includes(fileKey)) {
        this.woSelectedLocationFileKeys.set([...current, fileKey]);
      }
    } else {
      this.woSelectedLocationFileKeys.set(current.filter(k => k !== fileKey));
    }
  }

  /** Work Order modal: file drag-and-drop handler */
  onWoFilesDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const files = event.dataTransfer?.files;
    if (files) this.woAddFiles(Array.from(files));
  }

  onWoFilesDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  /** Work Order modal: file input change handler */
  onWoFilesSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) this.woAddFiles(Array.from(input.files));
    input.value = '';
  }

  private woAddFiles(files: File[]): void {
    const current = this.woUploadedFiles();
    this.woUploadedFiles.set([...current, ...files]);
  }

  /** Work Order modal: remove uploaded file (client-side only until save). */
  onWoRemoveFile(index: number): void {
    const files = [...this.woUploadedFiles()];
    files.splice(index, 1);
    this.woUploadedFiles.set(files);
  }

  /** Work Order modal: date change → convert to vendor timezone */
  onWoConvertScheduleDate(): void {
    const dateStr = this.woGetScheduleDateString();
    if (!dateStr) { this.woConvertedScheduleDate.set(''); return; }

    this.assignVendorSvc
      .convertETAToVendorDate(this.jobKey(), dateStr)
      .pipe(takeUntil(this.destroy$))
      .subscribe(res => {
        this.woConvertedScheduleDate.set(res?.data ?? '');
      });
  }

  /** Build the "M/D/Y H:MIN AM/PM" schedule date string from the datetime-local picker. */
  private woGetScheduleDateString(): string | null {
    if (this.woHaveScheduleDate() !== true) return null;
    const value = this.woScheduleDateTime();
    if (!value) return null;
    // datetime-local yields "YYYY-MM-DDTHH:mm" in 24h local time; format to the US 12h
    // string the ETA-conversion / submission APIs expect.
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    const m = parsed.getMonth() + 1;
    const d = parsed.getDate();
    const y = parsed.getFullYear();
    const hour24 = parsed.getHours();
    const ampm = hour24 >= 12 ? 'PM' : 'AM';
    const h = hour24 % 12 || 12;
    const min = String(parsed.getMinutes()).padStart(2, '0');
    return `${m}/${d}/${y} ${h}:${min} ${ampm}`;
  }

  /** ISO-8601 schedule date for Job Ops API (avoids US date string JSON parse failures). */
  private woGetScheduleDateIso(): string | null {
    const display = this.woGetScheduleDateString();
    if (!display) return null;
    const parsed = new Date(display);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
  }

  /** Validate work order form before submission */
  private woValidateForm(): string | null {
    if (this.woHaveScheduleDate() === null) return 'Please select a date option (have date / no date).';
    if (this.woHaveScheduleDate() === true) {
      const dateStr = this.woGetScheduleDateString();
      if (!dateStr) return 'Please select a complete schedule date.';
    }
    return null;
  }

  isWoSurveyOptionChecked(reasonCode: string): boolean {
    return this.woSurveySelectedCodes().includes(reasonCode);
  }

  onWoSurveyToggleOption(reasonCode: string): void {
    const current = this.woSurveySelectedCodes();
    this.woSurveySelectedCodes.set(
      current.includes(reasonCode) ? current.filter((c) => c !== reasonCode) : [...current, reasonCode],
    );
    this.woSurveySavedSignature.set(null);
    this.woSurveyError.set('');
  }

  onWoSurveyOtherReasonChange(checked: boolean): void {
    this.woSurveyOtherReason.set(checked);
    if (!checked) {
      this.woSurveyOtherRemark.set('');
    }
    this.woSurveySavedSignature.set(null);
    this.woSurveyError.set('');
  }

  onWoSurveyFieldChange(): void {
    this.woSurveySavedSignature.set(null);
    this.woSurveyError.set('');
  }

  private woCollectSurveyResponses():
    | { ok: true; responses: AccountManagerSurveyWorkOrderResponse[] }
    | { ok: false; message: string } {
    const responses: AccountManagerSurveyWorkOrderResponse[] = [];
    const selected = this.woSurveySelectedCodes();
    for (const opt of this.woSurveyOptions()) {
      if (selected.includes(opt.reasonCode)) {
        responses.push({ reasonCode: opt.reasonCode, responseValue: opt.displayLabel });
      }
    }
    if (this.woSurveyOtherReason()) {
      responses.push({
        reasonCode: AssignVendorComponent.WO_SURVEY_OTHER_REASON,
        responseValue: this.woSurveyOtherRemark().trim() || 'Other',
      });
    }
    if (!responses.length) {
      return { ok: false, message: 'Please select at least one survey reason before continuing.' };
    }
    return { ok: true, responses };
  }

  private woValidateSurveyMainRemark(): string | null {
    const raw = this.woSurveyMainRemark().trim();
    if (!raw.length) {
      return 'Remarks from admin is required.';
    }
    if (raw.length < 15) {
      return 'Remarks from admin must be at least 15 characters.';
    }
    if (raw.length > 500) {
      return 'Remarks from admin must not exceed 500 characters.';
    }
    return null;
  }

  private woBuildSurveySignature(
    responses: AccountManagerSurveyWorkOrderResponse[],
    mainRemark: string,
  ): string {
    const tokens = responses
      .map((r) => `${r.reasonCode}=${r.responseValue}`)
      .sort()
      .join('|');
    return [this.jobKey(), this.woSelectedVendorKey(), tokens, mainRemark].join('::');
  }

  /**
   * Builds ML dispatch capture fields for AIVendorSelection (scoring run uid,
   * chosen vendor score, and the admin's final filtered vendor view).
   */
  private buildMlDispatchCapture(): {
    scoringRunUid: string | null;
    chosenVendorScore: number | null;
    displayedVendors: DisplayedVendorCapture[] | null;
  } {
    const chosenKey = (this.woSelectedVendorKey() ?? '').toLowerCase();
    const scores = this.vendorScores();
    const chosenScoreEntry = chosenKey ? scores[chosenKey] : undefined;

    let chosenVendorScore: number | null = null;
    if (chosenScoreEntry) {
      if (chosenScoreEntry.scoreTier !== 'N/A') {
        chosenVendorScore = chosenScoreEntry.jobSpecificScore;
      } else if (chosenScoreEntry.unscoredRankScore != null) {
        chosenVendorScore = chosenScoreEntry.unscoredRankScore;
      }
    }

    const displayedVendors: DisplayedVendorCapture[] = this.filteredInternalVendors()
      .map((v) => this.mapVendorRowToDisplayedCapture(v))
      .filter((row): row is DisplayedVendorCapture => row != null);

    if (chosenKey && !displayedVendors.some((d) => d.vendorKey.toLowerCase() === chosenKey)) {
      const row = this.findVendorRowForMlCapture(chosenKey);
      const appended = row
        ? this.mapVendorRowToDisplayedCapture(row)
        : this.mapScoreEntryToDisplayedCapture(chosenKey, chosenScoreEntry);
      if (appended) {
        displayedVendors.push(appended);
      }
    }

    const uid = this.scoringRunUid()?.trim() || null;
    const hasCapture = uid != null || chosenVendorScore != null || displayedVendors.length > 0;
    if (!hasCapture) {
      return { scoringRunUid: null, chosenVendorScore: null, displayedVendors: null };
    }

    return {
      scoringRunUid: uid,
      chosenVendorScore,
      displayedVendors: displayedVendors.length > 0 ? displayedVendors : null,
    };
  }

  private findVendorRowForMlCapture(vendorKey: string): LocationHistoryVendor | null {
    const key = vendorKey.toLowerCase();
    const pools = [
      ...this.filteredInternalVendors(),
      ...this.defaultVendors(),
      ...this.searchResults(),
    ] as LocationHistoryVendor[];
    return pools.find((v) => (v.vendorKey ?? '').toLowerCase() === key) ?? null;
  }

  private mapVendorRowToDisplayedCapture(v: LocationHistoryVendor): DisplayedVendorCapture | null {
    const vendorKey = (v.vendorKey ?? '').trim();
    if (!vendorKey) return null;

    const row = v as unknown as Record<string, unknown>;
    const scoreTier = row['scoreTier'];
    const isScored = scoreTier != null && scoreTier !== 'N/A';

    let score: number;
    if (isScored) {
      const raw = row['score'];
      score = raw != null && raw !== '' ? Number(raw) : 0;
      const fromLookup = this.vendorScores()[vendorKey.toLowerCase()];
      if (fromLookup && fromLookup.scoreTier !== 'N/A') {
        score = fromLookup.jobSpecificScore;
      }
    } else {
      const unscored = row['unscoredRankScore'];
      score = unscored != null ? Number(unscored) : 0;
      const fromLookup = this.vendorScores()[vendorKey.toLowerCase()];
      if (fromLookup?.unscoredRankScore != null) {
        score = fromLookup.unscoredRankScore;
      }
    }

    return { vendorKey, score, isScored };
  }

  private mapScoreEntryToDisplayedCapture(
    vendorKey: string,
    entry: VendorScorecardScore | undefined,
  ): DisplayedVendorCapture | null {
    if (!vendorKey) return null;
    if (!entry) {
      return { vendorKey, score: 0, isScored: false };
    }
    if (entry.scoreTier !== 'N/A') {
      return { vendorKey, score: entry.jobSpecificScore, isScored: true };
    }
    return {
      vendorKey,
      score: entry.unscoredRankScore ?? 0,
      isScored: false,
    };
  }

  /** Saves vendor selection survey when needed, then runs the work-order submit handler. */
  private woEnsureSurveySavedThen(proceed: () => void): void {
    const collected = this.woCollectSurveyResponses();
    if (!collected.ok) {
      this.woSurveyError.set(collected.message);
      return;
    }
    const remarkErr = this.woValidateSurveyMainRemark();
    if (remarkErr) {
      this.woSurveyError.set(remarkErr);
      return;
    }

    const mainRemark = this.woSurveyMainRemark().trim();
    const signature = this.woBuildSurveySignature(collected.responses, mainRemark);
    if (this.woSurveySavedSignature() === signature) {
      this.woSurveyError.set('');
      proceed();
      return;
    }

    if (this.woSurveySaving()) {
      return;
    }

    this.woSurveySaving.set(true);
    this.woSurveyError.set('');
    const mlCapture = this.buildMlDispatchCapture();
    this.assignVendorSvc
      .saveWorkOrderVendorSurvey({
        jobKey: this.jobKey(),
        chosenVendorKey: this.woSelectedVendorKey(),
        responses: collected.responses,
        mainRemark,
        scoringRunUid: mlCapture.scoringRunUid,
        chosenVendorScore: mlCapture.chosenVendorScore,
        displayedVendors: mlCapture.displayedVendors,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.woSurveySaving.set(false);
          if (!res?.status) {
            this.woSurveyError.set(res?.message || 'Could not save the survey information.');
            return;
          }
          this.woSurveySavedSignature.set(signature);
          proceed();
        },
        error: (err) => {
          this.woSurveySaving.set(false);
          this.woSurveyError.set(
            err?.error?.message ?? err?.message ?? 'Could not save the survey information.',
          );
        },
      });
  }

  private resetWoSurveyForm(): void {
    this.woSurveyOptions.set([]);
    this.woSurveyLoading.set(false);
    this.woSurveySaving.set(false);
    this.woSurveyError.set('');
    this.woSurveySelectedCodes.set([]);
    this.woSurveyOtherReason.set(false);
    this.woSurveyOtherRemark.set('');
    this.woSurveyMainRemark.set('');
    this.woSurveySavedSignature.set(null);
  }

  /**
   * Work Order modal: "Select and send work order now" (WITH files).
   * Validates, checks DNE, then saves with files and sends email.
   */
  onWoSubmitWithFiles(): void {
    const err = this.woValidateForm();
    if (err) { this.woMessage.set(err); return; }

    const hasFiles = this.woUploadedFiles().length > 0
      || this.woSelectedJobFileKeys().length > 0
      || this.woSelectedLocationFileKeys().length > 0;
    if (!hasFiles) {
      this.woMessage.set('Must have at least one file (uploaded, job file, or location file).');
      return;
    }

    if (this.woDefaultVendorValue() !== '1' && this.woSendFromWhere() === '0') {
      this.woSendFromWhere.set('1');
      this.showDNEWarningModal.set(true);
      return;
    }

    this.woEnsureSurveySavedThen(() => this.woSaveWithFiles());
  }

  /**
   * Work Order modal: "Send work order without any Attachments" (NO files).
   */
  onWoSubmitWithoutFiles(): void {
    const err = this.woValidateForm();
    if (err) { this.woMessage.set(err); return; }

    this.assignVendorSvc.removeUploadedFiles(this.jobKey())
      .pipe(takeUntil(this.destroy$))
      .subscribe();

    if (this.woDefaultVendorValue() !== '1' && this.woSendFromWhere() === '0') {
      this.woSendFromWhere.set('2');
      this.showDNEWarningModal.set(true);
      return;
    }

    this.woEnsureSurveySavedThen(() => this.woSaveWithoutFiles());
  }

  /** DNE Warning modal: "Proceed Without Changing DNE" */
  onDNEProceed(): void {
    this.showDNEWarningModal.set(false);
    if (this.woSendFromWhere() === '2') {
      this.woEnsureSurveySavedThen(() => this.woSaveWithoutFiles());
    } else {
      this.woEnsureSurveySavedThen(() => this.woSaveWithFiles());
    }
  }

  /** DNE Warning modal: "Go Back to Changing DNE" */
  onDNEGoBack(): void {
    this.showDNEWarningModal.set(false);
  }

  /** Save vendor to job WITH attached files, then send work order email */
  /**
   * Records work-order file upload/attachment failures on the job Notes &amp; Activity feed.
   */
  private logWorkOrderFileFailureToNotes(title: string, detail: string): void {
    const fileNames = this.woUploadedFiles().map(f => f.name).join(', ') || 'n/a';
    const vendorKey = this.woSelectedVendorKey();
    const comment = [
      detail,
      `Files attempted: ${fileNames}.`,
      vendorKey ? `Vendor key: ${vendorKey}.` : null,
    ]
      .filter((part): part is string => !!part)
      .join(' ');

    this.assignVendorSvc
      .saveGeneralAdminNote({
        jobKey: this.jobKey(),
        title,
        comment,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        error: err => console.warn('Could not save work order file failure to Notes & Activity:', err),
      });
  }

  private woSaveWithFiles(): void {
    this.woSaving.set(true);
    this.woMessage.set('Saving vendor and files...');
    this.showWorkOrderModal.set(false);
    this.runSaveVendorToJobWithFiles();
  }

  private runSaveVendorToJobWithFiles(): void {
      this.woMessage.set('Saving vendor...');
      const checkedJobFileKeys = this.woSelectedJobFileKeys().filter(k => !!k);
      const saveRequest = {
          jobKey: this.jobKey(),
          vendorKey: this.woSelectedVendorKey(),
          defaultValue: this.woDefaultVendorValue(),
          sendWorkOrder: 1,
          checkedFileList: checkedJobFileKeys,
          locationFile: this.woSelectedLocationFileKeys().filter(k => !!k),
          talkedToVendor: this.woTalkedToVendor(),
          etaLimit: this.woHaveScheduleDate() === false ? this.woEtaLimitDays() : null,
          etaDate: this.woGetScheduleDateIso(),
          savedDNE: this.woChangeDNE(),
        };
      this.assignVendorSvc
        .saveVendorToJobWithFiles(saveRequest, [...this.woUploadedFiles()])
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: res => {
            if (res?.status && res.data?.flag === 1) {
              this.woMessage.set('Sending work order...');
              const jobVendorKey = res.data.key ?? '';
              const workOrderKey = res.data.workOrderKey ?? null;
              this.woSendEmail(jobVendorKey, workOrderKey);
            } else {
              this.woSaving.set(false);
              this.clearPendingPostWoQcDispatch();
              this.errorMessage.set(res?.data?.message ?? res?.message ?? 'Failed to save vendor.');
            }
          },
          error: err => {
            this.woSaving.set(false);
            this.clearPendingPostWoQcDispatch();
            this.errorMessage.set(err?.error?.message ?? err?.message ?? 'Failed to save vendor. Please try again.');
            console.error('Error saving vendor with files:', err);
          },
        });
  }

  /** Save vendor to job WITHOUT files, then send work order email */
  private woSaveWithoutFiles(): void {
    this.woSaving.set(true);
    this.woMessage.set('Saving vendor...');
    this.showWorkOrderModal.set(false);

    this.assignVendorSvc
      .saveVendorToJob({
        jobKey: this.jobKey(),
        vendorKey: this.woSelectedVendorKey(),
        defaultValue: this.woDefaultVendorValue(),
        sendWorkOrder: 1,
        talkedToVendor: this.woTalkedToVendor(),
        etaLimit: this.woHaveScheduleDate() === false ? this.woEtaLimitDays() : null,
        etaDate: this.woGetScheduleDateIso(),
        savedDNE: this.woChangeDNE(),
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: res => {
          if (res?.status && res.data?.flag === 1) {
            this.woMessage.set('Sending work order...');
            const jobVendorKey = res.data.key ?? '';
            this.woSendEmail(jobVendorKey);
          } else {
            this.woSaving.set(false);
            this.clearPendingPostWoQcDispatch();
            this.errorMessage.set(res?.data?.message ?? res?.message ?? 'Failed to save vendor.');
          }
        },
        error: err => {
          this.woSaving.set(false);
          this.clearPendingPostWoQcDispatch();
          this.errorMessage.set(err?.error?.message ?? err?.message ?? 'Failed to save vendor. Please try again.');
          console.error('Error saving vendor:', err);
        }
      });
  }

  /** Send work order email (step 2 of the two-step process) */
  private woSendEmail(jobVendorKey: string, workOrderKey: string | null = null): void {
    const checkedJobFileKeys = this.woSelectedJobFileKeys().filter(k => !!k);
    const locationFileKeys = this.woSelectedLocationFileKeys().filter(k => !!k);
    this.assignVendorSvc
      .sendWorkOrderEmail(jobVendorKey, {
        talkedToVendor: this.woTalkedToVendor(),
        etaDate: this.woGetScheduleDateIso(),
        locationFile: locationFileKeys.length > 0 ? locationFileKeys : null,
        workOrderKey,
        checkedFileList: checkedJobFileKeys.length > 0 ? checkedJobFileKeys : null,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: res => {
          this.woSaving.set(false);
          if (res?.status && res.data?.flag === 1) {
            if (this.pendingPostWoQcDispatch()) {
              this.invokeQcManagerDispatchThenShowOutcome();
              return;
            }
            this.successMessage.set(res.data.message ?? 'Work order sent successfully.');
            setTimeout(() => window.location.reload(), 2000);
          } else {
            this.clearPendingPostWoQcDispatch();
            this.errorMessage.set(res?.data?.message ?? 'Vendor saved but failed to send work order email.');
          }
        },
        error: err => {
          this.woSaving.set(false);
          this.clearPendingPostWoQcDispatch();
          this.errorMessage.set(err?.error?.message ?? err?.message ?? 'Vendor saved but failed to send work order email. Please try again.');
          console.error('Error sending work order email:', err);
        }
      });
  }

  /** Work Order modal: "Close" → refresh job details/grids in place, stay on the page */
  onWoClose(): void {
    this.clearPendingPostWoQcDispatch();
    this.showWorkOrderModal.set(false);
    const jobKey = this.jobKey();
    if (jobKey) {
      this.refreshJobDetailsQuietly(jobKey).pipe(takeUntil(this.destroy$)).subscribe();
    }
    this.refreshGrids();
  }

  /** Reset all work order form state */
  private woResetWorkOrderForm(): void {
    this.woTalkedToVendor.set(null);
    this.woHaveScheduleDate.set(null);
    this.woScheduleDateTime.set('');
    this.woConvertedScheduleDate.set('');
    this.woEtaLimitDays.set(null);
    this.woCurrentDNE.set(null);
    this.woChangeDNE.set(null);
    this.woJobFiles.set([]);
    this.woLocationFiles.set([]);
    this.woSelectedJobFileKeys.set([]);
    this.woSelectedLocationFileKeys.set([]);
    this.woUploadedFiles.set([]);
    this.woSaving.set(false);
    this.woMessage.set('');
    this.woSendFromWhere.set('0');
    this.resetWoSurveyForm();
  }
  // ═══════════════════════════════════════════════════════════════

  /**
   * Form load: poll GET /api/sourcing/status/{jobKey} every 10s (first call
   * immediate) until status is completed or failed, then load vendors via GET /api/sourcing/vendors/{jobKey}.
   * Does not call POST /api/sourcing/request.
   */
  loadAISourcingData(jobKey: string): void {
    this.aiSourcingLoading.set(true);
    this.aiSourcingError.set('');
    this.startAISourcingPolling(jobKey);
  }

  /** Stop polling for sourcing status after this long, even if it never leaves pending/in_progress. */
  private static readonly AI_SOURCING_POLL_TIMEOUT_MS = 5 * 60 * 1000;

  /**
   * Polls GET /api/sourcing/status/{jobKey} until completed, failed, or not_started, then GET vendors if completed.
   * Gives up after AI_SOURCING_POLL_TIMEOUT_MS so a stuck backend job doesn't poll forever.
   */
  private startAISourcingPolling(jobKey: string): void {
    this.aiSourcingPollingStop$.next();
    this.aiSourcingPolling.set(true);
    this.aiSourcingLoading.set(false);

    const stop$ = merge(this.destroy$, this.aiSourcingPollingStop$);
    const pollTimeout$ = timer(AssignVendorComponent.AI_SOURCING_POLL_TIMEOUT_MS);

    timer(0, 10_000)
      .pipe(
        takeUntil(merge(stop$, pollTimeout$)),
        switchMap(() => this.assignVendorSvc.getSourcingStatus(jobKey)),
        takeWhile(
          (status) =>
            !status ||
            status.status === 'pending' ||
            status.status === 'in_progress',
          true,
        ),
      )
      .subscribe((status) => {
        if (!status) {
          return;
        }
        if (status.status === 'completed') {
          this.aiSourcingPolling.set(false);
          this.loadAIVendors(jobKey);
        } else if (status.status === 'failed') {
          this.aiSourcingPolling.set(false);
          this.aiSourcingError.set(status.errorMessage ?? 'AI sourcing failed.');
        } else if (status.status === 'not_started') {
          this.aiSourcingPolling.set(false);
        }
      });

    pollTimeout$.pipe(takeUntil(stop$)).subscribe(() => {
      if (this.aiSourcingPolling()) {
        this.aiSourcingPolling.set(false);
        this.aiSourcingError.set('');
        this.assignVendorSvc.clearAISourcingStatus();
      }
    });
  }

  /** Loads vendor rows after sourcing status is completed. */
  private loadAIVendors(jobKey: string): void {
    this.aiSourcingLoading.set(true);
    this.assignVendorSvc
      .getSourcingVendors(jobKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe((vendors) => {
        this.aiSourcingLoading.set(false);
        this.applyAIVendors(vendors);
      });
  }

  /**
   * Handles the inline email input in the sourcing table — saves on Enter or blur.
   */
  onInlineSaveEmail(v: AISourcingVendor, email: string): void {
    const trimmed = email.trim();
    if (!trimmed) return;
    this.aiSourcingVendors.update(vendors =>
      vendors.map(vendor =>
        (vendor.google_maps_uri && vendor.google_maps_uri === v.google_maps_uri) ||
        (vendor.company_name === v.company_name && vendor.phone === v.phone)
          ? { ...vendor, email: trimmed }
          : vendor
      )
    );
    this.persistAiSourcingVendorEmail(v as unknown as Record<string, unknown>, trimmed);
  }

  /**
   * Saves inline-edited AI sourcing vendor email to Job Ops API; on failure reloads the grid from the server.
   */
  private persistAiSourcingVendorEmail(row: Record<string, unknown>, email: string): void {
    const jobKey = this.jobKey();
    if (!jobKey) {
      this.errorMessage.set('No job key. Cannot save vendor email.');
      return;
    }

    const body: UpdateSourcedVendorEmailRequest = {
      email: email.trim(),
      googleMapsUri: this.aiSourcingIdentityString(row['google_maps_uri']),
      companyName: this.aiSourcingIdentityString(row['company_name']),
      phone: this.aiSourcingIdentityString(row['phone']),
      website: this.aiSourcingIdentityString(row['website']),
      address: this.aiSourcingIdentityString(row['address']),
    };

    this.assignVendorSvc
      .saveSourcingVendorEmail(jobKey, body)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        error: () => {
          this.errorMessage.set('Failed to save vendor email. Please try again.');
          this.loadAIVendors(jobKey);
        },
      });
  }

  /** Normalizes optional grid cell values for vendor fingerprint fields (null if empty). */
  private aiSourcingIdentityString(value: unknown): string | null {
    if (value == null) return null;
    const s = String(value).trim();
    return s.length > 0 ? s : null;
  }

  // ── AI SOURCING TABLE HELPERS ──────────────────────────────────────────────

  getFitScore(relevanceScore: unknown): number {
    const n = Number(relevanceScore);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  }

  getFitScoreClass(relevanceScore: unknown): string {
    const score = this.getFitScore(relevanceScore);
    if (score >= 90) return 'sa-score--green';
    if (score >= 75) return 'sa-score--orange';
    if (score >= 50) return 'sa-score--yellow';
    return 'sa-score--red';
  }

  aiVendorHasRating(v: AISourcingVendor): boolean {
    const sv = v as unknown as Record<string, unknown>;
    return !!(sv['avg_rating'] != null && sv['review_count']);
  }

  // ═══════════════════════════════════════════════════════════════
  //  SCORECARD SCORE ENRICHMENT
  // ═══════════════════════════════════════════════════════════════

  /** Resolves "No" / "Maybe" for a pinned vendor row from API fields or session cache. */
  private resolvePinnedMaybeNoChoice(
    v: LocationHistoryVendor,
    cache: Record<string, string>,
  ): 'No' | 'Maybe' | null {
    const raw = v as unknown as Record<string, unknown>;
    const fromApi = this.normalizeMaybeNoChoice(v.noMaybe ?? raw['NoMaybe'] ?? raw['no']);
    if (fromApi) return fromApi;

    const vendorKey = (v.vendorKey ?? '').toLowerCase();
    const vendorName = (v.vendorName ?? '').trim().toLowerCase();
    const pinKey = String(v.pinKey ?? '').toLowerCase();
    const cached =
      (vendorKey && cache[vendorKey]) ||
      (vendorName && cache[`name:${vendorName}`]) ||
      (pinKey && cache[`pin:${pinKey}`]) ||
      null;
    return this.normalizeMaybeNoChoice(cached);
  }

  private normalizeMaybeNoChoice(raw: unknown): 'No' | 'Maybe' | null {
    if (raw == null) return null;
    const s = String(raw).trim().toLowerCase();
    if (!s) return null;
    if (s.includes('maybe')) return 'Maybe';
    if (s === 'no' || s.startsWith('no ')) return 'No';
    return null;
  }

  /**
   * Merges scorecard data (job_specific_score, score_tier, pillar_scores, workload_flag)
   * into a vendor row array.  Returns unchanged rows when no scores are loaded yet.
   */
  private enrichWithScores<T extends LocationHistoryVendor>(vendors: T[]): T[] {
    const scores = this.vendorScores();
    const loading = this.scoresLoading();
    const agentFailed = this.scoreAgentFailed();
    // No scores yet — skeleton while polling; N/A when agent failed or polling finished empty.
    if (!Object.keys(scores).length) {
      if (loading && !agentFailed) return vendors;
      return vendors.map((v) => this.asUnscoredVendorRow(v));
    }
    return vendors.map(v => {
      const key = (v.vendorKey ?? '').toLowerCase();
      const s = scores[key];
      if (!s) {
        if (loading) {
          // A poll is still in-flight (5 s / 15 s / 30 s retries may still return this
          // vendor's score). Return unchanged so the data-grid skeleton stays visible
          // rather than flashing N/A prematurely.
          return { ...v, score: null, scoreTier: null, unscoredRankScore: null } as unknown as T;
        }
        // All polls finished and vendor is genuinely absent from the scorecard response.
        return { ...v, score: null, scoreTier: 'N/A', unscoredRankScore: null } as unknown as T;
      }
      const pendingUnscored =
        loading && s.scoreTier === 'N/A' && s.unscoredRankScore == null;
      return {
        ...v,
        score: s.scoreTier === 'N/A' ? null : Math.round(s.jobSpecificScore),
        scoreTier: pendingUnscored ? null : s.scoreTier,
        workloadFlag: s.workloadFlag,
        pillarScores: s.pillarScores,
        scoreRank: s.rank,
        completedJobs: s.completedJobs,
        scoreFlags: s.flags,
        aiExplanation: s.aiExplanation ?? null,
        unscoredRankScore: s.unscoredRankScore ?? null,
        signalScores:      s.signalScores ?? null,
        signalExplanations: s.signalExplanations ?? null,
        llmReasoning:      s.llmReasoning ?? null,
      };
    });
  }

  /** Maps a vendor row to the SCORECARD_RESPONSE_SPEC N/A stub display shape. */
  private asUnscoredVendorRow<T extends LocationHistoryVendor>(v: T): T {
    return {
      ...v,
      score: null,
      scoreTier: 'N/A',
      workloadFlag: null,
      pillarScores: null,
      scoreRank: 0,
      completedJobs: 0,
      scoreFlags: [],
      unscoredRankScore: null,
      signalScores: null,
      signalExplanations: null,
      aiExplanation: null,
      llmReasoning: null,
    } as unknown as T;
  }

  // ── Score Modal helpers ──────────────────────────────────────────────────

  /** Opens the score breakdown modal for a vendor row. */
  onOpenScoreModal(row: Record<string, unknown>): void {
    this.scoreModal.set(row);
  }

  /** Returns a bar fill color for a 0–100 score value. */
  getScoreBarColor(val: number): string {
    if (val >= 90) return '#28cd41';   // bright green  91–100
    if (val >= 75) return '#ff8800';   // bright orange 75–90
    if (val >= 50) return '#ffc200';   // bright yellow 50–74
    return '#ff3b30';                  // bright red    0–49
  }

  /**
   * Returns ordered bar definitions for the score modal chart.
   * Scored vendors use pillar scores; unscored vendors use signal scores.
   */
  getScoreModalBars(row: Record<string, unknown>): Array<{ label: string; value: number; color: string; explanation: string | null }> {
    const scoreTier = row['scoreTier'];
    if (scoreTier === 'N/A' || scoreTier == null) {
      const signals = row['signalScores'] as Record<string, number> | null;
      const signalExplanations = row['signalExplanations'] as Record<string, string> | null;
      const defs = [
        { key: 'distance',                  label: 'Distance' },
        { key: 'llm_job_fit',               label: 'LLM Job Fit' },
        { key: 'trade_match',               label: 'Trade' },
        { key: 'profile_compliance',        label: 'Profile\nCompliance' },
        { key: 'engagement_responsiveness', label: 'Engagement' },
      ];
      return defs.map(d => {
        const val = signals ? Math.round(signals[d.key] ?? 0) : 0;
        const explanation = signalExplanations?.[d.key]?.trim() || null;
        return { label: d.label, value: val, color: this.getScoreBarColor(val), explanation };
      });
    }
    const pillars = row['pillarScores'] as Record<string, { score: number; weight: number; explanation?: string | null }> | null;
    const defs = [
      { key: 'cost',          label: 'Cost' },
      { key: 'dependability', label: 'Dependability' },
      { key: 'system_use',    label: 'System Use' },
      { key: 'communication', label: 'Communication' },
      { key: 'behavior',      label: 'Behavior' },
    ];
    return defs.map(d => {
      const val = pillars ? Math.round(pillars[d.key]?.score ?? 0) : 0;
      const explanation = pillars?.[d.key]?.explanation?.trim() || null;
      return { label: d.label, value: val, color: this.getScoreBarColor(val), explanation };
    });
  }

  // ── Admin Check-In / Check-Out handlers ─────────────────────────────────

  /** Status actions for a vendor card; falls back when API has not yet populated statusActions. */
  vendorStatusActions(vendor: AssignedVendorDetail): VendorStatusAction[] {
    if (vendor.statusActions?.length) return vendor.statusActions;
    const bit = vendor.triggerBit ?? null;
    if (bit === 1 || bit == null) return [];
    if (bit === 4 || bit === 17) {
      return [{ actionId: 'check_out_tech', label: 'Check-out tech yourself', variant: 'outline', isStatusLabel: false }];
    }
    if (bit === 6 || bit === 66) return [];
    return [{ actionId: 'check_in_tech', label: 'Check-in tech yourself', variant: 'outline', isStatusLabel: false }];
  }

  /** Swap manual confirm button for legacy status label after admin confirms ETA/return ETA. */
  private statusActionsAfterEtaConfirmed(vendor: AssignedVendorDetail, isReturn: boolean): VendorStatusAction[] {
    const manualId = isReturn ? 'confirm_return_eta_manually' : 'confirm_eta_manually';
    const label = isReturn ? 'Admin confirmed return ETA' : 'Admin confirmed ETA';
    const actions = (vendor.statusActions ?? []).filter((a) => a.actionId !== manualId);
    if (actions.some((a) => a.isStatusLabel && a.label.toLowerCase().includes('confirmed'))) {
      return actions;
    }
    return [
      ...actions,
      { actionId: 'status_label', label, variant: 'outline', isStatusLabel: true },
    ];
  }

  /** Dispatches a vendor-card status action (TriggerBit-driven buttons from the API). */
  onVendorStatusAction(action: VendorStatusAction, vendor: AssignedVendorDetail): void {
    if (action.isStatusLabel) return;

    switch (action.actionId) {
      case 'check_in_tech':
        this.onCheckInTech(vendor);
        return;
      case 'check_out_tech':
        this.onCheckOutTech(vendor);
        return;
      case 'view_vendor_estimate':
        this.openVendorEstimate(vendor);
        return;
      case 'confirm_eta_manually':
        this.openConfirmEtaModal(vendor, false);
        return;
      case 'confirm_return_eta_manually':
        this.openConfirmEtaModal(vendor, true);
        return;
      case 'approve_vendor':
      case 'send_additional_approval_set_return_eta':
        this.openApproveVendorModal(
          vendor,
          action.actionId === 'send_additional_approval_set_return_eta'
            ? 'Send Additional Approval (Set Return ETA)'
            : 'Approve Vendor — Additional Approval',
        );
        return;
      case 'request_approval_again':
        this.openCustomerEstimateForApproval();
        return;
      case 'send_reminder_customer':
        this.openCustomerReminderModal(vendor);
        return;
      default:
        this.openVendorActionMailModal(vendor, action);
        return;
    }
  }

  /** Loads mail context and opens the resend-vendor-action modal. */
  openVendorActionMailModal(vendor: AssignedVendorDetail, action: VendorStatusAction): void {
    this.vendorActionError.set('');
    this.vendorActionResultHtml.set('');
    this.vendorActionSelectedContacts.set([]);
    this.vendorActionCustomEmail.set('');
    this.vendorActionSelectedEstimate.set(null);

    this.assignVendorSvc.getVendorActionMailContext(vendor.jobVendorKey, action.actionId)
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        if (!res?.status || !res.data) {
          this.errorMessage.set(res?.message || 'Could not load vendor action context.');
          return;
        }
        this.vendorActionEmailNote.set(res.data.defaultEmailNote || '');
        this.vendorActionModal.set({ vendor, action, ctx: res.data });
      });
  }

  onCloseVendorActionModal(): void {
    this.vendorActionModal.set(null);
    this.vendorActionError.set('');
    this.vendorActionResultHtml.set('');
  }

  toggleVendorActionContact(contactKey: string, checked: boolean): void {
    const set = new Set(this.vendorActionSelectedContacts());
    if (checked) set.add(contactKey);
    else set.delete(contactKey);
    this.vendorActionSelectedContacts.set([...set]);
  }

  onSendVendorActionMail(): void {
    const state = this.vendorActionModal();
    if (!state) return;

    const contacts = this.vendorActionSelectedContacts();
    const customEmail = this.vendorActionCustomEmail().trim();
    if (contacts.length === 0 && !customEmail) {
      this.vendorActionError.set('Select at least one vendor contact or enter a custom email.');
      return;
    }

    const emailNote = this.vendorActionEmailNote().trim();
    if (state.action.actionId === 'estimate_upload_reject' && !emailNote) {
      this.vendorActionError.set('A message is required when rejecting an estimate for resubmission.');
      return;
    }

    let estimateKey: string | null = null;
    if (state.ctx.requiresEstimateSelection) {
      const sel = this.vendorActionSelectedEstimate();
      estimateKey = sel ?? 'NoVal';
    } else if (state.ctx.emailType === 23 || state.ctx.emailType === 24) {
      estimateKey = 'NoESTIMATE';
    }

    this.vendorActionSending.set(true);
    this.vendorActionError.set('');

    this.assignVendorSvc.sendVendorActionMail({
      jobVendorKey: state.vendor.jobVendorKey,
      emailType: state.ctx.emailType,
      emailNote: this.vendorActionEmailNote(),
      vendorContactKeys: contacts,
      customEmail: customEmail || null,
      estimateKey,
    })
      .pipe(
        switchMap((res) => {
          this.vendorActionSending.set(false);
          if (!res?.status) {
            this.vendorActionError.set(res?.message || 'Failed to send email.');
            return EMPTY;
          }
          this.vendorActionResultHtml.set(res.data ?? res.message ?? 'Email sent.');
          const jobKey = this.jobKey();
          if (!jobKey) return EMPTY;
          return this.assignVendorSvc.loadJobHeaderDetail(jobKey);
        }),
        takeUntil(this.destroy$),
      )
      .subscribe();
  }

  /** Opens vendor estimate via API (unhighlight) then navigates to the job's Estimates tab. */
  openVendorEstimate(vendor: AssignedVendorDetail): void {
    this.assignVendorSvc.getVendorEstimateNavigation(vendor.jobVendorKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        if (!res?.status || !res.data) {
          this.errorMessage.set(res?.message || 'Could not open vendor estimate.');
          return;
        }
        const jobKey = this.jobKey();
        if (!jobKey) return;
        // Same Tech On-Site gating as the Estimates tab (onEstimatesTabClick) — this vendor's
        // key is already known from the card, so it's passed straight through instead of
        // re-resolving it from the newest submitted estimate.
        resolveEstimateChatInterstitial(this.vendorBillsSvc, jobKey, ({ shouldIntercept }) => {
          if (shouldIntercept) {
            this.estimateChatInterstitialModal?.open({ jobKey, vendorKey: vendor.vendorKey });
          } else {
            void this.router.navigate(['/job', jobKey, 'estimates']);
          }
        });
      });
  }

  openConfirmEtaModal(vendor: AssignedVendorDetail, isReturn: boolean): void {
    const confirmedDate = this.resolveVendorScheduleDateTimeLocal(vendor, isReturn);
    this.confirmEtaDraft.set({ confirmedDate, comment: '' });
    this.confirmEtaError.set('');
    this.confirmEtaModal.set({ vendor, isReturn });
  }

  /** Resolves schedule/return schedule into a datetime-local value (service-location wall time). */
  private resolveVendorScheduleDateTimeLocal(vendor: AssignedVendorDetail, isReturn: boolean): string {
    const draft = this.vendorScheduleDrafts()[vendor.jobVendorKey];
    const fromDraft = isReturn ? draft?.returnScheduleDate : draft?.scheduleDate;
    if (fromDraft?.trim()) return fromDraft.trim();
    const iso = isReturn ? vendor.returnScheduleDateIso : vendor.scheduleDateIso;
    const display = isReturn ? vendor.returnScheduleDate : vendor.scheduleDate;
    return (
      this.toDateTimeLocalValue(iso) ||
      this.parseDisplayScheduleToLocalValue(display) ||
      this.currentDateTimeLocalValue()
    );
  }

  private currentDateTimeLocalValue(): string {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  }

  onCloseConfirmEtaModal(): void {
    this.confirmEtaModal.set(null);
    this.confirmEtaError.set('');
  }

  onSaveConfirmEtaManually(): void {
    const state = this.confirmEtaModal();
    if (!state) return;
    const draft = this.confirmEtaDraft();
    if (!draft.confirmedDate) {
      this.confirmEtaError.set('Please select a date and time.');
      return;
    }

    this.confirmEtaSaving.set(true);
    this.confirmEtaError.set('');
    const confirmedDate = this.toScheduleLocalIsoString(draft.confirmedDate);
    if (!confirmedDate) {
      this.confirmEtaError.set('Please select a valid date and time.');
      return;
    }
    const req = {
      jobVendorKey: state.vendor.jobVendorKey,
      confirmedDate,
      comment: draft.comment || null,
    };
    const call = state.isReturn
      ? this.assignVendorSvc.confirmReturnEtaManually(req)
      : this.assignVendorSvc.confirmEtaManually(req);

    call.pipe(
      switchMap((res) => {
        this.confirmEtaSaving.set(false);
        if (!res?.status) {
          this.confirmEtaError.set(res?.message || 'Confirm failed.');
          return EMPTY;
        }
        this.onCloseConfirmEtaModal();
        this.applyVendorScheduleStatusUpdate(state.vendor.jobVendorKey, {
          ...(state.isReturn
            ? {
                returnEtaConfirmedByAdmin: true,
                returnEtaConfirmedByVendor: false,
              }
            : {
                etaConfirmedByAdmin: true,
                etaConfirmedByVendor: false,
              }),
          statusActions: this.statusActionsAfterEtaConfirmed(state.vendor, state.isReturn),
        });
        this.successMessage.set(state.isReturn ? 'Return ETA confirmed.' : 'ETA confirmed.');
        setTimeout(() => this.successMessage.set(''), 5000);
        const jobKey = this.jobKey();
        if (!jobKey) return EMPTY;
        return this.assignVendorSvc.loadJobHeaderDetail(jobKey);
      }),
      takeUntil(this.destroy$),
    ).subscribe();
  }

  openApproveVendorModal(
    vendor: AssignedVendorDetail,
    title = 'Approve Vendor — Additional Approval',
  ): void {
    this.assignVendorSvc.getApproveVendorContext(vendor.jobVendorKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        if (!res?.status || !res.data) {
          this.errorMessage.set(res?.message || 'Could not load approve vendor context.');
          return;
        }
        if (!res.data.hasWorkOrder || res.data.revVendorDne === -11) {
          this.errorMessage.set('There is no work order for this vendor.');
          return;
        }
        const approvalPrefix = '<b>Approval To Proceed : </b>';
        this.approveVendorText.set(
          res.data.description
            ? `${approvalPrefix}${res.data.description}`
            : approvalPrefix,
        );
        this.approveVendorEmailNote.set('');
        this.approveVendorCustomEmail.set('');
        this.approveVendorSelectedContacts.set([]);
        this.approveVendorSelectedEstimate.set(res.data.estimates[0]?.estimateKey ?? null);
        this.approveVendorError.set('');
        this.approveVendorModal.set({ vendor, ctx: res.data, title });
      });
  }

  onCloseApproveVendorModal(): void {
    this.approveVendorModal.set(null);
    this.approveVendorError.set('');
  }

  toggleApproveVendorContact(contactKey: string, checked: boolean): void {
    const set = new Set(this.approveVendorSelectedContacts());
    if (checked) set.add(contactKey);
    else set.delete(contactKey);
    this.approveVendorSelectedContacts.set([...set]);
  }

  onSendAdditionalApproval(): void {
    const state = this.approveVendorModal();
    if (!state) return;
    const contacts = this.approveVendorSelectedContacts();
    const customEmail = this.approveVendorCustomEmail().trim();
    if (contacts.length === 0 && !customEmail) {
      this.approveVendorError.set('Select at least one vendor contact or enter a custom email.');
      return;
    }

    this.approveVendorSending.set(true);
    this.approveVendorError.set('');

    this.assignVendorSvc.sendAdditionalApproval({
      jobVendorKey: state.vendor.jobVendorKey,
      emailNote: this.approveVendorEmailNote(),
      vendorContactKeys: contacts,
      customEmail: customEmail || null,
      revVendorDne: state.ctx.revVendorDne ?? 0,
      vendorDne: state.ctx.vendorDne ?? 0,
      approvalText: this.approveVendorText(),
      workOrderKey: state.ctx.workOrderKey!,
      estimateKey: this.approveVendorSelectedEstimate(),
    })
      .pipe(
        switchMap((res) => {
          this.approveVendorSending.set(false);
          if (!res?.status) {
            this.approveVendorError.set(res?.message || 'Failed to send approval.');
            return EMPTY;
          }
          this.onCloseApproveVendorModal();
          this.successMessage.set('Additional approval sent.');
          setTimeout(() => this.successMessage.set(''), 5000);
          const jobKey = this.jobKey();
          if (!jobKey) return EMPTY;
          return this.assignVendorSvc.loadJobHeaderDetail(jobKey);
        }),
        takeUntil(this.destroy$),
      )
      .subscribe();
  }

  openCustomerEstimateForApproval(): void {
    const jobKey = this.jobKey();
    if (!jobKey) return;
    this.assignVendorSvc.getLatestCustomerEstimate(jobKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        if (!res?.status || !res.data?.hasEstimate) {
          this.errorMessage.set('There is no customer estimate.');
          return;
        }
        window.open(
          `${environment.legacyAdminBaseUrl}${res.data.navigationPath}`,
          '_blank',
          'noopener',
        );
      });
  }

  openCustomerReminderModal(vendor: AssignedVendorDetail): void {
    this.assignVendorSvc.getCustomerReminderContext(vendor.jobVendorKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        if (!res?.status || !res.data) {
          this.errorMessage.set(res?.message || 'Could not load customer contacts.');
          return;
        }
        this.customerReminderEmailNote.set('');
        this.customerReminderCustomEmail.set('');
        this.customerReminderSelectedContacts.set([]);
        this.customerReminderError.set('');
        this.customerReminderResultHtml.set('');
        this.customerReminderModal.set({ vendor, ctx: res.data });
      });
  }

  onCloseCustomerReminderModal(): void {
    this.customerReminderModal.set(null);
    this.customerReminderError.set('');
    this.customerReminderResultHtml.set('');
  }

  toggleCustomerReminderContact(contactKey: string, checked: boolean): void {
    const set = new Set(this.customerReminderSelectedContacts());
    if (checked) set.add(contactKey);
    else set.delete(contactKey);
    this.customerReminderSelectedContacts.set([...set]);
  }

  onSendCustomerReminder(): void {
    const state = this.customerReminderModal();
    if (!state) return;
    const contacts = this.customerReminderSelectedContacts();
    const customEmail = this.customerReminderCustomEmail().trim();
    if (contacts.length === 0 && !customEmail) {
      this.customerReminderError.set('Select at least one customer contact or enter a custom email.');
      return;
    }

    this.customerReminderSending.set(true);
    this.customerReminderError.set('');

    this.assignVendorSvc.sendCustomerReminder({
      jobVendorKey: state.vendor.jobVendorKey,
      emailNote: this.customerReminderEmailNote(),
      customerContactKeys: contacts,
      customEmail: customEmail || null,
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        this.customerReminderSending.set(false);
        if (!res?.status) {
          this.customerReminderError.set(res?.message || 'Failed to send reminder.');
          return;
        }
        this.customerReminderResultHtml.set(res.data ?? res.message ?? 'Email sent.');
      });
  }

  setConfirmEtaDate(v: string): void {
    this.confirmEtaDraft.update((d) => ({ ...d, confirmedDate: v }));
  }

  setConfirmEtaComment(v: string): void {
    this.confirmEtaDraft.update((d) => ({ ...d, comment: v }));
  }

  /** Opens the check-in modal for the given vendor card. */
  onCheckInTech(v: AssignedVendorDetail): void {
    const now = new Date();
    const iso = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    this.checkInDraft.set({ checkInDate: iso, noOfTech: 1 });
    this.checkInError.set('');
    this.postCheckInState.set(null);
    this.checkoutEmailNote.set('');
    this.resetCheckoutEmailContactState();
    this.checkInModalVendor.set(v);
  }

  /** Closes the check-in modal and resets all related state. */
  onCloseCheckInModal(): void {
    this.checkInModalVendor.set(null);
    this.postCheckInState.set(null);
    this.checkInError.set('');
    this.checkoutEmailNote.set('');
    this.resetCheckoutEmailContactState();
  }

  private resetCheckoutEmailContactState(): void {
    this.checkoutEmailContacts.set([]);
    this.checkoutEmailSelectedContacts.set(new Set());
    this.checkoutEmailContactsLoading.set(false);
    this.checkoutEmailError.set('');
  }

  /** Loads vendor contacts for the post-check-in checkout email step. */
  private loadCheckoutEmailContacts(vendor: AssignedVendorDetail): void {
    this.resetCheckoutEmailContactState();
    this.checkoutEmailContactsLoading.set(true);
    this.assignVendorSvc
      .getVendorContactList(vendor.vendorKey)
      .pipe(takeUntil(this.destroy$), finalize(() => this.checkoutEmailContactsLoading.set(false)))
      .subscribe((contacts) => {
        const withEmail = contacts.filter((c) => !!c.email?.trim());
        this.checkoutEmailContacts.set(withEmail);
        const defaultKeys = new Set(withEmail.filter((c) => c.isDefault).map((c) => c.value));
        this.checkoutEmailSelectedContacts.set(
          defaultKeys.size > 0 ? defaultKeys : new Set(withEmail.length === 1 ? [withEmail[0].value] : []),
        );
      });
  }

  toggleCheckoutEmailContact(contactKey: string): void {
    this.checkoutEmailSelectedContacts.update((sel) => {
      const next = new Set(sel);
      if (next.has(contactKey)) next.delete(contactKey);
      else next.add(contactKey);
      return next;
    });
    this.checkoutEmailError.set('');
  }

  isCheckoutEmailContactSelected(contactKey: string): boolean {
    return this.checkoutEmailSelectedContacts().has(contactKey);
  }

  /** Saves the admin check-in and transitions modal to "send checkout email?" step. */
  onSaveCheckIn(): void {
    const vendor = this.checkInModalVendor();
    if (!vendor) return;
    const draft = this.checkInDraft();
    if (!draft.checkInDate) {
      this.checkInError.set('Please select a check-in date and time.');
      return;
    }

    this.checkInSaving.set(true);
    this.checkInError.set('');

    const req: AdminSaveCheckInRequest = {
      jobVendorKey: vendor.jobVendorKey,
      checkInDate: new Date(draft.checkInDate).toISOString(),
      noOfTech: draft.noOfTech || 1,
    };

    this.assignVendorSvc.adminSaveCheckIn(req)
      .pipe(
        switchMap((res) => {
          this.checkInSaving.set(false);
          if (!res?.status) {
            this.checkInError.set(res?.message || 'Check-in failed. Please try again.');
            return EMPTY;
          }
          this.assignVendorSvc.patchAssignedVendor(vendor.jobVendorKey, {
            isCheckedIn: true,
            statusActions: [],
            triggerBit: 4,
          });
          this.postCheckInState.set({ vendor, checkinKey: res.data?.checkinKey ?? '' });
          this.loadCheckoutEmailContacts(vendor);
          const jobKey = this.jobKey();
          if (!jobKey) return EMPTY;
          return this.assignVendorSvc.loadJobHeaderDetail(jobKey);
        }),
        takeUntil(this.destroy$),
      )
      .subscribe();
  }

  /** Sends the checkout-link email to the vendor (the "Not Now" path skips this). */
  onSendCheckoutEmail(): void {
    const state = this.postCheckInState();
    if (!state) return;

    const contacts = [...this.checkoutEmailSelectedContacts()];
    if (contacts.length === 0) {
      this.checkoutEmailError.set('Select at least one vendor contact.');
      return;
    }

    this.checkoutEmailSending.set(true);
    this.checkoutEmailError.set('');
    const req: AdminSendCheckoutEmailRequest = {
      jobVendorKey: state.vendor.jobVendorKey,
      emailNote: this.checkoutEmailNote() || null,
      vendorContactKeys: contacts,
    };

    this.assignVendorSvc.adminSendCheckoutEmail(req)
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        this.checkoutEmailSending.set(false);
        if (!res?.status) {
          this.checkoutEmailError.set(res?.message || 'Failed to send checkout email.');
          return;
        }
        this.onCloseCheckInModal();
      });
  }

  /** Opens the checkout modal for the given vendor card. */
  onCheckOutTech(v: AssignedVendorDetail): void {
    const now = new Date();
    const iso = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    this.checkOutDraft.set({ checkoutStatus: 5, workPerformed: true, workDetails: '', checkOutDate: iso });
    this.checkOutError.set('');
    this.checkOutModalVendor.set(v);
  }

  /** Closes the checkout modal. */
  onCloseCheckOutModal(): void {
    this.checkOutModalVendor.set(null);
    this.checkOutError.set('');
  }

  // Simple field setters (arrow functions are not supported in Angular templates)
  setCheckInDate(v: string): void        { this.checkInDraft.update(d => ({ ...d, checkInDate: v })); }
  setCheckInNoOfTech(v: number): void    { this.checkInDraft.update(d => ({ ...d, noOfTech: +v })); }
  setCheckOutWorkPerformed(v: boolean): void { this.checkOutDraft.update(d => ({ ...d, workPerformed: v })); }
  setCheckOutDate(v: string): void       { this.checkOutDraft.update(d => ({ ...d, checkOutDate: v })); }
  setCheckOutStatus(v: number): void     { this.checkOutDraft.update(d => ({ ...d, checkoutStatus: v })); }
  setCheckOutWorkDetails(v: string): void{ this.checkOutDraft.update(d => ({ ...d, workDetails: v })); }

  /** Saves the admin checkout. */
  onSaveCheckOut(): void {
    const vendor = this.checkOutModalVendor();
    if (!vendor) return;
    const draft = this.checkOutDraft();
    if (!draft.checkOutDate) {
      this.checkOutError.set('Please select a check-out date and time.');
      return;
    }

    this.checkOutSaving.set(true);
    this.checkOutError.set('');

    const req: AdminSaveCheckOutRequest = {
      jobVendorKey: vendor.jobVendorKey,
      checkoutStatus: draft.checkoutStatus,
      workPerformed: draft.workPerformed,
      workDetails: draft.workDetails || null,
      checkOutDate: new Date(draft.checkOutDate).toISOString(),
    };

    this.assignVendorSvc.adminSaveCheckOut(req)
      .pipe(
        switchMap((res) => {
          this.checkOutSaving.set(false);
          if (!res?.status) {
            this.checkOutError.set(res?.message || 'Check-out failed. Please try again.');
            return EMPTY;
          }
          this.onCloseCheckOutModal();
          this.assignVendorSvc.patchAssignedVendor(vendor.jobVendorKey, {
            isCheckedIn: false,
            activeCheckinKey: null,
            statusActions: [],
          });
          const jobKey = this.jobKey();
          if (!jobKey) return EMPTY;
          return this.assignVendorSvc.loadJobHeaderDetail(jobKey);
        }),
        takeUntil(this.destroy$),
      )
      .subscribe();
  }

  /**
   * Fetches scorecard scores for the given job and updates the vendorScores signal.
   * Merges expected vendor keys across grids (location history, radius list, etc.) instead
   * of restarting the poll each time a new grid loads. Stops when every expected vendor has
   * a score entry, when the agent reports failure, or after the final poll at 60 s.
   */
  private loadAndApplyScores(jobKey: string, expectedVendorKeys?: string[]): void {
    const newKeys = (expectedVendorKeys ?? this.resolveExpectedScoreVendorKeys())
      .map((k) => k.toLowerCase())
      .filter(Boolean);
    if (newKeys.length === 0) return;

    if (this.scorePollJobKey !== jobKey) {
      this.scorePollingStop$.next();
      this.scorePollJobKey = jobKey;
      this.expectedScoreVendorKeys.clear();
      this.vendorScores.set({});
      this.scoringRunUid.set(null);
      this.scoreAgentFailed.set(false);
      this.scorePollingActive.set(false);
    }

    newKeys.forEach((k) => this.expectedScoreVendorKeys.add(k));
    this.updateScoresLoadingState();

    if (this.scorePollingActive()) return;
    this.startScorePolling(jobKey);
  }

  /** Starts (or restarts) the scorecard poll sequence for {@code jobKey}. */
  private startScorePolling(jobKey: string): void {
    this.scorePollingStop$.next();
    const loadId = ++this.latestScoreLoadId;
    this.scorePollingActive.set(true);
    this.updateScoresLoadingState();

    const pollStop$ = merge(this.destroy$, this.scorePollingStop$);
    const delays = [0, 5000, 15000, 30000, 60000];

    from(delays).pipe(
      concatMap((delay) => timer(delay)),
      takeUntil(pollStop$),
      switchMap(() => this.assignVendorSvc.getScorecardScores(jobKey)),
    ).subscribe({
      next: (result) => {
        if (loadId !== this.latestScoreLoadId) return;

        if (result.scoringRunUid) {
          this.scoringRunUid.set(result.scoringRunUid);
        }

        if (Object.keys(result.scores).length > 0) {
          this.vendorScores.update((existing) => ({ ...existing, ...result.scores }));
        }

        if (result.agentStatus === 'failed') {
          this.finishScorePolling();
          this.scoreAgentFailed.set(true);
          return;
        }

        if (this.areExpectedScoresLoaded()) {
          this.finishScorePolling();
          return;
        }

        this.updateScoresLoadingState();
      },
      complete: () => {
        if (loadId === this.latestScoreLoadId) {
          this.finishScorePolling();
        }
      },
    });
  }

  private finishScorePolling(): void {
    this.scorePollingActive.set(false);
    this.scoresLoading.set(false);
  }

  private updateScoresLoadingState(): void {
    if (this.scoreAgentFailed() || !this.scorePollingActive()) {
      this.scoresLoading.set(false);
      return;
    }
    this.scoresLoading.set(!this.areExpectedScoresLoaded());
  }

  /** Vendor keys for the current internal-vendors grid (explicit list or active grid rows). */
  private resolveExpectedScoreVendorKeys(explicit?: string[]): string[] {
    if (explicit?.length) {
      return explicit.map((k) => k.toLowerCase()).filter(Boolean);
    }
    const raw = this.searchResults().length > 0
      ? this.searchResults()
      : this.defaultVendors();
    return raw
      .map((v) => (v.vendorKey ?? '').toLowerCase())
      .filter(Boolean);
  }

  /** True when every expected vendor has a score entry ready to display (numeric score or unscored rank). */
  private areExpectedScoresLoaded(): boolean {
    if (this.expectedScoreVendorKeys.size === 0) return true;
    const scores = this.vendorScores();
    return [...this.expectedScoreVendorKeys].every((k) => {
      const s = scores[k];
      return s != null && this.isScoreEntryDisplayable(s);
    });
  }

  /** A score row is displayable when it has a full tier score or an unscored rank composite. */
  private isScoreEntryDisplayable(score: VendorScorecardScore): boolean {
    if (score.scoreTier !== 'N/A') return true;
    return score.unscoredRankScore != null;
  }

  getAiVendorSourceLabel(v: AISourcingVendor): string {
    const sv = v as unknown as Record<string, unknown>;
    const sources = (sv['sources'] as string[] | null) ?? [];
    if (sources.some((s) => s.toLowerCase().includes('verified'))) return 'Verified directory';
    if (sources.some((s) => s.toLowerCase().includes('member'))) return 'Membership directory';
    if (sv['avg_rating'] != null) return 'Web + reviews';
    if (sources.length > 0) return sources.slice(0, 2).join(' + ');
    return '';
  }

  /** Enriches vendor data with _jobTrade and rank (#1, #2, ...) for display; sets the signal */
  private applyAIVendors(vendors: AISourcingVendor[]): void {
    const jobTrade = this.tradeName();
    const enriched = vendors.map((v, i) => {
      // If email is null, use first alternate email from website_enrichment if available
      const email = v.email || (v.website_enrichment?.alternate_emails && v.website_enrichment.alternate_emails.length > 0 ? v.website_enrichment.alternate_emails[0] : null);
      return {
        ...v,
        email,
        _jobTrade: jobTrade,
        rank: v.rank != null && Number.isFinite(v.rank) ? v.rank : i + 1,
      } as Record<string, unknown>;
    });
    this.aiSourcingVendors.set(enriched as unknown as AISourcingVendor[]);
  }

  /**
   * Retry (error banner): clears the grid and repeats the same status polling flow as form load.
   */
  onRequestAISourcing(): void {
    const jobKey = this.jobKey();
    if (!jobKey) return;

    this.aiSourcingVendors.set([]);
    this.aiSourcingError.set('');
    this.aiSourcingPolling.set(false);
    this.assignVendorSvc.clearAISourcingStatus();
    this.loadAISourcingData(jobKey);
  }

  // ── Trade change popup sequence (loading → confirm → re-source → wait) ──
  tradeChangeLoadingOpen = signal(false);
  tradeChangeConfirmOpen = signal(false);
  tradeChangeConfirmName = signal<string | null>(null);
  tradeSourcingWaitModalOpen = signal(false);

  /** Job Details accordion's Trade dropdown started saving a new value. */
  onTradeChangeStarted(): void {
    this.tradeChangeLoadingOpen.set(true);
  }

  /** Job Details accordion's Trade dropdown save failed — close the loading popup, nothing else to do (the accordion shows its own error banner). */
  onTradeChangeFailed(): void {
    this.tradeChangeLoadingOpen.set(false);
  }

  /** Job Details accordion's Trade dropdown save succeeded — swap the loading popup for a confirmation. */
  onTradeChangeSucceeded(event: { tradeName: string | null }): void {
    this.tradeChangeLoadingOpen.set(false);
    this.tradeChangeConfirmName.set(event.tradeName);
    this.tradeChangeConfirmOpen.set(true);
  }

  /**
   * Admin acknowledged the trade-change confirmation. Runs the exact same action as clicking
   * "Run AI Sourcing Agent" so external vendor results are re-sourced for the new trade, then
   * tells the admin it's safe to leave and check back later.
   */
  onAcknowledgeTradeChangeConfirm(): void {
    this.tradeChangeConfirmOpen.set(false);
    this.onStartAISourcing();
    this.tradeSourcingWaitModalOpen.set(true);
  }

  /** Triggers a new sourcing request (POST /api/sourcing/request) then starts polling. */
  onStartAISourcing(): void {
    const jobKey = this.jobKey();
    if (!jobKey || this.aiSourcingStarting()) return;

    this.aiSourcingStarting.set(true);
    this.aiSourcingError.set('');
    this.aiSourcingVendors.set([]);
    this.assignVendorSvc.clearAISourcingStatus();

    this.assignVendorSvc
      .startSourcing(jobKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe((res) => {
        this.aiSourcingStarting.set(false);
        if (!res) {
          this.aiSourcingError.set('Failed to start sourcing. Please try again.');
          return;
        }
        this.loadAISourcingData(jobKey);
      });
  }

  /** Opens the AI vendor info modal */
  onOpenAIVendorInfo(row: Record<string, unknown>): void {
    this.selectedAIVendor.set(row as unknown as AISourcingVendor);
    this.showAIInfoModal.set(true);
  }

  /** Opens the legacy estimate page for the current job */
  openLegacyEstimatePage(): void {
    if (this.jobKey()) {
      window.open(`${environment.legacyAdminBaseUrl}/MgtVendorInvoice/EIndex/${this.jobKey()}`, '_blank');
    }
  }

  /** Opens the recruitment email modal for a vendor */
  onOpenRecruitEmail(row: Record<string, unknown>): void {
    this.recruitEmailVendor.set(row as unknown as AISourcingVendor);
    this.recruitEmailSubject.set(this.getRecruitEmailDefaultSubject());
    this.recruitEmailTo.set(this.resolveRecruitEmailAddress(row as unknown as AISourcingVendor));

    // Fetch support contact info then build email body
    this.assignVendorSvc
      .getSupportContactInfo()
      .pipe(takeUntil(this.destroy$))
      .subscribe((contactInfo) => {
        this.supportContactInfo.set(contactInfo);
        this.recruitEmailBody.set(this.buildRecruitEmailBodyHtml(row, contactInfo));
        this.showRecruitEmailModal.set(true);
        // Populate the contenteditable once after it exists. Do not bind [innerHTML] to the body signal —
        // that rewrites the DOM on every keystroke and resets the caret to the start.
        afterNextRender(
          () => {
            this.patchRecruitEmailBodyEditorFromSignal();
          },
          { injector: this.injector },
        );
      });
  }

  /** Default mail subject line (fully editable in the modal). */
  getRecruitEmailDefaultSubject(): string {
    return 'New Service Request from Retail Fix It Nationwide Facility Maintenance (TIME SENSITIVE RESPONSE)';
  }

  /** Primary or first alternate email for the sourcing vendor row. */
  resolveRecruitEmailAddress(v: AISourcingVendor): string {
    const primary = v.email?.trim();
    if (primary) return primary;
    const alt = v.website_enrichment?.alternate_emails;
    const first = alt?.[0]?.trim();
    return first ?? '';
  }

  /** Contact form URL from a grid/vendor row ({@code website_enrichment.contact_form_url}). */
  private getRowContactFormUrl(row: Record<string, unknown>): string {
    const we = row['website_enrichment'] as { contact_form_url?: string | null } | null | undefined;
    return (we?.contact_form_url ?? '').trim();
  }

  /**
   * True when the recruitment email modal is open for the same vendor as {@code row}, so clipboard
   * should use the live contenteditable body ({@code #recruit-body}), including user edits.
   */
  private isRecruitEmailModalForRow(row: Record<string, unknown>): boolean {
    if (!this.showRecruitEmailModal()) return false;
    const rv = this.recruitEmailVendor();
    if (!rv) return false;
    if (String(row['company_name'] ?? '').trim() !== (rv.company_name ?? '').trim()) return false;
    const rowEmail = String(row['email'] ?? '').trim();
    const rvEmail = (rv.email ?? '').trim();
    if (rowEmail && rvEmail && rowEmail !== rvEmail) return false;
    return this.getRowContactFormUrl(row) === (rv.website_enrichment?.contact_form_url ?? '').trim();
  }

  /**
   * Plain text for external vendor contact forms: uses the recruitment modal email body (live DOM)
   * when that modal is open for this vendor; otherwise builds from the standard HTML template.
   * Used by the grid Contact Page column and Contact Page links.
   */
  getPlainTextForContactFormClipboard(row: Record<string, unknown>): string {
    if (this.isRecruitEmailModalForRow(row)) {
      const html = document.getElementById('recruit-body')?.innerHTML ?? this.recruitEmailBody();
      return this.clipboardPlainTextFromHtmlBody(html);
    }
    return this.buildRecruitEmailBodyText(row);
  }

  /**
   * Builds the recruitment email body as plain text for clipboard paste (e.g. external contact forms).
   * Mirrors the HTML template content without markup.
   */
  buildRecruitEmailBodyText(vendorRow: Record<string, unknown>): string {
    const contactInfo = this.supportContactInfo() ?? {
      primaryPhone: '877-217-3335',
      secondaryPhone: '770-427-9287',
      email: 'info@retailfixit.com',
      formattedDisplay: '877-217-3335, 770-427-9287 | Email: info@retailfixit.com',
    };
    const html = this.buildRecruitEmailBodyHtml(vendorRow, contactInfo);
    return this.clipboardPlainTextFromHtmlBody(html);
  }

  /**
   * Builds the recruitment email body as HTML with structured sections.
   * Includes: Service Opportunity header, Service Overview, Location, Next Steps, and About section.
   */
  buildRecruitEmailBodyHtml(vendorRow: Record<string, unknown>, contactInfo: SupportContactInfo): string {
    const hd = this.jobHeaderDetail();
    const company = String(vendorRow['company_name'] ?? '').trim() || 'Vendor';
    const jobKey = this.jobKey();
    const regUrl = `${environment.legacyAdminBaseUrl}/MgtNewVendorRequest/GetRegisteredForJob?JobKey=${jobKey}`;

    const tradeNameValue = this.tradeName() || 'General Services';
    const serviceType = hd?.jobTypeName ?? 'Service';
    const rawDetail = hd?.serviceRequest?.trim() || hd?.serviceRequestPreview?.trim() || '';
    const serviceDetails = this.stripServiceRequestPhrasing(rawDetail);

    const isEmergency = serviceType.toLowerCase().includes('emergency');
    const dispatchWindow = isEmergency
      ? '2-4 hours - same day required'
      : 'within 36 hour goal - same week is required';

    const locationName = (hd?.locationName ?? '').trim();
    const locationAddress = (hd?.locationAddress ?? '').trim();
    const cityName = (hd?.cityName ?? '').trim();
    const stateName = (hd?.stateName ?? '').trim();
    const zipCode = (hd?.zipCode ?? '').trim();
    const cityStateZip = [cityName, stateName].filter(Boolean).join(', ') + (zipCode ? ` ${zipCode}` : '');

    const supportDisplay = contactInfo.formattedDisplay ||
      `${contactInfo.primaryPhone}, ${contactInfo.secondaryPhone} | Email: ${contactInfo.email}`;

    return this.compactRecruitEmailInterTagWhitespace(`<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
  <!-- Service Opportunity Identified -->
  <h1 style="color: #2c5282; font-size: 24px; margin-bottom: 8px;">Service Opportunity Identified</h1>
  <h3 style="color: #333; font-size: 18px; margin: 0 0 8px 0;">${this.escapeHtml(company)},</h3>
  <p style="color: #666; font-size: 14px; margin: 0 0 16px 0;">Our team has identified your company as a high‑quality local prospect to accept a service work order within your trade and service area.</p>

  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />

  <!-- Service Overview -->
  <h2 style="color: #2c5282; font-size: 20px; margin-bottom: 12px;">Service Overview</h2>
  <p style="margin: 4px 0;"><strong>Trade:</strong> ${this.escapeHtml(tradeNameValue)}</p>
  <p style="margin: 4px 0;"><strong>Service Type:</strong> ${this.escapeHtml(serviceType)}</p>
  <p style="margin: 4px 0;"><strong>Service Details:</strong></p>
  <p style="margin: 4px 0 12px 0; white-space: pre-wrap;">${this.escapeHtml(serviceDetails)}</p>
  <p style="margin: 4px 0 16px 0;"><strong>Preferred Dispatch Window:</strong> ${this.escapeHtml(dispatchWindow)}</p>

  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />

  <!-- Service Location -->
  <h2 style="color: #2c5282; font-size: 20px; margin-bottom: 12px;">Service Location</h2>
  <p style="margin: 4px 0;">${this.escapeHtml(locationName)}</p>
  <p style="margin: 4px 0;">${this.escapeHtml(locationAddress)}</p>
  <p style="margin: 4px 0 16px 0;">${this.escapeHtml(cityStateZip)}</p>

  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />

  <!-- Next Steps -->
  <h2 style="color: #2c5282; font-size: 20px; margin-bottom: 12px;">Next Steps to Accept This Opportunity</h2>
  <p style="margin: 0 0 8px 0;"><strong>This request is time‑sensitive.</strong> Please complete the steps below promptly.</p>
  <p style="margin: 0 0 16px 0; color: #666; font-size: 14px;">If this service request has already been assigned, you may not receive it—but we still encourage you to register so you’re ready for future service opportunities with Retail Fix It.</p>

  <h3 style="color: #333; font-size: 16px; margin: 16px 0 8px 0;">Step 1 – Partner Registration</h3>
  <p style="margin: 0 0 8px 0;">Register as a Retail Fix It Service Provider Partner using the secure link below:</p>
  <p style="margin: 0 0 16px 0;">👉 <a href="${this.escapeHtml(regUrl)}" style="color: #2b6cb0;">${this.escapeHtml(regUrl)}</a></p>

  <h3 style="color: #333; font-size: 16px; margin: 16px 0 8px 0;">Step 2 – Work Order Issuance</h3>
  <p style="margin: 0 0 8px 0;">Once registration is complete, you'll immediately receive the official work order with instructions to:</p>
  <ul style="margin: 0 0 16px 0; padding-left: 20px;">
    <li>Accept the job</li>
    <li>Set your ETA</li>
    <li>Proceed with the site visit and service execution</li>
  </ul>

  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />

  <!-- About Section -->
  <h2 style="color: #2c5282; font-size: 20px; margin-bottom: 12px;">About Working With Retail Fix It</h2>
  <p style="margin: 0 0 8px 0;">We operate a nationwide facilities management platform supporting multi‑location commercial clients. Our vendor partners value:</p>
  <ul style="margin: 0 0 16px 0; padding-left: 20px;">
    <li>Clear scope and expectations</li>
    <li>Professional communication</li>
    <li>Prompt payment and repeat opportunities</li>
  </ul>
  <p style="margin: 0 0 16px 0;">We look forward to the possibility of working together.</p>

  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />

  <!-- Footer -->
  <p style="margin: 0; font-weight: bold;">Retail Fix It</p>
  <p style="margin: 4px 0; color: #666;">Nationwide Facilities Management</p>
  <p style="margin: 4px 0; color: #666;">${this.escapeHtml(supportDisplay)}</p>
</div>`);
  }

  /**
   * Writes generated HTML into the recruitment modal's contenteditable once after it is rendered.
   * Avoid binding `[innerHTML]` to `recruitEmailBody()` — updating that signal on every keystroke would
   * replace the DOM and reset the caret to the beginning of the field.
   */
  private patchRecruitEmailBodyEditorFromSignal(): void {
    const el = document.getElementById('recruit-body');
    if (!el) {
      return;
    }
    el.innerHTML = this.recruitEmailBody();
  }

  /** Collapses whitespace-only text nodes between tags for tighter plain-text extraction when copying. */
  private compactRecruitEmailInterTagWhitespace(html: string): string {
    return html.replace(/>\s+</g, '><').trim();
  }

  /**
   * Converts stored email body HTML (template or contenteditable) into plain text for the clipboard.
   * Uses a structured DOM walk instead of {@link HTMLElement.innerText} on a detached container:
   * browsers often collapse block boundaries when the tree is not attached to the document, producing
   * one run-on line; headings, paragraphs, lists, and {@code hr} are serialized with matching breaks.
   */
  private clipboardPlainTextFromHtmlBody(html: string): string {
    if (!html?.trim()) return '';
    if (typeof document === 'undefined') {
      return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html.trim();
    let text = this.serializeRecruitEmailHtmlToPlainText(wrapper);
    text = text.replace(/\u00a0/g, ' ');
    text = text.replace(/\r\n/g, '\n');
    text = text.replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n');
    text = text.replace(/\n{3,}/g, '\n\n');
    return text.trim();
  }

  /**
   * Walks recruitment email HTML and inserts line breaks between logical blocks so pasted plain text
   * aligns with the visual email sections (including nested lists and contenteditable {@code div} rows).
   */
  private serializeRecruitEmailHtmlToPlainText(root: HTMLElement): string {
    const serialize = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE) {
        return (node.textContent ?? '').replace(/\u00a0/g, ' ');
      }
      if (node.nodeType === Node.COMMENT_NODE) {
        return '';
      }
      if (node.nodeType !== Node.ELEMENT_NODE) {
        return '';
      }

      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();

      if (tag === 'style' || tag === 'script' || tag === 'noscript') {
        return '';
      }

      if (tag === 'br') {
        return '\n';
      }

      if (tag === 'hr') {
        return '\n';
      }

      if (tag === 'img') {
        const alt = (el.getAttribute('alt') ?? '').trim();
        return alt ? `${alt}\n\n` : '';
      }

      if (tag === 'ul' || tag === 'ol') {
        const lines: string[] = [];
        for (const child of Array.from(el.children)) {
          if (child.tagName.toLowerCase() !== 'li') {
            continue;
          }
          const row = Array.from(child.childNodes)
            .map(serialize)
            .join('')
            .replace(/[ \t\r\f\v]+/g, ' ')
            .trim();
          if (row) {
            lines.push(row);
          }
        }
        return lines.length ? `${lines.join('\n')}\n\n` : '';
      }

      if (tag === 'pre') {
        const raw = (el.textContent ?? '').replace(/\u00a0/g, ' ');
        return raw ? `${raw.replace(/\r\n/g, '\n')}\n\n` : '';
      }

      const blockCopyTags =
        tag === 'p' ||
        tag === 'h1' ||
        tag === 'h2' ||
        tag === 'h3' ||
        tag === 'h4' ||
        tag === 'h5' ||
        tag === 'h6' ||
        tag === 'blockquote';

      if (blockCopyTags) {
        const inner = Array.from(el.childNodes).map(serialize).join('');
        const normalized = inner.replace(/\r\n/g, '\n').trim();
        return normalized ? `${normalized}\n\n` : '';
      }

      // Contenteditable often emits sibling <div> rows; keep a line break between them.
      if (tag === 'div') {
        const childNodes = Array.from(el.childNodes);
        const onlySiblingDivs =
          childNodes.length > 1 &&
          childNodes.every(
            ch => ch.nodeType === Node.ELEMENT_NODE && (ch as HTMLElement).tagName.toLowerCase() === 'div',
          );
        if (onlySiblingDivs) {
          const pieces = childNodes
            .map(serialize)
            .map(s => s.trimEnd())
            .filter(s => s.length > 0);
          return pieces.length ? `${pieces.join('\n')}\n\n` : '';
        }
        return childNodes.map(serialize).join('');
      }

      return Array.from(el.childNodes).map(serialize).join('');
    };

    return Array.from(root.childNodes).map(serialize).join('');
  }

  /** Escapes HTML special characters to prevent XSS in email body. */
  private escapeHtml(text: string): string {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Removes "Service Request:" prefix from display text. */
  private cleanServiceRequestText(raw: string): string {
    if (!raw?.trim()) return '';
    let t = raw.replace(/\r\n/g, '\n').trim();
    t = t.replace(/^[\s]*service\s*request\s*details?\s*[:]\s*/i, '');
    t = t.replace(/^[\s]*service\s*request\s*[:]\s*/i, '');
    t = t.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    return t;
  }

  /** Removes "Service Request" phrasing from job detail text used in the email body. */
  private stripServiceRequestPhrasing(raw: string): string {
    if (!raw?.trim()) {
      return 'Work order and scope will be provided after you complete registration.';
    }
    let t = raw.replace(/\r\n/g, '\n').trim();
    t = t.replace(/^[\s]*service\s*request\s*details?\s*[:]\s*/i, '');
    t = t.replace(/^[\s]*service\s*request\s*[:]\s*/i, '');
    t = t.replace(/\bservice\s*request\b/gi, '');
    t = t.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    return t || 'Work order and scope will be provided after you complete registration.';
  }

  /** Converts small rich-text HTML fragments into readable plain text. */
 htmlToPlainText(raw: string): string {
    if (!raw?.trim()) return '';
    const wrapper = document.createElement('div');
    wrapper.innerHTML = raw.trim();
    const text = wrapper.textContent ?? wrapper.innerText ?? '';
    return text.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  }

  /** Extracts the first highlighted span text from a rich-text HTML fragment. */
  private extractHighlightedText(raw: string): string {
    if (!raw?.trim()) return '';
    const wrapper = document.createElement('div');
    wrapper.innerHTML = raw.trim();
    const highlighted = wrapper.querySelector('[style*="background-color"], [style*="background:"]');
    const text = highlighted?.textContent ?? '';
    return text.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();
  }

  /** Location: "{name} {address} - {city}, {state} {zip}" */
  private formatJobLocationLine(hd: JobHeaderDetail): string {
    const name = (hd.locationName ?? '').trim();
    const addr = (hd.locationAddress ?? '').trim();
    const city = (hd.cityName ?? '').trim();
    const st = (hd.stateName ?? '').trim();
    const zip = (hd.zipCode ?? '').trim();
    const left = [name, addr].filter(Boolean).join(' ');
    const cityState = city && st ? `${city}, ${st}` : city || st;
    const right = [cityState, zip].filter(Boolean).join(' ');
    return right ? `${left} - ${right}`.trim() : left || '—';
  }

  /** Helper to get preview text for a field */
  getPreviewText(html: string, maxLength: number = 150): string {
    const plain = this.htmlToPlainText(html);
    if (plain.length <= maxLength) return html;
    // For simplicity, truncate the plain text and add ellipsis
    // To preserve HTML, we'd need a more complex parser, but this matches the existing behavior for service request
    return plain.substring(0, maxLength) + '...';
  }

  /** Check if a field needs a show more button */
  needsShowMore(html: string, maxLength: number = 150): boolean {
    return this.htmlToPlainText(html).length > maxLength;
  }

  onRecruitSubjectInput(event: Event): void {
    const el = event.target as HTMLInputElement;
    this.recruitEmailSubject.set(el.value);
  }

  onRecruitToInput(event: Event): void {
    const el = event.target as HTMLInputElement;
    this.recruitEmailTo.set(el.value);
  }

  onRecruitBodyInput(event: Event): void {
    const el = event.target as HTMLTextAreaElement;
    this.recruitEmailBody.set(el.value);
  }

  /** Handles input from the contenteditable HTML email body editor. */
  onRecruitBodyHtmlInput(event: Event): void {
    const el = event.target as HTMLElement;
    this.recruitEmailBody.set(el.innerHTML);
  }

  /** Sends the recruitment email via the Email Service API. */
  onSendRecruitmentEmail(): void {
    const to = this.recruitEmailTo().trim();
    if (!to) {
      window.alert('Please enter a recipient email address.');
      return;
    }

    const vendor = this.recruitEmailVendor();
    const companyName = vendor?.company_name ?? 'Unknown Company';
    const subject = this.recruitEmailSubject();
    const body = this.recruitEmailBody();
    const jobKey = this.jobKey();
    const registrationUrl = `${environment.legacyAdminBaseUrl}/MgtNewVendorRequest/GetRegisteredForJob?JobKey=${jobKey}`;

    const request: RecruitmentEmailRequest = {
      toEmail: to,
      subject,
      body,
      companyName,
      registrationUrl,
    };

    this.recruitEmailSending.set(true);
    this.assignVendorSvc
      .sendRecruitmentEmail(request)
      .pipe(
        takeUntil(this.destroy$),
        switchMap((response) => {
          if (response.flag !== 1) {
            return of({ phase: 'email_failed' as const, emailRes: response });
          }
          const adminNote: SaveGeneralAdminNoteRequest = {
            jobKey,
            title: `Sent Vendor Onboarding Email — ${companyName}`,
            comment: 'The Onborading email has been sent by the admin.',
          };
          return this.assignVendorSvc.saveGeneralAdminNote(adminNote).pipe(
            map((noteRes) => ({ phase: 'done' as const, emailRes: response, noteRes })),
          );
        }),
      )
      .subscribe({
        next: (out) => {
          this.recruitEmailSending.set(false);
          if (out.phase === 'email_failed') {
            window.alert(out.emailRes.mess ?? 'Failed to send recruitment email. Please try again.');
            return;
          }
          window.alert(`Recruitment email sent successfully to ${to}.`);
          this.showRecruitEmailModal.set(false);
          if (!out.noteRes.status) {
            window.alert(
              out.noteRes.message ??
                'The email was sent, but saving the activity note on the job failed. You can add a manual note if needed.',
            );
          }
        },
        error: () => {
          this.recruitEmailSending.set(false);
          window.alert('An error occurred while sending the recruitment email. Please try again.');
        },
      });
  }

  /**
   * Opens the bulk recruitment email modal.
   * Shows a list of every AI-sourced vendor that has a fetched email address, with an
   * editable subject and body. On send, each recipient gets their own individually
   * personalized email via the existing recruitment email API.
   */
  onOpenBulkRecruitEmail(event?: Event): void {
    event?.stopPropagation();
    const recipients = this.bulkRecruitRecipients();
    if (recipients.length === 0) {
      window.alert('No recipients with email addresses were found in the sourcing results.');
      return;
    }
    this.bulkRecruitSubject.set(this.getRecruitEmailDefaultSubject());
    this.bulkRecruitProgress.set(null);
    this.bulkRecruitResults.set([]);

    this.assignVendorSvc
      .getSupportContactInfo()
      .pipe(takeUntil(this.destroy$))
      .subscribe((contactInfo) => {
        this.supportContactInfo.set(contactInfo);
        // Build an unpersonalized template body using a placeholder company row.
        // The placeholder is swapped for each recipient at send time.
        const placeholderRow: Record<string, unknown> = { company_name: '{{companyName}}' };
        this.bulkRecruitBody.set(this.buildRecruitEmailBodyHtml(placeholderRow, contactInfo));
        this.showBulkRecruitEmailModal.set(true);
        afterNextRender(
          () => {
            const el = document.getElementById('bulk-recruit-body');
            if (el) el.innerHTML = this.bulkRecruitBody();
          },
          { injector: this.injector },
        );
      });
  }

  onBulkRecruitSubjectInput(event: Event): void {
    const el = event.target as HTMLInputElement;
    this.bulkRecruitSubject.set(el.value);
  }

  onBulkRecruitBodyHtmlInput(event: Event): void {
    const el = event.target as HTMLElement;
    this.bulkRecruitBody.set(el.innerHTML);
  }

  onCloseBulkRecruitEmailModal(): void {
    if (this.bulkRecruitSending()) return;
    this.showBulkRecruitEmailModal.set(false);
  }

  /**
   * Sends the recruitment email individually to each recipient.
   * Uses concatMap for sequential per-recipient calls so we get one API request
   * per recipient (each hitting the existing Resend-backed Email Service API).
   */
  onSendBulkRecruitEmails(): void {
    const recipients = this.bulkRecruitRecipients();
    if (recipients.length === 0) {
      window.alert('No recipients with email addresses were found in the sourcing results.');
      return;
    }
    const subject = this.bulkRecruitSubject().trim();
    if (!subject) {
      window.alert('Please enter a subject.');
      return;
    }
    const bodyTemplate = this.bulkRecruitBody();
    const jobKey = this.jobKey();
    const registrationUrl = `${environment.legacyAdminBaseUrl}/MgtNewVendorRequest/GetRegisteredForJob?JobKey=${jobKey}`;

    this.bulkRecruitSending.set(true);
    this.bulkRecruitProgress.set({ sent: 0, failed: 0, total: recipients.length });
    this.bulkRecruitResults.set([]);

    from(recipients)
      .pipe(
        concatMap((r) => {
          const companyName = r.vendor.company_name ?? 'Vendor';
          const personalizedBody = bodyTemplate
            .split('{{companyName}}')
            .join(this.escapeHtml(companyName));
          const request: RecruitmentEmailRequest = {
            toEmail: r.email,
            subject,
            body: personalizedBody,
            companyName,
            registrationUrl,
          };
          return this.assignVendorSvc.sendRecruitmentEmail(request).pipe(
            map((res) => ({ recipient: r, res })),
          );
        }),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: ({ recipient, res }) => {
          const success = res.flag === 1;
          this.bulkRecruitResults.update((rows) => [
            ...rows,
            {
              company: recipient.vendor.company_name ?? '',
              email: recipient.email,
              success,
              error: success ? undefined : (res.mess ?? 'Failed to send.'),
            },
          ]);
          this.bulkRecruitProgress.update((p) =>
            p
              ? {
                  ...p,
                  sent: p.sent + (success ? 1 : 0),
                  failed: p.failed + (success ? 0 : 1),
                }
              : p,
          );
        },
        error: () => {
          this.bulkRecruitSending.set(false);
          window.alert('An error occurred while sending recruitment emails.');
        },
        complete: () => {
          this.bulkRecruitSending.set(false);
          const progress = this.bulkRecruitProgress();
          if (progress) {
            const noteTitle = `Sent Vendor Onboarding Emails — ${progress.sent} sent, ${progress.failed} failed`;
            const adminNote: SaveGeneralAdminNoteRequest = {
              jobKey,
              title: noteTitle,
              comment: `Bulk onboarding email dispatch to ${progress.total} AI-sourced vendor(s). Sent: ${progress.sent}. Failed: ${progress.failed}.`,
            };
            this.assignVendorSvc
              .saveGeneralAdminNote(adminNote)
              .pipe(takeUntil(this.destroy$))
              .subscribe();
          }
        },
      });
  }

  /** Returns formatted opening hours from the AI vendor data (snake_case from API) */
  aiFormatHours(hours: Record<string, unknown> | null | undefined): string {
    if (!hours) return 'Not available';
    const desc = (hours['weekday_descriptions'] ?? hours['weekdayDescriptions']) as string[] | undefined;
    if (desc && Array.isArray(desc)) {
      return desc.join(' | ');
    }
    return 'See website for hours';
  }

  /** Returns the commercial/residential label for display */
  aiWorkTypeLabel(val: string | null | undefined): string {
    if (!val) return 'Not specified';
    switch (val.toLowerCase()) {
      case 'commercial': return 'Commercial';
      case 'residential': return 'Residential';
      case 'both': return 'Commercial & Residential';
      default: return val;
    }
  }

  /**
   * Copies the recruitment email plain text (live editor when this modal is open for {@code vendorRow})
   * and opens the vendor contact URL. Pass {@code vendorRow} from the template so clipboard matches
   * the popup body including edits; omit only when unavailable.
   */
  onOpenContactFormCopyBody(event: Event, contactFormUrl: string, vendorRow?: AISourcingVendor): void {
    event.preventDefault();
    const row = (vendorRow ?? this.recruitEmailVendor()) as unknown as Record<string, unknown> | undefined;
    const plain = row
      ? this.getPlainTextForContactFormClipboard(row)
      : this.clipboardPlainTextFromHtmlBody(
          document.getElementById('recruit-body')?.innerHTML ?? this.recruitEmailBody(),
        );
    if (plain && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(plain).catch(() => {});
    }
    if (contactFormUrl) {
      window.open(contactFormUrl, '_blank', 'noopener');
    }
  }

  /**
   * Maps US state names to their timezone(s).
   * For states with multiple timezones, returns the primary/most common one.
   */
}
