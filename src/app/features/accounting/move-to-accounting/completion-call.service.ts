import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

interface ApiWrapper<T> {
  status: boolean;
  responseCode: number;
  message: string;
  data: T;
}

/** Current completion-call state for the job's current completion cycle -- what's already on
 *  file, if anything. Mirrors RFIJobOps.CustomModel.CompletionCallStateDto. */
export interface CompletionCallState {
  verified: boolean;
  latestCallKey: string | null;
  contactName: string | null;
  contactTitle: string | null;
  note: string | null;
  answerText: string | null;
  calledOn: string | null;
  calledByName: string | null;
}

/** Thin HTTP client for "📞 Call & Verify Completion" (stepper Step 1) -- backed by
 *  AdminAccountingInvoiceCustomerController's completion-call endpoint. */
@Injectable({ providedIn: 'root' })
export class CompletionCallService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/v1/admin/accounting/invoice-customer`;

  logCall(jobKey: string, contactName: string, contactTitle: string, note: string): Observable<ApiWrapper<boolean>> {
    return this.http.post<ApiWrapper<boolean>>(`${this.apiBase}/jobs/${jobKey}/completion-call`, {
      contactName,
      contactTitle: contactTitle || null,
      note,
    });
  }

  getState(jobKey: string): Observable<ApiWrapper<CompletionCallState>> {
    return this.http.get<ApiWrapper<CompletionCallState>>(`${this.apiBase}/jobs/${jobKey}/completion-call`);
  }
}
