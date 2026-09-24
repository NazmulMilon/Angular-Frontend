import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { environment } from '../../../../environments/environment';
import {
  VendorProfileEmail,
  VendorProfileEmailsService,
} from '../../../services/vendor-profile-emails.service';

type SentStatus = 'pending' | 'sent' | 'error' | 'completed';

interface TabDef {
  key: SentStatus;
  label: string;
  description: string;
  accent: 'amber' | 'green' | 'red' | 'blue';
}

@Component({
  selector: 'app-vendor-profile-emails',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './vendor-profile-emails.component.html',
  styleUrl: './vendor-profile-emails.component.scss',
})
export class VendorProfileEmailsComponent implements OnInit {
  private readonly service = inject(VendorProfileEmailsService);
  private readonly legacyBase = environment.legacyAdminBaseUrl.replace(/\/$/, '');

  protected readonly tabs: TabDef[] = [
    { key: 'pending', label: 'Pending', description: 'Vendors whose reminder email has not been sent yet.', accent: 'amber' },
    { key: 'sent', label: 'Sent', description: 'Vendors who were successfully emailed a profile-completion request.', accent: 'blue' },
    { key: 'error', label: 'Errored', description: 'Emails not sent due to a faulty or missing contact.', accent: 'red' },
    { key: 'completed', label: 'Completed', description: 'Vendors who completed their profile after receiving the email.', accent: 'green' },
  ];

  protected readonly activeTab = signal<SentStatus>('pending');
  protected readonly records = signal<VendorProfileEmail[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.getAll().subscribe({
      next: (rows) => {
        this.records.set(rows ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load profile emails. Please try again.');
        this.loading.set(false);
      },
    });
  }

  protected readonly filteredRecords = computed(() =>
    this.records().filter((r) => r.status === this.activeTab())
  );

  protected readonly activeTabDef = computed(
    () => this.tabs.find((t) => t.key === this.activeTab()) ?? this.tabs[0]
  );

  countFor(key: SentStatus): number {
    return this.records().filter((r) => r.status === key).length;
  }

  setTab(key: SentStatus): void {
    this.activeTab.set(key);
  }

  vendorProfileUrl(vendorKey: string | null): string {
    return vendorKey ? `${this.legacyBase}/MgtVendor/EditVendor?id=${vendorKey}` : '#';
  }
}
