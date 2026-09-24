import { Injectable, NgZone, inject } from '@angular/core';
import {
  HubConnection,
  HubConnectionBuilder,
  HubConnectionState,
  HttpTransportType,
} from '@microsoft/signalr';
import { environment } from '../../../environments/environment';
import { AuthTokenService } from '../../services/auth-token.service';
import { normalizeJobChatMessageDto, parseJobChatThreadReadEvent } from './job-chat-api-parse';
import type { JobChatMessageDto, JobChatThreadReadEventDto } from './live-chat.service';
import type { DepositApprovalDecidedDto } from '../job/deposit/deposit-approval-decided.model';
import type { AccountingNoteChangedDto } from '../accounting/move-to-accounting/accounting-note-changed.model';
import type { ChangeRequestChangedDto } from '../accounting/move-to-accounting/change-request.model';
import type { SendBackToServiceChangedDto } from '../accounting/move-to-accounting/send-back-to-service.model';
import type { JobRoutingChangedDto } from '../accounting/move-to-accounting/job-routing.model';
import type { StoreManagerVerificationChangedDto } from '../accounting/move-to-accounting/store-manager-verification.model';
import type { VendorPayableChangedDto } from '../accounting/move-to-accounting/vendor-payable.model';
import type { InvoiceCustomerCardChangedDto } from '../accounting/move-to-accounting/invoice-customer-card.model';

/**
 * Self-hosted SignalR on Job Ops (`/hubs/job-chat`). Staff clients join `JoinStaffInbox`
 * for live inbox/badge updates; vendor clients use per-thread groups on the same hub.
 */
@Injectable({ providedIn: 'root' })
export class JobChatSignalRService {
  private readonly auth = inject(AuthTokenService);
  private readonly ngZone = inject(NgZone);

  private hub?: HubConnection;
  private inboxJoined = false;
  private onMessage?: (dto: JobChatMessageDto) => void;
  private onThreadRead?: (dto: JobChatThreadReadEventDto) => void;
  private onDepositApprovalDecided?: (dto: DepositApprovalDecidedDto) => void;
  private onAccountingNoteChanged?: (dto: AccountingNoteChangedDto) => void;
  private onChangeRequestChanged?: (dto: ChangeRequestChangedDto) => void;
  private onJobRoutingChanged?: (dto: JobRoutingChangedDto) => void;
  private onStoreManagerVerificationChanged?: (dto: StoreManagerVerificationChangedDto) => void;
  // Multi-subscriber (unlike the other single-slot listeners above): both the vendor-payable card
  // and the new accounting-finalize-panel (2026-09-16) need to react to the same broadcasts
  // independently, and a single-slot setter would have the second registration silently overwrite
  // the first. Registration order otherwise follows the same setListener(handler) call shape as
  // every other event here, so existing call sites needed no changes.
  private readonly onVendorPayableChangedHandlers = new Set<(dto: VendorPayableChangedDto) => void>();
  private readonly onInvoiceCustomerCardChangedHandlers = new Set<(dto: InvoiceCustomerCardChangedDto) => void>();
  // Also multi-subscriber, same reasoning: the Move to Accounting page's own
  // SendBackToServiceNotificationService AND the Account Manager-facing "Sent Back to Service"
  // job-list page (SentBackToServiceComponent, 2026-09-16) both need independent live updates.
  private readonly onSendBackToServiceChangedHandlers = new Set<(dto: SendBackToServiceChangedDto) => void>();

  /** Registers a listener for deposit-approval-decided events on the existing staff inbox connection. */
  setDepositApprovalDecidedListener(handler: (dto: DepositApprovalDecidedDto) => void): void {
    this.onDepositApprovalDecided = handler;
  }

  /** Registers a listener for accounting-note-changed events on the existing staff inbox connection. */
  setAccountingNoteChangedListener(handler: (dto: AccountingNoteChangedDto) => void): void {
    this.onAccountingNoteChanged = handler;
  }

  /** Registers a listener for change-request-changed events (🔁 Send Change Request to Account
   *  Manager) on the existing staff inbox connection. */
  setChangeRequestChangedListener(handler: (dto: ChangeRequestChangedDto) => void): void {
    this.onChangeRequestChanged = handler;
  }

  /** Registers a listener for send-back-to-service-changed events (↩ Send Back to Service) on the
   *  existing staff inbox connection. Multi-subscriber -- returns an unsubscribe function, same
   *  reasoning as setVendorPayableChangedListener above. */
  setSendBackToServiceChangedListener(handler: (dto: SendBackToServiceChangedDto) => void): () => void {
    this.onSendBackToServiceChangedHandlers.add(handler);
    return () => this.onSendBackToServiceChangedHandlers.delete(handler);
  }

  /** Registers a listener for job-routing-changed events (JobRoutingLog: "Send back to Service" /
   *  "Send back to Accounting") on the existing staff inbox connection. */
  setJobRoutingChangedListener(handler: (dto: JobRoutingChangedDto) => void): void {
    this.onJobRoutingChanged = handler;
  }

  /** Registers a listener for store-manager-verification-changed events (✉ Store Manager
   *  Verification — Email) on the existing staff inbox connection. */
  setStoreManagerVerificationChangedListener(handler: (dto: StoreManagerVerificationChangedDto) => void): void {
    this.onStoreManagerVerificationChanged = handler;
  }

  /** Registers a listener for vendor-payable-changed events ("Approve Vendor(s) Payables")
   *  on the existing staff inbox connection. Multi-subscriber -- returns an unsubscribe function
   *  since more than one component (vendor-payable card, accounting-finalize-panel) may be alive
   *  and registering at once, unlike every other single-slot listener here. */
  setVendorPayableChangedListener(handler: (dto: VendorPayableChangedDto) => void): () => void {
    this.onVendorPayableChangedHandlers.add(handler);
    return () => this.onVendorPayableChangedHandlers.delete(handler);
  }

  /** Registers a listener for invoice-customer-card-changed events (automatic invoice creation,
   *  2026-09-15). Multi-subscriber, same reasoning as setVendorPayableChangedListener above. */
  setInvoiceCustomerCardChangedListener(handler: (dto: InvoiceCustomerCardChangedDto) => void): () => void {
    this.onInvoiceCustomerCardChangedHandlers.add(handler);
    return () => this.onInvoiceCustomerCardChangedHandlers.delete(handler);
  }

  /** Persistent staff inbox subscription (badge + live thread/list updates). */
  async ensureInboxConnected(
    onMessage: (dto: JobChatMessageDto) => void,
    onThreadRead?: (dto: JobChatThreadReadEventDto) => void,
  ): Promise<void> {
    this.onMessage = onMessage;
    this.onThreadRead = onThreadRead;
    if (this.hub?.state === HubConnectionState.Connected && this.inboxJoined) {
      return;
    }

    await this.disconnect();

    const token = this.auth.getToken();
    if (!token) return;

    const url = `${environment.apiBaseUrl}/hubs/job-chat`;
    this.hub = new HubConnectionBuilder()
      .withUrl(url, {
        accessTokenFactory: () => this.auth.getToken(),
        skipNegotiation: false,
        transport: HttpTransportType.WebSockets | HttpTransportType.ServerSentEvents,
      })
      .withAutomaticReconnect([0, 2000, 5000, 10000])
      .build();

    // Hub callbacks run outside Angular; re-enter the zone so open-thread UI (seen ticks) refreshes.
    this.hub.on('JobChatMessage', (raw: JobChatMessageDto) => {
      const dto = normalizeJobChatMessageDto(raw);
      if (!dto) return;
      this.ngZone.run(() => this.onMessage?.(dto));
    });

    this.hub.on('JobChatThreadRead', (raw: JobChatThreadReadEventDto) => {
      const dto = parseJobChatThreadReadEvent(raw);
      if (!dto) return;
      this.ngZone.run(() => this.onThreadRead?.(dto));
    });

    this.hub.on('DepositApprovalDecided', (dto: DepositApprovalDecidedDto) => {
      this.ngZone.run(() => this.onDepositApprovalDecided?.(dto));
    });

    this.hub.on('AccountingNoteChanged', (dto: AccountingNoteChangedDto) => {
      this.ngZone.run(() => this.onAccountingNoteChanged?.(dto));
    });

    this.hub.on('ChangeRequestChanged', (dto: ChangeRequestChangedDto) => {
      this.ngZone.run(() => this.onChangeRequestChanged?.(dto));
    });

    this.hub.on('SendBackToServiceChanged', (dto: SendBackToServiceChangedDto) => {
      this.ngZone.run(() => this.onSendBackToServiceChangedHandlers.forEach((h) => h(dto)));
    });

    this.hub.on('JobRoutingChanged', (dto: JobRoutingChangedDto) => {
      this.ngZone.run(() => this.onJobRoutingChanged?.(dto));
    });

    this.hub.on('StoreManagerVerificationChanged', (dto: StoreManagerVerificationChangedDto) => {
      this.ngZone.run(() => this.onStoreManagerVerificationChanged?.(dto));
    });

    this.hub.on('VendorPayableChanged', (dto: VendorPayableChangedDto) => {
      this.ngZone.run(() => this.onVendorPayableChangedHandlers.forEach((h) => h(dto)));
    });

    this.hub.on('InvoiceCustomerCardChanged', (dto: InvoiceCustomerCardChangedDto) => {
      this.ngZone.run(() => this.onInvoiceCustomerCardChangedHandlers.forEach((h) => h(dto)));
    });

    this.hub.onreconnected(() => {
      if (this.hub) {
        void this.hub.invoke('JoinStaffInbox');
      }
    });

    await this.hub.start();
    await this.hub.invoke('JoinStaffInbox');
    this.inboxJoined = true;
  }

  /** @deprecated Use {@link ensureInboxConnected}; kept for call sites during thread load. */
  async ensureConnected(
    _jobKey: string,
    _threadVendorKey: string | null,
    onMessage: (dto: JobChatMessageDto) => void,
    onThreadRead?: (dto: JobChatThreadReadEventDto) => void,
  ): Promise<void> {
    await this.ensureInboxConnected(onMessage, onThreadRead);
  }

  async disconnect(): Promise<void> {
    const h = this.hub;
    this.inboxJoined = false;
    this.hub = undefined;

    if (h && h.state === HubConnectionState.Connected) {
      try {
        await h.invoke('LeaveStaffInbox');
      } catch {
        /* leave best-effort */
      }
    }
    if (h) {
      try {
        await h.stop();
      } catch {
        /* stop best-effort */
      }
    }
  }
}
