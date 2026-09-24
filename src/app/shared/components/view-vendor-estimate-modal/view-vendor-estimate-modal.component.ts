import { Component, effect, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { VendorApprovedEstimateService } from '../../../features/accounting/move-to-accounting/vendor-approved-estimate.service';
import { VendorApprovedEstimate } from '../../../features/accounting/move-to-accounting/vendor-approved-estimate.model';

/** "📄 View Estimate (approved to proceed)" popup -- read-only, mirrors
 *  complete-screen-v2.html's estDocHTML()/showEstimate() exactly (chrome, copy, and markup shape,
 *  not just behavior). Shows the latest VendorEstimate for this job+vendor with IsApproved=true,
 *  Status=1 -- the approval the vendor received to proceed with the job, NOT vendor bill approval. */
@Component({
  selector: 'app-view-vendor-estimate-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './view-vendor-estimate-modal.component.html',
  styleUrl: './view-vendor-estimate-modal.component.scss',
})
export class ViewVendorEstimateModalComponent {
  private readonly estimateSvc = inject(VendorApprovedEstimateService);

  isOpen = input(false);
  jobKey = input<string | null>(null);
  vendorKey = input<string | null>(null);

  readonly closed = output<void>();

  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly data = signal<VendorApprovedEstimate | null>(null);

  constructor() {
    effect(() => {
      if (this.isOpen() && this.jobKey() && this.vendorKey()) this.load();
    });
  }

  private load(): void {
    const jobKey = this.jobKey();
    const vendorKey = this.vendorKey();
    if (!jobKey || !vendorKey) return;

    this.loading.set(true);
    this.errorMessage.set('');
    this.data.set(null);
    this.estimateSvc.get(jobKey, vendorKey).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.data.set(res);
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('No approved estimate on file for this vendor.');
      },
    });
  }

  onClose(): void {
    this.closed.emit();
  }

  onOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.onClose();
  }

  /** "On-Site Approval" vs "Vendor Estimate" -- same document shape, different label. */
  docLabel(d: VendorApprovedEstimate): string {
    return d.isOnsiteApproval ? 'On-Site Approval' : 'Vendor Estimate';
  }

  fmt(n: number | null | undefined): string {
    return '$' + (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
