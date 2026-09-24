import { Component, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { SendBackToServiceService } from '../../../features/accounting/move-to-accounting/send-back-to-service.service';

/**
 * "↩ Send Back to Service" JOB-LEVEL popup, titled "Send Back to Account Manager" per Nahid
 * 2026-09-14. Unlike "🔁 Send Change Request to Account Manager", this one does NOT require an
 * eligible customer invoice to exist -- confirmed with Nahid 2026-09-14 after PO 27134 (no active
 * invoice yet) couldn't be sent back at all with the original Change-Request-mirrored gating.
 * Only a Reason is required.
 */
@Component({
  selector: 'app-send-back-to-service-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './send-back-to-service-modal.component.html',
  styleUrl: './send-back-to-service-modal.component.scss',
})
export class SendBackToServiceModalComponent {
  private readonly sendBackToServiceSvc = inject(SendBackToServiceService);

  isOpen = input(false);
  jobKey = input<string | null>(null);
  po = input<string | null>(null);

  readonly closed = output<void>();
  /** Emitted after a successful send so the host can refresh the trigger button's state. */
  readonly sent = output<void>();

  readonly reason = signal('');
  readonly isSending = signal(false);
  readonly errorMessage = signal('');

  get canSend(): boolean {
    return !this.isSending() && this.reason().trim().length > 0;
  }

  onClose(): void {
    this.reason.set('');
    this.errorMessage.set('');
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
    this.sendBackToServiceSvc.sendBackToService(jobKey, reason).subscribe({
      next: (res) => {
        this.isSending.set(false);
        if (res.status) {
          this.reason.set('');
          this.sent.emit();
          this.closed.emit();
        } else {
          this.errorMessage.set(res.message || 'Unable to send the job back to Service.');
        }
      },
      error: () => {
        this.isSending.set(false);
        this.errorMessage.set('Unable to send the job back to Service.');
      },
    });
  }
}
