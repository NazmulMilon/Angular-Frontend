# Legacy V1 Email Redirect Implementation

**Date**: July 1, 2026  
**Status**: ✅ Complete

## Overview

Modified the "Approve Vendor Estimate" workflow to redirect to the legacy v1 email page instead of using the Angular additional approval modal.

---

## What Was Changed

### 1. On-Site Estimate Modal Component

**File**: `src/app/shared/components/on-site-estimate-modal/on-site-estimate-modal.component.ts`

**Changes**:
- Modified `proceedWithDirectApproval()` method (lines 1392-1413)
- Instead of opening `additionalApprovalModal`, now redirects to legacy v1 page
- Builds URL: `/JobWorkOrder/EmailWorkOrderToVendor/{workOrderKey}?id1={invoiceType}&id3={jobStatusTrigger}`

**URL Parameters**:
- `workOrderKey`: From backend response
- `id1`: `invoiceType` (9 = Set Return ETA, 3 = Checkout, 10 = Create Invoice, etc.)
- `id3`: `jobStatusTrigger` (15 for invoiceType 9, 0 for all others)

### 2. Model Updates

**File**: `src/app/models/on-site-estimate.model.ts`

**Changes**:
- Added `workOrderKey?: string` to `ApproveVendorEstimateResponse`
- Added `invoiceType?: number` to `ApproveVendorEstimateResponse`

---

## Flow

### Before (Angular Modal Approach)
```
Click "Approve Vendor Estimate"
  ↓
Save/Update Estimate
  ↓
Approve Estimate
  ↓
requiresAdditionalApproval = true
  ↓
Open Additional Approval Modal (Angular)
  ↓
Select approval option
  ↓
Save approval data
  ↓
Open Email Modal (Angular)
  ↓
Send email
```

### After (Legacy V1 Redirect)
```
Click "Approve Vendor Estimate"
  ↓
Save/Update Estimate
  ↓
Approve Estimate (POST /approve-vendor-estimate)
  ↓
requiresAdditionalApproval = true
  ↓
Call save-vendor-approval-data (with default option 1)
  ↓
Get workOrderKey + invoiceType from response
  ↓
Build legacy URL with workOrderKey + invoiceType
  ↓
Redirect to v1: /JobWorkOrder/EmailWorkOrderToVendor/{key}?id1={type}&id3={trigger}
  ↓
(User completes workflow in v1 legacy page)
```

---

## URL Construction Logic

```typescript
const workOrderKey = approveRes.data.workOrderKey;
const invoiceType = approveRes.data.invoiceType || 9; // Default to 9 (Set Return ETA)

// invoiceType 9 (Set Return ETA) uses id3=15, all others use id3=0
const jobStatusTrigger = invoiceType === 9 ? 15 : 0;

const legacyUrl = `${environment.legacyAdminBaseUrl}/JobWorkOrder/EmailWorkOrderToVendor/${workOrderKey}?id1=${invoiceType}&id3=${jobStatusTrigger}`;

window.location.href = legacyUrl;
```

---

## Invoice Type Mapping

| Invoice Type | Description | id3 Value |
|--------------|-------------|-----------|
| 9 | Set Return ETA | 15 |
| 3 | Checkout / Create Estimate | 0 |
| 10 | Create Invoice | 0 |
| 5 | Proceed with Approval | 0 |

**Note**: Based on the legacy code pattern, only `invoiceType: 9` uses `id3=15`

---

## Backend Requirements

### Step 1: Approve Estimate Endpoint

**Endpoint**: `POST /api/v1/admin/on-site-approval/approve-vendor-estimate`

**Response**:
```json
{
  "success": true,
  "requiresAdditionalApproval": true,
  "estimateKey": "guid-here",
  "jobKey": "guid-here",
  "vendorKey": "guid-here"
}
```

### Step 2: Save Vendor Approval Data Endpoint

**Endpoint**: `POST /api/v1/admin/on-site-approval/save-vendor-approval-data`

**Request** (automatically sent by frontend):
```json
{
  "jobKey": "guid-here",
  "vendorKey": "guid-here",
  "estimateKey": "guid-here",
  "fifthApprovalOption": 1,
  "approvalText": "Approved. Please proceed with the work."
}
```

**Response**:
```json
{
  "workOrderKey": "guid-here",
  "invoiceType": 9,
  "requiresEmail": true
}
```

**Key fields needed for redirect**:
- `workOrderKey`: Required for URL construction (from step 2)
- `invoiceType`: Determines which email template to use (from step 2, defaults to 9 if missing)

---

## Environment Configuration

Uses `environment.legacyAdminBaseUrl`:

```typescript
// environment.ts
legacyAdminBaseUrl: 'https://admin-dev.retailfixitapp.com'
// OR for local testing:
// legacyAdminBaseUrl: 'http://localhost:2063'
```

---

## Testing Checklist

- [ ] Approve vendor estimate with `requiresAdditionalApproval: true`
- [ ] Verify redirect happens after 1 second
- [ ] Verify URL contains correct `workOrderKey`
- [ ] Verify URL contains correct `id1` (invoiceType)
- [ ] Verify URL contains correct `id3` (15 for invoiceType 9, 0 for others)
- [ ] Verify legacy v1 page loads correctly
- [ ] Test with different invoice types (9, 3, 10, 5)

---

## Notes

- The Angular `additional-approval-modal` and `work-order-email-modal` components are still in the codebase but are no longer used in this workflow
- The modal approach could still be used for other workflows if needed in the future
- The 1-second delay before redirect allows the success message to be visible to the user
