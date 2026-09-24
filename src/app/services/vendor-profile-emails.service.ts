import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

/** One vendor profile-completion email record. `status`: pending | sent | error | completed. */
export interface VendorProfileEmail {
  detailKey: string;
  vendorKey: string | null;
  vendorName: string;
  contactName: string;
  contactEmail: string;
  remarks: string;
  sendDate: string | null;
  status: 'pending' | 'sent' | 'error' | 'completed' | string;
}

interface Envelope<T> {
  status: boolean;
  data: T;
}

/** Vendor Profile Emails API client — targets `api/VendorProfileEmails` (read-only). */
@Injectable({ providedIn: 'root' })
export class VendorProfileEmailsService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/VendorProfileEmails`;

  getAll(): Observable<VendorProfileEmail[]> {
    return this.http.get<Envelope<VendorProfileEmail[]>>(this.apiBase).pipe(map((r) => r.data));
  }
}
