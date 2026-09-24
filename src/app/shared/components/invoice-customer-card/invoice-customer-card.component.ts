import { Component, OnChanges, OnDestroy, SimpleChanges, WritableSignal, computed, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntil, Subject } from 'rxjs';

import { InvoiceCustomerCardService, PortalUploadVerificationKind, ChargeTypeOption, ScratchInvoiceLine, UpdateInvoiceLineItemRequest } from '../../../features/accounting/move-to-accounting/invoice-customer-card.service';
import { InvoiceCustomerCard, InvoiceCustomerLine, LateVendorInvoiceCallout, InvoiceAttachmentOption } from '../../../features/accounting/move-to-accounting/invoice-customer-card.model';
import { MarkupOverrideService } from '../../../features/accounting/move-to-accounting/markup-override.service';
import { MarkupOverrideState } from '../../../features/accounting/move-to-accounting/markup-override.model';
import { JobChatSignalRService } from '../../../features/live-chat/job-chat-signalr.service';

/** One row of "✎ Edit Invoice" mode's working copy -- either an existing line (lineItemKey set) or
 *  one added during this edit session (tempIndex set instead). */
interface EditableInvoiceLine {
  lineItemKey: string | null;
  tempIndex: number | null;
  chargeTypeKey: string;
  chargeType: string;
  description: string;
  qty: number;
  rate: number;
}

/**
 * "2 · Invoice Customer" job-level card (complete-screen-v2.html's step2HTML) -- read-only display
 * of the job's active customer invoice (JobSalesInvoice, IsEstimate=false/IsActive=true), its
 * RFI-25 auto-create tier, the customer's invoicing profile, running gross profit, and one
 * late-vendor-invoice reconciliation callout per drifting vendor on the job.
 *
 * Self-fetching, jobKey-driven (same contract as AccountingJobDetailsComponent): reloads whenever
 * `jobKey` changes. "View vendor invoice" bubbles up so the parent can open the existing
 * vendor-invoice-edit modal in view mode; "Reflect change" posts directly from here.
 */
@Component({
  selector: 'app-invoice-customer-card',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './invoice-customer-card.component.html',
  styleUrl: './invoice-customer-card.component.scss',
})
export class InvoiceCustomerCardComponent implements OnChanges, OnDestroy {
  private readonly svc = inject(InvoiceCustomerCardService);
  private readonly markupOverrideSvc = inject(MarkupOverrideService);
  private readonly signalr = inject(JobChatSignalRService);
  private readonly destroy$ = new Subject<void>();
  private unsubscribeInvoiceCustomerCardChanged?: () => void;

  /** Exposed for the template (enums aren't visible there otherwise). */
  readonly PortalUploadVerificationKind = PortalUploadVerificationKind;

  jobKey = input('');

  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly card = signal<InvoiceCustomerCard | null>(null);
  /** Disables both checkboxes while a toggle round-trip is in flight, so a double-click can't
   *  fire two overlapping writes. */
  readonly portalUploadSaving = signal(false);
  /** vendorInvoiceKey of the callout currently being reflected, or null -- disables just that one
   *  callout's button while its round-trip is in flight (there can be more than one callout). */
  readonly reflectSavingKey = signal<string | null>(null);

  readonly markupOverride = signal<MarkupOverrideState | null>(null);
  readonly markupOverrideSaving = signal(false);

  /** True while HasInvoice=false and we're still waiting to hear whether automatic creation found
   *  an eligible tier -- the manual "+ Add charge line" fallback stays hidden until this clears, so
   *  a manual submit can't race the background auto-create and produce two active invoices. Cleared
   *  by the "invoice-auto-create-skipped" SignalR event, or a fallback timeout if that's ever missed. */
  readonly awaitingAutoCreate = signal(false);
  private autoCreateTimeout: ReturnType<typeof setTimeout> | null = null;

  readonly chargeTypeOptions = signal<ChargeTypeOption[]>([]);
  readonly scratchLines = signal<ScratchInvoiceLine[]>([]);
  readonly scratchSaving = signal(false);
  readonly scratchError = signal('');

  /** "✎ Edit Invoice" mode -- complete-screen-v2.html's editingInvoice/startEditing()/doneEditing().
   *  Existing lines get a lineItemKey (their DetailKey); lines added while editing get a tempIndex
   *  instead so the server can echo back the real DetailKey it generated for each on save. Deleted
   *  existing lines are tracked separately (removed from editLines, key kept in deletedLineKeys) --
   *  same "can't be inferred from omission" shape the vendor-bills modal already uses for this. */
  readonly editingInvoice = signal(false);
  readonly editLines = signal<EditableInvoiceLine[]>([]);
  readonly deletedLineKeys = signal<string[]>([]);
  readonly editSaving = signal(false);
  readonly editError = signal('');
  private nextTempIndex = 0;

  /** "💲 Apply customer discount / adjustment" modal (complete-screen-v2.html's openDiscountModal). */
  readonly discountModalOpen = signal(false);
  readonly discountDesc = signal('');
  readonly discountAmount = signal<number | null>(null);
  readonly discountSaving = signal(false);
  readonly discountError = signal('');

  /** "Create new from…" dropdown (complete-screen-v2.html's createNewFrom, 2026-09-16). */
  readonly createNewSrcSaving = signal(false);
  readonly createNewSrcError = signal('');

  /** Shared attachment checklist for both Approve and Send popups. */
  readonly attachmentOptions = signal<InvoiceAttachmentOption[]>([]);

  /** complete-screen-v2.html's `j.attachSel` -- ONE job-level selection shared by BOTH the Approve
   *  and Send popups, NOT reset each time either popup opens/closes. Persists across the whole
   *  "stage attachments → approve → send" lifecycle so an admin who checks a couple of photos while
   *  approving finds them still checked when they later open Send -- only cleared once the invoice is
   *  actually sent (confirmSendInvoice's success path), per Nahid's explicit "remains persistent till
   *  the invoice is sent to the customer" (2026-09-16). Also rendered read-only on the main card
   *  itself (the "📎 Attached to customer email" row), matching the mockup's placement exactly. */
  readonly stagedAttachmentKeys = signal<Set<string>>(new Set());

  /** "✓ Approve Customer Invoice" popup. */
  readonly approveModalOpen = signal(false);
  readonly approveNote = signal('');
  readonly approveSaving = signal(false);
  readonly approveError = signal('');
  readonly undoApproveSaving = signal(false);

  /** "📧 Send Invoice to Customer" popup. */
  readonly sendModalOpen = signal(false);
  readonly sendIsResend = signal(false);
  readonly sendSaving = signal(false);
  readonly sendError = signal('');

  /** "Fail-safe: manually entered in QBO" mini-form. */
  readonly qboManualOpen = signal(false);
  readonly qboRefNo = signal('');
  readonly qboSaving = signal(false);
  readonly qboError = signal('');
  readonly qboUploadComingSoon = signal(false);

  readonly viewVendorInvoice = output<{ vendorKey: string; vendorInvoiceKey: string }>();

  /** Fires every time this card's data is freshly reloaded -- initial load, any of this card's own
   *  actions (approve/undo/send/discount/portal-upload/create-new-from/edit/reflect), or the
   *  SignalR-triggered auto-create reload above. Lets sibling read-only panels (e.g.
   *  AccountingFinalizePanelComponent, which recaps this same invoice state) refresh themselves
   *  without this component needing to know who's listening. */
  readonly cardChanged = output<void>();

  constructor() {
    // Automatic invoice creation (2026-09-15) runs in the background after this card's own GET
    // returns HasInvoice=false; this is how the card picks up the result without a page reload.
    this.unsubscribeInvoiceCustomerCardChanged = this.signalr.setInvoiceCustomerCardChangedListener((dto) => {
      if (dto.jobKey !== this.jobKey()) return;
      if (dto.changeType === 'invoice-auto-create-skipped') {
        this.clearAutoCreateTimeout();
        this.awaitingAutoCreate.set(false);
        this.loadChargeTypeOptionsIfNeeded();
      } else {
        this.reload();
      }
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['jobKey']) {
      const key = this.jobKey()?.trim() ?? '';
      if (key) {
        this.load(key);
      } else {
        this.card.set(null);
      }
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.clearAutoCreateTimeout();
    this.unsubscribeInvoiceCustomerCardChanged?.();
  }

  private clearAutoCreateTimeout(): void {
    if (this.autoCreateTimeout) {
      clearTimeout(this.autoCreateTimeout);
      this.autoCreateTimeout = null;
    }
  }

  /** Public so the parent can force a refresh after an action elsewhere on the page changes
   *  vendor costs (e.g. approving a vendor payable) -- the running gross-profit box depends on it. */
  reload(): void {
    const key = this.jobKey()?.trim() ?? '';
    if (key) this.load(key);
  }

  /** Index into the six-tier bar this card's TierNumber corresponds to (0-based), or -1 when
   *  TierNumber is 0 (no active invoice at all -- nothing to highlight). */
  tierIndex(): number {
    const n = this.card()?.tierNumber ?? 0;
    return n > 0 ? n - 1 : -1;
  }

  onViewVendorInvoice(callout: LateVendorInvoiceCallout): void {
    this.viewVendorInvoice.emit({ vendorKey: callout.vendorKey, vendorInvoiceKey: callout.vendorInvoiceKey });
  }

  /** "🔄 Reflect change on customer invoice" -- complete-screen-v2.html's applyVenInvSync(). Appends
   *  a delta line to the invoice and re-fetches the card, which will drop this specific callout once
   *  the server marks that vendor invoice reflected. */
  reflectVendorInvoiceChange(callout: LateVendorInvoiceCallout): void {
    const jobKey = this.jobKey();
    if (!jobKey || this.reflectSavingKey()) return;

    this.reflectSavingKey.set(callout.vendorInvoiceKey);
    this.svc
      .reflectVendorInvoiceChange(jobKey, callout.vendorKey, callout.vendorInvoiceKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.reflectSavingKey.set(null);
          if (this.jobKey() !== jobKey) return;
          if (res.status) {
            this.card.set(res.data);
          } else {
            this.errorMessage.set(res.message || 'Failed to reflect the vendor-invoice change.');
          }
        },
        error: () => {
          this.reflectSavingKey.set(null);
          if (this.jobKey() !== jobKey) return;
          this.errorMessage.set('Failed to reflect the vendor-invoice change.');
        },
      });
  }

  /** "1 · Uploaded DEPOSIT invoice..." / "Uploaded [FINAL/Customer] Invoice..." checkboxes --
   *  complete-screen-v2.html's togglePortalUploaded. Re-fetches the whole card on success since the
   *  toggle also writes an Accounting Note (server returns the fresh card either way). */
  togglePortalUpload(which: PortalUploadVerificationKind, checked: boolean): void {
    const jobKey = this.jobKey();
    if (!jobKey || this.portalUploadSaving()) return;

    this.portalUploadSaving.set(true);
    this.svc
      .setPortalUploadVerification(jobKey, which, checked)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.portalUploadSaving.set(false);
          if (this.jobKey() !== jobKey) return;
          if (res.status) {
            this.card.set(res.data);
          } else {
            this.errorMessage.set(res.message || 'Failed to update the portal-upload verification.');
          }
        },
        error: () => {
          this.portalUploadSaving.set(false);
          if (this.jobKey() !== jobKey) return;
          this.errorMessage.set('Failed to update the portal-upload verification.');
        },
      });
  }

  private load(jobKey: string): void {
    this.loading.set(true);
    this.errorMessage.set('');
    this.clearAutoCreateTimeout();
    this.svc
      .get(jobKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (this.jobKey() !== jobKey) return;
          this.loading.set(false);
          if (res.status) {
            this.card.set(res.data);
            this.cardChanged.emit();
            if (!res.data.hasInvoice) {
              // A background auto-create attempt was just kicked off server-side (see
              // InvoiceCustomerCardService.GetInvoiceCustomerCardAsync) -- wait for its outcome
              // before offering manual entry, so the two can't race each other.
              this.awaitingAutoCreate.set(true);
              this.autoCreateTimeout = setTimeout(() => {
                this.awaitingAutoCreate.set(false);
                this.loadChargeTypeOptionsIfNeeded();
              }, 45000);
            } else {
              this.awaitingAutoCreate.set(false);
            }
          } else {
            this.errorMessage.set(res.message || 'Failed to load the Invoice Customer card.');
          }
        },
        error: () => {
          if (this.jobKey() !== jobKey) return;
          this.loading.set(false);
          this.errorMessage.set('Failed to load the Invoice Customer card.');
        },
      });

    this.loadMarkupOverride(jobKey);
  }

  private loadChargeTypeOptionsIfNeeded(): void {
    if (this.chargeTypeOptions().length > 0) return;
    this.svc
      .getChargeTypeOptions()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (res.status) this.chargeTypeOptions.set(res.data || []);
        },
      });
  }

  /** "+ Add charge line" -- complete-screen-v2.html's addLine(), adjusted per Nahid to require a
   *  Charge Type on every row (legacy MgtJobSalesOrder/Index's mandatory dropdown). */
  addScratchLine(): void {
    this.scratchLines.update((lines) => [
      ...lines,
      { chargeTypeKey: '', chargeType: '', description: '', qty: 1, rate: 0 },
    ]);
  }

  removeScratchLine(index: number): void {
    this.scratchLines.update((lines) => lines.filter((_, i) => i !== index));
  }

  updateScratchLine(index: number, patch: Partial<ScratchInvoiceLine>): void {
    this.scratchLines.update((lines) =>
      lines.map((l, i) => {
        if (i !== index) return l;
        const next = { ...l, ...patch };
        if (patch.chargeTypeKey !== undefined) {
          next.chargeType = this.chargeTypeOptions().find((o) => o.chargeTypeKey === patch.chargeTypeKey)?.name ?? '';
        }
        return next;
      }),
    );
  }

  scratchTotal(): number {
    return this.scratchLines().reduce((sum, l) => sum + (l.qty || 0) * (l.rate || 0), 0);
  }

  /** Creates the customer invoice from the manually-entered lines -- POSTs
   *  Source=Scratch to AdminCustomerInvoiceController/create, then reloads the card. */
  createFromScratch(): void {
    const jobKey = this.jobKey();
    const lines = this.scratchLines();
    if (!jobKey || this.scratchSaving() || lines.length === 0) return;

    if (lines.some((l) => !l.chargeTypeKey)) {
      this.scratchError.set('Please select a Charge Type for every line item.');
      return;
    }
    if (lines.some((l) => !l.description.trim())) {
      this.scratchError.set('Please enter a description for every line item.');
      return;
    }

    this.scratchSaving.set(true);
    this.scratchError.set('');
    this.svc
      .createScratchInvoice(jobKey, lines)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.scratchSaving.set(false);
          if (this.jobKey() !== jobKey) return;
          if (res.status) {
            this.scratchLines.set([]);
            this.reload();
          } else {
            this.scratchError.set(res.message || 'Failed to create the invoice.');
          }
        },
        error: () => {
          this.scratchSaving.set(false);
          if (this.jobKey() !== jobKey) return;
          this.scratchError.set('Failed to create the invoice.');
        },
      });
  }

  // ── "✎ Edit Invoice" mode (complete-screen-v2.html's startEditing/addLine/editLine/delLine/doneEditing) ──

  /** "✎ Edit Invoice" -- seeds the working copy from the currently-rendered lines and switches the
   *  document to inline-editable mode (description/qty/rate inputs, a mandatory Charge Type per row,
   *  a delete button per row, and "+ Add charge line" in place of this button). */
  startEditingInvoice(): void {
    const c = this.card();
    if (!c) return;
    this.editLines.set(
      c.lineItems.map((l) => ({
        lineItemKey: l.detailKey,
        tempIndex: null,
        chargeTypeKey: l.chargeTypeKey ?? '',
        chargeType: l.chargeType ?? '',
        description: l.description ?? '',
        qty: l.qty,
        rate: l.rate,
      })),
    );
    this.deletedLineKeys.set([]);
    this.editError.set('');
    this.nextTempIndex = 0;
    this.loadChargeTypeOptionsIfNeeded();
    this.editingInvoice.set(true);
  }

  /** "＋ Add charge line" -- adds a blank, freshly-editable row while in edit mode. */
  addEditLine(): void {
    this.editLines.update((lines) => [
      ...lines,
      { lineItemKey: null, tempIndex: this.nextTempIndex++, chargeTypeKey: '', chargeType: '', description: '', qty: 1, rate: 0 },
    ]);
  }

  /** Per-row 🗑 delete -- an existing (persisted) line's key moves to deletedLineKeys so "Done
   *  editing" removes it server-side too; a line only added this session just disappears. */
  removeEditLine(index: number): void {
    const line = this.editLines()[index];
    if (line?.lineItemKey) {
      this.deletedLineKeys.update((keys) => [...keys, line.lineItemKey!]);
    }
    this.editLines.update((lines) => lines.filter((_, i) => i !== index));
  }

  updateEditLine(index: number, patch: Partial<EditableInvoiceLine>): void {
    this.editLines.update((lines) =>
      lines.map((l, i) => {
        if (i !== index) return l;
        const next = { ...l, ...patch };
        if (patch.chargeTypeKey !== undefined) {
          next.chargeType = this.chargeTypeOptions().find((o) => o.chargeTypeKey === patch.chargeTypeKey)?.name ?? '';
        }
        return next;
      }),
    );
  }

  editTotal(): number {
    return this.editLines().reduce((sum, l) => sum + (l.qty || 0) * (l.rate || 0), 0);
  }

  /** "Done editing" -- persists every add/edit/delete from this session in one PUT, then reloads the
   *  card and returns to read-only mode. If the resulting total is under the customer's minimum
   *  markup, retries once with ProceedAnyway rather than blocking the save (Nahid 2026-09-16: the
   *  send-time gate is the real enforcement point, not this one). */
  doneEditingInvoice(): void {
    const jobKey = this.jobKey();
    const invoiceKey = this.card()?.customerInvoiceKey;
    if (!jobKey || !invoiceKey || this.editSaving()) return;

    const lines = this.editLines();
    if (lines.some((l) => !l.chargeTypeKey)) {
      this.editError.set('Please select a Charge Type for every line item.');
      return;
    }
    if (lines.some((l) => !l.description.trim())) {
      this.editError.set('Please enter a description for every line item.');
      return;
    }

    const payload: UpdateInvoiceLineItemRequest[] = [
      ...lines.map((l) => ({
        lineItemKey: l.lineItemKey ?? undefined,
        isNewLineItem: l.lineItemKey == null,
        chargeTypeKey: l.chargeTypeKey,
        chargeType: l.chargeType,
        description: l.description,
        customerRate: l.rate,
        customerQty: l.qty,
        customerAmount: Math.round(l.qty * l.rate * 100) / 100,
        tempIndex: l.tempIndex ?? undefined,
      })),
      ...this.deletedLineKeys().map((key) => ({
        lineItemKey: key,
        isDeleted: true,
        customerRate: 0,
        customerQty: 0,
        customerAmount: 0,
      })),
    ];

    this.saveInvoiceEdit(jobKey, invoiceKey, payload);
  }

  private saveInvoiceEdit(jobKey: string, invoiceKey: string, payload: UpdateInvoiceLineItemRequest[], markupAdjustmentDecision?: number): void {
    this.editSaving.set(true);
    this.editError.set('');
    this.svc
      .updateInvoice(invoiceKey, payload, markupAdjustmentDecision)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (this.jobKey() !== jobKey) return;
          if (res.status && res.data?.adjustmentProposal && !markupAdjustmentDecision) {
            // Under the minimum-markup threshold on first attempt -- proceed anyway (3) rather than
            // block the save; sending to the customer is where this is actually enforced.
            this.saveInvoiceEdit(jobKey, invoiceKey, payload, 3);
            return;
          }
          this.editSaving.set(false);
          if (res.status) {
            this.editingInvoice.set(false);
            this.editLines.set([]);
            this.deletedLineKeys.set([]);
            this.reload();
          } else {
            this.editError.set(res.message || 'Failed to save the invoice.');
          }
        },
        error: () => {
          this.editSaving.set(false);
          if (this.jobKey() !== jobKey) return;
          this.editError.set('Failed to save the invoice.');
        },
      });
  }

  // ── "💲 Apply customer discount / adjustment" (complete-screen-v2.html's openDiscountModal/
  //    applyReverseDiscount/applyCustomDiscount) ──

  /** Option A's list: any positive-amount line that isn't itself an adjustment and hasn't already
   *  been reversed -- mirrors the mockup's `!o.l.adj && !o.l.struck && o.l.qty*o.l.cost>0` filter. */
  reversibleLines(): InvoiceCustomerLine[] {
    return (this.card()?.lineItems ?? []).filter((l) => !l.isAdjustmentLine && !l.isReversed && l.amount > 0);
  }

  openDiscountModal(): void {
    this.discountDesc.set('');
    this.discountAmount.set(null);
    this.discountError.set('');
    this.discountModalOpen.set(true);
  }

  closeDiscountModal(): void {
    if (this.discountSaving()) return;
    this.discountModalOpen.set(false);
  }

  /** "↩ Remove this charge (−$X)" -- Option A, one specific existing line. */
  applyReverseCharge(detailKey: string | null): void {
    const jobKey = this.jobKey();
    if (!jobKey || !detailKey || this.discountSaving()) return;

    this.discountSaving.set(true);
    this.discountError.set('');
    this.svc
      .applyReverseCharge(jobKey, detailKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.discountSaving.set(false);
          if (this.jobKey() !== jobKey) return;
          if (res.status) {
            this.card.set(res.data);
            this.discountModalOpen.set(false);
          } else {
            this.discountError.set(res.message || 'Failed to reverse this charge.');
          }
        },
        error: () => {
          this.discountSaving.set(false);
          if (this.jobKey() !== jobKey) return;
          this.discountError.set('Failed to reverse this charge.');
        },
      });
  }

  /** "Apply −$ discount" -- Option B, a custom amount not tied to any one charge. */
  applyCustomDiscount(): void {
    const jobKey = this.jobKey();
    if (!jobKey || this.discountSaving()) return;

    const desc = this.discountDesc().trim();
    const amt = this.discountAmount();
    if (!desc) {
      this.discountError.set('Enter a reason / description for the discount.');
      return;
    }
    if (amt == null || isNaN(amt) || amt <= 0) {
      this.discountError.set('Enter a positive discount amount (it will be applied as a negative line).');
      return;
    }

    this.discountSaving.set(true);
    this.discountError.set('');
    this.svc
      .applyCustomDiscount(jobKey, desc, amt)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.discountSaving.set(false);
          if (this.jobKey() !== jobKey) return;
          if (res.status) {
            this.card.set(res.data);
            this.discountModalOpen.set(false);
          } else {
            this.discountError.set(res.message || 'Failed to apply the discount.');
          }
        },
        error: () => {
          this.discountSaving.set(false);
          if (this.jobKey() !== jobKey) return;
          this.discountError.set('Failed to apply the discount.');
        },
      });
  }

  // ── "Create new from…" dropdown (complete-screen-v2.html's createNewFrom) ──

  onCreateNewSrcChange(value: string, selectEl: HTMLSelectElement): void {
    if (!value) return;
    const jobKey = this.jobKey();
    if (!jobKey || this.createNewSrcSaving()) { selectEl.value = ''; return; }

    const bal = this.card()?.hasInvoice;
    if (bal && !confirm('This will VOID the current customer invoice and create a new one from this source. Continue?')) {
      selectEl.value = '';
      return;
    }

    this.createNewSrcSaving.set(true);
    this.createNewSrcError.set('');
    this.svc
      .createNewInvoiceFromSource(jobKey, +value)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.createNewSrcSaving.set(false);
          selectEl.value = '';
          if (this.jobKey() !== jobKey) return;
          if (res.status) {
            this.card.set(res.data);
          } else {
            this.createNewSrcError.set(res.message || 'Failed to create the invoice from that source.');
          }
        },
        error: () => {
          this.createNewSrcSaving.set(false);
          selectEl.value = '';
          if (this.jobKey() !== jobKey) return;
          this.createNewSrcError.set('Failed to create the invoice from that source.');
        },
      });
  }

  // ── Shared attachment checklist (Approve + Send popups) ──

  /** complete-screen-v2.html's renderApproveModal() shows check-out (after) photos as their own
   *  grid FIRST, ahead of the full attachment list -- matches selGridHTML(coList, j). */
  readonly checkoutAttachmentOptions = computed(() => this.attachmentOptions().filter((o) => o.isCheckoutPhoto));
  /** complete-screen-v2.html's venList (`vendorNames.includes(a.by)`) -- every upload that came from
   *  a vendor, not just check-out photos. */
  readonly vendorAttachmentOptions = computed(() => this.attachmentOptions().filter((o) => o.kind === 'vendor-upload'));

  /** "🔍 Full size" lightbox (complete-screen-v2.html's openLightbox()) -- {list, index} so Prev/Next
   *  navigate within whichever grid (check-out-only or full) the thumbnail was opened from. */
  readonly lightbox = signal<{ list: InvoiceAttachmentOption[]; index: number } | null>(null);

  openLightbox(list: InvoiceAttachmentOption[], index: number): void {
    this.lightbox.set({ list, index });
  }

  closeLightbox(): void {
    this.lightbox.set(null);
  }

  lightboxPrev(): void {
    const lb = this.lightbox();
    if (lb && lb.index > 0) this.lightbox.set({ ...lb, index: lb.index - 1 });
  }

  lightboxNext(): void {
    const lb = this.lightbox();
    if (lb && lb.index < lb.list.length - 1) this.lightbox.set({ ...lb, index: lb.index + 1 });
  }

  /** Drives the Send popup's amber "no after photos" reminder banner (complete-screen-v2.html's
   *  showSendPicReminder(), `!hasAfterPhoto`) -- true once at least one check-out (after) photo is
   *  among the currently-selected attachments. */
  hasSelectedCheckoutPhoto(): boolean {
    const selected = this.stagedAttachmentKeys();
    return this.checkoutAttachmentOptions().some((o) => selected.has(o.key));
  }

  /** Filenames of the currently-staged attachments, for the read-only "📎 Attached to customer
   *  email" summary rendered on the main card (complete-screen-v2.html's own inline row). */
  stagedAttachmentNames(): string[] {
    const selected = this.stagedAttachmentKeys();
    return this.attachmentOptions()
      .filter((o) => selected.has(o.key))
      .map((o) => o.fileName || '(unnamed file)');
  }

  /** "✎ change" on the main card's staged-attachments row -- reopens whichever popup is
   *  contextually available to adjust the selection (mockup's showInvoiceAttachments()). */
  changeStagedAttachments(): void {
    if (this.card()?.approvedByAm) this.openSendModal(false);
    else this.openApproveModal();
  }

  /** Emoji placeholder thumbnail, same convention as the mockup (no real image byte fetching here --
   *  a prototype-style placeholder, not a real preview). */
  attachmentIcon(opt: InvoiceAttachmentOption): string {
    const type = (opt.fileType || '').toLowerCase();
    return type.includes('pdf') || type.includes('doc') ? '📄' : '🖼';
  }

  private loadAttachmentOptionsIfNeeded(): void {
    const jobKey = this.jobKey();
    if (!jobKey || this.attachmentOptions().length > 0) return;
    this.svc
      .getAttachmentOptions(jobKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (res.status) this.attachmentOptions.set(res.data || []);
        },
      });
  }

  toggleAttachment(selected: WritableSignal<Set<string>>, key: string): void {
    const next = new Set(selected());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    selected.set(next);
  }

  private splitAttachmentKeys(keys: Set<string>): { jobFileKeys: string[]; vendorUploadKeys: string[] } {
    const options = this.attachmentOptions();
    const jobFileKeys: string[] = [];
    const vendorUploadKeys: string[] = [];
    for (const key of keys) {
      const opt = options.find((o) => o.key === key);
      if (!opt) continue;
      if (opt.kind === 'job-file') jobFileKeys.push(key);
      else vendorUploadKeys.push(key);
    }
    return { jobFileKeys, vendorUploadKeys };
  }

  // ── "✓ Approve Customer Invoice" popup ──

  openApproveModal(): void {
    this.approveNote.set('');
    this.approveError.set('');
    this.loadAttachmentOptionsIfNeeded();
    this.approveModalOpen.set(true);
  }

  closeApproveModal(): void {
    if (this.approveSaving()) return;
    this.approveModalOpen.set(false);
  }

  finalizeApproveInvoice(): void {
    const jobKey = this.jobKey();
    if (!jobKey || this.approveSaving()) return;

    this.approveSaving.set(true);
    this.approveError.set('');
    this.svc
      .approveInvoice(jobKey, Array.from(this.stagedAttachmentKeys()), this.approveNote().trim())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.approveSaving.set(false);
          if (this.jobKey() !== jobKey) return;
          if (res.status) {
            this.card.set(res.data);
            this.approveModalOpen.set(false);
          } else {
            this.approveError.set(res.message || 'Failed to approve the invoice.');
          }
        },
        error: () => {
          this.approveSaving.set(false);
          if (this.jobKey() !== jobKey) return;
          this.approveError.set('Failed to approve the invoice.');
        },
      });
  }

  /** "Undo approval" -- complete-screen-v2.html's unapproveInvoice(), runtime update, no reload. */
  undoApproveInvoice(): void {
    const jobKey = this.jobKey();
    if (!jobKey || this.undoApproveSaving()) return;
    if (!confirm('Undo approval of this customer invoice?')) return;

    this.undoApproveSaving.set(true);
    this.svc
      .undoApproveInvoice(jobKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.undoApproveSaving.set(false);
          if (this.jobKey() !== jobKey) return;
          if (res.status) {
            this.card.set(res.data);
          } else {
            this.errorMessage.set(res.message || 'Failed to undo approval.');
          }
        },
        error: () => {
          this.undoApproveSaving.set(false);
          if (this.jobKey() !== jobKey) return;
          this.errorMessage.set('Failed to undo approval.');
        },
      });
  }

  // ── "📧 Send Invoice to Customer" popup ──

  openSendModal(resend: boolean): void {
    this.sendIsResend.set(resend);
    this.sendError.set('');
    this.loadAttachmentOptionsIfNeeded();
    this.sendModalOpen.set(true);
  }

  closeSendModal(): void {
    if (this.sendSaving()) return;
    this.sendModalOpen.set(false);
  }

  confirmSendInvoice(): void {
    const jobKey = this.jobKey();
    const c = this.card();
    if (!jobKey || !c?.customerInvoiceKey || this.sendSaving()) return;

    const email = c.customerProfile?.accountingContactEmail;
    if (!email) {
      this.sendError.set('No accounting contact email on file for this customer (see Customer Invoicing Profile above).');
      return;
    }

    this.sendSaving.set(true);
    this.sendError.set('');
    const { jobFileKeys, vendorUploadKeys } = this.splitAttachmentKeys(this.stagedAttachmentKeys());
    this.svc
      .sendInvoiceEmail(c.customerInvoiceKey, null, email, jobFileKeys, vendorUploadKeys)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.sendSaving.set(false);
          if (this.jobKey() !== jobKey) return;
          if (res.status) {
            this.sendModalOpen.set(false);
            // complete-screen-v2.html never actually clears j.attachSel, but Nahid's explicit call
            // (2026-09-16): the staged selection should persist through approve+send and only clear
            // once the invoice has genuinely been sent -- a stale "3 files staged" after a real send
            // would be misleading on the next invoice cycle.
            this.stagedAttachmentKeys.set(new Set());
            this.reload();
          } else {
            this.sendError.set(res.message || 'Failed to send the invoice.');
          }
        },
        error: () => {
          this.sendSaving.set(false);
          if (this.jobKey() !== jobKey) return;
          this.sendError.set('Failed to send the invoice.');
        },
      });
  }

  // ── QuickBooks Online (footer, approved state) ──

  /** "⬆ Upload customer invoice to QuickBooks NOW" -- no real API integration yet. */
  showQboComingSoon(): void {
    this.qboUploadComingSoon.set(true);
  }

  closeQboComingSoon(): void {
    this.qboUploadComingSoon.set(false);
  }

  openQboManualEntry(): void {
    this.qboRefNo.set('');
    this.qboError.set('');
    this.qboManualOpen.set(true);
  }

  saveQboManualEntry(): void {
    const jobKey = this.jobKey();
    const invoiceKey = this.card()?.customerInvoiceKey;
    if (!jobKey || !invoiceKey || this.qboSaving()) return;

    const ref = this.qboRefNo().trim();
    if (!ref) {
      this.qboError.set('QB transaction # is required for the manual fail-safe.');
      return;
    }

    this.qboSaving.set(true);
    this.qboError.set('');
    this.svc
      .recordManualQboEntry(invoiceKey, ref)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.qboSaving.set(false);
          if (this.jobKey() !== jobKey) return;
          if (res.status) {
            this.qboManualOpen.set(false);
            this.reload();
          } else {
            this.qboError.set(res.message || 'Failed to record the manual QBO entry.');
          }
        },
        error: () => {
          this.qboSaving.set(false);
          if (this.jobKey() !== jobKey) return;
          this.qboError.set('Failed to record the manual QBO entry.');
        },
      });
  }

  private loadMarkupOverride(jobKey: string): void {
    this.markupOverrideSvc
      .getState(jobKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (this.jobKey() !== jobKey) return;
          if (res.status) this.markupOverride.set(res.data);
        },
      });
  }

  /** "⤴ Override — email QC Manager for approval" -- complete-screen-v2.html's requestMarkupOverride(). */
  requestMarkupOverride(): void {
    const jobKey = this.jobKey();
    if (!jobKey || this.markupOverrideSaving()) return;
    if (!confirm('Email the QC Manager to request approval to send this invoice BELOW the minimum mark-up target?')) return;

    this.markupOverrideSaving.set(true);
    this.markupOverrideSvc
      .requestOverride(jobKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.markupOverrideSaving.set(false);
          if (this.jobKey() !== jobKey) return;
          if (res.status) {
            this.markupOverride.set(res.data);
          } else {
            this.errorMessage.set(res.message || 'Failed to request the mark-up override.');
          }
        },
        error: () => {
          this.markupOverrideSaving.set(false);
          if (this.jobKey() !== jobKey) return;
          this.errorMessage.set('Failed to request the mark-up override.');
        },
      });
  }

}
