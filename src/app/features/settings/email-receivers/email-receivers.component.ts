import { Component, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import {
  EmailReceiversService,
  ProcessType,
  ReceiverRow,
  StaffEmail,
} from '../../../services/email-receivers.service';

@Component({
  selector: 'app-email-receivers',
  standalone: true,
  imports: [FormsModule, RouterLink, ConfirmDialogComponent],
  templateUrl: './email-receivers.component.html',
  styleUrl: './email-receivers.component.scss',
})
export class EmailReceiversComponent implements OnInit {
  private readonly service = inject(EmailReceiversService);
  private readonly confirmDialog = viewChild.required(ConfirmDialogComponent);
  private readonly formPanel = viewChild<ElementRef<HTMLElement>>('formPanel');

  protected readonly processTypes = signal<ProcessType[]>([]);
  protected readonly staffEmails = signal<StaffEmail[]>([]);
  protected readonly rows = signal<ReceiverRow[]>([]);

  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Free-text filter over the grid (process, email, description). */
  protected readonly search = signal('');
  protected readonly filteredRows = computed(() => {
    const q = this.search().trim().toLowerCase();
    if (!q) return this.rows();
    return this.rows().filter(
      (r) =>
        r.processName.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        this.preview(r.description).toLowerCase().includes(q) ||
        String(r.sendToType).includes(q),
    );
  });

  /** null = new entry; otherwise the emailKey being edited. */
  protected readonly editingKey = signal<string | null>(null);
  protected readonly formProcess = signal<number | null>(null);
  protected readonly formStaffKey = signal('');
  protected readonly formDescription = signal('');

  /**
   * Staff dropdown options. When editing a row whose staff isn't in the active roster (deleted staff,
   * or a legacy row with no StaffKey), inject the row's current receiver so it stays selectable —
   * otherwise the Update button can never enable and the edit appears broken.
   */
  protected readonly staffOptions = computed<StaffEmail[]>(() => {
    const base = this.staffEmails();
    const key = this.formStaffKey();
    if (key && !base.some((s) => s.key === key)) {
      const row = this.rows().find((r) => r.staffKey === key);
      return [{ key, name: '(current receiver)', email: row?.email ?? '' }, ...base];
    }
    return base;
  });

  /** Strip HTML tags/entities to clean text (legacy EmailDesc rows can contain HTML markup). */
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

  /** Compact single-line preview for the grid (stripped + truncated). */
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
    this.service.get().subscribe({
      next: (data) => {
        this.processTypes.set(data.processTypes ?? []);
        this.staffEmails.set(data.staffEmails ?? []);
        this.rows.set(data.rows ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load email receivers. Please try again.');
        this.loading.set(false);
      },
    });
  }

  /** Load a grid row into the form (legacy cog icon) and scroll the editor into view. */
  selectRow(row: ReceiverRow): void {
    this.editingKey.set(row.emailKey);
    this.formProcess.set(row.sendToType);
    this.formStaffKey.set(row.staffKey);
    // EmailDesc can hold legacy HTML; edit as clean text so raw tags don't show in the textarea.
    this.formDescription.set(this.stripHtml(row.description));
    this.error.set(null);
    this.scrollToForm();
  }

  /** Bring the edit form into view (it can be scrolled off-screen when editing from a long list). */
  private scrollToForm(): void {
    setTimeout(() => {
      this.formPanel()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }

  clearForm(): void {
    this.editingKey.set(null);
    this.formProcess.set(null);
    this.formStaffKey.set('');
    this.formDescription.set('');
  }

  get canSave(): boolean {
    return this.formProcess() !== null && this.formStaffKey().length > 0;
  }

  save(): void {
    if (!this.canSave || this.saving()) return;

    const payload = {
      sendToType: this.formProcess() as number,
      staffKey: this.formStaffKey(),
      description: this.formDescription(),
    };
    this.saving.set(true);
    this.error.set(null);

    const key = this.editingKey();
    const request$ = key === null ? this.service.create(payload) : this.service.update(key, payload);

    request$.subscribe({
      next: (saved) => {
        this.rows.update((list) => {
          const others = key === null ? list : list.filter((r) => r.emailKey !== key);
          return [...others, saved].sort((a, b) => a.processName.localeCompare(b.processName));
        });
        this.saving.set(false);
        this.clearForm();
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(err?.error?.details ?? 'Failed to save the receiver. Please try again.');
      },
    });
  }

  async confirmDelete(row: ReceiverRow): Promise<void> {
    const confirmed = await this.confirmDialog().open({
      title: 'Remove email receiver',
      message: `Remove "${row.email}" from "${row.processName}"?`,
      confirmText: 'Remove',
      cancelText: 'Cancel',
      tone: 'danger',
    });
    if (!confirmed) return;

    this.error.set(null);
    this.service.delete(row.emailKey).subscribe({
      next: () => {
        this.rows.update((list) => list.filter((r) => r.emailKey !== row.emailKey));
        if (this.editingKey() === row.emailKey) this.clearForm();
      },
      error: (err) => {
        this.error.set(err?.error?.details ?? 'Failed to remove the receiver. Please try again.');
      },
    });
  }
}
