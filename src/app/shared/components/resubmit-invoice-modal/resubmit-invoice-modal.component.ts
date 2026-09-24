import { Component, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { VendorBillsService } from '../../../services/vendor-bills.service';
import { CustomerInvoiceListItem } from '../../../models/customer-invoice.model';

/**
 * Reopens a sent invoice for editing and re-sending (IsResubmit/ResubmitRemark).
 *
 * NOTE: this has no legacy V1 precedent — ProjectRCS never exposed a "resubmit" action for
 * customer invoices (only a passive status label on the customer's own estimate response).
 * This UI exists purely because RFIJobOps.CustomerInvoiceService already has a backend
 * ResubmitCustomerInvoiceAsync method using the existing IsResubmit/ResubmitRemark columns.
 */
@Component({
  selector: 'app-resubmit-invoice-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './resubmit-invoice-modal.component.html',
  styleUrls: ['./resubmit-invoice-modal.component.scss'],
})
export class ResubmitInvoiceModalComponent {
  private readonly vendorBillsSvc = inject(VendorBillsService);

  readonly completed = output<string>();

  readonly isVisible = signal(false);
  readonly saving = signal(false);
  readonly errorMessage = signal('');
  readonly row = signal<CustomerInvoiceListItem | null>(null);
  readonly resubmitRemark = signal('');

  open(row: CustomerInvoiceListItem): void {
    this.row.set(row);
    this.resubmitRemark.set('');
    this.errorMessage.set('');
    this.saving.set(false);
    this.isVisible.set(true);
  }

  close(): void {
    if (this.saving()) return;
    this.isVisible.set(false);
  }

  confirm(): void {
    const row = this.row();
    if (!row) return;

    this.saving.set(true);
    this.errorMessage.set('');
    this.vendorBillsSvc
      .resubmitCustomerInvoice({
        customerInvoiceKey: row.customerInvoiceKey,
        resubmitRemark: this.resubmitRemark() || null,
      })
      .subscribe((res) => {
        this.saving.set(false);
        if (!res.status || !res.data) {
          this.errorMessage.set(res.message || 'Failed to reopen invoice for resubmission.');
          return;
        }
        this.isVisible.set(false);
        this.completed.emit(res.data.message);
      });
  }
}
