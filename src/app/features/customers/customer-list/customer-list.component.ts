import { Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

import { ButtonComponent } from '../../../shared/components/button/button.component';
import {
  SearchableSelectComponent,
  SearchableSelectOption,
} from '../../../shared/components/searchable-select/searchable-select.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import {
  AccountManagerOption,
  CustomerListRow,
  CustomerListService,
} from '../../../services/customer-list.service';

type StatusFilter = 'active' | 'inactive';
type SortField = 'name' | 'accountManager' | 'broadcast';
type SortDir = 'asc' | 'desc';

/**
 * Customer List (RFI-343) — unified replacement for the legacy MgtCustomer
 * Index / DIndex / AssignAccountManager / AssignPriviledgeForAutoVendorWOBlast pages.
 *
 * One screen with an Active / Deactivated toggle, debounced server-side search,
 * sortable columns and paging, multi-row selection driving bulk actions
 * (assign account manager, enable/disable vendor broadcast, activate/deactivate),
 * plus per-row activate/deactivate. All search/sort/paging happens server-side so
 * the list stays responsive over thousands of records.
 */
@Component({
  selector: 'app-customer-list',
  standalone: true,
  imports: [FormsModule, ButtonComponent, SearchableSelectComponent, ConfirmDialogComponent],
  templateUrl: './customer-list.component.html',
  styleUrl: './customer-list.component.scss',
})
export class CustomerListComponent implements OnInit {
  private readonly service = inject(CustomerListService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly confirmDialog = viewChild.required(ConfirmDialogComponent);

  readonly Math = Math;

  // ── List state ──────────────────────────────────────────────────────────
  protected readonly rows = signal<CustomerListRow[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(25);
  protected readonly status = signal<StatusFilter>('active');
  protected readonly search = signal('');
  protected readonly sortBy = signal<SortField>('name');
  protected readonly sortDir = signal<SortDir>('asc');

  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly successMessage = signal<string | null>(null);

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.total() / this.pageSize())),
  );
  protected readonly rangeStart = computed(() =>
    this.total() === 0 ? 0 : (this.page() - 1) * this.pageSize() + 1,
  );
  protected readonly rangeEnd = computed(() =>
    Math.min(this.page() * this.pageSize(), this.total()),
  );

  // ── Selection ───────────────────────────────────────────────────────────
  protected readonly selected = signal<Set<string>>(new Set());
  protected readonly selectedCount = computed(() => this.selected().size);
  protected readonly allOnPageSelected = computed(() => {
    const list = this.rows();
    if (list.length === 0) return false;
    const sel = this.selected();
    return list.every((r) => sel.has(r.customerKey));
  });

  // ── Assign-account-manager modal ─────────────────────────────────────────
  protected readonly showAssignModal = signal(false);
  protected readonly amOptions = signal<SearchableSelectOption[]>([]);
  protected readonly amLoading = signal(false);
  protected readonly selectedAmKey = signal<string>('');

  private readonly searchInput$ = new Subject<string>();

  constructor() {
    this.searchInput$
      .pipe(debounceTime(350), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((term) => {
        this.search.set(term);
        this.page.set(1);
        this.load();
      });
  }

  ngOnInit(): void {
    // Show a success note when returning from a successful create.
    if (this.route.snapshot.queryParamMap.get('created') === '1') {
      this.successMessage.set('Customer created successfully.');
      setTimeout(() => this.successMessage.set(null), 4000);
      this.router.navigate([], { queryParams: {}, replaceUrl: true });
    }
    this.load();
  }

  /** Navigate to the Add New Customer form. */
  protected goToCreate(): void {
    this.router.navigate(['/customers/new']);
  }

  /** Navigate to the Edit Customer page (RFI-345). */
  protected goToEdit(row: CustomerListRow): void {
    this.router.navigate(['/customers', row.customerKey, 'edit']);
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service
      .list({
        status: this.status(),
        search: this.search(),
        sortBy: this.sortBy(),
        sortDir: this.sortDir(),
        page: this.page(),
        pageSize: this.pageSize(),
      })
      .subscribe({
        next: (result) => {
          this.rows.set(result.rows);
          this.total.set(result.total);
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(this.messageFrom(err, 'Failed to load customers.'));
          this.rows.set([]);
          this.total.set(0);
          this.loading.set(false);
        },
      });
  }

  // ── Filters / search / sort ────────────────────────────────────────────────
  protected onSearchInput(value: string): void {
    this.searchInput$.next(value);
  }

  protected setStatus(status: StatusFilter): void {
    if (this.status() === status) return;
    this.status.set(status);
    this.page.set(1);
    this.clearSelection();
    this.load();
  }

  protected sort(field: SortField): void {
    if (this.sortBy() === field) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortBy.set(field);
      this.sortDir.set('asc');
    }
    this.page.set(1);
    this.load();
  }

  // ── Paging ──────────────────────────────────────────────────────────────────
  protected goToPage(target: number): void {
    const clamped = Math.min(Math.max(1, target), this.totalPages());
    if (clamped === this.page()) return;
    this.page.set(clamped);
    this.load();
  }

  protected changePageSize(size: number): void {
    this.pageSize.set(size);
    this.page.set(1);
    this.load();
  }

  // ── Selection ────────────────────────────────────────────────────────────────
  protected isSelected(key: string): boolean {
    return this.selected().has(key);
  }

  protected toggleRow(key: string): void {
    const next = new Set(this.selected());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.selected.set(next);
  }

  protected toggleAllOnPage(): void {
    const next = new Set(this.selected());
    if (this.allOnPageSelected()) {
      this.rows().forEach((r) => next.delete(r.customerKey));
    } else {
      this.rows().forEach((r) => next.add(r.customerKey));
    }
    this.selected.set(next);
  }

  protected clearSelection(): void {
    this.selected.set(new Set());
  }

  // ── Bulk: assign account manager ───────────────────────────────────────────────
  protected openAssignModal(): void {
    if (this.selectedCount() === 0) return;
    this.selectedAmKey.set('');
    this.showAssignModal.set(true);
    if (this.amOptions().length === 0) this.loadAccountManagers();
  }

  protected closeAssignModal(): void {
    this.showAssignModal.set(false);
  }

  private loadAccountManagers(): void {
    this.amLoading.set(true);
    this.service.getAccountManagers().subscribe({
      next: (options: AccountManagerOption[]) => {
        this.amOptions.set(options.map((o) => ({ value: o.personnelKey, text: o.name })));
        this.amLoading.set(false);
      },
      error: (err) => {
        this.error.set(this.messageFrom(err, 'Failed to load account managers.'));
        this.amLoading.set(false);
      },
    });
  }

  protected confirmAssign(): void {
    const managerKey = this.selectedAmKey();
    if (!managerKey || this.selectedCount() === 0) return;
    const keys = [...this.selected()];
    this.saving.set(true);
    this.service.assignAccountManager(managerKey, keys).subscribe({
      next: (result) => {
        this.saving.set(false);
        this.showAssignModal.set(false);
        this.afterBulk(`Account manager assigned to ${result.updated} customer(s).`);
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(this.messageFrom(err, 'Failed to assign account manager.'));
      },
    });
  }

  // ── Bulk: broadcast ──────────────────────────────────────────────────────────────
  protected setBroadcast(enabled: boolean): void {
    if (this.selectedCount() === 0) return;
    const keys = [...this.selected()];
    this.saving.set(true);
    this.service.setBroadcast(keys, enabled).subscribe({
      next: (result) => {
        this.saving.set(false);
        this.afterBulk(
          `Vendor broadcast ${enabled ? 'enabled' : 'disabled'} for ${result.updated} customer(s).`,
        );
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(this.messageFrom(err, 'Failed to update vendor broadcast.'));
      },
    });
  }

  // ── Bulk / row: activate & deactivate ─────────────────────────────────────────────
  protected async bulkSetActive(active: boolean): Promise<void> {
    if (this.selectedCount() === 0) return;
    const keys = [...this.selected()];
    if (!active) {
      const ok = await this.confirmDialog().open({
        title: 'Deactivate customers',
        message: `Deactivate ${keys.length} selected customer(s)? They will move to the Deactivated list.`,
        confirmText: 'Deactivate',
        tone: 'danger',
      });
      if (!ok) return;
    }
    this.runSetActive(keys, active);
  }

  protected async setRowActive(row: CustomerListRow, active: boolean): Promise<void> {
    if (!active) {
      const ok = await this.confirmDialog().open({
        title: 'Deactivate customer',
        message: `Deactivate "${row.customerName || 'this customer'}"? It will move to the Deactivated list.`,
        confirmText: 'Deactivate',
        tone: 'danger',
      });
      if (!ok) return;
    }
    this.runSetActive([row.customerKey], active);
  }

  private runSetActive(keys: string[], active: boolean): void {
    this.saving.set(true);
    this.service.setActive(keys, active).subscribe({
      next: (result) => {
        this.saving.set(false);
        this.afterBulk(
          `${result.updated} customer(s) ${active ? 'activated' : 'deactivated'}.`,
        );
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(this.messageFrom(err, 'Failed to update customer status.'));
      },
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────────────
  private afterBulk(message: string): void {
    this.clearSelection();
    this.successMessage.set(message);
    setTimeout(() => this.successMessage.set(null), 4000);
    this.load();
  }

  protected onAmSelected(value: string): void {
    this.selectedAmKey.set(value);
  }

  protected trackByKey(_index: number, row: CustomerListRow): string {
    return row.customerKey;
  }

  private messageFrom(err: unknown, fallback: string): string {
    const e = err as { error?: { error?: string; details?: string }; message?: string };
    return e?.error?.details || e?.error?.error || e?.message || fallback;
  }
}
