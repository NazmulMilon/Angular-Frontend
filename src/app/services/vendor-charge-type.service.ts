import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/** A vendor charge type. `itemKey` is null when creating. */
export interface VendorChargeType {
  itemKey: number | null;
  itemName: string;
  displayLevel: number | null;
}

interface Envelope<T> {
  status: boolean;
  data: T;
}

/** Vendor Charge Types API client — targets `api/VendorChargeTypes`. Auth is auto-attached. */
@Injectable({ providedIn: 'root' })
export class VendorChargeTypeService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/VendorChargeTypes`;

  getAll(): Observable<VendorChargeType[]> {
    return this.http.get<Envelope<VendorChargeType[]>>(this.apiBase).pipe(map((r) => r.data));
  }

  create(item: Omit<VendorChargeType, 'itemKey'>): Observable<VendorChargeType> {
    return this.http.post<Envelope<VendorChargeType>>(this.apiBase, item).pipe(map((r) => r.data));
  }

  update(itemKey: number, item: Omit<VendorChargeType, 'itemKey'>): Observable<VendorChargeType> {
    return this.http.put<Envelope<VendorChargeType>>(`${this.apiBase}/${itemKey}`, item).pipe(map((r) => r.data));
  }

  delete(itemKey: number): Observable<void> {
    return this.http.delete<void>(`${this.apiBase}/${itemKey}`);
  }
}
