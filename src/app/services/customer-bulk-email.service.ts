import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/** A reusable bulk-email template (with body). `templateKey` 0 means "create new". */
export interface BulkEmailTemplate {
  templateKey: number;
  templateName: string;
  subjectLine: string;
  bodyContent: string;
}

/** A selectable customer for the "Customer Defaults" tab. */
export interface BulkEmailCustomer {
  id: string;
  name: string;
  email: string;
}

/** A selectable customer/location contact for the "Customer And Location Contacts" tab. */
export interface BulkEmailContact {
  id: string;
  customerName: string;
  contactName: string;
  email: string;
}

/** Enqueue request for either send tab (`recipientIds` = customer keys or contact keys). */
export interface SendBulkEmailRequest {
  senderMode: 'self' | 'service';
  templateKey: number;
  templateName: string;
  subject: string;
  bodyContent: string;
  recipientIds: string[];
}

/** Result of an enqueue call. */
export interface SendBulkEmailResult {
  queued: boolean;
  recipients: number;
}

/** The Job Ops API wraps responses in `{ status, data, ... }`; each method unwraps `.data`. */
interface Envelope<T> {
  status: boolean;
  data: T;
}

/**
 * Send Bulk Email to Customer API client — targets `api/CustomerBulkEmail`.
 *
 * "Send" does not transmit mail inline: the backend upserts the template then runs a stored proc
 * that enqueues per-recipient rows for the background mailer. The `authInterceptor` attaches the
 * bearer token, so no auth handling is needed here.
 */
@Injectable({ providedIn: 'root' })
export class CustomerBulkEmailService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/CustomerBulkEmail`;

  /** GET — all saved bulk-email templates (with body). */
  getTemplates(): Observable<BulkEmailTemplate[]> {
    return this.http
      .get<Envelope<BulkEmailTemplate[]>>(`${this.apiBase}/templates`)
      .pipe(map((res) => res.data));
  }

  /** POST — create (`templateKey` 0) or update a template; returns it with its key. */
  saveTemplate(template: BulkEmailTemplate): Observable<BulkEmailTemplate> {
    return this.http
      .post<Envelope<BulkEmailTemplate>>(`${this.apiBase}/templates`, template)
      .pipe(map((res) => res.data));
  }

  /** GET — non-deleted customers for the "Customer Defaults" tab. */
  getCustomers(): Observable<BulkEmailCustomer[]> {
    return this.http
      .get<Envelope<BulkEmailCustomer[]>>(`${this.apiBase}/customers`)
      .pipe(map((res) => res.data));
  }

  /** GET — non-deleted customer/location contacts for the contacts tab. */
  getContacts(): Observable<BulkEmailContact[]> {
    return this.http
      .get<Envelope<BulkEmailContact[]>>(`${this.apiBase}/contacts`)
      .pipe(map((res) => res.data));
  }

  /** POST — enqueue the email to the selected customers' default contacts. */
  sendToCustomers(req: SendBulkEmailRequest): Observable<SendBulkEmailResult> {
    return this.http
      .post<Envelope<SendBulkEmailResult>>(`${this.apiBase}/send/customers`, req)
      .pipe(map((res) => res.data));
  }

  /** POST — enqueue the email to the selected location contacts. */
  sendToContacts(req: SendBulkEmailRequest): Observable<SendBulkEmailResult> {
    return this.http
      .post<Envelope<SendBulkEmailResult>>(`${this.apiBase}/send/contacts`, req)
      .pipe(map((res) => res.data));
  }
}
