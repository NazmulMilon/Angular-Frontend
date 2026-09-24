import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { QuickJobService } from '../../services/quick-job.service';
import {
  CreateQuickJobRequest,
  OptionGuidValueDto,
  QuickJobTempFileDto,
  QuickJobVendorAction,
} from '../../models/quick-job.model';
import {
  CustomerLocationOptionDto,
  CustomerRequestorOption,
  IntDropdownOption,
} from '../../models/assign-vendor.model';
import { AssignVendorService } from '../../services/assign-vendor.service';
import { LocationService } from '../../services/location.service';
import { CreateLocationRequest, LocationStoreHourRequest } from '../../models/location.model';

/** One row of the "Add service location" store-hours grid. `closed` is UI-only — the API has no
 *  closed flag, closed days are just sent with null `fromTime`/`toTime`. */
interface StoreHourRow {
  dayOfTheWeek: number;
  dayInText: string;
  fromTime: string;
  toTime: string;
  closed: boolean;
}

const DEFAULT_STORE_HOURS: StoreHourRow[] = [
  { dayOfTheWeek: 0, dayInText: 'Sunday', fromTime: '', toTime: '', closed: true },
  { dayOfTheWeek: 1, dayInText: 'Monday', fromTime: '09:00', toTime: '17:00', closed: false },
  { dayOfTheWeek: 2, dayInText: 'Tuesday', fromTime: '09:00', toTime: '17:00', closed: false },
  { dayOfTheWeek: 3, dayInText: 'Wednesday', fromTime: '09:00', toTime: '17:00', closed: false },
  { dayOfTheWeek: 4, dayInText: 'Thursday', fromTime: '09:00', toTime: '17:00', closed: false },
  { dayOfTheWeek: 5, dayInText: 'Friday', fromTime: '09:00', toTime: '17:00', closed: false },
  { dayOfTheWeek: 6, dayInText: 'Saturday', fromTime: '', toTime: '', closed: true },
];

/**
 * Add Job — pop-open modal for job creation, triggered from the app header (see `App.openAddJob()`).
 *
 * Loads dropdowns + defaults from `GET /quick-job/form-data` once on creation (not re-fetched on
 * each `open()`), cascades locations from the selected customer, and on save POSTs a
 * {@link CreateQuickJobRequest}. `open()` resets all entered field values so the modal starts
 * fresh each time, even though the component instance is reused across opens.
 *
 * Customer, Contact, and Location all cascade off the selected customer and are required.
 * "Contact" is labeled for the admin but is actually the Customer Requestor cascade
 * (`GET /customers/{key}/requestors`), widened once a location is picked; the selection is sent
 * as both `customerRequestorKey` and `customerContactKey` (the latter is required server-side).
 *
 * Vendor assignment is intentionally NOT available here — a quick job is always created without
 * a vendor (`VendorAction.SaveOnly`); vendor search, DNE, and dispatch all happen afterward on
 * the Assign Vendor tab, which "Save and Route to Assign Vendor" navigates to directly using the
 * response's `jobKey` (not the backend's `redirect` field — see {@link saveAndRoute}).
 *
 * "Job type" is the same GUID-keyed dropdown previously labeled "Priority" (still sourced from
 * `d.priorities` and still sent as `jobTypeKey`) — only the UI label changed. Confirm with backend
 * whether that option list should actually be replaced with a distinct job-type taxonomy
 * (Standard service / Bid request / Project / PM / Recall) independent of urgency.
 *
 * "Vendor ETA window" mirrors legacy V1's `ReminderEmailTimeDef` Pkey 1/8 default lookup
 * (`MgtJobController.GetTheVendoeETAsetLimitDefaultforSystem`): on job-type change it calls
 * `GET vendor-eta-default` ({@link QuickJobService.getVendorEtaDefault}, backed by
 * `RFIJobOps.Services.QuickJobService.GetVendorEtaDefault`) to get the default days/hours, and
 * sends whatever value is showing (default or admin-overridden) as `vendorEtaLimit` on save. The
 * backend derives days-vs-hours itself from `jobTypeKey` against `emergencyJobTypeKey` — no
 * separate unit flag is sent. If the lookup call itself fails (network/server error, not just "no
 * match"), falls back to a hardcoded default (7 days, or 6 hours for the Emergency job type).
 *
 * "Add service location" (the location dropdown's "+" button) POSTs to
 * `LocationController.CreateLocation` ({@link LocationService.createLocation}) — `customerKey`
 * and `ccontactKey` are taken from this form's already-selected Customer/Contact (opening the
 * modal requires both to be set first), and it requires exactly 7 store-hours rows
 * (Sunday–Saturday); the UI's per-row "Closed" checkbox is purely local — it just sends null
 * `fromTime`/`toTime` for that day, since the API has no separate closed flag. State/city options
 * are NOT fetched from the Location API (it has no lookup endpoint) — reused from
 * {@link AssignVendorService.getStateDropdown}/`.getCityDropdown`, the same cascade used
 * elsewhere in the app. Zone assignment and thumbnail/banner image staging are out of scope here
 * (no UI for either).
 *
 * Internal Documents are staged server-side as they're added via the `/quick-job/temp-files`
 * endpoints (keyed per logged-in admin), and promoted to real JobFile rows when the job is
 * created. Because staging persists per-admin across modal opens, `open()` loads any already-
 * staged files and `close()` (Cancel/backdrop/Escape) deletes them, so strays don't silently
 * promote to the next job. The per-file document type is fixed at upload from the "Document type"
 * dropdown (sourced from form-data's admin-configurable `documentTypes`); there is no update-type
 * endpoint, so changing a file's type means removing and re-adding it. Known legacy gaps not
 * replicated here (flagged by backend): image resize/re-encode and the Location Attachment
 * special-case row.
 */
@Component({
  selector: 'app-add-job',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './add-job.component.html',
  styleUrl: './add-job.component.scss',
})
export class AddJobComponent implements OnInit {
  private readonly quickJob = inject(QuickJobService);
  private readonly assignVendor = inject(AssignVendorService);
  private readonly locationSvc = inject(LocationService);
  private readonly router = inject(Router);

  readonly isVisible = signal(false);

  // ---- Loaded form data ----
  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly customerOptions = signal<OptionGuidValueDto[]>([]);
  readonly tradeOptions = signal<OptionGuidValueDto[]>([]);
  /** UI label is "Job type"; backed by the same `d.priorities` list as before (sent as jobTypeKey). */
  readonly jobTypeOptions = signal<OptionGuidValueDto[]>([]);
  readonly accountManagerOptions = signal<OptionGuidValueDto[]>([]);
  private defaultTeamKey = '';
  private emergencyJobTypeKey = '';
  readonly nextPoPreview = signal('');

  // ---- Customer section (values are GUID keys) ----
  readonly customer = signal('');
  readonly location = signal('');
  readonly locationOptions = signal<CustomerLocationOptionDto[]>([]);
  readonly locationsLoading = signal(false);

  // ---- Add service location modal ----
  readonly locationModalOpen = signal(false);
  readonly locationSaving = signal(false);
  readonly mlName = signal('');
  readonly mlNonUsa = signal(false);
  readonly mlAddress = signal('');
  readonly mlAddress2 = signal('');
  readonly mlStateOptions = signal<IntDropdownOption[]>([]);
  readonly mlCityOptions = signal<IntDropdownOption[]>([]);
  readonly mlCityLoading = signal(false);
  /** `''` renders as the placeholder option; real values are numeric StateList/CityList Pkeys. */
  readonly mlStateKey = signal<number | ''>('');
  readonly mlCityKey = signal<number | ''>('');
  readonly mlZip = signal('');
  readonly mlEmail = signal('');
  readonly mlPhone = signal('');
  readonly mlStoreHours = signal<StoreHourRow[]>(DEFAULT_STORE_HOURS);
  /**
   * Labeled "Contact" in the UI, but backed by the Customer Requestor cascade
   * (`GET /customers/{key}/requestors`) rather than the legacy customer-contact list. Sent as
   * both `customerRequestorKey` and `customerContactKey` — the latter is `[Required]`
   * server-side and there's no other required-contact source in this form.
   */
  readonly contact = signal('');
  readonly contactOptions = signal<CustomerRequestorOption[]>([]);
  readonly contactsLoading = signal(false);

  // ---- Job details ----
  readonly jobName = signal('');
  readonly trade = signal('');
  /** Selected job type = JobType GUID (sent as jobTypeKey). */
  readonly jobType = signal('');
  readonly accountManager = signal('');
  readonly description = signal('');

  // ---- Vendor ETA window (default sourced from GET vendor-eta-default) ----
  private readonly etaFallbackDays = 7;
  private readonly etaFallbackHours = 6;
  readonly eta = signal(this.etaFallbackDays);
  readonly etaUnitKind = signal<'days' | 'hours'>('days');
  readonly etaUnit = computed(() => {
    const singular = this.etaUnitKind() === 'hours' ? 'hour' : 'day';
    return this.eta() === 1 ? singular : this.etaUnitKind();
  });
  readonly etaSource = signal<'Default' | 'Custom'>('Default');
  readonly etaLoading = signal(false);

  // ---- Documents (internal) — server-backed staging via /quick-job/temp-files ----
  /** Admin-configurable document types (GUID keys); empty if the API doesn't supply the field. */
  readonly documentTypeOptions = signal<OptionGuidValueDto[]>([]);
  /** Selected document type (GUID key) applied to files as they're staged; '' = no type chosen. */
  readonly docType = signal('');
  /** Files currently staged server-side for this admin (authoritative — re-fetched after mutations). */
  readonly stagedFiles = signal<QuickJobTempFileDto[]>([]);
  /** True while a POST /temp-files is in flight — blocks Save so a job can't be created mid-upload. */
  readonly uploading = signal(false);

  // ---- Validation / status ----
  readonly invalid = signal<Record<string, boolean>>({});
  readonly statusText = signal('Complete the required fields (*) to save this job.');
  readonly saving = signal(false);

  // ---- Toast ----
  readonly toastMsg = signal('');
  readonly toastKind = signal<'' | 'ok' | 'err'>('');
  readonly toastShow = signal(false);
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  /** Opens the modal and resets every entered field — the component instance is reused across opens. */
  open(): void {
    this.isVisible.set(true);
    this.customer.set('');
    this.contact.set('');
    this.contactOptions.set([]);
    this.location.set('');
    this.locationOptions.set([]);
    this.jobName.set('');
    this.trade.set('');
    this.jobType.set('');
    this.accountManager.set('');
    this.description.set('');
    this.eta.set(this.etaFallbackDays);
    this.etaUnitKind.set('days');
    this.etaSource.set('Default');
    this.docType.set('');
    this.stagedFiles.set([]);
    this.uploading.set(false);
    this.invalid.set({});
    this.statusText.set('Complete the required fields (*) to save this job.');
    this.saving.set(false);
    this.closeLocationModal();
    // Temp-files persist per-admin across opens; load any already-staged files so strays are
    // visible and removable (they would otherwise promote silently to whatever job is created next).
    this.refreshStagedFiles();
  }

  /**
   * Closes the modal. Used by Cancel, backdrop click, Escape, and after a successful save.
   * Deletes any files still staged server-side to leave a clean slate — without this, files
   * staged then cancelled would silently promote to the next job created by this admin.
   */
  close(): void {
    this.isVisible.set(false);
    this.deleteAllStagedFiles();
  }

  /** Fire-and-forget DELETE of every currently-staged file; clears the local list immediately. */
  private deleteAllStagedFiles(): void {
    const staged = this.stagedFiles();
    this.stagedFiles.set([]);
    for (const f of staged) {
      this.quickJob.deleteTempFile(f.fileKey).subscribe();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (!this.isVisible()) return;
    if (this.locationModalOpen()) {
      this.closeLocationModal();
    } else {
      this.close();
    }
  }

  ngOnInit(): void {
    this.quickJob.getFormData().subscribe((res) => {
      this.loading.set(false);
      if (!res.status || !res.data) {
        this.loadError.set(res.message || 'Failed to load form data.');
        return;
      }
      const d = res.data;
      this.customerOptions.set(d.customers ?? []);
      this.tradeOptions.set(d.trades ?? []);
      this.jobTypeOptions.set(d.priorities ?? []);
      this.accountManagerOptions.set(d.accountManagers ?? []);
      this.documentTypeOptions.set(d.documentTypes ?? []);
      this.defaultTeamKey = d.defaultTeamKey;
      this.emergencyJobTypeKey = d.constants?.emergencyJobTypeKey ?? '';
      this.nextPoPreview.set(d.nextPoPreview ?? '');
    });
  }

  // ---- Event handlers ----
  onCustomerChange(): void {
    this.location.set('');
    this.locationOptions.set([]);
    this.contact.set('');
    this.contactOptions.set([]);
    this.clearInvalid('customer');
    const customerKey = this.customer();
    if (!customerKey) return;
    this.locationsLoading.set(true);
    this.quickJob.getCustomerLocations(customerKey).subscribe((res) => {
      this.locationsLoading.set(false);
      this.locationOptions.set(res.status && res.data ? res.data : []);
    });
    this.loadRequestors(customerKey, null);

    this.quickJob.getCustomerDetail(customerKey).subscribe((res) => {
      if (!res.status || !res.data) return;

      const amKey = res.data.accountManagerKey ?? '';
      const match = this.accountManagerOptions().find((o) => o.value === amKey);

      this.accountManager.set(amKey);
      this.description.set(res.data.specialInstruction ?? '');
    });
  }

  onContactChange(): void {
    this.clearInvalid('contact');
  }

  /** Re-fetches Customer Requestor options once a location is picked, widening the pool. */
  private loadRequestors(customerKey: string, locationKey: string | null): void {
    this.contactsLoading.set(true);
    this.quickJob.getCustomerRequestors(customerKey, locationKey).subscribe((res) => {
      this.contactsLoading.set(false);
      this.contactOptions.set(res.status && res.data ? res.data : []);
    });
  }

  onJobTypeChange(): void {
    this.clearInvalid('jobType');
    const jobTypeKey = this.jobType();
    if (!jobTypeKey) {
      this.eta.set(this.etaFallbackDays);
      this.etaUnitKind.set('days');
      this.etaSource.set('Default');
      return;
    }
    this.etaLoading.set(true);
    this.quickJob.getVendorEtaDefault(jobTypeKey).subscribe((res) => {
      this.etaLoading.set(false);
      if (!res.status || !res.data) {
        // Request failed (network/server error) — fall back to a hardcoded default rather than
        // surfacing an error for a non-critical prefill.
        const isEmergency = jobTypeKey === this.emergencyJobTypeKey;
        this.eta.set(isEmergency ? this.etaFallbackHours : this.etaFallbackDays);
        this.etaUnitKind.set(isEmergency ? 'hours' : 'days');
        this.etaSource.set('Default');
        return;
      }
      this.eta.set(res.data.timeLimit);
      this.etaUnitKind.set(res.data.isHourIsDay ? 'hours' : 'days');
      this.etaSource.set('Default');
    });
  }

  onEtaInput(): void {
    this.etaSource.set('Custom');
  }

  // ---- Documents (server-backed staging) ----

  /** Stages dropped/selected files via POST /temp-files, then re-fetches the authoritative list. */
  onDocFiles(files: FileList | null): void {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    // Empty string = no type chosen; backend falls back to a generic "Attachment" type.
    const typeKey = this.docType();
    const typeKeys = list.map(() => typeKey);

    this.uploading.set(true);
    this.quickJob.stageTempFiles(list, typeKeys).subscribe((res) => {
      this.uploading.set(false);
      if (!res.status) {
        this.showToast(res.message || 'Failed to upload the file(s).', 'err');
        // Re-fetch so the table reflects reality (e.g. a partial multi-file upload).
        this.refreshStagedFiles();
        return;
      }
      this.showToast(
        list.length + (list.length === 1 ? ' document uploaded' : ' documents uploaded'),
        'ok'
      );
      this.refreshStagedFiles();
    });
  }

  /** Removes one staged file via DELETE /temp-files/{fileKey}, then re-fetches the list. */
  removeDoc(fileKey: string): void {
    this.quickJob.deleteTempFile(fileKey).subscribe((res) => {
      if (!res.status) {
        this.showToast(res.message || 'Failed to remove the file.', 'err');
      }
      this.refreshStagedFiles();
    });
  }

  /** GET /temp-files → authoritative staged-file list. */
  private refreshStagedFiles(): void {
    this.quickJob.getTempFiles().subscribe((res) => {
      this.stagedFiles.set(res.status && res.data ? res.data : []);
    });
  }

  /**
   * Display label for a staged file's document type — `documentTypeName` isn't server-populated,
   * so resolve it client-side against the loaded types. Falls back to "Attachment" when no type
   * key is set (matching the backend default).
   */
  docTypeLabel(file: QuickJobTempFileDto): string {
    if (!file.documentTypeKey) return 'Attachment';
    const match = this.documentTypeOptions().find((o) => o.value === file.documentTypeKey);
    return match?.text || 'Attachment';
  }

  // ---- Save / Cancel ----

  /** "Save and Close" — saves and closes the modal without navigating anywhere. */
  saveAndClose(): void {
    this.submit(false);
  }

  /**
   * "Save and Route to Assign Vendor" — saves, closes the modal, then always navigates to
   * `/job/{jobKey}/assign-vendor` built directly from the response's `jobKey`. Deliberately
   * ignores the backend's `redirect` field entirely (no other redirect type is handled by this
   * quick-job screen today, so there's nothing meaningful to defer to there).
   */
  saveAndRoute(): void {
    this.submit(true);
  }

  private submit(routeToAssignVendor: boolean): void {
    const bad: Record<string, boolean> = {
      customer: !this.customer(),
      contact: !this.contact(),
      location: !this.location(),
      trade: !this.trade(),
      jobType: !this.jobType(),
    };
    this.invalid.set(bad);
    if (bad['customer'] || bad['contact'] || bad['location'] || bad['trade'] || bad['jobType']) {
      this.showToast('Complete the required fields before saving', 'err');
      this.statusText.set('Some required fields are missing.');
      return;
    }

    // Vendor assignment (DNE, vendor pick, dispatch) is not part of Quick Job — a job is always
    // created without a vendor and assigned afterward on the Assign Vendor tab.
    const request: CreateQuickJobRequest = {
      customerKey: this.customer(),
      locationKey: this.location(),
      // "Contact" in the UI is the Customer Requestor cascade; send it as both fields —
      // customerContactKey is [Required] server-side and has no other source in this form.
      customerContactKey: this.contact(),
      customerRequestorKey: this.contact(),
      jobName: this.jobName().trim() || null,
      jobTypeKey: this.jobType(),
      tradeKey: this.trade(),
      accountManagerKey: this.accountManager() || null,
      toTeamKey: this.defaultTeamKey || null,
      description: this.description().trim() || null,
      customerDne: null,
      vendorDne: null,
      po: null,
      vendorEtaLimit: this.eta(),
      vendorAction: QuickJobVendorAction.SaveOnly,
      duplicateLocationKeys: [],
      primaryVendorOption: 0,
      dismissedPrimaryVendorWarning: false,
    };

    this.saving.set(true);
    this.statusText.set('Saving…');
    this.quickJob.createQuickJob(request).subscribe((res) => {
      this.saving.set(false);
      if (!res.status || !res.data?.success) {
        this.showToast(res.message || 'Failed to create the job.', 'err');
        this.statusText.set(res.message || 'Save failed.');
        return;
      }
      this.showToast(res.data.message || 'Job created.', 'ok');
      const jobKey = res.data.jobKey;
      // Job creation already promoted the staged temp-files to real JobFile rows — clear the local
      // list and hide WITHOUT the close()-path DELETE, which would target now-promoted files.
      this.stagedFiles.set([]);
      this.isVisible.set(false);
      if (routeToAssignVendor && jobKey) {
        this.router.navigateByUrl(`/job/${jobKey}/assign-vendor`).then((ok) => {
          if (!ok) {
            console.error('[AddJob] navigateByUrl rejected the assign-vendor URL for job:', jobKey);
          }
        });
      }
    });
  }

  private clearInvalid(key: string): void {
    if (this.invalid()[key]) {
      this.invalid.set({ ...this.invalid(), [key]: false });
    }
  }

  onLocationChange(): void {
    this.clearInvalid('location');
    const customerKey = this.customer();
    if (customerKey) this.loadRequestors(customerKey, this.location() || null);
  }
  onTradeChange(): void {
    this.clearInvalid('trade');
  }
  onRemarksInput(): void {
    this.clearInvalid('reason');
  }

  // ---- Add service location modal ----
  openLocationModal(): void {
    if (!this.customer()) {
      this.showToast('Select a customer before adding a location', 'err');
      return;
    }
    if (!this.contact()) {
      this.showToast('Select a contact before adding a location', 'err');
      return;
    }
    if (this.mlStateOptions().length === 0) {
      this.assignVendor.getStateDropdown().subscribe((states) => this.mlStateOptions.set(states));
    }
    this.locationModalOpen.set(true);
  }

  closeLocationModal(): void {
    this.locationModalOpen.set(false);
    this.mlName.set('');
    this.mlNonUsa.set(false);
    this.mlAddress.set('');
    this.mlAddress2.set('');
    this.mlStateKey.set('');
    this.mlCityKey.set('');
    this.mlCityOptions.set([]);
    this.mlZip.set('');
    this.mlEmail.set('');
    this.mlPhone.set('');
    this.mlStoreHours.set(DEFAULT_STORE_HOURS);
  }

  onMlStateChange(): void {
    this.mlCityKey.set('');
    this.mlCityOptions.set([]);
    const stateKey = this.mlStateKey();
    if (stateKey === '') return;
    this.mlCityLoading.set(true);
    this.assignVendor.getCityDropdown(stateKey).subscribe((cities) => {
      this.mlCityLoading.set(false);
      this.mlCityOptions.set(cities);
    });
  }

  onMlStoreHourClosedChange(index: number, closed: boolean): void {
    const rows = this.mlStoreHours().map((row, i) =>
      i === index ? { ...row, closed, fromTime: closed ? '' : row.fromTime, toTime: closed ? '' : row.toTime } : row
    );
    this.mlStoreHours.set(rows);
  }

  onMlStoreHourTimeChange(index: number, field: 'fromTime' | 'toTime', value: string): void {
    const rows = this.mlStoreHours().map((row, i) => (i === index ? { ...row, [field]: value } : row));
    this.mlStoreHours.set(rows);
  }

  /** POSTs to `LocationController.CreateLocation`, then adds the created location to the dropdown and selects it. */
  saveLocationModal(): void {
    const stateKey = this.mlStateKey();
    const cityKey = this.mlCityKey();
    if (!this.mlName().trim() || !this.mlAddress().trim() || stateKey === '' || cityKey === '') {
      this.showToast('Fill in the required location fields before saving', 'err');
      return;
    }

    const mlStoreHours = this.mlStoreHours();
    const storeHoursUnchanged = mlStoreHours.every((row, i) => {
      const def = DEFAULT_STORE_HOURS[i];
      return row.closed === def.closed && row.fromTime === def.fromTime && row.toTime === def.toTime;
    });
    const storeHours: LocationStoreHourRequest[] = storeHoursUnchanged
      ? []
      : mlStoreHours.map((row) => ({
          dayOfTheWeek: row.dayOfTheWeek,
          dayInText: row.dayInText,
          fromTime: row.closed ? null : row.fromTime || null,
          toTime: row.closed ? null : row.toTime || null,
        }));

    const request: CreateLocationRequest = {
      lname: this.mlName().trim(),
      address: this.mlAddress().trim(),
      secondaryAddress: this.mlAddress2().trim() || null,
      email: this.mlEmail().trim() || null,
      phone: this.mlPhone().trim() || null,
      specialInstruction: null,
      cityKey,
      stateCode: stateKey,
      zipcode: this.mlZip().trim() || null,
      nonUsaaddress: this.mlNonUsa(),
      customerKey: this.customer(),
      ccontactKey: this.contact(),
      zoneId: null,
      storeHours,
      thumbnailFileKey: null,
      bannerFileKey: null,
    };

    this.locationSaving.set(true);
    this.locationSvc.createLocation(request).subscribe((res) => {
      this.locationSaving.set(false);
      if (!res.status || !res.data) {
        this.showToast(res.message || 'Failed to create the location.', 'err');
        return;
      }
      const created = res.data;
      this.locationOptions.set([
        ...this.locationOptions(),
        { locationKey: created.locationKey, lname: created.lname, address: created.address },
      ]);
      this.location.set(created.locationKey);
      this.onLocationChange();
      this.closeLocationModal();
      this.showToast('Location created and selected', 'ok');
    });
  }

  private showToast(msg: string, kind: '' | 'ok' | 'err'): void {
    this.toastMsg.set(msg);
    this.toastKind.set(kind);
    this.toastShow.set(true);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastShow.set(false), 2600);
  }
}
