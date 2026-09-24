import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/** A staff email configuration selectable as a job-request recipient. `id` is the EmailConfiguration key. */
export interface JobRequestEmailStaff {
  id: string;
  name: string;
  email: string;
}

/** Screen payload: all active email configurations plus the keys currently registered as recipients. */
export interface JobRequestEmailData {
  staff: JobRequestEmailStaff[];
  recipientIds: string[];
}

/** The Job Ops API wraps responses in `{ status, data, ... }`; GET unwraps `.data`. */
interface Envelope<T> {
  status: boolean;
  data: T;
}

/**
 * Job Request Email API client — targets `api/JobRequestEmail`.
 *
 * Registering a recipient (POST) inserts a `JobRequestEmailConfiguration` row; un-registering
 * (DELETE) removes it. Add/remove return 204 (no body). The `authInterceptor` attaches the bearer
 * token, so no auth handling is needed here.
 */
@Injectable({ providedIn: 'root' })
export class JobRequestEmailService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/JobRequestEmail`;

  /** GET — all active email configurations plus the EmailConfiguration keys already registered. */
  get(): Observable<JobRequestEmailData> {
    return this.http
      .get<Envelope<JobRequestEmailData>>(this.apiBase)
      .pipe(map((res) => res.data));
  }

  /** POST /{emailConfigurationKey} — register a recipient (idempotent). */
  add(emailConfigurationKey: string): Observable<void> {
    return this.http.post<void>(`${this.apiBase}/${emailConfigurationKey}`, {});
  }

  /** DELETE /{emailConfigurationKey} — un-register a recipient. */
  remove(emailConfigurationKey: string): Observable<void> {
    return this.http.delete<void>(`${this.apiBase}/${emailConfigurationKey}`);
  }
}
