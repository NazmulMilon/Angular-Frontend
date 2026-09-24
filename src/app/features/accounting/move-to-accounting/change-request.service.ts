import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ChangeRequestInvoiceOption, ChangeRequestState } from './change-request.model';

interface ApiWrapper<T> {
  status: boolean;
  responseCode: number;
  message: string;
  data: T;
}

/** Thin HTTP client for the "🔁 Send Change Request to Account Manager" JOB-LEVEL button --
 *  backed by AdminAccountingInvoiceCustomerController's change-request endpoints. */
@Injectable({ providedIn: 'root' })
export class ChangeRequestService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/v1/admin/accounting/invoice-customer`;

  getEligibleInvoices(jobKey: string): Observable<ApiWrapper<ChangeRequestInvoiceOption[]>> {
    return this.http.get<ApiWrapper<ChangeRequestInvoiceOption[]>>(
      `${this.apiBase}/jobs/${jobKey}/change-request/invoices`,
    );
  }

  getState(jobKey: string): Observable<ApiWrapper<ChangeRequestState>> {
    return this.http.get<ApiWrapper<ChangeRequestState>>(`${this.apiBase}/jobs/${jobKey}/change-request`);
  }

  sendChangeRequest(jobKey: string, reason: string, invoiceKey?: string | null): Observable<ApiWrapper<string>> {
    return this.http.post<ApiWrapper<string>>(`${this.apiBase}/jobs/${jobKey}/change-request`, {
      reason,
      invoiceKey: invoiceKey ?? null,
    });
  }

  acknowledge(jobKey: string, helperKey: string): Observable<ApiWrapper<boolean>> {
    return this.http.post<ApiWrapper<boolean>>(
      `${this.apiBase}/jobs/${jobKey}/change-request/${helperKey}/acknowledge`,
      {},
    );
  }
}
