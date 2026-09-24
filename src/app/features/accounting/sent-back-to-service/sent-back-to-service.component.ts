import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { AccountingJobDetailsComponent } from '../../../shared/components/accounting-job-details/accounting-job-details.component';
import { JobChatSignalRService } from '../../live-chat/job-chat-signalr.service';
import { SendBackToServiceService } from '../move-to-accounting/send-back-to-service.service';
import { SentBackToServiceJobListItem } from '../move-to-accounting/send-back-to-service.model';

/**
 * Account Manager-facing "Sent Back to Service" page -- reached either from the app header's
 * "Sent Back to Service" link or from the "↩ JOB SENT BACK TO SERVICE" email link (which routes
 * through legacy ProjectRCS's login page first, per Nahid 2026-09-14, so the AM lands here already
 * authenticated). Lists every job currently sent back to the logged-in AM (job list on the RIGHT,
 * detail view on the LEFT, per Nahid's explicit layout -- reversed from Move to Accounting's own
 * list-left/detail-right). Detail view reuses AccountingJobDetailsComponent (the same one Move to
 * Accounting uses) plus this page's own reason panel and two actions: "↩ Send Back to Accounting"
 * (mirrors legacy ProjectRCS's MgtJobSalesOrderController.ResolveChangeRequest, just against
 * FunctionID=11) and "→ Go to Assign Vendor".
 */
@Component({
  selector: 'app-sent-back-to-service',
  standalone: true,
  imports: [CommonModule, FormsModule, AccountingJobDetailsComponent],
  templateUrl: './sent-back-to-service.component.html',
  styleUrl: './sent-back-to-service.component.scss',
})
export class SentBackToServiceComponent implements OnDestroy {
  private readonly svc = inject(SendBackToServiceService);
  private readonly router = inject(Router);
  private readonly signalr = inject(JobChatSignalRService);

  readonly jobs = signal<SentBackToServiceJobListItem[]>([]);
  readonly loading = signal(false);
  readonly errorMessage = signal('');

  readonly selectedJobKey = signal<string | null>(null);
  readonly selectedJob = computed(() => this.jobs().find((j) => j.jobKey === this.selectedJobKey()) ?? null);

  readonly resolveNote = signal('');
  readonly resolving = signal(false);
  readonly resolveError = signal('');

  /** Keeps this page's job list live -- any "Send Back to Service" send/resolve/acknowledge
   *  anywhere (this tab, another tab, another admin) reloads the list with no page refresh. The
   *  underlying JobSalesInvoiceHelper query is cheap and awaiting-vs-not membership is nontrivial
   *  to patch client-side, so a full reload is simpler and always correct -- same discipline as
   *  every other notification service's refresh() in this feature area. */
  private readonly unsubscribeSendBackToServiceChanged = this.signalr.setSendBackToServiceChangedListener(() => {
    this.loadJobs();
  });

  constructor() {
    this.loadJobs();
  }

  ngOnDestroy(): void {
    this.unsubscribeSendBackToServiceChanged();
  }

  loadJobs(): void {
    this.loading.set(true);
    this.errorMessage.set('');
    this.svc.getJobsForAccountManager().subscribe({
      next: (res) => {
        this.loading.set(false);
        if (res.status && res.data) {
          this.jobs.set(res.data);
          const current = this.selectedJobKey();
          if (!current && res.data.length > 0) {
            this.selectJob(res.data[0].jobKey);
          } else if (current && !res.data.some((j) => j.jobKey === current)) {
            this.selectedJobKey.set(res.data.length > 0 ? res.data[0].jobKey : null);
          }
        } else {
          this.errorMessage.set(res.message || 'Unable to load jobs.');
        }
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('Unable to load jobs.');
      },
    });
  }

  selectJob(jobKey: string): void {
    this.selectedJobKey.set(jobKey);
    this.resolveNote.set('');
    this.resolveError.set('');
  }

  sendBackToAccounting(): void {
    const jobKey = this.selectedJobKey();
    const note = this.resolveNote().trim();
    if (!jobKey) return;
    if (!note) {
      this.resolveError.set('A note is required.');
      return;
    }

    this.resolving.set(true);
    this.resolveError.set('');
    this.svc.resolve(jobKey, note).subscribe({
      next: (res) => {
        this.resolving.set(false);
        if (res.status) {
          this.loadJobs();
        } else {
          this.resolveError.set(res.message || 'Unable to send the job back to Accounting.');
        }
      },
      error: () => {
        this.resolving.set(false);
        this.resolveError.set('Unable to send the job back to Accounting.');
      },
    });
  }

  goToAssignVendor(): void {
    const jobKey = this.selectedJobKey();
    if (!jobKey) return;
    this.router.navigate(['/job', jobKey, 'assign-vendor']);
  }

  formatDateTime(value: string | null): string {
    if (!value) return '--';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
  }
}
