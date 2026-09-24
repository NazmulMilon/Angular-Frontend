import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/** A selectable customer. `key` is the Customer.CustomerKey. */
export interface RegionCustomer {
  key: string;
  name: string;
}

/** A customer region / zone. `zoneId` is the numeric LocationZone key rendered as a string. */
export interface Region {
  zoneId: string;
  customerKey: string;
  customerName: string;
  zoneName: string;
}

/** The full screen payload. */
export interface CustomerRegionData {
  customers: RegionCustomer[];
  regions: Region[];
}

/** Create/update payload for a region. */
export interface SaveRegionRequest {
  customerKey: string;
  zoneName: string;
}

/** The backend region shape (`zoneId` is a number, `customerKey` nullable); mapped to {@link Region}. */
interface ApiRegion {
  zoneId: number;
  customerKey: string | null;
  customerName: string;
  zoneName: string;
}

/** The Job Ops API wraps responses in `{ status, data, ... }`; each method unwraps `.data`. */
interface Envelope<T> {
  status: boolean;
  data: T;
}

/**
 * Customer Region API client — targets `api/CustomerRegion`.
 *
 * Deleting a region cascades server-side (nulls ZoneID on referencing locations). The backend keys
 * regions on a numeric ZoneId; this service renders it as a string to match the component.
 */
@Injectable({ providedIn: 'root' })
export class CustomerRegionService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/CustomerRegion`;

  /** GET — non-deleted customers plus all regions. */
  get(): Observable<CustomerRegionData> {
    return this.http.get<Envelope<{ customers: RegionCustomer[]; regions: ApiRegion[] }>>(this.apiBase).pipe(
      map((r) => ({ customers: r.data.customers ?? [], regions: (r.data.regions ?? []).map(toRegion) }))
    );
  }

  /** POST — create a new region. */
  create(req: SaveRegionRequest): Observable<Region> {
    return this.http.post<Envelope<ApiRegion>>(this.apiBase, req).pipe(map((r) => toRegion(r.data)));
  }

  /** PUT /{zoneId} — update a region. */
  update(zoneId: string, req: SaveRegionRequest): Observable<Region> {
    return this.http.put<Envelope<ApiRegion>>(`${this.apiBase}/${zoneId}`, req).pipe(map((r) => toRegion(r.data)));
  }

  /** DELETE /{zoneId} — delete a region (nulls ZoneID on referencing locations first). */
  delete(zoneId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiBase}/${zoneId}`);
  }
}

function toRegion(a: ApiRegion): Region {
  return {
    zoneId: String(a.zoneId),
    customerKey: a.customerKey ?? '',
    customerName: a.customerName,
    zoneName: a.zoneName,
  };
}
