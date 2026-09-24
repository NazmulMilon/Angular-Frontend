import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/** Backend uses int DocumentFor keys; the component works in strings. */
interface DocumentForApi { key: number; name: string }
interface RowApi { id: string; name: string; documentForKey: number; documentForName: string; isActive: boolean }

export interface DocumentFor { key: string; name: string }
export interface DocumentTypeRow {
  id: string | null;
  name: string;
  documentForKey: string;
  documentForName: string;
  isActive: boolean;
}
export interface DocumentTypeData { documentFors: DocumentFor[]; rows: DocumentTypeRow[] }

interface Envelope<T> {
  status: boolean;
  data: T;
}

const toRow = (r: RowApi): DocumentTypeRow => ({
  id: r.id,
  name: r.name,
  documentForKey: String(r.documentForKey),
  documentForName: r.documentForName,
  isActive: r.isActive,
});

/**
 * Document Type API client — targets `api/DocumentType`. Company-scoped soft-delete (no hard
 * delete). Numeric DocumentFor keys are mapped to strings. The `authInterceptor` attaches the token.
 */
@Injectable({ providedIn: 'root' })
export class DocumentTypeService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/DocumentType`;

  /** GET — DocumentFor options plus all document type rows. */
  get(): Observable<DocumentTypeData> {
    return this.http.get<Envelope<{ documentFors: DocumentForApi[]; rows: RowApi[] }>>(this.apiBase).pipe(
      map((r) => ({
        documentFors: r.data.documentFors.map((d) => ({ key: String(d.key), name: d.name })),
        rows: r.data.rows.map(toRow),
      })),
    );
  }

  /** POST — create a document type. */
  create(row: { name: string; documentForKey: string; isActive: boolean }): Observable<DocumentTypeRow> {
    return this.http
      .post<Envelope<RowApi>>(this.apiBase, { name: row.name, documentForKey: Number(row.documentForKey), isActive: row.isActive })
      .pipe(map((r) => toRow(r.data)));
  }

  /** PUT /{id} — update a document type. */
  update(id: string, row: { name: string; documentForKey: string; isActive: boolean }): Observable<DocumentTypeRow> {
    return this.http
      .put<Envelope<RowApi>>(`${this.apiBase}/${id}`, { name: row.name, documentForKey: Number(row.documentForKey), isActive: row.isActive })
      .pipe(map((r) => toRow(r.data)));
  }
}
