import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface StateOption {
  pkey: number;
  name: string;
}
export interface CityOption {
  cityKey: number;
  name: string;
}
export interface ZipOption {
  zipKey: number;
  zip: string;
}

/** The full Company Info payload. */
export interface CompanyProfile {
  companyKey: string;
  companyId: string;
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyMobile: string;
  companyEmail: string;
  companyWebsite: string;
  companyFax: string;
  contactPersonName: string;
  contactPersonNo: string;
  title: string;
  contactEmail: string;
  stateCode: number | null;
  cityKey: number | null;
  zipKey: number | null;
  logoDataUri: string | null;
  states: StateOption[];
  cities: CityOption[];
  zips: ZipOption[];
}

/** Save payload — everything except the read-only lookups and logo preview. `logoBase64` is optional. */
export type CompanyProfileSave = Omit<
  CompanyProfile,
  'companyKey' | 'logoDataUri' | 'states' | 'cities' | 'zips'
> & { logoBase64?: string | null };

interface Envelope<T> {
  status: boolean;
  data: T;
}

/**
 * Company Info API client — targets `api/CompanyProfile`.
 *
 * Single-record editor. State → City → Zip are cascading FK dropdowns loaded on demand. The
 * `authInterceptor` attaches the bearer token, so no auth handling is needed here.
 */
@Injectable({ providedIn: 'root' })
export class CompanyProfileService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/CompanyProfile`;

  /** GET — the company profile plus state/city/zip option lists. */
  get(): Observable<CompanyProfile> {
    return this.http.get<Envelope<CompanyProfile>>(this.apiBase).pipe(map((r) => r.data));
  }

  /** GET /cities/{stateCode} — cities for a state. */
  getCities(stateCode: number): Observable<CityOption[]> {
    return this.http
      .get<Envelope<CityOption[]>>(`${this.apiBase}/cities/${stateCode}`)
      .pipe(map((r) => r.data));
  }

  /** GET /zips/{cityKey} — zips for a city. */
  getZips(cityKey: number): Observable<ZipOption[]> {
    return this.http
      .get<Envelope<ZipOption[]>>(`${this.apiBase}/zips/${cityKey}`)
      .pipe(map((r) => r.data));
  }

  /** PUT — save the profile; returns the refreshed payload. */
  save(dto: CompanyProfileSave): Observable<CompanyProfile> {
    return this.http.put<Envelope<CompanyProfile>>(this.apiBase, dto).pipe(map((r) => r.data));
  }
}
