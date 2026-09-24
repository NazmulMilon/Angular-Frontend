import { Component, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { VendorBillsService } from '../../../services/vendor-bills.service';
import {
  CustomerInvoiceListItem,
  InvoiceReceivableAction,
} from '../../../models/customer-invoice.model';

/**
 * Mark paid / push to QuickBooks / mark manually sent to customer / mark unpaid — the native
 * replacement for legacy ProcessInvoice's action bar (b1=1/2/3) plus SetInvoiceToUnpaid.
 */
@Component({
  selector: 'app-invoice-receivables-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './invoice-receivables-modal.component.html',
  styleUrls: ['./invoice-receivables-modal.component.scss'],
})
export class InvoiceReceivablesModalComponent {
  private readonly vendorBillsSvc = inject(VendorBillsService);

  /** Fired after any receivables action succeeds, with a human-readable summary. */
  readonly completed = output<string>();

  readonly isVisible = signal(false);
  readonly saving = signal(false);
  readonly errorMessage = signal('');
  readonly row = signal<CustomerInvoiceListItem | null>(null);

  // Sub-form reveal state, mirroring legacy #qb / #chq visibility toggles.
  readonly showQbField = signal(false);
  readonly showCheckField = signal(false);
  readonly qbRefNo = signal('');
  readonly checkNo = signal('');
  readonly unpaidNote = signal('');
  readonly showUnpaidField = signal(false);

  open(row: CustomerInvoiceListItem): void {
    this.row.set(row);
    this.errorMessage.set('');
    this.saving.set(false);
    this.showQbField.set(false);
    this.showCheckField.set(false);
    this.showUnpaidField.set(false);
    this.qbRefNo.set('');
    this.checkNo.set('');
    this.unpaidNote.set('');
    this.isVisible.set(true);
  }

  close(): void {
    if (this.saving()) return;
    this.isVisible.set(false);
  }

  // ── Push to QuickBooks ───────────────────────────────────────────────────

  revealQbField(): void {
    this.showQbField.set(true);
  }

  confirmPushToQb(): void {
    if (!this.qbRefNo().trim()) {
      this.errorMessage.set('Please enter the QuickBooks reference number.');
      return;
    }
    this.submit(InvoiceReceivableAction.PushToQuickBooks, { checkNo: this.qbRefNo() });
  }

  // ── Mark paid ────────────────────────────────────────────────────────────

  revealCheckField(): void {
    this.showCheckField.set(true);
  }

  confirmMarkPaid(): void {
    if (!this.checkNo().trim()) {
      this.errorMessage.set('Please enter the check number.');
      return;
    }
    this.submit(InvoiceReceivableAction.MarkPaid, { checkNo: this.checkNo() });
  }

  // ── Manually sent to customer ────────────────────────────────────────────

  confirmManuallySent(): void {
    this.submit(InvoiceReceivableAction.ManuallySentToCustomer, {});
  }

  // ── Mark unpaid ──────────────────────────────────────────────────────────

  revealUnpaidField(): void {
    this.showUnpaidField.set(true);
  }

  confirmMarkUnpaid(): void {
    if (!confirm('Are you sure that you want to mark this invoice as un-paid?')) return;
    this.submit(InvoiceReceivableAction.MarkUnpaid, { note: this.unpaidNote() });
  }

  private submit(action: number, extra: { checkNo?: string; note?: string }): void {
    const row = this.row();
    if (!row) return;

    this.saving.set(true);
    this.errorMessage.set('');
    this.vendorBillsSvc
      .updateInvoiceReceivables({
        invoiceKey: row.customerInvoiceKey,
        action: action as any,
        checkNo: extra.checkNo ?? null,
        note: extra.note ?? null,
        isDeposit: false,
      })
      .subscribe((res) => {
        this.saving.set(false);
        if (!res.status || !res.data) {
          this.errorMessage.set(res.message || 'Failed to update invoice.');
          return;
        }
        this.isVisible.set(false);
        this.completed.emit(res.data.message);
      });
  }
}
