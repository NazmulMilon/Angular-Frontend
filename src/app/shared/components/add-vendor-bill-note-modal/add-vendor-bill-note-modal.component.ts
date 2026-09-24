import { Component, effect, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { VendorPayableService } from '../../../features/accounting/move-to-accounting/vendor-payable.service';
import { VendorPayableNotificationService } from '../../../features/accounting/move-to-accounting/vendor-payable-notification.service';
import { VendorBillNote } from '../../../features/accounting/move-to-accounting/vendor-payable.model';

/** "🏷 Add note about this vendor bill to Accounting — {vendor}" -- mirrors
 *  complete-screen-v2.html's addVendorAcctNote()/saveVendorAcctNote() exactly for copy/chrome,
 *  plus (per Nahid, 2026-09-09) a list of every existing FeatureID=3 note for the job below the
 *  textarea -- that part isn't in the mockup's own popup, it's this feature's own addition. */
@Component({
  selector: 'app-add-vendor-bill-note-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './add-vendor-bill-note-modal.component.html',
  styleUrl: './add-vendor-bill-note-modal.component.scss',
})
export class AddVendorBillNoteModalComponent {
  private readonly vendorPayableSvc = inject(VendorPayableService);
  private readonly notificationSvc = inject(VendorPayableNotificationService);

  isOpen = input(false);
  jobKey = input<string | null>(null);
  vendorKey = input<string | null>(null);
  vendorName = input<string | null>(null);

  readonly closed = output<void>();

  readonly noteText = signal('');
  readonly notes = signal<VendorBillNote[]>([]);
  readonly loadingNotes = signal(false);
  readonly saving = signal(false);
  readonly errorMessage = signal('');

  constructor() {
    effect(() => {
      if (this.isOpen() && this.jobKey() && this.vendorKey()) this.loadNotes();
    });
  }

  private loadNotes(): void {
    const jobKey = this.jobKey();
    const vendorKey = this.vendorKey();
    if (!jobKey || !vendorKey) return;
    this.loadingNotes.set(true);
    this.vendorPayableSvc.getVendorBillNotes(jobKey, vendorKey).subscribe({
      next: (notes) => {
        this.loadingNotes.set(false);
        this.notes.set(notes);
      },
      error: () => this.loadingNotes.set(false),
    });
  }

  onClose(): void {
    this.noteText.set('');
    this.errorMessage.set('');
    this.closed.emit();
  }

  onOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.onClose();
  }

  save(): void {
    const jobKey = this.jobKey();
    const vendorKey = this.vendorKey();
    const text = this.noteText().trim();
    if (!text) {
      this.errorMessage.set('Type a note first.');
      return;
    }
    if (!jobKey || !vendorKey) return;

    this.saving.set(true);
    this.errorMessage.set('');
    this.vendorPayableSvc.addVendorBillNote(jobKey, vendorKey, text).subscribe({
      next: (res) => {
        this.saving.set(false);
        if (res.status) {
          this.noteText.set('');
          this.loadNotes();
          if (jobKey) this.notificationSvc.refresh(jobKey);
        } else {
          this.errorMessage.set(res.message || 'Unable to add the note.');
        }
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMessage.set(err?.error?.message || 'Unable to add the note.');
      },
    });
  }

  formatDateTime(value: string | null): string {
    if (!value) return '--';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
  }
}
