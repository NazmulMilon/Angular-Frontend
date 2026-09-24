import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { AccountingFinalizeState, FinalizeJobResult } from './accounting-finalize.model';

interface ApiWrapper<T> {
  status: boolean;
  responseCode: number;
  message: string;
  data: T;
}

/** "👁 Bill Verification & QBO Status" recap + "🚀 Finalize Job" -- backed by
 *  AdminAccountingInvoiceCustomerController's finalize-state/finalize endpoints. */
@Injectable({ providedIn: 'root' })
export class AccountingFinalizeService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/v1/admin/accounting/invoice-customer`;

  getState(jobKey: string): Observable<ApiWrapper<AccountingFinalizeState>> {
    return this.http.get<ApiWrapper<AccountingFinalizeState>>(`${this.apiBase}/jobs/${jobKey}/finalize-state`);
  }

  finalize(jobKey: string): Observable<ApiWrapper<FinalizeJobResult>> {
    return this.http.post<ApiWrapper<FinalizeJobResult>>(`${this.apiBase}/jobs/${jobKey}/finalize`, {});
  }
}
