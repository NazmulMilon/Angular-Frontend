import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/** An accounting status. `id` is null when creating. */
export interface AccountingStatus {
  id: string | null;
  name: string;
  level: number | null;
  isActive: boolean;
}

interface Envelope<T> { status: boolean; data: T }

/** Accounting Status API client — targets `api/AccountingStatus`. Company-scoped soft-delete (no hard delete). */
@Injectable({ providedIn: 'root' })
export class AccountingStatusService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/AccountingStatus`;

  getAll(): Observable<AccountingStatus[]> {
    return this.http.get<Envelope<AccountingStatus[]>>(this.apiBase).pipe(map((r) => r.data));
  }

  create(row: Omit<AccountingStatus, 'id'>): Observable<AccountingStatus> {
    return this.http.post<Envelope<AccountingStatus>>(this.apiBase, row).pipe(map((r) => r.data));
  }

  update(id: string, row: Omit<AccountingStatus, 'id'>): Observable<AccountingStatus> {
    return this.http.put<Envelope<AccountingStatus>>(`${this.apiBase}/${id}`, row).pipe(map((r) => r.data));
  }
}
