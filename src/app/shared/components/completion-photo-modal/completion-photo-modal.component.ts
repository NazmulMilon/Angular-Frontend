import { Component, effect, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { VendorPayableService } from '../../../features/accounting/move-to-accounting/vendor-payable.service';
import { CompletionPhotoState } from '../../../features/accounting/move-to-accounting/vendor-payable.model';

/** "📷 {Vendor} — Check-out Complete uploads" -- ports legacy ProjectRCS AccountingController's
 *  GetCompletionPhoto/ApproveCompletionPhoto/RejectCompletionPhoto. Shows every completion photo
 *  on file for this job+vendor (not scoped to one checkout, matching legacy) and lets an admin
 *  bulk-approve or bulk-reject whatever is currently awaiting review (Verified IS NULL AND
 *  ApprovedDate IS NULL). Rejecting keeps the rows (Verified=false) as an audit trail instead of
 *  deleting them like legacy did, and emails the vendor to resubmit. */
@Component({
  selector: 'app-completion-photo-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './completion-photo-modal.component.html',
  styleUrl: './completion-photo-modal.component.scss',
})
export class CompletionPhotoModalComponent {
  private readonly vendorPayableSvc = inject(VendorPayableService);

  isOpen = input(false);
  jobKey = input<string | null>(null);
  vendorKey = input<string | null>(null);
  vendorName = input<string | null>(null);

  readonly closed = output<void>();
  /** Emitted after a successful approve/reject so the host can refresh the vendor-payable card. */
  readonly changed = output<void>();

  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');
  readonly isSaving = signal(false);
  readonly state = signal<CompletionPhotoState | null>(null);

  /** "Optional note to the vendor — what is missing or insufficient?" (mirrors
   *  complete-screen-v2.html's markPicsInsufficient() prompt() default text). Sent with Reject and
   *  shown near the top of the resubmit email. */
  readonly rejectNote = signal(
    'Photos do not show the completed work described in the scope. Please re-take and submit ' +
      'updated photos that match the scope of work and clearly show a satisfactory completion.',
  );

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
    this.vendorPayableSvc.getCompletionPhotos(jobKey, vendorKey).subscribe({
      next: (res) => {
        this.loading.set(false);
        if (res.status) {
          this.state.set(res.data);
        } else {
          this.errorMessage.set(res.message || 'Unable to load completion photos.');
        }
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('Unable to load completion photos.');
      },
    });
  }

  get pendingCount(): number {
    return this.state()?.pendingReviewCount ?? 0;
  }

  approve(): void {
    const jobKey = this.jobKey();
    const vendorKey = this.vendorKey();
    if (!jobKey || !vendorKey || this.pendingCount === 0) return;

    this.isSaving.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');
    this.vendorPayableSvc.approveCompletionPhotos(jobKey, vendorKey).subscribe({
      next: (res) => {
        this.isSaving.set(false);
        if (res.status) {
          this.state.set(res.data);
          this.successMessage.set(res.message || 'Completion photos approved.');
          this.changed.emit();
        } else {
          this.errorMessage.set(res.message || 'Unable to approve the completion photos.');
        }
      },
      error: () => {
        this.isSaving.set(false);
        this.errorMessage.set('Unable to approve the completion photos.');
      },
    });
  }

  reject(): void {
    const jobKey = this.jobKey();
    const vendorKey = this.vendorKey();
    if (!jobKey || !vendorKey || this.pendingCount === 0) return;

    this.isSaving.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');
    this.vendorPayableSvc.rejectCompletionPhotos(jobKey, vendorKey, this.rejectNote().trim()).subscribe({
      next: (res) => {
        this.isSaving.set(false);
        if (res.status) {
          this.state.set(res.data);
          this.successMessage.set(res.message || 'Completion photos rejected.');
          this.changed.emit();
        } else {
          this.errorMessage.set(res.message || 'Unable to reject the completion photos.');
        }
      },
      error: () => {
        this.isSaving.set(false);
        this.errorMessage.set('Unable to reject the completion photos.');
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
    if (verified === true) return '✓ Approved';
    if (verified === false) return '✕ Rejected';
    return '⏳ Awaiting review';
  }

  isImage(fileType: string | null, fileName: string | null): boolean {
    const t = (fileType || '').toLowerCase();
    if (t.startsWith('image/')) return true;
    const ext = (fileName || '').split('.').pop()?.toLowerCase() || '';
    return ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext);
  }
}
