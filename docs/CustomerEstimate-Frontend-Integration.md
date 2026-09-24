# Customer Estimate Creation - Frontend Integration Guide

## Overview

This document describes the new **Customer Estimate Creation** feature that converts vendor estimates into customer-facing estimates with automatic markup calculations and rate lookups.

**When to use**: After a vendor estimate has been submitted for customer approval (status = 2), the system can now automatically create a customer estimate with proper markups applied.

---

## New API Endpoint

### `POST /api/v1/admin/on-site-approval/create-customer-estimate`

Creates a customer estimate from an approved vendor estimate by:
- Applying customer-specific markup percentages
- Looking up customer rate tables
- Adjusting labor hours to meet minimum margins
- Handling labor, materials, and trip charges with different logic

---

## Request/Response

### Request Body
```typescript
interface CreateCustomerEstimateRequest {
  vendorEstimateKey: string;  // GUID of the vendor estimate to convert
}
```

### Response Body
```typescript
interface CreateCustomerEstimateResponse {
  customerEstimateKey: string;  // GUID of the newly created customer estimate
  lineItems: CustomerEstimateLineItem[];
  vendorTotal: number;
  customerTotal: number;
  message: string;
}

interface CustomerEstimateLineItem {
  chargeType: string;              // "Standard Hourly Rate(Tech 1)", "Materials", etc.
  chargeTypeKey: string;           // GUID for the charge type
  description: string;             // Work description
  
  // Vendor pricing
  vendorRate: number;
  vendorQty: number;
  vendorAmount: number;
  
  // Customer pricing
  customerRate: number;
  customerQty: number;
  customerAmount: number;
  
  // Markup analysis
  calculatedMarkupPercent: number;
  
  // Labor hour adjustment (only for labor items)
  originalHours?: number;
  adjustedHours?: number;
  wasHourAdjusted: boolean;
  techCount?: number;
  
  // Metadata
  lineType: "labor" | "material" | "trip";
  costIncurred: number;            // 0 = proposed, 1 = incurred
  displayLevel?: number;
  vendorEstimateDetailKey?: string;
  vendorEstimateLaborKey?: string;
}
```

---

## Integration Points

### Where to Call This API

The new endpoint fits into the existing On-Site Approval flow at **Step 4B** (after submitting for customer approval):

```
Current Flow:
1. Initialize on-site approval modal
2. Admin fills in estimate details
3. Save vendor estimate
4A. [EXISTING] Submit for Customer Approval (sets status = 2)
4B. [NEW] Create Customer Estimate (converts vendor → customer pricing)
5. Redirect to customer estimate page
```

### Recommended Implementation

**Option 1: Automatic (Recommended)**
When the "Submit for Customer Approval" button is clicked:
1. Call existing `submit-for-customer-approval` endpoint
2. If successful, immediately call `create-customer-estimate` with the vendor estimate key
3. Redirect to the customer estimate edit page with the new `customerEstimateKey`

**Option 2: Manual**
Add a separate button "Create Customer Estimate" that appears after submitting for customer approval.

---

## Example Usage

### TypeScript/Angular Example

```typescript
async submitForCustomerApproval(vendorEstimateKey: string) {
  try {
    // Step 1: Submit vendor estimate for customer approval
    const submitResult = await this.http.post<ApiResponse<SubmitForCustomerApprovalResponse>>(
      `${this.baseUrl}/api/v1/admin/on-site-approval/submit-for-customer-approval`,
      { estimateKey: vendorEstimateKey }
    ).toPromise();

    if (!submitResult.success) {
      throw new Error(submitResult.message);
    }

    // Step 2: Create customer estimate from vendor estimate
    const createResult = await this.http.post<ApiResponse<CreateCustomerEstimateResponse>>(
      `${this.baseUrl}/api/v1/admin/on-site-approval/create-customer-estimate`,
      { vendorEstimateKey: vendorEstimateKey }
    ).toPromise();

    if (!createResult.success) {
      // Customer estimate creation failed - log warning but don't block
      console.warn('Failed to auto-create customer estimate:', createResult.message);
      // Fallback: redirect to manual customer estimate creation
      this.router.navigate(['/estimate/create-from-vendor', vendorEstimateKey]);
      return;
    }

    // Step 3: Success - redirect to customer estimate page
    const customerEstimateKey = createResult.data.customerEstimateKey;
    this.router.navigate(['/estimate/edit', customerEstimateKey]);

    // Optional: Show success message with markup summary
    this.toastr.success(
      `Customer estimate created: $${createResult.data.customerTotal.toFixed(2)} ` +
      `(from vendor $${createResult.data.vendorTotal.toFixed(2)})`,
      'Estimate Conversion Complete'
    );

  } catch (error) {
    console.error('Error in customer approval workflow:', error);
    this.toastr.error('Failed to submit estimate for customer approval');
  }
}
```

### cURL Example (for testing)

```bash
# Step 1: Submit for customer approval
curl -X POST "https://localhost:7028/api/v1/admin/on-site-approval/submit-for-customer-approval" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"estimateKey": "a135ae1f-ba95-4eef-8afe-33dfbe7c0a34"}'

# Step 2: Create customer estimate
curl -X POST "https://localhost:7028/api/v1/admin/on-site-approval/create-customer-estimate" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"vendorEstimateKey": "a135ae1f-ba95-4eef-8afe-33dfbe7c0a34"}'
```

---

## Response Example

```json
{
  "success": true,
  "message": "Customer estimate created",
  "data": {
    "customerEstimateKey": "f5e8c7b3-2a41-4e9d-8f73-9c1d6e4a8b2f",
    "vendorTotal": 250.00,
    "customerTotal": 337.50,
    "lineItems": [
      {
        "chargeType": "Standard Hourly Rate(Tech 1)",
        "chargeTypeKey": "FBD282B5-9B58-455B-A11F-04707561F439",
        "description": "Install new electrical outlet",
        "vendorRate": 75.00,
        "vendorQty": 2.0,
        "vendorAmount": 150.00,
        "customerRate": 85.00,
        "customerQty": 2.5,
        "customerAmount": 212.50,
        "calculatedMarkupPercent": 41.67,
        "originalHours": 2.0,
        "adjustedHours": 2.5,
        "wasHourAdjusted": true,
        "techCount": 1,
        "lineType": "labor",
        "costIncurred": 0,
        "displayLevel": 1
      },
      {
        "chargeType": "Materials",
        "chargeTypeKey": "26D12240-A2B0-4854-A7EB-4C4839B2D056",
        "description": "Wood, screws, wire",
        "vendorRate": 5.00,
        "vendorQty": 1.0,
        "vendorAmount": 5.00,
        "customerRate": 6.00,
        "customerQty": 1.0,
        "customerAmount": 6.00,
        "calculatedMarkupPercent": 20.00,
        "wasHourAdjusted": false,
        "lineType": "material",
        "costIncurred": 0,
        "displayLevel": 2
      },
      {
        "chargeType": "Flat Rate Trip Charge",
        "chargeTypeKey": "F3422FF6-7C16-4207-B886-85122AF10B09",
        "description": "Trip to site",
        "vendorRate": 95.00,
        "vendorQty": 1.0,
        "vendorAmount": 95.00,
        "customerRate": 119.00,
        "customerQty": 1.0,
        "customerAmount": 119.00,
        "calculatedMarkupPercent": 25.26,
        "wasHourAdjusted": false,
        "lineType": "trip",
        "costIncurred": 0,
        "displayLevel": 3
      }
    ]
  },
  "responseCode": 200,
  "traceId": "00-abc123..."
}
```

---

## Key Features to Highlight in UI

### 1. Hour Adjustment Indicator
When `wasHourAdjusted = true`, show a visual indicator:
```typescript
<div *ngIf="lineItem.wasHourAdjusted" class="alert alert-info">
  <i class="fa fa-info-circle"></i>
  Hours adjusted from {{lineItem.originalHours}} to {{lineItem.adjustedHours}} 
  to meet {{lineItem.calculatedMarkupPercent}}% minimum markup
</div>
```

### 2. Markup Summary Card
Display a comparison of vendor vs customer totals:
```typescript
<div class="markup-summary">
  <div class="row">
    <div class="col-md-6">
      <strong>Vendor Total:</strong> ${{vendorTotal | number:'1.2-2'}}
    </div>
    <div class="col-md-6">
      <strong>Customer Total:</strong> ${{customerTotal | number:'1.2-2'}}
    </div>
  </div>
  <div class="row">
    <div class="col-md-12">
      <strong>Overall Markup:</strong> 
      {{((customerTotal - vendorTotal) / vendorTotal * 100) | number:'1.2-2'}}%
    </div>
  </div>
</div>
```

### 3. Line Item Breakdown Table
```typescript
<table class="table">
  <thead>
    <tr>
      <th>Item</th>
      <th>Vendor Rate</th>
      <th>Vendor Qty</th>
      <th>Vendor Amount</th>
      <th>Customer Rate</th>
      <th>Customer Qty</th>
      <th>Customer Amount</th>
      <th>Markup %</th>
    </tr>
  </thead>
  <tbody>
    <tr *ngFor="let item of lineItems" [class.adjusted]="item.wasHourAdjusted">
      <td>
        {{item.chargeType}}
        <span *ngIf="item.wasHourAdjusted" class="badge badge-warning">Adjusted</span>
      </td>
      <td>${{item.vendorRate | number:'1.2-2'}}</td>
      <td>{{item.vendorQty | number:'1.2-2'}}</td>
      <td>${{item.vendorAmount | number:'1.2-2'}}</td>
      <td>${{item.customerRate | number:'1.2-2'}}</td>
      <td>{{item.customerQty | number:'1.2-2'}}</td>
      <td>${{item.customerAmount | number:'1.2-2'}}</td>
      <td>{{item.calculatedMarkupPercent | number:'1.2-2'}}%</td>
    </tr>
  </tbody>
</table>
```

---

## Error Handling

### Possible Error Responses

| Status | Message | Cause | Frontend Action |
|--------|---------|-------|-----------------|
| 404 | "Vendor estimate not found" | Invalid vendor estimate key | Show error, don't retry |
| 404 | "Job not found" | Vendor estimate has no associated job | Show error, contact support |
| 404 | "Customer not found" | Job has no customer | Show error, check job setup |
| 500 | "Error creating customer estimate" | Database/calculation error | Show error, allow manual creation |

### Error Handling Example

```typescript
try {
  const result = await this.createCustomerEstimate(vendorEstimateKey);
} catch (error) {
  if (error.status === 404) {
    this.toastr.error(
      'Vendor estimate not found. Please refresh and try again.',
      'Creation Failed'
    );
  } else if (error.status === 500) {
    this.toastr.error(
      'Failed to create customer estimate. You can create it manually from the estimate page.',
      'Creation Failed'
    );
    // Offer fallback option
    this.showManualCreationOption(vendorEstimateKey);
  } else {
    this.toastr.error('Unexpected error occurred', 'Error');
  }
}
```

---

## Business Logic Summary

### How Pricing is Calculated

1. **Materials**
   - `customerAmount = vendorAmount * (1 + materialMarkup%)`
   - No rate table lookup
   - No quantity adjustment

2. **Labor**
   - Lookup customer rate from `CustomerTradeCharge` table by charge type + trade + customer
   - Calculate minimum: `vendorAmount * (1 + laborMarkup%)`
   - If `customerRate * hours * techCount < minimum`:
     - Increment hours by 0.5 until meeting minimum
   - If no customer rate exists: `customerAmount = $0` (admin must manually input)

3. **Trip Charges**
   - Same as labor for markup calculation
   - Uses customer rate from `CustomerTradeCharge` table
   - **NO hour adjustment** (unlike labor)
   - If customer rate doesn't meet minimum: `customerAmount = $0`

4. **Emergency Jobs**
   - Standard labor → converted to overtime rates
   - Flat trip charge → converted to overtime trip charge

---

## Testing Checklist

- [ ] Test with a simple estimate (1 labor + 1 trip + 1 material)
- [ ] Verify hour adjustment UI shows correctly when `wasHourAdjusted = true`
- [ ] Test with customer that has 0% markups
- [ ] Test with customer that has no rate table entries (should show $0.00)
- [ ] Test error handling for invalid vendor estimate key
- [ ] Verify correct redirect after successful creation
- [ ] Test with emergency job (verify overtime conversion)
- [ ] Verify markup summary card displays correctly
- [ ] Test with multiple labor items (different tech counts)
- [ ] Verify line items match database `JobSalesInvoiceDetail` records

---

## Database Records Created

When this endpoint succeeds, it creates:

1. **1 JobSalesInvoice record** (customer estimate header)
   - `InvoiceKey` = new GUID (returned as `customerEstimateKey`)
   - `VendoeEstimateKey` = vendor estimate key (note the typo in DB)
   - `CreatedFromVendorEstimate` = true
   - `IsEstimate` = true
   - `IsActive` = true

2. **N JobSalesInvoiceDetail records** (one per line item)
   - `InvoiceKey` = customer estimate key
   - `ChargeTypeKey` = charge type GUID
   - `Rate` = customer rate
   - `Qty` = customer quantity (may be adjusted for labor)
   - `Amt` = customer amount
   - `Perc` = calculated markup percentage
   - `VendorEstimateDetailKey` = links back to vendor line item

3. **1 AdminActionNote record** (audit log)
   - Documents the creation with totals

---

## Next Steps for Frontend

1. **Add the API call** to your service layer (as shown in examples above)
2. **Integrate into existing flow** after "Submit for Customer Approval"
3. **Add UI components** for markup summary and hour adjustment indicators
4. **Update routing** to redirect to customer estimate edit page
5. **Add error handling** for edge cases
6. **Test with real data** using the job from earlier: `6af781b3-a771-4ea2-a90d-b6979080c56b`

---

## Questions?

If you need:
- Sample vendor estimate keys for testing
- Additional error scenarios covered
- UI mockups for the markup display
- Changes to the response structure

Let me know and I'll update this guide!
