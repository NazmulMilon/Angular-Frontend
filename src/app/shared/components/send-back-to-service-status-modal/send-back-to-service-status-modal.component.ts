import { Component, computed, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { SendBackToServiceService } from '../../../features/accounting/move-to-accounting/send-back-to-service.service';
import { SendBackToServiceState } from '../../../features/accounting/move-to-accounting/send-back-to-service.model';

/**
 * "↩ Send Back to Service — ⏳ AWAITING AM" / "✓ RETURNED BY AM" JOB-LEVEL popup, mirroring
 * ChangeRequestStatusModalComponent's shape for the sibling "Send Back to Service" feature.
 * Previously the vendor-card's "✓ RETURNED BY AM — Acknowledge" button called straight through to
 * the acknowledge endpoint with no popup, so the Account Manager's response note
 * (SendBackToServiceState.responseByAttendee) was never actually shown anywhere -- fixed per
 * Nahid 2026-09-16 by giving this feature the same status popup Change Request already has.
 */
@Component({
  selector: 'app-send-back-to-service-status-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './send-back-to-service-status-modal.component.html',
  styleUrl: './send-back-to-service-status-modal.component.scss',
})
export class SendBackToServiceStatusModalComponent {
  private readonly svc = inject(SendBackToServiceService);

  isOpen = input(false);
  jobKey = input<string | null>(null);
  po = input<string | null>(null);
  state = input.required<SendBackToServiceState>();

  readonly closed = output<void>();
  /** Emitted after a successful acknowledge so the host can refresh the trigger button's state. */
  readonly acknowledged = output<void>();

  readonly isAcknowledging = signal(false);
  readonly errorMessage = signal('');

  readonly isCompleted = computed(() => this.state().status === 'completed');

  onClose(): void {
    this.closed.emit();
  }

  onOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.onClose();
  }

  acknowledge(): void {
    const jobKey = this.jobKey();
    const helperKey = this.state().helperKey;
    if (this.isAcknowledging() || !jobKey || !helperKey) return;

    this.isAcknowledging.set(true);
    this.errorMessage.set('');
    this.svc.acknowledge(jobKey, helperKey).subscribe({
      next: (res) => {
        this.isAcknowledging.set(false);
        if (res.status) {
          this.acknowledged.emit();
          this.closed.emit();
        } else {
          this.errorMessage.set(res.message || 'Unable to acknowledge.');
        }
      },
      error: () => {
        this.isAcknowledging.set(false);
        this.errorMessage.set('Unable to acknowledge.');
      },
    });
  }
}
