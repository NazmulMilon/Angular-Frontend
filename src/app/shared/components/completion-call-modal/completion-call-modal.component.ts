import { Component, effect, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { CompletionCallService, CompletionCallState } from '../../../features/accounting/move-to-accounting/completion-call.service';

/** "📞 Verify completion with store location — CALL" (stepper Step 1,
 *  complete-screen-v2.html's logCompletionCall()/saveCompletionCall()). Records who was spoken
 *  with and what they said; stamps a pink Notes to Accounting entry and, on success, the host
 *  re-fetches EQ1 readiness (which reads this data live -- no separate "recompute" call). */
@Component({
  selector: 'app-completion-call-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './completion-call-modal.component.html',
  styleUrl: './completion-call-modal.component.scss',
})
export class CompletionCallModalComponent {
  private readonly completionCallSvc = inject(CompletionCallService);

  isOpen = input(false);
  jobKey = input<string | null>(null);
  po = input<string | null>(null);
  locationName = input<string | null>(null);
  locContactName = input<string | null>(null);
  locPhone = input<string | null>(null);

  readonly closed = output<void>();
  /** Emitted after a successful log so the host can re-fetch EQ1 readiness. */
  readonly logged = output<void>();

  readonly contactName = signal('');
  readonly contactTitle = signal('');
  readonly note = signal('');
  readonly isSaving = signal(false);
  readonly errorMessage = signal('');

  /** What's already on file for this job's current completion cycle, if anything -- null while
   *  loading or when nothing has been logged yet. Shown as a green "already verified" banner so
   *  reopening the popup doesn't look like the data never persisted. */
  readonly existingState = signal<CompletionCallState | null>(null);
  readonly loadingState = signal(false);

  private lastSeededJobKey: string | null = null;

  constructor() {
    effect(() => {
      const open = this.isOpen();
      const jobKey = this.jobKey();

      if (!open) {
        this.lastSeededJobKey = null;
        return;
      }
      if (!jobKey || jobKey === this.lastSeededJobKey) return;

      this.lastSeededJobKey = jobKey;
      this.contactName.set(this.locContactName() || '');
      this.contactTitle.set('');
      this.note.set('');
      this.errorMessage.set('');
      this.existingState.set(null);

      this.loadingState.set(true);
      this.completionCallSvc.getState(jobKey).subscribe({
        next: (res) => {
          this.loadingState.set(false);
          if (jobKey !== this.jobKey()) return; // stale response for a job the user already left
          if (res.status && res.data?.latestCallKey) {
            this.existingState.set(res.data);
            this.contactName.set(res.data.contactName || this.locContactName() || '');
            this.contactTitle.set(res.data.contactTitle || '');
          }
        },
        error: () => {
          this.loadingState.set(false);
        },
      });
    });
  }

  /** Strips formatting so the tel: URI is well-formed (mockup: `ccPhone.replace(/[^0-9+]/g,'')`) --
   *  whether clicking it actually opens a phone/dialer app is entirely up to the OS's own
   *  tel: URI handler (registered dialer/Teams/Skype/etc.), not something a web page controls. */
  telHref(phone: string | null): string {
    return 'tel:' + (phone || '').replace(/[^0-9+]/g, '');
  }

  get canSave(): boolean {
    return !this.isSaving() && !!this.contactName().trim() && !!this.note().trim();
  }

  onClose(): void {
    this.closed.emit();
  }

  onOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.onClose();
  }

  save(): void {
    const jobKey = this.jobKey();
    if (!jobKey || !this.canSave) return;

    this.isSaving.set(true);
    this.errorMessage.set('');
    this.completionCallSvc.logCall(jobKey, this.contactName().trim(), this.contactTitle().trim(), this.note().trim()).subscribe({
      next: (res) => {
        this.isSaving.set(false);
        if (res.status) {
          this.logged.emit();
          this.closed.emit();
        } else {
          this.errorMessage.set(res.message || 'Unable to log this call.');
        }
      },
      error: () => {
        this.isSaving.set(false);
        this.errorMessage.set('Unable to log this call.');
      },
    });
  }
}
