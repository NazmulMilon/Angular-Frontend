import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/** The company-wide vendor master rate card. */
export interface VendorMasterRate {
  stdTrip: number | null;
  stdHourly: number | null;
  stdHelper: number | null;
  emgTrip: number | null;
  emgHourly: number | null;
  emgHelper: number | null;
}

interface Envelope<T> { status: boolean; data: T }

/** Vendor Master Rate API client — targets `api/Settings/vendor-master-rate` (a singleton). */
@Injectable({ providedIn: 'root' })
export class VendorMasterRateService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/Settings/vendor-master-rate`;

  get(): Observable<VendorMasterRate> {
    return this.http.get<Envelope<VendorMasterRate>>(this.apiBase).pipe(map((r) => r.data));
  }

  save(dto: VendorMasterRate): Observable<VendorMasterRate> {
    return this.http.put<Envelope<VendorMasterRate>>(this.apiBase, dto).pipe(map((r) => r.data));
  }
}
