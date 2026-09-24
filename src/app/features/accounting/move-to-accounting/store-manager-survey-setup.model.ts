/** One configured question row from ScorecardStoreManagerResponseSetup -- mirrors
 *  RFIJobOps.CustomModel.ScorecardStoreManagerResponseSetupItemDto. Used to render a read-only
 *  preview of the real store-manager survey form (RCS_app's ScorecardLocationManagerSurveyController
 *  Index.cshtml) inside the "🔗 Landing page" popup, for jobs that have no captured response yet. */
export interface StoreManagerSurveyQuestionSetup {
  scoreCardResponseKey: string;
  reasonCode: string;
  displayLabel: string;
  /** 1-2 = 1-5 star rating, 3 = Yes/No/Not sure, 4 = Yes/Partially/No, 5 = free-text comment. */
  displayLevel: number | null;
}
