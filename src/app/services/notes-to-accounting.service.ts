import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/** A staff member selectable as an accounting person. `id` is the PersonnelKey. */
export interface AccountingStaff {
  id: string;
  name: string;
  email: string;
}

/** Screen payload: the full non-deleted staff list plus the PersonnelKeys currently flagged. */
export interface NotesToAccountingData {
  staff: AccountingStaff[];
  accountingIds: string[];
}

/** The Job Ops API wraps responses in `{ status, data, ... }`; GET unwraps `.data`. */
interface Envelope<T> {
  status: boolean;
  data: T;
}

/**
 * Notes to Accounting API client — targets `api/NotesToAccounting`.
 *
 * Flagging a staff member (POST) inserts an `AccountingPerson` row server-side; un-flagging
 * (DELETE) removes it. Add/remove return 204 (no body). The `authInterceptor` attaches the
 * bearer token, so no auth handling is needed here.
 */
@Injectable({ providedIn: 'root' })
export class NotesToAccountingService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/NotesToAccounting`;

  /** GET — all non-deleted staff plus the PersonnelKeys already flagged as accounting persons. */
  get(): Observable<NotesToAccountingData> {
    return this.http
      .get<Envelope<NotesToAccountingData>>(this.apiBase)
      .pipe(map((res) => res.data));
  }

  /** POST /{personnelKey} — flag a staff member as an accounting person (idempotent). */
  add(personnelKey: string): Observable<void> {
    return this.http.post<void>(`${this.apiBase}/${personnelKey}`, {});
  }

  /** DELETE /{personnelKey} — un-flag a staff member as an accounting person. */
  remove(personnelKey: string): Observable<void> {
    return this.http.delete<void>(`${this.apiBase}/${personnelKey}`);
  }
}
