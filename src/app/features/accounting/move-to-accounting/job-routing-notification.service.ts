import { Injectable, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { JobChatSignalRService } from '../../live-chat/job-chat-signalr.service';
import { JobRoutingService } from './job-routing.service';
import { JobRoutingStatus } from './job-routing.model';

/**
 * Live-update source of truth for the JobRoutingLog job list flags on the Move to Accounting
 * screen: "with Alysha — sent 2h ago" (job sent to Service, awaiting return) and "Back from
 * Service" (job returned, needs Teresa's acknowledgement) -- plus the blinking returned-count
 * callout. Modeled on AccountingNotesNotificationService/ChangeRequestNotificationService: a
 * single `providedIn: 'root'` singleton lazily registers ONE JobRoutingChanged listener on the
 * shared staff-inbox SignalR connection and keeps the visible job list's routing flags + the
 * global returned count fresh.
 *
 * Unlike those two services this isn't scoped to a single selected job -- it annotates the WHOLE
 * currently-loaded job list at once, so watchJobs() takes the full list of job keys currently
 * rendered (called after every job-list load/page/search) rather than one job key.
 */
@Injectable({ providedIn: 'root' })
export class JobRoutingNotificationService {
  private readonly signalr = inject(JobChatSignalRService);
  private readonly routingSvc = inject(JobRoutingService);

  /** Routing status for each job currently in the visible list, keyed by jobKey. A job absent
   *  from this map has no open routing entry ("none"). */
  readonly statusByJobKey = signal<Record<string, JobRoutingStatus>>({});

  /** Count of jobs currently "returned" (back from Service, not yet acknowledged) -- global, not
   *  scoped to the visible list, since a returned job could be on a later "Show more" page. */
  readonly returnedCount = signal(0);

  private listenerRegistered = false;
  private currentJobKeys: string[] = [];

  /** Call after every job-list load/page/search with the full list of currently-visible job keys. */
  watchJobs(jobKeys: string[]): void {
    this.currentJobKeys = jobKeys;
    this.ensureListenerRegistered();
    this.refreshBatch(jobKeys);
    this.refreshReturnedCount();
  }

  refreshBatch(jobKeys: string[]): void {
    if (jobKeys.length === 0) {
      this.statusByJobKey.set({});
      return;
    }
    this.routingSvc.getBatchStatus(jobKeys).subscribe({
      next: (res) => {
        if (res.status) this.statusByJobKey.set(res.data ?? {});
      },
    });
  }

  refreshReturnedCount(): void {
    this.routingSvc.getReturnedCount().subscribe({
      next: (res) => {
        if (res.status) this.returnedCount.set(res.data);
      },
    });
  }

  acknowledge(jobKey: string): Observable<{ status: boolean; message: string; data: boolean }> {
    return this.routingSvc.acknowledge(jobKey);
  }

  private ensureListenerRegistered(): void {
    if (this.listenerRegistered) return;
    this.listenerRegistered = true;
    this.signalr.setJobRoutingChangedListener(() => {
      // Refetch the whole visible batch + count rather than patching one entry in place -- cheap
      // queries, and simplest given the flag also needs a StaffList join for the display name.
      this.refreshBatch(this.currentJobKeys);
      this.refreshReturnedCount();
    });
  }
}
