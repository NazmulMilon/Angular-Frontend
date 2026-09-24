import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/** One row of the customer list (mirrors backend `CustomerListRowDto`). */
export interface CustomerListRow {
  customerKey: string;
  customerName: string;
  primaryContact: string;
  phone: string;
  email: string;
  accountManagerName: string;
  accountManagerKey: string | null;
  vendorBroadcastEnabled: boolean;
  isDeleted: boolean;
}

/** A page of customer rows plus the total matching count (mirrors `CustomerListResultDto`). */
export interface CustomerListResult {
  rows: CustomerListRow[];
  total: number;
  page: number;
  pageSize: number;
}

/** Account-manager dropdown option (mirrors `CustomerAccountManagerOptionDto`). */
export interface AccountManagerOption {
  personnelKey: string;
  name: string;
}

/** Query for {@link CustomerListService.list}. */
export interface CustomerListQuery {
  status: 'active' | 'inactive';
  search?: string;
  sortBy?: 'name' | 'accountManager' | 'broadcast';
  sortDir?: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

/** Result of a bulk mutation (mirrors `BulkUpdateResultDto`). */
export interface BulkUpdateResult {
  updated: number;
}

/** A state option for the create form. */
export interface StateOption {
  pkey: number;
  name: string;
}

/** A city option for the create form. */
export interface CityOption {
  cityKey: number;
  name: string;
}

/** A payment-terms option (mirrors `TermOptionDto`). */
export interface TermOption {
  netId: number;
  name: string;
}

/** A job-type option (mirrors `JobTypeOptionDto`). */
export interface JobTypeOption {
  id: string;
  name: string;
}

/** Dropdown data for the create form (mirrors `CreateCustomerOptionsDto`). */
export interface CreateCustomerOptions {
  states: StateOption[];
  accountManagers: AccountManagerOption[];
  terms: TermOption[];
  jobTypes: JobTypeOption[];
  systemwideEtaDays: number | null;
}

/**
 * Body for creating a customer (mirrors `CreateCustomerRequestDto`) — the full legacy
 * MgtCustomer/Create "General" tab. Every field maps to a `Customer` column except
 * `jobTypeKeys` (→ JobTypeForCustomers rows); the logo is uploaded separately.
 */
export interface CreateCustomerRequest {
  // Basic
  customerName: string;
  address?: string | null;
  nonUsaAddress: boolean;
  stateCode?: number | null;
  cityKey?: number | null;
  zip?: string | null;
  companyPhone?: string | null;
  companyEmail?: string | null;
  website?: string | null;
  accountManagerKey?: string | null;
  netId?: number | null;
  priviledgedForVendorBlast: boolean;

  // Customer PO customization
  freeTextLabel?: string | null;
  freeTextContent?: string | null;
  showHideCustomerPo: boolean;
  mandatoryRcsPo: boolean;

  // Vendor-invoice file configuration
  file1Present: boolean;
  file1Required: boolean;
  file1Label?: string | null;
  file2Present: boolean;
  file2Required: boolean;
  file2Label?: string | null;
  file3Present: boolean;
  file3Required: boolean;
  file3Label?: string | null;

  // Markups
  materialMarkUp?: number | null;
  laborAndTrip?: number | null;
  adminMarkup?: number | null;

  // Job types shown in the customer portal
  jobTypeKeys?: string[] | null;

  // DNE
  customerDne?: number | null;
  customerEmergencyDne?: number | null;
  vendorDne?: number | null;
  vendorEmergencyDne?: number | null;
  allowCustomerToEnterDneJobExclusive?: boolean | null;

  // Toggles / customer email settings
  sendAttachmentToVendorsMadeDuringRequest?: boolean | null;
  doNotUsePrimaryVendor?: boolean | null;
  toggleApproveVendorEstimate?: boolean | null;
  completeStatusUpdateMail?: boolean | null;
  techOnSiteMail?: boolean | null;
  returnScheduleStatusMail?: boolean | null;
  updateForeJobCreate?: boolean | null;
  updateForJobCreateByAdmin?: boolean | null;

  // Vendor ETA window
  vendorSetEtaForCustomDays: boolean;
  etaForCustomDays?: number | null;
  hoursForEmergencyJobForSettingEtaDate?: number | null;

  // Dynamic custom textboxes
  customTextboxLabel?: string | null;
  customTextboxText?: string | null;
  customTextboxLabel1?: string | null;
  customTextboxText1?: string | null;
  customTextboxLabel2?: string | null;
  customTextboxText2?: string | null;

  // Rich-text (CKEditor) fields
  notice?: string | null;
  jobPopup?: string | null;
  estimatePopup?: string | null;
  invoicePopup?: string | null;
  ivrInstruction?: string | null;
  autoTextForInvoice?: string | null;
  autoTextForEstimate?: string | null;
}

/** Result of a successful create (mirrors `CreatedCustomerDto`). */
export interface CreatedCustomer {
  customerKey: string;
  customerName: string;
}

/** Full customer profile for the edit page (mirrors `CustomerDetailDto`, RFI-345). */
export interface CustomerDetail {
  customerKey: string;
  // Basic
  customerName: string;
  address: string | null;
  nonUsaAddress: boolean;
  stateCode: number | null;
  cityKey: number | null;
  zip: string | null;
  companyPhone: string | null;
  companyEmail: string | null;
  website: string | null;
  accountManagerKey: string | null;
  netId: number | null;
  priviledgedForVendorBlast: boolean;
  hasLogo: boolean;
  logoName: string | null;
  // PO settings
  freeTextLabel: string | null;
  freeTextContent: string | null;
  showHideCustomerPo: boolean;
  mandatoryRcsPo: boolean;
  // Notifications
  allowCustomerToEnterDneJobExclusive: boolean | null;
  sendAttachmentToVendorsMadeDuringRequest: boolean | null;
  doNotUsePrimaryVendor: boolean | null;
  toggleApproveVendorEstimate: boolean | null;
  completeStatusUpdateMail: boolean | null;
  techOnSiteMail: boolean | null;
  returnScheduleStatusMail: boolean | null;
  updateForeJobCreate: boolean | null;
  updateForJobCreateByAdmin: boolean | null;
  // ETA window
  vendorSetEtaForCustomDays: boolean;
  etaForCustomDays: number | null;
  hoursForEmergencyJobForSettingEtaDate: number | null;
  // Notices
  notice: string | null;
  jobPopup: string | null;
  estimatePopup: string | null;
  invoicePopup: string | null;
  ivrInstruction: string | null;
  autoTextForInvoice: string | null;
  autoTextForEstimate: string | null;
  // Markup (Phase 2)
  materialMarkUp: number | null;
  laborAndTrip: number | null;
  adminMarkup: number | null;
  // Custom fields
  customTextboxLabel: string | null;
  customTextboxText: string | null;
  customTextboxLabel1: string | null;
  customTextboxText1: string | null;
  customTextboxLabel2: string | null;
  customTextboxText2: string | null;
  customFieldRequired: boolean;
  customFieldRequired1: boolean;
  customFieldRequired2: boolean;
  // Vendor-invoice file config
  file1Present: boolean;
  file1Required: boolean;
  file1Label: string | null;
  file2Present: boolean;
  file2Required: boolean;
  file2Label: string | null;
  file3Present: boolean;
  file3Required: boolean;
  file3Label: string | null;
  // Vendor-estimate file config
  est1Present: boolean;
  est1Required: boolean;
  est1Label: string | null;
  est2Present: boolean;
  est2Required: boolean;
  est2Label: string | null;
  est3Present: boolean;
  est3Required: boolean;
  est3Label: string | null;
  // Job types selected
  selectedJobTypeKeys: string[];
  // Phase 3 — messaging
  dashboardCheckIn: string | null;
  dashboardCheckOut: string | null;
  dashboardEtaExpired: string | null;
  dashboardEtaSet: string | null;
  dashboardAccounting: string | null;
  amNoteRelayEnabled: boolean;
  etaExpireInterval: number | null;
  etaExpireUnitId: number;
}

/** "Dashboard Messages" segment update. */
export interface UpdateDashboardMessages {
  checkIn: string | null;
  checkOut: string | null;
  etaExpired: string | null;
  etaSet: string | null;
  accounting: string | null;
}

/** "Account Manager Note Relay" segment update. */
export interface UpdateAmNoteRelay {
  enabled: boolean;
}

/** "Vendor ETA Expire" segment update (unitId: 1=Hour, 2=Minute). */
export interface UpdateEtaExpire {
  interval: number | null;
  unitId: number;
}

/** One customer contact (mirrors `CustomerContactRowDto`, RFI-345 Phase 4). */
export interface CustomerContactRow {
  contactKey: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  phoneExt: string | null;
  altPhone: string | null;
  altPhoneExt: string | null;
  fax: string | null;
  receivesInvoice: boolean;
  isDefault: boolean;
  isDeleted: boolean;
}

/** Create/update body for a customer contact. */
export interface SaveContact {
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  phoneExt: string | null;
  altPhone: string | null;
  altPhoneExt: string | null;
  fax: string | null;
  receivesInvoice: boolean;
  isDefault: boolean;
}

/** One customer note (mirrors `CustomerNoteRowDto`, RFI-345 Phase 4). */
export interface CustomerNoteRow {
  noteKey: string;
  title: string | null;
  comment: string | null;
  addedByName: string;
  addedOn: string | null;
  isDeleted: boolean;
}

/** Create/update body for a customer note (comment is rich text/HTML). */
export interface SaveNote {
  title: string;
  comment: string | null;
}

/** One job-history row (mirrors `JobHistoryRowDto`, RFI-345 Phase 4, read-only). */
export interface JobHistoryRow {
  jobKey: string;
  date: string | null;
  jobName: string | null;
  poNo: string | null;
  status: string | null;
}

/** One estimate row (mirrors `CustomerEstimateRowDto`, RFI-345 Phase 4, read-only). */
export interface CustomerEstimateRow {
  invoiceKey: string;
  invoiceNo: number | null;
  date: string | null;
  jobName: string | null;
  poNo: string | null;
  status: string | null;
}

/** One service-location row (mirrors `ServiceLocationRowDto`, read-only). */
export interface ServiceLocationRow {
  customerLkey: string;
  locationKey: string | null;
  businessName: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  contactName: string | null;
}

/** One attachment row (metadata; mirrors `CustomerAttachmentRowDto`). */
export interface CustomerAttachmentRow {
  attachementKey: string;
  filename: string | null;
  comment: string | null;
  docTypeName: string | null;
  addedByName: string;
  addedOn: string | null;
}

/** A document-type / trade / charge-type option (mirrors `DocumentTypeOptionDto`). */
export interface IdNameOption {
  id: string;
  name: string;
}

/** One trade-charge row (mirrors `CustomerTradeChargeRowDto`). */
export interface TradeChargeRow {
  pkey: string;
  tradeKey: string | null;
  tradeName: string | null;
  salesChargeTypeKey: string | null;
  chargeTypeName: string | null;
  amount: number | null;
  description: string | null;
  isActive: boolean;
}

/** Create/update body for a trade charge (mirrors `SaveTradeChargeDto`). */
export interface SaveTradeCharge {
  tradeKey: string | null;
  salesChargeTypeKey: string | null;
  amount: number | null;
  description: string | null;
  isActive: boolean;
}

/** Trade + charge-type dropdowns for the Rates segment. */
export interface TradeChargeOptions {
  trades: IdNameOption[];
  chargeTypes: IdNameOption[];
}

/** "Markup" segment update. */
export interface UpdateMarkup {
  materialMarkUp: number | null;
  laborAndTrip: number | null;
  adminMarkup: number | null;
}

/** "Custom Fields" segment update. */
export interface UpdateCustomFields {
  customTextboxLabel: string | null;
  customTextboxText: string | null;
  customFieldRequired: boolean;
  customTextboxLabel1: string | null;
  customTextboxText1: string | null;
  customFieldRequired1: boolean;
  customTextboxLabel2: string | null;
  customTextboxText2: string | null;
  customFieldRequired2: boolean;
}

/** "Vendor Invoice File Configuration" segment update. */
export interface UpdateVendorInvoiceConfig {
  file1Present: boolean;
  file1Required: boolean;
  file1Label: string | null;
  file2Present: boolean;
  file2Required: boolean;
  file2Label: string | null;
  file3Present: boolean;
  file3Required: boolean;
  file3Label: string | null;
}

/** "Vendor Estimate File Configuration" segment update. */
export interface UpdateVendorEstimateConfig {
  est1Present: boolean;
  est1Required: boolean;
  est1Label: string | null;
  est2Present: boolean;
  est2Required: boolean;
  est2Label: string | null;
  est3Present: boolean;
  est3Required: boolean;
  est3Label: string | null;
}

/** "Job Priority" segment update. */
export interface UpdateJobPriority {
  jobTypeKeys: string[];
}

/** Customer DNE values (mirrors `CustomerDneFieldsResponseDto` / update request). */
export interface CustomerDneFields {
  customerKey: string;
  customerDne: number;
  vendorDne: number;
  vendorEmergencyDne: number;
  emergencyCustomerDne: number;
}

/** One cost-over tier of the minimum-markup policy. */
export interface OverValueWithMarkup {
  costOverValue: number;
  markupPercentage: number;
}

/** Minimum-markup policy (mirrors `DynMinMarkupPolicyDto`). */
export interface MinMarkupPolicy {
  customerKey: string;
  markupPercentageForEmergency: number;
  markupPercentageForNonEmergency: number;
  overValuesWithMarkupPercentages: OverValueWithMarkup[];
}

/** "Basic Information" segment update (mirrors `UpdateCustomerBasicInfoDto`). */
export interface UpdateBasicInfo {
  customerName: string;
  address: string | null;
  nonUsaAddress: boolean;
  stateCode: number | null;
  cityKey: number | null;
  zip: string | null;
  companyPhone: string | null;
  companyEmail: string | null;
  website: string | null;
  accountManagerKey: string | null;
  netId: number | null;
  priviledgedForVendorBlast: boolean;
}

/** "Customer PO Settings" segment update. */
export interface UpdatePoSettings {
  freeTextLabel: string | null;
  freeTextContent: string | null;
  showHideCustomerPo: boolean;
  mandatoryRcsPo: boolean;
}

/** "Job & Email Notifications" segment update. */
export interface UpdateNotifications {
  allowCustomerToEnterDneJobExclusive: boolean | null;
  sendAttachmentToVendorsMadeDuringRequest: boolean | null;
  doNotUsePrimaryVendor: boolean | null;
  toggleApproveVendorEstimate: boolean | null;
  completeStatusUpdateMail: boolean | null;
  techOnSiteMail: boolean | null;
  returnScheduleStatusMail: boolean | null;
  updateForeJobCreate: boolean | null;
  updateForJobCreateByAdmin: boolean | null;
}

/** "Vendor ETA Window" segment update. */
export interface UpdateEtaWindow {
  vendorSetEtaForCustomDays: boolean;
  etaForCustomDays: number | null;
  hoursForEmergencyJobForSettingEtaDate: number | null;
}

/** "Notices & Auto-text" segment update. */
export interface UpdateNotices {
  notice: string | null;
  jobPopup: string | null;
  estimatePopup: string | null;
  invoicePopup: string | null;
  ivrInstruction: string | null;
  autoTextForInvoice: string | null;
  autoTextForEstimate: string | null;
}

interface Envelope<T> {
  status: boolean;
  data: T;
}

/**
 * Customer list API client — targets `api/CustomerProfile` (RFI-343).
 *
 * Replaces the legacy MgtCustomer Index / DIndex / AssignAccountManager /
 * AssignPriviledgeForAutoVendorWOBlast screens. Search / sort / paging are
 * server-side so the list stays fast over thousands of records. The
 * `authInterceptor` attaches the bearer token, so no auth handling is needed here.
 */
@Injectable({ providedIn: 'root' })
export class CustomerListService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/CustomerProfile`;

  /** GET /list — a page of customers matching the query. */
  list(query: CustomerListQuery): Observable<CustomerListResult> {
    let params = new HttpParams()
      .set('status', query.status)
      .set('page', String(query.page))
      .set('pageSize', String(query.pageSize));
    if (query.search?.trim()) params = params.set('search', query.search.trim());
    if (query.sortBy) params = params.set('sortBy', query.sortBy);
    if (query.sortDir) params = params.set('sortDir', query.sortDir);

    return this.http
      .get<Envelope<CustomerListResult>>(`${this.apiBase}/list`, { params })
      .pipe(map((r) => r.data));
  }

  /** GET /account-managers — options for the "assign account manager" dropdown. */
  getAccountManagers(): Observable<AccountManagerOption[]> {
    return this.http
      .get<Envelope<AccountManagerOption[]>>(`${this.apiBase}/account-managers`)
      .pipe(map((r) => r.data));
  }

  /** POST /assign-account-manager — assign one manager to many customers. */
  assignAccountManager(
    accountManagerKey: string,
    customerKeys: string[],
  ): Observable<BulkUpdateResult> {
    return this.http
      .post<Envelope<BulkUpdateResult>>(`${this.apiBase}/assign-account-manager`, {
        accountManagerKey,
        customerKeys,
      })
      .pipe(map((r) => r.data));
  }

  /** POST /broadcast — enable or disable vendor broadcast on many customers. */
  setBroadcast(customerKeys: string[], enabled: boolean): Observable<BulkUpdateResult> {
    return this.http
      .post<Envelope<BulkUpdateResult>>(`${this.apiBase}/broadcast`, { customerKeys, enabled })
      .pipe(map((r) => r.data));
  }

  /** POST /active — activate or deactivate (soft-delete toggle) many customers. */
  setActive(customerKeys: string[], active: boolean): Observable<BulkUpdateResult> {
    return this.http
      .post<Envelope<BulkUpdateResult>>(`${this.apiBase}/active`, { customerKeys, active })
      .pipe(map((r) => r.data));
  }

  /** GET /create-options — states + account managers for the create form. */
  getCreateOptions(): Observable<CreateCustomerOptions> {
    return this.http
      .get<Envelope<CreateCustomerOptions>>(`${this.apiBase}/create-options`)
      .pipe(map((r) => r.data));
  }

  /** GET /cities/{stateCode} — active cities for a state (create-form cascade). */
  getCities(stateCode: number): Observable<CityOption[]> {
    return this.http
      .get<Envelope<CityOption[]>>(`${this.apiBase}/cities/${stateCode}`)
      .pipe(map((r) => r.data));
  }

  /** POST / — create a customer; returns its new key. */
  createCustomer(dto: CreateCustomerRequest): Observable<CreatedCustomer> {
    return this.http
      .post<Envelope<CreatedCustomer>>(this.apiBase, dto)
      .pipe(map((r) => r.data));
  }

  /** POST /{customerKey}/logo — upload the customer's logo (multipart). */
  uploadLogo(customerKey: string, file: File): Observable<unknown> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post(`${this.apiBase}/${customerKey}/logo`, form);
  }

  // ── Edit Customer (RFI-345) ────────────────────────────────────────────────

  /** GET /{customerKey} — full profile for the edit page. */
  getCustomerDetail(customerKey: string): Observable<CustomerDetail> {
    return this.http
      .get<Envelope<CustomerDetail>>(`${this.apiBase}/${customerKey}`)
      .pipe(map((r) => r.data));
  }

  /** PUT /{customerKey}/basic-info — update the "Basic Information" segment. */
  updateBasicInfo(customerKey: string, dto: UpdateBasicInfo): Observable<unknown> {
    return this.http.put(`${this.apiBase}/${customerKey}/basic-info`, dto);
  }

  /** PUT /{customerKey}/po-settings — update the "Customer PO Settings" segment. */
  updatePoSettings(customerKey: string, dto: UpdatePoSettings): Observable<unknown> {
    return this.http.put(`${this.apiBase}/${customerKey}/po-settings`, dto);
  }

  /** PUT /{customerKey}/notifications — update the "Job & Email Notifications" segment. */
  updateNotifications(customerKey: string, dto: UpdateNotifications): Observable<unknown> {
    return this.http.put(`${this.apiBase}/${customerKey}/notifications`, dto);
  }

  /** PUT /{customerKey}/eta-window — update the "Vendor ETA Window" segment. */
  updateEtaWindow(customerKey: string, dto: UpdateEtaWindow): Observable<unknown> {
    return this.http.put(`${this.apiBase}/${customerKey}/eta-window`, dto);
  }

  /** PUT /{customerKey}/notices — update the "Notices & Auto-text" segment. */
  updateNotices(customerKey: string, dto: UpdateNotices): Observable<unknown> {
    return this.http.put(`${this.apiBase}/${customerKey}/notices`, dto);
  }

  // ── Edit Customer (RFI-345) Phase 2 — config segments ──────────────────────

  /** PUT /{customerKey}/markup — update the "Markup" segment. */
  updateMarkup(customerKey: string, dto: UpdateMarkup): Observable<unknown> {
    return this.http.put(`${this.apiBase}/${customerKey}/markup`, dto);
  }

  /** PUT /{customerKey}/custom-fields — update the "Custom Fields" segment. */
  updateCustomFields(customerKey: string, dto: UpdateCustomFields): Observable<unknown> {
    return this.http.put(`${this.apiBase}/${customerKey}/custom-fields`, dto);
  }

  /** PUT /{customerKey}/vendor-invoice-config — update the "Vendor Invoice File Config" segment. */
  updateVendorInvoiceConfig(customerKey: string, dto: UpdateVendorInvoiceConfig): Observable<unknown> {
    return this.http.put(`${this.apiBase}/${customerKey}/vendor-invoice-config`, dto);
  }

  /** PUT /{customerKey}/vendor-estimate-config — update the "Vendor Estimate File Config" segment. */
  updateVendorEstimateConfig(customerKey: string, dto: UpdateVendorEstimateConfig): Observable<unknown> {
    return this.http.put(`${this.apiBase}/${customerKey}/vendor-estimate-config`, dto);
  }

  /** PUT /{customerKey}/job-priority — reconcile the "Job Priority" segment. */
  updateJobPriority(customerKey: string, dto: UpdateJobPriority): Observable<unknown> {
    return this.http.put(`${this.apiBase}/${customerKey}/job-priority`, dto);
  }

  /** GET /dne/{customerKey} — the customer's DNE values (nulls returned as 0). */
  getCustomerDne(customerKey: string): Observable<CustomerDneFields> {
    return this.http
      .get<Envelope<CustomerDneFields>>(`${this.apiBase}/dne/${customerKey}`)
      .pipe(map((r) => r.data));
  }

  /** PUT /dne — update the customer's DNE values. */
  updateCustomerDne(dto: CustomerDneFields): Observable<unknown> {
    return this.http.put(`${this.apiBase}/dne`, dto);
  }

  /** GET api/DynMinMarkup/{customerKey} — the minimum-markup policy. */
  getMinMarkupPolicy(customerKey: string): Observable<MinMarkupPolicy> {
    return this.http
      .get<Envelope<MinMarkupPolicy>>(`${environment.apiBaseUrl}/api/DynMinMarkup/${customerKey}`)
      .pipe(map((r) => r.data));
  }

  /** PUT api/DynMinMarkup — save the minimum-markup policy. */
  saveMinMarkupPolicy(dto: MinMarkupPolicy): Observable<unknown> {
    return this.http.put(`${environment.apiBaseUrl}/api/DynMinMarkup`, dto);
  }

  // ── Edit Customer (RFI-345) Phase 3 — messaging segments ───────────────────

  /** PUT /{customerKey}/dashboard-messages — update the 5 dashboard messages. */
  updateDashboardMessages(customerKey: string, dto: UpdateDashboardMessages): Observable<unknown> {
    return this.http.put(`${this.apiBase}/${customerKey}/dashboard-messages`, dto);
  }

  /** PUT /{customerKey}/am-note-relay — update the AM-note-relay feature. */
  updateAmNoteRelay(customerKey: string, dto: UpdateAmNoteRelay): Observable<unknown> {
    return this.http.put(`${this.apiBase}/${customerKey}/am-note-relay`, dto);
  }

  /** PUT /{customerKey}/eta-expire — update the vendor ETA-expire interval. */
  updateEtaExpire(customerKey: string, dto: UpdateEtaExpire): Observable<unknown> {
    return this.http.put(`${this.apiBase}/${customerKey}/eta-expire`, dto);
  }

  // ── Edit Customer (RFI-345) Phase 4 — Contacts ─────────────────────────────

  /** GET /{customerKey}/contacts — the customer's contacts. */
  getContacts(customerKey: string): Observable<CustomerContactRow[]> {
    return this.http
      .get<Envelope<CustomerContactRow[]>>(`${this.apiBase}/${customerKey}/contacts`)
      .pipe(map((r) => r.data));
  }

  /** POST /{customerKey}/contacts — create a contact. */
  createContact(customerKey: string, dto: SaveContact): Observable<CustomerContactRow> {
    return this.http
      .post<Envelope<CustomerContactRow>>(`${this.apiBase}/${customerKey}/contacts`, dto)
      .pipe(map((r) => r.data));
  }

  /** PUT /{customerKey}/contacts/{contactKey} — update a contact. */
  updateContact(customerKey: string, contactKey: string, dto: SaveContact): Observable<unknown> {
    return this.http.put(`${this.apiBase}/${customerKey}/contacts/${contactKey}`, dto);
  }

  /** POST /{customerKey}/contacts/{contactKey}/active — activate/deactivate a contact. */
  setContactActive(customerKey: string, contactKey: string, active: boolean): Observable<unknown> {
    return this.http.post(`${this.apiBase}/${customerKey}/contacts/${contactKey}/active`, { active });
  }

  /** POST /{customerKey}/contacts/{contactKey}/default — mark a contact the default. */
  setContactDefault(customerKey: string, contactKey: string): Observable<unknown> {
    return this.http.post(`${this.apiBase}/${customerKey}/contacts/${contactKey}/default`, {});
  }

  // ── Edit Customer (RFI-345) Phase 4 — Notes ────────────────────────────────

  /** GET /{customerKey}/notes — the customer's notes. */
  getNotes(customerKey: string): Observable<CustomerNoteRow[]> {
    return this.http
      .get<Envelope<CustomerNoteRow[]>>(`${this.apiBase}/${customerKey}/notes`)
      .pipe(map((r) => r.data));
  }

  /** POST /{customerKey}/notes — create a note. */
  createNote(customerKey: string, dto: SaveNote): Observable<CustomerNoteRow> {
    return this.http
      .post<Envelope<CustomerNoteRow>>(`${this.apiBase}/${customerKey}/notes`, dto)
      .pipe(map((r) => r.data));
  }

  /** PUT /{customerKey}/notes/{noteKey} — update a note. */
  updateNote(customerKey: string, noteKey: string, dto: SaveNote): Observable<unknown> {
    return this.http.put(`${this.apiBase}/${customerKey}/notes/${noteKey}`, dto);
  }

  /** POST /{customerKey}/notes/{noteKey}/active — activate/deactivate a note. */
  setNoteActive(customerKey: string, noteKey: string, active: boolean): Observable<unknown> {
    return this.http.post(`${this.apiBase}/${customerKey}/notes/${noteKey}/active`, { active });
  }

  /** GET /{customerKey}/job-history — the customer's jobs (read-only). */
  getJobHistory(customerKey: string): Observable<JobHistoryRow[]> {
    return this.http
      .get<Envelope<JobHistoryRow[]>>(`${this.apiBase}/${customerKey}/job-history`)
      .pipe(map((r) => r.data));
  }

  /** GET /{customerKey}/estimates — the customer's estimates (read-only). */
  getEstimates(customerKey: string): Observable<CustomerEstimateRow[]> {
    return this.http
      .get<Envelope<CustomerEstimateRow[]>>(`${this.apiBase}/${customerKey}/estimates`)
      .pipe(map((r) => r.data));
  }

  /** GET /{customerKey}/service-locations — the customer's service locations (read-only). */
  getServiceLocations(customerKey: string): Observable<ServiceLocationRow[]> {
    return this.http
      .get<Envelope<ServiceLocationRow[]>>(`${this.apiBase}/${customerKey}/service-locations`)
      .pipe(map((r) => r.data));
  }

  // ── Files & Attachments ────────────────────────────────────────────────────

  /** GET /{customerKey}/attachments — the customer's attachments (metadata). */
  getAttachments(customerKey: string): Observable<CustomerAttachmentRow[]> {
    return this.http
      .get<Envelope<CustomerAttachmentRow[]>>(`${this.apiBase}/${customerKey}/attachments`)
      .pipe(map((r) => r.data));
  }

  /** GET /attachment-doc-types — document types for the upload dropdown. */
  getAttachmentDocTypes(): Observable<IdNameOption[]> {
    return this.http
      .get<Envelope<IdNameOption[]>>(`${this.apiBase}/attachment-doc-types`)
      .pipe(map((r) => r.data));
  }

  /** POST /{customerKey}/attachments — upload an attachment (multipart). */
  uploadAttachment(customerKey: string, file: File, comment: string | null, docTypeKey: string | null): Observable<CustomerAttachmentRow> {
    const form = new FormData();
    form.append('file', file, file.name);
    if (comment) form.append('comment', comment);
    if (docTypeKey) form.append('docTypeKey', docTypeKey);
    return this.http
      .post<Envelope<CustomerAttachmentRow>>(`${this.apiBase}/${customerKey}/attachments`, form)
      .pipe(map((r) => r.data));
  }

  /** GET /{customerKey}/attachments/{attKey}/file — the attachment bytes (auth'd blob). */
  getAttachmentBlob(customerKey: string, attKey: string): Observable<Blob> {
    return this.http.get(`${this.apiBase}/${customerKey}/attachments/${attKey}/file`, { responseType: 'blob' });
  }

  /** POST /{customerKey}/attachments/{attKey}/delete — soft-delete an attachment. */
  deleteAttachment(customerKey: string, attKey: string): Observable<unknown> {
    return this.http.post(`${this.apiBase}/${customerKey}/attachments/${attKey}/delete`, {});
  }

  // ── Rates / Trade charges ──────────────────────────────────────────────────

  /** GET /{customerKey}/trade-charges — the customer's trade charges. */
  getTradeCharges(customerKey: string): Observable<TradeChargeRow[]> {
    return this.http
      .get<Envelope<TradeChargeRow[]>>(`${this.apiBase}/${customerKey}/trade-charges`)
      .pipe(map((r) => r.data));
  }

  /** GET /trade-charge-options — trade + charge-type dropdowns. */
  getTradeChargeOptions(): Observable<TradeChargeOptions> {
    return this.http
      .get<Envelope<TradeChargeOptions>>(`${this.apiBase}/trade-charge-options`)
      .pipe(map((r) => r.data));
  }

  /** POST /{customerKey}/trade-charges — create a trade charge. */
  createTradeCharge(customerKey: string, dto: SaveTradeCharge): Observable<TradeChargeRow> {
    return this.http
      .post<Envelope<TradeChargeRow>>(`${this.apiBase}/${customerKey}/trade-charges`, dto)
      .pipe(map((r) => r.data));
  }

  /** PUT /{customerKey}/trade-charges/{pkey} — update a trade charge. */
  updateTradeCharge(customerKey: string, pkey: string, dto: SaveTradeCharge): Observable<unknown> {
    return this.http.put(`${this.apiBase}/${customerKey}/trade-charges/${pkey}`, dto);
  }

  /** POST /{customerKey}/trade-charges/{pkey}/active — activate/deactivate a trade charge. */
  setTradeChargeActive(customerKey: string, pkey: string, active: boolean): Observable<unknown> {
    return this.http.post(`${this.apiBase}/${customerKey}/trade-charges/${pkey}/active`, { active });
  }
}
