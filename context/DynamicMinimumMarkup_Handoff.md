# Handoff: Customer Profile Dynamic Minimum Markup

> **Purpose of this document**
> A complete reconstruction spec for the **Dynamic Minimum Markup** feature. It documents *what the feature does*, *how data is stored*, *how it is pulled from storage*, *how it is applied to a customer estimate*, and *what happens when the estimate is over or under the required markup* — with enough detail to **recreate the feature in another version/codebase** without reading the original source.
>
> Codebase of record: `ProjectRCS` (ASP.NET MVC 5, C#, SQL Server, EF6 + raw ADO.NET, jQuery UI).
> Internal names: `CustProfileDynMinMarkup` / `DynMinMarkup`.

---

## 1. Feature summary (what & why)

Each **customer** can have a configured **minimum markup policy**. When an admin builds a **customer estimate** from a **vendor estimate**, the customer's grand total must be at least a certain percentage above the vendor cost. That required percentage is **dynamic** — it depends on:

1. **Cost tiers** — "if the vendor total is over $X, require Y% markup" (highest matching tier wins).
2. **Emergency jobs** — a dedicated markup % for emergency job types.
3. **Non-emergency jobs** — a fallback markup % for everything else.

On save of a customer estimate, the system computes the required minimum customer total and:

- **If the customer total meets/exceeds it (over markup)** → save proceeds normally.
- **If the customer total is below it (under markup)** → save is blocked; the admin is shown an explanation and may **escalate the estimate for approval** (email to an approver, who approves/rejects).

> ⚠ **This is not the whole story.** Before the admin ever sees the estimate, a separate, silent auto-adjustment step already tries to push the total up to the minimum by inflating the materials rate and then labor hours — see **§5.5** for exactly what it does, where it runs, and why the block/escalate path above is mostly only reachable after a manual edit. Read §5.5 before treating this feature as "check and block only."

---

## 2. Domain model & row semantics (the key concept)

A customer's policy is **not one row** — it is a **set of rows** in one table, distinguished by two boolean flags. This is the single most important design decision to replicate.

| Row kind | `IsEmergency` | `IsNonEmergency` | `CostOverValue` | `MarkupPercentage` |
|---|---|---|---|---|
| Emergency markup | `1` | `0` | `0` | e.g. `50.00` |
| Non-emergency markup | `0` | `1` | `0` | e.g. `30.00` |
| Cost tier (0..N rows) | `0` | `0` | `> 0` (threshold, e.g. `5000.00`) | e.g. `20.00` |

Rules the code assumes:
- Exactly **one** emergency row and **one** non-emergency row per customer.
- **Zero or more** tier rows, each with a distinct `CostOverValue` threshold.
- Rows ordered by `RowNumber` (1-based, assigned on insert in this order: emergency, non-emergency, then tiers in UI order).
- Soft-delete column `IsDeleted` exists but the *update path hard-deletes* (see §4.2) — reads still filter `IsDeleted = 0`.

---

## 3. Storage (DB schema)

Two tables in schema `dbo`. In the source version they are defined only inside the EF EDMX SSDL (no standalone migration). **When recreating, create them explicitly** with the DDL below.

### 3.1 `dbo.CustomerProfileDynMinMarkup` — live values

```sql
CREATE TABLE dbo.CustomerProfileDynMinMarkup (
    PKey              UNIQUEIDENTIFIER  NOT NULL PRIMARY KEY,   -- row id
    CustomerKey       UNIQUEIDENTIFIER  NOT NULL,               -- link to customer (no FK constraint in original)
    CreatedOn         DATETIME          NULL,
    EditedOn          DATETIME          NULL,
    CreatedByName     NVARCHAR(MAX)     NULL,                   -- admin display name
    EditedByName      NVARCHAR(MAX)     NULL,
    IsEmergency       BIT               NOT NULL,               -- row holds emergency markup %
    IsNonEmergency    BIT               NOT NULL,               -- row holds non-emergency markup %
    CostOverValue     DECIMAL(18,2)     NULL,                   -- tier threshold; 0 for emergency/non-emergency rows
    MarkupPercentage  DECIMAL(18,2)     NULL,                   -- required minimum markup % for this rule
    IsDeleted         BIT               NOT NULL,               -- soft-delete flag (reads filter = 0)
    CreatedByAdminKey UNIQUEIDENTIFIER  NULL,
    EditedByAdminKey  UNIQUEIDENTIFIER  NULL,
    RowNumber         INT               NOT NULL                -- ordering within a customer's set
);
-- Recommended (not in original): index for the hot read path
CREATE INDEX IX_CustProfileDynMinMarkup_Customer
    ON dbo.CustomerProfileDynMinMarkup (CustomerKey, IsDeleted) INCLUDE (RowNumber);
```

### 3.2 `dbo.CustomerProfileDynMinMarkupAuditLog` — append-only audit

```sql
CREATE TABLE dbo.CustomerProfileDynMinMarkupAuditLog (
    PKey              UNIQUEIDENTIFIER  NOT NULL PRIMARY KEY,
    CustomerKey       UNIQUEIDENTIFIER  NOT NULL,
    IsInsertOperation BIT               NOT NULL,   -- always 1 in current save path
    IsUpdateOperation BIT               NOT NULL,
    IsDeleteOperation BIT               NOT NULL,
    IsEmergency       BIT               NOT NULL,
    IsNonEmergency    BIT               NOT NULL,
    CostOverValue     DECIMAL(18,2)     NULL,
    MarkupPercentage  DECIMAL(18,2)     NULL,
    IsDeleted         BIT               NOT NULL,
    CreatedOn         DATETIME          NULL,
    AdminName         NVARCHAR(MAX)     NULL,
    AdminKey          UNIQUEIDENTIFIER  NULL,
    RowNumber         INT               NOT NULL
);
```

### 3.3 Human-readable note (reuses existing table)

On every save, a serialized snapshot of the submitted form is also written to the existing customer-notes table:

```sql
INSERT INTO dbo.CustomerNote (NoteKey, CustomerKey, AddedBy, AddedOn, Comment, Title, IsDelete, Remarks)
VALUES (<newguid>, <customerKey>, <adminKey>, <utcNow>,
        <serializedFormData>,
        'Minimum Markup for Estimates and Invoices modified', 0, 'System Auto Note');
```

`<serializedFormData>` is a serialized copy of the submitted view model (emergency %, non-emergency %, and each tier). This gives a plain-text history in the customer profile even though the audit table is machine-oriented.

### 3.4 Tables to store an "under-markup" estimate pending approval

The escalation path (§7) persists the estimate for an approver. In the source this is `dbo.CustomerEstimateBelowMarkup` (managed by `ManageCustomerEstimateBelowMarkup`). Minimum fields to replicate:

```sql
CREATE TABLE dbo.CustomerEstimateBelowMarkup (
    PKey                        UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    JobKey                      UNIQUEIDENTIFIER NOT NULL,
    VendorEstimateKey           UNIQUEIDENTIFIER NOT NULL,
    CustomerKey                 UNIQUEIDENTIFIER NOT NULL,
    EstimateTableFullHtml       NVARCHAR(MAX)    NULL,   -- rendered estimate table for the approver to view
    MarkupPercentageFromDbData  DECIMAL(18,2)    NULL,   -- required % that was not met
    SaveEstimatePayloadBase64   NVARCHAR(MAX)    NULL,   -- base64 of the original save payload, replayed on approval
    ExplanationMessage          NVARCHAR(MAX)    NULL,
    ApprovalOrRejectionActionDone BIT            NOT NULL DEFAULT 0,
    -- + created/approver/remarks/timestamps as needed
);
```

---

## 4. Data-access layer

The source uses **raw ADO.NET** (not EF) for CRUD on these tables, reading the connection string out of the EF entity connection. Replicate the *behavior*; the transport is up to your version.

### 4.1 Read: get all rows for a customer

```sql
SELECT * FROM dbo.CustomerProfileDynMinMarkup
WHERE CustomerKey = @CustomerKey AND IsDeleted = 0
ORDER BY RowNumber;
```

Maps each row into a DAO with the columns above. `CostOverValue` and `MarkupPercentage` are nullable decimals.

### 4.2 Write: replace all rows for a customer (delete-and-reinsert)

**"Update" = delete every existing row for the customer, then insert the new set.** All inside **one transaction**; roll back on any error.

```
BEGIN TRAN
  DELETE FROM dbo.CustomerProfileDynMinMarkup WHERE CustomerKey = @CustomerKey;   -- hard delete
  rowNumber = 0
  FOR EACH item IN itemsToSave (emergency, non-emergency, then tiers):
      rowNumber++
      INSERT INTO dbo.CustomerProfileDynMinMarkup (...) VALUES (newGuid, ..., RowNumber = rowNumber, IsDeleted = 0)
      INSERT INTO dbo.CustomerProfileDynMinMarkupAuditLog (...) VALUES (newGuid, ..., IsInsertOperation = 1)
  INSERT INTO dbo.CustomerNote (...)   -- serialized snapshot, see §3.3
COMMIT
```

Notes for reconstruction:
- Timestamps use **UTC** (`DateTime.UtcNow`).
- `CreatedByAdminKey`/`EditedByAdminKey`/audit `AdminKey` come from the logged-in user; `CreatedByName`/`AdminName` from the user's display name.
- The audit table only ever records insert operations in this path (delete is implicit; there is no per-row delete audit).

---

## 5. Config UI — reading & writing the policy

### 5.1 Load for the profile form

`GET /MgtCustomerAssist/GetDynamicMinimumMarkupData?CustomerKey=<guid>` → JSON view model:

```jsonc
{
  "CustomerKey": "…",
  "MarkupPercentageForEmergency": 50.0,       // from the IsEmergency row
  "MarkupPercentageForNonEmergency": 30.0,    // from the IsNonEmergency row
  "OverValuesWithMarkupPercentages": [        // tier rows (both flags false), ordered by RowNumber
    { "CostOverValue": 5000.0, "MarkupPercentage": 20.0 },
    { "CostOverValue": 10000.0, "MarkupPercentage": 15.0 }
  ]
}
```

Reconstruction logic: read all rows (§4.1); emergency % = first `IsEmergency` row's %, non-emergency % = first `IsNonEmergency` row's %, tiers = rows where both flags false ordered by `RowNumber`. Empty view model if the customer has none.

### 5.2 Save from the profile form

`POST /MgtCustomerAssist/SaveDynamicMinimumMarkupData` with the same view model shape.

Server-side validation (all must pass, else return an inline error string):
- Payload non-null and `CustomerKey != Guid.Empty`.
- `MarkupPercentageForEmergency > 0`.
- `MarkupPercentageForNonEmergency > 0`.
- Every tier's `CostOverValue > 0`.
- Every tier's `MarkupPercentage > 0`.

Then build the row set (emergency row, non-emergency row, one row per tier — see §2), serialize the form for the note, and call the delete-and-reinsert writer (§4.2). Return `"Minimum markup data has been saved successfully"` on success.

UI partial: a form with emergency %, non-emergency %, and an add/remove-rows table of `(CostOverValue, MarkupPercentage)` pairs, embedded in the customer edit page.

---

## 5.5 ⚠ CORRECTION (added after independent re-verification): a silent auto-adjustment algorithm ALSO exists

**Everything in §6-§8 below describes a real, separate mechanism — the block-and-escalate check called from the front end before save. But an earlier version of this document implied that mechanism was the *only* one, with "no automatic adjustment of quantities/rates." That was wrong.** There is a second, distinct mechanism that runs automatically and silently every time a single-vendor customer estimate is built, **before** the admin ever sees it. This section documents it precisely; §6-§8 are unchanged and still accurate for the check-before-save path.

### 5.5.1 What it does

`CustInvoiceAndEstimateMutator.AdjustCustomerInvoiceObjsAgainstDynamicMinimumMarkup(model, customerKey)` (`ProjectRCS/Mutators/CustInvoiceAndEstimateMutator.cs:32-132`) mutates the in-memory `CustomerInvoiceObjects` **in place**, attempting to push the customer grand total up to the required minimum, in two ordered steps:

1. **Materials rate bump (once, not a loop).** Finds the materials detail line (`FindMaterialsDetailLine`, `:263-269` — matches on `VendorEstimateChargeType == CustomerEstimateChargeType == "materials"`) and does:
   ```csharp
   materialsLine.CustomerEstimateRates += 10m;   // flat +$10 to RATE, not +10% and not qty (:77)
   ```
   Then recalculates `Amt = Qty * Rate` and re-totals the whole invoice (`RecalculateMaterialsDetailLine` `:315-322`, `RecalculateInvoiceTotalsAfterDetailChanges` `:347+`). If the total now clears the threshold, it stops here (`:87-90`).

2. **Labor hours bump (looped, up to 2000 iterations) — only if step 1 wasn't enough.** Finds the labor/hourly line (`FindStandardHourlyDetailLine`, `:276-313` — prefers the row tagged `RowIdentifier == "labor"` with `ItemName == "Standard Hourly Rate"`, falls back to any `"labor"` row, then to a `"helperlabor"` row) and repeats, up to `maxLaborIterations = 2000` times (`:95-124`):
   ```csharp
   hourlyLine.LaborHr += 0.5m;                                  // :106
   hourlyLine.CustomerEstimateQty = hourlyLine.LaborHr * hourlyLine.TechOnSite;   // :109
   ```
   recalculating Amt/totals after each bump (`RecalculateLaborDetailLineAfterLaborHrChange` `:324-345`), re-checking the total against the threshold every iteration, and stopping as soon as it clears (`:120-123`) or after 2000 tries.

If a C# exception occurs anywhere in this method, it's swallowed and the (partially-mutated) model is returned as-is (`:126-129`) — no error surfaces to the admin.

### 5.5.2 Where it's wired in — and where it is NOT

**Confirmed by an exhaustive repo-wide grep: there is exactly one call site for this method, anywhere in the codebase:**

```csharp
// ProjectRCS/DatabaseInteraction/VendorEstimateToCustomerEstimaeSetup.cs:2370-2372
// adjust the customer invoice against dynamic minimum markup, if needed
CustInvoiceAndEstimateMutator mutator = new CustInvoiceAndEstimateMutator();
model = await mutator.AdjustCustomerInvoiceObjsAgainstDynamicMinimumMarkup(model, CustomerKey);
```

This sits at the very end of `GetVendorEstimateForCreateEstimateNew` — the markup engine used to build/load a **single-vendor** customer estimate from a vendor estimate (see `Customer_Estimate_from_Vendor_Estimates_Technical_Reference.md` §3.4/4.4). It runs **every time that method runs** — i.e., every initial page load of the create-estimate screen and every AJAX grid (re)load — not just once at final save.

**It is NOT called from:**
- The multi-option save path (`SaveSalesInvoiceEstimatesWithOption`, `JobSalesEstimateSetup.cs:3018`)
- The multi-vendor save path (`SaveSalesEstimatesForMultiplevendor`, `JobSalesEstimateSetup.cs:3253`)
- The multi-vendor/multi-option grid loader (`GetVendorEstimatelineItem`, `VendorEstimateToCustomerEstimaeSetup.cs:929`)
- The **edit** path for an already-created estimate (`UpdateSalesInvoiceEstimates`, `JobSalesEstimateSetup.cs:3520` — see `CustomerEstimate_EditRecalculation_Handoff.md`)

So the auto-bump is **specific to first building a single-vendor estimate** — Features documented in `MultiVendor_MultiOption_Estimate_Flows_Handoff.md` (multi-vendor merge, multi-option) never get this treatment, and neither does any later manual edit.

### 5.5.3 How this interacts with the block/escalate check in §6-§8

- **The numbers the admin sees already reflect the auto-bump.** `GetVendorEstimateForCreateEstimateNew`'s return value is served directly to the view (`MgtVendorEstimateToCustomerEstimateController.cs:772, 778`) — there is no separate unmutated copy. If materials rate or labor hours look higher than the raw vendor-cost-times-markup-% calculation would produce, this is why.
- **Practical effect: on initial single-vendor estimate creation, the block/escalate modal (§7) essentially cannot fire** — the total has usually already been pushed to/above the minimum before the admin ever looks at the screen or clicks save.
- **The escalate modal becomes reachable once the admin edits the estimate afterward.** Editing (`Sales.cshtml` / `UpdateSalesInvoiceEstimates`, see `CustomerEstimate_EditRecalculation_Handoff.md`) never re-invokes the auto-adjust mutator. So an admin who manually lowers Rate or Qty after the estimate loads can legitimately put the total back under the minimum — and *that's* when the pre-save JS check (`CheckIfCustomerGrandTotalIsWithinThreshold`, §6-§7) will actually block the save and offer escalation.
- **Completely silent either way.** The mutator only ever sets `model.ExplanationMessageForDynMinMarkup` (`CustInvoiceAndEstimateMutator.cs:67`) from the underlying check call, and that message is empty once the bump succeeds. There is no log, banner, tooltip, or note anywhere indicating a rate or hours bump was auto-applied — from the admin's point of view, the materials rate or labor hours simply already look higher than expected, with zero explanation on screen.

### 5.5.4 Rebuild note for V2

If V2 wants to replicate this behavior exactly: implement the two-step bump (materials rate +$10 once, then labor hours +0.5 looped up to 2000x, both re-triggering the same threshold formula from §6.3) as part of the **single-vendor create/load path only**, and decide deliberately whether V2 should (a) keep it silent as V1 does, (b) surface it to the admin, or (c) extend it to the multi-vendor/multi-option paths where V1 never applied it (a possible V1 gap, not necessarily intentional — there's no doc-comment or note explaining why those paths were excluded). Recommend flagging this choice with stakeholders since "invisible auto-inflation of billed hours/rate to hit a margin target" is a business-sensitive behavior worth confirming is actually wanted, not just carried over because V1 happened to do it.

---

## 6. Applying the policy to a customer estimate (the resolution algorithm)

### 6.1 When it runs

On the customer-estimate create/edit screen, **before the estimate is saved**, the front end POSTs the current totals to a threshold-check endpoint and only proceeds if within threshold.

`POST /MgtVendorEstimateToCustomerEstimate/CheckIfCustomerGrandTotalIsWithinThreshold`

Request DTO:
```jsonc
{
  "JobTypeKey": "…",          // used to detect emergency jobs
  "CustomerKey": "…",
  "VendorGrandTotal": 8000.0, // vendor cost
  "CustomerGrandTotal": 9000.0 // what the admin is charging the customer
}
```

### 6.2 Resolve the required markup % (precedence — replicate exactly)

Load the customer's rows (§4.1). Then:

1. **Cost tiers first.** Take tier rows (`!IsEmergency && !IsNonEmergency && CostOverValue > 0 && MarkupPercentage has value`), **order by `CostOverValue` descending**, and return the `MarkupPercentage` of the **first tier whose threshold `VendorGrandTotal` strictly exceeds** (`VendorGrandTotal > CostOverValue`).
2. **Else emergency.** If `JobTypeKey` equals the system's Emergency job-type id, return the emergency row's `MarkupPercentage` (must be `> 0`).
3. **Else non-emergency.** Return the non-emergency row's `MarkupPercentage` (must be `> 0`).
4. **Else** → `null` (no policy resolvable).

> Precedence order matters: a matching **cost tier overrides** the emergency/non-emergency distinction. Tiers are checked high-to-low so the largest satisfied threshold wins.

### 6.3 Compute the required customer total

```
expectedCustomerGrandTotal = vendorGrandTotal + (markupPercentage / 100) * vendorGrandTotal
```

### 6.4 Response DTO

```jsonc
{
  "CurrentCustomerGrandTotal": 9000.0,
  "ExpectedCustomerGrandTotal": 9600.0,
  "MarkupPercentageFromDbData": 20.0,
  "VendorGrandTotal": 8000.0,
  "ExplanationMessageForDynMinMarkup": "",   // populated ONLY when under markup (see §7)
  "ValidationErrorMessage": ""               // populated on error/misconfig (see §8)
}
```

---

## 7. Over vs. under markup — what happens

The **server** decides by comparing `CurrentCustomerGrandTotal` to `ExpectedCustomerGrandTotal`.

### 7.1 Over/at markup (`Current >= Expected`) — allowed

- `ExplanationMessageForDynMinMarkup` and `ValidationErrorMessage` left empty.
- Front end sees no message and treats it as **within threshold** → the normal estimate-save AJAX proceeds.

### 7.2 Under markup (`Current < Expected`) — blocked

Server populates `ExplanationMessageForDynMinMarkup` with an HTML message, e.g.:

> You cannot reduce the estimate cost below **20 %** of the vendor cost. The vendor estimate total of **$8000.00** must be marked up by at least **20 %** to achieve a minimum customer estimate total of **$9600.00**.

Front-end handling (`CheckIfCustomerGrandTotalIsWithinThreshold` JS) in priority order:
1. If `ExplanationMessageForDynMinMarkup` present → show it in the below-markup modal, mark **not within threshold**.
2. Else if `ValidationErrorMessage` present → show that in the modal, not within threshold (§8).
3. Else if `ExpectedCustomerGrandTotal > CurrentCustomerGrandTotal` → generic "Customer grand total is too low…" message, not within threshold. *(defensive fallback)*
4. Otherwise → within threshold.

When not within threshold, the JS also stashes `MarkupPercentageFromDbData` into a hidden field and **base64-encodes the original save payload** into another hidden field (needed to replay the save if approved). The normal save is aborted (the "please wait" modal is hidden and the function returns).

### 7.3 Escalation: send for approval anyway

The below-markup modal offers **"send for approval"** (with a JS confirm). On confirm it POSTs:

`POST /ApproveEstimateBelowMarkup/SaveApprovalForSimpleEstimate`
```jsonc
{
  "JobKey": "…", "VendorEstimateKey": "…", "CustomerKey": "…",
  "EstimateTableFullHtml": "<table>…</table>",      // rendered estimate for the approver to view
  "MarkupPercentageFromDbData": 20.0,               // the required % that was missed
  "SaveEstimateToDatabaseJsFuncApiPayload": "<base64>", // original save payload, replayed on approval
  "ExplanationMessage": "…"
}
```

Server (`SaveApprovalForSimpleEstimate`):
1. Validate `JobKey`/`VendorEstimateKey`/`CustomerKey`, `EstimateTableFullHtml`, and the base64 payload are all present.
2. Persist the record to `dbo.CustomerEstimateBelowMarkup` (§3.4).
3. **Email the approver** (`SendApprovalMailForEstimateBelowMarkup`).
4. Return `"Estimate has been successfully saved for approval."`.

Approver decision: `POST /ApproveEstimateBelowMarkup/DoApprovalOrDenialForSimpleEstimate`
- Validates keys; **remarks required on rejection**.
- Loads the stored estimate; rejects the action if `ApprovalOrRejectionActionDone = 1` (idempotency guard against double-processing).
- **Approve** → build approval email + proceed (the stored base64 payload is what re-drives the actual estimate save). **Reject** → notify with remarks.
- Mark `ApprovalOrRejectionActionDone = 1`.

---

## 8. Error / misconfiguration handling

`ValidationErrorMessage` (shown in the same modal) is returned when:
- **No customer key** on the request → "customer key not found" message.
- **No markup policy** rows exist for the customer, or the resolution returns `null` → "no minimum markup defined in profile" message.
- **Unhandled server exception** → generic "an error occurred" message (the whole check is wrapped in try/catch; any throw yields this rather than leaking details).

Design intent: when the policy can't be evaluated, the estimate is **treated as not-within-threshold** (blocked), not silently allowed.

### Read-only reference modal on the estimate screen

The estimate create screen also loads the customer's rows server-side into a view-bag and renders a **read-only "Minimum Markup Values"** modal (the `btnShowDynamicMinimumMarkupData` / `#ModalForDynamicMinimumMarkupData` button) so the admin can see the policy while pricing. This is display-only; the authoritative check is the endpoint in §6.

---

## 9. Rebuild checklist

1. **Schema** — create the two tables in §3.1/§3.2 (+ the below-markup approval table §3.4). Add the recommended index. Ensure the existing customer-notes table accepts the snapshot insert (§3.3).
2. **DAO/read** — implement "get rows by customer" (`WHERE CustomerKey=@k AND IsDeleted=0 ORDER BY RowNumber`).
3. **DAO/write** — implement transactional **delete-then-reinsert** + audit inserts + note insert (§4.2), UTC timestamps, admin identity from session.
4. **Config API** — `GET GetDynamicMinimumMarkupData` (§5.1) and `POST SaveDynamicMinimumMarkupData` with the five validations (§5.2).
5. **Config UI** — profile form: emergency %, non-emergency %, add/remove tier rows.
6. **Resolution** — implement `TryResolveMarkupPercentage` precedence exactly (§6.2): tiers desc → emergency → non-emergency → null.
7. **Threshold API** — `POST CheckIfCustomerGrandTotalIsWithinThreshold` computing `expected = vendor + (pct/100)*vendor`, returning the DTO in §6.4, with the error cases in §8.
8. **Estimate UI wiring** — call the threshold API before save; interpret the response per §7.2; block/allow accordingly; render the read-only reference modal (§8).
9. **Escalation** — below-markup modal + `SaveApprovalForSimpleEstimate` (persist + email) + `DoApprovalOrDenialForSimpleEstimate` (approve/reject with idempotency guard) per §7.3.

---

## 10. Source map (original codebase — for cross-reference only)

| Concern | File |
|---|---|
| Live-values entity | `ProjectRCS/Models/CustomerProfileDynMinMarkup.cs` |
| Audit entity | `ProjectRCS/Models/CustomerProfileDynMinMarkupAuditLog.cs` |
| DAO | `ProjectRCS/DAO/CustomerProfileDynMinMarkupDao.cs` |
| Data access (read/write, raw ADO.NET) | `ProjectRCS/DatabaseInteraction/ManageCustProfileDynMinMarkup.cs` |
| Config read/save API | `ProjectRCS/Controllers/MgtCustomerAssistController.cs` (`GetDynamicMinimumMarkupData`, `SaveDynamicMinimumMarkupData`) |
| Resolution + threshold logic | `ProjectRCS/Mutators/CustInvoiceAndEstimateMutator.cs` (`CheckIfCustomerGrandTotalIsWithinThreshold`, `TryResolveMarkupPercentage`) |
| Threshold API endpoint | `ProjectRCS/Controllers/MgtVendorEstimateToCustomerEstimateController.cs` (`CheckIfCustomerGrandTotalIsWithinThreshold`) |
| Estimate screen UI + JS | `ProjectRCS/Views/MgtVendorEstimateToCustomerEstimate/CreateNew.cshtml` |
| Config UI partial | `ProjectRCS/Views/Shared/Partials/_PartialViewCustProfileDynMinMarkup.cshtml` |
| Below-markup approval | `ProjectRCS/Controllers/ApproveEstimateBelowMarkupController.cs`, `ProjectRCS/DatabaseInteraction/ManageCustomerEstimateBelowMarkup.cs` |
| View models / DTOs | `CustomModels/CustProfileDynMinMarkupViewModel.cs`, `CustomModels/OverValWMarkupViewModel.cs`, `CustomModels/DynMinMarkupCheckStatusModel.cs`, `DTOs/InvoiceCustGrandTotalThresholdCheckDto.cs`, `DTOs/CustomerEstimateBelowMarkupSaveReqDto.cs` |
