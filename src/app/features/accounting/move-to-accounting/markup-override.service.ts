import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { MarkupOverrideState } from './markup-override.model';

interface ApiWrapper<T> {
  status: boolean;
  responseCode: number;
  message: string;
  data: T;
}

/** Thin HTTP client for the "Below Minimum Mark-up Target" QC Manager override -- backed by
 *  AdminAccountingInvoiceCustomerController's markup-override endpoints. */
@Injectable({ providedIn: 'root' })
export class MarkupOverrideService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/v1/admin/accounting/invoice-customer`;

  getState(jobKey: string): Observable<ApiWrapper<MarkupOverrideState>> {
    return this.http.get<ApiWrapper<MarkupOverrideState>>(`${this.apiBase}/jobs/${jobKey}/invoice-customer/markup-override`);
  }

  requestOverride(jobKey: string): Observable<ApiWrapper<MarkupOverrideState>> {
    return this.http.post<ApiWrapper<MarkupOverrideState>>(
      `${this.apiBase}/jobs/${jobKey}/invoice-customer/markup-override/request`,
      {},
    );
  }

  approve(jobKey: string, overrideKey: string, note?: string): Observable<ApiWrapper<MarkupOverrideState>> {
    return this.http.post<ApiWrapper<MarkupOverrideState>>(
      `${this.apiBase}/jobs/${jobKey}/invoice-customer/markup-override/${overrideKey}/approve`,
      { reason: note ?? '' },
    );
  }

  reject(jobKey: string, overrideKey: string, reason: string): Observable<ApiWrapper<MarkupOverrideState>> {
    return this.http.post<ApiWrapper<MarkupOverrideState>>(
      `${this.apiBase}/jobs/${jobKey}/invoice-customer/markup-override/${overrideKey}/reject`,
      { reason },
    );
  }
}
