import { Component, OnInit, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { StoreManagerSurveyService, SurveyFactor } from '../../../services/store-manager-survey.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-store-manager-survey',
  standalone: true,
  imports: [FormsModule, RouterLink, ConfirmDialogComponent],
  templateUrl: './store-manager-survey.component.html',
  styleUrl: './store-manager-survey.component.scss',
})
export class StoreManagerSurveyComponent implements OnInit {
  private readonly service = inject(StoreManagerSurveyService);
  private readonly confirmDialog = viewChild.required(ConfirmDialogComponent);

  protected readonly rows = signal<SurveyFactor[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  /** null = new entry; otherwise the id being edited. */
  protected readonly editingId = signal<string | null>(null);
  protected readonly formReasonCode = signal('');
  protected readonly formSurveyFactor = signal('');
  protected readonly formDisplayLevel = signal<number | null>(null);

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

  selectRow(row: SurveyFactor): void {
    this.editingId.set(row.id);
    this.formReasonCode.set(row.reasonCode);
    this.formSurveyFactor.set(row.surveyFactor);
    this.formDisplayLevel.set(row.displayLevel);
    this.error.set(null);
  }

  clearForm(): void {
    this.editingId.set(null);
    this.formReasonCode.set('');
    this.formSurveyFactor.set('');
    this.formDisplayLevel.set(null);
  }

  get canSave(): boolean {
    return (
      !this.saving() &&
      this.formReasonCode().trim().length > 0 &&
      this.formSurveyFactor().trim().length > 0 &&
      this.formDisplayLevel() !== null
    );
  }

  save(): void {
    if (!this.canSave) return;
    const payload = {
      reasonCode: this.formReasonCode().trim(),
      surveyFactor: this.formSurveyFactor().trim(),
      displayLevel: this.formDisplayLevel(),
    };
    const key = this.editingId();

    this.saving.set(true);
    this.error.set(null);

    const request$ = key === null ? this.service.create(payload) : this.service.update(key, payload);

    request$.subscribe({
      next: (saved) => {
        this.rows.update((list) => {
          const others = key === null ? list : list.filter((r) => r.id !== key);
          return [...others, saved].sort((a, b) => (a.displayLevel ?? 0) - (b.displayLevel ?? 0));
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

  async confirmDelete(row: SurveyFactor): Promise<void> {
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
