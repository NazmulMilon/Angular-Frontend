import { Injectable, inject, signal } from '@angular/core';
import { JobChatSignalRService } from '../../live-chat/job-chat-signalr.service';
import { ChangeRequestService } from './change-request.service';
import { ChangeRequestState } from './change-request.model';

const DEFAULT_STATE: ChangeRequestState = {
  status: 'none',
  helperKey: null,
  invoiceKey: null,
  invoiceNo: null,
  reason: null,
  startedBy: null,
  startedByName: null,
  startedOn: null,
  responseByAttendee: null,
  attendedBy: null,
  attendedByName: null,
  attendedOn: null,
  hasEligibleInvoice: false,
  notes: [],
};

/**
 * Live-update source of truth for the "🔁 Send Change Request to Account Manager" JOB-LEVEL
 * button on the Move to Accounting page. Modeled directly on AccountingNotesNotificationService:
 * a single `providedIn: 'root'` singleton tracks the currently-selected job, lazily registers ONE
 * ChangeRequestChanged listener on the shared staff-inbox SignalR connection, and keeps a public
 * state signal fresh -- including the case a full page load never triggers a click (see
 * move-to-accounting.component.ts's loadJobs() auto-select, which now always routes through
 * selectJob() so this gets watchJob'd on first load too).
 */
@Injectable({ providedIn: 'root' })
export class ChangeRequestNotificationService {
  private readonly signalr = inject(JobChatSignalRService);
  private readonly changeRequestSvc = inject(ChangeRequestService);

  private readonly currentJobKey = signal<string | null>(null);

  /** Change-request state for the currently-watched job, for the trigger button's label/badge. */
  readonly state = signal<ChangeRequestState>(DEFAULT_STATE);

  private listenerRegistered = false;

  /** Call whenever the job page selects a job -- registers the SignalR listener (once, ever)
   *  and loads the current state for this job. */
  watchJob(jobKey: string): void {
    this.currentJobKey.set(jobKey);
    this.ensureListenerRegistered();
    this.refresh(jobKey);
  }

  refresh(jobKey: string): void {
    this.changeRequestSvc.getState(jobKey).subscribe({
      next: (res) => {
        // Guard against a stale response landing after the user already switched jobs.
        if (res.status && res.data && this.currentJobKey() === jobKey) {
          this.state.set(res.data);
        }
      },
    });
  }

  clear(): void {
    this.currentJobKey.set(null);
    this.state.set(DEFAULT_STATE);
  }

  private ensureListenerRegistered(): void {
    if (this.listenerRegistered) return;
    this.listenerRegistered = true;
    this.signalr.setChangeRequestChangedListener((dto) => {
      if (dto.jobKey === this.currentJobKey()) {
        this.refresh(dto.jobKey);
      }
    });
  }
}
