import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/** An account-manager survey factor row. `id` is the ScoreCardResponseKey; null when creating. */
export interface FeedbackFactor {
  id: string | null;
  reasonCode: string;
  surveyFactor: string;
  added: string;
  lastEdited: string;
}

/** Backend item shape from `api/v1/ManageAccountManagerSurvey/items`. */
interface ItemApi {
  scoreCardResponseKey: string;
  reasonCode: string;
  displayLabel: string;
  addedOn: string | null;
  editedOn: string | null;
}

interface Envelope<T> {
  status: boolean;
  data: T;
}

const toFactor = (i: ItemApi): FeedbackFactor => ({
  id: i.scoreCardResponseKey,
  reasonCode: i.reasonCode,
  surveyFactor: i.displayLabel,
  added: i.addedOn ? i.addedOn.slice(0, 10) : '',
  lastEdited: i.editedOn ? i.editedOn.slice(0, 10) : '',
});

/**
 * Account Manager Feedback API client — targets the existing `api/v1/ManageAccountManagerSurvey`
 * endpoints. The component's `surveyFactor` maps to the API's `displayLabel`. The `authInterceptor`
 * attaches the bearer token; audit fields (AddedBy/EditedBy) are set server-side from the JWT.
 */
@Injectable({ providedIn: 'root' })
export class AccountManagerFeedbackService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/v1/ManageAccountManagerSurvey/items`;

  /** GET — all survey factor rows. */
  getAll(): Observable<FeedbackFactor[]> {
    return this.http.get<Envelope<ItemApi[]>>(this.apiBase).pipe(map((r) => (r.data ?? []).map(toFactor)));
  }

  /** POST — create a survey factor. */
  create(row: { reasonCode: string; surveyFactor: string }): Observable<FeedbackFactor> {
    return this.http
      .post<Envelope<ItemApi>>(this.apiBase, { reasonCode: row.reasonCode, displayLabel: row.surveyFactor })
      .pipe(map((r) => toFactor(r.data)));
  }

  /** PUT /{id} — update a survey factor. */
  update(id: string, row: { reasonCode: string; surveyFactor: string }): Observable<FeedbackFactor> {
    return this.http
      .put<Envelope<ItemApi>>(`${this.apiBase}/${id}`, { reasonCode: row.reasonCode, displayLabel: row.surveyFactor })
      .pipe(map((r) => toFactor(r.data)));
  }

  /** DELETE /{id} — hard-delete a survey factor (writes an ActionTrace server-side). */
  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiBase}/${id}`);
  }
}
