import { Component, input, output, signal, computed, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AdminVendorContactForEstimate } from '../../../../models/vendor-bills.model';

export interface VendorApprovalSubmitEvent {
  sendToVendor: boolean;
  approvalText: string;
  recipientEmails: string[];
}

/**
 * Additional Approval modal (legacy #frmAdditionalApprovalToVendor parity). Rendered
 * by the parent (gated on an `@if`) once SetVendorEstimateToApproved succeeds and
 * requires additional approval — this component is only ever in the DOM while it
 * should be visible, so it has no visibility state of its own. Purely presentational
 * — the parent owns the SaveVendorApprovalData / SendWorkOrderEmail orchestration.
 */
@Component({
  selector: 'app-estimate-approval-panel',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './estimate-approval-panel.component.html',
  styleUrl: './estimate-approval-panel.component.scss',
})
export class EstimateApprovalPanelComponent {
  estimateKey = input.required<string>();
  vendorContacts = input<AdminVendorContactForEstimate[]>([]);
  submitting = input(false);
  errorMessage = input('');
  infoMessage = input('');

  close = output<void>();
  submit = output<VendorApprovalSubmitEvent>();

  sendToVendor = signal(true);
  approvalText = signal('');
  selectedRecipients = signal<string[]>([]);

  canSubmit = computed(() => {
    if (this.submitting()) return false;
    if (this.sendToVendor() && this.selectedRecipients().length === 0) return false;
    return true;
  });

  constructor() {
    effect(() => {
      const defaults = this.vendorContacts()
        .filter((c) => c.preSelected || c.isDefault)
        .map((c) => c.email);
      this.selectedRecipients.set(defaults.length ? defaults : this.vendorContacts().map((c) => c.email).slice(0, 1));
    });
  }

  selectSendToVendor(sendToVendor: boolean): void {
    this.sendToVendor.set(sendToVendor);
  }

  isRecipientSelected(email: string): boolean {
    return this.selectedRecipients().includes(email);
  }

  toggleRecipient(email: string, checked: boolean): void {
    const current = this.selectedRecipients();
    if (checked) {
      if (!current.includes(email)) this.selectedRecipients.set([...current, email]);
    } else {
      this.selectedRecipients.set(current.filter((e) => e !== email));
    }
  }

  onSubmit(): void {
    if (!this.canSubmit()) return;
    this.submit.emit({
      sendToVendor: this.sendToVendor(),
      approvalText: this.approvalText().trim(),
      recipientEmails: this.sendToVendor() ? this.selectedRecipients() : [],
    });
  }

  onClose(): void {
    this.close.emit();
  }
}
