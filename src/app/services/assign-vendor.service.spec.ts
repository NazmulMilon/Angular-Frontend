import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AssignVendorService } from './assign-vendor.service';
import { environment } from '../../environments/environment';
import {
  AssignVendorApiResponse,
  AssignVendorPage,
  VendorListItem,
  LocationHistoryVendor,
  DataReturn,
  VendorDropdownOption,
  QuickVendorRequest,
  SaveVendorNoteRequest,
  CheckDuplicateVendorRequest,
} from '../models/assign-vendor.model';

const BASE = `${environment.apiBaseUrl}/api/v1/admin/job-vendor`;
const JOB = 'aaa-bbb-ccc';
const LOC = 'loc-111-222';
const VENDOR = 'vvv-333-444';
const PIN = 'pin-555-666';
const JV = 'jv-777-888';

function ok<T>(data: T, msg = 'OK'): AssignVendorApiResponse<T> {
  return {
    status: true,
    responseCode: 200,
    message: msg,
    data,
    details: [],
    unixTime: 0,
    traceId: null,
  };
}

function makePage(overrides: Partial<AssignVendorPage> = {}): AssignVendorPage {
  return {
    jobKey: JOB,
    jobName: 'Test Job',
    locationKey: LOC,
    tradeKey: 'trade-1',
    jobTypeKey: 'type-1',
    customerKey: 'cust-1',
    tradeName: 'Plumbing',
    locationDetail: 'Plumbing,Dallas,TX,75001',
    fromCustomer: 0,
    minutesLeft: 30,
    isPrimary: 1,
    primaryVendorKey: VENDOR,
    primaryVendorAlreadyAssignedOnce: 0,
    message: null,
    isNewEstimate: false,
    isNewNote: false,
    isNewFileAndAttachment: false,
    ...overrides,
  };
}

function makeVendorListItem(overrides: Partial<VendorListItem> = {}): VendorListItem {
  return {
    vendorKey: VENDOR,
    jobKey: JOB,
    vname: 'Test Vendor',
    address: '123 Main St',
    contactName: 'John Doe',
    email: 'john@test.com',
    phone: 'tel:15551234567',
    altPhone: null,
    phoneEXT: null,
    altPhoneEXT: null,
    tName: 'Plumbing',
    radiusInMiles: 50,
    distanceFromLocation: 3.5,
    jobCount: 10,
    dnUenabled: false,
    registerLink: 'CONTRACT',
    noOfTrade: 1,
    vendorStatColor: '#6198F8',
    vendorStatName: 'Neutral',
    isPrimaryVendor: false,
    isFullConsolidator: false,
    isPossibleConsolidator: false,
    ...overrides,
  };
}

function makeAssignedItem(overrides: Partial<LocationHistoryVendor> = {}): LocationHistoryVendor {
  return {
    dnUenabled: false,
    phone: 'tel:15551234567',
    phoneEXT: null,
    altPhoneEXT: null,
    altPhone: null,
    email: 'john@test.com',
    contactName: 'John Doe',
    jobCount: 10,
    distanceFromLocation: 3.5,
    registerLink: 'CONTRACT',
    vendorAddress: '123 Main St',
    radiusInMiles: 50,
    tradeList: 'Plumbing',
    vendorLabel: null,
    vendorKey: VENDOR,
    noOfTrade: '1',
    jobKey: JOB,
    contactKey: null,
    enteredDate: '01/01/2024',
    serviceCallMinimum: null,
    highCost: null,
    vendorStat: null,
    vendorName: 'Test Vendor',
    vCategory: null,
    vCategorycolor: null,
    primaryVendorMarker: null,
    remarks: null,
    isVendorAssigned: null,
    pinKey: null,
    noMaybe: null,
    statusName: 'New',
    isDelete: false,
    isDefault: true,
    vendorLoginLink: null,
    jobVendorKey: JV,
    workorderEmailSent: null,
    latestVNote: null,
    ...overrides,
  };
}

/** Pinned row shape returned by GET pinned-vendors (stored in {@link AssignVendorService} as LocationHistoryVendor). */
function makePinnedLocationVendor(overrides: Partial<LocationHistoryVendor> = {}): LocationHistoryVendor {
  return {
    ...makeAssignedItem(),
    pinKey: PIN,
    remarks: 'Too far',
    ...overrides,
  };
}

describe('AssignVendorService', () => {
  let service: AssignVendorService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AssignVendorService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  // ────────────────────────────────────────────────────────────
  //  loadAssignVendorPage — GET assign-page/{jobKey}
  // ────────────────────────────────────────────────────────────

  describe('loadAssignVendorPage', () => {
    it('should send GET to correct URL', () => {
      const page = makePage();
      service.loadAssignVendorPage(JOB).subscribe();

      const req = httpMock.expectOne(`${BASE}/assign-page/${JOB}`);
      expect(req.request.method).toBe('GET');
      req.flush(ok(page));
    });

    it('should return typed AssignVendorPage response', () => {
      const page = makePage();
      service.loadAssignVendorPage(JOB).subscribe((res) => {
        expect(res.status).toBe(true);
        expect(res.data.jobKey).toBe(JOB);
        expect(res.data.tradeName).toBe('Plumbing');
        expect(res.data.isPrimary).toBe(1);
      });

      httpMock.expectOne(`${BASE}/assign-page/${JOB}`).flush(ok(page));
    });

    it('should update pageContext$ on success', () => {
      const page = makePage();
      let emittedContext: AssignVendorPage | null = null;
      service.pageContext$.subscribe((ctx) => (emittedContext = ctx));

      service.loadAssignVendorPage(JOB).subscribe();
      httpMock.expectOne(`${BASE}/assign-page/${JOB}`).flush(ok(page));

      expect(emittedContext).not.toBeNull();
      expect(emittedContext!.jobKey).toBe(JOB);
    });

    it('should set loading=true then false on success', () => {
      const states: boolean[] = [];
      service.loading$.subscribe((v) => states.push(v));

      service.loadAssignVendorPage(JOB).subscribe();
      httpMock.expectOne(`${BASE}/assign-page/${JOB}`).flush(ok(makePage()));

      expect(states[0]).toBe(false);
      expect(states[1]).toBe(true);
      expect(states.at(-1)).toBe(false);
    });

    it('should return fallback on HTTP error and clear loading', () => {
      const states: boolean[] = [];
      service.loading$.subscribe((v) => states.push(v));

      service.loadAssignVendorPage(JOB).subscribe((res) => {
        expect(res.status).toBe(false);
        expect(service.formatHttpFailureForUi(res)).toContain('Operation:');
      });

      httpMock
        .expectOne(`${BASE}/assign-page/${JOB}`)
        .flush('Server Error', { status: 500, statusText: 'Internal Server Error' });

      expect(states.at(-1)).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────────────
  //  loadAssignedVendors — POST assigned-vendors/{jobKey}
  // ────────────────────────────────────────────────────────────

  describe('loadAssignedVendors', () => {
    const url = `${BASE}/assigned-vendors/${JOB}`;

    it('should send POST with jobKey in path', () => {
      service.loadAssignedVendors(JOB).subscribe();

      const req = httpMock.expectOne(url);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toBeNull();
      req.flush(ok([makeAssignedItem()]));
    });

    it('should return typed LocationHistoryVendor[] response', () => {
      const items = [makeAssignedItem(), makeAssignedItem({ vendorKey: 'v2' })];
      service.loadAssignedVendors(JOB).subscribe((res) => {
        expect(res.data.length).toBe(2);
        expect(res.data[0].jobVendorKey).toBe(JV);
        expect(res.data[0].isDefault).toBe(true);
      });

      httpMock.expectOne(url).flush(ok(items));
    });

    it('should update assignedVendors$ on success', () => {
      let emitted: LocationHistoryVendor[] = [];
      service.assignedVendors$.subscribe((v) => (emitted = v));

      service.loadAssignedVendors(JOB).subscribe();
      httpMock.expectOne(url).flush(ok([makeAssignedItem()]));

      expect(emitted.length).toBe(1);
    });

    it('should set and clear loading', () => {
      const states: boolean[] = [];
      service.loading$.subscribe((v) => states.push(v));

      service.loadAssignedVendors(JOB).subscribe();
      httpMock.expectOne(url).flush(ok([]));

      expect(states[1]).toBe(true);
      expect(states.at(-1)).toBe(false);
    });

    it('should return fallback on 404', () => {
      service.loadAssignedVendors(JOB).subscribe((res) => {
        expect(res.status).toBe(false);
        expect(res.message).toContain('not found');
      });

      httpMock.expectOne(url).flush('Not found', { status: 404, statusText: 'Not Found' });
    });
  });

  // ────────────────────────────────────────────────────────────
  //  loadLocationHistoryVendors — GET location-history/{jobKey}
  // ────────────────────────────────────────────────────────────

  describe('loadLocationHistoryVendors', () => {
    const url = `${BASE}/location-history/${JOB}`;

    it('should send GET to correct URL', () => {
      service.loadLocationHistoryVendors(JOB).subscribe();

      const req = httpMock.expectOne(url);
      expect(req.request.method).toBe('GET');
      req.flush(ok([]));
    });

    it('should update locationHistory$ on success', () => {
      let emitted: LocationHistoryVendor[] = [];
      service.locationHistory$.subscribe((v) => (emitted = v));

      service.loadLocationHistoryVendors(JOB).subscribe();
      httpMock.expectOne(url).flush(ok([makeVendorListItem()]));

      expect(emitted.length).toBe(1);
    });

    it('should return fallback on error', () => {
      service.loadLocationHistoryVendors(JOB).subscribe((res) => {
        expect(res.status).toBe(false);
        expect(service.formatHttpFailureForUi(res)).toContain('Operation:');
      });

      httpMock.expectOne(url).flush('Error', { status: 500, statusText: 'Error' });
    });
  });

  // ────────────────────────────────────────────────────────────
  //  loadPinnedVendors — GET pinned-vendors/{jobKey}
  // ────────────────────────────────────────────────────────────

  describe('loadPinnedVendors', () => {
    const url = `${BASE}/pinned-vendors/${JOB}`;

    it('should send GET to correct URL', () => {
      service.loadPinnedVendors(JOB).subscribe();

      const req = httpMock.expectOne(url);
      expect(req.request.method).toBe('GET');
      req.flush(ok([]));
    });

    it('should return typed LocationHistoryVendor[] response for pin rows', () => {
      const pins = [makePinnedLocationVendor()];
      service.loadPinnedVendors(JOB).subscribe((res) => {
        expect(res.data[0].pinKey).toBe(PIN);
        expect(res.data[0].remarks).toBe('Too far');
      });

      httpMock.expectOne(url).flush(ok(pins));
    });

    it('should update pinnedVendors$ on success', () => {
      let emitted: LocationHistoryVendor[] = [];
      service.pinnedVendors$.subscribe((v) => (emitted = v));

      service.loadPinnedVendors(JOB).subscribe();
      httpMock.expectOne(url).flush(ok([makePinnedLocationVendor()]));

      expect(emitted.length).toBe(1);
    });

    it('should return fallback on 404', () => {
      service.loadPinnedVendors(JOB).subscribe((res) => {
        expect(res.status).toBe(false);
        expect(res.message).toContain('not found');
      });

      httpMock.expectOne(url).flush('Not found', { status: 404, statusText: 'Not Found' });
    });
  });

  // ────────────────────────────────────────────────────────────
  //  loadVendorsNoRadius — GET vendors-no-radius/{jobKey}
  // ────────────────────────────────────────────────────────────

  describe('loadVendorsNoRadius', () => {
    const url = `${BASE}/vendors-no-radius/${JOB}`;

    it('should send GET to correct URL', () => {
      service.loadVendorsNoRadius(JOB).subscribe();

      const req = httpMock.expectOne(url);
      expect(req.request.method).toBe('GET');
      req.flush(ok([]));
    });

    it('should update defaultVendors$ on success', () => {
      let emitted: LocationHistoryVendor[] = [];
      service.defaultVendors$.subscribe((v) => (emitted = v));

      service.loadVendorsNoRadius(JOB).subscribe();
      httpMock.expectOne(url).flush(ok([makeAssignedItem()]));

      expect(emitted.length).toBe(1);
    });

    it('should set and clear loading', () => {
      const states: boolean[] = [];
      service.loading$.subscribe((v) => states.push(v));

      service.loadVendorsNoRadius(JOB).subscribe();
      httpMock.expectOne(url).flush(ok([]));

      expect(states[1]).toBe(true);
      expect(states.at(-1)).toBe(false);
    });

    it('should return fallback on error', () => {
      service.loadVendorsNoRadius(JOB).subscribe((res) => {
        expect(res.status).toBe(false);
        expect(service.formatHttpFailureForUi(res)).toContain('Operation:');
      });

      httpMock.expectOne(url).flush('Error', { status: 500, statusText: 'Error' });
    });
  });

  // ────────────────────────────────────────────────────────────
  //  loadVendorsInRadius — GET vendors-in-radius/{jobKey}/{radius}
  // ────────────────────────────────────────────────────────────

  describe('loadVendorsInRadius', () => {
    const radius = 50;
    const url = `${BASE}/vendors-in-radius/${JOB}/${radius}`;

    it('should send GET with jobKey and radius in path', () => {
      service.loadVendorsInRadius(JOB, radius).subscribe();

      const req = httpMock.expectOne(url);
      expect(req.request.method).toBe('GET');
      req.flush(ok([]));
    });

    it('should update defaultVendors$ and clear searchResults$ on success', () => {
      let defaults: LocationHistoryVendor[] = [];
      let search: VendorListItem[] = [];
      service.defaultVendors$.subscribe((v) => (defaults = v));
      service.searchResults$.subscribe((v) => (search = v));

      service.loadVendorsInRadius(JOB, radius).subscribe();
      httpMock.expectOne(url).flush(ok([makeAssignedItem()]));

      expect(defaults.length).toBe(1);
      expect(search.length).toBe(0);
    });

    it('should set and clear loading', () => {
      const states: boolean[] = [];
      service.loading$.subscribe((v) => states.push(v));

      service.loadVendorsInRadius(JOB, radius).subscribe();
      httpMock.expectOne(url).flush(ok([]));

      expect(states[1]).toBe(true);
      expect(states.at(-1)).toBe(false);
    });

    it('should return fallback on 400', () => {
      service.loadVendorsInRadius(JOB, radius).subscribe((res) => {
        expect(res.status).toBe(false);
        expect(res.message).toContain('Invalid request');
      });

      httpMock.expectOne(url).flush('Bad Request', { status: 400, statusText: 'Bad Request' });
    });
  });

  // ────────────────────────────────────────────────────────────
  //  loadVendorsTradeRadius — GET vendors-trade-radius/{jobKey}/{radius}
  // ────────────────────────────────────────────────────────────

  describe('loadVendorsTradeRadius', () => {
    const radius = 75;
    const url = `${BASE}/vendors-trade-radius/${JOB}/${radius}`;

    it('should send GET with jobKey and radius in path', () => {
      service.loadVendorsTradeRadius(JOB, radius).subscribe();

      const req = httpMock.expectOne(url);
      expect(req.request.method).toBe('GET');
      req.flush(ok([]));
    });

    it('should map trade-radius list into defaultVendors$ and clear searchResults$', () => {
      let defaultEmitted: LocationHistoryVendor[] = [];
      let searchEmitted: VendorListItem[] = [];
      service.defaultVendors$.subscribe((v) => (defaultEmitted = v));
      service.searchResults$.subscribe((v) => (searchEmitted = v));

      service.loadVendorsTradeRadius(JOB, radius).subscribe();
      httpMock.expectOne(url).flush(ok([makeVendorListItem()]));

      expect(defaultEmitted.length).toBe(1);
      expect(defaultEmitted[0].vendorName).toBe('Test Vendor');
      expect(defaultEmitted[0].tradeList).toBe('Plumbing');
      expect(searchEmitted.length).toBe(0);
    });

    it('should set and clear loading', () => {
      const states: boolean[] = [];
      service.loading$.subscribe((v) => states.push(v));

      service.loadVendorsTradeRadius(JOB, radius).subscribe();
      httpMock.expectOne(url).flush(ok([]));

      expect(states[1]).toBe(true);
      expect(states.at(-1)).toBe(false);
    });

    it('should return fallback on error', () => {
      service.loadVendorsTradeRadius(JOB, radius).subscribe((res) => {
        expect(res.status).toBe(false);
        expect(service.formatHttpFailureForUi(res)).toContain('Operation:');
      });

      httpMock.expectOne(url).flush('Error', { status: 500, statusText: 'Error' });
    });
  });

  // ────────────────────────────────────────────────────────────
  //  loadVendorsLocationHistory — GET vendors-location-history/{jobKey}
  // ────────────────────────────────────────────────────────────

  describe('loadVendorsLocationHistory', () => {
    const url = `${BASE}/vendors-location-history/${JOB}`;

    it('should send GET to correct URL', () => {
      service.loadVendorsLocationHistory(JOB).subscribe();

      const req = httpMock.expectOne(url);
      expect(req.request.method).toBe('GET');
      req.flush(ok([]));
    });

    it('should update defaultVendors$ and clear searchResults$ on success', () => {
      let defaults: LocationHistoryVendor[] = [];
      let search: VendorListItem[] = [];
      service.defaultVendors$.subscribe((v) => (defaults = v));
      service.searchResults$.subscribe((v) => (search = v));

      service.loadVendorsLocationHistory(JOB).subscribe();
      httpMock.expectOne(url).flush(ok([makeAssignedItem()]));

      expect(defaults.length).toBe(1);
      expect(search.length).toBe(0);
    });

    it('should set and clear loading', () => {
      const states: boolean[] = [];
      service.loading$.subscribe((v) => states.push(v));

      service.loadVendorsLocationHistory(JOB).subscribe();
      httpMock.expectOne(url).flush(ok([]));

      expect(states[1]).toBe(true);
      expect(states.at(-1)).toBe(false);
    });

    it('should return fallback on error', () => {
      service.loadVendorsLocationHistory(JOB).subscribe((res) => {
        expect(res.status).toBe(false);
        expect(service.formatHttpFailureForUi(res)).toContain('Operation:');
      });

      httpMock.expectOne(url).flush('Error', { status: 500, statusText: 'Error' });
    });
  });

  // ────────────────────────────────────────────────────────────
  //  loadAllVendors — POST all-vendors?jobKey=...
  // ────────────────────────────────────────────────────────────

  describe('loadAllVendors', () => {
    const url = `${BASE}/all-vendors?jobKey=${JOB}`;

    it('should send POST with jobKey in query and null body', () => {
      service.loadAllVendors(JOB).subscribe();

      const req = httpMock.expectOne(url);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toBeNull();
      req.flush(ok([]));
    });

    it('should update searchResults$ on success', () => {
      let emitted: VendorListItem[] = [];
      service.searchResults$.subscribe((v) => (emitted = v));

      service.loadAllVendors(JOB).subscribe();
      httpMock.expectOne(url).flush(ok([makeVendorListItem()]));

      expect(emitted.length).toBe(1);
    });

    it('should set and clear loading', () => {
      const states: boolean[] = [];
      service.loading$.subscribe((v) => states.push(v));

      service.loadAllVendors(JOB).subscribe();
      httpMock.expectOne(url).flush(ok([]));

      expect(states[1]).toBe(true);
      expect(states.at(-1)).toBe(false);
    });

    it('should return fallback on error', () => {
      service.loadAllVendors(JOB).subscribe((res) => {
        expect(res.status).toBe(false);
        expect(service.formatHttpFailureForUi(res)).toContain('Operation:');
      });

      httpMock.expectOne(url).flush('Error', { status: 500, statusText: 'Error' });
    });
  });

  // ────────────────────────────────────────────────────────────
  //  sendCancellationEmail — POST send-cancellation/{jobVendorKey}
  // ────────────────────────────────────────────────────────────

  describe('sendCancellationEmail', () => {
    const url = `${BASE}/send-cancellation/${JV}`;

    it('should send POST with jobVendorKey in path and null body', () => {
      service.sendCancellationEmail(JV).subscribe();

      const req = httpMock.expectOne(url);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toBeNull();
      req.flush(ok('Cancellation email sent successfully.'));
    });

    it('should return typed string response', () => {
      service.sendCancellationEmail(JV).subscribe((res) => {
        expect(res.status).toBe(true);
        expect(res.data).toContain('Cancellation');
      });

      httpMock.expectOne(url).flush(ok('Cancellation email sent successfully.'));
    });

    it('should set and clear loading', () => {
      const states: boolean[] = [];
      service.loading$.subscribe((v) => states.push(v));

      service.sendCancellationEmail(JV).subscribe();
      httpMock.expectOne(url).flush(ok('done'));

      expect(states[1]).toBe(true);
      expect(states.at(-1)).toBe(false);
    });

    it('should return fallback on 404', () => {
      service.sendCancellationEmail(JV).subscribe((res) => {
        expect(res.status).toBe(false);
        expect(res.message).toContain('not found');
      });

      httpMock.expectOne(url).flush('Not found', { status: 404, statusText: 'Not Found' });
    });
  });

  // ────────────────────────────────────────────────────────────
  //  unpinVendor — DELETE unpin/{pinKey}/{jobKey}
  // ────────────────────────────────────────────────────────────

  describe('unpinVendor', () => {
    const url = `${BASE}/unpin/${PIN}/${JOB}`;

    it('should send DELETE with pinKey and jobKey in path', () => {
      service.unpinVendor(PIN, JOB).subscribe();

      const req = httpMock.expectOne(url);
      expect(req.request.method).toBe('DELETE');
      req.flush(ok(1));

      // unpinVendor triggers loadPinnedVendors on success
      httpMock.expectOne(`${BASE}/pinned-vendors/${JOB}`).flush(ok([]));
    });

    it('should return typed int response', () => {
      service.unpinVendor(PIN, JOB).subscribe((res) => {
        expect(res.status).toBe(true);
        expect(res.data).toBe(1);
      });

      httpMock.expectOne(url).flush(ok(1));
      httpMock.expectOne(`${BASE}/pinned-vendors/${JOB}`).flush(ok([]));
    });

    it('should trigger loadPinnedVendors on success', () => {
      service.unpinVendor(PIN, JOB).subscribe();

      httpMock.expectOne(url).flush(ok(1));
      const refreshReq = httpMock.expectOne(`${BASE}/pinned-vendors/${JOB}`);
      expect(refreshReq.request.method).toBe('GET');
      refreshReq.flush(ok([]));
    });

    it('should return fallback on 404 without refresh', () => {
      service.unpinVendor(PIN, JOB).subscribe((res) => {
        expect(res.status).toBe(false);
        expect(res.message).toContain('not found');
      });

      httpMock.expectOne(url).flush('Not found', { status: 404, statusText: 'Not Found' });
      httpMock.expectNone(`${BASE}/pinned-vendors/${JOB}`);
    });
  });

  // ────────────────────────────────────────────────────────────
  //  unpinAllVendors — DELETE unpin-all/{jobKey}
  // ────────────────────────────────────────────────────────────

  describe('unpinAllVendors', () => {
    const url = `${BASE}/unpin-all/${JOB}`;

    it('should send DELETE with jobKey in path', () => {
      service.unpinAllVendors(JOB).subscribe();

      const req = httpMock.expectOne(url);
      expect(req.request.method).toBe('DELETE');
      req.flush(ok(3));
    });

    it('should clear pinnedVendors$ on success', () => {
      let emitted: LocationHistoryVendor[] = [makePinnedLocationVendor()];
      service.pinnedVendors$.subscribe((v) => (emitted = v));

      service.unpinAllVendors(JOB).subscribe();
      httpMock.expectOne(url).flush(ok(3));

      expect(emitted.length).toBe(0);
    });

    it('should return typed int response', () => {
      service.unpinAllVendors(JOB).subscribe((res) => {
        expect(res.status).toBe(true);
        expect(res.data).toBe(3);
      });

      httpMock.expectOne(url).flush(ok(3));
    });

    it('should return fallback on error', () => {
      service.unpinAllVendors(JOB).subscribe((res) => {
        expect(res.status).toBe(false);
        expect(service.formatHttpFailureForUi(res)).toContain('Operation:');
      });

      httpMock.expectOne(url).flush('Error', { status: 500, statusText: 'Error' });
    });
  });

  // ────────────────────────────────────────────────────────────
  //  saveVendorNote — POST save-vendor-note
  // ────────────────────────────────────────────────────────────

  describe('saveVendorNote', () => {
    const url = `${BASE}/save-vendor-note`;
    const request: SaveVendorNoteRequest = {
      noteKey: '00000000-0000-0000-0000-000000000000',
      vendorKey: VENDOR,
      noteTitle: 'Test Note',
      notesDetail: '<p>Some HTML</p>',
      newNote: 1,
    };

    it('should send POST with correct request body', () => {
      service.saveVendorNote(request).subscribe();

      const req = httpMock.expectOne(url);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(request);
      req.flush(ok(1));
    });

    it('should return typed int response', () => {
      service.saveVendorNote(request).subscribe((res) => {
        expect(res.status).toBe(true);
        expect(res.data).toBe(1);
      });

      httpMock.expectOne(url).flush(ok(1));
    });

    it('should set and clear loading', () => {
      const states: boolean[] = [];
      service.loading$.subscribe((v) => states.push(v));

      service.saveVendorNote(request).subscribe();
      httpMock.expectOne(url).flush(ok(1));

      expect(states[1]).toBe(true);
      expect(states.at(-1)).toBe(false);
    });

    it('should return fallback on 400 validation error', () => {
      service.saveVendorNote(request).subscribe((res) => {
        expect(res.status).toBe(false);
        expect(res.message).toContain('Invalid request');
      });

      httpMock
        .expectOne(url)
        .flush('Validation failed', { status: 400, statusText: 'Bad Request' });
    });
  });

  // ────────────────────────────────────────────────────────────
  //  saveQuickVendor — POST save-quick-vendor
  // ────────────────────────────────────────────────────────────

  describe('saveQuickVendor', () => {
    const url = `${BASE}/save-quick-vendor`;
    const request: QuickVendorRequest = {
      companyName: 'Quick Corp',
      contactName: 'Jane',
      companyemail: 'info@quick.com',
      contactemail: 'jane@quick.com',
      phone: '555-999-0000',
      address: '1 Quick St',
      stateKey: 1,
      cityKey: 1,
      zip: '10001',
      tradeKey: 'trade-1',
      flatTrip: 75,
      standardHourly: 85,
      helperStandard: 50,
      emergencyFlat: 100,
      emergencyStandard: 120,
      emergencyHelper: 70,
      wcom: true,
      genL: true,
    };

    const dataReturn: DataReturn = {
      flag: 1,
      message: 'Quick Corp created',
      key: 'new-vendor-key',
      vendorKey: 'new-vendor-key',
    };

    it('should send POST with correct request body', () => {
      service.saveQuickVendor(request).subscribe();

      const req = httpMock.expectOne(url);
      expect(req.request.method).toBe('POST');
      expect(req.request.body.companyName).toBe('Quick Corp');
      expect(req.request.body.wcom).toBe(true);
      req.flush(ok(dataReturn));
    });

    it('should return typed DataReturn response', () => {
      service.saveQuickVendor(request).subscribe((res) => {
        expect(res.status).toBe(true);
        expect(res.data.flag).toBe(1);
        expect(res.data.key).toBe('new-vendor-key');
      });

      httpMock.expectOne(url).flush(ok(dataReturn));
    });

    it('should set and clear loading', () => {
      const states: boolean[] = [];
      service.loading$.subscribe((v) => states.push(v));

      service.saveQuickVendor(request).subscribe();
      httpMock.expectOne(url).flush(ok(dataReturn));

      expect(states[1]).toBe(true);
      expect(states.at(-1)).toBe(false);
    });

    it('should return fallback on 400 validation error', () => {
      service.saveQuickVendor(request).subscribe((res) => {
        expect(res.status).toBe(false);
        expect(res.message).toContain('Invalid request');
      });

      httpMock
        .expectOne(url)
        .flush('Validation failed', { status: 400, statusText: 'Bad Request' });
    });
  });

  // ────────────────────────────────────────────────────────────
  //  checkDuplicateVendor — POST check-duplicate-vendor
  // ────────────────────────────────────────────────────────────

  describe('checkDuplicateVendor', () => {
    const url = `${BASE}/check-duplicate-vendor`;

    it('should send POST with request body', () => {
      const req: CheckDuplicateVendorRequest = { name: 'Test Corp' };
      service.checkDuplicateVendor(req).subscribe();

      const httpReq = httpMock.expectOne(url);
      expect(httpReq.request.method).toBe('POST');
      expect(httpReq.request.body.name).toBe('Test Corp');
      httpReq.flush(ok({ flag: 1, message: 'Duplicate name', key: null, vendorKey: VENDOR }));
    });

    it('should return flag=1 when duplicate found', () => {
      service
        .checkDuplicateVendor({ name: 'Test Corp' })
        .subscribe((res) => {
          expect(res.data.flag).toBe(1);
          expect(res.data.message).toContain('Duplicate');
        });

      httpMock
        .expectOne(url)
        .flush(ok({ flag: 1, message: 'Duplicate name', key: null, vendorKey: VENDOR }));
    });

    it('should return flag=0 when no duplicate', () => {
      service
        .checkDuplicateVendor({ name: 'Unique' })
        .subscribe((res) => {
          expect(res.data.flag).toBe(0);
        });

      httpMock
        .expectOne(url)
        .flush(ok({ flag: 0, message: 'No duplicate', key: null, vendorKey: null }));
    });

    it('should return fallback on error', () => {
      service.checkDuplicateVendor({ name: 'Test' }).subscribe((res) => {
        expect(res.status).toBe(false);
        expect(service.formatHttpFailureForUi(res)).toContain('Operation:');
      });

      httpMock.expectOne(url).flush('Error', { status: 500, statusText: 'Error' });
    });
  });

  // ────────────────────────────────────────────────────────────
  //  checkUploadedFiles — GET check-uploaded-files/{jobKey}
  // ────────────────────────────────────────────────────────────

  describe('checkUploadedFiles', () => {
    const url = `${BASE}/check-uploaded-files/${JOB}`;

    it('should send GET with jobKey in path', () => {
      service.checkUploadedFiles(JOB).subscribe();

      const req = httpMock.expectOne(url);
      expect(req.request.method).toBe('GET');
      req.flush(ok(3));
    });

    it('should return typed int response', () => {
      service.checkUploadedFiles(JOB).subscribe((res) => {
        expect(res.status).toBe(true);
        expect(res.data).toBe(3);
      });

      httpMock.expectOne(url).flush(ok(3));
    });

    it('should return 0 when no files', () => {
      service.checkUploadedFiles(JOB).subscribe((res) => {
        expect(res.data).toBe(0);
      });

      httpMock.expectOne(url).flush(ok(0));
    });

    it('should return fallback on error', () => {
      service.checkUploadedFiles(JOB).subscribe((res) => {
        expect(res.status).toBe(false);
        expect(service.formatHttpFailureForUi(res)).toContain('Operation:');
      });

      httpMock.expectOne(url).flush('Error', { status: 500, statusText: 'Error' });
    });
  });

  // ────────────────────────────────────────────────────────────
  //  removeUploadedFiles — DELETE remove-uploaded-files/{jobKey}
  // ────────────────────────────────────────────────────────────

  describe('removeUploadedFiles', () => {
    const url = `${BASE}/remove-uploaded-files/${JOB}`;

    it('should send DELETE with jobKey in path', () => {
      service.removeUploadedFiles(JOB).subscribe();

      const req = httpMock.expectOne(url);
      expect(req.request.method).toBe('DELETE');
      req.flush(ok('2 file(s) removed successfully.'));
    });

    it('should return typed string response', () => {
      service.removeUploadedFiles(JOB).subscribe((res) => {
        expect(res.status).toBe(true);
        expect(res.data).toContain('removed');
      });

      httpMock.expectOne(url).flush(ok('2 file(s) removed successfully.'));
    });

    it('should return fallback on error', () => {
      service.removeUploadedFiles(JOB).subscribe((res) => {
        expect(res.status).toBe(false);
        expect(service.formatHttpFailureForUi(res)).toContain('Operation:');
      });

      httpMock.expectOne(url).flush('Error', { status: 500, statusText: 'Error' });
    });
  });

  // ────────────────────────────────────────────────────────────
  //  getActiveVendorsDropdown — GET dropdown/active-vendors/{jobKey}
  // ────────────────────────────────────────────────────────────

  describe('getActiveVendorsDropdown', () => {
    const jobKey = 'test-job-guid';
    const url = `${BASE}/dropdown/active-vendors/${jobKey}`;

    it('should send GET to correct URL with jobKey', () => {
      service.getActiveVendorsDropdown(jobKey).subscribe();

      const req = httpMock.expectOne(url);
      expect(req.request.method).toBe('GET');
      req.flush(ok([]));
    });

    it('should return typed VendorDropdownOption[] response', () => {
      const items: VendorDropdownOption[] = [
        { text: 'Alpha', value: 'a-1' },
        { text: 'Bravo', value: 'b-2' },
      ];
      service.getActiveVendorsDropdown(jobKey).subscribe((res) => {
        expect(res.status).toBe(true);
        expect(res.data.length).toBe(2);
        expect(res.data[0].text).toBe('Alpha');
        expect(res.data[1].value).toBe('b-2');
      });

      httpMock.expectOne(url).flush(ok(items));
    });

    it('should return empty array when no vendors', () => {
      service.getActiveVendorsDropdown(jobKey).subscribe((res) => {
        expect(res.data.length).toBe(0);
      });

      httpMock.expectOne(url).flush(ok([]));
    });

    it('should return fallback on error', () => {
      service.getActiveVendorsDropdown(jobKey).subscribe((res) => {
        expect(res.status).toBe(false);
        expect(service.formatHttpFailureForUi(res)).toContain('Operation:');
      });

      httpMock.expectOne(url).flush('Error', { status: 500, statusText: 'Error' });
    });
  });

  // ────────────────────────────────────────────────────────────
  //  refreshAllGrids — orchestration helper
  // ────────────────────────────────────────────────────────────

  describe('refreshAllGrids', () => {
    it('should fire four HTTP requests to refresh all grids', () => {
      service.refreshAllGrids(JOB, LOC);

      const assignedReq = httpMock.expectOne(`${BASE}/assigned-vendors/${JOB}`);
      const historyReq = httpMock.expectOne(`${BASE}/location-history/${JOB}`);
      const pinnedReq = httpMock.expectOne(`${BASE}/pinned-vendors/${JOB}`);
      const defaultReq = httpMock.expectOne(`${BASE}/vendors-no-radius/${JOB}`);

      expect(assignedReq.request.method).toBe('POST');
      expect(historyReq.request.method).toBe('GET');
      expect(pinnedReq.request.method).toBe('GET');
      expect(defaultReq.request.method).toBe('GET');

      assignedReq.flush(ok([]));
      historyReq.flush(ok([]));
      pinnedReq.flush(ok([]));
      defaultReq.flush(ok([]));
    });
  });

  // ────────────────────────────────────────────────────────────
  //  Cross-cutting: HTTP error status codes
  // ────────────────────────────────────────────────────────────

  describe('HTTP error handling', () => {
    it('should handle 401 Unauthorized with diagnostic message', () => {
      service.loadAssignVendorPage(JOB).subscribe((res) => {
        expect(res.status).toBe(false);
        expect(service.formatHttpFailureForUi(res)).toContain('Operation: loadAssignVendorPage');
        expect(res.clientOperation).toBe('loadAssignVendorPage');
        expect(service.formatHttpFailureForUi(res)).toMatch(/401|Access was denied|token|session|Unauthorized/i);
      });

      httpMock
        .expectOne(`${BASE}/assign-page/${JOB}`)
        .flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });
    });

    it('should handle 403 Forbidden', () => {
      service.loadAssignedVendors(JOB).subscribe((res) => {
        expect(res.status).toBe(false);
      });

      httpMock
        .expectOne(`${BASE}/assigned-vendors/${JOB}`)
        .flush('Forbidden', { status: 403, statusText: 'Forbidden' });
    });

    it('should handle 0 (network error)', () => {
      service.loadPinnedVendors(JOB).subscribe((res) => {
        expect(res.status).toBe(false);
        expect(service.formatHttpFailureForUi(res)).toMatch(/Could not connect|Job Ops API|token|login/i);
      });

      httpMock
        .expectOne(`${BASE}/pinned-vendors/${JOB}`)
        .error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
    });
  });
});
