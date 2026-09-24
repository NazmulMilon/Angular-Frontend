import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/** A vendor estimate/invoice resubmit-reason template. `pKey` is null when creating. */
export interface ResubmitReason {
  pKey: number | null;
  templateTitle: string;
  reason: string;
}

/** The Job Ops API wraps responses in `{ status, data, ... }`; each method unwraps `.data`. */
interface Envelope<T> {
  status: boolean;
  data: T;
}

/**
 * Vendor Resubmit Reasons API client — targets `api/VendorResubmitReasons`.
 *
 * The `authInterceptor` attaches `Authorization: Bearer <jwt>` on every request, so no auth
 * handling is needed here. HTTP errors surface via the Observable's error channel.
 */
@Injectable({ providedIn: 'root' })
export class VendorResubmitReasonsService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/VendorResubmitReasons`;

  /** GET — list all resubmit reasons (ordered by title). */
  getAll(): Observable<ResubmitReason[]> {
    return this.http
      .get<Envelope<ResubmitReason[]>>(this.apiBase)
      .pipe(map((res) => res.data));
  }

  /** POST — create a new resubmit reason. */
  create(reason: Pick<ResubmitReason, 'templateTitle' | 'reason'>): Observable<ResubmitReason> {
    return this.http
      .post<Envelope<ResubmitReason>>(this.apiBase, reason)
      .pipe(map((res) => res.data));
  }

  /** PUT /{pKey} — update an existing resubmit reason. */
  update(pKey: number, reason: Pick<ResubmitReason, 'templateTitle' | 'reason'>): Observable<ResubmitReason> {
    return this.http
      .put<Envelope<ResubmitReason>>(`${this.apiBase}/${pKey}`, reason)
      .pipe(map((res) => res.data));
  }

  /** DELETE /{pKey} — hard-delete a resubmit reason. */
  delete(pKey: number): Observable<void> {
    return this.http.delete<void>(`${this.apiBase}/${pKey}`);
  }
}
