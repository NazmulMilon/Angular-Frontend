import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, of } from 'rxjs';
import { environment } from '../../environments/environment';
import { AssignVendorApiResponse } from '../models/assign-vendor.model';
import { CreateLocationRequest, LocationDetailDto } from '../models/location.model';

/**
 * Location Configuration API client — targets `api/v1/admin/locations`.
 *
 * State/city dropdown options are NOT fetched from this controller — reuse
 * {@link AssignVendorService.getStateDropdown} / `.getCityDropdown` (the same lookup already used
 * elsewhere in the app), per the backend handoff.
 *
 * Temp-file staging (`POST/GET/DELETE temp-files`, for thumbnail/banner images) is out of scope
 * here — the "Add service location" modal doesn't currently collect images.
 */
@Injectable({ providedIn: 'root' })
export class LocationService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/v1/admin/locations`;

  /**
   * POST / — creates the location. A single call: the backend handles geocoding, time zone
   * lookup, store hours, customer/contact linkage, portal-access grants, and zone assignment.
   * `lat`/`lng`/`timeZoneId`/`timeZoneName` on the response are computed server-side.
   */
  createLocation(
    request: CreateLocationRequest
  ): Observable<AssignVendorApiResponse<LocationDetailDto>> {
    return this.http
      .post<AssignVendorApiResponse<LocationDetailDto>>(this.apiBase, request)
      .pipe(catchError(this.handleError<LocationDetailDto>('createLocation')));
  }

  /** GET /{locationKey} — fetch a previously created location. */
  getLocation(locationKey: string): Observable<AssignVendorApiResponse<LocationDetailDto>> {
    return this.http
      .get<AssignVendorApiResponse<LocationDetailDto>>(`${this.apiBase}/${locationKey}`)
      .pipe(catchError(this.handleError<LocationDetailDto>('getLocation')));
  }

  /** Maps an HTTP failure to a synthesized `status: false` envelope so callers never have to catch. */
  private handleError<T>(operation: string) {
    return (error: HttpErrorResponse): Observable<AssignVendorApiResponse<T>> => {
      const apiEnvelope = error.error as Partial<AssignVendorApiResponse<T>> | null;
      const message =
        apiEnvelope?.message ??
        (error.status === 0
          ? 'Cannot reach the Job Ops API. Check the API is running and the base URL is correct.'
          : error.status === 401
            ? 'Not authorized. Your session token is missing or expired.'
            : `Request failed (${error.status}).`);

      return of({
        status: false,
        responseCode: error.status,
        message,
        data: (apiEnvelope?.data ?? null) as T,
        details: apiEnvelope?.details ?? [],
        unixTime: Date.now(),
        traceId: apiEnvelope?.traceId ?? null,
        clientOperation: operation,
        requestUrl: error.url,
        authorizationSent: true,
      });
    };
  }
}
