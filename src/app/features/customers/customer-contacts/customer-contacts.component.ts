import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';

import { ButtonComponent } from '../../../shared/components/button/button.component';
import { CustomerContactRow, CustomerListService } from '../../../services/customer-list.service';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function optionalEmail(): ValidatorFn {
  return (c: AbstractControl): ValidationErrors | null => {
    const v = (c.value ?? '').toString().trim();
    return !v || EMAIL_RE.test(v) ? null : { email: true };
  };
}

/**
 * Contact Profile CRUD (RFI-345 Phase 4) — embedded in the Edit Customer page's
 * Contacts accordion panel. Lists a customer's contacts and adds / edits / (de)activates
 * / sets-default via the CustomerProfile contacts endpoints. Core contact fields only;
 * login credentials, roles and locations are follow-ups.
 */
@Component({
  selector: 'app-customer-contacts',
  standalone: true,
  imports: [ReactiveFormsModule, ButtonComponent],
  templateUrl: './customer-contacts.component.html',
  styleUrl: './customer-contacts.component.scss',
})
export class CustomerContactsComponent implements OnInit {
  @Input({ required: true }) customerKey!: string;

  private readonly fb = inject(FormBuilder);
  private readonly service = inject(CustomerListService);

  protected readonly contacts = signal<CustomerContactRow[]>([]);
  protected readonly loading = signal(false);
  protected readonly listError = signal<string | null>(null);

  /** null = not editing; 'new' = adding; otherwise the contactKey being edited. */
  protected readonly editing = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly rowBusy = signal<string | null>(null);

  protected readonly form = this.fb.group({
    name: ['', Validators.required],
    title: [''],
    email: ['', optionalEmail()],
    phone: [''],
    phoneExt: [''],
    altPhone: [''],
    altPhoneExt: [''],
    fax: [''],
    receivesInvoice: [false],
    isDefault: [false],
  });

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    if (!this.customerKey) return;
    this.loading.set(true);
    this.listError.set(null);
    this.service.getContacts(this.customerKey).subscribe({
      next: (rows) => {
        this.contacts.set(rows);
        this.loading.set(false);
      },
      error: (err) => {
        this.listError.set(this.messageFrom(err, 'Failed to load contacts.'));
        this.loading.set(false);
      },
    });
  }

  protected startAdd(): void {
    this.form.reset({ receivesInvoice: false, isDefault: false });
    this.saveError.set(null);
    this.editing.set('new');
  }

  protected startEdit(c: CustomerContactRow): void {
    this.form.reset({
      name: c.name,
      title: c.title ?? '',
      email: c.email ?? '',
      phone: c.phone ?? '',
      phoneExt: c.phoneExt ?? '',
      altPhone: c.altPhone ?? '',
      altPhoneExt: c.altPhoneExt ?? '',
      fax: c.fax ?? '',
      receivesInvoice: c.receivesInvoice,
      isDefault: c.isDefault,
    });
    this.saveError.set(null);
    this.editing.set(c.contactKey);
  }

  protected cancel(): void {
    this.editing.set(null);
    this.saveError.set(null);
  }

  protected save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const t = (s: string | null | undefined) => ((s ?? '').toString().trim() || null);
    const dto = {
      name: (v.name ?? '').trim(),
      title: t(v.title),
      email: t(v.email),
      phone: t(v.phone),
      phoneExt: t(v.phoneExt),
      altPhone: t(v.altPhone),
      altPhoneExt: t(v.altPhoneExt),
      fax: t(v.fax),
      receivesInvoice: !!v.receivesInvoice,
      isDefault: !!v.isDefault,
    };
    const key = this.editing();
    this.saving.set(true);
    this.saveError.set(null);
    const call =
      key === 'new'
        ? this.service.createContact(this.customerKey, dto)
        : this.service.updateContact(this.customerKey, key!, dto);
    call.subscribe({
      next: () => {
        this.saving.set(false);
        this.editing.set(null);
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.saveError.set(this.messageFrom(err, 'Failed to save contact.'));
      },
    });
  }

  protected toggleActive(c: CustomerContactRow): void {
    this.rowBusy.set(c.contactKey);
    this.service.setContactActive(this.customerKey, c.contactKey, c.isDeleted).subscribe({
      next: () => { this.rowBusy.set(null); this.load(); },
      error: (err) => { this.rowBusy.set(null); this.listError.set(this.messageFrom(err, 'Failed to update contact.')); },
    });
  }

  protected makeDefault(c: CustomerContactRow): void {
    this.rowBusy.set(c.contactKey);
    this.service.setContactDefault(this.customerKey, c.contactKey).subscribe({
      next: () => { this.rowBusy.set(null); this.load(); },
      error: (err) => { this.rowBusy.set(null); this.listError.set(this.messageFrom(err, 'Failed to set default.')); },
    });
  }

  protected nameInvalid(): boolean {
    const c = this.form.controls.name;
    return c.invalid && (c.touched || c.dirty);
  }
  protected emailInvalid(): boolean {
    const c = this.form.controls.email;
    return c.invalid && (c.touched || c.dirty);
  }

  private messageFrom(err: unknown, fallback: string): string {
    const e = err as { error?: { error?: string; details?: string }; message?: string };
    return e?.error?.details || e?.error?.error || e?.message || fallback;
  }
}
