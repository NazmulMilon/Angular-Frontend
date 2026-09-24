import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormArray, ReactiveFormsModule, Validators } from '@angular/forms';
import { AssignVendorService } from '../../../services/assign-vendor.service';
import {
  EmailWorkOrderComposeResponse,
  SendWorkOrderEmailRequest,
  VendorContactDTO,
} from '../../../models/on-site-estimate.model';

export interface WorkOrderEmailData {
  workOrderKey: string;
  invoiceType: number;
  jobStatusTrigger: number;
}

@Component({
  selector: 'app-work-order-email-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './work-order-email-modal.component.html',
  styleUrls: ['./work-order-email-modal.component.scss'],
})
export class WorkOrderEmailModalComponent {
  private readonly fb = inject(FormBuilder);
  private readonly assignVendorSvc = inject(AssignVendorService);

  // State
  readonly isVisible = signal(false);
  readonly isLoading = signal(false);
  readonly isSubmitting = signal(false);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');

  readonly composeData = signal<EmailWorkOrderComposeResponse | null>(null);

  // Form
  emailForm: FormGroup;

  constructor() {
    this.emailForm = this.fb.group({
      emailBody: ['', Validators.required],
      senderIsSelf: [true],
      selectedContacts: this.fb.array([]),
    });
  }

  get selectedContactsArray(): FormArray {
    return this.emailForm.get('selectedContacts') as FormArray;
  }

  open(data: WorkOrderEmailData): void {
    this.isVisible.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');
    this.isLoading.set(true);

    // Load email compose data
    this.assignVendorSvc
      .getEmailWorkOrderCompose(data.workOrderKey, data.invoiceType, data.jobStatusTrigger)
      .subscribe({
        next: (response) => {
          this.isLoading.set(false);
          if (response.status && response.data) {
            this.composeData.set(response.data);

            // Strip HTML from email body and populate form with plain text
            const plainTextBody = this.stripHtmlTags(response.data.emailBody);
            this.emailForm.patchValue({
              emailBody: plainTextBody,
              senderIsSelf: true,
            });

            // Setup contact checkboxes
            this.setupContactCheckboxes(response.data.vendorContactList);
          } else {
            console.error('Failed to load email data:', response);
            this.errorMessage.set(response.message || 'Failed to load email data');
          }
        },
        error: (err) => {
          console.error('Email compose load error:', err);
          this.isLoading.set(false);
          this.errorMessage.set('Failed to load email data');
        },
      });
  }

  close(): void {
    this.isVisible.set(false);
    this.emailForm.reset();
    this.selectedContactsArray.clear();
    this.composeData.set(null);
  }

  private setupContactCheckboxes(contacts: VendorContactDTO[]): void {
    this.selectedContactsArray.clear();
    contacts.forEach((contact) => {
      this.selectedContactsArray.push(
        this.fb.group({
          email: [contact.email],
          name: [contact.name],
          selected: [contact.isDefault],
        })
      );
    });
  }

  getSelectedEmails(): string[] {
    return this.selectedContactsArray.controls
      .filter((control) => control.value.selected)
      .map((control) => control.value.email);
  }

  /**
   * Strips HTML tags and converts to plain text
   */
  private stripHtmlTags(html: string): string {
    if (!html) return '';
    
    // Create a temporary div to convert HTML to plain text
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    
    // Get text content and preserve some formatting
    let text = tmp.textContent || tmp.innerText || '';
    
    // Clean up extra whitespace while preserving intentional line breaks
    text = text.replace(/\n\s*\n\s*\n/g, '\n\n'); // Multiple blank lines to double
    text = text.trim();
    
    return text;
  }

  onSendEmail(): void {
    if (this.emailForm.invalid) {
      this.errorMessage.set('Please complete all required fields');
      return;
    }

    const selectedEmails = this.getSelectedEmails();
    if (selectedEmails.length === 0) {
      this.errorMessage.set('Please select at least one recipient');
      return;
    }

    const data = this.composeData();
    if (!data) {
      this.errorMessage.set('Missing email data');
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set('');

    const request: SendWorkOrderEmailRequest = {
      workOrderKey: data.workOrderKey,
      jobKey: data.jobKey,
      vendorKey: data.vendorKey,
      invoiceType: data.invoiceType,
      jobStatusTrigger: data.jobStatusTrigger,
      recipientEmails: selectedEmails,
      emailBody: this.emailForm.value.emailBody,
      attachedFileKeys: [],
      useAdminEmail: this.emailForm.value.senderIsSelf,
    };

    this.assignVendorSvc.sendEmailToVendor(request).subscribe({
      next: (response) => {
        this.isSubmitting.set(false);
        if (response.status && response.data) {
          if (response.data.success) {
            this.successMessage.set(
              `Email sent successfully to ${response.data.emailsSent} recipient(s)` +
              (response.data.jobStatusUpdated ? ` | Job status: ${response.data.newJobStatus}` : '')
            );
          } else {
            console.error('Email send failed:', response.data.message);
            this.errorMessage.set(response.data.message || 'Failed to send email');
          }
        } else {
          console.error('Invalid response:', response);
          this.errorMessage.set(response.message || 'Failed to send email');
        }
      },
      error: (err) => {
        console.error('Email send error:', err);
        this.isSubmitting.set(false);
        this.errorMessage.set('Failed to send email');
      },
    });
  }
}
