import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, catchError, of } from 'rxjs';
import {
  CustomerGrossProfitFilter,
  CustomerGrossProfitPerJob,
  CustomerGrossProfitExportRequest,
  PagedResult,
  LookupItem,
  OptionGuidValueDto,
} from '../models/report.model';
import { ApiResponse } from '../models/vendor.model';
import { environment } from '../../environments/environment';

type GrossProfitResponse = ApiResponse<PagedResult<CustomerGrossProfitPerJob>>;
type LookupResponse = ApiResponse<LookupItem[]>;

const FAIL_LOOKUP: LookupResponse = { success: false, message: 'Request failed', data: [] };

@Injectable({ providedIn: 'root' })
export class ReportService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/v1/reports`;
  private readonly lookupBase = `${environment.apiBaseUrl}`;

  getCustomerGrossProfit(
    filter: CustomerGrossProfitFilter,
    draw: number,
    start: number,
    length: number,
    sortCol: number,
    sortDir: string,
  ): Observable<GrossProfitResponse> {
    const params = new HttpParams()
      .set('draw', draw)
      .set('start', start)
      .set('length', length)
      .set('sortCol', sortCol)
      .set('sortDir', sortDir);

    const fallback: GrossProfitResponse = {
      success: false,
      message: 'Request failed',
      data: { draw, totalRecords: 0, filteredRecords: 0, data: [] },
    };

    return this.http
      .post<GrossProfitResponse>(`${this.apiBase}/customer-gross-profit`, filter, { params })
      .pipe(
        catchError((err) => {
          console.error('getCustomerGrossProfit failed:', err);
          return of(fallback);
        }),
      );
  }

  getCustomers(): Observable<ApiResponse<OptionGuidValueDto[]>> {
    return this.http
      .get<
        ApiResponse<OptionGuidValueDto[]>
      >(`${environment.apiBaseUrl}/RFISystemData/SystemSetupData/get-active-customers`)
      .pipe(
        catchError((err) => {
          console.error('getCustomers failed:', err);
          return of({
            success: false,
            message: 'Request failed',
            data: [] as OptionGuidValueDto[],
          });
        }),
      );
  }

  getPriorities(): Observable<ApiResponse<OptionGuidValueDto[]>> {
    return this.http
      .get<
        ApiResponse<OptionGuidValueDto[]>
      >(`${this.lookupBase}/RFISystemData/SystemSetupData/get-priority-list`)
      .pipe(
        catchError((err) => {
          console.error('getPriorities failed:', err);
          return of({
            success: false,
            message: 'Request failed',
            data: [] as OptionGuidValueDto[],
          });
        }),
      );
  }

  getAccountManagers(): Observable<ApiResponse<OptionGuidValueDto[]>> {
    return this.http
      .get<
        ApiResponse<OptionGuidValueDto[]>
      >(`${this.lookupBase}/RFISystemData/SystemSetupData/get-staff-list`)
      .pipe(
        catchError((err) => {
          console.error('getAccountManagers failed:', err);
          return of({
            success: false,
            message: 'Request failed',
            data: [] as OptionGuidValueDto[],
          });
        }),
      );
  }

  exportToExcel(request: CustomerGrossProfitExportRequest): Observable<Blob> {
    return this.http.post(`${this.apiBase}/customer-gross-profit/export`, request, {
      responseType: 'blob',
    });
  }

  getTrades(): Observable<ApiResponse<OptionGuidValueDto[]>> {
    return this.http
      .get<
        ApiResponse<OptionGuidValueDto[]>
      >(`${this.lookupBase}/RFISystemData/SystemSetupData/get-trades`)
      .pipe(
        catchError((err) => {
          console.error('getTrades failed:', err);
          return of({
            success: false,
            message: 'Request failed',
            data: [] as OptionGuidValueDto[],
          });
        }),
      );
  }
}
