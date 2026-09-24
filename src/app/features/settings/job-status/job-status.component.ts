import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  JobStatusRow,
  JobStatusService,
  JobStatusUsergroup,
} from '../../../services/job-status.service';

@Component({
  selector: 'app-job-status',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './job-status.component.html',
  styleUrl: './job-status.component.scss',
})
export class JobStatusComponent implements OnInit {
  private readonly service = inject(JobStatusService);

  protected readonly usergroups = signal<JobStatusUsergroup[]>([]);
  protected readonly rows = signal<JobStatusRow[]>([]);
  protected readonly search = signal('');
  /** Rows filtered by the search box (admin / customer / vendor label). */
  protected readonly filteredRows = computed(() => {
    const q = this.search().trim().toLowerCase();
    const list = this.rows();
    if (!q) return list;
    return list.filter(
      (r) =>
        r.adminLabel.toLowerCase().includes(q) ||
        (r.customerLabel ?? '').toLowerCase().includes(q) ||
        (r.vendorLabel ?? '').toLowerCase().includes(q),
    );
  });
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  /** null = new entry; otherwise the id being edited. */
  protected readonly editingId = signal<string | null>(null);
  protected readonly formAdmin = signal('');
  protected readonly formCustomer = signal('');
  protected readonly formVendor = signal('');
  protected readonly formLevel = signal<number | null>(null);
  protected readonly formTrigger = signal('');
  protected readonly formActive = signal(true);
  protected readonly checkedGroups = signal<Set<string>>(new Set());

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.get().subscribe({
      next: (data) => {
        this.usergroups.set(data.usergroups ?? []);
        this.rows.set(data.rows ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load job statuses. Please try again.');
        this.loading.set(false);
      },
    });
  }

  /** Strip HTML tags/entities to clean text so legacy rich-text markup never leaks into the UI. */
  private stripHtml(text: string): string {
    return (text ?? '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Compact single-line grid preview: strip tags, then truncate. */
  preview(text: string, max = 120): string {
    const flat = this.stripHtml(text);
    return flat.length > max ? flat.slice(0, max) + '…' : flat;
  }

  /** Legacy: blur on the Admin label copies its value to the customer/vendor labels if empty. */
  syncLabels(): void {
    const v = this.formAdmin();
    if (!this.formCustomer().trim()) this.formCustomer.set(v);
    if (!this.formVendor().trim()) this.formVendor.set(v);
  }

  isGroupChecked(key: string): boolean {
    return this.checkedGroups().has(key);
  }

  toggleGroup(key: string): void {
    this.checkedGroups.update((set) => {
      const next = new Set(set);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  get allGroupsChecked(): boolean {
    return this.usergroups().length > 0 && this.usergroups().every((g) => this.checkedGroups().has(g.key));
  }

  toggleSelectAllGroups(): void {
    if (this.allGroupsChecked) {
      this.checkedGroups.set(new Set());
    } else {
      this.checkedGroups.set(new Set(this.usergroups().map((g) => g.key)));
    }
  }

  groupName(key: string): string {
    return this.usergroups().find((g) => g.key === key)?.name ?? key;
  }

  selectRow(row: JobStatusRow): void {
    this.editingId.set(row.id);
    this.formAdmin.set(row.adminLabel);
    this.formCustomer.set(row.customerLabel);
    this.formVendor.set(row.vendorLabel);
    this.formLevel.set(row.level);
    this.formTrigger.set(this.stripHtml(row.triggerDetails));
    this.formActive.set(row.isActive);
    this.checkedGroups.set(new Set(row.usergroupKeys));
    this.error.set(null);
  }

  clearForm(): void {
    this.editingId.set(null);
    this.formAdmin.set('');
    this.formCustomer.set('');
    this.formVendor.set('');
    this.formLevel.set(null);
    this.formTrigger.set('');
    this.formActive.set(true);
    this.checkedGroups.set(new Set());
  }

  get canSave(): boolean {
    return (
      !this.saving() &&
      this.formAdmin().trim().length > 0 &&
      this.formLevel() !== null &&
      this.formTrigger().trim().length > 0
    );
  }

  save(): void {
    if (!this.canSave) return;
    const payload = {
      adminLabel: this.formAdmin().trim(),
      customerLabel: this.formCustomer().trim(),
      vendorLabel: this.formVendor().trim(),
      level: this.formLevel(),
      triggerDetails: this.formTrigger().trim(),
      isActive: this.formActive(),
      usergroupKeys: [...this.checkedGroups()],
    };
    const key = this.editingId();

    this.saving.set(true);
    this.error.set(null);

    const request$ = key === null ? this.service.create(payload) : this.service.update(key, payload);

    request$.subscribe({
      next: (saved) => {
        this.rows.update((list) => {
          const others = key === null ? list : list.filter((r) => r.id !== key);
          return [...others, saved].sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
        });
        this.saving.set(false);
        this.clearForm();
      },
      error: () => {
        this.error.set('Failed to save. Please try again.');
        this.saving.set(false);
      },
    });
  }
}
