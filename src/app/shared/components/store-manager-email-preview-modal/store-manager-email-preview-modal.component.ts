import { Component, effect, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { StoreManagerVerificationService } from '../../../features/accounting/move-to-accounting/store-manager-verification.service';

/**
 * "👁 Store-manager verification email — as sent" JOB-LEVEL popup -- complete-screen-v2.html's
 * showSmEmailPreview(), look-and-feel exact match (cream preview box, To:/Subject: header,
 * boxed "Scope of work" section, landing-page link line). Content (subject + scope-of-work) is
 * fetched live from RFIJobOps -- the real generated content, not a client-side reconstruction.
 * Read-only: opening this popup never sends anything.
 */
@Component({
  selector: 'app-store-manager-email-preview-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './store-manager-email-preview-modal.component.html',
  styleUrl: './store-manager-email-preview-modal.component.scss',
})
export class StoreManagerEmailPreviewModalComponent {
  private readonly svc = inject(StoreManagerVerificationService);

  isOpen = input(false);
  jobKey = input<string | null>(null);
  po = input<string | null>(null);
  toEmail = input<string | null>(null);

  readonly closed = output<void>();

  readonly loading = signal(false);
  readonly subject = signal<string | null>(null);
  readonly scopeOfWorkHtml = signal<string | null>(null);

  private loadedForJobKey: string | null = null;

  constructor() {
    effect(() => {
      const jobKey = this.jobKey();
      if (this.isOpen() && jobKey && this.loadedForJobKey !== jobKey) {
        this.loadedForJobKey = jobKey;
        this.loading.set(true);
        this.svc.getEmailPreview(jobKey).subscribe({
          next: (res) => {
            this.loading.set(false);
            if (res.status && res.data) {
              this.subject.set(res.data.subject);
              this.scopeOfWorkHtml.set(res.data.scopeOfWorkHtml);
            }
          },
          error: () => this.loading.set(false),
        });
      }

      if (!this.isOpen()) {
        this.loadedForJobKey = null;
      }
    });
  }

  onClose(): void {
    this.closed.emit();
  }

  onOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.onClose();
  }
}
