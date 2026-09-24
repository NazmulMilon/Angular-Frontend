import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/** A vendor email template. `templateKey` is null when creating. */
export interface VendorEmailTemplate {
  templateKey: number | null;
  templateName: string;
  subjectLine: string;
  detailContent: string;
}

/** The Job Ops API wraps responses in `{ status, data, ... }`; each method unwraps `.data`. */
interface Envelope<T> {
  status: boolean;
  data: T;
}

/**
 * Vendor Email Templates API client — targets `api/VendorEmailTemplates`.
 *
 * The `authInterceptor` attaches `Authorization: Bearer <jwt>` on every request, so no auth
 * handling is needed here. HTTP errors surface via the Observable's error channel.
 */
@Injectable({ providedIn: 'root' })
export class VendorEmailTemplatesService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/VendorEmailTemplates`;

  /** GET — list all manageable vendor email templates. */
  getAll(): Observable<VendorEmailTemplate[]> {
    return this.http
      .get<Envelope<VendorEmailTemplate[]>>(this.apiBase)
      .pipe(map((res) => res.data));
  }

  /** POST — create a new template. */
  create(template: Omit<VendorEmailTemplate, 'templateKey'>): Observable<VendorEmailTemplate> {
    return this.http
      .post<Envelope<VendorEmailTemplate>>(this.apiBase, template)
      .pipe(map((res) => res.data));
  }

  /** PUT /{templateKey} — update an existing template. */
  update(templateKey: number, template: Omit<VendorEmailTemplate, 'templateKey'>): Observable<VendorEmailTemplate> {
    return this.http
      .put<Envelope<VendorEmailTemplate>>(`${this.apiBase}/${templateKey}`, template)
      .pipe(map((res) => res.data));
  }

  /** DELETE /{templateKey} — hard-delete a template. */
  delete(templateKey: number): Observable<void> {
    return this.http.delete<void>(`${this.apiBase}/${templateKey}`);
  }
}
