import {
  JobChatConversationListResponse,
  JobChatConversationSummaryDto,
  JobChatMessageDto,
  JobChatPagedResponse,
  JobChatThreadReadEventDto,
} from './live-chat.service';

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function pick<T>(o: Record<string, unknown>, ...keys: string[]): T | undefined {
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(o, k) && o[k] != null) {
      return o[k] as T;
    }
  }
  return undefined;
}

function pickString(o: Record<string, unknown>, ...keys: string[]): string {
  const v = pick<unknown>(o, ...keys);
  return v == null ? '' : String(v);
}

function pickGuidOrNull(o: Record<string, unknown>, ...keys: string[]): string | null {
  const v = pick<unknown>(o, ...keys);
  if (v == null || v === '') return null;
  return String(v);
}

function parseMessageActions(o: Record<string, unknown>): JobChatMessageDto['actions'] {
  const raw = pick<unknown[]>(o, 'actions', 'Actions');
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const actions = raw
    .map((row) => {
      const a = asRecord(row);
      if (!a) return null;
      const id = pickString(a, 'id', 'Id');
      const label = pickString(a, 'label', 'Label');
      const type = pickString(a, 'type', 'Type');
      if (!id && !type) return null;
      return {
        id: id || type,
        label: label || id || type,
        type: type || id,
        jobKey: pickGuidOrNull(a, 'jobKey', 'JobKey'),
        estimateKey: pickGuidOrNull(a, 'estimateKey', 'EstimateKey'),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
  return actions.length ? actions : undefined;
}

/** Job Ops wraps bodies in `{ status, data }`; nested DTOs may use camelCase or PascalCase. */
export function parseJobChatConversationList(body: unknown): JobChatConversationListResponse | null {
  const root = asRecord(body);
  if (!root) return null;

  const status = pick<boolean>(root, 'status', 'Status');
  if (status === false) return null;

  const payload = asRecord(pick(root, 'data', 'Data')) ?? root;
  const itemsRaw = pick<unknown[]>(payload, 'items', 'Items');
  if (!Array.isArray(itemsRaw)) return null;

  const items = itemsRaw
    .map((row) => parseConversationSummary(row))
    .filter((row): row is JobChatConversationSummaryDto => row !== null);

  return {
    items,
    pageNumber: Number(pick(payload, 'pageNumber', 'PageNumber') ?? 1),
    pageSize: Number(pick(payload, 'pageSize', 'PageSize') ?? 30),
    totalCount: Number(pick(payload, 'totalCount', 'TotalCount') ?? items.length),
    totalUnreadMessageCount: Number(
      pick(payload, 'totalUnreadMessageCount', 'TotalUnreadMessageCount') ?? 0,
    ),
  };
}

function parseConversationSummary(row: unknown): JobChatConversationSummaryDto | null {
  const o = asRecord(row);
  if (!o) return null;
  const jobKey = pickString(o, 'jobKey', 'JobKey');
  if (!jobKey) return null;
  return {
    jobKey,
    jobLabel: pickString(o, 'jobLabel', 'JobLabel') || jobKey,
    vendorKey: pickGuidOrNull(o, 'vendorKey', 'VendorKey'),
    vendorLabel: pickString(o, 'vendorLabel', 'VendorLabel') || 'General',
    lastMessagePreview: pickString(o, 'lastMessagePreview', 'LastMessagePreview'),
    lastMessageUtc: pickString(o, 'lastMessageUtc', 'LastMessageUtc'),
    lastSenderType: Number(pick(o, 'lastSenderType', 'LastSenderType') ?? 0),
    isUnread: !!pick<boolean>(o, 'isUnread', 'IsUnread'),
    unreadMessageCount: Number(pick(o, 'unreadMessageCount', 'UnreadMessageCount') ?? 0),
    messageCount: Number(pick(o, 'messageCount', 'MessageCount') ?? 0),
  };
}

export function parseJobChatPagedMessages(body: unknown): JobChatPagedResponse | null {
  const root = asRecord(body);
  if (!root) return null;

  const status = pick<boolean>(root, 'status', 'Status');
  if (status === false) return null;

  const payload = asRecord(pick(root, 'data', 'Data')) ?? root;
  const itemsRaw = pick<unknown[]>(payload, 'items', 'Items');
  if (!Array.isArray(itemsRaw)) return null;

  const items = itemsRaw
    .map((row) => parseMessage(row))
    .filter((row): row is JobChatMessageDto => row !== null);

  return {
    items,
    pageNumber: Number(pick(payload, 'pageNumber', 'PageNumber') ?? 1),
    pageSize: Number(pick(payload, 'pageSize', 'PageSize') ?? 30),
    totalCount: Number(pick(payload, 'totalCount', 'TotalCount') ?? items.length),
  };
}

function parseMessage(row: unknown): JobChatMessageDto | null {
  const o = asRecord(row);
  if (!o) return null;
  const jobChatMessageKey = pickString(o, 'jobChatMessageKey', 'JobChatMessageKey');
  const jobKey = pickString(o, 'jobKey', 'JobKey');
  if (!jobChatMessageKey || !jobKey) return null;
  return {
    jobChatMessageKey,
    jobKey,
    senderType: Number(pick(o, 'senderType', 'SenderType') ?? 0),
    senderKey: pickString(o, 'senderKey', 'SenderKey'),
    vendorKey: pickGuidOrNull(o, 'vendorKey', 'VendorKey'),
    senderName: pickString(o, 'senderName', 'SenderName'),
    body: pickString(o, 'body', 'Body'),
    createdUtc: pickString(o, 'createdUtc', 'CreatedUtc'),
    seenByRecipient: !!pick<boolean>(o, 'seenByRecipient', 'SeenByRecipient'),
    seenByRecipientUtc: pickString(o, 'seenByRecipientUtc', 'SeenByRecipientUtc') || null,
    actions: parseMessageActions(o),
    actionsConsumed: !!pick<boolean>(o, 'actionsConsumed', 'ActionsConsumed'),
  };
}

/** Normalize hub/REST message shape (camelCase or PascalCase). */
export function normalizeJobChatMessageDto(raw: unknown): JobChatMessageDto | null {
  const o = asRecord(raw);
  if (!o) return null;
  const jobChatMessageKey = pickString(o, 'jobChatMessageKey', 'JobChatMessageKey');
  const jobKey = pickString(o, 'jobKey', 'JobKey');
  if (!jobChatMessageKey || !jobKey) return null;
  return {
    jobChatMessageKey,
    jobKey,
    senderType: Number(pick(o, 'senderType', 'SenderType') ?? 0),
    senderKey: pickString(o, 'senderKey', 'SenderKey'),
    vendorKey: pickGuidOrNull(o, 'vendorKey', 'VendorKey'),
    senderName: pickString(o, 'senderName', 'SenderName'),
    body: pickString(o, 'body', 'Body'),
    createdUtc: pickString(o, 'createdUtc', 'CreatedUtc'),
    seenByRecipient: !!pick<boolean>(o, 'seenByRecipient', 'SeenByRecipient'),
    seenByRecipientUtc: pickString(o, 'seenByRecipientUtc', 'SeenByRecipientUtc') || null,
    actions: parseMessageActions(o),
    actionsConsumed: !!pick<boolean>(o, 'actionsConsumed', 'ActionsConsumed'),
  };
}

export function parseJobChatThreadReadEvent(body: unknown): JobChatThreadReadEventDto | null {
  const o = asRecord(body);
  if (!o) return null;
  const jobKey = pickString(o, 'jobKey', 'JobKey');
  const lastReadUtc = pickString(o, 'lastReadUtc', 'LastReadUtc');
  if (!jobKey || !lastReadUtc) return null;
  return {
    jobKey,
    threadVendorKey: pickGuidOrNull(o, 'threadVendorKey', 'ThreadVendorKey'),
    readerParticipantType: Number(pick(o, 'readerParticipantType', 'ReaderParticipantType') ?? 0),
    lastReadUtc,
  };
}

export function parseJobChatPostResult(
  body: unknown,
): { jobChatMessageKey: string; jobKey: string; senderName: string } | null {
  const root = asRecord(body);
  if (!root) return null;
  const status = pick<boolean>(root, 'status', 'Status');
  if (status === false) return null;
  const payload = asRecord(pick(root, 'data', 'Data')) ?? root;
  const jobChatMessageKey = pickString(payload, 'jobChatMessageKey', 'JobChatMessageKey');
  const jobKey = pickString(payload, 'jobKey', 'JobKey');
  if (!jobChatMessageKey || !jobKey) return null;
  return {
    jobChatMessageKey,
    jobKey,
    senderName: pickString(payload, 'senderName', 'SenderName'),
  };
}
