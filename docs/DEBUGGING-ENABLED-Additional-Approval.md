# Debugging Enabled - Additional Approval Workflow

## Overview

Removed all automatic page navigation and reloads to allow developers to inspect console logs and network activity during testing.

**Date**: July 1, 2026  
**Status**: ✅ Debugging Mode Active

---

## Changes Made

### 1. Removed Automatic Page Reloads

**Before**:
```typescript
setTimeout(() => {
  this.close();
  window.location.reload();
}, 2000);
```

**After**:
```typescript
// Modal stays open for debugging
console.log('✅ Success. Modal will remain open for debugging.');
```

### 2. Added Comprehensive Console Logging

All API calls and workflows now log to console with emoji indicators:

- 🎯 **Option selection**
- 📞 **API calls being made**
- ✅ **Success responses**
- ❌ **Error responses**
- 🔍 **Pre-flight checks**
- 📤 **Request payloads**
- 📋 **Important data points**
- ✉️ **Email operations**
- 📊 **Job status updates**
- 💾 **Save operations**
- ➡️ **Workflow transitions**
- 🔑 **Key values stored**

---

## Console Log Examples

### Option 1: Set Return ETA
```
🎯 Approval option 1 selected
✅ Option 1: Set Return ETA - Proceeding directly to save
📤 Saving vendor approval data: {jobKey: "...", fifthApprovalOption: 1, ...}
✅ Save vendor approval response: {...}
📋 Approval saved. requiresEmail: true, invoiceType: 9
📧 Email required, opening email compose modal...
📧 Opening email compose modal with data: {workOrderKey: "...", invoiceType: 9, ...}
📤 Get Email Work Order Compose: {...}
✅ Email compose data response: {...}
📋 Email template loaded. Job PO: PO-12345, Contacts: 2
📝 HTML stripped. Plain text length: 542
✅ Email compose form ready
```

### Option 2: Checkout (with Check-In Required)
```
🎯 Approval option 2 selected
🔍 Option 2: Checkout - Checking if vendor is checked in...
📞 Calling check-before-checkout API...
✅ Check-before-checkout response: {canProceed: false, ...}
⚠️ Vendor not checked in. Showing check-in form...
[User fills check-in form]
📤 Saving tech check-in: {jobKey: "...", techCount: 1, ...}
✅ Tech check-in response: {...}
✅ Check-in saved successfully
🔑 Check-in key stored: abc123...
➡️ Option 2: Proceeding to save approval...
📤 Saving vendor approval data: {...}
✅ Save vendor approval response: {...}
📋 Approval saved. requiresEmail: true, invoiceType: 3
📧 Email required, opening email compose modal...
```

### Option 4: Create Invoice (with Check-Out Required)
```
🎯 Approval option 4 selected
🔍 Option 4: Create Invoice - Checking if vendor is checked out...
📞 Calling check-before-create-invoice API...
✅ Check-before-create-invoice response: {canProceed: false, tempHeader: "1", ...}
⚠️ Vendor checked in but not checked out. Showing check-out form...
[User fills check-out form]
📤 Saving tech check-out: {checkInKey: "...", workPerformed: "...", ...}
✅ Tech check-out response: {...}
✅ Check-out saved successfully
➡️ Proceeding to save approval data...
📤 Saving vendor approval data: {...}
✅ Save vendor approval response: {...}
📋 Approval saved. requiresEmail: true, invoiceType: 10
📧 Email required, opening email compose modal...
```

### Option 5: Save and Close
```
🎯 Approval option 5 selected
💾 Option 5: Save and Close - No email will be sent
📤 Saving vendor approval data: {...}
✅ Save vendor approval response: {...}
💾 Option 5 selected - No email required. Modal will remain open for debugging.
```

### Email Send
```
[User clicks Send Email]
📤 Sending work order email request: {workOrderKey: "...", recipientEmails: [...], ...}
✅ Work order email response: {...}
✉️ Email sent to 2 recipient(s)
📊 Job status updated to: Complete
✅ Email workflow complete. Modal will remain open for debugging.
```

---

## Debugging Workflow

### Step 1: Open Browser DevTools
1. Press `F12` or `Cmd+Option+I` (Mac)
2. Go to **Console** tab
3. Clear console (`Cmd+K` or click clear icon)

### Step 2: Open Network Tab
1. Go to **Network** tab
2. Enable "Preserve log" checkbox
3. Clear network log

### Step 3: Test Workflow
1. Approve a vendor estimate
2. Select approval option
3. Watch console logs flow in real-time
4. Check Network tab for API calls

### Step 4: Inspect Results
- **Console**: See detailed workflow steps and data
- **Network**: Click API calls to see:
  - Request headers
  - Request payload (JSON)
  - Response headers
  - Response payload (JSON)
  - Status codes
  - Timing

---

## What to Look For

### ✅ Success Indicators

**Console**:
```
✅ Save vendor approval response: {success: true, ...}
✅ Email compose data response: {status: true, data: {...}}
✉️ Email sent to 2 recipient(s)
```

**Network**:
- Status: `200 OK`
- Response contains `"success": true`
- Response contains expected data

### ❌ Error Indicators

**Console**:
```
❌ Save approval failed: {...}
❌ Email send error: {...}
```

**Network**:
- Status: `400 Bad Request`, `404 Not Found`, `500 Server Error`
- Response contains error message
- Request timeout

### 🔍 Pre-Flight Check Results

**Check-In Required**:
```
⚠️ Vendor not checked in. Showing check-in form...
```

**Check-Out Required**:
```
⚠️ Vendor checked in but not checked out. Showing check-out form...
```

---

## API Endpoints to Monitor

### 1. Check Before Checkout
```
GET /api/v1/admin/on-site-approval/check-before-checkout
  ?jobKey=...&vendorKey=...
```

### 2. Check Before Create Invoice
```
GET /api/v1/admin/on-site-approval/check-before-create-invoice
  ?jobKey=...&vendorKey=...
```

### 3. Save Tech Check-In
```
POST /api/v1/admin/on-site-approval/save-tech-check-in
Body: {jobKey, vendorKey, checkInDateTime, techCount}
```

### 4. Save Tech Check-Out
```
POST /api/v1/admin/on-site-approval/save-tech-check-out
Body: {checkInKey, checkOutDateTime, workPerformed}
```

### 5. Save Vendor Approval Data
```
POST /api/v1/admin/on-site-approval/save-vendor-approval-data
Body: {jobKey, vendorKey, estimateKey, fifthApprovalOption, approvalText}
```

### 6. Get Email Compose Data
```
GET /api/v1/admin/work-order/email-work-order-to-vendor/{workOrderKey}
  ?invoiceType=...&jobStatusTrigger=0
```

### 7. Send Email
```
POST /api/v1/admin/work-order/email-work-order-to-vendor
Body: {workOrderKey, jobKey, vendorKey, invoiceType, jobStatusTrigger, recipientEmails, emailBody, ...}
```

---

## Common Issues to Check

### Issue 1: 404 Not Found
- **Cause**: Endpoint URL incorrect
- **Check**: Network tab → Request URL
- **Fix**: Verify backend routes match

### Issue 2: 400 Bad Request
- **Cause**: Invalid request payload
- **Check**: Console logs → Request object, Network tab → Payload
- **Fix**: Verify field names match backend spec

### Issue 3: Field Name Mismatch
- **Cause**: Frontend using wrong field names
- **Check**: Console log shows request, compare to spec
- **Common**: `approvalOption` vs `fifthApprovalOption`

### Issue 4: Missing Required Fields
- **Cause**: Required field not sent
- **Check**: Network tab → Payload tab
- **Fix**: Add missing field to request DTO

### Issue 5: CORS Error
- **Cause**: Backend not configured for local dev
- **Check**: Console shows CORS error
- **Fix**: Backend needs CORS headers

---

## Testing Checklist

Use this checklist while testing with console open:

### Option 1: Set Return ETA
- [ ] Console shows option 1 selected
- [ ] Save approval API called
- [ ] Response has `invoiceType: 9`
- [ ] Email compose opens
- [ ] Template loaded with InvoiceType 9
- [ ] Email send successful

### Option 2: Checkout
- [ ] Console shows option 2 selected
- [ ] Check-before-checkout API called
- [ ] If not checked in: Check-in form shows
- [ ] Check-in save successful
- [ ] Save approval API called
- [ ] Response has `invoiceType: 3`
- [ ] Email compose opens
- [ ] Email send successful

### Option 4: Create Invoice
- [ ] Console shows option 4 selected
- [ ] Check-before-create-invoice API called
- [ ] If not checked out: Check-out form shows
- [ ] Check-out save successful
- [ ] Save approval API called
- [ ] Response has `invoiceType: 10`
- [ ] Email compose opens
- [ ] Email send successful
- [ ] Console shows job status updated

### Option 5: Save & Close
- [ ] Console shows option 5 selected
- [ ] Save approval API called
- [ ] Response has `requiresEmail: false`
- [ ] NO email compose opens
- [ ] Success message shows
- [ ] Modal stays open (no reload)

---

## Restoring Normal Behavior

When debugging is complete and you want to restore automatic navigation:

1. **Option 5 (Save & Close)**: Uncomment the setTimeout reload
2. **Email Send Success**: Uncomment the setTimeout reload

Example:
```typescript
// Restore this after debugging:
setTimeout(() => {
  this.close();
  window.location.reload();
}, 2000);
```

---

## Modified Files

- `src/app/shared/components/additional-approval-modal/additional-approval-modal.component.ts`
  - Removed auto-close/reload for Option 5
  - Added console logs throughout
  
- `src/app/shared/components/work-order-email-modal/work-order-email-modal.component.ts`
  - Removed auto-close/reload after email send
  - Added console logs for email workflow

---

## Benefits of Debugging Mode

✅ **See full workflow** - Every step logged to console  
✅ **Inspect payloads** - View exact data sent to API  
✅ **Check responses** - Verify backend returns expected data  
✅ **Network timing** - See how long each API call takes  
✅ **Error details** - Full error messages and stack traces  
✅ **No interruptions** - Modals stay open for inspection  

---

**Last Updated**: July 1, 2026  
**Status**: ✅ Ready for Testing & Debugging
