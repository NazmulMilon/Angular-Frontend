import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, BehaviorSubject, Subject, tap, catchError, of, timeout, TimeoutError, map, finalize, forkJoin } from 'rxjs';
import {
  NotesActivityApiResponse,
  ApiErrorDetail,
  NotesActivityPageContext,
  JobHeaderDetail,
  NoteItem,
  NoteType,
  ConsolidatedNotes,
  ContactItem,
  VendorContactItem,
  CustomerContactItem,
  LocationContactItem,
  JobFileItem,
  VendorFileItem,
  NoteTemplate,
  SaveNoteRequest,
  PinNoteRequest,
  SetNoteViewedRequest,
  DeleteNoteRequest,
  SendInternalEmailRequest,
  SendCustomerEmailRequest,
  SendVendorEmailRequest,
  SendLocationEmailRequest,
  SendAccountingEmailRequest,
  DataReturn,
  SendEmailResponse,
  FileUploadResponse,
  JobVendorOption,
  UnreadCounts,
  NoteWebSocketEvent,
  SaveAndEmailRequest,
  SaveAndEmailApiResponse,
  SaveAndEmailResponse,
} from '../models/notes-activity.model';
import { environment } from '../../environments/environment';

/** API response types matching Job Ops API */
interface ApiNoteDto {
  pKey: string;
  jobKey: string;
  addedBy: string | null;
  addedOn: string | null;
  dateInString: string | null;
  comment: string | null;
  title: string | null;
  fromMsg: string | null;
  toMsg: string | null;
  fileLinks: string | null;
  pinned: boolean | null;
  isNew: boolean | null;
  isCustomerMessegeNew: boolean | null;
  setviewed: string | null;
  msgType: number;
  bgColor: string | null;
  msgSource: string | null;
  addedByName: string | null;
  vendorKey: string | null;
  /** Optional; returned by accounting-notes endpoint (`NoteDto.AccountingPersonKey`). */
  accountingPersonKey: string | null;
  /** Server-computed; only populated by GET .../notes/accounting (`NoteDto.CanEditAccountingNote`). */
  canEditAccountingNote: boolean | null;
  customerKey: string | null;
  totalCount: number;
}

interface ApiNotesPagedResponse {
  notes: ApiNoteDto[];
  totalCount: number;
  pageNumber: number;
  pageSize: number;
  totalPages: number;
}

interface ApiJobHeaderDto {
  jobKey: string;
  jobName: string | null;
  po: string | null;
  description: string | null;
  entryDate: string | null;
  scheduleDate: string | null;
  jobStatus: string | null;
  customerName: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  locationName: string | null;
  locationAddress: string | null;
  locationCity: string | null;
  locationState: string | null;
  locationZip: string | null;
  locationContactName: string | null;
  locationContactPhone: string | null;
  accountManagerName: string | null;
  accountManagerEmail: string | null;
  vendorCount: number;
}

interface ApiInternalContactDto {
  contactKey: string;
  contactName: string | null;
  email: string | null;
  designation: string | null;
  isAccountManager: boolean | null;
  isJobAccountManager: boolean;
  isSelected: boolean;
}

interface ApiVendorContactDto {
  contactKey: string;
  contactName: string | null;
  email: string | null;
  vendorKey: string;
  vendorName: string | null;
  isDefault: boolean;
  vendorJobStatus: string | null;
  isSelected: boolean;
}

interface ApiCustomerContactDto {
  contactKey: string;
  contactName: string | null;
  email: string | null;
  isDefault: boolean;
  getUpdates: boolean | null;
  customerName: string | null;
  isSelected: boolean;
  isJobCustomerContact: boolean;
  isJobRequester: boolean;
}

interface ApiLocationContactDto {
  contactKey: string;
  contactName: string | null;
  email: string | null;
  isDefault: boolean;
  locationName: string | null;
  locationAddress: string | null;
  locationCity: string | null;
  locationState: string | null;
  locationZip: string | null;
  isSelected: boolean;
}

interface ApiAccountingContactDto {
  contactKey: string;
  contactName: string | null;
  email: string | null;
  designation: string | null;
  isSelected: boolean;
}

interface ApiJobFileDto {
  fileKey: string;
  jobKey: string;
  fileName: string | null;
  fileType: string | null;
  title: string | null;
  comment: string | null;
  addedOn: string | null;
  addedByName: string | null;
  documentType: string | null;
  source: string | null;
}

interface ApiNoteTemplateDto {
  templateKey: number;
  templateName: string | null;
  detailContent: string | null;
}

interface ApiVendorMessageDto {
  pKey: string;
  jobKey: string;
  addedBy: string | null;
  addedOn: string | null;
  comment: string | null;
  title: string | null;
  fromMsg: string | null;
  toMsg: string | null;
  pinned: boolean | null;
  isNew: boolean | null;
  vendorKey: string | null;
  addedByName: string | null;
  designation: string | null;
  /** 1/true = admin-originated (MsgType 3); 0/false = vendor-originated (MsgType 11). */
  isAdmin: number | boolean;
  source: string | null;
  isRead: boolean | null;
  readAt: string | null;
  vendorName: string | null;
  bgColor: string | null;
}

interface ApiCustomerMessageDto {
  pKey: string;
  jobKey: string;
  addedBy: string | null;
  addedOn: string | null;
  comment: string | null;
  title: string | null;
  fromMsg: string | null;
  toMsg: string | null;
  pinned: boolean | null;
  isNew: boolean | null;
  customerKey: string | null;
  addedByName: string | null;
  designation: string | null;
  isAdmin: number;
  source: string | null;
  customerName: string | null;
  bgColor: string | null;
}

interface ApiInternalMessageDto {
  pKey: string;
  jobKey: string;
  addedBy: string | null;
  addedOn: string | null;
  comment: string | null;
  title: string | null;
  fromMsg: string | null;
  toMsg: string | null;
  pinned: boolean | null;
  isNew: boolean | null;
  addedByName: string | null;
  designation: string | null;
  isAdmin: number;
  source: string | null;
}

/** Generic API wrapper response from Job Ops API */
interface ApiWrapper<T> {
  status: boolean;
  responseCode: number;
  message: string;
  data: T;
  details: unknown[];
  unixTime: number;
  traceId: string | null;
}

type PageContextResponse = NotesActivityApiResponse<NotesActivityPageContext>;
type JobHeaderDetailResponse = NotesActivityApiResponse<JobHeaderDetail>;
type NotesListResponse = NotesActivityApiResponse<NoteItem[]>;
type ConsolidatedNotesResponse = NotesActivityApiResponse<ConsolidatedNotes>;
type ContactListResponse = NotesActivityApiResponse<ContactItem[]>;
type VendorContactListResponse = NotesActivityApiResponse<VendorContactItem[]>;
type CustomerContactListResponse = NotesActivityApiResponse<CustomerContactItem[]>;
type LocationContactListResponse = NotesActivityApiResponse<LocationContactItem[]>;
type JobFileListResponse = NotesActivityApiResponse<JobFileItem[]>;
type VendorFileListResponse = NotesActivityApiResponse<VendorFileItem[]>;
type TemplateListResponse = NotesActivityApiResponse<NoteTemplate[]>;
type DataReturnResponse = NotesActivityApiResponse<DataReturn>;
type SendEmailResponseType = NotesActivityApiResponse<SendEmailResponse>;
type JobVendorListResponse = NotesActivityApiResponse<JobVendorOption[]>;
type UnreadCountsResponse = NotesActivityApiResponse<UnreadCounts>;
type FileUploadResponseType = NotesActivityApiResponse<FileUploadResponse>;

/**
 * Angular HTTP service for the Notes & Activity feature.
 *
 * **Important:** All calls use `/api/v2/admin-activity/...` on the configured Job Ops base URL.
 * Assign Vendor uses **`/api/v1/admin/job-vendor`** instead. UAT/prod can expose one without the
 * other; if assign-vendor loads but this page stays empty, check admin-activity routes, auth, and
 * deployment — not the Angular token (same `AuthTokenService` / interceptor for both).
 *
 * Maps to Job Ops API endpoints: /api/v2/admin-activity/jobs/{jobKey}/...
 * 
 * API Endpoints used (from existing AdminActivityController):
 * - GET /jobs/{jobKey}/notes - All notes (paginated)
 * - GET /jobs/{jobKey}/notes/pinned - Pinned notes
 * - GET /jobs/{jobKey}/header - Job header details
 * - GET /jobs/{jobKey}/messaging/vendor - Vendor messaging
 * - GET /jobs/{jobKey}/messaging/customer - Customer messaging
 * - GET /jobs/{jobKey}/messaging/internal - Internal messaging
 * - GET /jobs/{jobKey}/contacts/* - Contact lists
 * - GET /jobs/{jobKey}/files - Job files
 * - GET /jobs/{jobKey}/files/vendor - Vendor files
 * - GET /templates - Note templates
 * - POST /jobs/{jobKey}/notes - Create note
 * - POST /jobs/{jobKey}/notes/{noteKey}/pin - Pin note
 * - DELETE /jobs/{jobKey}/notes/{noteKey}/pin - Unpin note
 * - POST /jobs/{jobKey}/notes/{noteKey}/viewed - Mark viewed
 * - DELETE /jobs/{jobKey}/notes/{noteKey} - Delete note
 */
@Injectable({ providedIn: 'root' })
export class NotesActivityService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/v2/admin-activity`;
  /**
   * Base for the "🏷 Notes To Accounting" create/edit endpoints, which live on
   * AdminAccountingInvoiceCustomerController (RFIJobOps), not AdminActivityController — the read
   * side (getAccountingNotes above) stays on `apiBase`/notes/accounting, unchanged and un-duplicated.
   */
  private readonly accountingNoteApiBase = `${environment.apiBaseUrl}/api/v1/admin/accounting/invoice-customer`;
  private readonly DEFAULT_TIMEOUT = 120000; // 2 minutes

  // WebSocket connection for real-time updates
  private webSocket: WebSocket | null = null;
  private readonly wsEvents$ = new Subject<NoteWebSocketEvent>();

  // Real-time data streams
  private readonly _pageContext$ = new BehaviorSubject<NotesActivityPageContext | null>(null);
  private readonly _jobHeaderDetail$ = new BehaviorSubject<JobHeaderDetail | null>(null);
  private readonly _consolidatedNotes$ = new BehaviorSubject<ConsolidatedNotes | null>(null);
  private readonly _unreadCounts$ = new BehaviorSubject<UnreadCounts>({ internal: 0, vendor: 0, customer: 0, location: 0, all: 0 });
  private readonly _isLoading$ = new BehaviorSubject<boolean>(false);

  readonly pageContext$ = this._pageContext$.asObservable();
  readonly jobHeaderDetail$ = this._jobHeaderDetail$.asObservable();
  readonly consolidatedNotes$ = this._consolidatedNotes$.asObservable();
  readonly unreadCounts$ = this._unreadCounts$.asObservable();
  readonly isLoading$ = this._isLoading$.asObservable();
  readonly noteEvents$ = this.wsEvents$.asObservable();

  // ──────────────────────────────────────────────────────────────
  //  Page Initialization
  // ──────────────────────────────────────────────────────────────

  /**
   * Initialize the Notes & Activity page for a specific job.
   * Uses GET /jobs/{jobKey}/header to get job header details.
   */
  initializePage(jobKey: string): Observable<PageContextResponse> {
    this._isLoading$.next(true);
    
    return this.http.get<ApiWrapper<ApiJobHeaderDto>>(`${this.apiBase}/jobs/${jobKey}/header`).pipe(
      timeout(this.DEFAULT_TIMEOUT),
      map((response) => {
        const header = response?.data;
        const context: NotesActivityPageContext = {
          jobKey: header?.jobKey ?? jobKey,
          jobName: header?.jobName ?? '',
          locationKey: null,
          customerKey: null,
          tradeName: null,
          locationDetail: header?.locationAddress ?? null,
          isPrimary: 0,
          primaryVendorKey: '',
        };
        this._pageContext$.next(context);
        
        return {
          status: true,
          responseCode: 200,
          message: 'Success',
          data: context,
          details: [],
          unixTime: Date.now(),
          traceId: null,
        } as PageContextResponse;
      }),
      catchError((err) => this.handleError<PageContextResponse>(err, 'initializePage')),
      finalize(() => this._isLoading$.next(false))
    );
  }

  /**
   * Get detailed job header information.
   * Uses GET /jobs/{jobKey}/header
   */
  getJobHeaderDetail(jobKey: string): Observable<JobHeaderDetailResponse> {
    return this.http.get<ApiWrapper<ApiJobHeaderDto>>(`${this.apiBase}/jobs/${jobKey}/header`).pipe(
      timeout(this.DEFAULT_TIMEOUT),
      map((response) => {
        const header = response?.data;
        const detail: JobHeaderDetail = {
          po: header?.po ?? null,
          jobStatusName: header?.jobStatus ?? null,
          jobTypeName: null,
          customerDne: null,
          revCustomerDne: null,
          serviceRequest: header?.description ?? null,
          serviceRequestPreview: header?.description?.substring(0, 100) ?? null,
          customerName: header?.customerName ?? null,
          customerContactName: header?.contactName ?? null,
          customerContactTitle: null,
          customerContactEmail: header?.contactEmail ?? null,
          customerContactPhone: header?.contactPhone ?? null,
          customerContactPhoneExt: null,
          customerContactAltPhone: null,
          customerContactAltPhoneExt: null,
          hasCustomerContract: false,
          customerContractKey: null,
          customerNotice: null,
          locationName: header?.locationName ?? null,
          locationAddress: header?.locationAddress ?? null,
          locationAddress2: null,
          cityName: header?.locationCity ?? null,
          stateName: header?.locationState ?? null,
          zipCode: header?.locationZip ?? null,
          locationPhone: header?.locationContactPhone ?? null,
          locationContactName: header?.locationContactName ?? null,
          locationContactTitle: null,
          locationContactEmail: null,
          locationContactPhone: header?.locationContactPhone ?? null,
          locationContactPhoneExt: null,
          locationContactAltPhone: null,
          locationContactAltPhoneExt: null,
          assignedVendors: [],
        };
        this._jobHeaderDetail$.next(detail);
        
        return {
          status: true,
          responseCode: 200,
          message: 'Success',
          data: detail,
          details: [],
          unixTime: Date.now(),
          traceId: null,
        } as JobHeaderDetailResponse;
      }),
      catchError((err) => this.handleError<JobHeaderDetailResponse>(err, 'getJobHeaderDetail'))
    );
  }

  // ──────────────────────────────────────────────────────────────
  //  Notes CRUD Operations
  // ──────────────────────────────────────────────────────────────

  /**
   * Get all consolidated notes for a job by fetching from multiple endpoints.
   * Uses: GET /messaging/internal, /messaging/vendor, /messaging/customer, /notes
   */
  getConsolidatedNotes(jobKey: string): Observable<ConsolidatedNotesResponse> {
    return forkJoin({
      internal: this.http.get<ApiWrapper<ApiInternalMessageDto[]>>(`${this.apiBase}/jobs/${jobKey}/messaging/internal`),
      vendor: this.http.get<ApiWrapper<ApiVendorMessageDto[]>>(`${this.apiBase}/jobs/${jobKey}/messaging/vendor`),
      customer: this.http.get<ApiWrapper<ApiCustomerMessageDto[]>>(`${this.apiBase}/jobs/${jobKey}/messaging/customer`),
      all: this.http.get<ApiWrapper<ApiNotesPagedResponse>>(`${this.apiBase}/jobs/${jobKey}/notes`),
    }).pipe(
      timeout(this.DEFAULT_TIMEOUT),
      map(({ internal, vendor, customer, all }) => {
        const consolidated: ConsolidatedNotes = {
          internalNotes: this.mapInternalMessages(internal?.data ?? []),
          vendorNotes: this.mapVendorMessages(vendor?.data ?? []),
          customerNotes: this.mapCustomerMessages(customer?.data ?? []),
          locationNotes: [],
          allNotes: this.mapApiNotes(all?.data?.notes ?? []),
        };
        
        this._consolidatedNotes$.next(consolidated);
        this.calculateUnreadCounts(consolidated);
        
        return {
          status: true,
          responseCode: 200,
          message: 'Success',
          data: consolidated,
          details: [],
          unixTime: Date.now(),
          traceId: null,
        } as ConsolidatedNotesResponse;
      }),
      catchError((err) => this.handleError<ConsolidatedNotesResponse>(err, 'getConsolidatedNotes'))
    );
  }

  /**
   * Get internal notes only.
   * Uses: GET /messaging/internal
   */
  getInternalNotes(jobKey: string): Observable<NotesListResponse> {
    return this.http.get<ApiWrapper<ApiInternalMessageDto[]>>(`${this.apiBase}/jobs/${jobKey}/messaging/internal`).pipe(
      timeout(this.DEFAULT_TIMEOUT),
      map((response) => this.wrapNotesResponse(this.mapInternalMessages(response?.data ?? []))),
      catchError((err) => this.handleError<NotesListResponse>(err, 'getInternalNotes'))
    );
  }

  /**
   * Get vendor notes for the job.
   * Uses: GET /jobs/{jobKey}/messaging/vendor
   *
   * @param vendorKey Optional: when set, filters mapped notes client-side to that vendor (e.g. legacy flows).
   *   Vendor tab uses a single call without `vendorKey` so the grid shows the full API payload.
   */
  getVendorNotes(jobKey: string, vendorKey?: string): Observable<NotesListResponse> {
    return this.http.get<ApiWrapper<ApiVendorMessageDto[]>>(`${this.apiBase}/jobs/${jobKey}/messaging/vendor`).pipe(
      timeout(this.DEFAULT_TIMEOUT),
      map((response) => {
        let notes = this.mapVendorMessages(response?.data ?? []);
        if (vendorKey) {
          notes = notes.filter(n => n.vendorKey === vendorKey);
        }
        return this.wrapNotesResponse(notes);
      }),
      catchError((err) => this.handleError<NotesListResponse>(err, 'getVendorNotes'))
    );
  }

  /**
   * Get customer notes.
   * Uses: GET /messaging/customer
   */
  getCustomerNotes(jobKey: string): Observable<NotesListResponse> {
    return this.http.get<ApiWrapper<ApiCustomerMessageDto[]>>(`${this.apiBase}/jobs/${jobKey}/messaging/customer`).pipe(
      timeout(this.DEFAULT_TIMEOUT),
      map((response) => this.wrapNotesResponse(this.mapCustomerMessages(response?.data ?? []))),
      catchError((err) => this.handleError<NotesListResponse>(err, 'getCustomerNotes'))
    );
  }

  /**
   * Get pinned notes for quick access.
   * Uses: GET /notes/pinned
   */
  getPinnedNotes(jobKey: string): Observable<NotesListResponse> {
    return this.http.get<ApiWrapper<ApiNoteDto[]>>(`${this.apiBase}/jobs/${jobKey}/notes/pinned`).pipe(
      timeout(this.DEFAULT_TIMEOUT),
      map((response) => this.wrapNotesResponse(this.mapApiNotes(response?.data ?? []))),
      catchError((err) => this.handleError<NotesListResponse>(err, 'getPinnedNotes'))
    );
  }

  /**
   * Get accounting notes for a job (Notes To Accounting accordion).
   * Uses: GET /jobs/{jobKey}/notes/accounting — Job Ops maps `sp_GetAccountingNotesForJob` rows to note DTOs
   * with MsgType 2 (RCS/internal accounting thread) or 8 (AdminAction / vendor-specific admin rows) so
   * {@link mapApiNotes} produces correct `noteType` / grid styling.
   */
  getAccountingNotes(jobKey: string): Observable<NotesListResponse> {
    return this.http.get<ApiWrapper<ApiNoteDto[]>>(`${this.apiBase}/jobs/${jobKey}/notes/accounting`).pipe(
      timeout(this.DEFAULT_TIMEOUT),
      map((response) => this.wrapNotesResponse(this.mapApiNotes(response?.data ?? []))),
      catchError((err) => this.handleError<NotesListResponse>(err, 'getAccountingNotes'))
    );
  }

  /**
   * Adds a new "🏷 Notes To Accounting" note to a job.
   * Uses: POST /api/v1/admin/accounting/invoice-customer/jobs/{jobKey}/notes/accounting
   * Server stamps the owner (authenticated PersonnelKey), Title ("Accounting Notes"), and
   * timestamp — only the comment text is sent. Returns the new note's key on success.
   */
  createAccountingNote(jobKey: string, comment: string): Observable<NotesActivityApiResponse<string | null>> {
    return this.http
      .post<ApiWrapper<string>>(`${this.accountingNoteApiBase}/jobs/${jobKey}/notes/accounting`, { comment })
      .pipe(
        timeout(this.DEFAULT_TIMEOUT),
        map((response) => ({
          status: response?.status ?? false,
          responseCode: response?.responseCode ?? 200,
          message: response?.message ?? 'Success',
          data: response?.data ?? null,
          details: (response?.details ?? []) as ApiErrorDetail[],
          unixTime: response?.unixTime ?? Date.now(),
          traceId: response?.traceId ?? null,
        })),
        catchError((err) => this.handleError<NotesActivityApiResponse<string | null>>(err, 'createAccountingNote'))
      );
  }

  /**
   * Edits the text of an existing "🏷 Notes To Accounting" note. The server re-checks that the
   * authenticated user owns the note (AdminActionNotes.VendorKey) and returns 403 if not.
   * Uses: PUT /api/v1/admin/accounting/invoice-customer/notes/accounting/{noteKey}
   */
  updateAccountingNote(noteKey: string, comment: string): Observable<NotesActivityApiResponse<boolean | null>> {
    return this.http
      .put<ApiWrapper<boolean>>(`${this.accountingNoteApiBase}/notes/accounting/${noteKey}`, { comment })
      .pipe(
        timeout(this.DEFAULT_TIMEOUT),
        map((response) => ({
          status: response?.status ?? false,
          responseCode: response?.responseCode ?? 200,
          message: response?.message ?? 'Success',
          data: response?.data ?? null,
          details: (response?.details ?? []) as ApiErrorDetail[],
          unixTime: response?.unixTime ?? Date.now(),
          traceId: response?.traceId ?? null,
        })),
        catchError((err) => this.handleError<NotesActivityApiResponse<boolean | null>>(err, 'updateAccountingNote'))
      );
  }

  /**
   * Save a new note (without sending email).
   * Uses: POST /jobs/{jobKey}/save
   * Same contract as saveAndEmail: JSON body, or multipart with `request` + `attachments` when files are present.
   */
  saveNote(request: SaveAndEmailRequest, uploadedFiles?: File[]): Observable<SaveAndEmailResponse> {
    const url = `${this.apiBase}/jobs/${request.jobKey}/save`;
    const hasUploads = uploadedFiles && uploadedFiles.length > 0;
    const body: SaveAndEmailRequest | FormData = hasUploads
      ? (() => {
          const formData = new FormData();
          formData.append('request', JSON.stringify(request));
          for (const file of uploadedFiles!) {
            formData.append('attachments', file, file.name);
          }
          return formData;
        })()
      : request;

    return this.http.post<ApiWrapper<SaveAndEmailApiResponse>>(url, body).pipe(
      timeout(this.DEFAULT_TIMEOUT),
      map(res => {
        // Extract the actual response from the wrapper's data property
        const actualResponse = res.data;
        return {
          status: actualResponse?.success ?? false,
          responseCode: actualResponse?.responseCode ?? res.responseCode ?? 200,
          message: actualResponse?.message || 'Note saved successfully',
          data: {
            success: actualResponse?.success ?? false,
            message: actualResponse?.message || 'Note saved successfully',
            results: actualResponse?.results,
          },
          details: [],
          unixTime: Date.now(),
          traceId: null,
        } as SaveAndEmailResponse;
      }),
      tap((res) => {
        if (res.status) {
          this.refreshNotesAfterChange(request.jobKey);
        }
      }),
      catchError((err) => this.handleError<SaveAndEmailResponse>(err, 'saveNote'))
    );
  }

  /**
   * Pin or unpin a note.
   * Uses: POST/DELETE /jobs/{jobKey}/notes/{noteKey}/pin?msgType={msgType}
   */
  togglePinNote(jobKey: string, request: PinNoteRequest): Observable<DataReturnResponse> {
    const endpoint = `${this.apiBase}/jobs/${jobKey}/notes/${request.noteKey}/pin`;
    const params = new HttpParams().set('msgType', request.msgType.toString());
    const obs = request.isPinned
      ? this.http.post<{ success: boolean; pinned: boolean }>(endpoint, null, { params })
      : this.http.delete<{ success: boolean; pinned: boolean }>(endpoint, { params });
    
    return obs.pipe(
      timeout(this.DEFAULT_TIMEOUT),
      map((res) => {
        this.refreshNotesAfterChange(jobKey);
        return {
          status: true,
          responseCode: 200,
          message: request.isPinned ? 'Note pinned' : 'Note unpinned',
          data: { flag: res.success ? 1 : 0, message: request.isPinned ? 'Note pinned' : 'Note unpinned', key: request.noteKey },
          details: [],
          unixTime: Date.now(),
          traceId: null,
        } as DataReturnResponse;
      }),
      catchError((err) => this.handleError<DataReturnResponse>(err, 'togglePinNote'))
    );
  }

  /**
   * Mark a note as viewed.
   * Uses: POST /jobs/{jobKey}/notes/{noteKey}/viewed?msgType={msgType}
   */
  setNoteViewed(jobKey: string, request: SetNoteViewedRequest): Observable<DataReturnResponse> {
    const params = new HttpParams().set('msgType', request.msgType.toString());
    return this.http
      .post<unknown>(
        `${this.apiBase}/jobs/${jobKey}/notes/${request.noteKey}/viewed`,
        null,
        { params },
      )
      .pipe(
        timeout(this.DEFAULT_TIMEOUT),
        map((res) => {
          const { ok, failMessage } = this.parseMarkViewedResponseBody(res);
          if (ok) {
            this.refreshNotesAfterChange(jobKey);
          }
          return {
            status: ok,
            responseCode: 200,
            message: ok ? 'Note marked as viewed' : (failMessage ?? 'Failed to mark message as viewed'),
            data: {
              flag: ok ? 1 : 0,
              message: ok ? 'Note marked as viewed' : (failMessage ?? 'Failed to mark message as viewed'),
              key: request.noteKey,
            },
            details: [],
            unixTime: Date.now(),
            traceId: null,
          } as DataReturnResponse;
        }),
        catchError((err) => this.handleError<DataReturnResponse>(err, 'setNoteViewed')),
      );
  }

  /**
   * Normalizes mark-viewed JSON whether the API returns a flat `{ success }` (controller
   * `Ok(new { success })`) or an envelope such as `{ status, message: "OK", data: { success } }`
   * from a gateway or shared wrapper. The flat-only check left `success` undefined so the UI
   * treated success as failure and showed the envelope's {@code message} ("OK") in the red alert.
   */
  private parseMarkViewedResponseBody(body: unknown): { ok: boolean; failMessage?: string } {
    if (body === null || typeof body !== 'object') {
      return { ok: false, failMessage: 'Invalid response from server.' };
    }
    const o = body as Record<string, unknown>;

    if (o['success'] === true) {
      return { ok: true };
    }
    if (o['success'] === false) {
      const m = typeof o['message'] === 'string' ? o['message'].trim() : '';
      return { ok: false, failMessage: m || 'Failed to mark message as viewed.' };
    }

    const data = o['data'];
    if (data && typeof data === 'object') {
      const d = data as Record<string, unknown>;
      if (d['success'] === true) {
        return { ok: true };
      }
      if (d['success'] === false) {
        const inner = typeof d['message'] === 'string' ? (d['message'] as string).trim() : '';
        const top = typeof o['message'] === 'string' ? (o['message'] as string).trim() : '';
        const combined = inner || top;
        return {
          ok: false,
          failMessage: combined || 'Failed to mark message as viewed.',
        };
      }
    }

    return { ok: false, failMessage: 'Failed to mark message as viewed.' };
  }

  /**
   * Delete a note (soft delete).
   * Uses: DELETE /jobs/{jobKey}/notes/{noteKey}?msgType={msgType}
   */
  deleteNote(jobKey: string, request: DeleteNoteRequest): Observable<DataReturnResponse> {
    const params = new HttpParams().set('msgType', request.msgType.toString());
    return this.http.delete(`${this.apiBase}/jobs/${jobKey}/notes/${request.noteKey}`, { params, observe: 'response' }).pipe(
      timeout(this.DEFAULT_TIMEOUT),
      map((res) => {
        this.refreshNotesAfterChange(jobKey);
        return {
          status: res.status === 204,
          responseCode: res.status,
          message: res.status === 204 ? 'Note deleted' : 'Failed to delete note',
          data: { flag: res.status === 204 ? 1 : 0, message: 'Note deleted', key: request.noteKey },
          details: [],
          unixTime: Date.now(),
          traceId: null,
        } as DataReturnResponse;
      }),
      catchError((err) => this.handleError<DataReturnResponse>(err, 'deleteNote'))
    );
  }

  // ──────────────────────────────────────────────────────────────
  //  Contact Lists for Email Sending
  // ──────────────────────────────────────────────────────────────

  /**
   * Get internal team contacts for email.
   * Uses: GET /contacts/internal
   */
  getInternalTeamContacts(jobKey: string, addedBy?: string): Observable<ContactListResponse> {
    let params = new HttpParams();
    if (addedBy) {
      params = params.set('addedBy', addedBy);
    }
    return this.http.get<ApiWrapper<ApiInternalContactDto[]>>(`${this.apiBase}/jobs/${jobKey}/contacts/internal`, { params }).pipe(
      timeout(this.DEFAULT_TIMEOUT),
      map((response) => {
        const data = Array.isArray(response?.data) ? response.data : [];
        return this.wrapContactsResponse(data.map(c => ({
          personnelKey: c.contactKey,
          staffName: c.contactName ?? '',
          email: c.email ?? '',
          isJobAccountManager: c.isJobAccountManager,
          isSelected: c.isSelected,
        })));
      }),
      catchError((err) => this.handleError<ContactListResponse>(err, 'getInternalTeamContacts'))
    );
  }

  /**
   * Get accounting personnel contacts.
   * Uses: GET /contacts/accounting
   */
  getAccountingContacts(jobKey: string, addedBy?: string): Observable<ContactListResponse> {
    let params = new HttpParams();
    if (addedBy) {
      params = params.set('addedBy', addedBy);
    }
    return this.http.get<ApiWrapper<ApiAccountingContactDto[]>>(`${this.apiBase}/jobs/${jobKey}/contacts/accounting`, { params }).pipe(
      timeout(this.DEFAULT_TIMEOUT),
      map((response) => {
        const data = Array.isArray(response?.data) ? response.data : [];
        return this.wrapContactsResponse(data.map(c => ({
          personnelKey: c.contactKey,
          staffName: c.contactName ?? '',
          email: c.email ?? '',
          isSelected: c.isSelected,
        })));
      }),
      catchError((err) => this.handleError<ContactListResponse>(err, 'getAccountingContacts'))
    );
  }

  /**
   * Get vendor contacts for email.
   * Uses: GET /contacts/vendor
   */
  getVendorContacts(jobKey: string, vendorKey?: string): Observable<VendorContactListResponse> {
    let params = new HttpParams();
    if (vendorKey) {
      params = params.set('addedBy', vendorKey);
    }
    return this.http.get<ApiWrapper<ApiVendorContactDto[]>>(`${this.apiBase}/jobs/${jobKey}/contacts/vendor`, { params }).pipe(
      timeout(this.DEFAULT_TIMEOUT),
      map((response) => {
        const data = Array.isArray(response?.data) ? response.data : [];
        return this.wrapVendorContactsResponse(data.map(c => ({
          vendorKey: c.vendorKey,
          contactKey: c.contactKey,
          vendorName: c.vendorName ?? '',
          contactName: c.contactName ?? '',
          email: c.email ?? '',
          isDefault: c.isDefault,
          isSelected: c.isSelected,
        })));
      }),
      catchError((err) => this.handleError<VendorContactListResponse>(err, 'getVendorContacts'))
    );
  }

  /**
   * Get customer contacts for email.
   * Uses: GET /contacts/customer
   */
  getCustomerContacts(jobKey: string): Observable<CustomerContactListResponse> {
    return this.http.get<ApiWrapper<ApiCustomerContactDto[]>>(`${this.apiBase}/jobs/${jobKey}/contacts/customer`).pipe(
      timeout(this.DEFAULT_TIMEOUT),
      map((response) => {
        const data = Array.isArray(response?.data) ? response.data : [];
        return this.wrapCustomerContactsResponse(data.map(c => ({
          customerKey: '',
          contactKey: c.contactKey,
          customerName: c.customerName ?? '',
          contactName: c.contactName ?? '',
          email: c.email ?? '',
          isDefault: c.isDefault,
          isJobCustomerContact: c.isJobCustomerContact,
          isJobRequester: c.isJobRequester,
          isSelected: c.isSelected,
        })));
      }),
      catchError((err) => this.handleError<CustomerContactListResponse>(err, 'getCustomerContacts'))
    );
  }

  /**
   * Get location contacts for email.
   * Uses: GET /contacts/location
   */
  getLocationContacts(jobKey: string): Observable<LocationContactListResponse> {
    return this.http.get<ApiWrapper<ApiLocationContactDto[]>>(`${this.apiBase}/jobs/${jobKey}/contacts/location`).pipe(
      timeout(this.DEFAULT_TIMEOUT),
      map((response) => {
        const data = Array.isArray(response?.data) ? response.data : [];
        return this.wrapLocationContactsResponse(data.map(c => ({
          locationKey: '',
          contactKey: c.contactKey,
          locationName: c.locationName ?? '',
          contactName: c.contactName ?? '',
          email: c.email ?? '',
          isSelected: c.isSelected,
        })));
      }),
      catchError((err) => this.handleError<LocationContactListResponse>(err, 'getLocationContacts'))
    );
  }

  // ──────────────────────────────────────────────────────────────
  //  File Operations
  // ──────────────────────────────────────────────────────────────

  /**
   * Get job files available for attachment.
   * Uses: GET /files
   */
  getJobFiles(jobKey: string): Observable<JobFileListResponse> {
    return this.http.get<ApiWrapper<ApiJobFileDto[]>>(`${this.apiBase}/jobs/${jobKey}/files`).pipe(
      timeout(this.DEFAULT_TIMEOUT),
      map((response) => {
        const data = Array.isArray(response?.data) ? response.data : [];
        return this.wrapJobFilesResponse(data.map(f => ({
          fileKey: f.fileKey,
          fileName: f.fileName,
          fileType: f.fileType,
          documentTypeName: f.documentType,
          addedOn: f.addedOn,
          addedByName: f.addedByName,
          fileSize: null,
        })));
      }),
      catchError((err) => this.handleError<JobFileListResponse>(err, 'getJobFiles'))
    );
  }

  /**
   * Get vendor files available for attachment.
   * Uses: GET /files/vendor
   */
  getVendorFiles(jobKey: string, vendorKey?: string): Observable<VendorFileListResponse> {
    return this.http.get<ApiWrapper<ApiJobFileDto[]>>(`${this.apiBase}/jobs/${jobKey}/files/vendor`).pipe(
      timeout(this.DEFAULT_TIMEOUT),
      map((response) => {
        const data = Array.isArray(response?.data) ? response.data : [];
        return this.wrapVendorFilesResponse(data.map(f => ({
          fileKey: f.fileKey,
          fileName: f.fileName,
          vendorKey: '',
          vendorName: f.source,
          uploadType: f.documentType,
          addedOn: f.addedOn,
          fileSize: null,
        })));
      }),
      catchError((err) => this.handleError<VendorFileListResponse>(err, 'getVendorFiles'))
    );
  }

  /**
   * Upload a file to the job.
   * Note: File upload endpoint may not exist yet - using placeholder
   */
  uploadFile(jobKey: string, file: File, documentTypeKey?: string): Observable<FileUploadResponseType> {
    const formData = new FormData();
    formData.append('file', file);
    if (documentTypeKey) {
      formData.append('documentTypeKey', documentTypeKey);
    }

    return this.http.post<any>(`${this.apiBase}/jobs/${jobKey}/files/upload`, formData).pipe(
      timeout(60000),
      map((res) => ({
        status: true,
        responseCode: 200,
        message: 'File uploaded',
        data: { success: true, fileKey: res.fileKey, fileName: file.name, message: 'File uploaded' },
        details: [],
        unixTime: Date.now(),
        traceId: null,
      } as FileUploadResponseType)),
      catchError((err) => this.handleError<FileUploadResponseType>(err, 'uploadFile'))
    );
  }

  /**
   * Download a file.
   * Note: This may need to use BlobFileService endpoint
   */
  downloadFile(jobKey: string, fileKey: string): Observable<Blob> {
    return this.http.get(`${this.apiBase}/jobs/${jobKey}/files/${fileKey}/download`, {
      responseType: 'blob',
    }).pipe(
      timeout(60000),
      catchError((err) => {
        console.error('downloadFile error:', err);
        throw err;
      })
    );
  }

  // ──────────────────────────────────────────────────────────────
  //  Email Operations
  // ──────────────────────────────────────────────────────────────

  /** API response from backend email endpoints */
  private mapEmailResponse(res: { success: boolean; message: string; responseCode: number; messageId?: string }): SendEmailResponseType {
    return {
      status: res.success,
      responseCode: res.responseCode,
      message: res.message,
      data: { 
        success: res.success, 
        message: res.message,
        noteKey: null,
        messageId: res.messageId ?? null 
      },
      details: [],
      unixTime: Date.now(),
      traceId: null,
    };
  }

  /**
   * Send note to internal team members.
   * Calls: POST /jobs/{jobKey}/email/send-internal
   */
  sendNoteToInternal(request: SendInternalEmailRequest): Observable<SendEmailResponseType> {
    return this.http.post<{ success: boolean; message: string; responseCode: number; messageId?: string }>(
      `${this.apiBase}/jobs/${request.jobKey}/email/send-internal`, 
      request
    ).pipe(
      timeout(this.DEFAULT_TIMEOUT),
      map(res => this.mapEmailResponse(res)),
      tap((res) => {
        if (res.status) {
          this.refreshNotesAfterChange(request.jobKey);
        }
      }),
      catchError((err) => this.handleError<SendEmailResponseType>(err, 'sendNoteToInternal'))
    );
  }

  /**
   * Send note to customer contacts.
   * Calls: POST /jobs/{jobKey}/email/send-customer
   */
  sendNoteToCustomer(request: SendCustomerEmailRequest): Observable<SendEmailResponseType> {
    return this.http.post<{ success: boolean; message: string; responseCode: number; messageId?: string }>(
      `${this.apiBase}/jobs/${request.jobKey}/email/send-customer`, 
      request
    ).pipe(
      timeout(this.DEFAULT_TIMEOUT),
      map(res => this.mapEmailResponse(res)),
      tap((res) => {
        if (res.status) {
          this.refreshNotesAfterChange(request.jobKey);
        }
      }),
      catchError((err) => this.handleError<SendEmailResponseType>(err, 'sendNoteToCustomer'))
    );
  }

  /**
   * Send note to vendor contacts.
   * Calls: POST /jobs/{jobKey}/email/send-vendor
   */
  sendNoteToVendor(request: SendVendorEmailRequest): Observable<SendEmailResponseType> {
    return this.http.post<{ success: boolean; message: string; responseCode: number; messageId?: string }>(
      `${this.apiBase}/jobs/${request.jobKey}/email/send-vendor`, 
      request
    ).pipe(
      timeout(this.DEFAULT_TIMEOUT),
      map(res => this.mapEmailResponse(res)),
      tap((res) => {
        if (res.status) {
          this.refreshNotesAfterChange(request.jobKey);
        }
      }),
      catchError((err) => this.handleError<SendEmailResponseType>(err, 'sendNoteToVendor'))
    );
  }

  /**
   * Send note to location contacts.
   * Calls: POST /jobs/{jobKey}/email/send-location
   */
  sendNoteToLocation(request: SendLocationEmailRequest): Observable<SendEmailResponseType> {
    return this.http.post<{ success: boolean; message: string; responseCode: number; messageId?: string }>(
      `${this.apiBase}/jobs/${request.jobKey}/email/send-location`, 
      request
    ).pipe(
      timeout(this.DEFAULT_TIMEOUT),
      map(res => this.mapEmailResponse(res)),
      tap((res) => {
        if (res.status) {
          this.refreshNotesAfterChange(request.jobKey);
        }
      }),
      catchError((err) => this.handleError<SendEmailResponseType>(err, 'sendNoteToLocation'))
    );
  }

  /**
   * Send note to accounting team.
   * Calls: POST /jobs/{jobKey}/email/send-accounting
   */
  sendNoteToAccounting(request: SendAccountingEmailRequest): Observable<SendEmailResponseType> {
    return this.http.post<{ success: boolean; message: string; responseCode: number; messageId?: string }>(
      `${this.apiBase}/jobs/${request.jobKey}/email/send-accounting`, 
      request
    ).pipe(
      timeout(this.DEFAULT_TIMEOUT),
      map(res => this.mapEmailResponse(res)),
      tap((res) => {
        if (res.status) {
          this.refreshNotesAfterChange(request.jobKey);
        }
      }),
      catchError((err) => this.handleError<SendEmailResponseType>(err, 'sendNoteToAccounting'))
    );
  }

  /**
   * Unified Save & Email - saves notes and sends emails to multiple recipient types.
   * Mirrors legacy SaveMail from MgtMultipleJobMessegeController.
   * Uses: POST /jobs/{jobKey}/save-and-email
   *
   * When any recipient arrays are non-empty, `request.emailSenderChoice` must be `'Self'` or `'ServiceAdmin'`
   * (Job Ops maps these to JWT personnel key vs `ImportantID.ServiceAdminStaffKey` for MailToAdmin payloads).
   *
   * - No local uploads: JSON body (`application/json`).
   * - With `uploadedFiles`: `multipart/form-data` with field `request` (JSON string) and
   *   one part per file named `attachments` (matches Job Ops API).
   *
   * Response is wrapped by ApiResponseWrapFilter with { status, message: "OK", data: {...} }
   */
  saveAndEmail(request: SaveAndEmailRequest, uploadedFiles?: File[]): Observable<SaveAndEmailResponse> {
    const url = `${this.apiBase}/jobs/${request.jobKey}/save-and-email`;
    const hasUploads = uploadedFiles && uploadedFiles.length > 0;
    const body: SaveAndEmailRequest | FormData = hasUploads
      ? (() => {
          const formData = new FormData();
          formData.append('request', JSON.stringify(request));
          for (const file of uploadedFiles!) {
            formData.append('attachments', file, file.name);
          }
          return formData;
        })()
      : request;

    return this.http.post<ApiWrapper<SaveAndEmailApiResponse>>(url, body).pipe(
      timeout(this.DEFAULT_TIMEOUT),
      map(res => {
        // Extract the actual response from the wrapper's data property
        const actualResponse = res.data;
        return {
          status: actualResponse?.success ?? false,
          responseCode: actualResponse?.responseCode ?? res.responseCode ?? 200,
          message: actualResponse?.message || 'Operation completed',
          data: {
            success: actualResponse?.success ?? false,
            message: actualResponse?.message || 'Operation completed',
            results: actualResponse?.results,
          },
          details: [],
          unixTime: Date.now(),
          traceId: null,
        } as SaveAndEmailResponse;
      }),
      tap((res) => {
        if (res.status) {
          this.refreshNotesAfterChange(request.jobKey);
        }
      }),
      catchError((err) => this.handleError<SaveAndEmailResponse>(err, 'saveAndEmail'))
    );
  }

  // ──────────────────────────────────────────────────────────────
  //  Templates
  // ──────────────────────────────────────────────────────────────

  /**
   * Get available note templates.
   * Uses: GET /templates
   */
  getNoteTemplates(): Observable<TemplateListResponse> {
    return this.http.get<ApiWrapper<ApiNoteTemplateDto[]>>(`${this.apiBase}/templates`).pipe(
      timeout(this.DEFAULT_TIMEOUT),
      map((response) => {
        const data = Array.isArray(response?.data) ? response.data : [];
        return {
          status: true,
          responseCode: 200,
          message: 'Success',
          data: data.map(t => ({
            templateKey: String(t.templateKey),
            templateName: t.templateName ?? '',
            templateContent: t.detailContent,
          })),
          details: [],
          unixTime: Date.now(),
          traceId: null,
        } as TemplateListResponse;
      }),
      catchError((err) => this.handleError<TemplateListResponse>(err, 'getNoteTemplates'))
    );
  }

  // ──────────────────────────────────────────────────────────────
  //  Job Vendors (for vendor selection dropdown)
  // ──────────────────────────────────────────────────────────────

  /**
   * Get list of vendors assigned to this job.
   * Extracts from vendor contacts endpoint.
   */
  getJobVendors(jobKey: string): Observable<JobVendorListResponse> {
    return this.http.get<ApiWrapper<ApiVendorContactDto[]>>(`${this.apiBase}/jobs/${jobKey}/contacts/vendor`).pipe(
      timeout(this.DEFAULT_TIMEOUT),
      map((response) => {
        const vendorMap = new Map<string, JobVendorOption>();
        const items = Array.isArray(response?.data) ? response.data : [];
        for (const c of items) {
          if (!vendorMap.has(c.vendorKey)) {
            vendorMap.set(c.vendorKey, {
              vendorKey: c.vendorKey,
              vendorName: c.vendorName ?? 'Unknown',
              isDefault: c.isDefault,
            });
          }
        }
        return {
          status: true,
          responseCode: 200,
          message: 'Success',
          data: Array.from(vendorMap.values()),
          details: [],
          unixTime: Date.now(),
          traceId: null,
        } as JobVendorListResponse;
      }),
      catchError((err) => this.handleError<JobVendorListResponse>(err, 'getJobVendors'))
    );
  }

  // ──────────────────────────────────────────────────────────────
  //  Unread Counts
  // ──────────────────────────────────────────────────────────────

  /**
   * Get unread note counts by type.
   * Calculated locally from consolidated notes.
   */
  getUnreadCounts(jobKey: string): Observable<UnreadCountsResponse> {
    const notes = this._consolidatedNotes$.getValue();
    if (notes) {
      this.calculateUnreadCounts(notes);
    }
    return of({
      status: true,
      responseCode: 200,
      message: 'Success',
      data: this._unreadCounts$.getValue(),
      details: [],
      unixTime: Date.now(),
      traceId: null,
    } as UnreadCountsResponse);
  }

  // ──────────────────────────────────────────────────────────────
  //  WebSocket for Real-time Updates (DISABLED - using REST-only)
  // ──────────────────────────────────────────────────────────────

  /**
   * Connect to WebSocket for real-time note updates.
   * NOTE: WebSocket is currently disabled. Real-time updates will be
   * implemented via SignalR in a future release. For now, use REST APIs
   * and manual refresh for data updates.
   */
  connectWebSocket(_jobKey: string): void {
    // WebSocket disabled - no backend endpoint available yet.
    // To enable real-time updates in the future, implement SignalR hub
    // in Job Ops API and update this method to use SignalR client.
  }

  /**
   * Disconnect WebSocket connection.
   */
  disconnectWebSocket(): void {
    if (this.webSocket) {
      this.webSocket.close();
      this.webSocket = null;
    }
  }

  /* eslint-disable @typescript-eslint/no-unused-vars */
  private handleWebSocketEvent(event: NoteWebSocketEvent, jobKey: string): void {
    // WebSocket disabled - this handler is kept for future SignalR implementation
    switch (event.type) {
      case 'note_created':
      case 'note_updated':
      case 'note_deleted':
      case 'note_pinned':
        this.refreshNotesAfterChange(jobKey);
        break;
    }
  }

  // ──────────────────────────────────────────────────────────────
  //  Internal Helpers
  // ──────────────────────────────────────────────────────────────

  private refreshNotesAfterChange(jobKey: string): void {
    this.getConsolidatedNotes(jobKey).subscribe();
  }

  private refreshUnreadCounts(jobKey: string): void {
    // Unread counts are calculated locally from consolidated notes
    const notes = this._consolidatedNotes$.getValue();
    if (notes) {
      this.calculateUnreadCounts(notes);
    }
  }

  /**
   * Merges the latest GET .../messaging/internal payload into the in-memory consolidated
   * snapshot and recomputes {@link unreadCounts$}.
   *
   * The Internal tab grid loads from {@link getInternalNotes} while tab badges are derived
   * from {@link calculateUnreadCounts} over {@link _consolidatedNotes$}. After mark-viewed,
   * {@link refreshNotesAfterChange} fires {@link getConsolidatedNotes} (forkJoin of four
   * endpoints) without surfacing errors — if that call is slow or any leg fails, badges could
   * stay stale even though this dedicated internal list is already correct.
   */
  mergeInternalMessagingIntoConsolidatedAndRecalculateUnread(internalNotes: NoteItem[]): void {
    const consolidated = this._consolidatedNotes$.getValue();
    if (!consolidated) {
      const cur = this._unreadCounts$.getValue();
      this._unreadCounts$.next({
        ...cur,
        internal: internalNotes.filter((n) => !n.isViewed).length,
      });
      return;
    }
    const updated: ConsolidatedNotes = {
      ...consolidated,
      internalNotes,
    };
    this._consolidatedNotes$.next(updated);
    this.calculateUnreadCounts(updated);
  }

  private calculateUnreadCounts(notes: ConsolidatedNotes): void {
    const counts: UnreadCounts = {
      internal: notes.internalNotes.filter(n => !n.isViewed).length,
      vendor: notes.vendorNotes.filter(n => !n.isViewed).length,
      customer: notes.customerNotes.filter(n => !n.isViewed).length,
      location: notes.locationNotes.filter(n => !n.isViewed).length,
      all: notes.allNotes.filter(n => !n.isViewed).length,
    };
    this._unreadCounts$.next(counts);
  }

  // ──────────────────────────────────────────────────────────────
  //  API Response Mappers
  // ──────────────────────────────────────────────────────────────

  private mapApiNotes(notes: ApiNoteDto[]): NoteItem[] {
    const items = Array.isArray(notes) ? notes : [];
    return items.map(n => ({
      noteKey: n.pKey,
      jobKey: n.jobKey,
      title: n.title,
      comment: n.comment,
      addedOn: n.addedOn,
      dateInString: n.dateInString,
      addedBy: n.addedBy,
      addedByName: n.addedByName,
      fromMsg: n.fromMsg,
      toMsg: n.toMsg,
      fileLinks: n.fileLinks,
      isPinned: n.pinned ?? false,
      isViewed: !(n.isCustomerMessegeNew ?? n.isNew ?? false),
      isNew: n.isCustomerMessegeNew ?? n.isNew ?? false,
      setViewed: n.setviewed,
      noteType: this.getMsgTypeName(n.msgType),
      msgType: n.msgType,
      bgColor: n.bgColor,
      vendorKey: n.vendorKey,
      accountingPersonKey: n.accountingPersonKey ?? null,
      canEditAccountingNote: n.canEditAccountingNote ?? null,
      vendorName: null,
      attachmentCount: 0,
    }));
  }

  private mapInternalMessages(messages: ApiInternalMessageDto[]): NoteItem[] {
    const items = Array.isArray(messages) ? messages : [];
    return items.map(m => ({
      noteKey: m.pKey,
      jobKey: m.jobKey,
      title: m.title,
      comment: m.comment,
      addedOn: m.addedOn,
      dateInString: null,
      addedBy: m.addedBy,
      addedByName: m.addedByName,
      fromMsg: m.fromMsg,
      toMsg: m.toMsg,
      fileLinks: null,
      isPinned: m.pinned ?? false,
      isViewed: !(m.isNew ?? false),
      isNew: m.isNew ?? false,
      setViewed: null,
      noteType: 'adminToAdmin' as const,
      msgType: 2,
      bgColor: null,
      vendorKey: null,
      accountingPersonKey: null,
      vendorName: null,
      attachmentCount: 0,
    }));
  }

  private mapVendorMessages(messages: ApiVendorMessageDto[]): NoteItem[] {
    const items = Array.isArray(messages) ? messages : [];
    return items.map(m => {
      const fromAdmin = Number(m.isAdmin) === 1;
      const msgType = fromAdmin ? 3 : 11;
      return {
        noteKey: m.pKey,
        jobKey: m.jobKey,
        title: m.title,
        comment: m.comment,
        addedOn: m.addedOn,
        dateInString: null,
        addedBy: m.addedBy,
        addedByName: m.addedByName,
        fromMsg: m.fromMsg,
        toMsg: m.toMsg,
        fileLinks: null,
        isPinned: m.pinned ?? false,
        isViewed: !(m.isNew ?? false),
        isNew: m.isNew ?? false,
        setViewed: null,
        noteType: (fromAdmin ? 'adminToVendor' : 'vendorToAdmin') as NoteType,
        msgType,
        bgColor: m.bgColor,
        vendorKey: m.vendorKey,
        accountingPersonKey: null,
        vendorName: m.vendorName,
        attachmentCount: 0,
      };
    });
  }

  private mapCustomerMessages(messages: ApiCustomerMessageDto[]): NoteItem[] {
    const items = Array.isArray(messages) ? messages : [];
    return items.map(m => {
      const fromAdmin = Number(m.isAdmin) === 1;
      const msgType = fromAdmin ? 1 : 9;
      const attachmentHtml =
        m.source && m.source.trim() !== '--' ? m.source : null;
      return {
        noteKey: m.pKey,
        jobKey: m.jobKey,
        title: m.title,
        comment: m.comment,
        addedOn: m.addedOn,
        dateInString: null,
        addedBy: m.addedBy,
        addedByName: m.addedByName,
        fromMsg: m.fromMsg,
        toMsg: m.toMsg,
        fileLinks: attachmentHtml,
        isPinned: m.pinned ?? false,
        isViewed: !(m.isNew ?? false),
        isNew: m.isNew ?? false,
        setViewed: null,
        noteType: (fromAdmin ? 'adminToCustomer' : 'customerToAdmin') as NoteType,
        msgType,
        bgColor: m.bgColor,
        vendorKey: null,
        accountingPersonKey: null,
        vendorName: null,
        attachmentCount: 0,
      };
    });
  }

  /**
   * Maps MsgType number to NoteType string based on spListOfAllMessege
   * MsgType 1: Admin to Customer (CustomerMesseging)
   * MsgType 2: Admin to Admin/Internal (RCSmesseging)
   * MsgType 3: Admin to Vendor (VendorMesseging)
   * MsgType 4: Note to Location (LocationNotes)
   * MsgType 5: Vendor Action Notes (VendorActionNotes)
   * MsgType 6: Customer Action Notes (CustomerActionNotes)
   * MsgType 7: System Generated (ActionNotesFromSystem)
   * MsgType 8: Admin Action Notes (AdminActionNotes)
   * MsgType 9: Customer to Admin (CustomerContactMesseging)
   * MsgType 11: Vendor to Admin (VendorContactMesseging)
   */
  private getMsgTypeName(msgType: number): NoteType {
    const types: Record<number, NoteType> = {
      1: 'adminToCustomer',
      2: 'adminToAdmin',
      3: 'adminToVendor',
      4: 'noteToLocation',
      5: 'vendorAction',
      6: 'customerAction',
      7: 'systemGenerated',
      8: 'adminAction',
      9: 'customerToAdmin',
      11: 'vendorToAdmin',
    };
    return types[msgType] ?? 'general';
  }

  private getNoteTypeNumber(noteType: NoteType): number {
    const types: Record<NoteType, number> = {
      adminToCustomer: 1,
      adminToAdmin: 2,
      adminToVendor: 3,
      noteToLocation: 4,
      vendorAction: 5,
      customerAction: 6,
      systemGenerated: 7,
      adminAction: 8,
      customerToAdmin: 9,
      vendorToAdmin: 11,
      general: 2,
      internal: 2,    // Maps to adminToAdmin
      vendor: 3,      // Maps to adminToVendor
      customer: 1,    // Maps to adminToCustomer
      accounting: 2,  // Maps to adminToAdmin
    };
    return types[noteType] ?? 2;
  }

  private wrapNotesResponse(notes: NoteItem[]): NotesListResponse {
    return {
      status: true,
      responseCode: 200,
      message: 'Success',
      data: notes,
      details: [],
      unixTime: Date.now(),
      traceId: null,
    };
  }

  private wrapContactsResponse(contacts: ContactItem[]): ContactListResponse {
    return {
      status: true,
      responseCode: 200,
      message: 'Success',
      data: contacts,
      details: [],
      unixTime: Date.now(),
      traceId: null,
    };
  }

  private wrapVendorContactsResponse(contacts: VendorContactItem[]): VendorContactListResponse {
    return {
      status: true,
      responseCode: 200,
      message: 'Success',
      data: contacts,
      details: [],
      unixTime: Date.now(),
      traceId: null,
    };
  }

  private wrapCustomerContactsResponse(contacts: CustomerContactItem[]): CustomerContactListResponse {
    return {
      status: true,
      responseCode: 200,
      message: 'Success',
      data: contacts,
      details: [],
      unixTime: Date.now(),
      traceId: null,
    };
  }

  private wrapLocationContactsResponse(contacts: LocationContactItem[]): LocationContactListResponse {
    return {
      status: true,
      responseCode: 200,
      message: 'Success',
      data: contacts,
      details: [],
      unixTime: Date.now(),
      traceId: null,
    };
  }

  private wrapJobFilesResponse(files: JobFileItem[]): JobFileListResponse {
    return {
      status: true,
      responseCode: 200,
      message: 'Success',
      data: files,
      details: [],
      unixTime: Date.now(),
      traceId: null,
    };
  }

  private wrapVendorFilesResponse(files: VendorFileItem[]): VendorFileListResponse {
    return {
      status: true,
      responseCode: 200,
      message: 'Success',
      data: files,
      details: [],
      unixTime: Date.now(),
      traceId: null,
    };
  }

  private handleError<T>(error: HttpErrorResponse | TimeoutError | Error, operation: string): Observable<T> {
    let errorMessage = 'An unexpected error occurred';

    if (error instanceof TimeoutError) {
      errorMessage = 'Request timed out. Please try again.';
    } else if (error instanceof HttpErrorResponse) {
      if (error.status === 0) {
        errorMessage = 'Unable to connect to the server.';
      } else if (error.status === 401) {
        errorMessage = 'Session expired. Please log in again.';
      } else if (error.status === 403) {
        errorMessage = 'You do not have permission to perform this action.';
      } else if (error.status === 404) {
        errorMessage = 'The requested resource was not found.';
      } else if (error.error?.message) {
        errorMessage = error.error.message;
      }
    }

    console.error(`NotesActivityService.${operation}:`, errorMessage, error);

    const errorResponse: NotesActivityApiResponse<null> = {
      status: false,
      responseCode: error instanceof HttpErrorResponse ? error.status : 500,
      message: errorMessage,
      data: null,
      details: [],
      unixTime: Date.now(),
      traceId: null,
    };

    return of(errorResponse as T);
  }

  /**
   * Clear all cached data (call on component destroy or page leave).
   */
  clearCache(): void {
    this._pageContext$.next(null);
    this._jobHeaderDetail$.next(null);
    this._consolidatedNotes$.next(null);
    this._unreadCounts$.next({ internal: 0, vendor: 0, customer: 0, location: 0, all: 0 });
    this.disconnectWebSocket();
  }
}
