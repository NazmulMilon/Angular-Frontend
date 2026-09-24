# Update Customer Estimate API - Testing Guide

## Implementation Summary

**Status**: ✅ COMPLETED

**Endpoint**: `PUT /api/v1/admin/on-site-approval/update-customer-estimate`

**Purpose**: Allows admins to update customer estimate line items after creation. Used for editing customer quantity, rate, and amounts in the comparison grid with auto-save functionality.

## Files Modified

### 1. DTOs Added
**File**: `CustomModel/OnSiteApprovalDTO.cs`

Added three new DTOs:
- `UpdateCustomerEstimateRequest` - Contains customer estimate key and list of line items to update
- `UpdateCustomerEstimateLineItem` - Individual line item with updated qty, rate, and amount
- `UpdateCustomerEstimateResponse` - Returns updated totals and markup percentages

### 2. Service Interface Updated
**File**: `Services/IOnSiteApprovalService.cs`

Added method signature:
```csharp
Task<ApiResponse<UpdateCustomerEstimateResponse>> UpdateCustomerEstimateAsync(
    UpdateCustomerEstimateRequest request,
    Guid? adminKey,
    string adminName);
```

### 3. Service Implementation Added
**File**: `Services/OnSiteApprovalService.cs`

Implemented `UpdateCustomerEstimateAsync` method with:
- Validation that customer estimate exists
- Updates `JobSalesInvoiceDetail` records (Qty, Rate, Amt)
- Recalculates markup percentage per line item by looking up linked vendor estimate data
- Recalculates overall customer total and vendor total
- Comprehensive logging
- Error handling

### 4. Controller Endpoint Added
**File**: `Controllers/AdminOnSiteApprovalController.cs`

Added `UpdateCustomerEstimate` endpoint:
- Route: `PUT /api/v1/admin/on-site-approval/update-customer-estimate`
- Authorization: Uses existing admin token extraction
- Validation: Checks for valid customer estimate key and at least one line item
- Returns: Updated totals and line item count

## API Specification

### Request

**Method**: `PUT`

**Endpoint**: `/api/v1/admin/on-site-approval/update-customer-estimate`

**Headers**:
```
Content-Type: application/json
Authorization: Bearer <admin-jwt-token>
```

**Request Body**:
```json
{
  "customerEstimateKey": "guid",
  "lineItems": [
    {
      "lineItemKey": "guid",           // JobSalesInvoiceDetail.DetailKey
      "customerQty": 1.0,
      "customerRate": 150.00,
      "customerAmount": 150.00         // qty × rate
    }
  ]
}
```

### Response

**Success (200)**:
```json
{
  "status": true,
  "responseCode": 200,
  "message": "Customer estimate updated successfully",
  "data": {
    "updatedLineItems": 3,
    "customerTotal": 450.00,
    "vendorTotal": 300.00,
    "markupPercent": 50.0
  },
  "traceId": "..."
}
```

**Error - Not Found (404)**:
```json
{
  "status": false,
  "responseCode": 404,
  "message": "Customer estimate not found",
  "data": null,
  "traceId": "..."
}
```

**Error - Bad Request (400)**:
```json
{
  "status": false,
  "responseCode": 400,
  "message": "CustomerEstimateKey is required",
  "data": null,
  "traceId": "..."
}
```

## Database Changes

### Tables Updated

#### `JobSalesInvoiceDetail`
Fields updated per line item:
- `Qty` - Updated from `customerQty`
- `Rate` - Updated from `customerRate`
- `Amt` - Updated from `customerAmount`
- `Perc` - Recalculated markup percentage

No `ModifyDate` or `ModifyBy` columns exist on this table, so audit trail is handled via logging.

### Data Flow

1. **Lookup Customer Estimate**: Validate `JobSalesInvoice` exists where `InvoiceKey = customerEstimateKey` and `IsEstimate = true`

2. **Update Line Items**: For each line item in request:
   - Find `JobSalesInvoiceDetail` where `DetailKey = lineItemKey`
   - Update `Qty`, `Rate`, `Amt`
   - Recalculate `Perc` (markup) by:
     - Finding linked vendor detail via `VendorEstimateDetailKey`
     - Looking up from `VendorEstimateDetail` (materials/trip) or `VendorEstimateDetail1` (labor)
     - Calculating: `((customerAmount - vendorAmount) / vendorAmount) * 100`

3. **Recalculate Totals**:
   - Sum all `JobSalesInvoiceDetail.Amt` for customer total
   - Sum all linked vendor amounts for vendor total
   - Calculate overall markup: `((customerTotal - vendorTotal) / vendorTotal) * 100`

4. **Save Changes**: Single `SaveChangesAsync()` call for all updates

## Testing Guide

### Test Case 1: Update Single Line Item

**Scenario**: Admin edits one line item in comparison grid

**Request**:
```json
{
  "customerEstimateKey": "A1B2C3D4-E5F6-7890-ABCD-EF1234567890",
  "lineItems": [
    {
      "lineItemKey": "11111111-2222-3333-4444-555555555555",
      "customerQty": 2.0,
      "customerRate": 100.00,
      "customerAmount": 200.00
    }
  ]
}
```

**Expected**:
- Status: 200
- `updatedLineItems`: 1
- `customerTotal`: Sum of all line items (including this updated one)
- `vendorTotal`: Unchanged from vendor estimate
- `markupPercent`: Recalculated overall markup

**SQL Verification**:
```sql
-- Check the updated line item
SELECT DetailKey, Qty, Rate, Amt, Perc
FROM JobSalesInvoiceDetail
WHERE DetailKey = '11111111-2222-3333-4444-555555555555';

-- Check the customer estimate total
SELECT InvoiceKey, 
       (SELECT SUM(Amt) FROM JobSalesInvoiceDetail WHERE InvoiceKey = 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890') AS CustomerTotal
FROM JobSalesInvoice
WHERE InvoiceKey = 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890';
```

### Test Case 2: Update Multiple Line Items

**Scenario**: Admin edits multiple line items at once

**Request**:
```json
{
  "customerEstimateKey": "A1B2C3D4-E5F6-7890-ABCD-EF1234567890",
  "lineItems": [
    {
      "lineItemKey": "11111111-2222-3333-4444-555555555555",
      "customerQty": 2.0,
      "customerRate": 100.00,
      "customerAmount": 200.00
    },
    {
      "lineItemKey": "22222222-3333-4444-5555-666666666666",
      "customerQty": 1.0,
      "customerRate": 150.00,
      "customerAmount": 150.00
    },
    {
      "lineItemKey": "33333333-4444-5555-6666-777777777777",
      "customerQty": 3.0,
      "customerRate": 50.00,
      "customerAmount": 150.00
    }
  ]
}
```

**Expected**:
- Status: 200
- `updatedLineItems`: 3
- All three line items updated in database
- Correct totals and markup recalculated

### Test Case 3: Invalid Customer Estimate Key

**Request**:
```json
{
  "customerEstimateKey": "00000000-0000-0000-0000-000000000000",
  "lineItems": [
    {
      "lineItemKey": "11111111-2222-3333-4444-555555555555",
      "customerQty": 1.0,
      "customerRate": 100.00,
      "customerAmount": 100.00
    }
  ]
}
```

**Expected**:
- Status: 404
- Message: "Customer estimate not found"

### Test Case 4: Empty Line Items Array

**Request**:
```json
{
  "customerEstimateKey": "A1B2C3D4-E5F6-7890-ABCD-EF1234567890",
  "lineItems": []
}
```

**Expected**:
- Status: 400
- Message: "At least one line item is required"

### Test Case 5: Missing Customer Estimate Key

**Request**:
```json
{
  "customerEstimateKey": "00000000-0000-0000-0000-000000000000",
  "lineItems": [
    {
      "lineItemKey": "11111111-2222-3333-4444-555555555555",
      "customerQty": 1.0,
      "customerRate": 100.00,
      "customerAmount": 100.00
    }
  ]
}
```

**Expected**:
- Status: 400
- Message: "CustomerEstimateKey is required"

### Test Case 6: Auto-Save Integration Test

**Scenario**: Frontend auto-save when user edits cell and moves focus

1. User edits a cell in comparison grid
2. Cell loses focus (`onCellBlur`)
3. Frontend calls `updateCustomerEstimate` with changed line items
4. Backend updates database
5. Frontend receives updated totals
6. UI refreshes to show new totals

**Frontend Flow**:
```typescript
// From on-site-estimate-modal.component.ts
autoSaveCustomerEstimate() {
  if (this.hasUnsavedChanges) {
    const request = {
      customerEstimateKey: this.customerEstimateKey,
      lineItems: this.getChangedLineItems()
    };
    
    this.assignVendorService.updateCustomerEstimate(request)
      .subscribe(response => {
        this.hasUnsavedChanges = false;
        this.refreshTotals(response.data);
      });
  }
}
```

## Logging

The service logs the following events:

**Success Log**:
```
Information: Updated customer estimate {CustomerEstimateKey} - {Count} line items updated by {Admin}. CustomerTotal={CustomerTotal:C}, VendorTotal={VendorTotal:C}, Markup={Markup:F2}%
```

**Error Log**:
```
Error: Error updating customer estimate {Key}
```

## Security Considerations

1. **Authorization**: Endpoint requires admin JWT token (enforced by controller attribute)
2. **Validation**: Validates customer estimate exists before updating
3. **Data Integrity**: All line items must belong to the specified customer estimate
4. **Audit Trail**: Logs all updates with admin name and timestamp

## Frontend Integration

The frontend already has the service method implemented:

**File**: `src/app/services/assign-vendor.service.ts` (line 2588)

```typescript
updateCustomerEstimate(
  request: any
): Observable<AssignVendorApiResponse<any>> {
  return this.http
    .put<AssignVendorApiResponse<any>>(
      `${this.onSiteEstimateBase}/update-customer-estimate`,
      request
    )
    .pipe(
      timeout(AssignVendorService.EXTENDED_TIMEOUT_MS),
      catchError(this.handleError<AssignVendorApiResponse<any>>('updateCustomerEstimate'))
    );
}
```

**Component**: `src/app/shared/components/on-site-estimate-modal/on-site-estimate-modal.component.ts`

Called in `autoSaveCustomerEstimate()` method (line 956).

## Troubleshooting

### Issue: Line items not updating

**Check**:
1. Verify `lineItemKey` matches `JobSalesInvoiceDetail.DetailKey`
2. Verify line item belongs to the specified customer estimate
3. Check logs for detailed error messages

**SQL Query**:
```sql
SELECT d.DetailKey, d.InvoiceKey, d.Qty, d.Rate, d.Amt, d.Perc
FROM JobSalesInvoiceDetail d
INNER JOIN JobSalesInvoice i ON d.InvoiceKey = i.InvoiceKey
WHERE i.InvoiceKey = '<customer-estimate-key>'
  AND i.IsEstimate = 1;
```

### Issue: Markup percentage not calculating

**Check**:
1. Verify `VendorEstimateDetailKey` is set on customer estimate line items
2. Check that linked vendor estimate detail exists
3. Ensure vendor amount is not zero

**SQL Query**:
```sql
-- Check linkage between customer and vendor line items
SELECT 
    c.DetailKey AS CustomerDetailKey,
    c.Amt AS CustomerAmount,
    c.VendorEstimateDetailKey,
    v.DetailKey AS VendorDetailKey,
    v.Amount * v.Qty AS VendorAmount,
    c.Perc AS MarkupPercent
FROM JobSalesInvoiceDetail c
LEFT JOIN VendorEstimateDetail v ON c.VendorEstimateDetailKey = v.DetailKey
WHERE c.InvoiceKey = '<customer-estimate-key>';

-- Also check labor items
SELECT 
    c.DetailKey AS CustomerDetailKey,
    c.Amt AS CustomerAmount,
    c.VendorEstimateDetailKey,
    v.LaborKey AS VendorLaborKey,
    v.LaborRate * v.LaborHr * v.TechOnSite AS VendorAmount,
    c.Perc AS MarkupPercent
FROM JobSalesInvoiceDetail c
LEFT JOIN VendorEstimateDetail1 v ON c.VendorEstimateDetailKey = v.LaborKey
WHERE c.InvoiceKey = '<customer-estimate-key>';
```

### Issue: Authorization failures

**Check**:
1. Verify admin JWT token is valid and not expired
2. Check authorization header is properly set
3. Re-enable `[Authorize]` attribute if it was disabled for testing

## Next Steps

1. ✅ Backend implementation complete
2. ⏭️ Frontend testing with actual customer estimate data
3. ⏭️ Integration testing with auto-save functionality
4. ⏭️ Update API documentation with this new endpoint
5. ⏭️ Add to `ON_SITE_APPROVAL_API_MAPPING.md`

## Related Documentation

- `BACKEND-TODO-Update-Customer-Estimate-Endpoint.md` - Original requirements
- `CustomerEstimate-Email-Implementation.md` - Customer estimate creation flow
- `Estimate-Data-Storage-Specification.md` - Database schema reference
- `OnSiteApproval-Frontend-Integration-Guide.md` - Frontend integration details
