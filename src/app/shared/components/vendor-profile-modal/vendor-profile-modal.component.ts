import { Component, effect, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { VendorProfileService } from '../../../features/accounting/move-to-accounting/vendor-profile.service';
import { VendorProfile, VendorProfileContact } from '../../../features/accounting/move-to-accounting/vendor-profile.model';

/** "👤 Vendor Profile — registration snapshot" popup -- read-only consolidation of the 6
 *  legacy ProjectRCS vendor-admin screens (MgtVendor/EditVendor, CreateContact, CreateTrade,
 *  Rates, VendorNotes, VendorInsuranceHistory). View-only -- editing stays in Admin Portal V1. */
@Component({
  selector: 'app-vendor-profile-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './vendor-profile-modal.component.html',
  styleUrl: './vendor-profile-modal.component.scss',
})
export class VendorProfileModalComponent {
  private readonly vendorProfileSvc = inject(VendorProfileService);

  isOpen = input(false);
  jobKey = input<string | null>(null);
  vendorKey = input<string | null>(null);

  readonly closed = output<void>();

  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly data = signal<VendorProfile | null>(null);

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
    this.vendorProfileSvc.get(jobKey, vendorKey).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.data.set(res);
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('Unable to load this vendor\'s profile. Please try again.');
      },
    });
  }

  onClose(): void {
    this.closed.emit();
  }

  onOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.onClose();
  }

  insuranceStateLabel(carries: boolean | null, expiry: string | null): { label: string; cls: string } {
    if (!carries) return { label: 'Not carried', cls: 'vp-text-gray' };
    if (!expiry) return { label: '⚠ No expiry on file', cls: 'vp-text-amber' };
    const expiryDate = new Date(expiry);
    if (Number.isNaN(expiryDate.getTime())) return { label: '⚠ Invalid date on file', cls: 'vp-text-amber' };
    return expiryDate.getTime() < Date.now()
      ? { label: '⛔ Expired ' + this.formatDate(expiry), cls: 'vp-text-red' }
      : { label: '✓ Current thru ' + this.formatDate(expiry), cls: 'vp-text-green' };
  }

  formatDate(value: string | null): string {
    if (!value) return '--';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
  }

  formatDateTime(value: string | null): string {
    if (!value) return '--';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
  }

  formatMoney(value: number | null): string {
    if (value === null || value === undefined) return '--';
    return value.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
  }

  initials(name: string | null): string {
    return (name || '?')
      .split(' ')
      .filter((w) => w.length)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }

  /** The contact shown top-right in the header, mirroring complete-screen-v2.html's card layout. */
  defaultContact(d: VendorProfile): VendorProfileContact | null {
    return d.contacts.find((c) => c.isDefault) ?? null;
  }

  /** Every other contact, shown compactly below the header. */
  otherContacts(d: VendorProfile): VendorProfileContact[] {
    const def = this.defaultContact(d);
    return d.contacts.filter((c) => c !== def);
  }

  /** "Net 45 terms ✓ agreed" when a term is on file, else a plain "Not set". */
  netTermsDisplay(netTermsName: string | null): string {
    if (!netTermsName) return 'Not set';
    return /terms/i.test(netTermsName) ? `${netTermsName} ✓ agreed` : `${netTermsName} terms ✓ agreed`;
  }

  formatPercent(value: number | null): string {
    if (value === null || value === undefined) return '--';
    return `${value}%`;
  }
}
