import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/** A customer job status. `id` is null when creating. `isActive` is the inverse of the stored IsDelete. */
export interface CustomerJobStatus {
  id: string | null;
  name: string;
  level: number | null;
  isActive: boolean;
}

/** The Job Ops API wraps responses in `{ status, data, ... }`; each method unwraps `.data`. */
interface Envelope<T> {
  status: boolean;
  data: T;
}

/** Customer Job Status API client — targets `api/CustomerJobStatus`. Company-scoped; no hard delete (deactivate via isActive). */
@Injectable({ providedIn: 'root' })
export class CustomerJobStatusService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/CustomerJobStatus`;

  /** GET — list the company's job statuses. */
  getAll(): Observable<CustomerJobStatus[]> {
    return this.http.get<Envelope<CustomerJobStatus[]>>(this.apiBase).pipe(map((r) => r.data));
  }

  /** POST — create a new job status. */
  create(status: Omit<CustomerJobStatus, 'id'>): Observable<CustomerJobStatus> {
    return this.http.post<Envelope<CustomerJobStatus>>(this.apiBase, status).pipe(map((r) => r.data));
  }

  /** PUT /{id} — update an existing job status (also used to activate/deactivate). */
  update(id: string, status: Omit<CustomerJobStatus, 'id'>): Observable<CustomerJobStatus> {
    return this.http.put<Envelope<CustomerJobStatus>>(`${this.apiBase}/${id}`, status).pipe(map((r) => r.data));
  }
}
