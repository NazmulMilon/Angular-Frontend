import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, finalize, map, timeout } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import {
  ApproveOnBehalfAndVendorRequest,
  CustomerApprovalActionRequest,
  GetCustomerApprovalResult,
  OnsiteDeclineIncurredInvoiceRequest,
  OnsiteDeclineIncurredInvoiceResult,
  OnsiteDeclineIncurredLinesResult,
  OnsiteEstimateActionRequest,
  OnsiteEstimateActionResult,
  GoHomeRequest,
  OnsiteNegotiateLinesResult,
  OnsiteNegotiateRequest,
  OnsiteNegotiateResult,
  ThreadEstimateDto,
} from './job-chat-estimate.types';
import {
  parseOnsiteDeclineIncurredInvoiceResult,
  parseOnsiteDeclineIncurredLinesResult,
  parseOnsiteNegotiateLinesResult,
  parseThreadEstimateDto,
} from './job-chat-estimate-parse';

@Injectable({ providedIn: 'root' })
export class JobChatEstimateService {
  private readonly http = inject(HttpClient);
  private readonly legacyBase = environment.legacyAdminBaseUrl.replace(/\/$/, '');

  private mapEstimateLoadError(err: unknown): ThreadEstimateDto {
    if (err instanceof HttpErrorResponse) {
      const parsed = parseThreadEstimateDto(err.error);
      if (parsed) return parsed;
      if (err.status === 0) {
        return {
          ok: false,
          error: 'network_error',
          message:
            'Could not reach legacy admin (admin-dev). Check sign-in and network, or retry from Assign Vendor (New).',
        };
      }
      if (err.status === 502 || err.status === 504) {
        return {
          ok: false,
          error: 'bad_gateway',
          message: 'Legacy admin request failed — try again or contact support if this persists.',
        };
      }
      return {
        ok: false,
        error: 'request_failed',
        message: err.message || `HTTP ${err.status}`,
      };
    }
    return { ok: false, error: 'request_failed' };
  }

  getThreadEstimate(
    jobKey: string,
    vendorKey: string | null,
    notifyReviewing = true,
    estimateKey?: string,
  ): Observable<ThreadEstimateDto> {
    let params = new HttpParams()
      .set('jobKey', jobKey)
      .set('_', String(Date.now()));
    if (vendorKey) {
      params = params.set('vendorKey', vendorKey);
    }
    if (notifyReviewing) {
      params = params.set('notifyReviewing', '1');
    }
    if (estimateKey) {
      params = params.set('estimateKey', estimateKey);
    }
    return this.http
      .get<unknown>(`${this.legacyBase}/JobOpsChat/GetThreadEstimate`, { params })
      .pipe(
        map((body) => parseThreadEstimateDto(body) ?? { ok: false, error: 'parse_failed' }),
        timeout(60_000),
        catchError((err: unknown) => of(this.mapEstimateLoadError(err))),
      );
  }

  postOnsiteAction(body: OnsiteEstimateActionRequest): Observable<OnsiteEstimateActionResult> {
    return this.http
      .post<OnsiteEstimateActionResult>(`${this.legacyBase}/JobOpsChat/PostOnsiteEstimateAction`, body)
      .pipe(
        map((res) => res ?? { ok: false, error: 'empty_response' }),
        catchError(() => of({ ok: false, error: 'request_failed' })),
      );
  }

  postGoHome(body: GoHomeRequest): Observable<OnsiteEstimateActionResult> {
    return this.http
      .post<OnsiteEstimateActionResult>(`${this.legacyBase}/JobOpsChat/PostGoHome`, body)
      .pipe(
        map((res) => res ?? { ok: false, error: 'empty_response' }),
        catchError(() => of({ ok: false, error: 'request_failed' })),
      );
  }

  /** Sends the vendor a standby message and returns the customer estimate split-screen URL. */
  postGetCustomerApproval(body: CustomerApprovalActionRequest): Observable<GetCustomerApprovalResult> {
    return this.http
      .post<GetCustomerApprovalResult>(`${this.legacyBase}/JobOpsChat/PostGetCustomerApproval`, body)
      .pipe(
        map((res) => res ?? { ok: false, error: 'empty_response' }),
        catchError(() => of({ ok: false, error: 'request_failed' })),
      );
  }

  /** Approves the linked customer estimate on behalf of the customer, then approves the onsite vendor estimate. */
  postApproveOnBehalfAndVendor(
    body: ApproveOnBehalfAndVendorRequest,
  ): Observable<OnsiteEstimateActionResult> {
    return this.http
      .post<OnsiteEstimateActionResult>(
        `${this.legacyBase}/JobOpsChat/PostApproveOnBehalfAndVendor`,
        body,
      )
      .pipe(
        map((res) => res ?? { ok: false, error: 'empty_response' }),
        catchError(() => of({ ok: false, error: 'request_failed' })),
      );
  }

  /** Checks the tech out while customer approval is still pending. */
  postCheckoutForApprovalLater(
    body: CustomerApprovalActionRequest,
  ): Observable<OnsiteEstimateActionResult> {
    return this.http
      .post<OnsiteEstimateActionResult>(
        `${this.legacyBase}/JobOpsChat/PostCheckoutForApprovalLater`,
        body,
      )
      .pipe(
        map((res) => res ?? { ok: false, error: 'empty_response' }),
        catchError(() => of({ ok: false, error: 'request_failed' })),
      );
  }

  getOnsiteNegotiateLines(estimateKey: string): Observable<OnsiteNegotiateLinesResult> {
    const params = new HttpParams().set('estimateKey', estimateKey);
    return this.http
      .get<unknown>(`${this.legacyBase}/JobOpsChat/GetOnsiteNegotiateLines`, { params })
      .pipe(
        map((body) => parseOnsiteNegotiateLinesResult(body) ?? { ok: false, error: 'parse_failed' }),
        timeout(60_000),
        catchError((err: unknown) => of(this.mapNegotiateLoadError(err))),
      );
  }

  private mapNegotiateLoadError(err: unknown): OnsiteNegotiateLinesResult {
    if (err instanceof HttpErrorResponse) {
      const parsed = parseOnsiteNegotiateLinesResult(err.error);
      if (parsed) return parsed;
      if (err.status === 0) {
        return {
          ok: false,
          error: 'network_error',
          message: 'Could not reach legacy admin for negotiate lines.',
        };
      }
      return {
        ok: false,
        error: 'request_failed',
        message: err.message || `HTTP ${err.status}`,
      };
    }
    return { ok: false, error: 'request_failed' };
  }

  postOnsiteNegotiate(body: OnsiteNegotiateRequest): Observable<OnsiteNegotiateResult> {
    return this.http
      .post<OnsiteNegotiateResult>(`${this.legacyBase}/JobOpsChat/PostOnsiteNegotiate`, body)
      .pipe(
        map((res) => res ?? { ok: false, error: 'empty_response' }),
        catchError(() => of({ ok: false, error: 'request_failed' })),
      );
  }

  getOnsiteDeclineIncurredLines(estimateKey: string): Observable<OnsiteDeclineIncurredLinesResult | null> {
    const params = new HttpParams().set('estimateKey', estimateKey);
    return this.http
      .get<unknown>(`${this.legacyBase}/JobOpsChat/GetOnsiteDeclineIncurredLines`, { params })
      .pipe(
        map((body) => parseOnsiteDeclineIncurredLinesResult(body)),
        timeout(60_000),
        catchError(() => of(null)),
      );
  }

  postOnsiteDeclineIncurredInvoice(
    body: OnsiteDeclineIncurredInvoiceRequest,
  ): Observable<OnsiteDeclineIncurredInvoiceResult> {
    return this.http
      .post<unknown>(`${this.legacyBase}/JobOpsChat/PostOnsiteDeclineIncurredInvoice`, body)
      .pipe(
        map((body) => parseOnsiteDeclineIncurredInvoiceResult(body)),
        catchError(() => of({ ok: false, error: 'request_failed' })),
      );
  }
}
