import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export type TimeType = 1 | 2 | 3; // 1 = Hour(s), 2 = Day(s), 3 = Minutes

/** A reminder-email time definition. `id` (Pkey) is null when creating. */
export interface TimeDefinition {
  id: number | null;
  description: string;
  timeLimit: number | null;
  timeType: TimeType;
}

interface ApiRow { pkey: number; description: string; timeLimit: number | null; timeType: number }
interface Envelope<T> { status: boolean; data: T }

const toRow = (r: ApiRow): TimeDefinition => ({
  id: r.pkey,
  description: r.description,
  timeLimit: r.timeLimit,
  timeType: (r.timeType || 1) as TimeType,
});

/** Time Definition API client — targets `api/TimeDefinition`. Global list; create + update (no delete). */
@Injectable({ providedIn: 'root' })
export class TimeDefinitionService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/TimeDefinition`;

  getAll(): Observable<TimeDefinition[]> {
    return this.http.get<Envelope<ApiRow[]>>(this.apiBase).pipe(map((r) => (r.data ?? []).map(toRow)));
  }

  create(row: { description: string; timeLimit: number | null; timeType: TimeType }): Observable<TimeDefinition> {
    return this.http.post<Envelope<ApiRow>>(this.apiBase, row).pipe(map((r) => toRow(r.data)));
  }

  update(id: number, row: { description: string; timeLimit: number | null; timeType: TimeType }): Observable<TimeDefinition> {
    return this.http.put<Envelope<ApiRow>>(`${this.apiBase}/${id}`, row).pipe(map((r) => toRow(r.data)));
  }
}
