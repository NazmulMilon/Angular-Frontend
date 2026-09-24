import { Component, OnInit, computed, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';

import { AccordionComponent } from '../../../shared/components/accordion/accordion.component';
import { ButtonComponent } from '../../../shared/components/button/button.component';
import { CustomerContactsComponent } from '../customer-contacts/customer-contacts.component';
import { CustomerFilesComponent } from '../customer-files/customer-files.component';
import { CustomerNotesComponent } from '../customer-notes/customer-notes.component';
import { CustomerRatesComponent } from '../customer-rates/customer-rates.component';
import { RichTextEditorComponent } from '../../../shared/components/rich-text-editor/rich-text-editor.component';
import {
  SearchableSelectComponent,
  SearchableSelectOption,
} from '../../../shared/components/searchable-select/searchable-select.component';
import { CustomerListService } from '../../../services/customer-list.service';

// Free-text formats the backend stores as-is, so the client is the only guard.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_ALLOWED_RE = /^[+\d\s().-]+$/;
const WEBSITE_RE = /^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(\/\S*)?$/i;
const US_ZIP_RE = /^\d{5}(-\d{4})?$/;

function optionalPattern(re: RegExp, key: string): ValidatorFn {
  return (c: AbstractControl): ValidationErrors | null => {
    const v = (c.value ?? '').toString().trim();
    return !v || re.test(v) ? null : { [key]: true };
  };
}
function optionalPhone(): ValidatorFn {
  return (c: AbstractControl): ValidationErrors | null => {
    const v = (c.value ?? '').toString().trim();
    if (!v) return null;
    const digits = v.replace(/\D/g, '').length;
    return PHONE_ALLOWED_RE.test(v) && digits >= 7 && digits <= 15 ? null : { phone: true };
  };
}
function selectionRequired(c: AbstractControl): ValidationErrors | null {
  return c.value === null || c.value === undefined ? { required: true } : null;
}

/** Per-segment save/success/error state (each panel saves independently). */
interface SegmentStatus {
  saving: ReturnType<typeof signal<boolean>>;
  saved: ReturnType<typeof signal<boolean>>;
  error: ReturnType<typeof signal<string | null>>;
}

/**
 * Edit Customer (RFI-345, epic RFI-342) — port of legacy MgtCustomer/EditCustomer.
 *
 * Per the ticket, similar information is grouped into segments and EACH segment
 * has its own Update button (no single save-all). This is Phase 1: the main
 * profile split into five independently-saved accordion panels — Basic
 * Information, Customer PO Settings, Job & Email Notifications, Vendor ETA
 * Window, and Notices & Auto-text. Later phases add the remaining General-page
 * segments (Markup, DNE, etc.) and the functional sub-tabs.
 */
@Component({
  selector: 'app-customer-edit',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    AccordionComponent,
    ButtonComponent,
    CustomerContactsComponent,
    CustomerFilesComponent,
    CustomerNotesComponent,
    CustomerRatesComponent,
    RichTextEditorComponent,
    SearchableSelectComponent,
  ],
  templateUrl: './customer-edit.component.html',
  styleUrl: './customer-edit.component.scss',
})
export class CustomerEditComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(CustomerListService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected customerKey = '';
  protected readonly customerName = signal('');

  // ── Header identity (derived for the hero header) ───────────────────────────
  protected readonly accountManagerName = signal('');
  protected readonly termsName = signal('');
  protected readonly broadcastEnabled = signal(false);
  /** Up-to-two-letter monogram from the customer name for the header avatar. */
  protected readonly initials = computed(() => {
    const parts = this.customerName()
      .replace(/[()]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return '–';
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
  });

  // ── Options ───────────────────────────────────────────────────────────────
  protected readonly stateOptions = signal<SearchableSelectOption[]>([]);
  protected readonly cityOptions = signal<SearchableSelectOption[]>([]);
  protected readonly amOptions = signal<SearchableSelectOption[]>([]);
  protected readonly termOptions = signal<SearchableSelectOption[]>([]);
  protected readonly citiesLoading = signal(false);

  // ── Page status ─────────────────────────────────────────────────────────────
  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly nonUsa = signal(false);
  protected readonly etaOn = signal(false);

  // ── Segment forms ─────────────────────────────────────────────────────────
  protected readonly basicForm = this.fb.group({
    customerName: ['', Validators.required],
    accountManagerKey: ['', Validators.required],
    netId: ['', Validators.required],
    priviledgedForVendorBlast: [false],
    nonUsaAddress: [false],
    address: [''],
    stateCode: ['', Validators.required],
    cityKey: ['', Validators.required],
    zip: ['', [Validators.required, optionalPattern(US_ZIP_RE, 'zip')]],
    website: ['', optionalPattern(WEBSITE_RE, 'website')],
    companyEmail: ['', optionalPattern(EMAIL_RE, 'email')],
    companyPhone: ['', optionalPhone()],
  });

  protected readonly poForm = this.fb.group({
    freeTextLabel: [''],
    freeTextContent: [''],
    showHideCustomerPo: [true],
    mandatoryRcsPo: [false],
  });

  protected readonly notifForm = this.fb.group({
    allowCustomerToEnterDneJobExclusive: [null as boolean | null, selectionRequired],
    sendAttachmentToVendorsMadeDuringRequest: [null as boolean | null, selectionRequired],
    doNotUsePrimaryVendor: [null as boolean | null],
    toggleApproveVendorEstimate: [null as boolean | null],
    completeStatusUpdateMail: [null as boolean | null],
    techOnSiteMail: [null as boolean | null],
    returnScheduleStatusMail: [null as boolean | null],
    updateForeJobCreate: [null as boolean | null],
    updateForJobCreateByAdmin: [null as boolean | null],
  });

  protected readonly etaForm = this.fb.group({
    vendorSetEtaForCustomDays: [false],
    etaForCustomDays: [''],
    hoursForEmergencyJobForSettingEtaDate: [''],
  });

  protected readonly noticesForm = this.fb.group({
    notice: [''],
    jobPopup: [''],
    estimatePopup: [''],
    invoicePopup: [''],
    ivrInstruction: [''],
    autoTextForInvoice: [''],
    autoTextForEstimate: [''],
  });

  // ── Phase 2 config segments ─────────────────────────────────────────────────
  protected readonly markupForm = this.fb.group({
    materialMarkUp: [''],
    laborAndTrip: [''],
    adminMarkup: [''],
  });

  protected readonly customFieldsForm = this.fb.group({
    customTextboxLabel: [''],
    customTextboxText: [''],
    customFieldRequired: [false],
    customTextboxLabel1: [''],
    customTextboxText1: [''],
    customFieldRequired1: [false],
    customTextboxLabel2: [''],
    customTextboxText2: [''],
    customFieldRequired2: [false],
  });

  protected readonly vendorInvoiceForm = this.fb.group({
    file1Present: [false],
    file1Required: [false],
    file1Label: [''],
    file2Present: [false],
    file2Required: [false],
    file2Label: [''],
    file3Present: [false],
    file3Required: [false],
    file3Label: [''],
  });

  protected readonly vendorEstimateForm = this.fb.group({
    est1Present: [false],
    est1Required: [false],
    est1Label: [''],
    est2Present: [false],
    est2Required: [false],
    est2Label: [''],
    est3Present: [false],
    est3Required: [false],
    est3Label: [''],
  });

  protected readonly dneForm = this.fb.group({
    customerDne: [''],
    emergencyCustomerDne: [''],
    vendorDne: [''],
    vendorEmergencyDne: [''],
  });

  protected readonly minMarkupForm = this.fb.group({
    markupPercentageForEmergency: [''],
    markupPercentageForNonEmergency: [''],
  });
  /** Cost-over tiers of the minimum-markup policy (dynamic rows). */
  protected readonly minMarkupTiers = signal<{ costOverValue: string; markupPercentage: string }[]>([]);

  /** Job types (from create-options) + the currently-selected set (Job Priority segment). */
  protected readonly jobTypeOptions = signal<{ id: string; name: string }[]>([]);
  protected readonly selectedJobTypes = signal<ReadonlySet<string>>(new Set());

  // ── Phase 4 read-only lists (Job History, Estimates, Service Locations) ──────
  protected readonly jobHistory = signal<import('../../../services/customer-list.service').JobHistoryRow[]>([]);
  protected readonly estimates = signal<import('../../../services/customer-list.service').CustomerEstimateRow[]>([]);
  protected readonly serviceLocations = signal<import('../../../services/customer-list.service').ServiceLocationRow[]>([]);
  protected readonly historyLoading = signal(false);
  protected readonly estimatesLoading = signal(false);
  protected readonly locationsLoading = signal(false);
  protected readonly historyError = signal<string | null>(null);
  protected readonly estimatesError = signal<string | null>(null);
  protected readonly locationsError = signal<string | null>(null);

  // ── Phase 3 messaging segments ──────────────────────────────────────────────
  protected readonly dashboardForm = this.fb.group({
    checkIn: [''],
    checkOut: [''],
    etaExpired: [''],
    etaSet: [''],
    accounting: [''],
  });
  protected readonly amRelayForm = this.fb.group({ enabled: [false] });
  protected readonly etaExpireForm = this.fb.group({ interval: [''], unitId: [1] });

  /** Independent status per segment so each Update button reports its own result. */
  protected readonly status: Record<string, SegmentStatus> = {
    basic: this.makeStatus(),
    po: this.makeStatus(),
    notif: this.makeStatus(),
    eta: this.makeStatus(),
    notices: this.makeStatus(),
    markup: this.makeStatus(),
    customFields: this.makeStatus(),
    vendorInvoice: this.makeStatus(),
    vendorEstimate: this.makeStatus(),
    jobPriority: this.makeStatus(),
    dne: this.makeStatus(),
    minMarkup: this.makeStatus(),
    dashboard: this.makeStatus(),
    amRelay: this.makeStatus(),
    etaExpire: this.makeStatus(),
  };

  private makeStatus(): SegmentStatus {
    return { saving: signal(false), saved: signal(false), error: signal<string | null>(null) };
  }

  constructor() {
    this.basicForm.controls.nonUsaAddress.valueChanges.subscribe((checked) => {
      const nonUsa = !!checked;
      this.nonUsa.set(nonUsa);
      const { stateCode, cityKey, zip } = this.basicForm.controls;
      if (nonUsa) {
        stateCode.clearValidators();
        cityKey.clearValidators();
        zip.setValidators(optionalPattern(US_ZIP_RE, 'zip'));
      } else {
        stateCode.setValidators(Validators.required);
        cityKey.setValidators(Validators.required);
        zip.setValidators([Validators.required, optionalPattern(US_ZIP_RE, 'zip')]);
      }
      stateCode.updateValueAndValidity();
      cityKey.updateValueAndValidity();
      zip.updateValueAndValidity();
    });

    this.etaForm.controls.vendorSetEtaForCustomDays.valueChanges.subscribe((v) =>
      this.etaOn.set(!!v),
    );

    // State change → reload cities + clear the city (skipped during the initial patch).
    this.basicForm.controls.stateCode.valueChanges.subscribe((value) => {
      this.basicForm.controls.cityKey.setValue('');
      this.loadCities(value ? Number(value) : null);
    });
  }

  ngOnInit(): void {
    this.customerKey = this.route.snapshot.paramMap.get('id') ?? '';
    if (!this.customerKey) {
      this.loadError.set('No customer specified.');
      return;
    }
    this.loading.set(true);
    forkJoin({
      detail: this.service.getCustomerDetail(this.customerKey),
      options: this.service.getCreateOptions(),
    }).subscribe({
      next: ({ detail, options }) => {
        this.stateOptions.set(options.states.map((s) => ({ value: String(s.pkey), text: s.name })));
        this.amOptions.set(options.accountManagers.map((a) => ({ value: a.personnelKey, text: a.name })));
        this.termOptions.set(options.terms.map((t) => ({ value: String(t.netId), text: t.name })));
        this.jobTypeOptions.set(options.jobTypes.map((j) => ({ id: j.id, name: j.name })));
        this.patchForms(detail);
        this.loading.set(false);
        this.loadDne();
        this.loadMinMarkup();
        this.loadJobHistory();
        this.loadEstimates();
        this.loadServiceLocations();
      },
      error: (err) => {
        this.loadError.set(this.messageFrom(err, 'Failed to load customer.'));
        this.loading.set(false);
      },
    });
  }

  private patchForms(d: import('../../../services/customer-list.service').CustomerDetail): void {
    this.customerName.set(d.customerName);
    this.nonUsa.set(d.nonUsaAddress);
    this.etaOn.set(d.vendorSetEtaForCustomDays);

    // Header identity — resolve the AM/terms keys to their display names.
    this.broadcastEnabled.set(d.priviledgedForVendorBlast);
    this.accountManagerName.set(
      this.amOptions().find((o) => o.value === (d.accountManagerKey ?? ''))?.text ?? '',
    );
    this.termsName.set(
      d.netId != null
        ? this.termOptions().find((o) => o.value === String(d.netId))?.text ?? ''
        : '',
    );

    // Basic — patch state without firing the cascade, then load its cities and set the city.
    this.basicForm.patchValue(
      {
        customerName: d.customerName,
        accountManagerKey: d.accountManagerKey ?? '',
        netId: d.netId != null ? String(d.netId) : '',
        priviledgedForVendorBlast: d.priviledgedForVendorBlast,
        nonUsaAddress: d.nonUsaAddress,
        address: d.address ?? '',
        stateCode: d.stateCode != null ? String(d.stateCode) : '',
        zip: d.zip ?? '',
        website: d.website ?? '',
        companyEmail: d.companyEmail ?? '',
        companyPhone: d.companyPhone ?? '',
      },
      { emitEvent: false },
    );
    if (!d.nonUsaAddress && d.stateCode != null) {
      this.loadCities(d.stateCode, d.cityKey != null ? String(d.cityKey) : '');
    }

    this.poForm.patchValue({
      freeTextLabel: d.freeTextLabel ?? '',
      freeTextContent: d.freeTextContent ?? '',
      showHideCustomerPo: d.showHideCustomerPo,
      mandatoryRcsPo: d.mandatoryRcsPo,
    });

    this.notifForm.patchValue({
      allowCustomerToEnterDneJobExclusive: d.allowCustomerToEnterDneJobExclusive,
      sendAttachmentToVendorsMadeDuringRequest: d.sendAttachmentToVendorsMadeDuringRequest,
      doNotUsePrimaryVendor: d.doNotUsePrimaryVendor,
      toggleApproveVendorEstimate: d.toggleApproveVendorEstimate,
      completeStatusUpdateMail: d.completeStatusUpdateMail,
      techOnSiteMail: d.techOnSiteMail,
      returnScheduleStatusMail: d.returnScheduleStatusMail,
      updateForeJobCreate: d.updateForeJobCreate,
      updateForJobCreateByAdmin: d.updateForJobCreateByAdmin,
    });

    this.etaForm.patchValue(
      {
        vendorSetEtaForCustomDays: d.vendorSetEtaForCustomDays,
        etaForCustomDays: d.etaForCustomDays != null ? String(d.etaForCustomDays) : '',
        hoursForEmergencyJobForSettingEtaDate:
          d.hoursForEmergencyJobForSettingEtaDate != null
            ? String(d.hoursForEmergencyJobForSettingEtaDate)
            : '',
      },
      { emitEvent: false },
    );

    this.noticesForm.patchValue({
      notice: d.notice ?? '',
      jobPopup: d.jobPopup ?? '',
      estimatePopup: d.estimatePopup ?? '',
      invoicePopup: d.invoicePopup ?? '',
      ivrInstruction: d.ivrInstruction ?? '',
      autoTextForInvoice: d.autoTextForInvoice ?? '',
      autoTextForEstimate: d.autoTextForEstimate ?? '',
    });

    // ── Phase 2 ──
    this.markupForm.patchValue({
      materialMarkUp: d.materialMarkUp != null ? String(d.materialMarkUp) : '',
      laborAndTrip: d.laborAndTrip != null ? String(d.laborAndTrip) : '',
      adminMarkup: d.adminMarkup != null ? String(d.adminMarkup) : '',
    });

    this.customFieldsForm.patchValue({
      customTextboxLabel: d.customTextboxLabel ?? '',
      customTextboxText: d.customTextboxText ?? '',
      customFieldRequired: d.customFieldRequired,
      customTextboxLabel1: d.customTextboxLabel1 ?? '',
      customTextboxText1: d.customTextboxText1 ?? '',
      customFieldRequired1: d.customFieldRequired1,
      customTextboxLabel2: d.customTextboxLabel2 ?? '',
      customTextboxText2: d.customTextboxText2 ?? '',
      customFieldRequired2: d.customFieldRequired2,
    });

    this.vendorInvoiceForm.patchValue({
      file1Present: d.file1Present,
      file1Required: d.file1Required,
      file1Label: d.file1Label ?? '',
      file2Present: d.file2Present,
      file2Required: d.file2Required,
      file2Label: d.file2Label ?? '',
      file3Present: d.file3Present,
      file3Required: d.file3Required,
      file3Label: d.file3Label ?? '',
    });

    this.vendorEstimateForm.patchValue({
      est1Present: d.est1Present,
      est1Required: d.est1Required,
      est1Label: d.est1Label ?? '',
      est2Present: d.est2Present,
      est2Required: d.est2Required,
      est2Label: d.est2Label ?? '',
      est3Present: d.est3Present,
      est3Required: d.est3Required,
      est3Label: d.est3Label ?? '',
    });

    this.selectedJobTypes.set(new Set(d.selectedJobTypeKeys ?? []));

    // ── Phase 3 ──
    this.dashboardForm.patchValue({
      checkIn: d.dashboardCheckIn ?? '',
      checkOut: d.dashboardCheckOut ?? '',
      etaExpired: d.dashboardEtaExpired ?? '',
      etaSet: d.dashboardEtaSet ?? '',
      accounting: d.dashboardAccounting ?? '',
    });
    this.amRelayForm.patchValue({ enabled: d.amNoteRelayEnabled });
    this.etaExpireForm.patchValue({
      interval: d.etaExpireInterval != null ? String(d.etaExpireInterval) : '',
      unitId: d.etaExpireUnitId ?? 1,
    });
  }

  private loadDne(): void {
    this.service.getCustomerDne(this.customerKey).subscribe({
      next: (d) => {
        this.dneForm.patchValue({
          customerDne: String(d.customerDne ?? 0),
          emergencyCustomerDne: String(d.emergencyCustomerDne ?? 0),
          vendorDne: String(d.vendorDne ?? 0),
          vendorEmergencyDne: String(d.vendorEmergencyDne ?? 0),
        });
      },
      error: (err) => this.status['dne'].error.set(this.messageFrom(err, 'Failed to load DNE.')),
    });
  }

  private loadJobHistory(): void {
    this.historyLoading.set(true);
    this.service.getJobHistory(this.customerKey).subscribe({
      next: (rows) => { this.jobHistory.set(rows); this.historyLoading.set(false); },
      error: (err) => { this.historyError.set(this.messageFrom(err, 'Failed to load job history.')); this.historyLoading.set(false); },
    });
  }

  private loadEstimates(): void {
    this.estimatesLoading.set(true);
    this.service.getEstimates(this.customerKey).subscribe({
      next: (rows) => { this.estimates.set(rows); this.estimatesLoading.set(false); },
      error: (err) => { this.estimatesError.set(this.messageFrom(err, 'Failed to load estimates.')); this.estimatesLoading.set(false); },
    });
  }

  private loadServiceLocations(): void {
    this.locationsLoading.set(true);
    this.service.getServiceLocations(this.customerKey).subscribe({
      next: (rows) => { this.serviceLocations.set(rows); this.locationsLoading.set(false); },
      error: (err) => { this.locationsError.set(this.messageFrom(err, 'Failed to load service locations.')); this.locationsLoading.set(false); },
    });
  }

  /** Formats an ISO date for the read-only list tables. */
  protected fmtDate(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
  }

  private loadMinMarkup(): void {
    this.service.getMinMarkupPolicy(this.customerKey).subscribe({
      next: (p) => {
        this.minMarkupForm.patchValue({
          markupPercentageForEmergency: String(p.markupPercentageForEmergency ?? 0),
          markupPercentageForNonEmergency: String(p.markupPercentageForNonEmergency ?? 0),
        });
        this.minMarkupTiers.set(
          (p.overValuesWithMarkupPercentages ?? []).map((t) => ({
            costOverValue: String(t.costOverValue),
            markupPercentage: String(t.markupPercentage),
          })),
        );
      },
      error: (err) => this.status['minMarkup'].error.set(this.messageFrom(err, 'Failed to load minimum markup.')),
    });
  }

  // ── Job-type + min-markup tier helpers ──────────────────────────────────────
  protected toggleJobType(id: string, checked: boolean): void {
    this.selectedJobTypes.update((set) => {
      const next = new Set(set);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  protected addTier(): void {
    this.minMarkupTiers.update((t) => [...t, { costOverValue: '', markupPercentage: '' }]);
  }
  protected removeTier(i: number): void {
    this.minMarkupTiers.update((t) => t.filter((_, idx) => idx !== i));
  }
  protected setTier(i: number, field: 'costOverValue' | 'markupPercentage', value: string): void {
    this.minMarkupTiers.update((t) => t.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)));
  }

  private loadCities(stateCode: number | null, selectCity = ''): void {
    this.cityOptions.set([]);
    if (stateCode == null) return;
    this.citiesLoading.set(true);
    this.service.getCities(stateCode).subscribe({
      next: (cities) => {
        this.cityOptions.set(cities.map((c) => ({ value: String(c.cityKey), text: c.name })));
        if (selectCity) {
          this.basicForm.controls.cityKey.setValue(selectCity, { emitEvent: false });
        }
        this.citiesLoading.set(false);
      },
      error: () => this.citiesLoading.set(false),
    });
  }

  // ── Validation display helpers ──────────────────────────────────────────────
  protected showError(form: AbstractControl, name: string): boolean {
    const c = form.get(name);
    return !!c && c.invalid && (c.touched || c.dirty);
  }
  protected errorText(form: AbstractControl, name: string): string | null {
    const e = form.get(name)?.errors;
    if (!e) return null;
    if (e['required']) return 'This field is required.';
    if (e['email']) return 'Enter a valid email address.';
    if (e['phone']) return 'Enter a valid phone number.';
    if (e['website']) return 'Enter a valid website (e.g. example.com).';
    if (e['zip']) return 'Enter a valid ZIP (12345 or 12345-6789).';
    return 'Invalid value.';
  }

  private num(s: unknown): number | null {
    const t = (s ?? '').toString().trim();
    return t ? Number(t) : null;
  }
  private text(s: unknown): string | null {
    const t = (s ?? '').toString().trim();
    return t || null;
  }

  // ── Per-segment saves ────────────────────────────────────────────────────────
  protected saveBasic(): void {
    const st = this.status['basic'];
    this.basicForm.markAllAsTouched();
    if (this.basicForm.invalid) return;
    const v = this.basicForm.getRawValue();
    this.run(st, () =>
      this.service.updateBasicInfo(this.customerKey, {
        customerName: (v.customerName ?? '').trim(),
        address: this.text(v.address),
        nonUsaAddress: !!v.nonUsaAddress,
        stateCode: v.nonUsaAddress ? null : this.num(v.stateCode),
        cityKey: v.nonUsaAddress ? null : this.num(v.cityKey),
        zip: v.nonUsaAddress ? null : this.text(v.zip),
        companyPhone: this.text(v.companyPhone),
        companyEmail: this.text(v.companyEmail),
        website: this.text(v.website),
        accountManagerKey: this.text(v.accountManagerKey),
        netId: this.num(v.netId),
        priviledgedForVendorBlast: !!v.priviledgedForVendorBlast,
      }),
    );
    this.customerName.set((v.customerName ?? '').trim());
    this.broadcastEnabled.set(!!v.priviledgedForVendorBlast);
    this.accountManagerName.set(
      this.amOptions().find((o) => o.value === (v.accountManagerKey ?? ''))?.text ?? '',
    );
    this.termsName.set(this.termOptions().find((o) => o.value === (v.netId ?? ''))?.text ?? '');
  }

  /** Scrolls a segment group into view from the section nav. */
  protected scrollToGroup(id: string): void {
    const el = document.getElementById(id);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 12;
    window.scrollTo({ top, behavior: 'smooth' });
  }

  protected savePo(): void {
    const v = this.poForm.getRawValue();
    this.run(this.status['po'], () =>
      this.service.updatePoSettings(this.customerKey, {
        freeTextLabel: this.text(v.freeTextLabel),
        freeTextContent: this.text(v.freeTextContent),
        showHideCustomerPo: !!v.showHideCustomerPo,
        mandatoryRcsPo: !!v.mandatoryRcsPo,
      }),
    );
  }

  protected saveNotif(): void {
    this.notifForm.markAllAsTouched();
    if (this.notifForm.invalid) return;
    const v = this.notifForm.getRawValue();
    this.run(this.status['notif'], () =>
      this.service.updateNotifications(this.customerKey, {
        allowCustomerToEnterDneJobExclusive: v.allowCustomerToEnterDneJobExclusive,
        sendAttachmentToVendorsMadeDuringRequest: v.sendAttachmentToVendorsMadeDuringRequest,
        doNotUsePrimaryVendor: v.doNotUsePrimaryVendor,
        toggleApproveVendorEstimate: v.toggleApproveVendorEstimate,
        completeStatusUpdateMail: v.completeStatusUpdateMail,
        techOnSiteMail: v.techOnSiteMail,
        returnScheduleStatusMail: v.returnScheduleStatusMail,
        updateForeJobCreate: v.updateForeJobCreate,
        updateForJobCreateByAdmin: v.updateForJobCreateByAdmin,
      }),
    );
  }

  protected saveEta(): void {
    const v = this.etaForm.getRawValue();
    const on = !!v.vendorSetEtaForCustomDays;
    this.run(this.status['eta'], () =>
      this.service.updateEtaWindow(this.customerKey, {
        vendorSetEtaForCustomDays: on,
        etaForCustomDays: on ? this.num(v.etaForCustomDays) : null,
        hoursForEmergencyJobForSettingEtaDate: on ? this.num(v.hoursForEmergencyJobForSettingEtaDate) : null,
      }),
    );
  }

  protected saveNotices(): void {
    const v = this.noticesForm.getRawValue();
    this.run(this.status['notices'], () =>
      this.service.updateNotices(this.customerKey, {
        notice: this.text(v.notice),
        jobPopup: this.text(v.jobPopup),
        estimatePopup: this.text(v.estimatePopup),
        invoicePopup: this.text(v.invoicePopup),
        ivrInstruction: this.text(v.ivrInstruction),
        autoTextForInvoice: this.text(v.autoTextForInvoice),
        autoTextForEstimate: this.text(v.autoTextForEstimate),
      }),
    );
  }

  protected saveMarkup(): void {
    const v = this.markupForm.getRawValue();
    this.run(this.status['markup'], () =>
      this.service.updateMarkup(this.customerKey, {
        materialMarkUp: this.num(v.materialMarkUp),
        laborAndTrip: this.num(v.laborAndTrip),
        adminMarkup: this.num(v.adminMarkup),
      }),
    );
  }

  protected saveCustomFields(): void {
    const v = this.customFieldsForm.getRawValue();
    this.run(this.status['customFields'], () =>
      this.service.updateCustomFields(this.customerKey, {
        customTextboxLabel: this.text(v.customTextboxLabel),
        customTextboxText: this.text(v.customTextboxText),
        customFieldRequired: !!v.customFieldRequired,
        customTextboxLabel1: this.text(v.customTextboxLabel1),
        customTextboxText1: this.text(v.customTextboxText1),
        customFieldRequired1: !!v.customFieldRequired1,
        customTextboxLabel2: this.text(v.customTextboxLabel2),
        customTextboxText2: this.text(v.customTextboxText2),
        customFieldRequired2: !!v.customFieldRequired2,
      }),
    );
  }

  protected saveVendorInvoice(): void {
    const v = this.vendorInvoiceForm.getRawValue();
    this.run(this.status['vendorInvoice'], () =>
      this.service.updateVendorInvoiceConfig(this.customerKey, {
        file1Present: !!v.file1Present,
        file1Required: !!v.file1Required,
        file1Label: this.text(v.file1Label),
        file2Present: !!v.file2Present,
        file2Required: !!v.file2Required,
        file2Label: this.text(v.file2Label),
        file3Present: !!v.file3Present,
        file3Required: !!v.file3Required,
        file3Label: this.text(v.file3Label),
      }),
    );
  }

  protected saveVendorEstimate(): void {
    const v = this.vendorEstimateForm.getRawValue();
    this.run(this.status['vendorEstimate'], () =>
      this.service.updateVendorEstimateConfig(this.customerKey, {
        est1Present: !!v.est1Present,
        est1Required: !!v.est1Required,
        est1Label: this.text(v.est1Label),
        est2Present: !!v.est2Present,
        est2Required: !!v.est2Required,
        est2Label: this.text(v.est2Label),
        est3Present: !!v.est3Present,
        est3Required: !!v.est3Required,
        est3Label: this.text(v.est3Label),
      }),
    );
  }

  protected saveJobPriority(): void {
    this.run(this.status['jobPriority'], () =>
      this.service.updateJobPriority(this.customerKey, { jobTypeKeys: [...this.selectedJobTypes()] }),
    );
  }

  protected saveDne(): void {
    const v = this.dneForm.getRawValue();
    this.run(this.status['dne'], () =>
      this.service.updateCustomerDne({
        customerKey: this.customerKey,
        customerDne: this.num(v.customerDne) ?? 0,
        emergencyCustomerDne: this.num(v.emergencyCustomerDne) ?? 0,
        vendorDne: this.num(v.vendorDne) ?? 0,
        vendorEmergencyDne: this.num(v.vendorEmergencyDne) ?? 0,
      }),
    );
  }

  protected saveMinMarkup(): void {
    const v = this.minMarkupForm.getRawValue();
    this.run(this.status['minMarkup'], () =>
      this.service.saveMinMarkupPolicy({
        customerKey: this.customerKey,
        markupPercentageForEmergency: this.num(v.markupPercentageForEmergency) ?? 0,
        markupPercentageForNonEmergency: this.num(v.markupPercentageForNonEmergency) ?? 0,
        overValuesWithMarkupPercentages: this.minMarkupTiers()
          .filter((t) => t.costOverValue.trim() || t.markupPercentage.trim())
          .map((t) => ({
            costOverValue: this.num(t.costOverValue) ?? 0,
            markupPercentage: this.num(t.markupPercentage) ?? 0,
          })),
      }),
    );
  }

  protected saveDashboard(): void {
    const v = this.dashboardForm.getRawValue();
    this.run(this.status['dashboard'], () =>
      this.service.updateDashboardMessages(this.customerKey, {
        checkIn: this.text(v.checkIn),
        checkOut: this.text(v.checkOut),
        etaExpired: this.text(v.etaExpired),
        etaSet: this.text(v.etaSet),
        accounting: this.text(v.accounting),
      }),
    );
  }

  protected saveAmRelay(): void {
    const v = this.amRelayForm.getRawValue();
    this.run(this.status['amRelay'], () =>
      this.service.updateAmNoteRelay(this.customerKey, { enabled: !!v.enabled }),
    );
  }

  protected saveEtaExpire(): void {
    const v = this.etaExpireForm.getRawValue();
    this.run(this.status['etaExpire'], () =>
      this.service.updateEtaExpire(this.customerKey, {
        interval: this.num(v.interval),
        unitId: Number(v.unitId) || 1,
      }),
    );
  }

  /** Runs a segment update, driving its saving/saved/error signals. */
  private run(st: SegmentStatus, call: () => import('rxjs').Observable<unknown>): void {
    st.saving.set(true);
    st.saved.set(false);
    st.error.set(null);
    call().subscribe({
      next: () => {
        st.saving.set(false);
        st.saved.set(true);
        setTimeout(() => st.saved.set(false), 3000);
      },
      error: (err) => {
        st.saving.set(false);
        st.error.set(this.messageFrom(err, 'Update failed.'));
      },
    });
  }

  protected back(): void {
    this.router.navigate(['/customers']);
  }

  private messageFrom(err: unknown, fallback: string): string {
    const e = err as { error?: { error?: string; details?: string }; message?: string };
    return e?.error?.details || e?.error?.error || e?.message || fallback;
  }
}
