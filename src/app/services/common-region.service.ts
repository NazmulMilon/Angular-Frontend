import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/** Backend keys are numeric (StateList.PKey); the component works in strings. */
interface StateApi { key: number; name: string }
interface RegionApi { id: string; name: string; stateKeys: number[] }

export interface CommonRegionState { key: string; name: string }
export interface CommonRegionRow { id: string | null; name: string; stateKeys: string[] }
export interface CommonRegionData { states: CommonRegionState[]; regions: CommonRegionRow[] }

interface Envelope<T> {
  status: boolean;
  data: T;
}

/**
 * Common Region API client — targets `api/CommonRegion`. A region groups a set of states; editing
 * re-syncs the state set. Numeric state keys are mapped to strings. The `authInterceptor` attaches
 * the bearer token.
 */
@Injectable({ providedIn: 'root' })
export class CommonRegionService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/CommonRegion`;

  /** GET — all states plus all regions with their state keys. */
  get(): Observable<CommonRegionData> {
    return this.http.get<Envelope<{ states: StateApi[]; regions: RegionApi[] }>>(this.apiBase).pipe(
      map((r) => ({
        states: r.data.states.map((s) => ({ key: String(s.key), name: s.name })),
        regions: r.data.regions.map((g) => ({ id: g.id, name: g.name, stateKeys: g.stateKeys.map(String) })),
      })),
    );
  }

  /** POST — create a region with its state keys. */
  create(region: { name: string; stateKeys: string[] }): Observable<CommonRegionRow> {
    return this.http
      .post<Envelope<RegionApi>>(this.apiBase, { name: region.name, stateKeys: region.stateKeys.map(Number) })
      .pipe(map((r) => ({ id: r.data.id, name: r.data.name, stateKeys: r.data.stateKeys.map(String) })));
  }

  /** PUT /{regionKey} — update a region's name and state set. */
  update(regionKey: string, region: { name: string; stateKeys: string[] }): Observable<CommonRegionRow> {
    return this.http
      .put<Envelope<RegionApi>>(`${this.apiBase}/${regionKey}`, { name: region.name, stateKeys: region.stateKeys.map(Number) })
      .pipe(map((r) => ({ id: r.data.id, name: r.data.name, stateKeys: r.data.stateKeys.map(String) })));
  }

  /** DELETE /{regionKey} — hard-delete a region and its state rows. */
  delete(regionKey: string): Observable<void> {
    return this.http.delete<void>(`${this.apiBase}/${regionKey}`);
  }
}
