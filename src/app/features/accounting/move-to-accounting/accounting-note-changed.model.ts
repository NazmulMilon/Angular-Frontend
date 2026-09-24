/** SignalR payload broadcast on the staff inbox group when a "🏷 Notes To Accounting" note is
 *  created or updated (see RFIJobOps.CustomModel.AccountingNoteChangedDto). */
export interface AccountingNoteChangedDto {
  jobKey: string;
  noteKey: string;
  /** "created" or "updated". */
  changeType: string;
}
