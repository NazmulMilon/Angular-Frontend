# API Spec: Get Existing Customer Estimate

## Purpose

The admin portal's "Get More Approval from Customer" action (on the vendor bills page) needs to show the admin the full customer estimate — vendor vs. customer comparison grid, line items, totals — for a job that already has a customer estimate created. Today there is no read endpoint that returns the full estimate; `GET /latest-customer-estimate/{jobKey}` only returns a lightweight existence check (`hasEstimate`, `customerEstimateKey`, `navigationPath`), with no line items or totals.

This spec adds a new GET endpoint that returns the same shape as `POST /create-customer-estimate`'s response, so the frontend can render the existing comparison-grid UI unchanged, just fed by a read instead of a create.

## Endpoint

```
GET /api/v1/admin/on-site-approval/customer-estimate/{jobKey}
```

- Base path matches the existing on-site-approval group (`onSiteEstimateBase` in the frontend service), consistent with `POST /api/v1/admin/on-site-approval/create-customer-estimate`.
- `jobKey` (path param, string) — the job's key. The frontend already has this value in scope wherever the button lives.

### Alternative param note
If it's more natural on the backend to key off the customer estimate directly rather than the job, `GET /api/v1/admin/on-site-approval/customer-estimate/by-key/{customerEstimateKey}` is an acceptable alternative shape — either works for the frontend as long as one of `jobKey` or `customerEstimateKey` is available at call time (both are). Pick whichever matches how the underlying data is looked up (customer estimate is presumably 1:1 with the latest vendor estimate per job, similar to `getLatestCustomerEstimate`).

## Response envelope

Matches the existing `AssignVendorApiResponse<T>` wrapper used by every other endpoint in this API surface:

```ts
interface AssignVendorApiResponse<T> {
  status: boolean;
  responseCode: number;
  message: string;
  data: T;
  details: ApiErrorDetail[];
  unixTime: number;
  traceId: string | null;
}
```

## Response data shape

`data` should be exactly the `CreateCustomerEstimateResponse` shape already returned by `POST /create-customer-estimate`, so the existing frontend template (comparison grid) works with zero changes:

```ts
interface CreateCustomerEstimateResponse {
  customerEstimateKey: string;
  lineItems: CustomerEstimateLineItem[];
  vendorTotal: number;
  customerTotal: number;
  message: string;
  adminMarkupLineItemKey?: string;
}

interface CustomerEstimateLineItem {
  chargeType: string;
  chargeTypeKey: string;
  description: string;

  // Vendor pricing
  vendorRate: number;
  vendorQty: number;
  vendorAmount: number;

  // Customer pricing
  customerRate: number;
  customerQty: number;
  customerAmount: number;

  // Markup analysis
  calculatedMarkupPercent: number;
  profileMarkupPercent?: number;

  // Labor hour adjustment (labor items only)
  originalHours?: number;
  adjustedHours?: number;
  wasHourAdjusted: boolean;
  techCount?: number;

  // Metadata
  lineType: 'labor' | 'material' | 'trip' | 'custom';
  costIncurred: number;
  displayLevel?: number;
  isCustomLineItem?: boolean;

  // Keys for linking to database records
  customerEstimateDetailKey?: string;
  vendorEstimateDetailKey?: string;
  vendorEstimateLaborKey?: string;
}
```

All fields must be populated the same way `create-customer-estimate` populates them today (i.e., this is a "read what was persisted" of the same records that endpoint creates/updates) — `customerEstimateDetailKey` in particular must be present per line item, since the frontend's existing inline-edit save flow (`updateCustomerEstimate`) requires it to target the right row.

## Not-found behavior

If no customer estimate exists yet for the given `jobKey`:

- Return `status: false`, `responseCode` in the 4xx range (e.g. 404), and a clear `message` (e.g. `"No customer estimate found for this job."`).
- Do not throw an unhandled 500 — the frontend will surface `message` directly to the admin as an inline error in the modal.

## Non-goals

- This endpoint is read-only. It must not create, mutate, or trigger recalculation of any estimate data — that's what `create-customer-estimate` / `update-customer-estimate` already do.
- No pagination/filtering needed — one job has at most one active customer estimate.
