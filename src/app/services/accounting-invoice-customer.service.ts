import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { AssignVendorApiResponse } from '../models/assign-vendor.model';
import { InvoiceCustomerJobRow, PagedResult } from '../models/accounting-invoice-customer.model';

type JobsPageResponse = AssignVendorApiResponse<PagedResult<InvoiceCustomerJobRow>>;
type CountResponse = AssignVendorApiResponse<number>;

/**
 * Accounting V2 — Tab 1 "Invoice the Customer" job list.
 * Talks to `AdminAccountingInvoiceCustomerController` (RFIJobOps).
 */
@Injectable({ providedIn: 'root' })
export class AccountingInvoiceCustomerService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/v1/admin/accounting/invoice-customer`;

  /**
   * Paginated, searchable job list. First load: start=0, length=10. Each "Show more": start+=10,
   * length=10 — the caller appends the new rows to what it already has. Search re-filters the
   * full server-side cached set regardless of start/length (see controller doc-comment).
   */
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

  /** Job count for the "1 · Invoice the Customer" tab pill. */
  getCount(): Observable<CountResponse> {
    return this.http.get<CountResponse>(`${this.apiBase}/count`);
  }
}
