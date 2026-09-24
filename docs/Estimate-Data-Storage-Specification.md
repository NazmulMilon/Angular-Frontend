# Vendor Estimate Data Storage Specification
## For Legacy and V2 Compatibility

This document defines all data values, structures, and storage requirements for creating vendor estimates that are compatible with both the legacy system (ProjectRCS) and the new AdminPortal V2.

---

## Table of Contents
1. [Overview](#overview)
2. [Database Tables](#database-tables)
3. [Data Flow](#data-flow)
4. [API Request/Response Formats](#api-requestresponse-formats)
5. [Field Specifications](#field-specifications)
6. [Business Rules](#business-rules)
7. [Legacy Compatibility Requirements](#legacy-compatibility-requirements)

---

## Overview

When creating a vendor estimate, data is stored across **three primary tables**:

1. **VendorEstimate** - Main estimate header record
2. **VendorEstimateDetail** - Material and trip charge line items
3. **VendorEstimateDetail1** - Labor line items

Additionally, related data is stored/updated in:
- **JobBillVendorUploads** - File attachments
- **JobActionNeeded** - Action items (deleted when estimate created)
- **Job messaging/notes** - Audit trail

---

## Database Tables

### 1. VendorEstimate (Main Header)

**Table Name:** `VendorEstimate`

**Primary Key:** `InvoiceKey` (GUID)

#### Complete Field List

| Field Name | Data Type | Nullable | Description | Required for Save | Default/Computed Value |
|------------|-----------|----------|-------------|-------------------|------------------------|
| `InvoiceKey` | GUID | No | Primary key, unique identifier for estimate | Yes | `Guid.NewGuid()` |
| `InvoiceNo` | string | Yes | Sequential invoice number | Yes | Auto-generated via `GetInvoiceNoForInvoice()` |
| `VendorKey` | GUID | Yes | Foreign key to Vendor table | Yes | From input parameter |
| `JobKey` | GUID | Yes | Foreign key to Job table | Yes | From input parameter |
| `InvoiceDate` | DateTime | Yes | Date estimate was created | Yes | `DateTime.UtcNow` |
| `AddedBy` | string | Yes | Who created the estimate | Yes | `"From Email without login"` (legacy) |
| `AddedOn` | DateTime | Yes | Timestamp when created | Yes | `UtilityTasks.ConvertToUtc(EnteredDate.Value)` |
| `Remarks` | string | Yes | General remarks | No | `""` (empty string) |
| `ApprovedBy` | string | Yes | Who approved the estimate | Yes | `"--"` (default) |
| `IsApproved` | bool | Yes | Approval status | Yes | `false` |
| `IsCancelled` | bool | Yes | Cancellation status | Yes | `false` |
| `IsNew` | bool | Yes | New estimate flag | Yes | `true` |
| `IsSeen` | bool | Yes | Has been viewed flag | Yes | `false` |
| `Status` | int | Yes | Estimate status code | Yes | `4` (pending) |
| `MultipleChoiceEstimate` | bool | Yes | Is this part of multiple options | Yes | `false` |
| `MCEstimate` | int | Yes | Multiple choice option number | Yes | `0` |
| `MutiEstiIdentifier` | GUID | Yes | Groups multiple estimate options | Yes | Same as `InvoiceKey` |
| `CompanyKey` | GUID | Yes | Company identifier | Yes | `Guid.Parse("906017B5-F9FC-4904-8899-8AECE544518C")` |
| `OtherRemark` | string | Yes | Additional remarks | Yes | `"--"` (default) |
| `OtherDate` | DateTime | Yes | Additional date field | No | `null` |
| `IsEdited` | bool | Yes | Has been edited | No | `null` |
| `EditedByVendor` | bool | Yes | Edited by vendor flag | No | `null` |
| `IsDelete` | bool | Yes | Soft delete flag | No | `null` |
| `DeletedOn` | DateTime | Yes | When deleted | No | `null` |
| `DeletedBy` | GUID | Yes | Who deleted | No | `null` |
| `DeletedFor` | string | Yes | Reason for deletion | No | `null` |
| `AdminKey` | GUID | Yes | Admin who created | No | `null` |
| `EstimateTitle` | string | Yes | Title for multiple choice estimates | No | `null` |
| `CustomerEstimateRemark` | string | Yes | Customer-facing remarks | No | `null` |
| `DeclineEstimateDuringApprove` | bool | Yes | Declined flag | No | `null` |
| `KeepVendorActive` | bool | Yes | Keep vendor after decline | No | `null` |
| `OriginalDNE` | decimal | Yes | Original Do Not Exceed amount | No | `null` |
| `ApprovedCompleted` | decimal | Yes | Approved completion amount | No | `null` |
| `ChangeOrder` | decimal | Yes | Change order amount | No | `null` |
| `ChangerOrder` | bool | Yes | Is change order | No | `null` |
| `ToRemoveVendorIsDefault` | bool | Yes | Remove default vendor flag | No | `null` |
| `SetDefaultVendor` | GUID | Yes | New default vendor | No | `null` |
| `Isdeposit` | bool | Yes | Has deposit | No | `null` |
| `DepositAmount` | decimal | Yes | Deposit amount | No | `null` |
| `CreatedInvoiceForIncurredAfterDeclined` | bool | Yes | Invoice after decline flag | No | `null` |
| `OnsiteApproval` | bool | Yes | Onsite approval flag | No | `null` |

#### Required Fields Summary for V2 API

```json
{
  "InvoiceKey": "GUID (new)",
  "InvoiceNo": "string (auto-generated)",
  "VendorKey": "GUID (required)",
  "JobKey": "GUID (required)",
  "InvoiceDate": "DateTime (UTC now)",
  "AddedBy": "string (default: 'From Email without login')",
  "AddedOn": "DateTime (UTC converted from EnteredDate)",
  "Remarks": "string (default: '')",
  "ApprovedBy": "string (default: '--')",
  "IsApproved": false,
  "IsCancelled": false,
  "IsNew": true,
  "IsSeen": false,
  "Status": 4,
  "MultipleChoiceEstimate": false,
  "MCEstimate": 0,
  "MutiEstiIdentifier": "GUID (same as InvoiceKey)",
  "CompanyKey": "906017B5-F9FC-4904-8899-8AECE544518C",
  "OtherRemark": "string (default: '--')"
}
```

---

### 2. VendorEstimateDetail (Materials & Trip Charges)

**Table Name:** `VendorEstimateDetail`

**Primary Key:** `DetailKey` (GUID)

**Foreign Key:** `InvoiceKey` → `VendorEstimate.InvoiceKey`

#### Complete Field List

| Field Name | Data Type | Nullable | Description | Required for Save | Computed From |
|------------|-----------|----------|-------------|-------------------|---------------|
| `DetailKey` | GUID | No | Primary key | Yes | `Guid.NewGuid()` |
| `InvoiceKey` | GUID | No | FK to VendorEstimate | Yes | Parent `InvoiceKey` |
| `ItemName` | string | Yes | Type of charge | Yes | `ChargeTypeKey` from detail list |
| `Amount` | decimal | Yes | Rate per unit | Yes | `Rate` from detail list (formatted to 2 decimals) |
| `Qty` | decimal | Yes | Quantity | Yes | `Qty` from detail list (formatted to 2 decimals) |
| `Description` | string | Yes | Rich text description | Yes | `Description` from detail list |
| `CostIncurred` | int | Yes | 0=Proposed, 1=Incurred | Yes | `CostIncurred` from detail list |
| `DisplayLevel` | int | Yes | Visibility level | Yes | `Display` from detail list |
| `MarkAsIncurredCmt` | string | Yes | Incurred comment | No | `null` |
| `MarkNotNeededCmt` | string | Yes | Not needed comment | No | `null` |
| `MarkAsProposed` | string | Yes | Proposed comment | No | `null` |
| `NewLineAddedAfterEdit` | string | Yes | Edit flag | No | `null` |
| `LineItemTitle` | string | Yes | Line item title | No | `null` |
| `ApprovedByCustomer` | int | Yes | Customer approval flag | No | `null` |

#### Required Fields Summary for V2 API

```json
{
  "DetailKey": "GUID (new)",
  "InvoiceKey": "GUID (from parent estimate)",
  "ItemName": "string (e.g., 'Trip Charge', 'MATERIALS')",
  "Amount": "decimal (formatted: {0:0.00})",
  "Qty": "decimal (formatted: {0:0.00})",
  "Description": "string (rich text/HTML)",
  "CostIncurred": "int (0 or 1)",
  "DisplayLevel": "int"
}
```

#### Common ItemName Values

- `"Trip Charge"` - Standard trip charge
- `"MATERIALS"` - Material line items

---

### 3. VendorEstimateDetail1 (Labor Charges)

**Table Name:** `VendorEstimateDetail1`

**Primary Key:** `LaborKey` (GUID)

**Foreign Key:** `InvoiceKey` → `VendorEstimate.InvoiceKey`

#### Complete Field List

| Field Name | Data Type | Nullable | Description | Required for Save | Computed From |
|------------|-----------|----------|-------------|-------------------|---------------|
| `LaborKey` | GUID | No | Primary key | Yes | `Guid.NewGuid()` |
| `InvoiceKey` | GUID | Yes | FK to VendorEstimate | Yes | Parent `InvoiceKey` |
| `ItemName` | string | Yes | Type of labor | Yes | `ChargeTypeKey` from detail list |
| `TechOnSite` | int | Yes | Number of technicians | Yes | `tech` from detail list (converted to int) |
| `LaborHr` | decimal | Yes | Hours worked | Yes | `hour` from detail list (rounded to 2 decimals) |
| `LaborRate` | decimal | Yes | Hourly rate | Yes | `Rate` from detail list (rounded to 2 decimals) |
| `WorkDescription` | string | Yes | Rich text work description | Yes | `Description` from detail list |
| `CostIncurred` | int | Yes | 0=Proposed, 1=Incurred | Yes | `CostIncurred` from detail list |
| `DisplayLevel` | int | Yes | Visibility level | Yes | `Display` from detail list |
| `MarkAsIncurredCmt` | string | Yes | Incurred comment | No | `null` |
| `MarkNotNeededCmt` | string | Yes | Not needed comment | No | `null` |
| `MarkAsProposed` | string | Yes | Proposed comment | No | `null` |
| `NewLineAddedAfterEdit` | string | Yes | Edit flag | No | `null` |
| `LineItemTitle` | string | Yes | Line item title | No | `null` |
| `ApprovedByCustomer` | int | Yes | Customer approval flag | No | `null` |

#### Required Fields Summary for V2 API

```json
{
  "LaborKey": "GUID (new)",
  "InvoiceKey": "GUID (from parent estimate)",
  "ItemName": "string (labor type)",
  "TechOnSite": "int (number of techs)",
  "LaborHr": "decimal (hours, rounded to 2 decimals)",
  "LaborRate": "decimal (rate, rounded to 2 decimals)",
  "WorkDescription": "string (rich text/HTML)",
  "CostIncurred": "int (0 or 1)",
  "DisplayLevel": "int"
}
```

#### Common ItemName Values

- `"Standard Hourly Rate"` - Regular hours main tech
- `"Overtime/ Weekend Hourly Rate"` - After hours main tech
- `"Helper Standard Hourly Rate"` - Regular hours helper
- `"Helper Overtime/ Weekend Hourly Rate"` - After hours helper

---

### 4. JobBillVendorUploads (File Attachments)

**Table Name:** `JobBillVendorUploads`

**Primary Key:** `UploadKey` (GUID)

#### Complete Field List

| Field Name | Data Type | Nullable | Description | Required for Save | Computed From |
|------------|-----------|----------|-------------|-------------------|---------------|
| `UploadKey` | GUID | No | Primary key | Yes | `Guid.NewGuid()` |
| `JobKey` | GUID | Yes | FK to Job | Yes | From parameter |
| `VendorKey` | GUID | Yes | FK to Vendor | Yes | From parameter |
| `UploadDate` | DateTime | Yes | Upload timestamp | Yes | `UtilityTasks.ConvertToUtc(EnteredDate.Value)` |
| `DocumentTypeKey` | GUID | Yes | Type of document | Yes | Document category GUID |
| `FileType` | string | Yes | MIME type | Yes | `item.ContentType` |
| `FileName` | string | Yes | Original filename | Yes | `item.FileName` |
| `Remark` | string | Yes | Sanitized filename | Yes | Filename with special chars replaced |
| `IsFileNew` | bool | Yes | New file flag | Yes | `true` |

#### Document Type GUIDs

```csharp
// Vendor Estimate Documents
Guid.Parse("13BAB6D2-30C1-4A7A-8BA1-5F2F85A5748E")

// Sign-off Sheets
Guid.Parse("9D3B736E-4A29-43BE-881A-B84FF7A11897")

// Job Pictures
Guid.Parse("8B63828A-2645-4767-9377-150F3687E471")
```

#### File Storage
- **Physical Storage:** Azure Blob Storage
- **Method:** `SaveJobBillVendorUploads(JobKey, UploadKey, byte[] data, FileName, FileType)`
- **Metadata:** Stored in `JobBillVendorUploads` table
- **Filename Sanitization:** Replace spaces, #, /, \\ with underscores

---

## Data Flow

### 1. Frontend Data Collection

**JavaScript Object Structure** (from `VEcreate.js`):

```javascript
var customers = new Array();
$("#finalBody > tr").each(function () {
    var row = $(this);
    var charge = $(this).attr('id');
    var customer = {};
    customer.ChargeTypeKey = charge;                        // ItemName
    customer.ItemName = row.find("td").eq(0).html();        // Display name
    customer.CostIncurred = row.find("td").eq(0).attr('id'); // 0 or 1
    customer.Description = row.find("td").eq(1).html();     // Rich text
    customer.Display = row.find("td").eq(1).attr('id');     // Display level
    customer.Rate = row.find("td").eq(2).html();            // Rate or LaborRate
    customer.hour = row.find("td").eq(2).attr('id');        // LaborHr (for labor only)
    customer.Qty = row.find("td").eq(3).html();             // Qty or TechOnSite
    customer.Labor = row.find("td").eq(3).attr('id');       // "labor" or null
    customer.Total = row.find("td").eq(4).html();           // Calculated total
    customer.tech = row.find("td").eq(4).attr('id');        // TechOnSite (for labor)
    customers.push(customer);
});
```

### 2. API Request Format

**Endpoint:** `POST /MdtVendorEstimateNew/SaveCreateNewEstimate`

**Content-Type:** `application/json; charset=utf-8`

**Request Body:**

```json
{
  "JobKey": "GUID",
  "VendorKey": "GUID",
  "VendorEstimateKey": "GUID",
  "EnteredDate": "DateTime (string)",
  "DetailList": [
    {
      "DetailKey": "string (optional)",
      "ChargeTypeKey": "string (ItemName)",
      "ItemName": "string (display name)",
      "CostIncurred": "int (0 or 1)",
      "Description": "string (HTML)",
      "Display": "int (display level)",
      "Rate": "decimal",
      "hour": "decimal (nullable, labor only)",
      "Qty": "decimal (nullable)",
      "Labor": "string ('labor' or null)",
      "Total": "decimal",
      "tech": "decimal (nullable, labor only)"
    }
  ]
}
```

### 3. Backend Processing

**Controller:** `MdtVendorEstimateNewController.SaveCreateNewEstimate`

**Helper:** `ManageVendorEstimates.SaveCreateNewEstimate`

**Processing Steps:**

1. Create `VendorEstimate` header record
2. Loop through `DetailList`:
   - If `item.Labor == "labor"`: Create `VendorEstimateDetail1` record
   - Else: Create `VendorEstimateDetail` record
3. Remove related `JobActionNeeded` records (ActionID: 1, 21, 71)
4. Create audit log entry via `ManageJobMessegingSetup.SaveGeneralNotewithDB`
5. Return success response with new `InvoiceKey`

### 4. API Response Format

```json
{
  "flag": 1,
  "mess": "Estimate is saving Please wait...",
  "key": "GUID (new InvoiceKey)"
}
```

---

## Field Specifications

### VendorEstDetail Model (Input DTO)

**Class:** `ProjectRCS.Models.VendorEstDetail`

```csharp
public class VendorEstDetail
{
    public string DetailKey { get; set; }        // Optional, not used in save
    public string ChargeTypeKey { get; set; }    // Maps to ItemName
    public string ItemName { get; set; }         // Display name (not saved)
    public int? CostIncurred { get; set; }       // 0 = Proposed, 1 = Incurred
    public string Description { get; set; }      // Rich text description
    public int? Display { get; set; }            // DisplayLevel
    public decimal? Rate { get; set; }           // Amount or LaborRate
    public decimal? hour { get; set; }           // LaborHr (labor only)
    public decimal? Qty { get; set; }            // Quantity (materials/trip)
    public string Labor { get; set; }            // "labor" or null
    public decimal? Total { get; set; }          // Not saved, for display only
    public decimal? tech { get; set; }           // TechOnSite (labor only)
}
```

### Field Mapping

#### For Materials/Trip Charges (`Labor == null`)

| Input Field | Maps To DB Field | Transformation |
|-------------|------------------|----------------|
| `ChargeTypeKey` | `ItemName` | Direct copy |
| `Rate` | `Amount` | `Convert.ToDecimal(string.Format("{0:0.00}", item.Rate))` |
| `Qty` | `Qty` | `Convert.ToDecimal(string.Format("{0:0.00}", item.Qty))` |
| `Description` | `Description` | Direct copy |
| `CostIncurred` | `CostIncurred` | `Convert.ToInt32(item.CostIncurred)` |
| `Display` | `DisplayLevel` | Direct copy |

#### For Labor Charges (`Labor == "labor"`)

| Input Field | Maps To DB Field | Transformation |
|-------------|------------------|----------------|
| `ChargeTypeKey` | `ItemName` | Direct copy |
| `tech` | `TechOnSite` | `Convert.ToInt32(item.tech)` |
| `hour` | `LaborHr` | `Math.Round(item.hour ?? 0m, 2)` |
| `Rate` | `LaborRate` | `Math.Round(item.Rate ?? 0m, 2)` |
| `Description` | `WorkDescription` | Direct copy |
| `CostIncurred` | `CostIncurred` | `Convert.ToInt32(item.CostIncurred)` |
| `Display` | `DisplayLevel` | Direct copy |

---

## Business Rules

### 1. Invoice Number Generation

**Method:** `GetInvoiceNoForInvoice()`

```csharp
public string GetInvoiceNoForInvoice()
{
    var chlist = from x in db.VendorEstimate select x;
    int chch = chlist.Count();
    return CreateIDInvoice(chch);
}

public string CreateIDInvoice(int x)
{
    x++;
    string inv = (x).ToString();
    for (; ; )
    {
        var chlist = from z in db.VendorEstimate where z.InvoiceNo == inv select z;
        if (chlist.Count() > 0) { x++; inv = (x).ToString(); }
        else { inv = (x).ToString(); break; }
    }
    return inv;
}
```

**Logic:**
- Get count of all estimates
- Increment by 1
- Check for uniqueness
- If duplicate exists, increment again
- Return sequential string number

### 2. Status Codes

| Status | Meaning |
|--------|---------|
| `2` | Auto-created on ETA set |
| `4` | Pending approval (manually created) |

### 3. Cost Incurred Flag

| Value | Meaning |
|-------|---------|
| `0` | Proposed cost (not yet incurred) |
| `1` | Incurred cost (already spent) |

### 4. Display Level

Determines visibility of line items in customer-facing estimates.

### 5. Action Items Cleanup

When estimate is created, remove these action items:

```csharp
var estaction = bc.JobActionNeeded.Where(m => 
    (m.ActionID == 1 || m.ActionID == 21 || m.ActionID == 71) 
    && m.JobKey == model.JobKey 
    && m.VendorKey == model.VendorKey
);
if (estaction.Count() > 0)
{
    bc.JobActionNeeded.RemoveRange(estaction);
}
```

**ActionID Meanings:**
- `1` - Estimate needed
- `21` - Estimate related action
- `71` - Estimate related action

### 6. Audit Logging

**Method:** `ManageJobMessegingSetup.SaveGeneralNotewithDB`

```csharp
DataReturn dsa = sa.SaveGeneralNotewithDB(
    (Guid)JobKey,
    "Created Estimate", 
    "Admin has submitted Vendor estimate for : " + vendor.Vname + ". " + 
    ic.CreateInlineVendorEstimate(model.InvoiceKey, bc),
    bc
);
```

**Purpose:** Creates internal note/audit trail with inline HTML representation of estimate

---

## Legacy Compatibility Requirements

### 1. Required Default Values

To maintain compatibility with legacy code that expects specific default values:

```csharp
// VendorEstimate defaults
AddedBy = "From Email without login"  // Legacy expects this exact string
ApprovedBy = "--"                      // Legacy expects this default
OtherRemark = "--"                     // Legacy expects this default
Remarks = ""                           // Empty string, not null
Status = 4                             // Pending status for manual creation
CompanyKey = Guid.Parse("906017B5-F9FC-4904-8899-8AECE544518C")  // Fixed company
```

### 2. DateTime Handling

**Always use UTC:**

```csharp
InvoiceDate = DateTime.UtcNow
AddedOn = UtilityTasks.ConvertToUtc(EnteredDate.Value)
UploadDate = UtilityTasks.ConvertToUtc(EnteredDate.Value)
```

**Reason:** Legacy system stores all dates in UTC and converts based on user timezone

### 3. GUID Constants

**Emergency Job Type:**
```csharp
Guid.Parse("fc078fd5-5ddc-4088-8a9f-d982436e20fd")
```

**Archive Status:**
```csharp
Guid.Parse("467C4FCA-AC58-479A-9B55-909B5A4BE93B")
```

**Company Key:**
```csharp
Guid.Parse("906017B5-F9FC-4904-8899-8AECE544518C")
```

**Document Type Keys:**
```csharp
// Estimate Documents
Guid.Parse("13BAB6D2-30C1-4A7A-8BA1-5F2F85A5748E")

// Sign-off Sheets
Guid.Parse("9D3B736E-4A29-43BE-881A-B84FF7A11897")

// Job Pictures
Guid.Parse("8B63828A-2645-4767-9377-150F3687E471")
```

### 4. Decimal Formatting

**Materials/Trip:**
```csharp
Amount = Convert.ToDecimal(string.Format("{0:0.00}", item.Rate))
Qty = Convert.ToDecimal(string.Format("{0:0.00}", item.Qty))
```

**Labor:**
```csharp
LaborHr = Math.Round(item.hour ?? 0m, 2)
LaborRate = Math.Round(item.Rate ?? 0m, 2)
```

**Reason:** Ensures consistent 2-decimal precision across legacy and V2

### 5. Rich Text/HTML Storage

**Both systems store HTML in Description/WorkDescription fields:**
- Legacy uses Summernote editor
- V2 should preserve HTML tags and structure
- No sanitization is performed (trusted input)

### 6. File Upload Handling

**Filename Sanitization:**
```csharp
asd.Remark = ((((item.FileName.Trim())
    .Replace(" ", ""))
    .Replace("#", "_"))
    .Replace("/", "_"))
    .Replace("\\", "_");
```

**Reason:** Legacy expects sanitized filenames in Remark field

---

## V2 Implementation Checklist

### Required for Basic Compatibility

- [ ] Use exact GUID constants (Company, DocumentTypes, etc.)
- [ ] Set default values correctly (AddedBy, ApprovedBy, OtherRemark, Status)
- [ ] Convert all dates to UTC before storage
- [ ] Format decimals to 2 places consistently
- [ ] Generate sequential InvoiceNo using existing estimates count
- [ ] Distinguish between labor and material items using `Labor` field
- [ ] Store labor in `VendorEstimateDetail1` table
- [ ] Store materials/trip in `VendorEstimateDetail` table
- [ ] Create GUIDs for all primary keys (InvoiceKey, DetailKey, LaborKey)
- [ ] Set `MutiEstiIdentifier` equal to `InvoiceKey` for single estimates

### Required for Full Feature Parity

- [ ] Remove JobActionNeeded items with ActionID 1, 21, 71 after estimate creation
- [ ] Create audit log entry via ManageJobMessegingSetup
- [ ] Support file uploads to Azure Blob Storage
- [ ] Store file metadata in JobBillVendorUploads
- [ ] Sanitize uploaded filenames correctly
- [ ] Handle three document categories (Estimate docs, Sign-offs, Pictures)
- [ ] Return new InvoiceKey in response for subsequent operations
- [ ] Support both "Customer" and "Vendor" approval paths

### Optional for Extended Compatibility

- [ ] Implement invoice HTML generation (InvoiceCreator.CreateInlineVendorEstimate)
- [ ] Support multiple choice estimates (MultipleChoiceEstimate flag)
- [ ] Handle estimate editing (IsEdited, EditedByVendor flags)
- [ ] Support soft delete (IsDelete, DeletedOn, DeletedBy)
- [ ] Implement customer approval workflow (ApprovedByCustomer field)
- [ ] Track change orders (ChangeOrder, ChangerOrder fields)
- [ ] Support deposit handling (Isdeposit, DepositAmount)

---

## Example: Complete V2 API Implementation

### Request Example

```json
POST /api/v2/vendor-estimates
Content-Type: application/json

{
  "jobKey": "12345678-1234-1234-1234-123456789012",
  "vendorKey": "87654321-4321-4321-4321-210987654321",
  "enteredDate": "2026-06-29T20:00:00",
  "lineItems": [
    {
      "itemName": "Trip Charge",
      "costIncurred": 0,
      "description": "Standard trip charge for service call",
      "displayLevel": 1,
      "rate": 125.00,
      "qty": 1.00,
      "isLabor": false
    },
    {
      "itemName": "Standard Hourly Rate",
      "costIncurred": 0,
      "description": "<p>Replace faulty electrical outlet</p>",
      "displayLevel": 1,
      "laborRate": 95.00,
      "laborHours": 2.5,
      "techOnSite": 1,
      "isLabor": true
    },
    {
      "itemName": "MATERIALS",
      "costIncurred": 0,
      "description": "<p>GFCI outlet, wire nuts, electrical tape</p>",
      "displayLevel": 1,
      "rate": 45.75,
      "qty": 1.00,
      "isLabor": false
    }
  ]
}
```

### Response Example

```json
{
  "success": true,
  "message": "Estimate created successfully",
  "data": {
    "invoiceKey": "ABCDEF12-ABCD-ABCD-ABCD-123456789ABC",
    "invoiceNo": "10523",
    "status": 4,
    "totalAmount": 408.25,
    "lineItemCount": 3
  }
}
```

### Backend Save Logic (Pseudocode)

```csharp
public async Task<IActionResult> CreateVendorEstimate(CreateEstimateRequest request)
{
    // 1. Create main estimate record
    var estimate = new VendorEstimate
    {
        InvoiceKey = Guid.NewGuid(),
        InvoiceNo = GetNextInvoiceNumber(),
        VendorKey = request.VendorKey,
        JobKey = request.JobKey,
        InvoiceDate = DateTime.UtcNow,
        AddedBy = "From Email without login",
        AddedOn = ConvertToUtc(request.EnteredDate),
        Remarks = "",
        IsApproved = false,
        IsCancelled = false,
        IsNew = true,
        IsSeen = false,
        Status = 4,
        MultipleChoiceEstimate = false,
        MCEstimate = 0,
        MutiEstiIdentifier = /* same as InvoiceKey */,
        ApprovedBy = "--",
        OtherRemark = "--",
        CompanyKey = Guid.Parse("906017B5-F9FC-4904-8899-8AECE544518C")
    };
    estimate.MutiEstiIdentifier = estimate.InvoiceKey;
    
    await _context.VendorEstimate.AddAsync(estimate);
    await _context.SaveChangesAsync();
    
    // 2. Process line items
    foreach (var item in request.LineItems)
    {
        if (item.IsLabor)
        {
            // Labor item
            var labor = new VendorEstimateDetail1
            {
                LaborKey = Guid.NewGuid(),
                InvoiceKey = estimate.InvoiceKey,
                ItemName = item.ItemName,
                TechOnSite = item.TechOnSite,
                LaborHr = Math.Round(item.LaborHours, 2),
                LaborRate = Math.Round(item.LaborRate, 2),
                WorkDescription = item.Description,
                CostIncurred = item.CostIncurred,
                DisplayLevel = item.DisplayLevel
            };
            await _context.VendorEstimateDetail1.AddAsync(labor);
        }
        else
        {
            // Material/Trip item
            var detail = new VendorEstimateDetail
            {
                DetailKey = Guid.NewGuid(),
                InvoiceKey = estimate.InvoiceKey,
                ItemName = item.ItemName,
                Amount = Math.Round(item.Rate, 2),
                Qty = Math.Round(item.Qty, 2),
                Description = item.Description,
                CostIncurred = item.CostIncurred,
                DisplayLevel = item.DisplayLevel
            };
            await _context.VendorEstimateDetail.AddAsync(detail);
        }
    }
    
    // 3. Remove action items
    var actionItems = await _context.JobActionNeeded
        .Where(a => (a.ActionID == 1 || a.ActionID == 21 || a.ActionID == 71)
                 && a.JobKey == request.JobKey
                 && a.VendorKey == request.VendorKey)
        .ToListAsync();
    _context.JobActionNeeded.RemoveRange(actionItems);
    
    // 4. Create audit log
    await CreateAuditLog(request.JobKey, estimate.InvoiceKey, vendorName);
    
    // 5. Save all changes
    await _context.SaveChangesAsync();
    
    // 6. Return response
    return Ok(new {
        success = true,
        message = "Estimate created successfully",
        data = new {
            invoiceKey = estimate.InvoiceKey,
            invoiceNo = estimate.InvoiceNo,
            status = estimate.Status
        }
    });
}
```

---

## Summary

This specification provides all necessary data structures, field mappings, business rules, and compatibility requirements to implement vendor estimate creation in AdminPortal V2 while maintaining full compatibility with the legacy ProjectRCS system.

**Key Takeaways:**

1. **Three main tables:** VendorEstimate (header), VendorEstimateDetail (materials/trip), VendorEstimateDetail1 (labor)
2. **Critical defaults:** AddedBy, ApprovedBy, OtherRemark, Status=4, Company GUID
3. **Always UTC:** All DateTime values must be in UTC
4. **Decimal precision:** 2 decimal places for all monetary and quantity values
5. **GUID generation:** Use `Guid.NewGuid()` for all primary keys
6. **Labor distinction:** Check `Labor == "labor"` to route to correct table
7. **Action cleanup:** Remove ActionID 1, 21, 71 from JobActionNeeded
8. **Audit trail:** Create internal note with estimate details

By following this specification, V2 can create estimates that are fully compatible with legacy system views, reports, approval workflows, and all downstream processes.
