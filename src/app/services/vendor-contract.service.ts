import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/** The company-wide vendor contract text; `contractDetail` is null when unconfigured. */
export interface VendorContract {
  contractDetail: string | null;
}

/** The Job Ops API wraps responses in `{ status, data, ... }`; each method unwraps `.data`. */
interface Envelope<T> {
  status: boolean;
  data: T;
}

/**
 * Vendor Contract settings API client — targets `api/Settings/vendor-contract`.
 *
 * The `authInterceptor` attaches `Authorization: Bearer <jwt>` on every request, so no auth
 * handling is needed here. HTTP errors surface via the Observable's error channel.
 */
@Injectable({ providedIn: 'root' })
export class VendorContractService {
  private readonly http = inject(HttpClient);
  private readonly endpoint = `${environment.apiBaseUrl}/api/Settings/vendor-contract`;

  /** GET — read the current vendor contract text. */
  getContract(): Observable<VendorContract> {
    return this.http
      .get<Envelope<VendorContract>>(this.endpoint)
      .pipe(map((res) => res.data));
  }

  /** PUT — save the vendor contract text. */
  saveContract(contractDetail: string): Observable<VendorContract> {
    return this.http
      .put<Envelope<VendorContract>>(this.endpoint, { contractDetail })
      .pipe(map((res) => res.data));
  }
}
