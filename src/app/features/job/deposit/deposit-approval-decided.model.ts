/** SignalR payload broadcast on the staff inbox group when a deposit approval is decided. */
export interface DepositApprovalDecidedDto {
  jobKey: string;
  depositApprovalFromSvCmanagerKey: string;
  customerEstimateKey: string | null;
  isApproved: boolean | null;
}
