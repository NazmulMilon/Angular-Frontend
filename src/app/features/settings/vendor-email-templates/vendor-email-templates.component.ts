import { Component, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  VendorEmailTemplate,
  VendorEmailTemplatesService,
} from '../../../services/vendor-email-templates.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { RichTextEditorComponent } from '../../../shared/components/rich-text-editor/rich-text-editor.component';

@Component({
  selector: 'app-vendor-email-templates',
  standalone: true,
  imports: [FormsModule, RouterLink, ConfirmDialogComponent, RichTextEditorComponent],
  templateUrl: './vendor-email-templates.component.html',
  styleUrl: './vendor-email-templates.component.scss',
})
export class VendorEmailTemplatesComponent implements OnInit {
  private readonly service = inject(VendorEmailTemplatesService);
  private readonly confirmDialog = viewChild.required(ConfirmDialogComponent);
  private readonly formCard = viewChild<ElementRef<HTMLElement>>('formCard');

  protected readonly templates = signal<VendorEmailTemplate[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  /** null = form closed, 0 = creating, > 0 = editing that templateKey. */
  protected readonly editingKey = signal<number | null>(null);
  protected readonly formName = signal('');
  protected readonly formSubject = signal('');
  protected readonly formBody = signal('');

  protected readonly expandedKey = signal<number | null>(null);

  /** Grid search — matches Subject Line or Template ID. */
  protected readonly search = signal('');
  protected readonly filteredTemplates = computed(() => {
    const q = this.search().trim().toLowerCase();
    if (!q) return this.templates();
    return this.templates().filter(
      (t) =>
        (t.subjectLine ?? '').toLowerCase().includes(q) ||
        String(t.templateKey ?? '').includes(q)
    );
  });

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
        this.error.set('Failed to load email templates. Please try again.');
        this.loading.set(false);
      },
    });
  }

  startCreate(): void {
    this.editingKey.set(0);
    this.formName.set('');
    this.formSubject.set('');
    this.formBody.set('');
    this.error.set(null);
    this.scrollToForm();
  }

  startEdit(t: VendorEmailTemplate): void {
    this.editingKey.set(t.templateKey);
    this.formName.set(t.templateName);
    this.formSubject.set(t.subjectLine);
    this.formBody.set(t.detailContent);
    this.error.set(null);
    this.scrollToForm();
  }

  /** The edit/create form renders near the top of the page; bring it into view. */
  private scrollToForm(): void {
    // Defer so the @if-guarded form card is in the DOM before we scroll to it.
    setTimeout(() => {
      this.formCard()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  cancelEdit(): void {
    this.editingKey.set(null);
  }

  save(): void {
    const key = this.editingKey();
    if (key === null) return;

    const name = this.formName().trim();
    const subject = this.formSubject().trim();
    const body = this.formBody().trim();
    if (!name || !subject || !body) return;

    const payload = { templateName: name, subjectLine: subject, detailContent: body };
    this.saving.set(true);
    this.error.set(null);

    const request$ =
      key > 0 ? this.service.update(key, payload) : this.service.create(payload);

    request$.subscribe({
      next: (saved) => {
        this.templates.update((list) => {
          const others = key > 0 ? list.filter((t) => t.templateKey !== key) : list;
          return [...others, saved].sort((a, b) => (a.templateKey ?? 0) - (b.templateKey ?? 0));
        });
        this.saving.set(false);
        this.editingKey.set(null);
      },
      error: () => {
        this.error.set('Failed to save the template. Please try again.');
        this.saving.set(false);
      },
    });
  }

  async confirmDelete(t: VendorEmailTemplate): Promise<void> {
    if (t.templateKey == null) return;
    const confirmed = await this.confirmDialog().open({
      title: 'Delete email template',
      message: `Are you sure you want to delete "${t.templateName}"?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      tone: 'danger',
    });
    if (!confirmed) return;

    const templateKey = t.templateKey;
    this.error.set(null);
    this.service.delete(templateKey).subscribe({
      next: () => {
        this.templates.update((list) => list.filter((item) => item.templateKey !== templateKey));
        if (this.editingKey() === templateKey) this.editingKey.set(null);
      },
      error: () => this.error.set('Failed to delete. Please try again.'),
    });
  }

  toggleExpand(templateKey: number | null): void {
    this.expandedKey.update((k) => (k === templateKey ? null : templateKey));
  }
}
