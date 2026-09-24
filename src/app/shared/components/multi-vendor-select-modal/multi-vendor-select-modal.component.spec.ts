import { ComponentFixture, TestBed } from '@angular/core/testing';

import {
  MultiVendorSelectModalComponent,
  MultiVendorSelectCandidate,
  MultiVendorSelectOption,
} from './multi-vendor-select-modal.component';

function option(overrides: Partial<MultiVendorSelectOption> = {}): MultiVendorSelectOption {
  return {
    estimateKey: 'est-1',
    optionLabel: null,
    estimateNo: '1001',
    estimateDateDisplay: '1/2/26',
    estimateTotal: 500,
    statusLabel: 'Submitted',
    lineItems: [],
    ...overrides,
  };
}

function candidate(overrides: Partial<MultiVendorSelectCandidate> = {}): MultiVendorSelectCandidate {
  return {
    vendorKey: 'vendor-1',
    vendorName: 'Acme Plumbing',
    options: [option()],
    ...overrides,
  };
}

describe('MultiVendorSelectModalComponent', () => {
  let fixture: ComponentFixture<MultiVendorSelectModalComponent>;
  let component: MultiVendorSelectModalComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MultiVendorSelectModalComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(MultiVendorSelectModalComponent);
    component = fixture.componentInstance;
  });

  it('is hidden until open() is called', () => {
    fixture.detectChanges();
    expect(component.isVisible()).toBe(false);
  });

  it('open() shows the modal and seeds candidates with an empty selection', () => {
    component.open([
      candidate({ vendorKey: 'a', options: [option({ estimateKey: 'a-1' })] }),
      candidate({ vendorKey: 'b', options: [option({ estimateKey: 'b-1' })] }),
    ]);
    expect(component.isVisible()).toBe(true);
    expect(component.candidates().length).toBe(2);
    expect(component.selectedCount()).toBe(0);
  });

  it('canProceed is false with 0 or 1 vendor selected, true with 2+', () => {
    component.open([
      candidate({ vendorKey: 'a', options: [option({ estimateKey: 'a-1' })] }),
      candidate({ vendorKey: 'b', options: [option({ estimateKey: 'b-1' })] }),
      candidate({ vendorKey: 'c', options: [option({ estimateKey: 'c-1' })] }),
    ]);

    expect(component.canProceed()).toBe(false);

    component.toggle('a', 'a-1', true);
    expect(component.selectedCount()).toBe(1);
    expect(component.canProceed()).toBe(false);

    component.toggle('b', 'b-1', true);
    expect(component.selectedCount()).toBe(2);
    expect(component.canProceed()).toBe(true);

    component.toggle('c', 'c-1', true);
    expect(component.canProceed()).toBe(true); // no upper cap
  });

  it('toggle(vendorKey, key, false) deselects a previously selected row', () => {
    component.open([
      candidate({ vendorKey: 'a', options: [option({ estimateKey: 'a-1' })] }),
      candidate({ vendorKey: 'b', options: [option({ estimateKey: 'b-1' })] }),
    ]);
    component.toggle('a', 'a-1', true);
    component.toggle('a', 'a-1', false);
    expect(component.isSelected('a-1')).toBe(false);
    expect(component.selectedCount()).toBe(0);
  });

  it('selecting a second option from the same vendor replaces the first (at most one per vendor)', () => {
    component.open([
      candidate({
        vendorKey: 'a',
        options: [option({ estimateKey: 'a-good' }), option({ estimateKey: 'a-better' })],
      }),
      candidate({ vendorKey: 'b', options: [option({ estimateKey: 'b-1' })] }),
    ]);

    component.select('a', 'a-good');
    expect(component.isSelected('a-good')).toBe(true);
    expect(component.selectedCount()).toBe(1);

    component.select('a', 'a-better');
    expect(component.isSelected('a-good')).toBe(false);
    expect(component.isSelected('a-better')).toBe(true);
    expect(component.selectedCount()).toBe(1); // still one selection, just a different option
  });

  it('onNext() with < 2 vendors selected shows the validation hint and does not emit', () => {
    component.open([
      candidate({ vendorKey: 'a', options: [option({ estimateKey: 'a-1' })] }),
      candidate({ vendorKey: 'b', options: [option({ estimateKey: 'b-1' })] }),
    ]);
    component.toggle('a', 'a-1', true);

    const nextSpy = vi.fn();
    component.next.subscribe(nextSpy);

    component.onNext();

    expect(component.showValidationHint()).toBe(true);
    expect(nextSpy).not.toHaveBeenCalled();
    expect(component.isVisible()).toBe(true); // stays open
  });

  it('onNext() with 2+ vendors selected emits the selected option keys and closes', () => {
    component.open([
      candidate({ vendorKey: 'a', options: [option({ estimateKey: 'a-1' })] }),
      candidate({ vendorKey: 'b', options: [option({ estimateKey: 'b-1' })] }),
      candidate({ vendorKey: 'c', options: [option({ estimateKey: 'c-1' })] }),
    ]);
    component.toggle('a', 'a-1', true);
    component.toggle('c', 'c-1', true);

    const nextSpy = vi.fn();
    component.next.subscribe(nextSpy);

    component.onNext();

    expect(nextSpy).toHaveBeenCalledWith(['a-1', 'c-1']);
    expect(component.isVisible()).toBe(false);
  });

  it('reopening resets selection and validation hint from a prior session', () => {
    component.open([
      candidate({ vendorKey: 'a', options: [option({ estimateKey: 'a-1' })] }),
      candidate({ vendorKey: 'b', options: [option({ estimateKey: 'b-1' })] }),
    ]);
    component.toggle('a', 'a-1', true);
    component.onNext(); // only 1 vendor selected -> shows hint, stays open

    component.open([
      candidate({ vendorKey: 'x', options: [option({ estimateKey: 'x-1' })] }),
      candidate({ vendorKey: 'y', options: [option({ estimateKey: 'y-1' })] }),
    ]);

    expect(component.selectedCount()).toBe(0);
    expect(component.showValidationHint()).toBe(false);
  });

  it('formatCurrency renders USD with 2 decimals', () => {
    expect(component.formatCurrency(1234.5)).toBe('$1,234.50');
    expect(component.formatCurrency(0)).toBe('$0.00');
  });
});
