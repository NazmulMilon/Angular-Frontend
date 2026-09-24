/** One selectable invoice for the "🔁 Send Change Request" popup's invoice picker
 *  (hidden entirely when the job has only one eligible invoice). */
export interface ChangeRequestInvoiceOption {
  invoiceKey: string;
  invoiceNo: number | null;
}

/** Current button/popup state for a job -- mirrors RFIJobOps.CustomModel.ChangeRequestStateDto. */
export interface ChangeRequestState {
  /** "none" (default button), "awaiting" (⏳ AWAITING AM), or "completed" (✓ CHANGE COMPLETED BY AM). */
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
  /** Whether the job has any eligible invoice at all -- drives the button's disabled state when "none". */
  hasEligibleInvoice: boolean;
  /** AdminActionNotes rows for this job with FeatureID = 1, oldest first. Once the AM has
   *  completed the fix (status === 'completed'), the popup renders from THIS instead of the
   *  JobSalesInvoiceHelper-derived fields above. */
  notes: ChangeRequestNote[];
}

/** One AdminActionNotes row (FeatureID = 1) for the change-request popup's note trail. */
export interface ChangeRequestNote {
  noteKey: string;
  comment: string | null;
  addedOn: string | null;
  addedBy: string | null;
  addedByName: string | null;
}

/** SignalR payload broadcast on the staff inbox group when a job's change-request state changes
 *  (see RFIJobOps.CustomModel.ChangeRequestChangedDto). */
export interface ChangeRequestChangedDto {
  jobKey: string;
  helperKey: string;
  /** "sent", "attended" (AM completed the fix), or "acknowledged". */
  changeType: string;
}
