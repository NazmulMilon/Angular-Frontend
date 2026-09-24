import { Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

export interface VendorRejectSubmitEvent {
  adminRemark: string;
}

/**
 * Reject for Resubmission panel. Shown inline under an estimate card when the admin
 * picks "Vendor Estimate Revision Request" from the manage-status menu. Purely presentational —
 * the parent owns the RejectVendorEstimateForResubmission call.
 */
@Component({
  selector: 'app-estimate-reject-panel',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './estimate-reject-panel.component.html',
  styleUrl: './estimate-reject-panel.component.scss',
})
export class EstimateRejectPanelComponent {
  estimateKey = input.required<string>();
  submitting = input(false);
  errorMessage = input('');

  close = output<void>();
  submit = output<VendorRejectSubmitEvent>();

  adminRemark = signal('');

  onSubmit(): void {
    if (this.submitting()) return;
    this.submit.emit({ adminRemark: this.adminRemark().trim() });
  }

  onClose(): void {
    this.close.emit();
  }
}
