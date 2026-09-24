import { Component, OnInit, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CommonNote, CommonNotesService } from '../../../services/common-notes.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { RichTextEditorComponent } from '../../../shared/components/rich-text-editor/rich-text-editor.component';

@Component({
  selector: 'app-common-notes',
  standalone: true,
  imports: [FormsModule, RouterLink, ConfirmDialogComponent, RichTextEditorComponent],
  templateUrl: './common-notes.component.html',
  styleUrl: './common-notes.component.scss',
})
export class CommonNotesComponent implements OnInit {
  private readonly service = inject(CommonNotesService);
  private readonly confirmDialog = viewChild.required(ConfirmDialogComponent);

  protected readonly rows = signal<CommonNote[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  /** null = new entry; otherwise the id being edited. */
  protected readonly editingId = signal<number | null>(null);
  protected readonly formTitle = signal('');
  protected readonly formDetail = signal('');

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
        this.error.set('Failed to load notes. Please try again.');
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

  selectRow(row: CommonNote): void {
    this.editingId.set(row.id);
    this.formTitle.set(row.title);
    this.formDetail.set(row.detail);
    this.error.set(null);
  }

  clearForm(): void {
    this.editingId.set(null);
    this.formTitle.set('');
    this.formDetail.set('');
  }

  get canSave(): boolean {
    return !this.saving() && this.formTitle().trim().length > 0 && this.formDetail().trim().length > 0;
  }

  save(): void {
    if (!this.canSave) return;
    const payload = { title: this.formTitle().trim(), detail: this.formDetail() };
    const key = this.editingId();

    this.saving.set(true);
    this.error.set(null);

    const request$ = key === null ? this.service.create(payload) : this.service.update(key, payload);

    request$.subscribe({
      next: (saved) => {
        this.rows.update((list) => {
          const others = key === null ? list : list.filter((r) => r.id !== key);
          return [...others, saved].sort((a, b) => a.title.localeCompare(b.title));
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

  async confirmDelete(row: CommonNote): Promise<void> {
    if (row.id == null) return;
    const confirmed = await this.confirmDialog().open({
      title: 'Remove note',
      message: `Are you sure you want to remove "${row.title}"?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      tone: 'danger',
    });
    if (!confirmed) return;

    const id = row.id;
    this.error.set(null);
    this.service.delete(id).subscribe({
      next: () => {
        this.rows.update((list) => list.filter((r) => r.id !== id));
        if (this.editingId() === id) this.clearForm();
      },
      error: () => this.error.set('Failed to delete. Please try again.'),
    });
  }
}
