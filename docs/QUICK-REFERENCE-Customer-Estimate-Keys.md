# Quick Reference: Customer Estimate Keys

## Key Relationships

### Database Schema

```
JobSalesInvoice (Customer Estimate)
│
├─ InvoiceKey = customerEstimateKey
│
└─ JobSalesInvoiceDetail (Customer Line Items)
   │
   ├─ DetailKey = customerEstimateDetailKey ⭐ REQUIRED FOR UPDATES
   │
   ├─ InvoiceKey → JobSalesInvoice.InvoiceKey
   │
   ├─ VendorEstimateDetailKey → JobVendorEstimateDetail.DetailKey (materials/trip)
   │
   └─ VendorEstimateLaborKey → JobVendorEstimateLabor.LaborKey (labor)
```

---

## Key Types

| Key Name | Purpose | Maps To | Used For |
|----------|---------|---------|----------|
| `customerEstimateKey` | Overall customer estimate | `JobSalesInvoice.InvoiceKey` | Identifying the entire estimate |
| `customerEstimateDetailKey` ⭐ | Individual customer line item | `JobSalesInvoiceDetail.DetailKey` | **Updating line items** |
| `vendorEstimateDetailKey` | Link to vendor material/trip | `JobVendorEstimateDetail.DetailKey` | Tracing back to vendor estimate |
| `vendorEstimateLaborKey` | Link to vendor labor | `JobVendorEstimateLabor.LaborKey` | Tracing back to vendor labor |

⭐ **This is the key that was missing and causing the 500 error**

---

## API Usage

### Create Customer Estimate

**Request**: `POST /create-customer-estimate`

```json
{
  "vendorEstimateKey": "12345678-1234-1234-1234-123456789abc"
}
```

**Response**:

```json
{
  "customerEstimateKey": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  "lineItems": [
    {
      "description": "Plumbing repair",
      "customerRate": 135.00,
      "customerQty": 2.0,
      "customerAmount": 270.00,
      
      // ⭐ The key needed for updates:
      "customerEstimateDetailKey": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
    }
  ]
}
```

### Update Customer Estimate

**Request**: `PUT /update-customer-estimate`

```json
{
  "customerEstimateKey": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  "lineItems": [
    {
      // ⭐ Must use customerEstimateDetailKey here:
      "lineItemKey": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      "customerQty": 2.5,
      "customerRate": 140.00,
      "customerAmount": 350.00
    }
  ]
}
```

---

## Frontend Code

### TypeScript Interface

```typescript
export interface CustomerEstimateLineItem {
  // Pricing
  customerRate: number;
  customerQty: number;
  customerAmount: number;
  
  // ⭐ Keys - Added in this fix:
  customerEstimateDetailKey?: string;  // REQUIRED for updates
  vendorEstimateDetailKey?: string;
  vendorEstimateLaborKey?: string;
}
```

### Save Method

```typescript
saveCustomerEstimate(): void {
  const updateRequest = {
    customerEstimateKey: response.customerEstimateKey,
    lineItems: response.lineItems.map((item: CustomerEstimateLineItem) => ({
      // ⭐ Use customerEstimateDetailKey (NOT vendorEstimateDetailKey):
      lineItemKey: item.customerEstimateDetailKey || '',
      customerQty: item.customerQty,
      customerRate: item.customerRate,
      customerAmount: item.customerAmount,
    })),
  };
  
  this.assignVendorSvc.updateCustomerEstimate(updateRequest).subscribe(...);
}
```

---

## Common Mistakes

### ❌ WRONG - Using vendor key

```typescript
lineItemKey: item.vendorEstimateDetailKey  // ❌ This causes 500 error
```

### ✅ CORRECT - Using customer key

```typescript
lineItemKey: item.customerEstimateDetailKey  // ✅ This works
```

---

## Troubleshooting

### Error: 500 Internal Server Error on update

**Cause**: Using wrong key (vendorEstimateDetailKey instead of customerEstimateDetailKey)

**Solution**:
1. Check that `createCustomerEstimate` response includes `customerEstimateDetailKey`
2. Verify frontend is using `item.customerEstimateDetailKey` for `lineItemKey`

### Error: "customerEstimateDetailKey is undefined"

**Cause**: Backend not returning the key

**Solution**: 
1. Verify backend has the fix from `FIX-Customer-Estimate-DetailKey-Missing.md`
2. Check that `CreateCustomerEstimateAsync` sets `CustomerEstimateDetailKey` property

---

## SQL Queries

### Verify Customer Estimate Line Items

```sql
SELECT 
    DetailKey,                    -- This is customerEstimateDetailKey
    InvoiceKey,                   -- Customer estimate key
    ItemName,
    Description,
    Rate,
    Qty,
    Amt,
    VendorEstimateDetailKey,      -- Link to vendor
    VendorEstimateLaborKey        -- Link to vendor labor
FROM JobSalesInvoiceDetail
WHERE InvoiceKey = '<customer-estimate-key>'
ORDER BY DetailKey;
```

### Trace From Vendor to Customer Estimate

```sql
-- Find customer line item from vendor detail key
SELECT 
    jsd.*
FROM JobSalesInvoiceDetail jsd
WHERE jsd.VendorEstimateDetailKey = '<vendor-estimate-detail-key>';

-- Or from vendor labor key
SELECT 
    jsd.*
FROM JobSalesInvoiceDetail jsd
WHERE jsd.VendorEstimateLaborKey = '<vendor-estimate-labor-key>';
```

---

## Testing

### Quick Test

1. Create customer estimate
2. Console log the response
3. Check for `customerEstimateDetailKey` in each line item
4. Try to save changes
5. Verify 200 OK (not 500 error)

### Console Verification

**Expected**:
```javascript
// After createCustomerEstimate:
response.lineItems[0].customerEstimateDetailKey
// → "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" ✅

// When saving:
updateRequest.lineItems[0].lineItemKey
// → "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" ✅

// Response:
✅ Customer estimate saved successfully: { status: true, ... }
```

**Not Expected**:
```javascript
// Missing key:
response.lineItems[0].customerEstimateDetailKey
// → undefined ❌

// Using wrong key:
updateRequest.lineItems[0].lineItemKey
// → "cccccccc-cccc-cccc-cccc-cccccccccccc" (vendorEstimateDetailKey) ❌

// Response:
❌ PUT /update-customer-estimate 500 (Internal Server Error)
```

---

## Key Files

### Backend
- `CustomModel/OnSiteApprovalDTO.cs` - Added property
- `Services/OnSiteApprovalService.cs` - Populated property

### Frontend
- `src/app/models/on-site-estimate.model.ts` - Added to interface
- `src/app/shared/components/on-site-estimate-modal/on-site-estimate-modal.component.ts` - Uses the key

### Documentation
- `FIX-Customer-Estimate-DetailKey-Missing.md` - Backend fix
- `INTEGRATION-COMPLETE-Customer-Estimate-Save.md` - Full integration
- `SUMMARY-Customer-Estimate-DetailKey-Fix.md` - Summary
- `QUICK-REFERENCE-Customer-Estimate-Keys.md` - This file

---

**Last Updated**: June 30, 2026  
**Status**: ✅ Complete
