import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/** The vendor email (SMTP) configuration. Password is clear text over the wire (encrypted at rest). */
export interface VendorEmailConfig {
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
 * Vendor Email Configuration API client — targets `api/Settings/vendor-email-config`.
 *
 * The `authInterceptor` attaches `Authorization: Bearer <jwt>` on every request, so no auth
 * handling is needed here. HTTP errors surface via the Observable's error channel.
 */
@Injectable({ providedIn: 'root' })
export class VendorEmailConfigService {
  private readonly http = inject(HttpClient);
  private readonly endpoint = `${environment.apiBaseUrl}/api/Settings/vendor-email-config`;

  /** GET — read the current vendor email config (password decrypted). */
  get(): Observable<VendorEmailConfig> {
    return this.http
      .get<Envelope<VendorEmailConfig>>(this.endpoint)
      .pipe(map((res) => res.data));
  }

  /** PUT — save the vendor email config (password encrypted at rest). */
  save(config: VendorEmailConfig): Observable<VendorEmailConfig> {
    return this.http
      .put<Envelope<VendorEmailConfig>>(this.endpoint, config)
      .pipe(map((res) => res.data));
  }
}
