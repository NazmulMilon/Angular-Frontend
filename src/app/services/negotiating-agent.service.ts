import { Injectable, inject } from '@angular/core';

import { HttpClient, HttpErrorResponse } from '@angular/common/http';

import { Observable, catchError, of, tap, timeout } from 'rxjs';



import { environment } from '../../environments/environment';

import {

  VendorBillsApiResponse,

  AdminEstimateNegotiation,

  AdminSendCounterRequest,

} from '../models/vendor-bills.model';



@Injectable({ providedIn: 'root' })

export class NegotiatingAgentService {

  private readonly http = inject(HttpClient);

  private readonly base = `${environment.apiBaseUrl}/api/v1/admin/vendor-bills`;

  private static readonly TIMEOUT_MS = 60_000;

  private static readonly POLL_MS = 1_500;

  private static readonly MAX_POLLS = 10;



  getNegotiation(estimateKey: string): Observable<VendorBillsApiResponse<AdminEstimateNegotiation>> {

    return this.http

      .get<VendorBillsApiResponse<AdminEstimateNegotiation>>(

        `${this.base}/estimates/${estimateKey}/negotiation`,

      )

      .pipe(

        timeout(NegotiatingAgentService.TIMEOUT_MS),

        catchError((err) =>
          of(this.mapHttpError<AdminEstimateNegotiation>(err, 'Unable to load negotiation recommendations.')),
        ),

      );

  }



  /** Poll until recommendationsReady or max attempts (one result per estimate). */
  pollNegotiationUntilReady(
    estimateKey: string,
  ): Observable<{ data: AdminEstimateNegotiation | null; errorMessage: string }> {
    return new Observable<{ data: AdminEstimateNegotiation | null; errorMessage: string }>((subscriber) => {
      let attempts = 0;
      let lastError = '';

      const poll = (): void => {
        if (attempts >= NegotiatingAgentService.MAX_POLLS) {
          subscriber.next({ data: null, errorMessage: lastError });
          subscriber.complete();
          return;
        }

        attempts++;
        this.getNegotiation(estimateKey).subscribe({
          next: (res) => {
            if (!res?.status) {
              lastError = res?.message || lastError || 'Could not load agent recommendations.';
            }

            const data = res?.status ? res.data : null;

            if (data?.errorMessage && !data.recommendationsReady) {
              subscriber.next({ data, errorMessage: data.errorMessage });
              subscriber.complete();
              return;
            }

            const ready = res?.status && data?.recommendationsReady;
            if (ready) {
              subscriber.next({ data, errorMessage: '' });
              subscriber.complete();
              return;
            }

            if (attempts >= NegotiatingAgentService.MAX_POLLS) {
              subscriber.next({
                data: res?.status ? (data ?? null) : null,
                errorMessage: lastError || data?.errorMessage || 'Could not load agent recommendations.',
              });
              subscriber.complete();
              return;
            }

            setTimeout(poll, NegotiatingAgentService.POLL_MS);
          },
          error: () => {
            subscriber.next({
              data: null,
              errorMessage: lastError || 'Could not load agent recommendations.',
            });
            subscriber.complete();
          },
        });
      };

      poll();
    });
  }



  sendCounter(

    estimateKey: string,

    body: AdminSendCounterRequest,

  ): Observable<VendorBillsApiResponse<AdminEstimateNegotiation>> {

    return this.http

      .post<VendorBillsApiResponse<AdminEstimateNegotiation>>(

        `${this.base}/estimates/${estimateKey}/send-counter`,

        body,

      )

      .pipe(

        timeout(NegotiatingAgentService.TIMEOUT_MS),

        catchError((err) =>
          of(this.mapHttpError<AdminEstimateNegotiation>(err, 'Failed to send counter.')),
        ),

      );

  }



  acceptAll(

    estimateKey: string,

    notesToVendor?: string | null,

  ): Observable<VendorBillsApiResponse<AdminEstimateNegotiation>> {

    return this.http

      .post<VendorBillsApiResponse<AdminEstimateNegotiation>>(

        `${this.base}/estimates/${estimateKey}/accept-all`,

        { notesToVendor: notesToVendor ?? null },

      )

      .pipe(

        timeout(NegotiatingAgentService.TIMEOUT_MS),

        catchError((err) =>
          of(this.mapHttpError<AdminEstimateNegotiation>(err, 'Failed to accept all recommendations.')),
        ),

      );

  }

  private mapHttpError<T>(err: unknown, fallback: string): VendorBillsApiResponse<T> {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as Partial<VendorBillsApiResponse<T>> | null;
      if (body && typeof body === 'object' && typeof body.message === 'string') {
        return {
          status: false,
          responseCode: body.responseCode ?? err.status,
          message: body.message,
          data: (body.data ?? null) as T,
          details: body.details ?? [],
          unixTime: body.unixTime ?? 0,
          traceId: body.traceId ?? null,
        };
      }

      return {
        status: false,
        responseCode: err.status,
        message: err.statusText || fallback,
        data: null as unknown as T,
        details: [],
        unixTime: 0,
        traceId: null,
      };
    }

    return {
      status: false,
      responseCode: 0,
      message: fallback,
      data: null as unknown as T,
      details: [],
      unixTime: 0,
      traceId: null,
    };
  }

}


