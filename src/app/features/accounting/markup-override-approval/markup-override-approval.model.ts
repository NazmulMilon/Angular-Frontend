import { MarkupOverrideState } from '../move-to-accounting/markup-override.model';

/** One row of the "Below Minimum Mark-up Approvals" list -- mirrors
 *  RFIJobOps.CustomModel.MarkupOverridePendingItemDto. */
export interface MarkupOverridePendingItem {
  jobKey: string;
  overrideKey: string;
  po: string;
  jobName: string | null;
  customerName: string | null;
  invoiceNo: number | null;
  markupPercentAtRequest: number | null;
  minMarkupTargetAtRequest: number | null;
  requestedByName: string | null;
  requestedOn: string;
}

export interface MarkupOverrideInvoiceLine {
  description: string | null;
  qty: number;
  rate: number;
  amount: number;
}

export interface MarkupOverrideVendorInvoice {
  vendorName: string | null;
  invoiceNo: string | null;
  total: number;
}

/** Full detail for one job's approval page -- mirrors
 *  RFIJobOps.CustomModel.MarkupOverrideApprovalDetailDto. */
export interface MarkupOverrideApprovalDetail {
  jobKey: string;
  po: string;
  jobName: string | null;
  customerName: string | null;
  invoiceNo: number | null;
  invoiceTotal: number;
  combinedVendorCost: number;
  markupPercent: number;
  minMarkupTargetPercent: number;
  minMarkupTargetRuleLabel: string | null;
  invoiceLines: MarkupOverrideInvoiceLine[];
  vendorInvoices: MarkupOverrideVendorInvoice[];
  state: MarkupOverrideState;
}
