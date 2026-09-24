import {
  Component,
  ElementRef,
  ChangeDetectorRef,
  computed,
  effect,
  inject,
  OnDestroy,
  OnInit,
  afterRenderEffect,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import {
  JobChatConversationSummaryDto,
  JobChatMessageActionDto,
  JobChatMessageDto,
  JobChatThreadReadEventDto,
  LiveChatService,
} from './live-chat.service';
import { JobChatSignalRService } from './job-chat-signalr.service';
import { JobChatEstimateService } from './job-chat-estimate.service';
import { LiveChatBridgeService } from './live-chat-bridge.service';
import {
  OnsiteDeclineIncurredLine,
  OnsiteNegotiateLine,
  ThreadEstimateDto,
} from './job-chat-estimate.types';
import { environment } from '../../../environments/environment';
import { finalize } from 'rxjs/operators';
import {
  AdminCounterLineAction,
  AdminEstimateNegotiation,
  AdminEstimateNegotiationLine,
  NegotiationLineDecisionState,
} from '../../models/vendor-bills.model';
import { NegotiatingAgentService } from '../../services/negotiating-agent.service';
import {
  EstimateNegotiationLineComponent,
  NegotiationLineEditConfirmEvent,
} from '../../shared/components/estimate-negotiation-line/estimate-negotiation-line.component';

export interface ChatLineUi {
  id: string;
  text: string;
  from: 'user' | 'agent';
  senderName: string;
  senderType: number;
  at: Date;
  /** Epoch ms for receipt compare (avoids clock skew vs optimistic `new Date()`). */
  createdMs: number;
  seenByRecipient?: boolean;
  actions?: JobChatMessageActionDto[];
  actionsConsumed?: boolean;
}

/** Allow small client/server clock skew when applying SignalR read cursors. */
const THREAD_READ_SKEW_MS = 5000;

type PanelView = 'list' | 'thread';

type DeclineIncurredMode = 'decline' | 'bill-only';

interface NegotiateEditRow extends OnsiteNegotiateLine {
  editRate: string;
  editQty: string;
  editHour: string;
  editTech: string;
}

interface DeclineIncurredRowUi extends OnsiteDeclineIncurredLine {
  selected: boolean;
}

const ONSITE_SUBMITTED_PREFIX = 'Your RFI Contact is reviewing your on-site approval request';
const ONSITE_SUBMITTED_PREFIX_LEGACY = 'Your on-site approval request was submitted';

interface SystemLifecycleRule {
  kind: string;
  prefix: string;
  label: string;
}

const ONSITE_VENDOR_ACCEPTED_ADMIN_TEXT = 'Vendor approved the negotiated on-site approval';

const SYSTEM_LIFECYCLE_RULES: SystemLifecycleRule[] = [
  {
    kind: 'submitted',
    prefix: 'Your RFI Contact is reviewing your on-site approval request',
    label: 'Submitted',
  },
  { kind: 'submitted', prefix: 'Your on-site approval request was submitted', label: 'Submitted' },
  {
    kind: 'reviewing',
    prefix: 'Your on-site approval request is being reviewed',
    label: 'Under review',
  },
  { kind: 'reviewing', prefix: 'Your estimate is being reviewed', label: 'Under review' },
  { kind: 'action-required', prefix: 'RFI has updated your estimate', label: 'Action required' },
  {
    kind: 'vendor-accepted',
    prefix: "You've received your approval to proceed",
    label: 'Approved by vendor',
  },
  {
    kind: 'vendor-accepted',
    prefix: 'Vendor accepted the updated estimate',
    label: 'Approved by vendor',
  },
  {
    kind: 'vendor-accepted',
    prefix: 'You accepted the updated estimate',
    label: 'Approved by vendor',
  },
  {
    kind: 'approved',
    prefix: 'Your on-site approval estimate has been approved',
    label: 'Approved',
  },
  { kind: 'changes-requested', prefix: 'Changes were requested', label: 'Changes requested' },
  {
    kind: 'declined',
    prefix: 'Your on-site approval estimate has been declined',
    label: 'Declined',
  },
  {
    kind: 'site-update',
    prefix: 'Your on-site approval will not be completed today',
    label: 'Site update',
  },
];

/**
 * Global floating chat: **inbox** of vendor-scoped threads (job + vendor, or general per job) → open one to read/reply.
 */
@Component({
  selector: 'app-live-chat-widget',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, EstimateNegotiationLineComponent],
  templateUrl: './live-chat-widget.component.html',
  styleUrl: './live-chat-widget.component.scss',
})
export class LiveChatWidgetComponent implements OnInit, OnDestroy {
  readonly panelOpen = signal(false);
  readonly panelView = signal<PanelView>('list');
  readonly unreadCount = signal(0);
  /** FAB badge only (hidden while panel is open — matches v1). */
  readonly fabUnreadCount = signal(0);
  readonly onsiteVisualAlert = signal(false);
  readonly listStatusMessage = signal('');

  /** User-moved FAB position (viewport px). `null` = default bottom-right. */
  readonly fabPos = signal<{ left: number; top: number } | null>(null);
  readonly fabDragging = signal(false);
  private readonly viewport = signal({ w: 0, h: 0 });
  private fabDragMoved = false;
  private fabPosBeforeDrag: { left: number; top: number } | null = null;
  private fabDragOrigin: {
    pointerId: number;
    startX: number;
    startY: number;
    left: number;
    top: number;
  } | null = null;
  private fabPointerMoveHandler?: (e: PointerEvent) => void;
  private fabPointerUpHandler?: (e: PointerEvent) => void;
  private fabResizeHandler?: () => void;

  private static readonly FAB_STORAGE_KEY = 'rfi.liveChat.fabPos';
  private static readonly FAB_SIZE = 48;
  private static readonly FAB_EDGE = 8;
  private static readonly FAB_DRAG_THRESHOLD = 6;

  readonly fabCss = computed(() => {
    const p = this.fabPos();
    if (!p) {
      return {};
    }
    return {
      left: `${Math.round(p.left)}px`,
      top: `${Math.round(p.top)}px`,
      right: 'auto',
      bottom: 'auto',
    };
  });

  readonly panelCss = computed(() => {
    const p = this.fabPos();
    this.viewport(); // depend on resize
    if (!p) {
      return {};
    }
    return this.computePanelStyleNearFab(p);
  });

  private readonly messagesEl = viewChild<ElementRef<HTMLElement>>('messagesScroll');
  private readonly chat = inject(LiveChatService);
  private readonly jobSignal = inject(JobChatSignalRService);
  private readonly estimateApi = inject(JobChatEstimateService);
  private readonly negotiatingAgent = inject(NegotiatingAgentService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly chatBridge = inject(LiveChatBridgeService);
  private lastHandledOpenThreadRequestId = 0;

  /** Selected job when `panelView` is `thread`. */
  readonly selectedJobKey = signal<string | null>(null);
  /** `null` = general thread (messages with no vendor on this job); else vendor GUID string. */
  readonly selectedVendorKey = signal<string | null>(null);
  readonly selectedJobLabel = signal<string>('');

  /** Same as `selectedJobKey` — supports templates that call `jobKey()`. */
  readonly jobKey = this.selectedJobKey;

  conversations: JobChatConversationSummaryDto[] = [];
  readonly jobSearchTerm = signal('');
  listLoadError = false;
  newJobKeyInvalid = false;
  newJobKeyInput = '';
  /** Optional: enter a job ID when the job is not in the list yet (hidden until user taps New). */
  readonly showNewJobEntry = signal(false);

  messages = signal<ChatLineUi[]>([]);
  inputText = '';

  readonly estimateLoading = signal(false);
  private estimateLoadSeq = 0;
  private estimateSilentLoadInFlight = false;
  estimateEmptyMessage = 'No vendor estimate on this job yet.';
  currentEstimate: ThreadEstimateDto | null = null;
  estimateHtmlSafe: SafeHtml | null = null;
  estimateOriginalHtmlSafe: SafeHtml | null = null;
  showEstimateBody = false;
  showEstimateOriginal = false;
  estimateOriginalSummaryLabel = '';
  estimateVendorEditMsg = '';
  showEstimateVendorEdit = false;
  estimateDeltaText = '';
  showEstimateDelta = false;
  estimateStatusLabel = '';
  estimateStatusClasses: string[] = [];
  /** Compare highlight palette: vendor edits (green) vs admin negotiate (blue/amber). */
  estimateCompareMode: 'none' | 'vendor' | 'admin' | 'mixed' = 'none';

  actionModalOpen = false;
  actionModalTitle = '';
  actionModalHint = '';
  actionModalRemark = '';
  actionModalRemarkRequired = false;
  actionModalError = '';
  actionModalSubmitting = false;
  pendingEstimateAction:
    | 'approve'
    | 'reject'
    | 'decline'
    | 'go_home'
    | 'approve_on_behalf_and_vendor'
    | null = null;

  negotiatePanelOpen = false;
  negotiateLoading = false;
  negotiateLines: NegotiateEditRow[] = [];
  negotiateRemark = '';
  negotiateError = '';
  negotiateSubmitting = false;

  /** Chat/Negotiate tab-swap in the main pane. */
  readonly mainPaneView = signal<'chat' | 'negotiate'>('chat');
  readonly agentNegotiation = signal<AdminEstimateNegotiation | null>(null);
  readonly agentLoading = signal(false);
  readonly agentSubmitting = signal(false);
  readonly agentError = signal('');
  readonly agentStatusMessage = signal('');

  readonly agentPanelLines = computed(
    () => this.agentNegotiation()?.lines.filter((line) => line.counterThisLine) ?? [],
  );
  readonly agentPassthroughLines = computed(
    () => this.agentNegotiation()?.lines.filter((line) => !line.counterThisLine) ?? [],
  );
  readonly agentPanelSummary = computed(() => {
    const negotiation = this.agentNegotiation();
    const lines = negotiation?.lines ?? [];
    const vendorTotal =
      negotiation?.summary?.vendorProposedTotal ??
      lines.reduce((sum, line) => sum + line.vendorValue, 0);
    const counterTotal = lines.reduce(
      (sum, line) =>
        sum + (line.counterThisLine ? this.agentLineDisplayValue(line) : line.vendorValue),
      0,
    );
    const savingsAmount = vendorTotal - counterTotal;
    return {
      vendorTotal,
      counterTotal,
      savingsAmount,
      deltaPct:
        vendorTotal > 0 ? Math.round(((counterTotal - vendorTotal) / vendorTotal) * 100) : 0,
      confidencePct: this.toConfidencePct(negotiation?.summary?.overallConfidence),
      roundNumber: (negotiation?.roundsCount ?? 0) + 1,
      statusLabel: this.agentStatusLabel(negotiation?.status),
    };
  });
  readonly agentPanelPassthroughTotal = computed(() =>
    this.agentPassthroughLines().reduce((sum, line) => sum + line.vendorValue, 0),
  );
  readonly agentPanelPassthroughLabel = computed(() => {
    const lines = this.agentPassthroughLines();
    if (lines.length === 1) return this.agentLineItemLabel(lines[0]);
    return `${lines.length} incurred-cost lines`;
  });
  readonly agentPanelDneStatusLabel = computed(
    () => this.agentNegotiation()?.summary?.dneStatus?.trim() || 'Not available',
  );
  readonly agentPanelDneCommittedAmount = computed(
    () => this.agentNegotiation()?.dneSummary?.revisedDne ?? 0,
  );
  readonly agentPanelDneTotal = computed(
    () => this.agentNegotiation()?.dneSummary?.customerDne ?? 0,
  );
  readonly agentPanelDneCommittedPct = computed(() => {
    const total = this.agentPanelDneTotal();
    return total > 0
      ? Math.min(100, Math.round((this.agentPanelDneCommittedAmount() / total) * 100))
      : 0;
  });

  /** Circumference of the 15.5-radius rings used for every gauge in this panel. */
  private static readonly GAUGE_RING_CIRCUMFERENCE = 97.4;

  private readonly agentLineDecisions = signal<Record<string, NegotiationLineDecisionState>>({});
  private readonly agentLineExpand = signal<{ lineItemId: string; mode: 'edit' | 'info' | 'msg' } | null>(null);
  private readonly agentLineMessages = signal<Record<string, string>>({});
  private readonly agentLineMessageDrafts = signal<Record<string, string>>({});
  private agentRequestSeq = 0;
  private agentSilentLoadInFlight = false;

  declineIncurredModalOpen = false;
  declineIncurredMode: DeclineIncurredMode = 'decline';
  declineIncurredLines: DeclineIncurredRowUi[] = [];
  pendingDeclineRemark = '';
  declineIncurredError = '';
  declineIncurredStatus = '';
  declineIncurredSubmitting = false;
  /** Set when pop-up blocked after incurred invoice save — user can click to open. */
  pendingInvoiceOpenUrl = '';

  private readonly legacyBase = environment.legacyAdminBaseUrl.replace(/\/$/, '');

  private pollHandle?: ReturnType<typeof setInterval>;
  private markReadTimer?: ReturnType<typeof setTimeout>;
  private estimateSilentReloadTimer?: ReturnType<typeof setTimeout>;
  private lastInboxActivityMs = 0;
  private readonly pollMs = 3000;
  private visibilityHandler?: () => void;
  private messagesWheelEl?: HTMLElement;

  private readonly onMessagesWheel = (event: WheelEvent): void => {
    const el = event.currentTarget as HTMLElement | null;
    if (!el) return;
    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll <= 1) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const next = Math.min(maxScroll, Math.max(0, el.scrollTop + event.deltaY));
    el.scrollTop = next;
    event.preventDefault();
    event.stopPropagation();
  };

  constructor() {
    effect(() => {
      const request = this.chatBridge.openThreadRequest();
      if (!request || request.requestId === this.lastHandledOpenThreadRequestId) return;
      this.lastHandledOpenThreadRequestId = request.requestId;
      this.openThreadFor(request.jobKey, request.vendorKey);
    });

    // Non-passive wheel so preventDefault works; keeps scroll inside the thread pane.
    afterRenderEffect(() => {
      const el = this.panelOpen() && this.panelView() === 'thread' ? this.messagesEl()?.nativeElement : undefined;
      if (this.messagesWheelEl && this.messagesWheelEl !== el) {
        this.messagesWheelEl.removeEventListener('wheel', this.onMessagesWheel);
        this.messagesWheelEl = undefined;
      }
      if (el && this.messagesWheelEl !== el) {
        el.addEventListener('wheel', this.onMessagesWheel, { passive: false });
        this.messagesWheelEl = el;
      }
    });
  }

  ngOnInit(): void {
    this.syncViewport();
    this.loadFabPosition();
    this.fabResizeHandler = () => {
      this.syncViewport();
      this.clampFabToViewport();
    };
    window.addEventListener('resize', this.fabResizeHandler);

    void this.jobSignal.ensureInboxConnected(
      (dto) => this.onInboxMessage(dto),
      (dto) => this.onThreadReadEvent(dto),
    );
    this.refreshFabUnreadFromServer();
    this.visibilityHandler = () => {
      if (document.visibilityState !== 'visible' || !this.panelOpen()) return;
      if (this.panelView() === 'thread' && this.selectedJobKey() && !this.negotiatePanelOpen) {
        this.scheduleThreadEstimateReload(false);
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  ngOnDestroy(): void {
    this.stopPolling();
    this.clearMarkReadTimer();
    this.clearEstimateSilentReloadTimer();
    this.teardownFabDragListeners();
    if (this.fabResizeHandler) {
      window.removeEventListener('resize', this.fabResizeHandler);
      this.fabResizeHandler = undefined;
    }
    if (this.messagesWheelEl) {
      this.messagesWheelEl.removeEventListener('wheel', this.onMessagesWheel);
      this.messagesWheelEl = undefined;
    }
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = undefined;
    }
  }

  onFabPointerDown(ev: PointerEvent): void {
    if (ev.button !== 0) return;
    const el = ev.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    this.fabPosBeforeDrag = this.fabPos();
    const left = this.fabPosBeforeDrag?.left ?? rect.left;
    const top = this.fabPosBeforeDrag?.top ?? rect.top;
    // Switch from CSS bottom/right defaults to explicit left/top for dragging.
    this.fabPos.set(this.clampFabPoint(left, top));
    this.fabDragMoved = false;
    this.fabDragging.set(false);
    this.fabDragOrigin = {
      pointerId: ev.pointerId,
      startX: ev.clientX,
      startY: ev.clientY,
      left,
      top,
    };
    el.setPointerCapture?.(ev.pointerId);

    this.fabPointerMoveHandler = (e: PointerEvent) => this.onFabPointerMove(e, el);
    this.fabPointerUpHandler = (e: PointerEvent) => this.onFabPointerUp(e, el);
    document.addEventListener('pointermove', this.fabPointerMoveHandler);
    document.addEventListener('pointerup', this.fabPointerUpHandler);
    document.addEventListener('pointercancel', this.fabPointerUpHandler);
  }

  private onFabPointerMove(ev: PointerEvent, el: HTMLElement): void {
    const origin = this.fabDragOrigin;
    if (!origin || ev.pointerId !== origin.pointerId) return;
    const dx = ev.clientX - origin.startX;
    const dy = ev.clientY - origin.startY;
    if (!this.fabDragMoved) {
      if (
        Math.abs(dx) < LiveChatWidgetComponent.FAB_DRAG_THRESHOLD &&
        Math.abs(dy) < LiveChatWidgetComponent.FAB_DRAG_THRESHOLD
      ) {
        return;
      }
      this.fabDragMoved = true;
      this.fabDragging.set(true);
      ev.preventDefault();
    }
    this.fabPos.set(this.clampFabPoint(origin.left + dx, origin.top + dy));
  }

  private onFabPointerUp(ev: PointerEvent, el: HTMLElement): void {
    const origin = this.fabDragOrigin;
    if (!origin || ev.pointerId !== origin.pointerId) return;
    this.teardownFabDragListeners();
    try {
      el.releasePointerCapture?.(ev.pointerId);
    } catch {
      /* already released */
    }
    const moved = this.fabDragMoved;
    this.fabDragOrigin = null;
    this.fabDragging.set(false);
    this.fabDragMoved = false;
    if (moved) {
      this.persistFabPosition();
      return;
    }
    // Click (no drag): restore prior placement, then toggle.
    this.fabPos.set(this.fabPosBeforeDrag);
    this.togglePanel();
  }

  private teardownFabDragListeners(): void {
    if (this.fabPointerMoveHandler) {
      document.removeEventListener('pointermove', this.fabPointerMoveHandler);
      this.fabPointerMoveHandler = undefined;
    }
    if (this.fabPointerUpHandler) {
      document.removeEventListener('pointerup', this.fabPointerUpHandler);
      document.removeEventListener('pointercancel', this.fabPointerUpHandler);
      this.fabPointerUpHandler = undefined;
    }
  }

  private syncViewport(): void {
    this.viewport.set({
      w: typeof window !== 'undefined' ? window.innerWidth : 1280,
      h: typeof window !== 'undefined' ? window.innerHeight : 800,
    });
  }

  private clampFabPoint(left: number, top: number): { left: number; top: number } {
    const { w, h } = this.viewport();
    const edge = LiveChatWidgetComponent.FAB_EDGE;
    const size = LiveChatWidgetComponent.FAB_SIZE;
    const maxL = Math.max(edge, w - size - edge);
    const maxT = Math.max(edge, h - size - edge);
    return {
      left: Math.min(Math.max(edge, left), maxL),
      top: Math.min(Math.max(edge, top), maxT),
    };
  }

  private clampFabToViewport(): void {
    const p = this.fabPos();
    if (!p) return;
    const next = this.clampFabPoint(p.left, p.top);
    if (next.left !== p.left || next.top !== p.top) {
      this.fabPos.set(next);
      this.persistFabPosition();
    }
  }

  private loadFabPosition(): void {
    try {
      const raw = localStorage.getItem(LiveChatWidgetComponent.FAB_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { left?: unknown; top?: unknown };
      if (typeof parsed.left !== 'number' || typeof parsed.top !== 'number') return;
      if (!Number.isFinite(parsed.left) || !Number.isFinite(parsed.top)) return;
      this.fabPos.set(this.clampFabPoint(parsed.left, parsed.top));
    } catch {
      /* ignore bad storage */
    }
  }

  private persistFabPosition(): void {
    const p = this.fabPos();
    if (!p) return;
    try {
      localStorage.setItem(LiveChatWidgetComponent.FAB_STORAGE_KEY, JSON.stringify(p));
    } catch {
      /* quota / private mode */
    }
  }

  private computePanelStyleNearFab(fab: {
    left: number;
    top: number;
  }): Record<string, string> {
    const { w, h } = this.viewport();
    const margin = 14;
    const gap = 12;
    const fabSize = LiveChatWidgetComponent.FAB_SIZE;
    const panelW = Math.min(1120, Math.max(280, w - margin * 2));
    const panelH = Math.min(640, Math.max(280, h - 96));

    let left = fab.left + fabSize - panelW;
    left = Math.min(Math.max(margin, left), Math.max(margin, w - panelW - margin));

    const spaceAbove = fab.top - margin;
    const spaceBelow = h - (fab.top + fabSize) - margin;
    let top: number;
    if (spaceAbove >= panelH + gap || spaceAbove >= spaceBelow) {
      top = fab.top - gap - panelH;
    } else {
      top = fab.top + fabSize + gap;
    }
    top = Math.min(Math.max(margin, top), Math.max(margin, h - panelH - margin));

    return {
      left: `${Math.round(left)}px`,
      top: `${Math.round(top)}px`,
      right: 'auto',
      bottom: 'auto',
      width: `${Math.round(panelW)}px`,
      height: `${Math.round(panelH)}px`,
      maxHeight: `${Math.round(Math.max(280, h - margin * 2))}px`,
    };
  }

  togglePanel(): void {
    this.panelOpen.update((v) => !v);
    if (this.panelOpen()) {
      this.fabUnreadCount.set(0);
      this.newJobKeyInvalid = false;
      this.showNewJobEntry.set(false);
      this.panelView.set('list');
      this.selectedJobKey.set(null);
      this.selectedVendorKey.set(null);
      this.selectedJobLabel.set('');
      this.messages.set([]);
      this.inputText = '';
      this.resetEstimateColumn();
      void this.jobSignal.ensureInboxConnected(
        (dto) => this.onInboxMessage(dto),
        (dto) => this.onThreadReadEvent(dto),
      );
      this.loadConversationList();
      this.startPolling();
      this.scrollMessagesToBottomSoon();
    } else {
      this.stopPolling();
      this.refreshFabUnreadFromServer();
    }
  }

  closePanel(): void {
    this.stopPolling();
    this.panelOpen.set(false);
    this.newJobKeyInvalid = false;
    this.showNewJobEntry.set(false);
    this.panelView.set('list');
    this.selectedJobKey.set(null);
    this.selectedVendorKey.set(null);
    this.selectedJobLabel.set('');
    this.messages.set([]);
    this.inputText = '';
    this.newJobKeyInput = '';
    this.resetEstimateColumn();
    this.closeActionModal();
    this.closeNegotiatePanel();
    this.closeDeclineIncurredModal();
    this.refreshFabUnreadFromServer();
  }

  openThread(c: JobChatConversationSummaryDto): void {
    this.showNewJobEntry.set(false);
    this.selectedJobKey.set(c.jobKey);
    const vk = c.vendorKey?.trim() ? c.vendorKey.trim().toLowerCase() : null;
    this.selectedVendorKey.set(vk);
    const vendorPart = (c.vendorLabel || '').trim() || (vk ? 'Vendor' : 'General');
    const jobPart = (c.jobLabel || '').trim() || c.jobKey;
    this.selectedJobLabel.set(`${vendorPart} — ${jobPart}`);
    this.panelView.set('thread');
    this.inputText = '';
    this.resetEstimateColumn();
    this.markThreadReadForSelection();
    this.refreshThreadMessages();
    this.loadThreadEstimate(true);
  }

  backToList(): void {
    this.showNewJobEntry.set(false);
    this.panelView.set('list');
    this.selectedJobKey.set(null);
    this.selectedVendorKey.set(null);
    this.selectedJobLabel.set('');
    this.messages.set([]);
    this.inputText = '';
    this.resetEstimateColumn();
    this.closeActionModal();
    this.closeNegotiatePanel();
    this.closeDeclineIncurredModal();
    this.loadConversationList();
  }

  /** Open a job that has no row yet (first message will create the thread in the list). */
  openNewJobByKey(): void {
    const raw = this.newJobKeyInput?.trim() ?? '';
    if (!raw) return;
    this.newJobKeyInvalid = false;
    const normalized = this.normalizeGuid(raw);
    if (!normalized) {
      this.newJobKeyInvalid = true;
      return;
    }
    this.newJobKeyInput = '';
    this.selectedJobKey.set(normalized);
    this.selectedVendorKey.set(null);
    this.selectedJobLabel.set(normalized);
    this.panelView.set('thread');
    this.inputText = '';
    this.resetEstimateColumn();
    this.markThreadReadForSelection();
    this.chat.getMessages(normalized, 1, 1, 'all').subscribe((p) => {
      if (p === null) {
        this.panelView.set('list');
        this.selectedJobKey.set(null);
        this.selectedVendorKey.set(null);
        this.newJobKeyInvalid = true;
        this.showNewJobEntry.set(true);
        this.loadConversationList();
        return;
      }
      this.listLoadError = false;
      this.newJobKeyInvalid = false;
      this.showNewJobEntry.set(false);
      this.chat.getConversations(1, 100).subscribe((list) => {
        const row = list?.items?.find((c) => c.jobKey.toLowerCase() === normalized);
        if (row) {
          const vk = row.vendorKey?.trim() ? row.vendorKey.trim().toLowerCase() : null;
          this.selectedVendorKey.set(vk);
          const vendorPart = (row.vendorLabel || '').trim() || (vk ? 'Vendor' : 'General');
          const jobPart = (row.jobLabel || '').trim() || normalized;
          this.selectedJobLabel.set(`${vendorPart} — ${jobPart}`);
        }
        this.refreshThreadMessages();
        this.loadThreadEstimate(true);
      });
    });
  }

  /** Opens the panel directly onto a known job/vendor thread (e.g. from the estimate-chat interstitial). */
  private openThreadFor(jobKey: string, vendorKey: string | null): void {
    const normalizedJob = jobKey.trim().toLowerCase();
    if (!normalizedJob) return;
    const normalizedVendor = vendorKey?.trim() ? vendorKey.trim().toLowerCase() : null;

    this.panelOpen.set(true);
    this.fabUnreadCount.set(0);
    void this.jobSignal.ensureInboxConnected(
      (dto) => this.onInboxMessage(dto),
      (dto) => this.onThreadReadEvent(dto),
    );
    this.startPolling();

    this.showNewJobEntry.set(false);
    this.selectedJobKey.set(normalizedJob);
    this.selectedVendorKey.set(normalizedVendor);
    this.selectedJobLabel.set(normalizedJob);
    this.panelView.set('thread');
    this.inputText = '';
    this.resetEstimateColumn();
    this.markThreadReadForSelection();
    this.refreshThreadMessages();
    this.loadThreadEstimate(true);
    this.scrollMessagesToBottomSoon();

    this.chat.getConversations(1, 100).subscribe((list) => {
      const row = list?.items?.find(
        (c) =>
          c.jobKey.toLowerCase() === normalizedJob &&
          (c.vendorKey?.trim().toLowerCase() ?? null) === normalizedVendor,
      );
      if (!row) return;
      this.applyConversationList(list?.items ?? [], list?.totalUnreadMessageCount);
      const vendorPart = (row.vendorLabel || '').trim() || (normalizedVendor ? 'Vendor' : 'General');
      const jobPart = (row.jobLabel || '').trim() || normalizedJob;
      this.selectedJobLabel.set(`${vendorPart} — ${jobPart}`);
    });
  }

  send(): void {
    const text = this.inputText?.trim();
    if (!text) return;
    const jk = this.selectedJobKey();
    if (!jk) return;

    const vendorKey = this.selectedVendorKey();
    this.chat.postMessage(jk, text, vendorKey).subscribe((r) => {
      if (r.ok) {
        this.inputText = '';
        const now = Date.now();
        this.messages.update((list) => [
          ...list,
          {
            id: this.normMsgId(r.jobChatMessageKey ?? this.newId()),
            text,
            from: 'user',
            senderName: (r.senderName || '').trim(),
            senderType: 1,
            at: new Date(now),
            createdMs: now,
            seenByRecipient: false,
          },
        ]);
        this.scrollMessagesToBottomSoon();
        this.pollThreadNewMessages();
      } else {
        this.messages.update((list) => [
          ...list,
          {
            id: this.newId(),
            text: 'Could not send (sign in or check network).',
            from: 'agent',
            senderName: '',
            senderType: 0,
            at: new Date(),
            createdMs: Date.now(),
          },
        ]);
        this.scrollMessagesToBottomSoon();
      }
    });
  }

  labelFor(from: 'user' | 'agent'): string {
    return from === 'user' ? 'You' : 'Teammate';
  }

  formatListTime(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const now = new Date();
    const sameDay =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    if (sameDay) {
      return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    }
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  formatMessageTime(at: Date): string {
    if (Number.isNaN(at.getTime())) return '';
    return this.formatListTime(at.toISOString());
  }

  isActiveConversation(c: JobChatConversationSummaryDto): boolean {
    if (this.panelView() !== 'thread') return false;
    const jk = this.selectedJobKey();
    if (!jk || jk.toLowerCase() !== c.jobKey.toLowerCase()) return false;
    const cv = c.vendorKey?.trim() ? c.vendorKey.trim().toLowerCase() : null;
    return cv === this.selectedVendorKey();
  }

  threadVendorName(): string {
    const label = this.selectedJobLabel();
    const sep = label.indexOf(' — ');
    return sep >= 0 ? label.slice(0, sep).trim() : label || 'Chat';
  }

  threadJobName(): string {
    const label = this.selectedJobLabel();
    const sep = label.indexOf(' — ');
    return sep >= 0 ? label.slice(sep + 3).trim() : '';
  }

  threadScopeLine(): string {
    const scope =
      this.selectedVendorKey() == null || this.selectedVendorKey() === ''
        ? 'GENERAL'
        : this.threadVendorName().toUpperCase();
    const job = this.threadJobName();
    return job ? `${scope} · ${job}` : scope;
  }

  messageSenderLabel(m: ChatLineUi): string {
    const name = (m.senderName || '').trim();
    if (name) return name;
    if (m.senderType === 1) return 'RFI Staff';
    if (m.senderType === 2) return 'Vendor';
    return 'System';
  }

  cancelNewJobDraft(): void {
    this.showNewJobEntry.set(false);
    this.newJobKeyInput = '';
    this.newJobKeyInvalid = false;
  }

  toggleNewJobEntry(): void {
    const next = !this.showNewJobEntry();
    this.showNewJobEntry.set(next);
    if (!next) {
      this.newJobKeyInput = '';
      this.newJobKeyInvalid = false;
    }
  }

  private loadConversationList(): void {
    this.listLoadError = false;
    this.listStatusMessage.set('Loading inbox...');
    this.chat.getConversations(1, 100).subscribe((res) => {
      this.listStatusMessage.set('');
      if (!res) {
        this.conversations = [];
        this.listLoadError = true;
        this.cdr.markForCheck();
        return;
      }
      this.applyConversationList(res.items ?? [], res.totalUnreadMessageCount);
      this.cdr.markForCheck();
    });
  }

  private applyConversationList(
    items: JobChatConversationSummaryDto[],
    totalUnread?: number,
  ): void {
    this.listLoadError = false;
    this.conversations = [...items];
    this.seedInboxActivityFromConversations(items);
    if (!this.panelOpen()) {
      this.syncUnreadBadge(items, totalUnread);
    }
    this.refreshOnsiteVisualFromConversations(items);
  }

  /** Server-backed FAB badge (v1: only while chat panel is closed). */
  private refreshFabUnreadFromServer(): void {
    if (this.panelOpen()) return;
    this.chat.getConversations(1, 100).subscribe((res) => {
      if (!res || this.panelOpen()) return;
      this.syncUnreadBadge(res.items ?? [], res.totalUnreadMessageCount);
    });
  }

  private syncUnreadBadge(items: JobChatConversationSummaryDto[], totalUnread?: number): void {
    let total: number | null = totalUnread ?? null;
    if (total == null || Number.isNaN(Number(total))) {
      total = 0;
      for (const c of items) {
        total += this.getUnreadMessageCount(c);
      }
    }
    const n = Math.max(0, Number(total));
    this.unreadCount.set(n);
    this.fabUnreadCount.set(n);
  }

  private refreshOnsiteVisualFromConversations(items: JobChatConversationSummaryDto[]): void {
    const hasUnreadOnsite = items.some(
      (c) => this.isThreadUnread(c) && this.isOnsiteSubmittedText(c.lastMessagePreview),
    );
    this.onsiteVisualAlert.set(hasUnreadOnsite);
  }

  vendorLabel(c: JobChatConversationSummaryDto): string {
    const vk = c.vendorKey?.trim();
    return (c.vendorLabel || '').trim() || (vk ? 'Vendor' : 'General');
  }

  jobLabel(c: JobChatConversationSummaryDto): string {
    return (c.jobLabel || '').trim() || c.jobKey;
  }

  /** Filters the inbox list by PO/job label (e.g. "PO-12345") or raw job key. */
  filteredConversations(): JobChatConversationSummaryDto[] {
    const term = this.jobSearchTerm().trim().toLowerCase();
    if (!term) return this.conversations;
    return this.conversations.filter(
      (c) => this.jobLabel(c).toLowerCase().includes(term) || c.jobKey.toLowerCase().includes(term),
    );
  }

  onJobSearchInput(value: string): void {
    this.jobSearchTerm.set(value);
  }

  getUnreadMessageCount(c: JobChatConversationSummaryDto): number {
    if (c.unreadMessageCount != null && c.unreadMessageCount > 0) {
      return c.unreadMessageCount;
    }
    return c.isUnread ? 1 : 0;
  }

  isThreadUnread(c: JobChatConversationSummaryDto): boolean {
    return this.getUnreadMessageCount(c) > 0 || !!c.isUnread;
  }

  isOnsiteNew(c: JobChatConversationSummaryDto): boolean {
    return this.isThreadUnread(c) && this.isOnsiteSubmittedText(c.lastMessagePreview);
  }

  unreadCountLabel(c: JobChatConversationSummaryDto): string {
    const n = this.getUnreadMessageCount(c);
    return n > 99 ? '99+' : String(n);
  }

  systemLifecycleClass(text: string): string {
    return `live-chat__msg--system-${this.resolveSystemKind(text).kind}`;
  }

  systemLifecycleLabel(text: string): string {
    return this.resolveSystemKind(text).label;
  }

  /** Admin IM: vendor-accepted lines show admin-facing copy; stored body is vendor copy. */
  systemLifecycleDisplayText(text: string): string {
    if (this.resolveSystemKind(text).kind === 'vendor-accepted') {
      return ONSITE_VENDOR_ACCEPTED_ADMIN_TEXT;
    }
    return text;
  }

  showEstimateEmpty(): boolean {
    return !this.estimateLoading() && !this.showEstimateBody;
  }

  retryEstimateLoad(): void {
    this.loadThreadEstimate(true, false);
  }

  estimateHasActions(): boolean {
    const d = this.currentEstimate;
    return !!(
      d?.onsiteApproval &&
      (d?.canAct || d?.approveDisabled) &&
      ((d.allowedActions && d.allowedActions.length > 0) || d.approveDisabled)
    );
  }

  estimateApproveDisabled(): boolean {
    return !!this.currentEstimate?.approveDisabled;
  }

  estimateApproveDisabledReason(): string {
    return (
      this.currentEstimate?.approveDisabledReason ||
      'Waiting for the vendor to review your changes before you can approve.'
    );
  }

  estimateAllowedActions(): string[] {
    return this.currentEstimate?.allowedActions ?? [];
  }

  /**
   * Switch the estimate column to a sibling option (multi-option estimates only).
   * Reloads via the normal loadThreadEstimate path, so currentEstimate — and every
   * approve/negotiate/go-home call that reads currentEstimate.estimateKey — always
   * targets whichever option is currently selected here.
   */
  selectEstimateOption(optionEstimateKey: string): void {
    if (!optionEstimateKey || optionEstimateKey === this.currentEstimate?.estimateKey) return;
    this.loadThreadEstimate(false, false, optionEstimateKey);
  }

  /** Relative path from GetThreadEstimate — opens full V1 vendor estimate page. */
  vendorEstimatePageUrl(): string | undefined {
    return this.currentEstimate?.manageUrl;
  }

  openVendorEstimateInV1(): void {
    const path = this.vendorEstimatePageUrl();
    if (!path) return;
    this.openLegacyInvoiceUrl(path, null);
  }

  estimateShowApproved(): boolean {
    const d = this.currentEstimate;
    return !!(d?.onsiteApproval && d.status === 1 && !this.estimateHasActions());
  }

  estimateShowDeclined(): boolean {
    const d = this.currentEstimate;
    return !!(d?.onsiteApproval && d.status === 3);
  }

  estimateShowWaitingVendor(): boolean {
    const d = this.currentEstimate;
    return !!(d?.onsiteApproval && d.status === 0 && d.isCancelled && !d.canAct && !d.needsReview);
  }

  estimateShowNeedsReload(): boolean {
    const d = this.currentEstimate;
    return !!(d?.onsiteApproval && d.status === 0 && d.needsReview && !d.canAct);
  }

  private estimateLoadErrorMessage(data: ThreadEstimateDto | null): string {
    if (!data) {
      return 'Could not load estimate.';
    }
    if (data.error === 'not_authenticated') {
      return 'Estimate auth failed. Re-open this job from admin-dev via Assign Vendor (New) to refresh your sign-in token.';
    }
    if (data.error === 'network_error' || data.error === 'bad_gateway') {
      return data.message || 'Could not reach legacy admin.';
    }
    if (data.message) {
      return data.message;
    }
    if (data.error) {
      return `Could not load estimate (${data.error}).`;
    }
    return 'Could not load estimate.';
  }

  formatEstimateMoney(value: number | null | undefined): string {
    const x = Number(value);
    if (Number.isNaN(x)) return '$0.00';
    return `$${x.toFixed(2)}`;
  }

  openEstimateAction(
    action:
      | 'approve'
      | 'reject'
      | 'decline'
      | 'negotiate'
      | 'bill-incurred'
      | 'go_home'
      | 'get_customer_approval'
      | 'approve_on_behalf_and_vendor'
      | 'checkout_for_approval_later',
  ): void {
    if (action === 'negotiate') {
      this.setMainPaneView('negotiate');
      return;
    }
    if (action === 'bill-incurred') {
      this.openBillIncurredOnly();
      return;
    }
    // These two skip the shared confirm modal, mirroring the legacy admin (V1) widget exactly:
    // Get Customer Approval fires immediately (no confirmation needed), Checkout for Approval
    // Later is gated by a plain confirm() instead of the remark modal.
    if (action === 'get_customer_approval') {
      this.submitGetCustomerApproval();
      return;
    }
    if (action === 'checkout_for_approval_later') {
      this.submitCheckoutForApprovalLater();
      return;
    }
    if (!this.currentEstimate?.estimateKey) return;
    const titles: Record<
      'approve' | 'reject' | 'decline' | 'go_home' | 'approve_on_behalf_and_vendor',
      string
    > = {
      approve: 'Approve on-site estimate',
      reject: 'Reject for resubmission',
      decline: 'Decline on-site estimate',
      go_home: 'Send vendor home for today',
      approve_on_behalf_and_vendor: 'Approve on behalf of customer and approve vendor',
    };
    this.pendingEstimateAction = action;
    this.actionModalTitle = titles[action];
    this.actionModalRemarkRequired =
      action === 'reject' || action === 'decline' || action === 'approve_on_behalf_and_vendor';
    if (action === 'approve' && this.currentEstimate.approveDneMessage) {
      this.actionModalHint = this.currentEstimate.approveDneMessage;
    } else if (action === 'reject') {
      this.actionModalHint =
        'Describe in detail what changes the vendor needs to make to their on-site approval estimate.';
    } else if (action === 'approve_on_behalf_and_vendor') {
      this.actionModalHint =
        "Enter how the customer approved (contact name, verbal approval, or reference to uploaded proof).";
    } else if (action === 'go_home') {
      this.actionModalHint =
        'The vendor will receive a system message with a Check out button. The on-site estimate stays open until you approve or decline later.';
    } else {
      this.actionModalHint = '';
    }
    this.actionModalRemark = '';
    this.actionModalError = '';
    this.actionModalOpen = true;
  }

  /**
   * Get Customer Approval: sends the vendor a standby message and opens the vendor→customer
   * estimate split-screen builder in a new tab. No confirmation modal, matching V1.
   */
  submitGetCustomerApproval(): void {
    const estimateKey = this.currentEstimate?.estimateKey;
    if (!estimateKey) return;
    this.estimateApi.postGetCustomerApproval({ estimateKey }).subscribe((res) => {
      if (!res.ok) {
        this.listStatusMessage.set(res.message || res.error || 'Could not start customer approval.');
        return;
      }
      const path = res.splitScreenUrl || this.currentEstimate?.splitScreenUrl;
      if (path) {
        // Must open on legacy admin (V1), not V2 origin — same as workflow doc / V1 widget.
        const url = /^https?:\/\//i.test(path)
          ? path
          : `${this.legacyBase}${path.startsWith('/') ? path : '/' + path}`;
        window.open(url, '_blank', 'noopener');
      }
      this.loadThreadEstimate(false);
      this.refreshThreadMessages();
      this.loadConversationList();
      this.listStatusMessage.set('');
    });
  }

  /**
   * Check tech out while customer approval is still pending. Gated by a plain confirm(),
   * matching V1's click-delegation logic exactly (not the shared remark modal).
   */
  submitCheckoutForApprovalLater(): void {
    const estimateKey = this.currentEstimate?.estimateKey;
    if (!estimateKey) return;
    if (!window.confirm('Check the tech out now and leave the job pending customer approval?')) {
      return;
    }
    this.estimateApi.postCheckoutForApprovalLater({ estimateKey }).subscribe((res) => {
      if (!res.ok) {
        this.listStatusMessage.set(res.message || res.error || 'Checkout failed.');
        return;
      }
      this.loadThreadEstimate(false);
      this.refreshThreadMessages();
      this.loadConversationList();
      this.listStatusMessage.set('');
    });
  }

  // ── Negotiating agent tab (main pane) ───────────────────────────────

  setMainPaneView(view: 'chat' | 'negotiate'): void {
    this.mainPaneView.set(view);
    if (view === 'negotiate') {
      this.loadAgentNegotiation();
    }
  }

  /** Tabs only show when negotiate is actually available for this estimate (or already open). */
  showAgentTabs(): boolean {
    return (
      this.estimateAllowedActions().includes('negotiate') || this.mainPaneView() === 'negotiate'
    );
  }

  /** Untouched lines default to decline — only an explicit Accept or Edit changes the outcome. */
  agentLineDecisionFor(lineId: string): 'accept' | 'edit' | 'decline' {
    return this.agentLineDecisions()[lineId]?.decision ?? 'decline';
  }

  agentLineDecisionStateFor(lineId: string): NegotiationLineDecisionState | null {
    return this.agentLineDecisions()[lineId] ?? null;
  }

  /** Accept applies immediately (Edit goes through the shared component's own inline editor; untouched lines auto-decline on submit). */
  setAgentLineDecision(lineId: string, decision: 'accept'): void {
    this.closeAgentLineExpand();
    this.onAgentLineDecisionChange({ lineItemId: lineId, state: { decision } });
  }

  /** "Change" — return the line to pending so Use Counter / Edit show again. */
  reopenAgentLineDecision(lineId: string): void {
    this.agentLineDecisions.update((prev) => {
      const next = { ...prev };
      delete next[lineId];
      return next;
    });
    this.closeAgentLineExpand();
  }

  onAgentLineDecisionChange(event: { lineItemId: string; state: NegotiationLineDecisionState }): void {
    this.agentLineDecisions.update((prev) => ({ ...prev, [event.lineItemId]: event.state }));
  }

  /** Bridges the shared negotiation-line component's editConfirm event to the same decision update. */
  onAgentLineEditConfirm(line: AdminEstimateNegotiationLine, event: NegotiationLineEditConfirmEvent): void {
    this.onAgentLineDecisionChange({
      lineItemId: line.lineItemId,
      state: { decision: 'edit', editedQty: event.qty, editedValue: event.value },
    });
    this.closeAgentLineExpand();
  }

  isAgentLineExpandOpen(lineId: string, mode: 'edit' | 'info' | 'msg'): boolean {
    const open = this.agentLineExpand();
    return !!open && open.mode === mode && open.lineItemId === lineId;
  }

  closeAgentLineExpand(): void {
    this.agentLineExpand.set(null);
  }

  /** Bridges the shared component's expandModeChange to the existing open/close signal. */
  onAgentLineExpandModeChange(line: AdminEstimateNegotiationLine, mode: 'edit' | 'info' | 'msg' | null): void {
    if (mode === null) {
      this.closeAgentLineExpand();
      return;
    }
    if (mode === 'msg') {
      this.ensureAgentLineMessageDraft(line);
    }
    this.agentLineExpand.set({ lineItemId: line.lineItemId, mode });
  }

  private agentLineMessageDraft(line: AdminEstimateNegotiationLine): string {
    return (line.llmReasoning?.trim() || line.reasoning?.trim() || '').trim();
  }

  private ensureAgentLineMessageDraft(line: AdminEstimateNegotiationLine): void {
    const draft = this.agentLineMessageDraft(line);
    this.agentLineMessageDrafts.update((prev) => ({ ...prev, [line.lineItemId]: draft }));
    const existing = this.agentLineMessages()[line.lineItemId];
    if (existing === undefined) {
      this.agentLineMessages.update((prev) => ({ ...prev, [line.lineItemId]: draft }));
    }
  }

  agentLineMessage(lineItemId: string): string {
    return this.agentLineMessages()[lineItemId] ?? '';
  }

  setAgentLineMessage(lineItemId: string, message: string): void {
    this.agentLineMessages.update((prev) => ({ ...prev, [lineItemId]: message }));
  }

  isAgentLineMessageEdited(lineItemId: string): boolean {
    const current = this.agentLineMessages()[lineItemId];
    if (current === undefined) return false;
    const draft = this.agentLineMessageDrafts()[lineItemId] ?? '';
    return current !== draft;
  }

  resetAgentLineMessage(line: AdminEstimateNegotiationLine): void {
    const draft = this.agentLineMessageDrafts()[line.lineItemId] ?? this.agentLineMessageDraft(line);
    this.setAgentLineMessage(line.lineItemId, draft);
  }

  /** stroke-dashoffset for a ring at the given fill percent (0–100). */
  gaugeDashOffset(pct: number): number {
    return LiveChatWidgetComponent.GAUGE_RING_CIRCUMFERENCE * (1 - pct / 100);
  }

  /** Displayed counter value reacts to the decision: Accept/pending show the AI suggestion,
   * Decline reverts to the vendor's original ask (no counter on that line), Edit shows
   * whatever the admin typed. */
  agentLineDisplayValue(line: AdminEstimateNegotiationLine): number {
    if (!line.counterThisLine) return line.vendorValue;
    const state = this.agentLineDecisionStateFor(line.lineItemId);
    if (!state || state.decision === 'accept') return line.suggestedValue;
    if (state.decision === 'decline') return line.vendorValue;
    return state.editedValue ?? line.suggestedValue;
  }

  agentLineDisplayDeltaPct(line: AdminEstimateNegotiationLine): number {
    if (!line.vendorValue) return 0;
    const value = this.agentLineDisplayValue(line);
    return Math.round(((value - line.vendorValue) / line.vendorValue) * 100);
  }

  agentLineItemLabel(line: AdminEstimateNegotiationLine): string {
    return (
      line.itemName?.trim() || line.itemDescription?.trim() || line.itemCode?.trim() || 'Line item'
    );
  }

  canSubmitAgentCounter(): boolean {
    return (
      !!this.agentNegotiation()?.recommendationsReady &&
      this.agentPanelLines().length > 0 &&
      !this.agentLoading() &&
      !this.agentSubmitting()
    );
  }

  acceptAllAgentRecommendations(): void {
    const estimateKey = this.currentEstimate?.estimateKey;
    if (!estimateKey || !this.canSubmitAgentCounter()) return;

    const decisions: Record<string, NegotiationLineDecisionState> = {};
    for (const line of this.agentPanelLines()) {
      decisions[line.lineItemId] = { decision: 'accept' };
    }
    this.agentLineDecisions.set(decisions);
    this.closeAgentLineExpand();
    this.submitAgentCounterRequest(
      estimateKey,
      this.negotiatingAgent.acceptAll(estimateKey),
      'Agent recommendations accepted and sent to the vendor.',
    );
  }

  sendAgentCounter(): void {
    const estimateKey = this.currentEstimate?.estimateKey;
    const negotiation = this.agentNegotiation();
    if (!estimateKey || !negotiation || !this.canSubmitAgentCounter()) return;

    const actions: AdminCounterLineAction[] = this.agentPanelLines().map((line) => {
      const state = this.agentLineDecisionStateFor(line.lineItemId);
      const decision = state?.decision ?? 'decline';
      const notes = this.agentLineMessage(line.lineItemId) || null;

      if (decision === 'decline') {
        return {
          lineItemId: line.lineItemId,
          action: 'decline',
          value: line.vendorValue,
          qty: line.suggestedQty ?? null,
          notes,
        };
      }
      if (decision === 'edit') {
        return {
          lineItemId: line.lineItemId,
          action: 'edit',
          value: state?.editedValue ?? line.suggestedValue,
          qty: state?.editedQty ?? line.suggestedQty ?? null,
          notes,
        };
      }
      // The negotiating agent requires action=accept to submit its OWN suggested_value
      // exactly (ACCEPT_VALUE_MISMATCH otherwise). A locked vendor rate can raise
      // suggestedValue above the agent's raw recommendation — those lines must go
      // through action=edit instead, the only action that lets us submit a value the
      // agent didn't itself suggest.
      return {
        lineItemId: line.lineItemId,
        action: line.lockedRate != null && line.lockedRate > 0 ? 'edit' : 'accept',
        value: line.suggestedValue,
        qty: line.suggestedQty ?? null,
        notes,
      };
    });

    const invalidEdit = actions.some(
      (action) => action.action === 'edit' && (!Number.isFinite(action.value) || action.value < 0),
    );
    if (invalidEdit) {
      this.agentError.set('Enter a valid counter value for every edited line.');
      return;
    }

    this.submitAgentCounterRequest(
      estimateKey,
      this.negotiatingAgent.sendCounter(estimateKey, {
        roundNumber: (negotiation.roundsCount ?? 0) + 1,
        actions,
        notesToVendor: null,
      }),
      'Counter sent to the vendor.',
    );
  }

  retryAgentNegotiation(): void {
    this.loadAgentNegotiation(true);
  }

  /**
   * Vendor edits/counters to an on-site estimate reuse the same `estimateKey` (BR-4), so
   * `loadAgentNegotiation`'s same-key cache guard would otherwise never refetch once the
   * Negotiate tab has loaded a recommendation once — the admin previously had to reload the
   * whole page to see the vendor's new numbers. Silently re-pull on each poll tick, mirroring
   * the unconditional `currentEstimate` poll above, but only when nothing local would be lost:
   * no in-progress per-line decision, no open edit box, not mid-submit.
   */
  private maybeSilentlyRefreshAgentNegotiation(): void {
    if (this.mainPaneView() !== 'negotiate') return;
    if (!this.agentNegotiation()) return;
    if (this.agentSubmitting() || this.negotiateSubmitting) return;
    if (this.agentLineExpand() !== null) return;
    if (Object.keys(this.agentLineDecisions()).length > 0) return;
    this.loadAgentNegotiation(true, true);
  }

  private loadAgentNegotiation(force = false, silent = false): void {
    const estimateKey = this.currentEstimate?.estimateKey;
    if (!estimateKey) {
      if (!silent) this.agentError.set('No estimate is available for negotiation.');
      return;
    }
    if (!force && this.agentNegotiation()?.estimateKey?.toLowerCase() === estimateKey.toLowerCase())
      return;
    if (silent && this.agentSilentLoadInFlight) return;

    const requestSeq = ++this.agentRequestSeq;
    if (silent) {
      this.agentSilentLoadInFlight = true;
    } else {
      this.agentLoading.set(true);
      this.agentError.set('');
      this.agentStatusMessage.set('');
    }

    this.negotiatingAgent
      .pollNegotiationUntilReady(estimateKey)
      .pipe(
        finalize(() => {
          if (silent) {
            this.agentSilentLoadInFlight = false;
          } else if (requestSeq === this.agentRequestSeq) {
            this.agentLoading.set(false);
          }
        }),
      )
      .subscribe(({ data, errorMessage }) => {
        if (
          requestSeq !== this.agentRequestSeq ||
          this.currentEstimate?.estimateKey !== estimateKey
        )
          return;
        // Re-check safety: local state may have changed while the silent request was in flight.
        if (silent && (this.agentLineExpand() !== null || Object.keys(this.agentLineDecisions()).length > 0))
          return;
        if (!data) {
          if (!silent) this.agentError.set(errorMessage || 'Could not load agent recommendations.');
          return;
        }
        if (silent && !this.agentNegotiationChanged(this.agentNegotiation(), data)) return;
        this.applyAgentNegotiation(data, estimateKey);
        if (errorMessage && !silent) this.agentError.set(errorMessage);
      });
  }

  /** Field-by-field compare so a silent refresh only re-renders when the vendor's numbers actually moved. */
  private agentNegotiationChanged(
    prev: AdminEstimateNegotiation | null,
    next: AdminEstimateNegotiation,
  ): boolean {
    if (!prev) return true;
    return (
      prev.estimateKey !== next.estimateKey ||
      prev.roundsCount !== next.roundsCount ||
      prev.status !== next.status ||
      prev.recommendationsReady !== next.recommendationsReady ||
      prev.showPanel !== next.showPanel ||
      prev.vendorEditedSinceSubmission !== next.vendorEditedSinceSubmission ||
      JSON.stringify(prev.lines) !== JSON.stringify(next.lines)
    );
  }

  private applyAgentNegotiation(data: AdminEstimateNegotiation, estimateKey: string): void {
    this.agentNegotiation.set(data);
    this.agentError.set(data.errorMessage?.trim() || '');
    this.agentStatusMessage.set(data.infoMessage?.trim() || '');

    this.agentLineDecisions.set({});
    this.agentLineExpand.set(null);
    this.agentLineMessages.set({});
    this.agentLineMessageDrafts.set({});

    if (data.estimateKey && data.estimateKey.toLowerCase() !== estimateKey.toLowerCase()) {
      this.agentError.set('The negotiating agent returned data for a different estimate.');
    }
  }

  private submitAgentCounterRequest(
    estimateKey: string,
    request: ReturnType<NegotiatingAgentService['sendCounter']>,
    successMessage: string,
  ): void {
    const requestSeq = ++this.agentRequestSeq;
    this.agentSubmitting.set(true);
    this.agentError.set('');
    this.agentStatusMessage.set('');

    request
      .pipe(
        finalize(() => {
          if (requestSeq === this.agentRequestSeq) this.agentSubmitting.set(false);
        }),
      )
      .subscribe((res) => {
        if (
          requestSeq !== this.agentRequestSeq ||
          this.currentEstimate?.estimateKey !== estimateKey
        )
          return;
        if (!res?.status || !res.data) {
          this.agentError.set(res?.message || 'Failed to send the negotiation counter.');
          return;
        }

        this.applyAgentNegotiation(res.data, estimateKey);
        const confirmation = res.data.infoMessage?.trim() || successMessage;
        if (res.data.partialFailure) {
          this.agentError.set(confirmation);
          this.agentStatusMessage.set('');
        } else {
          this.agentStatusMessage.set(confirmation);
        }
        this.loadThreadEstimate(false, true);
        this.refreshThreadMessages();
      });
  }

  private resetAgentNegotiation(): void {
    this.agentRequestSeq++;
    this.agentNegotiation.set(null);
    this.agentLoading.set(false);
    this.agentSubmitting.set(false);
    this.agentError.set('');
    this.agentStatusMessage.set('');
    this.agentLineDecisions.set({});
    this.agentLineExpand.set(null);
    this.agentLineMessages.set({});
    this.agentLineMessageDrafts.set({});
  }

  private toConfidencePct(value: number | null | undefined): number {
    const confidence = Number(value);
    if (!Number.isFinite(confidence) || confidence <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round(confidence <= 1 ? confidence * 100 : confidence)));
  }

  private agentStatusLabel(status: string | null | undefined): string {
    const value = status?.trim();
    if (!value) return 'Generating';
    return value
      .split('_')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  closeActionModal(): void {
    this.actionModalOpen = false;
    this.pendingEstimateAction = null;
    this.actionModalRemark = '';
    this.actionModalError = '';
    this.actionModalSubmitting = false;
  }

  confirmEstimateAction(): void {
    this.submitOnsiteAction(false);
  }

  submitOnsiteAction(forceApprove: boolean): void {
    if (!this.pendingEstimateAction || !this.currentEstimate?.estimateKey) return;
    const action = this.pendingEstimateAction;
    const remark = this.actionModalRemark.trim();
    if (this.actionModalRemarkRequired && !remark) {
      this.actionModalError = 'A remark is required for this action.';
      return;
    }

    this.actionModalError = '';

    if (action === 'approve_on_behalf_and_vendor') {
      this.actionModalSubmitting = true;
      this.estimateApi
        .postApproveOnBehalfAndVendor({
          estimateKey: this.currentEstimate.estimateKey,
          customerConversation: remark,
        })
        .subscribe((res) => {
          this.actionModalSubmitting = false;
          if (res.ok) {
            this.closeActionModal();
            this.loadThreadEstimate(false);
            this.refreshThreadMessages();
            this.loadConversationList();
            this.listStatusMessage.set('');
            return;
          }
          this.actionModalError = res.message || res.error || 'Action failed.';
        });
      return;
    }

    if (action === 'decline' && !forceApprove) {
      this.actionModalSubmitting = true;
      this.beginDeclineAfterRemark(remark);
      return;
    }

    if (action === 'go_home') {
      this.actionModalSubmitting = true;
      this.estimateApi
        .postGoHome({
          estimateKey: this.currentEstimate.estimateKey,
          adminRemark: remark || undefined,
        })
        .subscribe((res) => {
          this.actionModalSubmitting = false;
          if (res.ok) {
            this.closeActionModal();
            this.loadThreadEstimate(false);
            this.refreshThreadMessages();
            this.loadConversationList();
            this.listStatusMessage.set('');
            return;
          }
          this.actionModalError = res.message || res.error || 'Go Home failed.';
        });
      return;
    }

    this.actionModalSubmitting = true;
    this.estimateApi
      .postOnsiteAction({
        estimateKey: this.currentEstimate.estimateKey,
        action,
        adminRemark: remark || undefined,
        forceApprove: !!forceApprove,
      })
      .subscribe((res) => {
        this.actionModalSubmitting = false;
        if (res.ok) {
          this.closeActionModal();
          this.loadThreadEstimate(false);
          this.refreshThreadMessages();
          this.loadConversationList();
          this.listStatusMessage.set('');
          return;
        }
        if (res.error === 'dne_warning') {
          const msg = (res.message || 'DNE warning') + '\n\nApprove anyway?';
          if (window.confirm(msg)) {
            this.submitOnsiteAction(true);
          }
          return;
        }
        this.actionModalError = res.message || res.error || 'Action failed.';
      });
  }

  private beginDeclineAfterRemark(remark: string): void {
    const estimateKey = this.currentEstimate?.estimateKey;
    if (!estimateKey) {
      this.actionModalSubmitting = false;
      return;
    }
    this.estimateApi.getOnsiteDeclineIncurredLines(estimateKey).subscribe((res) => {
      this.actionModalSubmitting = false;
      if (!res?.ok) {
        this.actionModalError = res?.message || res?.error || 'Could not check incurred lines.';
        return;
      }
      if (res.hasIncurredLines && !res.alreadyInvoiced && res.lines && res.lines.length > 0) {
        this.openDeclineIncurredModal(res.lines, 'decline', remark);
        return;
      }
      this.executeDeclineAction(remark);
    });
  }

  private executeDeclineAction(remark: string): void {
    const estimateKey = this.currentEstimate?.estimateKey;
    if (!estimateKey) return;

    this.declineIncurredSubmitting = true;
    this.estimateApi
      .postOnsiteAction({
        estimateKey,
        action: 'decline',
        adminRemark: remark,
        forceApprove: false,
      })
      .subscribe((res) => {
        this.declineIncurredSubmitting = false;
        this.actionModalSubmitting = false;
        if (res.ok) {
          this.closeDeclineIncurredModal();
          this.closeActionModal();
          this.loadThreadEstimate(false);
          this.refreshThreadMessages();
          this.loadConversationList();
          this.listStatusMessage.set('');
          return;
        }
        const msg = res.message || res.error || 'Decline failed.';
        this.declineIncurredError = msg;
        this.actionModalError = msg;
      });
  }

  openBillIncurredOnly(): void {
    const estimateKey = this.currentEstimate?.estimateKey;
    if (!estimateKey) return;

    this.listStatusMessage.set('Loading incurred lines…');
    this.estimateApi.getOnsiteDeclineIncurredLines(estimateKey).subscribe((res) => {
      this.listStatusMessage.set('');
      if (!res?.ok) {
        this.listStatusMessage.set(res?.message || res?.error || 'Could not load incurred lines.');
        return;
      }
      if (!res.hasIncurredLines || !res.lines?.length) {
        this.listStatusMessage.set('There are no incurred costs on this estimate.');
        return;
      }
      if (res.alreadyInvoiced) {
        this.listStatusMessage.set(
          'An invoice was already created from incurred costs on this estimate.',
        );
        return;
      }
      this.openDeclineIncurredModal(res.lines, 'bill-only', '');
    });
  }

  openDeclineIncurredModal(
    lines: OnsiteDeclineIncurredLine[],
    mode: DeclineIncurredMode,
    remark: string,
  ): void {
    this.declineIncurredMode = mode;
    this.pendingDeclineRemark = remark;
    this.declineIncurredLines = lines.map((line) => ({ ...line, selected: true }));
    this.declineIncurredError = '';
    this.declineIncurredStatus = '';
    this.closeActionModal();
    this.declineIncurredModalOpen = true;
  }

  closeDeclineIncurredModal(): void {
    this.declineIncurredModalOpen = false;
    this.declineIncurredLines = [];
    this.pendingDeclineRemark = '';
    this.declineIncurredMode = 'decline';
    this.declineIncurredError = '';
    this.declineIncurredStatus = '';
    this.declineIncurredSubmitting = false;
    this.pendingInvoiceOpenUrl = '';
  }

  declineIncurredTitle(): string {
    return this.declineIncurredMode === 'decline'
      ? 'Bill incurred costs before declining'
      : 'Bill incurred costs';
  }

  declineIncurredSaveLabel(): string {
    return this.declineIncurredMode === 'decline'
      ? 'Save invoice & decline estimate'
      : 'Save invoice';
  }

  declineIncurredEstimateTotal(): number {
    return this.declineIncurredLines.reduce((sum, line) => sum + (Number(line.rowTotal) || 0), 0);
  }

  declineIncurredSelectedTotal(): number {
    return this.declineIncurredLines
      .filter((line) => line.selected)
      .reduce((sum, line) => sum + (Number(line.rowTotal) || 0), 0);
  }

  declineIncurredAllSelected(): boolean {
    return (
      this.declineIncurredLines.length > 0 &&
      this.declineIncurredLines.every((line) => line.selected)
    );
  }

  toggleDeclineIncurredSelectAll(checked: boolean): void {
    for (const line of this.declineIncurredLines) {
      line.selected = checked;
    }
  }

  saveDeclineIncurredInvoice(): void {
    const est = this.currentEstimate;
    if (!est?.estimateKey || !est.jobKey || !est.vendorKey) return;

    const selections = this.declineIncurredLines
      .filter((line) => line.selected)
      .map((line) => ({
        detailKey: line.detailKey,
        whichTable: line.whichTable,
      }));

    if (!selections.length) {
      this.declineIncurredError = 'Please select at least one incurred line.';
      return;
    }

    this.declineIncurredError = '';
    this.declineIncurredStatus = 'Creating vendor invoice…';
    this.declineIncurredSubmitting = true;
    this.pendingInvoiceOpenUrl = '';

    // Open tab synchronously (user click) so browsers allow navigation after async invoice save (v1 parity).
    const invoiceTab = this.openBlankLegacyTab();

    this.estimateApi
      .postOnsiteDeclineIncurredInvoice({
        estimateKey: est.estimateKey,
        jobKey: est.jobKey,
        vendorKey: est.vendorKey,
        detailList: selections,
      })
      .subscribe((res) => {
        if (!res.ok) {
          this.closeBlankLegacyTab(invoiceTab);
          this.declineIncurredError = res.message || res.error || 'Could not create invoice.';
          this.declineIncurredStatus = '';
          this.declineIncurredSubmitting = false;
          return;
        }

        const opened = this.openLegacyInvoiceUrl(res.invoiceUrl, invoiceTab);
        if (!opened && res.invoiceUrl) {
          this.pendingInvoiceOpenUrl = this.resolveLegacyUrl(res.invoiceUrl);
          this.declineIncurredStatus =
            'Invoice created. Your browser blocked the new tab — use the link below to open the vendor invoice.';
        }

        if (this.declineIncurredMode === 'decline') {
          if (opened) {
            this.declineIncurredStatus = 'Invoice created. Declining estimate…';
          }
          this.executeDeclineAction(this.pendingDeclineRemark);
          return;
        }

        this.declineIncurredSubmitting = false;
        this.closeDeclineIncurredModal();
        this.loadThreadEstimate(false);
        if (opened) {
          this.listStatusMessage.set('Vendor invoice created — opened in a new tab.');
        } else if (this.pendingInvoiceOpenUrl) {
          this.listStatusMessage.set(
            'Vendor invoice created — open the invoice using the link in the modal.',
          );
        }
      });
  }

  openPendingInvoiceUrl(): void {
    if (!this.pendingInvoiceOpenUrl) return;
    window.open(this.pendingInvoiceOpenUrl, '_blank', 'noopener,noreferrer');
  }

  openNegotiatePanel(): void {
    const estimateKey = this.currentEstimate?.estimateKey;
    if (!estimateKey) return;

    this.negotiatePanelOpen = true;
    this.negotiateLoading = true;
    this.negotiateLines = [];
    this.negotiateRemark = '';
    this.negotiateError = '';
    this.cdr.markForCheck();

    this.estimateApi
      .getOnsiteNegotiateLines(estimateKey)
      .pipe(
        finalize(() => {
          this.negotiateLoading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe((res) => {
        if (!res?.ok) {
          this.negotiateError =
            res?.message ||
            res?.error ||
            'Could not load estimate lines (check sign-in / legacy admin).';
          return;
        }
        if (!res.lines?.length) {
          this.negotiateError = 'No editable lines on this estimate.';
          return;
        }
        this.negotiateLines = res.lines.map((line) => this.toNegotiateEditRow(line));
      });
  }

  closeNegotiatePanel(): void {
    this.negotiatePanelOpen = false;
    this.negotiateLines = [];
    this.negotiateRemark = '';
    this.negotiateError = '';
    this.negotiateLoading = false;
    this.negotiateSubmitting = false;
  }

  submitNegotiate(): void {
    const estimateKey = this.currentEstimate?.estimateKey;
    if (!estimateKey || !this.negotiateLines.length) return;

    this.negotiateError = '';
    this.negotiateSubmitting = true;

    const remark = this.negotiateRemark.trim();
    this.estimateApi
      .postOnsiteNegotiate({
        estimateKey,
        adminRemark: remark || null,
        lines: this.collectNegotiateLines(),
      })
      .subscribe((res) => {
        this.negotiateSubmitting = false;
        if (res.ok) {
          this.closeNegotiatePanel();
          this.loadThreadEstimate(false);
          this.refreshThreadMessages();
          return;
        }
        this.negotiateError = res.message || res.error || 'Save failed.';
      });
  }

  onNegInputKeydown(event: KeyboardEvent): void {
    if (
      event.key === '.' ||
      event.key === ',' ||
      event.key === 'e' ||
      event.key === 'E' ||
      event.key === '-'
    ) {
      event.preventDefault();
    }
  }

  onNegInputBlur(
    row: NegotiateEditRow,
    field: 'editRate' | 'editQty' | 'editHour' | 'editTech',
  ): void {
    if (field === 'editRate' && this.isNegotiateRateReadOnly(row)) return;
    const whole = this.parseWholeNumber(row[field]);
    row[field] = Number.isNaN(whole) ? '' : String(Math.max(0, whole));
  }

  /** Labor + trip: rate locked; materials: rate + qty editable. */
  isNegotiateRateReadOnly(line: OnsiteNegotiateLine): boolean {
    if (line.rateEditable === false) return true;
    if (line.rateEditable === true) return false;
    if (line.labor === 'labor') return true;
    const label = (line.itemName || line.chargeTypeKey || '').toLowerCase();
    return label.includes('trip');
  }

  displayWholeNumber(val: number | undefined, fallback?: number): string {
    if (val == null) {
      return fallback != null ? String(Math.round(fallback)) : '';
    }
    const n = Number(val);
    return Number.isNaN(n) ? String(val) : String(Math.round(n));
  }

  private toNegotiateEditRow(line: OnsiteNegotiateLine): NegotiateEditRow {
    return {
      ...line,
      editRate: this.displayWholeNumber(line.rate),
      editQty: this.displayWholeNumber(line.qty),
      editHour: this.displayWholeNumber(line.hour),
      editTech: this.displayWholeNumber(line.tech, 1),
    };
  }

  private collectNegotiateLines(): OnsiteNegotiateLine[] {
    return this.negotiateLines.map((line) => {
      const copy: OnsiteNegotiateLine = {
        detailKey: line.detailKey,
        labor: line.labor,
        itemName: line.itemName,
        chargeTypeKey: line.chargeTypeKey,
        description: line.description,
        costIncurred: line.costIncurred,
        display: line.display,
        rateEditable: line.rateEditable,
      };
      if (this.isNegotiateRateReadOnly(line)) {
        if (line.rate != null) copy.rate = line.rate;
      } else {
        const rate = this.parseWholeNumber(line.editRate);
        if (!Number.isNaN(rate)) copy.rate = Math.max(0, rate);
      }
      if (line.labor === 'labor') {
        const hour = this.parseWholeNumber(line.editHour);
        const tech = this.parseWholeNumber(line.editTech);
        if (!Number.isNaN(hour)) copy.hour = Math.max(0, hour);
        if (!Number.isNaN(tech)) copy.tech = Math.max(0, tech);
      } else {
        const qty = this.parseWholeNumber(line.editQty);
        if (!Number.isNaN(qty)) copy.qty = Math.max(0, qty);
      }
      return copy;
    });
  }

  private parseWholeNumber(val: string | null | undefined): number {
    if (val == null || val === '') return NaN;
    const n = parseFloat(String(val).replace(/[^\d.-]/g, ''));
    return Number.isNaN(n) ? NaN : Math.round(n);
  }

  private resolveLegacyUrl(path: string): string {
    if (/^https?:\/\//i.test(path)) return path;
    const base = this.legacyBase;
    const combined = path.startsWith('/') ? `${base}${path}` : `${base}/${path}`;
    if (combined.startsWith('/') && typeof window !== 'undefined') {
      return `${window.location.origin}${combined}`;
    }
    return combined;
  }

  /** Pre-open blank tab on user gesture; navigate after async invoice save (avoids pop-up blockers). */
  private openBlankLegacyTab(): Window | null {
    try {
      return window.open('about:blank', '_blank');
    } catch {
      return null;
    }
  }

  private closeBlankLegacyTab(tab: Window | null): void {
    if (tab && !tab.closed) {
      try {
        tab.close();
      } catch {
        /* ignore */
      }
    }
  }

  /** Navigate pre-opened tab or open invoice URL; returns whether a tab was opened/navigated. */
  private openLegacyInvoiceUrl(path: string | undefined, preOpenedTab: Window | null): boolean {
    if (!path) return false;
    const url = this.resolveLegacyUrl(path);
    if (preOpenedTab && !preOpenedTab.closed) {
      try {
        preOpenedTab.location.href = url;
        preOpenedTab.opener = null;
        return true;
      } catch {
        this.closeBlankLegacyTab(preOpenedTab);
      }
    }
    const tab = window.open(url, '_blank', 'noopener,noreferrer');
    return tab != null;
  }

  private resolveSystemKind(text: string): SystemLifecycleRule {
    const first = (text || '').split('\n')[0].trim();
    for (const rule of SYSTEM_LIFECYCLE_RULES) {
      if (first.startsWith(rule.prefix)) return rule;
    }
    return { kind: 'update', prefix: '', label: 'Update' };
  }

  private isOnsiteSubmittedText(text: string): boolean {
    const first = (text || '').split('\n')[0].trim();
    return (
      first.startsWith(ONSITE_SUBMITTED_PREFIX) || first.startsWith(ONSITE_SUBMITTED_PREFIX_LEGACY)
    );
  }

  /** System / vendor chat activity that should refresh the estimate column. */
  private shouldRefreshEstimateFromChat(senderType: number, body: string): boolean {
    if (!this.currentEstimate?.onsiteApproval) return false;
    if (senderType === 2) return true;
    if (senderType !== 3) return false;
    const first = (body || '').split('\n')[0].trim();
    if (!first) return false;
    return SYSTEM_LIFECYCLE_RULES.some((rule) => first.startsWith(rule.prefix));
  }

  private seedInboxActivityFromConversations(items: JobChatConversationSummaryDto[]): void {
    let maxMs = 0;
    for (const c of items) {
      const ms = Date.parse(c.lastMessageUtc);
      if (!Number.isNaN(ms) && ms > maxMs) maxMs = ms;
    }
    if (maxMs > 0) this.lastInboxActivityMs = maxMs;
  }

  private startPolling(): void {
    this.stopPolling();
    this.pollHandle = setInterval(() => this.pollSync(), this.pollMs);
  }

  private stopPolling(): void {
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
      this.pollHandle = undefined;
    }
  }

  /** Poll inbox + active thread only while the panel is open (avoids spamming the API on every route). */
  private pollSync(): void {
    if (!this.panelOpen()) return;

    if (this.panelView() === 'thread' && this.selectedJobKey()) {
      this.pollThreadNewMessages();
      if (!this.negotiatePanelOpen && !this.negotiateSubmitting) {
        // Silent reload every poll tick (vendor edits often have no chat line).
        this.loadThreadEstimate(false, true);
      }
      this.maybeSilentlyRefreshAgentNegotiation();
    }

    this.chat.getConversations(1, 100).subscribe((res) => {
      if (!res) {
        if (this.panelView() === 'list') {
          this.listLoadError = true;
        }
        return;
      }
      this.applyConversationList(res.items ?? [], res.totalUnreadMessageCount);
      this.cdr.markForCheck();
    });
  }

  private pollThreadNewMessages(): void {
    const jk = this.selectedJobKey();
    if (!jk) return;
    this.chat.getMessages(jk, 1, 200, this.threadQuery()).subscribe((p) => {
      if (!p?.items) return;
      this.mergeThreadMessages(p.items);
    });
  }

  /** Merge polled messages and refresh read receipts (v1 updateMessageReceipts parity). */
  private mergeThreadMessages(items: JobChatMessageDto[]): void {
    let changed = false;
    let addedAny = false;
    let estimateRefreshHint = false;
    const byId = new Map(items.map((row) => [this.normMsgId(row.jobChatMessageKey), row]));

    this.messages.update((prev) => {
      const next = [...prev];

      for (const row of items) {
        const id = this.normMsgId(row.jobChatMessageKey);
        if (next.some((m) => this.normMsgId(m.id) === id)) continue;
        next.push(this.toChatLine(row));
        changed = true;
        addedAny = true;
        if (row.senderType === 2 && this.currentEstimate?.onsiteApproval) {
          estimateRefreshHint = true;
        }
        if (row.senderType === 3 && this.shouldRefreshEstimateFromChat(row.senderType, row.body)) {
          estimateRefreshHint = true;
        }
      }

      for (let i = 0; i < next.length; i++) {
        const m = next[i];
        const row = byId.get(this.normMsgId(m.id));
        if (!row || row.senderType !== 1) continue;
        const seen = !!row.seenByRecipient;
        const createdMs = this.parseUtcMs(row.createdUtc) ?? m.createdMs;
        if (m.seenByRecipient === seen && m.createdMs === createdMs) continue;
        changed = true;
        next[i] = {
          ...m,
          id: this.normMsgId(row.jobChatMessageKey),
          seenByRecipient: seen,
          at: new Date(createdMs),
          createdMs,
        };
      }

      return changed ? next : prev;
    });

    // Poll can surface vendor lines while SignalR is quiet — advance staff read cursor so
    // vendor mobile Seen ticks update without requiring a full thread reload.
    if (addedAny) {
      this.markThreadReadForSelection(true);
    }

    for (const row of items) {
      if (this.shouldRefreshEstimateFromChat(row.senderType, row.body)) {
        this.scheduleThreadEstimateReload(row.senderType === 3);
        estimateRefreshHint = false;
        break;
      }
    }

    if (estimateRefreshHint) {
      this.scheduleThreadEstimateReload(false);
    }

    if (changed) {
      this.scrollMessagesToBottomSoon();
      this.cdr.markForCheck();
    }
  }

  private refreshThreadMessages(): void {
    const jk = this.selectedJobKey();
    if (!jk) return;
    this.listStatusMessage.set('Loading messages...');
    this.chat.getMessages(jk, 1, 200, this.threadQuery()).subscribe((p) => {
      this.listStatusMessage.set('');
      if (!p) {
        this.messages.set([
          {
            id: 'err',
            text: 'Could not load messages for this job.',
            from: 'agent',
            senderName: '',
            senderType: 0,
            at: new Date(),
            createdMs: Date.now(),
          },
        ]);
        this.scrollMessagesToBottomSoon();
        return;
      }
      this.messages.set((p.items ?? []).map((row: JobChatMessageDto) => this.toChatLine(row)));
      this.scrollMessagesToBottomSoon();
      this.markThreadReadForSelection(true);
    });
  }

  /** Vendor advanced read cursor — update seen ticks on staff outgoing lines instantly. */
  private onThreadReadEvent(dto: JobChatThreadReadEventDto): void {
    if (Number(dto.readerParticipantType) !== 2) return;
    if (!this.panelOpen() || this.panelView() !== 'thread') return;
    const jk = this.selectedJobKey();
    if (!jk || dto.jobKey.toLowerCase() !== jk.toLowerCase()) return;
    if (!this.threadReadEventMatchesSelection(dto)) return;

    const readMs = this.parseUtcMs(dto.lastReadUtc);
    if (readMs == null) {
      this.pollThreadNewMessages();
      return;
    }

    let changed = false;
    this.messages.update((list) =>
      list.map((m) => {
        if (m.senderType !== 1 || m.seenByRecipient) return m;
        // Include small skew so optimistic local timestamps still flip to Seen.
        if (m.createdMs > readMs + THREAD_READ_SKEW_MS) return m;
        changed = true;
        return { ...m, seenByRecipient: true };
      }),
    );
    if (changed) this.cdr.detectChanges();
    // Authoritative refresh in case SignalR cursor/skew missed a bubble.
    this.pollThreadNewMessages();
  }

  private threadReadEventMatchesSelection(dto: JobChatThreadReadEventDto): boolean {
    const th = this.selectedVendorKey();
    const eventVk = dto.threadVendorKey
      ? dto.threadVendorKey.replace(/[{}]/g, '').trim().toLowerCase()
      : null;
    // Inbox "all"/unset vendor selection shows mixed lines — accept any thread read for this job.
    if (th == null || th === '') return true;
    return eventVk === th;
  }

  private onInboxMessage(dto: JobChatMessageDto): void {
    const isOnsiteNew = dto.senderType === 3 && this.isOnsiteSubmittedText(dto.body);
    const viewing = this.isViewingThread(dto);

    if (viewing) {
      this.appendMessageFromDto(dto);
      this.markThreadReadForSelection(true);
      if (this.shouldRefreshEstimateFromChat(dto.senderType, dto.body)) {
        this.scheduleThreadEstimateReload(dto.senderType === 3);
      }
    }

    if (this.panelOpen()) {
      if (!viewing) {
        this.patchConversationPreview(dto);
      }
      this.loadConversationList();
      if (isOnsiteNew) {
        this.onsiteVisualAlert.set(true);
      }
      this.cdr.markForCheck();
      return;
    }

    if (isOnsiteNew) {
      this.onsiteVisualAlert.set(true);
    }
    this.refreshFabUnreadFromServer();
  }

  private isViewingThread(dto: JobChatMessageDto): boolean {
    if (!this.panelOpen() || this.panelView() !== 'thread') return false;
    const current = this.selectedJobKey();
    if (!current || dto.jobKey.toLowerCase() !== current.toLowerCase()) return false;
    return this.messageMatchesSelectedThread(dto);
  }

  private appendMessageFromDto(dto: JobChatMessageDto): void {
    const id = this.normMsgId(dto.jobChatMessageKey);
    if (this.messages().some((m) => this.normMsgId(m.id) === id)) return;
    this.messages.update((list) => [...list, this.toChatLine(dto)]);
    this.scrollMessagesToBottomSoon();
  }

  private patchConversationPreview(dto: JobChatMessageDto): void {
    const jk = dto.jobKey.toLowerCase();
    const dtoVk = dto.vendorKey ? dto.vendorKey.replace(/[{}]/g, '').trim().toLowerCase() : null;
    const row = this.conversations.find((c) => {
      const ck = c.jobKey.toLowerCase();
      const cv = c.vendorKey?.trim() ? c.vendorKey.trim().toLowerCase() : null;
      return ck === jk && cv === dtoVk;
    });
    if (row) {
      row.lastMessagePreview = dto.body.length > 120 ? `${dto.body.slice(0, 120)}…` : dto.body;
      row.lastMessageUtc = dto.createdUtc;
      row.messageCount = (row.messageCount ?? 0) + 1;
      if (!this.isActiveConversation(row)) {
        row.isUnread = true;
        row.unreadMessageCount = (row.unreadMessageCount ?? 0) + 1;
      }
    } else {
      this.loadConversationList();
    }
  }

  private toChatLine(row: JobChatMessageDto): ChatLineUi {
    const createdMs = this.parseUtcMs(row.createdUtc) ?? Date.now();
    return {
      id: this.normMsgId(row.jobChatMessageKey),
      text: row.body,
      from: row.senderType === 1 ? 'user' : 'agent',
      senderName: row.senderName ?? '',
      senderType: row.senderType,
      at: new Date(createdMs),
      createdMs,
      seenByRecipient: !!row.seenByRecipient,
      actions: row.actions,
      actionsConsumed: row.actionsConsumed,
    };
  }

  private loadThreadEstimate(
    notifyReviewing = true,
    silent = false,
    estimateKeyOverride?: string,
  ): void {
    const jk = this.selectedJobKey();
    if (!jk) return;
    // Silent reloads (poll tick, debounced SignalR refresh) fetch without an explicit
    // estimateKey — default to whatever option is currently displayed so a background
    // refresh doesn't snap the switcher back to the default pick out from under the admin.
    // A non-silent load (opening a thread fresh, or a deliberate switcher click passing its
    // own key) is unaffected — this only fills in the gap when nothing was explicitly asked for.
    const effectiveEstimateKey = estimateKeyOverride ?? (silent ? this.currentEstimate?.estimateKey : undefined);
    if (silent && (this.estimateLoading() || this.estimateSilentLoadInFlight)) return;
    const seq = ++this.estimateLoadSeq;
    if (silent) {
      this.estimateSilentLoadInFlight = true;
    }
    if (!silent) {
      this.clearEstimateSilentReloadTimer();
      this.resetEstimateColumn();
      this.estimateLoading.set(true);
      this.cdr.markForCheck();
    }
    this.estimateApi
      .getThreadEstimate(jk, this.selectedVendorKey(), notifyReviewing, effectiveEstimateKey)
      .pipe(
        finalize(() => {
          if (silent) {
            this.estimateSilentLoadInFlight = false;
          }
          if (!silent && seq === this.estimateLoadSeq) {
            this.estimateLoading.set(false);
            this.cdr.markForCheck();
          }
        }),
      )
      .subscribe((data) => {
        if (seq !== this.estimateLoadSeq) return;
        if (!data || !data.ok) {
          if (silent && this.showEstimateBody) return;
          this.estimateEmptyMessage = this.estimateLoadErrorMessage(data);
          this.showEstimateBody = false;
          this.cdr.markForCheck();
          return;
        }
        if (!data.hasEstimate || !data.html) {
          if (silent && this.showEstimateBody) return;
          this.estimateEmptyMessage = 'No vendor estimate on this job yet.';
          this.showEstimateBody = false;
          this.cdr.markForCheck();
          return;
        }
        if (silent && !this.estimateSnapshotChanged(this.currentEstimate, data)) {
          return;
        }
        this.applyEstimateDto(data);
        if (data.reviewingPosted) {
          this.pollThreadNewMessages();
        }
        this.cdr.markForCheck();
      });
  }

  /** Debounce silent estimate reloads (SignalR / poll) to avoid request races. */
  private scheduleThreadEstimateReload(notifyReviewing = false): void {
    if (this.negotiatePanelOpen || this.negotiateSubmitting) return;
    this.clearEstimateSilentReloadTimer();
    this.estimateSilentReloadTimer = setTimeout(() => {
      this.estimateSilentReloadTimer = undefined;
      if (this.panelView() === 'thread' && this.selectedJobKey()) {
        this.loadThreadEstimate(notifyReviewing, true);
      }
    }, 250);
  }

  private clearEstimateSilentReloadTimer(): void {
    if (this.estimateSilentReloadTimer) {
      clearTimeout(this.estimateSilentReloadTimer);
      this.estimateSilentReloadTimer = undefined;
    }
  }

  private applyEstimateDto(data: ThreadEstimateDto): void {
    const previousEstimateKey = this.currentEstimate?.estimateKey;
    if (
      previousEstimateKey &&
      data.estimateKey &&
      previousEstimateKey.toLowerCase() !== data.estimateKey.toLowerCase()
    ) {
      this.mainPaneView.set('chat');
      this.resetAgentNegotiation();
    }
    this.currentEstimate = data;
    const processed = this.processEstimateHtml(data.html ?? '');
    this.estimateCompareMode = processed.compareMode;
    this.estimateHtmlSafe = this.sanitizer.bypassSecurityTrustHtml(processed.html);
    this.applyEstimateStatusPill(data);
    this.showEstimateBody = true;
    this.showEstimateOriginal = false;
    this.estimateOriginalHtmlSafe = null;
    this.showEstimateVendorEdit = false;
    this.estimateVendorEditMsg = '';
    this.showEstimateDelta = false;
    this.estimateDeltaText = '';

    if (
      !this.shouldHideFreshOnsiteSubmitBanner(data) &&
      (data.editedByVendor ||
        data.isEdited ||
        data.hasComparison ||
        data.hasArchive ||
        data.needsReview ||
        data.vendorClearedReject)
    ) {
      this.showEstimateVendorEdit = true;
      if (data.hasComparison || data.hasArchive) {
        this.estimateVendorEditMsg =
          'Compare original vs current below. Light blue = new line; green = last edited by vendor; amber = last edited by admin.';
      } else if (data.vendorClearedReject) {
        this.estimateVendorEditMsg =
          'The vendor has resubmitted after your rejection. Review the updated estimate before acting.';
      } else if (data.editedByVendor && data.isEdited) {
        this.estimateVendorEditMsg =
          'This estimate was updated (vendor and admin edits). Review changes before acting.';
      } else if (data.editedByVendor) {
        this.estimateVendorEditMsg =
          'This vendor has edited and resubmitted the estimate. Review changes before acting.';
      } else {
        this.estimateVendorEditMsg =
          'This estimate was edited by admin. Review changes before acting.';
      }
    }

    if (data.totalsChanged && data.oldTotal != null) {
      this.showEstimateDelta = true;
      this.estimateDeltaText = `Total changed: ${this.formatEstimateMoney(data.oldTotal)} → ${this.formatEstimateMoney(data.invoiceTotal)}`;
    } else if (data.originalHtml && (data.editedByVendor || data.isEdited)) {
      this.showEstimateDelta = true;
      this.estimateDeltaText =
        'Line items updated (total unchanged — expand original estimate to compare)';
    }

    if (data.originalHtml && !data.hasComparison) {
      this.estimateOriginalSummaryLabel = (
        data.previousEstimateLabel || 'Original estimate'
      ).toLowerCase();
      this.estimateOriginalHtmlSafe = this.sanitizer.bypassSecurityTrustHtml(
        this.beautifyEstimateHtml(data.originalHtml),
      );
      this.showEstimateOriginal = true;
    }
  }

  /**
   * Vendor just submitted onsite (status 4); admin opened thread but has not edited yet.
   * needsReview is true from IsNew only — suppress the misleading "edited by admin" banner.
   */
  private shouldHideFreshOnsiteSubmitBanner(data: ThreadEstimateDto): boolean {
    if (!data.onsiteApproval || data.status !== 4) return false;
    if (
      data.isEdited ||
      data.editedByVendor ||
      data.hasArchive ||
      data.hasComparison ||
      data.vendorClearedReject ||
      data.totalsChanged
    ) {
      return false;
    }
    return !!data.needsReview;
  }

  private applyEstimateStatusPill(data: ThreadEstimateDto): void {
    const classes: string[] = [];
    if (data.status != null) {
      classes.push(`is-${data.status}`);
    }
    if (data.onsiteApproval) {
      classes.push('is-onsite');
    }
    this.estimateStatusClasses = classes;
    let label = data.statusLabel || 'Estimate';
    if (data.onsiteApproval) {
      label = `On-site · ${label}`;
    }
    this.estimateStatusLabel = label;
  }

  private resetEstimateColumn(): void {
    this.mainPaneView.set('chat');
    this.resetAgentNegotiation();
    this.currentEstimate = null;
    this.estimateLoading.set(false);
    this.estimateEmptyMessage = 'No vendor estimate on this job yet.';
    this.estimateHtmlSafe = null;
    this.estimateOriginalHtmlSafe = null;
    this.showEstimateBody = false;
    this.showEstimateOriginal = false;
    this.estimateOriginalSummaryLabel = '';
    this.showEstimateVendorEdit = false;
    this.estimateVendorEditMsg = '';
    this.showEstimateDelta = false;
    this.estimateDeltaText = '';
    this.estimateStatusLabel = '';
    this.estimateStatusClasses = [];
    this.estimateCompareMode = 'none';
    this.closeNegotiatePanel();
    this.closeDeclineIncurredModal();
  }

  private estimateSnapshotChanged(
    prev: ThreadEstimateDto | null,
    next: ThreadEstimateDto,
  ): boolean {
    if (!prev) return true;
    return (
      prev.estimateKey !== next.estimateKey ||
      prev.status !== next.status ||
      prev.invoiceTotal !== next.invoiceTotal ||
      prev.oldTotal !== next.oldTotal ||
      prev.totalsChanged !== next.totalsChanged ||
      prev.editedByVendor !== next.editedByVendor ||
      prev.isEdited !== next.isEdited ||
      prev.isNew !== next.isNew ||
      prev.isCancelled !== next.isCancelled ||
      prev.vendorClearedReject !== next.vendorClearedReject ||
      prev.needsReview !== next.needsReview ||
      prev.canAct !== next.canAct ||
      prev.hasComparison !== next.hasComparison ||
      prev.hasArchive !== next.hasArchive ||
      prev.archiveVersion !== next.archiveVersion ||
      (prev.originalHtml || '') !== (next.originalHtml || '') ||
      prev.vendorResubmitted !== next.vendorResubmitted ||
      (prev.html || '') !== (next.html || '')
    );
  }

  private processEstimateHtml(html: string): {
    html: string;
    compareMode: 'none' | 'vendor' | 'admin' | 'mixed';
  } {
    if (typeof DOMParser === 'undefined') {
      return { html, compareMode: 'none' };
    }
    const doc = new DOMParser().parseFromString(
      `<div class="legacy-job-chat-est-content">${html}</div>`,
      'text/html',
    );
    const root = doc.body.firstElementChild as HTMLElement | null;
    if (!root) return { html, compareMode: 'none' };

    root.querySelectorAll('[style]').forEach((el) => {
      const node = el as HTMLElement;
      node.style.removeProperty('font-family');
      node.style.removeProperty('font-size');
      node.style.removeProperty('font-weight');
      if (!node.getAttribute('style')) {
        node.removeAttribute('style');
      }
    });

    root.querySelectorAll('font').forEach((font) => {
      const parent = font.parentNode;
      if (!parent) return;
      while (font.firstChild) {
        parent.insertBefore(font.firstChild, font);
      }
      parent.removeChild(font);
    });

    root.querySelectorAll('h3').forEach((h) => h.classList.add('legacy-job-chat-est-heading'));
    root.querySelectorAll('table').forEach((table) => {
      if (!table.classList.contains('ljc-est-table')) {
        table.classList.add('legacy-job-chat-est-table');
      }
      const rows = table.querySelectorAll('tr');
      if (rows.length > 1 && !table.classList.contains('ljc-est-table')) {
        rows[rows.length - 1].classList.add('legacy-job-chat-est-total-row');
      }
    });

    const compareMode = this.detectCompareModeFromHtml(root.innerHTML);
    return { html: root.innerHTML, compareMode };
  }

  /** Backend emits ljc-est-row-*-vendor / ljc-est-row-*-admin per line (last editor vs latest archive). */
  private detectCompareModeFromHtml(html: string): 'none' | 'vendor' | 'admin' | 'mixed' {
    const hasVendor = /ljc-est-row-(?:new|changed)-vendor\b/.test(html);
    const hasAdmin = /ljc-est-row-(?:new|changed)-admin\b/.test(html);
    if (hasVendor && hasAdmin) return 'mixed';
    if (hasVendor) return 'vendor';
    if (hasAdmin) return 'admin';
    return 'none';
  }

  private beautifyEstimateHtml(html: string): string {
    return this.processEstimateHtml(html).html;
  }

  private markThreadReadForSelection(immediate = false): void {
    const jk = this.selectedJobKey();
    if (!jk) return;
    this.clearMarkReadTimer();
    if (!immediate) {
      this.markReadTimer = setTimeout(() => this.markThreadReadForSelection(true), 800);
      return;
    }
    const thread = this.threadQuery();
    this.chat.markThreadRead(jk, thread === 'all' ? undefined : thread).subscribe((ok) => {
      if (ok) {
        this.clearUnreadOnActiveConversation();
        this.chat.getConversations(1, 100).subscribe((res) => {
          if (res) {
            this.applyConversationList(res.items ?? [], res.totalUnreadMessageCount);
          }
        });
      }
    });
  }

  private clearMarkReadTimer(): void {
    if (this.markReadTimer) {
      clearTimeout(this.markReadTimer);
      this.markReadTimer = undefined;
    }
  }

  private clearUnreadOnActiveConversation(): void {
    const jk = this.selectedJobKey()?.toLowerCase();
    const vk = this.selectedVendorKey();
    if (!jk) return;
    for (const c of this.conversations) {
      if (c.jobKey.toLowerCase() !== jk) continue;
      const cv = c.vendorKey?.trim() ? c.vendorKey.trim().toLowerCase() : null;
      if (cv !== vk) continue;
      c.isUnread = false;
      c.unreadMessageCount = 0;
    }
  }

  private threadQuery(): string {
    const v = this.selectedVendorKey();
    return v == null || v === '' ? 'all' : v;
  }

  private messageMatchesSelectedThread(dto: JobChatMessageDto): boolean {
    const th = this.selectedVendorKey();
    const dtoVk = dto.vendorKey ? dto.vendorKey.replace(/[{}]/g, '').trim().toLowerCase() : null;
    if (th == null || th === '') return true;
    return dtoVk === th;
  }

  private normalizeGuid(s: string): string | null {
    const x = s.replace(/[{}]/g, '').trim();
    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(x)) {
      return null;
    }
    return x.toLowerCase();
  }

  /** Stable message id compare (API / hub GUID casing can differ). */
  private normMsgId(id: string | null | undefined): string {
    return (id ?? '').replace(/[{}]/g, '').trim().toLowerCase();
  }

  /**
   * Parse created/read UTC for receipt compare. Strings without `Z` are treated as UTC
   * (Job Ops stores UTC; browsers otherwise interpret as local and skew Seen ticks).
   */
  private parseUtcMs(raw: string | null | undefined): number | null {
    if (!raw) return null;
    const s = String(raw).trim();
    if (!s) return null;
    const normalized = /Z$/i.test(s) || /[+-]\d{2}:\d{2}$/.test(s) ? s : `${s}Z`;
    const ms = Date.parse(normalized);
    return Number.isNaN(ms) ? null : ms;
  }

  private newId(): string {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  private scrollMessagesToBottomSoon(): void {
    queueMicrotask(() => {
      const el = this.messagesEl()?.nativeElement;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    });
  }
}
