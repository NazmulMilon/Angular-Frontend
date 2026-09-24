import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  SaveDepositRequest,
  SaveDepositResult,
  DepositEstimateContext,
  JobDepositSummary,
} from '../models/deposit.model';

/** Standard result envelope returned by RFIJobOps' ApiResponse<T> (camelCase serialized). */
export interface DepositApiResponse<T> {
  status: boolean;
  responseCode: number;
  message: string;
  data: T;
}

/**
 * Deposit flow API client — targets `api/v1/deposits`. Backs
 * {@link EstimateVendorDepositModalComponent}'s save call and its vendor-grouping lookup.
 */
@Injectable({ providedIn: 'root' })
export class DepositService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/v1/deposits`;

  /**
   * GET context-for-customer-estimate/{customerEstimateKey} — resolves the vendor(s) feeding a
   * customer estimate (one for single-vendor, N for a multi-vendor merge) with each vendor's
   * JobVendorKey, name, estimate total, and deposit on record, plus the customer-side deposit
   * already set and whether it is still unpaid.
   */
  getDepositContextForCustomerEstimate(
    customerEstimateKey: string,
  ): Observable<DepositApiResponse<DepositEstimateContext>> {
    return this.http.get<DepositApiResponse<DepositEstimateContext>>(
      `${this.apiBase}/context-for-customer-estimate/${customerEstimateKey}`,
    );
  }

  /** POST save — persists vendor deposits + the customer deposit for a job in one transaction. */
  saveDeposit(request: SaveDepositRequest): Observable<DepositApiResponse<SaveDepositResult>> {
    return this.http.post<DepositApiResponse<SaveDepositResult>>(`${this.apiBase}/save`, request);
  }

  /**
   * GET job/{jobKey}/deposit-summary — one entry per customer estimate with any deposit, plus
   * whether the calling admin has any unseen approve/decline decision on this job. Backs the
   * "Deposits on Job" button and the Estimates-tab notification dot.
   */
  getJobDepositSummary(jobKey: string): Observable<DepositApiResponse<JobDepositSummary>> {
    return this.http.get<DepositApiResponse<JobDepositSummary>>(
      `${this.apiBase}/job/${jobKey}/deposit-summary`,
    );
  }

  /** POST job/{jobKey}/mark-read — marks every decided deposit approval on the job as seen by the calling admin. */
  markDepositApprovalsRead(jobKey: string): Observable<DepositApiResponse<boolean>> {
    return this.http.post<DepositApiResponse<boolean>>(`${this.apiBase}/job/${jobKey}/mark-read`, {});
  }

  /**
   * POST customer-estimate/{customerEstimateKey}/resend-approval — re-sends the SVC-manager
   * approval request email for a still-pending deposit. 422 if nothing is pending, 429 if resent
   * too recently (server-enforced cooldown).
   */
  resendDepositApproval(customerEstimateKey: string): Observable<DepositApiResponse<boolean>> {
    return this.http.post<DepositApiResponse<boolean>>(
      `${this.apiBase}/customer-estimate/${customerEstimateKey}/resend-approval`,
      {},
    );
  }
}
