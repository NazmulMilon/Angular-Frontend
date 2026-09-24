import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface GridOption {
  gridKey: number;
  gridName: string;
}

export interface GridStatusOption {
  id: string;
  name: string;
}

export interface GridAssociation {
  detailKey: number;
  gridKey: number;
  gridName: string;
  jobStatusId: string;
  jobStatusName: string;
}

/** The full Vendor Grid Setup payload. */
export interface VendorGridSetup {
  grids: GridOption[];
  availableStatuses: GridStatusOption[];
  associations: GridAssociation[];
}

interface Envelope<T> {
  status: boolean;
  data: T;
}

/** Vendor Grid Setup API client — targets `api/VendorGridSetup`. Every call returns the full payload. */
@Injectable({ providedIn: 'root' })
export class VendorGridSetupService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/VendorGridSetup`;

  /** GET — grids, available statuses, and existing associations. */
  get(): Observable<VendorGridSetup> {
    return this.http.get<Envelope<VendorGridSetup>>(this.apiBase).pipe(map((r) => r.data));
  }

  /** POST — assign statuses to a grid; returns the refreshed payload. */
  save(gridKey: number, jobStatusKeys: string[]): Observable<VendorGridSetup> {
    return this.http
      .post<Envelope<VendorGridSetup>>(this.apiBase, { gridKey, jobStatusKeys })
      .pipe(map((r) => r.data));
  }

  /** DELETE /{detailKey} — remove one association; returns the refreshed payload. */
  remove(detailKey: number): Observable<VendorGridSetup> {
    return this.http.delete<Envelope<VendorGridSetup>>(`${this.apiBase}/${detailKey}`).pipe(map((r) => r.data));
  }
}
