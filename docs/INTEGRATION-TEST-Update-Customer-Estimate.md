# Frontend-Backend Integration Test: Update Customer Estimate

## Overview

This document provides a step-by-step guide to test the complete integration between:
- **Frontend**: Auto-save customer estimate editing (Angular)
- **Backend**: Update customer estimate endpoint (C# .NET)

## Prerequisites

✅ Backend endpoint implemented and running
✅ Frontend fixed cost incurred/proposed bug
✅ Frontend fixed infinite saving loop
✅ Angular dev server running (`ng serve`)
✅ Backend API running (default: `http://localhost:5000`)

## Test Scenario: Complete On-Site Approval Flow

### Step 1: Create Vendor Estimate

1. Navigate to Job Assignment page
2. Find a job with an assigned vendor
3. Click "Provide On-Site Approval" button
4. Fill out the wizard:
   - **Step 1 - Trip Charge**: 
     - Select "Incurred" (should be default) ✅
     - Enter amount: $100
   - **Step 2 - Materials**:
     - Select "Proposed" (should be default) ✅
     - Add material: "Refrigerant R-410A", Qty: 2, Rate: $75
   - **Step 3 - Labor**:
     - Select "Proposed" (should be default) ✅
     - Add labor: Main Tech, Standard Rate, 1 tech, 2 hours, $85/hr
   - **Step 4 - Uploads**: Skip
   - **Step 5 - Review**: Click "Submit for Customer Approval"

**Expected Results**:
- ✅ Vendor estimate saved with correct `costIncurred` values:
  - Trip Charge: `costIncurred: 0` (Incurred)
  - Materials: `costIncurred: 1` (Proposed)
  - Labor: `costIncurred: 1` (Proposed)

### Step 2: Auto-Create Customer Estimate

After clicking "Submit for Customer Approval":

**Watch Console Logs**:
```
📤 Submit for Customer Approval Request
✅ Submit for Customer Approval Response
📤 Creating customer estimate from vendor estimate...
✅ Create Customer Estimate Response
```

**Expected Response**:
```json
{
  "status": true,
  "data": {
    "customerEstimateKey": "...",
    "vendorTotal": 320.00,
    "customerTotal": 384.00,  // With markup
    "lineItems": [
      {
        "lineItemKey": "...",
        "itemName": "Trip Charge",
        "vendorQty": 1,
        "vendorRate": 100,
        "vendorAmount": 100,
        "customerQty": 1,
        "customerRate": 120,  // With markup
        "customerAmount": 120
      },
      // ... more items
    ]
  }
}
```

### Step 3: View Comparison Grid

The modal should now display a comparison grid at the bottom with:
- Vendor columns (Qty, Rate, Amount) - **Read-only**
- Customer columns (Qty, Rate, Amount) - **Editable**
- Markup % column - **Editable**

### Step 4: Test Auto-Save Feature

#### Test 4A: Edit Customer Quantity

1. **Click** on a Customer Qty cell in the grid
2. **Change** the value (e.g., from 2 to 3)
3. **Click outside** the cell (blur)

**Expected Behavior**:
- ✅ Cell becomes editable with input field
- ✅ Status shows "Saving..." briefly
- ✅ Console logs:
  ```
  💾 Auto-saving customer estimate changes: {...}
  ✅ Auto-save successful: {...}
  ```
- ✅ Status clears after save completes
- ✅ Customer Amount recalculates automatically
- ✅ Customer Total updates
- ✅ Markup % recalculates

**Check Backend Logs**:
```
Information: Updated customer estimate {CustomerEstimateKey} - 1 line items updated by {Admin}. 
CustomerTotal=$XXX.XX, VendorTotal=$XXX.XX, Markup=XX.XX%
```

#### Test 4B: Edit Customer Rate

1. **Click** on a Customer Rate cell
2. **Change** the value (e.g., from $120 to $150)
3. **Click outside** the cell

**Expected Behavior**:
- ✅ Auto-save triggers
- ✅ Customer Amount = Qty × New Rate
- ✅ Markup % recalculates
- ✅ Customer Total updates
- ✅ No errors in console

#### Test 4C: Edit Markup Percentage

1. **Click** on a Markup % cell
2. **Change** the value (e.g., from 20% to 30%)
3. **Click outside** the cell

**Expected Behavior**:
- ✅ Auto-save triggers
- ✅ Customer Rate adjusts to achieve target markup
- ✅ Customer Amount recalculates
- ✅ Customer Total updates
- ✅ Vendor columns remain unchanged

#### Test 4D: Edit Multiple Items Sequentially

1. Edit Qty on line item 1 → Click outside
2. Wait for "Saving..." to clear
3. Edit Rate on line item 2 → Click outside
4. Wait for "Saving..." to clear
5. Edit Markup on line item 3 → Click outside

**Expected Behavior**:
- ✅ Each edit triggers separate save
- ✅ No duplicate saves (check console logs)
- ✅ "Saving..." appears and clears for each edit
- ✅ No infinite loop
- ✅ All changes persist
- ✅ Totals stay accurate

### Step 5: Verify Database Updates

After making edits, verify in the database:

```sql
-- Check JobSalesInvoiceDetail (customer estimate line items)
SELECT 
    Qty AS CustomerQty,
    Rate AS CustomerRate,
    Amt AS CustomerAmount,
    Perc AS MarkupPercent,
    ModifyDate,
    ModifyBy
FROM JobSalesInvoiceDetail
WHERE ParentFK = (
    SELECT KeyID 
    FROM JobSalesInvoice 
    WHERE UniqueInvoiceGUID = '<customer-estimate-key>'
)
ORDER BY LineItemID;
```

**Expected Results**:
- ✅ Qty, Rate, Amt match frontend values
- ✅ Perc (Markup %) is correctly calculated
- ✅ ModifyDate is recent (within last few seconds)
- ✅ ModifyBy shows admin username

### Step 6: Test Error Handling

#### Test 6A: Network Error (Backend Down)

1. Stop the backend server
2. Edit a customer estimate field
3. Click outside to trigger save

**Expected Behavior**:
- ✅ "Saving..." appears
- ✅ After timeout, error message appears
- ✅ "Failed to save changes automatically" message
- ✅ `hasUnsavedChanges` flag restored (shows "Unsaved changes")
- ✅ No infinite loop

#### Test 6B: Invalid Customer Estimate Key

Manually test the API endpoint:

```bash
curl -X PUT "http://localhost:5000/api/v1/admin/on-site-approval/update-customer-estimate" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "customerEstimateKey": "00000000-0000-0000-0000-000000000000",
    "lineItems": []
  }'
```

**Expected Response**:
```json
{
  "status": false,
  "responseCode": 404,
  "message": "Customer estimate not found",
  "data": null
}
```

#### Test 6C: Empty Line Items Array

```bash
curl -X PUT "http://localhost:5000/api/v1/admin/on-site-approval/update-customer-estimate" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "customerEstimateKey": "<valid-guid>",
    "lineItems": []
  }'
```

**Expected Response**:
```json
{
  "status": false,
  "responseCode": 400,
  "message": "At least one line item is required",
  "data": null
}
```

### Step 7: Test Email Sending (Optional)

After editing customer estimate:

1. Click "Send Customer Estimate Email" button
2. Check console for email confirmation

**Expected Behavior**:
- ✅ Email sent with updated totals
- ✅ Customer receives email with correct amounts
- ✅ Email includes markup and totals

## Frontend Console Debugging

### Expected Console Log Sequence

```
📤 Save On-Site Estimate Request (Frontend Model): {...}
📤 Save On-Site Estimate Request (Backend API Format): {...}
✅ Save Estimate Response: {status: true, data: {...}}
🔑 Extracted estimateKey: ...
📤 Submit for Customer Approval Request: {...}
✅ Submit for Customer Approval Response: {status: true}
📤 Creating customer estimate from vendor estimate...
✅ Create Customer Estimate Response: {status: true, data: {...}}
📊 Customer Estimate Key: ...
📊 Vendor Total: $320.00
📊 Customer Total: $384.00

// When editing:
💾 Auto-saving customer estimate changes: {
  customerEstimateKey: "...",
  lineItems: [...]
}
✅ Auto-save successful: {
  status: true,
  data: {
    updatedLineItems: 1,
    customerTotal: 390.00,
    vendorTotal: 320.00,
    markupPercent: 21.88
  }
}
```

### Error Logs to Watch For

❌ **Bad**: Duplicate saves
```
💾 Auto-saving customer estimate changes: {...}
⏳ Save already in progress, skipping duplicate save
```

❌ **Bad**: Infinite loop
```
💾 Auto-saving customer estimate changes: {...}
💾 Auto-saving customer estimate changes: {...}
💾 Auto-saving customer estimate changes: {...}
// (repeating endlessly)
```

✅ **Good**: Single save per edit
```
💾 Auto-saving customer estimate changes: {...}
✅ Auto-save successful: {...}
// (then stops)
```

## Backend Logging

### Success Log
```
[Information] Updated customer estimate {GUID} - 1 line items updated by admin@example.com. 
CustomerTotal=$390.00, VendorTotal=$320.00, Markup=21.88%
```

### Error Log (if something fails)
```
[Error] Error updating customer estimate {GUID}
Exception: ...
```

## Performance Benchmarks

| Operation | Expected Time | Acceptable Time | Fail Threshold |
|-----------|---------------|-----------------|----------------|
| Single line item update | < 200ms | < 500ms | > 1000ms |
| Multiple line items (3+) | < 300ms | < 800ms | > 1500ms |
| Frontend validation | < 50ms | < 100ms | > 200ms |
| Database commit | < 100ms | < 300ms | > 500ms |

## Common Issues & Solutions

### Issue 1: "Saving..." Never Clears

**Symptoms**:
- Status shows "Saving..." indefinitely
- No console errors

**Solution**:
- Check if `isSavingChanges` signal is being set back to `false`
- Verify API response has `status: true`
- Check network tab for response

### Issue 2: Changes Don't Persist

**Symptoms**:
- Save appears successful
- Refresh page shows old values

**Solution**:
- Check backend database commit
- Verify SQL UPDATE succeeded
- Check if correct `lineItemKey` is being sent

### Issue 3: Totals Not Recalculating

**Symptoms**:
- Line items update
- Totals remain unchanged

**Solution**:
- Check frontend `getCustomerTotal()` method
- Verify `customerEstimateResponse` signal update
- Ensure backend recalculates and returns new totals

### Issue 4: Auto-Save Not Triggering

**Symptoms**:
- Edit cell
- Click outside
- Nothing happens

**Solution**:
- Check `onCellBlur()` is being called
- Verify `hasUnsavedChanges` is set to `true` on edit
- Check `editingCell` signal is properly managed

## Success Criteria

✅ All test cases pass without errors
✅ Auto-save completes in < 500ms
✅ No infinite loops or duplicate saves
✅ Database values match frontend display
✅ Totals recalculate correctly
✅ Error messages display appropriately
✅ Logs show successful updates
✅ Email sends with updated values

## Related Documentation

- `FIXED-CostIncurred-Issue.md` - Frontend bug fix
- `IMPLEMENTATION-COMPLETE-Update-Customer-Estimate.md` - Backend implementation
- `ON_SITE_APPROVAL_API_MAPPING.md` - API endpoint documentation
- `CustomerEstimate-Email-Implementation.md` - Email flow

## Contact & Support

For issues during testing:
1. Check browser console for frontend errors
2. Check backend logs for server errors
3. Review `BACKEND-TODO-Update-Customer-Estimate-Endpoint.md` for API spec
4. Verify database schema in `Estimate-Data-Storage-Specification.md`
