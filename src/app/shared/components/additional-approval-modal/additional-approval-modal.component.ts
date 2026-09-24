import { Component, inject, signal, computed, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AssignVendorService } from '../../../services/assign-vendor.service';
import {
  SaveVendorApprovalDataRequest,
  SaveVendorApprovalDataResponse,
  SaveTechCheckInRequest,
  SaveTechCheckOutRequest,
} from '../../../models/on-site-estimate.model';
import { WorkOrderEmailModalComponent } from '../work-order-email-modal/work-order-email-modal.component';

export interface AdditionalApprovalData {
  estimateKey: string;
  jobKey: string;
  vendorKey: string;
  revVendorDNE: number;
}

interface ApprovalOption {
  value: number;
  label: string;
  description: string;
  invoiceType: number;
  displayTitle: string;
  icon: 'calendar' | 'checkout' | 'invoice' | 'save';
  vendorPreview: string;
  noEmail?: boolean;
}

@Component({
  selector: 'app-additional-approval-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, WorkOrderEmailModalComponent],
  templateUrl: './additional-approval-modal.component.html',
  styleUrls: ['./additional-approval-modal.component.scss'],
})
export class AdditionalApprovalModalComponent {
  private readonly fb = inject(FormBuilder);
  private readonly assignVendorSvc = inject(AssignVendorService);

  @ViewChild(WorkOrderEmailModalComponent) emailModal?: WorkOrderEmailModalComponent;

  // State
  readonly isVisible = signal(false);
  readonly isSubmitting = signal(false);
  readonly errorMessage = signal('');
  readonly guidanceMessage = signal('');
  readonly successMessage = signal('');
  readonly openingEmailComposer = signal(false);
  readonly showCheckInForm = signal(false);
  readonly showCheckOutForm = signal(false);
  readonly checkInKey = signal<string | null>(null);
  readonly showValidationHints = signal(false);

  // Data passed from parent
  readonly approvalData = signal<AdditionalApprovalData | null>(null);

  // Forms
  approvalForm: FormGroup;
  checkInForm: FormGroup;
  checkOutForm: FormGroup;

  // Approval options (mapped to backend InvoiceType values)
  readonly approvalOptions: ApprovalOption[] = [
    {
      value: 1,
      label: 'Send additional approval with "Set Return ETA" buttons',
      description: 'Vendor will set a return visit date',
      invoiceType: 9,
      displayTitle: 'Set return ETA',
      icon: 'calendar',
      vendorPreview: 'Vendor email will include a "Set Return ETA" button.',
    },
    {
      value: 2,
      label: 'Send additional approval with check-out button',
      description: 'Vendor can check out and create estimate',
      invoiceType: 3,
      displayTitle: 'Check out & estimate',
      icon: 'checkout',
      vendorPreview: 'Vendor email will include a check-out button to create an estimate.',
    },
    {
      value: 4,
      label: 'Send additional approval with "CREATE INVOICE" Button',
      description: 'Vendor will create and submit invoice',
      invoiceType: 10,
      displayTitle: 'Create invoice',
      icon: 'invoice',
      vendorPreview: 'Vendor email will include a "CREATE INVOICE" button.',
    },
    {
      value: 5,
      label: 'Save approved vendor amount and Close (email will NOT be sent)',
      description: 'No email sent - just saves the approval',
      invoiceType: 5,
      displayTitle: 'Save approved amount',
      icon: 'save',
      vendorPreview: 'No email will be sent. The approved amount is saved only.',
      noEmail: true,
    },
  ];

  readonly vendorEmailOptions = this.approvalOptions.filter((o) => o.value !== 5);
  readonly internalOnlyOptions = this.approvalOptions.filter((o) => o.value === 5);

  readonly activeStep = computed(() => {
    if (this.showCheckOutForm()) return 3;
    if (this.showCheckInForm()) return 2;
    return 1;
  });

  readonly modalTitle = computed(() => {
    if (this.openingEmailComposer()) return 'Approval saved';
    if (this.showCheckOutForm()) return 'Vendor check-out required';
    if (this.showCheckInForm()) return 'Vendor check-in required';
    return 'Send approval to vendor';
  });

  readonly modalSubtitle = computed(() => {
    if (this.openingEmailComposer()) return 'Opening email composer…';
    if (this.showCheckOutForm()) return 'Complete check-out before the invoice can be created.';
    if (this.showCheckInForm()) return 'Complete check-in before proceeding with this approval.';
    return 'Choose what the vendor can do from the approval email.';
  });

  getSelectedOption(): ApprovalOption | null {
    const value = this.approvalForm.get('approvalOption')?.value;
    return this.approvalOptions.find((o) => o.value === value) ?? null;
  }

  getApprovalTextLength(): number {
    const text = this.approvalForm.get('approvalText')?.value ?? '';
    return typeof text === 'string' ? text.length : 0;
  }

  getSubmitButtonLabel(): string {
    if (this.isSubmitting()) {
      if (this.showCheckInForm()) return 'Saving check-in…';
      if (this.showCheckOutForm()) return 'Saving check-out…';
      return 'Checking vendor status…';
    }
    if (this.showCheckInForm()) return 'Save check-in';
    if (this.showCheckOutForm()) return 'Save check-out';
    return this.approvalForm.get('approvalOption')?.value === 5 ? 'Save & close' : 'Continue';
  }

  constructor() {
    this.approvalForm = this.fb.group({
      approvalOption: [1, Validators.required],
      approvalText: ['', Validators.required],
    });

    this.checkInForm = this.fb.group({
      checkInDateTime: ['', Validators.required],
      techCount: [1, [Validators.required, Validators.min(1)]],
    });

    this.checkOutForm = this.fb.group({
      checkOutDateTime: ['', Validators.required],
      workPerformed: ['', Validators.required],
    });
  }

  open(data: AdditionalApprovalData): void {
    this.approvalData.set(data);
    this.isVisible.set(true);
    this.clearMessages();
    this.showCheckInForm.set(false);
    this.showCheckOutForm.set(false);
    this.checkInKey.set(null);
    this.openingEmailComposer.set(false);
    this.showValidationHints.set(false);

    this.approvalForm.patchValue({
      approvalOption: 1,
      approvalText: 'Approved. Please proceed with the work.',
    });

    const now = new Date().toISOString().slice(0, 16);
    this.checkInForm.patchValue({ checkInDateTime: now, techCount: 1 });
    this.checkOutForm.patchValue({ checkOutDateTime: now });
  }

  close(): void {
    this.isVisible.set(false);
    this.approvalForm.reset();
    this.checkInForm.reset();
    this.checkOutForm.reset();
    this.clearMessages();
    this.openingEmailComposer.set(false);
    this.showValidationHints.set(false);
  }

  onApprovalOptionChange(): void {
    this.clearMessages();
    this.showCheckInForm.set(false);
    this.showCheckOutForm.set(false);
  }

  goBackFromCheckIn(): void {
    this.showCheckInForm.set(false);
    this.guidanceMessage.set('');
    this.errorMessage.set('');
  }

  goBackFromCheckOut(): void {
    this.showCheckOutForm.set(false);
    this.guidanceMessage.set('');
    this.errorMessage.set('');
  }

  setCheckInToNow(): void {
    this.checkInForm.patchValue({ checkInDateTime: new Date().toISOString().slice(0, 16) });
  }

  setCheckOutToNow(): void {
    this.checkOutForm.patchValue({ checkOutDateTime: new Date().toISOString().slice(0, 16) });
  }

  isFieldInvalid(form: FormGroup, fieldName: string): boolean {
    const control = form.get(fieldName);
    return !!control && control.invalid && (control.touched || this.showValidationHints());
  }

  private clearMessages(): void {
    this.errorMessage.set('');
    this.guidanceMessage.set('');
    this.successMessage.set('');
  }

  private markFormTouched(form: FormGroup): void {
    form.markAllAsTouched();
    this.showValidationHints.set(true);
  }

  onSubmit(): void {
    if (this.approvalForm.invalid) {
      this.markFormTouched(this.approvalForm);
      this.errorMessage.set('Please complete all required fields');
      return;
    }

    const data = this.approvalData();
    if (!data) {
      this.errorMessage.set('Missing approval data');
      return;
    }

    const approvalOption = this.approvalForm.value.approvalOption;

    if (approvalOption === 5) {
      this.saveApprovalData();
      return;
    }

    if (approvalOption === 2) {
      this.checkBeforeCheckout(data);
      return;
    }

    if (approvalOption === 4) {
      this.checkBeforeCreateInvoice(data);
      return;
    }

    this.saveApprovalData();
  }

  private checkBeforeCheckout(data: AdditionalApprovalData): void {
    this.isSubmitting.set(true);
    this.clearMessages();

    this.assignVendorSvc.checkBeforeCheckout(data.jobKey, data.vendorKey).subscribe({
      next: (response) => {
        this.isSubmitting.set(false);
        if (response.status && response.data) {
          if (response.data.canProceed) {
            this.saveApprovalData();
          } else {
            this.showCheckInForm.set(true);
            this.guidanceMessage.set('Vendor must be checked in before checkout. Please complete check-in below.');
          }
        } else {
          console.error('Check-before-checkout failed:', response);
          this.errorMessage.set(response.message || 'Failed to verify check-in status');
        }
      },
      error: (err) => {
        console.error('Check-before-checkout error:', err);
        this.isSubmitting.set(false);
        this.errorMessage.set('Failed to verify check-in status');
      },
    });
  }

  private checkBeforeCreateInvoice(data: AdditionalApprovalData): void {
    this.isSubmitting.set(true);
    this.clearMessages();

    this.assignVendorSvc.checkBeforeCreateInvoice(data.jobKey, data.vendorKey).subscribe({
      next: (response) => {
        this.isSubmitting.set(false);
        if (response.status && response.data) {
          if (response.data.canProceed) {
            this.saveApprovalData();
          } else if (response.data.tempHeader === '1') {
            this.showCheckOutForm.set(true);
            this.guidanceMessage.set('Vendor must be checked out before creating invoice. Please complete check-out below.');
          } else {
            this.showCheckInForm.set(true);
            this.guidanceMessage.set('Vendor must be checked in and out before creating invoice. Please start with check-in.');
          }
        } else {
          console.error('Check-before-create-invoice failed:', response);
          this.errorMessage.set(response.message || 'Failed to verify check-out status');
        }
      },
      error: (err) => {
        console.error('Check-before-create-invoice error:', err);
        this.isSubmitting.set(false);
        this.errorMessage.set('Failed to verify check-out status');
      },
    });
  }

  onCheckInSubmit(): void {
    if (this.checkInForm.invalid) {
      this.markFormTouched(this.checkInForm);
      this.errorMessage.set('Please complete all check-in fields');
      return;
    }

    const data = this.approvalData();
    if (!data) return;

    this.isSubmitting.set(true);
    this.clearMessages();

    const checkInRequest: SaveTechCheckInRequest = {
      jobKey: data.jobKey,
      vendorKey: data.vendorKey,
      checkInDateTime: new Date(this.checkInForm.value.checkInDateTime).toISOString(),
      techCount: this.checkInForm.value.techCount,
    };

    this.assignVendorSvc.saveTechCheckIn(checkInRequest).subscribe({
      next: (response) => {
        this.isSubmitting.set(false);
        if (response.status && response.data) {
          this.successMessage.set('Check-in saved successfully');
          this.showCheckInForm.set(false);

          if (response.data.checkInKey) {
            this.checkInKey.set(response.data.checkInKey);
          }

          const approvalOption = this.approvalForm.value.approvalOption;
          if (approvalOption === 2) {
            this.saveApprovalData();
          } else if (approvalOption === 4) {
            this.showCheckOutForm.set(true);
            this.guidanceMessage.set('Check-in complete. Please complete check-out to continue.');
          }
        } else {
          console.error('Check-in save failed:', response);
          this.errorMessage.set(response.message || 'Failed to save check-in');
        }
      },
      error: (err) => {
        console.error('Check-in save error:', err);
        this.isSubmitting.set(false);
        this.errorMessage.set('Failed to save check-in');
      },
    });
  }

  onCheckOutSubmit(): void {
    if (this.checkOutForm.invalid) {
      this.markFormTouched(this.checkOutForm);
      this.errorMessage.set('Please complete all check-out fields');
      return;
    }

    const checkInKeyValue = this.checkInKey();
    if (!checkInKeyValue) {
      this.errorMessage.set('Missing check-in key');
      return;
    }

    this.isSubmitting.set(true);
    this.clearMessages();

    const checkOutRequest: SaveTechCheckOutRequest = {
      checkInKey: checkInKeyValue,
      checkOutDateTime: new Date(this.checkOutForm.value.checkOutDateTime).toISOString(),
      workPerformed: this.checkOutForm.value.workPerformed,
    };

    this.assignVendorSvc.saveTechCheckOut(checkOutRequest).subscribe({
      next: (response) => {
        this.isSubmitting.set(false);
        if (response.status) {
          this.successMessage.set('Check-out saved successfully');
          this.showCheckOutForm.set(false);
          this.saveApprovalData();
        } else {
          console.error('Check-out save failed:', response);
          this.errorMessage.set(response.message || 'Failed to save check-out');
        }
      },
      error: (err) => {
        console.error('Check-out save error:', err);
        this.isSubmitting.set(false);
        this.errorMessage.set('Failed to save check-out');
      },
    });
  }

  private saveApprovalData(): void {
    const data = this.approvalData();
    if (!data) return;

    this.isSubmitting.set(true);
    this.errorMessage.set('');
    this.guidanceMessage.set('');

    const request: SaveVendorApprovalDataRequest = {
      jobKey: data.jobKey,
      vendorKey: data.vendorKey,
      estimateKey: data.estimateKey,
      fifthApprovalOption: this.approvalForm.value.approvalOption,
      approvalText: this.approvalForm.value.approvalText,
    };

    this.assignVendorSvc.saveVendorApprovalData(request).subscribe({
      next: (response) => {
        this.isSubmitting.set(false);
        if (response.status && response.data) {
          const requiresEmail = response.data.requiresEmail !== undefined
            ? response.data.requiresEmail
            : (this.approvalForm.value.approvalOption !== 5);

          if (requiresEmail) {
            this.successMessage.set('Approval saved successfully');
            this.openingEmailComposer.set(true);
            this.navigateToEmailCompose(response.data);
          } else {
            this.successMessage.set('Approval saved successfully (no email sent)');
          }
        } else {
          console.error('Save approval failed:', response);
          this.errorMessage.set(response.message || 'Failed to save approval data');
        }
      },
      error: (err) => {
        console.error('Save approval error:', err);
        this.isSubmitting.set(false);
        this.errorMessage.set('Failed to save approval data');
      },
    });
  }

  private navigateToEmailCompose(data: SaveVendorApprovalDataResponse): void {
    setTimeout(() => {
      this.close();
      if (this.emailModal) {
        this.emailModal.open({
          workOrderKey: data.workOrderKey,
          invoiceType: data.invoiceType,
          jobStatusTrigger: 0,
        });
      }
    }, 1000);
  }
}
