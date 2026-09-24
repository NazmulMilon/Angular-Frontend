import { Injectable, inject, signal } from '@angular/core';
import { JobChatSignalRService } from '../../live-chat/job-chat-signalr.service';
import { VendorPayableService } from './vendor-payable.service';
import { VendorPayableCard } from './vendor-payable.model';

/**
 * Live-update source of truth for "Approve Vendor(s) Payables" vendor cards on the Move to
 * Accounting page. Modeled directly on StoreManagerVerificationNotificationService: a single
 * `providedIn: 'root'` singleton tracks the currently-selected job, lazily registers ONE
 * VendorPayableChanged listener on the shared staff-inbox SignalR connection, and keeps a public
 * cards signal fresh. RFIJobOps owns most write paths for this feature itself (approve/remove/
 * undo/insurance-override/mark-reviewed), each pushing directly -- the one exception is a vendor's
 * own completion-photo upload (via RCS_app, outside this API's process), covered instead by
 * RFIJobOps's CompletionPhotoUploadMonitor poll (2026-09-10). Either way this listener just
 * refetches on ANY VendorPayableChanged for the open job, so it doesn't care which path fired it.
 */
@Injectable({ providedIn: 'root' })
export class VendorPayableNotificationService {
  private readonly signalr = inject(JobChatSignalRService);
  private readonly svc = inject(VendorPayableService);

  private readonly currentJobKey = signal<string | null>(null);

  readonly cards = signal<VendorPayableCard[]>([]);
  readonly loading = signal(false);

  private listenerRegistered = false;

  /** Call whenever the job page selects a job -- registers the SignalR listener (once, ever) and
   *  loads the current cards for this job. */
  watchJob(jobKey: string): void {
    this.currentJobKey.set(jobKey);
    this.ensureListenerRegistered();
    this.refresh(jobKey);
  }

  refresh(jobKey: string): void {
    this.loading.set(true);
    this.svc.getCards(jobKey).subscribe({
      next: (cards) => {
        this.loading.set(false);
        if (this.currentJobKey() === jobKey) this.cards.set(cards);
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  clear(): void {
    this.currentJobKey.set(null);
    this.cards.set([]);
  }

  private ensureListenerRegistered(): void {
    if (this.listenerRegistered) return;
    this.listenerRegistered = true;
    this.signalr.setVendorPayableChangedListener((dto) => {
      if (dto.jobKey === this.currentJobKey()) {
        this.refresh(dto.jobKey);
      }
    });
  }
}
