# Radio Option to Email Workflow Mapping

## Overview

This document maps each radio button option in the Additional Approval modal to the correct email workflow, including invoice types, pre-flight checks, and email templates.

**Date**: July 1, 2026  
**Status**: ✅ Synced with Backend Specification

---

## Radio Button Options

### Option 1: Set Return ETA
```typescript
{
  value: 1,
  label: 'Send additional approval with "Set Return ETA" buttons',
  description: 'Vendor will set a return visit date',
  invoiceType: 9
}
```

**Workflow**:
1. ✅ No pre-flight checks required
2. ✅ Send button enabled immediately
3. ✅ Saves approval with `fifthApprovalOption: 1`
4. ✅ Backend returns `invoiceType: 9`
5. ✅ Email compose loads with InvoiceType 9 template
6. ✅ Email sent to vendor with "Set Return ETA" buttons

**Email Template**: Template ID 40 ("Just Send" template)

---

### Option 2: Checkout
```typescript
{
  value: 2,
  label: 'Send additional approval with check-out button',
  description: 'Vendor can check out and create estimate',
  invoiceType: 3
}
```

**Workflow**:
1. ✅ **Pre-flight check required**: `check-before-checkout`
2. ⚠️ If vendor not checked in: Show check-in form
3. ✅ After check-in complete: Enable send button
4. ✅ Saves approval with `fifthApprovalOption: 2`
5. ✅ Backend returns `invoiceType: 3`
6. ✅ Email compose loads with InvoiceType 3 template
7. ✅ Email sent to vendor with check-out button

**Email Template**: Template ID 12 (Default approval template)

**Check-In Requirements**:
- Tech count (default: 1)
- Check-in date/time
- Optional notes

---

### Option 4: Create Invoice
```typescript
{
  value: 4,
  label: 'Send additional approval with "CREATE INVOICE" Button',
  description: 'Vendor will create and submit invoice',
  invoiceType: 10
}
```

**Workflow**:
1. ✅ **Pre-flight check required**: `check-before-create-invoice`
2. ⚠️ If vendor not checked out: Show check-out form
3. ⚠️ If vendor not checked in: Show check-in form first
4. ✅ After check-out complete: Enable send button
5. ✅ Saves approval with `fifthApprovalOption: 4`
6. ✅ Backend returns `invoiceType: 10`
7. ✅ Email compose loads with InvoiceType 10 template
8. ✅ Email sent to vendor with "Create Invoice" button
9. 🔄 **Job status updates to "Complete" after email sent**

**Email Template**: Template ID 7 (Create Invoice template)

**Check-Out Requirements**:
- Check-out date/time
- Work performed (REQUIRED)
- Optional notes

**Side Effect**: Job status level changes to 6 (Complete)

---

### Option 5: Save and Close
```typescript
{
  value: 5,
  label: 'Save approved vendor amount and Close (email will NOT be sent)',
  description: 'No email sent - just saves the approval',
  invoiceType: 5
}
```

**Workflow**:
1. ✅ No pre-flight checks required
2. ✅ Send button enabled immediately (labeled "Save")
3. ✅ Saves approval with `fifthApprovalOption: 5`
4. ✅ Backend returns `requiresEmail: false`
5. ❌ **No email compose screen shown**
6. ✅ Modal closes, page refreshes
7. ✅ Success message: "Approval saved successfully"

**Email Template**: None - no email sent

---

## API Request/Response Flow

### Step 1: Save Approval Data

**Endpoint**: `POST /api/v1/admin/on-site-approval/save-vendor-approval-data`

**Request Body**:
```json
{
  "jobKey": "guid",
  "vendorKey": "guid",
  "estimateKey": "guid",
  "fifthApprovalOption": 1,  // Maps to option value
  "approvalText": "Plain text approval message"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Vendor approval data saved successfully",
  "workOrderKey": "guid",
  "invoiceType": 9,  // Maps to email template
  "requiresEmail": true
}
```

### Step 2: Load Email Compose (if requiresEmail = true)

**Endpoint**: `GET /api/v1/admin/work-order/email-work-order-to-vendor/{workOrderKey}`

**Query Params**:
- `invoiceType`: From previous response
- `jobStatusTrigger`: Always 0 for this workflow

**Response**:
```json
{
  "workOrderKey": "guid",
  "jobKey": "guid",
  "vendorKey": "guid",
  "invoiceType": 9,
  "jobStatusTrigger": 0,
  "jobPO": "PO-12345",
  "emailBody": "Email template HTML (will be stripped to plain text)",
  "jobDefaultContactKey": "guid",
  "vendorContactList": [...]
}
```

### Step 3: Send Email

**Endpoint**: `POST /api/v1/admin/work-order/email-work-order-to-vendor`

**Request Body**:
```json
{
  "workOrderKey": "guid",
  "jobKey": "guid",
  "vendorKey": "guid",
  "invoiceType": 9,
  "jobStatusTrigger": 0,
  "recipientEmails": ["vendor1@example.com", "vendor2@example.com"],
  "emailBody": "Plain text email content",
  "attachedFileKeys": [],
  "useAdminEmail": true
}
```

**Response**:
```json
{
  "success": true,
  "message": "Work order email sent to 2 recipient(s)",
  "emailsSent": 2,
  "jobStatusUpdated": false,
  "newJobStatus": null
}
```

---

## Invoice Type to Template Mapping

| Invoice Type | Template ID | Template Name | Used By Option |
|--------------|-------------|---------------|----------------|
| 3            | 12          | Default approval | Option 2 (Checkout) |
| 5            | N/A         | No email | Option 5 (Save & Close) |
| 9            | 40          | Just Send | Option 1 (Set Return ETA) |
| 10           | 7           | Create Invoice | Option 4 (Create Invoice) |

---

## Pre-Flight Check Logic

### Option 2: Check Before Checkout

**Endpoint**: `GET /api/v1/admin/on-site-approval/check-before-checkout`

**Flow**:
```
Check if vendor is checked in
    ↓
No → Show check-in form → Save check-in → Enable send button
    ↓
Yes → Enable send button immediately
```

### Option 4: Check Before Create Invoice

**Endpoint**: `GET /api/v1/admin/on-site-approval/check-before-create-invoice`

**Flow**:
```
Check if vendor is checked out
    ↓
Not checked in → Show check-in form → Save check-in → Show check-out form
    ↓
Checked in but not out → Show check-out form → Save check-out → Enable send button
    ↓
Checked out → Enable send button immediately
```

---

## Frontend State Flow

### Option 1 Flow
```
Select Option 1
    ↓
Enter approval text
    ↓
Click "Send"
    ↓
POST save-vendor-approval-data
    ↓
Response: { invoiceType: 9, requiresEmail: true }
    ↓
Open email compose modal
    ↓
GET email-work-order-to-vendor (invoiceType=9)
    ↓
Load template, strip HTML to plain text
    ↓
Admin selects recipients, edits message
    ↓
Click "Send Email"
    ↓
POST email-work-order-to-vendor
    ↓
Success → Close modal → Refresh page
```

### Option 2 Flow
```
Select Option 2
    ↓
GET check-before-checkout
    ↓
requiresCheckIn: true → Show check-in form
    ↓
Admin fills check-in form
    ↓
POST save-tech-check-in
    ↓
Success → Hide check-in form → Show "Send" button
    ↓
Enter approval text
    ↓
Click "Send"
    ↓
POST save-vendor-approval-data
    ↓
Response: { invoiceType: 3, requiresEmail: true }
    ↓
Open email compose modal
    ↓
[Same as Option 1 from here]
```

### Option 4 Flow
```
Select Option 4
    ↓
GET check-before-create-invoice
    ↓
requiresCheckOut: true → Check if checked in
    ↓
Not checked in → Show check-in form
    ↓
POST save-tech-check-in
    ↓
Success → Show check-out form
    ↓
Admin fills check-out form (work performed required)
    ↓
POST save-tech-check-out
    ↓
Success → Hide check-out form → Show "Send" button
    ↓
Enter approval text
    ↓
Click "Send"
    ↓
POST save-vendor-approval-data
    ↓
Response: { invoiceType: 10, requiresEmail: true }
    ↓
Open email compose modal
    ↓
[Same as Option 1 from here]
    ↓
Email sent
    ↓
Job status updates to "Complete"
```

### Option 5 Flow
```
Select Option 5
    ↓
Enter approval text
    ↓
Click "Save"
    ↓
POST save-vendor-approval-data
    ↓
Response: { invoiceType: 5, requiresEmail: false }
    ↓
NO EMAIL COMPOSE
    ↓
Success message
    ↓
Close modal → Refresh page
```

---

## Button Labels

| Option | Button Label | Action |
|--------|-------------|--------|
| 1      | "Send"      | Send email workflow |
| 2      | "Send"      | Send email workflow (after check-in) |
| 4      | "Send"      | Send email workflow (after check-out) |
| 5      | "Save"      | Save and close (no email) |

---

## Key Implementation Points

### ✅ Completed

1. Radio options mapped to correct invoice types
2. Request uses `fifthApprovalOption` field name
3. Response checks `requiresEmail` flag
4. Email request includes `jobStatusTrigger: 0`
5. Email request uses `useAdminEmail` instead of `senderIsSelf`
6. Plain text only (HTML stripped from backend templates)
7. Pre-flight check endpoints integrated
8. Check-in/check-out forms conditional display

### 🔄 Field Name Changes

| Old Field | New Field | Location |
|-----------|-----------|----------|
| `approvalOption` | `fifthApprovalOption` | SaveVendorApprovalDataRequest |
| `sendEmail` | `requiresEmail` | SaveVendorApprovalDataResponse |
| `senderIsSelf` | `useAdminEmail` | SendWorkOrderEmailRequest |
| Removed: `revVendorDNE` | - | No longer in request |
| Removed: `jobStatusTrigger` | - | No longer in response |

---

## Testing Matrix

| Option | Pre-Flight | Check-In Form | Check-Out Form | Email Sent | Job Status Change |
|--------|------------|---------------|----------------|------------|-------------------|
| 1      | No         | No            | No             | Yes (Type 9) | No |
| 2      | Yes        | Conditional   | No             | Yes (Type 3) | No |
| 4      | Yes        | Conditional   | Conditional    | Yes (Type 10) | Yes → Complete |
| 5      | No         | No            | No             | **No** | No |

---

## Error Handling

### Common Errors

1. **Pre-flight check fails**: Show check-in/out form
2. **Save approval fails**: Show error, keep modal open
3. **Email compose load fails**: Show error, allow retry
4. **Email send fails**: Show error modal with retry option

### Success Messages

1. **Check-in saved**: "Tech checked in successfully"
2. **Check-out saved**: "Tech checked out successfully"
3. **Approval saved (Option 5)**: "Approval saved successfully"
4. **Email sent**: "Email sent to X recipient(s)"
5. **Job status updated**: "Job status updated to: Complete"

---

## Related Files

- `src/app/shared/components/additional-approval-modal/additional-approval-modal.component.ts`
- `src/app/shared/components/work-order-email-modal/work-order-email-modal.component.ts`
- `src/app/models/on-site-estimate.model.ts`
- `src/app/services/assign-vendor.service.ts`

---

**Last Updated**: July 1, 2026  
**Status**: ✅ Fully Synced with Backend Specification
