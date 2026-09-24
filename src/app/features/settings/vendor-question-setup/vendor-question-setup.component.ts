import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  Question,
  QuestionOption,
  VendorQuestionSetupService,
} from '../../../services/vendor-question-setup.service';

const OPTION_TYPES = ['Dropdown', 'Radio', 'Checkbox', 'MultiSelect', 'YesNo'];

@Component({
  selector: 'app-vendor-question-setup',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './vendor-question-setup.component.html',
  styleUrl: './vendor-question-setup.component.scss',
})
export class VendorQuestionSetupComponent implements OnInit {
  private readonly service = inject(VendorQuestionSetupService);

  protected readonly questionTypes = signal<string[]>([]);
  protected readonly questions = signal<Question[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  hasOptions(type: string): boolean {
    return OPTION_TYPES.includes(type);
  }

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.get().subscribe({
      next: (data) => {
        this.questionTypes.set(data.questionTypes ?? []);
        this.questions.set(data.questions ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load questions. Please try again.');
        this.loading.set(false);
      },
    });
  }

  // ── Question form ──
  protected readonly formOpen = signal(false);
  protected readonly editingKey = signal<string | null>(null);
  protected readonly qCode = signal('');
  protected readonly qText = signal('');
  protected readonly qType = signal('Text');
  protected readonly qSort = signal<number | null>(null);
  protected readonly qRequired = signal(false);
  protected readonly qActive = signal(true);

  startCreate(): void {
    this.formOpen.set(true);
    this.editingKey.set(null);
    this.qCode.set('');
    this.qText.set('');
    this.qType.set('Text');
    this.qSort.set(this.questions().length + 1);
    this.qRequired.set(false);
    this.qActive.set(true);
    this.error.set(null);
  }

  startEdit(q: Question): void {
    this.formOpen.set(true);
    this.editingKey.set(q.key);
    this.qCode.set(q.code);
    this.qText.set(q.text);
    this.qType.set(q.type);
    this.qSort.set(q.sortOrder);
    this.qRequired.set(q.required);
    this.qActive.set(q.active);
    this.error.set(null);
  }

  cancelForm(): void {
    this.formOpen.set(false);
    this.editingKey.set(null);
  }

  get canSave(): boolean {
    return !this.saving() && this.qText().trim().length > 0 && this.qType().length > 0 && this.qSort() !== null;
  }

  save(): void {
    if (!this.canSave) return;
    const payload = {
      code: this.qCode(),
      text: this.qText(),
      type: this.qType(),
      sortOrder: this.qSort() ?? 0,
      required: this.qRequired(),
      active: this.qActive(),
    };
    const key = this.editingKey();
    this.saving.set(true);
    this.error.set(null);
    const req$ = key === null ? this.service.createQuestion(payload) : this.service.updateQuestion(key, payload);
    req$.subscribe({
      next: (saved) => {
        this.questions.update((list) => {
          if (key === null) return [...list, saved].sort((a, b) => a.sortOrder - b.sortOrder);
          // preserve existing options on update (the update payload doesn't carry them)
          return list
            .map((q) => (q.key === key ? { ...saved, options: q.options } : q))
            .sort((a, b) => a.sortOrder - b.sortOrder);
        });
        this.saving.set(false);
        this.cancelForm();
      },
      error: () => { this.error.set('Failed to save. Please try again.'); this.saving.set(false); },
    });
  }

  deactivateQuestion(q: Question): void {
    this.error.set(null);
    this.service.deactivateQuestion(q.key).subscribe({
      next: () => this.questions.update((list) => list.map((x) => (x.key === q.key ? { ...x, active: false } : x))),
      error: () => this.error.set('Failed to deactivate. Please try again.'),
    });
  }

  // ── Options sub-panel ──
  protected readonly expandedKey = signal<string | null>(null);
  protected readonly oText = signal('');
  protected readonly oValue = signal('');
  protected readonly oSort = signal<number | null>(null);

  toggleOptions(q: Question): void {
    this.expandedKey.update((k) => (k === q.key ? null : q.key));
    this.oText.set('');
    this.oValue.set('');
    this.oSort.set(null);
  }

  get canAddOption(): boolean {
    return !this.saving() && this.oText().trim().length > 0 && this.oValue().trim().length > 0;
  }

  addOption(q: Question): void {
    if (!this.canAddOption) return;
    const payload = { text: this.oText().trim(), value: this.oValue().trim(), sortOrder: this.oSort() ?? q.options.length + 1, active: true };
    this.error.set(null);
    this.service.addOption(q.key, payload).subscribe({
      next: (opt) => {
        this.questions.update((list) => list.map((x) => (x.key === q.key ? { ...x, options: [...x.options, opt] } : x)));
        this.oText.set('');
        this.oValue.set('');
        this.oSort.set(null);
      },
      error: () => this.error.set('Failed to add option. Please try again.'),
    });
  }

  deactivateOption(q: Question, opt: QuestionOption): void {
    this.error.set(null);
    this.service.deactivateOption(opt.key).subscribe({
      next: () => this.questions.update((list) =>
        list.map((x) => (x.key === q.key ? { ...x, options: x.options.map((o) => (o.key === opt.key ? { ...o, active: false } : o)) } : x)),
      ),
      error: () => this.error.set('Failed to deactivate option. Please try again.'),
    });
  }
}
