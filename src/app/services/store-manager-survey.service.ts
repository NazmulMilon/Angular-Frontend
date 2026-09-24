import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/** A store-manager survey factor row. `id` is the ScoreCardResponseKey; null when creating. */
export interface SurveyFactor {
  id: string | null;
  reasonCode: string;
  surveyFactor: string;
  displayLevel: number | null;
  added: string;
  lastEdited: string;
}

/** Backend item shape from `api/v1/ManageStoreManagerSurvey/items`. */
interface ItemApi {
  scoreCardResponseKey: string;
  reasonCode: string;
  displayLabel: string;
  displayLevel: number | null;
  addedOn: string | null;
  editedOn: string | null;
}

interface Envelope<T> {
  status: boolean;
  data: T;
}

const toFactor = (i: ItemApi): SurveyFactor => ({
  id: i.scoreCardResponseKey,
  reasonCode: i.reasonCode,
  surveyFactor: i.displayLabel,
  displayLevel: i.displayLevel,
  added: i.addedOn ? i.addedOn.slice(0, 10) : '',
  lastEdited: i.editedOn ? i.editedOn.slice(0, 10) : '',
});

/**
 * Store Manager Survey API client — targets the existing `api/v1/ManageStoreManagerSurvey`
 * endpoints. `surveyFactor` maps to `displayLabel`; `displayLevel` is required. Audit fields are
 * set server-side from the JWT.
 */
@Injectable({ providedIn: 'root' })
export class StoreManagerSurveyService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/v1/ManageStoreManagerSurvey/items`;

  /** GET — all survey factor rows. */
  getAll(): Observable<SurveyFactor[]> {
    return this.http.get<Envelope<ItemApi[]>>(this.apiBase).pipe(map((r) => (r.data ?? []).map(toFactor)));
  }

  /** POST — create a survey factor. */
  create(row: { reasonCode: string; surveyFactor: string; displayLevel: number | null }): Observable<SurveyFactor> {
    return this.http
      .post<Envelope<ItemApi>>(this.apiBase, {
        reasonCode: row.reasonCode,
        displayLabel: row.surveyFactor,
        displayLevel: row.displayLevel,
      })
      .pipe(map((r) => toFactor(r.data)));
  }

  /** PUT /{id} — update a survey factor. */
  update(id: string, row: { reasonCode: string; surveyFactor: string; displayLevel: number | null }): Observable<SurveyFactor> {
    return this.http
      .put<Envelope<ItemApi>>(`${this.apiBase}/${id}`, {
        reasonCode: row.reasonCode,
        displayLabel: row.surveyFactor,
        displayLevel: row.displayLevel,
      })
      .pipe(map((r) => toFactor(r.data)));
  }

  /** DELETE /{id} — hard-delete a survey factor (writes an ActionTrace server-side). */
  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiBase}/${id}`);
  }
}
