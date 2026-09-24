# Handoff: Vendor→Customer Estimate creation behavior (sequential create & supersede)

> **Purpose**: Document how the codebase currently handles creating one or more **customer estimates** from a **vendor estimate** — specifically the "create a new estimate vs. update the existing one" behavior — so a fresh agent can pick up without re-investigating.
>
> Codebase: `ProjectRCS` (ASP.NET MVC 5, C#, SQL Server, EF6 + raw ADO.NET, jQuery). Working dir: `/Users/cole-sathngam/Workspace/RetailFixIt/Master`. Branch: `dev`.

---

## 1. The questions that were asked

The user asked, in sequence:

1. **(markup angle — resolved, then set aside)** For the Dynamic Minimum Markup feature (see `docs/DynamicMinimumMarkup_Handoff.md`), how do we handle *one vendor estimate → multiple customer estimates* for markup purposes?
2. **(the real question)** Purely as a **workflow**: can I take one vendor estimate, create a customer estimate and send it, then **later** create **another** one from that same vendor estimate and send it again?
3. **(clarification)** So does the second "create completely new" estimate **always overwrite** the first — as opposed to just updating the old one?

This handoff focuses on #2 and #3. #1 is summarized only for context.

---

## 2. Findings — answers

### 2a. Markup context (question #1, background only)

The Dynamic Minimum Markup threshold check (`CheckIfCustomerGrandTotalIsWithinThreshold`) evaluates **one** customer estimate's total vs **one** vendor total, in isolation — no aggregation across siblings. It is **only wired into the single-estimate view** (`CreateNew.cshtml`); the batch multi-estimate views (`CreateNewMultipleOption.cshtml`, `CreateMultipleVenOption.cshtml`) **never invoke it**. So for split/multiple customer estimates, the markup floor is neither aggregated nor applied. (This was noted as a potential gap but is **not** the focus of the current task — do not act on it unless asked.)

- Check logic: `ProjectRCS/Mutators/CustInvoiceAndEstimateMutator.cs:140-208`
- DTO (scalar-only, no sibling fields): `ProjectRCS/DTOs/InvoiceCustGrandTotalThresholdCheckDto.cs`

### 2b. Can you create a second, separate customer estimate later? (question #2)

**Yes. Nothing in the create flow blocks it.** The GET action `CreateNew(Guid id)` (`ProjectRCS/Controllers/MgtVendorEstimateToCustomerEstimateController.cs:792-861`) unconditionally builds a fresh estimate with a new `InvoiceKey` — no "already exists" query, no redirect-to-edit, no disabled button. "Send" is a **separate per-estimate action** (`ProjectRCS/Controllers/MgtJobSalesOrderController.cs`, e.g. ~1545-1555, 1739-1747, sets `SentToCustomer = true` / `EmailToCustomerDate`) and is not limited to once per vendor estimate.

- A guard that *could* detect a prior sent customer estimate exists — `CheckIfThereisanyCustomerestimatesent(JobKey, VendorEstimateKey)` at `ProjectRCS/Controllers/MgtVendorInvoiceController.cs:709-749` — **but it is only used in `UpdateVendorEstimate.cshtml`** (editing the vendor estimate), NOT in the create flow. It does not gate `CreateNew`.
- Schema: `JobSalesInvoice.VendoeEstimateKey` (note misspelling) is a nullable GUID with **no unique constraint** (`ProjectRCS/Models/JobSalesInvoice.cs:59`; edmx ~1967). Many customer-estimate rows may share one vendor-estimate key.

### 2c. Does "create completely new" always overwrite/supersede the old one? (question #3)

**Yes — it archives + replaces, job-wide.** Save path is `SaveCreateNewEstimate(...)` at `ProjectRCS/Controllers/MgtVendorEstimateToCustomerEstimateController.cs:543-669`. Exact mechanics:

1. **Find the old estimate — scoped to `JobKey` only, NOT the vendor estimate** (`:551`):
   ```csharp
   var oldinv = (from x in db.JobSalesInvoice
                 where x.IsEstimate == true && x.RemovedDueToEdit == null && x.JobKey == JobKey
                 select x).OrderByDescending(m => m.CreatedDate).Take(1).ToList();
   ```
   → grabs the single most-recent active estimate on the whole job.
2. **Archive it** (`:555` → `RemoveTheOldSalesInvoice`, `ProjectRCS/DatabaseInteraction/JobSalesEstimateSetup.cs:3175-3245`): copies header + line items into history tables `JobSalesInvoiceAfterUpdate` / `JobSalesInvoiceDetailAfterUpdate` (`:3198-3241`); returns whether the old one was already sent.
3. **Insert the new estimate** as a fresh `JobSalesInvoice` (new `InvoiceKey`), carrying the sent-flag forward: `CreatedAfterAlreadySentToCustomer = sentToCustomer ? 1 : 0` (`JobSalesEstimateSetup.cs:2603`, in `SaveSalesInvoiceEstimatesSignleEstimateFromVendor` at `:2578`).
4. **Reset the vendor estimate** to `Status = 2` / "Pending Approval" and cancel related vendor-estimate state (`:638-652`).

**Key consequences:**
- Result is **one live estimate + one archived copy** — never two live estimates side by side. "Create new" = replace, not add.
- Because step 1 keys on **`JobKey`, not the vendor estimate**, the replacement is **job-wide**: a second estimate supersedes whatever was the current live estimate on the job — even if it originated from a *different* vendor estimate.
- **History is only one level deep.** `RemoveTheOldSalesInvoice` **wipes the AfterUpdate tables per job before archiving** (`JobSalesEstimateSetup.cs:3178-3188`), so only the single immediately-previous version is retained. Create-new a third time and the second version's archive is discarded.
- **"Update the old one"** (in-place edit) is the intended path to revise without spawning a new key or archiving.

### The two distinct multi-estimate mechanisms (don't conflate)

- **Sequential create-over-time** (this task): each new estimate supersedes the prior live one, per §2c.
- **Batch "multiple option" flow**: `CreateNewMultipleOption` / `SaveCreateNewEstimateForMultipleOption` (`MgtVendorEstimateToCustomerEstimateController.cs:305-528`, and `CreateMultipleVenOption`), which creates several **parallel sibling** estimates at once, grouped by `MutiEstiIdentifier` / `MCEstimate` on `JobSalesInvoice`. This is the only way to have multiple **live** customer estimates from one source simultaneously.

---

## 3. Open thread / where the next session could pick up

The last thing offered to the user (not yet done): **confirm what the UI presents as the "create new vs. update" choice** — i.e. which button/flow on the estimate screen triggers `SaveCreateNewEstimate` (supersede) vs. the in-place edit path. Start from `ProjectRCS/Views/MgtVendorInvoice/EIndex.cshtml` (buttons `CreateEst`/`CreateSingle` ~627-672) and `ProjectRCS/Views/MgtVendorEstimateToCustomerEstimate/CreateNew.cshtml`, and trace which save endpoint the edit-vs-new buttons post to.

No code changes have been made. This was investigation only.

---

## 4. Key source map

| Concern | File / lines |
|---|---|
| Create screen (GET, no existence check) | `ProjectRCS/Controllers/MgtVendorEstimateToCustomerEstimateController.cs:792-861` |
| Save single estimate (find-old → archive → insert → reset vendor est.) | same file `:543-669` |
| Batch multi-option save | same file `:305-528` |
| Archive/supersede logic + 1-level history wipe | `ProjectRCS/DatabaseInteraction/JobSalesEstimateSetup.cs:3175-3245` (wipe at `:3178-3188`) |
| Insert new estimate + `CreatedAfterAlreadySentToCustomer` | `ProjectRCS/DatabaseInteraction/JobSalesEstimateSetup.cs:2578` (flag at `:2603`) |
| "Already sent?" guard (only used in vendor-estimate edit) | `ProjectRCS/Controllers/MgtVendorInvoiceController.cs:709-749` |
| Multi-option presence counter (vendor-scoped only) | `ProjectRCS/Controllers/MgtVendorInvoiceController.cs:312-335` |
| Send/email actions | `ProjectRCS/Controllers/MgtJobSalesOrderController.cs` (~1545-1555, 1739-1747) |
| Estimate entity | `ProjectRCS/Models/JobSalesInvoice.cs` (`VendoeEstimateKey` `:59`) |
| Estimate listing UI + create buttons | `ProjectRCS/Views/MgtVendorInvoice/EIndex.cshtml` (~627-672) |
| Markup context (background) | `docs/DynamicMinimumMarkup_Handoff.md`; `ProjectRCS/Mutators/CustInvoiceAndEstimateMutator.cs:140-208` |

---

## 5. Suggested skills for the next session

- **`diagnosing-bugs`** — if the job-wide (not vendor-scoped) supersede in §2c turns out to be undesired behavior and needs to be treated as a bug to root-cause.
- **`qa`** — if the user wants to file the markup-not-applied-in-multi-flow gap (§2a) or the one-level-history limitation (§2c) as GitHub issues.
- **`code-review`** — if any change is made to the create/supersede path, review it against repo standards before committing.

Only invoke these if the next session's direction calls for them; the current work was pure investigation with no changes.
