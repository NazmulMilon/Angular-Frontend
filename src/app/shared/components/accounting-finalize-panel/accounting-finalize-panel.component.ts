import { Component, OnChanges, OnDestroy, SimpleChanges, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { AccountingFinalizeService } from '../../../features/accounting/move-to-accounting/accounting-finalize.service';
import { AccountingFinalizeState } from '../../../features/accounting/move-to-accounting/accounting-finalize.model';
import { JobChatSignalRService } from '../../../features/live-chat/job-chat-signalr.service';

/**
 * "👁 Bill Verification & QBO Status" recap panel + "Final Step — Finalize Job" gates
 * (complete-screen-v2.html's handoffHTML()/sendHTML(), 2026-09-16). Self-fetching, jobKey-driven,
 * same contract as InvoiceCustomerCardComponent -- read-only recap of state already computed
 * elsewhere (EQ1/EQ2, the Invoice Customer card's markup/portal gates) except for the "🚀 Finalize"
 * action itself.
 */
@Component({
  selector: 'app-accounting-finalize-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './accounting-finalize-panel.component.html',
  styleUrl: './accounting-finalize-panel.component.scss',
})
export class AccountingFinalizePanelComponent implements OnChanges, OnDestroy {
  private readonly svc = inject(AccountingFinalizeService);
  private readonly signalr = inject(JobChatSignalRService);
  private readonly unsubscribeVendorPayableChanged: () => void;
  private readonly unsubscribeInvoiceCustomerCardChanged: () => void;

  jobKey = input('');

  /** Emitted after a successful Finalize -- the parent should refresh whichever job lists/cards
   *  depend on this job's tab membership (Tab 1/2/3 counts, the selected job's other cards). */
  finalized = output<void>();

  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly state = signal<AccountingFinalizeState | null>(null);

  readonly finalizing = signal(false);
  readonly finalizeError = signal('');
  readonly finalizeResultMessage = signal('');

  constructor() {
    // This recap panel reads the SAME underlying data (vendor bill state, invoice state) that the
    // "Approve Vendor(s) Payables" card and the Invoice Customer card mutate directly via their own
    // HTTP round-trips -- it must refresh whenever either of those change, not just when its own
    // jobKey input changes, or it silently shows stale gates/route notes (found live 2026-09-16
    // testing PO 27132: approving a vendor and checking the portal-upload box did not update this
    // panel until a manual reload).
    this.unsubscribeVendorPayableChanged = this.signalr.setVendorPayableChangedListener((dto) => {
      if (dto.jobKey === this.jobKey()) this.reload();
    });
    this.unsubscribeInvoiceCustomerCardChanged = this.signalr.setInvoiceCustomerCardChangedListener((dto) => {
      if (dto.jobKey === this.jobKey()) this.reload();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['jobKey']) {
      const key = this.jobKey()?.trim() ?? '';
      if (key) {
        this.load(key);
      } else {
        this.state.set(null);
      }
    }
  }

  ngOnDestroy(): void {
    this.unsubscribeVendorPayableChanged();
    this.unsubscribeInvoiceCustomerCardChanged();
  }

  /** Called by the Invoice Customer card's own (cardChanged) output -- covers the actions on THAT
   *  component that don't go through a SignalR broadcast at all (approve/send/discount/portal-upload/
   *  create-new-from/edit/reflect all resolve via a direct HTTP response, not a hub event). */
  onInvoiceCustomerCardChanged(): void {
    this.reload();
  }

  reload(): void {
    const key = this.jobKey()?.trim() ?? '';
    if (key) this.load(key);
  }

  private load(jobKey: string): void {
    this.loading.set(true);
    this.errorMessage.set('');
    this.finalizeResultMessage.set('');
    this.svc.getState(jobKey).subscribe({
      next: (res) => {
        this.loading.set(false);
        if (res.status) {
          this.state.set(res.data);
        } else {
          this.errorMessage.set(res.message || 'Failed to load Bill Verification & QBO Status.');
        }
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('Failed to load Bill Verification & QBO Status.');
      },
    });
  }

  finalize(): void {
    const jobKey = this.jobKey();
    if (!jobKey || this.finalizing()) return;

    this.finalizing.set(true);
    this.finalizeError.set('');
    this.svc.finalize(jobKey).subscribe({
      next: (res) => {
        this.finalizing.set(false);
        if (res.status) {
          this.finalizeResultMessage.set(res.data.message);
          this.finalized.emit();
          this.reload();
        } else {
          this.finalizeError.set(res.message || 'Failed to finalize this job.');
        }
      },
      error: (err) => {
        this.finalizing.set(false);
        this.finalizeError.set(err?.error?.message || 'Failed to finalize this job.');
      },
    });
  }
}
