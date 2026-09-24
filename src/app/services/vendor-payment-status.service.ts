import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/** A vendor payment status. `id` is null when creating. `isActive` is the inverse of the stored IsDelete. */
export interface VendorPaymentStatus {
  id: string | null;
  name: string;
  level: number | null;
  isActive: boolean;
}

interface Envelope<T> {
  status: boolean;
  data: T;
}

/** Vendor Payment Status API client — targets `api/VendorPaymentStatus`. No hard delete (deactivate via isActive). */
@Injectable({ providedIn: 'root' })
export class VendorPaymentStatusService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/VendorPaymentStatus`;

  getAll(): Observable<VendorPaymentStatus[]> {
    return this.http.get<Envelope<VendorPaymentStatus[]>>(this.apiBase).pipe(map((r) => r.data));
  }

  create(status: Omit<VendorPaymentStatus, 'id'>): Observable<VendorPaymentStatus> {
    return this.http.post<Envelope<VendorPaymentStatus>>(this.apiBase, status).pipe(map((r) => r.data));
  }

  update(id: string, status: Omit<VendorPaymentStatus, 'id'>): Observable<VendorPaymentStatus> {
    return this.http.put<Envelope<VendorPaymentStatus>>(`${this.apiBase}/${id}`, status).pipe(map((r) => r.data));
  }
}
