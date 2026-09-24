import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface JobStatusUsergroup {
  key: string;
  name: string;
}

/** A job status row. `id` is null when creating. */
export interface JobStatusRow {
  id: string | null;
  adminLabel: string;
  customerLabel: string;
  vendorLabel: string;
  level: number | null;
  triggerDetails: string;
  isActive: boolean;
  usergroupKeys: string[];
}

/** The full Job Status payload. */
export interface JobStatusData {
  usergroups: JobStatusUsergroup[];
  rows: JobStatusRow[];
}

interface Envelope<T> {
  status: boolean;
  data: T;
}

/**
 * Job Status API client — targets `api/JobStatus`.
 *
 * Company-scoped with soft-delete (no hard delete). Saving a row syncs its usergroup mappings to
 * the provided keys. The `authInterceptor` attaches the bearer token, so no auth handling here.
 */
@Injectable({ providedIn: 'root' })
export class JobStatusService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/JobStatus`;

  /** GET — usergroups + all job status rows with mappings. */
  get(): Observable<JobStatusData> {
    return this.http.get<Envelope<JobStatusData>>(this.apiBase).pipe(map((r) => r.data));
  }

  /** POST — create a new job status. */
  create(row: Omit<JobStatusRow, 'id'>): Observable<JobStatusRow> {
    return this.http.post<Envelope<JobStatusRow>>(this.apiBase, row).pipe(map((r) => r.data));
  }

  /** PUT /{id} — update an existing job status. */
  update(id: string, row: Omit<JobStatusRow, 'id'>): Observable<JobStatusRow> {
    return this.http.put<Envelope<JobStatusRow>>(`${this.apiBase}/${id}`, row).pipe(map((r) => r.data));
  }
}
