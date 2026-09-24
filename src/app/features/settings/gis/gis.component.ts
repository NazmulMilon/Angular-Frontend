import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Country, CountryService } from '../../../services/country.service';
import { GisCity, GisService, GisState } from '../../../services/gis.service';

type Level = 'country' | 'state' | 'city';

/** A country in the GIS hierarchy (top grouping level). */
interface GisCountry {
  key: string;
  code: string;
  name: string;
}

@Component({
  selector: 'app-gis',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './gis.component.html',
  styleUrl: './gis.component.scss',
})
export class GisComponent implements OnInit {
  private readonly gis = inject(GisService);
  private readonly countryApi = inject(CountryService);

  protected readonly countries = signal<GisCountry[]>([]);
  /** All states (loaded when a country is opened; grouping is UI-only — states have no DB country link). */
  protected readonly states = signal<GisState[]>([]);
  /** Holds only the selected state's cities. */
  protected readonly cities = signal<GisCity[]>([]);

  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  // ── Drill-down navigation ──
  protected readonly level = signal<Level>('country');
  protected readonly selectedCountryKey = signal<string | null>(null);
  protected readonly selectedStateKey = signal<string | null>(null);

  protected readonly selectedCountry = computed(() => this.countries().find((c) => c.key === this.selectedCountryKey()) ?? null);
  protected readonly selectedState = computed(() => this.states().find((s) => s.key === this.selectedStateKey()) ?? null);

  ngOnInit(): void {
    this.loadCountries();
  }

  private loadCountries(): void {
    this.loading.set(true);
    this.error.set(null);
    this.countryApi.getAll().subscribe({
      next: (list) => {
        this.countries.set((list ?? []).map(this.toCountry));
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load countries. Please try again.');
        this.loading.set(false);
      },
    });
  }

  private toCountry = (c: Country): GisCountry => ({
    key: String(c.countryKey),
    code: c.shortName,
    name: c.countryName,
  });

  stateName(key: string): string {
    return this.states().find((s) => s.key === key)?.name ?? key;
  }

  // ── Navigation ──
  drillToStates(country: GisCountry): void {
    this.selectedCountryKey.set(country.key);
    this.level.set('state');
    this.clearStateForm();
    this.states.set([]);
    this.loading.set(true);
    this.error.set(null);
    this.gis.getStates().subscribe({
      next: (list) => { this.states.set(list); this.loading.set(false); },
      error: () => { this.error.set('Failed to load states. Please try again.'); this.loading.set(false); },
    });
  }

  drillToCities(state: GisState): void {
    this.selectedStateKey.set(state.key);
    this.level.set('city');
    this.clearCityForm();
    this.cities.set([]);
    this.loading.set(true);
    this.error.set(null);
    this.gis.getCities(state.key).subscribe({
      next: (list) => { this.cities.set(list); this.loading.set(false); },
      error: () => { this.error.set('Failed to load cities. Please try again.'); this.loading.set(false); },
    });
  }

  goToCountries(): void {
    this.level.set('country');
    this.selectedCountryKey.set(null);
    this.selectedStateKey.set(null);
  }

  goToStates(): void {
    this.level.set('state');
    this.selectedStateKey.set(null);
  }

  // ── Country CRUD ──
  protected readonly editCountryKey = signal<string | null>(null);
  protected readonly fCountryCode = signal('');
  protected readonly fCountryName = signal('');

  editCountry(row: GisCountry): void {
    this.editCountryKey.set(row.key);
    this.fCountryCode.set(row.code);
    this.fCountryName.set(row.name);
    this.error.set(null);
  }

  clearCountryForm(): void {
    this.editCountryKey.set(null);
    this.fCountryCode.set('');
    this.fCountryName.set('');
  }

  get canSaveCountry(): boolean {
    return !this.saving() && this.fCountryName().trim().length > 0;
  }

  saveCountry(): void {
    if (!this.canSaveCountry) return;
    const name = this.fCountryName().trim();
    const payload = { shortName: this.fCountryCode().trim() || name, countryName: name };
    const key = this.editCountryKey();
    this.saving.set(true);
    this.error.set(null);
    const req$ = key === null ? this.countryApi.create(payload) : this.countryApi.update(Number(key), payload);
    req$.subscribe({
      next: (saved) => {
        const c = this.toCountry(saved);
        this.countries.update((list) => {
          const others = key === null ? list : list.filter((x) => x.key !== key);
          return [...others, c].sort((a, b) => a.name.localeCompare(b.name));
        });
        this.saving.set(false);
        this.clearCountryForm();
      },
      error: () => { this.error.set('Failed to save country. Please try again.'); this.saving.set(false); },
    });
  }

  // ── State CRUD ──
  protected readonly editStateKey = signal<string | null>(null);
  protected readonly fStateCode = signal('');
  protected readonly fStateName = signal('');

  editState(row: GisState): void {
    this.editStateKey.set(row.key);
    this.fStateCode.set(row.code);
    this.fStateName.set(row.name);
    this.error.set(null);
  }

  clearStateForm(): void {
    this.editStateKey.set(null);
    this.fStateCode.set('');
    this.fStateName.set('');
  }

  get canSaveState(): boolean {
    return !this.saving() && this.fStateCode().trim().length > 0 && this.fStateName().trim().length > 0;
  }

  saveState(): void {
    if (!this.canSaveState) return;
    const payload = { code: this.fStateCode().trim(), name: this.fStateName().trim() };
    const key = this.editStateKey();
    this.saving.set(true);
    this.error.set(null);
    const req$ = key === null ? this.gis.createState(payload) : this.gis.updateState(key, payload);
    req$.subscribe({
      next: (saved) => {
        this.states.update((list) => {
          const others = key === null ? list : list.filter((s) => s.key !== key);
          return [...others, saved].sort((a, b) => a.name.localeCompare(b.name));
        });
        this.saving.set(false);
        this.clearStateForm();
      },
      error: () => { this.error.set('Failed to save state. Please try again.'); this.saving.set(false); },
    });
  }

  // ── City CRUD ──
  protected readonly editCityKey = signal<string | null>(null);
  protected readonly fCityName = signal('');

  editCity(row: GisCity): void {
    this.editCityKey.set(row.key);
    this.fCityName.set(row.name);
    this.error.set(null);
  }

  clearCityForm(): void {
    this.editCityKey.set(null);
    this.fCityName.set('');
  }

  get canSaveCity(): boolean {
    return !this.saving() && this.fCityName().trim().length > 0;
  }

  saveCity(): void {
    const stateKey = this.selectedStateKey();
    if (!this.canSaveCity || !stateKey) return;
    const payload = { name: this.fCityName().trim(), stateKey };
    const key = this.editCityKey();
    this.saving.set(true);
    this.error.set(null);
    const req$ = key === null ? this.gis.createCity(payload) : this.gis.updateCity(key, payload);
    req$.subscribe({
      next: (saved) => {
        this.cities.update((list) => {
          const others = key === null ? list : list.filter((c) => c.key !== key);
          return [...others, saved].sort((a, b) => a.name.localeCompare(b.name));
        });
        this.saving.set(false);
        this.clearCityForm();
      },
      error: () => { this.error.set('Failed to save city. Please try again.'); this.saving.set(false); },
    });
  }
}
