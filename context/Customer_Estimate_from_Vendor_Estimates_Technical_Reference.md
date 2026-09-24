**Customer Estimate from Vendor Estimates**

Technical Reference for V2 Rebuild

_Admin Portal - Vendor Bills Tab | Source: ATLAS + ProjectRCS_

Prepared: July 2026

# 1\. Document Purpose & Scope

This document provides every technical detail needed to recreate two features in a V2 application:

- Feature A - Create Customer Estimate from Multiple-Option Vendor Estimate (one vendor, multiple pricing options presented as choices on one customer document)
- Feature B - Create Customer Estimate from Multiple-Vendor Multiple-Option Estimate (several vendors combined into one customer-facing estimate document)

All method signatures, DB schemas, business rules, and file paths were verified against the V1 source code (ProjectRCS) and its ATLAS documentation - not inferred from spec.

# 2\. Business Context

## 2.1 What these features do

Vendors submit cost estimates through the Vendor Portal. Admin staff convert those into customer-facing estimates by applying markup rules. Two scenarios require special handling:

- Multi-option (Feature A): One vendor presents alternative pricing choices (e.g., "basic repair" vs "full replacement") on a single document. Customer selects one.
- Multi-vendor (Feature B): Multiple different vendors each quote on the same job. Staff combine all into one customer estimate document.

## 2.2 Entry Point (EIndex.cshtml JS flow)

Entry: MgtVendorInvoice/EIndex - the Vendor Bills tab. The CreateEst() JS function:

- - Calls MgtVendorInvoice/WhenOtherEstimatesArePresent first
    - If multi-option (1 vendor): opens #ModalMultiOptEst modal populated via GetAllMultipleOptionVendorsEstimate. User selects options → GoNextModalMultiOptEst() → Feature A route
    - If multi-vendor: CreateMutiVenSEst() opens #ModalMultipleVendorEstimate via GetAllVendorsEstimate. User selects vendors → Feature B route
    - Single estimate: goes straight to CreateNew (out of scope for this document)

| **JS Trigger**              | **Target URL / Route**                                                                               | **Feature** |
| --------------------------- | ---------------------------------------------------------------------------------------------------- | ----------- |
| GoNextModalMultiOptEst(evt) | /MgtVendorEstimateToCustomerEstimate/CreateNewMultipleOption?JobKey=...&MasterKey=...&InvKey\[\]=... | A           |
| CreateMutiVenSEst()         | /MgtVendorEstimateToCustomerEstimate/CreateMultipleVenOption?JobKey=...&InvKey\[\]=...               | B           |

# 3\. Feature A - Multi-Option Single Vendor → Customer Estimate

## 3.1 Route & File Map

| **Property** | **Value**                                                                        |
| ------------ | -------------------------------------------------------------------------------- |
| GET route    | /MgtVendorEstimateToCustomerEstimate/CreateNewMultipleOption                     |
| POST route   | /MgtVendorEstimateToCustomerEstimate/SaveCreateNewEstimateForMultipleOption      |
| Controller   | ProjectRCS\\Controllers\\MgtVendorEstimateToCustomerEstimateController.cs        |
| View         | Views\\MgtVendorEstimateToCustomerEstimate\\CreateNewMultipleOption.cshtml       |
| DAL method   | JobSalesEstimateSetup.SaveSalesInvoiceEstimatesWithOption(...)                   |
| DB result    | N JobSalesInvoice rows (one per option), all linked by shared MutiEstiIdentifier |

## 3.2 GET: CreateNewMultipleOption

### Method Signature

public async Task&lt;ActionResult&gt; CreateNewMultipleOption(Guid? JobKey, Guid? MasterKey, Guid?\[\] InvKey)

### Parameters

| **Parameter** | **Type**  | **Purpose**                                                      |
| ------------- | --------- | ---------------------------------------------------------------- |
| JobKey        | Guid?     | The job this estimate belongs to                                 |
| MasterKey     | Guid?     | Primary VendorEstimate key (first/master option)                 |
| InvKey        | Guid?\[\] | All selected VendorEstimate keys, one per option chosen in modal |

### Short-Circuit Rule

If InvKey.Count() == 1 → RedirectToAction("CreateNew", new { id = tempKey }). Multi-option only applies when 2+ options are selected. V2 must replicate this collapse.

### Data Reads

| **Data**                         | **Source**                                                | **Purpose**                                                               |
| -------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------- |
| VendorEstimate (MasterKey)       | db.VendorEstimate.Find(MasterKey)                         | Fetch master estimate for job/vendor lookup                               |
| Each VendorEstimate (InvKey\[\]) | db.VendorEstimate.Find(xitem) ordered by MCEstimate       | Each pricing option; builds model.MultipleObj list                        |
| Job                              | db.Job.Find(estim.JobKey)                                 | Gets CustomerKey and JobTypeKey                                           |
| Customer                         | db.Customer.Find(job.CustomerKey)                         | Markup defaults: MaterialMarkUp, LaborAndTrip, AdminMarkup                |
| InvoiceApprovingAgent            | db.InvoiceApprovingAgent                                  | Checks if logged-in user is an approving agent → model.AppAgent           |
| VendorNetTerm                    | db.VendorNetTerm                                          | Payment terms dropdown; defaulted from Customer.NetID                     |
| SalesChargeType                  | db.SalesChargeType (IsDelete==false)                      | Charge type dropdown                                                      |
| Dynamic Min Markup               | ManageCustProfileDynMinMarkup.GetByCustomerKey(...) async | ViewBag.DynamicMinimumMarkupData - per-customer minimum markup thresholds |

### Model Built: CustomerInvoiceObjects

model.MultipleObj = List&lt;CustomerMultipleObj&gt;, one entry per selected estimate option:

| **Field**         | **Value**                                                                 |
| ----------------- | ------------------------------------------------------------------------- |
| InvoiceKey        | Fresh Guid per option (stored in GlobalClass.StoreGuid - V1 anti-pattern) |
| VendorEstimateKey | The InvKey\[i\] for that option                                           |
| Sequence          | VendorEstimate.MCEstimate - determines display/save order                 |
| EstimateTitle     | VendorEstimate.EstimateTitle                                              |
| VendorKey         | VendorEstimate.VendorKey                                                  |
| JobKey            | VendorEstimate.JobKey                                                     |

## 3.3 View: CreateNewMultipleOption.cshtml

### JavaScript Files Loaded

| **File**                                               | **Purpose**                                                                                       |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| FormScripts/ManageCustomerVendorDeposit.js             | Deposit entry modal - customer deposit + per-vendor deposit amounts                               |
| FormScripts/AutoAdjustEstBelowThreshold.js             | Checks if customer total falls below dynamic minimum markup; triggers special approval flow if so |
| FormScripts/AutoAdjustEst4MultiVendorAndMultiOption.js | Shared client-side row math for multi-option and multi-vendor grids                               |
| FormScripts/AutoAdjustEst4MultiOption.js               | Client-side row math specific to the multi-option grid (Feature A only)                           |

### Grid Population - AJAX

Each option's line-item grid is populated via AJAX to LoadTheEstimateGridStuffForMultioption:

- - Calls VendorEstimateToCustomerEstimaeSetup.GetVendorEstimateForCreateEstimateNew(id, ...) for the primary option key
    - Then queries all VendorEstimate rows where MutiEstiIdentifier == id (excluding itself), ordered by MCEstimate, and calls GetVendorEstimateForCreateEstimateNew for each sibling
    - Returns List&lt;CustomerInvoiceObjects&gt; as JSON to the browser

### Markup Engine: GetVendorEstimateForCreateEstimateNew (VendorEstimateToCustomerEstimaeSetup.cs, line 209)

- Reads VendorEstimateDetail (materials/trip lines) and VendorEstimateDetail1 (labor lines)
- Calls UtilityTasks.GetCustomerRatesByChargetypes(chargeTypeKey, TradeKey, CustomerKey) for customer rates per charge type
- Applies markup: MaterialMarkUp on material lines, LaborAndTrip on labor/trip lines, AdminMarkup as optional separate line
- Emergency job type: if Job.JobTypeKey == "fc078fd5-5ddc-4088-8a9f-d982436e20fd" → switches to Overtime/Weekend charge-type GUIDs instead of standard ones

**⚠ ChargeTypeKey GUIDs are hardcoded: 26D12240-A2B0-4854-A7EB-4C4839B2D056=Materials, D78B2B4C.../F3422FF6...=Trip charges, FBD282B5.../DB2597C4...=Labor. Scattered across two classes with no constants class. V2 MUST centralize.**

### Post-Save Redirect

| **Condition**          | **Destination**                                        |
| ---------------------- | ------------------------------------------------------ |
| Primary success        | /MgtJobSalesOrder/PreviewEstimates/{InvoiceKey}?id1=2  |
| Email immediately flag | /MgtJobSalesOrder/EmailEstimateToCustomer/{InvoiceKey} |
| Cancel / Back          | /MgtVendorInvoice/EIndex/{JobKey}                      |

## 3.4 POST: SaveCreateNewEstimateForMultipleOption

### Signature

public async Task&lt;ActionResult&gt; SaveCreateNewEstimateForMultipleOption(

Guid JobKey, Guid TradeKey, Guid? VendorKey,

Guid InvoiceKey, int? InvoiceType, int? AppAgent, string Terms,

List&lt;VennCusMultiple&gt; DetailList,

List&lt;VendorDepositClass&gt; VendorDepositListObj,

decimal? CustomerDepoAmount,

string ReasonForNoCustomerDeposit,

List&lt;VendorDepositOverride&gt; VendorDepositOverrideList,

string CustomerDepositOverrideList)

### Key Model Types

| **Type**                               | **Description**                                                                                                                        |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| VennCusMultiple                        | One option: Sequence (int), title (string), InvoiceKey (Guid), ItemList&lt;VendorEstimateToCustomerEstimateDetail&gt;                  |
| VendorEstimateToCustomerEstimateDetail | A single line item: rate, qty, amount, chargeTypeKey, incurred/proposed flag, description, VEDetailKey (links to VendorEstimateDetail) |
| VendorDepositClass                     | Per-vendor deposit: VendorKey, JobVendorKey, DepositAmount                                                                             |
| VendorDepositOverride                  | Override justification: VendorKey, OverrideReason, OverrideAmount                                                                      |

### Business Logic - Step by Step

Step 1 - Archive old estimate:

- - db.JobSalesInvoice where IsEstimate==true && RemovedDueToEdit==null - finds current active estimate
    - If found: JobSalesEstimateSetup.RemoveTheOldSalesInvoice(...) snapshots it into JobSalesInvoiceAfterUpdate / JobSalesInvoiceDetailAfterUpdate. Returns sentToCustomer flag.

Step 2 - Loop per option (foreach item in DetailList):

- - Calls JobSalesEstimateSetup.SaveSalesInvoiceEstimatesWithOption(...) once per option
    - Each creates one JobSalesInvoice: MultipleChoiceEstimate=true, MCEstimate=item.Sequence, EstimateTitle=item.title, MutiEstiIdentifier=InvoiceKey (shared), IsEstimate=true
    - Updates source VendorEstimate: Status=2, IsApproved/IsCancelled/IsNew=false, EditedByVendor=null, OtherRemark="Pending Approval :: {date}", ApprovedBy, OtherDate=UtcNow
    - Logs job note, calls ManageVendorInvoice.CancelAllRegardingVendorEstimates(JobKey, VendorKey, VendorEstimateKey, 2), db.SaveChanges()

Step 3 - Deposit notes and approval email (after loop):

- - GetInlineInvoiceEstimate(InvoiceKey, false, true, "Multiple Option Estimate has been created by {user}", JobKey, false) - builds note body
    - GetOlderDepositRepoort or SetVendorDeposit - handles stale/new deposit records
    - If VendorDepositListObj != null OR CustomerDepoAmount > 0: calls SaveTheApprovalRequestForDeposit(...) - sends deposit approval email (see Section 6)

**⚠ GlobalClass.GlobalSales is a process-wide static List used as scratch storage between controller and DAL. NOT thread-safe in a multi-user app pool. DO NOT replicate in V2.**

Return value: JsonResult Data="1" on success, raw exception message on failure. Front-end checks for "1" to trigger redirect.

## 3.5 DAL: SaveSalesInvoiceEstimatesWithOption (JobSalesEstimateSetup.cs, line 3104)

| **Action**                    | **Detail**                                                                                                                                            |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Creates JobSalesInvoice       | MultipleChoiceEstimate=true, MCEstimate=item.Sequence, EstimateTitle=item.title, Isdeposit from CustomerDepoAmount, IsEstimate=true                   |
| Removes JobActionNeeded       | Rows with ActionID==14                                                                                                                                |
| Inserts JobSalesInvoiceDetail | From GlobalClass.GlobalSales; tagged MarkAsIncurredCmt/MarkAsProposed/NewLineAddedAfterEdit by cross-referencing VendorEstimateDetail via VEDetailKey |
| Admin fee row                 | If obj.AddAdminFees==true, adds "Admin fee % mark-up" detail row                                                                                      |
| Logs note                     | "Customer Estimate Created" via ManageJobMessegingSetup.SaveGeneralNotewithDB(...)                                                                    |
| Returns                       | DataReturn { flag=1, mess="Data has been updated successfully.", key=invoice.InvoiceKey }                                                             |

## 3.6 DB Objects Touched - Feature A

| **Table**                        | **Operation**           | **Purpose**                                                                |
| -------------------------------- | ----------------------- | -------------------------------------------------------------------------- |
| JobSalesInvoice                  | INSERT (one per option) | New customer estimate record per option                                    |
| JobSalesInvoiceDetail            | INSERT                  | Line items for each option                                                 |
| JobSalesInvoiceAfterUpdate       | INSERT (archive)        | Snapshot of prior estimate (edit history)                                  |
| JobSalesInvoiceDetailAfterUpdate | INSERT (archive)        | Prior estimate line item snapshot                                          |
| VendorEstimate                   | UPDATE                  | Status=2, flags cleared, OtherRemark, OtherDate                            |
| VendorEstimateDetail             | READ                    | Source material/trip lines for markup engine                               |
| VendorEstimateDetail1            | READ                    | Source labor lines for markup engine                                       |
| VendorDepositSet                 | UPSERT                  | Per-vendor deposit amounts                                                 |
| DepositApprovalFromSVCmanager    | UPSERT                  | Deposit approval state (auto-approved or pending)                          |
| DepositOverrideRemark            | INSERT                  | Audit trail for deposit override justifications                            |
| JobActionNeeded                  | DELETE                  | Clears ActionID==14 rows; also 50/61 via CancelAllRegardingVendorEstimates |
| EmailSendToAddress               | READ                    | SendToType==38: identifies whether logged-in user is SVC Manager           |

# 4\. Feature B - Multi-Vendor Multi-Option → Customer Estimate

## 4.1 Route & File Map

| **Property**                  | **Value**                                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------------- |
| GET route                     | /MgtVendorEstimateToCustomerEstimate/CreateMultipleVenOption                                   |
| POST route                    | /MgtVendorEstimateToCustomerEstimate/SaveCreateNewEstimateFromMultipleVendor                   |
| Controller                    | ProjectRCS\\Controllers\\MgtVendorEstimateToCustomerEstimateController.cs                      |
| View                          | Views\\MgtVendorEstimateToCustomerEstimate\\CreateMultipleVenOption.cshtml                     |
| DAL method                    | JobSalesEstimateSetup.SaveSalesEstimatesForMultiplevendor(...)                                 |
| DB result                     | ONE JobSalesInvoice row for all vendors + one JobSalesOrderToVEstimate row per vendor estimate |
| Key difference from Feature A | Feature A: 1 vendor → N option documents. Feature B: N vendors → 1 combined document.          |

## 4.2 GET: CreateMultipleVenOption

### Signature

public async Task&lt;ActionResult&gt; CreateMultipleVenOption(Guid? JobKey, Guid?\[\] InvKey)

Note: No MasterKey parameter. Each InvKey is a distinct vendor's estimate (not options from one vendor).

### Short-Circuit Rule

If InvKey.Count() == 1 → RedirectToAction("CreateNew", new { id = tempKey }). Same collapse as Feature A.

### Critical Structural Difference from Feature A

| **Field on CustomerMultipleObj** | **Feature A (per option)** | **Feature B (per vendor)**                                         |
| -------------------------------- | -------------------------- | ------------------------------------------------------------------ |
| InvoiceKey                       | Unique per option          | Same shared InvoiceKey for ALL vendors                             |
| VendorKey                        | Same (single vendor)       | Different per entry                                                |
| JobVendorKey                     | N/A                        | Set from VendorEstimate.JobVendorKey - needed for deposit tracking |
| VendorName                       | N/A (same vendor)          | Different per entry - shown as section header in UI                |

### Data Reads

Same ViewBag pattern as Feature A (Job, Customer, InvoiceApprovingAgent, VendorNetTerm, SalesChargeType, ManageCustProfileDynMinMarkup) plus:

- db.VendorEstimate.Find(item) per InvKey entry - reads VendorKey/JobVendorKey/VendorName for each selected vendor

## 4.3 View: CreateMultipleVenOption.cshtml

### JavaScript Files Loaded

| **File**                                               | **Purpose**                                                             |
| ------------------------------------------------------ | ----------------------------------------------------------------------- |
| FormScripts/ManageCustomerVendorDeposit.js             | Deposit modal - calls different endpoint for multi-vendor (see below)   |
| FormScripts/AutoAdjustEstBelowThreshold.js             | Dynamic minimum markup check - same as Feature A                        |
| FormScripts/AutoAdjustEst4MultiVendorAndMultiOption.js | Shared multi-vendor + multi-option client math (shared with Feature A)  |
| FormScripts/AutoAdjustEst4MultiVendor.js               | Client-side row math specific to the multi-vendor grid (Feature B only) |

### Deposit Modal AJAX Endpoint Difference

Feature B calls /MgtDepositManagement/GetForvendorsDepositWhenInCreateMultipleVenOption (not the single-vendor endpoint). This is because per-vendor deposit amounts must be tracked separately for each vendor.

### Grid Population

LoadTheEstimateGridStuff (generic variant) - one AJAX call per vendor in model.MultipleObj. Returns each vendor's line items converted via the same markup engine.

### Save AJAX Call

Posts to: /MgtVendorEstimateToCustomerEstimate/SaveCreateNewEstimateFromMultipleVendor

## 4.4 POST: SaveCreateNewEstimateFromMultipleVendor

### Signature

public async Task&lt;ActionResult&gt; SaveCreateNewEstimateFromMultipleVendor(

Guid JobKey, Guid TradeKey, Guid InvoiceKey,

int? InvoiceType, int? AppAgent, string Terms,

List&lt;VendorEstimateToCustomerEstimateDetail&gt; DetailList,

Guid?\[\] VendorEstimateKeyList,

List&lt;VendorDepositClass&gt; VendorDepositListObj,

decimal? CustomerDepoAmount,

string ReasonForNoCustomerDeposit,

List&lt;VendorDepositOverride&gt; VendorDepositOverrideList,

string CustomerDepositOverrideList)

Doc-comment: "Used only in saving the Customer Estimate of MgtVendorEstimateToCustomerEstimate/CreateMultipleVenOption"

### Business Logic - Step by Step

Step 1 - Archive old estimate: Same RemoveTheOldSalesInvoice pattern as Feature A.

Step 2 - Build combined model:

- - Builds a SINGLE JobSalesInvoiceClass: Title="Multi-Vendor Estimate", VendorEstimateKey=null (no single source), MultipleChoiceEstimate=false, MCEstimate=0
    - Merges ALL vendors' DetailList line items into GlobalClass.GlobalSales
    - Calls JobSalesEstimateSetup.SaveSalesEstimatesForMultiplevendor(...) - ONE call, not a loop per vendor

Step 3 - Per-vendor loop (VendorEstimateKeyList) - AFTER the single save:

- - foreach vendor estimate key in VendorEstimateKeyList:
    - Updates that VendorEstimate: Status=2, IsApproved/IsCancelled/IsNew=false, EditedByVendor=null, OtherRemark, CustomerEstimateRemark set with creation date
    - Also updates SIBLING vendor estimates (same job+vendor, different InvoiceKey, Status != 3): same Status=2 flags cleared
    - Inserts JobSalesOrderToVEstimate row: { Pkey=newGuid, VendorEstimateKey=item, InvoiceKey=InvoiceKey } - THE KEY JOIN TABLE unique to Feature B
    - Logs job note per vendor, calls CancelAllRegardingVendorEstimates(...)
    - Uses a FRESH RCSdbEntities per iteration (var bg = new RCSdbEntities()), disposed at loop end - each iteration is its own commit

Step 4 - Deposit notes and approval email: Same as Feature A (see Section 6).

**⚠ SaveSalesEstimatesForMultiplevendor hardcodes invoice.SentToCustomer = false regardless of the computed sentToCustomer parameter. This is a bug vs. Features A and single-estimate paths that honor it. Fix in V2.**

**⚠ Feature B uses GetInlineInvoiceEstimateTosendInNotes(invoice.InvoiceKey, 2) in the DAL - a different helper than Feature A's GetInlineInvoiceEstimate. V2 should unify these two note-rendering helpers.**

**⚠ A fresh DbContext per loop iteration means a failure mid-loop leaves partial data committed. V2: wrap the entire multi-vendor save in a single transaction with full rollback.**

## 4.5 DAL: SaveSalesEstimatesForMultiplevendor (JobSalesEstimateSetup.cs, line 3346)

| **Action**                    | **Detail**                                                                                                                 |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Creates ONE JobSalesInvoice   | Title="Multi-Vendor Estimate", VendorEstimateKey=null, MultipleChoiceEstimate=false, MCEstimate=0, MutiEstiIdentifier=null |
| SentToCustomer                | Always false - known inconsistency vs. other paths                                                                         |
| Inserts JobSalesInvoiceDetail | All vendors' merged line items from GlobalClass.GlobalSales                                                                |
| Note rendering                | GetInlineInvoiceEstimateTosendInNotes(invoice.InvoiceKey, 2) - different helper than Feature A                             |
| Logs note                     | ManageJobMessegingSetup.SaveGeneralNote (non-DB-instance overload)                                                         |
| Returns                       | DataReturn { flag=1, mess="Data has been updated successfully.", key=invoice.InvoiceKey }                                  |

## 4.6 DB Objects Touched - Feature B

| **Table**                        | **Operation**                    | **Purpose**                                                                                   |
| -------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------- |
| JobSalesInvoice                  | INSERT (ONE row)                 | The single combined customer estimate                                                         |
| JobSalesInvoiceDetail            | INSERT                           | All vendors' line items merged into one estimate                                              |
| JobSalesInvoiceAfterUpdate       | INSERT (archive)                 | Snapshot of prior estimate                                                                    |
| JobSalesInvoiceDetailAfterUpdate | INSERT (archive)                 | Prior estimate line item snapshot                                                             |
| VendorEstimate                   | UPDATE (each vendor + siblings)  | Status=2, flags cleared for each vendor's estimate and its siblings                           |
| JobSalesOrderToVEstimate         | INSERT (one per vendor estimate) | UNIQUE TO FEATURE B: join table linking each vendor estimate to the combined customer invoice |
| VendorDepositSet                 | UPSERT                           | Per-vendor deposit amounts                                                                    |
| DepositApprovalFromSVCmanager    | UPSERT                           | Deposit approval state                                                                        |
| DepositOverrideRemark            | INSERT                           | Deposit override audit trail                                                                  |
| JobActionNeeded                  | DELETE                           | Clears pending vendor estimate action rows                                                    |

# 5\. Shared Infrastructure (Both Features)

## 5.1 Session Guard

Both GET actions check GlobalClass.SystemSession. If null/expired → returns View("Error") with "Sorry, your Session has Expired". V2: replace with proper ASP.NET Core auth middleware.

## 5.2 Grid Loader Actions

| **Action**                             | **Used by**    | **DAL Method**                                                                |
| -------------------------------------- | -------------- | ----------------------------------------------------------------------------- |
| LoadTheEstimateGridStuffForMultioption | Feature A view | GetVendorEstimateForCreateEstimateNew (primary + MutiEstiIdentifier siblings) |
| LoadTheEstimateGridStuff               | Feature B view | VendorEstimateToCustomerEstimaeSetup.GetVendorEstimatelineItem                |

## 5.3 Dynamic Minimum Markup Threshold

Both views load AutoAdjustEstBelowThreshold.js which calls:

- POST /MgtVendorEstimateToCustomerEstimate/CheckIfCustomerGrandTotalIsWithinThreshold - validates customer total against per-customer configured minimum markup. Delegates to Mutators.CustInvoiceAndEstimateMutator.CheckIfCustomerGrandTotalIsWithinThreshold(...)
- POST /MgtVendorEstimateToCustomerEstimate/CheckCustomerGrandTotalThresholdForEstimateFromScratch - variant for estimates without a vendor basis
- If below threshold: JS calls /ApproveEstimateBelowMarkup/SaveApprovalReqForCustomerEstimate (MgtApproveEstimateBelowMarkupController) - special manager-approval path for below-minimum pricing

**⚠ CheckCustomerGrandTotalThresholdForEstimateFromScratch returns a plain string on early exit but List&lt;DynMinMarkupCheckStatusModel&gt; on success - inconsistent contract. Standardize in V2.**

## 5.4 Deposit Management Flow

### ManageCustomerVendorDeposit.js AJAX Endpoints

| **Endpoint**                                                            | **Feature**       | **Purpose**                                                                  |
| ----------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------- |
| /MgtDepositManagement/GetsingleVendorEstimatestuff                      | A (single-option) | Gets deposit info for single vendor estimate                                 |
| /MgtDepositManagement/GetsingleVendorMultipleEstimatestuff              | A (multi-option)  | Gets deposit info for multiple options from one vendor                       |
| /MgtDepositManagement/GetForvendorsDepositWhenInCreateMultipleVenOption | B (multi-vendor)  | Gets per-vendor deposit info for multi-vendor scenario                       |
| /MgtDepositManagement/GetVendorEstimatesForSpecificDeposit              | Both              | Specific deposit details                                                     |
| /NewCustomerEstimate/SaveVendorDepositCustomerDeposit                   | Both              | Saves deposit configuration                                                  |
| /MgtDepositManagement/GetCustomerEstimateTotalForDeposit?invoiceKey=... | Both              | Returns smallest customer estimate total for 35%-rule deposit UI calculation |

### Deposit Approval Logic (SaveTheApprovalRequestForDeposit, JobSalesEstimateSetup.cs line 2939)

Called from both Feature A and B save actions when deposit amounts exist:

| **Condition**                                                     | **Result**                                                                                                                                                                                                       |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Logged-in user IS SVC Manager (EmailSendToAddress.SendToType==38) | Auto-approves: DepositApprovalFromSVCmanager.IsApproved=true; sends email to Account Manager via MailToAdmin.SendMailToAccountManagerForApprovedDeposit(...), template EmailTemplateforAdmin.Find(13)            |
| Logged-in user is NOT SVC Manager                                 | Pending: DepositApprovalFromSVCmanager.IsApproved=null; sends approval-request to SVC Manager via MailToAdmin.SendToSVCManagerForDepositApproval(...), subject "Deposit Estimate Approval Needed for RFI PO:..." |
| No deposit (VendorDepositListObj==null AND CustomerDepoAmount==0) | No email, no deposit records                                                                                                                                                                                     |

**⚠ SaveTheApprovalRequestForDeposit doc-comment: "this function is created for specific job PO: 23979" - a one-off customer carve-out baked into shared code that every estimate goes through. Remove/generalize in V2.**

## 5.5 Email Service Integration

| **Email Event**                         | **Class / Method**                                                                           | **Template / Note**                                                                    |
| --------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Deposit auto-approved → Account Manager | MailToAdmin.SendMailToAccountManagerForApprovedDeposit                                       | EmailTemplateforAdmin.Find(13); via EmailApiClient.SendAdminEmailAsync                 |
| Deposit pending → SVC Manager           | MailToAdmin.SendToSVCManagerForDepositApproval                                               | HTML built via Aform.CreateDepositApprovalForm; via EmailApiClient.SendAdminEmailAsync |
| Customer estimate email (post-save)     | MailToCustomers.SendEstimatedToCustomer + InvoiceCreator.CreateEstimatedToCustomer2ndEdition | Sent from MgtJobSalesOrder/EmailEstimateToCustomer - NOT from this controller          |

All emails go through EmailApiClient.cs (ProjectRCS\\Helper\\EmailApiClient.cs) → HTTP POST to Email Service API (RFIEmailService). Config: AppSettings\["EmailApiBaseUrl"\] and AppSettings\["EmailApiKey"\].

## 5.6 CancelAllRegardingVendorEstimates

ManageVendorInvoice.CancelAllRegardingVendorEstimates(JobKey, VendorKey, VendorEstimateKey, 2) is called after every successful save in both features. It:

- Removes pending JobActionNeeded rows (ActionID 50 and 61)
- Clears in-memory response/highlight flags
- Executes raw SQL: UPDATE VendorEstimate SET Status=@p0, ApprovedBy=@p1, OtherDate=@p2, OtherRemark=@p3, IsApproved=0, IsCancelled=0, IsNew=0 WHERE MutiEstiIdentifier=@p4

Raw SQL location: ManageVendorInvoice.cs line 1143 (ExecuteSqlCommand call on db).

# 6\. Database Schema Reference

Database: rfidatabase.database.windows.net (dev) / rfi-prod-db-server.database.windows.net (prod), catalog rfidb / rfidb-dev1.

All applications share one database - changes affect Admin Portal, Vendor Portal, Customer Portal, Job Ops API, Email Service API, and File Storage simultaneously.

## 6.1 VendorEstimate

PK: InvoiceKey (uniqueidentifier). FK: JobKey→Job, VendorKey→Vendor.

| **Column**                                  | **Type**            | **V1 Purpose / V2 Notes**                                                                                    |
| ------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------ |
| InvoiceKey                                  | uniqueidentifier PK | Vendor estimate identifier; also used as the InvKey\[\] parameter in both feature routes                     |
| JobKey                                      | uniqueidentifier FK | Parent job                                                                                                   |
| VendorKey                                   | uniqueidentifier FK | Vendor who submitted this estimate                                                                           |
| Status                                      | int                 | Set to 2 ("Pending Approval") by all Save\* actions. Values 0,1,2,3,4,5,99 used - no named constants in code |
| MultipleChoiceEstimate                      | bit                 | True if this estimate is part of a multi-option set                                                          |
| MCEstimate                                  | int                 | Option sequence number within a multi-choice set                                                             |
| EstimateTitle                               | nvarchar(max)       | Option display title                                                                                         |
| MutiEstiIdentifier                          | uniqueidentifier    | Groups all options belonging to the same multi-choice set (set on the VendorEstimate rows themselves)        |
| IsApproved / IsCancelled / IsNew / IsEdited | bit                 | All set false on save                                                                                        |
| EditedByVendor                              | bit                 | Cleared (null) on admin save                                                                                 |
| OtherRemark                                 | nvarchar(max)       | Set to "Pending Approval :: {date}" on save                                                                  |
| CustomerEstimateRemark                      | nvarchar(max)       | Set with creation date in Feature B per-vendor loop                                                          |
| OnsiteApproval                              | bit                 | If true, a snapshot is taken before rejection                                                                |
| ApprovedBy / OtherDate                      | nvarchar / datetime | Set to logged-in user and UtcNow on save                                                                     |

## 6.2 JobSalesInvoice (Customer Estimate / Invoice)

PK: InvoiceKey (uniqueidentifier). FK: JobKey→Job, SalesStatusKey→SalesStatus, CreatedBy→StaffList.

| **Column**             | **Type**         | **Purpose**                                                                                              |
| ---------------------- | ---------------- | -------------------------------------------------------------------------------------------------------- |
| IsEstimate             | bit              | True = customer estimate; false = customer invoice                                                       |
| MultipleChoiceEstimate | bit              | True for Feature A (one row per option). False for Feature B (one combined row).                         |
| MCEstimate             | int              | Option sequence - 1,2,3... for Feature A; 0 for Feature B                                                |
| EstimateTitle          | nvarchar(max)    | Option title (Feature A) or "Multi-Vendor Estimate" (Feature B)                                          |
| MutiEstiIdentifier     | uniqueidentifier | Shared key across all option rows in Feature A; used to group for retrieval/display. Null in Feature B.  |
| VendoeEstimateKey      | uniqueidentifier | Links back to source VendorEstimate. NULL in Feature B (multiple vendors).                               |
| Isdeposit              | bit              | True if customer deposit was requested                                                                   |
| DepositAmount          | decimal(18,2)    | Customer deposit amount                                                                                  |
| SentToCustomer         | bit              | Whether estimate was already emailed to customer (incorrectly set to false in Feature B DAL - known bug) |
| RemovedDueToEdit       | datetime?        | Set when archived; null = current active estimate                                                        |
| ApprovedBySVCManager   | bit              | Whether SVC manager approved the deposit                                                                 |
| RespondedByCustomer    | int              | Customer response; used by deposit total calc endpoint                                                   |

## 6.3 JobSalesInvoiceDetail

PK: DetailKey. FK: JobKey→Job, ChargeTypeKey→SalesChargeType.

| **Column**                                                 | **Type**            | **Purpose**                                                                            |
| ---------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------- |
| Rate / Qty / Amt                                           | decimal(18,2)       | Customer-facing priced line item values                                                |
| ItemName / LineItemTitle                                   | nvarchar(max)       | Description fields                                                                     |
| CostIncurred                                               | int                 | Incurred vs proposed flag                                                              |
| ChargeTypeKey                                              | uniqueidentifier FK | Links to SalesChargeType; determines pricing category                                  |
| VendorEstimateDetailKey                                    | uniqueidentifier    | Traceability back to VendorEstimateDetail source line                                  |
| MarkAsIncurredCmt / MarkAsProposed / NewLineAddedAfterEdit | nvarchar(max)       | Edit-tracking flags set when re-estimating after estimate was already sent to customer |

## 6.4 JobSalesOrderToVEstimate (Feature B ONLY)

PK: Pkey (uniqueidentifier). This join table is UNIQUE to Feature B. Note: constraint is named PK_JonsSalesOrderToVEstimate (DDL typo).

| **Column**        | **Type**            | **Purpose**                                          |
| ----------------- | ------------------- | ---------------------------------------------------- |
| Pkey              | uniqueidentifier PK | Row identifier                                       |
| InvoiceKey        | uniqueidentifier    | The ONE combined JobSalesInvoice for all vendors     |
| VendorEstimateKey | uniqueidentifier    | One contributing VendorEstimate (one row per vendor) |

One row inserted per entry in VendorEstimateKeyList. This is how V2 will know which vendor estimates contributed to a combined multi-vendor customer estimate.

## 6.5 VendorDepositSet

PK: PKey. No FK constraints declared.

| **Column**     | **Type**         | **Purpose**                      |
| -------------- | ---------------- | -------------------------------- |
| JobKey         | uniqueidentifier | Job                              |
| VendorKey      | uniqueidentifier | Vendor for this deposit          |
| DepositSetDate | datetime         | When deposit was set             |
| DepositAmount  | decimal(18,2)    | Deposit amount for this vendor   |
| ApprovedBy     | nvarchar(max)    | Staff member who set the deposit |

## 6.6 DepositApprovalFromSVCmanager

| **Column** | **Type**         | **Purpose**                                        |
| ---------- | ---------------- | -------------------------------------------------- |
| IsApproved | bit (nullable)   | null=pending, true=approved, false=denied          |
| JobKey     | uniqueidentifier | Job this approval is for                           |
| Remark     | nvarchar(max)    | "Approved on deposit creation." when auto-approved |

## 6.7 VendorEstimateDetail / VendorEstimateDetail1

| **Column**                                         | **Type**             | **Purpose**                              |
| -------------------------------------------------- | -------------------- | ---------------------------------------- |
| DetailKey (Detail) / LaborKey (Detail1)            | PK                   | Row identifier                           |
| InvoiceKey                                         | FK to VendorEstimate | Parent estimate                          |
| Amount / Qty                                       | decimal(18,2)        | Vendor cost (input to markup engine)     |
| Description / ItemName                             | nvarchar(max)        | Line item description                    |
| CostIncurred                                       | int                  | Incurred vs proposed flag                |
| DisplayLevel                                       | int                  | Ordering bucket                          |
| ApprovedByCustomer                                 | int                  | Per-line customer approval (Detail only) |
| TechOnSite / LaborHr / LaborRate / WorkDescription | (Detail1 only)       | Labor-specific columns                   |

## 6.8 History Tables: JobSalesInvoiceAfterUpdate / JobSalesInvoiceDetailAfterUpdate

Populated by RemoveTheOldSalesInvoice() whenever an existing customer estimate is replaced. Mirror the columns of JobSalesInvoice and JobSalesInvoiceDetail plus ArchivedOn/Version metadata. These tables are the versioning/audit trail for customer estimates.

# 7\. Key Files Reference Map

| **File**                                                                   | **Role**                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Controllers\\MgtVendorEstimateToCustomerEstimateController.cs              | Main controller: CreateNew, CreateNewMultipleOption (Feature A GET), CreateMultipleVenOption (Feature B GET), SaveCreateNewEstimate, SaveCreateNewEstimateForMultipleOption (Feature A POST), SaveCreateNewEstimateFromMultipleVendor (Feature B POST), grid loaders, threshold-check actions                  |
| DatabaseInteraction\\JobSalesEstimateSetup.cs                              | Core DAL: SaveSalesInvoiceEstimatesWithOption (line 3104), SaveSalesEstimatesForMultiplevendor (line 3346), SaveSalesInvoiceEstimatesSignleEstimateFromVendor (line 2653), SaveTheApprovalRequestForDeposit (line 2939), RemoveTheOldSalesInvoice, SetVendorDeposit, GetOlderDepositRepoort, SetNotNeededItems |
| DatabaseInteraction\\VendorEstimateToCustomerEstimaeSetup.cs               | Markup engine: GetVendorEstimateForCreateEstimateNew (line 209), GetVendorEstimatelineItem, GetVendorEstimatelineItemForTheSimpleOne; UtilityTasks.GetCustomerRatesByChargetypes                                                                                                                               |
| DatabaseInteraction\\ManageVendorInvoice.cs                                | CancelAllRegardingVendorEstimates, raw SQL batch-update (line 1143), job status helpers                                                                                                                                                                                                                        |
| DatabaseInteraction\\ManageJobMessegingSetup.cs                            | Notes/activity: SaveGeneralNote, SaveGeneralNotewithDB, SaveDashboaardButtonClicks                                                                                                                                                                                                                             |
| DatabaseInteraction\\ManageCustProfileDynMinMarkup.cs                      | GetByCustomerKey - per-customer dynamic minimum markup config                                                                                                                                                                                                                                                  |
| Mailing\\MailToAdmin.cs                                                    | SendMailToAccountManagerForApprovedDeposit, SendToSVCManagerForDepositApproval                                                                                                                                                                                                                                 |
| Mailing\\MailToCustomers.cs                                                | SendEstimatedToCustomer - sends customer-facing estimate email (downstream of this feature, from MgtJobSalesOrder)                                                                                                                                                                                             |
| Helper\\EmailApiClient.cs                                                  | HTTP client for RFIEmailService API. Config: AppSettings\["EmailApiBaseUrl"\], AppSettings\["EmailApiKey"\]                                                                                                                                                                                                    |
| Helper\\InvoiceCreator.cs                                                  | InlineVendorEstimateForDisplay, CreateEstimatedToCustomer2ndEdition, GetInlineInvoiceEstimate, GetInlineInvoiceEstimateTosendInNotes (Feature B DAL)                                                                                                                                                           |
| Helper\\BlobFileService.cs                                                 | HTTP client for RFIFileandStorageManagement API. Config: AppSettings\["FILESERVEURL"\], AppSettings\["RFIEXTERNALAUTHKEY"\]                                                                                                                                                                                    |
| Views\\MgtVendorEstimateToCustomerEstimate\\CreateNewMultipleOption.cshtml | Feature A view                                                                                                                                                                                                                                                                                                 |
| Views\\MgtVendorEstimateToCustomerEstimate\\CreateMultipleVenOption.cshtml | Feature B view                                                                                                                                                                                                                                                                                                 |
| FormScripts\\ManageCustomerVendorDeposit.js                                | Deposit modal JS - calls MgtDepositManagement endpoints                                                                                                                                                                                                                                                        |
| FormScripts\\AutoAdjustEstBelowThreshold.js                                | Dynamic minimum markup JS - calls /ApproveEstimateBelowMarkup/SaveApprovalReqForCustomerEstimate                                                                                                                                                                                                               |
| FormScripts\\AutoAdjustEst4MultiVendorAndMultiOption.js                    | Shared client grid math (both features)                                                                                                                                                                                                                                                                        |
| FormScripts\\AutoAdjustEst4MultiOption.js                                  | Feature A client grid math                                                                                                                                                                                                                                                                                     |
| FormScripts\\AutoAdjustEst4MultiVendor.js                                  | Feature B client grid math                                                                                                                                                                                                                                                                                     |
| Controllers\\MgtVendorInvoiceController.cs                                 | Entry point: EIndex (line 925), WhenOtherEstimatesArePresent (302), GetAllMultipleOptionVendorsEstimate (429), GetAllVendorsEstimate (555), CheckIfMultiVendorOptionCanbeDoneOrNot (267)                                                                                                                       |
| Controllers\\MgtDepositManagementController.cs                             | Deposit endpoints: GetCustomerEstimateTotalForDeposit (line 54), GetsingleVendorEstimatestuff, GetsingleVendorMultipleEstimatestuff, GetForvendorsDepositWhenInCreateMultipleVenOption                                                                                                                         |
| Controllers\\MgtJobSalesOrderController.cs                                 | Downstream: PreviewEstimates, EmailEstimateToCustomer - terminal destinations after estimate is created                                                                                                                                                                                                        |
| Models\\\*                                                                 | CustomerInvoiceObjects, CustomerMultipleObj, VennCusMultiple, VendorEstimateToCustomerEstimateDetail, VendorDepositClass, VendorDepositOverride, JobSalesInvoiceClass, DataReturn                                                                                                                              |

# 8\. V2 Rebuild Guidance - Issues to Address

## 8.1 Critical Architecture Issues (Must Fix)

| **Issue**                                      | **V1 Behavior**                                                                                                                                            | **V2 Recommendation**                                                                                                 |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| GlobalClass.GlobalSales static scratch list    | Process-wide static List used between controller and DAL - NOT thread-safe under concurrent multi-user load                                                | Pass data explicitly as method parameters or scoped service objects. Never use static mutable state for request data. |
| GlobalClass.StoreGuid static state             | Process-wide static Guid field - same race condition under concurrent users                                                                                | Pass the generated InvoiceKey explicitly through the call chain; do not store in process-wide statics.                |
| GlobalClass.SystemSession auth guard           | Process-wide static field for session - same race condition + not a proper auth mechanism                                                                  | Use ASP.NET Core auth middleware / JWT / cookie auth. Do not replicate GlobalClass patterns.                          |
| Fresh DbContext per loop iteration (Feature B) | var bg = new RCSdbEntities() inside VendorEstimateKeyList loop - each iteration is its own transaction; partial failure leaves inconsistent data committed | Wrap the entire multi-vendor save in a single DB transaction. Roll back all changes on any failure.                   |
| Raw exception text in JSON responses           | ex.Message.ToString() returned directly to browser - information disclosure + no server-side logging                                                       | Log server-side (structured logging). Return a typed error response to the client - never raw exception text.         |
| Hardcoded ChargeType GUIDs                     | Magic GUID constants scattered across two classes                                                                                                          | Create a centralized charge-type constants class. Consider seeding from SalesChargeType table instead of hardcoding.  |
| No DB CHECK constraints on status enums        | Status values validated only in application code                                                                                                           | Add CHECK constraints or use strongly-typed DB enums. Without this, any direct SQL write can corrupt status.          |
| Duplicate status tracking across 3 tables      | VendorStatus/PayableStatus on Job, JobVendor, and JobBill updated inconsistently                                                                           | Define a single source of truth per status concept. Other tables should derive or sync via event/trigger.             |

## 8.2 Business Logic Bugs to Fix in V2

| **Bug**                                            | **Location**                                                                                          | **Impact**                                                                                                                                           |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| SentToCustomer always false in Feature B DAL       | SaveSalesEstimatesForMultiplevendor - invoice.SentToCustomer = false hardcoded                        | A re-estimated multi-vendor job does not carry forward "already sent" flag - SetNotNeededItems and downstream change-tracking may behave incorrectly |
| Job-specific carve-out in shared deposit code      | SaveTheApprovalRequestForDeposit doc-comment: "created for specific job PO: 23979"                    | One-off customer hack runs for every estimate. Identify and remove or generalize.                                                                    |
| No server-side DNE re-validation                   | Vendor DNE cap checked in browser JS only                                                             | Re-validate vendor DNE on server before persisting. A modified HTTP request currently bypasses this check entirely.                                  |
| Inconsistent response contract on threshold check  | CheckCustomerGrandTotalThresholdForEstimateFromScratch: plain string on error, typed model on success | Standardize to single response shape throughout.                                                                                                     |
| Different note-rendering helpers in Feature A vs B | Feature A: GetInlineInvoiceEstimate; Feature B DAL: GetInlineInvoiceEstimateTosendInNotes             | Unify to one note-rendering helper with consistent parameters.                                                                                       |

## 8.3 Status Value Reference (Replicate in V2)

| **Table.Column**              | **Value** | **Meaning**                                                                               |
| ----------------------------- | --------- | ----------------------------------------------------------------------------------------- |
| VendorEstimate.Status         | 2         | "Pending Approval" - set by ALL Save\* actions. The only confirmed value in this feature. |
| VendorEstimate.Status         | 0         | Set on cancellation/rejection (emailType==9 in SendVendorMails)                           |
| VendorEstimate.Status         | 3         | Excluded from sibling-update query in Feature B - appears to be a terminal/complete state |
| VendorInvoice.RejectStatus    | 99        | Pending Approval                                                                          |
| VendorInvoice.RejectStatus    | 1         | Invoice Approved                                                                          |
| VendorInvoice.RejectStatus    | 2         | Rejected for resubmission                                                                 |
| VendorInvoice.RejectStatus    | 3         | Approved to pay CC                                                                        |
| VendorInvoice.RejectStatus    | 5         | Deposit Paid                                                                              |
| VendorInvoice.RejectStatus    | 0         | Job Not Billable                                                                          |
| EmailSendToAddress.SendToType | 38        | SVC Manager address - deposit auto-approval gate                                          |
| JobActionNeeded.ActionID      | 14        | Removed after customer estimate is created                                                |
| JobActionNeeded.ActionID      | 50, 61    | Removed by CancelAllRegardingVendorEstimates                                              |

## 8.4 External APIs V2 Must Integrate With

| **API**                             | **V1 Config Key**                                                   | **Usage in this feature**                                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Email Service API (RFIEmailService) | AppSettings\["EmailApiBaseUrl"\] + AppSettings\["EmailApiKey"\]     | Sends deposit approval emails (to SVC Manager and Account Manager). All email sent via HTTP POST to this API - no direct SMTP. |
| RFI File & Storage Management       | AppSettings\["FILESERVEURL"\] + AppSettings\["RFIEXTERNALAUTHKEY"\] | Not directly used in estimate save path; used for attachment retrieval. Auth via RFIApiKey header.                             |

## 8.5 Shared Database Considerations

- All applications share one Azure SQL DB: rfidatabase.database.windows.net / rfi-prod-db-server.database.windows.net
- V2 schema changes to JobSalesInvoice, VendorEstimate, or JobSalesOrderToVEstimate affect Admin Portal, Vendor Portal, Customer Portal, Job Ops API, Email Service, and File Storage simultaneously
- Job Ops API (RFIJobOps) already has AdminVendorBillsController (route api/v1/admin/vendor-bills), VendorInvoiceController, and VendorEstimateController on the same database - the intended V2 home for this feature
- V2 should use Key Vault secrets RFIDbDevAzureConnectionString / RFIDbProdConnectionString (as Job Ops API does) rather than Web.config connection strings

# 9\. End-to-End Flow Summaries

## 9.1 Feature A - Multi-Option Single Vendor

| **Step** | **Actor** | **Action**                                                                                                                                                                                               |
| -------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | Admin     | On EIndex, clicks "Create Customer Estimate" → CreateEst() JS fires                                                                                                                                      |
| 2        | Browser   | AJAX GET: MgtVendorInvoice/WhenOtherEstimatesArePresent → determines multi-option modal needed                                                                                                           |
| 3        | Browser   | AJAX GET: MgtVendorInvoice/GetAllMultipleOptionVendorsEstimate → populates #ModalMultiOptEst                                                                                                             |
| 4        | Admin     | Selects options → OK → GoNextModalMultiOptEst() fires                                                                                                                                                    |
| 5        | Browser   | GET /MgtVendorEstimateToCustomerEstimate/CreateNewMultipleOption?JobKey=...&MasterKey=...&InvKey\[\]=...&InvKey\[\]=...                                                                                  |
| 6        | Server    | Reads estimates, builds model.MultipleObj (one entry per option), renders CreateNewMultipleOption.cshtml                                                                                                 |
| 7        | Browser   | Per option: AJAX GET LoadTheEstimateGridStuffForMultioption → markup engine returns customer-priced lines                                                                                                |
| 8        | Admin     | Reviews/adjusts markup, enters deposit amounts if needed → clicks Save                                                                                                                                   |
| 9        | Browser   | If dynamic markup configured: JS calls CheckIfCustomerGrandTotalIsWithinThreshold                                                                                                                        |
| 10       | Browser   | AJAX POST to SaveCreateNewEstimateForMultipleOption with all options' line items                                                                                                                         |
| 11       | Server    | Archives old estimate → saves one JobSalesInvoice+Detail per option (shared MutiEstiIdentifier) → updates each VendorEstimate.Status=2 → handles deposit → sends approval emails if needed → returns "1" |
| 12       | Browser   | Redirects to PreviewEstimates/{InvoiceKey}?id1=2 or EmailEstimateToCustomer/{InvoiceKey}                                                                                                                 |

## 9.2 Feature B - Multi-Vendor Consolidated

| **Step** | **Actor** | **Action**                                                                                                                                                                                                                                             |
| -------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1        | Admin     | On EIndex, clicks multi-vendor button → CreateMutiVenSEst() JS fires                                                                                                                                                                                   |
| 2        | Browser   | AJAX GET: MgtVendorInvoice/GetAllVendorsEstimate → populates #ModalMultipleVendorEstimate                                                                                                                                                              |
| 3        | Admin     | Selects vendors → OK                                                                                                                                                                                                                                   |
| 4        | Browser   | GET /MgtVendorEstimateToCustomerEstimate/CreateMultipleVenOption?JobKey=...&InvKey\[\]=...&InvKey\[\]=...                                                                                                                                              |
| 5        | Server    | Reads each vendor's estimate, builds model.MultipleObj (one entry per vendor, all sharing same InvoiceKey), renders CreateMultipleVenOption.cshtml                                                                                                     |
| 6        | Browser   | Per vendor: AJAX GET LoadTheEstimateGridStuff → markup engine returns customer-priced lines for that vendor                                                                                                                                            |
| 7        | Admin     | Reviews all vendors' lines in combined view, enters deposit info → clicks Save                                                                                                                                                                         |
| 8        | Browser   | AJAX POST to SaveCreateNewEstimateFromMultipleVendor with merged line items + VendorEstimateKeyList                                                                                                                                                    |
| 9        | Server    | Archives old estimate → merges all vendor lines → saves ONE JobSalesInvoice+Detail → per-vendor loop: updates VendorEstimate.Status=2 + siblings + inserts JobSalesOrderToVEstimate per vendor → handles deposit → sends approval emails → returns "1" |
| 10       | Browser   | Redirects to PreviewEstimates/{InvoiceKey}?id1=2 or EmailEstimateToCustomer/{InvoiceKey}                                                                                                                                                               |

# 10\. Glossary

| **Term**                         | **Definition**                                                                                                                                  |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| VendorEstimate                   | Cost estimate submitted by a vendor through the Vendor Portal                                                                                   |
| JobSalesInvoice                  | Customer-facing document (estimate or invoice) created from vendor data                                                                         |
| MultipleChoiceEstimate (bit)     | Marks a JobSalesInvoice as one of several options in a multi-option estimate (Feature A)                                                        |
| MutiEstiIdentifier               | Shared GUID linking all option rows in a multi-option estimate set (Feature A)                                                                  |
| JobSalesOrderToVEstimate         | Join table: links one or more VendorEstimates to a single combined customer JobSalesInvoice (Feature B only)                                    |
| MCEstimate                       | Integer sequence number within a multi-option set (1, 2, 3...)                                                                                  |
| VennCusMultiple                  | Model: one option in a multi-option estimate - has Sequence, title, InvoiceKey, and ItemList of line items                                      |
| VendorDepositClass               | Model: per-vendor deposit amount (VendorKey, JobVendorKey, DepositAmount)                                                                       |
| VendorDepositOverride            | Model: override justification when deposit deviates from recommended 35% guideline                                                              |
| SVC Manager                      | Service Manager - identified via EmailSendToAddress.SendToType==38; auto-approves deposits if currently logged in                               |
| DNE                              | Do Not Exceed - vendor billing cap (client-side only in V1; must be server-validated in V2)                                                     |
| GlobalClass.GlobalSales          | Static process-wide scratch List in V1 - critical anti-pattern, DO NOT replicate in V2                                                          |
| RCSdbEntities                    | Entity Framework DbContext in V1 Admin Portal. V2 should use scoped DI-injected DbContext.                                                      |
| sentToCustomer                   | Flag computed from RemoveTheOldSalesInvoice indicating the estimate was already emailed - drives SetNotNeededItems and change-tracking behavior |
| SaveTheApprovalRequestForDeposit | The single deposit-approval gate function; called by all three Save\* actions when deposit amounts exist                                        |

_End of Document | Source: ATLAS Admin Portal V1 Vendor Bills Tab + ProjectRCS | July 2026_