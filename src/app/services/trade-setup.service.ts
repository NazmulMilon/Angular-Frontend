import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface TradeCategory { key: string; name: string; level: number | null }
export interface TradeItem { id: string | null; name: string; level: number | null; categoryKey: string }
export interface TradeSetupData { categories: TradeCategory[]; trades: TradeItem[] }

interface CatApi { key: number; name: string; level: number | null }
interface TradeApi { id: string; name: string; level: number | null; categoryKey: number | null }
interface Envelope<T> { status: boolean; data: T }

const toCat = (c: CatApi): TradeCategory => ({ key: String(c.key), name: c.name, level: c.level });
const toTrade = (t: TradeApi): TradeItem => ({ id: t.id, name: t.name, level: t.level, categoryKey: t.categoryKey == null ? '' : String(t.categoryKey) });

/**
 * Trade Setup API client — targets `api/TradeSetup`. Categories (int keys, hard-delete-if-unused)
 * and trades (guid ids, soft-delete). Numeric category keys are mapped to strings.
 */
@Injectable({ providedIn: 'root' })
export class TradeSetupService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/TradeSetup`;

  get(): Observable<TradeSetupData> {
    return this.http.get<Envelope<{ categories: CatApi[]; trades: TradeApi[] }>>(this.apiBase).pipe(
      map((r) => ({ categories: r.data.categories.map(toCat), trades: r.data.trades.map(toTrade) })),
    );
  }

  // Categories
  createCategory(c: { name: string; level: number | null }): Observable<TradeCategory> {
    return this.http.post<Envelope<CatApi>>(`${this.apiBase}/categories`, c).pipe(map((r) => toCat(r.data)));
  }
  updateCategory(key: string, c: { name: string; level: number | null }): Observable<TradeCategory> {
    return this.http.put<Envelope<CatApi>>(`${this.apiBase}/categories/${key}`, c).pipe(map((r) => toCat(r.data)));
  }
  deleteCategory(key: string): Observable<void> {
    return this.http.delete<void>(`${this.apiBase}/categories/${key}`);
  }

  // Trades
  createTrade(t: { name: string; level: number | null; categoryKey: string }): Observable<TradeItem> {
    return this.http
      .post<Envelope<TradeApi>>(`${this.apiBase}/trades`, { name: t.name, level: t.level, categoryKey: Number(t.categoryKey) })
      .pipe(map((r) => toTrade(r.data)));
  }
  updateTrade(id: string, t: { name: string; level: number | null; categoryKey: string }): Observable<TradeItem> {
    return this.http
      .put<Envelope<TradeApi>>(`${this.apiBase}/trades/${id}`, { name: t.name, level: t.level, categoryKey: Number(t.categoryKey) })
      .pipe(map((r) => toTrade(r.data)));
  }
  deleteTrade(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiBase}/trades/${id}`);
  }
}
