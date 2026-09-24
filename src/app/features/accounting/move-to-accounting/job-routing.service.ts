import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { JobRoutingStatus } from './job-routing.model';

interface ApiWrapper<T> {
  status: boolean;
  responseCode: number;
  message: string;
  data: T;
}

/** Thin HTTP client for the JobRoutingLog job list flags ("with Alysha — sent 2h ago" /
 *  "Back from Service") -- backed by AdminAccountingInvoiceCustomerController's
 *  jobs/routing-status endpoints. */
@Injectable({ providedIn: 'root' })
export class JobRoutingService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/v1/admin/accounting/invoice-customer`;

  getBatchStatus(jobKeys: string[]): Observable<ApiWrapper<Record<string, JobRoutingStatus>>> {
    let params = new HttpParams();
    for (const key of jobKeys) params = params.append('jobKeys', key);
    return this.http.get<ApiWrapper<Record<string, JobRoutingStatus>>>(`${this.apiBase}/jobs/routing-status`, { params });
  }

  getReturnedCount(): Observable<ApiWrapper<number>> {
    return this.http.get<ApiWrapper<number>>(`${this.apiBase}/jobs/routing-status/returned-count`);
  }

  acknowledge(jobKey: string): Observable<ApiWrapper<boolean>> {
    return this.http.post<ApiWrapper<boolean>>(`${this.apiBase}/jobs/${jobKey}/routing-status/acknowledge`, {});
  }
}
