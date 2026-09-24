import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface TeamStaff {
  id: string;
  name: string;
  designation: string;
}

/** A team. `id` is null when creating. */
export interface Team {
  id: string | null;
  name: string;
  isActive: boolean;
  memberIds: string[];
  accountManagerId: string | null;
}

export interface TeamSetupData {
  staff: TeamStaff[];
  teams: Team[];
  /** PersonnelKey → display name for every team member (incl. deleted staff), so names always resolve. */
  memberNames: Record<string, string>;
}

interface Envelope<T> { status: boolean; data: T }

/**
 * Team Setup API client — targets `api/TeamSetup`. Company-scoped soft-delete; saving syncs the
 * member set + account-manager flag. Guid keys are strings.
 */
@Injectable({ providedIn: 'root' })
export class TeamSetupService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/TeamSetup`;

  get(): Observable<TeamSetupData> {
    return this.http.get<Envelope<TeamSetupData>>(this.apiBase).pipe(map((r) => r.data));
  }

  create(team: Omit<Team, 'id'>): Observable<Team> {
    return this.http.post<Envelope<Team>>(this.apiBase, team).pipe(map((r) => r.data));
  }

  update(id: string, team: Omit<Team, 'id'>): Observable<Team> {
    return this.http.put<Envelope<Team>>(`${this.apiBase}/${id}`, team).pipe(map((r) => r.data));
  }
}
