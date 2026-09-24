import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { AssignVendorApiResponse } from '../models/assign-vendor.model';
import { PagedResult } from '../models/accounting-invoice-customer.model';
import { AccountingBillsJobRow } from '../models/accounting-bills.model';

type JobsPageResponse = AssignVendorApiResponse<PagedResult<AccountingBillsJobRow>>;
type CountResponse = AssignVendorApiResponse<number>;

/**
 * Accounting V2 — Tab 2 "Unapproved Vendor Bills" job list.
 * Talks to `AdminAccountingBillsAndReceivablesController` (RFIJobOps).
 */
@Injectable({ providedIn: 'root' })
export class AccountingBillsService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/v1/admin/accounting/unapproved-vendor-bills`;

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
