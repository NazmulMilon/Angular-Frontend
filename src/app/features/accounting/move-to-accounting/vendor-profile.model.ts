/** "👤 Vendor Profile — registration snapshot" popup -- mirrors
 *  RFIJobOps.CustomModel.VendorProfileDto (view-only). */
export interface VendorProfile {
  vendorKey: string;
  name: string | null;
  isRegistered: boolean | null;
  isDeleted: boolean | null;

  address: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zipcode: string | null;
  isNonUsAddress: boolean | null;

  phone: string | null;
  email: string | null;
  taxId: string | null;
  netTermsName: string | null;
  radiusInMiles: number | null;

  dne: number | null;
  emergencyDne: number | null;

  classificationCode: number | null;
  classificationName: string | null;
  classificationColor: string | null;
  highCostVendor: boolean | null;
  /** "Full Consolidator" | "Possible Consolidator" | "Not Consolidator" | null */
  consolidatorLabel: string | null;

  isDnuEnabled: boolean | null;
  dnuReason: string | null;
  dnuWhoEnabled: string | null;

  insurance: VendorProfileInsurance;
  insuranceHistory: VendorProfileInsuranceHistory[];
  contacts: VendorProfileContact[];
  trades: VendorProfileTrade[];
  generalRates: VendorProfileRates | null;
  materialMarkup: VendorProfileMaterialMarkup | null;
  extraCoverage: VendorProfileCoverage | null;
  businessModel: VendorProfileBusinessModel | null;
  notes: VendorProfileNote[];
}

export interface VendorProfileCoverage {
  extraZipcodes: string[];
  extraCities: string[];
  extraStates: string[];
}

export interface VendorProfileBusinessModel {
  isSelfPerforming: boolean;
  selfPerformingFieldTechCount: number | null;
  subcontractingOfficeManagerCount: number | null;
  subcontractingFieldTechCount: number | null;
  subcontractingYearsInBusiness: number | null;
  subcontractingAdminFeePercent: number | null;
  subcontractingCertified: boolean | null;
}

export interface VendorProfileMaterialMarkup {
  markupUpTo1000: number | null;
  markupUpTo5000: number | null;
  markupOver5000: number | null;
}

export interface VendorProfileInsurance {
  carriesGl: boolean | null;
  glExpiry: string | null;
  glCurrentFileName: string | null;

  carriesWc: boolean | null;
  wcExpiry: string | null;
  wcCurrentFileName: string | null;

  reasonForNoInsurance: string | null;
  missingGl: boolean | null;
  missingWc: boolean | null;
  percentageCut: number | null;
  cutInAmt: number | null;

  pending: VendorProfilePendingInsurance[];
}

export interface VendorProfilePendingInsurance {
  pkey: string;
  insuranceType: 'GL' | 'WCOMP';
  proposedExpiry: string | null;
  fileName: string | null;
  submittedOn: string | null;
}

export interface VendorProfileInsuranceHistory {
  pkey: string;
  insuranceType: 'GL' | 'WCOMP';
  expiryDate: string | null;
  fileName: string | null;
  entryDate: string | null;
  accountManagerName: string | null;
}

export interface VendorProfileContact {
  contactKey: string;
  name: string | null;
  title: string | null;
  isAccountingContact: boolean;
  phone: string | null;
  phoneExt: string | null;
  altPhone: string | null;
  altPhoneExt: string | null;
  fax: string | null;
  email: string | null;
  isDefault: boolean;
  isActive: boolean;
}

export interface VendorProfileTrade {
  laborKey: string;
  tradeName: string | null;
  isPrimary: boolean | null;
  hourlyRate: number | null;
  emergencyHourlyRate: number | null;
  helperRates: number | null;
  emergencyHelperRates: number | null;
}

export interface VendorProfileRates {
  tripCharge: number | null;
  hourlyRate: number | null;
  serviceCharge: number | null;
  emergencyTripCharge: number | null;
  emergencyHourlyRate: number | null;
  emergencyServiceCharge: number | null;
  helperRates: number | null;
  emergencyHelperRates: number | null;
}

export interface VendorProfileNote {
  noteKey: string;
  title: string | null;
  comment: string | null;
  addedByName: string | null;
  addedOn: string | null;
  isActive: boolean;
  isAutoNote: boolean;
}
