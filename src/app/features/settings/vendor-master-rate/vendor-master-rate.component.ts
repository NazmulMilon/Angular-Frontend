import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { VendorMasterRate, VendorMasterRateService } from '../../../services/vendor-master-rate.service';

@Component({
  selector: 'app-vendor-master-rate',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './vendor-master-rate.component.html',
  styleUrl: './vendor-master-rate.component.scss',
})
export class VendorMasterRateComponent implements OnInit {
  private readonly service = inject(VendorMasterRateService);

  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly stdTrip = signal<number | null>(null);
  protected readonly stdHourly = signal<number | null>(null);
  protected readonly stdHelper = signal<number | null>(null);
  protected readonly emgTrip = signal<number | null>(null);
  protected readonly emgHourly = signal<number | null>(null);
  protected readonly emgHelper = signal<number | null>(null);

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.get().subscribe({
      next: (r) => {
        this.apply(r);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load rates. Please try again.');
        this.loading.set(false);
      },
    });
  }

  private apply(r: VendorMasterRate): void {
    this.stdTrip.set(r.stdTrip);
    this.stdHourly.set(r.stdHourly);
    this.stdHelper.set(r.stdHelper);
    this.emgTrip.set(r.emgTrip);
    this.emgHourly.set(r.emgHourly);
    this.emgHelper.set(r.emgHelper);
  }

  get canSave(): boolean {
    return (
      !this.saving() &&
      this.stdTrip() !== null && this.stdHourly() !== null &&
      this.emgTrip() !== null && this.emgHourly() !== null
    );
  }

  save(): void {
    if (!this.canSave) return;
    this.saving.set(true);
    this.saved.set(false);
    this.error.set(null);
    this.service
      .save({
        stdTrip: this.stdTrip(),
        stdHourly: this.stdHourly(),
        stdHelper: this.stdHelper(),
        emgTrip: this.emgTrip(),
        emgHourly: this.emgHourly(),
        emgHelper: this.emgHelper(),
      })
      .subscribe({
        next: (r) => {
          this.apply(r);
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
