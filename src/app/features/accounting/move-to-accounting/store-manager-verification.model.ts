/** One answered question for the "🔗 Landing page" popup -- mirrors
 *  RFIJobOps.CustomModel.StoreManagerVerificationAnswerDto. */
export interface StoreManagerVerificationAnswer {
  displayLabel: string | null;
  /** 1-2 = 1-5 star rating, 3 = Yes/No/Not sure, 4 = Yes/Partially/No, 5 = free-text comment.
   *  Null for responses captured before this link existed -- render as a plain label/answer pair. */
  displayLevel: number | null;
  score: number | null;
  answer: string | null;
}

/** "✉ Store Manager Verification — Email" JOB-LEVEL bar state -- mirrors
 *  RFIJobOps.CustomModel.StoreManagerVerificationStateDto. */
export interface StoreManagerVerificationState {
  sent: boolean;
  sentTo: string | null;
  sentAt: string | null;
  sentCount: number;
  notSentReason: string | null;
  responded: boolean;
  responseDate: string | null;
  storeManagerName: string | null;
  remark: string | null;
  answers: StoreManagerVerificationAnswer[];
  /** Constant header fields (shown regardless of send/response state). */
  po: string | null;
  locationName: string | null;
  serviceRequest: string | null;
  locationPhone: string | null;
  /** True when there is a pending (sent, not yet responded) survey this popup can actually submit
   *  a real response against. */
  canSubmit: boolean;
}

/** Lean preview (subject + scope-of-work only) for the "👁 View email (full scope)" popup --
 *  mirrors RFIJobOps.CustomModel.StoreManagerEmailPreviewDto. */
export interface StoreManagerEmailPreview {
  subject: string | null;
  scopeOfWorkHtml: string | null;
}

/** Body for POST .../store-manager-verification/submit -- mirrors
 *  RFIJobOps.CustomModel.SubmitStoreManagerSurveyRequest. */
export interface SubmitStoreManagerSurveyRequest {
  storeManagerName: string;
  generalRemarks: string | null;
  answers: SubmitStoreManagerSurveyAnswer[];
}

export interface SubmitStoreManagerSurveyAnswer {
  scoreCardResponseKey: string;
  rating: number | null;
  answer: string | null;
}

/** SignalR payload broadcast on the staff inbox group when a job's store-manager-verification
 *  state changes (see RFIJobOps.CustomModel.StoreManagerVerificationChangedDto). */
export interface StoreManagerVerificationChangedDto {
  jobKey: string;
  surveyKey: string;
  /** "sent" or "responded". */
  changeType: string;
}
