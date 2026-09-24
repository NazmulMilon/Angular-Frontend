import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/** Function a sender config is used for: 1 = Customer Invoice, 2 = Customer Estimate. */
export type EmailFunction = 1 | 2;

/** A sender email configuration (legacy `EmailConfigurationForSendingEmail`). */
export interface SenderConfig {
  /** GUID string; `null` for a not-yet-persisted record. */
  id: string | null;
  functionName: EmailFunction;
  senderName: string;
  emailAddress: string;
  smtpServer: string;
  smtpPort: string;
  smtpUsername: string;
  /** Plaintext in transit; encrypted at rest by the backend. */
  smtpPassword: string;
  isSmtpSsl: boolean;
}

/** The Job Ops API wraps responses in `{ status, data, ... }`; each method unwraps `.data`. */
interface Envelope<T> {
  status: boolean;
  data: T;
}

/**
 * Common Email Config API client — targets `api/CommonEmailConfig`.
 *
 * The backend DTO is camelCase and matches {@link SenderConfig} field-for-field, so no mapping is
 * needed. The `authInterceptor` attaches the bearer token.
 */
@Injectable({ providedIn: 'root' })
export class CommonEmailConfigService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/CommonEmailConfig`;

  /** GET — list all sender email configurations. */
  getAll(): Observable<SenderConfig[]> {
    return this.http
      .get<Envelope<SenderConfig[]>>(this.apiBase)
      .pipe(map((res) => res.data ?? []));
  }

  /** POST — create a new configuration. */
  create(config: Omit<SenderConfig, 'id'>): Observable<SenderConfig> {
    return this.http
      .post<Envelope<SenderConfig>>(this.apiBase, config)
      .pipe(map((res) => res.data));
  }

  /** PUT /{id} — update an existing configuration. */
  update(id: string, config: Omit<SenderConfig, 'id'>): Observable<SenderConfig> {
    return this.http
      .put<Envelope<SenderConfig>>(`${this.apiBase}/${id}`, config)
      .pipe(map((res) => res.data));
  }

  /** DELETE /{id} — hard-delete a configuration. */
  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiBase}/${id}`);
  }
}
