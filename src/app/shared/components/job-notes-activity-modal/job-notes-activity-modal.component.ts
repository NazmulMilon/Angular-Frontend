import { Component, input, output } from '@angular/core';

import { NotesActivityComponent } from '../../../features/job/notes-activity/notes-activity.component';
import type { NotesActivityTabId } from '../../../features/job/notes-activity/notes-activity.component';

/**
 * Reusable "📋 Job Notes / Activity" popup for the Accounting V2 screens.
 *
 * Wraps the full, real Notes & Activity feature — {@link NotesActivityComponent}, embedded via
 * its `embedJobKey` input — in the job-level popup chrome from `complete-screen-v2.html`'s
 * `showJobNotes()` / `renderNotesModal()` ("📋 Notes & Activity — PO {po}"). This is exactly the
 * same embedding mechanism Assign Vendor already uses to open Notes & Activity in a modal
 * (`assign-vendor.component.html`, `showNotesActivityModal`) — this component just packages that
 * pattern as a standalone, drop-in wrapper so any host with a job in context can reuse it without
 * re-authoring the modal chrome each time.
 *
 * Everything the embedded feature renders is the real production feature: filter tabs
 * (All/Internal/Vendor/Customer), the Compose Note panel (rich text, templates, pin, send-as,
 * recipients, attachments), the Notes To Accounting section, the Pinned Notes section, and the
 * full notes/activity feed (search, export, forward/reply/pin).
 *
 * Job Details is deliberately NOT part of this popup. NotesActivityComponent renders a single
 * `<app-job-details-accordion>` block whenever a job key is present — including when embedded —
 * so this wrapper passes `[hideJobDetails]="true"` (a small, additive input added to
 * NotesActivityComponent specifically for this case; it defaults to `false` so the existing
 * Assign Vendor embed, which still wants that block, is unaffected) to suppress it. The host page
 * (Move to Accounting) already renders `AccountingJobDetailsComponent` on its own, outside this
 * popup.
 *
 * This component owns no notes/activity state itself — it is purely presentational chrome around
 * `NotesActivityComponent`. The host owns `isOpen` (typically a signal toggled by a trigger
 * button) and re-renders this component with a fresh `jobKey` per job, exactly like any other
 * job-scoped popup on this page.
 */
@Component({
  selector: 'app-job-notes-activity-modal',
  standalone: true,
  imports: [NotesActivityComponent],
  templateUrl: './job-notes-activity-modal.component.html',
  styleUrl: './job-notes-activity-modal.component.scss',
})
export class JobNotesActivityModalComponent {
  /** Whether the popup is visible. Host owns this state. */
  isOpen = input(false);
  /** The job this popup is scoped to. Required whenever `isOpen` is true. */
  jobKey = input<string | null>(null);
  /** PO shown in the popup title — "📋 Notes & Activity — PO {po}", matching the prototype heading. */
  po = input<string | null>(null);
  /** Optional: pre-select a tab on open (e.g. 'vendor'). Defaults to 'all' inside NotesActivityComponent. */
  initialActiveTab = input<NotesActivityTabId | null>(null);
  /** Optional: pre-select a vendor in the Vendor tab's dropdown. */
  initialVendorKey = input('');

  /** Emitted when the user closes the popup (✕ button, footer Close button, or overlay click). */
  readonly closed = output<void>();

  onClose(): void {
    this.closed.emit();
  }

  /** Close only when the click landed on the dimmed backdrop itself, not inside the modal card. */
  onOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.onClose();
  }
}
