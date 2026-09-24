import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/** A selectable trade. `key` is the Trade.ID. */
export interface TradeOption {
  key: string;
  name: string;
}

/** A selectable sales charge type (with a default description). `key` is the SalesChargeType.ID. */
export interface SalesChargeTypeOption {
  key: string;
  name: string;
  description: string;
}

/** A trade-charge template row (`DefaultTradeCharge`). */
export interface TradeChargeRow {
  pKey: string;
  tradeKey: string;
  tradeName: string;
  chargeTypeKey: string;
  chargeTypeName: string;
  description: string;
  amount: number | null;
}

/** The full screen payload. */
export interface TradeChargeTemplateData {
  trades: TradeOption[];
  chargeTypes: SalesChargeTypeOption[];
  rows: TradeChargeRow[];
}

/** Create/update payload for a row. */
export interface SaveTradeChargeRequest {
  tradeKey: string;
  chargeTypeKey: string;
  description: string;
  amount: number | null;
}

/** The Job Ops API wraps responses in `{ status, data, ... }`; each method unwraps `.data`. */
interface Envelope<T> {
  status: boolean;
  data: T;
}

/**
 * Trade Charge Template API client — targets `api/TradeChargeTemplate`.
 *
 * The `authInterceptor` attaches the bearer token; the server stamps the audit `Dby` from the JWT.
 */
@Injectable({ providedIn: 'root' })
export class TradeChargeTemplateService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/TradeChargeTemplate`;

  /** GET — trade & charge-type dropdowns plus all template rows. */
  get(): Observable<TradeChargeTemplateData> {
    return this.http.get<Envelope<TradeChargeTemplateData>>(this.apiBase).pipe(map((r) => r.data));
  }

  /** POST — create a new template row. */
  create(req: SaveTradeChargeRequest): Observable<TradeChargeRow> {
    return this.http.post<Envelope<TradeChargeRow>>(this.apiBase, req).pipe(map((r) => r.data));
  }

  /** PUT /{pKey} — update a template row. */
  update(pKey: string, req: SaveTradeChargeRequest): Observable<TradeChargeRow> {
    return this.http.put<Envelope<TradeChargeRow>>(`${this.apiBase}/${pKey}`, req).pipe(map((r) => r.data));
  }
}
