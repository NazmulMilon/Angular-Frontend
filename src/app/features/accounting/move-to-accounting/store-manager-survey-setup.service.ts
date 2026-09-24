import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { StoreManagerSurveyQuestionSetup } from './store-manager-survey-setup.model';

interface ApiWrapper<T> {
  status: boolean;
  responseCode: number;
  message: string;
  data: T;
}

/** Thin HTTP client for the store-manager survey's configured question list
 *  (ManageStoreManagerSurveyController) -- read-only use here, just to render the "🔗 Landing
 *  page" popup's un-sent/un-responded form preview with the REAL configured questions. */
@Injectable({ providedIn: 'root' })
export class StoreManagerSurveySetupService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/v1/ManageStoreManagerSurvey`;

  list(): Observable<ApiWrapper<StoreManagerSurveyQuestionSetup[]>> {
    return this.http.get<ApiWrapper<StoreManagerSurveyQuestionSetup[]>>(`${this.apiBase}/items`);
  }
}
