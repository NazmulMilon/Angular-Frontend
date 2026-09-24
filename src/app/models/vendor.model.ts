/**
 * Vendor-related data models for the Assign Vendor feature.
 * Maps to the legacy JobVendorMainClass and related entities.
 */

/** Core job-vendor assignment record (maps to legacy JobVendor table) */
export interface AssignedVendor {
  pKey: string;
  jobKey: string;
  vendorKey: string;
  vendorName: string;
  contactName: string;
  phone: string;
  email: string;
  distance: number | null;
  serviceCharge: number | null;
  tradeName: string;
  status: string;
  isDefault: boolean;
  isPrimary: boolean;
  vendorStat: string;
  scheduledDate: string | null;
  workOrderSent: boolean;
  qtyOfJobs: number;
}

/** Vendor search result from radius/trade search (maps to legacy DefaultTbl grid) */
export interface VendorSearchResult {
  vendorKey: string;
  companyName: string;
  qtyOfJobs: number;
  dateRegistered: string;
  address: string;
  contactName: string;
  radius: number;
  distance: number;
  serviceCallMinimum: number | null;
  tradeName: string;
  vendorStat: string;
  phone: string;
  email: string;
}

/** Pinned vendor record for a job */
export interface PinnedVendor extends VendorSearchResult {
  note: string;
  pinnedJobKey: string;
}

/** Vendors who previously serviced a location (maps to legacy FirstTbl grid) */
export interface LocationHistoryVendor extends VendorSearchResult {
  lastServiceDate: string | null;
}

/** Dropdown option for vendor selection */
export interface VendorDropdownItem {
  vendorKey: string;
  vendorName: string;
  radiusInMiles: number | null;
}

/** Dropdown option for vendor contact selection */
export interface VendorContactItem {
  contactKey: string;
  contactName: string;
}

/** Service charge lookup result */
export interface ServiceChargeResult {
  serviceCharge: number;
  laborKey: string;
  radiusInMiles: number | null;
}

/** Vendor search filter parameters */
export interface VendorSearchParams {
  jobKey: string;
  radius: number;
  searchType: VendorSearchType;
}

/** Types of vendor radius search */
export enum VendorSearchType {
  AllVendorsInRadius = 1,
  VendorsInTradeWithinRadius = 2,
  VendorsInLocationHistory = 3,
}

/** Form model for adding a vendor to a job */
export interface AddVendorForm {
  jobKey: string;
  vendorKey: string;
  contactKey: string;
  tradeKey: string;
  serviceCharge: number | null;
  laborKey: string;
  distance: number | null;
}

/** Job context information displayed in the tab menu header */
export interface JobContext {
  jobKey: string;
  jobName: string;
  customerName: string;
  locationDetail: string;
  tradeName: string;
  tradeKey: string;
  locationKey: string;
  customerKey: string;
  jobTypeKey: string;
  isPrimary: boolean;
  primaryVendorKey: string | null;
  fromCustomer: string;
  minutesLeft: number | null;
}

/** Quick vendor creation payload */
export interface QuickVendorPayload {
  vendorName: string;
  companyEmail: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  stateCode: string;
  cityKey: string;
  zip: string;
  tradeKey: string;
  contactFirstName: string;
  contactLastName: string;
  contactEmail: string;
  contactPhone: string;
}

/** Generic API response wrapper */
export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data: T;
}
