import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { RejectVendorInvoiceLine, SaveVendorInvoiceEditLine, VendorInvoiceEdit } from './vendor-invoice-edit.model';

interface ApiWrapper<T> {
  status: boolean;
  responseCode: number;
  message: string;
  data: T;
}

/** Thin HTTP client for "🧾 Vendor Invoice EDIT MODE" -- backed by
 *  AdminAccountingInvoiceCustomerController's vendor-payables/{vendorKey}/invoice-edit endpoints. */
@Injectable({ providedIn: 'root' })
export class VendorInvoiceEditService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/v1/admin/accounting/invoice-customer`;

  get(jobKey: string, vendorKey: string): Observable<VendorInvoiceEdit> {
    return this.http
      .get<ApiWrapper<VendorInvoiceEdit>>(`${this.apiBase}/jobs/${jobKey}/vendor-payables/${vendorKey}/invoice-edit`)
      .pipe(map((res) => res.data));
  }

  save(
    jobKey: string,
    vendorKey: string,
    lines: SaveVendorInvoiceEditLine[],
    pendingRejections: RejectVendorInvoiceLine[] = [],
  ): Observable<ApiWrapper<boolean>> {
    return this.http.post<ApiWrapper<boolean>>(
      `${this.apiBase}/jobs/${jobKey}/vendor-payables/${vendorKey}/invoice-edit/save`,
      { lines, pendingRejections },
    );
  }

  rejectLines(jobKey: string, vendorKey: string, lines: RejectVendorInvoiceLine[]): Observable<ApiWrapper<boolean>> {
    return this.http.post<ApiWrapper<boolean>>(
      `${this.apiBase}/jobs/${jobKey}/vendor-payables/${vendorKey}/invoice-edit/reject-lines`,
      { lines },
    );
  }

  unrejectLine(jobKey: string, vendorKey: string, lineKey: string, isLabor: boolean): Observable<ApiWrapper<boolean>> {
    return this.http.post<ApiWrapper<boolean>>(
      `${this.apiBase}/jobs/${jobKey}/vendor-payables/${vendorKey}/invoice-edit/unreject-line`,
      { lineKey, isLabor },
    );
  }
}
