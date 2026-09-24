# Backend TODO: Update Customer Estimate API Requirements

## 1. ADD Profile Markup % to Create Customer Estimate Response (REQUIRED)

### Endpoint
```
POST /api/v1/admin/on-site-approval/create-customer-estimate
```

### Issue
The response currently only returns `calculatedMarkupPercent` (the actual markup achieved), but **does not include** the `profileMarkupPercent` (the target markup from the customer's profile configuration).

### Required Change
Add `profileMarkupPercent` field to the `CustomerEstimateLineItem` interface:

```typescript
interface CustomerEstimateLineItem {
  // ... existing fields ...
  
  // Markup analysis
  calculatedMarkupPercent: number;    // EXISTING - actual markup achieved
  profileMarkupPercent: number;       // NEW - target markup from customer profile
  
  // ... rest of fields ...
}
```

### Where to Pull Data From
- **For Materials**: Customer's `materialMarkup%` from their profile
- **For Labor**: Customer's `laborMarkup%` from their profile  
- **For Trip Charges**: Customer's labor markup % (same as labor)

### Why We Need This
The frontend displays a comparison grid showing:
- **Actual Markup %** (calculatedMarkupPercent) - what was actually achieved
- **Profile Markup %** (profileMarkupPercent) - what the customer's profile says it should be

This allows admins to see if the actual markup differs from the profile target (e.g., due to hour adjustments or rate table discrepancies).

---

## 2. Implement Update Customer Estimate Endpoint (REQUIRED)

### Endpoint
```
PUT /api/v1/admin/on-site-approval/update-customer-estimate
```

### Purpose

Allows admins to update customer estimate line items after creation. Used for:
- Editing customer quantity
- Editing customer rate
- Adjusting markup percentages
- Auto-save functionality when editing in comparison grid

## Frontend Implementation

**Service**: `src/app/services/assign-vendor.service.ts` (line 2588)

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

Called in `autoSaveCustomerEstimate()` method (line 956) when:
- User edits a cell in the comparison grid
- Cell loses focus (`onCellBlur`)
- `hasUnsavedChanges` flag is true

## Request Structure

**Method**: `PUT`

**Request Body**:
```json
{
  "customerEstimateKey": "guid",
  "lineItems": [
    {
      "lineItemKey": "guid",           // CustomerEstimateDetailKey
      "customerQty": 1.0,
      "customerRate": 150.00,
      "customerAmount": 150.00         // qty × rate
    }
  ]
}
```

**Headers**:
```
Content-Type: application/json
Authorization: Bearer <token>
```

## Expected Response

**Success Response**:
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
  }
}
```

**Error Response**:
```json
{
  "status": false,
  "responseCode": 400,
  "message": "Invalid customer estimate key",
  "data": null
}
```

## Backend Implementation Guide

### 1. Create DTO

**File**: `CustomModel/OnSiteApprovalDTO.cs`

```csharp
public class UpdateCustomerEstimateRequest
{
    public Guid CustomerEstimateKey { get; set; }
    public List<UpdateCustomerEstimateLineItem> LineItems { get; set; }
}

public class UpdateCustomerEstimateLineItem
{
    public Guid LineItemKey { get; set; }  // CustomerEstimateDetailKey
    public decimal CustomerQty { get; set; }
    public decimal CustomerRate { get; set; }
    public decimal CustomerAmount { get; set; }
}

public class UpdateCustomerEstimateResponse
{
    public int UpdatedLineItems { get; set; }
    public decimal CustomerTotal { get; set; }
    public decimal VendorTotal { get; set; }
    public decimal MarkupPercent { get; set; }
}
```

### 2. Add Service Method

**File**: `Services/IOnSiteApprovalService.cs`

```csharp
Task<ApiResponse<UpdateCustomerEstimateResponse>> UpdateCustomerEstimateAsync(
    UpdateCustomerEstimateRequest request,
    Guid? adminKey,
    string adminName);
```

**File**: `Services/OnSiteApprovalService.cs`

```csharp
public async Task<ApiResponse<UpdateCustomerEstimateResponse>> UpdateCustomerEstimateAsync(
    UpdateCustomerEstimateRequest request,
    Guid? adminKey,
    string adminName)
{
    try
    {
        // 1. Validate customer estimate exists
        var customerEstimate = await _db.CustomerEstimate
            .FirstOrDefaultAsync(e => e.CustomerEstimateKey == request.CustomerEstimateKey);
        
        if (customerEstimate == null)
            return ApiResponse<UpdateCustomerEstimateResponse>.Fail(
                "Customer estimate not found", 404);

        // 2. Update each line item
        int updatedCount = 0;
        foreach (var lineItem in request.LineItems)
        {
            var detail = await _db.CustomerEstimateDetail
                .FirstOrDefaultAsync(d => d.CustomerEstimateDetailKey == lineItem.LineItemKey);
            
            if (detail != null)
            {
                detail.CustomerQty = lineItem.CustomerQty;
                detail.CustomerRate = lineItem.CustomerRate;
                detail.CustomerAmount = lineItem.CustomerAmount;
                detail.CalculatedMarkupPercent = 
                    ((detail.CustomerAmount - detail.VendorAmount) / detail.VendorAmount) * 100;
                detail.ModifyDate = DateTime.UtcNow;
                detail.ModifyBy = adminName;
                
                updatedCount++;
            }
        }

        // 3. Recalculate customer estimate total
        var allDetails = await _db.CustomerEstimateDetail
            .Where(d => d.CustomerEstimateKey == request.CustomerEstimateKey)
            .ToListAsync();
        
        var customerTotal = allDetails.Sum(d => d.CustomerAmount);
        var vendorTotal = allDetails.Sum(d => d.VendorAmount);
        var markupPercent = ((customerTotal - vendorTotal) / vendorTotal) * 100;

        // 4. Update customer estimate header
        customerEstimate.CustomerTotal = customerTotal;
        customerEstimate.OverallMarkupPercent = markupPercent;
        customerEstimate.ModifyDate = DateTime.UtcNow;
        customerEstimate.ModifyBy = adminName;

        // 5. Save changes
        await _db.SaveChangesAsync();

        _logger.LogInformation(
            "Updated customer estimate {CustomerEstimateKey} - {Count} line items updated by {Admin}",
            request.CustomerEstimateKey, updatedCount, adminName);

        return ApiResponse<UpdateCustomerEstimateResponse>.Success(
            new UpdateCustomerEstimateResponse
            {
                UpdatedLineItems = updatedCount,
                CustomerTotal = customerTotal,
                VendorTotal = vendorTotal,
                MarkupPercent = markupPercent
            },
            "Customer estimate updated successfully");
    }
    catch (Exception ex)
    {
        _logger.LogError(ex, "Error updating customer estimate {Key}", 
            request.CustomerEstimateKey);
        return ApiResponse<UpdateCustomerEstimateResponse>.Fail(
            "Failed to update customer estimate");
    }
}
```

### 3. Add Controller Endpoint

**File**: `Controllers/AdminOnSiteApprovalController.cs`

```csharp
/// <summary>
/// PUT /api/v1/admin/on-site-approval/update-customer-estimate
/// Updates customer estimate line items (qty, rate, amount).
/// Used by admin portal for editing customer estimates after creation.
/// </summary>
[HttpPut("update-customer-estimate")]
[Authorize] // Add appropriate authorization
public async Task<IActionResult> UpdateCustomerEstimate(
    [FromBody] UpdateCustomerEstimateRequest request)
{
    if (request.CustomerEstimateKey == Guid.Empty)
    {
        return BadRequest(ApiResponse<object>.Fail(
            "CustomerEstimateKey is required", 400));
    }

    if (request.LineItems == null || !request.LineItems.Any())
    {
        return BadRequest(ApiResponse<object>.Fail(
            "At least one line item is required", 400));
    }

    // Get admin info from claims
    var adminKey = GetAdminKeyFromClaims();
    var adminName = GetAdminNameFromClaims();

    var result = await _service.UpdateCustomerEstimateAsync(
        request, adminKey, adminName);

    if (!result.Status)
        return StatusCode(result.ResponseCode, result);

    return Ok(result);
}
```

## Database Tables Affected

### `CustomerEstimate`
- `CustomerTotal` - Recalculated
- `OverallMarkupPercent` - Recalculated
- `ModifyDate` - Updated
- `ModifyBy` - Set to admin name

### `CustomerEstimateDetail`
- `CustomerQty` - Updated from request
- `CustomerRate` - Updated from request
- `CustomerAmount` - Updated from request
- `CalculatedMarkupPercent` - Recalculated per line
- `ModifyDate` - Updated
- `ModifyBy` - Set to admin name

## Validation Rules

1. **Customer Estimate Key**: Must exist, cannot be Guid.Empty
2. **Line Items**: At least one required
3. **Line Item Keys**: Must belong to the customer estimate
4. **Amounts**: Must be non-negative
5. **Qty/Rate**: Must be > 0
6. **Authorization**: Admin must have permission to edit estimates

## Security Considerations

1. Verify admin has permission to edit this estimate
2. Log all changes for audit trail
3. Validate that estimate is not already approved/locked
4. Consider adding estimate status check (e.g., can't edit if already approved by customer)

## Testing Checklist

- [ ] Endpoint returns 404 if customer estimate not found
- [ ] Endpoint returns 400 if invalid line item keys
- [ ] Successfully updates qty, rate, amount for line items
- [ ] Correctly recalculates customer total
- [ ] Correctly recalculates markup percentages
- [ ] Updates ModifyDate and ModifyBy fields
- [ ] Handles concurrent updates gracefully
- [ ] Returns proper error messages for validation failures
- [ ] Logs successful updates
- [ ] Integration test with frontend auto-save

## Current Status

- ✅ Frontend implementation complete
- ❌ Backend endpoint **NOT implemented** (needs to be created)
- ❌ Not documented in API mapping

## Related Documentation

- `CustomerEstimate-Email-Implementation.md` - Customer estimate creation flow
- `ON_SITE_APPROVAL_API_MAPPING.md` - Should be updated to include this endpoint
- `FIXED-CostIncurred-Issue.md` - Frontend fix that uses this endpoint

## Priority

**HIGH** - Frontend auto-save feature depends on this endpoint. Without it, admins cannot edit customer estimates after creation.
