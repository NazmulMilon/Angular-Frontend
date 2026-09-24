import { Component, inject, signal, computed, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AssignVendorService } from '../../../services/assign-vendor.service';
import {
  CustomerEstimateRecipient,
  CustomerEstimateSendResult,
  CustomerEstimateAttachment,
} from '../../../models/on-site-estimate.model';

/**
 * Send / resend a persisted customer estimate to the customer.
 *
 * Standalone so any screen can trigger a send with just a customerEstimateKey — the estimate modal
 * (Save & Send, and Resend from view mode), and any list or job view that wants a resend action
 * without opening the full estimate.
 *
 * Two API calls:
 *   1. GET  /customer-estimate-recipients/{key} — the contacts the admin picks from
 *   2. POST /send-customer-estimate-email        — sends to the chosen contactKeys
 *
 * This component never persists the estimate. Callers that need the estimate saved first (Save &
 * Send) must do that themselves and open this only once it's persisted.
 */
@Component({
  selector: 'app-send-customer-estimate-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './send-customer-estimate-modal.component.html',
  styleUrls: ['./send-customer-estimate-modal.component.scss'],
})
export class SendCustomerEstimateModalComponent {
  private readonly assignVendorSvc = inject(AssignVendorService);

  /** Fired once the estimate reached at least one recipient. */
  readonly sent = output<{ customerEstimateKey: string; sentCount: number }>();
  /** Fired when the admin dismisses without sending. */
  readonly cancelled = output<void>();

  readonly isVisible = signal(false);
  readonly customerEstimateKey = signal<string>('');
  /** Shown in the header so the admin knows which estimate is going out. */
  readonly estimateLabel = signal<string>('');

  readonly accountContacts = signal<CustomerEstimateRecipient[]>([]);
  readonly locationContacts = signal<CustomerEstimateRecipient[]>([]);
  readonly selectedContactKeys = signal<Set<string>>(new Set());

  // ── Attachments ──────────────────────────────────────────────
  /** Job files (JobFile) — selected keys go out as attachJobFiles. */
  readonly jobFiles = signal<CustomerEstimateAttachment[]>([]);
  /** Vendor uploads (JobBillVendorUploads) — selected keys go out as attachVendorFiles. */
  readonly vendorFiles = signal<CustomerEstimateAttachment[]>([]);
  /** Kept as two sets: the same GUID could in principle appear in both tables. */
  readonly selectedJobFileKeys = signal<Set<string>>(new Set());
  readonly selectedVendorFileKeys = signal<Set<string>>(new Set());
  readonly isLoadingAttachments = signal(false);
  readonly attachmentsError = signal('');
  /** Collapsed by default — attaching files is the exception, not the rule. */
  readonly showAttachments = signal(false);

  readonly hasAnyAttachment = computed(
    () => this.jobFiles().length > 0 || this.vendorFiles().length > 0
  );
  readonly selectedAttachmentCount = computed(
    () => this.selectedJobFileKeys().size + this.selectedVendorFileKeys().size
  );

  readonly isLoading = signal(false);
  readonly isSending = signal(false);
  readonly errorMessage = signal('');
  readonly recipientsError = signal('');
  /** Per-recipient outcomes, so a partial failure stays visible. */
  readonly sendResults = signal<CustomerEstimateSendResult[]>([]);

  readonly allRecipients = computed(() => [
    ...this.accountContacts(),
    ...this.locationContacts(),
  ]);

  readonly hasAnyRecipient = computed(() => this.allRecipients().length > 0);
  readonly canSend = computed(() => this.selectedContactKeys().size > 0 && !this.isSending());

  /**
   * Opens the dialog for a persisted customer estimate and loads its candidate recipients.
   * `estimateLabel` is display-only (e.g. the estimate number or vendor name).
   */
  open(opts: { customerEstimateKey: string; estimateLabel?: string }): void {
    this.customerEstimateKey.set(opts.customerEstimateKey);
    this.estimateLabel.set(opts.estimateLabel ?? '');

    this.isVisible.set(true);
    this.isSending.set(false);
    this.errorMessage.set('');
    this.recipientsError.set('');
    this.sendResults.set([]);
    this.accountContacts.set([]);
    this.locationContacts.set([]);
    this.selectedContactKeys.set(new Set());
    this.jobFiles.set([]);
    this.vendorFiles.set([]);
    this.selectedJobFileKeys.set(new Set());
    this.selectedVendorFileKeys.set(new Set());
    this.attachmentsError.set('');
    this.showAttachments.set(false);

    this.loadRecipients(opts.customerEstimateKey);
    this.loadAttachments(opts.customerEstimateKey);
  }

  close(): void {
    this.isVisible.set(false);
  }

  /** Dismiss without sending. */
  cancel(): void {
    this.close();
    this.cancelled.emit();
  }

  private loadRecipients(ceKey: string): void {
    this.isLoading.set(true);

    this.assignVendorSvc.getCustomerEstimateRecipients(ceKey).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        if (!res.status || !res.data) {
          this.recipientsError.set(res.message || 'Could not load contacts for this job.');
          return;
        }

        this.accountContacts.set(res.data.accountContacts ?? []);
        this.locationContacts.set(res.data.locationContacts ?? []);

        // Pre-select the job's default contact, matching the legacy compose screen.
        this.selectedContactKeys.set(
          new Set(
            this.allRecipients()
              .filter((r) => r.isJobDefaultContact && !!r.email)
              .map((r) => r.contactKey)
          )
        );

        if (this.hasAnyRecipient() && this.allRecipients().every((r) => !r.email)) {
          this.recipientsError.set(
            'No contacts with an email address are set up for this job. Add one on the customer or location before sending.'
          );
        }
      },
      error: () => {
        this.isLoading.set(false);
        this.recipientsError.set('Could not load contacts for this job.');
      },
    });
  }

  /**
   * Loads the job files and vendor uploads available to attach. Best-effort: if this fails the
   * admin can still send the estimate (the PDF is generated server-side regardless).
   */
  private loadAttachments(ceKey: string): void {
    this.isLoadingAttachments.set(true);

    this.assignVendorSvc.getCustomerEstimateAttachments(ceKey).subscribe({
      next: (res) => {
        this.isLoadingAttachments.set(false);
        if (!res.status || !res.data) {
          this.attachmentsError.set(res.message || 'Could not load files for this job.');
          return;
        }
        this.jobFiles.set(res.data.jobFiles ?? []);
        this.vendorFiles.set(res.data.vendorFiles ?? []);
      },
      error: () => {
        this.isLoadingAttachments.set(false);
        this.attachmentsError.set('Could not load files for this job.');
      },
    });
  }

  toggleAttachmentsPanel(): void {
    this.showAttachments.update((v) => !v);
  }

  toggleJobFile(file: CustomerEstimateAttachment): void {
    this.selectedJobFileKeys.update((prev) => {
      const next = new Set(prev);
      next.has(file.fileKey) ? next.delete(file.fileKey) : next.add(file.fileKey);
      return next;
    });
  }

  toggleVendorFile(file: CustomerEstimateAttachment): void {
    this.selectedVendorFileKeys.update((prev) => {
      const next = new Set(prev);
      next.has(file.fileKey) ? next.delete(file.fileKey) : next.add(file.fileKey);
      return next;
    });
  }

  isJobFileSelected(file: CustomerEstimateAttachment): boolean {
    return this.selectedJobFileKeys().has(file.fileKey);
  }

  isVendorFileSelected(file: CustomerEstimateAttachment): boolean {
    return this.selectedVendorFileKeys().has(file.fileKey);
  }

  /** Contacts without an email can't be selected. */
  toggleRecipient(recipient: CustomerEstimateRecipient): void {
    if (!recipient.email) return;
    this.selectedContactKeys.update((prev) => {
      const next = new Set(prev);
      if (next.has(recipient.contactKey)) {
        next.delete(recipient.contactKey);
      } else {
        next.add(recipient.contactKey);
      }
      return next;
    });
  }

  isRecipientSelected(recipient: CustomerEstimateRecipient): boolean {
    return this.selectedContactKeys().has(recipient.contactKey);
  }

  send(): void {
    const ceKey = this.customerEstimateKey();
    const contactKeys = [...this.selectedContactKeys()];
    if (!ceKey || contactKeys.length === 0) return;

    this.isSending.set(true);
    this.errorMessage.set('');
    this.sendResults.set([]);

    this.assignVendorSvc
      .sendCustomerEstimateEmail({
        customerEstimateKey: ceKey,
        contactKeys,
        // Separate lists: these keys address different tables server-side.
        attachJobFiles: [...this.selectedJobFileKeys()],
        attachVendorFiles: [...this.selectedVendorFileKeys()],
      })
      .subscribe({
        next: (res) => {
          this.isSending.set(false);

          if (!res.status || !res.data) {
            this.errorMessage.set(res.message || 'Failed to send the email.');
            return;
          }

          const data = res.data;
          this.sendResults.set(data.results ?? []);

          if (data.failedCount > 0) {
            // Partial success: stay open so the failures remain on screen.
            this.errorMessage.set(data.message);
            return;
          }

          this.close();
          this.sent.emit({ customerEstimateKey: ceKey, sentCount: data.sentCount });
        },
        error: () => {
          this.isSending.set(false);
          this.errorMessage.set('Failed to send the email.');
        },
      });
  }
}
