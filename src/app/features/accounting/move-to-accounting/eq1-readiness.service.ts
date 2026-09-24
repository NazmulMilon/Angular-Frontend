import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Eq1Readiness } from './eq1-readiness.model';

interface ApiWrapper<T> {
  status: boolean;
  responseCode: number;
  message: string;
  data: T;
}

/** Thin HTTP client for the "EQ1 · Customer invoice → QB + send" readiness card -- backed by
 *  AdminAccountingInvoiceCustomerController's eq1-readiness endpoint. */
@Injectable({ providedIn: 'root' })
export class Eq1ReadinessService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/v1/admin/accounting/invoice-customer`;

  get(jobKey: string): Observable<ApiWrapper<Eq1Readiness>> {
    return this.http.get<ApiWrapper<Eq1Readiness>>(`${this.apiBase}/jobs/${jobKey}/eq1-readiness`);
  }
}
