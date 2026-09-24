import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface GridOption {
  gridKey: number;
  gridName: string;
}

export interface UsergroupOption {
  id: string;
  name: string;
}

export interface GridUserAssociation {
  detailKey: number;
  gridKey: number;
  gridName: string;
  usergroupId: string;
  usergroupName: string;
}

/** The full Dashboard Grid Usergroups payload. */
export interface DashboardGridUsergroups {
  grids: GridOption[];
  allUsergroups: UsergroupOption[];
  associations: GridUserAssociation[];
}

interface Envelope<T> {
  status: boolean;
  data: T;
}

/** Dashboard Grid Usergroups API client — targets `api/DashboardGrid/usergroups`. Every call returns the full payload. */
@Injectable({ providedIn: 'root' })
export class DashboardGridUsergroupsService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/DashboardGrid/usergroups`;

  /** GET — grids, all usergroups, and existing associations. */
  get(): Observable<DashboardGridUsergroups> {
    return this.http.get<Envelope<DashboardGridUsergroups>>(this.apiBase).pipe(map((r) => r.data));
  }

  /** POST — assign usergroups to a grid; returns the refreshed payload. */
  save(gridKey: number, usergroupKeys: string[]): Observable<DashboardGridUsergroups> {
    return this.http
      .post<Envelope<DashboardGridUsergroups>>(this.apiBase, { gridKey, usergroupKeys })
      .pipe(map((r) => r.data));
  }

  /** DELETE /{detailKey} — remove one association; returns the refreshed payload. */
  remove(detailKey: number): Observable<DashboardGridUsergroups> {
    return this.http.delete<Envelope<DashboardGridUsergroups>>(`${this.apiBase}/${detailKey}`).pipe(map((r) => r.data));
  }
}
