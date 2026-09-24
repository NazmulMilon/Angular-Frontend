import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface GridTitle {
  gridKey: number;
  gridName: string;
}

interface Envelope<T> {
  status: boolean;
  data: T;
}

/** Manage Grid Title API client — targets `api/DashboardGrid/titles`. Rename-only. */
@Injectable({ providedIn: 'root' })
export class ManageGridTitleService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/DashboardGrid/titles`;

  /** GET — editable grid titles (GridKey < 5 or > 1006), ordered by GridKey. */
  get(): Observable<GridTitle[]> {
    return this.http.get<Envelope<GridTitle[]>>(this.apiBase).pipe(map((r) => r.data));
  }

  /** PUT — rename the given grids (empty names skipped); returns the refreshed list. */
  save(grids: GridTitle[]): Observable<GridTitle[]> {
    return this.http.put<Envelope<GridTitle[]>>(this.apiBase, { grids }).pipe(map((r) => r.data));
  }
}
