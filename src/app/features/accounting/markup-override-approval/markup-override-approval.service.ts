import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { MarkupOverridePendingItem, MarkupOverrideApprovalDetail } from './markup-override-approval.model';

interface ApiWrapper<T> {
  status: boolean;
  responseCode: number;
  message: string;
  data: T;
}

/** Thin HTTP client for the "Below Minimum Mark-up Approvals" page -- backed by
 *  MarkupOverrideApprovalController (list + per-job detail). Approve/Reject themselves still go
 *  through MarkupOverrideService (AdminAccountingInvoiceCustomerController) -- unchanged endpoints,
 *  just called from this page now instead of the Invoice Customer card. */
@Injectable({ providedIn: 'root' })
export class MarkupOverrideApprovalService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/v1/admin/markup-override-approval`;

  getPendingJobs(): Observable<ApiWrapper<MarkupOverridePendingItem[]>> {
    return this.http.get<ApiWrapper<MarkupOverridePendingItem[]>>(`${this.apiBase}/jobs`);
  }

  getDetail(jobKey: string): Observable<ApiWrapper<MarkupOverrideApprovalDetail>> {
    return this.http.get<ApiWrapper<MarkupOverrideApprovalDetail>>(`${this.apiBase}/jobs/${jobKey}`);
  }
}
