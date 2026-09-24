import { Component, computed, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { VendorBillsService } from '../../../services/vendor-bills.service';
import { CUSTOM_CHARGE_TYPE_OPTIONS, CustomChargeTypeOption } from '../../../models/on-site-estimate.model';
import {
  CreateCustomerInvoiceRequest,
  CustomerInvoiceLineItem,
  CustomerInvoiceSource,
  CustomerInvoiceSourceValue,
  CustomerInvoiceTermOption,
  PreviewCustomerInvoiceResponse,
} from '../../../models/customer-invoice.model';

/** One editable customer-invoice line in the modal grid. */
interface InvRow {
  chargeTypeKey: string | null;
  chargeType: string;
  description: string;
  rate: number;
  qty: number;
  costIncurred: number | null;
  display: number | null;
  lineType: string | null;
  vendorEstimateDetailKey: string | null;
}

/**
 * Native "Create Customer Invoice" modal — the Phase-2 replacement for the legacy MVC create pages
 * (Paths 1/2/4). Visually mirrors create-customer-estimate-modal's shell/section/grid/footer chrome
 * (same --vb-* tokens, cce-* structure ported to cci-*) MINUS the vendor-comparison row pair and
 * minimum-markup gate — there's no vendor cost to compare against or markup-gate here. Scratch and the
 * vendor sources present an editable line-item grid; the "from customer estimate" source (Path 2) shows
 * the estimate's lines read-only and the server copies them verbatim (preserving legacy semantics:
 * deposit carried over, the Job is NOT flagged invoiced).
 */
@Component({
  selector: 'app-create-customer-invoice-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './create-customer-invoice-modal.component.html',
  styleUrls: ['./create-customer-invoice-modal.component.scss'],
})
export class CreateCustomerInvoiceModalComponent {
  private readonly vendorBillsSvc = inject(VendorBillsService);

  /** Fired once the invoice is persisted, so the host can refresh the invoices grid. */
  readonly customerInvoiceCreated = output<{ customerInvoiceKey: string; invoiceNo: number | null }>();

  readonly isVisible = signal(false);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');

  readonly source = signal<CustomerInvoiceSourceValue>(CustomerInvoiceSource.Scratch);
  readonly sourceLabel = signal('');
  readonly jobKey = signal('');
  readonly sourceKey = signal<string | null>(null);
  readonly vendorEstimateKeys = signal<string[]>([]);

  readonly terms = signal('');
  /** Terms dropdown options (VendorNetTerm), seeded on open for the editable (scratch) source. */
  readonly termOptions = signal<CustomerInvoiceTermOption[]>([]);
  readonly worksPerformed = signal('');
  readonly rows = signal<InvRow[]>([]);

  readonly adminOn = signal(false);
  readonly adminMarkupPercent = signal(0);
  /** Route the new invoice for manager review (auto-approves for approving agents, else emails prep manager). */
  readonly sendToPrepManager = signal(false);

  /** Path 2 copies the estimate server-side; its grid is a read-only preview. */
  readonly isCopyFromEstimate = computed(() => this.source() === CustomerInvoiceSource.CustomerEstimate);

  readonly subtotal = computed(() =>
    this.rows().reduce((sum, r) => sum + (Number(r.rate) || 0) * (Number(r.qty) || 0), 0),
  );
  readonly adminFee = computed(() =>
    this.adminOn() && this.adminMarkupPercent() > 0
      ? (this.subtotal() * this.adminMarkupPercent()) / 100
      : 0,
  );
  readonly grandTotal = computed(() => this.subtotal() + this.adminFee());

  // ── "Add more line item" controls (mirrors create-customer-estimate-modal's add-row bar) ────────
  readonly customChargeTypeOptions: CustomChargeTypeOption[] = CUSTOM_CHARGE_TYPE_OPTIONS;
  readonly newChargeKey = signal<string>('');
  readonly newRate = signal<number>(0);
  readonly newQty = signal<number>(1);
  readonly newCostIncurred = signal<number>(1); // 1 = Proposed, 0 = Incurred

  // Delete-confirmation modal.
  readonly pendingDelete = signal<number | null>(null);

  open(opts: {
    source: CustomerInvoiceSourceValue;
    jobKey?: string;
    sourceKey?: string | null;
    vendorEstimateKeys?: string[];
    sourceLabel?: string;
  }): void {
    this.source.set(opts.source);
    this.jobKey.set(opts.jobKey ?? '');
    this.sourceKey.set(opts.sourceKey ?? null);
    this.vendorEstimateKeys.set(opts.vendorEstimateKeys ?? []);
    this.sourceLabel.set(opts.sourceLabel ?? this.defaultLabel(opts.source));

    this.terms.set('');
    this.termOptions.set([]);
    this.worksPerformed.set('');
    this.rows.set([]);
    this.adminOn.set(false);
    this.adminMarkupPercent.set(0);
    this.sendToPrepManager.set(false);
    this.errorMessage.set('');
    this.successMessage.set('');
    this.saving.set(false);
    this.newChargeKey.set('');
    this.newRate.set(0);
    this.newQty.set(1);
    this.newCostIncurred.set(1);
    this.pendingDelete.set(null);
    this.isVisible.set(true);

    switch (opts.source) {
      case CustomerInvoiceSource.CustomerEstimate:
        if (opts.sourceKey) this.seed(this.vendorBillsSvc.previewInvoiceFromEstimate(opts.sourceKey));
        break;
      case CustomerInvoiceSource.VendorInvoice:
        if (opts.sourceKey) this.seed(this.vendorBillsSvc.previewInvoiceFromVendorInvoice(opts.sourceKey));
        break;
      case CustomerInvoiceSource.VendorEstimate:
        if (opts.sourceKey) this.seed(this.vendorBillsSvc.previewInvoiceFromVendorEstimate(opts.sourceKey));
        break;
      default:
        // Scratch — start with an empty grid; the admin adds lines via the "Add more line item" bar.
        this.rows.set([]);
        break;
    }

    // Terms is a dropdown (VendorNetTerm) for the editable scratch source, preselected to the customer's
    // configured NET term (or the "Net +10" default) — mirrors the legacy MgtJobSalesOrder/Index page. The
    // copy-from-estimate source keeps its read-only terms seeded from the estimate preview.
    if (opts.source !== CustomerInvoiceSource.CustomerEstimate && this.jobKey()) {
      this.loadTermOptions(this.jobKey());
    }
  }

  /** Loads the Terms dropdown options for the job's customer and preselects the default term. */
  private loadTermOptions(jobKey: string): void {
    this.vendorBillsSvc.getInvoiceTermsOptions(jobKey).subscribe((res) => {
      if (!res.status || !res.data) return;
      this.termOptions.set(res.data.options ?? []);
      // Only apply the default when the admin hasn't already picked/typed a term for this open session.
      if (!this.terms()) {
        this.terms.set(res.data.defaultTerm ?? '');
      }
    });
  }

  close(): void {
    if (this.saving()) return;
    this.isVisible.set(false);
  }

  private seed(obs: ReturnType<VendorBillsService['previewInvoiceFromEstimate']>): void {
    this.loading.set(true);
    obs.subscribe((res) => {
      this.loading.set(false);
      if (!res.status || !res.data) {
        this.errorMessage.set(res.message || 'Failed to load invoice preview.');
        return;
      }
      this.applyPreview(res.data);
    });
  }

  private applyPreview(data: PreviewCustomerInvoiceResponse): void {
    this.terms.set(data.terms ?? '');
    this.worksPerformed.set(data.worksPerformed ?? '');
    this.rows.set(
      (data.lineItems ?? []).map((li) => ({
        chargeTypeKey: li.chargeTypeKey ?? null,
        chargeType: li.chargeType ?? '',
        description: li.description ?? '',
        rate: Number(li.rate) || 0,
        qty: Number(li.qty) || 0,
        costIncurred: li.costIncurred ?? 1,
        display: li.display ?? null,
        lineType: li.lineType ?? null,
        vendorEstimateDetailKey: li.vendorEstimateDetailKey ?? null,
      })),
    );
  }

  // ── Grid editing (disabled for the copy-from-estimate source) ─────────────

  editRow(index: number, field: 'description' | 'qty' | 'rate', value: string): void {
    if (this.isCopyFromEstimate()) return;
    this.rows.update((rows) => {
      const next = [...rows];
      const r = { ...next[index] };
      if (field === 'description') r.description = value;
      else if (field === 'qty') r.qty = parseFloat(value) || 0;
      else r.rate = parseFloat(value) || 0;
      next[index] = r;
      return next;
    });
  }

  requestDelete(index: number): void {
    if (this.isCopyFromEstimate()) return;
    this.pendingDelete.set(index);
  }

  confirmDelete(): void {
    const index = this.pendingDelete();
    if (index === null) return;
    this.rows.update((rows) => rows.filter((_, i) => i !== index));
    this.pendingDelete.set(null);
  }

  cancelDelete(): void {
    this.pendingDelete.set(null);
  }

  /** "Add more line item" bar — mirrors create-customer-estimate-modal's addLine(). */
  addLine(): void {
    const opt = this.customChargeTypeOptions.find((o) => o.key === this.newChargeKey());
    if (!opt) {
      this.errorMessage.set('Choose a charge type to add.');
      return;
    }
    this.errorMessage.set('');
    this.rows.update((rows) => [
      ...rows,
      {
        // ChargeTypeKey is a real Guid? on the backend (CreateCustomerInvoiceRequest.LineItems[].ChargeTypeKey),
        // NOT a slug-resolving field like the estimate-update endpoint's — sending opt.key (e.g. "TRIP")
        // here throws in FlexibleNullableGuidConverter and silently nulls the whole request body. Leave it
        // null and use the slug only for the free-text chargeType label, like the pre-existing scratch flow did.
        chargeTypeKey: null,
        chargeType: opt.label,
        description: this.newCostIncurred() === 0 ? 'Cost Incurred' : 'Proposed',
        rate: this.newRate(),
        qty: this.newQty(),
        costIncurred: this.newCostIncurred(),
        display: null,
        lineType: opt.lineType,
        vendorEstimateDetailKey: null,
      },
    ]);
    this.newChargeKey.set('');
    this.newRate.set(0);
    this.newQty.set(1);
  }

  removeAdminFee(): void {
    this.adminOn.set(false);
  }

  rowAmount(row: InvRow): number {
    return (Number(row.rate) || 0) * (Number(row.qty) || 0);
  }

  // ── Save ───────────────────────────────────────────────────────────────

  save(): void {
    if (this.saving()) return;

    const isCopy = this.isCopyFromEstimate();

    if (!isCopy && this.rows().length === 0) {
      this.errorMessage.set('Add at least one line item.');
      return;
    }
    if (this.source() === CustomerInvoiceSource.Scratch && !this.jobKey()) {
      this.errorMessage.set('Missing job context for this invoice.');
      return;
    }
    this.errorMessage.set('');

    // Vendor-cost-exceeds warning (legacy CheckIfVendorCostsExceedsCustomerInvoiceTotal): confirm before
    // persisting when the job's vendor cost is >= the invoice total.
    const jobKey = this.jobKey();
    if (jobKey) {
      this.saving.set(true);
      this.vendorBillsSvc.checkVendorCost(jobKey, this.grandTotal()).subscribe((res) => {
        this.saving.set(false);
        if (res.status && res.data?.exceeds && res.data.message) {
          if (!confirm(`${res.data.message}\n\nCreate the invoice anyway?`)) return;
        }
        this.persist();
      });
    } else {
      this.persist();
    }
  }

  private persist(): void {
    const isCopy = this.isCopyFromEstimate();
    const lineItems: CustomerInvoiceLineItem[] = this.rows().map((r) => ({
      chargeTypeKey: r.chargeTypeKey,
      chargeType: r.chargeType,
      description: r.description,
      rate: Number(r.rate) || 0,
      qty: Number(r.qty) || 0,
      costIncurred: r.costIncurred,
      display: r.display,
      lineType: r.lineType,
      vendorEstimateDetailKey: r.vendorEstimateDetailKey,
    }));

    const request: CreateCustomerInvoiceRequest = {
      source: this.source(),
      jobKey: this.jobKey() || null,
      sourceKey: this.sourceKey(),
      vendorEstimateKeys: this.vendorEstimateKeys().length > 1 ? this.vendorEstimateKeys() : null,
      terms: this.terms() || null,
      worksPerformed: this.worksPerformed() || null,
      // The copy-from-estimate path is server-driven; sending lines would be ignored.
      lineItems: isCopy ? null : lineItems,
      addAdminFee: this.adminOn() && this.adminMarkupPercent() > 0,
      adminFeePercent: this.adminOn() ? this.adminMarkupPercent() : null,
      sendToPrepManager: this.sendToPrepManager(),
    };

    this.saving.set(true);
    this.errorMessage.set('');

    this.vendorBillsSvc.createCustomerInvoice(request).subscribe((res) => {
      this.saving.set(false);
      if (!res.status || !res.data) {
        this.errorMessage.set(res.message || 'Failed to create customer invoice.');
        return;
      }
      this.successMessage.set(
        res.data.invoiceNo
          ? `Customer invoice #${res.data.invoiceNo} created.`
          : 'Customer invoice created.',
      );
      this.customerInvoiceCreated.emit({
        customerInvoiceKey: res.data.customerInvoiceKey,
        invoiceNo: res.data.invoiceNo ?? null,
      });
      this.isVisible.set(false);
    });
  }

  formatCurrency(value: number): string {
    return `$${(Number(value) || 0).toFixed(2)}`;
  }

  private defaultLabel(source: CustomerInvoiceSourceValue): string {
    switch (source) {
      case CustomerInvoiceSource.CustomerEstimate:
        return 'From Customer Estimate';
      case CustomerInvoiceSource.VendorInvoice:
        return 'From Vendor Invoice';
      case CustomerInvoiceSource.VendorEstimate:
        return 'From Vendor Estimate';
      default:
        return 'From Scratch';
    }
  }
}
