import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  CityOption,
  CompanyProfile,
  CompanyProfileService,
  StateOption,
  ZipOption,
} from '../../../services/company-profile.service';

@Component({
  selector: 'app-company-info',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './company-info.component.html',
  styleUrl: './company-info.component.scss',
})
export class CompanyInfoComponent implements OnInit {
  private readonly service = inject(CompanyProfileService);

  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly companyId = signal('');
  protected readonly companyName = signal('');
  protected readonly companyAddress = signal('');
  protected readonly companyPhone = signal('');
  protected readonly companyMobile = signal('');
  protected readonly companyEmail = signal('');
  protected readonly companyWebsite = signal('');
  protected readonly companyFax = signal('');
  protected readonly contactPersonName = signal('');
  protected readonly title = signal('');
  protected readonly contactPersonNo = signal('');
  protected readonly contactEmail = signal('');

  protected readonly stateCode = signal<number | null>(null);
  protected readonly cityKey = signal<number | null>(null);
  protected readonly zipKey = signal<number | null>(null);

  protected readonly states = signal<StateOption[]>([]);
  protected readonly cities = signal<CityOption[]>([]);
  protected readonly zips = signal<ZipOption[]>([]);

  /** Existing logo (data URI) for preview; replaced live when a new file is chosen. */
  protected readonly logoPreview = signal<string | null>(null);
  /** New logo as a data URI to send on save; null keeps the current logo. */
  protected readonly logoBase64 = signal<string | null>(null);
  protected readonly logoName = signal('');

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.get().subscribe({
      next: (p) => {
        this.applyProfile(p);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load company info. Please try again.');
        this.loading.set(false);
      },
    });
  }

  private applyProfile(p: CompanyProfile): void {
    this.companyId.set(p.companyId);
    this.companyName.set(p.companyName);
    this.companyAddress.set(p.companyAddress);
    this.companyPhone.set(p.companyPhone);
    this.companyMobile.set(p.companyMobile);
    this.companyEmail.set(p.companyEmail);
    this.companyWebsite.set(p.companyWebsite);
    this.companyFax.set(p.companyFax);
    this.contactPersonName.set(p.contactPersonName);
    this.title.set(p.title);
    this.contactPersonNo.set(p.contactPersonNo);
    this.contactEmail.set(p.contactEmail);
    this.stateCode.set(p.stateCode);
    this.cityKey.set(p.cityKey);
    this.zipKey.set(p.zipKey);
    this.states.set(p.states ?? []);
    this.cities.set(p.cities ?? []);
    this.zips.set(p.zips ?? []);
    this.logoPreview.set(p.logoDataUri);
    this.logoBase64.set(null);
    this.logoName.set('');
  }

  onStateChange(value: string): void {
    const code = value ? Number(value) : null;
    this.stateCode.set(code);
    this.cityKey.set(null);
    this.zipKey.set(null);
    this.cities.set([]);
    this.zips.set([]);
    if (code !== null) {
      this.service.getCities(code).subscribe({
        next: (list) => this.cities.set(list),
        error: () => this.error.set('Failed to load cities.'),
      });
    }
  }

  onCityChange(value: string): void {
    const key = value ? Number(value) : null;
    this.cityKey.set(key);
    this.zipKey.set(null);
    this.zips.set([]);
    if (key !== null) {
      this.service.getZips(key).subscribe({
        next: (list) => this.zips.set(list),
        error: () => this.error.set('Failed to load zips.'),
      });
    }
  }

  onZipChange(value: string): void {
    this.zipKey.set(value ? Number(value) : null);
  }

  onLogoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.logoName.set(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUri = reader.result as string;
      this.logoBase64.set(dataUri);
      this.logoPreview.set(dataUri);
    };
    reader.readAsDataURL(file);
  }

  get canSave(): boolean {
    return !this.saving() && this.companyName().trim().length > 0;
  }

  save(): void {
    if (!this.canSave) return;
    this.saving.set(true);
    this.saved.set(false);
    this.error.set(null);
    this.service
      .save({
        companyId: this.companyId(),
        companyName: this.companyName().trim(),
        companyAddress: this.companyAddress(),
        companyPhone: this.companyPhone(),
        companyMobile: this.companyMobile(),
        companyEmail: this.companyEmail(),
        companyWebsite: this.companyWebsite(),
        companyFax: this.companyFax(),
        contactPersonName: this.contactPersonName(),
        title: this.title(),
        contactPersonNo: this.contactPersonNo(),
        contactEmail: this.contactEmail(),
        stateCode: this.stateCode(),
        cityKey: this.cityKey(),
        zipKey: this.zipKey(),
        logoBase64: this.logoBase64(),
      })
      .subscribe({
        next: (p) => {
          this.applyProfile(p);
          this.saving.set(false);
          this.saved.set(true);
          setTimeout(() => this.saved.set(false), 3000);
        },
        error: () => {
          this.error.set('Failed to save. Please try again.');
          this.saving.set(false);
        },
      });
  }
}
