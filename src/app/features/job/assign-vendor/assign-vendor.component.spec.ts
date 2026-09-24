import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject, of, Subject, NEVER } from 'rxjs';

import { AssignVendorComponent } from './assign-vendor.component';
import { AssignVendorService } from '../../../services/assign-vendor.service';
import {
  AssignVendorApiResponse,
  ApiErrorDetail,
  AssignVendorPage,
  VendorListItem,
  LocationHistoryVendor,
  VendorDropdownOption,
  DataReturn,
  QuickVendorRequest,
  SaveVendorNoteRequest,
  CheckDuplicateVendorRequest,
  VendorNoteItem,
  JobHeaderDetail,
  CreateVendorContext,
  AISourcingStatus,
  AISourcingVendor,
  VendorContactOption,
  IntDropdownOption,
  CheckDistanceRuleResponse,
  ServiceChargeResult,
  VendorRates,
  RegisteredVendorPacket,
  CreateDistantVendorApprovalResponse,
  DistantVendorApprovalDetailsResponse,
  ProcessDistantVendorResponse,
  SupportContactInfo,
  RecruitmentEmailResponse,
  SourcingVendorEmailSavedResponse,
  JobFileItem,
  LocationFileItem,
  VendorBillCheckResult,
  PendingApprovalCheckResult,
  VendorCountCheckResult,
  DefaultVendorCheckResult,
  VendorRadioOption,
} from '../../../models/assign-vendor.model';

// ════════════════════════════════════════════════════════════
//  Test Constants & Helpers
// ════════════════════════════════════════════════════════════

const JOB = 'job-111-222';
const LOC = 'loc-333-444';
const VENDOR = 'vnd-555-666';

function ok<T>(data: T, msg = 'OK'): AssignVendorApiResponse<T> {
  return { status: true, responseCode: 200, message: msg, data, details: [], unixTime: 0, traceId: null };
}

function fail<T>(msg = 'Error'): AssignVendorApiResponse<T> {
  return { status: false, responseCode: 400, message: msg, data: null as T, details: [], unixTime: 0, traceId: null };
}

function makePage(overrides: Partial<AssignVendorPage> = {}): AssignVendorPage {
  return {
    jobKey: JOB, jobName: 'Test Job', locationKey: LOC, tradeKey: 'trade-1',
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

function makeDropdownOptions(): VendorDropdownOption[] {
  return [{ text: 'Vendor A', value: 'va-key' }, { text: 'Vendor B', value: 'vb-key' }];
}

/** Minimal {@link VendorNoteItem} for tests that call {@link AssignVendorComponent.onEditNote}. */
function makeVendorNoteItem(overrides: Partial<VendorNoteItem> = {}): VendorNoteItem {
  return {
    noteKey: 'nk-default',
    vendorKey: VENDOR,
    title: 'Title',
    comment: 'Comment',
    addedOn: '2024-01-01',
    addedBy: 'Tester',
    ...overrides,
  };
}

/** Minimal {@link JobHeaderDetail} for mocked {@link AssignVendorService#loadJobHeaderDetail}. */
function makeJobHeaderDetail(): JobHeaderDetail {
  return {
    customerRequestorKey: null,
    customerRequestorName: null,
    accountManagerKey: null,
    accountManagerName: null,
    entryDate: null,
    completionDate: null,
    po: null,
    jobStatusName: null,
    jobTypeKey: 'type-1',
    jobTypeName: 'Standard',
    customerDne: null,
    revCustomerDne: null,
    customerProfileCustomerDne: '100.00',
    customerProfileEmergencyCustomerDne: '200.00',
    customerProfileVendorDne: '50.00',
    customerProfileVendorEmergencyDne: '75.00',
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

function makeCreateVendorContext(overrides: Partial<CreateVendorContext> = {}): CreateVendorContext {
  return {
    isPrimary: 0,
    fromCustomer: 0,
    minutesLeft: 30,
    primaryVendorKey: '',
    primaryVendorAlreadyAssignedToThisJobOnce: 0,
    jobVendorModel: { minutesLeft: 30 },
    ...overrides,
  };
}

/** Stops AI sourcing polling in tests (see {@link AssignVendorComponent#startAISourcingPolling}). */
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
//  Mock Service Factory
// ════════════════════════════════════════════════════════════

function createMockService() {
  const pageCtx$ = new BehaviorSubject<AssignVendorPage | null>(null);
  const assigned$ = new BehaviorSubject<LocationHistoryVendor[]>([]);
  const locHistory$ = new BehaviorSubject<LocationHistoryVendor[]>([]);
  const defaults$ = new BehaviorSubject<LocationHistoryVendor[]>([]);
  const search$ = new BehaviorSubject<VendorListItem[]>([]);
  const pinned$ = new BehaviorSubject<LocationHistoryVendor[]>([]);
  const loading$ = new BehaviorSubject<boolean>(false);
  const jobHeaderDetail$ = new BehaviorSubject<JobHeaderDetail | null>(null);
  const vendorDd$ = new BehaviorSubject<VendorDropdownOption[]>([]);
  const contactDd$ = new BehaviorSubject<VendorContactOption[]>([]);
  const tradeDd$ = new BehaviorSubject<VendorDropdownOption[]>([]);
  const stateDd$ = new BehaviorSubject<IntDropdownOption[]>([]);
  const cityDd$ = new BehaviorSubject<IntDropdownOption[]>([]);
  const aiVendors$ = new BehaviorSubject<AISourcingVendor[]>([]);
  const aiStatus$ = new BehaviorSubject<AISourcingStatus | null>(null);

  return {
    pageContext$: pageCtx$.asObservable(),
    jobHeaderDetail$: jobHeaderDetail$.asObservable(),
    assignedVendors$: assigned$.asObservable(),
    locationHistory$: locHistory$.asObservable(),
    defaultVendors$: defaults$.asObservable(),
    searchResults$: search$.asObservable(),
    pinnedVendors$: pinned$.asObservable(),
    vendorDropdown$: vendorDd$.asObservable(),
    contactDropdown$: contactDd$.asObservable(),
    tradeDropdown$: tradeDd$.asObservable(),
    stateDropdown$: stateDd$.asObservable(),
    cityDropdown$: cityDd$.asObservable(),
    loading$: loading$.asObservable(),
    aiSourcingVendors$: aiVendors$.asObservable(),
    aiSourcingStatus$: aiStatus$.asObservable(),

    _pageCtx$: pageCtx$, _jobHeaderDetail$: jobHeaderDetail$, _assigned$: assigned$, _locHistory$: locHistory$,
    _defaults$: defaults$, _search$: search$, _pinned$: pinned$, _loading$: loading$,
    _vendorDd$: vendorDd$, _contactDd$: contactDd$, _tradeDd$: tradeDd$, _stateDd$: stateDd$, _cityDd$: cityDd$,
    _aiVendors$: aiVendors$, _aiStatus$: aiStatus$,

    loadAssignVendorPage: vi.fn().mockReturnValue(of(ok(makePage()))),
    loadAssignedVendors: vi.fn().mockReturnValue(of(ok([makeAssignedVendor()]))),
    loadLocationHistoryVendors: vi.fn().mockReturnValue(of(ok([makeAssignedVendor()]))),
    loadPinnedVendors: vi.fn().mockReturnValue(of(ok([]))),
    loadVendorsNoRadius: vi.fn().mockReturnValue(of(ok([makeAssignedVendor()]))),
    loadVendorsInRadius: vi.fn().mockReturnValue(of(ok([makeAssignedVendor()]))),
    loadVendorsTradeRadius: vi.fn().mockReturnValue(of(ok([makeVendorListItem()]))),
    loadVendorsLocationHistory: vi.fn().mockReturnValue(of(ok([makeAssignedVendor()]))),
    loadAllVendors: vi.fn().mockReturnValue(of(ok([makeVendorListItem()]))),
    getActiveVendorsDropdown: vi.fn().mockImplementation(() => {
      const data = makeDropdownOptions();
      vendorDd$.next(data);
      return of(ok(data));
    }),
    sendCancellationEmail: vi.fn().mockReturnValue(of(ok('Sent'))),
    unpinVendor: vi.fn().mockReturnValue(of(ok(1))),
    unpinAllVendors: vi.fn().mockReturnValue(of(ok(1))),
    saveQuickVendor: vi.fn().mockReturnValue(
      of(ok({ flag: 1, message: 'Created', key: 'new-key', vendorKey: 'new-vendor' } as DataReturn)),
    ),
    checkDuplicateVendor: vi.fn().mockReturnValue(
      of(ok({ flag: 0, message: '', key: null, vendorKey: null } as DataReturn)),
    ),
    saveVendorNote: vi.fn().mockReturnValue(of(ok(1))),
    checkUploadedFiles: vi.fn().mockReturnValue(of(ok(3))),
    removeUploadedFiles: vi.fn().mockReturnValue(of(ok('Removed'))),
    refreshAllGrids: vi.fn(),
    checkUplineApproval: vi.fn().mockReturnValue(of(ok(2))),
    loadJobHeaderDetail: vi.fn().mockReturnValue(of(ok(makeJobHeaderDetail()))),
    getTradeDropdown: vi.fn().mockReturnValue(of([])),
    getStateDropdown: vi.fn().mockReturnValue(of([])),
    getSourcingStatus: vi.fn().mockReturnValue(of(makeSourcingNotStarted())),
    getSourcingVendors: vi.fn().mockReturnValue(of([])),
    getCreateVendorContext: vi.fn().mockReturnValue(of(ok(makeCreateVendorContext()))),
    checkPrimaryVendorIntro: vi.fn().mockReturnValue(of(ok('0'))),
    saveUplineOverride: vi.fn().mockReturnValue(of(ok('OK'))),
    getVendorContacts: vi.fn().mockReturnValue(of(ok([] as VendorContactOption[]))),
    loadVendorNotes: vi.fn().mockReturnValue(of(ok([] as VendorNoteItem[]))),
    getServiceCharge: vi.fn().mockReturnValue(
      of(
        ok({
          serviceCharge: 0,
          radiusInMiles: 50,
          laborKey: '',
          distanceFromLocation: 1,
        } as ServiceChargeResult),
      ),
    ),
    getCityDropdown: vi.fn().mockReturnValue(of([])),
    checkDistanceRule: vi.fn().mockReturnValue(
      of(
        ok({
          exceedsRule: false,
          distance: 0,
          ruleValue: 50,
          vendorName: null,
          jobPO: null,
          qcManagerKey: null,
        } as CheckDistanceRuleResponse),
      ),
    ),
    checkIfVendorIsConsolidator: vi.fn().mockReturnValue(
      of({ ...ok(false), message: 'Vendor is not a consolidator.' }),
    ),
    sendMailQcManagerConsolidatorDispatch: vi.fn().mockReturnValue(of(ok(JOB))),
    createDistantVendorApprovalRequest: vi.fn().mockReturnValue(
      of(ok({ approvalKey: 'appr-1', message: 'Sent' } as CreateDistantVendorApprovalResponse)),
    ),
    getDistantVendorApprovalDetails: vi.fn().mockReturnValue(
      of(
        ok({
          approvalKey: 'a',
          jobKey: JOB,
          vendorKey: VENDOR,
          jobPO: null,
          jobName: null,
          jobDescription: null,
          locationName: null,
          locationAddress: null,
          locationCity: null,
          locationState: null,
          locationZip: null,
          tradeName: null,
          tradeKey: null,
          vendorName: null,
          vendorEmail: null,
          vendorPhone: null,
          vendorAddress: null,
          vendorCity: null,
          vendorState: null,
          vendorZip: null,
          hourlyRate: null,
          tripCharge: null,
          serviceCharge: null,
          helperRate: null,
          tradeHourlyRate: null,
          tradeTripCharge: null,
          tradeServiceCharge: null,
          hasTradeSpecificRate: false,
          distanceFromLocation: 0,
          distanceRuleValue: 0,
          sentForApproval: null,
          isApproved: null,
          processedAndDeployed: null,
          sentByAdminName: null,
        } as DistantVendorApprovalDetailsResponse),
      ),
    ),
    processDistantVendorApproval: vi.fn().mockReturnValue(
      of(ok({ success: true, message: 'ok', redirectUrl: null } as ProcessDistantVendorResponse)),
    ),
    processDistantVendorDecline: vi.fn().mockReturnValue(
      of(ok({ success: true, message: 'ok', redirectUrl: null } as ProcessDistantVendorResponse)),
    ),
    getVendorRates: vi.fn().mockReturnValue(of(ok({} as VendorRates))),
    getRegisteredVendorPacket: vi.fn().mockReturnValue(of(ok({} as RegisteredVendorPacket))),
    setVendorAsDefault: vi.fn().mockReturnValue(of(ok('OK'))),
    reassignVendorFromInactive: vi.fn().mockReturnValue(of(ok('OK'))),
    checkForExistingVendor: vi.fn().mockReturnValue(of(ok(0))),
    checkForSameVendor: vi.fn().mockReturnValue(of(ok(0))),
    checkIfVendorBillExist: vi.fn().mockReturnValue(of(ok({ result: 0 } as VendorBillCheckResult))),
    checkIfThereIsAnyPendingApproval: vi.fn().mockReturnValue(
      of(ok({ result: 0 } as PendingApprovalCheckResult)),
    ),
    handleEstimateAndUnassign: vi.fn().mockReturnValue(of(ok('OK'))),
    checkForMoreThan1Vendor: vi.fn().mockReturnValue(of(ok({ result: 1 } as VendorCountCheckResult))),
    checkIfThisIsTheDefaultVendor: vi.fn().mockReturnValue(of(ok({ result: 0 } as DefaultVendorCheckResult))),
    getVendorsExceptDefault: vi.fn().mockReturnValue(of(ok([] as VendorRadioOption[]))),
    setOtherVendorDefault: vi.fn().mockReturnValue(of(ok(1))),
    unassignVendor: vi.fn().mockReturnValue(of(ok('OK'))),
    unassignVendorWithEmail: vi.fn().mockReturnValue(of(ok('OK'))),
    addPinnedVendor: vi.fn().mockReturnValue(of(ok(1, 'Vendor pinned successfully.'))),
    checkForPrimaryVendor: vi.fn().mockReturnValue(
      of(ok({ flag: 0, message: '', key: null, vendorKey: null } as DataReturn)),
    ),
    sendToPrimaryVendor: vi.fn().mockReturnValue(of(ok('OK'))),
    sendBulkCancellation: vi.fn().mockReturnValue(of(ok('OK'))),
    sendBulkCancellationWithEmail: vi.fn().mockReturnValue(of(ok('OK'))),
    checkVendorTrade: vi.fn().mockReturnValue(of(ok(1))),
    addTradeToVendor: vi.fn().mockReturnValue(
      of(ok({ flag: 1, message: '', key: null, vendorKey: null } as DataReturn)),
    ),
    checkIfVendorAlreadyAssigned: vi.fn().mockReturnValue(of(ok(0))),
    getVendorDNE: vi.fn().mockReturnValue(of(ok(null))),
    getJobFiles: vi.fn().mockReturnValue(of(ok([] as JobFileItem[]))),
    getLocationFiles: vi.fn().mockReturnValue(of(ok([] as LocationFileItem[]))),
    getAccountManagerSurveyItems: vi.fn().mockReturnValue(of(ok([]))),
    saveWorkOrderVendorSurvey: vi.fn().mockReturnValue(
      of(ok({ aiVendorSelectionId: 'survey-1', savedResponseCount: 1 })),
    ),
    uploadWorkOrderFiles: vi.fn().mockReturnValue(of(ok(1))),
    removeFile: vi.fn().mockReturnValue(of(ok('removed'))),
    convertETAToVendorDate: vi.fn().mockReturnValue(of(ok(''))),
    updateVendorScheduleDates: vi.fn().mockReturnValue(of(ok({ flag: 1, message: 'Saved', key: null, vendorKey: null } as DataReturn))),
    saveVendorToJob: vi.fn().mockReturnValue(
      of(ok({ flag: 1, message: '', key: 'jv-1', vendorKey: VENDOR } as DataReturn)),
    ),
    saveVendorToJobWithFiles: vi.fn().mockReturnValue(
      of(ok({ flag: 1, message: '', key: 'jv-1', vendorKey: VENDOR } as DataReturn)),
    ),
    sendWorkOrderEmail: vi.fn().mockReturnValue(
      of(ok({ flag: 1, message: 'Sent', key: null, vendorKey: null } as DataReturn)),
    ),
    saveSourcingVendorEmail: vi.fn().mockReturnValue(
      of({ email: 'a@b.com', vendorKeyHash: 'h' } as SourcingVendorEmailSavedResponse),
    ),
    getSupportContactInfo: vi.fn().mockReturnValue(
      of({
        primaryPhone: '877-217-3335',
        secondaryPhone: '770-427-9287',
        email: 'info@retailfixit.com',
        formattedDisplay: '877-217-3335 | info@retailfixit.com',
      } as SupportContactInfo),
    ),
    sendRecruitmentEmail: vi.fn().mockReturnValue(
      of({ flag: 1, mess: 'OK', messageId: 'mid' } as RecruitmentEmailResponse),
    ),
    saveGeneralAdminNote: vi.fn().mockReturnValue(of(ok('saved'))),
    formatHttpFailureForUi: (res: AssignVendorApiResponse<unknown> | null | undefined) =>
      res?.message?.length ? res.message : 'Error',
    clearAISourcingStatus: vi.fn(),
    jobStatusList$: of([]),
    getJobStatusList: vi.fn().mockReturnValue(of([])),
    getAccountManagerOptions: vi.fn().mockReturnValue(of([])),
    getJobPriorityOptions: vi.fn().mockReturnValue(of([])),
    getCustomerRequestorOptions: vi.fn().mockReturnValue(of([])),
    updateJobJobType: vi.fn().mockReturnValue(
      of(ok({ flag: 1, message: 'Updated', key: null, vendorKey: null } as DataReturn)),
    ),
    updateJobAccountManager: vi.fn().mockReturnValue(
      of(ok({ flag: 1, message: 'Updated', key: null, vendorKey: null } as DataReturn)),
    ),
    updateJobTrade: vi.fn().mockReturnValue(
      of(ok({ flag: 1, message: 'Updated', key: null, vendorKey: null } as DataReturn)),
    ),
    updateVendorJobStatus: vi.fn().mockReturnValue(of(ok({ flag: 1, message: 'Updated', key: null, vendorKey: null } as DataReturn))),
    startSourcing: vi.fn().mockReturnValue(of(null)),
  };
}

/** Fill all required quick-vendor fields so form becomes valid */
function fillValidQuickVendor(component: AssignVendorComponent) {
  component.quickVendorForm.patchValue({
    companyName: 'ACME', companyemail: 'info@acme.com', phone: '5551234567',
    address: '123 Main', stateKey: 1, cityKey: 1, zip: '75001',
    tradeKey: 'trade-1', contactName: 'Jane', contactemail: 'jane@acme.com',
    wcom: true, genL: false,
  });
}

// ════════════════════════════════════════════════════════════
//  Test Suite
// ════════════════════════════════════════════════════════════

describe('AssignVendorComponent', () => {
  let component: AssignVendorComponent;
  let fixture: ComponentFixture<AssignVendorComponent>;
  let mockService: ReturnType<typeof createMockService>;

  function setupWithJobKey(jobKey: string) {
    mockService = createMockService();
    TestBed.configureTestingModule({
      imports: [AssignVendorComponent, ReactiveFormsModule],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ jobKey }) } } },
        { provide: AssignVendorService, useValue: mockService },
      ],
    });
    fixture = TestBed.createComponent(AssignVendorComponent);
    component = fixture.componentInstance;
  }

  beforeEach(() => setupWithJobKey(JOB));
  afterEach(() => fixture.destroy());

  // ══════════════════════════════════════════════════════════
  //  1. COMPONENT INITIALIZATION & LIFECYCLE
  // ══════════════════════════════════════════════════════════

  describe('Component Initialization', () => {
    it('should create the component', () => {
      fixture.detectChanges();
      expect(component).toBeTruthy();
    });

    it('should read jobKey from route params on init', () => {
      fixture.detectChanges();
      expect(component.jobKey()).toBe(JOB);
    });

    it('should set error message when no jobKey is provided', () => {
      TestBed.resetTestingModule();
      setupWithJobKey('');
      fixture.detectChanges();
      expect(component.errorMessage()).toBe('No job key provided. Please navigate from a valid job.');
    });

    it('should not call any service methods when no jobKey', () => {
      TestBed.resetTestingModule();
      setupWithJobKey('');
      fixture.detectChanges();
      expect(mockService.loadAssignVendorPage).not.toHaveBeenCalled();
      expect(mockService.loadVendorsNoRadius).not.toHaveBeenCalled();
      expect(mockService.getActiveVendorsDropdown).not.toHaveBeenCalled();
    });

    it('should build all five reactive forms before loading data', () => {
      fixture.detectChanges();
      expect(component.vendorForm).toBeDefined();
      expect(component.searchForm).toBeDefined();
      expect(component.quickVendorForm).toBeDefined();
      expect(component.vendorNoteForm).toBeDefined();
      expect(component.pinForm).toBeDefined();
    });
  });

  // ══════════════════════════════════════════════════════════
  //  2. FORM FIELD COMPLETENESS & DEFAULT VALUES
  // ══════════════════════════════════════════════════════════

  describe('Vendor Selection Form — fields & defaults', () => {
    beforeEach(() => fixture.detectChanges());

    it('should have vendorKey and contactKey (distance/charge use signals, not form controls)', () => {
      expect(component.vendorForm.get('vendorKey')).toBeTruthy();
      expect(component.vendorForm.get('contactKey')).toBeTruthy();
      expect(component.vendorForm.get('distance')).toBeFalsy();
    });

    it('should default vendorKey to empty string', () => {
      expect(component.vendorForm.get('vendorKey')?.value).toBe('');
    });

    it('should default contactKey to empty string', () => {
      expect(component.vendorForm.get('contactKey')?.value).toBe('');
    });

    it('should default vendor metric signals to empty', () => {
      expect(component.selectedVendorDistance()).toBeNull();
      expect(component.selectedVendorServiceCharge()).toBeNull();
      expect(component.selectedVendorLaborKey()).toBe('');
    });
  });

  describe('Search Form — fields & defaults', () => {
    beforeEach(() => fixture.detectChanges());

    it('should have radius and searchType controls', () => {
      expect(component.searchForm.get('radius')).toBeTruthy();
      expect(component.searchForm.get('searchType')).toBeTruthy();
    });

    it('should default radius to 70', () => {
      expect(component.searchForm.get('radius')?.value).toBe(70);
    });

    it('should default searchType to 1 (all vendors in radius — matches initial vendors-in-radius load)', () => {
      expect(component.searchForm.get('searchType')?.value).toBe(1);
    });
  });

  describe('Quick Vendor Form — all 22 fields & defaults', () => {
    beforeEach(() => fixture.detectChanges());

    it('should have all 22 form controls', () => {
      const fields = [
        'companyName', 'companyemail', 'phone', 'address', 'address1',
        'stateKey', 'cityKey', 'zip', 'tradeKey', 'contactName', 'contactemail',
        'flatTrip', 'standardHourly', 'helperStandard',
        'emergencyFlat', 'emergencyStandard', 'emergencyHelper',
        'wcom', 'genL', 'accName', 'accEmail', 'accPhone',
      ];
      fields.forEach((f) => expect(component.quickVendorForm.get(f)).toBeTruthy());
    });

    it('should default all 6 numeric charge fields to 0', () => {
      ['flatTrip', 'standardHourly', 'helperStandard', 'emergencyFlat', 'emergencyStandard', 'emergencyHelper']
        .forEach((f) => expect(component.quickVendorForm.get(f)?.value).toBe(0));
    });

    it('should default wcom and genL to null', () => {
      expect(component.quickVendorForm.get('wcom')?.value).toBeNull();
      expect(component.quickVendorForm.get('genL')?.value).toBeNull();
    });

    it('should default stateKey and cityKey to 0', () => {
      expect(component.quickVendorForm.get('stateKey')?.value).toBe(0);
      expect(component.quickVendorForm.get('cityKey')?.value).toBe(0);
    });
  });

  describe('Vendor Note Form — fields & defaults', () => {
    beforeEach(() => fixture.detectChanges());

    it('should have noteKey, vendorKey, noteTitle, notesDetail, newNote', () => {
      ['noteKey', 'vendorKey', 'noteTitle', 'notesDetail', 'newNote'].forEach(
        (f) => expect(component.vendorNoteForm.get(f)).toBeTruthy(),
      );
    });

    it('should default newNote to 1 (create mode)', () => {
      expect(component.vendorNoteForm.get('newNote')?.value).toBe(1);
    });
  });

  describe('Pin Form — fields & defaults', () => {
    beforeEach(() => fixture.detectChanges());

    it('should have vendorKey, noMaybe, notes', () => {
      ['vendorKey', 'noMaybe', 'notes'].forEach(
        (f) => expect(component.pinForm.get(f)).toBeTruthy(),
      );
    });

    it('should default noMaybe to "No"', () => {
      expect(component.pinForm.get('noMaybe')?.value).toBe('No');
    });
  });

  // ══════════════════════════════════════════════════════════
  //  3. VALIDATION — PASS & FAIL with exact error messages
  // ══════════════════════════════════════════════════════════

  describe('Vendor Selection Validation (SRS §25.1)', () => {
    beforeEach(() => fixture.detectChanges());

    it('vendorKey required — FAIL when empty', () => {
      const ctrl = component.vendorForm.get('vendorKey')!;
      ctrl.setValue('');
      ctrl.markAsTouched();
      expect(ctrl.valid).toBe(false);
      expect(component.getErrorMessage(component.vendorForm, 'vendorKey')).toBe('Please select a vendor');
    });

    it('vendorKey required — PASS when set', () => {
      component.vendorForm.get('vendorKey')!.setValue('v1');
      expect(component.vendorForm.get('vendorKey')!.valid).toBe(true);
    });

    it('contactKey required — FAIL when empty', () => {
      const ctrl = component.vendorForm.get('contactKey')!;
      ctrl.setValue('');
      ctrl.markAsTouched();
      expect(ctrl.valid).toBe(false);
      expect(component.getErrorMessage(component.vendorForm, 'contactKey')).toBe('Please select a contact person');
    });

    it('contactKey required — PASS when set', () => {
      component.vendorForm.get('contactKey')!.setValue('c1');
      expect(component.vendorForm.get('contactKey')!.valid).toBe(true);
    });

    it('entire form — PASS when both fields set', () => {
      component.vendorForm.patchValue({ vendorKey: 'v1', contactKey: 'c1' });
      expect(component.vendorForm.valid).toBe(true);
    });

    it('getErrorMessage returns empty when control not touched', () => {
      expect(component.getErrorMessage(component.vendorForm, 'vendorKey')).toBe('');
    });
  });

  describe('Search Form Validation (SRS §25.1)', () => {
    beforeEach(() => fixture.detectChanges());

    it('radius required — FAIL when null', () => {
      const ctrl = component.searchForm.get('radius')!;
      ctrl.setValue(null);
      ctrl.markAsTouched();
      expect(ctrl.valid).toBe(false);
      expect(component.getErrorMessage(component.searchForm, 'radius')).toBe('Please enter a radius value');
    });

    it('radius min(0.01) — FAIL when 0', () => {
      const ctrl = component.searchForm.get('radius')!;
      ctrl.setValue(0);
      ctrl.markAsTouched();
      expect(ctrl.valid).toBe(false);
      expect(component.getErrorMessage(component.searchForm, 'radius')).toBe('Please enter a valid number');
    });

    it('radius min(0.01) — FAIL when negative', () => {
      component.searchForm.get('radius')!.setValue(-5);
      expect(component.searchForm.get('radius')!.valid).toBe(false);
    });

    it('radius — PASS when 1', () => {
      component.searchForm.get('radius')!.setValue(1);
      expect(component.searchForm.get('radius')!.valid).toBe(true);
    });

    it('radius — PASS with default 70', () => {
      expect(component.searchForm.valid).toBe(true);
    });
  });

  describe('Quick Vendor Validation (SRS §25.3)', () => {
    beforeEach(() => fixture.detectChanges());

    it('form invalid when all required fields empty', () => {
      expect(component.quickVendorForm.valid).toBe(false);
    });

    it('form valid when all required fields filled', () => {
      fillValidQuickVendor(component);
      expect(component.quickVendorForm.valid).toBe(true);
    });

    const requiredFieldTests: Array<{ field: string; msg: string }> = [
      { field: 'companyName', msg: 'Please enter Company Name' },
      { field: 'phone', msg: 'Please enter Phone' },
      { field: 'address', msg: 'Please enter Address' },
      { field: 'zip', msg: 'Please enter ZIP' },
      { field: 'tradeKey', msg: 'Please select a Trade' },
      { field: 'contactName', msg: 'Please enter Contact Name' },
      { field: 'wcom', msg: 'Please select Workers Compensation / General Liability' },
      { field: 'genL', msg: 'Please select Workers Compensation / General Liability' },
    ];

    requiredFieldTests.forEach(({ field, msg }) => {
      it(`${field} required — shows "${msg}"`, () => {
        component.quickVendorForm.get(field)!.markAsTouched();
        expect(component.getErrorMessage(component.quickVendorForm, field)).toBe(msg);
      });
    });

    it('companyemail email format — FAIL with "not-email"', () => {
      const ctrl = component.quickVendorForm.get('companyemail')!;
      ctrl.setValue('not-email');
      ctrl.markAsTouched();
      expect(component.getErrorMessage(component.quickVendorForm, 'companyemail'))
        .toBe('Please enter a valid email address');
    });

    it('companyemail — PASS with valid email', () => {
      component.quickVendorForm.get('companyemail')!.setValue('a@b.com');
      expect(component.quickVendorForm.get('companyemail')!.hasError('email')).toBe(false);
    });

    it('contactemail email format — FAIL with "bad"', () => {
      const ctrl = component.quickVendorForm.get('contactemail')!;
      ctrl.setValue('bad');
      ctrl.markAsTouched();
      expect(component.getErrorMessage(component.quickVendorForm, 'contactemail'))
        .toBe('Please enter valid Contact Email');
    });

    it('contactemail — PASS with valid email', () => {
      component.quickVendorForm.get('contactemail')!.setValue('x@y.com');
      expect(component.quickVendorForm.get('contactemail')!.hasError('email')).toBe(false);
    });

    it('stateKey min(1) — FAIL when 0', () => {
      expect(component.quickVendorForm.get('stateKey')!.valid).toBe(false);
    });

    it('stateKey — PASS when >= 1', () => {
      component.quickVendorForm.get('stateKey')!.setValue(5);
      expect(component.quickVendorForm.get('stateKey')!.valid).toBe(true);
    });

    it('cityKey min(1) — FAIL when 0', () => {
      expect(component.quickVendorForm.get('cityKey')!.valid).toBe(false);
    });

    it('cityKey — PASS when >= 1', () => {
      component.quickVendorForm.get('cityKey')!.setValue(3);
      expect(component.quickVendorForm.get('cityKey')!.valid).toBe(true);
    });
  });

  describe('Accounting Cross-Field Validator (SRS §25.3)', () => {
    beforeEach(() => fixture.detectChanges());

    it('PASS — no accounting fields filled', () => {
      component.quickVendorForm.patchValue({ accName: '', accEmail: '', accPhone: '' });
      expect(component.quickVendorForm.errors?.['accountingIncomplete']).toBeFalsy();
    });

    it('PASS — all three filled', () => {
      component.quickVendorForm.patchValue({ accName: 'A', accEmail: 'a@b.com', accPhone: '555' });
      expect(component.quickVendorForm.errors?.['accountingIncomplete']).toBeFalsy();
    });

    it('FAIL — only accName filled', () => {
      component.quickVendorForm.patchValue({ accName: 'A', accEmail: '', accPhone: '' });
      expect(component.quickVendorForm.errors?.['accountingIncomplete']).toBe(true);
    });

    it('FAIL — only accEmail filled', () => {
      component.quickVendorForm.patchValue({ accName: '', accEmail: 'a@b.com', accPhone: '' });
      expect(component.quickVendorForm.errors?.['accountingIncomplete']).toBe(true);
    });

    it('FAIL — only accPhone filled', () => {
      component.quickVendorForm.patchValue({ accName: '', accEmail: '', accPhone: '555' });
      expect(component.quickVendorForm.errors?.['accountingIncomplete']).toBe(true);
    });

    it('FAIL — two of three filled', () => {
      component.quickVendorForm.patchValue({ accName: 'A', accEmail: 'a@b.com', accPhone: '' });
      expect(component.quickVendorForm.errors?.['accountingIncomplete']).toBe(true);
    });

    it('FAIL — accName + accPhone without accEmail', () => {
      component.quickVendorForm.patchValue({ accName: 'A', accEmail: '', accPhone: '555' });
      expect(component.quickVendorForm.errors?.['accountingIncomplete']).toBe(true);
    });
  });

  describe('Vendor Note Validation (SRS §25.4)', () => {
    beforeEach(() => fixture.detectChanges());

    it('FAIL — title empty', () => {
      component.vendorNoteForm.patchValue({ vendorKey: VENDOR, noteTitle: '', notesDetail: 'x' });
      expect(component.vendorNoteForm.valid).toBe(false);
    });

    it('FAIL — details empty', () => {
      component.vendorNoteForm.patchValue({ vendorKey: VENDOR, noteTitle: 'T', notesDetail: '' });
      expect(component.vendorNoteForm.valid).toBe(false);
    });

    it('FAIL — vendorKey empty', () => {
      component.vendorNoteForm.patchValue({ vendorKey: '', noteTitle: 'T', notesDetail: 'D' });
      expect(component.vendorNoteForm.valid).toBe(false);
    });

    it('PASS — all required filled', () => {
      component.vendorNoteForm.patchValue({ vendorKey: VENDOR, noteTitle: 'T', notesDetail: 'D' });
      expect(component.vendorNoteForm.valid).toBe(true);
    });
  });

  // ══════════════════════════════════════════════════════════
  //  4. SUBMIT BUTTON DISABLED STATES
  // ══════════════════════════════════════════════════════════

  describe('Submit Button Disabled — Add Vendor', () => {
    beforeEach(() => fixture.detectChanges());

    function addVendorToJobButton(): HTMLButtonElement | undefined {
      const root = fixture.nativeElement as HTMLElement;
      return Array.from(root.querySelectorAll('button')).find((b) =>
        (b.textContent ?? '').includes('Add Vendor To This Job'),
      ) as HTMLButtonElement | undefined;
    }

    it('should be disabled when vendorForm is invalid', () => {
      fixture.detectChanges();
      const btn = addVendorToJobButton();
      expect(btn?.disabled).toBe(true);
    });

    it('should be enabled when vendorForm is valid and not submitting', () => {
      component.vendorForm.patchValue({ vendorKey: 'v1', contactKey: 'c1' });
      component.isSubmitting.set(false);
      fixture.detectChanges();
      const btn = addVendorToJobButton();
      expect(btn?.disabled).toBe(false);
    });

    it('should be disabled when isSubmitting is true even if form valid', () => {
      component.vendorForm.patchValue({ vendorKey: 'v1', contactKey: 'c1' });
      component.isSubmitting.set(true);
      fixture.detectChanges();
      const btn = addVendorToJobButton();
      expect(btn?.disabled).toBe(true);
    });
  });

  describe('Submit Button Disabled — Quick Vendor Modal', () => {
    beforeEach(() => {
      fixture.detectChanges();
      component.onOpenQuickVendor();
      fixture.detectChanges();
    });

    it('should be disabled when quickVendorForm is invalid', () => {
      const btns = fixture.nativeElement.querySelectorAll('.modal__footer .btn--primary') as NodeListOf<HTMLButtonElement>;
      const createBtn = Array.from(btns).find((b) => b.textContent?.includes('Create Vendor'));
      expect(createBtn?.disabled).toBe(true);
    });

    it('should be enabled when form is valid', () => {
      fillValidQuickVendor(component);
      fixture.detectChanges();
      const btns = fixture.nativeElement.querySelectorAll('.modal__footer .btn--primary') as NodeListOf<HTMLButtonElement>;
      const createBtn = Array.from(btns).find((b) => b.textContent?.includes('Create Vendor'));
      expect(createBtn?.disabled).toBe(false);
    });
  });

  describe('Submit Button Disabled — Save Note Modal', () => {
    beforeEach(() => {
      fixture.detectChanges();
      component.onOpenNotes(VENDOR);
      fixture.detectChanges();
    });

    it('Save Note is only disabled while submitting (not by form validity)', () => {
      expect(component.vendorNoteForm.invalid).toBe(true);
      const btns = fixture.nativeElement.querySelectorAll('.modal__footer .btn--primary') as NodeListOf<HTMLButtonElement>;
      const saveBtn = Array.from(btns).find((b) => b.textContent?.includes('Save Note'));
      expect(saveBtn?.disabled).toBe(false);
    });

    it('should be enabled when form is valid', () => {
      component.vendorNoteForm.patchValue({ noteTitle: 'T', notesDetail: 'D' });
      fixture.detectChanges();
      const btns = fixture.nativeElement.querySelectorAll('.modal__footer .btn--primary') as NodeListOf<HTMLButtonElement>;
      const saveBtn = Array.from(btns).find((b) => b.textContent?.includes('Save Note'));
      expect(saveBtn?.disabled).toBe(false);
    });
  });

  describe('Search Button Disabled', () => {
    beforeEach(() => fixture.detectChanges());

    it('should be disabled when searchForm is invalid', () => {
      component.searchForm.patchValue({ radius: null });
      fixture.detectChanges();
      const btns = fixture.nativeElement.querySelectorAll('.search-actions .btn--primary') as NodeListOf<HTMLButtonElement>;
      const searchBtn = Array.from(btns).find((b) => b.textContent?.includes('Search Vendors'));
      expect(searchBtn?.disabled).toBe(true);
    });

    it('should be enabled when searchForm is valid', () => {
      fixture.detectChanges();
      const btns = fixture.nativeElement.querySelectorAll('.search-actions .btn--primary') as NodeListOf<HTMLButtonElement>;
      const searchBtn = Array.from(btns).find((b) => b.textContent?.includes('Search Vendors'));
      expect(searchBtn?.disabled).toBe(false);
    });
  });

  // ══════════════════════════════════════════════════════════
  //  5. SERVICE CALLS WITH CORRECT PAYLOADS
  // ══════════════════════════════════════════════════════════

  describe('Initial Data Loading — correct service calls', () => {
    it('should call loadAssignVendorPage with jobKey', () => {
      fixture.detectChanges();
      expect(mockService.loadAssignVendorPage).toHaveBeenCalledWith(JOB);
    });

    it('should call loadVendorsInRadius with jobKey and default radius (initial vendor list)', () => {
      fixture.detectChanges();
      expect(mockService.loadVendorsInRadius).toHaveBeenCalledWith(JOB, 70);
    });

    it('should call getActiveVendorsDropdown with jobKey', () => {
      fixture.detectChanges();
      expect(mockService.getActiveVendorsDropdown).toHaveBeenCalledWith(JOB);
    });

    it('should call loadAssignedVendors with jobKey', () => {
      fixture.detectChanges();
      expect(mockService.loadAssignedVendors).toHaveBeenCalledWith(JOB);
    });

    it('should call loadLocationHistoryVendors with jobKey', () => {
      fixture.detectChanges();
      expect(mockService.loadLocationHistoryVendors).toHaveBeenCalledWith(JOB);
    });

    it('should call loadPinnedVendors with jobKey', () => {
      fixture.detectChanges();
      expect(mockService.loadPinnedVendors).toHaveBeenCalledWith(JOB);
    });

    it('should populate vendorDropdown from dropdown response', () => {
      fixture.detectChanges();
      expect(component.vendorDropdown()).toEqual(makeDropdownOptions());
    });

    it('should show flash message for 5s when page.message is set', () => {
      vi.useFakeTimers();
      mockService.loadAssignVendorPage.mockReturnValue(of(ok(makePage({ message: 'Flash!' }))));
      fixture.detectChanges();
      expect(component.successMessage()).toBe('Flash!');
      vi.advanceTimersByTime(5000);
      expect(component.successMessage()).toBe('');
      vi.useRealTimers();
    });

    it('should still load assigned vendors when page has no locationKey (uses jobKey route)', () => {
      mockService.loadAssignVendorPage.mockReturnValue(of(ok(makePage({ locationKey: null }))));
      mockService.loadAssignedVendors.mockClear();
      fixture.detectChanges();
      expect(mockService.loadAssignedVendors).toHaveBeenCalledWith(JOB);
    });
  });

  describe('Quick Vendor — saveQuickVendor payload', () => {
    beforeEach(() => fixture.detectChanges());

    it('should call saveQuickVendor with correct QuickVendorRequest fields', () => {
      fillValidQuickVendor(component);
      component.quickVendorForm.patchValue({ address1: 'Suite 5', flatTrip: 100, accName: 'Acc', accEmail: 'a@b.com', accPhone: '555' });
      component.onSubmitQuickVendor(true);

      const payload: QuickVendorRequest = mockService.saveQuickVendor.mock.calls[0][0];
      expect(payload.companyName).toBe('ACME');
      expect(payload.contactName).toBe('Jane');
      expect(payload.companyemail).toBe('info@acme.com');
      expect(payload.contactemail).toBe('jane@acme.com');
      expect(payload.phone).toBe('5551234567');
      expect(payload.address).toBe('123 Main');
      expect(payload.address1).toBe('Suite 5');
      expect(payload.stateKey).toBe(1);
      expect(payload.cityKey).toBe(1);
      expect(payload.zip).toBe('75001');
      expect(payload.tradeKey).toBe('trade-1');
      expect(payload.flatTrip).toBe(100);
      expect(payload.wcom).toBe(true);
      expect(payload.genL).toBe(false);
      expect(payload.accName).toBe('Acc');
      expect(payload.accEmail).toBe('a@b.com');
      expect(payload.accPhone).toBe('555');
    });

    it('should default empty charge fields to 0 in payload', () => {
      fillValidQuickVendor(component);
      component.onSubmitQuickVendor(true);
      const payload: QuickVendorRequest = mockService.saveQuickVendor.mock.calls[0][0];
      expect(payload.standardHourly).toBe(0);
      expect(payload.helperStandard).toBe(0);
      expect(payload.emergencyFlat).toBe(0);
      expect(payload.emergencyStandard).toBe(0);
      expect(payload.emergencyHelper).toBe(0);
    });
  });

  describe('Quick Vendor — checkDuplicateVendor payload', () => {
    beforeEach(() => fixture.detectChanges());

    it('should send name, email, phone from form values', () => {
      fillValidQuickVendor(component);
      component.onSubmitQuickVendor(false);
      const payload: CheckDuplicateVendorRequest = mockService.checkDuplicateVendor.mock.calls[0][0];
      expect(payload.name).toBe('ACME');
      expect(payload.email).toBe('info@acme.com');
      expect(payload.phone).toBe('5551234567');
    });
  });

  describe('Vendor Note — saveVendorNote payload', () => {
    beforeEach(() => fixture.detectChanges());

    it('should send correct SaveVendorNoteRequest for new note', () => {
      component.vendorNoteForm.patchValue({
        vendorKey: VENDOR, noteTitle: 'Title X', notesDetail: '<p>HTML</p>',
      });
      component.onSaveVendorNote();
      const payload: SaveVendorNoteRequest = mockService.saveVendorNote.mock.calls[0][0];
      expect(payload.vendorKey).toBe(VENDOR);
      expect(payload.noteTitle).toBe('Title X');
      expect(payload.notesDetail).toBe('<p>HTML</p>');
      expect(payload.newNote).toBe(1);
      expect(payload.noteKey).toBeNull();
    });

    it('should send newNote=0 and noteKey for edited note', () => {
      component.onEditNote(makeVendorNoteItem({ noteKey: 'nk-99', title: 'Old', comment: 'Old text' }));
      component.vendorNoteForm.patchValue({ vendorKey: VENDOR });
      component.onSaveVendorNote();
      const payload: SaveVendorNoteRequest = mockService.saveVendorNote.mock.calls[0][0];
      expect(payload.noteKey).toBe('nk-99');
      expect(payload.newNote).toBe(0);
    });
  });

  describe('Vendor Search — correct service calls per searchType', () => {
    beforeEach(() => fixture.detectChanges());

    it('searchType 1 → loadVendorsInRadius(jobKey, radius)', () => {
      component.searchForm.patchValue({ searchType: 1, radius: 50 });
      component.onSearchVendors();
      expect(mockService.loadVendorsInRadius).toHaveBeenCalledWith(JOB, 50);
    });

    it('searchType 2 → loadVendorsTradeRadius(jobKey, radius)', () => {
      component.searchForm.patchValue({ searchType: 2, radius: 30 });
      component.onSearchVendors();
      expect(mockService.loadVendorsTradeRadius).toHaveBeenCalledWith(JOB, 30);
    });

    it('searchType 3 → loadVendorsLocationHistory(jobKey)', () => {
      component.searchForm.patchValue({ searchType: 3 });
      component.onSearchVendors();
      expect(mockService.loadVendorsLocationHistory).toHaveBeenCalledWith(JOB);
    });

    it('does not search when form invalid', () => {
      mockService.loadVendorsInRadius.mockClear();
      mockService.loadVendorsTradeRadius.mockClear();
      mockService.loadVendorsLocationHistory.mockClear();
      component.searchForm.patchValue({ radius: null });
      component.onSearchVendors();
      expect(mockService.loadVendorsInRadius).not.toHaveBeenCalled();
      expect(mockService.loadVendorsTradeRadius).not.toHaveBeenCalled();
      expect(mockService.loadVendorsLocationHistory).not.toHaveBeenCalled();
    });

    it('onLoadAllVendors → loadVendorsNoRadius(jobKey) (browse all vendors)', () => {
      component.onLoadAllVendors();
      expect(mockService.loadVendorsNoRadius).toHaveBeenCalledWith(JOB);
    });
  });

  describe('Cancellation Email — sendCancellationEmail payload', () => {
    beforeEach(() => fixture.detectChanges());

    it('should call sendCancellationEmail with jobVendorKey', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      component.onSendCancellationEmail({ jobVendorKey: 'jv-xyz', vname: 'V' });
      expect(mockService.sendCancellationEmail).toHaveBeenCalledWith('jv-xyz');
    });

    it('should not call when user cancels confirm dialog', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      component.onSendCancellationEmail({ jobVendorKey: 'jv-xyz', vname: 'V' });
      expect(mockService.sendCancellationEmail).not.toHaveBeenCalled();
    });

    it('should not call when jobVendorKey is empty', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      component.onSendCancellationEmail({ jobVendorKey: '', vname: 'V' });
      expect(mockService.sendCancellationEmail).not.toHaveBeenCalled();
    });
  });

  describe('Unpin — correct service calls', () => {
    beforeEach(() => fixture.detectChanges());

    it('unpinVendor(pinKey, jobKey)', () => {
      component.onUnpinVendor({ pinKey: 'pk-1' });
      expect(mockService.unpinVendor).toHaveBeenCalledWith('pk-1', JOB);
    });

    it('unpinAllVendors(jobKey)', () => {
      component.onUnpinAll();
      expect(mockService.unpinAllVendors).toHaveBeenCalledWith(JOB);
    });

    it('does not unpin when pinKey is empty', () => {
      component.onUnpinVendor({ pinKey: '' });
      expect(mockService.unpinVendor).not.toHaveBeenCalled();
    });
  });

  describe('Uploaded Files — correct service calls', () => {
    beforeEach(() => fixture.detectChanges());

    it('checkUploadedFiles(jobKey)', () => {
      component.onCheckUploadedFiles();
      expect(mockService.checkUploadedFiles).toHaveBeenCalledWith(JOB);
    });

    it('removeUploadedFiles(jobKey)', () => {
      component.onRemoveUploadedFiles();
      expect(mockService.removeUploadedFiles).toHaveBeenCalledWith(JOB);
    });
  });

  // ══════════════════════════════════════════════════════════
  //  6. LOADING & SUBMITTING STATE TRANSITIONS
  // ══════════════════════════════════════════════════════════

  describe('isLoading state', () => {
    it('should be false after successful init', () => {
      fixture.detectChanges();
      expect(component.isLoading()).toBe(false);
    });

    it('should track service loading$ stream', () => {
      fixture.detectChanges();
      mockService._loading$.next(true);
      expect(component.isLoading()).toBe(true);
      mockService._loading$.next(false);
      expect(component.isLoading()).toBe(false);
    });
  });

  describe('isSubmitting state — cancellation email', () => {
    beforeEach(() => fixture.detectChanges());

    it('should be false after successful send', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      component.onSendCancellationEmail({ jobVendorKey: 'jv1', vname: 'V' });
      expect(component.isSubmitting()).toBe(false);
    });

    it('should be false after failed send', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      mockService.sendCancellationEmail.mockReturnValue(of(fail('Fail')));
      component.onSendCancellationEmail({ jobVendorKey: 'jv1', vname: 'V' });
      expect(component.isSubmitting()).toBe(false);
    });
  });

  describe('isSubmitting state — quick vendor', () => {
    beforeEach(() => fixture.detectChanges());

    it('should be false after successful save', () => {
      fillValidQuickVendor(component);
      component.onSubmitQuickVendor(true);
      expect(component.isSubmitting()).toBe(false);
    });

    it('should be false after failed save', () => {
      mockService.saveQuickVendor.mockReturnValue(
        of(ok({ flag: 0, message: 'Fail', key: null, vendorKey: null } as DataReturn)),
      );
      fillValidQuickVendor(component);
      component.onSubmitQuickVendor(true);
      expect(component.isSubmitting()).toBe(false);
    });

    it('should be false after duplicate check completes', () => {
      fillValidQuickVendor(component);
      component.onSubmitQuickVendor(false);
      expect(component.isSubmitting()).toBe(false);
    });
  });

  describe('isSubmitting state — vendor note', () => {
    beforeEach(() => fixture.detectChanges());

    it('should be false after successful save', () => {
      component.vendorNoteForm.patchValue({ vendorKey: VENDOR, noteTitle: 'T', notesDetail: 'D' });
      component.onSaveVendorNote();
      expect(component.isSubmitting()).toBe(false);
    });

    it('should be false after failed save', () => {
      mockService.saveVendorNote.mockReturnValue(of(fail('Fail')));
      component.vendorNoteForm.patchValue({ vendorKey: VENDOR, noteTitle: 'T', notesDetail: 'D' });
      component.onSaveVendorNote();
      expect(component.isSubmitting()).toBe(false);
    });
  });

  describe('isSubmitting state — add vendor', () => {
    beforeEach(() => fixture.detectChanges());

    it('should be false after validation (synchronous)', () => {
      component.vendorForm.patchValue({ vendorKey: 'v1', contactKey: 'c1' });
      component.onAddVendorToJob();
      expect(component.isSubmitting()).toBe(false);
    });
  });

  // ══════════════════════════════════════════════════════════
  //  7. SUCCESS MESSAGES & POST-SUBMIT BEHAVIOR
  // ══════════════════════════════════════════════════════════

  describe('Success — Quick Vendor', () => {
    beforeEach(() => fixture.detectChanges());

    it('should close modal on success', () => {
      component.showQuickVendorModal.set(true);
      fillValidQuickVendor(component);
      component.onSubmitQuickVendor(true);
      expect(component.showQuickVendorModal()).toBe(false);
    });

    it('should set successMessage from response', () => {
      fillValidQuickVendor(component);
      component.onSubmitQuickVendor(true);
      expect(component.successMessage()).toContain('Created');
    });

    it('should refresh vendor dropdown after creation', () => {
      mockService.getActiveVendorsDropdown.mockClear();
      fillValidQuickVendor(component);
      component.onSubmitQuickVendor(true);
      expect(mockService.getActiveVendorsDropdown).toHaveBeenCalled();
    });

    it('should auto-select newly created vendor in vendorForm', () => {
      vi.useFakeTimers();
      try {
        fillValidQuickVendor(component);
        component.onSubmitQuickVendor(true);
        vi.advanceTimersByTime(100);
        expect(component.vendorForm.get('vendorKey')?.value).toBe('new-vendor');
      } finally {
        vi.useRealTimers();
      }
    });

    it('should show duplicate warning when duplicate check returns flag=1', () => {
      mockService.checkDuplicateVendor.mockReturnValue(
        of(ok({ flag: 1, message: 'Dup!', key: null, vendorKey: null } as DataReturn)),
      );
      fillValidQuickVendor(component);
      component.onSubmitQuickVendor(false);
      expect(component.showDuplicateWarning()).toBe(true);
      expect(component.duplicateResult()?.message).toBe('Dup!');
    });
  });

  describe('Success — Vendor Note', () => {
    beforeEach(() => fixture.detectChanges());

    it('should call saveVendorNote then reload notes for the vendor', () => {
      component.notesVendorKey.set(VENDOR);
      component.vendorNoteForm.patchValue({ vendorKey: VENDOR, noteTitle: 'T', notesDetail: 'D' });
      component.onSaveVendorNote();
      expect(mockService.saveVendorNote).toHaveBeenCalled();
      expect(mockService.loadVendorNotes).toHaveBeenCalledWith(VENDOR);
    });

    it('should reset form fields after save', () => {
      component.vendorNoteForm.patchValue({ vendorKey: VENDOR, noteTitle: 'T', notesDetail: 'D' });
      component.onSaveVendorNote();
      expect(component.vendorNoteForm.get('noteTitle')?.value).toBe('');
      expect(component.vendorNoteForm.get('notesDetail')?.value).toBe('');
      expect(component.vendorNoteForm.get('newNote')?.value).toBe(1);
      expect(component.vendorNoteForm.get('noteKey')?.value).toBe('');
    });

    it('should mark form untouched after save', () => {
      component.vendorNoteForm.patchValue({ vendorKey: VENDOR, noteTitle: 'T', notesDetail: 'D' });
      component.vendorNoteForm.markAllAsTouched();
      component.onSaveVendorNote();
      expect(component.vendorNoteForm.touched).toBe(false);
    });
  });

  describe('Success — Cancellation Email', () => {
    beforeEach(() => fixture.detectChanges());

    it('should set successMessage', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      component.onSendCancellationEmail({ jobVendorKey: 'jv1', vname: 'V' });
      expect(component.successMessage()).toBe('Cancellation email sent successfully.');
    });

    it('should call refreshAllGrids on success', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      mockService._pageCtx$.next(makePage());
      component.onSendCancellationEmail({ jobVendorKey: 'jv1', vname: 'V' });
      expect(mockService.refreshAllGrids).toHaveBeenCalledWith(JOB);
    });
  });

  describe('Success — Unpin', () => {
    beforeEach(() => fixture.detectChanges());

    it('unpin single → "Vendor unpinned."', () => {
      component.onUnpinVendor({ pinKey: 'pk1' });
      expect(component.successMessage()).toContain('unpinned');
    });

    it('unpin all → "All vendors unpinned."', () => {
      component.onUnpinAll();
      expect(component.successMessage()).toContain('All vendors unpinned');
    });
  });

  describe('Success — Uploaded Files', () => {
    beforeEach(() => fixture.detectChanges());

    it('checkUploadedFiles → shows count message', () => {
      component.onCheckUploadedFiles();
      expect(component.successMessage()).toBe('3 file(s) uploaded.');
    });

    it('removeUploadedFiles → shows removed message', () => {
      component.onRemoveUploadedFiles();
      expect(component.successMessage()).toBe('Uploaded files removed.');
    });
  });

  // ══════════════════════════════════════════════════════════
  //  8. ERROR HANDLING — every API error scenario
  // ══════════════════════════════════════════════════════════

  describe('Error — Cancellation Email', () => {
    beforeEach(() => fixture.detectChanges());

    it('should display API error message', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      mockService.sendCancellationEmail.mockReturnValue(of(fail('Send failed')));
      component.onSendCancellationEmail({ jobVendorKey: 'jv1', vname: 'V' });
      expect(component.errorMessage()).toBe('Send failed');
    });

    it('should use fallback message when res.message is empty', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      mockService.sendCancellationEmail.mockReturnValue(of({ ...fail(), message: '' }));
      component.onSendCancellationEmail({ jobVendorKey: 'jv1', vname: 'V' });
      expect(component.errorMessage()).toBe('Failed to send cancellation email.');
    });
  });

  describe('Error — Quick Vendor Save', () => {
    beforeEach(() => fixture.detectChanges());

    it('should display data.message from failed save', () => {
      mockService.saveQuickVendor.mockReturnValue(
        of(ok({ flag: 0, message: 'Name already taken', key: null, vendorKey: null } as DataReturn)),
      );
      fillValidQuickVendor(component);
      component.onSubmitQuickVendor(true);
      expect(component.errorMessage()).toBe('Name already taken');
    });

    it('should use res.message as fallback', () => {
      mockService.saveQuickVendor.mockReturnValue(of(fail('Server error')));
      fillValidQuickVendor(component);
      component.onSubmitQuickVendor(true);
      expect(component.errorMessage()).toBe('Server error');
    });

    it('should use generic fallback when both messages empty', () => {
      mockService.saveQuickVendor.mockReturnValue(of({
        ...fail(), message: '', data: { flag: 0, message: '', key: null, vendorKey: null } as DataReturn,
      }));
      fillValidQuickVendor(component);
      component.onSubmitQuickVendor(true);
      expect(component.errorMessage()).toBe('Failed to create vendor.');
    });
  });

  describe('Error — Vendor Note Save', () => {
    beforeEach(() => fixture.detectChanges());

    it('should display error message from API', () => {
      mockService.saveVendorNote.mockReturnValue(of(fail('Note save error')));
      component.vendorNoteForm.patchValue({ vendorKey: VENDOR, noteTitle: 'T', notesDetail: 'D' });
      component.onSaveVendorNote();
      expect(component.errorMessage()).toBe('Note save error');
    });

    it('should use fallback when message is empty', () => {
      mockService.saveVendorNote.mockReturnValue(of({ ...fail(), message: '' }));
      component.vendorNoteForm.patchValue({ vendorKey: VENDOR, noteTitle: 'T', notesDetail: 'D' });
      component.onSaveVendorNote();
      expect(component.errorMessage()).toBe('Error');
    });
  });

  describe('Error — Unpin', () => {
    beforeEach(() => fixture.detectChanges());

    it('unpin single — displays error', () => {
      mockService.unpinVendor.mockReturnValue(of(fail('Unpin failed')));
      component.onUnpinVendor({ pinKey: 'pk1' });
      expect(component.errorMessage()).toBe('Unpin failed');
    });

    it('unpin single — fallback when message empty', () => {
      mockService.unpinVendor.mockReturnValue(of({ ...fail(), message: '' }));
      component.onUnpinVendor({ pinKey: 'pk1' });
      expect(component.errorMessage()).toBe('Failed to unpin vendor.');
    });

    it('unpin all — displays error', () => {
      mockService.unpinAllVendors.mockReturnValue(of(fail('Bulk unpin failed')));
      component.onUnpinAll();
      expect(component.errorMessage()).toBe('Bulk unpin failed');
    });

    it('unpin all — fallback when message empty', () => {
      mockService.unpinAllVendors.mockReturnValue(of({ ...fail(), message: '' }));
      component.onUnpinAll();
      expect(component.errorMessage()).toBe('Failed to unpin vendors.');
    });
  });

  describe('Error — Remove Uploaded Files', () => {
    beforeEach(() => fixture.detectChanges());

    it('should display error message', () => {
      mockService.removeUploadedFiles.mockReturnValue(of(fail('Remove failed')));
      component.onRemoveUploadedFiles();
      expect(component.errorMessage()).toBe('Remove failed');
    });

    it('should use fallback when message empty', () => {
      mockService.removeUploadedFiles.mockReturnValue(of({ ...fail(), message: '' }));
      component.onRemoveUploadedFiles();
      expect(component.errorMessage()).toBe('Failed to remove files.');
    });
  });

  // ══════════════════════════════════════════════════════════
  //  9. DATA STREAM SUBSCRIPTIONS & SIGNAL UPDATES
  // ══════════════════════════════════════════════════════════

  describe('Data Streams → Signals', () => {
    beforeEach(() => fixture.detectChanges());

    it('pageContext$ → pageContext signal', () => {
      mockService._pageCtx$.next(makePage({ jobName: 'Updated' }));
      expect(component.pageContext()?.jobName).toBe('Updated');
    });

    it('assignedVendors$ → assignedVendors signal', () => {
      const v = [makeAssignedVendor({ vendorName: 'A' }), makeAssignedVendor({ vendorName: 'B' })];
      mockService._assigned$.next(v);
      expect(component.assignedVendors().length).toBe(2);
    });

    it('locationHistory$ → locationHistoryVendors signal', () => {
      mockService._locHistory$.next([makeAssignedVendor()]);
      expect(component.locationHistoryVendors().length).toBe(1);
    });

    it('defaultVendors$ → defaultVendors signal', () => {
      mockService._defaults$.next([makeAssignedVendor(), makeAssignedVendor({ vendorKey: 'vk-2' })]);
      expect(component.defaultVendors().length).toBe(2);
    });

    it('searchResults$ → searchResults signal', () => {
      mockService._search$.next([makeVendorListItem()]);
      expect(component.searchResults().length).toBe(1);
    });

    it('pinnedVendors$ → pinnedVendors signal', () => {
      mockService._pinned$.next([]);
      expect(component.pinnedVendors().length).toBe(0);
    });

    it('loading$ → isLoading signal', () => {
      mockService._loading$.next(true);
      expect(component.isLoading()).toBe(true);
      mockService._loading$.next(false);
      expect(component.isLoading()).toBe(false);
    });
  });

  describe('Computed Values', () => {
    beforeEach(() => fixture.detectChanges());

    it('assignedVendorCount reflects length', () => {
      mockService._assigned$.next([makeAssignedVendor(), makeAssignedVendor(), makeAssignedVendor()]);
      expect(component.assignedVendorCount()).toBe(3);
    });

    it('tradeName from pageContext', () => {
      mockService._pageCtx$.next(makePage({ tradeName: 'Electrical' }));
      expect(component.tradeName()).toBe('Electrical');
    });

    it('tradeName defaults to empty when no context', () => {
      mockService._pageCtx$.next(null);
      expect(component.tradeName()).toBe('');
    });

    it('isPrimary true when isPrimary=1', () => {
      mockService._pageCtx$.next(makePage({ isPrimary: 1 }));
      expect(component.isPrimary()).toBe(true);
    });

    it('isPrimary false when isPrimary=0', () => {
      mockService._pageCtx$.next(makePage({ isPrimary: 0 }));
      expect(component.isPrimary()).toBe(false);
    });

    it('etaLabel "No of hours" for emergency job type', () => {
      mockService._pageCtx$.next(makePage({ jobTypeKey: 'FC078FD5-5DDC-4088-8A9F-D982436E20FD' }));
      expect(component.etaLabel()).toBe('No of hours');
    });

    it('etaLabel "No of days" for non-emergency', () => {
      mockService._pageCtx$.next(makePage({ jobTypeKey: 'other' }));
      expect(component.etaLabel()).toBe('No of days');
    });

    it('highlight flags propagate from pageContext', () => {
      mockService._pageCtx$.next(makePage({ isNewEstimate: true, isNewNote: true, isNewFileAndAttachment: false }));
      expect(component.isNewEstimate()).toBe(true);
      expect(component.isNewNote()).toBe(true);
      expect(component.isNewFile()).toBe(false);
    });
  });

  // ══════════════════════════════════════════════════════════
  //  10. SUBSCRIPTION CLEANUP ON DESTROY
  // ══════════════════════════════════════════════════════════

  describe('OnDestroy — subscription cleanup', () => {
    it('should emit on destroy$ and complete it', () => {
      fixture.detectChanges();
      const nextSpy = vi.spyOn(component['destroy$'], 'next');
      const completeSpy = vi.spyOn(component['destroy$'], 'complete');
      component.ngOnDestroy();
      expect(nextSpy).toHaveBeenCalled();
      expect(completeSpy).toHaveBeenCalled();
    });

    it('should stop updating signals after destroy', () => {
      fixture.detectChanges();
      component.ngOnDestroy();
      mockService._pageCtx$.next(makePage({ jobName: 'After Destroy' }));
      expect(component.pageContext()?.jobName).not.toBe('After Destroy');
    });

    it('should stop updating assignedVendors after destroy', () => {
      fixture.detectChanges();
      component.ngOnDestroy();
      mockService._assigned$.next([makeAssignedVendor(), makeAssignedVendor(), makeAssignedVendor()]);
      expect(component.assignedVendors().length).not.toBe(3);
    });

    it('should stop updating isLoading after destroy', () => {
      fixture.detectChanges();
      component.ngOnDestroy();
      mockService._loading$.next(true);
      expect(component.isLoading()).toBe(false);
    });
  });

  // ══════════════════════════════════════════════════════════
  //  11. VENDOR SELECTION FROM GRID
  // ══════════════════════════════════════════════════════════

  describe('Select Vendor from Grid', () => {
    beforeEach(() => fixture.detectChanges());

    it('should set vendorKey in vendorForm', () => {
      component.onSelectVendorFromGrid({ vendorKey: VENDOR, vendorName: 'ACME' });
      expect(component.vendorForm.get('vendorKey')?.value).toBe(VENDOR);
    });

    it('should clear contactKey when selecting new vendor', () => {
      component.vendorForm.patchValue({ contactKey: 'old' });
      component.onSelectVendorFromGrid({ vendorKey: VENDOR, vendorName: 'ACME' });
      expect(component.vendorForm.get('contactKey')?.value).toBe('');
    });

    it('should show success message with vendor name', () => {
      component.onSelectVendorFromGrid({ vendorKey: VENDOR, vendorName: 'ACME Corp' });
      expect(component.successMessage()).toContain('ACME Corp');
    });
  });

  describe('Vendor Selection Change', () => {
    beforeEach(() => fixture.detectChanges());

    it('should reset all dependent fields when vendor cleared', () => {
      component.vendorForm.patchValue({ vendorKey: '' });
      component.onVendorSelected();
      expect(component.vendorForm.get('contactKey')?.value).toBe('');
      expect(component.selectedVendorDistance()).toBeNull();
      expect(component.selectedVendorServiceCharge()).toBeNull();
      expect(component.selectedVendorLaborKey()).toBe('');
    });
  });

  // ══════════════════════════════════════════════════════════
  //  12. MODAL OPEN/CLOSE BEHAVIOR
  // ══════════════════════════════════════════════════════════

  describe('Quick Vendor Modal', () => {
    beforeEach(() => fixture.detectChanges());

    it('onOpenQuickVendor resets form and opens modal', () => {
      component.quickVendorForm.patchValue({ companyName: 'Old' });
      component.onOpenQuickVendor();
      expect(component.showQuickVendorModal()).toBe(true);
      expect(component.quickVendorForm.get('companyName')?.value).toBe('');
      expect(component.showDuplicateWarning()).toBe(false);
    });

    it('onCloseQuickVendor closes modal', () => {
      component.showQuickVendorModal.set(true);
      component.onCloseQuickVendor();
      expect(component.showQuickVendorModal()).toBe(false);
    });

    it('invalid form does not trigger service call', () => {
      component.onSubmitQuickVendor();
      expect(mockService.checkDuplicateVendor).not.toHaveBeenCalled();
      expect(mockService.saveQuickVendor).not.toHaveBeenCalled();
    });
  });

  describe('Notes Modal', () => {
    beforeEach(() => fixture.detectChanges());

    it('onOpenNotes sets vendorKey, resets form, opens modal', () => {
      component.onOpenNotes(VENDOR);
      expect(component.showNotesModal()).toBe(true);
      expect(component.notesVendorKey()).toBe(VENDOR);
      expect(component.vendorNoteForm.get('vendorKey')?.value).toBe(VENDOR);
      expect(component.vendorNoteForm.get('newNote')?.value).toBe(1);
    });

    it('onCloseNotes closes modal', () => {
      component.showNotesModal.set(true);
      component.onCloseNotes();
      expect(component.showNotesModal()).toBe(false);
    });

    it('onEditNote populates form for editing', () => {
      component.onEditNote(makeVendorNoteItem({ noteKey: 'nk1', title: 'T', comment: '<p>C</p>' }));
      expect(component.vendorNoteForm.get('noteKey')?.value).toBe('nk1');
      expect(component.vendorNoteForm.get('noteTitle')?.value).toBe('T');
      expect(component.vendorNoteForm.get('notesDetail')?.value).toBe('<p>C</p>');
      expect(component.vendorNoteForm.get('newNote')?.value).toBe(0);
    });

    it('invalid form does not call saveVendorNote', () => {
      component.onSaveVendorNote();
      expect(mockService.saveVendorNote).not.toHaveBeenCalled();
    });
  });

  describe('Pin Modal', () => {
    beforeEach(() => fixture.detectChanges());

    it('onOpenPinModal with "No" populates correctly', () => {
      component.onOpenPinModal({ vendorKey: VENDOR }, 'No');
      expect(component.showPinModal()).toBe(true);
      expect(component.pinForm.get('vendorKey')?.value).toBe(VENDOR);
      expect(component.pinForm.get('noMaybe')?.value).toBe('No');
    });

    it('onOpenPinModal with "Maybe" populates correctly', () => {
      component.onOpenPinModal({ vendorKey: VENDOR }, 'Maybe');
      expect(component.pinForm.get('noMaybe')?.value).toBe('Maybe');
    });

    it('onSubmitPin closes modal and shows success', () => {
      component.onOpenPinModal({ vendorKey: VENDOR }, 'No');
      component.onSubmitPin();
      expect(component.showPinModal()).toBe(false);
      expect(component.successMessage()).toContain('pinned');
    });
  });

  // ══════════════════════════════════════════════════════════
  //  13. REFRESH & FORM RESET
  // ══════════════════════════════════════════════════════════

  describe('Refresh', () => {
    beforeEach(() => fixture.detectChanges());

    it('should re-call loadAssignVendorPage', () => {
      mockService.loadAssignVendorPage.mockClear();
      component.onRefresh();
      expect(mockService.loadAssignVendorPage).toHaveBeenCalledWith(JOB);
    });

    it('should clear both messages', () => {
      component.errorMessage.set('err');
      component.successMessage.set('suc');
      component.onRefresh();
      expect(component.errorMessage()).toBe('');
      expect(component.successMessage()).toBe('');
    });
  });

  describe('Reset Vendor Form', () => {
    beforeEach(() => fixture.detectChanges());

    it('should clear all fields', () => {
      component.vendorForm.patchValue({ vendorKey: 'v1', contactKey: 'c1' });
      component.onResetVendorForm();
      expect(component.vendorForm.get('vendorKey')?.value).toBe('');
      expect(component.vendorForm.get('contactKey')?.value).toBe('');
      expect(component.selectedVendorDistance()).toBeNull();
      expect(component.selectedVendorServiceCharge()).toBeNull();
    });

    it('should mark form untouched', () => {
      component.vendorForm.markAllAsTouched();
      component.onResetVendorForm();
      expect(component.vendorForm.touched).toBe(false);
    });
  });

  // ══════════════════════════════════════════════════════════
  //  14. ROW HIGHLIGHTING & GRID DEFINITIONS
  // ══════════════════════════════════════════════════════════

  describe('Row Highlighting (SRS §7.3)', () => {
    it('default → "row--default-vendor"', () => {
      expect(component.assignedRowClass({ isDefault: true })).toBe('row--default-vendor');
    });

    it('primary → "row--primary-vendor"', () => {
      expect(component.assignedRowClass({ isPrimaryVendor: true })).toBe('row--primary-vendor');
    });

    it('full consolidator → "row--full-consolidator"', () => {
      expect(component.assignedRowClass({ isFullConsolidator: true })).toBe('row--full-consolidator');
    });

    it('possible consolidator → "row--possible-consolidator"', () => {
      expect(component.assignedRowClass({ isPossibleConsolidator: true })).toBe('row--possible-consolidator');
    });

    it('normal → empty string', () => {
      expect(component.assignedRowClass({})).toBe('');
    });

    it('isDefault takes priority over isPrimaryVendor', () => {
      expect(component.assignedRowClass({ isDefault: true, isPrimaryVendor: true })).toBe('row--default-vendor');
    });

    it('isPrimaryVendor takes priority over consolidators', () => {
      expect(component.assignedRowClass({ isPrimaryVendor: true, isFullConsolidator: true })).toBe('row--primary-vendor');
    });
  });

  describe('Grid Column Definitions', () => {
    it('assignedColumns has all required fields', () => {
      const fields = component.assignedColumns.map((c) => c.field);
      expect(fields).toContain('vendorName');
      expect(fields).toContain('jobCount');
      expect(fields).toContain('vendorAddress');
      expect(fields).toContain('contactName');
      expect(fields).toContain('radiusInMiles');
      expect(fields).toContain('distanceFromLocation');
      expect(fields).toContain('tradeList');
      expect(fields).toContain('isDelete');
      expect(fields).toContain('enteredDate');
      expect(fields).toContain('serviceCallMinimum');
    });

    it('vendorListColumns has correct fields', () => {
      const fields = component.vendorListColumns.map((c) => c.field);
      expect(fields).toContain('vendorName');
      expect(fields).toContain('jobCount');
      expect(fields).toContain('vendorAddress');
      expect(fields).toContain('radiusInMiles');
      expect(fields).toContain('distanceFromLocation');
      expect(fields).toContain('tradeList');
      expect(fields).toContain('serviceCallMinimum');
    });

    it('pinnedColumns extends vendorListColumns without remarks', () => {
      const fields = component.pinnedColumns.map((c) => c.field);
      expect(fields).not.toContain('remarks');
      expect(fields).toContain('vendorName');
    });
  });

  describe('Grid Action Visibility', () => {
    it('vendor list: Assign & Send W/O hidden when vendor already assigned', () => {
      const a = component.vendorListActions.find((x) => x.label === 'Assign & Send W/O')!;
      expect(a.visibleWhen!({ isVendorAssigned: true })).toBe(false);
      expect(a.visibleWhen!({ isVendorAssigned: false })).toBe(true);
    });

    it('search results: Select hidden when vendor already assigned', () => {
      const a = component.searchResultActions.find((x) => x.label === 'Select')!;
      expect(a.visibleWhen!({ isVendorAssigned: true })).toBe(false);
      expect(a.visibleWhen!({ isVendorAssigned: false })).toBe(true);
    });

    it('vendor list action labels', () => {
      expect(component.vendorListActions.map((a) => a.label)).toEqual(['Assign & Send W/O', 'No', 'Maybe']);
    });

    it('pinned action labels', () => {
      expect(component.pinnedActions.map((a) => a.label)).toEqual(['Assign & Send W/O', 'Unpin']);
    });
  });

  describe('Search Type Options', () => {
    it('should return 3 options', () => {
      expect(component.searchTypeOptions.length).toBe(3);
    });

    it('should have correct labels', () => {
      expect(component.searchTypeOptions[0]).toEqual({ value: 1, label: 'All vendors in radius' });
      expect(component.searchTypeOptions[1]).toEqual({ value: 2, label: 'Vendors in selected trade within radius' });
      expect(component.searchTypeOptions[2]).toEqual({ value: 3, label: 'Vendors in current location history' });
    });
  });

  // ══════════════════════════════════════════════════════════
  //  15. LAYER 7 — SERVER ERROR MAPPING & VALIDATION WIRING
  // ══════════════════════════════════════════════════════════

  describe('applyServerErrors — field-level mapping', () => {
    beforeEach(() => fixture.detectChanges());

    it('should set serverError on matching camelCase control', () => {
      const details: ApiErrorDetail[] = [
        { field: 'CompanyName', message: 'Please enter Company Name', code: 'VALIDATION_ERROR' },
      ];
      component.applyServerErrors(details, component.quickVendorForm);
      expect(component.quickVendorForm.get('companyName')?.errors?.['serverError']).toBe('Please enter Company Name');
    });

    it('should mark matched controls as touched', () => {
      const details: ApiErrorDetail[] = [
        { field: 'Phone', message: 'Please enter Phone', code: null },
      ];
      component.applyServerErrors(details, component.quickVendorForm);
      expect(component.quickVendorForm.get('phone')?.touched).toBe(true);
    });

    it('should map multiple field errors at once', () => {
      const details: ApiErrorDetail[] = [
        { field: 'CompanyName', message: 'Required', code: null },
        { field: 'Address', message: 'Required', code: null },
        { field: 'ZIP', message: 'Required', code: null },
      ];
      component.applyServerErrors(details, component.quickVendorForm);
      expect(component.quickVendorForm.get('companyName')?.hasError('serverError')).toBe(true);
      expect(component.quickVendorForm.get('address')?.hasError('serverError')).toBe(true);
    });

    it('should return unmapped errors as a joined string', () => {
      const details: ApiErrorDetail[] = [
        { field: null, message: 'General error', code: null },
        { field: 'NonExistentField', message: 'No such field', code: null },
      ];
      const result = component.applyServerErrors(details, component.quickVendorForm);
      expect(result).toContain('General error');
      expect(result).toContain('No such field');
    });

    it('should return empty string when all errors mapped', () => {
      const details: ApiErrorDetail[] = [
        { field: 'CompanyName', message: 'Err', code: null },
      ];
      const result = component.applyServerErrors(details, component.quickVendorForm);
      expect(result).toBe('');
    });
  });

  describe('handleApiError — integration', () => {
    beforeEach(() => fixture.detectChanges());

    it('should apply field errors to the form and set global message', () => {
      const res: AssignVendorApiResponse<null> = {
        status: false, responseCode: 400, message: 'Validation failed.',
        data: null, details: [
          { field: 'NoteTitle', message: 'Please enter a title', code: 'VALIDATION_ERROR' },
        ], unixTime: 0, traceId: null,
      };
      component.handleApiError(res, component.vendorNoteForm);
      expect(component.vendorNoteForm.get('noteTitle')?.errors?.['serverError']).toBe('Please enter a title');
      expect(component.errorMessage()).toBe('Validation failed.');
    });

    it('should set errorMessage when no form provided', () => {
      const res: AssignVendorApiResponse<null> = {
        status: false, responseCode: 500, message: 'Server error',
        data: null, details: [], unixTime: 0, traceId: null,
      };
      component.handleApiError(res);
      expect(component.errorMessage()).toBe('Server error');
    });

    it('should use fallback message when res.message is empty', () => {
      const res: AssignVendorApiResponse<null> = {
        status: false, responseCode: 0, message: '',
        data: null, details: [], unixTime: 0, traceId: null,
      };
      component.handleApiError(res);
      expect(component.errorMessage()).toBe('An unexpected error occurred.');
    });
  });

  describe('getErrorMessage — serverError priority', () => {
    beforeEach(() => fixture.detectChanges());

    it('should display serverError over required when both present', () => {
      const ctrl = component.quickVendorForm.get('companyName')!;
      ctrl.setValue('');
      ctrl.setErrors({ required: true, serverError: 'Server says invalid' });
      ctrl.markAsTouched();
      expect(component.getErrorMessage(component.quickVendorForm, 'companyName')).toBe('Server says invalid');
    });

    it('should fall back to required message when no serverError', () => {
      const ctrl = component.quickVendorForm.get('companyName')!;
      ctrl.setValue('');
      ctrl.markAsTouched();
      expect(component.getErrorMessage(component.quickVendorForm, 'companyName')).toBe('Please enter Company Name');
    });
  });

  describe('Quick Vendor — server-side 400 with field errors', () => {
    beforeEach(() => fixture.detectChanges());

    it('should map API field errors to quickVendorForm controls', () => {
      mockService.saveQuickVendor.mockReturnValue(of({
        status: false, responseCode: 400, message: 'Validation failed.',
        data: null as unknown as DataReturn, details: [
          { field: 'Companyemail', message: 'Please enter a valid email address', code: 'VALIDATION_ERROR' },
        ], unixTime: 0, traceId: null,
      }));
      fillValidQuickVendor(component);
      component.onSubmitQuickVendor(true);
      expect(component.quickVendorForm.get('companyemail')?.errors?.['serverError'])
        .toBe('Please enter a valid email address');
    });

    it('should keep form data after failed submit', () => {
      mockService.saveQuickVendor.mockReturnValue(of({
        status: false, responseCode: 400, message: 'Validation failed.',
        data: null as unknown as DataReturn, details: [], unixTime: 0, traceId: null,
      }));
      fillValidQuickVendor(component);
      component.onSubmitQuickVendor(true);
      expect(component.quickVendorForm.get('companyName')?.value).toBe('ACME');
    });
  });

  describe('Vendor Note — server-side 400 with field errors', () => {
    beforeEach(() => fixture.detectChanges());

    it('should map API field errors to vendorNoteForm controls', () => {
      mockService.saveVendorNote.mockReturnValue(of({
        status: false, responseCode: 400, message: 'Validation failed.',
        data: null, details: [
          { field: 'NoteTitle', message: 'Please enter a title', code: 'VALIDATION_ERROR' },
          { field: 'NotesDetail', message: 'Please enter note details', code: 'VALIDATION_ERROR' },
        ], unixTime: 0, traceId: null,
      }));
      component.vendorNoteForm.patchValue({ vendorKey: VENDOR, noteTitle: 'T', notesDetail: 'D' });
      component.onSaveVendorNote();
      expect(component.vendorNoteForm.get('noteTitle')?.errors?.['serverError']).toBe('Please enter a title');
      expect(component.vendorNoteForm.get('notesDetail')?.errors?.['serverError']).toBe('Please enter note details');
    });

    it('should keep form data after failed submit', () => {
      mockService.saveVendorNote.mockReturnValue(of({
        status: false, responseCode: 400, message: 'Error',
        data: null, details: [], unixTime: 0, traceId: null,
      }));
      component.vendorNoteForm.patchValue({ vendorKey: VENDOR, noteTitle: 'Keep', notesDetail: 'This' });
      component.onSaveVendorNote();
      expect(component.vendorNoteForm.get('noteTitle')?.value).toBe('Keep');
      expect(component.vendorNoteForm.get('notesDetail')?.value).toBe('This');
    });
  });

  describe('ML dispatch capture — buildMlDispatchCapture', () => {
    const SCORED_VENDOR = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const UNSCORED_VENDOR = '11111111-2222-3333-4444-555555555555';
    const RUN_UID = '9f6c1e2a-4d77-4f5e-bb31-2a0d9c8e7f10';

    beforeEach(() => {
      fixture.detectChanges();
      component.scoringRunUid.set(RUN_UID);
      component.woSelectedVendorKey.set(SCORED_VENDOR);
      component.vendorScores.set({
        [SCORED_VENDOR]: {
          vendorKey: SCORED_VENDOR,
          jobSpecificScore: 78.4,
          overallScore: 80,
          scoreTier: 'good',
          rank: 1,
          completedJobs: 10,
          flags: [],
          pillarScores: null,
          workloadFlag: null,
        },
        [UNSCORED_VENDOR]: {
          vendorKey: UNSCORED_VENDOR,
          jobSpecificScore: 0,
          overallScore: 0,
          scoreTier: 'N/A',
          rank: 0,
          completedJobs: 2,
          flags: ['insufficient_data'],
          pillarScores: null,
          workloadFlag: null,
          unscoredRankScore: 62,
        },
      });
      component.defaultVendors.set([
        {
          vendorKey: SCORED_VENDOR,
          vendorName: 'Scored Co',
          score: 78,
          scoreTier: 'good',
        } as LocationHistoryVendor,
        {
          vendorKey: UNSCORED_VENDOR,
          vendorName: 'Unscored Co',
          score: null,
          scoreTier: 'N/A',
          unscoredRankScore: 62,
        } as LocationHistoryVendor,
      ]);
    });

    it('builds scoringRunUid, chosenVendorScore, and displayedVendors from scorecard state', () => {
      const capture = (component as unknown as {
        buildMlDispatchCapture: () => {
          scoringRunUid: string | null;
          chosenVendorScore: number | null;
          displayedVendors: { vendorKey: string; score: number; isScored: boolean }[] | null;
        };
      }).buildMlDispatchCapture();

      expect(capture.scoringRunUid).toBe(RUN_UID);
      expect(capture.chosenVendorScore).toBe(78.4);
      expect(capture.displayedVendors?.length).toBe(2);
      expect(capture.displayedVendors?.[0]).toEqual({
        vendorKey: SCORED_VENDOR,
        score: 78.4,
        isScored: true,
      });
      expect(capture.displayedVendors?.[1]).toEqual({
        vendorKey: UNSCORED_VENDOR,
        score: 62,
        isScored: false,
      });
    });

    it('appends chosen vendor to displayedVendors when not in filtered internal view', () => {
      component.woSelectedVendorKey.set(UNSCORED_VENDOR);
      component.internalScoringFilter.set('scored');

      const capture = (component as unknown as {
        buildMlDispatchCapture: () => {
          displayedVendors: { vendorKey: string }[] | null;
          chosenVendorScore: number | null;
        };
      }).buildMlDispatchCapture();

      expect(capture.chosenVendorScore).toBe(62);
      expect(capture.displayedVendors?.some((d) => d.vendorKey === UNSCORED_VENDOR)).toBe(true);
    });

    it('returns null ML fields when no scorecard data is available', () => {
      component.scoringRunUid.set(null);
      component.vendorScores.set({});
      component.defaultVendors.set([]);
      component.woSelectedVendorKey.set('');

      const capture = (component as unknown as {
        buildMlDispatchCapture: () => {
          scoringRunUid: string | null;
          chosenVendorScore: number | null;
          displayedVendors: unknown[] | null;
        };
      }).buildMlDispatchCapture();

      expect(capture.scoringRunUid).toBeNull();
      expect(capture.chosenVendorScore).toBeNull();
      expect(capture.displayedVendors).toBeNull();
    });
  });
});
