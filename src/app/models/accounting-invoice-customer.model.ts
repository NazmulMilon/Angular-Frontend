/**
 * One row in the "1 · Invoice the Customer" left-hand job list.
 * Mirrors RFIJobOps `InvoiceCustomerJobRowDto` exactly — field-for-field, including which
 * checklist columns exist — so no shape guessing happens on the Angular side.
 */
export interface InvoiceCustomerJobRow {
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

  invoiceCreated: boolean | null;
  approvalMailSent: boolean | null;
  managerApproved: boolean | null;
  invoicedCustomer: boolean | null;
  invoiceEnteredInQb: boolean | null;

  vendorCount: number;

  /** Vendor names concatenated for search only — never rendered. */
  searchVendorNames: string | null;
}

/** Mirrors RFIJobOps `RFIJobOps.Models.PagedResult<T>` exactly (Draw/TotalRecords/FilteredRecords/Data/ErrorMessage). */
export interface PagedResult<T> {
  draw: number;
  totalRecords: number;
  filteredRecords: number;
  data: T[];
  errorMessage: string | null;
}
