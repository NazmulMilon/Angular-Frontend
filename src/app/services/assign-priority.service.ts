import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface PriorityOption {
  key: string;
  name: string;
}

export interface PriorityUser {
  id: string;
  pid: string;
  name: string;
  designation: string;
  phone: string;
  email: string;
  priorityKey: string | null;
}

export interface AssignPriorityData {
  priorities: PriorityOption[];
  users: PriorityUser[];
}

interface Envelope<T> {
  status: boolean;
  data: T;
}

/**
 * Assign Priority to User API client — targets `api/AssignPriority`.
 *
 * A priority is held by one user at a time; assigning moves it. Assign/remove return 204. The
 * `authInterceptor` attaches the bearer token, so no auth handling is needed here.
 */
@Injectable({ providedIn: 'root' })
export class AssignPriorityService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/AssignPriority`;

  /** GET — priorities plus the staff roster with current holdings. */
  get(): Observable<AssignPriorityData> {
    return this.http.get<Envelope<AssignPriorityData>>(this.apiBase).pipe(map((r) => r.data));
  }

  /** PUT /{personnelKey}/priority — assign a priority (or pass null to clear it). */
  assign(personnelKey: string, jobTypeKey: string | null): Observable<void> {
    return this.http.put<void>(`${this.apiBase}/${personnelKey}/priority`, { jobTypeKey });
  }
}
