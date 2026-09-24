/** "EQ1 · Customer invoice → QB + send" readiness checklist for a job's active customer invoice --
 *  mirrors RFIJobOps.CustomModel.Eq1ReadinessDto. */
export interface Eq1Readiness {
  hasInvoice: boolean;
  invoiceKey: string | null;
  /** "blocked" if any blockers are present, else "ready". */
  level: 'blocked' | 'ready';
  /** Hard blockers -- ⛔ red. */
  blockers: string[];
  /** Passed checks -- ✓ green. */
  green: string[];
  /** Informational, non-blocking notes -- gray. */
  open: string[];
}
