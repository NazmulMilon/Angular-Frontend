import { Component, effect, inject, input, output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { concatMap, from, toArray } from 'rxjs';

import { VendorPayableService } from '../../../features/accounting/move-to-accounting/vendor-payable.service';
import { HoursReconState } from '../../../features/accounting/move-to-accounting/vendor-payable.model';

interface EditableCheckInRow {
  checkinKey: string;
  techName: string | null;
  checkInTime: string | null;
  checkOutTime: string | null;
  workPerformed: boolean | null;
  workDescription: string | null;
  originalHours: number;
  originalTechCount: number | null;
  hours: number;
  techCount: number | null;
}

/** "⏱ Check-in / Out & Hours vs Billed — {Vendor}" -- ports complete-screen-v2.html's
 *  showHoursRecon()/renderReconModal(). Shows check-in/out records (Hours/No of Tech editable,
 *  REDUCE-ONLY) against billed labor hours on the vendor's invoice, the variance, a check-in
 *  waiver toggle, and (when the vendor billed meaningfully more than on-site time) a one-click
 *  reduce-to-match action with a one-level undo. On-site hours use the same raw-duration calc as
 *  the EQ2 hours-tolerance badge already shown on the card, not the mockup's hrs×techs model. */
@Component({
  selector: 'app-hours-recon-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './hours-recon-modal.component.html',
  styleUrl: './hours-recon-modal.component.scss',
})
export class HoursReconModalComponent {
  private readonly vendorPayableSvc = inject(VendorPayableService);

  isOpen = input(false);
  jobKey = input<string | null>(null);
  vendorKey = input<string | null>(null);
  vendorName = input<string | null>(null);

  readonly closed = output<void>();
  /** Emitted after a successful save/waiver-toggle/reduction/undo so the host can refresh the card. */
  readonly changed = output<void>();

  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');
  readonly isSaving = signal(false);
  readonly state = signal<HoursReconState | null>(null);
  readonly editRows = signal<EditableCheckInRow[]>([]);

  readonly hasEdits = computed(() =>
    this.editRows().some((r) => r.hours !== r.originalHours || r.techCount !== r.originalTechCount),
  );

  private lastLoadedKey: string | null = null;

  constructor() {
    effect(() => {
      const open = this.isOpen();
      const jobKey = this.jobKey();
      const vendorKey = this.vendorKey();
      const key = jobKey && vendorKey ? `${jobKey}|${vendorKey}` : null;

      if (!open) {
        this.lastLoadedKey = null;
        return;
      }
      if (!key || key === this.lastLoadedKey) return;

      this.lastLoadedKey = key;
      this.load();
    });
  }

  private load(): void {
    const jobKey = this.jobKey();
    const vendorKey = this.vendorKey();
    if (!jobKey || !vendorKey) return;

    this.loading.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');
    this.vendorPayableSvc.getHoursRecon(jobKey, vendorKey).subscribe({
      next: (res) => {
        this.loading.set(false);
        if (res.status) {
          this.applyState(res.data);
        } else {
          this.errorMessage.set(res.message || 'Unable to load check-in/out & hours data.');
        }
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('Unable to load check-in/out & hours data.');
      },
    });
  }

  private applyState(data: HoursReconState): void {
    this.state.set(data);
    this.editRows.set(
      data.checkIns.map((c) => ({
        checkinKey: c.checkinKey,
        techName: c.techName,
        checkInTime: c.checkInTime,
        checkOutTime: c.checkOutTime,
        workPerformed: c.workPerformed,
        workDescription: c.workDescription,
        originalHours: c.hours,
        originalTechCount: c.techCount,
        hours: c.hours,
        techCount: c.techCount,
      })),
    );
  }

  onHoursInput(row: EditableCheckInRow, value: string): void {
    const n = parseFloat(value);
    if (Number.isNaN(n)) return;
    // REDUCE-ONLY: client-side guard mirrors the mockup's reconEditCk(); the server re-validates.
    row.hours = Math.min(n, row.originalHours);
    if (row.hours < 0) row.hours = 0;
    this.editRows.set([...this.editRows()]);
  }

  onTechCountInput(row: EditableCheckInRow, value: string): void {
    const n = parseInt(value, 10);
    if (Number.isNaN(n)) return;
    const max = row.originalTechCount ?? 0;
    row.techCount = Math.min(n, max);
    if (row.techCount < 0) row.techCount = 0;
    this.editRows.set([...this.editRows()]);
  }

  saveCheckInEdits(): void {
    const jobKey = this.jobKey();
    const vendorKey = this.vendorKey();
    if (!jobKey || !vendorKey || !this.hasEdits()) return;

    const reason = window.prompt(
      'A reason is required for editing check-in/out records (logged to Accounting).',
      'Corrected per admin review.',
    );
    if (reason === null) return;
    if (!reason.trim()) {
      this.errorMessage.set('A reason is required.');
      return;
    }

    const changed = this.editRows().filter((r) => r.hours !== r.originalHours || r.techCount !== r.originalTechCount);
    this.isSaving.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    // SEQUENTIAL, not parallel: each save rebuilds the full state from the DB at response time, so
    // firing them in parallel risks a later-arriving response reflecting an earlier request's edit
    // not yet committed. concatMap runs one at a time -- the last response is guaranteed to reflect
    // every row saved before it.
    from(changed)
      .pipe(
        concatMap((r) =>
          this.vendorPayableSvc.editCheckInHours(jobKey, vendorKey, {
            checkinKey: r.checkinKey,
            newHours: r.hours !== r.originalHours ? r.hours : null,
            newTechCount: r.techCount !== r.originalTechCount ? r.techCount : null,
            reason: reason.trim(),
          }),
        ),
        toArray(),
      )
      .subscribe({
        next: (results) => {
          this.isSaving.set(false);
          const failed = results.find((res) => !res.status);
          const last = results[results.length - 1];
          if (failed) {
            this.errorMessage.set(failed.message || 'Some check-in/out edits could not be saved.');
            if (last?.status) this.applyState(last.data);
          } else if (last) {
            this.applyState(last.data);
            this.successMessage.set('Check-in/out edits saved and logged.');
            this.changed.emit();
          }
        },
        error: () => {
          this.isSaving.set(false);
          this.errorMessage.set('Unable to save the check-in/out edits.');
        },
      });
  }

  toggleWaiver(): void {
    const jobKey = this.jobKey();
    const vendorKey = this.vendorKey();
    const s = this.state();
    if (!jobKey || !vendorKey || !s) return;

    let reason: string | undefined;
    if (!s.checkInWaived) {
      const entered = window.prompt(
        'WORKBOOK Q-C4a — waiving the check-in requirement is allowed with a reason. It is logged and this vendor bill can no longer be approved without a human reviewing it.\n\nReason:',
        'Phone-dispatched job — vendor never had app access on site.',
      );
      if (entered === null) return;
      if (!entered.trim()) {
        this.errorMessage.set('A reason is required to waive the check-in requirement.');
        return;
      }
      reason = entered.trim();
    }

    this.isSaving.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');
    this.vendorPayableSvc.toggleCheckInWaiver(jobKey, vendorKey, !s.checkInWaived, reason).subscribe({
      next: (res) => {
        this.isSaving.set(false);
        if (res.status) {
          this.applyState(res.data);
          this.successMessage.set(res.message || 'Saved.');
          this.changed.emit();
        } else {
          this.errorMessage.set(res.message || 'Unable to save.');
        }
      },
      error: () => {
        this.isSaving.set(false);
        this.errorMessage.set('Unable to save.');
      },
    });
  }

  applyReduction(): void {
    const jobKey = this.jobKey();
    const vendorKey = this.vendorKey();
    if (!jobKey || !vendorKey) return;

    this.isSaving.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');
    this.vendorPayableSvc.applyHoursMatchReduction(jobKey, vendorKey).subscribe({
      next: (res) => {
        this.isSaving.set(false);
        if (res.status) {
          this.applyState(res.data);
          this.successMessage.set(res.message || 'Invoice reduced to on-site hours.');
          this.changed.emit();
        } else {
          this.errorMessage.set(res.message || 'Unable to apply the reduction.');
        }
      },
      error: (err) => {
        this.isSaving.set(false);
        this.errorMessage.set(err?.error?.message || 'Unable to apply the reduction.');
      },
    });
  }

  undoReduction(): void {
    const jobKey = this.jobKey();
    const vendorKey = this.vendorKey();
    if (!jobKey || !vendorKey) return;

    this.isSaving.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');
    this.vendorPayableSvc.undoHoursMatchReduction(jobKey, vendorKey).subscribe({
      next: (res) => {
        this.isSaving.set(false);
        if (res.status) {
          this.applyState(res.data);
          this.successMessage.set(res.message || 'Undo complete.');
          this.changed.emit();
        } else {
          this.errorMessage.set(res.message || 'Unable to undo.');
        }
      },
      error: () => {
        this.isSaving.set(false);
        this.errorMessage.set('Unable to undo.');
      },
    });
  }

  onClose(): void {
    this.closed.emit();
  }

  onOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.onClose();
  }

  formatDateTime(value: string | null): string {
    if (!value) return '--';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
  }

  billedTotalAmount(s: HoursReconState): number {
    return s.billedLaborLines.reduce((sum, l) => sum + l.total, 0);
  }

  /** "Tech-Hrs" column -- complete-screen-v2.html's per-row `hrs*techs`, recomputed live as the
   *  Hours/No of Tech cells are edited (purely a display figure; the variance/reduction math below
   *  uses raw on-site hours to stay consistent with the EQ2 badge -- see techHrsTotal()). */
  techHrs(row: EditableCheckInRow): number {
    return row.hours * (row.techCount ?? 0);
  }

  techHrsTotal(): number {
    return this.editRows().reduce((sum, r) => sum + this.techHrs(r), 0);
  }

  formatMoney(value: number | null): string {
    if (value === null || value === undefined) return '--';
    return value.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
  }
}
