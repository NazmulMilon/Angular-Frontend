import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import {
  DynMinMarkupPolicy,
  DynMinMarkupThresholdRequest,
  DynMinMarkupThresholdResponse,
} from '../models/dyn-min-markup.model';

/**
 * The Job Ops API wraps DynMinMarkup responses in the standard result envelope
 * (`{ status, responseCode, message, data, ... }`). Callers only need `data`, so
 * every method below unwraps it before returning.
 */
interface DynMinMarkupEnvelope<T> {
  status: boolean;
  data: T;
}

/**
 * Dynamic Minimum Markup API client — targets `api/DynMinMarkup`.
 *
 * The `authInterceptor` attaches `Authorization: Bearer <jwt>` on every request, so no auth
 * handling is needed here. Responses use the standard result envelope; each method unwraps
 * `.data` so callers receive the raw DTO. HTTP errors surface via the Observable's error channel.
 */
@Injectable({ providedIn: 'root' })
export class DynMinMarkupService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/DynMinMarkup`;

  /** GET /{customerKey} — read a customer's minimum-markup policy. */
  getPolicy(customerKey: string): Observable<DynMinMarkupPolicy> {
    return this.http
      .get<DynMinMarkupEnvelope<DynMinMarkupPolicy>>(`${this.apiBase}/${customerKey}`)
      .pipe(map((res) => res.data));
  }

  /** PUT — replace a customer's whole policy. */
  savePolicy(policy: DynMinMarkupPolicy): Observable<DynMinMarkupPolicy> {
    return this.http
      .put<DynMinMarkupEnvelope<DynMinMarkupPolicy>>(this.apiBase, policy)
      .pipe(map((res) => res.data));
  }

  /** POST /check-threshold — per-option preview of each option against the policy. */
  checkThreshold(
    request: DynMinMarkupThresholdRequest,
  ): Observable<DynMinMarkupThresholdResponse> {
    return this.http
      .post<DynMinMarkupEnvelope<DynMinMarkupThresholdResponse>>(
        `${this.apiBase}/check-threshold`,
        request,
      )
      .pipe(map((res) => res.data));
  }
}
