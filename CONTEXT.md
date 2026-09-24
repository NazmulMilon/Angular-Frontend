# RFI Admin Portal V2 — Glossary

## Vendor Estimate Status

A **Vendor Estimate** is an offer from a vendor to do work on a job, priced in line items. Its lifecycle is a single `Status` code (0–5) plus companion boolean flags (`IsApproved`, `IsCancelled`, `IsNew`, `IsEdited`). See `context/VendorEstimate-Status-Lifecycle-Reference.html` for the full legacy-behavior reference this portal replicates.

- **Manage Status dropdown** — the admin-facing menu (per estimate card) that fires the status transitions: On-Site Approval Requested, Estimate Submitted, Change Order Requested, Estimate Approved, Estimate Declined, Onsite Approval Request - Approved, Estimate Reject/Resubmit. Reject/Resubmit is the only option that hands off to the in-app negotiation flow instead of a direct status POST.

- **Approve chain** — the multi-step flow triggered specifically by "Estimate Approved" (not the other five statuses, which are one-shot POSTs). Three sequential backend calls:
  1. `SetVendorEstimateToApproved` — sets Status=1, declines sibling estimates for the same Job+Vendor (Status=3), updates `RevVendorDNE`. Returns `{ flag, requiresAdditionalApproval }`.
  2. `SaveVendorApprovalData` — records the admin's choice from the Additional Approval panel (see below); for options 1/2/4 it resolves the `WorkOrderKey`/`InvoiceType` needed to actually email the vendor; option 5 ("Save & Close") stops here with no email.
  3. `SendWorkOrderEmail` — sends the templated email(s) to the vendor and applies any post-send job-status side effects (e.g. Create Invoice flips job status to Complete).

- **Additional Approval panel** — the inline UI (not a modal in legacy; `#frmAdditionalApprovalToVendor`) shown after an estimate is approved, asking the admin *how* (or whether) to notify the vendor. Four options: Set Return ETA (1), Check-out (2, requires vendor checked in), Create Invoice (4, requires vendor checked out), Save approved amount & Close — no email (5). `flag=1` from the approve call means show the full panel; `flag=2` means pre-select the Check-out option; `flag=0` is an error.

- **DNE (Do Not Exceed)** — the customer-approved spending ceiling for a job. The **customer estimate/DNE threshold warning** is a *soft, non-blocking* guidance message shown before approving a vendor estimate that is ≥65% or ≥80% of the customer estimate: "This estimate is X% of the customer estimate. Please get an approval from the customer in order to proceed." The admin can still approve after seeing it. A hard stop (blocking approval until customer sign-off) is a deferred, not-yet-built variant of this same check.

## Approve-chain routing (resolved)

The three approve-chain calls live under **different controllers**, not under `vendor-bills`:

| Frontend call | Route |
|---|---|
| `setVendorEstimateToApproved` | `POST /api/v1/admin/vendor-status-action/set-vendor-estimate-approved` |
| `saveVendorApprovalData` | `POST /api/v1/admin/on-site-approval/save-vendor-approval-data` |
| `sendEmailToVendor` | `POST /api/v1/admin/work-order/email-work-order-to-vendor` |

(`VendorBillsService` has dedicated `vendorStatusActionBase` / `onSiteApprovalBase` / `workOrderBase` constants for these — do not point them at `vendorBillsBase`.) An earlier build guessed all three lived under `vendor-bills/estimates/*`, which 404'd and looked like "the endpoint never gets hit."

## Known backend contract gaps (flagged during scoping, not yet resolved)

- **`InvoiceType` enum mismatch**: `SaveVendorApprovalData` emits `34` (ETA), `5` (Check-out), `10` (Create Invoice) for approval options 1/2/4, but `SendWorkOrderEmail`'s switch expects `9` (ETA), `3` (Check-out), `10` (Create Invoice), `5` (approval-only). Only Create Invoice (10↔10) agrees. The frontend relays `InvoiceType` verbatim between the two calls — it does not interpret it — so this is a backend-only reconciliation. Owner: user, in progress as of the estimate-approval-panel build.
- **`jobVendorKey` on estimate DTOs**: `AdminJobEstimateCard`/`AdminJobEstimateOptionSection` needed a `jobVendorKey` field added (frontend models updated) because `SetVendorEstimateToApproved` requires it; confirm the estimates-page backend DTO actually populates it. If it's still null/missing, approve will silently no-op client-side with "Missing vendor assignment for this estimate; cannot approve."
- **Recipient resolution for `SendWorkOrderEmail`**: unconfirmed whether the service requires client-supplied `RecipientEmails` or resolves vendor contacts server-side. Frontend currently gathers and sends contacts from `AdminCreateEstimateModalData` regardless, which is safe under either interpretation.

## Dispatch attachments (Work Order modal & Broadcast modal)

- **Sendable attachment** — a file offered as an attachment when dispatching a job to a vendor, either via the single-vendor **Work Order modal** (`woJobFiles` + `woLocationFiles`) or the multi-vendor **Broadcast modal** (its own `BroadcastJobFileDto` list). "Customer Work Order" (`documentTypeName`/`fileType === 'CUSTOMER WORK ORDER'`) is never a sendable attachment in either modal — it's filtered out entirely, not shown disabled.
- **Customer-supplied attachment** — in the absence of any real source/provenance field on the file DTOs (`JobFileItem`, `LocationFileItem`, `BroadcastJobFileDto` all lack an `isCustomerUpload`-style flag), this portal treats *every* sendable attachment shown in these modals as customer-supplied. There is no narrower subset distinguished by data today.
- **Business hours** — Mon–Fri, 9am–5pm America/New_York (EST/EDT), evaluated client-side once per file-list load (not live/reactive while a modal stays open). Governs only the *default checked state* of attachments in manual dispatch modals — the admin can always override before sending. It has no bearing on after-hours auto-broadcast, which is a separate backend-owned trigger (out of scope for this portal) that always sends all customer-supplied attachments unconditionally.
