/**
 * One row in the "2 · Unapproved Vendor Bills" left-hand job list.
 * Mirrors RFIJobOps `AccountingBillsJobRowDto` exactly.
 */
export interface AccountingBillsJobRow {
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
  /** Vendor bills still not approved+in-QBO (not counting removed/non-payable vendors). */
  heldBillCount: number;

  searchVendorNames: string | null;
}
