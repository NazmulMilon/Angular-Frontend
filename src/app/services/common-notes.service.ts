import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/** A common note. `templateKey` (exposed as `id`) is null when creating. */
export interface CommonNote {
  id: number | null;
  title: string;
  detail: string;
}

interface NoteApi { templateKey: number; title: string; detail: string }
interface Envelope<T> { status: boolean; data: T }

const toNote = (n: NoteApi): CommonNote => ({ id: n.templateKey, title: n.title, detail: n.detail });

/** Common Notes API client — targets `api/CommonNotes`. Global CRUD with hard delete. */
@Injectable({ providedIn: 'root' })
export class CommonNotesService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/CommonNotes`;

  getAll(): Observable<CommonNote[]> {
    return this.http.get<Envelope<NoteApi[]>>(this.apiBase).pipe(map((r) => (r.data ?? []).map(toNote)));
  }

  create(note: { title: string; detail: string }): Observable<CommonNote> {
    return this.http.post<Envelope<NoteApi>>(this.apiBase, note).pipe(map((r) => toNote(r.data)));
  }

  update(id: number, note: { title: string; detail: string }): Observable<CommonNote> {
    return this.http.put<Envelope<NoteApi>>(`${this.apiBase}/${id}`, note).pipe(map((r) => toNote(r.data)));
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiBase}/${id}`);
  }
}
