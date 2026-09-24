import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/** A job priority / job type row. `id` is null when creating. */
export interface JobPriority {
  id: string | null;
  level: number | null;
  name: string;
  colorCode: string;
  isActive: boolean;
}

/** The Job Ops API wraps responses in `{ status, data, ... }`; each method unwraps `.data`. */
interface Envelope<T> {
  status: boolean;
  data: T;
}

/**
 * Job Priority API client — targets `api/JobPriority`.
 *
 * Company-scoped with soft-delete (no hard delete). The `authInterceptor` attaches the bearer
 * token, so no auth handling is needed here.
 */
@Injectable({ providedIn: 'root' })
export class JobPriorityService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/JobPriority`;

  /** GET — list all job priorities (active + inactive, ordered by level). */
  getAll(): Observable<JobPriority[]> {
    return this.http.get<Envelope<JobPriority[]>>(this.apiBase).pipe(map((res) => res.data));
  }

  /** POST — create a new job priority. */
  create(row: Omit<JobPriority, 'id'>): Observable<JobPriority> {
    return this.http.post<Envelope<JobPriority>>(this.apiBase, row).pipe(map((res) => res.data));
  }

  /** PUT /{id} — update an existing job priority. */
  update(id: string, row: Omit<JobPriority, 'id'>): Observable<JobPriority> {
    return this.http.put<Envelope<JobPriority>>(`${this.apiBase}/${id}`, row).pipe(map((res) => res.data));
  }
}
