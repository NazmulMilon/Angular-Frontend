import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/** Backend shapes use numeric keys; the component works in strings, so the service maps between them. */
interface StateApi { key: number; code: string; name: string }
interface CityApi { key: number; name: string; stateKey: number }

export interface GisState { key: string; code: string; name: string }
export interface GisCity { key: string; name: string; stateKey: string }

interface Envelope<T> {
  status: boolean;
  data: T;
}

/**
 * GIS API client — targets `api/Gis`. State + City management (Country is a UI-only grouping layer
 * above them, sourced from `api/Country`; Zip was dropped). Add/edit only (no delete). Numeric backend
 * keys are mapped to strings for the component. The `authInterceptor` attaches the bearer token.
 */
@Injectable({ providedIn: 'root' })
export class GisService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/Gis`;

  // ── States ──
  getStates(): Observable<GisState[]> {
    return this.http
      .get<Envelope<StateApi[]>>(`${this.apiBase}/states`)
      .pipe(map((r) => r.data.map((s) => ({ key: String(s.key), code: s.code, name: s.name }))));
  }

  createState(state: { code: string; name: string }): Observable<GisState> {
    return this.http
      .post<Envelope<StateApi>>(`${this.apiBase}/states`, state)
      .pipe(map((r) => ({ key: String(r.data.key), code: r.data.code, name: r.data.name })));
  }

  updateState(key: string, state: { code: string; name: string }): Observable<GisState> {
    return this.http
      .put<Envelope<StateApi>>(`${this.apiBase}/states/${key}`, state)
      .pipe(map((r) => ({ key: String(r.data.key), code: r.data.code, name: r.data.name })));
  }

  // ── Cities ──
  getCities(stateKey: string): Observable<GisCity[]> {
    return this.http
      .get<Envelope<CityApi[]>>(`${this.apiBase}/states/${stateKey}/cities`)
      .pipe(map((r) => r.data.map((c) => ({ key: String(c.key), name: c.name, stateKey: String(c.stateKey) }))));
  }

  createCity(city: { name: string; stateKey: string }): Observable<GisCity> {
    return this.http
      .post<Envelope<CityApi>>(`${this.apiBase}/cities`, { name: city.name, stateKey: Number(city.stateKey) })
      .pipe(map((r) => ({ key: String(r.data.key), name: r.data.name, stateKey: String(r.data.stateKey) })));
  }

  updateCity(key: string, city: { name: string; stateKey: string }): Observable<GisCity> {
    return this.http
      .put<Envelope<CityApi>>(`${this.apiBase}/cities/${key}`, { name: city.name, stateKey: Number(city.stateKey) })
      .pipe(map((r) => ({ key: String(r.data.key), name: r.data.name, stateKey: String(r.data.stateKey) })));
  }
}
