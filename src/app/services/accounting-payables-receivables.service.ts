import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { AssignVendorApiResponse } from '../models/assign-vendor.model';
import { PagedResult } from '../models/accounting-invoice-customer.model';
import { AccountingPayablesReceivablesJobRow } from '../models/accounting-payables-receivables.model';

type JobsPageResponse = AssignVendorApiResponse<PagedResult<AccountingPayablesReceivablesJobRow>>;
type CountResponse = AssignVendorApiResponse<number>;

/**
 * Accounting V2 — Tab 3 "Payables & Receivables" job list.
 * Talks to `AdminAccountingBillsAndReceivablesController` (RFIJobOps).
 */
@Injectable({ providedIn: 'root' })
export class AccountingPayablesReceivablesService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/v1/admin/accounting/payables-receivables`;

  getJobsPage(
    start: number,
    length: number,
    searchValue: string | null,
    sortCol = 1,
    sortDir: 'asc' | 'desc' = 'desc',
  ): Observable<JobsPageResponse> {
    let params = new HttpParams()
      .set('start', start)
      .set('length', length)
      .set('sortCol', sortCol)
      .set('sortDir', sortDir);
    if (searchValue) {
      params = params.set('searchValue', searchValue);
    }
    return this.http.get<JobsPageResponse>(`${this.apiBase}/jobs`, { params });
  }

  getCount(): Observable<CountResponse> {
    return this.http.get<CountResponse>(`${this.apiBase}/count`);
  }
}
