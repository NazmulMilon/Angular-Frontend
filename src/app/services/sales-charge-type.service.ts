import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/** A sales charge type. `id` is null when creating. */
export interface SalesChargeType {
  id: string | null;
  name: string;
  description: string;
  isActive: boolean;
}

interface Envelope<T> { status: boolean; data: T }

/** Sales Charge Type API client — targets `api/SalesChargeType`. Company-scoped soft-delete (no hard delete). */
@Injectable({ providedIn: 'root' })
export class SalesChargeTypeService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/SalesChargeType`;

  getAll(): Observable<SalesChargeType[]> {
    return this.http.get<Envelope<SalesChargeType[]>>(this.apiBase).pipe(map((r) => r.data));
  }

  create(row: Omit<SalesChargeType, 'id'>): Observable<SalesChargeType> {
    return this.http.post<Envelope<SalesChargeType>>(this.apiBase, row).pipe(map((r) => r.data));
  }

  update(id: string, row: Omit<SalesChargeType, 'id'>): Observable<SalesChargeType> {
    return this.http.put<Envelope<SalesChargeType>>(`${this.apiBase}/${id}`, row).pipe(map((r) => r.data));
  }
}
