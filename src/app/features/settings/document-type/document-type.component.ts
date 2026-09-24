import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DocumentFor, DocumentTypeRow, DocumentTypeService } from '../../../services/document-type.service';

@Component({
  selector: 'app-document-type',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './document-type.component.html',
  styleUrl: './document-type.component.scss',
})
export class DocumentTypeComponent implements OnInit {
  private readonly service = inject(DocumentTypeService);

  protected readonly documentFors = signal<DocumentFor[]>([]);
  protected readonly rows = signal<DocumentTypeRow[]>([]);
  protected readonly search = signal('');
  /** Rows filtered by the search box (name or "for" category). */
  protected readonly filteredRows = computed(() => {
    const q = this.search().trim().toLowerCase();
    const list = this.rows();
    if (!q) return list;
    return list.filter(
      (r) => r.name.toLowerCase().includes(q) || (r.documentForName ?? '').toLowerCase().includes(q),
    );
  });
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  /** null = new entry; otherwise the id being edited. */
  protected readonly editingId = signal<string | null>(null);
  protected readonly formName = signal('');
  protected readonly formDocumentForKey = signal('');
  protected readonly formActive = signal(true);

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.get().subscribe({
      next: (data) => {
        this.documentFors.set(data.documentFors ?? []);
        this.rows.set(data.rows ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load document types. Please try again.');
        this.loading.set(false);
      },
    });
  }

  selectRow(row: DocumentTypeRow): void {
    this.editingId.set(row.id);
    this.formName.set(row.name);
    this.formDocumentForKey.set(row.documentForKey);
    this.formActive.set(row.isActive);
    this.error.set(null);
  }

  clearForm(): void {
    this.editingId.set(null);
    this.formName.set('');
    this.formDocumentForKey.set('');
    this.formActive.set(true);
  }

  get canSave(): boolean {
    return !this.saving() && this.formName().trim().length > 0 && this.formDocumentForKey().length > 0;
  }

  save(): void {
    if (!this.canSave) return;
    const payload = {
      name: this.formName().trim(),
      documentForKey: this.formDocumentForKey(),
      isActive: this.formActive(),
    };
    const key = this.editingId();

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
