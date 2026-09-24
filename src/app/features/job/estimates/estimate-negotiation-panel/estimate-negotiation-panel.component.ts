import { Component, input, output, signal, computed, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';

import {
  AdminCounterLineAction,
  AdminEstimateNegotiation,
  AdminEstimateNegotiationLine,
  NegotiationLineDecision,
  NegotiationLineDecisionState,
} from '../../../../models/vendor-bills.model';

@Component({
  selector: 'app-estimate-negotiation-panel',
  standalone: true,
  imports: [FormsModule, DecimalPipe],
  templateUrl: './estimate-negotiation-panel.component.html',
  styleUrl: './estimate-negotiation-panel.component.scss',
})
export class EstimateNegotiationPanelComponent {
  estimateKey = input.required<string>();
  negotiation = input<AdminEstimateNegotiation | null>(null);
  loading = input(false);
  submitting = input(false);
  errorMessage = input('');
  openNegotiationUrl = input('');

  acceptAll = output<void>();
  sendCounter = output<void>();
  lineDecisionChange = output<{ lineItemId: string; state: NegotiationLineDecisionState }>();

  editLineId = signal<string | null>(null);
  editValue = signal<number | null>(null);

  lineDecisions = signal<Record<string, NegotiationLineDecisionState>>({});

  displayLines = computed(() => this.negotiation()?.lines ?? []);

  negotiableLines = computed(() => this.displayLines().filter((l) => l.counterThisLine));

  passThroughLines = computed(() => this.displayLines().filter((l) => !l.counterThisLine));

  panelState = computed<'generating' | 'ready' | 'unavailable' | 'error'>(() => {
    if (this.errorMessage()) return 'error';
    if (this.loading()) return 'generating';
    const n = this.negotiation();
    if (!n) return 'generating';
    if (n.errorMessage) return 'error';
    if (!n.showPanel) return 'unavailable';
    if (!n.recommendationsReady) return 'generating';
    return 'ready';
  });

  constructor() {
    effect(() => {
      this.estimateKey();
      this.lineDecisions.set({});
      this.editLineId.set(null);
      this.editValue.set(null);
    });

    effect(() => {
      const lines = this.negotiation()?.lines ?? [];
      if (lines.length === 0) return;
      const next: Record<string, NegotiationLineDecisionState> = { ...this.lineDecisions() };
      let changed = false;
      for (const line of lines) {
        if (!line.counterThisLine) continue;
        if (!next[line.lineItemId]) {
          next[line.lineItemId] = { decision: 'accept' };
          changed = true;
        }
      }
      if (changed) this.lineDecisions.set(next);
    });
  }

  setDecision(line: AdminEstimateNegotiationLine, decision: NegotiationLineDecision): void {
    if (decision === 'edit') {
      this.editLineId.set(line.lineItemId);
      this.editValue.set(line.suggestedValue);
      return;
    }

    this.editLineId.set(null);
    this.patchDecision(line.lineItemId, { decision });
  }

  confirmEdit(line: AdminEstimateNegotiationLine): void {
    const value = this.editValue();
    if (value == null || Number.isNaN(value)) return;
    this.patchDecision(line.lineItemId, {
      decision: 'edit',
      editedValue: value,
      editedQty: line.suggestedQty ?? undefined,
    });
    this.editLineId.set(null);
  }

  cancelEdit(): void {
    this.editLineId.set(null);
    this.editValue.set(null);
  }

  isDecision(lineId: string, decision: NegotiationLineDecision): boolean {
    return this.lineDecisions()[lineId]?.decision === decision;
  }

  buildCounterActions(): AdminCounterLineAction[] {
    const lines = this.negotiableLines();
    const decisions = this.lineDecisions();
    return lines.map((line) => {
      const state = decisions[line.lineItemId] ?? { decision: 'accept' as const };
      const action = state.decision ?? 'accept';
      let value = line.suggestedValue;
      if (action === 'decline') value = line.vendorValue;
      if (action === 'edit' && state.editedValue != null) value = state.editedValue;
      return {
        lineItemId: line.lineItemId,
        action,
        value,
        qty:
          action === 'edit'
            ? (state.editedQty ?? line.suggestedQty ?? null)
            : (line.suggestedQty ?? null),
      };
    });
  }

  onAcceptAll(): void {
    this.applyAcceptAllDecisions();
    this.acceptAll.emit();
  }

  onOpenNegotiation(): void {
    const url = this.openNegotiationUrl()?.trim();
    if (url) {
      window.open(url, '_blank', 'noopener');
    }
  }

  onSendCounter(): void {
    this.sendCounter.emit();
  }

  applyAcceptAllDecisions(): void {
    const next: Record<string, NegotiationLineDecisionState> = { ...this.lineDecisions() };
    for (const line of this.negotiableLines()) {
      next[line.lineItemId] = { decision: 'accept' };
    }
    this.lineDecisions.set(next);
  }

  lineItemLabel(line: AdminEstimateNegotiationLine): string {
    return line.itemName?.trim() || line.itemCode?.trim() || 'Line item';
  }

  vendorDisplay(line: AdminEstimateNegotiationLine): string {
    return this.formatMoney(line.vendorValue);
  }

  agentSuggestionTooltip(line: AdminEstimateNegotiationLine): string {
    const parts = [
      line.llmReasoning?.trim(),
      line.reasoning?.trim(),
      line.itemDescription?.trim(),
    ].filter((value, index, array) => value && array.indexOf(value) === index);
    return parts.join('\n\n');
  }

  hasAgentSuggestionTooltip(line: AdminEstimateNegotiationLine): boolean {
    return this.agentSuggestionTooltip(line).length > 0;
  }

  private formatMoney(value: number): string {
    const rounded = Math.round(value * 100) / 100;
    return rounded % 1 === 0 ? `$${rounded.toFixed(0)}` : `$${rounded.toFixed(2)}`;
  }

  private patchDecision(lineItemId: string, state: NegotiationLineDecisionState): void {
    this.lineDecisions.update((prev) => ({ ...prev, [lineItemId]: state }));
    this.lineDecisionChange.emit({ lineItemId, state });
  }
}
