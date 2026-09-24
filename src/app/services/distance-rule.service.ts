import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/** A distance rule. Fixed rows — only description and value are editable. */
export interface DistanceRule {
  pKey: number;
  description: string;
  value: number | null;
  enteredDate: string;
  lastChanged: string;
  changedBy: string;
}

interface Envelope<T> { status: boolean; data: T }

/** Distance Rule API client — targets `api/DistanceRule`. List + edit only; audit fields set server-side. */
@Injectable({ providedIn: 'root' })
export class DistanceRuleService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/DistanceRule`;

  getAll(): Observable<DistanceRule[]> {
    return this.http.get<Envelope<DistanceRule[]>>(this.apiBase).pipe(map((r) => r.data));
  }

  /** PUT /{pKey} — save a rule's description and value. */
  update(pKey: number, row: { description: string; value: number | null }): Observable<DistanceRule> {
    return this.http.put<Envelope<DistanceRule>>(`${this.apiBase}/${pKey}`, row).pipe(map((r) => r.data));
  }
}
