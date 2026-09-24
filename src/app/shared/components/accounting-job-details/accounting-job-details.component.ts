import { Component, OnChanges, OnDestroy, SimpleChanges, computed, inject, input, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { takeUntil, Subject } from 'rxjs';

import { AssignVendorService } from '../../../services/assign-vendor.service';
import { AssignedVendorDetail, JobHeaderDetail } from '../../../models/assign-vendor.model';

/**
 * Read-only "Job Details" accordion for the Accounting V2 screens (Move to Accounting /
 * Invoice the Customer, Unapproved Vendor Bills, Payables & Receivables, Recalls, Deposit).
 *
 * Visually this mirrors the prototype at `complete-screen-v2.html` (`jobDetailsHTML()`) —
 * `.jd-head` / `.jd-body` / `.jd-grid` / `.kv` — NOT the legacy `JobDetailsAccordionComponent`
 * used by Assign Vendor / Estimates / Customer & Vendor Invoicing / Notes & Activity, which has
 * its own established look-and-feel that other pages already depend on.
 *
 * Data comes from the same {@link AssignVendorService#loadJobHeaderDetail} call the legacy
 * accordion uses — there is only one job-header endpoint, this component just renders it
 * differently. Unlike the legacy accordion, this component is read-only: the Accounting
 * screens don't edit trade/priority/requestor from here, they only need to see it.
 *
 * Built as a standalone, jobKey-driven component (same contract as the legacy accordion:
 * `[jobKey]` input) specifically so it can be dropped into all five Accounting V2 tabs without
 * duplicating this markup/logic per tab.
 */
@Component({
  selector: 'app-accounting-job-details',
  standalone: true,
  imports: [CurrencyPipe, DatePipe],
  templateUrl: './accounting-job-details.component.html',
  styleUrl: './accounting-job-details.component.scss',
})
export class AccountingJobDetailsComponent implements OnChanges, OnDestroy {
  private readonly assignVendorSvc = inject(AssignVendorService);
  private readonly destroy$ = new Subject<void>();

  jobKey = input('');
  /** Whether the accordion body starts expanded. Matches the legacy accordion's contract. */
  defaultOpen = input(false);

  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly jobHeaderDetail = signal<JobHeaderDetail | null>(null);
  readonly isOpen = signal(false);

  /** Vendors currently assigned (not unassigned/deleted) — everything else here is display-only. */
  private readonly activeVendors = computed<AssignedVendorDetail[]>(() =>
    (this.jobHeaderDetail()?.assignedVendors ?? []).filter((v) => !v.isDelete),
  );

  /** Sum of RevVendorDNE across active vendors — the "Revised Vendor DNE" chip/row. */
  readonly revVendorTotal = computed(() =>
    this.activeVendors().reduce((sum, v) => sum + (v.revVendorDne ?? 0), 0),
  );

  /** Sum of the original VendorDNE across active vendors, used to show a struck-through amount
   *  when the revised total has changed (mirrors the prototype's `origVendorTotal` compare). */
  readonly origVendorTotal = computed(() =>
    this.activeVendors().reduce((sum, v) => sum + (v.vendorDne ?? 0), 0),
  );

  readonly vendorDneChanged = computed(
    () => this.origVendorTotal() !== this.revVendorTotal(),
  );

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['jobKey']) {
      this.isOpen.set(this.defaultOpen());
      const key = this.jobKey()?.trim() ?? '';
      if (key) {
        this.loadJobDetails(key);
      } else {
        this.jobHeaderDetail.set(null);
      }
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  toggle(): void {
    this.isOpen.update((open) => !open);
  }

  private loadJobDetails(jobKey: string): void {
    this.loading.set(true);
    this.errorMessage.set('');
    this.assignVendorSvc
      .loadJobHeaderDetail(jobKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.loading.set(false);
          if (res.status && res.data) {
            this.jobHeaderDetail.set(res.data);
          } else {
            this.errorMessage.set(res.message || 'Failed to load job details.');
          }
        },
        error: () => {
          this.loading.set(false);
          this.errorMessage.set('Failed to load job details.');
        },
      });
  }
}
