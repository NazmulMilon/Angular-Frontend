import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  CompletionPhotoState,
  HoursReconState,
  SignOffState,
  VendorBillNote,
  VendorInsuranceOverrideState,
  VendorInsuranceValidationState,
  VendorPayableCard,
} from './vendor-payable.model';

interface ApiWrapper<T> {
  status: boolean;
  responseCode: number;
  message: string;
  data: T;
}

/** Thin HTTP client for "Approve Vendor(s) Payables" -- backed by
 *  AdminAccountingInvoiceCustomerController's vendor-payables endpoints. */
@Injectable({ providedIn: 'root' })
export class VendorPayableService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/v1/admin/accounting/invoice-customer`;

  getCards(jobKey: string): Observable<VendorPayableCard[]> {
    return this.http
      .get<ApiWrapper<VendorPayableCard[]>>(`${this.apiBase}/jobs/${jobKey}/vendor-payables`)
      // pinnedNotes defaults to [] defensively -- guards against an older API build (pre-restart)
      // that doesn't send the field yet, so the template never has to null-check it either.
      .pipe(map((res) => (res.data ?? []).map((c) => ({ ...c, pinnedNotes: c.pinnedNotes ?? [] }))));
  }

  markReviewed(jobKey: string, vendorKey: string, step: 'hours' | 'cost' | 'scope'): Observable<ApiWrapper<boolean>> {
    return this.http.post<ApiWrapper<boolean>>(
      `${this.apiBase}/jobs/${jobKey}/vendor-payables/${vendorKey}/mark-reviewed`,
      { step },
    );
  }

  approve(
    jobKey: string,
    vendorKey: string,
    decision: 'payable-performed' | 'payable-cost-incurred',
    costIncurredReason?: string,
  ): Observable<ApiWrapper<boolean>> {
    return this.http.post<ApiWrapper<boolean>>(`${this.apiBase}/jobs/${jobKey}/vendor-payables/${vendorKey}/approve`, {
      decision,
      costIncurredReason: costIncurredReason ?? null,
    });
  }

  remove(
    jobKey: string,
    vendorKey: string,
    opts: { reason: string; sendCancellationEmail: boolean },
  ): Observable<ApiWrapper<boolean>> {
    return this.http.post<ApiWrapper<boolean>>(`${this.apiBase}/jobs/${jobKey}/vendor-payables/${vendorKey}/remove`, opts);
  }

  undo(jobKey: string, vendorKey: string): Observable<ApiWrapper<boolean>> {
    return this.http.post<ApiWrapper<boolean>>(`${this.apiBase}/jobs/${jobKey}/vendor-payables/${vendorKey}/undo`, {});
  }

  applyInsuranceOverride(jobKey: string, vendorKey: string): Observable<ApiWrapper<VendorInsuranceOverrideState>> {
    return this.http.post<ApiWrapper<VendorInsuranceOverrideState>>(
      `${this.apiBase}/jobs/${jobKey}/vendor-payables/${vendorKey}/insurance-override`,
      {},
    );
  }

  undoInsuranceOverride(jobKey: string, vendorKey: string): Observable<ApiWrapper<boolean>> {
    return this.http.post<ApiWrapper<boolean>>(
      `${this.apiBase}/jobs/${jobKey}/vendor-payables/${vendorKey}/insurance-override/undo`,
      {},
    );
  }

  saveQboEntry(jobKey: string, vendorKey: string, transactionNumber: string): Observable<ApiWrapper<boolean>> {
    return this.http.post<ApiWrapper<boolean>>(`${this.apiBase}/jobs/${jobKey}/vendor-payables/${vendorKey}/qbo-entry`, {
      transactionNumber,
    });
  }

  requestInvoice(jobKey: string, vendorKey: string): Observable<ApiWrapper<boolean>> {
    return this.http.post<ApiWrapper<boolean>>(
      `${this.apiBase}/jobs/${jobKey}/vendor-payables/${vendorKey}/request-invoice`,
      {},
    );
  }

  getVendorBillNotes(jobKey: string, vendorKey: string): Observable<VendorBillNote[]> {
    return this.http
      .get<ApiWrapper<VendorBillNote[]>>(`${this.apiBase}/jobs/${jobKey}/vendor-payables/${vendorKey}/notes`)
      .pipe(map((res) => res.data ?? []));
  }

  addVendorBillNote(jobKey: string, vendorKey: string, noteText: string): Observable<ApiWrapper<boolean>> {
    return this.http.post<ApiWrapper<boolean>>(`${this.apiBase}/jobs/${jobKey}/vendor-payables/${vendorKey}/notes`, {
      noteText,
    });
  }

  getCompletionPhotos(jobKey: string, vendorKey: string): Observable<ApiWrapper<CompletionPhotoState>> {
    return this.http.get<ApiWrapper<CompletionPhotoState>>(
      `${this.apiBase}/jobs/${jobKey}/vendor-payables/${vendorKey}/completion-photos`,
    );
  }

  approveCompletionPhotos(jobKey: string, vendorKey: string): Observable<ApiWrapper<CompletionPhotoState>> {
    return this.http.post<ApiWrapper<CompletionPhotoState>>(
      `${this.apiBase}/jobs/${jobKey}/vendor-payables/${vendorKey}/completion-photos/approve`,
      {},
    );
  }

  rejectCompletionPhotos(jobKey: string, vendorKey: string, note?: string): Observable<ApiWrapper<CompletionPhotoState>> {
    return this.http.post<ApiWrapper<CompletionPhotoState>>(
      `${this.apiBase}/jobs/${jobKey}/vendor-payables/${vendorKey}/completion-photos/reject`,
      { note: note || null },
    );
  }

  getSignOffState(jobKey: string, vendorKey: string): Observable<ApiWrapper<SignOffState>> {
    return this.http.get<ApiWrapper<SignOffState>>(`${this.apiBase}/jobs/${jobKey}/vendor-payables/${vendorKey}/signoff`);
  }

  approveSignOff(jobKey: string, vendorKey: string): Observable<ApiWrapper<SignOffState>> {
    return this.http.post<ApiWrapper<SignOffState>>(`${this.apiBase}/jobs/${jobKey}/vendor-payables/${vendorKey}/signoff/approve`, {});
  }

  rejectSignOff(jobKey: string, vendorKey: string, note?: string): Observable<ApiWrapper<SignOffState>> {
    return this.http.post<ApiWrapper<SignOffState>>(
      `${this.apiBase}/jobs/${jobKey}/vendor-payables/${vendorKey}/signoff/reject`,
      { note: note || null },
    );
  }

  getHoursRecon(jobKey: string, vendorKey: string): Observable<ApiWrapper<HoursReconState>> {
    return this.http.get<ApiWrapper<HoursReconState>>(`${this.apiBase}/jobs/${jobKey}/vendor-payables/${vendorKey}/hours-recon`);
  }

  editCheckInHours(
    jobKey: string,
    vendorKey: string,
    opts: { checkinKey: string; newHours?: number | null; newTechCount?: number | null; reason: string },
  ): Observable<ApiWrapper<HoursReconState>> {
    return this.http.post<ApiWrapper<HoursReconState>>(
      `${this.apiBase}/jobs/${jobKey}/vendor-payables/${vendorKey}/hours-recon/edit-checkin`,
      {
        checkinKey: opts.checkinKey,
        newHours: opts.newHours ?? null,
        newTechCount: opts.newTechCount ?? null,
        reason: opts.reason,
      },
    );
  }

  toggleCheckInWaiver(jobKey: string, vendorKey: string, waiveOn: boolean, reason?: string): Observable<ApiWrapper<HoursReconState>> {
    return this.http.post<ApiWrapper<HoursReconState>>(
      `${this.apiBase}/jobs/${jobKey}/vendor-payables/${vendorKey}/hours-recon/waiver`,
      { waiveOn, reason: reason || null },
    );
  }

  applyHoursMatchReduction(jobKey: string, vendorKey: string): Observable<ApiWrapper<HoursReconState>> {
    return this.http.post<ApiWrapper<HoursReconState>>(
      `${this.apiBase}/jobs/${jobKey}/vendor-payables/${vendorKey}/hours-recon/apply-reduction`,
      {},
    );
  }

  undoHoursMatchReduction(jobKey: string, vendorKey: string): Observable<ApiWrapper<HoursReconState>> {
    return this.http.post<ApiWrapper<HoursReconState>>(
      `${this.apiBase}/jobs/${jobKey}/vendor-payables/${vendorKey}/hours-recon/undo-reduction`,
      {},
    );
  }

  getInsuranceValidation(jobKey: string, vendorKey: string): Observable<ApiWrapper<VendorInsuranceValidationState>> {
    return this.http.get<ApiWrapper<VendorInsuranceValidationState>>(
      `${this.apiBase}/jobs/${jobKey}/vendor-payables/${vendorKey}/insurance-validation`,
    );
  }

  saveInsurance(
    jobKey: string,
    vendorKey: string,
    opts: {
      saveGl: boolean;
      glCarry: boolean;
      glExpiry: string | null;
      glFile: File | null;
      saveWc: boolean;
      wcCarry: boolean;
      wcExpiry: string | null;
      wcFile: File | null;
    },
  ): Observable<ApiWrapper<VendorInsuranceValidationState>> {
    const form = new FormData();
    form.append('saveGl', String(opts.saveGl));
    form.append('glCarry', String(opts.glCarry));
    if (opts.glExpiry) form.append('glExpiry', opts.glExpiry);
    if (opts.glFile) form.append('glFile', opts.glFile);
    form.append('saveWc', String(opts.saveWc));
    form.append('wcCarry', String(opts.wcCarry));
    if (opts.wcExpiry) form.append('wcExpiry', opts.wcExpiry);
    if (opts.wcFile) form.append('wcFile', opts.wcFile);

    return this.http.post<ApiWrapper<VendorInsuranceValidationState>>(
      `${this.apiBase}/jobs/${jobKey}/vendor-payables/${vendorKey}/insurance-validation/save`,
      form,
    );
  }

  resendInsuranceEmail(jobKey: string, vendorKey: string): Observable<ApiWrapper<boolean>> {
    return this.http.post<ApiWrapper<boolean>>(
      `${this.apiBase}/jobs/${jobKey}/vendor-payables/${vendorKey}/insurance-validation/resend-email`,
      {},
    );
  }

  approveGlInsurance(jobKey: string, vendorKey: string): Observable<ApiWrapper<VendorInsuranceValidationState>> {
    return this.http.post<ApiWrapper<VendorInsuranceValidationState>>(
      `${this.apiBase}/jobs/${jobKey}/vendor-payables/${vendorKey}/insurance-validation/gl/approve`,
      {},
    );
  }

  approveWcInsurance(jobKey: string, vendorKey: string): Observable<ApiWrapper<VendorInsuranceValidationState>> {
    return this.http.post<ApiWrapper<VendorInsuranceValidationState>>(
      `${this.apiBase}/jobs/${jobKey}/vendor-payables/${vendorKey}/insurance-validation/wc/approve`,
      {},
    );
  }

  rejectGlInsurance(jobKey: string, vendorKey: string, notes: string): Observable<ApiWrapper<VendorInsuranceValidationState>> {
    return this.http.post<ApiWrapper<VendorInsuranceValidationState>>(
      `${this.apiBase}/jobs/${jobKey}/vendor-payables/${vendorKey}/insurance-validation/gl/reject`,
      { notes },
    );
  }

  rejectWcInsurance(jobKey: string, vendorKey: string, notes: string): Observable<ApiWrapper<VendorInsuranceValidationState>> {
    return this.http.post<ApiWrapper<VendorInsuranceValidationState>>(
      `${this.apiBase}/jobs/${jobKey}/vendor-payables/${vendorKey}/insurance-validation/wc/reject`,
      { notes },
    );
  }
}
