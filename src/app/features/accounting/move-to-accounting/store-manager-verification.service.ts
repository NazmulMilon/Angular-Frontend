import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  StoreManagerVerificationState,
  StoreManagerEmailPreview,
  SubmitStoreManagerSurveyRequest,
} from './store-manager-verification.model';

interface ApiWrapper<T> {
  status: boolean;
  responseCode: number;
  message: string;
  data: T;
}

/** Thin HTTP client for the "✉ Store Manager Verification — Email" JOB-LEVEL bar -- backed by
 *  AdminAccountingInvoiceCustomerController's store-manager-verification endpoint. */
@Injectable({ providedIn: 'root' })
export class StoreManagerVerificationService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/v1/admin/accounting/invoice-customer`;

  getState(jobKey: string): Observable<ApiWrapper<StoreManagerVerificationState>> {
    return this.http.get<ApiWrapper<StoreManagerVerificationState>>(
      `${this.apiBase}/jobs/${jobKey}/store-manager-verification`,
    );
  }

  submit(jobKey: string, request: SubmitStoreManagerSurveyRequest): Observable<ApiWrapper<boolean>> {
    return this.http.post<ApiWrapper<boolean>>(
      `${this.apiBase}/jobs/${jobKey}/store-manager-verification/submit`,
      request,
    );
  }

  getEmailPreview(jobKey: string): Observable<ApiWrapper<StoreManagerEmailPreview>> {
    return this.http.get<ApiWrapper<StoreManagerEmailPreview>>(
      `${this.apiBase}/jobs/${jobKey}/store-manager-verification/email-preview`,
    );
  }

  sendEmail(jobKey: string, toEmail: string): Observable<ApiWrapper<boolean>> {
    return this.http.post<ApiWrapper<boolean>>(
      `${this.apiBase}/jobs/${jobKey}/store-manager-verification/send-email`,
      { toEmail },
    );
  }
}
