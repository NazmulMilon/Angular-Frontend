import { Component, computed, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { AssignVendorService } from '../../../services/assign-vendor.service';
import { AssignedVendorDetail } from '../../../models/assign-vendor.model';

/**
 * Vendor option shown in the recall vendor picker. Sourced from the job header
 * detail's assignedVendors collection when the modal opens.
 */
interface RecallVendorOption {
  jobVendorKey: string;
  vendorKey: string;
  vendorName: string;
  isDefault: boolean;
}

/**
 * Data emitted when the admin confirms the modal.
 * - `choice = 'additional-approval'` → no backend recall write; host proceeds with the plain status change.
 * - `choice = 'recall'` → the modal already called submit-recall-review; host proceeds with the recall
 *   status flip (typically Pending Return ETA).
 */
export interface RecallReviewResult {
  choice: 'recall' | 'additional-approval';
  isVendorFault: boolean;
  vendorKey: string | null;
  remarks: string | null;
}

/**
 * Two-stage modal that mirrors the legacy Accounting → other-status flow from
 * EditJob.cshtml:
 *
 *   Stage 1 (`#ModalMoveTheJobFromAccountingToOtherStuffs`)
 *       "Is this a Recall or an Additional Approval?" — Recall proceeds to Stage 2;
 *       Additional Approval closes the modal and lets the host complete the plain status change.
 *
 *   Stage 2 (`#ForJobsInRecall`)
 *       Vendor's Fault Yes/No; if Yes, vendor picker + remarks. Submit calls
 *       `submit-recall-review` and, on success, emits `confirmed` with `choice='recall'`.
 */
@Component({
  selector: 'app-recall-review-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './recall-review-modal.component.html',
  styleUrls: ['./recall-review-modal.component.scss'],
})
export class RecallReviewModalComponent {
  private readonly assignVendorSvc = inject(AssignVendorService);

  readonly confirmed = output<RecallReviewResult>();
  readonly cancelled = output<void>();

  readonly isVisible = signal(false);
  readonly isSubmitting = signal(false);
  readonly errorMessage = signal('');
  readonly vendorOptions = signal<RecallVendorOption[]>([]);

  /** 'choice' = pre-step (Recall vs Additional Approval), 'recall' = vendor-fault form. */
  readonly stage = signal<'choice' | 'recall'>('choice');

  /** True when opened directly (e.g. the Job Details "Recall" button) — hides the Recall/Additional-Approval pre-step and the Back control. */
  readonly skipChoice = signal(false);

  /** null = not yet chosen, true = "Yes, vendor's fault", false = "No, not vendor's fault" */
  readonly isVendorFault = signal<boolean | null>(null);
  readonly selectedVendorKey = signal<string | null>(null);
  readonly remarks = signal('');

  readonly title = computed(() => (this.stage() === 'choice' ? 'Status Change' : 'Move to Recall'));

  private jobKey = '';

  /**
   * Open the modal for a job that is currently in the Move-to-Accounting status.
   * Vendors are populated from the header detail's assignedVendors list — only
   * active (not-deleted) rows are eligible for the recall attribution.
   *
   * Pass `skipChoice: true` to open directly on the Vendor's Fault / Not Vendor's
   * Fault form (e.g. the standalone Job Details "Recall" button), bypassing the
   * Recall-vs-Additional-Approval pre-step used by the status-dropdown flow.
   */
  open(jobKey: string, assignedVendors: AssignedVendorDetail[], options?: { skipChoice?: boolean }): void {
    this.jobKey = jobKey;
    this.vendorOptions.set(
      assignedVendors
        .filter((v) => !v.isDelete && !!v.jobVendorKey && !!v.vendorKey)
        .map((v) => ({
          jobVendorKey: v.jobVendorKey,
          vendorKey: v.vendorKey,
          vendorName: v.vendorName ?? '(unnamed vendor)',
          isDefault: !!v.isDefault,
        })),
    );
    this.skipChoice.set(!!options?.skipChoice);
    this.stage.set(options?.skipChoice ? 'recall' : 'choice');
    this.isVendorFault.set(null);
    this.selectedVendorKey.set(null);
    this.remarks.set('');
    this.errorMessage.set('');
    this.isSubmitting.set(false);
    this.isVisible.set(true);
  }

  close(): void {
    this.isVisible.set(false);
  }

  onChooseRecall(): void {
    this.errorMessage.set('');
    this.stage.set('recall');
  }

  onChooseAdditionalApproval(): void {
    this.close();
    this.confirmed.emit({
      choice: 'additional-approval',
      isVendorFault: false,
      vendorKey: null,
      remarks: null,
    });
  }

  onBackToChoice(): void {
    this.stage.set('choice');
    this.errorMessage.set('');
  }

  onFaultChange(value: boolean): void {
    this.isVendorFault.set(value);
    this.errorMessage.set('');
    if (!value) {
      this.selectedVendorKey.set(null);
      this.remarks.set('');
    }
  }

  onVendorSelect(vendorKey: string): void {
    this.selectedVendorKey.set(vendorKey);
    this.errorMessage.set('');
  }

  onRemarksChange(value: string): void {
    this.remarks.set(value);
  }

  onCancel(): void {
    this.close();
    this.cancelled.emit();
  }

  onSubmit(): void {
    const fault = this.isVendorFault();
    if (fault === null) {
      this.errorMessage.set("Please select whether this recall is Vendor's Fault or Not Vendor's Fault.");
      return;
    }

    let vendorKey: string | null = null;
    let remarks: string | null = null;
    if (fault) {
      vendorKey = this.selectedVendorKey();
      if (!vendorKey) {
        this.errorMessage.set('Please select the vendor responsible for this recall.');
        return;
      }
      remarks = this.remarks().trim();
      if (!remarks) {
        this.errorMessage.set('Please enter remarks for the vendor fault recall.');
        return;
      }
    }

    this.isSubmitting.set(true);
    this.errorMessage.set('');

    this.assignVendorSvc
      .submitRecallReview({
        jobKey: this.jobKey,
        isVendorFault: fault,
        vendorKey,
        remarks,
      })
      .subscribe({
        next: (res) => {
          this.isSubmitting.set(false);
          if (res?.status) {
            this.close();
            this.confirmed.emit({ choice: 'recall', isVendorFault: fault, vendorKey, remarks });
          } else {
            this.errorMessage.set(res?.message || 'Unable to submit recall review.');
          }
        },
        error: () => {
          this.isSubmitting.set(false);
          this.errorMessage.set('Something went wrong while submitting the recall review.');
        },
      });
  }
}
