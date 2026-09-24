import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { VendorPayableService } from '../../../features/accounting/move-to-accounting/vendor-payable.service';
import { VendorPayableNotificationService } from '../../../features/accounting/move-to-accounting/vendor-payable-notification.service';

/** "⚠ Override insurance block — {vendor}" confirmation popup, followed by an "✉ Flag emailed —
 *  CFO & Controller" as-sent preview popup on success -- mirrors complete-screen-v2.html's
 *  showInsOverrideModal()/applyInsOverride() two-popup sequence (PO 25819) exactly. This build's
 *  override is record-only (see JobBillInsuranceReduction) -- no reduce-toggle checkbox, since it
 *  never bakes a discount into the real invoice/bill total. The email-preview step renders the
 *  actual generated To/Subject/body text returned by RFIJobOps (from RFIEmailService), not a
 *  client-side reconstruction -- same principle as StoreManagerEmailPreviewModalComponent.
 *  Self-contained, same shape as AddVendorBillNoteModalComponent: injects its own services and
 *  calls the apply endpoint itself. */
@Component({
  selector: 'app-insurance-override-confirm-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './insurance-override-confirm-modal.component.html',
  styleUrl: './insurance-override-confirm-modal.component.scss',
})
export class InsuranceOverrideConfirmModalComponent {
  private readonly vendorPayableSvc = inject(VendorPayableService);
  private readonly notificationSvc = inject(VendorPayableNotificationService);

  isOpen = input(false);
  jobKey = input<string | null>(null);
  vendorKey = input<string | null>(null);
  vendorName = input<string | null>(null);
  problems = input<string[]>([]);

  readonly closed = output<void>();

  readonly step = signal<'confirm' | 'sent'>('confirm');
  readonly applying = signal(false);
  readonly errorMessage = signal('');

  readonly sentToDisplay = signal<string | null>(null);
  readonly sentSubject = signal<string | null>(null);
  readonly sentBodyPreview = signal<string | null>(null);

  /** Narrative summary line mirroring complete-screen-v2.html's showInsOverrideModal() copy
   *  ("Workers Comp is missing or expired for this vendor. General Liability is on file, so the
   *  bill CAN be paid with the standard deduction.") -- names whichever side(s) are actually bad
   *  AND, when only one side is bad, says the other is on file so the reader isn't left guessing
   *  about the side not mentioned in the problem list. */
  readonly summary = computed(() => {
    const problems = this.problems();
    const glBad = problems.some((p) => p.startsWith('General Liability'));
    const wcBad = problems.some((p) => p.startsWith('Workers Comp'));

    if (glBad && wcBad) {
      return 'General Liability and Workers Comp are both missing or expired for this vendor.';
    }
    if (wcBad) {
      return 'Workers Comp is missing or expired for this vendor. General Liability is on file, so the bill CAN be paid with the standard deduction.';
    }
    if (glBad) {
      return 'General Liability is missing or expired for this vendor. Workers Comp is on file, so the bill CAN be paid with the standard deduction.';
    }
    return '';
  });

  constructor() {
    effect(() => {
      if (!this.isOpen()) {
        this.step.set('confirm');
        this.errorMessage.set('');
      }
    });
  }

  onClose(): void {
    if (this.applying()) return;
    this.errorMessage.set('');
    this.closed.emit();
  }

  onOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.onClose();
  }

  apply(): void {
    const jobKey = this.jobKey();
    const vendorKey = this.vendorKey();
    if (!jobKey || !vendorKey) return;

    this.applying.set(true);
    this.errorMessage.set('');
    this.vendorPayableSvc.applyInsuranceOverride(jobKey, vendorKey).subscribe({
      next: (res) => {
        this.applying.set(false);
        if (res.status && res.data) {
          this.notificationSvc.refresh(jobKey);
          this.sentToDisplay.set(res.data.emailSentTo);
          this.sentSubject.set(res.data.emailSubject);
          this.sentBodyPreview.set(res.data.emailBodyPreviewText);
          this.step.set('sent');
        } else {
          this.errorMessage.set(res.message || 'Unable to apply the override.');
        }
      },
      error: (err) => {
        this.applying.set(false);
        this.errorMessage.set(err?.error?.message || 'Unable to apply the override.');
      },
    });
  }
}
