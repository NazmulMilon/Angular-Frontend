import { Component, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { VendorBillsService } from '../../../services/vendor-bills.service';
import { CustomerInvoiceListItem } from '../../../models/customer-invoice.model';

/**
 * Void (soft-delete) a customer invoice — the native replacement for legacy RemoveInvoice's
 * manager-approval modal (#DeleteInvoicePermission). Requires an approving-manager name and a
 * remark before the void request is sent; the backend blocks the void (and this modal surfaces
 * the exact legacy guard message) if any partial-pay row has already been paid.
 */
@Component({
  selector: 'app-void-invoice-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './void-invoice-modal.component.html',
  styleUrls: ['./void-invoice-modal.component.scss'],
})
export class VoidInvoiceModalComponent {
  private readonly vendorBillsSvc = inject(VendorBillsService);

  readonly completed = output<string>();

  readonly isVisible = signal(false);
  readonly saving = signal(false);
  readonly errorMessage = signal('');
  readonly row = signal<CustomerInvoiceListItem | null>(null);

  readonly approvingManagerName = signal('');
  readonly remarks = signal('');

  open(row: CustomerInvoiceListItem): void {
    this.row.set(row);
    this.approvingManagerName.set('');
    this.remarks.set('');
    this.errorMessage.set('');
    this.saving.set(false);
    this.isVisible.set(true);
  }

  close(): void {
    if (this.saving()) return;
    this.isVisible.set(false);
  }

  confirm(): void {
    if (!this.approvingManagerName().trim()) {
      this.errorMessage.set('Please enter the name of the manager who approved.');
      return;
    }
    if (!this.remarks().trim()) {
      this.errorMessage.set('Please enter remarks.');
      return;
    }

    const row = this.row();
    if (!row) return;

    this.saving.set(true);
    this.errorMessage.set('');
    // The approving manager's name and remarks are recorded server-side on DeleteManager /
    // DeleteManagerRemark; combine them into Reason since the API takes one free-text field.
    const reason = `Approved by: ${this.approvingManagerName()}. ${this.remarks()}`;

    this.vendorBillsSvc
      .voidCustomerInvoice({ customerInvoiceKey: row.customerInvoiceKey, reason })
      .subscribe((res) => {
        this.saving.set(false);
        if (!res.status || !res.data) {
          // Mirrors legacy's exact paid-invoice guard message when the backend blocks the void.
          this.errorMessage.set(
            res.message || 'This invoice cannot be deleted because payment has been made by the customer on this invoice.',
          );
          return;
        }
        this.isVisible.set(false);
        this.completed.emit(res.data.message);
      });
  }
}
