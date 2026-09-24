import { Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Country, CountryService } from '../../../services/country.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-country',
  standalone: true,
  imports: [FormsModule, RouterLink, ConfirmDialogComponent],
  templateUrl: './country.component.html',
  styleUrl: './country.component.scss',
})
export class CountryComponent implements OnInit {
  private readonly service = inject(CountryService);
  private readonly confirmDialog = viewChild.required(ConfirmDialogComponent);

  protected readonly rows = signal<Country[]>([]);
  protected readonly search = signal('');
  /** Rows filtered by the search box (name or short code). */
  protected readonly filteredRows = computed(() => {
    const q = this.search().trim().toLowerCase();
    const list = this.rows();
    if (!q) return list;
    return list.filter(
      (r) => r.countryName.toLowerCase().includes(q) || (r.shortName ?? '').toLowerCase().includes(q),
    );
  });
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  /** null = new entry; otherwise the countryKey being edited. */
  protected readonly editingKey = signal<number | null>(null);
  protected readonly formShort = signal('');
  protected readonly formName = signal('');

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
        this.error.set('Failed to load countries. Please try again.');
        this.loading.set(false);
      },
    });
  }

  selectRow(row: Country): void {
    this.editingKey.set(row.countryKey);
    this.formShort.set(row.shortName);
    this.formName.set(row.countryName);
    this.error.set(null);
  }

  clearForm(): void {
    this.editingKey.set(null);
    this.formShort.set('');
    this.formName.set('');
  }

  get canSave(): boolean {
    return !this.saving() && this.formName().trim().length > 0;
  }

  save(): void {
    if (!this.canSave) return;
    // Short code defaults to name if blank (legacy behavior; also enforced server-side).
    const name = this.formName().trim();
    const short = this.formShort().trim() || name;
    const payload = { shortName: short, countryName: name };
    const key = this.editingKey();

    this.saving.set(true);
    this.error.set(null);

    const request$ = key === null ? this.service.create(payload) : this.service.update(key, payload);

    request$.subscribe({
      next: (saved) => {
        this.rows.update((list) => {
          const others = key === null ? list : list.filter((r) => r.countryKey !== key);
          return [...others, saved].sort((a, b) => a.countryName.localeCompare(b.countryName));
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

  async confirmDelete(row: Country): Promise<void> {
    if (row.countryKey == null) return;
    const confirmed = await this.confirmDialog().open({
      title: 'Remove country',
      message: `Are you sure you want to remove "${row.countryName}"?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      tone: 'danger',
    });
    if (!confirmed) return;

    const key = row.countryKey;
    this.error.set(null);
    this.service.delete(key).subscribe({
      next: () => {
        this.rows.update((list) => list.filter((r) => r.countryKey !== key));
        if (this.editingKey() === key) this.clearForm();
      },
      error: () => {
        this.error.set('Failed to delete. Please try again.');
      },
    });
  }
}
