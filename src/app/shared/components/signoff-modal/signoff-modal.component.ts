import { Component, effect, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { VendorPayableService } from '../../../features/accounting/move-to-accounting/vendor-payable.service';
import { SignOffState } from '../../../features/accounting/move-to-accounting/vendor-payable.model';

/** "✍ Manager Sign-off — {Vendor}" -- ports complete-screen-v2.html's showSignoff() exactly.
 *  Shows the captured signature/sheet, typed name, and comments (flagging negative sentiment
 *  read-only, never blocking), then lets an admin Accept or Reject whatever's currently awaiting
 *  review across both sign-off document types (signature thumbnail + generated PDF sheet).
 *  Rejecting emails the vendor to resubmit (RFIEmailService's ResubmitYourSignoffSheetAsync) and
 *  keeps the rejected rows (Verified=false) as an audit trail rather than deleting them, matching
 *  the completion-photo feature's design. */
@Component({
  selector: 'app-signoff-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './signoff-modal.component.html',
  styleUrl: './signoff-modal.component.scss',
})
export class SignoffModalComponent {
  private readonly vendorPayableSvc = inject(VendorPayableService);

  isOpen = input(false);
  jobKey = input<string | null>(null);
  vendorKey = input<string | null>(null);
  vendorName = input<string | null>(null);

  readonly closed = output<void>();
  /** Emitted after a successful accept/reject so the host can refresh the vendor-payable card. */
  readonly changed = output<void>();

  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');
  readonly isSaving = signal(false);
  readonly state = signal<SignOffState | null>(null);

  /** Required only for Reject (mirrors the mockup's rejectSignoff() toast-if-empty rule); optional
   *  for Accept. */
  readonly comment = signal('');

  private lastLoadedKey: string | null = null;

  constructor() {
    effect(() => {
      const open = this.isOpen();
      const jobKey = this.jobKey();
      const vendorKey = this.vendorKey();
      const key = jobKey && vendorKey ? `${jobKey}|${vendorKey}` : null;

      if (!open) {
        this.lastLoadedKey = null;
        return;
      }
      if (!key || key === this.lastLoadedKey) return;

      this.lastLoadedKey = key;
      this.comment.set('');
      this.load();
    });
  }

  private load(): void {
    const jobKey = this.jobKey();
    const vendorKey = this.vendorKey();
    if (!jobKey || !vendorKey) return;

    this.loading.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');
    this.vendorPayableSvc.getSignOffState(jobKey, vendorKey).subscribe({
      next: (res) => {
        this.loading.set(false);
        if (res.status) {
          this.state.set(res.data);
        } else {
          this.errorMessage.set(res.message || 'Unable to load the sign-off sheet.');
        }
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('Unable to load the sign-off sheet.');
      },
    });
  }

  get pendingCount(): number {
    return this.state()?.pendingReviewCount ?? 0;
  }

  accept(): void {
    const jobKey = this.jobKey();
    const vendorKey = this.vendorKey();
    if (!jobKey || !vendorKey || this.pendingCount === 0) return;

    this.isSaving.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');
    this.vendorPayableSvc.approveSignOff(jobKey, vendorKey).subscribe({
      next: (res) => {
        this.isSaving.set(false);
        if (res.status) {
          this.state.set(res.data);
          this.successMessage.set(res.message || 'Sign-off accepted.');
          this.changed.emit();
        } else {
          this.errorMessage.set(res.message || 'Unable to accept the sign-off.');
        }
      },
      error: () => {
        this.isSaving.set(false);
        this.errorMessage.set('Unable to accept the sign-off.');
      },
    });
  }

  reject(): void {
    const jobKey = this.jobKey();
    const vendorKey = this.vendorKey();
    if (!jobKey || !vendorKey || this.pendingCount === 0) return;
    if (!this.comment().trim()) {
      this.errorMessage.set('Enter a reason so the vendor knows what to fix.');
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');
    this.vendorPayableSvc.rejectSignOff(jobKey, vendorKey, this.comment().trim()).subscribe({
      next: (res) => {
        this.isSaving.set(false);
        if (res.status) {
          this.state.set(res.data);
          this.successMessage.set(res.message || 'Sign-off rejected.');
          this.changed.emit();
        } else {
          this.errorMessage.set(res.message || 'Unable to reject the sign-off.');
        }
      },
      error: () => {
        this.isSaving.set(false);
        this.errorMessage.set('Unable to reject the sign-off.');
      },
    });
  }

  onClose(): void {
    this.closed.emit();
  }

  onOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.onClose();
  }

  statusLabel(verified: boolean | null): string {
    if (verified === true) return '✓ Accepted';
    if (verified === false) return '✕ Rejected';
    return '⏳ Awaiting review';
  }
}
