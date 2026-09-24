import { Component, inject, input, output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { VendorPayableService } from '../../../features/accounting/move-to-accounting/vendor-payable.service';
import { VendorPayableNotificationService } from '../../../features/accounting/move-to-accounting/vendor-payable-notification.service';
import { VendorPayableCard } from '../../../features/accounting/move-to-accounting/vendor-payable.model';

/**
 * "Approve Vendor(s) Payables" -- one card per vendor on the job (complete-screen-v2.html's
 * vendorHTML()/confirmVendor()). Reuses EQ2 readiness (blockers/green/open, unchanged) plus the
 * review checklist + decision actions this feature adds. Self-contained: injects its own
 * services and refreshes VendorPayableNotificationService directly after a successful action
 * (the shared SignalR listener also refreshes it for changes made elsewhere).
 */
@Component({
  selector: 'app-vendor-payable-card',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './vendor-payable-card.component.html',
  styleUrl: './vendor-payable-card.component.scss',
})
export class VendorPayableCardComponent {
  private readonly vendorPayableSvc = inject(VendorPayableService);
  private readonly notificationSvc = inject(VendorPayableNotificationService);

  jobKey = input.required<string>();
  card = input.required<VendorPayableCard>();

  readonly viewProfile = output<string>();
  readonly viewEstimate = output<string>();
  readonly addNote = output<{ vendorKey: string; vendorName: string | null }>();
  readonly openInvoiceEdit = output<string>();
  /** Bubbles up to the parent's shared "📞 Call & Verify Completion" modal (job-level data,
   *  not tracked per-vendor here) -- mirrors the mockup's step-chip 1 embedded on every vendor
   *  row, but this build has one shared completion-call action at the job level instead of
   *  duplicating its state per vendor. */
  readonly logCompletionCall = output<void>();
  /** "✓ Review check-out pics" -- opens the "📷 {Vendor} — Check-out Complete uploads" popup for
   *  this vendor (ports legacy ProjectRCS AccountingController's GetCompletionPhoto). Previously
   *  this step-chip wrongly called markReviewed('hours') + toggled the scope panel instead. */
  readonly viewCompletionPhotos = output<{ vendorKey: string; vendorName: string | null }>();
  /** "✍ Review sign-off" -- opens the "✍ Manager Sign-off — {Vendor}" popup for this vendor. */
  readonly viewSignOff = output<{ vendorKey: string; vendorName: string | null }>();
  /** "Check-in/out vs billed" -- opens the "⏱ Check-in / Out & Hours vs Billed — {Vendor}" popup.
   *  Previously this step-chip just toggled the hoursReviewed flag with no popup at all. */
  readonly viewHoursRecon = output<{ vendorKey: string; vendorName: string | null }>();
  /** "Vendor Insurance Validation" -- opens the "🛡 Vendor Insurance Validation — {Vendor}" popup.
   *  Previously this step-chip was read-only (no click handler, no popup at all). */
  readonly viewInsurance = output<{ vendorKey: string; vendorName: string | null }>();
  /** "⚠ Override insurance block…" -- opens the confirmation popup before actually applying the
   *  override (mirrors complete-screen-v2.html's showInsOverrideModal() gate -- this used to call
   *  ApplyInsuranceOverrideAsync directly with no confirmation step at all). */
  readonly openInsuranceOverrideConfirm = output<{ vendorKey: string; vendorName: string | null; problems: string[] }>();
  /** "↩ Send Back to Service" -- opens the JOB-LEVEL "Send Back to Account Manager" popup. Bubbles
   *  up rather than being handled here since the underlying request is job-level (shared across
   *  every vendor on the job), same as "🔁 Send Change Request to Account Manager". Replaces the
   *  previous disabled "Recall this vendor" placeholder. */
  readonly openSendBackToService = output<void>();
  /** Current job-level "Send Back to Service" state ('none' / 'awaiting' / 'completed'), shared
   *  across every vendor card on this job -- drives the button's label/disabled state. */
  sendBackToServiceStatus = input<'none' | 'awaiting' | 'completed'>('none');

  readonly scopeOpen = signal(false);
  readonly decisionChoice = signal<'payable-performed' | 'payable-cost-incurred' | 'remove' | ''>('');
  readonly costIncurredReasonInput = signal('');
  readonly removeReason = signal('');
  readonly removeSendEmail = signal(false);
  readonly qboTxnInput = signal('');

  readonly isSaving = signal(false);
  readonly errorMessage = signal('');
  readonly isRequestingInvoice = signal(false);

  /** Self-contained success toast (mirrors complete-screen-v2.html's toast()/.toast.green) --
   *  the only feedback for "Request Vendor Invoice" since, unlike every other action here, it
   *  doesn't change anything visible on the card itself (hasVendorInvoice doesn't flip until the
   *  vendor actually uploads one). */
  readonly toastMessage = signal('');
  private toastTimer?: ReturnType<typeof setTimeout>;

  /// <summary>"(up to $X)" shown inline in the "performed the service" dropdown option -- mirrors
  /// complete-screen-v2.html's confirmVendor()/option label, which always shows Revised Vendor
  /// DNE there (not the invoice total, even when one exists).</summary>
  readonly suggestedAmount = computed(() => this.card().revVendorDne ?? 0);

  onOpenProfile(): void {
    this.viewProfile.emit(this.card().vendorKey);
  }

  onOpenInvoiceEdit(): void {
    this.openInvoiceEdit.emit(this.card().vendorKey);
  }

  /** "⑤ Acknowledge cost" step chip -- mirrors complete-screen-v2.html's reviewCost() router:
   *  opens the vendor invoice editor when one exists, else the approved-estimate viewer, else
   *  just marks the step reviewed (nothing to show yet). */
  onAcknowledgeCost(): void {
    this.markReviewed('cost');
    if (this.card().hasVendorInvoice) this.onOpenInvoiceEdit();
    else if (this.card().hasApprovedEstimate) this.onOpenEstimate();
  }

  onOpenEstimate(): void {
    this.viewEstimate.emit(this.card().vendorKey);
  }

  onOpenAddNote(): void {
    this.addNote.emit({ vendorKey: this.card().vendorKey, vendorName: this.card().vendorName });
  }

  onOpenSendBackToService(): void {
    this.openSendBackToService.emit();
  }

  onViewCompletionPhotos(): void {
    this.viewCompletionPhotos.emit({ vendorKey: this.card().vendorKey, vendorName: this.card().vendorName });
  }

  onViewSignOff(): void {
    this.viewSignOff.emit({ vendorKey: this.card().vendorKey, vendorName: this.card().vendorName });
  }

  /** "Check-in/out vs billed" step chip -- mirrors the mockup's showHoursRecon(), which marks the
   *  step reviewed the moment the popup is opened (regardless of what's done inside it). */
  onViewHoursRecon(): void {
    if (!this.card().hoursReviewed) this.markReviewed('hours');
    this.viewHoursRecon.emit({ vendorKey: this.card().vendorKey, vendorName: this.card().vendorName });
  }

  /** "Check-in/out vs billed" step-chip subtitle -- mirrors complete-screen-v2.html's timeSub
   *  exactly: shows the billed-vs-onsite mismatch (>0.1 hrs either direction) when there is one,
   *  otherwise the plain on-site total; "no records" when there are no check-ins at all. Waiver
   *  takes priority since it supersedes the mismatch entirely (nothing left to reconcile). */
  get hoursSubLabel(): string {
    const c = this.card();
    if (c.checkInWaived) return 'check-in waived';
    if (!c.hasCheckIns) return '⚠ no records';
    const diff = c.hoursBilled - c.hoursOnsite;
    if (Math.abs(diff) > 0.1) {
      return `⚠ billed ${c.hoursBilled.toFixed(2)} vs on-site ${c.hoursOnsite.toFixed(2)} hrs`;
    }
    return `${c.hoursOnsite.toFixed(2)} hrs on-site`;
  }

  /** Warn-styled (amber) subtitle -- true on a mismatch or missing records, same as the mockup's
   *  `warn:(!!hm || !v.checkins.length)`. Independent of the chip's own green/waived state: a
   *  reviewed (green) chip can still show this warning text underneath it. */
  get hoursSubWarn(): boolean {
    const c = this.card();
    if (c.checkInWaived) return false;
    if (!c.hasCheckIns) return true;
    return Math.abs(c.hoursBilled - c.hoursOnsite) > 0.1;
  }

  onViewInsurance(): void {
    this.viewInsurance.emit({ vendorKey: this.card().vendorKey, vendorName: this.card().vendorName });
  }

  /** "Vendor Insurance Validation" step-chip subtitle -- mirrors the mockup's soSub-shaped logic:
   *  "verified · GL {date} · W/C {date}" when clean, else the first problem (+N more). */
  get insuranceSubLabel(): string {
    const c = this.card();
    if (c.insuranceOk) {
      const gl = c.glExpiry ? this.formatDate(c.glExpiry) : 'n/r';
      const wc = c.wcExpiry ? this.formatDate(c.wcExpiry) : 'n/r';
      return `verified · GL ${gl} · W/C ${wc}`;
    }
    const problems = c.insuranceProblems ?? [];
    if (!problems.length) return '⚠ missing/expired';
    return `⚠ ${problems[0]}${problems.length > 1 ? ' +' + (problems.length - 1) : ''}`;
  }

  private formatDate(value: string | null): string {
    if (!value) return '--';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
  }

  /** "Revised Vendor DNE" box amount -- mirrors complete-screen-v2.html's vendorHTML() exactly:
   *  strike-through the amount this figure was revised FROM, then the current figure. Two
   *  possible causes of a revision in this app (the mockup's demo data only models one): an
   *  approved estimate/on-site-approval changing JobVendor.RevVendorDNE away from VendorDNE, OR
   *  an active Workers-Comp insurance override further reducing that revised figure (tracked
   *  separately in JobVendorInsuranceOverride, since RevVendorDNE itself is never overwritten by
   *  the override). The override, when active, is the more current "before/after" pair. */
  get dneDisplay(): { struck: number | null; amount: number } {
    const c = this.card();
    const ov = c.insuranceOverride;
    if (ov) {
      return { struck: ov.originalAmount, amount: ov.reducedAmount };
    }
    const revised = c.revVendorDne ?? 0;
    if (c.dne !== null && c.dne !== revised) {
      return { struck: c.dne, amount: revised };
    }
    return { struck: null, amount: revised };
  }

  toggleScope(): void {
    this.scopeOpen.set(!this.scopeOpen());
  }

  markReviewed(step: 'hours' | 'cost' | 'scope'): void {
    this.vendorPayableSvc.markReviewed(this.jobKey(), this.card().vendorKey, step).subscribe({
      next: () => this.notificationSvc.refresh(this.jobKey()),
    });
  }

  get reviewsDone(): boolean {
    const c = this.card();
    return c.hoursReviewed && c.costReviewed && c.scopeReviewed && c.afterPhotoVerified && c.signOffVerified;
  }

  get canPickPayable(): boolean {
    return this.reviewsDone && this.card().insuranceOk;
  }

  onDecisionChange(): void {
    this.errorMessage.set('');
  }

  onOpenInsuranceOverrideConfirm(): void {
    this.openInsuranceOverrideConfirm.emit({
      vendorKey: this.card().vendorKey,
      vendorName: this.card().vendorName,
      problems: this.card().insuranceProblems,
    });
  }

  undoInsuranceOverride(): void {
    this.isSaving.set(true);
    this.errorMessage.set('');
    this.vendorPayableSvc.undoInsuranceOverride(this.jobKey(), this.card().vendorKey).subscribe({
      next: (res) => {
        this.isSaving.set(false);
        if (res.status) {
          this.notificationSvc.refresh(this.jobKey());
        } else {
          this.errorMessage.set(res.message || 'Unable to undo the override.');
        }
      },
      error: () => {
        this.isSaving.set(false);
        this.errorMessage.set('Unable to undo the override.');
      },
    });
  }

  confirmApprove(): void {
    const decision = this.decisionChoice();
    if (decision !== 'payable-performed' && decision !== 'payable-cost-incurred') return;
    if (decision === 'payable-cost-incurred' && !this.costIncurredReasonInput().trim()) {
      this.errorMessage.set('A written reason is required for Cost Incurred.');
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set('');
    this.vendorPayableSvc
      .approve(this.jobKey(), this.card().vendorKey, decision, this.costIncurredReasonInput().trim() || undefined)
      .subscribe({
        next: (res) => {
          this.isSaving.set(false);
          if (res.status) {
            this.decisionChoice.set('');
            this.notificationSvc.refresh(this.jobKey());
          } else {
            this.errorMessage.set(res.message || 'Unable to approve this vendor.');
          }
        },
        error: () => {
          this.isSaving.set(false);
          this.errorMessage.set('Unable to approve this vendor.');
        },
      });
  }

  cancelRemove(): void {
    this.decisionChoice.set('');
    this.removeReason.set('');
    this.removeSendEmail.set(false);
    this.errorMessage.set('');
  }

  confirmRemove(): void {
    const reason = this.removeReason().trim();
    if (!reason) {
      this.errorMessage.set('A reason is required to set this vendor Non-Payable.');
      return;
    }
    this.isSaving.set(true);
    this.errorMessage.set('');
    this.vendorPayableSvc
      .remove(this.jobKey(), this.card().vendorKey, {
        reason,
        sendCancellationEmail: this.removeSendEmail(),
      })
      .subscribe({
        next: (res) => {
          this.isSaving.set(false);
          if (res.status) {
            this.decisionChoice.set('');
            this.notificationSvc.refresh(this.jobKey());
          } else {
            this.errorMessage.set(res.message || 'Unable to remove this vendor.');
          }
        },
        error: () => {
          this.isSaving.set(false);
          this.errorMessage.set('Unable to remove this vendor.');
        },
      });
  }

  undo(): void {
    this.isSaving.set(true);
    this.vendorPayableSvc.undo(this.jobKey(), this.card().vendorKey).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.notificationSvc.refresh(this.jobKey());
      },
      error: () => this.isSaving.set(false),
    });
  }

  requestInvoice(): void {
    this.isRequestingInvoice.set(true);
    this.errorMessage.set('');
    this.vendorPayableSvc.requestInvoice(this.jobKey(), this.card().vendorKey).subscribe({
      next: (res) => {
        this.isRequestingInvoice.set(false);
        if (res.status) {
          this.showToast('✉ Invoice request sent to ' + (this.card().vendorName || 'the vendor') + '.');
          this.notificationSvc.refresh(this.jobKey());
        } else {
          this.errorMessage.set(res.message || 'Unable to send the invoice request.');
        }
      },
      error: (err) => {
        this.isRequestingInvoice.set(false);
        this.errorMessage.set(err?.error?.message || 'Unable to send the invoice request.');
      },
    });
  }

  private showToast(message: string): void {
    this.toastMessage.set(message);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastMessage.set(''), 3200);
  }

  saveQboEntry(): void {
    const txn = this.qboTxnInput().trim();
    if (!txn) return;
    this.isSaving.set(true);
    this.errorMessage.set('');
    this.vendorPayableSvc.saveQboEntry(this.jobKey(), this.card().vendorKey, txn).subscribe({
      next: (res) => {
        this.isSaving.set(false);
        if (res.status) {
          this.qboTxnInput.set('');
          this.notificationSvc.refresh(this.jobKey());
        } else {
          this.errorMessage.set(res.message || 'Unable to save.');
        }
      },
      error: () => {
        this.isSaving.set(false);
        this.errorMessage.set('Unable to save.');
      },
    });
  }

  formatDateTime(value: string | null): string {
    if (!value) return '--';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
  }

  formatMoney(value: number | null): string {
    if (value === null || value === undefined) return '--';
    return value.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
  }

  initials(name: string | null | undefined): string {
    return (name || '?')
      .trim()
      .split(/\s+/)
      .filter((w) => w.length)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }
}
