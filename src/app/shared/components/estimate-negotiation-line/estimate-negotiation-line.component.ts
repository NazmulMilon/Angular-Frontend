import { Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe, NgClass } from '@angular/common';

import { AdminEstimateNegotiationLine } from '../../../models/vendor-bills.model';

export type NegotiationLineDecision = 'accept' | 'edit' | 'decline' | null;

export interface NegotiationLineEditConfirmEvent {
  qty: number;
  rate: number;
  value: number;
}

/**
 * One negotiation line's agent recommendation strip — gauge, delta, Accept/Edit/Decline/Message/Info.
 * Shared by the job-estimates-section table and the live-chat negotiate panel. Purely presentational:
 * decision/message/expand state lives in the parent, this component only renders it and emits intent.
 */
@Component({
  selector: 'app-estimate-negotiation-line',
  standalone: true,
  imports: [FormsModule, NgClass, DecimalPipe],
  templateUrl: './estimate-negotiation-line.component.html',
  styleUrl: './estimate-negotiation-line.component.scss',
})
export class EstimateNegotiationLineComponent {
  private static readonly GAUGE_RING_CIRCUMFERENCE = 97.4;

  line = input.required<AdminEstimateNegotiationLine>();
  decision = input<NegotiationLineDecision>(null);
  editedValue = input<number | null>(null);
  editedQty = input<number | null>(null);
  message = input('');
  messageEdited = input(false);
  expandMode = input<'edit' | 'info' | 'msg' | null>(null);
  disabled = input(false);
  /** Compact layout for the floating chat widget vs. full width in the estimates table. */
  compact = input(false);

  decisionChange = output<'accept'>();
  changeDecision = output<void>();
  editConfirm = output<NegotiationLineEditConfirmEvent>();
  expandModeChange = output<'edit' | 'info' | 'msg' | null>();
  messageChange = output<string>();
  messageReset = output<void>();

  editQtyDraft = signal<number | null>(null);
  editRateDraft = signal<number | null>(null);

  readonly hasDecision = computed(() => this.decision() != null);

  readonly displayValue = computed(() => {
    const line = this.line();
    if (!line.counterThisLine) return line.vendorValue;
    const decision = this.decision();
    if (decision === 'decline') return line.vendorValue;
    if (decision === 'edit') return this.editedValue() ?? line.suggestedValue;
    return line.suggestedValue;
  });

  readonly deltaPct = computed(() => {
    const line = this.line();
    if (!line.vendorValue) return 0;
    return Math.round(((this.displayValue() - line.vendorValue) / line.vendorValue) * 100);
  });

  /** True when the agent's suggestion is identical to the vendor's ask — there's nothing to
   * counter to, so "Use Counter" would just re-submit the vendor's own number. Compared before
   * any decision is made, so this reads suggestedValue directly rather than displayValue()
   * (which only resolves to suggestedValue once no decision/edit is in effect anyway). */
  readonly hasNoCounterToUse = computed(() => {
    const line = this.line();
    return line.counterThisLine && line.suggestedValue === line.vendorValue;
  });

  readonly deltaLabel = computed(() => {
    const pct = this.deltaPct();
    return pct === 0 ? 'no change' : (pct > 0 ? '+' : '') + pct + '%';
  });

  readonly deltaClass = computed<'is-down' | 'is-up' | 'is-flat'>(() => {
    const pct = this.deltaPct();
    return pct === 0 ? 'is-flat' : pct < 0 ? 'is-down' : 'is-up';
  });

  readonly itemLabel = computed(() => {
    const line = this.line();
    return line.itemName?.trim() || line.itemDescription?.trim() || line.itemCode?.trim() || 'Line item';
  });

  readonly flagType = computed<'warn' | 'good'>(() => {
    const type = this.line().flags[0]?.type?.toLowerCase() ?? '';
    return type.includes('warn') || type.includes('risk') || type.includes('high') ? 'warn' : 'good';
  });

  readonly flagLabel = computed(() => {
    const line = this.line();
    const flag = line.flags[0];
    return (
      flag?.code?.trim() ||
      flag?.type?.trim() ||
      (line.deltaPct != null && line.deltaPct < 0 ? 'Counter advised' : 'Justified')
    );
  });

  readonly reasoning = computed(() => {
    const line = this.line();
    return (
      line.flags[0]?.detail?.trim() ||
      line.llmReasoning?.trim() ||
      line.reasoning?.trim() ||
      line.displaySuggestion?.trim() ||
      'No agent reasoning was returned for this line.'
    );
  });

  readonly hasReasoning = computed(() => this.reasoning().length > 0);

  readonly confidencePct = computed(() => {
    const confidence = this.line().confidence;
    if (confidence == null) return 0;
    const pct = confidence <= 1 ? confidence * 100 : confidence;
    return Math.max(0, Math.min(100, Math.round(pct)));
  });

  readonly reduction = computed(() => (this.line().vendorValue ?? 0) - (this.line().suggestedValue ?? 0));

  readonly stateLabel = computed(() => {
    switch (this.decision()) {
      case 'accept':
        return '✓ Counter in use';
      case 'edit':
        return '✎ Edited by user';
      case 'decline':
        return '✕ Charge declined ($0.00)';
      default:
        return 'Pending — will decline if unresolved';
    }
  });

  readonly stateClass = computed(() => {
    switch (this.decision()) {
      case 'accept':
        return 'negline-state--approved';
      case 'edit':
        return 'negline-state--edited';
      case 'decline':
        return 'negline-state--declined';
      default:
        return 'negline-state--pending';
    }
  });

  gaugeDashOffset(pct: number): number {
    return EstimateNegotiationLineComponent.GAUGE_RING_CIRCUMFERENCE * (1 - pct / 100);
  }

  isExpanded(mode: 'edit' | 'info' | 'msg'): boolean {
    return this.expandMode() === mode;
  }

  onDecisionClick(decision: 'accept' | 'edit'): void {
    if (this.disabled()) return;
    if (decision === 'edit') {
      this.toggleExpand('edit');
      return;
    }
    this.expandModeChange.emit(null);
    this.decisionChange.emit(decision);
  }

  onChangeClick(): void {
    if (this.disabled()) return;
    this.changeDecision.emit();
  }

  toggleInfo(event?: Event): void {
    event?.stopPropagation();
    this.toggleExpand('info');
  }

  toggleMessage(event?: Event): void {
    event?.stopPropagation();
    this.toggleExpand('msg');
  }

  private toggleExpand(mode: 'edit' | 'info' | 'msg'): void {
    if (this.isExpanded(mode)) {
      this.expandModeChange.emit(null);
      return;
    }
    if (mode === 'edit') {
      const total = this.editedValue() ?? this.line().suggestedValue;
      const qty = this.editedQty() ?? this.line().suggestedQty ?? 1;
      const safeQty = qty > 0 ? qty : 1;
      this.editQtyDraft.set(safeQty);
      // Prefer the vendor's locked rate-card rate over total/qty — that division drifts slightly
      // from the true rate due to qty rounding (e.g. $74.96 instead of an exact $75.00). Only
      // applies when there's no prior admin edit already driving total/qty.
      const lockedRate = this.line().lockedRate;
      const rate = this.editedValue() == null && this.editedQty() == null && lockedRate != null && lockedRate > 0
        ? lockedRate
        : total / safeQty;
      this.editRateDraft.set(rate);
    }
    this.expandModeChange.emit(mode);
  }

  readonly editCounterTotal = computed(() => {
    const qty = this.editQtyDraft();
    const rate = this.editRateDraft();
    if (qty == null || rate == null || Number.isNaN(qty) || Number.isNaN(rate)) return null;
    return qty * rate;
  });

  setEditQtyDraft(value: number | string | null): void {
    this.editQtyDraft.set(value == null || value === '' ? null : +value);
  }

  setEditRateDraft(value: number | string | null): void {
    this.editRateDraft.set(value == null || value === '' ? null : +value);
  }

  confirmEdit(): void {
    const qty = this.editQtyDraft();
    const rate = this.editRateDraft();
    if (qty == null || rate == null || Number.isNaN(qty) || Number.isNaN(rate) || qty < 0 || rate < 0) {
      return;
    }
    this.editConfirm.emit({ qty, rate, value: qty * rate });
    this.expandModeChange.emit(null);
  }

  cancelEdit(): void {
    this.expandModeChange.emit(null);
  }

  onMessageInput(value: string): void {
    this.messageChange.emit(value);
  }

  onResetMessage(): void {
    this.messageReset.emit();
  }
}
