import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface QuestionOption {
  key: string;
  text: string;
  value: string;
  sortOrder: number;
  active: boolean;
}

export interface Question {
  key: string;
  code: string;
  text: string;
  type: string;
  sortOrder: number;
  required: boolean;
  active: boolean;
  options: QuestionOption[];
}

export interface VendorQuestionSetupData {
  questionTypes: string[];
  questions: Question[];
}

interface Envelope<T> { status: boolean; data: T }

/**
 * Vendor Question Setup API client — targets `api/VendorQuestionSetup`. Questions + options
 * (option-based types), soft-delete via deactivate. Guid keys are strings.
 */
@Injectable({ providedIn: 'root' })
export class VendorQuestionSetupService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/VendorQuestionSetup`;

  get(): Observable<VendorQuestionSetupData> {
    return this.http.get<Envelope<VendorQuestionSetupData>>(this.apiBase).pipe(map((r) => r.data));
  }

  createQuestion(q: Omit<Question, 'key' | 'options'>): Observable<Question> {
    return this.http.post<Envelope<Question>>(`${this.apiBase}/questions`, q).pipe(map((r) => r.data));
  }

  updateQuestion(key: string, q: Omit<Question, 'key' | 'options'>): Observable<Question> {
    return this.http.put<Envelope<Question>>(`${this.apiBase}/questions/${key}`, q).pipe(map((r) => r.data));
  }

  deactivateQuestion(key: string): Observable<void> {
    return this.http.put<void>(`${this.apiBase}/questions/${key}/deactivate`, {});
  }

  addOption(questionKey: string, opt: Omit<QuestionOption, 'key'>): Observable<QuestionOption> {
    return this.http
      .post<Envelope<QuestionOption>>(`${this.apiBase}/questions/${questionKey}/options`, opt)
      .pipe(map((r) => r.data));
  }

  deactivateOption(key: string): Observable<void> {
    return this.http.put<void>(`${this.apiBase}/options/${key}/deactivate`, {});
  }
}
