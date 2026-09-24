import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/** The customer email (SMTP) configuration. Password is clear text over the wire (encrypted at rest). */
export interface CustomerEmailConfig {
  emailAddress: string | null;
  smtpServer: string;
  smtpPort: string;
  smtpUsername: string;
  smtpPassword: string;
  isSmtpSsl: boolean;
}

/** The Job Ops API wraps responses in `{ status, data, ... }`; each method unwraps `.data`. */
interface Envelope<T> {
  status: boolean;
  data: T;
}

/**
 * Customer Email Configuration API client — targets `api/Settings/customer-email-config`.
 *
 * The `authInterceptor` attaches `Authorization: Bearer <jwt>` on every request, so no auth
 * handling is needed here. HTTP errors surface via the Observable's error channel.
 */
@Injectable({ providedIn: 'root' })
export class CustomerEmailConfigService {
  private readonly http = inject(HttpClient);
  private readonly endpoint = `${environment.apiBaseUrl}/api/Settings/customer-email-config`;

  /** GET — read the current customer email config (password decrypted). */
  get(): Observable<CustomerEmailConfig> {
    return this.http
      .get<Envelope<CustomerEmailConfig>>(this.endpoint)
      .pipe(map((res) => res.data));
  }

  /** PUT — save the customer email config (password encrypted at rest). */
  save(config: CustomerEmailConfig): Observable<CustomerEmailConfig> {
    return this.http
      .put<Envelope<CustomerEmailConfig>>(this.endpoint, config)
      .pipe(map((res) => res.data));
  }
}
