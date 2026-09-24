/**
 * End-to-end integration tests for the Assign Vendor feature.
 *
 * Uses the REAL AssignVendorService (not mocked) with HttpTestingController
 * so the full chain is exercised: Component → Service → HttpClient → Template.
 *
 * No real HTTP calls — all requests are intercepted and flushed
 * by HttpTestingController.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { AssignVendorComponent } from './assign-vendor.component';
import { AssignVendorService } from '../../../services/assign-vendor.service';
import { environment } from '../../../../environments/environment';
import {
  AssignVendorApiResponse,
  AssignVendorPage,
  VendorListItem,
  LocationHistoryVendor,
  VendorDropdownOption,
  DataReturn,
  ApiErrorDetail,
  JobHeaderDetail,
  AISourcingStatus,
} from '../../../models/assign-vendor.model';

// ════════════════════════════════════════════════════════════
//  Test Constants
// ════════════════════════════════════════════════════════════

const BASE = `${environment.apiBaseUrl}/api/v1/admin/job-vendor`;
const RFISYSTEM = `${environment.apiBaseUrl}/RFISystemData/SystemSetupData`;
const SOURCING = `${environment.apiBaseUrl}/api/sourcing`;
const JOB = 'e2e-job-111';
const LOC = 'e2e-loc-222';
const VENDOR = 'e2e-vnd-333';

// ════════════════════════════════════════════════════════════
//  Factory Helpers
// ════════════════════════════════════════════════════════════

function ok<T>(data: T, msg = 'OK'): AssignVendorApiResponse<T> {
  return { status: true, responseCode: 200, message: msg, data, details: [], unixTime: 1, traceId: 'trace-1' };
}

function makePage(overrides: Partial<AssignVendorPage> = {}): AssignVendorPage {
  return {
    jobKey: JOB, jobName: 'E2E Job', locationKey: LOC, tradeKey: 'trade-1',
    jobTypeKey: 'type-1', customerKey: 'cust-1', tradeName: 'Plumbing',
    locationDetail: 'Plumbing,Dallas,TX,75001', fromCustomer: 0, minutesLeft: 30,
    isPrimary: 1, primaryVendorKey: 'pv-key', primaryVendorAlreadyAssignedOnce: 0,
    message: null, isNewEstimate: false, isNewNote: false, isNewFileAndAttachment: false,
    ...overrides,
  };
}

function makeVendorListItem(overrides: Partial<VendorListItem> = {}): VendorListItem {
  return {
    vendorKey: VENDOR, jobKey: JOB, vname: 'Test Vendor', address: '123 Main St',
    contactName: 'John Doe', email: 'john@test.com', phone: 'tel:15551234567',
    altPhone: null, phoneEXT: null, altPhoneEXT: null, tName: 'Plumbing',
    radiusInMiles: 25, distanceFromLocation: 10, jobCount: 5, dnUenabled: false,
    registerLink: null, noOfTrade: 1, vendorStatColor: '#00ff00', vendorStatName: 'New',
    isPrimaryVendor: false, isFullConsolidator: false, isPossibleConsolidator: false,
    ...overrides,
  };
}

function makeAssignedVendor(overrides: Partial<LocationHistoryVendor> = {}): LocationHistoryVendor {
  return {
    dnUenabled: false, phone: 'tel:15551234567', phoneEXT: null, altPhoneEXT: null,
    altPhone: null, email: 'john@test.com', contactName: 'John Doe', jobCount: 10,
    distanceFromLocation: 3.5, registerLink: 'CONTRACT', vendorAddress: '123 Main St',
    radiusInMiles: 50, tradeList: 'Plumbing', vendorLabel: null, vendorKey: 'vvv-333-444',
    noOfTrade: '1', jobKey: 'aaa-bbb-ccc', contactKey: null, enteredDate: '01/01/2024',
    serviceCallMinimum: null, highCost: null, vendorStat: null, vendorName: 'Test Vendor',
    vCategory: null, vCategorycolor: null, primaryVendorMarker: null, remarks: null,
    isVendorAssigned: null, pinKey: null, noMaybe: null, statusName: 'Active', isDelete: false,
    isDefault: false, vendorLoginLink: null, jobVendorKey: 'jv-key-1',
    workorderEmailSent: null, latestVNote: null, ...overrides,
  };
}

function makeDropdown(): VendorDropdownOption[] {
  return [{ text: 'Vendor A', value: 'va-key' }, { text: 'Vendor B', value: 'vb-key' }];
}

function makeJobHeaderDetail(): JobHeaderDetail {
  return {
    accountManagerKey: null,
    accountManagerName: null,
    entryDate: null,
    completionDate: null,
    po: null,
    jobStatusName: null,
    jobTypeKey: null,
    jobTypeName: null,
    customerDne: null,
    revCustomerDne: null,
    customerProfileCustomerDne: '0.00',
    customerProfileEmergencyCustomerDne: '0.00',
    customerProfileVendorDne: '0.00',
    customerProfileVendorEmergencyDne: '0.00',
    vendorDne: '0.00',
    revVendorDne: '0.00',
    serviceRequest: null,
    serviceRequestPreview: null,
    customerName: null,
    customerContactName: null,
    customerContactTitle: null,
    customerContactEmail: null,
    customerContactPhone: null,
    customerContactPhoneExt: null,
    customerContactAltPhone: null,
    customerContactAltPhoneExt: null,
    hasCustomerContract: false,
    customerContractKey: null,
    customerNotice: null,
    customerRequestorKey: null,
    customerRequestorName: null,
    locationName: null,
    locationAddress: null,
    locationAddress2: null,
    cityName: null,
    stateName: null,
    zipCode: null,
    locationPhone: null,
    locationContactName: null,
    locationContactTitle: null,
    locationContactEmail: null,
    locationContactPhone: null,
    locationContactPhoneExt: null,
    locationContactAltPhone: null,
    locationContactAltPhoneExt: null,
    assignedVendors: [],
  };
}

function makeSourcingNotStarted(): AISourcingStatus {
  return {
    jobKey: JOB,
    status: 'not_started',
    searchId: null,
    vendorsFound: null,
    processingTimeMs: null,
    errorMessage: null,
    createdAt: '2024-01-01T00:00:00Z',
    completedAt: null,
  };
}

// ════════════════════════════════════════════════════════════
//  Test Suite
// ════════════════════════════════════════════════════════════

describe('AssignVendor E2E Integration (Component → real Service → HttpTestingController)', () => {
  let component: AssignVendorComponent;
  let fixture: ComponentFixture<AssignVendorComponent>;
  let httpMock: HttpTestingController;

  /**
   * Flushes all page-initialization HTTP calls that fire on ngOnInit.
   */
  /**
   * Satisfies the HTTP sequence fired from {@link AssignVendorComponent#ngOnInit}:
   * upline check → default vendor list (vendors-in-radius / 70) → forkJoin page bundle →
   * post-page grids → AI sourcing status poll (timer(0)).
   */
  async function flushInitRequests(page = makePage()): Promise<void> {
    httpMock.expectOne((r) => r.url.includes('check-upline-approval')).flush(ok(2));

    httpMock.expectOne(`${BASE}/vendors-in-radius/${JOB}/70`).flush(ok([makeAssignedVendor()]));

    const forkJoinUrls = new Set([
      `${BASE}/assign-page/${JOB}`,
      `${BASE}/dropdown/active-vendors/${JOB}`,
      `${BASE}/job-header-detail/${JOB}`,
      `${RFISYSTEM}/get-trades`,
      `${RFISYSTEM}/FillStateList`,
    ]);
    /** forkJoin issues 5 requests at once; {@link HttpTestingController#expectOne} fails if the matcher matches >1. */
    const forkReqs = httpMock.match((req) => forkJoinUrls.has(req.url));
    expect(forkReqs.length).toBe(5);
    for (const r of forkReqs) {
      const u = r.request.url;
      if (u.endsWith(`/assign-page/${JOB}`)) r.flush(ok(page));
      else if (u.includes('/dropdown/active-vendors/')) r.flush(ok(makeDropdown()));
      else if (u.includes('/job-header-detail/')) r.flush(ok(makeJobHeaderDetail()));
      else r.flush(ok([]));
    }

    httpMock
      .expectOne((r) => r.method === 'POST' && r.url === `${BASE}/assigned-vendors/${JOB}`)
      .flush(ok([makeAssignedVendor()]));
    httpMock.expectOne(`${BASE}/location-history/${JOB}`).flush(ok([makeAssignedVendor()]));
    httpMock.expectOne(`${BASE}/pinned-vendors/${JOB}`).flush(ok([]));

    /** {@link AssignVendorComponent#loadAISourcingData} uses `timer(0, …)`; allow the macrotask to schedule before flushing. */
    await fixture.whenStable();
    let sourcingReq = httpMock.match((r) => r.url === `${SOURCING}/status/${JOB}`);
    for (let i = 0; i < 30 && sourcingReq.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 5));
      sourcingReq = httpMock.match((r) => r.url === `${SOURCING}/status/${JOB}`);
    }
    expect(sourcingReq.length).toBeGreaterThan(0);
    sourcingReq[0].flush(ok(makeSourcingNotStarted()));
  }

  /** After a successful {@link AssignVendorComponent#onSaveVendorNote}, the component reloads notes via GET vendor-notes. */
  function expectAndFlushVendorNotesList(vendorKey = VENDOR): void {
    httpMock.expectOne(`${BASE}/vendor-notes/${vendorKey}`).flush(ok([]));
  }

  /**
   * When `vendorKey` is set programmatically, {@link AssignVendorComponent#onVendorSelected} requests
   * contacts and service charge — flush them so {@link HttpTestingController#verify} stays clean.
   */
  function flushVendorSelectionFollowUpRequests(vendorKey: string): void {
    httpMock.match((r) => r.url.includes(`/vendor-contact-list/${vendorKey}`)).forEach((req) => req.flush(ok([])));
    httpMock
      .match((r) => r.url.includes('/service-charge') && r.url.includes(vendorKey))
      .forEach((req) =>
        req.flush(
          ok({
            serviceCharge: 0,
            radiusInMiles: 50,
            laborKey: '',
            distanceFromLocation: 1,
          }),
        ),
      );
  }

  /**
   * Vendor auto-select uses {@code setTimeout(100)} then {@link AssignVendorComponent#onVendorSelected};
   * the follow-up GETs can be registered on the next microtask, after the test body flushes.
   * Clears any remaining vendor-contact / service-charge GETs before {@link HttpTestingController#verify}.
   */
  function flushOutstandingVendorSelectionGetRequests(): void {
    httpMock
      .match((r) => r.method === 'GET' && r.url.includes(`${BASE}/vendor-contact-list/`))
      .forEach((req) => req.flush(ok([])));
    httpMock
      .match((r) => r.method === 'GET' && r.url.includes(`${BASE}/service-charge`))
      .forEach((req) =>
        req.flush(
          ok({
            serviceCharge: 0,
            radiusInMiles: 50,
            laborKey: '',
            distanceFromLocation: 1,
          }),
        ),
      );
  }

  function fillValidQuickVendor(): void {
    component.quickVendorForm.patchValue({
      companyName: 'ACME Corp', companyemail: 'info@acme.com', phone: '5551234567',
      address: '123 Main St', stateKey: 1, cityKey: 1, zip: '75001',
      tradeKey: 'trade-1', contactName: 'Jane Doe', contactemail: 'jane@acme.com',
      wcom: true, genL: false,
    });
  }

  function fillValidNoteForm(): void {
    component.notesVendorKey.set(VENDOR);
    component.vendorNoteForm.patchValue({
      vendorKey: VENDOR,
      noteTitle: 'Test Note',
      notesDetail: '<p>Note body</p>',
      newNote: 1,
    });
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AssignVendorComponent, ReactiveFormsModule],
      providers: [
        AssignVendorService,
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ jobKey: JOB }) } },
        },
      ],
    });
    fixture = TestBed.createComponent(AssignVendorComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    try {
      flushOutstandingVendorSelectionGetRequests();
      httpMock.verify();
    } finally {
      fixture.destroy();
      TestBed.resetTestingModule();
    }
  });

  // ══════════════════════════════════════════════════════════
  //  1. FULL HAPPY PATH — Quick Vendor Create
  // ══════════════════════════════════════════════════════════

  describe('Quick Vendor — Happy Path', () => {
    it('should submit, receive 200, close modal, show success, refresh dropdown', async () => {
      fixture.detectChanges();
      await flushInitRequests();

      component.showQuickVendorModal.set(true);
      fillValidQuickVendor();
      fixture.detectChanges();

      component.onSubmitQuickVendor();

      const dupReq = httpMock.expectOne(`${BASE}/check-duplicate-vendor`);
      expect(dupReq.request.method).toBe('POST');
      dupReq.flush(ok({ flag: 0, message: '', key: null, vendorKey: null } as DataReturn));

      const saveReq = httpMock.expectOne(`${BASE}/save-quick-vendor`);
      expect(saveReq.request.method).toBe('POST');
      expect(saveReq.request.body.companyName).toBe('ACME Corp');
      saveReq.flush(ok({ flag: 1, message: 'Vendor created successfully.', key: 'new-key', vendorKey: 'new-vnd-key' } as DataReturn));

      const ddRefresh = httpMock.expectOne(`${BASE}/dropdown/active-vendors/${JOB}`);
      ddRefresh.flush(ok(makeDropdown()));

      await new Promise((r) => setTimeout(r, 110));
      flushVendorSelectionFollowUpRequests('new-vnd-key');

      expect(component.showQuickVendorModal()).toBe(false);
      expect(component.successMessage()).toContain('Vendor created successfully');
      expect(component.isSubmitting()).toBe(false);

      fixture.detectChanges();
      const html = fixture.nativeElement as HTMLElement;
      const successEl = html.querySelector('.av-toast--success');
      expect(successEl?.textContent).toContain('Vendor created successfully');
    });
  });

  // ══════════════════════════════════════════════════════════
  //  2. FULL HAPPY PATH — Vendor Note Save
  // ══════════════════════════════════════════════════════════

  describe('Vendor Note — Happy Path', () => {
    it('should submit, receive 200, show success, reset form', async () => {
      fixture.detectChanges();
      await flushInitRequests();

      component.showNotesModal.set(true);
      fillValidNoteForm();
      fixture.detectChanges();

      component.onSaveVendorNote();

      const noteReq = httpMock.expectOne(`${BASE}/save-vendor-note`);
      expect(noteReq.request.method).toBe('POST');
      expect(noteReq.request.body.noteTitle).toBe('Test Note');
      noteReq.flush(ok(1));
      expectAndFlushVendorNotesList();

      expect(component.isSubmitting()).toBe(false);
      expect(component.vendorNoteForm.get('noteTitle')!.value).toBe('');
    });
  });

  // ══════════════════════════════════════════════════════════
  //  3. API 400 — Field Errors Mapped to FormControls
  // ══════════════════════════════════════════════════════════

  describe('Quick Vendor — Server Validation Error Mapping', () => {
    it('should map PascalCase field errors to camelCase FormControls', async () => {
      fixture.detectChanges();
      await flushInitRequests();

      component.showQuickVendorModal.set(true);
      fillValidQuickVendor();
      fixture.detectChanges();

      component.showDuplicateWarning.set(false);
      component.isSubmitting.set(true);
      component['saveQuickVendor'](component.quickVendorForm.value);

      const saveReq = httpMock.expectOne(`${BASE}/save-quick-vendor`);
      saveReq.flush({
        status: false, responseCode: 400, message: 'Validation failed.', data: null,
        details: [
          { field: 'CompanyName', message: 'Please enter Company Name', code: 'VALIDATION_ERROR' },
          { field: 'Companyemail', message: 'Please enter a valid email address', code: 'VALIDATION_ERROR' },
          { field: 'StateKey', message: 'Please select State', code: 'VALIDATION_ERROR' },
        ],
        unixTime: 1, traceId: 'trace-1',
      }, { status: 400, statusText: 'Bad Request' });

      expect(component.quickVendorForm.get('companyName')!.errors).toEqual({ serverError: 'Please enter Company Name' });
      expect(component.quickVendorForm.get('companyemail')!.errors).toEqual({ serverError: 'Please enter a valid email address' });
      expect(component.quickVendorForm.get('stateKey')!.errors).toEqual({ serverError: 'Please select State' });
      expect(component.isSubmitting()).toBe(false);

      fixture.detectChanges();
      const errorSpans = (fixture.nativeElement as HTMLElement).querySelectorAll('.form-error');
      const errorTexts = Array.from(errorSpans).map(el => el.textContent?.trim());
      expect(errorTexts).toContain('Please enter Company Name');
    });

    it('should display unmapped field errors in global errorMessage', async () => {
      fixture.detectChanges();
      await flushInitRequests();

      fillValidQuickVendor();
      component['saveQuickVendor'](component.quickVendorForm.value);

      httpMock.expectOne(`${BASE}/save-quick-vendor`).flush({
        status: false, responseCode: 400, message: 'Validation failed.', data: null,
        details: [{ field: 'UnknownField', message: 'Some unknown error', code: 'VALIDATION_ERROR' }],
        unixTime: 1, traceId: 'trace-1',
      }, { status: 400, statusText: 'Bad Request' });

      expect(component.errorMessage()).toContain('Some unknown error');
    });
  });

  describe('Vendor Note — Server Validation Error Mapping', () => {
    it('should map NoteTitle error to noteTitle FormControl', async () => {
      fixture.detectChanges();
      await flushInitRequests();

      component.showNotesModal.set(true);
      fillValidNoteForm();
      fixture.detectChanges();

      component.onSaveVendorNote();

      httpMock.expectOne(`${BASE}/save-vendor-note`).flush({
        status: false, responseCode: 400, message: 'Validation failed.', data: null,
        details: [
          { field: 'NoteTitle', message: 'Please enter a title', code: 'VALIDATION_ERROR' },
          { field: 'NotesDetail', message: 'Please enter note details', code: 'VALIDATION_ERROR' },
        ],
        unixTime: 1, traceId: 'trace-1',
      }, { status: 400, statusText: 'Bad Request' });

      expect(component.vendorNoteForm.get('noteTitle')!.errors).toEqual({ serverError: 'Please enter a title' });
      expect(component.vendorNoteForm.get('notesDetail')!.errors).toEqual({ serverError: 'Please enter note details' });
    });
  });

  // ══════════════════════════════════════════════════════════
  //  4. HTTP ERROR STATUS CODES — Correct Messages
  // ══════════════════════════════════════════════════════════

  describe('HTTP Error Status Codes', () => {

    it('should surface server failure for 500 on save vendor note', async () => {
      fixture.detectChanges();
      await flushInitRequests();

      fillValidNoteForm();
      component.onSaveVendorNote();

      httpMock.expectOne(`${BASE}/save-vendor-note`).flush(
        { message: 'Internal Server Error' },
        { status: 500, statusText: 'Internal Server Error' }
      );

      expect(component.errorMessage()).toMatch(/Internal Server Error|Something went wrong|Operation: saveVendorNote/i);
      expect(component.isSubmitting()).toBe(false);

      fixture.detectChanges();
      const errEl = fixture.nativeElement.querySelector('.av-toast--error');
      expect(errEl).toBeTruthy();
      expect(errEl!.textContent).toMatch(/Internal Server Error|Something went wrong|Operation: saveVendorNote/i);
    });

    it('should show "resource was not found" for 404', async () => {
      fixture.detectChanges();
      await flushInitRequests();

      fillValidNoteForm();
      component.onSaveVendorNote();

      httpMock.expectOne(`${BASE}/save-vendor-note`).flush(
        { message: 'Vendor not found' },
        { status: 404, statusText: 'Not Found' }
      );

      expect(component.errorMessage()).toContain('Vendor not found');
    });

    it('should show detailed 401 diagnostics for 401', async () => {
      fixture.detectChanges();
      await flushInitRequests();

      fillValidNoteForm();
      component.onSaveVendorNote();

      httpMock.expectOne(`${BASE}/save-vendor-note`).flush(
        null, { status: 401, statusText: 'Unauthorized' }
      );

      expect(component.errorMessage()).toMatch(/401|Unauthorized|Operation: saveVendorNote|Bearer/i);
    });

    it('should show "do not have permission" for 403', async () => {
      fixture.detectChanges();
      await flushInitRequests();

      fillValidNoteForm();
      component.onSaveVendorNote();

      httpMock.expectOne(`${BASE}/save-vendor-note`).flush(
        null, { status: 403, statusText: 'Forbidden' }
      );

      expect(component.errorMessage()).toContain('do not have permission');
    });

    it('should show conflict message for 409', async () => {
      fixture.detectChanges();
      await flushInitRequests();

      fillValidQuickVendor();
      component['saveQuickVendor'](component.quickVendorForm.value);

      httpMock.expectOne(`${BASE}/save-quick-vendor`).flush(
        { message: 'Duplicate vendor exists' },
        { status: 409, statusText: 'Conflict' }
      );

      expect(component.errorMessage()).toContain('Duplicate vendor exists');
    });
  });

  // ══════════════════════════════════════════════════════════
  //  5. NETWORK FAILURE
  // ══════════════════════════════════════════════════════════

  describe('Network Failure', () => {
    it('should show a user-friendly message for network error (status 0)', async () => {
      fixture.detectChanges();
      await flushInitRequests();

      fillValidNoteForm();
      component.onSaveVendorNote();

      httpMock.expectOne(`${BASE}/save-vendor-note`).error(
        new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' }
      );

      expect(component.errorMessage()).toMatch(/Could not connect|Job Ops API|token|login/i);
      expect(component.isSubmitting()).toBe(false);

      fixture.detectChanges();
      const errEl = fixture.nativeElement.querySelector('.av-toast--error');
      expect(errEl!.textContent).toMatch(/Could not connect|Job Ops API|token|login/i);
    });
  });

  // ══════════════════════════════════════════════════════════
  //  6. DUPLICATE SUBMISSION — isSubmitting flag
  // ══════════════════════════════════════════════════════════

  describe('Duplicate Submission Prevention', () => {
    it('should set isSubmitting true during save, preventing duplicate clicks', async () => {
      fixture.detectChanges();
      await flushInitRequests();

      fillValidNoteForm();
      fixture.detectChanges();

      component.onSaveVendorNote();

      expect(component.isSubmitting()).toBe(true);

      fixture.detectChanges();
      const btns = fixture.nativeElement.querySelectorAll('button.btn--primary[disabled]');
      expect(btns.length).toBeGreaterThan(0);

      httpMock.expectOne(`${BASE}/save-vendor-note`).flush(ok(1));
      expectAndFlushVendorNotesList();

      expect(component.isSubmitting()).toBe(false);
    });

    it('should not submit quickVendorForm when it is invalid (button disabled)', async () => {
      fixture.detectChanges();
      await flushInitRequests();

      component.showQuickVendorModal.set(true);
      fixture.detectChanges();

      expect(component.quickVendorForm.invalid).toBe(true);

      const createBtns = fixture.nativeElement.querySelectorAll('button.btn--primary[disabled]');
      expect(createBtns.length).toBeGreaterThan(0);
    });
  });

  // ══════════════════════════════════════════════════════════
  //  7. CLIENT-SIDE VALIDATION — Form Errors Display
  // ══════════════════════════════════════════════════════════

  describe('Client-Side Validation', () => {
    it('should show client validation errors when quickVendorForm fields are touched and empty', async () => {
      fixture.detectChanges();
      await flushInitRequests();

      component.showQuickVendorModal.set(true);
      fixture.detectChanges();

      const controls = ['companyName', 'companyemail', 'phone', 'address', 'zip', 'tradeKey', 'contactName', 'contactemail'];
      controls.forEach(f => component.quickVendorForm.get(f)!.markAsTouched());
      fixture.detectChanges();

      expect(component.getErrorMessage(component.quickVendorForm, 'companyName')).toBe('Please enter Company Name');
      expect(component.getErrorMessage(component.quickVendorForm, 'companyemail')).toBe('Please enter a valid email address');
      expect(component.getErrorMessage(component.quickVendorForm, 'contactName')).toBe('Please enter Contact Name');
    });

    it('should show email format error for invalid email', async () => {
      fixture.detectChanges();
      await flushInitRequests();

      component.quickVendorForm.patchValue({ companyemail: 'not-an-email' });
      component.quickVendorForm.get('companyemail')!.markAsTouched();
      fixture.detectChanges();

      expect(component.getErrorMessage(component.quickVendorForm, 'companyemail')).toBe('Please enter a valid email address');
    });

    it('should show vendor note validation errors', async () => {
      fixture.detectChanges();
      await flushInitRequests();

      component.showNotesModal.set(true);
      component.vendorNoteForm.patchValue({ vendorKey: VENDOR, noteTitle: '', notesDetail: '' });
      component.vendorNoteForm.get('noteTitle')!.markAsTouched();
      component.vendorNoteForm.get('notesDetail')!.markAsTouched();
      fixture.detectChanges();

      expect(component.getErrorMessage(component.vendorNoteForm, 'noteTitle')).toBe('Please enter a title');
      expect(component.getErrorMessage(component.vendorNoteForm, 'notesDetail')).toBe('Please enter note details');
    });

    it('should show accounting cross-field error when only one accounting field is filled', async () => {
      fixture.detectChanges();
      await flushInitRequests();

      component.quickVendorForm.patchValue({ accName: 'John', accEmail: '', accPhone: '' });
      component.quickVendorForm.markAllAsTouched();
      fixture.detectChanges();

      expect(component.quickVendorForm.hasError('accountingIncomplete')).toBe(true);
    });

    it('should clear accounting error when all three fields are filled', async () => {
      fixture.detectChanges();
      await flushInitRequests();

      component.quickVendorForm.patchValue({ accName: 'John', accEmail: 'j@a.com', accPhone: '555-1234' });
      fixture.detectChanges();

      expect(component.quickVendorForm.hasError('accountingIncomplete')).toBe(false);
    });
  });

  // ══════════════════════════════════════════════════════════
  //  8. SERVER ERROR OVERRIDES CLIENT ERROR (getErrorMessage)
  // ══════════════════════════════════════════════════════════

  describe('Server Error Priority', () => {
    it('should display server error over client error for same field', async () => {
      fixture.detectChanges();
      await flushInitRequests();

      component.quickVendorForm.get('companyName')!.setValue('');
      component.quickVendorForm.get('companyName')!.markAsTouched();
      fixture.detectChanges();

      expect(component.getErrorMessage(component.quickVendorForm, 'companyName')).toBe('Please enter Company Name');

      component.quickVendorForm.get('companyName')!.setErrors({ serverError: 'Name already taken by another vendor' });
      fixture.detectChanges();

      expect(component.getErrorMessage(component.quickVendorForm, 'companyName')).toBe('Name already taken by another vendor');
    });
  });

  // ══════════════════════════════════════════════════════════
  //  9. FORM STATE PRESERVED AFTER FAILED SUBMIT
  // ══════════════════════════════════════════════════════════

  describe('Form State After Failed Submit', () => {
    it('should keep quickVendorForm values intact after 400 error', async () => {
      fixture.detectChanges();
      await flushInitRequests();

      fillValidQuickVendor();
      component['saveQuickVendor'](component.quickVendorForm.value);

      httpMock.expectOne(`${BASE}/save-quick-vendor`).flush(
        { status: false, responseCode: 400, message: 'Validation failed.', data: null, details: [], unixTime: 1, traceId: null },
        { status: 400, statusText: 'Bad Request' }
      );

      expect(component.quickVendorForm.get('companyName')!.value).toBe('ACME Corp');
      expect(component.quickVendorForm.get('companyemail')!.value).toBe('info@acme.com');
      expect(component.quickVendorForm.get('phone')!.value).toBe('5551234567');
    });

    it('should keep vendorNoteForm values intact after 500 error', async () => {
      fixture.detectChanges();
      await flushInitRequests();

      fillValidNoteForm();
      component.onSaveVendorNote();

      httpMock.expectOne(`${BASE}/save-vendor-note`).flush(
        null, { status: 500, statusText: 'Internal Server Error' }
      );

      expect(component.vendorNoteForm.get('noteTitle')!.value).toBe('Test Note');
      expect(component.vendorNoteForm.get('notesDetail')!.value).toBe('<p>Note body</p>');
    });
  });

  // ══════════════════════════════════════════════════════════
  //  10. POST-SUBMIT BEHAVIOR
  // ══════════════════════════════════════════════════════════

  describe('Post-Submit Behavior', () => {
    it('should close quickVendorModal and auto-select new vendor after success', async () => {
      fixture.detectChanges();
      await flushInitRequests();

      fillValidQuickVendor();
      component['saveQuickVendor'](component.quickVendorForm.value);

      httpMock.expectOne(`${BASE}/save-quick-vendor`).flush(
        ok({ flag: 1, message: 'Created', key: 'k', vendorKey: 'new-vnd-key' } as DataReturn)
      );

      httpMock.expectOne(`${BASE}/dropdown/active-vendors/${JOB}`).flush(ok(makeDropdown()));

      expect(component.showQuickVendorModal()).toBe(false);
      await new Promise((r) => setTimeout(r, 150));
      flushVendorSelectionFollowUpRequests('new-vnd-key');
      expect(component.vendorForm.get('vendorKey')!.value).toBe('new-vnd-key');
    });

    it('should reset vendorNoteForm fields after successful note save', async () => {
      fixture.detectChanges();
      await flushInitRequests();

      fillValidNoteForm();
      component.onSaveVendorNote();

      httpMock.expectOne(`${BASE}/save-vendor-note`).flush(ok(1));
      expectAndFlushVendorNotesList();

      expect(component.vendorNoteForm.get('noteTitle')!.value).toBe('');
      expect(component.vendorNoteForm.get('notesDetail')!.value).toBe('');
      expect(component.vendorNoteForm.get('newNote')!.value).toBe(1);
    });
  });

  // ══════════════════════════════════════════════════════════
  //  11. DUPLICATE VENDOR CHECK FLOW
  // ══════════════════════════════════════════════════════════

  describe('Duplicate Vendor Check', () => {
    it('should show duplicate warning when check returns flag=1', async () => {
      fixture.detectChanges();
      await flushInitRequests();

      fillValidQuickVendor();
      component.onSubmitQuickVendor();

      httpMock.expectOne(`${BASE}/check-duplicate-vendor`).flush(
        ok({ flag: 1, message: 'Similar vendor exists', key: null, vendorKey: 'existing-vnd' } as DataReturn)
      );

      expect(component.showDuplicateWarning()).toBe(true);
      expect(component.duplicateResult()?.message).toBe('Similar vendor exists');
    });

    it('should proceed to save when check returns flag=0', async () => {
      fixture.detectChanges();
      await flushInitRequests();

      fillValidQuickVendor();
      component.onSubmitQuickVendor();

      httpMock.expectOne(`${BASE}/check-duplicate-vendor`).flush(
        ok({ flag: 0, message: '', key: null, vendorKey: null } as DataReturn)
      );

      const saveReq = httpMock.expectOne(`${BASE}/save-quick-vendor`);
      expect(saveReq).toBeTruthy();
      saveReq.flush(ok({ flag: 1, message: 'Created', key: 'k', vendorKey: 'vk' } as DataReturn));

      httpMock.expectOne(`${BASE}/dropdown/active-vendors/${JOB}`).flush(ok(makeDropdown()));
    });
  });

  // ══════════════════════════════════════════════════════════
  //  12. BUSINESS LOGIC ERROR (flag=0 from DataReturn)
  // ══════════════════════════════════════════════════════════

  describe('Business Logic Error (DataReturn flag=0)', () => {
    it('should display DataReturn.message when status is true but flag is 0', async () => {
      fixture.detectChanges();
      await flushInitRequests();

      fillValidQuickVendor();
      component['saveQuickVendor'](component.quickVendorForm.value);

      httpMock.expectOne(`${BASE}/save-quick-vendor`).flush(
        ok({ flag: 0, message: 'Vendor name already taken', key: null, vendorKey: null } as DataReturn)
      );

      expect(component.errorMessage()).toBe('Vendor name already taken');
    });
  });

  // ══════════════════════════════════════════════════════════
  //  13. INITIAL PAGE LOAD — Error Handling
  // ══════════════════════════════════════════════════════════

  describe('Initial Page Load Error Handling', () => {
    it('should set error message when no jobKey in route params', async () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [AssignVendorComponent, ReactiveFormsModule],
        providers: [
          AssignVendorService, provideHttpClient(), provideHttpClientTesting(),
          { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ jobKey: '' }) } } },
        ],
      });
      const f = TestBed.createComponent(AssignVendorComponent);
      const c = f.componentInstance;
      const h = TestBed.inject(HttpTestingController);

      f.detectChanges();

      expect(c.errorMessage()).toBe('No job key provided. Please navigate from a valid job.');
      h.verify();
      f.destroy();
    });
  });

  // ══════════════════════════════════════════════════════════
  //  14. TEMPLATE RENDERING — Error & Success Alerts
  // ══════════════════════════════════════════════════════════

  describe('Template Rendering', () => {
    it('should render success alert when successMessage is set', async () => {
      fixture.detectChanges();
      await flushInitRequests();

      component.successMessage.set('All good!');
      fixture.detectChanges();

      const successEl = fixture.nativeElement.querySelector('.av-toast--success');
      expect(successEl).toBeTruthy();
      expect(successEl!.textContent).toContain('All good!');
    });

    it('should render danger alert when errorMessage is set', async () => {
      fixture.detectChanges();
      await flushInitRequests();

      component.errorMessage.set('Something bad happened');
      fixture.detectChanges();

      const errorEl = fixture.nativeElement.querySelector('.av-toast--error');
      expect(errorEl).toBeTruthy();
      expect(errorEl!.textContent).toContain('Something bad happened');
    });

    it('should not render success alert when successMessage is empty', async () => {
      fixture.detectChanges();
      await flushInitRequests();

      component.successMessage.set('');
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.av-toast--success')).toBeFalsy();
    });

    it('should not render danger alert when errorMessage is empty', async () => {
      fixture.detectChanges();
      await flushInitRequests();

      component.errorMessage.set('');
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.av-toast--error')).toBeFalsy();
    });
  });

  // ══════════════════════════════════════════════════════════
  //  15. HTTP REQUEST PAYLOADS
  // ══════════════════════════════════════════════════════════

  describe('Request Payload Verification', () => {
    it('should send correct payload for saveQuickVendor', async () => {
      fixture.detectChanges();
      await flushInitRequests();

      fillValidQuickVendor();
      component.quickVendorForm.patchValue({ flatTrip: 50, standardHourly: 75 });
      component['saveQuickVendor'](component.quickVendorForm.value);

      const req = httpMock.expectOne(`${BASE}/save-quick-vendor`);
      expect(req.request.body.companyName).toBe('ACME Corp');
      expect(req.request.body.flatTrip).toBe(50);
      expect(req.request.body.standardHourly).toBe(75);
      expect(req.request.body.wcom).toBe(true);
      req.flush(ok({ flag: 1, message: 'OK', key: null, vendorKey: null } as DataReturn));

      httpMock.expectOne(`${BASE}/dropdown/active-vendors/${JOB}`).flush(ok(makeDropdown()));
    });

    it('should send correct payload for saveVendorNote', async () => {
      fixture.detectChanges();
      await flushInitRequests();

      fillValidNoteForm();
      component.onSaveVendorNote();

      const req = httpMock.expectOne(`${BASE}/save-vendor-note`);
      expect(req.request.body.vendorKey).toBe(VENDOR);
      expect(req.request.body.noteTitle).toBe('Test Note');
      expect(req.request.body.notesDetail).toBe('<p>Note body</p>');
      expect(req.request.body.newNote).toBe(1);
      req.flush(ok(1));
      expectAndFlushVendorNotesList();
    });
  });

  // ══════════════════════════════════════════════════════════
  //  16. APPLY SERVER ERRORS UNIT TESTS (via component)
  // ══════════════════════════════════════════════════════════

  describe('applyServerErrors integration', () => {
    it('should handle multiple field errors in a single response', async () => {
      fixture.detectChanges();
      await flushInitRequests();

      fillValidQuickVendor();

      const details: ApiErrorDetail[] = [
        { field: 'CompanyName', message: 'Too short', code: 'VALIDATION_ERROR' },
        { field: 'Phone', message: 'Invalid format', code: 'VALIDATION_ERROR' },
        { field: 'Address', message: 'Address is too long', code: 'VALIDATION_ERROR' },
      ];

      component.applyServerErrors(details, component.quickVendorForm);

      expect(component.quickVendorForm.get('companyName')!.errors).toEqual({ serverError: 'Too short' });
      expect(component.quickVendorForm.get('phone')!.errors).toEqual({ serverError: 'Invalid format' });
      expect(component.quickVendorForm.get('address')!.errors).toEqual({ serverError: 'Address is too long' });
    });

    it('should return unmapped errors as concatenated string', async () => {
      fixture.detectChanges();
      await flushInitRequests();

      const details: ApiErrorDetail[] = [
        { field: 'NonExistentField', message: 'Error A', code: 'ERR' },
        { field: null, message: 'Error B', code: 'ERR' },
      ];

      const result = component.applyServerErrors(details, component.quickVendorForm);
      expect(result).toBe('Error A. Error B');
    });

    it('should mark mapped controls as touched', async () => {
      fixture.detectChanges();
      await flushInitRequests();

      expect(component.quickVendorForm.get('companyName')!.touched).toBe(false);

      component.applyServerErrors(
        [{ field: 'CompanyName', message: 'Required', code: 'VALIDATION_ERROR' }],
        component.quickVendorForm
      );

      expect(component.quickVendorForm.get('companyName')!.touched).toBe(true);
    });
  });

  // ══════════════════════════════════════════════════════════
  //  17. handleApiError integration
  // ══════════════════════════════════════════════════════════

  describe('handleApiError integration', () => {
    it('should set global errorMessage when no form is provided', async () => {
      fixture.detectChanges();
      await flushInitRequests();

      component.handleApiError({
        status: false, responseCode: 500,
        message: 'Internal server error', data: null,
        details: [], unixTime: 0, traceId: null,
      });

      expect(component.errorMessage()).toBe('Internal server error');
    });

    it('should apply details to form when form is provided and details exist', async () => {
      fixture.detectChanges();
      await flushInitRequests();

      component.handleApiError({
        status: false, responseCode: 400,
        message: 'Validation failed.', data: null,
        details: [{ field: 'CompanyName', message: 'Too long', code: 'ERR' }],
        unixTime: 0, traceId: null,
      }, component.quickVendorForm);

      expect(component.quickVendorForm.get('companyName')!.errors).toEqual({ serverError: 'Too long' });
    });
  });

  // ══════════════════════════════════════════════════════════
  //  18. CANCELLATION EMAIL — full flow
  // ══════════════════════════════════════════════════════════

  describe('Cancellation Email — full flow through real service', () => {
    let confirmSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    });

    afterEach(() => {
      confirmSpy?.mockRestore();
    });

    it('should send cancellation request and show success', async () => {
      fixture.detectChanges();
      await flushInitRequests();

      component.onSendCancellationEmail({ jobVendorKey: 'jv-key-1', vname: 'Test' } as Record<string, unknown>);

      const req = httpMock.expectOne(`${BASE}/send-cancellation/jv-key-1`);
      expect(req.request.method).toBe('POST');
      req.flush(ok('Cancellation email sent'));

      // refreshGrids fires additional requests after success
      httpMock.match(r =>
        r.url.includes('assigned-vendors') ||
        r.url.includes('location-history') ||
        r.url.includes('pinned-vendors') ||
        r.url.includes('vendors-no-radius')
      ).forEach(r => r.flush(ok([])));

      expect(component.successMessage()).toContain('Cancellation email sent');
    });

    it('should show error when cancellation request fails with 500', async () => {
      fixture.detectChanges();
      await flushInitRequests();

      component.onSendCancellationEmail({ jobVendorKey: 'jv-key-1', vname: 'Test' } as Record<string, unknown>);

      httpMock.expectOne(`${BASE}/send-cancellation/jv-key-1`).flush(
        null, { status: 500, statusText: 'Internal Server Error' }
      );

      expect(component.errorMessage()).toMatch(/Operation: sendCancellationEmail|Something went wrong|Error/i);
    });

    it('should not send request when user cancels confirm dialog', async () => {
      confirmSpy.mockReturnValue(false);

      fixture.detectChanges();
      await flushInitRequests();

      component.onSendCancellationEmail({ jobVendorKey: 'jv-key-1', vname: 'Test' } as Record<string, unknown>);

      httpMock.expectNone(`${BASE}/send-cancellation/jv-key-1`);
    });
  });
});
