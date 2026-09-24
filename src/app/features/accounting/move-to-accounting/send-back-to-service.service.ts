import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { SendBackToServiceState, SentBackToServiceJobListItem } from './send-back-to-service.model';

interface ApiWrapper<T> {
  status: boolean;
  responseCode: number;
  message: string;
  data: T;
}

/** Thin HTTP client for the "↩ Send Back to Service" vendor-card button -- backed by
 *  AdminAccountingInvoiceCustomerController's send-back-to-service endpoints -- and the Account
 *  Manager's "Sent Back to Service" job-list page -- backed by SentBackToServiceController. */
@Injectable({ providedIn: 'root' })
export class SendBackToServiceService {
  private readonly http = inject(HttpClient);
  private readonly accountingApiBase = `${environment.apiBaseUrl}/api/v1/admin/accounting/invoice-customer`;
  private readonly amApiBase = `${environment.apiBaseUrl}/api/v1/admin/sent-back-to-service`;

  getState(jobKey: string): Observable<ApiWrapper<SendBackToServiceState>> {
    return this.http.get<ApiWrapper<SendBackToServiceState>>(
      `${this.accountingApiBase}/jobs/${jobKey}/send-back-to-service`,
    );
  }

  sendBackToService(jobKey: string, reason: string, invoiceKey?: string | null): Observable<ApiWrapper<string>> {
    return this.http.post<ApiWrapper<string>>(`${this.accountingApiBase}/jobs/${jobKey}/send-back-to-service`, {
      reason,
      invoiceKey: invoiceKey ?? null,
    });
  }

  acknowledge(jobKey: string, helperKey: string): Observable<ApiWrapper<boolean>> {
    return this.http.post<ApiWrapper<boolean>>(
      `${this.accountingApiBase}/jobs/${jobKey}/send-back-to-service/${helperKey}/acknowledge`,
      {},
    );
  }

  /** Every job currently sent back to the logged-in Account Manager. */
  getJobsForAccountManager(): Observable<ApiWrapper<SentBackToServiceJobListItem[]>> {
    return this.http.get<ApiWrapper<SentBackToServiceJobListItem[]>>(`${this.amApiBase}/jobs`);
  }

  /** "↩ Send Back to Accounting" -- the Account Manager resolves a job from the new V2 page. */
  resolve(jobKey: string, note: string): Observable<ApiWrapper<boolean>> {
    return this.http.post<ApiWrapper<boolean>>(`${this.amApiBase}/jobs/${jobKey}/resolve`, { note });
  }
}
