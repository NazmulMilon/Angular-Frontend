import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';

import { VendorBillsComponent } from './vendor-bills.component';

describe('VendorBillsComponent', () => {
  let fixture: ComponentFixture<VendorBillsComponent>;
  let component: VendorBillsComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VendorBillsComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ jobKey: 'job-test-123' }),
            },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(VendorBillsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should read jobKey from route params', () => {
    expect(component.jobKey()).toBe('job-test-123');
  });

  it('should render five accordion sections', () => {
    const accordions = fixture.nativeElement.querySelectorAll('app-accordion');
    expect(accordions.length).toBe(5);
  });
});
