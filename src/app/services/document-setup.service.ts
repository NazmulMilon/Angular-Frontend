import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/** The company-wide documentation setup. Header/body/quote fields are rich-text HTML. */
export interface DocumentSetup {
  workOrderSubject: string;
  invoiceSubject: string;
  estimateSubject: string;
  workOrderHeader: string;
  invoiceHeader: string;
  estimateHeader: string;
  signOffSheet: string;
  quoteConfiguration: string;
  estimateEmailBody: string;
  invoiceEmailBody: string;
}

interface Envelope<T> {
  status: boolean;
  data: T;
}

/**
 * Document Setup API client — targets `api/Settings/document-setup` (a company-wide singleton,
 * get-or-create). The `authInterceptor` attaches the bearer token, so no auth handling is needed here.
 */
@Injectable({ providedIn: 'root' })
export class DocumentSetupService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/Settings/document-setup`;

  /** GET — the documentation setup (created on first read if missing). */
  get(): Observable<DocumentSetup> {
    return this.http.get<Envelope<DocumentSetup>>(this.apiBase).pipe(map((r) => r.data));
  }

  /** PUT — save the documentation setup; returns the persisted values. */
  save(dto: DocumentSetup): Observable<DocumentSetup> {
    return this.http.put<Envelope<DocumentSetup>>(this.apiBase, dto).pipe(map((r) => r.data));
  }
}
