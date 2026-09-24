import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/** A usergroup option for the staff form dropdown. */
export interface Usergroup {
  userGroupKey: string;
  groupName: string;
}

/** Full staff detail (Details view / Edit prefill). Password is decrypted; photoUrl may be empty. */
export interface StaffDetail {
  personnelKey: string;
  pid: string;
  name: string;
  phone: string;
  phoneExt: string;
  mobile: string;
  email: string;
  department: string;
  designation: string;
  usergr: string | null;
  usergroupName: string;
  username: string;
  password: string;
  photoUrl: string;
}

/** Create-staff payload. */
export interface StaffCreate {
  pid?: string;
  name: string;
  phone?: string;
  phoneExt?: string;
  mobile?: string;
  email?: string;
  department?: string;
  designation?: string;
  usergr?: string | null;
  username: string;
  password: string;
  confirmPassword: string;
  photoBase64?: string | null;
  photoContentType?: string | null;
}

/** Edit-staff basic-info payload (photo omitted = keep existing). */
export interface StaffEdit {
  pid?: string;
  name: string;
  phone?: string;
  phoneExt?: string;
  mobile?: string;
  email?: string;
  department?: string;
  designation?: string;
  photoBase64?: string | null;
  photoContentType?: string | null;
}

/** The Job Ops API wraps responses in `{ status, data, ... }`; each method unwraps `.data`. */
interface Envelope<T> {
  status: boolean;
  data: T;
}

/**
 * Staff management API client — targets `api/Staff` (usergroups, detail, create, edit, access).
 * The roster itself comes from `AdminEmailConfigService`. The `authInterceptor` attaches the token.
 */
@Injectable({ providedIn: 'root' })
export class StaffService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/Staff`;

  /** GET — usergroups for the dropdown. */
  getUsergroups(): Observable<Usergroup[]> {
    return this.http
      .get<Envelope<Usergroup[]>>(`${this.apiBase}/usergroups`)
      .pipe(map((res) => res.data ?? []));
  }

  /** GET — one staff member's full detail. */
  getDetail(personnelKey: string): Observable<StaffDetail> {
    return this.http
      .get<Envelope<StaffDetail>>(`${this.apiBase}/${personnelKey}`)
      .pipe(map((res) => res.data));
  }

  /** POST — create a staff member; returns the created detail. */
  create(dto: StaffCreate): Observable<StaffDetail> {
    return this.http
      .post<Envelope<StaffDetail>>(this.apiBase, dto)
      .pipe(map((res) => res.data));
  }

  /** PUT /{key} — edit basic info; returns the updated detail. */
  edit(personnelKey: string, dto: StaffEdit): Observable<StaffDetail> {
    return this.http
      .put<Envelope<StaffDetail>>(`${this.apiBase}/${personnelKey}`, dto)
      .pipe(map((res) => res.data));
  }

  /** PUT /{key}/access — update username + password (204, no body). */
  saveAccess(personnelKey: string, username: string, password: string): Observable<void> {
    return this.http.put<void>(`${this.apiBase}/${personnelKey}/access`, { username, password });
  }

  /**
   * GET /me/settings-access — whether the signed-in user may see the "Settings and Setup" entry point.
   * Temporary gate (single usergroup) until the V2 user-access module is built; resolved server-side from
   * the caller's own JWT. Any error (e.g. no token / 401) resolves to `false` so the button stays hidden.
   */
  hasSettingsAccess(): Observable<boolean> {
    return this.http
      .get<Envelope<{ hasAccess: boolean }>>(`${this.apiBase}/me/settings-access`)
      .pipe(
        map((res) => res.data?.hasAccess ?? false),
        catchError(() => of(false)),
      );
  }
}
