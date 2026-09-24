# Customer Invoice Lifecycle — Manual Test Plan

Scope: the new "Customer Invoices" list and its five row-action modals, added to the
**Invoices accordion** on the Vendor Bills page (`/job/{jobKey}/vendor-bills`), above "List of Bills".

Compare behavior against legacy V1 at `MgtJobSalesOrder/SaleEstimated/{jobKey}`,
`MgtJobSalesOrder/ProcessInvoice/{invoiceKey}`, and `MgtJobSalesOrder/EmailInvoiceToCustomer/{invoiceKey}`.

Prerequisite: a job with at least one existing customer invoice (`JobSalesInvoice.IsEstimate = 0`).
If none exists, use the existing "Create Customer Invoice" button (From Scratch) first.

---

## 1. List / grid

| Step | Expected | V1 equivalent |
|---|---|---|
| Open the Invoices accordion on a job with customer invoices | "Customer Invoices" table shows rows: Date, Invoice No, Check No, Total, Status, Prep, Email to Customer, Control | `SaleEstimated` grid, invoice rows |
| Type into Search | Rows filter by invoice no / check no / status text, page resets to 1 | N/A (V1 has no client search on this grid) |
| Change "Show N entries" | Page size changes, page resets to 1 | N/A |
| Status pill for an unpaid invoice with a deposit | Shows "Deposit Invoice" (blue/pending pill) | `estimateStatus` = "Deposit Invoice" |
| Status pill after that invoice is fully paid | Shows "Paid" (green pill) | N/A — V1 shows `InvoicePaid` value inline, no pill |
| Invoice with no deposit, unpaid | Status pill shows "Invoice" (grey/default) | `estimateStatus` = "Invoice" |

## 2. Accounting — mark paid / QB-push / manually sent / mark unpaid

Open via the **Accounting** button in the Control column.

| Step | Expected | V1 equivalent |
|---|---|---|
| Click "Invoice Manually Pushed to QB" | A text field for the QB reference number appears | `ProcessInvoice` `#QBF` → reveals `#qb` |
| Click Confirm with the field empty | Inline error: "Please enter the QuickBooks reference number." | "Please enter quickbook reference number." |
| Fill in a ref number, Confirm | Modal closes, success banner on the list, row unaffected visually (QB-push isn't shown in the grid) | POST b1=1 |
| Click "Invoice Paid" | A Check No. field appears | `#InvP` → reveals `#chq` |
| Confirm with empty check no | Inline error: "Please enter the check number." | "Please enter check number." |
| Fill in a check no, Confirm | Modal closes; reopening Accounting for the same invoice shows "Invoice has been paid." and a "Mark Invoice as Unpaid" button; grid's Check No column and status pill update to "Paid" | POST b1=2 |
| Click "Mark Invoice as Unpaid" | Optional note field appears | N/A — new for this UI (V1's equivalent lives on `SaleEstimated`'s "Mark invoice as unpaid" button, same underlying action) |
| Confirm mark-unpaid | Browser `confirm()` "Are you sure that you want to mark this invoice as un-paid?" fires first; after OK, invoice reverts to unpaid, Check No clears, grid status pill reverts | `SetInvoiceToUnpaid` + `confirm(...)` |
| Click "Manually Sent to Customer" (before ever emailing) | Immediate save, no extra fields; reopening shows "Invoice has been manually sent to customer." | `#ManualEmail` → POST b1=3 |

## 3. Email to customer

Open via **Email to Customer** / **Send Again** button.

| Step | Expected | V1 equivalent |
|---|---|---|
| Open modal on a job with a customer/location contact configured | Recipient checkboxes load under "Account" / "Location" groups; the job's default contact (`Job.CcontactKey`) is pre-checked | `EmailInvoiceToCustomer` contact checkbox lists |
| Open modal on a job with a customer that has no contacts | "No contacts found for this job's customer." | Empty `CustomerContactDiv`/`LocationContactDiv` |
| Click Send Mail with nothing checked | Inline error: "Please select at least one recipient." | Blocking validation before submit |
| Check one recipient, add an optional note, Send Mail | Success; list row's Email column flips from "Email to Customer" to "Sent" + "Send Again"; grid status re-fetches | `#Save` → POST, `IsSentToCustomer` flips |
| **Cross-check the email actually arrives** | Verify in a real inbox (or RFIEmailService logs) that `RFIEmailService/MailToCustomer/send-invoice` fired and the email body shows job info + line items + total, with a working "View Invoice Now" link to the customer's job auto-login page | Legacy sends via `MailToCustomers.SendInvoiceToCustomer` with the estimate PDF attached — **note: this rebuild sends an inline HTML line-item table instead of a PDF attachment, and links to the job page instead of an estimate-specific portal page.** This is an intentional, confirmed difference — call it out if anyone expects PDF parity. |

## 4. Edit line items

Open via **Edit** button.

| Step | Expected | V1 equivalent |
|---|---|---|
| Open Edit on an invoice that has NOT been sent/paid | Modal loads existing lines (Charge Type, Description, Rate, Qty, computed Amount) | `Sales.cshtml` grid populated from `GlobalClass.GlobalSales` |
| Open Edit on an invoice that HAS been sent or paid | Modal shows a blocking message: "This invoice has already been sent to the customer or paid, and can no longer be edited." No Save button. | **New guard — V1 has no such block; this is a deliberate improvement, confirm it doesn't break an expected legacy workflow before relying on it.** |
| Change a line's Rate/Qty | Row's Amount recalculates live; Total at the bottom recalculates | Legacy recalculates Amt on blur, not live — cosmetic difference only |
| Click "+ Add line" | New blank row appears, editable immediately | `#Add` "Add to Grid" button |
| Click the × on a row | Browser `confirm()` "Are you sure you want to Remove this?" fires; row removed on OK | Legacy trash-can button, same confirm text |
| Save with at least one line | Success; grid's Total column updates to match | `SaveSalesInvoiceEstimates` / recomputed total |
| Save with zero lines | Inline error: "Add at least one line item." | N/A — legacy doesn't block this the same way; confirm expected behavior with the business if this matters |

## 5. Void (Remove)

Open via **Remove** button.

| Step | Expected | V1 equivalent |
|---|---|---|
| Open Remove on any invoice | Modal titled "You must get manager approval for deleting this invoice", with Manager Name + Remarks fields | `#DeleteInvoicePermission` modal, identical copy |
| Click "Yes, Proceed" with both fields empty | Inline error listing both missing fields | Same two-part validation message |
| Fill in name + remarks, Proceed, on an invoice with NO paid partial-pay row | Invoice disappears from the grid (soft-deleted) | `RemoveInvoice` AJAX `data == "1"` → redirect |
| Fill in name + remarks, Proceed, on an invoice that HAS a paid partial-pay row (e.g. the one marked paid in step 2) | Error message: **"This invoice cannot be deleted because payment has been made by the customer on this invoice."** — must match this exact wording | `RemoveInvoice` AJAX `data == "2"` — this is the legacy guard message verbatim |

## 6. Resubmit

**⚠ No legacy precedent** — flag this explicitly to whoever reviews the rebuild. Legacy ProjectRCS has
no "resubmit customer invoice" feature; this exists only because the backend already had unused
`IsResubmit`/`ResubmitRemark` columns and a matching service method. Test it for internal consistency only,
not against V1 behavior:

| Step | Expected |
|---|---|
| Open Resubmit on a sent invoice | Modal explicitly states "legacy ProjectRCS has no equivalent action" |
| Confirm with an optional remark | Invoice's sent/prepped flags clear server-side; re-opening the Email modal should now treat it as unsent (button reverts from "Send Again" to "Email to Customer") |

## 7. Not covered by this build (explicitly out of scope)

- **Bulk invoice generation** — legacy lives at `Accounting/ExportBulkInvoice` (cross-customer CSV export), architecturally different from the backend's per-job bulk-create endpoint. No UI was built for either; do not test.
- Attachments on the email-to-customer flow (legacy supports extra file uploads beyond the auto-attached PDF; this rebuild has no attachment support at all).
- Deposit-specific partial-pay actions (marking just the deposit bucket vs. the main bucket) — the receivables modal always targets the main amount row (`isDeposit: false`); deposit-row actions are not exposed in this UI yet.
