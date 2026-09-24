import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { CreateCustomerEstimateModalComponent } from './create-customer-estimate-modal.component';
import { AssignVendorService } from '../../../services/assign-vendor.service';
import { DynMinMarkupService } from '../../../services/dyn-min-markup.service';
import { CreateCustomerEstimateResponse, CustomerEstimateLineItem } from '../../../models/on-site-estimate.model';
import { DynMinMarkupPolicy } from '../../../models/dyn-min-markup.model';

function policy(overrides: Partial<DynMinMarkupPolicy> = {}): DynMinMarkupPolicy {
  return {
    customerKey: 'cust-1',
    markupPercentageForEmergency: 50,
    markupPercentageForNonEmergency: 40,
    overValuesWithMarkupPercentages: [
      { costOverValue: 5000, markupPercentage: 20 },
      { costOverValue: 10000, markupPercentage: 15 },
    ],
    ...overrides,
  };
}

function lineItem(overrides: Partial<CustomerEstimateLineItem> = {}): CustomerEstimateLineItem {
  return {
    chargeType: 'Materials',
    chargeTypeKey: 'materials-key',
    description: 'Parts',
    vendorRate: 100,
    vendorQty: 1,
    vendorAmount: 100,
    customerRate: 140,
    customerQty: 1,
    customerAmount: 140,
    calculatedMarkupPercent: 40,
    wasHourAdjusted: false,
    lineType: 'material',
    costIncurred: 1,
    isCustomLineItem: false,
    ...overrides,
  };
}

function response(lineItems: CustomerEstimateLineItem[]): CreateCustomerEstimateResponse {
  return {
    customerEstimateKey: 'ce-1',
    lineItems,
    vendorTotal: lineItems.reduce((s, l) => s + l.vendorAmount, 0),
    customerTotal: lineItems.reduce((s, l) => s + l.customerAmount, 0),
    message: 'ok',
  };
}

describe('CreateCustomerEstimateModalComponent — multi-vendor combine', () => {
  let fixture: ComponentFixture<CreateCustomerEstimateModalComponent>;
  let component: CreateCustomerEstimateModalComponent;
  let assignVendorSvc: {
    previewCustomerEstimate: ReturnType<typeof vi.fn>;
    previewMultiVendorCustomerEstimate: ReturnType<typeof vi.fn>;
    createCustomerEstimate: ReturnType<typeof vi.fn>;
    updateCustomerEstimate: ReturnType<typeof vi.fn>;
    getCustomerEstimateHistory: ReturnType<typeof vi.fn>;
  };
  let dynMinMarkupSvc: { getPolicy: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    assignVendorSvc = {
      previewCustomerEstimate: vi.fn().mockReturnValue(of({ status: false, message: '', data: null })),
      previewMultiVendorCustomerEstimate: vi.fn().mockReturnValue(of({ status: false, message: '', data: null })),
      createCustomerEstimate: vi.fn().mockReturnValue(
        of({ status: true, message: 'ok', data: response([lineItem()]) }),
      ),
      updateCustomerEstimate: vi.fn().mockReturnValue(
        of({ status: true, message: 'ok', data: { updatedLineItems: 1, customerTotal: 140, vendorTotal: 100, markupPercent: 40 } }),
      ),
      getCustomerEstimateHistory: vi.fn().mockReturnValue(of({ status: true, message: 'ok', data: { current: null, previous: null } })),
    };
    dynMinMarkupSvc = { getPolicy: vi.fn().mockReturnValue(of(null)) };

    await TestBed.configureTestingModule({
      imports: [CreateCustomerEstimateModalComponent],
      providers: [
        { provide: AssignVendorService, useValue: assignVendorSvc },
        { provide: DynMinMarkupService, useValue: dynMinMarkupSvc },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CreateCustomerEstimateModalComponent);
    component = fixture.componentInstance;
  });

  it('single-vendor open() leaves isMultiVendor false and calls the single-vendor preview endpoint', () => {
    component.open({ jobKey: 'job-1', vendorEstimateKey: 've-1' });

    expect(component.isMultiVendor()).toBe(false);
    expect(assignVendorSvc.previewCustomerEstimate).toHaveBeenCalledWith('ve-1');
    expect(assignVendorSvc.previewMultiVendorCustomerEstimate).not.toHaveBeenCalled();
  });

  it('open() with 2+ vendorEstimateKeys sets isMultiVendor and calls the multi-vendor preview endpoint', () => {
    component.open({
      jobKey: 'job-1',
      vendorEstimateKeys: ['ve-1', 've-2'],
      vendorNames: { 've-1': 'Vendor A', 've-2': 'Vendor B' },
    });

    expect(component.isMultiVendor()).toBe(true);
    expect(assignVendorSvc.previewMultiVendorCustomerEstimate).toHaveBeenCalledWith(['ve-1', 've-2']);
    expect(assignVendorSvc.previewCustomerEstimate).not.toHaveBeenCalled();
  });

  it('open() with only one vendorEstimateKeys entry falls back to single-vendor behavior', () => {
    component.open({ jobKey: 'job-1', vendorEstimateKeys: ['ve-1'] });

    expect(component.isMultiVendor()).toBe(false);
    expect(assignVendorSvc.previewMultiVendorCustomerEstimate).not.toHaveBeenCalled();
  });

  it('open() with vendorEstimateKeys is ignored outside create mode (edit/view load by job)', () => {
    component.open({
      jobKey: 'job-1',
      vendorEstimateKeys: ['ve-1', 've-2'],
      mode: 'edit',
    });

    expect(component.isMultiVendor()).toBe(false);
    expect(assignVendorSvc.getCustomerEstimateHistory).toHaveBeenCalledWith('job-1');
  });

  it('groupedRows() buckets rows by sourceVendorEstimateKey in first-seen order with per-group subtotals', () => {
    assignVendorSvc.previewMultiVendorCustomerEstimate.mockReturnValue(
      of({
        status: true,
        message: 'ok',
        data: response([
          lineItem({ description: 'A1', sourceVendorEstimateKey: 've-1', customerRate: 100, customerQty: 1 }),
          lineItem({ description: 'B1', sourceVendorEstimateKey: 've-2', customerRate: 50, customerQty: 2 }),
          lineItem({ description: 'A2', sourceVendorEstimateKey: 've-1', customerRate: 10, customerQty: 1 }),
        ]),
      }),
    );

    component.open({
      jobKey: 'job-1',
      vendorEstimateKeys: ['ve-1', 've-2'],
      vendorNames: { 've-1': 'Vendor A', 've-2': 'Vendor B' },
    });

    const groups = component.groupedRows();
    expect(groups.map((g) => g.vendorEstimateKey)).toEqual(['ve-1', 've-2']);
    expect(groups[0].vendorName).toBe('Vendor A');
    expect(groups[0].rows.map((r) => r.description)).toEqual(['A1', 'A2']);
    expect(groups[0].subtotal).toBe(110);
    expect(groups[1].vendorName).toBe('Vendor B');
    expect(groups[1].subtotal).toBe(100);
  });

  it('groupedRows() falls back to "Vendor" when no name was supplied for a key', () => {
    assignVendorSvc.previewMultiVendorCustomerEstimate.mockReturnValue(
      of({
        status: true,
        message: 'ok',
        data: response([lineItem({ sourceVendorEstimateKey: 've-1' })]),
      }),
    );

    component.open({ jobKey: 'job-1', vendorEstimateKeys: ['ve-1', 've-2'] });

    expect(component.groupedRows()[0].vendorName).toBe('Vendor');
  });

  it('save() on a multi-vendor session sends vendorEstimateKeys on the create call', () => {
    // Preview succeeds (status: true) so the session stays un-persisted after open() and save()
    // exercises the create path rather than falling through to update.
    assignVendorSvc.previewMultiVendorCustomerEstimate.mockReturnValue(
      of({ status: true, message: 'ok', data: response([lineItem({ sourceVendorEstimateKey: 've-1' })]) }),
    );

    component.open({
      jobKey: 'job-1',
      vendorEstimateKeys: ['ve-1', 've-2'],
      vendorNames: { 've-1': 'A', 've-2': 'B' },
    });

    component.save('save');

    expect(assignVendorSvc.createCustomerEstimate).toHaveBeenCalledWith(
      expect.objectContaining({ vendorEstimateKeys: ['ve-1', 've-2'] }),
    );
  });

  it('save() on a single-vendor session omits vendorEstimateKeys from the create call', () => {
    assignVendorSvc.previewCustomerEstimate.mockReturnValue(
      of({ status: true, message: 'ok', data: response([lineItem()]) }),
    );

    component.open({ jobKey: 'job-1', vendorEstimateKey: 've-1' });

    component.save('save');

    const sentRequest = assignVendorSvc.createCustomerEstimate.mock.calls[0][0];
    expect(sentRequest.vendorEstimateKeys).toBeUndefined();
    expect(sentRequest.vendorEstimateKey).toBe('ve-1');
  });

  describe('activeMinMarkupRow — minimum-markup popover highlight', () => {
    it('returns null when no policy is loaded (no customerKey supplied)', () => {
      component.open({ jobKey: 'job-1', vendorEstimateKey: 've-1' });
      expect(component.activeMinMarkupRow()).toBeNull();
    });

    it('below all tiers, non-emergency job: highlights the non-emergency row', () => {
      dynMinMarkupSvc.getPolicy.mockReturnValue(of(policy()));
      // vendorTotal from the default lineItem() fixture is 100 - below the lowest tier (5000).
      component.open({ jobKey: 'job-1', vendorEstimateKey: 've-1', customerKey: 'cust-1', isEmergency: false });

      expect(component.activeMinMarkupRow()).toEqual({ kind: 'nonEmergency' });
    });

    it('below all tiers, emergency job: highlights the emergency row', () => {
      dynMinMarkupSvc.getPolicy.mockReturnValue(of(policy()));
      component.open({ jobKey: 'job-1', vendorEstimateKey: 've-1', customerKey: 'cust-1', isEmergency: true });

      expect(component.activeMinMarkupRow()).toEqual({ kind: 'emergency' });
    });

    it('vendor total strictly exceeding a cost tier highlights that tier, not emergency/non-emergency', () => {
      dynMinMarkupSvc.getPolicy.mockReturnValue(of(policy()));
      assignVendorSvc.previewCustomerEstimate.mockReturnValue(
        of({ status: true, message: 'ok', data: response([lineItem({ vendorAmount: 6000, vendorRate: 6000 })]) }),
      );
      component.open({ jobKey: 'job-1', vendorEstimateKey: 've-1', customerKey: 'cust-1' });

      expect(component.activeMinMarkupRow()).toEqual({ kind: 'tier', costOverValue: 5000 });
    });

    it('vendor total exceeding the higher tier highlights the higher tier (highest strictly-exceeded wins)', () => {
      dynMinMarkupSvc.getPolicy.mockReturnValue(of(policy()));
      assignVendorSvc.previewCustomerEstimate.mockReturnValue(
        of({ status: true, message: 'ok', data: response([lineItem({ vendorAmount: 12000, vendorRate: 12000 })]) }),
      );
      component.open({ jobKey: 'job-1', vendorEstimateKey: 've-1', customerKey: 'cust-1' });

      expect(component.activeMinMarkupRow()).toEqual({ kind: 'tier', costOverValue: 10000 });
    });

    it('vendor total exactly equal to a tier boundary does not count as exceeding it (strict >)', () => {
      dynMinMarkupSvc.getPolicy.mockReturnValue(of(policy()));
      assignVendorSvc.previewCustomerEstimate.mockReturnValue(
        of({ status: true, message: 'ok', data: response([lineItem({ vendorAmount: 5000, vendorRate: 5000 })]) }),
      );
      component.open({ jobKey: 'job-1', vendorEstimateKey: 've-1', customerKey: 'cust-1', isEmergency: false });

      expect(component.activeMinMarkupRow()).toEqual({ kind: 'nonEmergency' });
    });
  });
});
