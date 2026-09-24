import { Component, computed, inject, input, output, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { VendorBillsService } from '../../../services/vendor-bills.service';
import { CustomerInvoiceListItem } from '../../../models/customer-invoice.model';
import { InvoiceReceivablesModalComponent } from '../invoice-receivables-modal/invoice-receivables-modal.component';
import { SendInvoiceEmailModalComponent } from '../send-invoice-email-modal/send-invoice-email-modal.component';
import { CreateCustomerInvoiceFromVendorModalComponent } from '../create-customer-invoice-from-vendor-modal/create-customer-invoice-from-vendor-modal.component';
import { VoidInvoiceModalComponent } from '../void-invoice-modal/void-invoice-modal.component';
import { ResubmitInvoiceModalComponent } from '../resubmit-invoice-modal/resubmit-invoice-modal.component';

/**
 * Customer-invoices grid for a job — the native replacement for the invoice rows of the legacy
 * SaleEstimated dashboard. Read-heavy list with per-row actions that open the sibling lifecycle
 * modals (receivables, email, edit, void, resubmit).
 *
 * Edit opens CreateCustomerInvoiceFromVendorModalComponent in mode:'edit' — the rich vendor-comparison
 * grid/markup-gate editor, replacing the retired flat EditInvoiceModalComponent.
 */
@Component({
  selector: 'app-customer-invoices-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    InvoiceReceivablesModalComponent,
    SendInvoiceEmailModalComponent,
    CreateCustomerInvoiceFromVendorModalComponent,
    VoidInvoiceModalComponent,
    ResubmitInvoiceModalComponent,
  ],
  templateUrl: './customer-invoices-list.component.html',
  styleUrls: ['./customer-invoices-list.component.scss'],
})
export class CustomerInvoicesListComponent {
  private readonly vendorBillsSvc = inject(VendorBillsService);

  readonly jobKey = input.required<string>();
  /** Set from the review-email deep link (?customerInvoiceKey=) — highlights the matching row. */
  readonly highlightInvoiceKey = input<string | null>(null);
  /** Fired after any lifecycle action changes invoice state, so a parent page can refresh siblings. */
  readonly invoicesChanged = output<void>();

  @ViewChild(InvoiceReceivablesModalComponent) receivablesModal!: InvoiceReceivablesModalComponent;
  @ViewChild(SendInvoiceEmailModalComponent) emailModal!: SendInvoiceEmailModalComponent;
  @ViewChild(CreateCustomerInvoiceFromVendorModalComponent) editInvoiceModal!: CreateCustomerInvoiceFromVendorModalComponent;
  @ViewChild(VoidInvoiceModalComponent) voidModal!: VoidInvoiceModalComponent;
  @ViewChild(ResubmitInvoiceModalComponent) resubmitModal!: ResubmitInvoiceModalComponent;

  readonly invoices = signal<CustomerInvoiceListItem[]>([]);
  readonly isLoading = signal(false);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');

  readonly searchText = signal('');
  readonly pageSize = signal(10);
  readonly currentPage = signal(1);
  readonly pageSizeOptions = [10, 25, 50, 100];

  readonly filteredInvoices = computed(() => {
    const term = this.searchText().trim().toLowerCase();
    const rows = this.invoices();
    if (!term) return rows;
    return rows.filter(
      (r) =>
        String(r.invoiceNo ?? '').includes(term) ||
        (r.checkNo ?? '').toLowerCase().includes(term) ||
        r.estimateStatus.toLowerCase().includes(term),
    );
  });

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredInvoices().length / this.pageSize())),
  );

  readonly showingFrom = computed(() => {
    const total = this.filteredInvoices().length;
    return total === 0 ? 0 : (this.currentPage() - 1) * this.pageSize() + 1;
  });

  readonly showingTo = computed(() =>
    Math.min(this.currentPage() * this.pageSize(), this.filteredInvoices().length),
  );

  readonly paginatedInvoices = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize();
    return this.filteredInvoices().slice(start, start + this.pageSize());
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    const jobKey = this.jobKey();
    if (!jobKey) return;
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.vendorBillsSvc.listCustomerInvoices(jobKey).subscribe((res) => {
      this.isLoading.set(false);
      if (!res.status || !res.data) {
        this.errorMessage.set(res.message || 'Failed to load customer invoices.');
        return;
      }
      this.invoices.set(res.data.invoices ?? []);
    });
  }

  onSearchInput(value: string): void {
    this.searchText.set(value);
    this.currentPage.set(1);
  }

  onPageSizeChange(size: number | string): void {
    this.pageSize.set(Number(size) || 10);
    this.currentPage.set(1);
  }

  goToPage(page: number): void {
    this.currentPage.set(Math.max(1, Math.min(page, this.totalPages())));
  }

  statusVariant(row: CustomerInvoiceListItem): string {
    if (row.invoicePaid) return 'approved';
    if (row.estimateStatus === 'Deposit Invoice') return 'pending';
    return 'default';
  }

  formatDate(value?: string | null): string {
    if (!value) return '—';
    const d = new Date(value);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
  }

  formatCurrency(value: number): string {
    return `$${(Number(value) || 0).toFixed(2)}`;
  }

  // ── Row actions ────────────────────────────────────────────────────────

  openReceivables(row: CustomerInvoiceListItem): void {
    this.receivablesModal.open(row);
  }

  openEmail(row: CustomerInvoiceListItem): void {
    this.emailModal.open(row);
  }

  openEdit(row: CustomerInvoiceListItem): void {
    this.editInvoiceModal.open({
      jobKey: this.jobKey(),
      customerInvoiceKey: row.customerInvoiceKey,
      mode: 'edit',
    });
  }

  openVoid(row: CustomerInvoiceListItem): void {
    this.voidModal.open(row);
  }

  openResubmit(row: CustomerInvoiceListItem): void {
    this.resubmitModal.open(row);
  }

  /** Authenticated "Approve to Send" decision — only reachable by a logged-in admin, never an email link. */
  approvePrepReview(row: CustomerInvoiceListItem): void {
    this.vendorBillsSvc.submitPrepReviewDecision(row.customerInvoiceKey, true).subscribe((res) => {
      if (!res.status) {
        this.errorMessage.set(res.message || 'Failed to approve invoice.');
        return;
      }
      this.onActionCompleted('Invoice approved to send to customer.');
    });
  }

  /** Authenticated "Request Change" decision — prompts for a required note. */
  declinePrepReview(row: CustomerInvoiceListItem): void {
    const note = window.prompt('What needs to change on this invoice?');
    if (note == null) return;
    if (!note.trim()) {
      this.errorMessage.set('A note is required when requesting a change.');
      return;
    }
    this.vendorBillsSvc.submitPrepReviewDecision(row.customerInvoiceKey, false, note.trim()).subscribe((res) => {
      if (!res.status) {
        this.errorMessage.set(res.message || 'Failed to submit change request.');
        return;
      }
      this.onActionCompleted('Change request recorded.');
    });
  }

  onActionCompleted(message: string): void {
    this.successMessage.set(message);
    this.errorMessage.set('');
    this.load();
    this.invoicesChanged.emit();
  }
}
