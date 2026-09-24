import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/** The company-wide customer terms & conditions text; `contractDetail` is null when unconfigured. */
export interface CustomerContract {
  contractDetail: string | null;
}

/** The Job Ops API wraps responses in `{ status, data, ... }`; each method unwraps `.data`. */
interface Envelope<T> {
  status: boolean;
  data: T;
}

/**
 * Customer Terms & Conditions settings API client — targets `api/Settings/customer-contract`.
 *
 * The `authInterceptor` attaches `Authorization: Bearer <jwt>` on every request, so no auth
 * handling is needed here. HTTP errors surface via the Observable's error channel.
 */
@Injectable({ providedIn: 'root' })
export class CustomerContractService {
  private readonly http = inject(HttpClient);
  private readonly endpoint = `${environment.apiBaseUrl}/api/Settings/customer-contract`;

  /** GET — read the current customer terms & conditions text. */
  getContract(): Observable<CustomerContract> {
    return this.http
      .get<Envelope<CustomerContract>>(this.endpoint)
      .pipe(map((res) => res.data));
  }

  /** PUT — save the customer terms & conditions text. */
  saveContract(contractDetail: string): Observable<CustomerContract> {
    return this.http
      .put<Envelope<CustomerContract>>(this.endpoint, { contractDetail })
      .pipe(map((res) => res.data));
  }
}
