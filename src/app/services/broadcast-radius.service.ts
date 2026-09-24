import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/** The company-wide default vendor broadcast radius (miles); `radius` is null when unconfigured. */
export interface BroadcastRadius {
  radius: number | null;
}

/**
 * The Job Ops API wraps responses in the standard result envelope (`{ status, data, ... }`).
 * Callers only need `data`, so each method unwraps it before returning.
 */
interface Envelope<T> {
  status: boolean;
  data: T;
}

/**
 * Broadcast Radius settings API client — targets `api/Settings/broadcast-radius`.
 *
 * The `authInterceptor` attaches `Authorization: Bearer <jwt>` on every request, so no auth
 * handling is needed here. HTTP errors surface via the Observable's error channel.
 */
@Injectable({ providedIn: 'root' })
export class BroadcastRadiusService {
  private readonly http = inject(HttpClient);
  private readonly endpoint = `${environment.apiBaseUrl}/api/Settings/broadcast-radius`;

  /** GET — read the current company-wide broadcast radius. */
  getRadius(): Observable<BroadcastRadius> {
    return this.http
      .get<Envelope<BroadcastRadius>>(this.endpoint)
      .pipe(map((res) => res.data));
  }

  /** PUT — save the broadcast radius (miles). */
  saveRadius(radius: number): Observable<BroadcastRadius> {
    return this.http
      .put<Envelope<BroadcastRadius>>(this.endpoint, { radius })
      .pipe(map((res) => res.data));
  }
}
