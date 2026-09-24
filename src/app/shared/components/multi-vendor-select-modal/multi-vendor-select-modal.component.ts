import { Component, signal, output, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';

/** One line item shown in an option's cost breakdown. */
export interface MultiVendorSelectLineItem {
  itemName: string;
  quantity: number | null;
  rate: number | null;
  rowTotal: number;
}

/** One selectable option within a vendor's group in the "Combine Vendor Estimates" picker. */
export interface MultiVendorSelectOption {
  estimateKey: string;
  optionLabel: string | null;
  estimateNo: string;
  estimateDateDisplay: string;
  estimateTotal: number;
  statusLabel: string;
  lineItems: MultiVendorSelectLineItem[];
}

/**
 * One vendor's group of candidate(s) in the picker. Vendors with a single estimate carry exactly
 * one entry in `options`; vendors who submitted multiple options (Good/Better/Best) carry one
 * entry per option — at most one option per vendor may be selected for a merge.
 */
export interface MultiVendorSelectCandidate {
  vendorKey: string;
  vendorName: string;
  options: MultiVendorSelectOption[];
}

/**
 * Step 1 of the "Combine Vendor Estimates" flow (multi-vendor merge, mirrors legacy Flow A /
 * #multiCEModal): a vendor-grouped multi-select over this job's eligible vendor estimates.
 * Within a vendor's group, at most one option may be selected (radio semantics) — a vendor's
 * options are mutually-exclusive alternatives, not additive line items. Requires 2+ vendors
 * selected before "Next" — a single selection should use the existing single-vendor
 * "Create Customer Estimate" action instead.
 */
@Component({
  selector: 'app-multi-vendor-select-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './multi-vendor-select-modal.component.html',
  styleUrls: ['./multi-vendor-select-modal.component.scss'],
})
export class MultiVendorSelectModalComponent {
  /** Copy overrides so this same picker can be reused for other "combine multiple vendors" flows
   *  (e.g. customer invoices) without duplicating its selection/expansion logic. Defaults match the
   *  original "Combine Vendor Estimates" copy exactly, so the existing estimate call site needs no
   *  changes. */
  readonly title = input('Create Customer Estimate from Multiple Vendor Estimates');
  readonly subtitle = input('Select estimates to include');
  readonly emptyStateText = input('No eligible vendor estimates on this job.');
  readonly validationHintText = input("Please select at least 2 vendors' estimates from above.");

  readonly isVisible = signal(false);
  readonly candidates = signal<MultiVendorSelectCandidate[]>([]);
  /** vendorKey -> selected estimateKey (at most one option selected per vendor). */
  readonly selectedByVendor = signal<Map<string, string>>(new Map());
  readonly showValidationHint = signal(false);
  /** estimateKeys of options whose line-item breakdown is currently expanded. */
  readonly expandedOptions = signal<Set<string>>(new Set());

  /** Fired with the selected estimate keys (always 2+, at most one per vendor) when confirmed. */
  readonly next = output<string[]>();

  readonly selectedCount = computed(() => this.selectedByVendor().size);
  readonly canProceed = computed(() => this.selectedCount() >= 2);

  open(candidates: MultiVendorSelectCandidate[]): void {
    this.candidates.set(candidates);
    this.selectedByVendor.set(new Map());
    this.showValidationHint.set(false);
    this.expandedOptions.set(
      new Set(candidates.flatMap((vendor) => vendor.options.map((opt) => opt.estimateKey))),
    );
    this.isVisible.set(true);
  }

  close(): void {
    this.isVisible.set(false);
  }

  isSelected(estimateKey: string): boolean {
    return [...this.selectedByVendor().values()].includes(estimateKey);
  }

  /** Select `estimateKey` as the chosen option for `vendorKey`, replacing any prior selection for that vendor. */
  select(vendorKey: string, estimateKey: string): void {
    this.selectedByVendor.update((prev) => {
      const next = new Map(prev);
      next.set(vendorKey, estimateKey);
      return next;
    });
  }

  /** Deselect whichever option was chosen for `vendorKey`, if any. */
  deselect(vendorKey: string): void {
    this.selectedByVendor.update((prev) => {
      const next = new Map(prev);
      next.delete(vendorKey);
      return next;
    });
  }

  toggle(vendorKey: string, estimateKey: string, checked: boolean): void {
    if (checked) this.select(vendorKey, estimateKey);
    else this.deselect(vendorKey);
  }

  isExpanded(estimateKey: string): boolean {
    return this.expandedOptions().has(estimateKey);
  }

  toggleExpanded(estimateKey: string): void {
    this.expandedOptions.update((prev) => {
      const next = new Set(prev);
      if (next.has(estimateKey)) next.delete(estimateKey);
      else next.add(estimateKey);
      return next;
    });
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value || 0);
  }

  onNext(): void {
    if (!this.canProceed()) {
      this.showValidationHint.set(true);
      return;
    }
    this.next.emit([...this.selectedByVendor().values()]);
    this.close();
  }
}
