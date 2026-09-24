import { Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

export interface VendorDeclineSubmitEvent {
  adminRemark: string;
}

/**
 * Decline estimate modal. Rendered by the parent (gated on an `@if`) when the admin
 * picks "Decline Estimate" from an estimate card — this component is only ever in the
 * DOM while it should be visible, so it has no visibility state of its own. Terminal
 * action (no resubmission path), so the remark is required. Purely presentational —
 * the parent owns the DeclineVendorEstimate call.
 */
@Component({
  selector: 'app-estimate-decline-panel',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './estimate-decline-panel.component.html',
  styleUrl: './estimate-decline-panel.component.scss',
})
export class EstimateDeclinePanelComponent {
  estimateKey = input.required<string>();
  submitting = input(false);
  errorMessage = input('');

  close = output<void>();
  submit = output<VendorDeclineSubmitEvent>();

  adminRemark = signal('');

  canSubmit = computed(() => this.adminRemark().trim().length > 0);

  onSubmit(): void {
    if (this.submitting() || !this.canSubmit()) return;
    this.submit.emit({ adminRemark: this.adminRemark().trim() });
  }

  onClose(): void {
    this.close.emit();
  }
}
