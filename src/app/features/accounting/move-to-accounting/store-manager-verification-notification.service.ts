import { Injectable, inject, signal } from '@angular/core';
import { JobChatSignalRService } from '../../live-chat/job-chat-signalr.service';
import { StoreManagerVerificationService } from './store-manager-verification.service';
import { StoreManagerVerificationState } from './store-manager-verification.model';

const DEFAULT_STATE: StoreManagerVerificationState = {
  sent: false,
  sentTo: null,
  sentAt: null,
  sentCount: 0,
  notSentReason: null,
  responded: false,
  responseDate: null,
  storeManagerName: null,
  remark: null,
  answers: [],
  po: null,
  locationName: null,
  serviceRequest: null,
  locationPhone: null,
  canSubmit: false,
};

/**
 * Live-update source of truth for the "✉ Store Manager Verification — Email" JOB-LEVEL bar on the
 * Move to Accounting page. Modeled directly on ChangeRequestNotificationService: a single
 * `providedIn: 'root'` singleton tracks the currently-selected job, lazily registers ONE
 * StoreManagerVerificationChanged listener on the shared staff-inbox SignalR connection, and keeps
 * a public state signal fresh. Unlike Notes To Accounting / Change Request, there is no
 * self-triggered refresh path here at all -- this bar has no "send"/"acknowledge" action of its own
 * on this screen (the send happens in legacy Admin Portal V1, the response on RCS_app's landing
 * page), so SignalR (backed by StoreManagerVerificationMonitor's poll) is the ONLY way this state
 * ever changes after the initial load.
 */
@Injectable({ providedIn: 'root' })
export class StoreManagerVerificationNotificationService {
  private readonly signalr = inject(JobChatSignalRService);
  private readonly svc = inject(StoreManagerVerificationService);

  private readonly currentJobKey = signal<string | null>(null);

  readonly state = signal<StoreManagerVerificationState>(DEFAULT_STATE);

  private listenerRegistered = false;

  /** Call whenever the job page selects a job -- registers the SignalR listener (once, ever) and
   *  loads the current state for this job. */
  watchJob(jobKey: string): void {
    this.currentJobKey.set(jobKey);
    this.ensureListenerRegistered();
    this.refresh(jobKey);
  }

  refresh(jobKey: string): void {
    this.svc.getState(jobKey).subscribe({
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
    this.signalr.setStoreManagerVerificationChangedListener((dto) => {
      if (dto.jobKey === this.currentJobKey()) {
        this.refresh(dto.jobKey);
      }
    });
  }
}
