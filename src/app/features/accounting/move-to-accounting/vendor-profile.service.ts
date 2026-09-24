import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { VendorProfile } from './vendor-profile.model';

interface ApiWrapper<T> {
  status: boolean;
  responseCode: number;
  message: string;
  data: T;
}

/** Thin HTTP client for the "👤 Vendor Profile" read-only popup -- backed by
 *  AdminAccountingInvoiceCustomerController's vendors/{vendorKey}/profile endpoint. */
@Injectable({ providedIn: 'root' })
export class VendorProfileService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/v1/admin/accounting/invoice-customer`;

  get(jobKey: string, vendorKey: string): Observable<VendorProfile> {
    return this.http
      .get<ApiWrapper<VendorProfile>>(`${this.apiBase}/jobs/${jobKey}/vendors/${vendorKey}/profile`)
      .pipe(map((res) => res.data));
  }
}
