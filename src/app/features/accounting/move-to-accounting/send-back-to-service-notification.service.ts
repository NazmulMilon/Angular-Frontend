import { Injectable, inject, signal } from '@angular/core';
import { JobChatSignalRService } from '../../live-chat/job-chat-signalr.service';
import { SendBackToServiceService } from './send-back-to-service.service';
import { SendBackToServiceState } from './send-back-to-service.model';

const DEFAULT_STATE: SendBackToServiceState = {
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
 * Live-update source of truth for the "↩ Send Back to Service" vendor-card button on the Move to
 * Accounting page. Modeled directly on ChangeRequestNotificationService: a single
 * `providedIn: 'root'` singleton tracks the currently-selected job, lazily registers ONE
 * SendBackToServiceChanged listener on the shared staff-inbox SignalR connection, and keeps a
 * public state signal fresh -- shared across every vendor card on the job, since the underlying
 * request is job-level even though the button lives per-vendor.
 */
@Injectable({ providedIn: 'root' })
export class SendBackToServiceNotificationService {
  private readonly signalr = inject(JobChatSignalRService);
  private readonly svc = inject(SendBackToServiceService);

  private readonly currentJobKey = signal<string | null>(null);

  readonly state = signal<SendBackToServiceState>(DEFAULT_STATE);

  private listenerRegistered = false;

  watchJob(jobKey: string): void {
    this.currentJobKey.set(jobKey);
    this.ensureListenerRegistered();
    this.refresh(jobKey);
  }

  refresh(jobKey: string): void {
    this.svc.getState(jobKey).subscribe({
      next: (res) => {
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
    this.signalr.setSendBackToServiceChangedListener((dto) => {
      if (dto.jobKey === this.currentJobKey()) {
        this.refresh(dto.jobKey);
      }
    });
  }
}
