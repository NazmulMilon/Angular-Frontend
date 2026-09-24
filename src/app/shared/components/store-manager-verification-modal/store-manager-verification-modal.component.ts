import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { StoreManagerVerificationState } from '../../../features/accounting/move-to-accounting/store-manager-verification.model';
import { StoreManagerVerificationService } from '../../../features/accounting/move-to-accounting/store-manager-verification.service';
import { StoreManagerSurveySetupService } from '../../../features/accounting/move-to-accounting/store-manager-survey-setup.service';
import { StoreManagerSurveyQuestionSetup } from '../../../features/accounting/move-to-accounting/store-manager-survey-setup.model';

interface AnswerEntry {
  rating: number | null;
  answer: string | null;
}

/**
 * "🔗 Landing page — as the store manager sees it (from the email link)" JOB-LEVEL popup --
 * complete-screen-v2.html's renderSmLanding(), look-and-feel only. The mockup's own content is a
 * FIXED shape (one satisfaction confirm + one 5-star rating + one comment), but the real
 * production survey (RCS_app's ScorecardLocationManagerSurveyController) is a dynamic,
 * admin-configurable N-question scorecard, so this popup recreates THAT real form's actual
 * fields/labels/types, styled to match this popup's own design system (no iframe, no Bootstrap
 * chrome) -- confirmed with Nahid 2026-09-08.
 *
 * Always shows the same constant header (title, location · PO, quoted service request, "Was the
 * work completed to your satisfaction?", and the location's phone as a fallback) regardless of
 * state. Below that:
 *   - Responded: shows the REAL captured answers (ratings/choices/comments) plus the store
 *     manager's name/remark/response date.
 *   - Not responded yet, with a real pending survey to submit against (canSubmit): an INTERACTIVE
 *     recreation of the real form -- an admin can fill it out on the store manager's behalf (e.g.
 *     over the phone) and Submit, which posts through to RCS_app's SubmitJson action (the exact
 *     same validation/DB-write logic as the real public landing page's Submit), matching
 *     complete-screen-v2.html's smSubmitLanding().
 *   - Not responded and no real survey exists yet (never sent): the same fields, but read-only --
 *     nothing to submit against.
 */
@Component({
  selector: 'app-store-manager-verification-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './store-manager-verification-modal.component.html',
  styleUrl: './store-manager-verification-modal.component.scss',
})
export class StoreManagerVerificationModalComponent {
  private readonly surveySetupSvc = inject(StoreManagerSurveySetupService);
  private readonly svc = inject(StoreManagerVerificationService);

  isOpen = input(false);
  jobKey = input<string | null>(null);
  po = input<string | null>(null);
  state = input.required<StoreManagerVerificationState>();

  readonly closed = output<void>();
  /** Emitted after a successful submit so the host can refresh the trigger bar's state. */
  readonly submitted = output<void>();

  /** Every answered question with DisplayLevel 1-2 is a 1-5 star rating. */
  readonly ratingAnswers = computed(() =>
    this.state().answers.filter((a) => a.displayLevel === 1 || a.displayLevel === 2),
  );

  /** DisplayLevel 3-4 = a fixed-choice answer (Yes/No/Not sure, Yes/Partially/No). */
  readonly choiceAnswers = computed(() =>
    this.state().answers.filter((a) => a.displayLevel === 3 || a.displayLevel === 4),
  );

  /** DisplayLevel 5 = free-text comment. */
  readonly commentAnswers = computed(() => this.state().answers.filter((a) => a.displayLevel === 5));

  /** Responses captured before the ScoreCardResponseKey/DisplayLevel link existed. */
  readonly unclassifiedAnswers = computed(() => this.state().answers.filter((a) => a.displayLevel == null));

  /** Real configured question list (ScorecardStoreManagerResponseSetup) -- global survey
   *  configuration, not job-scoped, so it's loaded once and reused across job popups. */
  readonly questionSetup = signal<StoreManagerSurveyQuestionSetup[]>([]);
  readonly questionSetupLoading = signal(false);
  private questionSetupLoaded = false;

  readonly ratingQuestions = computed(() =>
    this.questionSetup().filter((q) => q.displayLevel === 1 || q.displayLevel === 2),
  );
  readonly yesNoUnsureQuestions = computed(() => this.questionSetup().filter((q) => q.displayLevel === 3));
  readonly yesPartiallyNoQuestions = computed(() => this.questionSetup().filter((q) => q.displayLevel === 4));
  readonly commentQuestions = computed(() => this.questionSetup().filter((q) => q.displayLevel === 5));

  // -- interactive form state (only meaningful while state().canSubmit) --
  readonly managerName = signal('');
  readonly generalRemarks = signal('');
  readonly answersByKey = signal<Record<string, AnswerEntry>>({});
  readonly submitting = signal(false);
  readonly submitError = signal('');

  readonly canSubmitForm = computed(() => {
    const answers = this.answersByKey();
    if (!this.managerName().trim()) return false;
    if (this.ratingQuestions().some((q) => !this.isValidRating(answers[q.scoreCardResponseKey]?.rating)))
      return false;
    if (
      this.yesNoUnsureQuestions().some(
        (q) => !this.isValidChoice(answers[q.scoreCardResponseKey]?.answer, ['Yes', 'No', 'Not sure']),
      )
    )
      return false;
    if (
      this.yesPartiallyNoQuestions().some(
        (q) => !this.isValidChoice(answers[q.scoreCardResponseKey]?.answer, ['Yes', 'Partially', 'No']),
      )
    )
      return false;
    return true;
  });

  constructor() {
    effect(() => {
      if (this.isOpen() && !this.state().responded && !this.questionSetupLoaded) {
        this.questionSetupLoaded = true;
        this.questionSetupLoading.set(true);
        this.surveySetupSvc.list().subscribe({
          next: (res) => {
            this.questionSetupLoading.set(false);
            if (res.status && Array.isArray(res.data)) {
              this.questionSetup.set([...res.data].sort((a, b) => a.reasonCode.localeCompare(b.reasonCode)));
            }
          },
          error: () => this.questionSetupLoading.set(false),
        });
      }

      // Reset the interactive form whenever the popup opens fresh (new job, or reopened).
      if (!this.isOpen()) {
        this.managerName.set('');
        this.generalRemarks.set('');
        this.answersByKey.set({});
        this.submitError.set('');
      }
    });
  }

  private isValidRating(rating: number | null | undefined): boolean {
    return typeof rating === 'number' && rating >= 1 && rating <= 5;
  }

  private isValidChoice(answer: string | null | undefined, allowed: string[]): boolean {
    return !!answer && allowed.includes(answer);
  }

  /** Returns 5 booleans (filled/empty star) for a 1-5 rating; unrated positions are empty. */
  stars(score: number | null): boolean[] {
    const filled = score ?? 0;
    return [1, 2, 3, 4, 5].map((i) => i <= filled);
  }

  setRating(key: string, n: number): void {
    if (!this.state().canSubmit) return;
    this.answersByKey.update((m) => ({ ...m, [key]: { rating: n, answer: m[key]?.answer ?? null } }));
  }

  ratingFor(key: string): number | null {
    return this.answersByKey()[key]?.rating ?? null;
  }

  setChoice(key: string, value: string): void {
    if (!this.state().canSubmit) return;
    this.answersByKey.update((m) => ({ ...m, [key]: { rating: m[key]?.rating ?? null, answer: value } }));
  }

  choiceFor(key: string): string | null {
    return this.answersByKey()[key]?.answer ?? null;
  }

  setComment(key: string, value: string): void {
    if (!this.state().canSubmit) return;
    this.answersByKey.update((m) => ({ ...m, [key]: { rating: m[key]?.rating ?? null, answer: value } }));
  }

  onNameInput(value: string): void {
    this.managerName.set(value);
  }

  onRemarksInput(value: string): void {
    this.generalRemarks.set(value);
  }

  submit(): void {
    const jobKey = this.jobKey();
    if (!jobKey || !this.state().canSubmit || this.submitting()) return;
    if (!this.canSubmitForm()) {
      this.submitError.set('Please complete all required fields.');
      return;
    }

    const answers = this.questionSetup().map((q) => {
      const entry = this.answersByKey()[q.scoreCardResponseKey];
      return {
        scoreCardResponseKey: q.scoreCardResponseKey,
        rating: entry?.rating ?? null,
        answer: entry?.answer ?? null,
      };
    });

    this.submitting.set(true);
    this.submitError.set('');
    this.svc
      .submit(jobKey, {
        storeManagerName: this.managerName().trim(),
        generalRemarks: this.generalRemarks().trim() || null,
        answers,
      })
      .subscribe({
        next: (res) => {
          this.submitting.set(false);
          if (res.status) {
            this.submitted.emit();
            this.onClose();
          } else {
            this.submitError.set(res.message || 'Failed to submit the survey.');
          }
        },
        error: () => {
          this.submitting.set(false);
          this.submitError.set('Failed to submit the survey. Please try again.');
        },
      });
  }

  onClose(): void {
    this.closed.emit();
  }

  onOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.onClose();
  }
}
