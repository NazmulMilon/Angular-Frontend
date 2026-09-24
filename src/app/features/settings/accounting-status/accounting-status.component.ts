import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AccountingStatus, AccountingStatusService } from '../../../services/accounting-status.service';

@Component({
  selector: 'app-accounting-status',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './accounting-status.component.html',
  styleUrl: './accounting-status.component.scss',
})
export class AccountingStatusComponent implements OnInit {
  private readonly service = inject(AccountingStatusService);

  protected readonly rows = signal<AccountingStatus[]>([]);
  protected readonly search = signal('');
  /** Rows filtered by the search box (name). */
  protected readonly filteredRows = computed(() => {
    const q = this.search().trim().toLowerCase();
    const list = this.rows();
    if (!q) return list;
    return list.filter((r) => r.name.toLowerCase().includes(q));
  });
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  /** null = new entry; otherwise the id being edited. */
  protected readonly editingId = signal<string | null>(null);
  protected readonly formName = signal('');
  protected readonly formLevel = signal<number | null>(null);
  protected readonly formActive = signal(true);

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.getAll().subscribe({
      next: (rows) => {
        this.rows.set(rows ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load accounting statuses. Please try again.');
        this.loading.set(false);
      },
    });
  }

  selectRow(row: AccountingStatus): void {
    this.editingId.set(row.id);
    this.formName.set(row.name);
    this.formLevel.set(row.level);
    this.formActive.set(row.isActive);
    this.error.set(null);
  }

  clearForm(): void {
    this.editingId.set(null);
    this.formName.set('');
    this.formLevel.set(null);
    this.formActive.set(true);
  }

  get canSave(): boolean {
    return !this.saving() && this.formName().trim().length > 0 && this.formLevel() !== null;
  }

  save(): void {
    if (!this.canSave) return;
    const payload = { name: this.formName().trim(), level: this.formLevel(), isActive: this.formActive() };
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
