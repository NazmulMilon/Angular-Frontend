import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { RuleThresholdForCustomerInvoice } from './rule-threshold.model';

interface ApiWrapper<T> {
  status: boolean;
  responseCode: number;
  message: string;
  data: T;
}

/** Thin HTTP client for the "⚙ Settings & thresholds" popup -- backed by RFIJobOps'
 *  SystemSetupDataController, the same GET RFIJobOps already serves to Admin Portal V1's
 *  Setup > Rule Threshold For Customer Invoice screen. Confirmed via curl 2026-09-07: like the
 *  other SystemSetupData endpoints, this one wraps the DTO in the {status,responseCode,message,
 *  data} envelope -- it is NOT returned bare. */
@Injectable({ providedIn: 'root' })
export class RuleThresholdService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/RFISystemData/SystemSetupData`;

  get(): Observable<RuleThresholdForCustomerInvoice> {
    return this.http
      .get<ApiWrapper<RuleThresholdForCustomerInvoice>>(`${this.apiBase}/rule-threshold-for-customer-invoice`)
      .pipe(map((res) => res.data));
  }
}
