import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/** A predefined note footer. Edit-only — only `detail` is editable. */
export interface NoteFooter {
  key: number;
  footerName: string;
  detail: string;
}

interface ApiRow { noteFooterKey: number; footerName: string; subjectLine: string; detail: string }
interface Envelope<T> { status: boolean; data: T }

const toRow = (r: ApiRow): NoteFooter => ({ key: r.noteFooterKey, footerName: r.footerName, detail: r.detail });

/** Note Footer API client — targets `api/NoteFooter`. List + edit-detail only. */
@Injectable({ providedIn: 'root' })
export class NoteFooterService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/NoteFooter`;

  getAll(): Observable<NoteFooter[]> {
    return this.http.get<Envelope<ApiRow[]>>(this.apiBase).pipe(map((r) => (r.data ?? []).map(toRow)));
  }

  /** PUT /{key} — update the footer's detail body. */
  updateDetail(key: number, detail: string): Observable<NoteFooter> {
    return this.http.put<Envelope<ApiRow>>(`${this.apiBase}/${key}`, { detail }).pipe(map((r) => toRow(r.data)));
  }
}
