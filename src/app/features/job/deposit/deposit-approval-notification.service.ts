import { Injectable, inject, signal } from '@angular/core';
import { JobChatSignalRService } from '../../live-chat/job-chat-signalr.service';
import { DepositService } from '../../../services/deposit.service';

/**
 * Per-admin "unseen deposit decision" signal for the currently-open job, shared by the Estimates
 * tab dot and the "Deposits on Job" button so both blink off the same state. Source of truth is
 * GET job/{jobKey}/deposit-summary's hasAnyUnseenDecision; a DepositApprovalDecided SignalR event
 * (broadcast by DepositApprovalDecisionMonitor on the backend) just triggers a re-fetch when it's
 * for the job currently open.
 */
@Injectable({ providedIn: 'root' })
export class DepositApprovalNotificationService {
  private readonly signalr = inject(JobChatSignalRService);
  private readonly depositService = inject(DepositService);

  private readonly currentJobKey = signal<string | null>(null);
  readonly hasUnseenDepositDecision = signal(false);

  private listenerRegistered = false;

  /** Call once the job page knows its jobKey — registers the SignalR listener and loads current state. */
  watchJob(jobKey: string): void {
    this.currentJobKey.set(jobKey);
    this.ensureListenerRegistered();
    this.refresh(jobKey);
  }

  refresh(jobKey: string): void {
    this.depositService.getJobDepositSummary(jobKey).subscribe({
      next: (res) => this.hasUnseenDepositDecision.set(res.data?.hasAnyUnseenDecision ?? false),
      error: () => this.hasUnseenDepositDecision.set(false),
    });
  }

  /** Call when the admin opens the Estimates tab — clears the notification for this admin only. */
  markRead(jobKey: string): void {
    this.depositService.markDepositApprovalsRead(jobKey).subscribe({
      next: () => this.hasUnseenDepositDecision.set(false),
    });
  }

  private ensureListenerRegistered(): void {
    if (this.listenerRegistered) return;
    this.listenerRegistered = true;
    this.signalr.setDepositApprovalDecidedListener((dto) => {
      if (dto.jobKey === this.currentJobKey()) {
        this.refresh(dto.jobKey);
      }
    });
  }
}
