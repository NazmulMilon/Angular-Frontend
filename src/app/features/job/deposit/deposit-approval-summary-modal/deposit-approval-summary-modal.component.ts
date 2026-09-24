import { Component, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { DepositService } from '../../../../services/deposit.service';
import { JobDepositSummaryEntry } from '../../../../models/deposit.model';

/**
 * "Deposits on Job" summary — one row per customer estimate with a deposit, showing vendor/customer
 * amounts, approval status, and the SVC manager's reasoning (if any). Reuses the job-wide
 * deposit-summary endpoint that also drives the Estimates-tab notification dot.
 */
@Component({
  selector: 'app-deposit-approval-summary-modal',
  standalone: true,
  imports: [CurrencyPipe, DatePipe],
  templateUrl: './deposit-approval-summary-modal.component.html',
  styleUrl: './deposit-approval-summary-modal.component.scss',
})
export class DepositApprovalSummaryModalComponent {
  private readonly depositSvc = inject(DepositService);

  readonly isVisible = signal(false);
  readonly isLoading = signal(false);
  readonly errorMessage = signal('');
  readonly entries = signal<JobDepositSummaryEntry[]>([]);
  readonly resendBusyKeys = signal<Set<string>>(new Set());
  readonly resendMessageByKey = signal<Record<string, string>>({});

  private jobKey = '';

  open(jobKey: string): void {
    this.jobKey = jobKey;
    this.isVisible.set(true);
    this.errorMessage.set('');
    this.isLoading.set(true);

    this.depositSvc.getJobDepositSummary(jobKey).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        if (!res.status || !res.data) {
          this.errorMessage.set(res.message || 'Failed to load deposit summary.');
          this.entries.set([]);
          return;
        }
        this.entries.set(res.data.entries);
      },
      error: () => {
        this.isLoading.set(false);
        this.errorMessage.set('Failed to load deposit summary.');
      },
    });
  }

  close(): void {
    this.isVisible.set(false);
  }

  approvalStatusLabel(entry: JobDepositSummaryEntry): string {
    if (entry.isApproved === true) return 'Approved';
    if (entry.isApproved === false) return 'Declined';
    if (entry.depositApprovalFromSvCmanagerKey) return 'Pending SVC manager approval';
    return 'No approval required';
  }

  /** Resend is only meaningful while the approval hasn't been decided yet. */
  canResend(entry: JobDepositSummaryEntry): boolean {
    return entry.isApproved == null && !!entry.depositApprovalFromSvCmanagerKey;
  }

  isResendBusy(entry: JobDepositSummaryEntry): boolean {
    return this.resendBusyKeys().has(entry.customerEstimateKey);
  }

  resendMessage(entry: JobDepositSummaryEntry): string | undefined {
    return this.resendMessageByKey()[entry.customerEstimateKey];
  }

  onResendApproval(entry: JobDepositSummaryEntry): void {
    const key = entry.customerEstimateKey;
    if (this.resendBusyKeys().has(key)) return;

    this.resendBusyKeys.set(new Set(this.resendBusyKeys()).add(key));
    this.setResendMessage(key, '');

    this.depositSvc.resendDepositApproval(key).subscribe({
      next: (res) => {
        this.clearResendBusy(key);
        this.setResendMessage(key, res.status ? 'Approval request resent.' : res.message || 'Failed to resend.');
      },
      error: (err) => {
        this.clearResendBusy(key);
        this.setResendMessage(key, err?.error?.message || 'Failed to resend.');
      },
    });
  }

  private clearResendBusy(key: string): void {
    const next = new Set(this.resendBusyKeys());
    next.delete(key);
    this.resendBusyKeys.set(next);
  }

  private setResendMessage(key: string, message: string): void {
    this.resendMessageByKey.set({ ...this.resendMessageByKey(), [key]: message });
  }
}
