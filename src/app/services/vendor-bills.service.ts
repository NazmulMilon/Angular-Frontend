import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, catchError, of, timeout } from 'rxjs';

import { environment } from '../../environments/environment';
import {
  VendorBillsApiResponse,
  PagedResult,
  AdminJobCheckInOutRow,
  AdminJobCheckInOutVendorOption,
  AdminEditCheckInOutRequest,
  AdminJobEstimatesPage,
  AdminCreateEstimateModalData,
  AdminVendorPapersPage,
  AdminVendorPaperRow,
  AdminInvoicesPage,
  AdminUploadVendorPapersModal,
  SaveVendorPapersRequest,
  VendorBillAttachmentStage,
  UpdateEstimateManageStatusRequest,
  SetVendorEstimateApprovedRequest,
  SetVendorEstimateApprovedResultDto,
  SaveVendorApprovalDataRequest,
  SaveVendorApprovalDataResponse,
  SendWorkOrderEmailToVendorRequest,
  SendWorkOrderEmailResponse,
  RejectVendorEstimateRequest,
  RejectVendorEstimateResultDto,
  DeclineVendorEstimateRequest,
  DeclineVendorEstimateResultDto,
} from '../models/vendor-bills.model';
import { CreateCustomerEstimateResponse } from '../models/on-site-estimate.model';
import {
  CreateCustomerInvoiceRequest,
  CreateCustomerInvoiceResponse,
  PreviewCustomerInvoiceResponse,
  ActiveCustomerInvoiceCheckResponse,
  DepositGateResponse,
  VendorCostCheckResponse,
  CustomerInvoiceListResponse,
  CustomerInvoiceRecipientsResponse,
  UpdateInvoiceReceivablesRequest,
  UpdateInvoiceReceivablesResponse,
  SendCustomerInvoiceEmailRequest,
  SendCustomerInvoiceEmailResponse,
  VoidCustomerInvoiceRequest,
  VoidCustomerInvoiceResponse,
  ResubmitCustomerInvoiceRequest,
  ResubmitCustomerInvoiceResponse,
  CustomerInvoiceTermsOptionsResponse,
} from '../models/customer-invoice.model';
import {
  CreateCustomerInvoiceFromVendorRequest,
  CreateCustomerInvoiceFromVendorResponse,
  CreateMultiVendorCustomerInvoiceRequest,
  CustomerInvoiceRichDetailResponse,
  UpdateCustomerInvoiceFromVendorRequest,
  UpdateCustomerInvoiceFromVendorResponse,
} from '../models/customer-invoice-from-vendor.model';

@Injectable({ providedIn: 'root' })
export class VendorBillsService {
  private readonly http = inject(HttpClient);
  private readonly checkInOutBase = `${environment.apiBaseUrl}/api/v1/admin/checkinout`;
  private readonly vendorBillsBase = `${environment.apiBaseUrl}/api/v1/admin/vendor-bills`;
  private readonly vendorStatusActionBase = `${environment.apiBaseUrl}/api/v1/admin/vendor-status-action`;
  private readonly onSiteApprovalBase = `${environment.apiBaseUrl}/api/v1/admin/on-site-approval`;
  private readonly workOrderBase = `${environment.apiBaseUrl}/api/v1/admin/work-order`;
  private readonly customerInvoiceBase = `${environment.apiBaseUrl}/api/v1/admin/customer-invoice`;
  private static readonly TIMEOUT_MS = 60_000;

  getJobCheckInOutList(
    jobKey: string,
    opts: { start?: number; length?: number; searchValue?: string; sortCol?: number; sortDir?: string } = {},
  ): Observable<VendorBillsApiResponse<PagedResult<AdminJobCheckInOutRow>>> {
    let params = new HttpParams()
      .set('start', String(opts.start ?? 0))
      .set('length', String(opts.length ?? 10))
      .set('sortCol', String(opts.sortCol ?? 1))
      .set('sortDir', opts.sortDir ?? 'desc');

    if (opts.searchValue?.trim()) {
      params = params.set('searchValue', opts.searchValue.trim());
    }

    return this.http
      .get<VendorBillsApiResponse<PagedResult<AdminJobCheckInOutRow>>>(
        `${this.checkInOutBase}/job-list/${jobKey}`,
        { params },
      )
      .pipe(
        timeout(VendorBillsService.TIMEOUT_MS),
        catchError(this.handleError<PagedResult<AdminJobCheckInOutRow>>('getJobCheckInOutList')),
      );
  }

  getJobVendorsForManualEntry(
    jobKey: string,
  ): Observable<VendorBillsApiResponse<AdminJobCheckInOutVendorOption[]>> {
    return this.http
      .get<VendorBillsApiResponse<AdminJobCheckInOutVendorOption[]>>(
        `${this.checkInOutBase}/job-vendors/${jobKey}`,
      )
      .pipe(
        timeout(VendorBillsService.TIMEOUT_MS),
        catchError(this.handleError<AdminJobCheckInOutVendorOption[]>('getJobVendorsForManualEntry')),
      );
  }

  editCheckInOut(
    request: AdminEditCheckInOutRequest,
  ): Observable<VendorBillsApiResponse<string>> {
    return this.http
      .post<VendorBillsApiResponse<string>>(`${this.checkInOutBase}/edit`, request)
      .pipe(
        timeout(VendorBillsService.TIMEOUT_MS),
        catchError(this.handleError<string>('editCheckInOut')),
      );
  }

  markCheckInViewed(checkinKey: string): Observable<VendorBillsApiResponse<string>> {
    return this.http
      .post<VendorBillsApiResponse<string>>(`${this.checkInOutBase}/mark-viewed/${checkinKey}`, {})
      .pipe(
        timeout(VendorBillsService.TIMEOUT_MS),
        catchError(this.handleError<string>('markCheckInViewed')),
      );
  }

  getJobEstimatesPage(
    jobKey: string,
    opts: { start?: number; length?: number; searchValue?: string } = {},
  ): Observable<VendorBillsApiResponse<AdminJobEstimatesPage>> {
    let params = new HttpParams()
      .set('start', String(opts.start ?? 0))
      .set('length', String(opts.length ?? 500));

    if (opts.searchValue?.trim()) {
      params = params.set('searchValue', opts.searchValue.trim());
    }

    return this.http
      .get<VendorBillsApiResponse<AdminJobEstimatesPage>>(
        `${this.vendorBillsBase}/job-estimates/${jobKey}`,
        { params },
      )
      .pipe(
        timeout(VendorBillsService.TIMEOUT_MS),
        catchError(this.handleError<AdminJobEstimatesPage>('getJobEstimatesPage')),
      );
  }

  getCreateEstimateModal(
    jobKey: string,
  ): Observable<VendorBillsApiResponse<AdminCreateEstimateModalData>> {
    return this.http
      .get<VendorBillsApiResponse<AdminCreateEstimateModalData>>(
        `${this.vendorBillsBase}/create-estimate-modal/${jobKey}`,
      )
      .pipe(
        timeout(VendorBillsService.TIMEOUT_MS),
        catchError(this.handleError<AdminCreateEstimateModalData>('getCreateEstimateModal')),
      );
  }

  getInvoicesPage(jobKey: string): Observable<VendorBillsApiResponse<AdminInvoicesPage>> {
    return this.http
      .get<VendorBillsApiResponse<AdminInvoicesPage>>(
        `${this.vendorBillsBase}/invoices-page/${jobKey}`,
      )
      .pipe(
        timeout(VendorBillsService.TIMEOUT_MS),
        catchError(this.handleError<AdminInvoicesPage>('getInvoicesPage')),
      );
  }

  // ── Native customer-invoice creation (Phase 2, Paths 1/2/4) ────────────────

  /** POST customer-invoice/create — persists a customer invoice from any of the four sources. */
  createCustomerInvoice(
    request: CreateCustomerInvoiceRequest,
  ): Observable<VendorBillsApiResponse<CreateCustomerInvoiceResponse>> {
    return this.http
      .post<VendorBillsApiResponse<CreateCustomerInvoiceResponse>>(
        `${this.customerInvoiceBase}/create`,
        request,
      )
      .pipe(
        timeout(VendorBillsService.TIMEOUT_MS),
        catchError(this.handleError<CreateCustomerInvoiceResponse>('createCustomerInvoice')),
      );
  }

  /** GET customer-invoice/preview-from-estimate/{estimateKey} — seed lines from a customer estimate (Path 2). */
  previewInvoiceFromEstimate(
    estimateKey: string,
  ): Observable<VendorBillsApiResponse<PreviewCustomerInvoiceResponse>> {
    return this.http
      .get<VendorBillsApiResponse<PreviewCustomerInvoiceResponse>>(
        `${this.customerInvoiceBase}/preview-from-estimate/${estimateKey}`,
      )
      .pipe(
        timeout(VendorBillsService.TIMEOUT_MS),
        catchError(this.handleError<PreviewCustomerInvoiceResponse>('previewInvoiceFromEstimate')),
      );
  }

  /** GET customer-invoice/preview-from-vendor-invoice/{vendorInvoiceKey} — seed lines at cost (Path 4 direct). */
  previewInvoiceFromVendorInvoice(
    vendorInvoiceKey: string,
  ): Observable<VendorBillsApiResponse<PreviewCustomerInvoiceResponse>> {
    return this.http
      .get<VendorBillsApiResponse<PreviewCustomerInvoiceResponse>>(
        `${this.customerInvoiceBase}/preview-from-vendor-invoice/${vendorInvoiceKey}`,
      )
      .pipe(
        timeout(VendorBillsService.TIMEOUT_MS),
        catchError(
          this.handleError<PreviewCustomerInvoiceResponse>('previewInvoiceFromVendorInvoice'),
        ),
      );
  }

  /** GET customer-invoice/preview-from-vendor-estimate/{vendorEstimateKey} — seed via markup engine (Path 4). */
  previewInvoiceFromVendorEstimate(
    vendorEstimateKey: string,
  ): Observable<VendorBillsApiResponse<PreviewCustomerInvoiceResponse>> {
    return this.http
      .get<VendorBillsApiResponse<PreviewCustomerInvoiceResponse>>(
        `${this.customerInvoiceBase}/preview-from-vendor-estimate/${vendorEstimateKey}`,
      )
      .pipe(
        timeout(VendorBillsService.TIMEOUT_MS),
        catchError(
          this.handleError<PreviewCustomerInvoiceResponse>('previewInvoiceFromVendorEstimate'),
        ),
      );
  }

  /**
   * GET customer-invoice/preview-from-vendor-estimate-gated/{key} — gated single-vendor invoice
   * preview, full markup-gate parity with the customer-estimate flow's preview-customer-estimate.
   * Distinct from `previewInvoiceFromVendorEstimate` above (the older, thin/ungated preview) — this
   * backs the new rich create-customer-invoice-from-vendor-modal only.
   */
  previewGatedInvoiceFromVendorEstimate(
    vendorEstimateKey: string,
  ): Observable<VendorBillsApiResponse<CreateCustomerInvoiceFromVendorResponse>> {
    return this.http
      .get<VendorBillsApiResponse<CreateCustomerInvoiceFromVendorResponse>>(
        `${this.customerInvoiceBase}/preview-from-vendor-estimate-gated/${vendorEstimateKey}`,
      )
      .pipe(
        timeout(VendorBillsService.TIMEOUT_MS),
        catchError(
          this.handleError<CreateCustomerInvoiceFromVendorResponse>('previewGatedInvoiceFromVendorEstimate'),
        ),
      );
  }

  /**
   * POST customer-invoice/preview-from-vendor-estimates-multi-vendor — non-persisting preview of a
   * merged multi-vendor customer invoice ("Combine Vendor Estimates" for invoices). Requires 2+ keys.
   */
  previewMultiVendorCustomerInvoice(
    vendorEstimateKeys: string[],
  ): Observable<VendorBillsApiResponse<CreateCustomerInvoiceFromVendorResponse>> {
    return this.http
      .post<VendorBillsApiResponse<CreateCustomerInvoiceFromVendorResponse>>(
        `${this.customerInvoiceBase}/preview-from-vendor-estimates-multi-vendor`,
        { vendorEstimateKeys },
      )
      .pipe(
        timeout(VendorBillsService.TIMEOUT_MS),
        catchError(
          this.handleError<CreateCustomerInvoiceFromVendorResponse>('previewMultiVendorCustomerInvoice'),
        ),
      );
  }

  /**
   * POST customer-invoice/create-from-vendor-estimate — persists a rich (vendor-paired, markup-gated)
   * customer invoice from one vendor estimate.
   */
  createCustomerInvoiceFromVendorEstimate(
    request: CreateCustomerInvoiceFromVendorRequest,
  ): Observable<VendorBillsApiResponse<CreateCustomerInvoiceFromVendorResponse>> {
    return this.http
      .post<VendorBillsApiResponse<CreateCustomerInvoiceFromVendorResponse>>(
        `${this.customerInvoiceBase}/create-from-vendor-estimate`,
        request,
      )
      .pipe(
        timeout(VendorBillsService.TIMEOUT_MS),
        catchError(
          this.handleError<CreateCustomerInvoiceFromVendorResponse>('createCustomerInvoiceFromVendorEstimate'),
        ),
      );
  }

  /**
   * POST customer-invoice/create-from-vendor-estimates-multi-vendor — multi-vendor-merge counterpart
   * of createCustomerInvoiceFromVendorEstimate (portion titles, 2+ vendor estimates).
   */
  createMultiVendorCustomerInvoiceFromVendorEstimates(
    request: CreateMultiVendorCustomerInvoiceRequest,
  ): Observable<VendorBillsApiResponse<CreateCustomerInvoiceFromVendorResponse>> {
    return this.http
      .post<VendorBillsApiResponse<CreateCustomerInvoiceFromVendorResponse>>(
        `${this.customerInvoiceBase}/create-from-vendor-estimates-multi-vendor`,
        request,
      )
      .pipe(
        timeout(VendorBillsService.TIMEOUT_MS),
        catchError(
          this.handleError<CreateCustomerInvoiceFromVendorResponse>(
            'createMultiVendorCustomerInvoiceFromVendorEstimates',
          ),
        ),
      );
  }

  /**
   * POST customer-invoice/{key}/send-for-prep-review — post-creation follow-up for the "Send this
   * invoice to the prep manager for review?" Yes/No prompt shown right after Save in the native
   * invoice-from-vendor-estimate modal. Emails the prep manager and updates accounting status.
   */
  sendInvoiceForPrepManagerReview(
    customerInvoiceKey: string,
    note?: string | null,
    attachmentFileKeys?: string[] | null,
  ): Observable<VendorBillsApiResponse<string>> {
    return this.http
      .post<VendorBillsApiResponse<string>>(
        `${this.customerInvoiceBase}/${customerInvoiceKey}/send-for-prep-review`,
        { note: note ?? null, attachmentFileKeys: attachmentFileKeys ?? null },
      )
      .pipe(
        timeout(VendorBillsService.TIMEOUT_MS),
        catchError(this.handleError<string>('sendInvoiceForPrepManagerReview')),
      );
  }

  /**
   * POST customer-invoice/{key}/prep-review-decision — authenticated approve / request-change
   * action taken from the invoice list (never from an unauthenticated email link).
   */
  submitPrepReviewDecision(
    customerInvoiceKey: string,
    approved: boolean,
    declineNote?: string | null,
  ): Observable<VendorBillsApiResponse<string>> {
    return this.http
      .post<VendorBillsApiResponse<string>>(
        `${this.customerInvoiceBase}/${customerInvoiceKey}/prep-review-decision`,
        { approved, declineNote: declineNote ?? null },
      )
      .pipe(
        timeout(VendorBillsService.TIMEOUT_MS),
        catchError(this.handleError<string>('submitPrepReviewDecision')),
      );
  }

  /**
   * POST customer-invoice/{key}/prep-review-attachments — stages files (TempFileStock) for the
   * "send for prep-manager review" email. Returns each staged file's key to pass back as
   * attachmentFileKeys on sendInvoiceForPrepManagerReview.
   */
  stagePrepReviewAttachments(
    customerInvoiceKey: string,
    files: File[],
  ): Observable<VendorBillsApiResponse<string[]>> {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file, file.name));

    return this.http
      .post<VendorBillsApiResponse<string[]>>(
        `${this.customerInvoiceBase}/${customerInvoiceKey}/prep-review-attachments`,
        formData,
      )
      .pipe(
        timeout(VendorBillsService.TIMEOUT_MS),
        catchError(this.handleError<string[]>('stagePrepReviewAttachments')),
      );
  }

  /** GET customer-invoice/active-check/{jobKey} — duplicate-invoice gate (IsEstimate=false). */
  checkActiveCustomerInvoice(
    jobKey: string,
  ): Observable<VendorBillsApiResponse<ActiveCustomerInvoiceCheckResponse>> {
    return this.http
      .get<VendorBillsApiResponse<ActiveCustomerInvoiceCheckResponse>>(
        `${this.customerInvoiceBase}/active-check/${jobKey}`,
      )
      .pipe(
        timeout(VendorBillsService.TIMEOUT_MS),
        catchError(
          this.handleError<ActiveCustomerInvoiceCheckResponse>('checkActiveCustomerInvoice'),
        ),
      );
  }

  /** GET customer-invoice/deposit-gate/{jobKey} — block when a deposit estimate isn't customer-approved. */
  checkDepositGate(jobKey: string): Observable<VendorBillsApiResponse<DepositGateResponse>> {
    return this.http
      .get<VendorBillsApiResponse<DepositGateResponse>>(
        `${this.customerInvoiceBase}/deposit-gate/${jobKey}`,
      )
      .pipe(
        timeout(VendorBillsService.TIMEOUT_MS),
        catchError(this.handleError<DepositGateResponse>('checkDepositGate')),
      );
  }

  /** GET customer-invoice/vendor-cost-check/{jobKey}?invoiceTotal= — vendor-cost-exceeds warning. */
  checkVendorCost(
    jobKey: string,
    invoiceTotal: number,
  ): Observable<VendorBillsApiResponse<VendorCostCheckResponse>> {
    const params = new HttpParams().set('invoiceTotal', String(invoiceTotal));
    return this.http
      .get<VendorBillsApiResponse<VendorCostCheckResponse>>(
        `${this.customerInvoiceBase}/vendor-cost-check/${jobKey}`,
        { params },
      )
      .pipe(
        timeout(VendorBillsService.TIMEOUT_MS),
        catchError(this.handleError<VendorCostCheckResponse>('checkVendorCost')),
      );
  }

  /** GET customer-invoice/terms-options/{jobKey} — Terms dropdown options + the customer's default term. */
  getInvoiceTermsOptions(
    jobKey: string,
  ): Observable<VendorBillsApiResponse<CustomerInvoiceTermsOptionsResponse>> {
    return this.http
      .get<VendorBillsApiResponse<CustomerInvoiceTermsOptionsResponse>>(
        `${this.customerInvoiceBase}/terms-options/${jobKey}`,
      )
      .pipe(
        timeout(VendorBillsService.TIMEOUT_MS),
        catchError(this.handleError<CustomerInvoiceTermsOptionsResponse>('getInvoiceTermsOptions')),
      );
  }

  /** GET customer-invoice/list/{jobKey} — the job's active customer invoices (grid data). */
  listCustomerInvoices(jobKey: string): Observable<VendorBillsApiResponse<CustomerInvoiceListResponse>> {
    return this.http
      .get<VendorBillsApiResponse<CustomerInvoiceListResponse>>(`${this.customerInvoiceBase}/list/${jobKey}`)
      .pipe(
        timeout(VendorBillsService.TIMEOUT_MS),
        catchError(this.handleError<CustomerInvoiceListResponse>('listCustomerInvoices')),
      );
  }

  /** POST customer-invoice/receivables — mark paid / QB-push / manually sent / mark unpaid. */
  updateInvoiceReceivables(
    request: UpdateInvoiceReceivablesRequest,
  ): Observable<VendorBillsApiResponse<UpdateInvoiceReceivablesResponse>> {
    return this.http
      .post<VendorBillsApiResponse<UpdateInvoiceReceivablesResponse>>(
        `${this.customerInvoiceBase}/receivables`,
        request,
      )
      .pipe(
        timeout(VendorBillsService.TIMEOUT_MS),
        catchError(this.handleError<UpdateInvoiceReceivablesResponse>('updateInvoiceReceivables')),
      );
  }

  /** GET customer-invoice/recipients/{customerInvoiceKey} — account + location contacts to email. */
  getCustomerInvoiceRecipients(
    customerInvoiceKey: string,
  ): Observable<VendorBillsApiResponse<CustomerInvoiceRecipientsResponse>> {
    return this.http
      .get<VendorBillsApiResponse<CustomerInvoiceRecipientsResponse>>(
        `${this.customerInvoiceBase}/recipients/${customerInvoiceKey}`,
      )
      .pipe(
        timeout(VendorBillsService.TIMEOUT_MS),
        catchError(this.handleError<CustomerInvoiceRecipientsResponse>('getCustomerInvoiceRecipients')),
      );
  }

  /** POST customer-invoice/send-email — email the invoice to the customer. */
  sendCustomerInvoiceEmail(
    request: SendCustomerInvoiceEmailRequest,
  ): Observable<VendorBillsApiResponse<SendCustomerInvoiceEmailResponse>> {
    return this.http
      .post<VendorBillsApiResponse<SendCustomerInvoiceEmailResponse>>(
        `${this.customerInvoiceBase}/send-email`,
        request,
      )
      .pipe(
        timeout(VendorBillsService.TIMEOUT_MS),
        catchError(this.handleError<SendCustomerInvoiceEmailResponse>('sendCustomerInvoiceEmail')),
      );
  }

  /**
   * GET customer-invoice/detail/{customerInvoiceKey} — the rich vendor-comparison shape
   * (CustomerInvoiceRichDetailResponse) for the create-customer-invoice-from-vendor modal's
   * edit/view mode.
   */
  getCustomerInvoiceRichDetail(
    customerInvoiceKey: string,
  ): Observable<VendorBillsApiResponse<CustomerInvoiceRichDetailResponse>> {
    return this.http
      .get<VendorBillsApiResponse<CustomerInvoiceRichDetailResponse>>(
        `${this.customerInvoiceBase}/detail/${customerInvoiceKey}`,
      )
      .pipe(
        timeout(VendorBillsService.TIMEOUT_MS),
        catchError(this.handleError<CustomerInvoiceRichDetailResponse>('getCustomerInvoiceRichDetail')),
      );
  }

  /**
   * PUT customer-invoice/update — the rich vendor-linked/markup-gate request+response shape for the
   * from-vendor modal's edit mode.
   */
  updateCustomerInvoiceFromVendor(
    request: UpdateCustomerInvoiceFromVendorRequest,
  ): Observable<VendorBillsApiResponse<UpdateCustomerInvoiceFromVendorResponse>> {
    return this.http
      .put<VendorBillsApiResponse<UpdateCustomerInvoiceFromVendorResponse>>(
        `${this.customerInvoiceBase}/update`,
        request,
      )
      .pipe(
        timeout(VendorBillsService.TIMEOUT_MS),
        catchError(this.handleError<UpdateCustomerInvoiceFromVendorResponse>('updateCustomerInvoiceFromVendor')),
      );
  }

  /** POST customer-invoice/void — soft-delete, blocked if any partial-pay row is already paid. */
  voidCustomerInvoice(
    request: VoidCustomerInvoiceRequest,
  ): Observable<VendorBillsApiResponse<VoidCustomerInvoiceResponse>> {
    return this.http
      .post<VendorBillsApiResponse<VoidCustomerInvoiceResponse>>(`${this.customerInvoiceBase}/void`, request)
      .pipe(
        timeout(VendorBillsService.TIMEOUT_MS),
        catchError(this.handleError<VoidCustomerInvoiceResponse>('voidCustomerInvoice')),
      );
  }

  /** POST customer-invoice/resubmit — reopen a sent invoice for editing and re-sending. */
  resubmitCustomerInvoice(
    request: ResubmitCustomerInvoiceRequest,
  ): Observable<VendorBillsApiResponse<ResubmitCustomerInvoiceResponse>> {
    return this.http
      .post<VendorBillsApiResponse<ResubmitCustomerInvoiceResponse>>(`${this.customerInvoiceBase}/resubmit`, request)
      .pipe(
        timeout(VendorBillsService.TIMEOUT_MS),
        catchError(this.handleError<ResubmitCustomerInvoiceResponse>('resubmitCustomerInvoice')),
      );
  }

  getVendorPapers(
    jobKey: string,
    stage: VendorBillAttachmentStage = 'invoice',
  ): Observable<VendorBillsApiResponse<AdminVendorPapersPage>> {
    const params = new HttpParams().set('stage', stage);
    return this.http
      .get<VendorBillsApiResponse<AdminVendorPapersPage>>(
        `${this.vendorBillsBase}/vendor-papers/${jobKey}`,
        { params },
      )
      .pipe(
        timeout(VendorBillsService.TIMEOUT_MS),
        catchError(this.handleError<AdminVendorPapersPage>('getVendorPapers')),
      );
  }

  uncheckAllVendorPapers(
    jobKey: string,
    stage: VendorBillAttachmentStage = 'invoice',
  ): Observable<VendorBillsApiResponse<string>> {
    const params = new HttpParams().set('stage', stage);
    return this.http
      .post<VendorBillsApiResponse<string>>(
        `${this.vendorBillsBase}/vendor-papers/uncheck-all/${jobKey}`,
        {},
        { params },
      )
      .pipe(
        timeout(VendorBillsService.TIMEOUT_MS),
        catchError(this.handleError<string>('uncheckAllVendorPapers')),
      );
  }

  markVendorPaperViewed(uploadKey: string): Observable<VendorBillsApiResponse<string>> {
    return this.http
      .post<VendorBillsApiResponse<string>>(
        `${this.vendorBillsBase}/vendor-papers/mark-viewed/${uploadKey}`,
        {},
      )
      .pipe(
        timeout(VendorBillsService.TIMEOUT_MS),
        catchError(this.handleError<string>('markVendorPaperViewed')),
      );
  }

  deleteVendorPaper(uploadKey: string): Observable<VendorBillsApiResponse<string>> {
    return this.http
      .post<VendorBillsApiResponse<string>>(
        `${this.vendorBillsBase}/vendor-papers/delete/${uploadKey}`,
        {},
      )
      .pipe(
        timeout(VendorBillsService.TIMEOUT_MS),
        catchError(this.handleError<string>('deleteVendorPaper')),
      );
  }

  getUploadVendorPapersModal(
    jobKey: string,
  ): Observable<VendorBillsApiResponse<AdminUploadVendorPapersModal>> {
    return this.http
      .get<VendorBillsApiResponse<AdminUploadVendorPapersModal>>(
        `${this.vendorBillsBase}/upload-vendor-papers-modal/${jobKey}`,
      )
      .pipe(
        timeout(VendorBillsService.TIMEOUT_MS),
        catchError(this.handleError<AdminUploadVendorPapersModal>('getUploadVendorPapersModal')),
      );
  }

  uploadVendorPaperTempFiles(
    checkKey: string,
    files: File[],
  ): Observable<VendorBillsApiResponse<number>> {
    const formData = new FormData();
    for (const file of files) {
      formData.append('file', file, file.name);
    }

    return this.http
      .post<VendorBillsApiResponse<number>>(
        `${this.vendorBillsBase}/vendor-papers/temp-files/${checkKey}`,
        formData,
      )
      .pipe(
        timeout(VendorBillsService.TIMEOUT_MS),
        catchError(this.handleError<number>('uploadVendorPaperTempFiles')),
      );
  }

  removeVendorPaperTempFile(
    checkKey: string,
    fileName: string,
  ): Observable<VendorBillsApiResponse<string>> {
    return this.http
      .post<VendorBillsApiResponse<string>>(
        `${this.vendorBillsBase}/vendor-papers/temp-files/${checkKey}/remove`,
        { fileName },
      )
      .pipe(
        timeout(VendorBillsService.TIMEOUT_MS),
        catchError(this.handleError<string>('removeVendorPaperTempFile')),
      );
  }

  saveVendorPapers(
    request: SaveVendorPapersRequest,
  ): Observable<VendorBillsApiResponse<string>> {
    return this.http
      .post<VendorBillsApiResponse<string>>(
        `${this.vendorBillsBase}/vendor-papers/save`,
        request,
      )
      .pipe(
        timeout(VendorBillsService.TIMEOUT_MS),
        catchError(this.handleError<string>('saveVendorPapers')),
      );
  }

  updateEstimateManageStatus(
    estimateKey: string,
    request: UpdateEstimateManageStatusRequest,
  ): Observable<VendorBillsApiResponse<string>> {
    return this.http
      .post<VendorBillsApiResponse<string>>(
        `${this.vendorBillsBase}/estimates/${estimateKey}/manage-status`,
        request,
      )
      .pipe(
        timeout(VendorBillsService.TIMEOUT_MS),
        catchError(this.handleError<string>('updateEstimateManageStatus')),
      );
  }

  setVendorEstimateToApproved(
    request: SetVendorEstimateApprovedRequest,
  ): Observable<VendorBillsApiResponse<SetVendorEstimateApprovedResultDto>> {
    return this.http
      .post<VendorBillsApiResponse<SetVendorEstimateApprovedResultDto>>(
        `${this.vendorStatusActionBase}/set-vendor-estimate-approved`,
        request,
      )
      .pipe(
        timeout(VendorBillsService.TIMEOUT_MS),
        catchError(
          this.handleError<SetVendorEstimateApprovedResultDto>('setVendorEstimateToApproved'),
        ),
      );
  }

  saveVendorApprovalData(
    request: SaveVendorApprovalDataRequest,
  ): Observable<VendorBillsApiResponse<SaveVendorApprovalDataResponse>> {
    return this.http
      .post<VendorBillsApiResponse<SaveVendorApprovalDataResponse>>(
        `${this.onSiteApprovalBase}/save-vendor-approval-data`,
        request,
      )
      .pipe(
        timeout(VendorBillsService.TIMEOUT_MS),
        catchError(this.handleError<SaveVendorApprovalDataResponse>('saveVendorApprovalData')),
      );
  }

  rejectVendorEstimateForResubmission(
    request: RejectVendorEstimateRequest,
  ): Observable<VendorBillsApiResponse<RejectVendorEstimateResultDto>> {
    return this.http
      .post<VendorBillsApiResponse<RejectVendorEstimateResultDto>>(
        `${this.vendorStatusActionBase}/reject-vendor-estimate`,
        request,
      )
      .pipe(
        timeout(VendorBillsService.TIMEOUT_MS),
        catchError(
          this.handleError<RejectVendorEstimateResultDto>('rejectVendorEstimateForResubmission'),
        ),
      );
  }

  declineVendorEstimate(
    request: DeclineVendorEstimateRequest,
  ): Observable<VendorBillsApiResponse<DeclineVendorEstimateResultDto>> {
    return this.http
      .post<VendorBillsApiResponse<DeclineVendorEstimateResultDto>>(
        `${this.vendorStatusActionBase}/decline-vendor-estimate`,
        request,
      )
      .pipe(
        timeout(VendorBillsService.TIMEOUT_MS),
        catchError(this.handleError<DeclineVendorEstimateResultDto>('declineVendorEstimate')),
      );
  }

  /**
   * GET on-site-approval/customer-estimate/{jobKey} — returns the existing customer estimate for
   * the job, or creates one from vendorEstimateKey if none exists yet.
   */
  getCustomerEstimate(
    jobKey: string,
    vendorEstimateKey?: string,
  ): Observable<VendorBillsApiResponse<CreateCustomerEstimateResponse>> {
    let params = new HttpParams();
    if (vendorEstimateKey) {
      params = params.set('vendorEstimateKey', vendorEstimateKey);
    }
    return this.http
      .get<VendorBillsApiResponse<CreateCustomerEstimateResponse>>(
        `${this.onSiteApprovalBase}/customer-estimate/${jobKey}`,
        { params },
      )
      .pipe(
        timeout(VendorBillsService.TIMEOUT_MS),
        catchError(this.handleError<CreateCustomerEstimateResponse>('getCustomerEstimate')),
      );
  }

  sendEmailToVendor(
    request: SendWorkOrderEmailToVendorRequest,
  ): Observable<VendorBillsApiResponse<SendWorkOrderEmailResponse>> {
    return this.http
      .post<VendorBillsApiResponse<SendWorkOrderEmailResponse>>(
        `${this.workOrderBase}/email-to-vendor`,
        request,
      )
      .pipe(
        timeout(VendorBillsService.TIMEOUT_MS),
        catchError(this.handleError<SendWorkOrderEmailResponse>('sendEmailToVendor')),
      );
  }

  private handleError<T>(operation: string) {
    return (err: unknown): Observable<VendorBillsApiResponse<T>> => {
      console.error(`${operation} failed`, err);
      const message =
        err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.';
      return of({
        status: false,
        responseCode: 0,
        message,
        data: null as T,
        details: [],
        unixTime: 0,
        traceId: null,
      } satisfies VendorBillsApiResponse<T>);
    };
  }
}
