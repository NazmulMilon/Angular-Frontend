import { Component, OnInit, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  AccountManagerFeedbackService,
  FeedbackFactor,
} from '../../../services/account-manager-feedback.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-account-manager-feedback',
  standalone: true,
  imports: [FormsModule, RouterLink, ConfirmDialogComponent],
  templateUrl: './account-manager-feedback.component.html',
  styleUrl: './account-manager-feedback.component.scss',
})
export class AccountManagerFeedbackComponent implements OnInit {
  private readonly service = inject(AccountManagerFeedbackService);
  private readonly confirmDialog = viewChild.required(ConfirmDialogComponent);

  protected readonly rows = signal<FeedbackFactor[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  /** null = new entry; otherwise the id being edited. */
  protected readonly editingId = signal<string | null>(null);
  protected readonly formReasonCode = signal('');
  protected readonly formSurveyFactor = signal('');

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
        this.error.set('Failed to load survey factors. Please try again.');
        this.loading.set(false);
      },
    });
  }

  selectRow(row: FeedbackFactor): void {
    this.editingId.set(row.id);
    this.formReasonCode.set(row.reasonCode);
    this.formSurveyFactor.set(row.surveyFactor);
    this.error.set(null);
  }

  clearForm(): void {
    this.editingId.set(null);
    this.formReasonCode.set('');
    this.formSurveyFactor.set('');
  }

  get canSave(): boolean {
    return !this.saving() && this.formReasonCode().trim().length > 0 && this.formSurveyFactor().trim().length > 0;
  }

  save(): void {
    if (!this.canSave) return;
    const payload = { reasonCode: this.formReasonCode().trim(), surveyFactor: this.formSurveyFactor().trim() };
    const key = this.editingId();

    this.saving.set(true);
    this.error.set(null);

    const request$ = key === null ? this.service.create(payload) : this.service.update(key, payload);

    request$.subscribe({
      next: (saved) => {
        this.rows.update((list) => {
          const others = key === null ? list : list.filter((r) => r.id !== key);
          return [...others, saved].sort((a, b) => a.reasonCode.localeCompare(b.reasonCode));
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

  async confirmDelete(row: FeedbackFactor): Promise<void> {
    if (row.id == null) return;
    const confirmed = await this.confirmDialog().open({
      title: 'Remove survey factor',
      message: `Are you sure you want to remove "${row.surveyFactor}"?`,
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
