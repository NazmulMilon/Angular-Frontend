import { Component, OnInit, computed, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';

import { AccordionComponent } from '../../../shared/components/accordion/accordion.component';
import { ButtonComponent } from '../../../shared/components/button/button.component';
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
const DECIMAL_RE = /^\d+(\.\d+)?$/;

/** Optional value must match a regex when non-empty. */
function optionalPattern(re: RegExp, key: string): ValidatorFn {
  return (c: AbstractControl): ValidationErrors | null => {
    const v = (c.value ?? '').toString().trim();
    return !v || re.test(v) ? null : { [key]: true };
  };
}

/** Phone: allowed characters and 7–15 digits, when non-empty. */
function optionalPhone(): ValidatorFn {
  return (c: AbstractControl): ValidationErrors | null => {
    const v = (c.value ?? '').toString().trim();
    if (!v) return null;
    const digits = v.replace(/\D/g, '').length;
    return PHONE_ALLOWED_RE.test(v) && digits >= 7 && digits <= 15 ? null : { phone: true };
  };
}

/** A radio/boolean selection that must be explicitly made (null = not chosen). */
function selectionRequired(c: AbstractControl): ValidationErrors | null {
  return c.value === null || c.value === undefined ? { required: true } : null;
}

/**
 * Create Customer (RFI-344, epic RFI-342) — full port of legacy MgtCustomer/Create.
 *
 * The legacy page is a set of pill tabs; only the "General" tab carries fields (the
 * other seven are "save first" placeholders until the customer exists / Edit page).
 * Here the eight tabs are laid out as accordion panels (matching the assign-vendor
 * design). Panel 1 is the complete General form (~40 fields + 7 rich-text editors +
 * a job-types checklist + logo upload); panels 2–8 are the faithful placeholders.
 *
 * On save it POSTs the whole General tab, then (if a logo was chosen) uploads it to
 * the customer, and returns to the list.
 */
@Component({
  selector: 'app-customer-create',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    AccordionComponent,
    ButtonComponent,
    RichTextEditorComponent,
    SearchableSelectComponent,
  ],
  templateUrl: './customer-create.component.html',
  styleUrl: './customer-create.component.scss',
})
export class CustomerCreateComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(CustomerListService);
  private readonly router = inject(Router);

  // ── Options ───────────────────────────────────────────────────────────────
  protected readonly stateOptions = signal<SearchableSelectOption[]>([]);
  protected readonly cityOptions = signal<SearchableSelectOption[]>([]);
  protected readonly amOptions = signal<SearchableSelectOption[]>([]);
  protected readonly termOptions = signal<SearchableSelectOption[]>([]);
  protected readonly jobTypeOptions = signal<{ id: string; name: string }[]>([]);
  protected readonly citiesLoading = signal(false);
  /** Company-wide ETA-days parameter, shown as a note under the ETA-days field (legacy behaviour). */
  protected readonly systemwideEtaDays = signal<number | null>(null);

  // ── Job types (checkbox list) + logo (kept outside the form) ────────────────
  protected readonly selectedJobTypes = signal<ReadonlySet<string>>(new Set());
  protected readonly logoFile = signal<File | null>(null);

  // ── Status ────────────────────────────────────────────────────────────────
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly submitted = signal(false);

  /** The whole General tab as one reactive form. */
  protected readonly form = this.fb.group({
    // Basic
    customerName: ['', Validators.required],
    accountManagerKey: ['', Validators.required],
    netId: ['', Validators.required],
    priviledgedForVendorBlast: [false],
    nonUsaAddress: [false],
    address: [''],
    stateCode: [''],
    cityKey: [''],
    zip: ['', optionalPattern(US_ZIP_RE, 'zip')],
    website: ['', optionalPattern(WEBSITE_RE, 'website')],
    companyEmail: ['', optionalPattern(EMAIL_RE, 'email')],
    companyPhone: ['', optionalPhone()],

    // Customer PO customization
    freeTextLabel: [''],
    freeTextContent: [''],
    // Radio toggles start with no selection (null) so nothing is pre-chosen for the user.
    showHideCustomerPo: [null as boolean | null],
    mandatoryRcsPo: [null as boolean | null],

    // Vendor-invoice file configuration
    file1Present: [false],
    file1Required: [false],
    file1Label: ['INVOICE ATTACHMENTS'],
    file2Present: [false],
    file2Required: [false],
    file2Label: ['SIGN-OFF SHEET'],
    file3Present: [false],
    file3Required: [false],
    file3Label: ['JOB FILES'],

    // Markups
    materialMarkUp: ['', optionalPattern(DECIMAL_RE, 'number')],
    laborAndTrip: ['', optionalPattern(DECIMAL_RE, 'number')],
    adminMarkup: ['', optionalPattern(DECIMAL_RE, 'number')],

    // DNE
    customerDne: ['', optionalPattern(DECIMAL_RE, 'number')],
    customerEmergencyDne: ['', optionalPattern(DECIMAL_RE, 'number')],
    vendorDne: ['', optionalPattern(DECIMAL_RE, 'number')],
    vendorEmergencyDne: ['', optionalPattern(DECIMAL_RE, 'number')],
    allowCustomerToEnterDneJobExclusive: [null as boolean | null, selectionRequired],

    // Toggles / customer email settings — no radio pre-selected (null until the user picks).
    sendAttachmentToVendorsMadeDuringRequest: [null as boolean | null, selectionRequired],
    doNotUsePrimaryVendor: [null as boolean | null],
    toggleApproveVendorEstimate: [null as boolean | null],
    completeStatusUpdateMail: [null as boolean | null],
    techOnSiteMail: [null as boolean | null],
    returnScheduleStatusMail: [null as boolean | null],
    updateForeJobCreate: [null as boolean | null],
    updateForJobCreateByAdmin: [null as boolean | null],

    // Vendor ETA window
    vendorSetEtaForCustomDays: [null as boolean | null],
    etaForCustomDays: ['', optionalPattern(DECIMAL_RE, 'number')],
    hoursForEmergencyJobForSettingEtaDate: ['', optionalPattern(DECIMAL_RE, 'number')],

    // Dynamic custom textboxes
    customTextboxLabel: [''],
    customTextboxText: [''],
    customTextboxLabel1: [''],
    customTextboxText1: [''],
    customTextboxLabel2: [''],
    customTextboxText2: [''],

    // Rich-text (CKEditor) fields
    notice: [''],
    jobPopup: [''],
    estimatePopup: [''],
    invoicePopup: [''],
    ivrInstruction: [''],
    autoTextForInvoice: [''],
    autoTextForEstimate: [''],
  });

  /** Non-US toggle, exposed for the template's conditional address block. */
  protected readonly nonUsa = signal(false);
  /** Vendor-ETA toggle, exposed for the template's conditional ETA block. */
  protected readonly etaOn = signal(false);
  /** ETA-block validity message computed at submit (legacy: need days or hours). */
  protected readonly etaMissing = computed(
    () => this.submitted() && this.etaOn() && !this.hasEtaValue(),
  );

  constructor() {
    // State/City/ZIP are required for US addresses only — toggle validators with the checkbox.
    this.form.controls.nonUsaAddress.valueChanges.subscribe((checked) => {
      const nonUsa = !!checked;
      this.nonUsa.set(nonUsa);
      const state = this.form.controls.stateCode;
      const city = this.form.controls.cityKey;
      const zip = this.form.controls.zip;
      if (nonUsa) {
        state.clearValidators();
        city.clearValidators();
        zip.setValidators(optionalPattern(US_ZIP_RE, 'zip'));
        state.setValue('');
        city.setValue('');
        zip.setValue('');
        this.cityOptions.set([]);
      } else {
        state.setValidators(Validators.required);
        city.setValidators(Validators.required);
        zip.setValidators([Validators.required, optionalPattern(US_ZIP_RE, 'zip')]);
      }
      state.updateValueAndValidity();
      city.updateValueAndValidity();
      zip.updateValueAndValidity();
    });

    this.form.controls.vendorSetEtaForCustomDays.valueChanges.subscribe((v) =>
      this.etaOn.set(!!v),
    );

    // State change → reload cities and clear the city selection.
    this.form.controls.stateCode.valueChanges.subscribe((value) => {
      this.form.controls.cityKey.setValue('');
      this.cityOptions.set([]);
      const parsed = value ? Number(value) : null;
      if (parsed == null) return;
      this.citiesLoading.set(true);
      this.service.getCities(parsed).subscribe({
        next: (cities) => {
          this.cityOptions.set(cities.map((c) => ({ value: String(c.cityKey), text: c.name })));
          this.citiesLoading.set(false);
        },
        error: (err) => {
          this.error.set(this.messageFrom(err, 'Failed to load cities.'));
          this.citiesLoading.set(false);
        },
      });
    });

    // Initial state: US address → state/city/zip required.
    this.form.controls.stateCode.setValidators(Validators.required);
    this.form.controls.cityKey.setValidators(Validators.required);
    this.form.controls.zip.setValidators([Validators.required, optionalPattern(US_ZIP_RE, 'zip')]);
  }

  ngOnInit(): void {
    this.loading.set(true);
    this.service.getCreateOptions().subscribe({
      next: (opts) => {
        this.stateOptions.set(opts.states.map((s) => ({ value: String(s.pkey), text: s.name })));
        this.amOptions.set(opts.accountManagers.map((a) => ({ value: a.personnelKey, text: a.name })));
        this.termOptions.set(opts.terms.map((t) => ({ value: String(t.netId), text: t.name })));
        this.jobTypeOptions.set(opts.jobTypes.map((j) => ({ id: j.id, name: j.name })));
        this.systemwideEtaDays.set(opts.systemwideEtaDays ?? null);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(this.messageFrom(err, 'Failed to load form options.'));
        this.loading.set(false);
      },
    });
  }

  // ── Job types + logo ─────────────────────────────────────────────────────────
  protected toggleJobType(id: string, checked: boolean): void {
    this.selectedJobTypes.update((set) => {
      const next = new Set(set);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  protected onLogoChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.logoFile.set(input.files?.[0] ?? null);
  }

  protected clearLogo(): void {
    this.logoFile.set(null);
  }

  // ── Validation helpers for the template ─────────────────────────────────────
  protected showError(name: string): boolean {
    const c = this.form.get(name);
    return !!c && c.invalid && (this.submitted() || c.touched);
  }

  protected errorText(name: string): string | null {
    const c = this.form.get(name);
    if (!c || !c.errors) return null;
    const e = c.errors;
    if (e['required']) return 'This field is required.';
    if (e['email']) return 'Enter a valid email address.';
    if (e['phone']) return 'Enter a valid phone number.';
    if (e['website']) return 'Enter a valid website (e.g. example.com).';
    if (e['zip']) return 'Enter a valid ZIP (12345 or 12345-6789).';
    if (e['number']) return 'Enter a valid number.';
    return 'Invalid value.';
  }

  private hasEtaValue(): boolean {
    return (
      !!this.form.controls.etaForCustomDays.value?.toString().trim() ||
      !!this.form.controls.hoursForEmergencyJobForSettingEtaDate.value?.toString().trim()
    );
  }

  // ── Save / cancel ────────────────────────────────────────────────────────────
  protected save(): void {
    this.submitted.set(true);
    this.error.set(null);
    this.form.markAllAsTouched();

    if (this.form.invalid || (this.etaOn() && !this.hasEtaValue())) {
      this.error.set('Please fix the highlighted fields before saving.');
      return;
    }

    this.saving.set(true);
    const v = this.form.getRawValue();
    const num = (s: string | null | undefined): number | null => {
      const t = (s ?? '').toString().trim();
      return t ? Number(t) : null;
    };
    const text = (s: string | null | undefined): string | null => {
      const t = (s ?? '').toString().trim();
      return t || null;
    };

    this.service
      .createCustomer({
        customerName: (v.customerName ?? '').trim(),
        address: text(v.address),
        nonUsaAddress: !!v.nonUsaAddress,
        stateCode: v.nonUsaAddress ? null : num(v.stateCode),
        cityKey: v.nonUsaAddress ? null : num(v.cityKey),
        zip: v.nonUsaAddress ? null : text(v.zip),
        companyPhone: text(v.companyPhone),
        companyEmail: text(v.companyEmail),
        website: text(v.website),
        accountManagerKey: text(v.accountManagerKey),
        netId: num(v.netId),
        priviledgedForVendorBlast: !!v.priviledgedForVendorBlast,

        freeTextLabel: text(v.freeTextLabel),
        freeTextContent: text(v.freeTextContent),
        showHideCustomerPo: !!v.showHideCustomerPo,
        mandatoryRcsPo: !!v.mandatoryRcsPo,

        // The UI shows a single "Required" checkbox per row; Present mirrors Required.
        file1Present: !!v.file1Required,
        file1Required: !!v.file1Required,
        file1Label: text(v.file1Label),
        file2Present: !!v.file2Required,
        file2Required: !!v.file2Required,
        file2Label: text(v.file2Label),
        file3Present: !!v.file3Required,
        file3Required: !!v.file3Required,
        file3Label: text(v.file3Label),

        materialMarkUp: num(v.materialMarkUp),
        laborAndTrip: num(v.laborAndTrip),
        adminMarkup: num(v.adminMarkup),

        jobTypeKeys: [...this.selectedJobTypes()],

        customerDne: num(v.customerDne),
        customerEmergencyDne: num(v.customerEmergencyDne),
        vendorDne: num(v.vendorDne),
        vendorEmergencyDne: num(v.vendorEmergencyDne),
        allowCustomerToEnterDneJobExclusive: v.allowCustomerToEnterDneJobExclusive,

        sendAttachmentToVendorsMadeDuringRequest: v.sendAttachmentToVendorsMadeDuringRequest,
        // Optional toggles: an unselected radio (null) means the user left it off — send false.
        doNotUsePrimaryVendor: !!v.doNotUsePrimaryVendor,
        toggleApproveVendorEstimate: !!v.toggleApproveVendorEstimate,
        completeStatusUpdateMail: !!v.completeStatusUpdateMail,
        techOnSiteMail: !!v.techOnSiteMail,
        returnScheduleStatusMail: !!v.returnScheduleStatusMail,
        updateForeJobCreate: !!v.updateForeJobCreate,
        updateForJobCreateByAdmin: !!v.updateForJobCreateByAdmin,

        vendorSetEtaForCustomDays: !!v.vendorSetEtaForCustomDays,
        etaForCustomDays: v.vendorSetEtaForCustomDays ? num(v.etaForCustomDays) : null,
        hoursForEmergencyJobForSettingEtaDate: v.vendorSetEtaForCustomDays
          ? num(v.hoursForEmergencyJobForSettingEtaDate)
          : null,

        customTextboxLabel: text(v.customTextboxLabel),
        customTextboxText: text(v.customTextboxText),
        customTextboxLabel1: text(v.customTextboxLabel1),
        customTextboxText1: text(v.customTextboxText1),
        customTextboxLabel2: text(v.customTextboxLabel2),
        customTextboxText2: text(v.customTextboxText2),

        notice: text(v.notice),
        jobPopup: text(v.jobPopup),
        estimatePopup: text(v.estimatePopup),
        invoicePopup: text(v.invoicePopup),
        ivrInstruction: text(v.ivrInstruction),
        autoTextForInvoice: text(v.autoTextForInvoice),
        autoTextForEstimate: text(v.autoTextForEstimate),
      })
      .subscribe({
        next: (created) => {
          const file = this.logoFile();
          if (file) {
            this.service.uploadLogo(created.customerKey, file).subscribe({
              next: () => this.finish(),
              // A logo failure shouldn't lose the created customer — report but still continue.
              error: () => this.finish(),
            });
          } else {
            this.finish();
          }
        },
        error: (err) => {
          this.saving.set(false);
          this.error.set(this.messageFrom(err, 'Failed to create customer.'));
        },
      });
  }

  private finish(): void {
    this.saving.set(false);
    this.router.navigate(['/customers'], { queryParams: { created: '1' } });
  }

  protected cancel(): void {
    this.router.navigate(['/customers']);
  }

  /** Scrolls a section group into view from the section nav. */
  protected scrollToGroup(id: string): void {
    const el = document.getElementById(id);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 12;
    window.scrollTo({ top, behavior: 'smooth' });
  }

  private messageFrom(err: unknown, fallback: string): string {
    const e = err as { error?: { error?: string; details?: string }; message?: string };
    return e?.error?.details || e?.error?.error || e?.message || fallback;
  }
}
