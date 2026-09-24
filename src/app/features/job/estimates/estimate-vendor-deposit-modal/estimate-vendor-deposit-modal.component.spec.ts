import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { EstimateVendorDepositModalComponent } from './estimate-vendor-deposit-modal.component';
import { DepositService } from '../../../../services/deposit.service';
import { DepositVendorInfo } from '../../../../models/deposit.model';

function vendorInfo(overrides: Partial<DepositVendorInfo> = {}): DepositVendorInfo {
  return {
    jobVendorKey: 'jv-1',
    vendorName: 'Acme Plumbing',
    vendorEstimateTotal: 1000,
    existingDepositAmount: 0,
    ...overrides,
  };
}

/** Wraps vendors in the deposit-context envelope the API returns, with no customer deposit by default. */
function contextResponse(
  vendors: DepositVendorInfo[],
  customer: { customerDepositAmount?: number; customerDepositUnpaid?: boolean } = {},
) {
  return {
    status: true,
    message: 'ok',
    data: {
      vendors,
      customerDepositAmount: customer.customerDepositAmount ?? 0,
      customerDepositUnpaid: customer.customerDepositUnpaid ?? false,
    },
  };
}

describe('EstimateVendorDepositModalComponent', () => {
  let fixture: ComponentFixture<EstimateVendorDepositModalComponent>;
  let component: EstimateVendorDepositModalComponent;
  let depositSvc: {
    getDepositContextForCustomerEstimate: ReturnType<typeof vi.fn>;
    saveDeposit: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    depositSvc = {
      getDepositContextForCustomerEstimate: vi.fn().mockReturnValue(of(contextResponse([vendorInfo()]))),
      saveDeposit: vi.fn().mockReturnValue(
        of({ status: true, message: 'ok', data: { vendorsSaved: 1, vendorsRemoved: 0, depositBillsCreated: 0, customerDepositSet: true, customerDepositRemoved: false, notes: [] } }),
      ),
    };

    await TestBed.configureTestingModule({
      imports: [EstimateVendorDepositModalComponent],
      providers: [{ provide: DepositService, useValue: depositSvc }],
    }).compileComponents();

    fixture = TestBed.createComponent(EstimateVendorDepositModalComponent);
    component = fixture.componentInstance;
  });

  it('is hidden until open() is called', () => {
    fixture.detectChanges();
    expect(component.isVisible()).toBe(false);
  });

  it('open() fetches vendors for the customer estimate and seeds one page per vendor', () => {
    component.open({ jobKey: 'job-1', customerEstimateKey: 'ce-1' });

    expect(depositSvc.getDepositContextForCustomerEstimate).toHaveBeenCalledWith('ce-1');
    expect(component.isVisible()).toBe(true);
    expect(component.vendorPages().length).toBe(1);
    expect(component.isMultiVendor()).toBe(false);
  });

  it('single vendor: isMultiVendor is false and pagination is not implied', () => {
    component.open({ jobKey: 'job-1', customerEstimateKey: 'ce-1' });
    expect(component.isMultiVendor()).toBe(false);
    expect(component.isFirstVendorPage()).toBe(true);
    expect(component.isLastVendorPage()).toBe(true);
  });

  it('multi-vendor: seeds one page per vendor, in the order returned by the backend', () => {
    depositSvc.getDepositContextForCustomerEstimate.mockReturnValue(
      of(contextResponse([vendorInfo({ jobVendorKey: 'jv-1', vendorName: 'A' }), vendorInfo({ jobVendorKey: 'jv-2', vendorName: 'B' })])),
    );
    component.open({ jobKey: 'job-1', customerEstimateKey: 'ce-1' });
    component.onPickNext(); // group-wide entry starts on the picker; accept the default (all vendors)

    expect(component.isMultiVendor()).toBe(true);
    expect(component.vendorPages().map((p) => p.info.vendorName)).toEqual(['A', 'B']);
  });

  it('load failure surfaces loadError and does not seed pages', () => {
    depositSvc.getDepositContextForCustomerEstimate.mockReturnValue(of({ status: false, message: 'nope', data: null }));
    component.open({ jobKey: 'job-1', customerEstimateKey: 'ce-1' });

    expect(component.loadError()).toBe('nope');
    expect(component.vendorPages().length).toBe(0);
  });

  describe('per-vendor loop navigation (2 vendors)', () => {
    beforeEach(() => {
      depositSvc.getDepositContextForCustomerEstimate.mockReturnValue(
        of(contextResponse([
            vendorInfo({ jobVendorKey: 'jv-1', vendorName: 'A', vendorEstimateTotal: 1000 }),
            vendorInfo({ jobVendorKey: 'jv-2', vendorName: 'B', vendorEstimateTotal: 1000 }),
          ])),
      );
      component.open({ jobKey: 'job-1', customerEstimateKey: 'ce-1' });
      component.onPickNext(); // past the picker, with both vendors selected by default
    });

    it('"No" on vendor 1 advances to vendor 2 without requiring an amount', () => {
      component.selectNo();
      expect(component.canProceedVendor()).toBe(true);
      component.onVendorNext();

      expect(component.vendorPageIndex()).toBe(1);
      expect(component.currentVendorPage()?.info.vendorName).toBe('B');
    });

    it('"Yes" under the 50% threshold advances without a warning', () => {
      component.selectYes();
      component.setVendorDollar('100'); // 10% of 1000
      component.onVendorNext();

      expect(component.vendorPageIndex()).toBe(1);
      expect(component.currentVendorPage()?.showWarning).toBe(false);
    });

    it('"Yes" over 50% shows a warning and blocks advancing until Override', () => {
      component.selectYes();
      component.setVendorDollar('600'); // 60% of 1000
      component.onVendorNext();

      expect(component.vendorPageIndex()).toBe(0); // blocked, still on vendor 1
      expect(component.currentVendorPage()?.showWarning).toBe(true);
    });

    it('Override requires a typed reason before it proceeds', () => {
      component.selectYes();
      component.setVendorDollar('600');
      component.onVendorNext(); // triggers warning

      component.overrideVendorDeposit(); // no reason yet
      expect(component.vendorPageIndex()).toBe(0); // still blocked

      component.setVendorOverrideReason('Vendor requires larger deposit due to material cost');
      component.overrideVendorDeposit();
      expect(component.vendorPageIndex()).toBe(1); // now advances
    });

    it('"Reduce Deposit Amount" dismisses the warning without advancing', () => {
      component.selectYes();
      component.setVendorDollar('600');
      component.onVendorNext();

      component.reduceVendorDeposit();
      expect(component.currentVendorPage()?.showWarning).toBe(false);
      expect(component.vendorPageIndex()).toBe(0);
    });

    it('Back from vendor 2 returns to vendor 1, preserving its entered data', () => {
      component.selectYes();
      component.setVendorDollar('100');
      component.onVendorNext(); // -> vendor 2

      component.backFromVendorPage();

      expect(component.vendorPageIndex()).toBe(0);
      expect(component.currentVendorPage()?.dollar).toBe('100');
    });

    it('Back from vendor 1 (first page) returns to the picker, not out of the flow', () => {
      const closeSpy = vi.fn();
      component.close.subscribe(closeSpy);

      component.backFromVendorPage();

      expect(component.step()).toBe('pick');
      expect(closeSpy).not.toHaveBeenCalled();
    });

    it('reaching the customer step requires resolving every vendor page', () => {
      component.selectNo();
      component.onVendorNext(); // vendor 1 -> vendor 2
      expect(component.step()).toBe('vendor');

      component.selectNo();
      component.onVendorNext(); // vendor 2 (last) -> customer step
      expect(component.step()).toBe('customer');
    });
  });

  describe('customer-side 135% best-practice warning', () => {
    beforeEach(() => {
      depositSvc.getDepositContextForCustomerEstimate.mockReturnValue(
        of(contextResponse([vendorInfo({ vendorEstimateTotal: 1000 })])),
      );
      component.open({ jobKey: 'job-1', customerEstimateKey: 'ce-1' });
      component.selectYes();
      component.setVendorDollar('400'); // total vendor deposit entered = 400
      component.onVendorNext(); // -> customer step
    });

    it('customer amount below the vendor total blocks save and shows a warning', () => {
      component.customerDollar.set('300'); // < 400
      component.saveCustomerDeposit();

      expect(component.showCustomerWarning()).toBe(true);
      expect(depositSvc.saveDeposit).not.toHaveBeenCalled();
    });

    it('customer amount at least the vendor total but below 135% blocks save and shows a warning', () => {
      component.customerDollar.set('420'); // 105% of 400, below 135%
      component.saveCustomerDeposit();

      expect(component.showCustomerWarning()).toBe(true);
      expect(depositSvc.saveDeposit).not.toHaveBeenCalled();
    });

    it('customer amount at least 135% of vendor total saves without a warning', () => {
      component.customerDollar.set('540'); // 135% of 400
      component.saveCustomerDeposit();

      expect(component.showCustomerWarning()).toBe(false);
      expect(depositSvc.saveDeposit).toHaveBeenCalled();
    });

    it('override reason authorizes a below-threshold save', () => {
      component.customerDollar.set('300');
      component.saveCustomerDeposit(); // shows warning, blocked

      component.customerOverrideReason.set('Customer requested lower deposit, approved by manager');
      component.saveCustomerDeposit();

      expect(depositSvc.saveDeposit).toHaveBeenCalled();
    });

    it('no vendor deposit entered means no customer-side check at all', () => {
      component.vendorPageIndex.set(0);
      component.selectNo();
      // rebuild scenario with no vendor deposit
      depositSvc.getDepositContextForCustomerEstimate.mockReturnValue(
        of(contextResponse([vendorInfo({ vendorEstimateTotal: 1000 })])),
      );
      component.open({ jobKey: 'job-1', customerEstimateKey: 'ce-1' });
      component.selectNo();
      component.onVendorNext();

      component.customerDollar.set('1');
      component.saveCustomerDeposit();

      expect(component.showCustomerWarning()).toBe(false);
      expect(depositSvc.saveDeposit).toHaveBeenCalled();
    });
  });

  describe('existing customer deposit', () => {
    it('prefills the customer step and shows the notice when a deposit is set but unpaid', () => {
      depositSvc.getDepositContextForCustomerEstimate.mockReturnValue(
        of(contextResponse([vendorInfo()], { customerDepositAmount: 250, customerDepositUnpaid: true })),
      );
      component.open({ jobKey: 'job-1', customerEstimateKey: 'ce-1' });

      expect(component.existingCustomerDeposit()).toBe(250);
      expect(component.showExistingCustomerNotice()).toBe(true);
      expect(component.existingCustomerNoticeText()).toContain('$250');

      component.selectNo();
      component.onVendorNext(); // -> customer step prefills from the existing deposit

      expect(component.customerDollar()).toBe('250');
    });

    it('does not offer an already-paid deposit for editing', () => {
      depositSvc.getDepositContextForCustomerEstimate.mockReturnValue(
        of(contextResponse([vendorInfo()], { customerDepositAmount: 250, customerDepositUnpaid: false })),
      );
      component.open({ jobKey: 'job-1', customerEstimateKey: 'ce-1' });

      expect(component.existingCustomerDeposit()).toBe(0);
      expect(component.showExistingCustomerNotice()).toBe(false);

      component.selectNo();
      component.onVendorNext();
      expect(component.customerDollar()).toBe('');
    });

    it('no existing deposit leaves the customer step empty with no notice', () => {
      component.open({ jobKey: 'job-1', customerEstimateKey: 'ce-1' });

      expect(component.existingCustomerDeposit()).toBe(0);
      expect(component.showExistingCustomerNotice()).toBe(false);
    });
  });

  describe('per-vendor scoping (launched from one vendor card)', () => {
    const twoVendors = contextResponse([
      vendorInfo({ jobVendorKey: 'jv-1', vendorName: 'A', vendorEstimateTotal: 1000 }),
      vendorInfo({ jobVendorKey: 'jv-2', vendorName: 'B', vendorEstimateTotal: 1000, existingDepositAmount: 300 }),
    ]);

    it('shows only the clicked vendor, even though the estimate has two', () => {
      depositSvc.getDepositContextForCustomerEstimate.mockReturnValue(of(twoVendors));
      component.open({ jobKey: 'job-1', customerEstimateKey: 'ce-1', jobVendorKey: 'jv-2' });

      expect(component.vendorPages().length).toBe(1);
      expect(component.vendorPages()[0].info.vendorName).toBe('B');
      expect(component.isMultiVendor()).toBe(false);
    });

    it('prefills the scoped vendor from its deposit already on record', () => {
      depositSvc.getDepositContextForCustomerEstimate.mockReturnValue(of(twoVendors));
      component.open({ jobKey: 'job-1', customerEstimateKey: 'ce-1', jobVendorKey: 'jv-2' });

      const page = component.vendorPages()[0];
      expect(page.choice).toBe('yes');
      expect(page.dollar).toBe('300');
      expect(page.percent).toBe('30');
    });

    it("counts the other vendor's saved deposit in the 35% check", () => {
      depositSvc.getDepositContextForCustomerEstimate.mockReturnValue(of(twoVendors));
      // Scope to A (nothing on record); B already has $300 saved.
      component.open({ jobKey: 'job-1', customerEstimateKey: 'ce-1', jobVendorKey: 'jv-1' });

      component.selectYes();
      component.setVendorDollar('100');
      component.onVendorNext();

      // Job-wide vendor total is 400 (100 entered + 300 on record), so 450 is under the 1.35x floor.
      component.customerDollar.set('450');
      component.saveCustomerDeposit();

      expect(component.showCustomerWarning()).toBe(true);
      expect(depositSvc.saveDeposit).not.toHaveBeenCalled();
      expect(component.customerWarningText()).toContain('540.00');
    });

    it('saves only the scoped vendor, leaving the other vendor untouched', () => {
      depositSvc.getDepositContextForCustomerEstimate.mockReturnValue(of(twoVendors));
      component.open({ jobKey: 'job-1', customerEstimateKey: 'ce-1', jobVendorKey: 'jv-1' });

      component.selectYes();
      component.setVendorDollar('100');
      component.onVendorNext();

      component.customerDollar.set('600');
      component.saveCustomerDeposit();

      const req = depositSvc.saveDeposit.mock.calls[0][0];
      expect(req.vendorDepositList).toEqual([{ jobVendorKey: 'jv-1', depositAmount: 100 }]);
      expect(req.vendorDepositRemovedList).toEqual([]);
    });

    it('answering "No" for a vendor with a deposit on record sends it as a removal', () => {
      depositSvc.getDepositContextForCustomerEstimate.mockReturnValue(of(twoVendors));
      component.open({ jobKey: 'job-1', customerEstimateKey: 'ce-1', jobVendorKey: 'jv-2' });

      component.selectNo();
      component.onVendorNext();
      component.customerDollar.set('500');
      component.saveCustomerDeposit();

      const req = depositSvc.saveDeposit.mock.calls[0][0];
      expect(req.vendorDepositList).toEqual([]);
      expect(req.vendorDepositRemovedList).toEqual([{ jobVendorKey: 'jv-2', depositAmount: 300 }]);
    });

    it('a vendor outside the estimate group is an explicit error, not a silent fallback', () => {
      depositSvc.getDepositContextForCustomerEstimate.mockReturnValue(of(twoVendors));
      component.open({ jobKey: 'job-1', customerEstimateKey: 'ce-1', jobVendorKey: 'jv-stale' });

      expect(component.vendorPages().length).toBe(0);
      expect(component.loadError()).toBe('This vendor is not part of the current customer estimate.');
    });

    it('omitting jobVendorKey opens the picker instead of scoping', () => {
      depositSvc.getDepositContextForCustomerEstimate.mockReturnValue(of(twoVendors));
      component.open({ jobKey: 'job-1', customerEstimateKey: 'ce-1' });

      expect(component.step()).toBe('pick');
      expect(component.hasPickStep()).toBe(true);
    });

    it('per-vendor entry never shows the picker, even with two vendors on the estimate', () => {
      depositSvc.getDepositContextForCustomerEstimate.mockReturnValue(of(twoVendors));
      component.open({ jobKey: 'job-1', customerEstimateKey: 'ce-1', jobVendorKey: 'jv-1' });

      expect(component.step()).toBe('vendor');
      expect(component.hasPickStep()).toBe(false);
    });
  });

  describe('vendor picker (group-wide entry)', () => {
    const threeVendors = contextResponse([
      vendorInfo({ jobVendorKey: 'jv-1', vendorName: 'A', vendorEstimateTotal: 1000 }),
      vendorInfo({ jobVendorKey: 'jv-2', vendorName: 'B', vendorEstimateTotal: 1000 }),
      vendorInfo({ jobVendorKey: 'jv-3', vendorName: 'C', vendorEstimateTotal: 1000, existingDepositAmount: 200 }),
    ]);

    beforeEach(() => {
      depositSvc.getDepositContextForCustomerEstimate.mockReturnValue(of(threeVendors));
      component.open({ jobKey: 'job-1', customerEstimateKey: 'ce-1' });
    });

    it('lists every vendor with all checked by default', () => {
      expect(component.step()).toBe('pick');
      expect(component.allVendors().length).toBe(3);
      expect(component.pickedVendorKeys().size).toBe(3);
      expect(component.canProceedPick()).toBe(true);
    });

    it('unchecking removes a vendor from the flow entirely', () => {
      component.toggleVendorPick('jv-2');
      expect(component.isVendorPicked('jv-2')).toBe(false);

      component.onPickNext();

      expect(component.step()).toBe('vendor');
      expect(component.vendorPages().map((p) => p.info.vendorName)).toEqual(['A', 'C']);
    });

    it('unchecking everything blocks Next', () => {
      component.toggleVendorPick('jv-1');
      component.toggleVendorPick('jv-2');
      component.toggleVendorPick('jv-3');

      expect(component.canProceedPick()).toBe(false);
      component.onPickNext();
      expect(component.step()).toBe('pick');
    });

    it('a skipped vendor is left out of the save but still counts toward the 35% basis', () => {
      // Skip C, which has $200 already on record.
      component.toggleVendorPick('jv-3');
      component.onPickNext();

      component.selectYes();
      component.setVendorDollar('100');
      component.onVendorNext();
      component.selectNo();
      component.onVendorNext(); // -> customer step

      // Job-wide total is 300 (100 entered + 200 on record for skipped C), so 350 is under 1.35x.
      component.customerDollar.set('350');
      component.saveCustomerDeposit();
      expect(component.showCustomerWarning()).toBe(true);
      expect(depositSvc.saveDeposit).not.toHaveBeenCalled();

      // Clearing the bar saves only the picked vendors — C is absent from both lists.
      component.customerDollar.set('500');
      component.saveCustomerDeposit();

      const req = depositSvc.saveDeposit.mock.calls[0][0];
      expect(req.vendorDepositList).toEqual([{ jobVendorKey: 'jv-1', depositAmount: 100 }]);
      expect(req.vendorDepositRemovedList).toEqual([]);
    });

    it('Back from the first vendor page returns to the picker instead of closing', () => {
      component.onPickNext();
      expect(component.step()).toBe('vendor');
      expect(component.isFirstVendorPage()).toBe(true);

      component.backFromVendorPage();

      expect(component.step()).toBe('pick');
      expect(component.isVisible()).toBe(true);
    });

    it('re-picking after going back rebuilds the pages from the new selection', () => {
      component.onPickNext();
      component.backFromVendorPage();

      component.toggleVendorPick('jv-1');
      component.onPickNext();

      expect(component.vendorPages().map((p) => p.info.vendorName)).toEqual(['B', 'C']);
    });

    it('a single-vendor estimate skips the picker entirely', () => {
      depositSvc.getDepositContextForCustomerEstimate.mockReturnValue(
        of(contextResponse([vendorInfo({ jobVendorKey: 'jv-1' })])),
      );
      component.open({ jobKey: 'job-1', customerEstimateKey: 'ce-1' });

      expect(component.step()).toBe('vendor');
      expect(component.hasPickStep()).toBe(false);
      expect(component.vendorPages().length).toBe(1);
    });

    it('Back from the first page still closes when there was no picker', () => {
      depositSvc.getDepositContextForCustomerEstimate.mockReturnValue(
        of(contextResponse([vendorInfo({ jobVendorKey: 'jv-1' })])),
      );
      component.open({ jobKey: 'job-1', customerEstimateKey: 'ce-1' });

      component.backFromVendorPage();
      expect(component.isVisible()).toBe(false);
    });
  });

  describe('save request shape', () => {
    it('sends one VendorDepositList entry per "Yes" vendor, omitting "No" vendors', () => {
      depositSvc.getDepositContextForCustomerEstimate.mockReturnValue(
        of(contextResponse([
            vendorInfo({ jobVendorKey: 'jv-1', vendorEstimateTotal: 1000 }),
            vendorInfo({ jobVendorKey: 'jv-2', vendorEstimateTotal: 1000 }),
          ])),
      );
      component.open({ jobKey: 'job-1', customerEstimateKey: 'ce-1' });
      component.onPickNext(); // past the picker, with both vendors selected by default

      component.selectYes();
      component.setVendorDollar('100');
      component.onVendorNext();

      component.selectNo();
      component.onVendorNext(); // -> customer step

      component.customerDollar.set('200');
      component.saveCustomerDeposit();

      const req = depositSvc.saveDeposit.mock.calls[0][0];
      expect(req.vendorDepositList).toEqual([{ jobVendorKey: 'jv-1', depositAmount: 100 }]);
      expect(req.jobKey).toBe('job-1');
      expect(req.customerEstimateKey).toBe('ce-1');
      expect(req.customerDepoAmount).toBe(200);
    });

    it('"no customer deposit" path sends customerDepoAmount 0 and the typed reason', () => {
      component.open({ jobKey: 'job-1', customerEstimateKey: 'ce-1' });
      component.selectNo();
      component.onVendorNext(); // -> customer step
      component.customerNotNeeded(); // -> confirm step

      component.reason.set('Vendor already paid in full, no deposit needed from customer');
      component.continueNoCustomerDeposit();

      const req = depositSvc.saveDeposit.mock.calls[0][0];
      expect(req.customerDepoAmount).toBe(0);
      expect(req.reasonForNoCustomerDeposit).toBe('Vendor already paid in full, no deposit needed from customer');
    });
  });

  it('save success emits complete with the result summary and closes', () => {
    component.open({ jobKey: 'job-1', customerEstimateKey: 'ce-1' });
    const completeSpy = vi.fn();
    component.complete.subscribe(completeSpy);

    component.selectNo();
    component.onVendorNext();
    component.customerDollar.set('200');
    component.saveCustomerDeposit();

    expect(completeSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'customer-deposit-saved', vendorsSaved: 1, customerDepositSet: true }),
    );
    expect(component.isVisible()).toBe(false);
  });

  it('save failure surfaces saveError and keeps the modal open', () => {
    depositSvc.saveDeposit.mockReturnValue(of({ status: false, message: 'Deposit exceeds invoice total', data: null }));
    component.open({ jobKey: 'job-1', customerEstimateKey: 'ce-1' });

    component.selectNo();
    component.onVendorNext();
    component.customerDollar.set('200');
    component.saveCustomerDeposit();

    expect(component.saveError()).toBe('Deposit exceeds invoice total');
    expect(component.isVisible()).toBe(true);
  });

  it('save network error surfaces a generic saveError', () => {
    depositSvc.saveDeposit.mockReturnValue(throwError(() => ({ error: {} })));
    component.open({ jobKey: 'job-1', customerEstimateKey: 'ce-1' });

    component.selectNo();
    component.onVendorNext();
    component.customerDollar.set('200');
    component.saveCustomerDeposit();

    expect(component.saveError()).toBe('Failed to save deposit.');
  });
});
