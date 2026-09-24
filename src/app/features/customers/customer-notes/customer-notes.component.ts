import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { ButtonComponent } from '../../../shared/components/button/button.component';
import { RichTextEditorComponent } from '../../../shared/components/rich-text-editor/rich-text-editor.component';
import { CustomerNoteRow, CustomerListService } from '../../../services/customer-list.service';

/**
 * Customer Notes CRUD (RFI-345 Phase 4) — embedded in the Edit Customer page's Notes
 * accordion panel. Lists notes (newest first) and adds / edits / (de)activates them via
 * the CustomerProfile notes endpoints. The note body is rich text.
 */
@Component({
  selector: 'app-customer-notes',
  standalone: true,
  imports: [ReactiveFormsModule, ButtonComponent, RichTextEditorComponent],
  templateUrl: './customer-notes.component.html',
  styleUrl: './customer-notes.component.scss',
})
export class CustomerNotesComponent implements OnInit {
  @Input({ required: true }) customerKey!: string;

  private readonly fb = inject(FormBuilder);
  private readonly service = inject(CustomerListService);

  protected readonly notes = signal<CustomerNoteRow[]>([]);
  protected readonly loading = signal(false);
  protected readonly listError = signal<string | null>(null);

  /** null = not editing; 'new' = adding; otherwise the noteKey being edited. */
  protected readonly editing = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly rowBusy = signal<string | null>(null);

  protected readonly form = this.fb.group({
    title: ['', Validators.required],
    comment: [''],
  });

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    if (!this.customerKey) return;
    this.loading.set(true);
    this.listError.set(null);
    this.service.getNotes(this.customerKey).subscribe({
      next: (rows) => { this.notes.set(rows); this.loading.set(false); },
      error: (err) => { this.listError.set(this.messageFrom(err, 'Failed to load notes.')); this.loading.set(false); },
    });
  }

  protected startAdd(): void {
    this.form.reset({ title: '', comment: '' });
    this.saveError.set(null);
    this.editing.set('new');
  }

  protected startEdit(n: CustomerNoteRow): void {
    this.form.reset({ title: n.title ?? '', comment: n.comment ?? '' });
    this.saveError.set(null);
    this.editing.set(n.noteKey);
  }

  protected cancel(): void {
    this.editing.set(null);
    this.saveError.set(null);
  }

  protected save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const dto = {
      title: (v.title ?? '').trim(),
      comment: ((v.comment ?? '').toString().trim()) || null,
    };
    const key = this.editing();
    this.saving.set(true);
    this.saveError.set(null);
    const call =
      key === 'new'
        ? this.service.createNote(this.customerKey, dto)
        : this.service.updateNote(this.customerKey, key!, dto);
    call.subscribe({
      next: () => { this.saving.set(false); this.editing.set(null); this.load(); },
      error: (err) => { this.saving.set(false); this.saveError.set(this.messageFrom(err, 'Failed to save note.')); },
    });
  }

  protected toggleActive(n: CustomerNoteRow): void {
    this.rowBusy.set(n.noteKey);
    this.service.setNoteActive(this.customerKey, n.noteKey, n.isDeleted).subscribe({
      next: () => { this.rowBusy.set(null); this.load(); },
      error: (err) => { this.rowBusy.set(null); this.listError.set(this.messageFrom(err, 'Failed to update note.')); },
    });
  }

  protected titleInvalid(): boolean {
    const c = this.form.controls.title;
    return c.invalid && (c.touched || c.dirty);
  }

  /** Plain-text, truncated preview of a rich-text note body for the list. */
  protected preview(html: string | null): string {
    if (!html) return '—';
    const text = html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text) return '—';
    return text.length > 80 ? text.slice(0, 80) + '…' : text;
  }

  protected formatDate(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '—' : d.toLocaleString();
  }

  private messageFrom(err: unknown, fallback: string): string {
    const e = err as { error?: { error?: string; details?: string }; message?: string };
    return e?.error?.details || e?.error?.error || e?.message || fallback;
  }
}
