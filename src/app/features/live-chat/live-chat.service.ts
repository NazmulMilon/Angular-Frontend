import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import {
  parseJobChatConversationList,
  parseJobChatPagedMessages,
  parseJobChatPostResult,
} from './job-chat-api-parse';

export interface JobChatMessageActionDto {
  id: string;
  label: string;
  type: string;
  jobKey?: string | null;
  estimateKey?: string | null;
}

export interface JobChatMessageDto {
  jobChatMessageKey: string;
  jobKey: string;
  senderType: number;
  senderKey: string;
  vendorKey: string | null;
  senderName: string;
  body: string;
  createdUtc: string;
  seenByRecipient?: boolean;
  seenByRecipientUtc?: string | null;
  actions?: JobChatMessageActionDto[];
  actionsConsumed?: boolean;
}

export interface JobChatPagedResponse {
  items: JobChatMessageDto[];
  pageNumber: number;
  pageSize: number;
  totalCount: number;
}

export interface JobChatThreadReadEventDto {
  jobKey: string;
  threadVendorKey: string | null;
  readerParticipantType: number;
  lastReadUtc: string;
}

export interface JobChatConversationSummaryDto {
  jobKey: string;
  jobLabel: string;
  /** Vendor for this inbox row; null = general job thread (messages with no vendor). */
  vendorKey: string | null;
  vendorLabel: string;
  lastMessagePreview: string;
  lastMessageUtc: string;
  lastSenderType?: number;
  isUnread?: boolean;
  unreadMessageCount?: number;
  messageCount: number;
}

export interface JobChatConversationListResponse {
  items: JobChatConversationSummaryDto[];
  pageNumber: number;
  pageSize: number;
  totalCount: number;
  totalUnreadMessageCount?: number;
}

@Injectable({
  providedIn: 'root',
})
export class LiveChatService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiBaseUrl}/api/v2/job-chat`;

  getConversations(pageNumber = 1, pageSize = 30): Observable<JobChatConversationListResponse | null> {
    const params = new HttpParams()
      .set('pageNumber', String(pageNumber))
      .set('pageSize', String(pageSize));
    return this.http
      .get<unknown>(`${this.apiBase}/conversations`, { params })
      .pipe(
        map((res) => parseJobChatConversationList(res)),
        catchError(() => of(null)),
      );
  }

  /**
   * @param thread `general` = only lines with no vendor; vendor GUID = that vendor’s thread; omit/`all` = entire job (legacy).
   */
  getMessages(
    jobKey: string,
    pageNumber = 1,
    pageSize = 100,
    thread?: string | null,
  ): Observable<JobChatPagedResponse | null> {
    let params = new HttpParams().set('pageNumber', String(pageNumber)).set('pageSize', String(pageSize));
    if (thread != null && thread !== '') {
      params = params.set('thread', thread);
    }
    return this.http
      .get<unknown>(`${this.apiBase}/jobs/${jobKey}/messages`, { params })
      .pipe(
        map((res) => parseJobChatPagedMessages(res)),
        catchError(() => of(null)),
      );
  }

  postMessage(
    jobKey: string,
    body: string,
    vendorKey?: string | null,
  ): Observable<{ ok: boolean; jobChatMessageKey?: string; senderName?: string }> {
    const payload: { body: string; vendorKey?: string } = { body };
    if (vendorKey) {
      payload.vendorKey = vendorKey;
    }
    return this.http
      .post<unknown>(`${this.apiBase}/jobs/${jobKey}/messages`, payload)
      .pipe(
        map((res) => {
          const data = parseJobChatPostResult(res);
          return data
            ? { ok: true, jobChatMessageKey: data.jobChatMessageKey, senderName: data.senderName }
            : { ok: false };
        }),
        catchError(() => of({ ok: false })),
      );
  }

  /** Mark staff read cursor for a thread (matches v1 mark-read on thread open). */
  markThreadRead(jobKey: string, thread?: string | null): Observable<boolean> {
    let params = new HttpParams();
    if (thread != null && thread !== '') {
      params = params.set('thread', thread);
    }
    return this.http.post<unknown>(`${this.apiBase}/jobs/${jobKey}/read`, {}, { params }).pipe(
      map(() => true),
      catchError(() => of(false)),
    );
  }
}
