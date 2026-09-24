import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NoteFooter, NoteFooterService } from '../../../services/note-footer.service';
import { RichTextEditorComponent } from '../../../shared/components/rich-text-editor/rich-text-editor.component';

@Component({
  selector: 'app-note-footer',
  standalone: true,
  imports: [FormsModule, RouterLink, RichTextEditorComponent],
  templateUrl: './note-footer.component.html',
  styleUrl: './note-footer.component.scss',
})
export class NoteFooterComponent implements OnInit {
  private readonly service = inject(NoteFooterService);

  protected readonly rows = signal<NoteFooter[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  /** null = nothing selected; otherwise the key being edited (edit-only, no create). */
  protected readonly editingKey = signal<number | null>(null);
  protected readonly formDetail = signal('');

  protected readonly editingFooter = computed(() => this.rows().find((r) => r.key === this.editingKey()) ?? null);

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
        this.error.set('Failed to load footers. Please try again.');
        this.loading.set(false);
      },
    });
  }

  /** Compact single-line preview: strip HTML tags to clean text so raw tags don't leak into the grid. */
  preview(text: string, max = 120): string {
    const flat = (text ?? '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/\s+/g, ' ')
      .trim();
    return flat.length > max ? flat.slice(0, max) + '…' : flat;
  }

  selectRow(row: NoteFooter): void {
    this.editingKey.set(row.key);
    this.formDetail.set(row.detail);
    this.error.set(null);
  }

  cancelEdit(): void {
    this.editingKey.set(null);
    this.formDetail.set('');
  }

  get canSave(): boolean {
    return !this.saving() && this.editingKey() !== null && this.formDetail().trim().length > 0;
  }

  save(): void {
    if (!this.canSave) return;
    const key = this.editingKey()!;
    this.saving.set(true);
    this.error.set(null);
    this.service.updateDetail(key, this.formDetail()).subscribe({
      next: (saved) => {
        this.rows.update((list) => list.map((r) => (r.key === key ? saved : r)));
        this.saving.set(false);
        this.cancelEdit();
      },
      error: () => {
        this.error.set('Failed to save. Please try again.');
        this.saving.set(false);
      },
    });
  }
}
