/** "📄 View Estimate (approved to proceed)" popup -- mirrors
 *  RFIJobOps.CustomModel.VendorApprovedEstimateDto (view-only). */
export interface VendorApprovedEstimate {
  estimateKey: string;
  vendorName: string | null;
  isOnsiteApproval: boolean;
  approvedOn: string | null;
  approvedBy: string | null;
  lines: VendorApprovedEstimateLine[];
  total: number;
}

export interface VendorApprovedEstimateLine {
  description: string;
  rate: number;
  qty: number;
  rowTotal: number;
}
