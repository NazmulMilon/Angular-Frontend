# Handoff: Multi-Vendor & Multi-Option → Customer Estimate flows

> **Purpose**: Document how the codebase builds a customer estimate from **multiple vendor estimates** (Flow A) and from **multiple options** (Flow B), so a fresh agent can continue without re-investigating. Investigation only — no code changed.
>
> Codebase: `ProjectRCS` (ASP.NET MVC 5, C#, SQL Server, EF6 + raw ADO.NET, jQuery). Working dir: `/Users/cole-sathngam/Workspace/RetailFixIt/Master`. Branch: `dev`.
>
> **Companion docs** (do not duplicate — reference by path):
> - `docs/VendorToCustomerEstimate_CreationBehavior_Handoff.md` — the **single-vendor** create/supersede behavior.
> - `docs/DynamicMinimumMarkup_Handoff.md` — the markup policy feature.

All file paths below are under `ProjectRCS/`. Controller = `Controllers/MgtVendorEstimateToCustomerEstimateController.cs`; DB helper = `DatabaseInteraction/JobSalesEstimateSetup.cs`.

---

## 0. The grouping fields (read this first)

On `JobSalesInvoice` (`Models/JobSalesInvoice.cs:60-63`):

| Field | Role |
|---|---|
| `MutiEstiIdentifier` (Guid, `:63`) | **Group id** — shared across all siblings in a group. Set to `obj.MainInvoiceKey`. |
| `MCEstimate` (int, `:61`) | **Per-option sequence** within a group. |
| `EstimateTitle` (string, `:62`) | **Per-option label**. |
| `MultipleChoiceEstimate` (bool, `:60`) | `true` = option/multiple-choice estimate; `false` otherwise. |

Also relevant: `VendoeEstimateKey` (`:59`, misspelled in source) — nullable GUID, **no unique constraint**, so many customer-estimate rows may reference one vendor estimate.

---

## 1. FLOW A — Multiple VENDOR estimates → ONE customer estimate ("Multi-Vendor Estimate")

**Shape: many vendor estimates merged into ONE `JobSalesInvoice` (one `InvoiceKey`).**

- **GET / screen**: `CreateMultipleVenOption(Guid? JobKey, Guid?[] InvKey)` — controller `:987-1071`. If only one vendor estimate is selected → redirects to the single `CreateNew` flow (`:995-1004`). Otherwise builds **one** `model.InvoiceKey = Guid.NewGuid()` (`:1015`) and assigns that same key to every `CustomerMultipleObj.InvoiceKey` (`:1017-1031`, esp. `mobj.InvoiceKey = model.InvoiceKey;` at `:1022`). Each vendor's grid loads via `LoadTheEstimateGridStuff` (`:722-742`), rendered per `gridArena` div in view `Views/MgtVendorEstimateToCustomerEstimate/CreateMultipleVenOption.cshtml:51-166`.
- **Save**: `SaveCreateNewEstimateFromMultipleVendor(...)` — controller `:46-292`.
  - **ONE InvoiceKey.** Single `JobSalesInvoiceClass model` (`:60`), `MainInvoiceKey = InvoiceKey` (`:61-62`), `Title = "Multi-Vendor Estimate"` (`:69`), `Sequence = 0` (`:70`). All line items from every vendor (flat `DetailList`) are pushed into one `GlobalClass.GlobalSales` under the shared key (loop `:80-135`, `l.InvoiceKey = InvoiceKey` at `:85`).
  - **Archive/supersede prior estimate: YES** — fetches latest existing estimate and calls `RemoveTheOldSalesInvoice(...)` (`:54-59`), same as single flow (see companion doc §2c: job-scoped supersede, one-level history).
  - **DB helper**: `SaveSalesEstimatesForMultiplevendor(...)` (`:139` → `JobSalesEstimateSetup.cs:3253`). Creates ONE `JobSalesInvoice`, `MultipleChoiceEstimate = false` (`:3274`), `MCEstimate = 0` (`:3275`), `MutiEstiIdentifier = itself` (`:3277`), then all detail rows under that key (`:3305+`).
  - **Join table population** — `JobSalesOrderToVEstimate` (model = `Pkey`, `InvoiceKey`, `VendorEstimateKey`) written in the `foreach (var item in VendorEstimateKeyList)` loop (starts `:144`), at `:171-176`:
    ```csharp
    JobSalesOrderToVEstimate vj = new JobSalesOrderToVEstimate();
    vj.Pkey = Guid.NewGuid();
    vj.VendorEstimateKey = item;   // each vendor estimate
    vj.InvoiceKey = InvoiceKey;    // the ONE shared customer estimate
    bg.JobSalesOrderToVEstimate.Add(vj);
    ```
    → one row per vendor estimate, all pointing at the single `InvoiceKey`. **This is the only flow that writes this join table.**
- **Vendor-estimate status after save** (loop `:144-184`): per selected vendor est. — `Status=2` ("Pending Approval"), `IsApproved/IsCancelled/IsNew/IsEdited=false`, `ApprovedBy=LoginUser` (`:149-158`). Other estimates for same job+vendor (Status≠3) also set Status=2 (`:159-169`). General note saved (`:180`); `CancelAllRegardingVendorEstimates(...)` (`:181`).
- **Deposits** (`#region Partial Deposit Payment`, `:185-276`): customer deposit is scalar (`CustomerDepoAmount`/`ReasonForNoCustomerDeposit`); vendor deposits are a **list** `VendorDepositListObj` iterated per vendor (`:218-222`, persisted via `SetVendorDeposit`); overrides per-vendor (`:241-252`) + customer override (`:254-263`); if any deposit exists `SaveTheApprovalRequestForDeposit(...)` awaited (`:269`).

---

## 2. FLOW B — Multiple OPTIONS → customer estimate(s) ("Multiple Choice / Option" estimate)

**Shape: SEVERAL `JobSalesInvoice` rows (one `InvoiceKey` each), all sharing `MutiEstiIdentifier` — mutually-exclusive options the customer chooses ONE of.**

- **GET / screen**: `CreateNewMultipleOption(Guid? JobKey, Guid? MasterKey, Guid?[] InvKey)` — controller `:896-985`. Single selection → redirects to `CreateNew` (`:904-913`). Otherwise each option gets its **own** new key: `mobj.InvoiceKey = Guid.NewGuid();` inside the loop (`:937`) — contrast Flow A which shares one. `model.InvoiceKey` (`:961`) is the separate group/master key. Grid via `LoadTheEstimateGridStuffForMultioption` (view `CreateNewMultipleOption.cshtml:51`).
- **Save**: `SaveCreateNewEstimateForMultipleOption(..., List<VennCusMultiple> DetailList, ...)` — controller `:305-528`.
  - **SEPARATE InvoiceKey per option.** Outer loop builds a fresh `model` per option (`:320-323`):
    ```csharp
    foreach (var item in DetailList) {
        JobSalesInvoiceClass model = new JobSalesInvoiceClass();
        model.InvoiceKey = item.InvoiceKey;       // per-OPTION key (unique per sibling)
        model.MainInvoiceKey = InvoiceKey;        // shared GROUP key
        model.Title = item.title;                 // :329 per-option title
        model.Sequence = item.Sequence;           // :330 per-option sequence
        model.VendorEstimateKey = item.VendorEstimateKey;  // :331
    ```
    Each option's items pushed under `l.InvoiceKey = item.InvoiceKey` (`:345`).
  - **DB helper (per option)**: `SaveSalesInvoiceEstimatesWithOption(...)` (`:399` → `JobSalesEstimateSetup.cs:3018`). Sets `MultipleChoiceEstimate = true` (`:3039`), `MCEstimate = obj.Sequence` (`:3040`), `EstimateTitle = obj.Title` (`:3041`), `MutiEstiIdentifier = obj.MainInvoiceKey` (`:3042`). One `JobSalesInvoice` row per iteration.
  - **Sibling grouping**: all siblings share `MutiEstiIdentifier = MainInvoiceKey`; differ by `InvoiceKey`, `MCEstimate` (sequence), `EstimateTitle`. `MultipleChoiceEstimate = true`.
  - **Archive/supersede prior estimate: YES** — `:312-318` fetch latest + `RemoveTheOldSalesInvoice(...)` (`:317`), reused unchanged from single flow.
  - **`JobSalesOrderToVEstimate` is NOT written here** — siblings are grouped purely via `MutiEstiIdentifier`.
- **Load siblings back**: `LoadTheEstimateGridStuffForMultioption(Guid id, ...)` (`:764-791`) queries `x.MutiEstiIdentifier == id && x.InvoiceKey != id && x.Status != 3 && x.IsDelete == null` ordered by `MCEstimate` (`:774-780`). Customer-side read-back in `JobSalesEstimateSetup.cs` filters `MutiEstiIdentifier == id` ordered by `MCEstimate` at `:794-802`, `:1033-1040`, `:1490`.
- **Customer chooses ONE** (mutually exclusive): the chosen option is marked `(APPROVED)` via `RespondedByCustomer == 1` (`JobSalesEstimateSetup.cs:802, 1040`); status label "Multiple Option Estimate" (`:225, 682, 946`). Deposit computed on the **smallest** option total (`SmallestTotal`/`txtNetTotal`, `CreateNewMultipleOption.cshtml:141-151, 992`). Group id `= MainInvoiceKey =` first option's key (view JS `CreateNewMultipleOption.cshtml:1081-1083`).
- **Vendor-estimate status after save** (per option, `:405-420`): per `item.VendorEstimateKey` — `Status=2`, flags false, `ApprovedBy` set, note (`:418`), `CancelAllRegardingVendorEstimates` (`:419`).
- **Deposits** (`:429-517`): same structure as Flow A; customer deposit scalar, vendor deposits list iterated `:462-466`, overrides `:482-506`, `SaveTheApprovalRequestForDeposit` (`:514`); deposit uses group-level `InvoiceKey` computed from `SmallestTotal`.

---

## 3.5 Combinatorial scenarios — v1 support matrix

The two flows are **mutually exclusive paths, not composable**. Whether a scenario is possible is a data-model question, not a UI-wiring question — confirmed by an exhaustive sweep of every writer of the two fields that would need to cooperate: `MultipleChoiceEstimate` (the option flag) and the `JobSalesOrderToVEstimate` join table (the multi-vendor link).

| Scenario | Verdict | Why |
|---|---|---|
| **N vendors → one customer estimate** (e.g. 3 vendors merged into a single estimate) | ✅ **Supported**, arbitrary N | Flow A (`SaveCreateNewEstimateFromMultipleVendor`) loops `Guid?[] VendorEstimateKeyList` with no count cap, no `== 2`, no `.Take(2)` — see §1. Confirmed by sweep: same pattern also exists on the **customer invoice** side (`MgtVendorInvoiceToCustomerInvoiceController.cs:320,381`, `SaveCreateNewInvoiceFromMultipleVendor`), an equivalent multi-vendor merge for invoices instead of estimates — not previously documented. |
| **Multiple vendors *with* multiple options** (an option that is itself a multi-vendor merge) | ❌ **Not supported — impossible in v1**, not just unwired | Two independent structural blockers (either one alone would be enough): (1) the per-option DTO `VennCusMultiple.VendorEstimateKey` is a single `Guid?` (`Models/JobSalesInvoiceClass.cs:126`) — there is no list field to hold multiple vendors per option; (2) Flow A's save helper hardcodes `MultipleChoiceEstimate = false` (`JobSalesEstimateSetup.cs:3274`) — its merged output can never carry the option flag. |
| **Mixed option group** (one option single-vendor, another option multi-vendor) | ❌ **Not supported — impossible in v1** | Same root cause as above. Every option in a group is built by the same per-option loop in `SaveCreateNewEstimateForMultipleOption` (`:305-528`), which reads one `item.VendorEstimateKey` per iteration — there's no branch or DTO shape that would let one sibling reference several vendors while another references one. |

### Sweep evidence (exhaustive — every writer, repo-wide)

**Every write of `MultipleChoiceEstimate = <value>` (9 total — 8 literal assignments + 1 pass-through — no other candidates):**

| File : line | Value |
|---|---|
| `JobSalesEstimateSetup.cs:3039` | **`true`** — the *only* place `true` is ever *originated* (Flow B, per option, single-vendor DTO) |
| `JobSalesEstimateSetup.cs:2447, 2604, 3274` | `false` |
| `ManageVendorEstimates.cs:56, 150` | `false` |
| `NewCustomerEstimateController.cs:208` | `false` |
| `JobSalesEstimateSetup.cs:3206` | `= item.MultipleChoiceEstimate` — pass-through, not a literal. This is the supersede/archive copier (`RemoveTheOldSalesInvoice`); it only *propagates* an existing value into the `AfterUpdate` history table onto a row already scoped to one prior `JobSalesInvoice`, never originates `true`, and never touches `JobSalesOrderToVEstimate` — so it can't be the missing link between the flag and a multi-vendor join. Checked and ruled out, not overlooked. |

Because exactly one writer ever *originates* `true` (the pass-through only ever forwards a pre-existing value, it can't manufacture the combination), and that originating writer's input is single-vendor by construction, no code path anywhere in the repo can produce an option backed by multiple vendors.

**Every write of `JobSalesOrderToVEstimate` (the multi-vendor join table, 2 total):**

| File : line | Flow |
|---|---|
| `MgtVendorEstimateToCustomerEstimateController.cs:171` | Flow A — multi-vendor → one customer **estimate** (documented in §1) |
| `MgtVendorInvoiceToCustomerInvoiceController.cs:381` (method `SaveCreateNewInvoiceFromMultipleVendor`, `:320`) | Parallel multi-vendor → one customer **invoice** flow — same shape as Flow A, applied to invoices |

Neither writer ever sets `MultipleChoiceEstimate = true`, confirming the join table and the option flag never co-occur.

### Bottom line

Extending either flow to support the missing scenarios would require an actual data-model change — e.g. making the option DTO hold a list of vendor-estimate keys instead of one, and teaching the option save path to write `JobSalesOrderToVEstimate` rows per option — not a UI change. This is a genuine v1 gap, not an oversight in routing.

---

## 3.6 What we can do about it

Three ways to close the gap, roughly ordered by effort/risk:

1. **Do nothing (accept the v1 limit) + make it visible in the UI.** Cheapest option: explicitly disable/hide the "multi-vendor" button when the admin is already inside the multi-option flow (and vice versa), so the impossibility is communicated instead of silently unreachable. No data model or save-path changes. Good stop-gap if this combination is rare in practice.

2. **Model it as "an option can reference a multi-vendor estimate as its source."** Structural change:
   - Change `VennCusMultiple.VendorEstimateKey` (`Models/JobSalesInvoiceClass.cs:126`) from a single `Guid?` to a `List<Guid?>` (or add a parallel `VendorEstimateKeyList` alongside it, kept nullable/optional for backward compatibility with existing single-vendor options).
   - In `SaveCreateNewEstimateForMultipleOption` (`MgtVendorEstimateToCustomerEstimateController.cs:305-528`), when an option carries more than one vendor key, run the same merge-loop logic Flow A already has (`:144-184`) *per option* instead of once per whole save — i.e. write one `JobSalesInvoiceDetail` set per option (unchanged) **and** one `JobSalesOrderToVEstimate` row per (option `InvoiceKey`, vendor key) pair instead of per (group `InvoiceKey`, vendor key).
   - `SaveSalesInvoiceEstimatesWithOption` (`JobSalesEstimateSetup.cs:3018`) keeps setting `MultipleChoiceEstimate = true` exactly as today — no flag semantics change needed, since the flag already means "this JobSalesInvoice is one of several sibling options," independent of how many vendors fed it.
   - This is the smallest change that unlocks **both** missing scenarios at once: multi-vendor-per-option, and mixed single/multi groups (since each option's vendor list length is independent).
   - Read-back sites that assume one vendor per option (`LoadTheEstimateGridStuffForMultioption`, `JobSalesEstimateSetup.cs:794-802, 1033-1040, 1490`) would need to resolve "the vendor estimate(s) for this option" via the join table instead of a single FK — mirroring how Flow A's read-back already works.

3. **Keep the two flows separate but let an admin pre-merge vendors before entering the option flow.** Lower-risk alternative to #2: don't change the option data model at all. Instead, let the admin run Flow A first to produce a **standalone multi-vendor estimate**, then feed that resulting estimate's `InvoiceKey` into the option flow as if it were a single "vendor-equivalent" source. This would need Flow B's option loop to accept a customer-estimate key as a stand-in for a vendor-estimate key (a type-shape change in `VennCusMultiple` and in how `SaveSalesInvoiceEstimatesWithOption` resolves `item.VendorEstimateKey` for display/status purposes), which is architecturally messier than #2 but touches fewer of the historically-single-vendor assumptions scattered through vendor-estimate status updates (`:405-420`).

**Recommendation:** if this combination is genuinely needed by the business (not just theoretically possible), **option 2** is the right shape — it generalizes the existing per-option loop rather than bolting a second concept on top, and it reuses Flow A's already-proven join-table pattern. Options 1 and 3 are fallbacks if the effort for #2 isn't justified right now.

---

## 3. Cross-cutting facts (both flows)

- **Dynamic Minimum Markup threshold check is BYPASSED in both flows.** The endpoint exists (`MgtVendorEstimateToCustomerEstimateController.cs:871-890`) but is invoked **only** by the single-estimate view `CreateNew.cshtml` (JS `:1070`, POST `:1092`, save-gate `:1228`; `ViewBag.DynamicMinimumMarkupData` loaded at controller `:844-851`). Grep for `threshold`/`GrandTotalIsWithin`/`DynMinMarkup` in `CreateMultipleVenOption.cshtml` and `CreateNewMultipleOption.cshtml` returns nothing. → **The markup floor is not enforced when combining multiple vendors or offering multiple options.** (Consistent with the markup handoff.)
- **Admin fees**: all three save helpers hardcode `model.AddAdminFees = false; model.AdminMarkup = 0;` before the call (controller `:137-138`, `:396-397`, `:630-631`); admin markup is instead carried as line items in `GlobalSales`.
- **One-vs-many InvoiceKey summary**:
  - Flow A → **one** `JobSalesInvoice` / **one** `InvoiceKey`; N rows in `JobSalesOrderToVEstimate` linking each vendor estimate to it.
  - Flow B → **many** `JobSalesInvoice` rows, **one `InvoiceKey` each**, all sharing `MutiEstiIdentifier` (the group id).
- **Both supersede** the prior job estimate via `RemoveTheOldSalesInvoice` (job-scoped, one-level history — see companion doc).

---

## 4. Source map

| Concern | File : lines |
|---|---|
| Flow A GET (multi-vendor screen) | `Controllers/MgtVendorEstimateToCustomerEstimateController.cs:987-1071` |
| Flow A save | same file `:46-292` (join-table loop `:171-176`; deposits `:185-276`) |
| Flow A DB helper | `DatabaseInteraction/JobSalesEstimateSetup.cs:3253` |
| Flow B GET (multi-option screen) | `Controllers/MgtVendorEstimateToCustomerEstimateController.cs:896-985` |
| Flow B save | same file `:305-528` (option loop `:320-345`; deposits `:429-517`) |
| Flow B DB helper (per option) | `DatabaseInteraction/JobSalesEstimateSetup.cs:3018` |
| Flow B sibling load | controller `:764-791`; `JobSalesEstimateSetup.cs:794-802, 1033-1040, 1490` |
| Grouping fields | `Models/JobSalesInvoice.cs:59-63` |
| Join table model | `Models/JobSalesOrderToVEstimate.cs` |
| Threshold endpoint (single-flow only) | controller `:871-890`; view `CreateNew.cshtml:1070,1092,1228` |
| Views | `Views/MgtVendorEstimateToCustomerEstimate/CreateMultipleVenOption.cshtml`, `CreateNewMultipleOption.cshtml` |
| Parallel multi-vendor **invoice** flow (not previously documented, see §3.5) | `Controllers/MgtVendorInvoiceToCustomerInvoiceController.cs:320-390` |

---

## 5. Open threads / possible follow-ups (only if asked)

1. **Markup gap**: neither multi-flow enforces the Dynamic Minimum Markup floor (§3). If enforcement across combined/optional estimates is desired, that's a feature gap.
2. **Job-scoped supersede**: like the single flow, both multi-flows archive the latest estimate for the whole **job** (not scoped to the vendor estimate), one level of history only — confirm this matches business intent.
3. **UI trigger mapping**: which buttons on the estimate listing route to Flow A vs. Flow B vs. single `CreateNew` (start from `Views/MgtVendorInvoice/EIndex.cshtml`) — carried over from the companion doc as still-open.
4. **Combinatorial scenarios — RESOLVED, see §3.5/§3.6**: multi-vendor-per-option and mixed option groups are confirmed impossible in v1 (data-model limit, exhaustively swept). §3.6 outlines three implementation options if the business decides to close the gap. Not open — just flagging it's now fully documented rather than needing further investigation.

---

## 6. Suggested skills for the next session

- **`qa`** — to file the markup-not-enforced-in-multi-flows gap (§5.1), the job-scoped-supersede question (§5.2), or the combinatorial-scenarios gap (§3.5/§5.4) as GitHub issues.
- **`diagnosing-bugs`** — if the job-wide supersede or bypassed markup is deemed a defect and needs root-causing.
- **`request-refactor-plan`** — if the business decides to pursue §3.6 option 2 (generalize the option DTO to a vendor-key list), to turn it into a tiny-commit implementation plan via interview.
- **`code-review`** — before committing any change to these save paths.

Invoke only if the next session's direction calls for them. Current work is investigation with no code changes.
