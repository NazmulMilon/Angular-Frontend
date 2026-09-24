/** Current button state for a job -- mirrors RFIJobOps.CustomModel.SendBackToServiceStateDto. */
export interface SendBackToServiceState {
  /** "none" (default button), "awaiting" (⏳ AWAITING AM), or "completed" (✓ RETURNED BY AM). */
  status: 'none' | 'awaiting' | 'completed';
  helperKey: string | null;
  invoiceKey: string | null;
  invoiceNo: number | null;
  reason: string | null;
  startedBy: string | null;
  startedByName: string | null;
  startedOn: string | null;
  responseByAttendee: string | null;
  attendedBy: string | null;
  attendedByName: string | null;
  attendedOn: string | null;
  hasEligibleInvoice: boolean;
  notes: SendBackToServiceNote[];
}

export interface SendBackToServiceNote {
  noteKey: string;
  comment: string | null;
  addedOn: string | null;
  addedBy: string | null;
  addedByName: string | null;
}

/** SignalR payload broadcast when a job's "Send Back to Service" state changes (see
 *  RFIJobOps.CustomModel.SendBackToServiceChangedDto). */
export interface SendBackToServiceChangedDto {
  jobKey: string;
  helperKey: string;
  /** "sent", "resolved" (AM sent it back), or "acknowledged". */
  changeType: string;
}

/** One row on the Account Manager's "Sent Back to Service" job-list page -- mirrors
 *  RFIJobOps.CustomModel.SentBackToServiceJobListItemDto. */
export interface SentBackToServiceJobListItem {
  jobKey: string;
  helperKey: string;
  po: string | null;
  jobName: string | null;
  customerName: string | null;
  reason: string;
  startedBy: string | null;
  startedByName: string | null;
  startedOn: string;
}
