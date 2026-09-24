# Handoff: "Value cannot be null. Parameter name: source" when emailing a Customer Estimate

> **Purpose**: Document a confirmed, root-caused production bug — emailing a customer estimate can fail with a misleading LINQ `ArgumentNullException` ("Value cannot be null. Parameter name: source") whenever an earlier, unrelated null-reference in the same data-assembly method is silently swallowed. Confirmed root cause on a live case below. No code changed yet — this doc is the spec for the V1 patch and the V2 rebuild requirement.
>
> Codebase: `ProjectRCS` (ASP.NET MVC 5, C#, SQL Server, EF6). Working dir: `/Users/cole-sathngam/Workspace/RetailFixIt/Master`. Branch: `dev`.

---

## 0. The headline answer

**Confirmed on a live case.** The user-facing error `Value cannot be null. Parameter name: source` is **not** the real problem — it's a downstream symptom. The real problem: `JobSalesEstimateSetup.FillEstimateForPreview(Guid id, int InvoiceType)` wraps its entire body in a `try { ... } catch (Exception ex) { string fall = ex.ToString(); }` that **silently discards any exception** thrown while assembling the preview object. If *anything* in that ~300-line try block throws before `obj.MOptionEstimate` gets initialized (line 793, near the very end), the method returns a half-built object with `MOptionEstimate == null` and no indication anything went wrong.

That null then reaches `MailToCustomers.SendEstimatedToCustomer`, which calls `model.MOptionEstimate.Count()` — an `Enumerable.Count()` LINQ call on a null `List<T>` — throwing the generic `ArgumentNullException` the user actually sees. `SendEstimatedToCustomer` has its own catch block that relays `ex.Message` straight to the UI, so the user is shown the LINQ crash message with zero context about what actually failed upstream.

**On the confirmed live case, the actual upstream failure was:** `JobSalesInvoice.CreatedBy` was `NULL` on the estimate record, and line 786 does:
```csharp
obj.PreparedBy = db.StaffList.Find(invoice.CreatedBy).PName;
```
`db.StaffList.Find(null)` returns `null`; `.PName` throws a `NullReferenceException`; swallowed; `MOptionEstimate` never gets set; the estimate can never be emailed until this is fixed.

**This is one instance of a general class of bug**, not a one-off: *any* null in *any* of the ~15 unguarded EF lookups/navigation dereferences inside this same try block (see §2) will produce the identical symptom, with a different eventual crash site depending on which unguarded field is touched first (or last, since `MOptionEstimate` truly does need to survive to line 793).

---

## 1. Confirmed call chain

```
MgtJobSalesOrderController.EmailEstimateToCustomer(EmailEstimateClass model, ...)   [POST action]
  → JobSalesEstimateSetup.FillEstimateForPreview(Guid id, int InvoiceType)          [JobSalesEstimateSetup.cs:608]
      → returns PreviewSalesInvoiceClass with MOptionEstimate == null (bug happens here)
  → MailToCustomers.SendEstimatedToCustomer(model, ..., si, ...)                    [MailToCustomers.cs:1302]
      → model.MOptionEstimate.Count()                                              [MailToCustomers.cs:1433] ← visible crash
      → caught by SendEstimatedToCustomer's own try/catch, ex.Message shown raw to user [MailToCustomers.cs:1493-1497]
```

---

## 2. The swallowed-exception method, and every unguarded null risk inside it

`JobSalesEstimateSetup.cs:608-928`, `FillEstimateForPreview`:

```csharp
608  public PreviewSalesInvoiceClass FillEstimateForPreview(Guid id, int InvoiceType)
609  {
610      PreviewSalesInvoiceClass obj = new PreviewSalesInvoiceClass();
611      obj.InvoiceDetailList = new List<JobSalesInvoiceClass>();
612      obj.config = new CustomerInvoiceConfigurationClass();
613      obj.DepositStory = new CustomerDepositStory();
614      try
615      {
616          JobSalesInvoice invoice = db.JobSalesInvoice.Find(id);
617          obj.InvoiceKey = invoice.InvoiceKey;
          ... (~300 lines, see below) ...
793          obj.MOptionEstimate = new List<ViewMultipleCustomerEstimate>();   // first point MOptionEstimate is non-null
          ...
889          obj.OlderEstimates = new List<ViewMultipleCustomerEstimate>();
          ...
924  } catch (Exception ex)
925  {
926      string fall = ex.ToString();   // <-- discarded. Never logged, never surfaced, local var even unused after this.
927  }
928  return obj;
```

Note `obj.MOptionEstimate` / `obj.OlderEstimates` are the **only** two `PreviewSalesInvoiceClass` fields not pre-initialized before the try block (unlike `InvoiceDetailList`, `config`, `DepositStory` at lines 611-613) — that inconsistency is exactly why this specific field is the one that surfaces as a crash downstream, while other fields would just come back as default/empty instead.

**Every unguarded lookup/dereference between line 616 and line 793** is a candidate null-source for this same bug class (not exhaustive, but everything touched on the direct path to `MOptionEstimate`):

| Line(s) | Code | Null risk |
|---|---|---|
| 617-618 | `JobSalesInvoice invoice = db.JobSalesInvoice.Find(id); obj.InvoiceKey = invoice.InvoiceKey;` | `id` doesn't match any row → `invoice` null → NRE |
| 628 | `Job job = mt.GetMyJob(invoice.JobKey, db);` then `job.JobName` at 668 | Job deleted/missing → NRE at first `job.*` use |
| 673, 683 | `DocumentationSetup doc = db.DocumentationSetup.FirstOrDefault(...); ... doc.EstimateHeader` | No non-deleted `DocumentationSetup` row for `GlobalClass.Company.CompanyKey` (note: **not** `Job.CompanyKey` — `Job` has no such column; this is the *session's current company*, from `GlobalClass.Company`, itself nullable if session state is stale) → NRE. **Ruled out on the live case** — row exists, `IsDelete=False`, `EstimateHeader` populated. |
| 674-676 | `Location loca = db.Location.Find(job.LocationKey); Customer custom = db.Customer.Find(job.CustomerKey); obj.CustomerName = custom.Cname;` | Either lookup missing → NRE |
| 680, 690-724 | `JobConfiguration jc = db.JobConfiguration.SingleOrDefault(...)` | Explicitly null-checked (`if (jc == null) {...} else {...}`) — **not** a risk, correctly handled |
| 737-751 | `obj.ServiceLocation = loca; ... loca.CityList.CityName ... loca.StateList.StateName` | `loca.CityList`/`loca.StateList` navigation properties null (FK integrity issue, or EF not loading them) → NRE |
| 763-767 | `custom.CityList.CityName`, `custom.StateList.StateName` | Same risk, Customer side |
| **786** | `obj.PreparedBy = db.StaffList.Find(invoice.CreatedBy).PName;` | **Confirmed live cause.** `invoice.CreatedBy` is `NULL` → `db.StaffList.Find(null)` → `null` → NRE |
| 827, 865 | `db.SalesChargeType.Find(item.ChargeTypeKey).TName` | Only reached if `item.ChargeTypeKey != null` (guarded by surrounding if/else) — low risk |

---

## 3. Live confirmed case

- `InvoiceKey`: `dc861ef9-8c2a-4132-89ec-2f0534299549`
- `JobKey`: `4e273a67-ffb8-48aa-99a4-c0a143634b85`
- `CustomerKey`: `04440d12-eab9-4010-b29d-34fa2aecabfc` (confirmed exists — not the cause)
- Company: only one company exists in this system, `906017b5-f9fc-4904-8899-8aece544518c` (RCS / retailfixit.com) — its `DocumentationSetup` row exists and is populated (**ruled out** as cause, see table above)
- **`JobSalesInvoice.CreatedBy` = `NULL` on this row** — confirmed root cause for this instance
- Diagnostic queries used to isolate this (for reuse on future reports of the same symptom):

```sql
DECLARE @JobKey UNIQUEIDENTIFIER = '<job key>';
DECLARE @InvoiceKey UNIQUEIDENTIFIER = '<invoice key>';

SELECT * FROM JobSalesInvoice WHERE InvoiceKey = @InvoiceKey;   -- check CreatedBy, JobKey for nulls
SELECT * FROM Job WHERE JobKey = @JobKey;                        -- check LocationKey, CustomerKey, CContactKey
SELECT c.* FROM Job j LEFT JOIN Customer c ON c.CustomerKey = j.CustomerKey WHERE j.JobKey = @JobKey;
SELECT l.* FROM Job j LEFT JOIN Location l ON l.LocationKey = j.LocationKey WHERE j.JobKey = @JobKey;
SELECT * FROM DocumentationSetup WHERE CompanyKey = '<the one CompanyKey in Company table>';  -- no IsDelete filter, to catch soft-deleted rows too
SELECT s.* FROM JobSalesInvoice inv LEFT JOIN StaffList s ON s.StaffKey = inv.CreatedBy WHERE inv.InvoiceKey = @InvoiceKey;  -- NULL row here = confirmed cause
```

---

## 4. Why this is worth a V2 requirement, not just a V1 patch

The swallowed exception at [JobSalesEstimateSetup.cs:924-927](../ProjectRCS/DatabaseInteraction/JobSalesEstimateSetup.cs#L924-L927) means **every one of the ~8 unguarded null risks in §2** manifests identically to support/admin users as the same cryptic `Value cannot be null. Parameter name: source` message, regardless of which one actually failed. This makes the bug class effectively undiagnosable without a code-level investigation each time (as this session required). V2 should not carry this pattern forward.

---

## 5. Rebuild / fix checklist

**Immediate (unblock this specific estimate):**
1. Set `JobSalesInvoice.CreatedBy` to a valid `StaffList.StaffKey` for `InvoiceKey = dc861ef9-8c2a-4132-89ec-2f0534299549`.

**V1 patch (this codebase, low-risk, high-value):**
2. Stop swallowing the exception in `FillEstimateForPreview`'s catch block — at minimum log `ex.ToString()` somewhere durable (existing app logging mechanism, if any) instead of a discarded local variable.
3. Guard line 786 specifically: `obj.PreparedBy = invoice.CreatedBy == null ? "" : (db.StaffList.Find(invoice.CreatedBy)?.PName ?? "");`
4. Consider moving `obj.MOptionEstimate = new List<...>()` / `obj.OlderEstimates = new List<...>()` up to lines 611-613 alongside the other pre-try initializations, so this specific field can never be null regardless of what else throws — this alone would have converted the live case from "estimate can't be emailed" to "estimate emails with prepared-by blank," which is a much safer failure mode.
5. Investigate whatever create-estimate code path allowed `CreatedBy` to be saved as `NULL` in the first place (not identified in this session) — the DB-level symptom fix (step 1) doesn't prevent recurrence.

**V2 requirement:**
6. Do not replicate the "assemble entire preview object in one big try/catch that swallows everything" pattern. Each independent lookup (Job, Location, Customer, DocumentationSetup, StaffList, City/State navigation) should fail loudly and specifically (or be null-guarded with a sane default) so a future occurrence of this bug class surfaces as an actionable error (e.g. "Cannot email estimate: invoice creator is missing") rather than a generic LINQ crash three layers downstream.
7. `CreatedBy` (or its V2 equivalent) should likely be a required/non-nullable field at the data-model level if every estimate is expected to have a creator — evaluate during V2 schema design.

---

## 6. Source map

| Concern | File : lines |
|---|---|
| Swallowed exception / entry point of the bug | `ProjectRCS/DatabaseInteraction/JobSalesEstimateSetup.cs:608-928` (catch at 924-927) |
| Confirmed live crash cause (`CreatedBy` null → `StaffList.Find(null).PName`) | `ProjectRCS/DatabaseInteraction/JobSalesEstimateSetup.cs:786` |
| `MOptionEstimate`/`OlderEstimates` initialized late (should move earlier) | `ProjectRCS/DatabaseInteraction/JobSalesEstimateSetup.cs:611-613` (current pre-try inits) vs. `793`, `889` (current late inits) |
| Visible crash site (LINQ `.Count()` on null) | `ProjectRCS/Mailing/MailToCustomers.cs:1433` |
| Raw exception message relayed to UI | `ProjectRCS/Mailing/MailToCustomers.cs:1493-1497` |
| Controller entry point | `ProjectRCS/Controllers/MgtJobSalesOrderController.cs` — `EmailEstimateToCustomer` action, calls `FillEstimateForPreview` (~line 1678) then `SendEstimatedToCustomer` (~line 1695/1708) |

---

## 7. Suggested skills for the next session

- **`diagnosing-bugs`** — if a *different* estimate hits the same `Value cannot be null. Parameter name: source` message, re-run §3's diagnostic queries first; the cause may be a different null in the §2 table, not `CreatedBy` again.
- **`request-refactor-plan`** — to turn §5 steps 2-4 into a tiny-commit V1 patch plan.
- **`qa`** — to find out how many other estimates in production currently have `CreatedBy IS NULL` (or other §2 nulls) and are silently un-emailable right now, before a customer/admin reports each one individually.

Invoke only if the next session's direction calls for them. Current work is investigation and root-cause confirmation; no code changed.
