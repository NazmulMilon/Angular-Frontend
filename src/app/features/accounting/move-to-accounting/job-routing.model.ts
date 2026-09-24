/** Current "Send back to Service" / "Send back to Accounting" routing state for one job, as shown
 *  on the Move to Accounting job list -- mirrors RFIJobOps.CustomModel.JobRoutingStatusDto. */
export interface JobRoutingStatus {
  jobKey: string;
  /** "none" (no open routing entry), "with-service" (away with a CAS/AM, not yet returned), or
   *  "returned" (back with Accounting, not yet acknowledged). */
  status: 'none' | 'with-service' | 'returned';
  helperKey: string | null;
  withPersonnelKey: string | null;
  withPersonName: string | null;
  sentOn: string | null;
  reason: string | null;
  sourceContext: string | null;
}

/** SignalR payload broadcast on the staff inbox group when a job's JobRoutingLog state changes --
 *  mirrors RFIJobOps.CustomModel.JobRoutingChangedDto. */
export interface JobRoutingChangedDto {
  jobKey: string;
  pKey: string;
  /** "sent-to-service", "returned", or "acknowledged". */
  changeType: string;
}
