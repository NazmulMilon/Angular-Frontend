import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  AdminEmailConfigService,
  Staff,
} from '../../../services/admin-email-config.service';
import {
  StaffService,
  StaffDetail,
  Usergroup,
} from '../../../services/staff.service';
import { RichTextEditorComponent } from '../../../shared/components/rich-text-editor/rich-text-editor.component';

interface ReceiverOption {
  value: number;
  label: string;
}

type View = 'roster' | 'configure' | 'create' | 'edit' | 'details';

@Component({
  selector: 'app-admin-email-config',
  standalone: true,
  imports: [FormsModule, RouterLink, NgTemplateOutlet, RichTextEditorComponent],
  templateUrl: './admin-email-config.component.html',
  styleUrl: './admin-email-config.component.scss',
})
export class AdminEmailConfigComponent implements OnInit {
  private readonly service = inject(AdminEmailConfigService);
  private readonly staffService = inject(StaffService);

  protected readonly staff = signal<Staff[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly search = signal('');

  /** Which screen is showing. */
  protected readonly view = signal<View>('roster');

  protected readonly usergroups = signal<Usergroup[]>([]);

  protected readonly filteredStaff = computed(() => {
    const q = this.search().trim().toLowerCase();
    if (!q) return this.staff();
    return this.staff().filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.pid.toLowerCase().includes(q) ||
        s.usergroup.toLowerCase().includes(q) ||
        s.department.toLowerCase().includes(q) ||
        s.designation.toLowerCase().includes(q)
    );
  });

  // ── Master-detail: selected staff opens the config editor ──
  protected readonly selectedStaff = signal<Staff | null>(null);
  protected readonly detailLoading = signal(false);

  // ── SMTP configuration form ──
  protected readonly cfgSenderName = signal('');
  protected readonly cfgSmtpServer = signal('');
  protected readonly cfgSmtpPort = signal('');
  protected readonly cfgUsername = signal('');
  protected readonly cfgPassword = signal('');
  protected readonly cfgFooter = signal('');
  protected readonly showCfgPassword = signal(false);
  protected readonly cfgSaving = signal(false);
  protected readonly cfgSaved = signal(false);

  // ── Notification receivers (each checked box = one EmailSendToAddress row) ──
  // V1 parity (mirrored on the backend): QC Manager posts value 11 but reads its checked-state from
  // SendToType 16; Insurance Admin posts value 21 but reads from SendToType 20. So after saving, those
  // two may show unchecked on reload — this is intentional V1 behavior.
  protected readonly receiverOptions: ReceiverOption[] = [
    { value: 9, label: 'Account Manager Functions' },
    { value: 14, label: 'Accounting Person' },
    { value: 13, label: 'Action for Need Vendor Estimate/Invoice' },
    { value: 10, label: 'Admin for Broadcast W/O' },
    { value: 17, label: 'Aging Report' },
    { value: 5, label: 'Customer Attachments' },
    { value: 8, label: 'Customer Login Query' },
    { value: 3, label: 'Customer Notes' },
    { value: 18, label: 'Edit Email Address (Vendor)' },
    { value: 21, label: 'Insurance Admin' },
    { value: 7, label: 'Job Archived (Admin)' },
    { value: 6, label: 'Job Cancelled (Admin)' },
    { value: 12, label: 'Multi-Purpose' },
    { value: 11, label: 'QC Manager' },
    { value: 20, label: 'Service Manage' },
    { value: 4, label: 'Vendor Estimate' },
    { value: 1, label: 'Vendor Invoice and Uploads' },
    { value: 2, label: 'Vendor Notes' },
    { value: 19, label: 'Vendor Registration' },
  ];

  protected readonly checkedReceivers = signal<Set<number>>(new Set());
  protected readonly receiversSaving = signal(false);
  protected readonly receiversSaved = signal(false);

  protected readonly checkedReceiverCount = computed(() => this.checkedReceivers().size);

  // ── Create / Edit staff form ──
  protected readonly fPid = signal('');
  protected readonly fName = signal('');
  protected readonly fPhone = signal('');
  protected readonly fPhoneExt = signal('');
  protected readonly fMobile = signal('');
  protected readonly fEmail = signal('');
  protected readonly fDepartment = signal('');
  protected readonly fDesignation = signal('');
  protected readonly fUsergr = signal('');
  protected readonly fUsername = signal('');
  protected readonly fPassword = signal('');
  protected readonly fConfirmPassword = signal('');
  protected readonly fPhotoBase64 = signal<string | null>(null);
  protected readonly fPhotoContentType = signal<string | null>(null);
  protected readonly fPhotoPreview = signal<string | null>(null);
  protected readonly showFormPassword = signal(false);
  protected readonly formSaving = signal(false);
  protected readonly formError = signal<string | null>(null);

  // ── User access (edit only) ──
  protected readonly aUsername = signal('');
  protected readonly aPassword = signal('');
  protected readonly showAccessPassword = signal(false);
  protected readonly accessSaving = signal(false);
  protected readonly accessSaved = signal(false);

  // ── Details view ──
  protected readonly detail = signal<StaffDetail | null>(null);

  ngOnInit(): void {
    this.loadStaff();
    this.staffService.getUsergroups().subscribe({
      next: (rows) => this.usergroups.set(rows ?? []),
      error: () => {},
    });
  }

  private loadStaff(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.getStaff().subscribe({
      next: (rows) => {
        this.staff.set(rows ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load staff. Please try again.');
        this.loading.set(false);
      },
    });
  }

  initials(name: string): string {
    return name.split(/\s+/).map((p) => p.charAt(0)).slice(0, 2).join('').toUpperCase();
  }

  avatarHue(name: string): number {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash) % 360;
  }

  // ── Navigation ──
  backToRoster(): void {
    this.view.set('roster');
    this.selectedStaff.set(null);
    this.detail.set(null);
    this.error.set(null);
    this.formError.set(null);
  }

  // ── Email config editor (existing) ──
  configureEmail(s: Staff): void {
    this.selectedStaff.set(s);
    this.view.set('configure');
    this.showCfgPassword.set(false);
    this.cfgSaved.set(false);
    this.receiversSaved.set(false);
    this.error.set(null);

    this.cfgSenderName.set(s.name);
    this.cfgSmtpServer.set('');
    this.cfgSmtpPort.set('');
    this.cfgUsername.set('');
    this.cfgPassword.set('');
    this.cfgFooter.set('');
    this.checkedReceivers.set(new Set());

    this.detailLoading.set(true);
    this.service.getDetail(s.personnelKey).subscribe({
      next: (detail) => {
        const c = detail.config;
        this.cfgSenderName.set(c.senderName || s.name);
        this.cfgSmtpServer.set(c.smtpServer);
        this.cfgSmtpPort.set(c.smtpPort);
        this.cfgUsername.set(c.smtpUsername);
        this.cfgPassword.set(c.smtpPassword);
        this.cfgFooter.set(c.footer);
        this.checkedReceivers.set(new Set(detail.checkedReceivers ?? []));
        this.detailLoading.set(false);
      },
      error: () => {
        this.error.set('Failed to load this staff member’s configuration. Please try again.');
        this.detailLoading.set(false);
      },
    });
  }

  toggleCfgPassword(): void {
    this.showCfgPassword.update((v) => !v);
  }

  get canSaveConfig(): boolean {
    return (
      this.cfgSmtpServer().trim().length > 0 &&
      this.cfgSmtpPort().trim().length > 0 &&
      this.cfgUsername().trim().length > 0
    );
  }

  saveConfig(): void {
    const staff = this.selectedStaff();
    if (!staff || !this.canSaveConfig || this.cfgSaving()) return;

    this.cfgSaving.set(true);
    this.cfgSaved.set(false);
    this.error.set(null);

    this.service
      .saveConfig(staff.personnelKey, {
        senderName: this.cfgSenderName().trim(),
        smtpServer: this.cfgSmtpServer().trim(),
        smtpPort: this.cfgSmtpPort().trim(),
        smtpUsername: this.cfgUsername().trim(),
        smtpPassword: this.cfgPassword(),
        footer: this.cfgFooter(),
      })
      .subscribe({
        next: () => {
          this.cfgSaving.set(false);
          this.cfgSaved.set(true);
          setTimeout(() => this.cfgSaved.set(false), 3000);
        },
        error: () => {
          this.cfgSaving.set(false);
          this.error.set('Failed to save the configuration. Please try again.');
        },
      });
  }

  isReceiverChecked(value: number): boolean {
    return this.checkedReceivers().has(value);
  }

  toggleReceiver(value: number): void {
    this.checkedReceivers.update((set) => {
      const next = new Set(set);
      next.has(value) ? next.delete(value) : next.add(value);
      return next;
    });
  }

  saveReceivers(): void {
    const staff = this.selectedStaff();
    if (!staff || this.receiversSaving()) return;

    this.receiversSaving.set(true);
    this.receiversSaved.set(false);
    this.error.set(null);

    this.service.saveReceivers(staff.personnelKey, [...this.checkedReceivers()]).subscribe({
      next: () => {
        this.receiversSaving.set(false);
        this.receiversSaved.set(true);
        setTimeout(() => this.receiversSaved.set(false), 3000);
      },
      error: () => {
        this.receiversSaving.set(false);
        this.error.set('Failed to save the receivers. Please try again.');
      },
    });
  }

  // ── Create staff ──
  openCreate(): void {
    this.view.set('create');
    this.selectedStaff.set(null);
    this.resetForm();
  }

  private resetForm(): void {
    this.fPid.set('');
    this.fName.set('');
    this.fPhone.set('');
    this.fPhoneExt.set('');
    this.fMobile.set('');
    this.fEmail.set('');
    this.fDepartment.set('');
    this.fDesignation.set('');
    this.fUsergr.set('');
    this.fUsername.set('');
    this.fPassword.set('');
    this.fConfirmPassword.set('');
    this.fPhotoBase64.set(null);
    this.fPhotoContentType.set(null);
    this.fPhotoPreview.set(null);
    this.showFormPassword.set(false);
    this.formError.set(null);
  }

  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      this.fPhotoPreview.set(dataUrl);
      const comma = dataUrl.indexOf(',');
      this.fPhotoBase64.set(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
      this.fPhotoContentType.set(file.type || 'image/png');
    };
    reader.readAsDataURL(file);
  }

  get canSaveCreate(): boolean {
    return (
      this.fName().trim().length > 0 &&
      this.fUsername().trim().length > 0 &&
      this.fPassword().length > 0 &&
      this.fPassword() === this.fConfirmPassword()
    );
  }

  toggleFormPassword(): void {
    this.showFormPassword.update((v) => !v);
  }

  saveCreate(): void {
    if (this.formSaving()) return;
    if (this.fPassword() !== this.fConfirmPassword()) {
      this.formError.set('Password and confirmation do not match.');
      return;
    }
    if (!this.canSaveCreate) return;

    this.formSaving.set(true);
    this.formError.set(null);

    this.staffService
      .create({
        pid: this.fPid().trim() || undefined,
        name: this.fName().trim(),
        phone: this.fPhone().trim(),
        phoneExt: this.fPhoneExt().trim(),
        mobile: this.fMobile().trim(),
        email: this.fEmail().trim(),
        department: this.fDepartment().trim(),
        designation: this.fDesignation().trim(),
        usergr: this.fUsergr() || null,
        username: this.fUsername().trim(),
        password: this.fPassword(),
        confirmPassword: this.fConfirmPassword(),
        photoBase64: this.fPhotoBase64(),
        photoContentType: this.fPhotoContentType(),
      })
      .subscribe({
        next: () => {
          this.formSaving.set(false);
          this.loadStaff();
          this.backToRoster();
        },
        error: (err) => {
          this.formSaving.set(false);
          this.formError.set(err?.error?.details ?? 'Failed to create staff. Please try again.');
        },
      });
  }

  // ── Edit staff ──
  openEdit(s: Staff): void {
    this.view.set('edit');
    this.selectedStaff.set(s);
    this.resetForm();
    this.aUsername.set('');
    this.aPassword.set('');
    this.showAccessPassword.set(false);
    this.accessSaved.set(false);
    this.detailLoading.set(true);

    this.staffService.getDetail(s.personnelKey).subscribe({
      next: (d) => {
        this.fPid.set(d.pid);
        this.fName.set(d.name);
        this.fPhone.set(d.phone);
        this.fPhoneExt.set(d.phoneExt);
        this.fMobile.set(d.mobile);
        this.fEmail.set(d.email);
        this.fDepartment.set(d.department);
        this.fDesignation.set(d.designation);
        this.fUsergr.set(d.usergr ?? '');
        this.fPhotoPreview.set(d.photoUrl || null);
        this.aUsername.set(d.username);
        this.aPassword.set(d.password);
        this.detailLoading.set(false);
      },
      error: () => {
        this.formError.set('Failed to load staff details. Please try again.');
        this.detailLoading.set(false);
      },
    });
  }

  get canSaveEdit(): boolean {
    return this.fName().trim().length > 0;
  }

  saveEdit(): void {
    const staff = this.selectedStaff();
    if (!staff || !this.canSaveEdit || this.formSaving()) return;

    this.formSaving.set(true);
    this.formError.set(null);

    this.staffService
      .edit(staff.personnelKey, {
        pid: this.fPid().trim(),
        name: this.fName().trim(),
        phone: this.fPhone().trim(),
        phoneExt: this.fPhoneExt().trim(),
        mobile: this.fMobile().trim(),
        email: this.fEmail().trim(),
        department: this.fDepartment().trim(),
        designation: this.fDesignation().trim(),
        photoBase64: this.fPhotoBase64(),
        photoContentType: this.fPhotoContentType(),
      })
      .subscribe({
        next: () => {
          this.formSaving.set(false);
          this.loadStaff();
          this.backToRoster();
        },
        error: (err) => {
          this.formSaving.set(false);
          this.formError.set(err?.error?.details ?? 'Failed to save staff. Please try again.');
        },
      });
  }

  toggleAccessPassword(): void {
    this.showAccessPassword.update((v) => !v);
  }

  get canSaveAccess(): boolean {
    return this.aUsername().trim().length > 0 && this.aPassword().length > 0;
  }

  saveAccess(): void {
    const staff = this.selectedStaff();
    if (!staff || !this.canSaveAccess || this.accessSaving()) return;

    this.accessSaving.set(true);
    this.accessSaved.set(false);
    this.formError.set(null);

    this.staffService.saveAccess(staff.personnelKey, this.aUsername().trim(), this.aPassword()).subscribe({
      next: () => {
        this.accessSaving.set(false);
        this.accessSaved.set(true);
        setTimeout(() => this.accessSaved.set(false), 3000);
      },
      error: () => {
        this.accessSaving.set(false);
        this.formError.set('Failed to save user access. Please try again.');
      },
    });
  }

  // ── Details view ──
  openDetails(s: Staff): void {
    this.view.set('details');
    this.selectedStaff.set(s);
    this.detail.set(null);
    this.error.set(null);
    this.detailLoading.set(true);

    this.staffService.getDetail(s.personnelKey).subscribe({
      next: (d) => {
        this.detail.set(d);
        this.detailLoading.set(false);
      },
      error: () => {
        this.error.set('Failed to load staff details. Please try again.');
        this.detailLoading.set(false);
      },
    });
  }
}
