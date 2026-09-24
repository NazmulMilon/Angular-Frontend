import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, BehaviorSubject, tap, catchError, of, finalize, timeout, TimeoutError, map } from 'rxjs';
import {
  AssignVendorApiResponse,
  AssignVendorPage,
  AssignedVendorDetail,
  JobHeaderDetail,
  VendorListItem,
  LocationHistoryVendor,
  mapVendorListItemToLocationHistoryVendor,

  QuickVendorRequest,
  SaveVendorNoteRequest,
  AddPinnedVendorRequest,
  CheckDuplicateVendorRequest,
  DataReturn,
  VendorDropdownOption,
  VendorContactOption,
  IntDropdownOption,
  ServiceChargeResult,
  VendorRates,
  VendorNoteItem,
  RegisteredVendorPacket,
  CreateVendorContext,
  UplineOverrideRequest,
  SaveVendorToJobRequest,
  SaveVendorToJobWithFilesRequest,
  UpdateVendorScheduleDatesRequest,
  SendWorkOrderEmailRequest,
  BulkCancellationRequest,
  SetVendorAsDefaultRequest,
  ReassignVendorFromInactiveRequest,
  JobFileItem,
  LocationFileItem,
  AISourcingVendor,
  AISourcingStatus,
  UpdateSourcedVendorEmailRequest,
  SourcingVendorEmailSavedResponse,
  RecruitmentEmailRequest,
  RecruitmentEmailResponse,
  SaveGeneralAdminNoteRequest,
  BroadcastConfigDto,
  SaveBroadcastConfigRequest,
  SupportContactInfo,
  VendorBillCheckResult,
  PendingApprovalCheckResult,
  VendorCountCheckResult,
  DefaultVendorCheckResult,
  VendorRadioOption,
  SetOtherVendorDefaultRequest,
  UnassignDefaultVendorAndPromoteRequest,
  UnassignVendorRequest,
  UnassignVendorWithEmailRequest,
  SetEtaEmailPromptResponse,
  SendEtaSetEmailRequest,
  HandleEstimateAndUnassignRequest,
  CheckDistanceRuleResponse,
  CreateDistantVendorApprovalRequest,
  CreateDistantVendorApprovalResponse,
  DistantVendorApprovalDetailsResponse,
  ProcessDistantVendorApprovalRequest,
  ProcessDistantVendorDeclineRequest,
  ProcessDistantVendorResponse,
  JobStatusOption,
  AISourcingRequestResponse,
  CustomerRequestorOption,
  AccountManagerOption,
  JobPriorityOption,
  JobPriorityVendorCheck,
  JobPriorityChangePreview,
  SendVendorLoginEmailRequest,
  UpdateServiceRequestInstructionsRequest,
  UpdateNteRequest,
  BroadcastVendorOptionDto,
  BroadcastToVendorsRequest,
  BroadcastJobFileDto,
  CustomerProfileDne,
  CustomerLocationOptionDto,
  DuplicateJobRequest,
  DuplicateJobResultDto,
  AccountManagerSurveySetupItem,
  AccountManagerSurveyWorkOrderSaveRequest,
  AccountManagerSurveyWorkOrderSaveResult,
  VendorScorecardScore,
  VendorScorecardScoresApiResult,
  VendorScorecardScoresLookup,
  AdminCheckInStatusDto,
  AdminCheckInResultDto,
  AdminSaveCheckInRequest,
  AdminSendCheckoutEmailRequest,
  AdminSaveCheckOutRequest,
  VendorActionMailContext,
  SendVendorActionMailRequest,
  ConfirmEtaManuallyRequest,
  VendorEstimateNavigation,
  LatestCustomerEstimate,
  ApproveVendorContext,
  SendAdditionalApprovalRequest,
  SetVendorEstimateApprovedRequest,
  SetVendorEstimateApprovedResult,
  CustomerReminderContext,
  SendCustomerReminderRequest,
  VendorEstimateListResult,
  VendorPaperFile,
  CustomerEstimatesForApprovalResult,
  VendorContactsForEstimateResult,
} from '../models/assign-vendor.model';
import {
  OnSiteEstimateInitResponse,
  SaveOnSiteEstimateRequest,
  SaveOnSiteEstimateApiRequest,
  BackendLineItem,
  TripChargeLineItem,
  MaterialLineItem,
  LaborLineItem,
  SaveOnSiteEstimateResponse,
  SaveVendorApprovalDataRequest,
  SaveVendorApprovalDataResponse,
  CheckBeforeActionRequest,
  CheckBeforeActionResponse,
  SaveTechCheckInRequest,
  SaveTechCheckOutRequest,
  EmailWorkOrderComposeResponse,
  SendWorkOrderEmailRequest as WorkOrderEmailRequest,
  SendWorkOrderEmailResponse,
  SubmitForCustomerApprovalRequest,
  SubmitForCustomerApprovalResponse,
  CreateCustomerEstimateRequest,
  CreateCustomerEstimateResponse,
  CustomerEstimateHistoryResponse,
  SendCustomerEstimateEmailRequest,
  SendCustomerEstimateEmailResponse,
  CustomerEstimateRecipientsResponse,
  CustomerEstimateAttachmentsResponse,
  ApproveVendorEstimateRequest,
  ApproveVendorEstimateResponse,
  UploadEstimateFilesResponse,
  EstimateUploadedFile,
  CustomerDneCalculationResponse,
  CustomerMarkupResponse,
  CustomerMarkupStatisticsResponse,
  VendorRateResponse,
  VendorTradeRateResponse,
  VendorRateLegacyResponse,
  EditEstimateResponse,
  UpdateEstimateRequest,
  UpdateEstimateResponse,
  UpdateCustomerEstimateRequest,
  UpdateCustomerEstimateResponse,
} from '../models/on-site-estimate.model';
import { environment } from '../../environments/environment';
import { AuthTokenService } from './auth-token.service';

type PageResponse = AssignVendorApiResponse<AssignVendorPage>;
type JobHeaderDetailResponse = AssignVendorApiResponse<JobHeaderDetail>;
type VendorListResponse = AssignVendorApiResponse<VendorListItem[]>;
type AssignedListResponse = AssignVendorApiResponse<LocationHistoryVendor[]>;
type IntResponse = AssignVendorApiResponse<number>;
type StringResponse = AssignVendorApiResponse<string>;
type DataReturnResponse = AssignVendorApiResponse<DataReturn>;
type DropdownResponse = AssignVendorApiResponse<VendorDropdownOption[]>;
type ContactDropdownResponse = AssignVendorApiResponse<VendorContactOption[]>;
type ServiceChargeResponse = AssignVendorApiResponse<ServiceChargeResult>;
type LocationHistoryResponse = AssignVendorApiResponse<LocationHistoryVendor[]>;
type VendorRatesResponse = AssignVendorApiResponse<VendorRates>;
type RegisteredVendorPacketResponse = AssignVendorApiResponse<RegisteredVendorPacket>;
type CreateVendorContextResponse = AssignVendorApiResponse<CreateVendorContext>;
type JobFileListResponse = AssignVendorApiResponse<JobFileItem[]>;
type LocationFileListResponse = AssignVendorApiResponse<LocationFileItem[]>;
type SaveGeneralAdminNoteResponse = AssignVendorApiResponse<string>;
type AccountManagerSurveyItemsResponse = AssignVendorApiResponse<AccountManagerSurveySetupItem[]>;
type AccountManagerSurveySaveResponse = AssignVendorApiResponse<AccountManagerSurveyWorkOrderSaveResult>;

/**
 * Angular HTTP service for the Assign Vendor Tab feature.
 *
 * Maps 1-to-1 with every endpoint in the Layer 2 controller
 * (AdminJobVendorController — Assign Vendor Tab region).
 *
 * Controller base route: api/v1/admin/job-vendor
 *
 * Grid data is exposed through BehaviorSubjects so components
 * can subscribe to real-time updates after mutations.
 */
@Injectable({ providedIn: 'root' })
export class AssignVendorService {
  private readonly http = inject(HttpClient);
  private readonly authTokenSvc = inject(AuthTokenService);

  /**
   * Job Ops `AdminJobVendorController` base (`api/v1/admin/job-vendor`). The API applies class-level `[Authorize]`,
   * so every call needs a valid admin JWT. All HTTP traffic here uses the app-root `HttpClient` from `app.config.ts`,
   * which registers `authInterceptor` — it adds `Authorization: Bearer` whenever `AuthTokenService` has a token.
   * Other bases on this service (`distantVendorApiBase`, `sourcingApiBase`, `vendorCancellationApiBase`, SystemSetup URLs)
   * are separate controllers/routes and are unchanged by that policy.
   */
  private readonly apiBase = `${environment.apiBaseUrl}/api/v1/admin/job-vendor`;
  private readonly customerProfileApiBase = `${environment.apiBaseUrl}/api/CustomerProfile`;

  // ──────────────────────────────────────────────────────────────
  //  Real-time data streams
  // ──────────────────────────────────────────────────────────────

  private readonly _pageContext$ = new BehaviorSubject<AssignVendorPage | null>(null);
  private readonly _jobHeaderDetail$ = new BehaviorSubject<JobHeaderDetail | null>(null);
  private readonly _assignedVendors$ = new BehaviorSubject<LocationHistoryVendor[]>([]);
  private readonly _locationHistory$ = new BehaviorSubject<LocationHistoryVendor[]>([]);
  private readonly _pinnedVendors$ = new BehaviorSubject<LocationHistoryVendor[]>([]);
  private readonly _defaultVendors$ = new BehaviorSubject<LocationHistoryVendor[]>([]);
  private readonly _searchResults$ = new BehaviorSubject<VendorListItem[]>([]);
  private readonly _vendorDropdown$ = new BehaviorSubject<VendorDropdownOption[]>([]);
  private readonly _tradeDropdown$ = new BehaviorSubject<VendorDropdownOption[]>([]);
  private readonly _contactDropdown$ = new BehaviorSubject<VendorContactOption[]>([]);
  private readonly _stateDropdown$ = new BehaviorSubject<IntDropdownOption[]>([]);
  private readonly _cityDropdown$ = new BehaviorSubject<IntDropdownOption[]>([]);
  private readonly _loading$ = new BehaviorSubject<boolean>(false);
  private readonly _aiSourcingVendors$ = new BehaviorSubject<AISourcingVendor[]>([]);
  private readonly _aiSourcingStatus$ = new BehaviorSubject<AISourcingStatus | null>(null);
  private readonly _jobStatusList$ = new BehaviorSubject<JobStatusOption[]>([]);
  /** Monotonic counter so only the latest in-flight header refresh updates the stream. */
  private jobHeaderDetailLoadSeq = 0;
  /** Monotonic counter so only the latest in-flight assign-page refresh updates the stream. */
  private assignPageLoadSeq = 0;
  readonly jobStatusList$ = this._jobStatusList$.asObservable();

  readonly pageContext$ = this._pageContext$.asObservable();
  readonly jobHeaderDetail$ = this._jobHeaderDetail$.asObservable();
  readonly assignedVendors$ = this._assignedVendors$.asObservable();
  readonly locationHistory$ = this._locationHistory$.asObservable();
  readonly pinnedVendors$ = this._pinnedVendors$.asObservable();
  readonly defaultVendors$ = this._defaultVendors$.asObservable();
  readonly searchResults$ = this._searchResults$.asObservable();
  readonly vendorDropdown$ = this._vendorDropdown$.asObservable();
  readonly contactDropdown$ = this._contactDropdown$.asObservable();
  readonly tradeDropdown$ = this._tradeDropdown$.asObservable();
  readonly stateDropdown$ = this._stateDropdown$.asObservable();
  readonly cityDropdown$ = this._cityDropdown$.asObservable();
  readonly loading$ = this._loading$.asObservable();
  readonly aiSourcingVendors$ = this._aiSourcingVendors$.asObservable();
  readonly aiSourcingStatus$ = this._aiSourcingStatus$.asObservable();

  /** Base URL for the sourcing API (different route from admin/job-vendor) */
  private readonly sourcingApiBase = `${environment.apiBaseUrl}/api/sourcing`;

  /** Base URL for the Email Service API (vendor recruitment emails) */
  private readonly emailServiceApiBase = `${environment.emailServiceApiUrl}/api/vendor-recruitment`;

  /** Base URL for VendorCancellationController endpoints */
  private readonly vendorCancellationApiBase = `${environment.apiBaseUrl}/api/v1/admin/vendor-cancellation`;

  /** Account Manager survey (work-order vendor selection) */
  private readonly accountManagerSurveyApiBase = `${environment.apiBaseUrl}/api/v1/ManageAccountManagerSurvey`;

  // ──────────────────────────────────────────────────────────────
  //  SRS 23.1 — Page Initialization
  //  GET assign-page/{jobKey}
  // ──────────────────────────────────────────────────────────────

  /**
   * Loads page-level context for the Assign Vendor tab.
   * Includes job context, primary-vendor flags, and tab highlights.
   * @param quiet When true, skips the global loading indicator (background refresh).
   */
  loadAssignVendorPage(jobKey: string, options?: { quiet?: boolean }): Observable<PageResponse> {
    const quiet = options?.quiet === true;
    const seq = ++this.assignPageLoadSeq;
    if (!quiet) this._loading$.next(true);
    return this.http.get<PageResponse>(`${this.apiBase}/assign-page/${jobKey}`).pipe(
      tap((res) => {
        if (res.status && seq === this.assignPageLoadSeq) {
          this._pageContext$.next(res.data);
        }
      }),
      finalize(() => {
        if (!quiet) this._loading$.next(false);
      }),
      catchError(this.handleError<PageResponse>('loadAssignVendorPage')),
    );
  }

  /**
   * Checks if the job requires upline approval (on form load).
   * GET check-upline-approval?jobKey=...
   * Returns 0 = no block, 2 = proceed, other = show customer did not approve modal.
   */
  checkUplineApproval(jobKey: string): Observable<IntResponse> {
    const params = new HttpParams().set('jobKey', jobKey);
    return this.http
      .get<IntResponse>(`${this.apiBase}/check-upline-approval`, { params })
      .pipe(catchError(this.handleError<IntResponse>('checkUplineApproval')));
  }

  /**
   * Gets Create Vendor context for the job (IsPrimary, FromCustomer, MinutesLeft, etc.).
   * GET create-vendor-context/{jobKey}
   */
  getCreateVendorContext(jobKey: string): Observable<CreateVendorContextResponse> {
    return this.http
      .get<CreateVendorContextResponse>(`${this.apiBase}/create-vendor-context/${jobKey}`)
      .pipe(catchError(this.handleError<CreateVendorContextResponse>('getCreateVendorContext')));
  }

  /**
   * Checks primary vendor intro / broadcast status.
   * GET check-primary-vendor-intro/{jobKey}
   * Returns "0" | "1" | "2" (or error message string in data on failure).
   */
  checkPrimaryVendorIntro(jobKey: string): Observable<StringResponse> {
    return this.http
      .get<StringResponse>(`${this.apiBase}/check-primary-vendor-intro/${jobKey}`)
      .pipe(catchError(this.handleError<StringResponse>('checkPrimaryVendorIntro')));
  }

  /**
   * Saves upline override (JobKey, Reason, AdminKey).
   * POST save-upline-override
   */
  saveUplineOverride(request: UplineOverrideRequest): Observable<StringResponse> {
    return this.http
      .post<StringResponse>(`${this.apiBase}/save-upline-override`, request)
      .pipe(catchError(this.handleError<StringResponse>('saveUplineOverride')));
  }

  // ──────────────────────────────────────────────────────────────
  //  Job Header Detail (mirrors ProjectRCS GetJobHeaderDetail
  //  + GetServiceRequestForJob)
  //  GET job-header-detail/{jobKey}
  // ──────────────────────────────────────────────────────────────

  /**
   * Loads full job header detail data for the Job Details panel.
   * Only the most recent in-flight request may update `_jobHeaderDetail$`.
   */
  loadJobHeaderDetail(jobKey: string): Observable<JobHeaderDetailResponse> {
    const seq = ++this.jobHeaderDetailLoadSeq;
    return this.http
      .get<JobHeaderDetailResponse>(`${this.apiBase}/job-header-detail/${jobKey}`)
      .pipe(
        tap((res) => {
          if (res.status && seq === this.jobHeaderDetailLoadSeq) {
            this._jobHeaderDetail$.next(res.data);
          }
        }),
        catchError(this.handleError<JobHeaderDetailResponse>('loadJobHeaderDetail')),
      );
  }

  /**
   * Optimistically patches one assigned vendor row in the header detail stream.
   * Syncs top-level jobStatusName when the default vendor is patched.
   */
  patchAssignedVendor(
    jobVendorKey: string,
    patch: Partial<AssignedVendorDetail>,
  ): void {
    const current = this._jobHeaderDetail$.value;
    if (!current) return;

    const target = current.assignedVendors.find((v) => v.jobVendorKey === jobVendorKey);
    const syncHeader = target?.isDefault === true && patch.jobStatusName != null;

    this._jobHeaderDetail$.next({
      ...current,
      jobStatusName: syncHeader ? patch.jobStatusName! : current.jobStatusName,
      assignedVendors: current.assignedVendors.map((v) =>
        v.jobVendorKey === jobVendorKey ? { ...v, ...patch } : v,
      ),
    });
  }

  // ──────────────────────────────────────────────────────────────
  //  SRS 23.2 — DataTable / Grid Endpoints
  // ──────────────────────────────────────────────────────────────

  /**
   * Fetches assigned vendors for a job (server-side DataTable).
   * POST assigned-vendors/{locationKey}?jobKey=...
   */
  loadAssignedVendors(jobKey: string): Observable<AssignedListResponse> {
    this._loading$.next(true);
    return this.http
      .post<AssignedListResponse>(`${this.apiBase}/assigned-vendors/${jobKey}`, null)
      .pipe(
        tap((res) => {
          if (res.status) this._assignedVendors$.next(res.data);
        }),
        finalize(() => this._loading$.next(false)),
        catchError(this.handleError<AssignedListResponse>('loadAssignedVendors')),
      );
  }

  /**
   * Fetches vendors who previously serviced this job's location.
   * GET location-history/{jobKey}
   */
  loadLocationHistoryVendors(jobKey: string): Observable<LocationHistoryResponse> {
    return this.http
      .get<LocationHistoryResponse>(`${this.apiBase}/location-history/${jobKey}`)
      .pipe(
        tap((res) => {
          if (res.status) this._locationHistory$.next(res.data);
        }),
        catchError(this.handleError<LocationHistoryResponse>('loadLocationHistoryVendors')),
      );
  }

  /**
   * Fetches pinned vendors for a job.
   * Uses SP JobVendorGetPinnedVENDORS (returns LocationHistoryVendor shape).
   * GET pinned-vendors/{jobKey}
   */
  loadPinnedVendors(jobKey: string): Observable<LocationHistoryResponse> {
    return this.http
      .get<LocationHistoryResponse>(`${this.apiBase}/pinned-vendors/${jobKey}`)
      .pipe(
        tap((res) => {
          if (res.status) {
            this._pinnedVendors$.next((res.data ?? []).map((row) => this.normalizePinnedVendorRow(row)));
          }
        }),
        catchError(this.handleError<LocationHistoryResponse>('loadPinnedVendors')),
      );
  }

  /**
   * Fetches default vendor list — vendors in the job's trade with no radius filter.
   * Uses SP JobVendorGetVENDORSWithNORadius (returns LocationHistoryVendor shape).
   * GET vendors-no-radius/{jobKey}
   */
  loadVendorsNoRadius(jobKey: string): Observable<LocationHistoryResponse> {
    this._loading$.next(true);
    return this.http
      .get<LocationHistoryResponse>(`${this.apiBase}/vendors-no-radius/${jobKey}`)
      .pipe(
        tap((res) => {
          if (res.status) {
            this._defaultVendors$.next(res.data);
            this._searchResults$.next([]);
          }
        }),
        finalize(() => this._loading$.next(false)),
        catchError(this.handleError<LocationHistoryResponse>('loadVendorsNoRadius')),
      );
  }

  /**
   * Fetches all vendors within a specific radius (miles).
   * Loads into the defaultVendors grid (initial Assign Vendor load uses this with default radius).
   * GET vendors-in-radius/{jobKey}/{radius}
   */
  loadVendorsInRadius(jobKey: string, radius: number): Observable<LocationHistoryResponse> {
    this._loading$.next(true);
    return this.http
      .get<LocationHistoryResponse>(`${this.apiBase}/vendors-in-radius/${jobKey}/${radius}`)
      .pipe(
        tap((res) => {
          if (res.status) {
            this._defaultVendors$.next(res.data);
            this._searchResults$.next([]);
          }
        }),
        finalize(() => this._loading$.next(false)),
        catchError(this.handleError<LocationHistoryResponse>('loadVendorsInRadius')),
      );
  }

  /**
   * Fetches vendors matching the job's trade within a specific radius.
   * GET vendors-trade-radius/{jobKey}/{radius}
   *
   * Results are mapped into the same {@link _defaultVendors$} stream as vendors-in-radius
   * so the UI uses vendorListColumns / vendorListActions (not the browse/search grid).
   */
  loadVendorsTradeRadius(jobKey: string, radius: number): Observable<VendorListResponse> {
    this._loading$.next(true);
    return this.http
      .get<VendorListResponse>(`${this.apiBase}/vendors-trade-radius/${jobKey}/${radius}`)
      .pipe(
        tap((res) => {
          if (res.status) {
            const mapped = (res.data ?? []).map(mapVendorListItemToLocationHistoryVendor);
            this._defaultVendors$.next(mapped);
            this._searchResults$.next([]);
          }
        }),
        finalize(() => this._loading$.next(false)),
        catchError(this.handleError<VendorListResponse>('loadVendorsTradeRadius')),
      );
  }

  /**
   * Fetches vendors from the job's current location history.
   * Loads into the same defaultVendors grid as page load (vendors-no-radius).
   * GET vendors-location-history/{jobKey}
   */
  loadVendorsLocationHistory(jobKey: string): Observable<LocationHistoryResponse> {
    this._loading$.next(true);
    return this.http
      .get<LocationHistoryResponse>(`${this.apiBase}/vendors-location-history/${jobKey}`)
      .pipe(
        tap((res) => {
          if (res.status) {
            this._defaultVendors$.next(res.data);
            this._searchResults$.next([]);
          }
        }),
        finalize(() => this._loading$.next(false)),
        catchError(this.handleError<LocationHistoryResponse>('loadVendorsLocationHistory')),
      );
  }

  /**
   * Fetches all vendors (browse grid).
   * POST all-vendors?jobKey=...
   */
  loadAllVendors(jobKey: string): Observable<VendorListResponse> {
    this._loading$.next(true);
    const params = new HttpParams().set('jobKey', jobKey);
    return this.http.post<VendorListResponse>(`${this.apiBase}/all-vendors`, null, { params }).pipe(
      tap((res) => {
        if (res.status) this._searchResults$.next(res.data);
      }),
      finalize(() => this._loading$.next(false)),
      catchError(this.handleError<VendorListResponse>('loadAllVendors')),
    );
  }

  // ──────────────────────────────────────────────────────────────
  //  Scorecard scores — GET scorecard-scores/{jobKey}
  //  Returns per-vendor score data parsed from the latest successful
  //  scorecard agent log.  Empty array when no run exists yet.
  // ──────────────────────────────────────────────────────────────

  /**
   * Fetches scorecard scores for all vendors in the latest run for this job.
   * Returns a keyed map (vendorKey → VendorScorecardScore) plus agent status.
   * Never throws — returns empty map on API error or no data.
   */
  getScorecardScores(jobKey: string): Observable<VendorScorecardScoresLookup> {
    type ScoreResponse = AssignVendorApiResponse<VendorScorecardScoresApiResult | VendorScorecardScore[]>;
    return this.http
      .get<ScoreResponse>(`${this.apiBase}/scorecard-scores/${jobKey}`)
      .pipe(
        map((res) => this.normalizeScorecardScoresResponse(res)),
        catchError(() => of<VendorScorecardScoresLookup>({ scores: {}, agentStatus: 'pending' })),
      );
  }

  /** Maps API payload to a keyed score map; supports legacy array responses. */
  private normalizeScorecardScoresResponse(
    res: AssignVendorApiResponse<VendorScorecardScoresApiResult | VendorScorecardScore[]>,
  ): VendorScorecardScoresLookup {
    const empty: VendorScorecardScoresLookup = {
      scores: {},
      agentStatus: 'pending',
      scoringRunUid: null,
    };
    if (!res.status || !res.data) return empty;

    const map: Record<string, VendorScorecardScore> = {};
    if (Array.isArray(res.data)) {
      for (const entry of res.data) {
        map[entry.vendorKey.toLowerCase()] = entry;
      }
      return {
        scores: map,
        agentStatus: res.data.length > 0 ? 'ready' : 'pending',
        scoringRunUid: null,
      };
    }

    for (const entry of res.data.scores ?? []) {
      map[entry.vendorKey.toLowerCase()] = entry;
    }
    const status = res.data.agentStatus;
    const agentStatus =
      status === 'ready' || status === 'failed' || status === 'pending' ? status : 'pending';
    const rawUid = res.data.scoringRunUid ?? (res.data as { ScoringRunUid?: string | null }).ScoringRunUid;
    return {
      scores: map,
      agentStatus,
      scoringRunUid: rawUid?.trim() ? rawUid.trim() : null,
    };
  }

  // ──────────────────────────────────────────────────────────────
  //  SRS 23.4 — Cancellation
  //  POST send-cancellation/{jobVendorKey}
  // ──────────────────────────────────────────────────────────────

  /**
   * Sends a cancellation email to a vendor's default contact and
   * creates an audit note on the job.
   */
  sendCancellationEmail(jobVendorKey: string): Observable<StringResponse> {
    this._loading$.next(true);
    return this.http
      .post<StringResponse>(`${this.apiBase}/send-cancellation/${jobVendorKey}`, null)
      .pipe(
        timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
        finalize(() => this._loading$.next(false)),
        catchError(this.handleError<StringResponse>('sendCancellationEmail')),
      );
  }

  // ──────────────────────────────────────────────────────────────
  //  SRS 23.5 — Pin / Unpin
  // ──────────────────────────────────────────────────────────────

  /**
   * Adds a pinned vendor to a job (No/Maybe with notes).
   * POST add-pinned-vendor — body: { jobKey, vendorKey, no, notes }.
   * On success, reloads the pinned vendors list for the job.
   */
  addPinnedVendor(request: AddPinnedVendorRequest): Observable<IntResponse> {
    return this.http.post<IntResponse>(`${this.apiBase}/add-pinned-vendor`, request).pipe(
      tap((res) => {
        if (res.status) this.loadPinnedVendors(request.jobKey).subscribe();
      }),
      catchError(this.handleError<IntResponse>('addPinnedVendor')),
    );
  }

  /**
   * Unpins a single vendor from a job.
   * DELETE unpin/{pinKey}/{jobKey}
   */
  unpinVendor(pinKey: string, jobKey: string): Observable<IntResponse> {
    return this.http.delete<IntResponse>(`${this.apiBase}/unpin/${pinKey}/${jobKey}`).pipe(
      tap((res) => {
        if (res.status) this.loadPinnedVendors(jobKey).subscribe();
      }),
      catchError(this.handleError<IntResponse>('unpinVendor')),
    );
  }

  /**
   * Unpins all vendors from a job.
   * DELETE unpin-all/{jobKey}
   */
  unpinAllVendors(jobKey: string): Observable<IntResponse> {
    return this.http.delete<IntResponse>(`${this.apiBase}/unpin-all/${jobKey}`).pipe(
      tap((res) => {
        if (res.status) this._pinnedVendors$.next([]);
      }),
      catchError(this.handleError<IntResponse>('unpinAllVendors')),
    );
  }

  // ──────────────────────────────────────────────────────────────
  //  SRS 23.6 — Vendor Notes
  //  GET vendor-notes/{vendorKey}  /  POST save-vendor-note
  // ──────────────────────────────────────────────────────────────

  /**
   * Loads all notes for a vendor.
   * GET vendor-notes/{vendorKey}
   */
  loadVendorNotes(vendorKey: string): Observable<AssignVendorApiResponse<VendorNoteItem[]>> {
    return this.http
      .get<AssignVendorApiResponse<VendorNoteItem[]>>(`${this.apiBase}/vendor-notes/${vendorKey}`)
      .pipe(catchError(this.handleError<AssignVendorApiResponse<VendorNoteItem[]>>('loadVendorNotes')));
  }

  /**
   * Creates a new vendor note or updates an existing one.
   */
  saveVendorNote(request: SaveVendorNoteRequest): Observable<IntResponse> {
    this._loading$.next(true);
    return this.http.post<IntResponse>(`${this.apiBase}/save-vendor-note`, request).pipe(
      timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
      finalize(() => this._loading$.next(false)),
      catchError(this.handleError<IntResponse>('saveVendorNote')),
    );
  }

  // ──────────────────────────────────────────────────────────────
  //  Broadcast Configuration
  //  GET broadcast-config/{jobKey}  /  POST save-broadcast-config
  // ──────────────────────────────────────────────────────────────

  /**
   * Loads broadcast configuration for a job (ETA limit, expanded miles, additional trades, etc.).
   * GET broadcast-config/{jobKey}
   *
   * Returns job-level saved values when present, plus system defaults:
   * - defaultEtaLimit / defaultEtaLimitUnit — ReminderEmailTimeDef
   * - defaultBroadcastRadiusMiles — BroadcastRadiusOfVendor (Pkey = 1)
   */
  getBroadcastConfig(jobKey: string): Observable<AssignVendorApiResponse<BroadcastConfigDto>> {
    return this.http
      .get<AssignVendorApiResponse<BroadcastConfigDto>>(`${this.apiBase}/broadcast-config/${jobKey}`)
      .pipe(catchError(this.handleError<AssignVendorApiResponse<BroadcastConfigDto>>('getBroadcastConfig')));
  }

  /**
   * Saves broadcast configuration to Job table and JobAdditionalTrade rows.
   * POST save-broadcast-config
   */
  saveBroadcastConfig(request: SaveBroadcastConfigRequest): Observable<StringResponse> {
    return this.http
      .post<StringResponse>(`${this.apiBase}/save-broadcast-config`, request)
      .pipe(catchError(this.handleError<StringResponse>('saveBroadcastConfig')));
  }

  // ──────────────────────────────────────────────────────────────
  //  SRS 23.8 — Utility Endpoints
  // ──────────────────────────────────────────────────────────────

  /**
   * Creates a vendor via the quick-creation modal.
   * POST save-quick-vendor
   */
  saveQuickVendor(request: QuickVendorRequest): Observable<DataReturnResponse> {
    this._loading$.next(true);
    return this.http.post<DataReturnResponse>(`${this.apiBase}/save-quick-vendor`, request).pipe(
      timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
      finalize(() => this._loading$.next(false)),
      catchError(this.handleError<DataReturnResponse>('saveQuickVendor')),
    );
  }

  /**
   * Checks for duplicate vendors by company name, email, or phone.
   * POST check-duplicate-vendor
   */
  checkDuplicateVendor(request: CheckDuplicateVendorRequest): Observable<DataReturnResponse> {
    return this.http
      .post<DataReturnResponse>(`${this.apiBase}/check-duplicate-vendor`, request)
      .pipe(
        timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
        catchError(this.handleError<DataReturnResponse>('checkDuplicateVendor')),
      );
  }

  /**
   * Checks whether temporary files have been uploaded for a job.
   * GET check-uploaded-files/{jobKey}
   */
  checkUploadedFiles(jobKey: string): Observable<IntResponse> {
    return this.http
      .get<IntResponse>(`${this.apiBase}/check-uploaded-files/${jobKey}`)
      .pipe(catchError(this.handleError<IntResponse>('checkUploadedFiles')));
  }

  /**
   * Removes all temporarily uploaded files for a job.
   * DELETE remove-uploaded-files/{jobKey}
   */
  removeUploadedFiles(jobKey: string): Observable<StringResponse> {
    return this.http
      .delete<StringResponse>(`${this.apiBase}/remove-uploaded-files/${jobKey}`)
      .pipe(catchError(this.handleError<StringResponse>('removeUploadedFiles')));
  }

  /**
   * Returns all active (non-DNU) vendors for the vendor-selection dropdown, excluding vendors already assigned to the job.
   * GET dropdown/active-vendors/{jobKey}
   */
  getActiveVendorsDropdown(jobKey: string): Observable<DropdownResponse> {
    return this.http
      .get<DropdownResponse>(`${this.apiBase}/dropdown/active-vendors/${jobKey}`)
      .pipe(
        tap((res) => {
          if (res.status) this._vendorDropdown$.next(res.data);
        }),
        catchError(this.handleError<DropdownResponse>('getActiveVendorsDropdown')),
      );
  }

  /**
   * Fetches contacts for a specific vendor.
   * GET vendor-contact-list/{vendorKey}
   */
  getVendorContacts(vendorKey: string): Observable<ContactDropdownResponse> {
    this._contactDropdown$.next([]);
    return this.http
      .get<ContactDropdownResponse>(`${this.apiBase}/vendor-contact-list/${vendorKey}`)
      .pipe(
        tap((res) => {
          if (res.status) this._contactDropdown$.next(res.data);
        }),
        catchError(this.handleError<ContactDropdownResponse>('getVendorContacts')),
      );
  }

  /**
   * Fetches service charge, distance, and laborKey for a vendor on a job.
   * GET service-charge?jobKey=...&vendorKey=...&tradeKey=...&customerKey=...&jobTypeKey=...
   */
  getServiceCharge(
    jobKey: string,
    vendorKey: string,
    tradeKey: string,
    customerKey?: string | null,
    jobTypeKey?: string | null,
  ): Observable<ServiceChargeResponse> {
    let params = new HttpParams()
      .set('jobKey', jobKey)
      .set('vendorKey', vendorKey)
      .set('tradeKey', tradeKey);
    if (customerKey) params = params.set('customerKey', customerKey);
    if (jobTypeKey) params = params.set('jobTypeKey', jobTypeKey);

    return this.http
      .get<ServiceChargeResponse>(`${this.apiBase}/service-charge`, { params })
      .pipe(catchError(this.handleError<ServiceChargeResponse>('getServiceCharge')));
  }

  /**
   * Fetches vendor rate breakdown.
   * GET vendor-rates/{vendorKey}
   */
  getVendorRates(vendorKey: string): Observable<VendorRatesResponse> {
    return this.http
      .get<VendorRatesResponse>(`${this.apiBase}/vendor-rates/${vendorKey}`)
      .pipe(catchError(this.handleError<VendorRatesResponse>('getVendorRates')));
  }

  /**
   * Fetches the registered vendor packet for display in a popup.
   * GET registered-vendor-packet/{vendorKey}
   */
  getRegisteredVendorPacket(vendorKey: string): Observable<RegisteredVendorPacketResponse> {
    return this.http
      .get<RegisteredVendorPacketResponse>(`${this.apiBase}/registered-vendor-packet/${vendorKey}`)
      .pipe(catchError(this.handleError<RegisteredVendorPacketResponse>('getRegisteredVendorPacket')));
  }

  /**
   * Fetches the trade dropdown list from SystemSetupData/get-trades.
   * Returns raw array (not wrapped in ApiResponse).
   */
  getTradeDropdown(): Observable<VendorDropdownOption[]> {
    return this.http
      .get<AssignVendorApiResponse<VendorDropdownOption[]>>(
        `${environment.apiBaseUrl}/RFISystemData/SystemSetupData/get-trades`,
      )
      .pipe(
        map((res) => res.data ?? []),
        tap((trades) => this._tradeDropdown$.next(trades)),
        catchError((err) => {
          console.error('getTradeDropdown failed:', err);
          return of([] as VendorDropdownOption[]);
        }),
      );
  }

  /**
   * Fetches DocumentType dropdown filtered by DocumentForId
   * (1 = Job File, 4 = Location, 5 = Vendor, etc.).
   * Mirrors legacy MgtJobFile DocumentTypeKey dropdown.
   */
  getDocumentTypes(documentForId: number): Observable<VendorDropdownOption[]> {
    return this.http
      .get<AssignVendorApiResponse<VendorDropdownOption[]> | VendorDropdownOption[]>(
        `${environment.apiBaseUrl}/RFISystemData/SystemSetupData/get-document-types/${documentForId}`,
      )
      .pipe(
        map((res) => (Array.isArray(res) ? res : (res?.data ?? []))),
        catchError((err) => {
          console.error('getDocumentTypes failed:', err);
          return of([] as VendorDropdownOption[]);
        }),
      );
  }

  /**
   * Fetches the state dropdown list from SystemSetupData/FillStateList.
   * Returns raw array of { text, value(int) }.
   */
  getStateDropdown(): Observable<IntDropdownOption[]> {
    return this.http
      .get<AssignVendorApiResponse<IntDropdownOption[]>>(
        `${environment.apiBaseUrl}/RFISystemData/SystemSetupData/FillStateList`,
      )
      .pipe(
        map((res) => res.data ?? []),
        tap((states) => this._stateDropdown$.next(states)),
        catchError((err) => {
          console.error('getStateDropdown failed:', err);
          return of([] as IntDropdownOption[]);
        }),
      );
  }

  /**
   * Fetches the city dropdown list for a given state.
   * Cascading: called when the user selects a state.
   * GET SystemSetupData/FillCityList/{stateKey}
   */
  getCityDropdown(stateKey: number): Observable<IntDropdownOption[]> {
    this._cityDropdown$.next([]);
    return this.http
      .get<AssignVendorApiResponse<IntDropdownOption[]>>(
        `${environment.apiBaseUrl}/RFISystemData/SystemSetupData/FillCityList/${stateKey}`,
      )
      .pipe(
        map((res) => res.data ?? []),
        tap((cities) => this._cityDropdown$.next(cities)),
        catchError((err) => {
          console.error('getCityDropdown failed:', err);
          return of([] as IntDropdownOption[]);
        }),
      );
  }

  // ──────────────────────────────────────────────────────────────
  //  Grid Refresh Helper
  // ──────────────────────────────────────────────────────────────

  /**
   * Refreshes all grids after a mutation (assign, unassign, pin, etc.).
   * Components that subscribe to the BehaviorSubjects will receive
   * updated data automatically.
   */
  refreshAllGrids(jobKey: string, _locationKey?: string): void {
    this.loadAssignedVendors(jobKey).subscribe();
    this.loadLocationHistoryVendors(jobKey).subscribe();
    this.loadPinnedVendors(jobKey).subscribe();
    this.loadVendorsNoRadius(jobKey).subscribe();
  }

  // ──────────────────────────────────────────────────────────────
  //  Send & Select W/O — New Service Methods
  // ──────────────────────────────────────────────────────────────

  /** GET check-existing-vendor/{jobKey} — returns 1 if any active vendor exists, 0 otherwise */
  checkForExistingVendor(jobKey: string): Observable<IntResponse> {
    return this.http
      .get<IntResponse>(`${this.apiBase}/check-existing-vendor/${jobKey}`)
      .pipe(catchError(this.handleError<IntResponse>('checkForExistingVendor')));
  }

  /** GET check-same-vendor?jobKey=&vendorKey= — returns 1 if same vendor already assigned */
  checkForSameVendor(jobKey: string, vendorKey: string): Observable<IntResponse> {
    const params = new HttpParams().set('jobKey', jobKey).set('vendorKey', vendorKey);
    return this.http
      .get<IntResponse>(`${this.apiBase}/check-same-vendor`, { params })
      .pipe(catchError(this.handleError<IntResponse>('checkForSameVendor')));
  }

  /** GET check-primary-vendor?jobKey=&locationKey=&tradeKey= — returns DataReturn with flag/message */
  checkForPrimaryVendor(jobKey: string, locationKey: string, tradeKey: string): Observable<DataReturnResponse> {
    const params = new HttpParams()
      .set('jobKey', jobKey)
      .set('locationKey', locationKey)
      .set('tradeKey', tradeKey);
    return this.http
      .get<DataReturnResponse>(`${this.apiBase}/check-primary-vendor`, { params })
      .pipe(catchError(this.handleError<DataReturnResponse>('checkForPrimaryVendor')));
  }

  /** GET check-vendor-trade?jobKey=&vendorKey=&tradeKey= — returns 1 if vendor has the trade */
  checkVendorTrade(jobKey: string, vendorKey: string, tradeKey: string): Observable<IntResponse> {
    const params = new HttpParams()
      .set('jobKey', jobKey)
      .set('vendorKey', vendorKey)
      .set('tradeKey', tradeKey);
    return this.http
      .get<IntResponse>(`${this.apiBase}/check-vendor-trade`, { params })
      .pipe(catchError(this.handleError<IntResponse>('checkVendorTrade')));
  }

  /** POST add-trade-to-vendor?vendorKey=&tradeKey= — adds trade to vendor, returns DataReturn */
  addTradeToVendor(vendorKey: string, tradeKey: string): Observable<DataReturnResponse> {
    const params = new HttpParams().set('vendorKey', vendorKey).set('tradeKey', tradeKey);
    return this.http
      .post<DataReturnResponse>(`${this.apiBase}/add-trade-to-vendor`, null, { params })
      .pipe(catchError(this.handleError<DataReturnResponse>('addTradeToVendor')));
  }

  /** GET vendor-dne?jobKey=&vendorKey= — returns the DNE decimal value */
  getVendorDNE(jobKey: string, vendorKey: string): Observable<AssignVendorApiResponse<number | null>> {
    const params = new HttpParams().set('jobKey', jobKey).set('vendorKey', vendorKey);
    return this.http
      .get<AssignVendorApiResponse<number | null>>(`${this.apiBase}/vendor-dne`, { params })
      .pipe(catchError(this.handleError<AssignVendorApiResponse<number | null>>('getVendorDNE')));
  }

  /** POST save-vendor-to-job — saves vendor to job (no email) */
  saveVendorToJob(request: SaveVendorToJobRequest): Observable<DataReturnResponse> {
    return this.http
      .post<DataReturnResponse>(`${this.apiBase}/save-vendor-to-job`, request)
      .pipe(
        timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
        catchError(this.handleError<DataReturnResponse>('saveVendorToJob')),
      );
  }

  /**
   * POST save-vendor-to-job-with-files — saves vendor with attachments.
   * Dropzone files are sent as multipart (payload JSON + files); checkbox job files use checkedFileList in payload.
   */
  saveVendorToJobWithFiles(
    request: SaveVendorToJobWithFilesRequest,
    dropzoneFiles: File[] = [],
  ): Observable<DataReturnResponse> {
    const hasDropzone = dropzoneFiles.length > 0;
    const hasCheckedJobFiles = (request.checkedFileList?.length ?? 0) > 0;
    const hasLocationFiles = (request.locationFile?.length ?? 0) > 0;
    const useMultipart = hasDropzone || hasCheckedJobFiles || hasLocationFiles;

    if (!useMultipart) {
      return this.http
        .post<DataReturnResponse>(`${this.apiBase}/save-vendor-to-job-with-files`, request)
        .pipe(
          timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
          catchError(this.handleError<DataReturnResponse>('saveVendorToJobWithFiles')),
        );
    }

    const formData = new FormData();
    formData.append('payload', JSON.stringify(request));
    dropzoneFiles.forEach(f => formData.append('files', f, f.name));

    return this.http
      .post<DataReturnResponse>(`${this.apiBase}/save-vendor-to-job-with-files`, formData)
      .pipe(
        timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
        catchError(this.handleError<DataReturnResponse>('saveVendorToJobWithFiles')),
      );
  }

  /** @deprecated Dropzone files are sent with save-vendor-to-job-with-files multipart. */
  uploadWorkOrderFiles(jobKey: string, files: File[]): Observable<IntResponse> {
    const formData = new FormData();
    files.forEach(f => formData.append('files', f, f.name));
    return this.http.post<IntResponse>(`${this.apiBase}/upload-files/${jobKey}`, formData).pipe(
      map(res => {
        if (!res?.status) {
          throw new Error(res?.message ?? 'Work order file upload failed.');
        }
        return res;
      }),
      catchError(this.handleError<IntResponse>('uploadWorkOrderFiles')),
    );
  }

  /** POST remove-file?jobKey=&fileName= — removes a single uploaded file */
  removeFile(jobKey: string, fileName: string): Observable<StringResponse> {
    const params = new HttpParams().set('jobKey', jobKey).set('fileName', fileName);
    return this.http
      .post<StringResponse>(`${this.apiBase}/remove-file`, null, { params })
      .pipe(catchError(this.handleError<StringResponse>('removeFile')));
  }

  /** GET convert-eta-to-vendor-date?jobKey=&scheduleDate= — converts ETA to vendor timezone */
  convertETAToVendorDate(jobKey: string, scheduleDate: string): Observable<StringResponse> {
    const params = new HttpParams().set('jobKey', jobKey).set('scheduleDate', scheduleDate);
    return this.http
      .get<StringResponse>(`${this.apiBase}/convert-eta-to-vendor-date`, { params })
      .pipe(catchError(this.handleError<StringResponse>('convertETAToVendorDate')));
  }

  /** POST update-vendor-schedule-dates — saves Schedule Date / Return Schedule for an assigned vendor */
  updateVendorScheduleDates(request: UpdateVendorScheduleDatesRequest): Observable<AssignVendorApiResponse<SetEtaEmailPromptResponse>> {
    return this.http
      .post<AssignVendorApiResponse<SetEtaEmailPromptResponse>>(`${this.apiBase}/update-vendor-schedule-dates`, request)
      .pipe(
        timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
        catchError(this.handleError<AssignVendorApiResponse<SetEtaEmailPromptResponse>>('updateVendorScheduleDates')),
      );
  }

  /**
   * Sends ETA set notification email to vendor contacts.
   * POST send-eta-set-notification
   */
  sendEtaSetNotification(request: SendEtaSetEmailRequest): Observable<AssignVendorApiResponse<string>> {
    return this.http
      .post<AssignVendorApiResponse<string>>(`${this.apiBase}/send-eta-set-notification`, request)
      .pipe(
        timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
        catchError(this.handleError<AssignVendorApiResponse<string>>('sendEtaSetNotification')),
      );
  }

  /** GET SystemSetupData/get-job-statuses — loads job status dropdown options */
  getJobStatusList(): Observable<JobStatusOption[]> {
    return this.http
      .get<AssignVendorApiResponse<JobStatusOption[]>>(`${environment.apiBaseUrl}/RFISystemData/SystemSetupData/get-job-statuses`)
      .pipe(
        map((res) => (Array.isArray(res.data) ? res.data : [])),
        tap((list) => this._jobStatusList$.next(list)),
        catchError((err) => {
          console.error('getJobStatusList failed:', err);
          return of([] as JobStatusOption[]);
        }),
      );
  }

  /** POST update-vendor-job-status — updates job status for an assigned vendor row */
  updateVendorJobStatus(jobVendorKey: string, jobStatusKey: string): Observable<DataReturnResponse> {
    return this.http
      .post<DataReturnResponse>(`${this.apiBase}/update-vendor-job-status`, { jobVendorKey, jobStatusKey })
      .pipe(
        timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
        catchError(this.handleError<DataReturnResponse>('updateVendorJobStatus')),
      );
  }

  /**
   * POST submit-recall-review — moves a job to Recall from the Accounting flow.
   * Mirrors legacy MgtJobController.SubmitRecallReview (vendor's fault = true) and
   * MgtJobController.UpdateJobPriority (vendor's fault = false).
   * Callers should still invoke updateVendorJobStatus afterwards to move the status
   * (typically to Pending Return ETA).
   */
  submitRecallReview(payload: {
    jobKey: string;
    isVendorFault: boolean;
    vendorKey?: string | null;
    remarks?: string | null;
  }): Observable<DataReturnResponse> {
    return this.http
      .post<DataReturnResponse>(`${this.apiBase}/submit-recall-review`, payload)
      .pipe(
        timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
        catchError(this.handleError<DataReturnResponse>('submitRecallReview')),
      );
  }

  /** GET get-customer-requestor-options/{jobKey} — returns CustomerContact + LocationContact options */
  getCustomerRequestorOptions(jobKey: string): Observable<CustomerRequestorOption[]> {
    return this.http
      .get<AssignVendorApiResponse<CustomerRequestorOption[]>>(
        `${this.apiBase}/get-customer-requestor-options/${jobKey}`,
      )
      .pipe(
        map((res) => (Array.isArray(res.data) ? res.data : [])),
        catchError((err) => {
          console.error('getCustomerRequestorOptions failed:', err);
          return of([] as CustomerRequestorOption[]);
        }),
      );
  }

  /** POST update-job-trade — saves Job.TradeKey */
  updateJobTrade(jobKey: string, tradeKey: string | null): Observable<DataReturnResponse> {
    return this.http
      .post<DataReturnResponse>(`${this.apiBase}/update-job-trade`, {
        jobKey,
        tradeKey,
      })
      .pipe(
        timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
        catchError(this.handleError<DataReturnResponse>('updateJobTrade')),
      );
  }

  /** POST update-job-customer-requestor — saves Job.CustomerRequestorKey */
  updateJobCustomerRequestor(jobKey: string, customerRequestorKey: string | null): Observable<DataReturnResponse> {
    return this.http
      .post<DataReturnResponse>(`${this.apiBase}/update-job-customer-requestor`, {
        jobKey,
        customerRequestorKey,
      })
      .pipe(
        timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
        catchError(this.handleError<DataReturnResponse>('updateJobCustomerRequestor')),
      );
  }

  /** GET get-account-manager-options — StaffList dropdown for Account Manager */
  getAccountManagerOptions(): Observable<AccountManagerOption[]> {
    return this.http
      .get<AccountManagerOption[] | AssignVendorApiResponse<AccountManagerOption[]>>(
        `${this.apiBase}/get-account-manager-options`,
      )
      .pipe(
        map((res) => this.extractGuidOptionList(res)),
        catchError((err) => {
          console.error('getAccountManagerOptions failed:', err);
          return of([] as AccountManagerOption[]);
        }),
      );
  }

  /** GET get-job-priority-options — JobType dropdown for Job Priority (legacy Edit Job) */
  getJobPriorityOptions(): Observable<JobPriorityOption[]> {
    return this.http
      .get<JobPriorityOption[] | AssignVendorApiResponse<JobPriorityOption[]>>(
        `${this.apiBase}/get-job-priority-options`,
      )
      .pipe(
        map((res) => this.extractGuidOptionList(res)),
        catchError((err) => {
          console.error('getJobPriorityOptions failed:', err);
          return of([] as JobPriorityOption[]);
        }),
      );
  }

  /** POST update-job-priority — saves Job.JobTypeKey */
  updateJobJobType(jobKey: string, jobTypeKey: string): Observable<DataReturnResponse> {
    return this.http
      .post<DataReturnResponse>(`${this.apiBase}/update-job-priority`, {
        jobKey,
        jobTypeKey,
      })
      .pipe(
        timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
        catchError(this.handleError<DataReturnResponse>('updateJobJobType')),
      );
  }

  /** GET job-priority-vendor-check/{jobKey} — active vendors / work order sent guard */
  getJobPriorityVendorCheck(jobKey: string): Observable<JobPriorityVendorCheck> {
    return this.http
      .get<JobPriorityVendorCheck | AssignVendorApiResponse<JobPriorityVendorCheck>>(
        `${this.apiBase}/job-priority-vendor-check/${jobKey}`,
      )
      .pipe(
        map((res) => this.normalizeJobPriorityVendorCheck(this.unwrapJobPriorityVendorCheck(res))),
        catchError((err) => {
          console.error('getJobPriorityVendorCheck failed:', err);
          return of({
            hasVendors: false,
            vendorCount: 0,
            workOrderSent: false,
            canChangePriority: true,
            blockMessage: null,
          } as JobPriorityVendorCheck);
        }),
      );
  }

  /** GET job-priority-change-preview — DNE / response-time confirmation modal */
  getJobPriorityChangePreview(
    jobKey: string,
    oldJobTypeKey: string,
    newJobTypeKey: string,
    customerKey?: string | null,
  ): Observable<JobPriorityChangePreview> {
    let params = new HttpParams()
      .set('jobKey', jobKey)
      .set('oldJobTypeKey', oldJobTypeKey)
      .set('newJobTypeKey', newJobTypeKey);
    if (customerKey?.trim()) {
      params = params.set('customerKey', customerKey.trim());
    }
    return this.http
      .get<JobPriorityChangePreview | AssignVendorApiResponse<JobPriorityChangePreview>>(
        `${this.apiBase}/job-priority-change-preview`,
        { params },
      )
      .pipe(
        map((raw) => this.normalizeJobPriorityChangePreview(this.unwrapJobPriorityChangePreview(raw))),
        catchError((err) => {
          console.error('getJobPriorityChangePreview failed:', err);
          return of({
            success: false,
            message: 'Unable to load priority change details.',
            hasVendors: false,
            vendorCount: 0,
            bulletPoints: [],
            oldPriorityName: null,
            newPriorityName: null,
            oldCustomerDne: 0,
            newCustomerDne: 0,
            oldVendorDne: 0,
            newVendorDne: 0,
            oldResponseTime: null,
            newResponseTime: null,
            customerDneChanged: false,
            vendorDneChanged: false,
          } as JobPriorityChangePreview);
        }),
      );
  }

  /** POST update-job-account-manager — saves Job.AccountManagerKey */
  updateJobAccountManager(jobKey: string, accountManagerKey: string | null): Observable<DataReturnResponse> {
    return this.http
      .post<DataReturnResponse>(`${this.apiBase}/update-job-account-manager`, {
        jobKey,
        accountManagerKey,
      })
      .pipe(
        timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
        catchError(this.handleError<DataReturnResponse>('updateJobAccountManager')),
      );
  }

  /** GET vendor-contact-list/{vendorKey} — returns all contacts for a vendor (with email) */
  getVendorContactList(vendorKey: string): Observable<VendorContactOption[]> {
    return this.http
      .get<AssignVendorApiResponse<VendorContactOption[]>>(`${this.apiBase}/vendor-contact-list/${vendorKey}`)
      .pipe(
        map((res) => (Array.isArray(res.data) ? res.data : [])),
        catchError((err) => {
          console.error('getVendorContactList failed:', err);
          return of([] as VendorContactOption[]);
        }),
      );
  }

  /** POST send-vendor-login-email — sends the vendor login creation email */
  sendVendorLoginEmail(request: SendVendorLoginEmailRequest): Observable<DataReturnResponse> {
    return this.http
      .post<DataReturnResponse>(`${this.apiBase}/send-vendor-login-email`, request)
      .pipe(
        timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
        catchError(this.handleError<DataReturnResponse>('sendVendorLoginEmail')),
      );
  }

  /** POST update-service-request-instructions — saves all 4 SRI text fields */
  updateServiceRequestInstructions(request: UpdateServiceRequestInstructionsRequest): Observable<DataReturnResponse> {
    return this.http
      .post<DataReturnResponse>(`${this.apiBase}/update-service-request-instructions`, request)
      .pipe(
        timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
        catchError(this.handleError<DataReturnResponse>('updateServiceRequestInstructions')),
      );
  }

  /** POST update-nte — saves the four NTE fields on the Job record */
  updateNte(request: UpdateNteRequest): Observable<DataReturnResponse> {
    return this.http
      .post<DataReturnResponse>(`${this.apiBase}/update-nte`, request)
      .pipe(
        timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
        catchError(this.handleError<DataReturnResponse>('updateNte')),
      );
  }

  /** GET vendors-for-broadcast — returns vendors eligible for broadcast for the job */
  getVendorsForBroadcast(jobKey: string, radiusMiles: number): Observable<AssignVendorApiResponse<BroadcastVendorOptionDto[]>> {
    return this.http
      .get<AssignVendorApiResponse<BroadcastVendorOptionDto[]>>(
        `${this.apiBase}/vendors-for-broadcast/${jobKey}/${radiusMiles}`
      )
      .pipe(
        timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
        catchError(this.handleError<AssignVendorApiResponse<BroadcastVendorOptionDto[]>>('getVendorsForBroadcast')),
      );
  }

  /** POST broadcast-to-vendors — sends broadcast work orders to selected vendors */
  broadcastToVendors(request: BroadcastToVendorsRequest): Observable<DataReturnResponse> {
    return this.http
      .post<DataReturnResponse>(`${this.apiBase}/broadcast-to-vendors`, request)
      .pipe(
        timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
        catchError(this.handleError<DataReturnResponse>('broadcastToVendors')),
      );
  }

  /**
   * POST /api/v1/files/admin-save-job-file — admin-side upload that persists a file
   * to the JobFile table + blob storage. Mirrors the legacy MgtJobFile save flow.
   */
  adminSaveJobFile(
    jobKey: string,
    documentTypeKey: string | null,
    comment: string | null,
    files: File[],
  ): Observable<AssignVendorApiResponse<number>> {
    const formData = new FormData();
    formData.append('JobKey', jobKey);
    if (documentTypeKey) formData.append('DocumentTypeKey', documentTypeKey);
    if (comment) formData.append('Comment', comment);
    files.forEach((f) => formData.append('files', f, f.name));

    return this.http
      .post<AssignVendorApiResponse<number>>(
        `${environment.apiBaseUrl}/api/v1/files/admin-save-job-file`,
        formData,
      )
      .pipe(
        timeout(AssignVendorService.EXTENDED_TIMEOUT_MS),
        catchError(this.handleError<AssignVendorApiResponse<number>>('adminSaveJobFile')),
      );
  }

  /**
   * GET /api/v1/files/vendor-papers/{jobKey} — all vendor-uploaded papers under a job
   * (JobBillVendorUploads, every document type). Mirrors the legacy "Vendor Papers Under
   * this Job" table (MgtVendorBill.LoadAllFiles). Returns a secure blob link per file.
   */
  getVendorPapersForJob(jobKey: string): Observable<VendorPaperFile[]> {
    return this.http
      .get<AssignVendorApiResponse<VendorPaperFile[]>>(
        `${environment.apiBaseUrl}/api/v1/files/vendor-papers/${jobKey}`,
      )
      .pipe(
        map((res) => res?.data ?? []),
        catchError((err) => {
          console.error('getVendorPapersForJob failed:', err);
          return of([] as VendorPaperFile[]);
        }),
      );
  }

  /**
   * GET /api/v1/files/customer-estimates-for-approval/{jobKey} — unapproved customer
   * estimates for the "Customer Additional Approval" upload flow. Mirrors legacy
   * CheckIfCustomerEstimateExisty + GetEstimateListForApproving.
   */
  getCustomerEstimatesForApproval(
    jobKey: string,
  ): Observable<AssignVendorApiResponse<CustomerEstimatesForApprovalResult>> {
    return this.http
      .get<AssignVendorApiResponse<CustomerEstimatesForApprovalResult>>(
        `${environment.apiBaseUrl}/api/v1/files/customer-estimates-for-approval/${jobKey}`,
      )
      .pipe(
        catchError(
          this.handleError<AssignVendorApiResponse<CustomerEstimatesForApprovalResult>>(
            'getCustomerEstimatesForApproval',
          ),
        ),
      );
  }

  /**
   * GET /api/v1/files/vendor-contacts-for-estimate/{jobKey} — the job's assigned vendors and
   * their contacts for the "Vendor Estimates" / Send Estimate to Vendor modal (RBR-483), which
   * opens after a vendor-estimate file is uploaded. Mirrors legacy GetDefaultVendorContactList.
   */
  getVendorContactsForEstimate(
    jobKey: string,
  ): Observable<AssignVendorApiResponse<VendorContactsForEstimateResult>> {
    return this.http
      .get<AssignVendorApiResponse<VendorContactsForEstimateResult>>(
        `${environment.apiBaseUrl}/api/v1/files/vendor-contacts-for-estimate/${jobKey}`,
      )
      .pipe(
        catchError(
          this.handleError<AssignVendorApiResponse<VendorContactsForEstimateResult>>(
            'getVendorContactsForEstimate',
          ),
        ),
      );
  }

  /**
   * POST /api/v1/files/change-job-status-by-trigger-bit — changes Job.JobStatusKey by
   * looking up the JobStatus whose TriggerBit matches. Mirrors legacy
   * MgtJobFile/ChangeJobStatus. Used by the Files & Attachments doc-type-driven
   * status prompts (Customer Approval / Vendor Estimate Received).
   */
  changeJobStatusByTriggerBit(
    jobKey: string,
    triggerBit: number,
  ): Observable<AssignVendorApiResponse<{ statusName: string }>> {
    return this.http
      .post<AssignVendorApiResponse<{ statusName: string }>>(
        `${environment.apiBaseUrl}/api/v1/files/change-job-status-by-trigger-bit`,
        { jobKey, triggerBit },
      )
      .pipe(
        catchError(
          this.handleError<AssignVendorApiResponse<{ statusName: string }>>(
            'changeJobStatusByTriggerBit',
          ),
        ),
      );
  }

  /**
   * POST /api/v1/files/change-vendor-status-by-trigger-bit — changes a single vendor's status by
   * TriggerBit (RBR-486). Always updates that JobVendor's JobStatusKey; additionally updates
   * Job.JobStatusKey only when the JobVendor is the Default vendor. Used by the Send Estimate to
   * Vendor modal's Create-Estimate and Send-Email buttons (moves the clicked vendor to
   * "Need Vendor Estimate", TriggerBit 8) without disturbing other vendors on the job.
   */
  changeVendorStatusByTriggerBit(
    jobVendorKey: string,
    triggerBit: number,
  ): Observable<AssignVendorApiResponse<{ statusName: string }>> {
    return this.http
      .post<AssignVendorApiResponse<{ statusName: string }>>(
        `${environment.apiBaseUrl}/api/v1/files/change-vendor-status-by-trigger-bit`,
        { jobVendorKey, triggerBit },
      )
      .pipe(
        catchError(
          this.handleError<AssignVendorApiResponse<{ statusName: string }>>(
            'changeVendorStatusByTriggerBit',
          ),
        ),
      );
  }

  /** DELETE /api/v1/files/admin-delete-job-file/{fileKey} — admin-side soft-delete of a JobFile row. */
  adminDeleteJobFile(fileKey: string): Observable<AssignVendorApiResponse<string>> {
    return this.http
      .delete<AssignVendorApiResponse<string>>(
        `${environment.apiBaseUrl}/api/v1/files/admin-delete-job-file/${fileKey}`,
      )
      .pipe(catchError(this.handleError<AssignVendorApiResponse<string>>('adminDeleteJobFile')));
  }

  /** GET job-files-for-broadcast/{jobKey} — files available to attach when broadcasting */
  getJobFilesForBroadcast(jobKey: string): Observable<AssignVendorApiResponse<BroadcastJobFileDto[]>> {
    return this.http
      .get<AssignVendorApiResponse<BroadcastJobFileDto[]>>(`${this.apiBase}/job-files-for-broadcast/${jobKey}`)
      .pipe(
        timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
        catchError(this.handleError<AssignVendorApiResponse<BroadcastJobFileDto[]>>('getJobFilesForBroadcast')),
      );
  }

  /**
   * GET CustomerProfile/dne/{customerKey} — same DNE values as legacy Edit Customer.
   */
  getCustomerProfileDne(customerKey: string): Observable<CustomerProfileDne> {
    return this.http
      .get<CustomerProfileDne>(`${this.customerProfileApiBase}/dne/${customerKey}`)
      .pipe(
        timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
        catchError((err) => {
          console.error('getCustomerProfileDne failed:', err);
          return of({
            customerKey,
            customerDne: 0,
            vendorDne: 0,
            vendorEmergencyDne: 0,
            emergencyCustomerDne: 0,
          });
        }),
      );
  }

  /** GET customer-locations — returns all locations for a customer (for Duplicate Job picker) */
  getCustomerLocations(customerKey: string): Observable<AssignVendorApiResponse<CustomerLocationOptionDto[]>> {
    return this.http
      .get<AssignVendorApiResponse<CustomerLocationOptionDto[]>>(
        `${this.apiBase}/customer-locations/${customerKey}`
      )
      .pipe(
        timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
        catchError(this.handleError<AssignVendorApiResponse<CustomerLocationOptionDto[]>>('getCustomerLocations')),
      );
  }

  /** POST duplicate-job — duplicates a job to a different location */
  duplicateJob(request: DuplicateJobRequest): Observable<AssignVendorApiResponse<DuplicateJobResultDto>> {
    return this.http
      .post<AssignVendorApiResponse<DuplicateJobResultDto>>(`${this.apiBase}/duplicate-job`, request)
      .pipe(
        timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
        catchError(this.handleError<AssignVendorApiResponse<DuplicateJobResultDto>>('duplicateJob')),
      );
  }

  /** POST update-vendor-dne — saves VendorDne + RevVendorDne on JobVendor and its latest work order */
  updateVendorDne(jobVendorKey: string, vendorDne: number): Observable<DataReturnResponse> {
    return this.http
      .post<DataReturnResponse>(`${this.apiBase}/update-vendor-dne`, { jobVendorKey, vendorDne })
      .pipe(
        timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
        catchError(this.handleError<DataReturnResponse>('updateVendorDne')),
      );
  }

  /** POST send-work-order-email/{jobVendorKey} — sends work order email (called after save) */
  sendWorkOrderEmail(jobVendorKey: string, request: SendWorkOrderEmailRequest): Observable<DataReturnResponse> {
    return this.http
      .post<DataReturnResponse>(`${this.apiBase}/send-work-order-email/${jobVendorKey}`, request)
      .pipe(
        timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
        catchError(this.handleError<DataReturnResponse>('sendWorkOrderEmail')),
      );
  }

  /** POST send-to-primary-vendor/{jobKey} — redirects to primary vendor assignment */
  sendToPrimaryVendor(jobKey: string): Observable<DataReturnResponse> {
    return this.http
      .post<DataReturnResponse>(`${this.apiBase}/send-to-primary-vendor/${jobKey}`, null)
      .pipe(catchError(this.handleError<DataReturnResponse>('sendToPrimaryVendor')));
  }

  /**
   * POST check-if-consolidator — Job Ops {@code CheckIfVendorIs}.
   * {@code data} true when consolidator rules apply (message explains); false to proceed without precheck modal.
   */
  checkIfVendorIsConsolidator(
    jobKey: string,
    vendorKey: string,
  ): Observable<AssignVendorApiResponse<boolean>> {
    const body = { jobKey, vendorKey };
    return this.http
      .post<AssignVendorApiResponse<boolean>>(`${this.apiBase}/check-if-consolidator`, body)
      .pipe(catchError(this.handleError<AssignVendorApiResponse<boolean>>('checkIfVendorIsConsolidator')));
  }

  /**
   * POST send-mail-qc-manager-consolidator-dispatch — notify QC manager after consolidator flow completes successfully.
   */
  sendMailQcManagerConsolidatorDispatch(
    jobKey: string,
    vendorKey: string,
  ): Observable<AssignVendorApiResponse<string>> {
    const body = { jobKey, vendorKey };
    return this.http
      .post<AssignVendorApiResponse<string>>(`${this.apiBase}/send-mail-qc-manager-consolidator-dispatch`, body)
      .pipe(
        timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
        catchError(this.handleError<AssignVendorApiResponse<string>>('sendMailQcManagerConsolidatorDispatch')),
      );
  }

  /** GET job-files/{jobKey} — returns list of job files for checkboxes */
  getJobFiles(jobKey: string): Observable<JobFileListResponse> {
    return this.http
      .get<JobFileListResponse>(`${this.apiBase}/job-files/${jobKey}`)
      .pipe(catchError(this.handleError<JobFileListResponse>('getJobFiles')));
  }

  /** GET location-files/{jobKey} — returns list of location files for checkboxes */
  getLocationFiles(jobKey: string): Observable<LocationFileListResponse> {
    return this.http
      .get<LocationFileListResponse>(`${this.apiBase}/location-files/${jobKey}`)
      .pipe(catchError(this.handleError<LocationFileListResponse>('getLocationFiles')));
  }

  /** GET ManageAccountManagerSurvey/items — survey factor checkboxes for work-order flow */
  getAccountManagerSurveyItems(): Observable<AccountManagerSurveyItemsResponse> {
    return this.http
      .get<AccountManagerSurveyItemsResponse>(`${this.accountManagerSurveyApiBase}/items`)
      .pipe(catchError(this.handleError<AccountManagerSurveyItemsResponse>('getAccountManagerSurveyItems')));
  }

  /** POST ManageAccountManagerSurvey/work-order-selection — save survey before sending W/O */
  saveWorkOrderVendorSurvey(
    request: AccountManagerSurveyWorkOrderSaveRequest,
  ): Observable<AccountManagerSurveySaveResponse> {
    return this.http
      .post<AccountManagerSurveySaveResponse>(`${this.accountManagerSurveyApiBase}/work-order-selection`, request)
      .pipe(catchError(this.handleError<AccountManagerSurveySaveResponse>('saveWorkOrderVendorSurvey')));
  }

  /** POST send-bulk-cancellation — sends cancellation emails and unassigns vendors */
  sendBulkCancellation(request: BulkCancellationRequest): Observable<StringResponse> {
    return this.http
      .post<StringResponse>(`${this.apiBase}/send-bulk-cancellation`, request)
      .pipe(
        timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
        catchError(this.handleError<StringResponse>('sendBulkCancellation')),
      );
  }

  /**
   * POST send-bulk-cancellation-with-email — sends cancellation emails to vendors,
   * saves internal and vendor messaging, and logs notes.
   * Matches legacy Admin Portal MgtJobVendorMultipleController.SendBulkCancellation behavior.
   */
  sendBulkCancellationWithEmail(request: BulkCancellationRequest): Observable<StringResponse> {
    return this.http
      .post<StringResponse>(`${this.vendorCancellationApiBase}/send-bulk-cancellation-with-email`, request)
      .pipe(
        timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
        catchError(this.handleError<StringResponse>('sendBulkCancellationWithEmail')),
      );
  }

  /**
   * POST set-vendor-as-default — sets the specified vendor as the default vendor for a job.
   * Replicates legacy Admin Portal SaveVendorAsdefaultToJob behavior.
   */
  setVendorAsDefault(request: SetVendorAsDefaultRequest): Observable<StringResponse> {
    return this.http
      .post<StringResponse>(`${this.vendorCancellationApiBase}/set-vendor-as-default`, request)
      .pipe(
        timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
        catchError(this.handleError<StringResponse>('setVendorAsDefault')),
      );
  }

  /**
   * POST reassign-from-inactive — reassigns a previously unassigned (deleted) vendor back to the job.
   * Replicates legacy Admin Portal AssignFromInactive -> MgtJobVendorMultiple.AssignVendor behavior:
   * - Sets IsDelete = false, DeletedBy = null, DeletedOn = null
   * - Sets IsDefault = true
   * - Updates Job fields from JobVendor (status, schedule dates, DNE values)
   * - Resets vendor highlights/flags
   * - Saves general note
   */
  reassignVendorFromInactive(request: ReassignVendorFromInactiveRequest): Observable<StringResponse> {
    return this.http
      .post<StringResponse>(`${this.vendorCancellationApiBase}/reassign-from-inactive`, request)
      .pipe(
        timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
        catchError(this.handleError<StringResponse>('reassignVendorFromInactive')),
      );
  }

  /** GET check-vendor-assigned?vendorKey=&jobKey= — returns 1 if vendor already assigned */
  checkIfVendorAlreadyAssigned(vendorKey: string, jobKey: string): Observable<IntResponse> {
    const params = new HttpParams().set('vendorKey', vendorKey).set('jobKey', jobKey);
    return this.http
      .get<IntResponse>(`${this.apiBase}/check-vendor-assigned`, { params })
      .pipe(catchError(this.handleError<IntResponse>('checkIfVendorAlreadyAssigned')));
  }

  // ──────────────────────────────────────────────────────────────
  //  Unassign Vendor (RemoveVendorProcess1 replication)
  // ──────────────────────────────────────────────────────────────

  /**
   * Checks if a vendor bill exists for the given JobVendor.
   * GET check-vendor-bill-exist/{jobVendorKey}
   */
  checkIfVendorBillExist(jobVendorKey: string): Observable<AssignVendorApiResponse<VendorBillCheckResult>> {
    return this.http
      .get<AssignVendorApiResponse<VendorBillCheckResult>>(`${this.vendorCancellationApiBase}/check-vendor-bill-exist/${jobVendorKey}`)
      .pipe(catchError(this.handleError<AssignVendorApiResponse<VendorBillCheckResult>>('checkIfVendorBillExist')));
  }

  /**
   * Checks if there are any pending approval estimates for the vendor.
   * GET check-pending-estimate-approval/{jobVendorKey}
   */
  checkIfThereIsAnyPendingApproval(jobVendorKey: string): Observable<AssignVendorApiResponse<PendingApprovalCheckResult>> {
    return this.http
      .get<AssignVendorApiResponse<PendingApprovalCheckResult>>(`${this.vendorCancellationApiBase}/check-pending-estimate-approval/${jobVendorKey}`)
      .pipe(catchError(this.handleError<AssignVendorApiResponse<PendingApprovalCheckResult>>('checkIfThereIsAnyPendingApproval')));
  }

  /**
   * Counts how many active vendors are assigned to the job.
   * GET check-active-vendor-count/{jobKey}
   */
  checkForMoreThan1Vendor(jobKey: string): Observable<AssignVendorApiResponse<VendorCountCheckResult>> {
    return this.http
      .get<AssignVendorApiResponse<VendorCountCheckResult>>(`${this.vendorCancellationApiBase}/check-active-vendor-count/${jobKey}`)
      .pipe(catchError(this.handleError<AssignVendorApiResponse<VendorCountCheckResult>>('checkForMoreThan1Vendor')));
  }

  /**
   * Checks if the specified JobVendor is the default vendor.
   * GET check-is-default-vendor/{jobVendorKey}
   */
  checkIfThisIsTheDefaultVendor(jobVendorKey: string): Observable<AssignVendorApiResponse<DefaultVendorCheckResult>> {
    return this.http
      .get<AssignVendorApiResponse<DefaultVendorCheckResult>>(`${this.vendorCancellationApiBase}/check-is-default-vendor/${jobVendorKey}`)
      .pipe(catchError(this.handleError<AssignVendorApiResponse<DefaultVendorCheckResult>>('checkIfThisIsTheDefaultVendor')));
  }

  /**
   * Gets all vendors on the job except the default vendor (for radio selection).
   * GET get-vendors-except-default/{jobKey}
   */
  getVendorsExceptDefault(jobKey: string): Observable<AssignVendorApiResponse<VendorRadioOption[]>> {
    return this.http
      .get<AssignVendorApiResponse<VendorRadioOption[]>>(`${this.vendorCancellationApiBase}/get-vendors-except-default/${jobKey}`)
      .pipe(catchError(this.handleError<AssignVendorApiResponse<VendorRadioOption[]>>('getVendorsExceptDefault')));
  }

  /**
   * Sets one of the other vendors as default before removing the current default.
   * POST set-other-vendor-default
   * @deprecated Use {@link unassignDefaultVendorAndPromote} instead — this two-call
   * flow (paired with {@link unassignVendor}) risks leaving the job with no default
   * vendor if the second call fails.
   */
  setOtherVendorDefault(request: SetOtherVendorDefaultRequest): Observable<IntResponse> {
    return this.http
      .post<IntResponse>(`${this.vendorCancellationApiBase}/set-other-vendor-default`, request)
      .pipe(catchError(this.handleError<IntResponse>('setOtherVendorDefault')));
  }

  /**
   * Unassigns a vendor from the job without sending email.
   * POST unassign-vendor
   * @deprecated Use {@link unassignDefaultVendorAndPromote} instead when replacing a
   * default vendor with another — see {@link setOtherVendorDefault}.
   */
  unassignVendor(request: UnassignVendorRequest): Observable<StringResponse> {
    return this.http
      .post<StringResponse>(`${this.vendorCancellationApiBase}/unassign-vendor`, request)
      .pipe(catchError(this.handleError<StringResponse>('unassignVendor')));
  }

  /**
   * Atomically promotes one vendor to default and unassigns the current default vendor
   * in a single call. Replaces the {@link setOtherVendorDefault} + {@link unassignVendor}
   * two-call flow.
   * POST unassign-default-vendor-and-promote
   */
  unassignDefaultVendorAndPromote(request: UnassignDefaultVendorAndPromoteRequest): Observable<StringResponse> {
    return this.http
      .post<StringResponse>(`${this.vendorCancellationApiBase}/unassign-default-vendor-and-promote`, request)
      .pipe(catchError(this.handleError<StringResponse>('unassignDefaultVendorAndPromote')));
  }

  /**
   * Unassigns a vendor from the job and sends cancellation email.
   * POST unassign-vendor-with-email
   */
  unassignVendorWithEmail(request: UnassignVendorWithEmailRequest): Observable<StringResponse> {
    return this.http
      .post<StringResponse>(`${this.vendorCancellationApiBase}/unassign-vendor-with-email`, request)
      .pipe(catchError(this.handleError<StringResponse>('unassignVendorWithEmail')));
  }

  /**
   * Handles pending estimate approval and then unassigns vendor.
   * POST handle-estimate-and-unassign
   */
  handleEstimateAndUnassign(request: HandleEstimateAndUnassignRequest): Observable<StringResponse> {
    return this.http
      .post<StringResponse>(`${this.vendorCancellationApiBase}/handle-estimate-and-unassign`, request)
      .pipe(catchError(this.handleError<StringResponse>('handleEstimateAndUnassign')));
  }

  /**
   * Reassigns (restores) an inactive vendor back to the job.
   * POST reassign-from-inactive
   */
  reassignFromInactive(request: ReassignVendorFromInactiveRequest): Observable<StringResponse> {
    return this.http
      .post<StringResponse>(`${this.vendorCancellationApiBase}/reassign-from-inactive`, request)
      .pipe(catchError(this.handleError<StringResponse>('reassignFromInactive')));
  }

  // ──────────────────────────────────────────────────────────────
  //  AI Sourcing Agent — status + vendor list (no POST /api/sourcing/request from this tab)
  // ──────────────────────────────────────────────────────────────

  /**
   * Clears cached AI sourcing status (e.g. before Re-Source restarts status polling).
   */
  clearAISourcingStatus(): void {
    this._aiSourcingStatus$.next(null);
  }

  /** POST /api/sourcing/request — triggers vendor sourcing for a job. */
  startSourcing(jobKey: string, radiusMiles = 30): Observable<AISourcingRequestResponse | null> {
    return this.http
      .post<AssignVendorApiResponse<AISourcingRequestResponse>>(
        `${this.sourcingApiBase}/request`,
        { jobKey, radiusMiles },
      )
      .pipe(
        map((res) => res?.data ?? null),
        catchError(() => of(null)),
      );
  }

  /**
   * GET /api/sourcing/status/{jobKey} — pending, in_progress, completed, failed.
   * Response is wrapped by ApiResponseWrapFilter → unwrap .data here.
   */
  getSourcingStatus(jobKey: string): Observable<AISourcingStatus | null> {
    return this.http
      .get<unknown>(`${this.sourcingApiBase}/status/${jobKey}`)
      .pipe(
        map((res: any) => {
          if (res?.data != null) {
            return res.data;
          }
          if (res?.flag != null && res?.data != null) {
            return res.data;
          }
          return res;
        }),
        tap((status) => {
          this._aiSourcingStatus$.next(status);
        }),
        catchError((err) => {
          console.error('getSourcingStatus error:', err);
          this._aiSourcingStatus$.next(null);
          return of(null);
        }),
      );
  }

  /**
   * Gets the sourcing vendor list for a job (from SourcingResult DB table).
   * GET /api/sourcing/vendors/{jobKey}
   * Response is wrapped by ApiResponseWrapFilter → unwrap .data here.
   */
  getSourcingVendors(jobKey: string): Observable<AISourcingVendor[]> {
    return this.http
      .get<unknown>(`${this.sourcingApiBase}/vendors/${jobKey}`)
      .pipe(
        map((res: any) => {
          if (res?.data != null) {
            return res.data ?? [];
          }
          if (res?.flag != null && res?.data != null) {
            return res.data ?? [];
          }
          return Array.isArray(res) ? res : [];
        }),
        tap((vendors) => {
          this._aiSourcingVendors$.next(vendors);
        }),
        catchError((err) => {
          console.error('getSourcingVendors error:', err);
          this._aiSourcingVendors$.next([]);
          return of([] as AISourcingVendor[]);
        }),
      );
  }

  /**
   * Persists a user-edited email for one AI external vendor row (side table in Job Ops DB).
   * PUT /api/sourcing/vendors/{jobKey}/email
   */
  saveSourcingVendorEmail(
    jobKey: string,
    body: UpdateSourcedVendorEmailRequest,
  ): Observable<SourcingVendorEmailSavedResponse> {
    return this.http
      .put<AssignVendorApiResponse<SourcingVendorEmailSavedResponse>>(
        `${this.sourcingApiBase}/vendors/${jobKey}/email`,
        body,
      )
      .pipe(
        map((res) => {
          const data = res?.data;
          if (!data) {
            throw new Error('No data in save sourcing vendor email response');
          }
          return data;
        }),
      );
  }

  // ──────────────────────────────────────────────────────────────
  //  Support Contact Info (Company Info API)
  // ──────────────────────────────────────────────────────────────

  /** Cached support contact info to avoid repeated API calls. */
  private cachedSupportContactInfo: SupportContactInfo | null = null;

  /**
   * Gets the Retail Fix It support contact information.
   * GET /api/v1/company-info/support-contact
   * Results are cached after first successful fetch.
   */
  getSupportContactInfo(): Observable<SupportContactInfo> {
    if (this.cachedSupportContactInfo) {
      return of(this.cachedSupportContactInfo);
    }

    return this.http
      .get<AssignVendorApiResponse<SupportContactInfo>>(
        `${environment.apiBaseUrl}/api/v1/company-info/support-contact`
      )
      .pipe(
        timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
        map((res) => {
          if (res?.status && res.data) {
            this.cachedSupportContactInfo = res.data;
            return res.data;
          }
          return this.getDefaultSupportContactInfo();
        }),
        catchError(() => of(this.getDefaultSupportContactInfo()))
      );
  }

  /** Returns default support contact info as fallback. */
  private getDefaultSupportContactInfo(): SupportContactInfo {
    return {
      primaryPhone: '877-217-3335',
      secondaryPhone: '770-427-9287',
      email: 'info@retailfixit.com',
      formattedDisplay: '877-217-3335, 770-427-9287 | Email: info@retailfixit.com',
    };
  }

  // ──────────────────────────────────────────────────────────────
  //  Vendor Recruitment — Send recruitment email to AI-sourced vendor
  // ──────────────────────────────────────────────────────────────

  /**
   * Sends a recruitment email to an external vendor via the Email Service API.
   * POST /api/vendor-recruitment/send
   */
  sendRecruitmentEmail(request: RecruitmentEmailRequest): Observable<RecruitmentEmailResponse> {
    return this.http
      .post<RecruitmentEmailResponse>(
        `${this.emailServiceApiBase}/send`,
        request,
      )
      .pipe(
        timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
        catchError((err: HttpErrorResponse | TimeoutError) => {
          if (err instanceof TimeoutError) {
            return of({
              flag: 0,
              mess: 'Request timed out. Please try again.',
              messageId: null,
            } as RecruitmentEmailResponse);
          }
          const httpErr = err as HttpErrorResponse;
          const message =
            httpErr.error?.mess ||
            httpErr.error?.message ||
            'Failed to send recruitment email. Please try again.';
          return of({
            flag: 0,
            mess: message,
            messageId: null,
          } as RecruitmentEmailResponse);
        }),
      );
  }

  /**
   * Persists an admin action note on the job after vendor onboarding email is sent (AI sourcing).
   * POST /api/v1/admin/job-vendor/save-general-admin-note
   */
  saveGeneralAdminNote(request: SaveGeneralAdminNoteRequest): Observable<SaveGeneralAdminNoteResponse> {
    return this.http
      .post<SaveGeneralAdminNoteResponse>(`${this.apiBase}/save-general-admin-note`, request)
      .pipe(
        timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
        catchError(this.handleError<SaveGeneralAdminNoteResponse>('saveGeneralAdminNote')),
      );
  }

  /** Default timeout for all HTTP calls (30 seconds). */
  private static readonly REQUEST_TIMEOUT_MS = 30_000;

  /** Extended timeout for long-running operations like email sending (120 seconds). */
  private static readonly EXTENDED_TIMEOUT_MS = 120_000;

  // ──────────────────────────────────────────────────────────────
  //  Distant Vendor Approval Workflow
  //  Used when assigning a vendor beyond the configured distance rule
  // ──────────────────────────────────────────────────────────────

  /** Base URL for DistantVendorApprovalController endpoints */
  private readonly distantVendorApiBase = `${environment.apiBaseUrl}/api/v1/distant-vendor`;

  /**
   * Checks if the vendor exceeds the configured distance rule for the job.
   * POST check-distance with JSON body { jobKey, vendorKey }
   */
  checkDistanceRule(jobKey: string, vendorKey: string): Observable<AssignVendorApiResponse<CheckDistanceRuleResponse>> {
    return this.http
      .post<AssignVendorApiResponse<CheckDistanceRuleResponse>>(
        `${this.distantVendorApiBase}/check-distance`,
        { jobKey, vendorKey }
      )
      .pipe(
        timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
        catchError(this.handleError<AssignVendorApiResponse<CheckDistanceRuleResponse>>('checkDistanceRule'))
      );
  }

  /**
   * Creates a distant vendor approval request and sends email to designated admin.
   * Uses extended timeout as this operation involves email sending.
   * POST create-approval-request
   */
  createDistantVendorApprovalRequest(
    request: CreateDistantVendorApprovalRequest
  ): Observable<AssignVendorApiResponse<CreateDistantVendorApprovalResponse>> {
    return this.http
      .post<AssignVendorApiResponse<CreateDistantVendorApprovalResponse>>(
        `${this.distantVendorApiBase}/create-approval-request`,
        request
      )
      .pipe(
        timeout(AssignVendorService.EXTENDED_TIMEOUT_MS),
        catchError(this.handleError<AssignVendorApiResponse<CreateDistantVendorApprovalResponse>>('createDistantVendorApprovalRequest'))
      );
  }

  /**
   * Gets approval details for the approval/decline page (no auth required).
   * GET approval-details/{approvalKey}
   */
  getDistantVendorApprovalDetails(
    approvalKey: string
  ): Observable<AssignVendorApiResponse<DistantVendorApprovalDetailsResponse>> {
    return this.http
      .get<AssignVendorApiResponse<DistantVendorApprovalDetailsResponse>>(
        `${this.distantVendorApiBase}/approval-details/${approvalKey}`
      )
      .pipe(catchError(this.handleError<AssignVendorApiResponse<DistantVendorApprovalDetailsResponse>>('getDistantVendorApprovalDetails')));
  }

  /**
   * Processes the approval (assigns vendor to job and sends work order).
   * POST approve/{approvalKey}
   */
  processDistantVendorApproval(
    approvalKey: string,
    request: ProcessDistantVendorApprovalRequest
  ): Observable<AssignVendorApiResponse<ProcessDistantVendorResponse>> {
    return this.http
      .post<AssignVendorApiResponse<ProcessDistantVendorResponse>>(
        `${this.distantVendorApiBase}/approve/${approvalKey}`,
        request
      )
      .pipe(
        timeout(AssignVendorService.EXTENDED_TIMEOUT_MS),
        catchError(this.handleError<AssignVendorApiResponse<ProcessDistantVendorResponse>>('processDistantVendorApproval'))
      );
  }

  /**
   * Processes the decline (marks as declined and saves remark).
   * POST decline/{approvalKey}
   */
  processDistantVendorDecline(
    approvalKey: string,
    request: ProcessDistantVendorDeclineRequest
  ): Observable<AssignVendorApiResponse<ProcessDistantVendorResponse>> {
    return this.http
      .post<AssignVendorApiResponse<ProcessDistantVendorResponse>>(
        `${this.distantVendorApiBase}/decline/${approvalKey}`,
        request
      )
      .pipe(
        timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
        catchError(this.handleError<AssignVendorApiResponse<ProcessDistantVendorResponse>>('processDistantVendorDecline'))
      );
  }

  // ──────────────────────────────────────────────────────────────
  //  Error Handler
  // ──────────────────────────────────────────────────────────────

  /**
   * Human-readable hint for logs / support (technical). Prefer {@link formatHttpFailureForUi} for UI alerts.
   */
  describeClientAuthHeaderState(): string {
    return this.authTokenSvc.getToken().trim().length > 0
      ? 'Client: Authorization Bearer was sent (JWT present in AuthTokenService).'
      : 'Client: Authorization Bearer was NOT sent (no JWT in AuthTokenService — use legacy Admin handoff ?token= or environment.authToken for local dev).';
  }

  /**
   * End-user error text for alerts (assign-vendor + notes). Explains missing JWT vs connectivity clearly.
   */
  formatHttpFailureForUi<T>(res: AssignVendorApiResponse<T> | null | undefined): string {
    if (!res) return 'Something went wrong. Please try again.';
    const rc = res.responseCode;
    if (rc === 0) {
      return this.formatConnectivityFailureForUi(res);
    }
    if (rc === 401) {
      return this.formatUnauthorizedForUi(res);
    }

    const rawMsg = (res.message ?? '').trim();
    const parts: string[] = [];
    if (rawMsg) parts.push(rawMsg);

    const op = res.clientOperation;
    const url = res.requestUrl ?? '';
    if (op && !rawMsg.includes(op)) {
      parts.push(`Operation: ${op}`);
    }
    if (url && !rawMsg.includes(url)) {
      parts.push(`URL: ${url}`);
    }
    if (res.traceId?.trim()) {
      parts.push(`traceId: ${res.traceId}`);
    }

    if (!res.authorizationSent) {
      parts.push(
        'Tip: open Assign Vendor from legacy Admin Portal so this URL includes ?token= with your JWT.',
      );
    }

    return parts.join(' ');
  }

  /** Status 0 / timeout — distinguish “no token” from “API unreachable even with token”. */
  private formatConnectivityFailureForUi(res: AssignVendorApiResponse<unknown>): string {
    const apiRoot = environment.apiBaseUrl;
    const raw = (res.message ?? '').trim();
    const timedOut = raw.toLowerCase().includes('timed out');
    const sent = !!res.authorizationSent;
    const op = res.clientOperation ? ` (${res.clientOperation})` : '';

    const typical =
      'Typical causes: Job Ops API not running (especially on localhost), wrong port in src/environments/environment.ts, firewall/VPN blocking outbound HTTPS, or your browser does not trust the development HTTPS certificate.';

    if (timedOut) {
      const head = `The Job Ops API did not respond in time${op}. Configured API: ${apiRoot}.`;
      const tail = sent
        ? `Your login token was sent. If this keeps happening, check that the API is up and reachable. ${typical}`
        : `No login token was detected. Open Assign Vendor from legacy Admin using a link that includes ?token= in the URL, then try again. ${typical}`;
      return `${head} ${tail}`;
    }

    const head = `Could not connect to the Job Ops API${op}. Configured API: ${apiRoot}.`;
    const tail = sent
      ? `Your JWT was included with the request, so this is usually a network or server issue—not missing login. ${typical}`
      : `No login token was sent. Secured endpoints need authentication: open Assign Vendor from legacy Admin Portal so the address bar includes ?token=… (or append it), then reload. ${typical}`;
    return `${head} ${tail}`;
  }

  /** 401 — explain expired/missing token in plain language. */
  private formatUnauthorizedForUi(res: AssignVendorApiResponse<unknown>): string {
    const stripped = AssignVendorService.stripInlineTechnicalHints(res.message ?? '');
    const sent = !!res.authorizationSent;
    const intro = sent
      ? 'Access was denied (401). Your session token may be expired or not accepted by this API. Try opening Assign Vendor again from legacy Admin using a fresh link that includes ?token=.'
      : 'Access was denied (401). No login token was sent. Open Assign Vendor from legacy Admin Portal so this URL includes ?token= with your JWT.';
    const detail = stripped ? ` Details from server: ${stripped}` : '';
    const op = res.clientOperation ? ` Operation: ${res.clientOperation}.` : '';
    const url = res.requestUrl ? ` URL: ${res.requestUrl}.` : '';
    return `${intro}${detail}${op}${url}`;
  }

  private static stripInlineTechnicalHints(message: string): string {
    return message
      .replace(/\s*\|\s*WWW-Authenticate:[^|]*/gi, '')
      .replace(/\s*\|\s*\[401 class:[^\]]*]/gi, '')
      .replace(/^\(401\)\s*No message body from server\.\s*\|\s*/i, '')
      .trim();
  }

  private static readMessageFromUnknownBody(body: unknown): string {
    if (body == null) return '';
    if (typeof body === 'string') return body.trim();
    if (typeof body === 'object') {
      const o = body as Record<string, unknown>;
      if (typeof o['message'] === 'string' && o['message'].trim()) return o['message'].trim();
      if (typeof o['error_description'] === 'string' && o['error_description'].trim()) return o['error_description'].trim();
      if (typeof o['title'] === 'string' && o['title'].trim()) return o['title'].trim();
    }
    return '';
  }

  private static readTraceIdFromUnknownBody(body: unknown): string | null {
    if (body && typeof body === 'object') {
      const t = (body as Record<string, unknown>)['traceId'];
      if (typeof t === 'string' && t.trim()) return t.trim();
    }
    return null;
  }

  private static hintFor401(serverMessage: string, wwwAuthenticate: string | null): string {
    const lower = serverMessage.toLowerCase();
    if (lower.includes('identify admin') || lower.includes('admin from token')) {
      return '[401 class: API could not resolve AdminKey / admin identity from JWT claims.]';
    }
    if (wwwAuthenticate && wwwAuthenticate.trim().length > 0) {
      return '[401 class: Bearer challenge — missing JWT, invalid signature, expired token, or issuer/audience mismatch.]';
    }
    return '[401 class: Unauthorized — see server message above.]';
  }

  // ──────────────────────────────────────────────────────────────
  //  Admin Check-In / Check-Out
  // ──────────────────────────────────────────────────────────────

  private readonly adminCheckInBase = `${environment.apiBaseUrl}/api/v1/admin/checkinout`;

  /** Gets the current check-in status for a job-vendor assignment. */
  adminGetCheckInStatus(jobVendorKey: string): Observable<AssignVendorApiResponse<AdminCheckInStatusDto>> {
    return this.http
      .get<AssignVendorApiResponse<AdminCheckInStatusDto>>(`${this.adminCheckInBase}/status/${jobVendorKey}`)
      .pipe(catchError(this.handleError<AssignVendorApiResponse<AdminCheckInStatusDto>>('adminGetCheckInStatus')));
  }

  /** Admin check-in: inserts a check-in row and updates job/vendor status. */
  adminSaveCheckIn(req: AdminSaveCheckInRequest): Observable<AssignVendorApiResponse<AdminCheckInResultDto>> {
    return this.http
      .post<AssignVendorApiResponse<AdminCheckInResultDto>>(`${this.adminCheckInBase}/save-checkin`, req)
      .pipe(
        timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
        catchError(this.handleError<AssignVendorApiResponse<AdminCheckInResultDto>>('adminSaveCheckIn')),
      );
  }

  /** Sends a checkout-link email to the vendor (equivalent to emailType=7) and saves a note. */
  adminSendCheckoutEmail(req: AdminSendCheckoutEmailRequest): Observable<AssignVendorApiResponse<string>> {
    return this.http
      .post<AssignVendorApiResponse<string>>(`${this.adminCheckInBase}/send-checkout-email`, req)
      .pipe(
        timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
        catchError(this.handleError<AssignVendorApiResponse<string>>('adminSendCheckoutEmail')),
      );
  }

  /** Admin checkout: closes the active check-in row and updates job/vendor status. */
  adminSaveCheckOut(req: AdminSaveCheckOutRequest): Observable<AssignVendorApiResponse<string>> {
    return this.http
      .post<AssignVendorApiResponse<string>>(`${this.adminCheckInBase}/save-checkout`, req)
      .pipe(
        timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
        catchError(this.handleError<AssignVendorApiResponse<string>>('adminSaveCheckOut')),
      );
  }

  // ──────────────────────────────────────────────────────────────
  //  Vendor estimates (legacy on-site approval redirect)
  // ──────────────────────────────────────────────────────────────

  getVendorEstimateList(jobVendorKey: string): Observable<AssignVendorApiResponse<VendorEstimateListResult>> {
    return this.http
      .get<AssignVendorApiResponse<VendorEstimateListResult>>(`${this.apiBase}/estimate-list/${jobVendorKey}`)
      .pipe(catchError(this.handleError<AssignVendorApiResponse<VendorEstimateListResult>>('getVendorEstimateList')));
  }

  // ──────────────────────────────────────────────────────────────
  //  Vendor status actions (SendVendorMails port)
  // ──────────────────────────────────────────────────────────────

  private readonly vendorStatusActionBase = `${environment.apiBaseUrl}/api/v1/admin/vendor-status-action`;

  getVendorActionMailContext(jobVendorKey: string, actionId: string): Observable<AssignVendorApiResponse<VendorActionMailContext>> {
    const params = new HttpParams().set('actionId', actionId);
    return this.http
      .get<AssignVendorApiResponse<VendorActionMailContext>>(`${this.vendorStatusActionBase}/mail-context/${jobVendorKey}`, { params })
      .pipe(catchError(this.handleError<AssignVendorApiResponse<VendorActionMailContext>>('getVendorActionMailContext')));
  }

  sendVendorActionMail(req: SendVendorActionMailRequest): Observable<AssignVendorApiResponse<string>> {
    return this.http
      .post<AssignVendorApiResponse<string>>(`${this.vendorStatusActionBase}/send-mail`, req)
      .pipe(
        timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
        catchError(this.handleError<AssignVendorApiResponse<string>>('sendVendorActionMail')),
      );
  }

  confirmEtaManually(req: ConfirmEtaManuallyRequest): Observable<AssignVendorApiResponse<string>> {
    return this.http
      .post<AssignVendorApiResponse<string>>(`${this.vendorStatusActionBase}/confirm-eta`, req)
      .pipe(catchError(this.handleError<AssignVendorApiResponse<string>>('confirmEtaManually')));
  }

  confirmReturnEtaManually(req: ConfirmEtaManuallyRequest): Observable<AssignVendorApiResponse<string>> {
    return this.http
      .post<AssignVendorApiResponse<string>>(`${this.vendorStatusActionBase}/confirm-return-eta`, req)
      .pipe(catchError(this.handleError<AssignVendorApiResponse<string>>('confirmReturnEtaManually')));
  }

  getVendorEstimateNavigation(jobVendorKey: string): Observable<AssignVendorApiResponse<VendorEstimateNavigation>> {
    return this.http
      .post<AssignVendorApiResponse<VendorEstimateNavigation>>(`${this.vendorStatusActionBase}/vendor-estimate-nav/${jobVendorKey}`, {})
      .pipe(catchError(this.handleError<AssignVendorApiResponse<VendorEstimateNavigation>>('getVendorEstimateNavigation')));
  }

  getLatestCustomerEstimate(jobKey: string): Observable<AssignVendorApiResponse<LatestCustomerEstimate>> {
    return this.http
      .get<AssignVendorApiResponse<LatestCustomerEstimate>>(`${this.vendorStatusActionBase}/latest-customer-estimate/${jobKey}`)
      .pipe(catchError(this.handleError<AssignVendorApiResponse<LatestCustomerEstimate>>('getLatestCustomerEstimate')));
  }

  getApproveVendorContext(jobVendorKey: string): Observable<AssignVendorApiResponse<ApproveVendorContext>> {
    return this.http
      .get<AssignVendorApiResponse<ApproveVendorContext>>(`${this.vendorStatusActionBase}/approve-vendor-context/${jobVendorKey}`)
      .pipe(catchError(this.handleError<AssignVendorApiResponse<ApproveVendorContext>>('getApproveVendorContext')));
  }

  sendAdditionalApproval(req: SendAdditionalApprovalRequest): Observable<AssignVendorApiResponse<string>> {
    return this.http
      .post<AssignVendorApiResponse<string>>(`${this.vendorStatusActionBase}/send-additional-approval`, req)
      .pipe(
        timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
        catchError(this.handleError<AssignVendorApiResponse<string>>('sendAdditionalApproval')),
      );
  }

  setVendorEstimateToApproved(req: SetVendorEstimateApprovedRequest): Observable<AssignVendorApiResponse<SetVendorEstimateApprovedResult>> {
    return this.http
      .post<AssignVendorApiResponse<SetVendorEstimateApprovedResult>>(
        `${this.vendorStatusActionBase}/set-vendor-estimate-approved`,
        req,
      )
      .pipe(
        timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
        catchError(this.handleError<AssignVendorApiResponse<SetVendorEstimateApprovedResult>>('setVendorEstimateToApproved')),
      );
  }

  getCustomerReminderContext(jobVendorKey: string): Observable<AssignVendorApiResponse<CustomerReminderContext>> {
    return this.http
      .get<AssignVendorApiResponse<CustomerReminderContext>>(`${this.vendorStatusActionBase}/customer-reminder-context/${jobVendorKey}`)
      .pipe(catchError(this.handleError<AssignVendorApiResponse<CustomerReminderContext>>('getCustomerReminderContext')));
  }

  sendCustomerReminder(req: SendCustomerReminderRequest): Observable<AssignVendorApiResponse<string>> {
    return this.http
      .post<AssignVendorApiResponse<string>>(`${this.vendorStatusActionBase}/send-customer-reminder`, req)
      .pipe(
        timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
        catchError(this.handleError<AssignVendorApiResponse<string>>('sendCustomerReminder')),
      );
  }

  /**
   * HTTP error handler that parses the real status code and body.
   *
   * - **400 Validation**: Preserves `details[]` so the component can
   *   map field-level errors back to FormControls via `setErrors()`.
   * - **401**: Prefers `error.error.message` (ApiResponse / ProblemDetails); adds URL, operation, client auth hint, WWW-Authenticate.
   * - **403 / 404 / 409 / 500+**: Uses server body message when present.
   * - **Status 0 / TimeoutError**: Network unreachable or timeout.
   */
  private handleError<T>(operation = 'operation') {
    return (error: unknown): Observable<T> => {
      console.error(`${operation} failed:`, error);

      let message = `${operation} failed. Please try again.`;
      let responseCode = 0;
      let details: { message: string; code: string | null; field: string | null }[] = [];
      let traceId: string | null = null;
      let requestUrl: string | null = null;
      const authorizationSent = this.authTokenSvc.getToken().trim().length > 0;

      if (error instanceof TimeoutError) {
        message = 'Request timed out.';
        responseCode = 0;
      } else if (error instanceof HttpErrorResponse) {
        responseCode = error.status;
        requestUrl = error.url ?? null;

        switch (error.status) {
          case 0:
            message = 'Unable to reach the server.';
            break;

          case 400: {
            const body = error.error;
            if (body && typeof body === 'object') {
              message = (body as { message?: string }).message || 'Validation failed.';
              if (Array.isArray((body as { details?: unknown }).details)) {
                details = (body as { details: typeof details }).details;
              }
            } else {
              message = 'Invalid request. Please check your input.';
            }
            traceId = AssignVendorService.readTraceIdFromUnknownBody(body);
            break;
          }

          case 401: {
            const wwwAuth = error.headers?.get('WWW-Authenticate');
            const serverMsg = AssignVendorService.readMessageFromUnknownBody(error.error);
            traceId = AssignVendorService.readTraceIdFromUnknownBody(error.error);
            const hint401 = AssignVendorService.hintFor401(serverMsg, wwwAuth);
            if (serverMsg) {
              message = `${serverMsg} | ${hint401}`;
              if (wwwAuth) message += ` | WWW-Authenticate: ${wwwAuth}`;
            } else {
              message = `(401) No message body from server. | ${hint401}`;
              if (wwwAuth) message += ` | WWW-Authenticate: ${wwwAuth}`;
            }
            break;
          }

          case 403: {
            const m403 = AssignVendorService.readMessageFromUnknownBody(error.error);
            message = m403 || 'You do not have permission to perform this action.';
            traceId = AssignVendorService.readTraceIdFromUnknownBody(error.error);
            break;
          }

          case 404: {
            const body404 = error.error;
            message = (body404 && typeof body404 === 'object' && (body404 as { message?: string }).message)
              ? (body404 as { message: string }).message
              : 'The requested resource was not found.';
            traceId = AssignVendorService.readTraceIdFromUnknownBody(body404);
            break;
          }

          case 409: {
            const body409 = error.error;
            message = (body409 && typeof body409 === 'object' && (body409 as { message?: string }).message)
              ? (body409 as { message: string }).message
              : 'A conflict occurred. The record may have been modified.';
            traceId = AssignVendorService.readTraceIdFromUnknownBody(body409);
            break;
          }

          default:
            if (error.status >= 500) {
              const m5 = AssignVendorService.readMessageFromUnknownBody(error.error);
              message = m5 || 'Something went wrong on the server. Please try again later.';
              traceId = AssignVendorService.readTraceIdFromUnknownBody(error.error);
            } else {
              const mx = AssignVendorService.readMessageFromUnknownBody(error.error);
              message = mx || `${operation} failed. Please try again.`;
            }
            break;
        }
      }

      return of({
        status: false,
        responseCode,
        message,
        data: null,
        details,
        unixTime: 0,
        traceId,
        clientOperation: operation,
        requestUrl,
        authorizationSent,
      } as T);
    };
  }

  /** Parses dropdown endpoints that return either a raw array or ApiResponse-wrapped data. */
  private extractGuidOptionList<T extends { value: string; text: string }>(
    res: T[] | AssignVendorApiResponse<T[]>,
  ): T[] {
    if (Array.isArray(res)) return res;
    return Array.isArray(res.data) ? res.data : [];
  }

  /** Unwraps Job Ops ApiResponse envelope from priority preview endpoints. */
  private unwrapJobPriorityChangePreview(
    res: JobPriorityChangePreview | AssignVendorApiResponse<JobPriorityChangePreview>,
  ): JobPriorityChangePreview {
    if (res && typeof res === 'object' && 'data' in res && res.data != null) {
      return res.data as JobPriorityChangePreview;
    }
    return res as JobPriorityChangePreview;
  }

  private unwrapJobPriorityVendorCheck(
    res: JobPriorityVendorCheck | AssignVendorApiResponse<JobPriorityVendorCheck>,
  ): JobPriorityVendorCheck {
    if (res && typeof res === 'object' && 'data' in res && res.data != null) {
      return res.data as JobPriorityVendorCheck;
    }
    return res as JobPriorityVendorCheck;
  }

  private normalizeJobPriorityVendorCheck(raw: JobPriorityVendorCheck): JobPriorityVendorCheck {
    const r = raw as JobPriorityVendorCheck & {
      HasVendors?: boolean;
      VendorCount?: number;
      WorkOrderSent?: boolean;
      CanChangePriority?: boolean;
      BlockMessage?: string | null;
    };
    return {
      hasVendors: raw.hasVendors === true || r.HasVendors === true,
      vendorCount: raw.vendorCount ?? r.VendorCount ?? 0,
      workOrderSent: raw.workOrderSent === true || r.WorkOrderSent === true,
      canChangePriority: raw.canChangePriority === true || r.CanChangePriority === true,
      blockMessage: raw.blockMessage ?? r.BlockMessage ?? null,
    };
  }

  /** Normalizes preview DTO casing from Job Ops JSON. */
  private normalizeJobPriorityChangePreview(raw: JobPriorityChangePreview): JobPriorityChangePreview {
    const r = raw as JobPriorityChangePreview & {
      Success?: boolean;
      Message?: string | null;
      BulletPoints?: string[];
      OldJobTypeKey?: string;
      NewJobTypeKey?: string;
      OldPriorityName?: string | null;
      NewPriorityName?: string | null;
      OldCustomerDne?: number;
      NewCustomerDne?: number;
      OldVendorDne?: number;
      NewVendorDne?: number;
      OldResponseTime?: string | null;
      NewResponseTime?: string | null;
      CustomerDneChanged?: boolean;
      VendorDneChanged?: boolean;
    };
    return {
      success: raw.success === true || r.Success === true,
      message: raw.message ?? r.Message ?? null,
      hasVendors: raw.hasVendors === true || (raw as { HasVendors?: boolean }).HasVendors === true,
      vendorCount: raw.vendorCount ?? (raw as { VendorCount?: number }).VendorCount ?? 0,
      bulletPoints: raw.bulletPoints ?? r.BulletPoints ?? [],
      oldPriorityName: raw.oldPriorityName ?? r.OldPriorityName ?? null,
      newPriorityName: raw.newPriorityName ?? r.NewPriorityName ?? null,
      oldCustomerDne: raw.oldCustomerDne ?? r.OldCustomerDne ?? 0,
      newCustomerDne: raw.newCustomerDne ?? r.NewCustomerDne ?? 0,
      oldVendorDne: raw.oldVendorDne ?? r.OldVendorDne ?? 0,
      newVendorDne: raw.newVendorDne ?? r.NewVendorDne ?? 0,
      oldResponseTime: raw.oldResponseTime ?? r.OldResponseTime ?? null,
      newResponseTime: raw.newResponseTime ?? r.NewResponseTime ?? null,
      customerDneChanged: raw.customerDneChanged === true || r.CustomerDneChanged === true,
      vendorDneChanged: raw.vendorDneChanged === true || r.VendorDneChanged === true,
      oldJobTypeKey: raw.oldJobTypeKey ?? r.OldJobTypeKey ?? null,
      newJobTypeKey: raw.newJobTypeKey ?? r.NewJobTypeKey ?? null,
    };
  }

  /** Ensures pinned rows expose {@code noMaybe} regardless of API casing / legacy field names. */
  private normalizePinnedVendorRow(v: LocationHistoryVendor): LocationHistoryVendor {
    const raw = v as unknown as Record<string, unknown>;
    
    // Normalize noMaybe field
    const candidate =
      v.noMaybe ??
      raw['NoMaybe'] ??
      raw['no'] ??
      raw['NO'] ??
      null;
    const noMaybe =
      candidate != null && String(candidate).trim() !== ''
        ? String(candidate).trim()
        : null;
    const choice = noMaybe && String(noMaybe).toLowerCase().includes('maybe') ? 'Maybe' : 'No';
    
    // Normalize specialNotes field - check all possible property names
    const notesCandidate =
      raw['specialNotes'] ??
      raw['SpecialNotes'] ??
      raw['notes'] ??
      raw['Notes'] ??
      raw['remarks'] ??
      raw['Remarks'] ??
      v.remarks ??
      null;
    const specialNotes =
      notesCandidate != null && String(notesCandidate).trim() !== ''
        ? String(notesCandidate).trim()
        : null;
    
    return { 
      ...v, 
      noMaybe: choice, 
      _pinChoice: choice,
      specialNotes 
    } as LocationHistoryVendor & { _pinChoice?: string; specialNotes?: string | null };
  }

  // ──────────────────────────────────────────────────────────────
  //  On-Site Approval Estimate Wizard (V2 API: /api/v1/admin/on-site-approval)
  // ──────────────────────────────────────────────────────────────

  private readonly onSiteEstimateBase = `${environment.apiBaseUrl}/api/v1/admin/on-site-approval`;

  /**
   * GET /initialize/{jobKey} — Initializes a new on-site approval estimate session.
   * Returns temp estimate key, job/vendor details, DNE values, and document type labels.
   */
  initializeOnSiteEstimate(jobKey: string, vendorKey: string): Observable<AssignVendorApiResponse<OnSiteEstimateInitResponse>> {
    const params = new HttpParams().set('vendorKey', vendorKey);
    return this.http
      .get<AssignVendorApiResponse<OnSiteEstimateInitResponse>>(
        `${this.onSiteEstimateBase}/initialize/${jobKey}`,
        { params }
      )
      .pipe(
        timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
        catchError(this.handleError<AssignVendorApiResponse<OnSiteEstimateInitResponse>>('initializeOnSiteEstimate'))
      );
  }

  /**
   * GET /check-status?jobKey=...&vendorKey=... — Checks if an estimate already exists.
   * Returns status code: 1 = no estimate, 2 = basic estimate, 3+ = complex estimate.
   */
  checkOnSiteEstimateStatus(jobKey: string, vendorKey: string): Observable<IntResponse> {
    const params = new HttpParams()
      .set('jobKey', jobKey)
      .set('vendorKey', vendorKey);
    return this.http
      .get<IntResponse>(`${this.onSiteEstimateBase}/check-status`, { params })
      .pipe(catchError(this.handleError<IntResponse>('checkOnSiteEstimateStatus')));
  }

  /**
   * POST /save-estimate — Saves estimate line items (trip, materials, labor).
   * Returns the persisted estimate key.
   */
  saveOnSiteEstimate(request: SaveOnSiteEstimateRequest): Observable<AssignVendorApiResponse<SaveOnSiteEstimateResponse>> {
    // Transform frontend model to backend API format
    const apiRequest: SaveOnSiteEstimateApiRequest = {
      vendorEstimateKey: request.tempEstimateKey,  // Backend uses different field name
      jobKey: request.jobKey,
      vendorKey: request.vendorKey,
      lineItems: request.lineItems.map(item => this.transformLineItemToBackendFormat(item))
    };
    
    return this.http
      .post<AssignVendorApiResponse<SaveOnSiteEstimateResponse>>(
        `${this.onSiteEstimateBase}/save-estimate`,
        apiRequest  // Send transformed format
      )
      .pipe(
        timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
        catchError(this.handleError<AssignVendorApiResponse<SaveOnSiteEstimateResponse>>('saveOnSiteEstimate'))
      );
  }

  /**
   * Transforms a frontend line item to the backend API format
   */
  private transformLineItemToBackendFormat(item: TripChargeLineItem | MaterialLineItem | LaborLineItem): BackendLineItem {
    const baseItem = {
      costIncurred: item.costIncurred,
      description: item.description || '',
      displayLevel: '1',  // Default display level
    };

    // Transform based on charge type
    if (item.chargeType === 'trip') {
      const tripItem = item as TripChargeLineItem;
      return {
        ...baseItem,
        chargeTypeKey: `${tripItem.rateType === 'flat' ? 'Flat' : 'Emergency'} Trip Charge`,
        itemName: 'Trip Charge',
        rate: tripItem.amount,
        quantity: 1,
        laborHours: null,
        techCount: null,
        isLabor: false,
      };
    } else if (item.chargeType === 'material') {
      const materialItem = item as MaterialLineItem;
      return {
        ...baseItem,
        chargeTypeKey: 'MATERIALS',
        itemName: materialItem.itemName,
        rate: materialItem.rate,
        quantity: materialItem.quantity,
        laborHours: null,
        techCount: null,
        isLabor: false,
      };
    } else if (item.chargeType === 'labor') {
      const laborItem = item as LaborLineItem;
      return {
        ...baseItem,
        chargeTypeKey: `${laborItem.rateType === 'standard' ? 'Standard' : 'Overtime'} Hourly Rate`,
        itemName: `${laborItem.rateType === 'standard' ? 'Standard' : 'Overtime'} Hourly Rate`,
        description: laborItem.workDescription || '',
        rate: laborItem.laborRate,
        quantity: 0,  // Labor doesn't use quantity
        laborHours: laborItem.laborHours,
        techCount: laborItem.techCount,
        isLabor: true,  // ⭐ CRITICAL: This flag tells backend to save to VendorEstimateDetail1
      };
    }

    // Fallback (should never happen)
    throw new Error(`Unknown charge type: ${(item as any).chargeType}`);
  }

  /**
   * GET /customer-dne/{jobKey} — Gets 65% customer DNE calculation for validation.
   */
  getCustomerDneCalculation(jobKey: string): Observable<AssignVendorApiResponse<CustomerDneCalculationResponse>> {
    return this.http
      .get<AssignVendorApiResponse<CustomerDneCalculationResponse>>(
        `${this.onSiteEstimateBase}/customer-dne/${jobKey}`
      )
      .pipe(catchError(this.handleError<AssignVendorApiResponse<CustomerDneCalculationResponse>>('getCustomerDneCalculation')));
  }

  /**
   * POST /submit-for-customer-approval — Sends estimate to customer for approval.
   * Returns navigation URL to customer estimate page.
   */
  submitOnSiteEstimateForCustomerApproval(
    request: SubmitForCustomerApprovalRequest
  ): Observable<AssignVendorApiResponse<SubmitForCustomerApprovalResponse>> {
    return this.http
      .post<AssignVendorApiResponse<SubmitForCustomerApprovalResponse>>(
        `${this.onSiteEstimateBase}/submit-for-customer-approval`,
        request
      )
      .pipe(
        timeout(AssignVendorService.EXTENDED_TIMEOUT_MS),
        catchError(this.handleError<AssignVendorApiResponse<SubmitForCustomerApprovalResponse>>('submitOnSiteEstimateForCustomerApproval'))
      );
  }

  /**
   * POST /create-customer-estimate — Creates a customer estimate from a vendor estimate.
   * Applies markup percentages and adjusts labor hours to meet minimum margins.
   */
  createCustomerEstimate(
    request: CreateCustomerEstimateRequest
  ): Observable<AssignVendorApiResponse<CreateCustomerEstimateResponse>> {
    return this.http
      .post<AssignVendorApiResponse<CreateCustomerEstimateResponse>>(
        `${this.onSiteEstimateBase}/create-customer-estimate`,
        request
      )
      .pipe(
        timeout(AssignVendorService.EXTENDED_TIMEOUT_MS),
        catchError(this.handleError<AssignVendorApiResponse<CreateCustomerEstimateResponse>>('createCustomerEstimate'))
      );
  }

  /**
   * GET /preview-customer-estimate/{vendorEstimateKey} — Computes what a customer estimate
   * WOULD look like (customer rates, markup %, admin fee) from a vendor estimate WITHOUT
   * persisting anything. Used to populate the Create Customer Estimate modal before the
   * admin commits with Save / Save & Send.
   *
   * BACKEND TODO: this endpoint does not exist yet. Until it does, the modal falls back to
   * `createCustomerEstimate` (which DOES persist) — see CreateCustomerEstimateModalComponent.
   */
  previewCustomerEstimate(
    vendorEstimateKey: string
  ): Observable<AssignVendorApiResponse<CreateCustomerEstimateResponse>> {
    return this.http
      .get<AssignVendorApiResponse<CreateCustomerEstimateResponse>>(
        `${this.onSiteEstimateBase}/preview-customer-estimate/${vendorEstimateKey}`
      )
      .pipe(
        timeout(AssignVendorService.EXTENDED_TIMEOUT_MS),
        catchError(this.handleError<AssignVendorApiResponse<CreateCustomerEstimateResponse>>('previewCustomerEstimate'))
      );
  }

  /**
   * POST /preview-customer-estimate-multi-vendor — Computes what a MERGED customer estimate
   * would look like from multiple vendor estimates ("Combine Vendor Estimates") WITHOUT
   * persisting anything. Requires 2+ vendorEstimateKeys.
   */
  previewMultiVendorCustomerEstimate(
    vendorEstimateKeys: string[]
  ): Observable<AssignVendorApiResponse<CreateCustomerEstimateResponse>> {
    return this.http
      .post<AssignVendorApiResponse<CreateCustomerEstimateResponse>>(
        `${this.onSiteEstimateBase}/preview-customer-estimate-multi-vendor`,
        { vendorEstimateKeys }
      )
      .pipe(
        timeout(AssignVendorService.EXTENDED_TIMEOUT_MS),
        catchError(this.handleError<AssignVendorApiResponse<CreateCustomerEstimateResponse>>('previewMultiVendorCustomerEstimate'))
      );
  }

  /**
   * GET /customer-estimate/{jobKey} — Returns the existing customer estimate for a job
   * read-only, or creates one from vendorEstimateKey if none exists yet.
   */
  getCustomerEstimate(
    jobKey: string,
    vendorEstimateKey?: string
  ): Observable<AssignVendorApiResponse<CreateCustomerEstimateResponse>> {
    let params = new HttpParams();
    if (vendorEstimateKey) {
      params = params.set('vendorEstimateKey', vendorEstimateKey);
    }
    return this.http
      .get<AssignVendorApiResponse<CreateCustomerEstimateResponse>>(
        `${this.onSiteEstimateBase}/customer-estimate/${jobKey}`,
        { params }
      )
      .pipe(
        timeout(AssignVendorService.EXTENDED_TIMEOUT_MS),
        catchError(this.handleError<AssignVendorApiResponse<CreateCustomerEstimateResponse>>('getCustomerEstimate'))
      );
  }

  /**
   * GET /customer-estimate-history/{jobKey} — Returns the job's current live customer estimate plus,
   * if it superseded one, a read-only summary of the immediately-previous archived version (one level).
   */
  getCustomerEstimateHistory(
    jobKey: string
  ): Observable<AssignVendorApiResponse<CustomerEstimateHistoryResponse>> {
    return this.http
      .get<AssignVendorApiResponse<CustomerEstimateHistoryResponse>>(
        `${this.onSiteEstimateBase}/customer-estimate-history/${jobKey}`
      )
      .pipe(
        timeout(AssignVendorService.EXTENDED_TIMEOUT_MS),
        catchError(this.handleError<AssignVendorApiResponse<CustomerEstimateHistoryResponse>>('getCustomerEstimateHistory'))
      );
  }

  /**
   * POST /send-customer-estimate-email — Sends customer estimate via email.
   * Includes approve/decline buttons and optional file attachments.
   */
  /**
   * GET /customer-estimate-recipients/{key} — the contacts that can receive this estimate,
   * for the admin to pick from before sending.
   */
  getCustomerEstimateRecipients(
    customerEstimateKey: string
  ): Observable<AssignVendorApiResponse<CustomerEstimateRecipientsResponse>> {
    return this.http
      .get<AssignVendorApiResponse<CustomerEstimateRecipientsResponse>>(
        `${this.onSiteEstimateBase}/customer-estimate-recipients/${customerEstimateKey}`
      )
      .pipe(
        catchError(
          this.handleError<AssignVendorApiResponse<CustomerEstimateRecipientsResponse>>(
            'getCustomerEstimateRecipients'
          )
        )
      );
  }

  /**
   * GET /customer-estimate-attachments/{key} — files attachable to this estimate's email, split
   * into job files and vendor uploads. The two are keyed differently (FileKey vs UploadKey) and
   * must be sent back in their matching request lists.
   */
  getCustomerEstimateAttachments(
    customerEstimateKey: string
  ): Observable<AssignVendorApiResponse<CustomerEstimateAttachmentsResponse>> {
    return this.http
      .get<AssignVendorApiResponse<CustomerEstimateAttachmentsResponse>>(
        `${this.onSiteEstimateBase}/customer-estimate-attachments/${customerEstimateKey}`
      )
      .pipe(
        catchError(
          this.handleError<AssignVendorApiResponse<CustomerEstimateAttachmentsResponse>>(
            'getCustomerEstimateAttachments'
          )
        )
      );
  }

  sendCustomerEstimateEmail(
    request: SendCustomerEstimateEmailRequest
  ): Observable<AssignVendorApiResponse<SendCustomerEstimateEmailResponse>> {
    return this.http
      .post<AssignVendorApiResponse<SendCustomerEstimateEmailResponse>>(
        `${this.onSiteEstimateBase}/send-customer-estimate-email`,
        request
      )
      .pipe(
        timeout(AssignVendorService.EXTENDED_TIMEOUT_MS),
        catchError(this.handleError<AssignVendorApiResponse<SendCustomerEstimateEmailResponse>>('sendCustomerEstimateEmail'))
      );
  }

  /**
   * PUT /update-customer-estimate — Updates customer estimate line items (qty, rate, amount).
   */
  updateCustomerEstimate(
    request: UpdateCustomerEstimateRequest
  ): Observable<AssignVendorApiResponse<UpdateCustomerEstimateResponse>> {
    return this.http
      .put<AssignVendorApiResponse<UpdateCustomerEstimateResponse>>(
        `${this.onSiteEstimateBase}/update-customer-estimate`,
        request
      )
      .pipe(
        timeout(AssignVendorService.EXTENDED_TIMEOUT_MS),
        catchError(this.handleError<AssignVendorApiResponse<UpdateCustomerEstimateResponse>>('updateCustomerEstimate'))
      );
  }

  /**
   * POST /approve-vendor-estimate — Approves vendor estimate directly (skips customer).
   * Validates against 65% customer DNE rule.
   */
  approveOnSiteVendorEstimate(
    request: ApproveVendorEstimateRequest
  ): Observable<AssignVendorApiResponse<ApproveVendorEstimateResponse>> {
    return this.http
      .post<AssignVendorApiResponse<ApproveVendorEstimateResponse>>(
        `${this.onSiteEstimateBase}/approve-vendor-estimate`,
        request
      )
      .pipe(
        timeout(AssignVendorService.EXTENDED_TIMEOUT_MS),
        catchError(this.handleError<AssignVendorApiResponse<ApproveVendorEstimateResponse>>('approveOnSiteVendorEstimate'))
      );
  }

  /**
   * GET /edit-estimate/{estimateKey} — Load existing estimate for editing.
   * Returns all line items and metadata.
   */
  loadEstimateForEdit(
    estimateKey: string
  ): Observable<AssignVendorApiResponse<EditEstimateResponse>> {
    return this.http
      .get<AssignVendorApiResponse<EditEstimateResponse>>(
        `${this.onSiteEstimateBase}/edit-estimate/${estimateKey}`
      )
      .pipe(
        timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
        catchError(this.handleError<AssignVendorApiResponse<EditEstimateResponse>>('loadEstimateForEdit'))
      );
  }

  /**
   * PUT /update-estimate — Update an existing estimate.
   * Archives the current version before applying changes.
   */
  updateOnSiteEstimate(
    request: UpdateEstimateRequest
  ): Observable<AssignVendorApiResponse<UpdateEstimateResponse>> {
    return this.http
      .put<AssignVendorApiResponse<UpdateEstimateResponse>>(
        `${this.onSiteEstimateBase}/update-estimate`,
        request
      )
      .pipe(
        timeout(AssignVendorService.EXTENDED_TIMEOUT_MS),
        catchError(this.handleError<AssignVendorApiResponse<UpdateEstimateResponse>>('updateOnSiteEstimate'))
      );
  }

  /**
   * POST /upload-files — Uploads files for the estimate (multipart/form-data).
   * Supports vendor estimate documents, sign-off sheets, and job pictures.
   */
  uploadOnSiteEstimateFiles(
    tempEstimateKey: string,
    documentTypeKey: string,
    files: File[],
    jobKey?: string,
    vendorKey?: string
  ): Observable<AssignVendorApiResponse<UploadEstimateFilesResponse>> {
    const formData = new FormData();
    formData.append('tempEstimateKey', tempEstimateKey);
    formData.append('documentTypeKey', documentTypeKey);
    
    // Backend requires jobKey and vendorKey (not documented, but validated)
    if (jobKey) formData.append('jobKey', jobKey);
    if (vendorKey) formData.append('vendorKey', vendorKey);
    
    // Use 'files' (without brackets) - matches other file upload endpoints in this service
    files.forEach(file => formData.append('files', file, file.name));

    return this.http
      .post<AssignVendorApiResponse<UploadEstimateFilesResponse>>(
        `${this.onSiteEstimateBase}/upload-files`,
        formData
      )
      .pipe(
        timeout(AssignVendorService.EXTENDED_TIMEOUT_MS),
        catchError(this.handleError<AssignVendorApiResponse<UploadEstimateFilesResponse>>('uploadOnSiteEstimateFiles'))
      );
  }

  /**
   * GET /files/{jobKey}?vendorKey=... — Gets list of uploaded files for the estimate.
   */
  getOnSiteEstimateFiles(jobKey: string, vendorKey: string): Observable<AssignVendorApiResponse<EstimateUploadedFile[]>> {
    const params = new HttpParams().set('vendorKey', vendorKey);
    return this.http
      .get<AssignVendorApiResponse<EstimateUploadedFile[]>>(
        `${this.onSiteEstimateBase}/files/${jobKey}`,
        { params }
      )
      .pipe(catchError(this.handleError<AssignVendorApiResponse<EstimateUploadedFile[]>>('getOnSiteEstimateFiles')));
  }

  /**
   * DELETE /files/{uploadKey} — Deletes a single uploaded file.
   */
  deleteOnSiteEstimateFile(uploadKey: string): Observable<StringResponse> {
    return this.http
      .delete<StringResponse>(`${this.onSiteEstimateBase}/files/${uploadKey}`)
      .pipe(catchError(this.handleError<StringResponse>('deleteOnSiteEstimateFile')));
  }

  // ──────────────────────────────────────────────────────────────
  //  Customer Markup Endpoints
  // ──────────────────────────────────────────────────────────────

  /**
   * GET /customer-markups — Gets all customer markups.
   * Returns markup percentages for all active customers.
   */
  getAllCustomerMarkups(): Observable<AssignVendorApiResponse<CustomerMarkupResponse[]>> {
    return this.http
      .get<AssignVendorApiResponse<CustomerMarkupResponse[]>>(
        `${this.onSiteEstimateBase}/customer-markups`
      )
      .pipe(catchError(this.handleError<AssignVendorApiResponse<CustomerMarkupResponse[]>>('getAllCustomerMarkups')));
  }

  /**
   * GET /customer-markups/{customerKey} — Gets customer markup by customer key.
   */
  getCustomerMarkupByKey(customerKey: string): Observable<AssignVendorApiResponse<CustomerMarkupResponse>> {
    return this.http
      .get<AssignVendorApiResponse<CustomerMarkupResponse>>(
        `${this.onSiteEstimateBase}/customer-markups/${customerKey}`
      )
      .pipe(catchError(this.handleError<AssignVendorApiResponse<CustomerMarkupResponse>>('getCustomerMarkupByKey')));
  }

  /**
   * GET /customer-markups/by-job/{jobKey} — Gets customer markup by job key.
   * This is the primary method used when creating customer estimates from vendor estimates.
   */
  getCustomerMarkupByJobKey(jobKey: string): Observable<AssignVendorApiResponse<CustomerMarkupResponse>> {
    return this.http
      .get<AssignVendorApiResponse<CustomerMarkupResponse>>(
        `${this.onSiteEstimateBase}/customer-markups/by-job/${jobKey}`
      )
      .pipe(catchError(this.handleError<AssignVendorApiResponse<CustomerMarkupResponse>>('getCustomerMarkupByJobKey')));
  }

  /**
   * GET /customer-markups/statistics — Gets customer markup statistics.
   * Returns aggregate statistics for reporting/analytics.
   */
  getCustomerMarkupStatistics(): Observable<AssignVendorApiResponse<CustomerMarkupStatisticsResponse>> {
    return this.http
      .get<AssignVendorApiResponse<CustomerMarkupStatisticsResponse>>(
        `${this.onSiteEstimateBase}/customer-markups/statistics`
      )
      .pipe(catchError(this.handleError<AssignVendorApiResponse<CustomerMarkupStatisticsResponse>>('getCustomerMarkupStatistics')));
  }

  /**
   * Get vendor rates using legacy-style hierarchical fallback logic.
   * This matches the ProjectRCS behavior:
   * 1. VendorTrade (specific trade)
   * 2. VendorTrade ("All Trades" fallback)
   * 3. VendorRates (general)
   * 4. $0 fallback
   * 
   * GET /api/v1/admin/on-site-approval/vendor-rates-legacy?vendorKey={guid}&tradeKey={guid}&jobTypeKey={guid}
   */
  getVendorRatesLegacy(
    vendorKey: string,
    tradeKey?: string,
    jobTypeKey?: string,
  ): Observable<AssignVendorApiResponse<VendorRateLegacyResponse>> {
    let params = new HttpParams().set('vendorKey', vendorKey);
    if (tradeKey) {
      params = params.set('tradeKey', tradeKey);
    }
    if (jobTypeKey) {
      params = params.set('jobTypeKey', jobTypeKey);
    }

    return this.http
      .get<AssignVendorApiResponse<VendorRateLegacyResponse>>(
        `${this.onSiteEstimateBase}/vendor-rates-legacy`,
        { params }
      )
      .pipe(catchError(this.handleError<AssignVendorApiResponse<VendorRateLegacyResponse>>('getVendorRatesLegacy')));
  }

  // ──────────────────────────────────────────────────────────────
  //  Additional Approval Workflow
  // ──────────────────────────────────────────────────────────────

  /**
   * POST /save-vendor-approval-data — Saves additional approval data after estimate approval.
   * Maps approval option to invoice type, creates/finds work order, updates job status.
   */
  saveVendorApprovalData(
    request: SaveVendorApprovalDataRequest
  ): Observable<AssignVendorApiResponse<SaveVendorApprovalDataResponse>> {
    return this.http
      .post<AssignVendorApiResponse<SaveVendorApprovalDataResponse>>(
        `${this.onSiteEstimateBase}/save-vendor-approval-data`,
        request
      )
      .pipe(
        timeout(AssignVendorService.EXTENDED_TIMEOUT_MS),
        catchError(this.handleError<AssignVendorApiResponse<SaveVendorApprovalDataResponse>>('saveVendorApprovalData'))
      );
  }

  /**
   * GET /check-before-checkout — Checks if vendor is checked in before allowing checkout.
   */
  checkBeforeCheckout(
    jobKey: string,
    vendorKey: string
  ): Observable<AssignVendorApiResponse<CheckBeforeActionResponse>> {
    const params = new HttpParams()
      .set('jobKey', jobKey)
      .set('vendorKey', vendorKey);
    
    return this.http
      .get<AssignVendorApiResponse<CheckBeforeActionResponse>>(
        `${this.onSiteEstimateBase}/check-before-checkout`,
        { params }
      )
      .pipe(
        timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
        catchError(this.handleError<AssignVendorApiResponse<CheckBeforeActionResponse>>('checkBeforeCheckout'))
      );
  }

  /**
   * GET /check-before-create-invoice — Checks if vendor is checked out before allowing invoice creation.
   */
  checkBeforeCreateInvoice(
    jobKey: string,
    vendorKey: string
  ): Observable<AssignVendorApiResponse<CheckBeforeActionResponse>> {
    const params = new HttpParams()
      .set('jobKey', jobKey)
      .set('vendorKey', vendorKey);
    
    return this.http
      .get<AssignVendorApiResponse<CheckBeforeActionResponse>>(
        `${this.onSiteEstimateBase}/check-before-create-invoice`,
        { params }
      )
      .pipe(
        timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
        catchError(this.handleError<AssignVendorApiResponse<CheckBeforeActionResponse>>('checkBeforeCreateInvoice'))
      );
  }

  /**
   * POST /save-tech-check-in — Creates a tech check-in record.
   */
  saveTechCheckIn(
    request: SaveTechCheckInRequest
  ): Observable<AssignVendorApiResponse<any>> {
    return this.http
      .post<AssignVendorApiResponse<any>>(
        `${this.onSiteEstimateBase}/save-tech-check-in`,
        request
      )
      .pipe(
        timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
        catchError(this.handleError<AssignVendorApiResponse<any>>('saveTechCheckIn'))
      );
  }

  /**
   * POST /save-tech-check-out — Updates check-in record with checkout info.
   */
  saveTechCheckOut(
    request: SaveTechCheckOutRequest
  ): Observable<AssignVendorApiResponse<any>> {
    return this.http
      .post<AssignVendorApiResponse<any>>(
        `${this.onSiteEstimateBase}/save-tech-check-out`,
        request
      )
      .pipe(
        timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
        catchError(this.handleError<AssignVendorApiResponse<any>>('saveTechCheckOut'))
      );
  }

  // ──────────────────────────────────────────────────────────────
  //  Work Order Email
  // ──────────────────────────────────────────────────────────────

  /**
   * GET /email-work-order-to-vendor/{workOrderKey} — Gets email compose data.
   */
  getEmailWorkOrderCompose(
    workOrderKey: string,
    invoiceType: number,
    jobStatusTrigger: number
  ): Observable<AssignVendorApiResponse<EmailWorkOrderComposeResponse>> {
    const params = new HttpParams()
      .set('invoiceType', invoiceType.toString())
      .set('jobStatusTrigger', jobStatusTrigger.toString());

    return this.http
      .get<AssignVendorApiResponse<EmailWorkOrderComposeResponse>>(
        `${environment.apiBaseUrl}/api/v1/admin/work-order/email-work-order-to-vendor/${workOrderKey}`,

        { params }
      )
      .pipe(
        timeout(AssignVendorService.REQUEST_TIMEOUT_MS),
        catchError(this.handleError<AssignVendorApiResponse<EmailWorkOrderComposeResponse>>('getEmailWorkOrderCompose'))
      );
  }

  /**
   * POST /email-work-order-to-vendor — Sends work order email to vendor contacts (Additional Approval workflow).
   */
  sendEmailToVendor(
    request: WorkOrderEmailRequest
  ): Observable<AssignVendorApiResponse<SendWorkOrderEmailResponse>> {
    return this.http
      .post<AssignVendorApiResponse<SendWorkOrderEmailResponse>>(
        `${environment.apiBaseUrl}/api/v1/admin/work-order/email-work-order-to-vendor`,
        request
      )
      .pipe(
        timeout(AssignVendorService.EXTENDED_TIMEOUT_MS),
        catchError(this.handleError<AssignVendorApiResponse<SendWorkOrderEmailResponse>>('sendEmailToVendor'))
      );
  }
}
