import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/** A customer email template in the component's vocabulary (`pKey` / `bodyContent`). */
export interface CustomerEmailTemplate {
  pKey: number | null;
  templateName: string;
  subjectLine: string;
  bodyContent: string;
}

/** The backend DTO shape (`templateKey` / `detailContent`); mapped to/from {@link CustomerEmailTemplate}. */
interface ApiTemplate {
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
 * Customer Email Templates API client — targets `api/CustomerEmailTemplates`.
 *
 * The backend speaks `templateKey`/`detailContent`; this service maps that to the component's
 * `pKey`/`bodyContent` vocabulary. The `authInterceptor` attaches the bearer token.
 */
@Injectable({ providedIn: 'root' })
export class CustomerEmailTemplatesService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/CustomerEmailTemplates`;

  /** GET — list all manageable customer email templates. */
  getAll(): Observable<CustomerEmailTemplate[]> {
    return this.http
      .get<Envelope<ApiTemplate[]>>(this.apiBase)
      .pipe(map((res) => (res.data ?? []).map(toModel)));
  }

  /** POST — create a new template. */
  create(template: Omit<CustomerEmailTemplate, 'pKey'>): Observable<CustomerEmailTemplate> {
    return this.http
      .post<Envelope<ApiTemplate>>(this.apiBase, toApi(template))
      .pipe(map((res) => toModel(res.data)));
  }

  /** PUT /{templateKey} — update an existing template. */
  update(pKey: number, template: Omit<CustomerEmailTemplate, 'pKey'>): Observable<CustomerEmailTemplate> {
    return this.http
      .put<Envelope<ApiTemplate>>(`${this.apiBase}/${pKey}`, toApi(template))
      .pipe(map((res) => toModel(res.data)));
  }

  /** DELETE /{templateKey} — hard-delete a template. */
  delete(pKey: number): Observable<void> {
    return this.http.delete<void>(`${this.apiBase}/${pKey}`);
  }
}

function toModel(a: ApiTemplate): CustomerEmailTemplate {
  return {
    pKey: a.templateKey,
    templateName: a.templateName,
    subjectLine: a.subjectLine,
    bodyContent: a.detailContent,
  };
}

function toApi(m: Omit<CustomerEmailTemplate, 'pKey'>): Omit<ApiTemplate, 'templateKey'> {
  return {
    templateName: m.templateName,
    subjectLine: m.subjectLine,
    detailContent: m.bodyContent,
  };
}
