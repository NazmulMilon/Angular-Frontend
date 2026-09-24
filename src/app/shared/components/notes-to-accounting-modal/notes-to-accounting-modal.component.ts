import { Component, effect, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { NotesActivityService } from '../../../services/notes-activity.service';
import { NoteItem } from '../../../models/notes-activity.model';
import { AccountingNotesNotificationService } from '../../../features/accounting/move-to-accounting/accounting-notes-notification.service';

/**
 * "🏷 Notes To Accounting" JOB-LEVEL popup for the Move to Accounting screen.
 *
 * Spec: complete-screen-v2.html — showNotesToAcct() / editAcctNote() / saveAcctNoteEdit() /
 * addAcctNote(). Deliberately NOT a wrapper around the big NotesActivityComponent (unlike
 * JobNotesActivityModalComponent, its sibling) — showNotesToAcct() is just a plain list of
 * accounting notes + inline edit + an add-note textarea, so this component owns that small
 * amount of state itself rather than pulling in the tabs/compose/pinned-notes machinery.
 *
 * Data source: GET /jobs/{jobKey}/notes/accounting (NotesActivityService.getAccountingNotes) —
 * the SAME read endpoint the "Notes To Accounting" accordion inside NotesActivityComponent
 * already uses; this component does not duplicate that query, it just calls the same service
 * method on its own schedule (on open / after create / after edit).
 *
 * Ownership/edit permission: each note's `canEditAccountingNote` flag is computed SERVER-SIDE
 * (NoteDto.CanEditAccountingNote, from AdminActionNotes.VendorKey == the caller's authenticated
 * PersonnelKey) — this component trusts that flag rather than comparing keys itself.
 *
 * Modal chrome: default (860px) width per spec — showNotesToAcct()'s openModal() call does not
 * set `m.style.maxWidth` the way renderNotesModal() (Job Notes/Activity, 1050px) does.
 */
@Component({
  selector: 'app-notes-to-accounting-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './notes-to-accounting-modal.component.html',
  styleUrl: './notes-to-accounting-modal.component.scss',
})
export class NotesToAccountingModalComponent {
  private readonly notesSvc = inject(NotesActivityService);
  private readonly acctNotesNotificationSvc = inject(AccountingNotesNotificationService);

  /** Whether the popup is visible. Host owns this state. */
  isOpen = input(false);
  /** The job this popup is scoped to. Required whenever `isOpen` is true. */
  jobKey = input<string | null>(null);
  /** PO shown in the popup title -- "Notes To Accounting -- PO {po}", matching the prototype heading. */
  po = input<string | null>(null);

  /** Emitted when the user closes the popup ((x) button or footer Close button). */
  readonly closed = output<void>();
  /**
   * Emitted whenever the note list is (re)loaded -- the count reflects what the trigger button's
   * badge should show. The host can use this to keep `({{ n }})` in sync without a separate
   * count-only API call; the eager badge count on job-select still uses its own load, same as
   * the Job Notes/Activity button's `selectedJobNotesCount` already does.
   */
  readonly countChanged = output<number>();

  readonly notes = signal<NoteItem[]>([]);
  readonly isLoading = signal(false);
  readonly errorMessage = signal('');

  /** Key of the note currently being edited inline, or null. */
  readonly editingNoteKey = signal<string | null>(null);
  readonly editText = signal('');
  readonly isSavingEdit = signal(false);

  readonly newNoteText = signal('');
  readonly isAdding = signal(false);

  private lastLoadedJobKey: string | null = null;

  /**
   * Baseline value of AccountingNotesNotificationService.changeVersion() captured at the moment
   * THIS instance opened for THIS job. Only a later read that differs from this baseline counts
   * as "a live change arrived while I was open" -- checking `changeVersion() > 0` instead would
   * wrongly fire on open whenever some earlier, already-reflected change (from before this popup
   * instance existed, e.g. another job's note, or this same job's note before it was opened this
   * time) had already bumped the counter.
   */
  private changeVersionBaseline: number | null = null;

  constructor() {
    // Single effect drives both (a) load-on-open (mirrors the trigger pattern
    // JobNotesActivityModalComponent's host uses -- fresh data per job selection) and (b)
    // live-reload while already open, when AccountingNotesNotificationService.changeVersion()
    // moves past the baseline captured at open time (an AccountingNoteChanged SignalR event for
    // this job, e.g. a different admin adding/editing a note in another session). Keeping both
    // concerns in one effect (rather than two effects racing over the same isOpen()/jobKey()
    // signals) is what prevents a double-fire: the "just opened" branch and the "live change"
    // branch are mutually exclusive on every single effect run.
    effect(() => {
      const open = this.isOpen();
      const jobKey = this.jobKey();
      const version = this.acctNotesNotificationSvc.changeVersion();

      if (!open) {
        // Reset per-open state so stale edit/compose state doesn't leak into the next job.
        this.lastLoadedJobKey = null;
        this.changeVersionBaseline = null;
        return;
      }
      if (!jobKey) return;

      if (jobKey !== this.lastLoadedJobKey) {
        // Freshly opened (or opened for a different job) -- normal load-on-open path. Capture
        // the CURRENT version as the baseline so only changes from this point forward trigger
        // the live-reload branch below.
        this.lastLoadedJobKey = jobKey;
        this.changeVersionBaseline = version;
        this.loadNotes(jobKey);
        return;
      }

      // Still open for the same job -- reload only if the counter moved since we captured our
      // baseline (i.e. skip the redundant fire on this effect's own first run).
      if (this.changeVersionBaseline !== null && version !== this.changeVersionBaseline) {
        this.changeVersionBaseline = version;
        this.loadNotes(jobKey);
      }
    });
  }

  private loadNotes(jobKey: string): void {
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.editingNoteKey.set(null);
    this.notesSvc.getAccountingNotes(jobKey).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        if (res.status && res.data) {
          this.notes.set(res.data);
          this.countChanged.emit(res.data.length);
        } else {
          this.errorMessage.set(res.message || 'Unable to load accounting notes.');
        }
      },
      error: () => {
        this.isLoading.set(false);
        this.errorMessage.set('Unable to load accounting notes.');
      },
    });
  }

  onClose(): void {
    this.closed.emit();
  }

  /** Close only when the click landed on the dimmed backdrop itself, not inside the modal card. */
  onOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.onClose();
  }

  startEdit(note: NoteItem): void {
    this.editingNoteKey.set(note.noteKey);
    this.editText.set(note.comment ?? '');
  }

  cancelEdit(): void {
    this.editingNoteKey.set(null);
    this.editText.set('');
  }

  saveEdit(noteKey: string): void {
    if (this.isSavingEdit()) return; // guard against double-submit
    const text = this.editText().trim();
    if (!text) return;

    this.isSavingEdit.set(true);
    this.notesSvc.updateAccountingNote(noteKey, text).subscribe({
      next: (res) => {
        this.isSavingEdit.set(false);
        if (res.status) {
          this.editingNoteKey.set(null);
          this.editText.set('');
          const jobKey = this.jobKey();
          if (jobKey) this.loadNotes(jobKey);
        } else {
          this.errorMessage.set(res.message || 'Unable to update the note.');
        }
      },
      error: () => {
        this.isSavingEdit.set(false);
        this.errorMessage.set('Unable to update the note.');
      },
    });
  }

  addNote(): void {
    if (this.isAdding()) return; // guard against double-submit
    const jobKey = this.jobKey();
    const text = this.newNoteText().trim();
    if (!jobKey || !text) return;

    this.isAdding.set(true);
    this.notesSvc.createAccountingNote(jobKey, text).subscribe({
      next: (res) => {
        this.isAdding.set(false);
        if (res.status) {
          this.newNoteText.set('');
          this.loadNotes(jobKey);
        } else {
          this.errorMessage.set(res.message || 'Unable to add the note.');
        }
      },
      error: () => {
        this.isAdding.set(false);
        this.errorMessage.set('Unable to add the note.');
      },
    });
  }
}
