import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/** A staff member selectable as an invoice approving agent. `id` is the PersonnelKey. */
export interface ApprovingAgentStaff {
  id: string;
  name: string;
  email: string;
}

/** Screen payload: the full non-deleted staff list plus the PersonnelKeys currently registered as agents. */
export interface InvoiceApprovingAgentData {
  staff: ApprovingAgentStaff[];
  agentIds: string[];
}

/** The Job Ops API wraps responses in `{ status, data, ... }`; GET unwraps `.data`. */
interface Envelope<T> {
  status: boolean;
  data: T;
}

/**
 * Invoice Approving Agent API client — targets `api/InvoiceApprovingAgent`.
 *
 * Registering an agent (POST) also records a type-33 `EmailSendToAddress` row server-side;
 * un-registering (DELETE) removes both. Add/remove return 204 (no body). The `authInterceptor`
 * attaches the bearer token, so no auth handling is needed here.
 */
@Injectable({ providedIn: 'root' })
export class InvoiceApprovingAgentService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/InvoiceApprovingAgent`;

  /** GET — all non-deleted staff plus the PersonnelKeys already registered as agents. */
  get(): Observable<InvoiceApprovingAgentData> {
    return this.http
      .get<Envelope<InvoiceApprovingAgentData>>(this.apiBase)
      .pipe(map((res) => res.data));
  }

  /** POST /{personnelKey} — register a staff member as an approving agent (idempotent). */
  add(personnelKey: string): Observable<void> {
    return this.http.post<void>(`${this.apiBase}/${personnelKey}`, {});
  }

  /** DELETE /{personnelKey} — un-register a staff member as an approving agent. */
  remove(personnelKey: string): Observable<void> {
    return this.http.delete<void>(`${this.apiBase}/${personnelKey}`);
  }
}
