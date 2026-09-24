import { Injectable, inject, signal } from '@angular/core';
import { JobChatSignalRService } from '../../live-chat/job-chat-signalr.service';
import { NotesActivityService } from '../../../services/notes-activity.service';

/**
 * Live-update source of truth for the "🏷 Notes To Accounting" JOB-LEVEL badge/popup on the Move
 * to Accounting page. Modeled closely on DepositApprovalNotificationService (see
 * features/job/deposit/deposit-approval-notification.service.ts): a single `providedIn: 'root'`
 * singleton tracks the currently-selected job, lazily registers ONE AccountingNoteChanged
 * listener on the shared staff-inbox SignalR connection, and keeps a public count signal fresh.
 *
 * Unlike the deposit case, the popup component (NotesToAccountingModalComponent) is created and
 * destroyed by the host's `@if` -- it cannot itself hold the singleton hub listener across opens
 * -- so this service also exposes `changeVersion`, a counter the modal's `effect()` watches to
 * know "a matching AccountingNoteChanged event arrived while I exist" and reload its own list.
 */
@Injectable({ providedIn: 'root' })
export class AccountingNotesNotificationService {
  private readonly signalr = inject(JobChatSignalRService);
  private readonly notesSvc = inject(NotesActivityService);

  private readonly currentJobKey = signal<string | null>(null);

  /** Accounting-notes count for the currently-watched job, for the trigger button's badge. */
  readonly accountingNotesCount = signal<number | null>(null);

  /**
   * Bumped every time an AccountingNoteChanged event lands for the currently-watched job. The
   * popup component (whichever instance happens to be open) reads this in an `effect()` to know
   * it should reload -- see NotesToAccountingModalComponent.
   */
  readonly changeVersion = signal(0);

  private listenerRegistered = false;

  /** Call whenever the job page selects a job -- registers the SignalR listener (once, ever)
   *  and loads the current count for this job. */
  watchJob(jobKey: string): void {
    this.currentJobKey.set(jobKey);
    this.ensureListenerRegistered();
    this.refresh(jobKey);
  }

  refresh(jobKey: string): void {
    this.notesSvc.getAccountingNotes(jobKey).subscribe({
      next: (res) => {
        // Guard against a stale response landing after the user already switched jobs -- same
        // discipline as move-to-accounting.component.ts's loadSelectedAccountingNotesCount.
        if (res.status && res.data && this.currentJobKey() === jobKey) {
          this.accountingNotesCount.set(res.data.length);
        }
      },
    });
  }

  private ensureListenerRegistered(): void {
    if (this.listenerRegistered) return;
    this.listenerRegistered = true;
    this.signalr.setAccountingNoteChangedListener((dto) => {
      if (dto.jobKey === this.currentJobKey()) {
        this.refresh(dto.jobKey);
        this.changeVersion.update((v) => v + 1);
      }
    });
  }
}
