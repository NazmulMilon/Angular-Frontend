import { Component, computed, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { VendorBillsService } from '../../../services/vendor-bills.service';
import { CustomerInvoiceListItem, CustomerInvoiceRecipient } from '../../../models/customer-invoice.model';

/**
 * Email a customer invoice — the native replacement for legacy EmailInvoiceToCustomer's compose
 * screen. Recipient checkboxes are loaded from the job's account + location contacts, mirroring
 * the customer-estimate send modal's recipient-picker pattern.
 */
@Component({
  selector: 'app-send-invoice-email-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './send-invoice-email-modal.component.html',
  styleUrls: ['./send-invoice-email-modal.component.scss'],
})
export class SendInvoiceEmailModalComponent {
  private readonly vendorBillsSvc = inject(VendorBillsService);

  readonly completed = output<string>();

  readonly isVisible = signal(false);
  readonly loadingRecipients = signal(false);
  readonly sending = signal(false);
  readonly errorMessage = signal('');
  readonly row = signal<CustomerInvoiceListItem | null>(null);

  readonly accountContacts = signal<CustomerInvoiceRecipient[]>([]);
  readonly locationContacts = signal<CustomerInvoiceRecipient[]>([]);
  readonly selectedContactKeys = signal<Set<string>>(new Set());
  readonly customNotes = signal('');

  readonly allRecipients = computed(() => [...this.accountContacts(), ...this.locationContacts()]);

  open(row: CustomerInvoiceListItem): void {
    this.row.set(row);
    this.errorMessage.set('');
    this.sending.set(false);
    this.customNotes.set('');
    this.accountContacts.set([]);
    this.locationContacts.set([]);
    this.selectedContactKeys.set(new Set());
    this.isVisible.set(true);

    this.loadingRecipients.set(true);
    this.vendorBillsSvc.getCustomerInvoiceRecipients(row.customerInvoiceKey).subscribe((res) => {
      this.loadingRecipients.set(false);
      if (!res.status || !res.data) {
        this.errorMessage.set(res.message || 'Failed to load recipients.');
        return;
      }
      this.accountContacts.set(res.data.accountContacts ?? []);
      this.locationContacts.set(res.data.locationContacts ?? []);

      const preselected = new Set(
        [...(res.data.accountContacts ?? []), ...(res.data.locationContacts ?? [])]
          .filter((c) => c.isJobDefaultContact)
          .map((c) => c.contactKey),
      );
      this.selectedContactKeys.set(preselected);
    });
  }

  close(): void {
    if (this.sending()) return;
    this.isVisible.set(false);
  }

  isSelected(contactKey: string): boolean {
    return this.selectedContactKeys().has(contactKey);
  }

  toggleRecipient(contactKey: string): void {
    this.selectedContactKeys.update((set) => {
      const next = new Set(set);
      if (next.has(contactKey)) next.delete(contactKey);
      else next.add(contactKey);
      return next;
    });
  }

  send(): void {
    if (this.selectedContactKeys().size === 0) {
      this.errorMessage.set('Please select at least one recipient.');
      return;
    }

    const row = this.row();
    if (!row) return;

    this.sending.set(true);
    this.errorMessage.set('');
    this.vendorBillsSvc
      .sendCustomerInvoiceEmail({
        customerInvoiceKey: row.customerInvoiceKey,
        contactKeys: Array.from(this.selectedContactKeys()),
        customNotes: this.customNotes() || null,
      })
      .subscribe((res) => {
        this.sending.set(false);
        if (!res.status || !res.data || !res.data.success) {
          this.errorMessage.set(res.data?.message || res.message || 'Failed to send invoice email.');
          return;
        }
        this.isVisible.set(false);
        this.completed.emit(res.data.message);
      });
  }
}
