import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TimeDefinition, TimeDefinitionService, TimeType } from '../../../services/time-definition.service';

@Component({
  selector: 'app-time-definition',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './time-definition.component.html',
  styleUrl: './time-definition.component.scss',
})
export class TimeDefinitionComponent implements OnInit {
  private readonly service = inject(TimeDefinitionService);

  protected readonly rows = signal<TimeDefinition[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  /** null = new entry; otherwise the id being edited. */
  protected readonly editingId = signal<number | null>(null);
  protected readonly formDescription = signal('');
  protected readonly formTimeLimit = signal<number | null>(null);
  protected readonly formTimeType = signal<TimeType>(1);

  unitLabel(type: TimeType): string {
    return type === 1 ? 'Hour(s)' : type === 2 ? 'Day(s)' : 'Minutes';
  }

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
        this.error.set('Failed to load time definitions. Please try again.');
        this.loading.set(false);
      },
    });
  }

  selectRow(row: TimeDefinition): void {
    this.editingId.set(row.id);
    this.formDescription.set(this.stripHtml(row.description));
    this.formTimeLimit.set(row.timeLimit);
    this.formTimeType.set(row.timeType);
    this.error.set(null);
  }

  clearForm(): void {
    this.editingId.set(null);
    this.formDescription.set('');
    this.formTimeLimit.set(null);
    this.formTimeType.set(1);
  }

  get canSave(): boolean {
    return !this.saving() && this.formDescription().trim().length > 0 && this.formTimeLimit() !== null;
  }

  save(): void {
    if (!this.canSave) return;
    const payload = {
      description: this.formDescription().trim(),
      timeLimit: this.formTimeLimit(),
      timeType: this.formTimeType(),
    };
    const key = this.editingId();

    this.saving.set(true);
    this.error.set(null);

    const request$ = key === null ? this.service.create(payload) : this.service.update(key, payload);

    request$.subscribe({
      next: (saved) => {
        this.rows.update((list) => {
          const others = key === null ? list : list.filter((r) => r.id !== key);
          return [...others, saved];
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
