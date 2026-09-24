export interface CustomerGrossProfitFilter {
  customerKeys: string[] | null;
  priorityKeys: string[] | null;
  accountManagerKeys: string[] | null;
  tradeKeys: string[] | null;
  dateFrom: string | null;
  dateTo: string | null;
  /** Visible columns in table order; used by the API for shaping/sorting the report. */
  selectedColumns: string[];
}

export interface CustomerGrossProfitPerJob {
  jobPO: string | null;
  customerName: string | null;
  location: string | null;
  locationAddress: string | null;
  trade: string | null;
  priority: string | null;
  accountManagerName: string | null;
  invoiceCreationDate: string | null;
  invoiceSentDate: string | null;
  areInvoicesSent: boolean | null;
  vendorName: string | null;
  customerInvoice: number;
  vendorBill: number | null;
  vendorRevisedDNE: number | null;
  totalCustomerInvoice: number;
  totalVendorBill: number | null;
  totalVendorRevisedDNE: number | null;
  grossProfitOrLoss: number;
  marginPercent: number | null;
  usedVendorBillOrDNE: string | null;
  priorityColor: string | null;
}

export interface PagedResult<T> {
  draw: number;
  totalRecords: number;
  filteredRecords: number;
  data: T[];
}

export interface LookupItem {
  key: string;
  name: string;
}

export interface OptionGuidValueDto {
  text: string;
  value: string;
}

export interface CustomerGrossProfitExportRequest {
  filter: CustomerGrossProfitFilter;
  selectedColumns: string[];
  sortCol: number;
  sortDir: string;
  overheadPercent: number;
  wageComponent: number;
}
