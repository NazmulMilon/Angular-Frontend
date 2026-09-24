/**
 * "Create Customer Invoice from Vendor Estimate" — gated (markup-gate + multi-vendor-merge parity)
 * flow. Mirrors the customer-ESTIMATE flow's `CustomerEstimateLineItem`/`CreateCustomerEstimateRequest`/
 * `CreateCustomerEstimateResponse` shapes (on-site-estimate.model.ts) field-for-field, but is its own
 * type so the invoice and estimate contracts can diverge independently. Reuses `VendorPortionTitle`
 * (on-site-estimate.model.ts) and `DynMinMarkupAdjustmentProposal`/`MarkupAdjustmentDecision`
 * (dyn-min-markup.model.ts) verbatim — both are already fully generic.
 */

import { VendorPortionTitle } from './on-site-estimate.model';
import { DynMinMarkupAdjustmentProposal, MarkupAdjustmentDecision } from './dyn-min-markup.model';

/** Rich per-line item on the invoice-from-vendor-estimate preview/create response. */
export interface CustomerInvoiceRichLineItem {
  chargeType: string;
  chargeTypeKey: string;
  description: string;
  vendorRate: number;
  vendorQty: number;
  vendorAmount: number;
  customerRate: number;
  customerQty: number;
  customerAmount: number;
  calculatedMarkupPercent: number;
  profileMarkupPercent?: number;
  originalHours?: number;
  adjustedHours?: number;
  wasHourAdjusted: boolean;
  techCount?: number;
  lineType: 'labor' | 'material' | 'trip' | 'custom';
  costIncurred: number;
  displayLevel?: number;
  isCustomLineItem?: boolean;
  /**
   * JobSalesInvoiceDetail.DetailKey (the invoice's own PK). Field name is `customerEstimateDetailKey`
   * on the wire — the backend reuses OnSiteApprovalDTO.cs's CustomerEstimateLineItemDto verbatim for
   * both the estimate and invoice flows (see the plan's DTO-reuse decision), so this is NOT renamed
   * client-side even though the value here is really an invoice detail key.
   */
  customerEstimateDetailKey?: string;
  vendorEstimateDetailKey?: string;
  vendorEstimateLaborKey?: string;
  /** Which vendor estimate this line came from — set on every line in a multi-vendor merge. */
  sourceVendorEstimateKey?: string;
  sourcePortionTitle?: string;
}

/**
 * POST create-from-vendor-estimate(s) / GET preview-from-vendor-estimate-gated response shape. One type
 * serves both preview and persisted results, same convention as the estimate side's
 * `CreateCustomerEstimateResponse`.
 */
export interface CreateCustomerInvoiceFromVendorResponse {
  /** Guid.Empty on preview, or on a create call that returned an unresolved adjustmentProposal instead
   *  of persisting. */
  customerInvoiceKey: string;
  invoiceNo?: number | null;
  lineItems: CustomerInvoiceRichLineItem[];
  vendorTotal: number;
  invoiceTotal: number;
  adminMarkupLineItemKey?: string;
  message: string;
  adjustmentProposal?: DynMinMarkupAdjustmentProposal | null;
}

/** One line item sent on create-from-vendor-estimate(s) — same shape and tempIndex-echo contract as
 *  the estimate flow's UpdateCustomerEstimateLineItemRequest, renamed for the invoice domain. */
export interface UpdateCustomerInvoiceFromVendorLineItemRequest {
  lineItemKey: string;
  chargeType?: string;
  chargeTypeKey?: string;
  description?: string;
  costIncurred?: number;
  customerQty: number;
  customerRate: number;
  customerAmount: number;
  isNewLineItem?: boolean;
  /** Edit mode only — explicitly marks a persisted line for removal (see the invoice modal's
   *  deletedLineItemKeys doc comment for why this can't be inferred from omission). */
  isDeleted?: boolean;
  tempIndex?: number;
  vendorEstimateDetailKey?: string;
  sourceVendorEstimateKey?: string;
}

/** POST create-from-vendor-estimate request body (single vendor estimate). */
export interface CreateCustomerInvoiceFromVendorRequest {
  vendorEstimateKey: string;
  terms?: string | null;
  worksPerformed?: string | null;
  lineItems?: UpdateCustomerInvoiceFromVendorLineItemRequest[];
  markupAdjustmentDecision?: MarkupAdjustmentDecision;
  markupOverrideLineItems?: UpdateCustomerInvoiceFromVendorLineItemRequest[];
  addAdminFee?: boolean;
  adminFeePercent?: number | null;
  sendToPrepManager?: boolean;
}

/** POST create-from-vendor-estimates-multi-vendor request body. */
export interface CreateMultiVendorCustomerInvoiceRequest {
  vendorEstimateKeys: string[];
  vendorPortionTitles?: VendorPortionTitle[];
  terms?: string | null;
  worksPerformed?: string | null;
  lineItems?: UpdateCustomerInvoiceFromVendorLineItemRequest[];
  markupAdjustmentDecision?: MarkupAdjustmentDecision;
  markupOverrideLineItems?: UpdateCustomerInvoiceFromVendorLineItemRequest[];
  addAdminFee?: boolean;
  adminFeePercent?: number | null;
  sendToPrepManager?: boolean;
}

/** POST preview-from-vendor-estimates-multi-vendor request body. Requires 2+ keys. */
export interface PreviewMultiVendorCustomerInvoiceRequest {
  vendorEstimateKeys: string[];
}

/**
 * PUT update request for an already-persisted invoice, in edit mode — mirrors the estimate side's
 * UpdateCustomerEstimateRequest (same markup-gate fields) rather than the older flat
 * UpdateCustomerInvoiceRequest (customer-invoice.model.ts), which has no vendor-linkage/markup-gate
 * support at all.
 */
export interface UpdateCustomerInvoiceFromVendorRequest {
  customerInvoiceKey: string;
  terms?: string | null;
  worksPerformed?: string | null;
  lineItems: UpdateCustomerInvoiceFromVendorLineItemRequest[];
  markupAdjustmentDecision?: MarkupAdjustmentDecision;
  markupOverrideLineItems?: UpdateCustomerInvoiceFromVendorLineItemRequest[];
}

export interface UpdateCustomerInvoiceFromVendorResponse {
  customerInvoiceKey: string;
  invoiceTotal: number;
  vendorTotal: number;
  /** TempIndex → newly generated DetailKey, so the frontend can reconcile new lines. */
  createdLineItems: Record<number, string>;
  message: string;
  adjustmentProposal?: DynMinMarkupAdjustmentProposal | null;
}

/**
 * One line item on the rich GET detail response for an already-persisted invoice (edit/view mode).
 * Matches RFIJobOps CustomModel/CustomerInvoiceDTO.cs's CustomerInvoiceLineItem field names exactly —
 * NOT the same field names as CustomerInvoiceRichLineItem above (that's the create/preview shape,
 * which reuses the estimate DTO verbatim; this is the invoice's own native read DTO).
 */
export interface CustomerInvoiceRichDetailLineItem {
  detailKey?: string;
  chargeTypeKey?: string;
  chargeType?: string;
  description?: string;
  rate: number;
  qty: number;
  amount?: number;
  markupPercent?: number;
  costIncurred?: number;
  display?: number;
  lineType?: 'labor' | 'material' | 'trip' | 'custom' | string;
  vendorEstimateDetailKey?: string;
  vendorRate?: number;
  vendorQty?: number;
  vendorAmount?: number;
  profileMarkupPercent?: number;
  calculatedMarkupPercent?: number;
  originalHours?: number;
  adjustedHours?: number;
  wasHourAdjusted?: boolean;
  techCount?: number;
  vendorEstimateLaborKey?: string;
  sourceVendorEstimateKey?: string;
  sourcePortionTitle?: string;
}

/**
 * GET detail response for an already-persisted invoice, in edit/view mode — the rich shape
 * (vendor-comparison columns, markup %, admin-fee key), replacing the flatter CustomerInvoiceDetailResponse
 * (customer-invoice.model.ts) that the retired EditInvoiceModalComponent used.
 */
export interface CustomerInvoiceRichDetailResponse {
  customerInvoiceKey: string;
  invoiceNo?: number | null;
  terms?: string | null;
  worksPerformed?: string | null;
  lineItems: CustomerInvoiceRichDetailLineItem[];
  invoiceTotal: number;
  vendorTotal: number;
  adminMarkupLineItemKey?: string;
  /** The job's CustomerKey — needed to load the customer's minimum-markup policy in edit mode,
   *  since the invoice list only has the invoice key to start from. */
  customerKey?: string;
  isEmergencyJob: boolean;
  sentToCustomer: boolean;
  invoicePaid: boolean;
  /** Non-null when already under the minimum-markup threshold at load time — shown immediately on
   *  open rather than only after a Save round-trip. */
  adjustmentProposal?: DynMinMarkupAdjustmentProposal | null;
}
