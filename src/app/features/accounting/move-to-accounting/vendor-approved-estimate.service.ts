import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { VendorApprovedEstimate } from './vendor-approved-estimate.model';

interface ApiWrapper<T> {
  status: boolean;
  responseCode: number;
  message: string;
  data: T;
}

/** Thin HTTP client for the "📄 View Estimate (approved to proceed)" read-only popup -- backed
 *  by AdminAccountingInvoiceCustomerController's vendors/{vendorKey}/approved-estimate endpoint. */
@Injectable({ providedIn: 'root' })
export class VendorApprovedEstimateService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/v1/admin/accounting/invoice-customer`;

  get(jobKey: string, vendorKey: string): Observable<VendorApprovedEstimate> {
    return this.http
      .get<ApiWrapper<VendorApprovedEstimate>>(`${this.apiBase}/jobs/${jobKey}/vendors/${vendorKey}/approved-estimate`)
      .pipe(map((res) => res.data));
  }
}
