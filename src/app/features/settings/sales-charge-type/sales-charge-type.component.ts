import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SalesChargeType, SalesChargeTypeService } from '../../../services/sales-charge-type.service';

@Component({
  selector: 'app-sales-charge-type',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './sales-charge-type.component.html',
  styleUrl: './sales-charge-type.component.scss',
})
export class SalesChargeTypeComponent implements OnInit {
  private readonly service = inject(SalesChargeTypeService);

  protected readonly rows = signal<SalesChargeType[]>([]);
  protected readonly search = signal('');
  /** Rows filtered by the search box (name or description). */
  protected readonly filteredRows = computed(() => {
    const q = this.search().trim().toLowerCase();
    const list = this.rows();
    if (!q) return list;
    return list.filter(
      (r) => r.name.toLowerCase().includes(q) || (r.description ?? '').toLowerCase().includes(q),
    );
  });
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  /** null = new entry; otherwise the id being edited. */
  protected readonly editingId = signal<string | null>(null);
  protected readonly formName = signal('');
  protected readonly formDescription = signal('');
  /** Preserved from the edited row (this screen's form doesn't toggle active). */
  private readonly formActive = signal(true);

  /** Strip HTML tags/entities so legacy rich-text markup never leaks into the UI. */
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
        this.error.set('Failed to load charge types. Please try again.');
        this.loading.set(false);
      },
    });
  }

  selectRow(row: SalesChargeType): void {
    this.editingId.set(row.id);
    this.formName.set(row.name);
    this.formDescription.set(this.stripHtml(row.description));
    this.formActive.set(row.isActive);
    this.error.set(null);
  }

  clearForm(): void {
    this.editingId.set(null);
    this.formName.set('');
    this.formDescription.set('');
    this.formActive.set(true);
  }

  get canSave(): boolean {
    return !this.saving() && this.formName().trim().length > 0;
  }

  save(): void {
    if (!this.canSave) return;
    const key = this.editingId();
    const payload = {
      name: this.formName().trim(),
      description: this.formDescription(),
      isActive: key === null ? true : this.formActive(),
    };

    this.saving.set(true);
    this.error.set(null);

    const request$ = key === null ? this.service.create(payload) : this.service.update(key, payload);

    request$.subscribe({
      next: (saved) => {
        this.rows.update((list) => {
          const others = key === null ? list : list.filter((r) => r.id !== key);
          return [...others, saved].sort((a, b) => a.name.localeCompare(b.name));
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
