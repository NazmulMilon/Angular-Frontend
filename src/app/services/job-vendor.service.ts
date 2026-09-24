import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, BehaviorSubject, tap, catchError, of } from 'rxjs';
import {
  AssignedVendor,
  VendorSearchResult,
  PinnedVendor,
  LocationHistoryVendor,
  VendorDropdownItem,
  VendorContactItem,
  ServiceChargeResult,
  VendorSearchParams,
  AddVendorForm,
  JobContext,
  QuickVendorPayload,
  ApiResponse,
} from '../models/vendor.model';
import { environment } from '../../environments/environment';

/**
 * Service for managing Job-Vendor operations (legacy / alternate API shapes).
 *
 * Calls under {@link adminJobVendorApiBase} hit Job Ops `AdminJobVendorController` (same host as
 * {@link AssignVendorService}) and require a JWT: the app-root `HttpClient` + `authInterceptor` attach
 * `Authorization: Bearer` when a token exists. No component currently injects this service; the live
 * Assign Vendor tab uses {@link AssignVendorService} instead.
 */
@Injectable({ providedIn: 'root' })
export class JobVendorService {
  private readonly http = inject(HttpClient);

  private readonly apiBase = `${environment.apiBaseUrl}/api`;
  private readonly adminJobVendorApiBase = `${environment.apiBaseUrl}/api/v1/admin/job-vendor`;

  // ---------------------------------------------------------------------------
  // Real-time data streams — components subscribe to these for live grid updates
  // ---------------------------------------------------------------------------

  private readonly _assignedVendors$ = new BehaviorSubject<AssignedVendor[]>([]);
  private readonly _locationHistoryVendors$ = new BehaviorSubject<LocationHistoryVendor[]>([]);
  private readonly _searchResults$ = new BehaviorSubject<VendorSearchResult[]>([]);
  private readonly _pinnedVendors$ = new BehaviorSubject<PinnedVendor[]>([]);
  private readonly _jobContext$ = new BehaviorSubject<JobContext | null>(null);
  private readonly _loading$ = new BehaviorSubject<boolean>(false);

  /** Observable streams for component consumption */
  readonly assignedVendors$ = this._assignedVendors$.asObservable();
  readonly locationHistoryVendors$ = this._locationHistoryVendors$.asObservable();
  readonly searchResults$ = this._searchResults$.asObservable();
  readonly pinnedVendors$ = this._pinnedVendors$.asObservable();
  readonly jobContext$ = this._jobContext$.asObservable();
  readonly loading$ = this._loading$.asObservable();

  // ---------------------------------------------------------------------------
  // Job Context
  // ---------------------------------------------------------------------------

  /** Load the job context (tab menu header info) */
  loadJobContext(jobKey: string): Observable<ApiResponse<JobContext>> {
    return this.http
      .get<ApiResponse<JobContext>>(`${this.apiBase}/job/${jobKey}/context`)
      .pipe(
        tap((res) => {
          if (res.success) this._jobContext$.next(res.data);
        }),
        catchError(this.handleError<ApiResponse<JobContext>>('loadJobContext'))
      );
  }

  // ---------------------------------------------------------------------------
  // Assigned Vendors Grid
  // ---------------------------------------------------------------------------

  /** Fetch all assigned vendors for a job — populates the "Selected Vendor" grid */
  loadAssignedVendors(jobKey: string): Observable<ApiResponse<AssignedVendor[]>> {
    this._loading$.next(true);
    return this.http
      .get<ApiResponse<AssignedVendor[]>>(
        `${this.apiBase}/job/${jobKey}/vendors/assigned`
      )
      .pipe(
        tap((res) => {
          if (res.success) this._assignedVendors$.next(res.data);
          this._loading$.next(false);
        }),
        catchError(this.handleError<ApiResponse<AssignedVendor[]>>('loadAssignedVendors'))
      );
  }

  // ---------------------------------------------------------------------------
  // Location History Vendors Grid
  // ---------------------------------------------------------------------------

  /** Fetch vendors who previously serviced this location */
  loadLocationHistoryVendors(jobKey: string): Observable<ApiResponse<LocationHistoryVendor[]>> {
    return this.http
      .get<ApiResponse<LocationHistoryVendor[]>>(
        `${this.apiBase}/job/${jobKey}/vendors/location-history`
      )
      .pipe(
        tap((res) => {
          if (res.success) this._locationHistoryVendors$.next(res.data);
        }),
        catchError(
          this.handleError<ApiResponse<LocationHistoryVendor[]>>('loadLocationHistoryVendors')
        )
      );
  }

  // ---------------------------------------------------------------------------
  // Vendor Search
  // ---------------------------------------------------------------------------

  /** Search vendors by radius/trade/location criteria */
  searchVendors(params: VendorSearchParams): Observable<ApiResponse<VendorSearchResult[]>> {
    this._loading$.next(true);
    const httpParams = new HttpParams()
      .set('jobKey', params.jobKey)
      .set('radius', params.radius.toString())
      .set('searchType', params.searchType.toString());

    return this.http
      .get<ApiResponse<VendorSearchResult[]>>(
        `${this.apiBase}/job/vendors/search`,
        { params: httpParams }
      )
      .pipe(
        tap((res) => {
          if (res.success) this._searchResults$.next(res.data);
          this._loading$.next(false);
        }),
        catchError(this.handleError<ApiResponse<VendorSearchResult[]>>('searchVendors'))
      );
  }

  // ---------------------------------------------------------------------------
  // Pinned Vendors
  // Routes: /api/v1/admin/job-vendor/pinned-vendors, add-pinned-vendor, unpin, unpin-all
  // ---------------------------------------------------------------------------

  /** Fetch pinned vendors for a job */
  loadPinnedVendors(jobKey: string): Observable<ApiResponse<PinnedVendor[]>> {
    return this.http
      .get<ApiResponse<PinnedVendor[]>>(
        `${this.adminJobVendorApiBase}/pinned-vendors/${jobKey}`
      )
      .pipe(
        tap((res) => {
          if (res.success) this._pinnedVendors$.next(res.data);
        }),
        catchError(this.handleError<ApiResponse<PinnedVendor[]>>('loadPinnedVendors'))
      );
  }

  /** Pin a vendor with a note (No/Maybe) */
  pinVendor(
    jobKey: string,
    vendorKey: string,
    status: string,
    note: string
  ): Observable<ApiResponse> {
    return this.http
      .post<ApiResponse>(`${this.adminJobVendorApiBase}/add-pinned-vendor`, {
        jobKey,
        vendorKey,
        no: status,
        notes: note,
      })
      .pipe(
        tap((res) => {
          if (res.success) this.loadPinnedVendors(jobKey).subscribe();
        }),
        catchError(this.handleError<ApiResponse>('pinVendor'))
      );
  }

  /** Unpin a specific pinned vendor */
  unpinVendor(jobKey: string, pinKey: string): Observable<ApiResponse> {
    return this.http
      .delete<ApiResponse>(
        `${this.adminJobVendorApiBase}/unpin/${pinKey}/${jobKey}`
      )
      .pipe(
        tap((res) => {
          if (res.success) this.loadPinnedVendors(jobKey).subscribe();
        }),
        catchError(this.handleError<ApiResponse>('unpinVendor'))
      );
  }

  /** Unpin all pinned vendors for a job */
  unpinAllVendors(jobKey: string): Observable<ApiResponse> {
    return this.http
      .delete<ApiResponse>(`${this.adminJobVendorApiBase}/unpin-all/${jobKey}`)
      .pipe(catchError(this.handleError<ApiResponse>('unpinAllVendors')));
  }

  // ---------------------------------------------------------------------------
  // Vendor Dropdowns & Lookups
  // ---------------------------------------------------------------------------

  /** Get vendor dropdown list filtered by trade */
  getVendorDropdown(
    jobKey: string,
    tradeKey: string
  ): Observable<ApiResponse<VendorDropdownItem[]>> {
    const params = new HttpParams().set('jobKey', jobKey).set('tradeKey', tradeKey);
    return this.http
      .get<ApiResponse<VendorDropdownItem[]>>(
        `${this.apiBase}/vendors/dropdown`,
        { params }
      )
      .pipe(catchError(this.handleError<ApiResponse<VendorDropdownItem[]>>('getVendorDropdown')));
  }

  /** Get contacts for a specific vendor */
  getVendorContacts(vendorKey: string): Observable<ApiResponse<VendorContactItem[]>> {
    return this.http
      .get<ApiResponse<VendorContactItem[]>>(
        `${this.apiBase}/vendors/${vendorKey}/contacts`
      )
      .pipe(
        catchError(this.handleError<ApiResponse<VendorContactItem[]>>('getVendorContacts'))
      );
  }

  /** Get service charge for a vendor-job-trade combination */
  getServiceCharge(
    jobKey: string,
    vendorKey: string,
    tradeKey: string,
    customerKey: string,
    jobTypeKey: string
  ): Observable<ApiResponse<ServiceChargeResult>> {
    const params = new HttpParams()
      .set('jobKey', jobKey)
      .set('vendorKey', vendorKey)
      .set('tradeKey', tradeKey)
      .set('customerKey', customerKey)
      .set('jobTypeKey', jobTypeKey);
    return this.http
      .get<ApiResponse<ServiceChargeResult>>(
        `${this.apiBase}/vendors/service-charge`,
        { params }
      )
      .pipe(
        catchError(this.handleError<ApiResponse<ServiceChargeResult>>('getServiceCharge'))
      );
  }

  // ---------------------------------------------------------------------------
  // Vendor Assignment Actions
  // ---------------------------------------------------------------------------

  /** Add/assign a vendor to a job */
  addVendorToJob(form: AddVendorForm): Observable<ApiResponse> {
    return this.http
      .post<ApiResponse>(`${this.apiBase}/job/vendors/assign`, form)
      .pipe(
        tap((res) => {
          if (res.success) this.refreshAllGrids(form.jobKey);
        }),
        catchError(this.handleError<ApiResponse>('addVendorToJob'))
      );
  }

  /** Remove/unassign a vendor from a job */
  removeVendorFromJob(
    jobKey: string,
    jobVendorKey: string,
    comment: string,
    insufficient: boolean,
    reason: string
  ): Observable<ApiResponse> {
    return this.http
      .post<ApiResponse>(`${this.apiBase}/job/vendors/unassign`, {
        jobKey,
        jobVendorKey,
        comment,
        insufficient,
        reason,
      })
      .pipe(
        tap((res) => {
          if (res.success) this.refreshAllGrids(jobKey);
        }),
        catchError(this.handleError<ApiResponse>('removeVendorFromJob'))
      );
  }

  /** Set a vendor as the default for a job */
  setDefaultVendor(
    jobKey: string,
    jobVendorKey: string,
    vendorKey: string,
    option: number
  ): Observable<ApiResponse> {
    return this.http
      .post<ApiResponse>(`${this.apiBase}/job/vendors/set-default`, {
        jobKey,
        jobVendorKey,
        vendorKey,
        defaultValue: option,
      })
      .pipe(
        tap((res) => {
          if (res.success) this.refreshAllGrids(jobKey);
        }),
        catchError(this.handleError<ApiResponse>('setDefaultVendor'))
      );
  }

  /** Reassign a previously removed vendor */
  reassignVendor(jobVendorKey: string, resetStatus: boolean): Observable<ApiResponse> {
    return this.http
      .post<ApiResponse>(`${this.apiBase}/job/vendors/reassign`, {
        jobVendorKey,
        resetStatus,
      })
      .pipe(catchError(this.handleError<ApiResponse>('reassignVendor')));
  }

  /** Send work order to a vendor */
  sendWorkOrder(
    jobKey: string,
    jobVendorKey: string,
    options: {
      talkedToVendor: boolean;
      hasScheduleDate: boolean;
      scheduleDate?: string;
      dne?: number;
      fileKeys?: string[];
      locationFileKeys?: string[];
    }
  ): Observable<ApiResponse> {
    return this.http
      .post<ApiResponse>(`${this.apiBase}/job/vendors/send-work-order`, {
        jobKey,
        jobVendorKey,
        ...options,
      })
      .pipe(
        tap((res) => {
          if (res.success) this.refreshAllGrids(jobKey);
        }),
        catchError(this.handleError<ApiResponse>('sendWorkOrder'))
      );
  }

  /** Resend work order to a vendor */
  resendWorkOrder(
    jobVendorKey: string,
    estimateKey: string
  ): Observable<ApiResponse> {
    return this.http
      .post<ApiResponse>(`${this.apiBase}/job/vendors/resend-work-order`, {
        jobVendorKey,
        estimateKey,
      })
      .pipe(catchError(this.handleError<ApiResponse>('resendWorkOrder')));
  }

  /** Send cancellation email to a vendor */
  sendCancellationMail(jobVendorKey: string): Observable<ApiResponse> {
    return this.http
      .post<ApiResponse>(`${this.apiBase}/job/vendors/send-cancellation`, {
        jobVendorKey,
      })
      .pipe(catchError(this.handleError<ApiResponse>('sendCancellationMail')));
  }

  // ---------------------------------------------------------------------------
  // Quick Vendor Creation
  // ---------------------------------------------------------------------------

  /** Create a new vendor quickly from the assign vendor screen */
  createQuickVendor(payload: QuickVendorPayload): Observable<ApiResponse<{ vendorKey: string }>> {
    return this.http
      .post<ApiResponse<{ vendorKey: string }>>(
        `${this.apiBase}/vendors/quick-create`,
        payload
      )
      .pipe(
        catchError(
          this.handleError<ApiResponse<{ vendorKey: string }>>('createQuickVendor')
        )
      );
  }

  // ---------------------------------------------------------------------------
  // Real-time Grid Refresh
  // ---------------------------------------------------------------------------

  /** Refresh all grids after a mutation — triggers real-time updates for subscribers */
  refreshAllGrids(jobKey: string): void {
    this.loadAssignedVendors(jobKey).subscribe();
    this.loadLocationHistoryVendors(jobKey).subscribe();
    this.loadPinnedVendors(jobKey).subscribe();
  }

  // ---------------------------------------------------------------------------
  // Error Handler
  // ---------------------------------------------------------------------------

  /** Generic error handler that logs and returns a safe fallback */
  private handleError<T>(operation = 'operation') {
    return (error: unknown): Observable<T> => {
      console.error(`${operation} failed:`, error);
      return of({ success: false, message: `${operation} failed`, data: null } as T);
    };
  }
}
