import { Component, computed, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ChangeRequestService } from '../../../features/accounting/move-to-accounting/change-request.service';
import { ChangeRequestState } from '../../../features/accounting/move-to-accounting/change-request.model';

/**
 * "🔁 Change Request — ⏳ AWAITING AM" / "✓ CHANGE COMPLETED BY AM" JOB-LEVEL popup -- the SECOND
 * of two popups this button can show, per complete-screen-v2.html's showChangeReq() (the
 * `if(!cr){...} return;` early branch is the OTHER popup, SendChangeRequestModalComponent).
 * Shown whenever the job has an active (unacknowledged) change request.
 *
 * "Awaiting" state shows the structured JobSalesInvoiceHelper-derived summary (Requested by /
 * Reason) plus the note trail below it; it's read-only (Close only) -- the Account Manager
 * resolves it from legacy Admin Portal V1's MgtJobSalesOrder/Sales screen, not from here.
 * "Completed" state drops that structured summary entirely and renders the popup straight from
 * state().notes (AdminActionNotes, FeatureID = 1, oldest first) instead -- confirmed with Nahid
 * 2026-09-05 -- plus an Acknowledge button, which clears the request back to the button's default
 * state.
 */
@Component({
  selector: 'app-change-request-status-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './change-request-status-modal.component.html',
  styleUrl: './change-request-status-modal.component.scss',
})
export class ChangeRequestStatusModalComponent {
  private readonly changeRequestSvc = inject(ChangeRequestService);

  isOpen = input(false);
  jobKey = input<string | null>(null);
  po = input<string | null>(null);
  state = input.required<ChangeRequestState>();

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
    this.changeRequestSvc.acknowledge(jobKey, helperKey).subscribe({
      next: (res) => {
        this.isAcknowledging.set(false);
        if (res.status) {
          this.acknowledged.emit();
          this.closed.emit();
        } else {
          this.errorMessage.set(res.message || 'Unable to acknowledge the change request.');
        }
      },
      error: () => {
        this.isAcknowledging.set(false);
        this.errorMessage.set('Unable to acknowledge the change request.');
      },
    });
  }
}
