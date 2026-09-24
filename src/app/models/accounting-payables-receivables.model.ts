/**
 * One row in the "3 · Payables & Receivables" left-hand job list.
 * Mirrors RFIJobOps `AccountingPayablesReceivablesJobRowDto` exactly.
 */
export interface AccountingPayablesReceivablesJobRow {
  jobKey: string;
  jobName: string | null;
  po: string | null;
  entryDate: string | null;
  scheduleDate: string | null;
  completionDate: string | null;

  customerName: string | null;
  revCustomerDne: number | null;

  locationName: string | null;
  locationAddress: string | null;
  city: string | null;
  state: string | null;

  vendorCount: number;
  /** True once every active invoice on the job has been paid by the customer. */
  customerPaid: boolean | null;

  searchVendorNames: string | null;
}
