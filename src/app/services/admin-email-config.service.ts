import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/** A staff member in the Admin Email Configuration roster (legacy `StaffList`). */
export interface Staff {
  personnelKey: string;
  pid: string;
  name: string;
  usergroup: string;
  phone: string;
  phoneExt: string;
  mobile: string;
  email: string;
  department: string;
  designation: string;
  /** Secure link to the staff member's profile photo (empty when none uploaded). */
  photoUrl: string;
}

/** One staff member's SMTP sender configuration (plaintext password in transit). */
export interface EmailConfigForm {
  senderName: string;
  smtpServer: string;
  smtpPort: string;
  smtpUsername: string;
  smtpPassword: string;
  footer: string;
}

/** GET detail payload: the SMTP config plus the checked receiver checkbox values. */
export interface EmailConfigDetail {
  config: EmailConfigForm;
  checkedReceivers: number[];
}

/** The Job Ops API wraps responses in `{ status, data, ... }`; each method unwraps `.data`. */
interface Envelope<T> {
  status: boolean;
  data: T;
}

/**
 * Admin Email Configuration API client — targets `api/AdminEmailConfig`.
 *
 * Backs the staff roster, per-staff SMTP config, and per-staff notification receivers.
 * The `authInterceptor` attaches the bearer token.
 */
@Injectable({ providedIn: 'root' })
export class AdminEmailConfigService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/AdminEmailConfig`;

  /** GET — the staff roster. */
  getStaff(): Observable<Staff[]> {
    return this.http
      .get<Envelope<Staff[]>>(`${this.apiBase}/staff`)
      .pipe(map((res) => res.data ?? []));
  }

  /** GET — one staff member's SMTP config + checked receiver values. */
  getDetail(personnelKey: string): Observable<EmailConfigDetail> {
    return this.http
      .get<Envelope<EmailConfigDetail>>(`${this.apiBase}/staff/${personnelKey}`)
      .pipe(map((res) => res.data));
  }

  /** PUT — save one staff member's SMTP sender config (204, no body). */
  saveConfig(personnelKey: string, form: EmailConfigForm): Observable<void> {
    return this.http.put<void>(`${this.apiBase}/staff/${personnelKey}/config`, form);
  }

  /** PUT — replace one staff member's notification-receiver roles (204, no body). */
  saveReceivers(personnelKey: string, values: number[]): Observable<void> {
    return this.http.put<void>(`${this.apiBase}/staff/${personnelKey}/receivers`, values);
  }
}
