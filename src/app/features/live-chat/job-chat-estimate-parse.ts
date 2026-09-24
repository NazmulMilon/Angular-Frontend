import {
  OnsiteDeclineIncurredInvoiceResult,
  OnsiteDeclineIncurredLine,
  OnsiteDeclineIncurredLinesResult,
  OnsiteNegotiateLine,
  OnsiteNegotiateLinesResult,
  ThreadEstimateDto,
  ThreadEstimateOptionDto,
} from './job-chat-estimate.types';

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

function pickBool(o: Record<string, unknown>, ...keys: string[]): boolean | undefined {
  const v = pick<unknown>(o, ...keys);
  if (v == null) return undefined;
  return !!v;
}

function pickNum(o: Record<string, unknown>, ...keys: string[]): number | undefined {
  const v = pick<unknown>(o, ...keys);
  if (v == null || v === '') return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
}

function parseNegotiateLine(raw: unknown): OnsiteNegotiateLine | null {
  const o = asRecord(raw);
  if (!o) return null;
  const detailKey = pick<string>(o, 'detailKey', 'DetailKey');
  if (!detailKey) return null;
  const laborRaw = String(pick<string>(o, 'labor', 'Labor') ?? 'material').toLowerCase();
  const itemName = pick<string>(o, 'itemName', 'ItemName');
  const chargeTypeKey = pick<string>(o, 'chargeTypeKey', 'ChargeTypeKey');
  const rateEditable = pickBool(o, 'rateEditable', 'RateEditable');
  return {
    detailKey,
    labor: laborRaw === 'labor' ? 'labor' : 'material',
    itemName,
    chargeTypeKey,
    description: pick<string>(o, 'description', 'Description'),
    rate: pickNum(o, 'rate', 'Rate'),
    qty: pickNum(o, 'qty', 'Qty'),
    hour: pickNum(o, 'hour', 'Hour'),
    tech: pickNum(o, 'tech', 'Tech'),
    costIncurred: pickNum(o, 'costIncurred', 'CostIncurred'),
    display: pickNum(o, 'display', 'Display'),
    rateEditable,
  };
}

function parseDeclineIncurredLine(raw: unknown): OnsiteDeclineIncurredLine | null {
  const o = asRecord(raw);
  if (!o) return null;
  const detailKey = pick<string>(o, 'detailKey', 'DetailKey');
  if (!detailKey) return null;
  const whichTable = pickNum(o, 'whichTable', 'WhichTable');
  if (whichTable == null) return null;
  return {
    detailKey,
    whichTable,
    itemName: pick<string>(o, 'itemName', 'ItemName'),
    description: pick<string>(o, 'description', 'Description'),
    amount: pickNum(o, 'amount', 'Amount'),
    qty: pickNum(o, 'qty', 'Qty'),
    rowTotal: pickNum(o, 'rowTotal', 'RowTotal'),
  };
}

function parseThreadEstimateOption(raw: unknown): ThreadEstimateOptionDto | null {
  const o = asRecord(raw);
  if (!o) return null;
  const estimateKey = pick<string>(o, 'estimateKey', 'EstimateKey');
  const optionLabel = pick<string>(o, 'optionLabel', 'OptionLabel');
  if (!estimateKey || !optionLabel) return null;
  return {
    estimateKey,
    optionLabel,
    total: pickNum(o, 'total', 'Total') ?? 0,
    status: pickNum(o, 'status', 'Status'),
    statusLabel: pick<string>(o, 'statusLabel', 'StatusLabel'),
    isVendorPick: pickBool(o, 'isVendorPick', 'IsVendorPick'),
    isSelected: pickBool(o, 'isSelected', 'IsSelected'),
  };
}

/** MVC JSON may use camelCase or PascalCase. */
export function parseThreadEstimateDto(body: unknown): ThreadEstimateDto | null {
  const o = asRecord(body);
  if (!o) return null;

  const allowedRaw = pick<unknown>(o, 'allowedActions', 'AllowedActions');
  const allowedActions = Array.isArray(allowedRaw)
    ? allowedRaw.map((x) => String(x))
    : undefined;

  const optionsRaw = pick<unknown>(o, 'options', 'Options');
  const options = Array.isArray(optionsRaw)
    ? optionsRaw
        .map(parseThreadEstimateOption)
        .filter((x): x is ThreadEstimateOptionDto => x != null)
    : undefined;

  return {
    ok: pickBool(o, 'ok', 'Ok') ?? false,
    error: pick<string>(o, 'error', 'Error'),
    message: pick<string>(o, 'message', 'Message'),
    hasEstimate: pickBool(o, 'hasEstimate', 'HasEstimate'),
    estimateKey: pick<string>(o, 'estimateKey', 'EstimateKey'),
    jobKey: pick<string>(o, 'jobKey', 'JobKey'),
    vendorKey: pick<string>(o, 'vendorKey', 'VendorKey'),
    status: pick<number>(o, 'status', 'Status'),
    statusLabel: pick<string>(o, 'statusLabel', 'StatusLabel'),
    onsiteApproval: pickBool(o, 'onsiteApproval', 'OnsiteApproval'),
    html: pick<string>(o, 'html', 'Html'),
    originalHtml: pick<string>(o, 'originalHtml', 'OriginalHtml'),
    hasComparison: pickBool(o, 'hasComparison', 'HasComparison'),
    allowedActions,
    canAct: pickBool(o, 'canAct', 'CanAct'),
    approveDisabled: pickBool(o, 'approveDisabled', 'ApproveDisabled'),
    approveDisabledReason: pick<string>(o, 'approveDisabledReason', 'ApproveDisabledReason'),
    approveDneMessage: pick<string>(o, 'approveDneMessage', 'ApproveDneMessage'),
    approveHardBlocked: pickBool(o, 'approveHardBlocked', 'ApproveHardBlocked'),
    estimateOptionCount: pick<number>(o, 'estimateOptionCount', 'EstimateOptionCount'),
    options,
    reviewingPosted: pickBool(o, 'reviewingPosted', 'ReviewingPosted'),
    isCancelled: pickBool(o, 'isCancelled', 'IsCancelled'),
    needsReview: pickBool(o, 'needsReview', 'NeedsReview'),
    vendorResubmitted: pickBool(o, 'vendorResubmitted', 'VendorResubmitted'),
    createdInvoiceForIncurredAfterDeclined: pickBool(
      o,
      'createdInvoiceForIncurredAfterDeclined',
      'CreatedInvoiceForIncurredAfterDeclined',
    ),
    hasUnbilledIncurredLines: pickBool(o, 'hasUnbilledIncurredLines', 'HasUnbilledIncurredLines'),
    invoiceTotal: pick<number>(o, 'invoiceTotal', 'InvoiceTotal'),
    oldTotal: pick<number | null>(o, 'oldTotal', 'OldTotal'),
    totalsChanged: pickBool(o, 'totalsChanged', 'TotalsChanged'),
    editedByVendor: pickBool(o, 'editedByVendor', 'EditedByVendor'),
    isEdited: pickBool(o, 'isEdited', 'IsEdited'),
    isNew: pickBool(o, 'isNew', 'IsNew'),
    hasArchive: pickBool(o, 'hasArchive', 'HasArchive'),
    archiveVersion: pickNum(o, 'archiveVersion', 'ArchiveVersion'),
    vendorClearedReject: pickBool(o, 'vendorClearedReject', 'VendorClearedReject'),
    previousEstimateLabel: pick<string>(o, 'previousEstimateLabel', 'PreviousEstimateLabel'),
    manageUrl: pick<string>(o, 'manageUrl', 'ManageUrl'),
    billsUrl: pick<string>(o, 'billsUrl', 'BillsUrl'),
    splitScreenUrl: pick<string>(o, 'splitScreenUrl', 'SplitScreenUrl'),
  };
}

export function parseOnsiteNegotiateLinesResult(body: unknown): OnsiteNegotiateLinesResult | null {
  const o = asRecord(body);
  if (!o) return null;
  const linesRaw = pick<unknown>(o, 'lines', 'Lines');
  const lines = Array.isArray(linesRaw)
    ? linesRaw.map(parseNegotiateLine).filter((x): x is OnsiteNegotiateLine => x != null)
    : undefined;
  return {
    ok: pickBool(o, 'ok', 'Ok') ?? false,
    error: pick<string>(o, 'error', 'Error'),
    message: pick<string>(o, 'message', 'Message'),
    estimateKey: pick<string>(o, 'estimateKey', 'EstimateKey'),
    jobKey: pick<string>(o, 'jobKey', 'JobKey'),
    vendorKey: pick<string>(o, 'vendorKey', 'VendorKey'),
    lines,
  };
}

export function parseOnsiteDeclineIncurredInvoiceResult(body: unknown): OnsiteDeclineIncurredInvoiceResult {
  const o = asRecord(body);
  if (!o) return { ok: false, error: 'empty_response' };

  const vendorInvoiceKey = pick<string>(o, 'vendorInvoiceKey', 'VendorInvoiceKey');
  let invoiceUrl = pick<string>(o, 'invoiceUrl', 'InvoiceUrl');
  if (!invoiceUrl && vendorInvoiceKey) {
    invoiceUrl = `/MgtVendorInvoice/DetailVendorInvoice?id=${vendorInvoiceKey}`;
  }

  return {
    ok: pickBool(o, 'ok', 'Ok') ?? false,
    error: pick<string>(o, 'error', 'Error'),
    message: pick<string>(o, 'message', 'Message'),
    vendorInvoiceKey,
    invoiceUrl,
  };
}

export function parseOnsiteDeclineIncurredLinesResult(body: unknown): OnsiteDeclineIncurredLinesResult | null {
  const o = asRecord(body);
  if (!o) return null;
  const linesRaw = pick<unknown>(o, 'lines', 'Lines');
  const lines = Array.isArray(linesRaw)
    ? linesRaw.map(parseDeclineIncurredLine).filter((x): x is OnsiteDeclineIncurredLine => x != null)
    : undefined;
  return {
    ok: pickBool(o, 'ok', 'Ok') ?? false,
    error: pick<string>(o, 'error', 'Error'),
    message: pick<string>(o, 'message', 'Message'),
    estimateKey: pick<string>(o, 'estimateKey', 'EstimateKey'),
    jobKey: pick<string>(o, 'jobKey', 'JobKey'),
    vendorKey: pick<string>(o, 'vendorKey', 'VendorKey'),
    hasIncurredLines: pickBool(o, 'hasIncurredLines', 'HasIncurredLines'),
    alreadyInvoiced: pickBool(o, 'alreadyInvoiced', 'AlreadyInvoiced'),
    lines,
  };
}
