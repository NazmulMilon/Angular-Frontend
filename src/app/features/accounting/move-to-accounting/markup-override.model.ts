/** "Below Minimum Mark-up Target" QC Manager override state -- mirrors
 *  RFIJobOps.CustomModel.MarkupOverrideStateDto. */
export interface MarkupOverrideState {
  status: 'None' | 'Pending' | 'Approved' | 'Rejected';
  overrideKey: string | null;
  requestedByName: string | null;
  requestedOn: string | null;
  markupPercentAtRequest: number | null;
  minMarkupTargetAtRequest: number | null;
  decidedByName: string | null;
  decidedOn: string | null;
  decisionNote: string | null;
}
