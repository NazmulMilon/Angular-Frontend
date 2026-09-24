# Handoff: Trip-Charge-to-Labor Cross-Write (client-side, creation screens only)

> **Purpose**: Document a real, verified cross-line side effect — editing a Trip charge line's Qty or Rate in the inline creation grid also silently increases a Labor line's Qty on the same screen. This is NOT present on the estimate/invoice EDIT screens, only on CREATION screens, and it is pure client-side JavaScript with no server-side equivalent. Investigation only — no code changed.
>
> Codebase: `ProjectRCS` (ASP.NET MVC 5, C#, SQL Server, EF6, jQuery). Working dir: `/Users/cole-sathngam/Workspace/RetailFixIt/Master`. Branch: `dev`.
>
> **Companion docs** (do not duplicate — reference by path):
> - `docs/CustomerEstimate_EditRecalculation_Handoff.md` — the EDIT-screen behavior (`Sales.cshtml`), which does **NOT** have this cross-write (confirmed below, §4).
> - `docs/Customer_Estimate_from_Vendor_Estimates_Technical_Reference.md` — creation-time markup engine background.
> - `docs/DynamicMinimumMarkup_Handoff.md` — a different, server-side auto-adjustment mechanism (materials rate +$10, then labor hours +0.5 looped) that runs at estimate build time. Do not confuse the two — they are separate mechanisms, in separate layers (server C# vs. client JS), triggered by separate things (a markup-floor check vs. a manual Trip-cell edit), though both happen to bump labor hours in 0.5 increments. See §5 for the comparison.

---

## 0. The headline answer

**Confirmed true, and it is not a rumor or a misremembering.** On every *creation* screen (single-vendor estimate, multi-option estimate, multi-vendor estimate, single-vendor invoice, multi-vendor invoice), editing a Trip-charge row's **Qty** or **Rate** inline in the grid triggers client-side JavaScript that:

1. Computes the dollar amount your edit changed the Trip row by.
2. Converts that dollar amount into an equivalent number of labor hours (`amt / laborRate`).
3. Finds the Labor row on the same grid and **adds** that many hours to its Qty — in fixed **+0.5** increments, looping until it reaches/exceeds the target.
4. Appends an auto-generated remark to the Labor row: `"hour increased by 0.5 due to TRIP qty change from X to Y"` (sic — literal typo "inscreased" in source).
5. The Trip row's own Qty/Rate/Amt are *also* updated normally — this is an **additional** write to Labor, not a redirect away from Trip.

**This behavior is absent from the estimate EDIT screen** (`Sales.cshtml`, used once an estimate already exists) — its grid editing is the plain `Amt = Rate × Qty` per-row calc documented in `CustomerEstimate_EditRecalculation_Handoff.md`, with no cross-row effects at all.

---

## 1. Where it lives (every occurrence, confirmed by repo-wide grep for `extraQtyFromTripChng`)

No shared/external `.js` file contains this logic — it is **duplicated inline, verbatim, inside six `.cshtml` view files**, most of them 2-4 times per file (once per vendor/option grid section rendered on that page):

| View | Feature | Occurrences (line ranges) |
|---|---|---|
| `Views/MgtVendorEstimateToCustomerEstimate/CreateNew.cshtml` | Single-vendor **estimate** creation | ~249-300, ~553-660 |
| `Views/MgtVendorEstimateToCustomerEstimate/CreateNewMultipleOption.cshtml` | Multi-option **estimate** creation | ~249-300, ~553-660 |
| `Views/MgtVendorEstimateToCustomerEstimate/CreateMultipleVenOption.cshtml` | Multi-vendor **estimate** creation | 4 copies: ~364-420, ~693-750 (one per vendor grid) |
| `Views/MgtVendorInvoiceToCustomerInvoice/CreateInvoiceNew.cshtml` | Single-vendor **invoice** creation | 819-953 |
| `Views/MgtVendorInvoiceToCustomerInvoice/CreateMVInvoice.cshtml` | Multi-vendor **invoice** creation | 4 copies: ~940-1000, ~1275-1330 |

**Confirmed absent from:**
- `Views/MgtJobSalesOrder/Sales.cshtml` — the estimate **edit** screen. Zero matches for `extraQtyFromTripChng`, `Rowname`, `"trip"`, or `"Ctrip"`. Its inline-edit JS is only `var jkey = parseFloat($("#Rate").val()) * parseFloat($("#Qty").val());` (line 353) — plain per-row math, no cross-row writes.

All instances found are **byte-for-byte identical logic** — same `+0.5` increment, same `amt/laborRate` conversion, same target row identifiers (`"labor"`/`"Clabor"`), same remark text (including the "inscreased" typo). No file has a variant that targets Materials or uses a different increment.

---

## 2. Exact mechanism (quoted verbatim from `CreateNew.cshtml:249-310`; identical in every other occurrence)

### Trigger condition

Each grid row carries a hidden identifier in table cell index **16** (`td[16]`), one of: `"trip"`, `"Ctrip"`, `"labor"`, `"Clabor"`, `"materials"`, etc. (`"C"`-prefixed variants appear to mean "Customer" side vs. vendor side of the split grid — see `Rowname` assignment earlier in each file for the exact mapping; not re-derived here). The cross-write only fires when the **edited** cell's row has `Rowname == "trip"` or `Rowname == "Ctrip"`.

### On Trip Qty edit

```javascript
else if (Rowname == "trip") {
    if (cellName == "qty") {
        var Newqty = row.find("td").eq(7).html();       // Qty column
        var Oldqty = preText;                            // value before this edit
        var qty = parseFloat(Newqty) - parseFloat(Oldqty);
        var rate = row.find("td").eq(8).html();          // Rate column
        var amt = parseFloat(qty) * parseFloat(rate);     // dollar delta from the Qty change
        if (parseFloat(amt) < 0) amt = parseFloat(amt) * (-1);   // always treated as positive

        $("#tblestimateBody tr").each(function () {
            var temprow = $(this);
            var rn = temprow.find("td").eq(16).html();
            if (rn == "labor") {
                var laborQty = temprow.find("td").eq(7).html();
                var laborRate = temprow.find("td").eq(8).html();
                var extraQtyFromTripChng = parseFloat(amt) / parseFloat(laborRate);   // $ delta -> equivalent hours
                var tempqty = parseFloat(laborQty);
                var tempnew = parseFloat(laborQty) + parseFloat(extraQtyFromTripChng); // target Qty
                for (; ;) {
                    var tempqty = parseFloat(tempqty) + 0.5;                           // +0.5 hr per iteration
                    if (parseFloat(tempqty) > parseFloat(tempnew) || parseFloat(tempqty) == parseFloat(tempnew)) {
                        temprow.find("td").eq(7).html(parseFloat(tempqty).toFixed(2));  // write new Labor Qty
                        var rowttl = parseFloat(tempqty) * parseFloat(laborRate);
                        temprow.find("td").eq(11).html(parseFloat(rowttl).toFixed(2));  // write new Labor Row Total
                        var venRowTtl = temprow.find("td").eq(4).html();
                        var temptxt = temprow.find("td").eq(13).html();
                        temprow.find("td").eq(13).html(temptxt +
                            " hour inscreased by 0.5 <br/> due to TRIP qty change <br/> from " + Oldqty + " to " + Newqty); // remark
                        var perAmt = ((parseFloat(rowttl) - parseFloat(venRowTtl)) / parseFloat(venRowTtl)) * 100;
                        temprow.find("td").eq(10).html(parseFloat(perAmt).toFixed(2));  // write new Actual Markup %
                        tdObj.html(preText);
                        break;
                    }
                }
                return false;  // stops after first matching Labor row — does not also bump a second labor row
            }
            else if (rn == "Clabor") {
                // identical loop, targeting the "Clabor" (Customer-side labor?) row instead — no venRowTtl/Actual% write
            }
        });
    }
    else if (cellName == "rates") {
        // same pattern, but the $ delta comes from the RATE change instead of Qty:
        // var rate = Newrate - Oldrate; var amt = qty * rate;
        // then the identical labor-row-find + 0.5-increment-loop logic runs again
    }
}
```

### On Trip Rate edit

Same structure (`cellName == "rates"` branch), except the dollar delta is computed from the **rate** difference (`Newrate - Oldrate`) times the Trip row's current Qty, rather than the Qty difference times Rate. The resulting dollar amount is converted to labor hours and added to the Labor row identically.

### Key formula, stated generally

```
$ delta on Trip row  = |ΔQty_or_ΔRate on Trip| × (the other, unchanged Trip field)
extra labor hours     = $ delta / laborRate
new Labor Qty          = old Labor Qty, incremented by +0.5 repeatedly, until it reaches/passes (old Labor Qty + extra labor hours)
```

The `+0.5` stepping (rather than a direct assignment of `oldQty + extraQtyFromTripChng`) means the final Labor Qty is always **rounded up to the nearest 0.5** above the mathematically exact target — e.g. if the exact target would be `+0.37` hours, the loop still adds a full `+0.5`.

---

## 3. Practical example

Suppose a Trip row has Qty = 1, Rate = $150 (Amt = $150), and a Labor row on the same estimate has Qty = 4, Rate = $80.

- Admin edits Trip Qty from `1` to `2`.
- `qty = 2 - 1 = 1`; `rate = 150`; `amt = 1 × 150 = 150`.
- `extraQtyFromTripChng = 150 / 80 = 1.875` hours.
- `tempnew = 4 + 1.875 = 5.875`.
- Loop: `4.5 → 5.0 → 5.5 → 6.0` (first value `>= 5.875`) → **Labor Qty becomes 6.0**, not 5.875.
- Labor row's Amt recalculates to `6.0 × 80 = $480` (was `$320`).
- Labor row's remark gains: `"hour inscreased by 0.5 due to TRIP qty change from 1 to 2"`.
- Trip row itself also now shows Qty = 2, Amt = $300, as a normal edit would.

Net effect: a $50 increase intentionally made to the Trip line resulted in Trip going up by $150 **and** Labor going up by $160 (2 hours × $80) — a combined change larger and differently distributed than what the admin typed into the Trip cell.

---

## 4. Confirmed NOT present on the edit screen

`Views/MgtJobSalesOrder/Sales.cshtml` — used to edit an estimate that has **already been created and saved** (see `CustomerEstimate_EditRecalculation_Handoff.md`) — has **zero** occurrences of this pattern. Its equivalent inline-edit handler is:

```javascript
// Sales.cshtml:351-358
$("#Qty").blur(function () {
    var jkey = parseFloat($("#Rate").val()) * parseFloat($("#Qty").val());
    $("#Amt").val(jkey);
});
```

Purely local, single-row, and even this client value is discarded/recomputed server-side on save (`Amt = Rate * Qty`, `JobSalesEstimateSetup.cs:3590-3592`). **So this cross-write only exists at initial creation time, on the creation-flow grids — never when editing an existing saved estimate/invoice afterward.**

---

## 5. Do not confuse with the Dynamic Minimum Markup auto-adjuster

`docs/DynamicMinimumMarkup_Handoff.md` §5.5 documents a **completely separate** mechanism:

| | Trip→Labor cross-write (this doc) | Dynamic Min Markup auto-adjust (`DynamicMinimumMarkup_Handoff.md` §5.5) |
|---|---|---|
| Layer | Client-side JavaScript, in the `.cshtml` views | Server-side C#, `CustInvoiceAndEstimateMutator.cs` |
| Trigger | Admin manually edits a Trip cell in the grid | Automatic, runs unconditionally at the end of `GetVendorEstimateForCreateEstimateNew` |
| Purpose (as far as can be inferred from code — no comment explains intent) | Appears to preserve/reflect labor cost proportional to a trip-charge change (unclear business rationale; not documented anywhere in source) | Explicitly push the customer grand total up to a configured minimum markup % |
| What it touches | Labor Qty only (via Trip edits) | Materials Rate (+$10 once), then Labor Hours (+0.5 looped) |
| Increment pattern | +0.5 per iteration (both) | +0.5 per iteration (labor step only; materials step is a single +$10, not looped) |
| Views/paths affected | All CREATION grids only (5 views, listed in §1) | Only the single-vendor create/load path (`VendorEstimateToCustomerEstimaeSetup.cs:2372`) — never multi-option, multi-vendor, or edit |

They share only the coincidental "+0.5 hours per step" pattern — worth noting because it could otherwise look like the same code, but they are unrelated implementations in different languages/layers with different triggers.

---

## 6. Open questions / not yet resolved

1. **No code comment or commit message found explaining the business intent** of this cross-write. Plausible guesses (not verified): keeping a rough cost-consistency between "trip" and "labor" charge categories since both draw from the customer's `LaborAndTrip` markup percentage (see `Customer_Estimate_from_Vendor_Estimates_Technical_Reference.md`); or a legacy quirk from how vendor cost estimates originally bundled trip and labor time together. **Recommend confirming actual intent with whoever built this or a long-tenured admin user before deciding whether to replicate it in V2** — it may be an intentional business rule or an accidental side effect that shipped and was never noticed because it happens silently in the grid.
2. **What does `"Clabor"` vs `"labor"` mean exactly**, and under what conditions does a grid have one vs. the other vs. both? Not re-derived in this pass — likely relates to the vendor-side/customer-side split of the two-pane grid layout visible in `CreateInvoiceNew.cshtml`'s table headers (`Views/MgtVendorInvoiceToCustomerInvoice/CreateInvoiceNew.cshtml:1693-1724`, "Charge Type... Qty... Rate" repeated twice per row = vendor columns then customer columns), but this wasn't independently confirmed.
3. **Does this cross-write get overwritten or double-counted** when the grid is later reloaded via AJAX (e.g. `LoadTheEstimateGridStuff`/`LoadTheEstimateGridStuffForMultioption`), since those reload from the server-side markup engine which doesn't know about this client-only Labor Qty bump? Client-side-only state that isn't persisted until Save is clicked — needs confirmation that a page reload/grid refresh doesn't silently discard the bumped Labor value the admin was relying on, or conversely that it doesn't somehow get baked in twice.
4. **Does saving the estimate (`SaveCreateNewEstimateForMultipleOption`, `SaveCreateNewEstimateFromMultipleVendor`, `SaveCreateNewEstimate`, or the invoice equivalents) persist the bumped Labor Qty exactly as shown in the grid?** Very likely yes, since these save actions read whatever is in the posted `DetailList`/grid state at submit time (per the creation docs), but not independently re-confirmed in this pass.

---

## 7. Rebuild checklist for V2

If V2 should replicate this behavior exactly:

1. Confirm with the business first (see §6.1) whether this is a wanted rule or a legacy quirk that should be dropped — this is a materially surprising side effect for an admin who only intended to change one line.
2. If replicating: implement as part of the **creation-flow grid component only** (not the edit-existing-estimate flow) — on a Trip-row Qty or Rate change:
   - Compute `$ delta = |ΔQty or ΔRate| × (the unchanged Trip field)`.
   - Convert to hours: `extra hours = $ delta / current Labor rate`.
   - Round the Labor row's new Qty up to the nearest 0.5 that is `>=` `old Labor Qty + extra hours` (do **not** just set it to the exact computed value — V1's stepped-loop always rounds up to a 0.5 boundary, which is a real behavior difference from a direct assignment).
   - Recalculate the Labor row's Amt (`Qty × Rate`) and Actual Markup % the same way every other row does.
   - Append a user-visible remark to the Labor row noting the reason for the change and the before/after Trip value, so the admin isn't confused later — V1 already does this and it's worth keeping given how non-obvious the effect is otherwise.
3. Do **not** implement this on the edit-existing-estimate screen, matching V1's actual (if seemingly accidental) scope limitation — or explicitly decide to extend it there as a deliberate product decision, not a silent carry-over.
4. Resolve open question §6.2 (`Clabor` semantics) before implementing, since V2's data model may not have an equivalent vendor/customer split per row.

---

## 8. Source map

| Concern | File : lines |
|---|---|
| Single-vendor estimate creation (has cross-write) | `Views/MgtVendorEstimateToCustomerEstimate/CreateNew.cshtml:249-310` (+ second copy ~553-660) |
| Multi-option estimate creation (has cross-write) | `Views/MgtVendorEstimateToCustomerEstimate/CreateNewMultipleOption.cshtml:249-310` (+ second copy ~553-660) |
| Multi-vendor estimate creation (has cross-write, 2 copies) | `Views/MgtVendorEstimateToCustomerEstimate/CreateMultipleVenOption.cshtml:364-420, 693-750` |
| Single-vendor invoice creation (has cross-write) | `Views/MgtVendorInvoiceToCustomerInvoice/CreateInvoiceNew.cshtml:819-953` |
| Multi-vendor invoice creation (has cross-write, 2 copies) | `Views/MgtVendorInvoiceToCustomerInvoice/CreateMVInvoice.cshtml:940-1000, 1275-1330` |
| Estimate EDIT screen (confirmed absent) | `Views/MgtJobSalesOrder/Sales.cshtml:351-358` (the only inline-edit JS there — plain `Rate*Qty`) |
| Grid table header layout (vendor cols + customer cols per row) | `Views/MgtVendorInvoiceToCustomerInvoice/CreateInvoiceNew.cshtml:1693-1724` |

---

## 9. Suggested skills for the next session

- **`qa`** — to resolve open question §6.1 (intended behavior vs. accidental quirk) with a product owner or long-tenured admin, and to decide whether this is a bug to fix or a feature to preserve.
- **`diagnosing-bugs`** — if an admin reports "my labor hours changed when I only touched the trip charge" as a confusing/unwanted surprise, this doc is the root-cause explanation.
- **`request-refactor-plan`** — if V2 should implement this deliberately, to turn §7 into a tiny-commit spec.

Invoke only if the next session's direction calls for them. Current work is investigation with no code changes.
