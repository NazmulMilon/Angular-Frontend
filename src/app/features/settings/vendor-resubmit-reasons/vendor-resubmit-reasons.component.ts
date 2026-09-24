import { Component, OnInit, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  ResubmitReason,
  VendorResubmitReasonsService,
} from '../../../services/vendor-resubmit-reasons.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { RichTextEditorComponent } from '../../../shared/components/rich-text-editor/rich-text-editor.component';

@Component({
  selector: 'app-vendor-resubmit-reasons',
  standalone: true,
  imports: [FormsModule, RouterLink, ConfirmDialogComponent, RichTextEditorComponent],
  templateUrl: './vendor-resubmit-reasons.component.html',
  styleUrl: './vendor-resubmit-reasons.component.scss',
})
export class VendorResubmitReasonsComponent implements OnInit {
  private readonly service = inject(VendorResubmitReasonsService);
  private readonly confirmDialog = viewChild.required(ConfirmDialogComponent);

  protected templates = signal<ResubmitReason[]>([]);
  protected loading = signal(false);
  protected saving = signal(false);
  protected error = signal<string | null>(null);

  /** null = form closed, 0 = creating, > 0 = editing that pKey. */
  protected editingId = signal<number | null>(null);
  protected formTitle = signal('');
  protected formReason = signal('');

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.getAll().subscribe({
      next: (rows) => {
        this.templates.set(rows ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load resubmit reasons. Please try again.');
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

  startCreate(): void {
    this.editingId.set(0);
    this.formTitle.set('');
    this.formReason.set('');
    this.error.set(null);
  }

  startEdit(t: ResubmitReason): void {
    this.editingId.set(t.pKey);
    this.formTitle.set(t.templateTitle);
    this.formReason.set(t.reason);
    this.error.set(null);
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.formTitle.set('');
    this.formReason.set('');
  }

  save(): void {
    const title = this.formTitle().trim();
    const reason = this.formReason().trim();
    if (!title || !reason) return;

    const editing = this.editingId();
    const payload = { templateTitle: title, reason };

    this.saving.set(true);
    this.error.set(null);

    const request$ =
      editing && editing > 0
        ? this.service.update(editing, payload)
        : this.service.create(payload);

    request$.subscribe({
      next: (saved) => {
        this.templates.update((list) => {
          const others =
            editing && editing > 0 ? list.filter((r) => r.pKey !== editing) : list;
          return [...others, saved].sort((a, b) =>
            a.templateTitle.localeCompare(b.templateTitle)
          );
        });
        this.saving.set(false);
        this.cancelEdit();
      },
      error: () => {
        this.error.set('Failed to save. Please try again.');
        this.saving.set(false);
      },
    });
  }

  async confirmDelete(t: ResubmitReason): Promise<void> {
    if (t.pKey == null) return;
    const confirmed = await this.confirmDialog().open({
      title: 'Remove resubmit reason',
      message: `Are you sure you want to remove "${t.templateTitle}"?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      tone: 'danger',
    });
    if (!confirmed) return;

    const pKey = t.pKey;
    this.error.set(null);
    this.service.delete(pKey).subscribe({
      next: () => {
        this.templates.update((list) => list.filter((r) => r.pKey !== pKey));
        if (this.editingId() === pKey) this.cancelEdit();
      },
      error: () => {
        this.error.set('Failed to delete. Please try again.');
      },
    });
  }
}
