import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EstimateNegotiationPanelComponent } from './estimate-negotiation-panel.component';
import { AdminEstimateNegotiation } from '../../../../models/vendor-bills.model';

describe('EstimateNegotiationPanelComponent', () => {
  let component: EstimateNegotiationPanelComponent;
  let fixture: ComponentFixture<EstimateNegotiationPanelComponent>;

  const mockNegotiation: AdminEstimateNegotiation = {
    proposalId: 'p1',
    status: 'awaiting_admin',
    roundsCount: 0,
    recommendationsReady: true,
    showPanel: true,
    lines: [
      {
        lineItemId: 'line-1',
        itemName: 'Labor',
        vendorValue: 720,
        suggestedValue: 480,
        suggestedQty: 4,
        counterThisLine: true,
        displaySuggestion: '5 hrs',
        flags: [],
      },
      {
        lineItemId: 'line-2',
        itemName: 'Trip Charge',
        vendorValue: 75,
        suggestedValue: 75,
        counterThisLine: false,
        displaySuggestion: '$75',
        flags: [],
      },
    ],
    dneSummary: {
      customerDne: 1500,
      ceiling50Pct: 750,
      revisedDne: 555,
    },
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EstimateNegotiationPanelComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(EstimateNegotiationPanelComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('estimateKey', 'est-1');
    fixture.componentRef.setInput('negotiation', mockNegotiation);
    fixture.detectChanges();
  });

  it('renders negotiable lines only in buildCounterActions', () => {
    const actions = component.buildCounterActions();
    expect(actions.length).toBe(1);
    expect(actions[0].lineItemId).toBe('line-1');
    expect(actions[0].action).toBe('accept');
    expect(actions[0].value).toBe(480);
  });

  it('uses decline value when decline is selected', () => {
    component.setDecision(mockNegotiation.lines[0], 'decline');
    const actions = component.buildCounterActions();
    expect(actions[0].action).toBe('decline');
    expect(actions[0].value).toBe(720);
  });

  it('shows generating state while loading', () => {
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();
    expect(component.panelState()).toBe('generating');
  });

  it('shows all recommendation lines including pass-through', () => {
    expect(component.displayLines().length).toBe(2);
    expect(component.negotiableLines().length).toBe(1);
    expect(component.passThroughLines().length).toBe(1);
  });

  it('labels lines with item name and formats vendor value', () => {
    expect(component.lineItemLabel(mockNegotiation.lines[0])).toBe('Labor');
    expect(component.vendorDisplay(mockNegotiation.lines[0])).toBe('$720');
    expect(component.lineItemLabel(mockNegotiation.lines[1])).toBe('Trip Charge');
  });

  it('builds agent suggestion tooltip from reasoning fields', () => {
    const line = {
      ...mockNegotiation.lines[0],
      llmReasoning: 'Reduce labor hours to match DNE.',
      reasoning: 'Reduce labor hours to match DNE.',
      itemDescription: 'Work Incurred Description: Labor',
    };
    expect(component.agentSuggestionTooltip(line)).toContain('Reduce labor hours');
    expect(component.hasAgentSuggestionTooltip(line)).toBe(true);
  });

  it('defaults negotiable lines to accept decision', () => {
    expect(component.lineDecisions()['line-1']?.decision).toBe('accept');
    expect(component.isDecision('line-1', 'accept')).toBe(true);
  });

  it('applyAcceptAllDecisions marks every negotiable line accept', () => {
    component.setDecision(mockNegotiation.lines[0], 'decline');
    component.applyAcceptAllDecisions();
    expect(component.isDecision('line-1', 'accept')).toBe(true);
  });
});
