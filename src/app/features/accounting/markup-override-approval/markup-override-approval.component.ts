import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';

import { MarkupOverrideApprovalService } from './markup-override-approval.service';
import { MarkupOverridePendingItem, MarkupOverrideApprovalDetail } from './markup-override-approval.model';
import { MarkupOverrideService } from '../move-to-accounting/markup-override.service';

/**
 * QC Manager-facing "Below Minimum Mark-up Approvals" page -- reached from the "⤴ Override — email
 * QC Manager" request email's deep link (routes through legacy ProjectRCS's login page first, same
 * auth-bridge pattern as Sent Back to Service, so the QC Manager lands here already authenticated).
 *
 * Deliberately separate from Move to Accounting (Nahid, 2026-09-15): the Approve/Reject decision
 * doesn't happen on the same page Teresa uses to request it. Lists every invoice with a currently-
 * Pending override request (job list on the RIGHT, detail on the LEFT, same layout as the other
 * manager-review page in this app, Sent Back to Service). Detail view shows exactly what the
 * request email showed -- the full customer invoice and every approved vendor invoice -- plus
 * Approve/Reject actions. A `?jobKey=` query param (from the email deep link) auto-selects that job.
 */
@Component({
  selector: 'app-markup-override-approval',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './markup-override-approval.component.html',
  styleUrl: './markup-override-approval.component.scss',
})
export class MarkupOverrideApprovalComponent {
  private readonly svc = inject(MarkupOverrideApprovalService);
  private readonly decisionSvc = inject(MarkupOverrideService);
  private readonly route = inject(ActivatedRoute);

  readonly jobs = signal<MarkupOverridePendingItem[]>([]);
  readonly loading = signal(false);
  readonly errorMessage = signal('');

  readonly selectedJobKey = signal<string | null>(null);
  readonly detail = signal<MarkupOverrideApprovalDetail | null>(null);
  readonly detailLoading = signal(false);
  readonly detailError = signal('');

  readonly deciding = signal(false);
  readonly decisionError = signal('');

  readonly selectedListItem = computed(() => this.jobs().find((j) => j.jobKey === this.selectedJobKey()) ?? null);

  constructor() {
    const deepLinkJobKey = this.route.snapshot.queryParamMap.get('jobKey');
    this.loadJobs(deepLinkJobKey || undefined);
  }

  loadJobs(preferJobKey?: string): void {
    this.loading.set(true);
    this.errorMessage.set('');
    this.svc.getPendingJobs().subscribe({
      next: (res) => {
        this.loading.set(false);
        if (res.status) {
          this.jobs.set(res.data || []);
          const want = preferJobKey ?? this.selectedJobKey();
          const stillThere = want && res.data?.some((j) => j.jobKey === want);
          const next = stillThere ? want! : res.data && res.data.length > 0 ? res.data[0].jobKey : null;
          if (next !== this.selectedJobKey() || preferJobKey) {
            this.selectJob(next);
          } else if (!next) {
            this.selectedJobKey.set(null);
            this.detail.set(null);
          }
        } else {
          this.errorMessage.set(res.message || 'Unable to load pending overrides.');
        }
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('Unable to load pending overrides.');
      },
    });
  }

  selectJob(jobKey: string | null): void {
    this.selectedJobKey.set(jobKey);
    this.decisionError.set('');
    this.detail.set(null);
    if (!jobKey) return;

    this.detailLoading.set(true);
    this.detailError.set('');
    this.svc.getDetail(jobKey).subscribe({
      next: (res) => {
        this.detailLoading.set(false);
        if (this.selectedJobKey() !== jobKey) return;
        if (res.status) {
          this.detail.set(res.data);
        } else {
          this.detailError.set(res.message || 'Unable to load the invoice detail.');
        }
      },
      error: () => {
        this.detailLoading.set(false);
        if (this.selectedJobKey() !== jobKey) return;
        this.detailError.set('Unable to load the invoice detail.');
      },
    });
  }

  approve(): void {
    const jobKey = this.selectedJobKey();
    const overrideKey = this.detail()?.state.overrideKey;
    if (!jobKey || !overrideKey || this.deciding()) return;
    if (!confirm('Approve sending this invoice despite being below the minimum mark-up target?')) return;

    this.deciding.set(true);
    this.decisionError.set('');
    this.decisionSvc.approve(jobKey, overrideKey).subscribe({
      next: (res) => {
        this.deciding.set(false);
        if (res.status) {
          this.loadJobs();
        } else {
          this.decisionError.set(res.message || 'Failed to approve the mark-up override.');
        }
      },
      error: () => {
        this.deciding.set(false);
        this.decisionError.set('Failed to approve the mark-up override.');
      },
    });
  }

  reject(): void {
    const jobKey = this.selectedJobKey();
    const overrideKey = this.detail()?.state.overrideKey;
    if (!jobKey || !overrideKey || this.deciding()) return;

    const reason = (window.prompt('Reason for rejecting this override request (required):') ?? '').trim();
    if (!reason) return;

    this.deciding.set(true);
    this.decisionError.set('');
    this.decisionSvc.reject(jobKey, overrideKey, reason).subscribe({
      next: (res) => {
        this.deciding.set(false);
        if (res.status) {
          this.loadJobs();
        } else {
          this.decisionError.set(res.message || 'Failed to reject the mark-up override.');
        }
      },
      error: () => {
        this.deciding.set(false);
        this.decisionError.set('Failed to reject the mark-up override.');
      },
    });
  }

  formatDateTime(value: string | null): string {
    if (!value) return '--';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
  }
}
