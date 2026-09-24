import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { InvoiceCustomerCard, InvoiceAttachmentOption } from './invoice-customer-card.model';

interface ApiWrapper<T> {
  status: boolean;
  responseCode: number;
  message: string;
  data: T;
}

/** Matches RFIJobOps.CustomModel.PortalUploadVerificationKind (int enum: Deposit=0, Final=1). */
export enum PortalUploadVerificationKind {
  Deposit = 0,
  Final = 1,
}

/** One "+ Add charge line" row before it's saved -- mirrors
 *  RFIJobOps.CustomModel.CustomerInvoiceLineItem's write shape. */
export interface ScratchInvoiceLine {
  chargeTypeKey: string;
  chargeType: string;
  description: string;
  qty: number;
  rate: number;
}

/** Mirrors RFIJobOps.CustomModel.ChargeTypeOptionDto. */
export interface ChargeTypeOption {
  chargeTypeKey: string;
  name: string;
}

/** Mirrors RFIJobOps.CustomModel.UpdateCustomerInvoiceLineItemRequest -- "✎ Edit Invoice" mode
 *  (2026-09-16). Field names match CustomerRate/CustomerQty/CustomerAmount exactly, not
 *  Rate/Qty/Amount, per the shared backend DTO's own doc comment. */
export interface UpdateInvoiceLineItemRequest {
  lineItemKey?: string;
  isNewLineItem?: boolean;
  isDeleted?: boolean;
  chargeTypeKey?: string;
  chargeType?: string;
  description?: string;
  customerRate: number;
  customerQty: number;
  customerAmount: number;
  costIncurred?: number;
  display?: number;
  tempIndex?: number;
}

/** Mirrors RFIJobOps.CustomModel.DynMinMarkupAdjustmentProposalDto -- only the fields this card
 *  actually reads (the full shape lives in the vendor-bills modal's richer model). */
export interface InvoiceMarkupAdjustmentProposal {
  noLaborLineAvailable?: boolean;
  [key: string]: unknown;
}

export interface UpdateInvoiceResponse {
  customerInvoiceKey: string;
  invoiceTotal: number;
  vendorTotal: number;
  createdLineItems: Record<number, string>;
  message: string;
  adjustmentProposal?: InvoiceMarkupAdjustmentProposal | null;
}

/** Thin HTTP client for the "2 · Invoice Customer" card -- backed by
 *  AdminAccountingInvoiceCustomerController's invoice-customer endpoint. */
@Injectable({ providedIn: 'root' })
export class InvoiceCustomerCardService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/v1/admin/accounting/invoice-customer`;
  private readonly customerInvoiceApiBase = `${environment.apiBaseUrl}/api/v1/admin/customer-invoice`;

  get(jobKey: string): Observable<ApiWrapper<InvoiceCustomerCard>> {
    return this.http.get<ApiWrapper<InvoiceCustomerCard>>(`${this.apiBase}/jobs/${jobKey}/invoice-customer`);
  }

  setPortalUploadVerification(
    jobKey: string,
    which: PortalUploadVerificationKind,
    checked: boolean,
  ): Observable<ApiWrapper<InvoiceCustomerCard>> {
    return this.http.post<ApiWrapper<InvoiceCustomerCard>>(
      `${this.apiBase}/jobs/${jobKey}/invoice-customer/portal-upload`,
      { which, checked },
    );
  }

  reflectVendorInvoiceChange(
    jobKey: string,
    vendorKey: string,
    vendorInvoiceKey: string,
  ): Observable<ApiWrapper<InvoiceCustomerCard>> {
    return this.http.post<ApiWrapper<InvoiceCustomerCard>>(
      `${this.apiBase}/jobs/${jobKey}/invoice-customer/reflect-vendor-invoice-change`,
      { vendorKey, vendorInvoiceKey },
    );
  }

  /** "↩ Remove this charge" -- Option A of the "💲 Apply customer discount / adjustment" modal. */
  applyReverseCharge(jobKey: string, detailKeyToReverse: string): Observable<ApiWrapper<InvoiceCustomerCard>> {
    return this.http.post<ApiWrapper<InvoiceCustomerCard>>(
      `${this.apiBase}/jobs/${jobKey}/invoice-customer/apply-reverse-charge`,
      { detailKeyToReverse },
    );
  }

  /** "Apply −$ discount" -- Option B (custom amount) of the discount/adjustment modal. */
  applyCustomDiscount(jobKey: string, description: string, amount: number): Observable<ApiWrapper<InvoiceCustomerCard>> {
    return this.http.post<ApiWrapper<InvoiceCustomerCard>>(
      `${this.apiBase}/jobs/${jobKey}/invoice-customer/apply-custom-discount`,
      { description, amount },
    );
  }

  /** "✓ Approve Customer Invoice" / "📧 Send Invoice to Customer" popups' shared attachment
   *  checklist -- every job file + vendor upload, no type filter (matches legacy exactly). */
  getAttachmentOptions(jobKey: string): Observable<ApiWrapper<InvoiceAttachmentOption[]>> {
    return this.http.get<ApiWrapper<InvoiceAttachmentOption[]>>(`${this.apiBase}/jobs/${jobKey}/invoice-customer/attachment-options`);
  }

  approveInvoice(jobKey: string, selectedAttachmentKeys: string[], note: string): Observable<ApiWrapper<InvoiceCustomerCard>> {
    return this.http.post<ApiWrapper<InvoiceCustomerCard>>(`${this.apiBase}/jobs/${jobKey}/invoice-customer/approve`, {
      selectedAttachmentKeys,
      note,
    });
  }

  undoApproveInvoice(jobKey: string): Observable<ApiWrapper<InvoiceCustomerCard>> {
    return this.http.post<ApiWrapper<InvoiceCustomerCard>>(`${this.apiBase}/jobs/${jobKey}/invoice-customer/undo-approve`, {});
  }

  /** "Create new from…" dropdown -- source is RFIJobOps.CustomModel.CustomerInvoiceSource
   *  (0=Scratch, 1=VendorInvoice, 2=VendorEstimate, 3=CustomerEstimate). */
  createNewInvoiceFromSource(jobKey: string, source: number): Observable<ApiWrapper<InvoiceCustomerCard>> {
    return this.http.post<ApiWrapper<InvoiceCustomerCard>>(`${this.apiBase}/jobs/${jobKey}/invoice-customer/create-new-from`, { source });
  }

  /** "📧 Send Invoice to Customer Now" / resend -- same endpoint both times (no separate resend
   *  action, matching legacy). Attachments actually get attached to the real outgoing email. */
  sendInvoiceEmail(
    customerInvoiceKey: string,
    contactKeys: string[] | null,
    customerEmail: string | null,
    selectedJobFileKeys: string[],
    selectedVendorUploadKeys: string[],
  ): Observable<ApiWrapper<{ success: boolean; message: string; sentCount: number; failedCount: number }>> {
    return this.http.post<ApiWrapper<{ success: boolean; message: string; sentCount: number; failedCount: number }>>(
      `${this.customerInvoiceApiBase}/send-email`,
      { customerInvoiceKey, contactKeys, customerEmail, selectedJobFileKeys, selectedVendorUploadKeys },
    );
  }

  /** "Fail-safe: Teresa manually entered invoice in QBO" -- action=1 (PushToQuickBooks). */
  recordManualQboEntry(invoiceKey: string, qbRefNo: string): Observable<ApiWrapper<{ message: string }>> {
    return this.http.post<ApiWrapper<{ message: string }>>(`${this.customerInvoiceApiBase}/receivables`, {
      invoiceKey,
      action: 1,
      isDeposit: false,
      qbRefNo,
    });
  }

  /** "+ Add charge line" Charge Type dropdown options -- AdminCustomerInvoiceController's
   *  charge-type-options endpoint (active SalesChargeType rows only). */
  getChargeTypeOptions(): Observable<ApiWrapper<ChargeTypeOption[]>> {
    return this.http.get<ApiWrapper<ChargeTypeOption[]>>(`${this.customerInvoiceApiBase}/charge-type-options`);
  }

  /** Manual "create from scratch" fallback -- shown only once automatic invoice creation has run
   *  and found none of the 3 auto-create tiers eligible. Source=0 is
   *  RFIJobOps.CustomModel.CustomerInvoiceSource.Scratch. */
  createScratchInvoice(jobKey: string, lines: ScratchInvoiceLine[]): Observable<ApiWrapper<{ customerInvoiceKey: string }>> {
    return this.http.post<ApiWrapper<{ customerInvoiceKey: string }>>(`${this.customerInvoiceApiBase}/create`, {
      source: 0,
      jobKey,
      lineItems: lines.map((l) => ({
        chargeTypeKey: l.chargeTypeKey,
        chargeType: l.chargeType,
        description: l.description,
        qty: l.qty,
        rate: l.rate,
      })),
    });
  }

  /** "Done editing" -- PUT api/v1/admin/customer-invoice/update, the same endpoint the vendor-bills
   *  "create customer invoice from vendor" modal already uses for its own edit mode. Pass
   *  markupAdjustmentDecision=3 (ProceedAnyway) on a retry after an AdjustmentProposal comes back,
   *  matching Nahid's "just create/save unconditionally, the send-time gate catches it later" call. */
  updateInvoice(
    customerInvoiceKey: string,
    lines: UpdateInvoiceLineItemRequest[],
    markupAdjustmentDecision?: number,
  ): Observable<ApiWrapper<UpdateInvoiceResponse>> {
    return this.http.put<ApiWrapper<UpdateInvoiceResponse>>(`${this.customerInvoiceApiBase}/update`, {
      customerInvoiceKey,
      lineItems: lines,
      markupAdjustmentDecision,
    });
  }
}
