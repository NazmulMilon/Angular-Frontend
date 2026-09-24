import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, of, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  AssignVendorApiResponse,
  CustomerLocationOptionDto,
  CustomerRequestorOption,
  VendorContactOption,
} from '../models/assign-vendor.model';
import {
  CreateQuickJobRequest,
  CreateQuickJobResponse,
  OptionGuidValueDto,
  PagedOptionResultDto,
  QuickJobCustomerDetailDto,
  QuickJobFormDataDto,
  QuickJobTempFileDto,
  ValidateJobNameResult,
  VendorEtaDefaultDto,
} from '../models/quick-job.model';

/**
 * Create Quick Job API client — targets `api/v1/admin/quick-job`.
 *
 * The `authInterceptor` attaches `Authorization: Bearer <jwt>` on every request (see
 * {@link AuthTokenService}); no auth handling is needed here. Every method returns the
 * standard {@link AssignVendorApiResponse} envelope; HTTP failures are mapped to a
 * `status: false` envelope so the component can render a message instead of throwing.
 */
@Injectable({ providedIn: 'root' })
export class QuickJobService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/v1/admin/quick-job`;

  /** GET /form-data — dropdowns + defaults (status, team, next PO preview, constant GUIDs). */
  getFormData(): Observable<AssignVendorApiResponse<QuickJobFormDataDto>> {
    return this.http
      .get<AssignVendorApiResponse<QuickJobFormDataDto>>(`${this.apiBase}/form-data`)
      .pipe(catchError(this.handleError<QuickJobFormDataDto>('getFormData')));
  }

  /** GET /customers/{customerKey}/locations — customer→location cascade. */
  getCustomerLocations(
    customerKey: string
  ): Observable<AssignVendorApiResponse<CustomerLocationOptionDto[]>> {
    return this.http
      .get<AssignVendorApiResponse<CustomerLocationOptionDto[]>>(
        `${this.apiBase}/customers/${customerKey}/locations`
      )
      .pipe(catchError(this.handleError<CustomerLocationOptionDto[]>('getCustomerLocations')));
  }

  /** GET /customers/{customerKey}/contacts — customer→contact cascade ({ text, value }, default contact first). */
  getCustomerContacts(
    customerKey: string
  ): Observable<AssignVendorApiResponse<OptionGuidValueDto[]>> {
    return this.http
      .get<AssignVendorApiResponse<OptionGuidValueDto[]>>(
        `${this.apiBase}/customers/${customerKey}/contacts`
      )
      .pipe(catchError(this.handleError<OptionGuidValueDto[]>('getCustomerContacts')));
  }

  /**
   * GET /customers/{customerKey}/requestors — customer→requestor cascade ({ text, value }).
   * `locationKey` is optional: omit before a location is picked, pass it once one is selected
   * to widen the pool to that location's requestors too. `text` is suffixed "(Customer)" or
   * "(Location)" so the UI can show provenance.
   */
  getCustomerRequestors(
    customerKey: string,
    locationKey?: string | null
  ): Observable<AssignVendorApiResponse<CustomerRequestorOption[]>> {
    let url = `${this.apiBase}/customers/${customerKey}/requestors`;
    if (locationKey) url += `?locationKey=${encodeURIComponent(locationKey)}`;
    return this.http
      .get<AssignVendorApiResponse<CustomerRequestorOption[]>>(url)
      .pipe(catchError(this.handleError<CustomerRequestorOption[]>('getCustomerRequestors')));
  }

  /**
   * GET /customers/{customerKey}/detail — customer profile DNE defaults (standard + emergency
   * pairs for both customer and vendor) used to pre-fill the DNE fields on customer change.
   */
  getCustomerDetail(
    customerKey: string
  ): Observable<AssignVendorApiResponse<QuickJobCustomerDetailDto>> {
    return this.http
      .get<AssignVendorApiResponse<QuickJobCustomerDetailDto>>(
        `${this.apiBase}/customers/${customerKey}/detail`
      )
      .pipe(catchError(this.handleError<QuickJobCustomerDetailDto>('getCustomerDetail')));
  }

  /**
   * GET /vendors — paged vendor typeahead ({ items: [{ text, value }], totalCount }).
   * `search` is optional; `skip`/`take` page through matches once a query returns more than
   * one page (e.g. a common term like "electric").
   */
  searchVendors(
    search: string,
    skip = 0,
    take = 50
  ): Observable<AssignVendorApiResponse<PagedOptionResultDto>> {
    let url = `${this.apiBase}/vendors?skip=${skip}&take=${take}`;
    if (search.trim()) url += `&search=${encodeURIComponent(search.trim())}`;
    return this.http
      .get<AssignVendorApiResponse<PagedOptionResultDto>>(url)
      .pipe(catchError(this.handleError<PagedOptionResultDto>('searchVendors')));
  }

  /** GET /vendors/{vendorKey}/contacts — vendor contacts (used when assigning a vendor). */
  getVendorContacts(
    vendorKey: string
  ): Observable<AssignVendorApiResponse<VendorContactOption[]>> {
    return this.http
      .get<AssignVendorApiResponse<VendorContactOption[]>>(
        `${this.apiBase}/vendors/${vendorKey}/contacts`
      )
      .pipe(catchError(this.handleError<VendorContactOption[]>('getVendorContacts')));
  }

  /**
   * GET /vendor-eta-default?jobTypeKey={jobTypeKey} — default Vendor ETA window for a job type
   * (mirrors legacy `MgtJob/GetTheVendoeETAsetLimitDefaultforSystem`, backed by
   * `ReminderEmailTimeDef`). See {@link VendorEtaDefaultDto}.
   */
  getVendorEtaDefault(jobTypeKey: string): Observable<AssignVendorApiResponse<VendorEtaDefaultDto>> {
    return this.http
      .get<AssignVendorApiResponse<VendorEtaDefaultDto>>(
        `${this.apiBase}/vendor-eta-default?jobTypeKey=${encodeURIComponent(jobTypeKey)}`
      )
      .pipe(catchError(this.handleError<VendorEtaDefaultDto>('getVendorEtaDefault')));
  }

  /** POST /validate-job-name — duplicate check. */
  validateJobName(jobName: string): Observable<AssignVendorApiResponse<ValidateJobNameResult>> {
    return this.http
      .post<AssignVendorApiResponse<ValidateJobNameResult>>(`${this.apiBase}/validate-job-name`, {
        jobName,
      })
      .pipe(catchError(this.handleError<ValidateJobNameResult>('validateJobName')));
  }

  /**
   * POST /temp-files (multipart/form-data) — stage internal files before the job exists (keyed
   * server-side to the logged-in admin). `typeKeys` is index-matched to `files`; pass `''` for a
   * file with no chosen type (backend falls back to a generic "Attachment" type). The
   * `Content-Type` header is intentionally NOT set — the browser sets the multipart boundary; the
   * `authInterceptor` still attaches the bearer token.
   */
  stageTempFiles(
    files: File[],
    typeKeys: (string | null)[]
  ): Observable<AssignVendorApiResponse<QuickJobTempFileDto[]>> {
    const form = new FormData();
    files.forEach((file, i) => {
      form.append('files', file);
      form.append('documentTypeKeys', typeKeys[i] ?? '');
    });
    return this.http
      .post<AssignVendorApiResponse<QuickJobTempFileDto[]>>(`${this.apiBase}/temp-files`, form)
      .pipe(catchError(this.handleError<QuickJobTempFileDto[]>('stageTempFiles')));
  }

  /** GET /temp-files — files currently staged for the logged-in admin. */
  getTempFiles(): Observable<AssignVendorApiResponse<QuickJobTempFileDto[]>> {
    return this.http
      .get<AssignVendorApiResponse<QuickJobTempFileDto[]>>(`${this.apiBase}/temp-files`)
      .pipe(catchError(this.handleError<QuickJobTempFileDto[]>('getTempFiles')));
  }

  /** DELETE /temp-files/{fileKey} — remove one staged file. */
  deleteTempFile(fileKey: string): Observable<AssignVendorApiResponse<unknown>> {
    return this.http
      .delete<AssignVendorApiResponse<unknown>>(
        `${this.apiBase}/temp-files/${encodeURIComponent(fileKey)}`
      )
      .pipe(catchError(this.handleError<unknown>('deleteTempFile')));
  }

  /** POST / — create the job header and run post-save branching; returns a redirect decision. */
  createQuickJob(
    request: CreateQuickJobRequest
  ): Observable<AssignVendorApiResponse<CreateQuickJobResponse>> {
    return this.http
      .post<AssignVendorApiResponse<CreateQuickJobResponse>>(this.apiBase, request)
      .pipe(catchError(this.handleError<CreateQuickJobResponse>('createQuickJob')));
  }

  /**
   * Maps an HTTP failure to a synthesized `status: false` envelope (parity with
   * {@link AssignVendorService.handleError}) so callers never have to catch.
   */
  private handleError<T>(operation: string) {
    return (error: HttpErrorResponse): Observable<AssignVendorApiResponse<T>> => {
      const apiEnvelope = error.error as Partial<AssignVendorApiResponse<T>> | null;
      const message =
        apiEnvelope?.message ??
        (error.status === 0
          ? 'Cannot reach the Job Ops API. Check the API is running and the base URL is correct.'
          : error.status === 401
            ? 'Not authorized. Your session token is missing or expired.'
            : `Request failed (${error.status}).`);

      return of({
        status: false,
        responseCode: error.status,
        message,
        data: (apiEnvelope?.data ?? null) as T,
        details: apiEnvelope?.details ?? [],
        unixTime: Date.now(),
        traceId: apiEnvelope?.traceId ?? null,
        clientOperation: operation,
        requestUrl: error.url,
        authorizationSent: true,
      });
    };
  }
}
