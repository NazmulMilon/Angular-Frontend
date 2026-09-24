import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/** A country lookup row. `countryKey` is null when creating. */
export interface Country {
  countryKey: number | null;
  shortName: string;
  countryName: string;
}

/** The Job Ops API wraps responses in `{ status, data, ... }`; each method unwraps `.data`. */
interface Envelope<T> {
  status: boolean;
  data: T;
}

/**
 * Country API client — targets `api/Country`.
 *
 * Global lookup with hard deletes (not company-scoped). The `authInterceptor` attaches the bearer
 * token, so no auth handling is needed here.
 */
@Injectable({ providedIn: 'root' })
export class CountryService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/Country`;

  /** GET — list all countries (ordered by name). */
  getAll(): Observable<Country[]> {
    return this.http.get<Envelope<Country[]>>(this.apiBase).pipe(map((res) => res.data));
  }

  /** POST — create a new country. A blank short code defaults to the name server-side. */
  create(country: Pick<Country, 'shortName' | 'countryName'>): Observable<Country> {
    return this.http.post<Envelope<Country>>(this.apiBase, country).pipe(map((res) => res.data));
  }

  /** PUT /{countryKey} — update an existing country. */
  update(countryKey: number, country: Pick<Country, 'shortName' | 'countryName'>): Observable<Country> {
    return this.http
      .put<Envelope<Country>>(`${this.apiBase}/${countryKey}`, country)
      .pipe(map((res) => res.data));
  }

  /** DELETE /{countryKey} — hard-delete a country. */
  delete(countryKey: number): Observable<void> {
    return this.http.delete<void>(`${this.apiBase}/${countryKey}`);
  }
}
