# Handoff: Customer Estimate Line-Item EDIT & Recalculation Behavior

> **Purpose**: Document what actually happens, field-by-field, when an admin edits an *existing* customer estimate's line items (Qty, Rate, markup%) — as opposed to the initial creation flows. So a fresh agent (or the V2 team) doesn't have to re-derive this. Investigation only — no code changed.
>
> Codebase: `ProjectRCS` (ASP.NET MVC 5, C#, SQL Server, EF6, jQuery). Working dir: `/Users/cole-sathngam/Workspace/RetailFixIt/Master`. Branch: `dev`.
>
> **Companion docs** (do not duplicate — reference by path):
> - `docs/Customer_Estimate_from_Vendor_Estimates_Technical_Reference.md` — how a customer estimate is first *created* from vendor estimates, including the CREATE-time markup engine (`GetVendorEstimateForCreateEstimateNew`).
> - `docs/MultiVendor_MultiOption_Estimate_Flows_Handoff.md` — multi-vendor and multi-option creation flows.
> - `docs/VendorToCustomerEstimate_CreationBehavior_Handoff.md` — single-vendor create/supersede behavior.

---

## 0. The headline answer

**Quantity is the only thing that gets recalculated live. Rate is a freely-editable plain number, never re-derived from vendor cost or a markup percentage once a line exists. There is no per-line or per-estimate "markup %" control in the edit UI at all** — the only percentage-driven field is a single synthetic "Admin fee % mark-up" line, and even that recomputes off the *other lines' current dollar total*, not off vendor cost.

In short: editing an estimate is **Amt = Rate × Qty**, full stop. Markup only ever happens once, at creation time, in a completely different code path that the edit screen never touches again.

---

## 1. Where editing happens

Two controller actions in `Controllers/MgtJobSalesOrderController.cs` drive editing of an existing `JobSalesInvoice`/`JobSalesInvoiceDetail` set. View: `Views/MgtJobSalesOrder/Sales.cshtml`.

| Action | Line | Role |
|---|---|---|
| `Sales(Guid id)` (GET) | `:2235` | Loads the existing estimate via `setup.FillSalesInvoiceOrEstimateDataByInvoiceKey(id)`, seeds an in-memory edit buffer `GlobalClass.GlobalSales` (`:2267`) — same static/session scratch-list anti-pattern flagged in the creation docs. |
| `Sales(JobSalesInvoiceClass model, string save, string Add, Guid? del, ...)` (POST) | `:2280` | The actual edit handler, branched by which button was clicked: |

Sub-paths inside the POST handler:
- **`Add == "Update"`** (`:2299`) — edits an existing in-buffer line's `ChargeTypeKey`, `Description`, `ItemName`, `Rate`, `Qty`, `Amt`, `CostIncurredL` in place.
- **`Add` present, not `"Update"`** (`:2372`, else branch) — appends a new line (`obj.IsNew = true`).
- **`save` non-empty** (`:2461`) — commits the whole in-memory buffer to the DB via `setup.UpdateSalesInvoiceEstimates(model, approvingPermission)` (`DatabaseInteraction/JobSalesEstimateSetup.cs:3520`).
- **`del` non-empty** (`:2492`) — removes a line from the buffer, queues its `DetailKey` for DB deletion via `GlobalClass.GuidList`.

`ManageEstimate`/`Index` actions (`:1942, 1998, 2052`) follow a similar pattern but call `SaveSalesInvoiceEstimates(...)` — that's the **create-a-new-invoice-record** path (used for "new estimate from scratch"), not true in-place editing; distinguished by `model.NewEstimate = 1` (no existing estimate found, `:1969`) vs `= 2` (editing, `:1974`).

**Fields actually editable from the UI** (`Sales.cshtml` form, ~lines 700-723):
| Field | Editable? |
|---|---|
| `ChargeTypeKey` | Yes — dropdown |
| `Description` | Yes — free text |
| `Qty` | Yes — free text, numeric-only guard |
| `Rate` | **Yes — free text, numeric-only guard, NOT readonly** |
| `CostIncurredL` | Yes — radio (incurred vs. proposed) |
| `Amt` | **No — `@readonly = "readonly"` (`:721`), client-computed display only** |

---

## 2. Qty change → recalculates Amt as Rate × Qty (confirmed, both sides)

**Server-side, on clicking "Update" for a line** (`MgtJobSalesOrderController.cs:2309` for an existing line, `:2380` for a newly-added line):
```csharp
item.Amt = model.Qty * model.Rate;// model.Amt;
```
The trailing comment `// model.Amt` is a leftover — it shows the code used to trust whatever `Amt` value the client posted, but was changed to always recompute `Rate * Qty` server-side, discarding any client-posted `Amt`.

**Server-side, on final commit to DB** (`JobSalesEstimateSetup.cs:3590-3592`, same pattern for new lines at `:3568-3570`):
```csharp
l.Rate = Convert.ToDecimal(string.Format("{0:0.00}", item.Rate));
l.Qty  = Convert.ToDecimal(string.Format("{0:0.00}", item.Qty));
l.Amt  = Convert.ToDecimal(string.Format("{0:0.00}", l.Rate * l.Qty));
```

**Client-side JS** (`Sales.cshtml:351-358`), fires only on blur of the Qty field, live-updates the visible `#Amt` box as a preview:
```javascript
$("#Qty").blur(function () {
    var jkey = parseFloat($("#Rate").val()) * parseFloat($("#Qty").val());
    $("#Amt").val(jkey);
});
```
This client value is never trusted — the server recomputes `Rate * Qty` independently on every save (§2, server-side blocks above).

---

## 3. Rate change → NOT derived from vendor cost or markup; freely editable

**Confirmed: Rate is a plain, directly-editable number in the edit path.** There is no recompute of Rate from vendor cost or a markup percentage anywhere in the edit/update code:

- The Rate `<input>` has no `readonly`/`disabled` attribute (`Sales.cshtml:706`).
- The only thing that touches `#Rate` automatically is a *convenience default* — an AJAX call to `Utility/FillChargeRatesForJobs` fired when `ChargeTypeKey` changes (`Sales.cshtml:339-349`), which fills the box once. The admin can freely overwrite it afterward, and nothing re-validates it against vendor cost on submit.
- `UpdateSalesInvoiceEstimates` (`JobSalesEstimateSetup.cs:3590`) takes `item.Rate` **verbatim** from the posted/buffered model. No join back to `VendorEstimateDetail`, no markup multiplication anywhere in this method.

This is a materially different code path from creation: `GetVendorEstimateForCreateEstimateNew` (the CREATE-time markup engine, see `Customer_Estimate_from_Vendor_Estimates_Technical_Reference.md` §3.4/4.4) computes Rate as vendor-cost × markup%. Once a line exists as a row, editing never calls that method again or replicates its formula — Rate becomes just a number the admin can type over.

---

## 4. Is there a markup % control on an existing estimate? What recalculates?

**No general per-line or per-estimate markup-% control exists in the edit UI.** Confirmed by absence — grepping for a bound `Perc` input across `Sales.cshtml` and `ManageEstimate.cshtml` returns nothing.

The **only** percentage-driven behavior post-creation is a single synthetic **"Admin fee % mark-up"** line — not a per-charge-type (Materials/Labor/Trip) markup, just one special-cased row that recomputes every time the grid is mutated (Update, Add, or Delete — the identical block is duplicated verbatim at `MgtJobSalesOrderController.cs:2346-2371`, `:2416-2440`, `:2504-2528`):

```csharp
var testAdmin = forcount.Where(m => m.ChargeTypeName.Contains("Admin fee % mark-up")).ToList();
if (testAdmin.Count() > 0) {
    Guid? admindet = forcount.Where(m => m.ChargeTypeName.Contains("Admin fee % mark-up")).FirstOrDefault().DetailKey;
    Customer customer = db.Customer.Find(model.CustomerKey);
    decimal? adminFeeMarkup = customer.AdminMarkup == null ? 0 : customer.AdminMarkup;
    decimal? total = forcount.Where(m => m.DetailKey != admindet).Sum(m => m.Amt);
    foreach (var sitem in GlobalClass.GlobalSales) {
        if (sitem.DetailKey == admindet) {
            decimal? tempperc = sitem.Perc == 0 ? adminFeeMarkup : sitem.Perc;
            sitem.Description = tempperc.ToString() + " %";
            sitem.Amt = Convert.ToDecimal(string.Format("{0:0.00}", ((tempperc / 100) * total)));
            sitem.Qty = 1;
            sitem.Rate = sitem.Amt;
            break;
        }
    }
}
```

**Formula:** `Amt = (Perc / 100) × SUM(Amt of every other line currently in the buffer)`. Then `Rate` is set equal to `Amt` and `Qty` is forced to `1` — this one line is **Amt-driven**, the reverse of every other line (where Amt is derived from Rate × Qty). `Perc` itself defaults from `Customer.AdminMarkup` the first time (`sitem.Perc == 0 ? adminFeeMarkup : sitem.Perc`) and is otherwise carried forward unchanged from when the line was first created (`obj.Perc = 0;` at line creation, `MgtJobSalesOrderController.cs:2081`) — **there is no form field that lets an admin type a new `Perc` value in this view.**

Important nuance: because the admin-fee recompute sums *every other line's current Amt* (not the original vendor cost), editing Qty or Rate on any regular line automatically ripples into a changed admin-fee dollar amount on the next grid mutation — but the admin-fee *percentage* itself never changes on its own; only its dollar output does, as a side effect of other lines changing.

**Not fully verified:** whether `MgtVendorEstimateToCustomerEstimateController.cs`'s own `SaveCreateNewEstimate*` actions expose a distinct markup-% input somewhere outside `Sales.cshtml` — those actions' parameter shapes (`DetailList`, `VendorDepositListObj`, etc.) suggest they're create-time/multi-vendor consolidation flows, not edit-of-existing-invoice flows, but this wasn't exhaustively confirmed by reading a `JobSalesInvoiceDetail.Find()`-style in-place update inside that controller.

---

## 5. Edit before vs. after "sent to customer" — does the formula change?

**No — the Amt formula (`Rate × Qty`) is identical either way.** What differs is *persistence strategy* and *status-flag bookkeeping*, not the math:

- **Editing via the primary `Sales` screen** (`UpdateSalesInvoiceEstimates`) mutates the *same* `JobSalesInvoice`/`JobSalesInvoiceDetail` rows in place (`JobSalesEstimateSetup.cs:3585`), and unconditionally resets send-state on every save regardless of whether the estimate had already gone to the customer:
  ```csharp
  // JobSalesEstimateSetup.cs:3547-3549
  invoice.RespondedByCustomer = null;
  invoice.SentToCustomer = false;
  invoice.EmailToCustomerDate = null;
  ```
  A `didIMakeChange` flag (`:3586-3589`, comparing `Rate`, `Qty`, `Amt`, `CostIncurred`, `ItemName`, `ChargeTypeKey`) exists purely to decide whether to fire an accounting-reset note (`:3642-3651`) — it does not alter the calculation.

- **`SaveSalesInvoiceEstimatesSignleEstimateFromVendor`** (`JobSalesEstimateSetup.cs:2578`, the vendor-linked re-estimate flow) branches on `sentToCustomer` (`:2673`): if `true`, it does **not** edit the old row — it creates an entirely **new** `JobSalesInvoice` (`:2589`) + new `JobSalesInvoiceDetail` rows (`:2681`, fresh `DetailKey`s), sets `invoice.CreatedAfterAlreadySentToCustomer = 1` (`:2603`), and propagates `MarkAsIncurredCmt`/`MarkAsProposed`/`NewLineAddedAfterEdit` forward from the linked vendor detail row via `VEDetailKey` (`:2696-2733`). **The Amt formula there is the same** (`l.Amt = l.Rate * l.Qty`, `:2686`). A line added post-send with `VEDetailKey == "1"` (the sentinel for admin-fee/manually-added lines, `MgtJobSalesOrderController.cs:2115`) is unconditionally tagged `NewLineAddedAfterEdit = "Change Order Item / Additional Approval Needed"` (`:2700`) — flagged for approval workflow purposes, but its dollar calculation is unchanged.

**Conclusion:** pre-send vs. post-send changes *how the change is recorded and flagged* (in-place mutation + reset flags vs. new invoice record + change-order flag), never *how the dollar amount is computed*.

---

## 6. Is vendor cost stored per-line, so markup can be reapplied later?

**No.** `JobSalesInvoiceDetail`'s only numeric columns are `Rate`, `Qty`, `Amt`, `Perc` (`Models/JobSalesInvoiceDetail.cs:15-39`) — there is no stored "vendor cost" or "base cost" field.

There is a `VendorEstimateDetailKey` (Guid?) column, and a parallel `VEDetailKey` string field used on the view-model side, but this key is used **only** to re-join back to `VendorEstimateDetail`/`VendorEstimateDetail1` for fetching/propagating the `MarkAsIncurredCmt`/`MarkAsProposed`/`NewLineAddedAfterEdit` status strings (§5) — **never** to fetch vendor cost or re-derive Rate/Amt via markup.

**Practical implication:** there is no mechanism in V1 to "reapply markup %" against original vendor cost once a customer-estimate line exists — because (a) no markup-% control exists on the edit UI at all, and (b) even if one were added, vendor cost isn't stored on the row and would have to be re-joined via `VendorEstimateDetailKey`/`VEDetailKey`, and that join is currently wired for status flags only, not dollar figures. **If a "recompute markup on edit" feature is wanted for V2, it does not exist today and would need new code — not a UI toggle on existing plumbing.**

---

## 7. Summary table

| You change... | What recalculates | Formula | Where |
|---|---|---|---|
| **Qty** | `Amt` | `Amt = Rate × Qty` | `MgtJobSalesOrderController.cs:2309/2380` (buffer), `JobSalesEstimateSetup.cs:3590-3592` (DB save) |
| **Rate** | `Amt` (Rate itself is never derived from anything) | `Amt = Rate × Qty` | same as above |
| **Markup %** | *(no such control exists on a regular line)* | n/a | — |
| **Admin fee line only** | `Amt`, then `Rate` and `Qty` are forced to match | `Amt = (Perc/100) × SUM(other lines' Amt)`, `Rate = Amt`, `Qty = 1` | `MgtJobSalesOrderController.cs:2346-2371` (+ duplicated at `:2416-2440`, `:2504-2528`) |

---

## 8. Source map

| Concern | File : lines |
|---|---|
| Edit GET (load into buffer) | `Controllers/MgtJobSalesOrderController.cs:2235` |
| Edit POST — Update existing line | same file `:2299-2371` |
| Edit POST — Add new line | same file `:2372-2460` |
| Edit POST — Save/commit | same file `:2461` → `JobSalesEstimateSetup.cs:3520` |
| Edit POST — Delete line | same file `:2492` |
| Admin-fee recompute (3 duplicated copies) | same file `:2346-2371, 2416-2440, 2504-2528` |
| Server Amt formula (buffer-level) | same file `:2309, 2380` |
| Server Amt formula (DB commit) | `DatabaseInteraction/JobSalesEstimateSetup.cs:3568-3570, 3590-3592` |
| Send-state reset on every edit | `JobSalesEstimateSetup.cs:3547-3549` |
| Change-detection flag (`didIMakeChange`) | `JobSalesEstimateSetup.cs:3586-3589, 3642-3651` |
| Post-send re-estimate (new invoice record) | `JobSalesEstimateSetup.cs:2578-2733` (branch on `sentToCustomer` at `:2673`) |
| Client-side Amt preview | `Views/MgtJobSalesOrder/Sales.cshtml:351-358` |
| Rate/Amt field markup in view | `Views/MgtJobSalesOrder/Sales.cshtml:700-723` |
| `JobSalesInvoiceDetail` columns | `Models/JobSalesInvoiceDetail.cs:15-39` |
| CREATE-time markup engine (contrast) | `DatabaseInteraction/VendorEstimateToCustomerEstimaeSetup.cs:209` (`GetVendorEstimateForCreateEstimateNew`) — see `Customer_Estimate_from_Vendor_Estimates_Technical_Reference.md` §3.4/4.4 |

---

## 9. Open threads / not fully verified

1. **`EditLineItem` button JS** — `LoadEstimateItems` (`MgtJobSalesOrderController.cs:1888`) renders an `EditLineItem` button per row with `onclick='return EditLineItem(this)'`, but that JS handler wasn't located in the files searched (likely a separate shared `.js` file). Should be confirmed it posts to the same `Sales` action and doesn't expose a different, unaudited recalculation path.
2. **`MgtVendorEstimateToCustomerEstimateController.cs`** — not exhaustively checked for a separate markup-% input distinct from `Sales.cshtml`. Its `SaveCreateNewEstimate*` actions appear to be create-time/multi-vendor flows based on parameter shape, not edit-of-existing-invoice, but this is inferred rather than confirmed line-by-line.
3. **V2 design question**: if the business wants a true "adjust markup %, keep vendor cost as source of truth" edit experience, that's a new feature, not a gap-fill — V1 never stored the data (vendor cost per line) or built the UI to support it. Worth confirming with stakeholders whether this is actually wanted before designing it into V2, since it doesn't map to existing V1 behavior at all.

---

## 10. Suggested skills for the next session

- **`qa`** — to file the "no markup-% edit exists" finding as a product question (feature gap vs. intentional) rather than a bug, and to resolve the two open threads above.
- **`diagnosing-bugs`** — if the unconditional `SentToCustomer = false` reset on every edit (§5) turns out to cause unwanted re-send behavior, this is the entry point.
- **`request-refactor-plan`** — if V2 should store per-line vendor cost to support real markup-% editing, this needs a data-model change (comparable in shape to the gap documented in `MultiVendor_MultiOption_Estimate_Flows_Handoff.md` §3.6) — worth planning as a tiny-commit spec.

Invoke only if the next session's direction calls for them. Current work is investigation with no code changes.
