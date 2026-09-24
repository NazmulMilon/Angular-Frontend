import { Component, effect, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { VendorInvoiceEditService } from '../../../features/accounting/move-to-accounting/vendor-invoice-edit.service';
import { VendorInvoiceEdit, VendorInvoiceEditLine } from '../../../features/accounting/move-to-accounting/vendor-invoice-edit.model';
import { VendorPayableNotificationService } from '../../../features/accounting/move-to-accounting/vendor-payable-notification.service';

/** The exact default text complete-screen-v2.html's vinvRejectLine() prefills the prompt with. */
const DEFAULT_REJECT_REASON = 'Rate billed exceeds the approved rate for this trade — please correct and resubmit.';

/** Local working copy of one line -- mirrors complete-screen-v2.html's `invEdit.lines`/`invEdit.base`. */
interface WorkingLine extends VendorInvoiceEditLine {
  baseQty: number;
  baseCost: number;
  deleted: boolean;
  /** Locally staged, not-yet-sent rejection (separate from the already-sent `isRejected` from the server). */
  draftReason: string;
}

/** "🧾 Vendor Invoice EDIT MODE" -- mirrors complete-screen-v2.html's showVendorInvoice()/
 *  renderVendorInvoiceModal() exactly for chrome/copy. Reduce-only line editing is the only way
 *  the Revised Vendor DNE changes; nothing is persisted until "Save Invoice" except line
 *  rejections, which persist and email immediately when sent (matching the mockup's
 *  vinvSendRejections()). The QC-increase-approval flow present in the mockup is out of scope
 *  for this pass (confirmed with Nahid 2026-09-09 -- unreachable dead code in the mockup itself,
 *  since the per-field reduce-only guard means an admin can never produce a total above the
 *  original through the editor). */
@Component({
  selector: 'app-vendor-invoice-edit-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './vendor-invoice-edit-modal.component.html',
  styleUrl: './vendor-invoice-edit-modal.component.scss',
})
export class VendorInvoiceEditModalComponent {
  private readonly invoiceEditSvc = inject(VendorInvoiceEditService);
  private readonly notificationSvc = inject(VendorPayableNotificationService);

  isOpen = input(false);
  jobKey = input<string | null>(null);
  vendorKey = input<string | null>(null);

  readonly closed = output<void>();

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly errorMessage = signal('');
  readonly data = signal<VendorInvoiceEdit | null>(null);
  readonly lines = signal<WorkingLine[]>([]);

  constructor() {
    effect(() => {
      if (this.isOpen() && this.jobKey() && this.vendorKey()) this.load();
    });
  }

  private load(): void {
    const jobKey = this.jobKey();
    const vendorKey = this.vendorKey();
    if (!jobKey || !vendorKey) return;

    this.loading.set(true);
    this.errorMessage.set('');
    this.data.set(null);
    this.invoiceEditSvc.get(jobKey, vendorKey).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.data.set(res);
        this.lines.set(
          res.lines.map((l) => ({
            ...l,
            baseQty: l.qty,
            baseCost: l.cost,
            deleted: false,
            // A rejection saved-but-not-yet-sent on a prior visit comes back from the server as
            // isRejected=true with rejectionSentOn still null -- seed draftReason from it so it
            // participates in the same "pending to send" / cancel flow as a reason typed this
            // session, instead of only showing read-only.
            draftReason: l.isRejected && !l.rejectionSentOn ? l.rejectedReason ?? '' : '',
          })),
        );
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err?.error?.message || "Unable to load this vendor's invoice.");
      },
    });
  }

  onClose(): void {
    this.closed.emit();
  }

  get activeLines(): WorkingLine[] {
    return this.lines().filter((l) => !l.deleted);
  }

  get deletedLines(): WorkingLine[] {
    return this.lines().filter((l) => l.deleted);
  }

  get grandTotal(): number {
    return this.activeLines.reduce((sum, l) => sum + l.qty * l.cost, 0);
  }

  /** Every line with a rejection reason that hasn't been emailed to the vendor yet -- covers
   *  both a fresh draft typed this session (isRejected still false) AND a rejection saved on a
   *  prior visit but never sent (isRejected true, rejectionSentOn still null). Both can be sent
   *  via "Send rejection(s)" or cancelled via "↩ Cancel". */
  get pendingRejections(): WorkingLine[] {
    return this.activeLines.filter((l) => !l.rejectionSentOn && l.draftReason.trim());
  }

  /** New this session, never persisted at all -- these are the only ones "Save Invoice" needs to
   *  send as pendingRejections (an already-persisted-but-unsent one is already on the server). */
  private get newlyDraftedRejections(): WorkingLine[] {
    return this.activeLines.filter((l) => !l.isRejected && l.draftReason.trim());
  }

  /** REDUCE-ONLY, enforced client-side too (server re-validates -- never trust the client alone).
   *  Uses a plain (input) handler instead of ngModel so an out-of-range value is clamped directly
   *  on the DOM element in the same tick -- the input never visibly shows the rejected number, not
   *  even for a frame, regardless of Angular's own change-detection timing. */
  onQtyInput(line: WorkingLine, event: Event): void {
    const input = event.target as HTMLInputElement;
    let value = input.valueAsNumber;
    if (!Number.isFinite(value) || value < 0) value = 0;
    if (value > line.baseQty + 0.004) {
      this.errorMessage.set('Reduce-only: vendor invoice amounts cannot be increased.');
      value = line.baseQty;
    } else {
      this.errorMessage.set('');
    }
    input.value = String(value);
    line.qty = value;
    this.lines.set([...this.lines()]);
  }

  onCostInput(line: WorkingLine, event: Event): void {
    const input = event.target as HTMLInputElement;
    let value = input.valueAsNumber;
    if (!Number.isFinite(value) || value < 0) value = 0;
    if (value > line.baseCost + 0.004) {
      this.errorMessage.set('Reduce-only: vendor invoice amounts cannot be increased.');
      value = line.baseCost;
    } else {
      this.errorMessage.set('');
    }
    input.value = String(value);
    line.cost = value;
    this.lines.set([...this.lines()]);
  }

  deleteLine(line: WorkingLine): void {
    line.deleted = true;
    this.lines.set([...this.lines()]);
  }

  undoDelete(line: WorkingLine): void {
    line.deleted = false;
    this.lines.set([...this.lines()]);
  }

  /** Mirrors complete-screen-v2.html's vinvRejectLine() exactly: a native prompt, prefilled with
   *  a default suggested reason, Cancel aborts, an empty reason is rejected with an error. */
  rejectLine(line: WorkingLine): void {
    const desc = (line.description || '').slice(0, 80);
    const note = window.prompt(`Reject this line and tell the vendor what must change:\n\n"${desc}"`, DEFAULT_REJECT_REASON);
    if (note === null) return;
    if (!note.trim()) {
      this.errorMessage.set('A reason is required — the vendor needs to know what to fix.');
      return;
    }
    this.errorMessage.set('');
    line.draftReason = note.trim();
    this.lines.set([...this.lines()]);
  }

  /** "↩ Cancel" -- available any time before the rejection has actually been emailed
   *  (rejectionSentOn null). A pure this-session draft just clears locally; a rejection already
   *  persisted (from a prior Save) needs a real server call to undo. */
  unrejectDraft(line: WorkingLine): void {
    if (!line.isRejected) {
      line.draftReason = '';
      this.lines.set([...this.lines()]);
      return;
    }

    const jobKey = this.jobKey();
    const vendorKey = this.vendorKey();
    if (!jobKey || !vendorKey) return;

    this.saving.set(true);
    this.errorMessage.set('');
    this.invoiceEditSvc.unrejectLine(jobKey, vendorKey, line.lineKey, line.isLabor).subscribe({
      next: (res) => {
        this.saving.set(false);
        if (res.status) {
          this.notificationSvc.refresh(jobKey);
          this.load();
        } else {
          this.errorMessage.set(res.message || 'Unable to cancel the rejection.');
        }
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMessage.set(err?.error?.message || 'Unable to cancel the rejection.');
      },
    });
  }

  saveInvoice(): void {
    const jobKey = this.jobKey();
    const vendorKey = this.vendorKey();
    if (!jobKey || !vendorKey) return;

    this.saving.set(true);
    this.errorMessage.set('');
    const payload = this.activeLines.map((l) => ({ lineKey: l.lineKey, isLabor: l.isLabor, qty: l.qty, cost: l.cost }));
    const pendingRejectionsPayload = this.newlyDraftedRejections.map((l) => ({
      lineKey: l.lineKey,
      isLabor: l.isLabor,
      reason: l.draftReason.trim(),
    }));
    this.invoiceEditSvc.save(jobKey, vendorKey, payload, pendingRejectionsPayload).subscribe({
      next: (res) => {
        this.saving.set(false);
        if (res.status) {
          this.notificationSvc.refresh(jobKey);
          this.onClose();
        } else {
          this.errorMessage.set(res.message || 'Unable to save the vendor invoice.');
        }
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMessage.set(err?.error?.message || 'Unable to save the vendor invoice.');
      },
    });
  }

  sendRejections(): void {
    const jobKey = this.jobKey();
    const vendorKey = this.vendorKey();
    const pending = this.pendingRejections;
    if (!jobKey || !vendorKey || pending.length === 0) return;

    this.saving.set(true);
    this.errorMessage.set('');
    const payload = pending.map((l) => ({
      lineKey: l.lineKey,
      isLabor: l.isLabor,
      reason: l.draftReason.trim(),
    }));
    this.invoiceEditSvc.rejectLines(jobKey, vendorKey, payload).subscribe({
      next: (res) => {
        this.saving.set(false);
        if (res.status) {
          this.notificationSvc.refresh(jobKey);
          this.load();
        } else {
          this.errorMessage.set(res.message || 'Unable to send the rejection(s).');
        }
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMessage.set(err?.error?.message || 'Unable to send the rejection(s).');
      },
    });
  }

  formatHours(value: number | null | undefined): string {
    return (value ?? 0).toFixed(2);
  }

  formatMoney(value: number | null | undefined): string {
    return '$' + (value ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  formatDateTime(value: string | null): string {
    if (!value) return '--';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
  }
}
