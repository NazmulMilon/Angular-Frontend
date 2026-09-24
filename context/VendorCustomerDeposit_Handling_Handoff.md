# Handoff: Vendor deposit vs. customer deposit handling during Vendor→Customer estimate creation

> **Purpose**: Document how vendor deposits and customer deposits are collected, stored, and (not) reconciled when a customer estimate is created from a vendor estimate, across all three create flows. Investigation only — no code changed.
>
> Codebase: `ProjectRCS` (ASP.NET MVC 5, C#, SQL Server, EF6 + raw ADO.NET, jQuery). Working dir: `/Users/cole-sathngam/Workspace/RetailFixIt/Master`. Branch: `dev`.
>
> **Companion docs** (do not duplicate — reference by path):
> - `docs/VendorToCustomerEstimate_CreationBehavior_Handoff.md` — single-vendor create/supersede behavior.
> - `docs/MultiVendor_MultiOption_Estimate_Flows_Handoff.md` — multi-vendor (Flow A) and multi-option (Flow B) flows.
> - `docs/DynamicMinimumMarkup_Handoff.md` — markup policy feature (confirmed unrelated to deposits, see §4).

All three create flows (single, Flow A multi-vendor, Flow B multi-option) share the same deposit-handling shape:

| Flow | Controller save method | DB helper |
|---|---|---|
| Single vendor → single customer estimate | `SaveCreateNewEstimate` — `Controllers/MgtVendorEstimateToCustomerEstimateController.cs:543-669` | `SaveSalesInvoiceEstimatesSignleEstimateFromVendor` — `DatabaseInteraction/JobSalesEstimateSetup.cs:2578-2853` |
| Flow A: multi-vendor → one customer estimate | `SaveCreateNewEstimateFromMultipleVendor` — same controller `:46-292` (deposits `:185-276`) | `SaveSalesEstimatesForMultiplevendor` — `JobSalesEstimateSetup.cs:3253` |
| Flow B: multi-option → sibling customer estimates | `SaveCreateNewEstimateForMultipleOption` — same controller `:305-528` (deposits `:429-517`) | `SaveSalesInvoiceEstimatesWithOption` — `JobSalesEstimateSetup.cs:3018` |

All three accept the same deposit parameters: `List<VendorDepositClass> VendorDepositListObj`, `decimal? CustomerDepoAmount`, `string ReasonForNoCustomerDeposit`, `VendorDepositOverride` list, `CustomerDepositOverrideList`.

---

## 1. Key finding: there is no shared "deposit" field — two separate models, two separate tables

- **Customer deposit** lives as a single scalar on the customer estimate itself: `JobSalesInvoice.DepositAmount` (`Models/JobSalesInvoice.cs:70-75`), alongside `Isdeposit`, `ReasonForNoDeposit`, `DepositeSentToCustomer`, `DepositeEmailToCustomerDate`.
- **Vendor deposit** is **not** stored on the vendor's own estimate row for this purpose. `VendorEstimate.DepositAmount` exists as a field (`Models/VendorEstimate.cs:61`) but is **dead for the conversion path** — confirmed by grep, it is never read anywhere in the controller. Instead vendor deposits live in a dedicated table, **`VendorDepositSet`** (`Models/VendorDepositSet.cs:15-21`: `PKey`, `JobKey`, `VendorKey`, `DepositAmount`, `DepositSetDate`, `ApprovedBy`), keyed by **`(JobKey, VendorKey)`** — i.e. scoped to the job + vendor, not to any particular estimate.
- Input DTOs are request-only: `VendorDepositClass` (`JobVendorKey`, `DepositAmount`) and `VendorDepositOverride` (`JobVendorKey`, `DepositAmount`, `Remark`) — `Models/NewEstimateDetailClass.cs:21-31`.
- A read-side aggregate, `CustomerDepositStory` (`Models/CustomerDepositStory.cs:8-16`), exists purely to build approval-email/note text (`GetTheDepositStoryForCustomer`, `GetTheDepositStoryForAllVendorsInAJob`) — it is not a write model and does not feed back into either stored amount.

---

## 2. What actually happens to each amount at save time

Both amounts are **independent, manually-entered inputs collected in the same UI wizard** — neither is derived, defaulted, or copied from the other, and neither is derived from anything already stored on the vendor estimate.

### Customer deposit — `JobSalesEstimateSetup.cs:2622-2639`

```csharp
if (CustomerDepoAmount == 0) {
    invoice.DepositAmount = 0;
    invoice.Isdeposit = false;
    invoice.ReasonForNoDeposit = ReasonForNoCustomerDeposit;
    ...
} else {
    invoice.DepositAmount = Math.Round(CustomerDepoAmount ?? 0m, 2);
    invoice.Isdeposit = true;
    ...
}
```

`CustomerDepoAmount` comes straight from the form field `#CustomerDepositAmount` (`ManageCustomerVendorDeposit.js:585`, `CreateNew.cshtml:1222`) — a manual dollar entry, or a `%` field typed against the estimate net total and converted client-side (`ManageCustomerVendorDeposit.js:940-957`). No server-side floor/ceiling is enforced.

### Vendor deposit — `JobSalesEstimateSetup.cs:2643-2663` → `SetVendorDeposit` (`:2965-2993`)

```csharp
if (VendorDepositListObj.Count() > 0) {
    vendorDeposit = true;
    VendornoteTosafe = SetVendorDeposit(obj.JobKey, VendorDepositListObj, db);
    ...
}
```

Per vendor in the list: find/create the `VendorDepositSet` row for `(JobKey, VendorKey)` and set `DepositAmount = Convert.ToDecimal(item.DepositAmount)`. `item.DepositAmount` is manually typed in the "Vendor Deposit" modal (`txtdepoAmt`, `ManageCustomerVendorDeposit.js:352-393`), with a parallel `%` field computed client-side against **that vendor's own estimate total** (`data-smallest` attribute, `:888-916`) — not the customer total.

**If `VendorDepositListObj` is null/empty**, no vendor deposit is set/updated this save — the code instead re-reports previously-approved vendor deposits for the job via `GetOlderDepositRepoort` (`:2646`, `:2995-3010`) into a note, leaving existing `VendorDepositSet` rows untouched.

---

## 3. The only coupling between the two amounts: a soft, overridable UI warning — not a server-enforced rule

- If `CustomerDepositAmount < TotalVendorDeposit` → warning "deposit amount required from customer is less than deposit approval amount to the vendor" (`ManageCustomerVendorDeposit.js:461-468`).
- If `CustomerDepositAmount < 135% of TotalVendorDeposit` (i.e. not at least 35% more than the summed vendor deposit) → warning "not 35% greater... (Best Practice Requirements)" (`:469-475`).
- Both are **overridable**: clicking "Override & Continue" (`#btnCustomerDepositOverride`) records the warning text as `CustomerOverride`, persisted to `DepositOverrideRemark` (`JobSalesEstimateSetup.cs:2820-2829`), and the save proceeds with the amount as typed. **There is no server-side rejection.**
- Symmetrically, a per-vendor amount typed above 50% of that vendor's own estimate total (`data-half` attribute) triggers a `VendorDepositOverride` remark (`ManageCustomerVendorDeposit.js:370-378`) — again client-side only, recorded as a note, not blocking.

**Bottom line: customer deposit is never derived from vendor deposit (no formula, no copy, no default).** They are two independently-typed numbers, checked against each other only by an advisory, dismissible warning.

---

## 4. Dynamic Minimum Markup does not touch deposits

Confirmed via `docs/DynamicMinimumMarkup_Handoff.md` and grep: `CheckIfCustomerGrandTotalIsWithinThreshold` (`Mutators/CustInvoiceAndEstimateMutator.cs:140-208`) compares only `VendorGrandTotal` vs `CustomerGrandTotal` (line-item totals) and takes no deposit parameters. It runs as a separate, earlier step in the single-estimate UI (before `SaveEstimateToDatabase()`, which is what triggers the deposit modals — `ManageCustomerVendorDeposit.js:562-565`) and is **not called at all** in the multi-vendor/multi-option views. Deposits and markup are fully decoupled subsystems that merely happen to run back-to-back in the single-estimate flow.

---

## 5. Multi-vendor / multi-option edge cases

- **Flow A (multi-vendor merge)**: `VendorDepositListObj` can carry **multiple entries, one per merged vendor** (controller `:218-222`), each upserted independently into `VendorDepositSet` by that vendor's `(JobKey, VendorKey)`. `CustomerDepoAmount` stays a **single scalar** for the one resulting customer estimate. The soft 35% check compares that one customer number against the **sum** of all vendor deposits in the list.
- **Flow B (multi-option siblings)**: same vendor-list + scalar-customer-amount shape (deposit block at controller `:429-517`), but computed once per option group, anchored to the **smallest option's total** (`SmallestTotal`/`txtNetTotal`, per `CreateNewMultipleOption.cshtml:141-151, 992`) — since only one sibling will ultimately be approved by the customer.
- `SaveTheApprovalRequestForDeposit` (`JobSalesEstimateSetup.cs:2857-2937`) runs identically at the end of all three flows whenever either deposit is non-empty, combining `GetTheDepositStoryForCustomer` + `GetTheDepositStoryForAllVendorsInAJob` into one internal approval note/email — read-side aggregation only, doesn't feed back into stored amounts.
- Because `VendorDepositSet` is keyed by **job + vendor**, not by estimate, vendor deposits **persist across estimate supersede/re-creation** (per the create/supersede behavior in the companion doc) unless explicitly resubmitted. Creating a brand-new customer estimate does not clear or regenerate existing vendor deposit rows.

---

## 6. Source map

| Concern | File : lines |
|---|---|
| Customer deposit field | `Models/JobSalesInvoice.cs:70-75` |
| Vendor deposit table (job+vendor scoped) | `Models/VendorDepositSet.cs:15-21` |
| Vendor deposit input DTOs | `Models/NewEstimateDetailClass.cs:21-31` (`VendorDepositClass`, `VendorDepositOverride`) |
| Read-side deposit story aggregate | `Models/CustomerDepositStory.cs:8-16` |
| Save customer deposit | `DatabaseInteraction/JobSalesEstimateSetup.cs:2622-2639` |
| Upsert vendor deposit(s) | `DatabaseInteraction/JobSalesEstimateSetup.cs:2643-2663, 2965-2993` |
| Re-report prior vendor deposits (when list is empty) | `JobSalesEstimateSetup.cs:2646, 2995-3010` |
| Combined approval note/email | `JobSalesEstimateSetup.cs:2857-2937` |
| Flow A deposit block | `Controllers/MgtVendorEstimateToCustomerEstimateController.cs:185-276` |
| Flow B deposit block | same file `:429-517` |
| Single-flow deposit block | same file `:543-669` (deposit handling within) |
| UI soft-warning thresholds (135%, 50%) | `Scripts/.../ManageCustomerVendorDeposit.js:352-393, 461-475, 888-957` (adjust path to actual script location) |
| Markup check (confirmed unrelated) | `Mutators/CustInvoiceAndEstimateMutator.cs:140-208` |

---

## 7. Open threads / possible follow-ups (only if asked)

1. **No server-side floor on customer deposit vs. vendor deposit.** The 135%-of-vendor-deposit "best practice" is entirely client-side and dismissible with one click — if the business wants this to be a hard rule, it needs server-side enforcement in the save helpers (§2/§3), not just the JS warning.
2. **`VendorEstimate.DepositAmount` is dead code for this flow.** Worth confirming whether it's used anywhere else (e.g. vendor-side estimate entry) or is fully vestigial — if vestigial, a candidate for cleanup, but out of scope here.
3. **Vendor deposit persistence across supersede** (§5): since `VendorDepositSet` is job+vendor scoped rather than estimate scoped, re-creating a customer estimate leaves old vendor deposit approvals in place silently. Confirm this matches business intent (mirrors the same job-scoped-supersede question raised in the companion docs).

---

## 8. Suggested skills for the next session

- **`qa`** — to file the no-hard-floor-on-customer-deposit gap (§7.1) as a GitHub issue if the business wants it enforced server-side.
- **`diagnosing-bugs`** — if the job+vendor-scoped (not estimate-scoped) persistence of vendor deposits across supersede turns out to be undesired.
- **`code-review`** — before committing any change to the deposit save paths.

Invoke only if the next session's direction calls for them. Current work is investigation only, no code changes.
