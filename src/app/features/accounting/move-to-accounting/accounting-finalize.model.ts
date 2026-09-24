/** Mirrors RFIJobOps.CustomModel.AccountingFinalizeStateDto -- the "👁 Bill Verification & QBO
 *  Status" recap panel + "Final Step — Finalize Job" gates (complete-screen-v2.html's
 *  handoffHTML()/sendHTML()). */
export interface AccountingFinalizeState {
  completionCallVerified: boolean;
  completionCallContact: string | null;
  completionCallWhen: string | null;
  completionCallNote: string | null;

  storeManagerEmailSent: boolean;
  storeManagerResponded: boolean;
  storeManagerStars: number | null;
  storeManagerComment: string | null;
  storeManagerRespondedWhen: string | null;
  storeManagerEmailTo: string | null;

  vendorRows: AccountingFinalizeVendorRow[];

  hasActiveInvoices: boolean;
  invoices: AccountingFinalizeInvoiceRow[];

  portalUploadRequired: boolean;
  portalUrl: string | null;
  portalInstructions: string | null;
  portalUploadOk: boolean;

  markupBelowMinimum: boolean;
  markupBlocked: boolean;

  gates: AccountingFinalizeGate[];
  ready: boolean;
  routeNote: string;
  /** True when the job is ALREADY sitting in "3 · Payables & Receivables" -- narrower than `ready`
   *  (that also requires portal-upload/markup, which don't affect Tab 2/3 placement). Drives showing
   *  a plain "✓ Fully finalized" line instead of a clickable Finalize button. */
  fullyFinalized: boolean;
}

export interface AccountingFinalizeVendorRow {
  vendorKey: string;
  vendorName: string | null;
  approvedAmount: number | null;
  decision: string | null;
  costIncurredReason: string | null;
  level: string;
  blockers: string[];
  green: string[];
  open: string[];
  pushedToQuickBooks: boolean;
  qboTransactionNumber: string | null;
}

export interface AccountingFinalizeInvoiceRow {
  invoiceKey: string;
  invoiceNo: number | null;
  isDeposit: boolean;
  approvedByAm: boolean;
  sentToCustomer: boolean;
  sentToEmail: string | null;
  sentAt: string | null;
  inQuickBooks: boolean;
  qbRefNo: string | null;
  manualQboEntry: boolean;
}

export interface AccountingFinalizeGate {
  ok: boolean;
  text: string;
}

export interface FinalizeJobResult {
  routedTo: 'bills' | 'payables-receivables';
  vendorBillsHeld: number;
  message: string;
}
