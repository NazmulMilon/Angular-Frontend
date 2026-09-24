import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/** A process type option (legacy `EmailSendToType`). */
export interface ProcessType {
  key: number;
  name: string;
}

/** A staff email option (legacy `StaffList`). */
export interface StaffEmail {
  key: string;
  name: string;
  email: string;
}

/** An existing receiver mapping row (legacy `EmailSendToAddress`). */
export interface ReceiverRow {
  emailKey: string;
  sendToType: number;
  processName: string;
  staffKey: string;
  email: string;
  description: string;
}

/** The screen payload: dropdown sources + existing rows. */
export interface EmailReceiversData {
  processTypes: ProcessType[];
  staffEmails: StaffEmail[];
  rows: ReceiverRow[];
}

/** Create/update payload. */
export interface ReceiverSave {
  sendToType: number;
  staffKey: string;
  description: string;
}

/** The Job Ops API wraps responses in `{ status, data, ... }`; each method unwraps `.data`. */
interface Envelope<T> {
  status: boolean;
  data: T;
}

/**
 * Email Receivers API client — targets `api/EmailReceivers`.
 * Maps process types to staff emails via `EmailSendToAddress` rows. The `authInterceptor` attaches the token.
 */
@Injectable({ providedIn: 'root' })
export class EmailReceiversService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/EmailReceivers`;

  /** GET — dropdown sources + existing rows. */
  get(): Observable<EmailReceiversData> {
    return this.http
      .get<Envelope<EmailReceiversData>>(this.apiBase)
      .pipe(map((res) => res.data));
  }

  /** POST — create a receiver mapping. */
  create(dto: ReceiverSave): Observable<ReceiverRow> {
    return this.http
      .post<Envelope<ReceiverRow>>(this.apiBase, dto)
      .pipe(map((res) => res.data));
  }

  /** PUT /{emailKey} — update a receiver mapping. */
  update(emailKey: string, dto: ReceiverSave): Observable<ReceiverRow> {
    return this.http
      .put<Envelope<ReceiverRow>>(`${this.apiBase}/${emailKey}`, dto)
      .pipe(map((res) => res.data));
  }

  /** DELETE /{emailKey} — remove a receiver mapping (409 if it's the last of its type). */
  delete(emailKey: string): Observable<void> {
    return this.http.delete<void>(`${this.apiBase}/${emailKey}`);
  }
}
