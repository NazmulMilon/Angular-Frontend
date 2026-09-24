/** Current values of the "Complete -> Move to Accounting" EQ1/EQ2 readiness thresholds --
 *  mirrors RFIJobOps.CustomModel.RuleThresholdForCustomerInvoiceDto. There is exactly one live
 *  row in dbo.RuleThresholdForCustomerInvoice; the backend always returns that single row
 *  (auto-creating a default one if the table is ever empty). Read-only here -- editing stays in
 *  Admin Portal V1's Setup > Rule Threshold For Customer Invoice screen (confirmed with Nahid
 *  2026-09-06). */
export interface RuleThresholdForCustomerInvoice {
  pKey: string;

  glMissingOverrideAllowed: boolean;
  glMissingDeductionPercent: number;
  glExpiredOverrideAllowed: boolean;
  glExpiredDeductionPercent: number;

  wcompMissingOverrideAllowed: boolean;
  wcompMissingDeductionPercent: number;
  wcompExpiredOverrideAllowed: boolean;
  wcompExpiredDeductionPercent: number;

  /** Integer count of AI bot-call attempts. */
  aiBotCallValue: number;
  /** Unit the attempt count is measured per: 1 = Day, 2 = Hour. */
  aiBotCallDayHour: number;
  /** Store-local time of day, "HH:mm" (24-hour). */
  botCallWindowStartLocal: string | null;
  /** Store-local time of day, "HH:mm" (24-hour). */
  botCallWindowEndLocal: string | null;
  botCallEscalateAfterBusinessDays: number;

  minAfterPhotosRequired: number;
  /** Whole percentage (e.g. 90 = 90%). */
  afterPhotoAutoVerifyConfidencePercent: number;
  /** Whole percentage (e.g. 60 = 60%). */
  afterPhotoHumanQueueLowerBoundPercent: number;

  /** Whole percentage (e.g. 10 = 10%). */
  hoursTolerancePercent: number;
  hoursToleranceMinHours: number;

  invoiceContentAgentEnabled: boolean;

  agentGraduationConsecutiveMatches: number;
  agentGraduationSampleSize: number;
  /** Whole percentage (e.g. 98 = 98%). */
  agentGraduationAgreementPercent: number;

  /** AI Agents Mode for this screen: 0 = OFF, 1 = SHADOW, 2 = AUTO. */
  pageLevelAgentMode: number;
}
