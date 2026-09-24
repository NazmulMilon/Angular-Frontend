import { Component, effect, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ChangeRequestService } from '../../../features/accounting/move-to-accounting/change-request.service';
import { ChangeRequestInvoiceOption } from '../../../features/accounting/move-to-accounting/change-request.model';

/**
 * "🔁 Send Change Request to Account Manager" JOB-LEVEL popup -- the FIRST of two popups this
 * button can show, per complete-screen-v2.html's showChangeReq()/sendChangeReq(). Shown only when
 * there is no active (unacknowledged) change request on the job yet.
 *
 * Invoice picker: hidden entirely when the job has exactly one eligible customer invoice (the
 * backend auto-selects it); shown as a radio list when there's more than one. Reason is always
 * required -- matches the prototype's `if(!reason){ toast(...); return; }` guard.
 */
@Component({
  selector: 'app-send-change-request-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './send-change-request-modal.component.html',
  styleUrl: './send-change-request-modal.component.scss',
})
export class SendChangeRequestModalComponent {
  private readonly changeRequestSvc = inject(ChangeRequestService);

  isOpen = input(false);
  jobKey = input<string | null>(null);
  po = input<string | null>(null);

  readonly closed = output<void>();
  /** Emitted after a successful send so the host can refresh the trigger button's state. */
  readonly sent = output<void>();

  readonly invoices = signal<ChangeRequestInvoiceOption[]>([]);
  readonly isLoadingInvoices = signal(false);
  readonly selectedInvoiceKey = signal<string | null>(null);
  readonly reason = signal('');
  readonly isSending = signal(false);
  readonly errorMessage = signal('');

  private lastLoadedJobKey: string | null = null;

  constructor() {
    effect(() => {
      const open = this.isOpen();
      const jobKey = this.jobKey();

      if (!open) {
        this.lastLoadedJobKey = null;
        return;
      }
      if (!jobKey || jobKey === this.lastLoadedJobKey) return;

      this.lastLoadedJobKey = jobKey;
      this.reason.set('');
      this.selectedInvoiceKey.set(null);
      this.errorMessage.set('');
      this.loadInvoices(jobKey);
    });
  }

  private loadInvoices(jobKey: string): void {
    this.isLoadingInvoices.set(true);
    this.changeRequestSvc.getEligibleInvoices(jobKey).subscribe({
      next: (res) => {
        this.isLoadingInvoices.set(false);
        if (res.status && res.data) {
          this.invoices.set(res.data);
          if (res.data.length === 1) this.selectedInvoiceKey.set(res.data[0].invoiceKey);
        } else {
          this.errorMessage.set(res.message || 'Unable to load invoices for this job.');
        }
      },
      error: () => {
        this.isLoadingInvoices.set(false);
        this.errorMessage.set('Unable to load invoices for this job.');
      },
    });
  }

  get needsInvoicePicker(): boolean {
    return this.invoices().length > 1;
  }

  get canSend(): boolean {
    if (this.isSending() || this.isLoadingInvoices()) return false;
    if (!this.reason().trim()) return false;
    if (this.invoices().length === 0) return false;
    if (this.needsInvoicePicker && !this.selectedInvoiceKey()) return false;
    return true;
  }

  onClose(): void {
    this.closed.emit();
  }

  onOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.onClose();
  }

  send(): void {
    const jobKey = this.jobKey();
    const reason = this.reason().trim();
    if (!jobKey || !this.canSend) return;

    this.isSending.set(true);
    this.errorMessage.set('');
    this.changeRequestSvc.sendChangeRequest(jobKey, reason, this.selectedInvoiceKey()).subscribe({
      next: (res) => {
        this.isSending.set(false);
        if (res.status) {
          this.sent.emit();
          this.closed.emit();
        } else {
          this.errorMessage.set(res.message || 'Unable to send the change request.');
        }
      },
      error: () => {
        this.isSending.set(false);
        this.errorMessage.set('Unable to send the change request.');
      },
    });
  }
}
