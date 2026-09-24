# ✅ COMPLETE: Profile Markup % Integration

## Status: FULLY IMPLEMENTED (Frontend + Backend)

Both the frontend and backend are now configured to display the customer's profile markup percentage in the comparison grid.

---

## Backend Implementation ✅

### What Was Added:
The backend now includes `profileMarkupPercent` in the API response for `/create-customer-estimate`.

**New Field in Response**:
```csharp
public decimal? ProfileMarkupPercent { get; set; }
```

**How It's Populated**:
- **Materials**: Uses `customer.MaterialMarkUp` (e.g., 25%)
- **Labor**: Uses `customer.LaborAndTrip` (e.g., 35%)  
- **Trip Charges**: Uses `customer.LaborAndTrip` (e.g., 35%)

**Example API Response**:
```json
{
  "customerEstimateKey": "abc-123",
  "vendorTotal": 200.00,
  "customerTotal": 300.00,
  "lineItems": [
    {
      "chargeType": "Standard Hourly Rate(Tech 1)",
      "description": "Install new outlet",
      "vendorRate": 75.00,
      "vendorQty": 2.0,
      "vendorAmount": 150.00,
      "customerRate": 85.00,
      "customerQty": 2.5,
      "customerAmount": 212.50,
      "profileMarkupPercent": 35.0,      // ✅ NEW: Target from customer profile
      "calculatedMarkupPercent": 41.67,  // ✅ Actual markup achieved
      "wasHourAdjusted": true,
      "originalHours": 2.0,
      "adjustedHours": 2.5
    },
    {
      "chargeType": "Materials",
      "description": "Electrical materials",
      "vendorAmount": 50.00,
      "customerAmount": 62.50,
      "profileMarkupPercent": 25.0,      // ✅ NEW: From customer.MaterialMarkUp
      "calculatedMarkupPercent": 25.0    // ✅ Matches profile exactly
    }
  ]
}
```

---

## Frontend Implementation ✅

### Model Updated (`src/app/models/on-site-estimate.model.ts`)
```typescript
export interface CustomerEstimateLineItem {
  // ... other fields ...
  
  // Markup analysis
  calculatedMarkupPercent: number;  // Actual markup achieved
  profileMarkupPercent?: number;    // Target markup from customer profile
  
  // ... other fields ...
}
```

### UI Display (`on-site-estimate-modal.component.html`, line 923-929)
```html
<td class="comparison-table__cell comparison-table__cell--number">
  @if (item.profileMarkupPercent !== undefined && item.profileMarkupPercent !== null) {
    {{ item.profileMarkupPercent.toFixed(2) }}%
  } @else {
    —
  }
</td>
```

**Behavior**:
- If backend provides the value → Displays "35.00%"
- If backend doesn't provide it → Displays "—" (graceful fallback)

---

## Comparison Grid Display

The grid now shows **both** markup percentages side-by-side:

| Column | Description | Source |
|--------|-------------|--------|
| **Profile Markup %** | Target markup from customer's profile configuration | `customer.MaterialMarkUp` or `customer.LaborAndTrip` |
| **Actual Markup %** | The markup that was actually achieved after calculations | Calculated: `((customerAmount - vendorAmount) / vendorAmount) * 100` |

### Why Both Are Needed:

**Scenario 1: Hour Adjustment**
```
Profile Markup: 35%
Vendor Labor: $100 (2 hours @ $50/hr)
Target: $135 (35% markup)

Customer Rate: $60/hr
Hours Needed: $135 ÷ $60 = 2.25 hrs
System Adjusts: 2.5 hrs (next 0.5 increment)

Result:
- Profile Markup %: 35%    ← What the profile says
- Actual Markup %: 50%     ← What was achieved ($150 vs $100)
```

**Scenario 2: Materials (No Adjustment)**
```
Profile Markup: 25%
Vendor Materials: $50
Calculation: $50 × 1.25 = $62.50

Result:
- Profile Markup %: 25%    ← What the profile says
- Actual Markup %: 25%     ← Matches exactly (no adjustment needed)
```

---

## Testing Checklist

### ✅ Test Scenarios

1. **Materials Line Item**
   - [ ] Verify `profileMarkupPercent` displays customer's material markup %
   - [ ] Verify it matches the customer's profile setting
   - [ ] Verify `calculatedMarkupPercent` equals `profileMarkupPercent` (no adjustments for materials)

2. **Labor - No Hour Adjustment**
   - [ ] When customer rate already meets minimum
   - [ ] Verify `profileMarkupPercent` shows labor markup from profile
   - [ ] Verify `calculatedMarkupPercent` is close to `profileMarkupPercent`

3. **Labor - With Hour Adjustment**
   - [ ] When hours must be adjusted to meet minimum markup
   - [ ] Verify `profileMarkupPercent` shows the original target
   - [ ] Verify `calculatedMarkupPercent` is higher (due to hour rounding)
   - [ ] Verify `wasHourAdjusted` badge appears

4. **Trip Charges**
   - [ ] Verify `profileMarkupPercent` shows labor markup % (trip uses same)
   - [ ] Verify calculation matches expectations

5. **Customer with 0% Markup**
   - [ ] Test with customer configured for 0% markup
   - [ ] Verify displays as "0.00%" (not dash or null)

6. **Edge Cases**
   - [ ] Verify graceful handling if backend doesn't send the field
   - [ ] Verify correct formatting (2 decimal places)
   - [ ] Verify column alignment with other numeric columns

---

## Visual Example

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  📊 Vendor vs Customer Estimate Comparison                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Vendor Total: $200.00    Customer Total: $300.00    Overall Markup: 50%   │
│                                                                              │
├───────────────────────┬───────────────────────────────────────────────────┤
│   VENDOR ESTIMATE     │         CUSTOMER ESTIMATE                          │
├───────────────────────┼───────────────────────────────────────────────────┤
│ Type │ Desc │ Qty │ $│ Type │ Desc │ Qty │ Rate │ Profile% │ Actual% │ $ │
├──────┼──────┼─────┼──┼──────┼──────┼─────┼──────┼──────────┼─────────┼───┤
│Labor │Work  │ 2.0 │$1│Labor │Work  │ 2.5 │$85.00│  35.00%  │ 41.67%  │$2 │
│      │      │     │5 │      │      │     │      │          │         │1  │
│      │      │     │0 │      │      │     │      │          │         │2  │
├──────┼──────┼─────┼──┼──────┼──────┼─────┼──────┼──────────┼─────────┼───┤
│Matl  │Wood  │ 1.0 │$5│Matl  │Wood  │ 1.0 │$62.50│  25.00%  │ 25.00%  │$6 │
│      │      │     │0 │      │      │     │      │          │         │2  │
└──────┴──────┴─────┴──┴──────┴──────┴─────┴──────┴──────────┴─────────┴───┘
```

In this example:
- **Labor**: Profile wanted 35%, but hour rounding achieved 41.67%
- **Materials**: Profile wanted 25%, and exactly 25% was achieved

---

## Benefits

### 1. **Transparency**
Admins can see both the target markup and what was actually achieved.

### 2. **Troubleshooting**
When actual markup differs from profile, admins can quickly identify:
- Hour adjustments
- Rate table mismatches
- Profile configuration issues

### 3. **Audit Trail**
Both values are stored in the database (`JobSalesInvoiceDetail.Perc` = actual, profile value tracked in customer record).

### 4. **Customer Compliance**
Ensures markups align with what was promised/configured for each customer.

---

## Database Storage

**Where It's Stored**:
- `JobSalesInvoiceDetail.Perc` = `calculatedMarkupPercent` (what was achieved)
- `Customer.MaterialMarkUp` = Profile markup for materials
- `Customer.LaborAndTrip` = Profile markup for labor and trip charges

**Relationship**:
```
JobSalesInvoice (customer estimate header)
  ├─ VendorEstimateKey → Links to vendor estimate
  └─ JobSalesInvoiceDetail (line items)
      ├─ Perc = calculatedMarkupPercent (stored)
      └─ profileMarkupPercent (calculated/sent in API, references Customer table)
```

---

## Files Changed

### Frontend:
1. ✅ `src/app/models/on-site-estimate.model.ts`
   - Added `profileMarkupPercent?: number` to interface

2. ✅ `src/app/shared/components/on-site-estimate-modal/on-site-estimate-modal.component.html`
   - Updated Profile Markup % column to display the value

### Backend:
1. ✅ `CustomModel/OnSiteApprovalDTO.cs`
   - Added `ProfileMarkupPercent` property

2. ✅ Material calculation method
   - Sets `ProfileMarkupPercent = customer.MaterialMarkUp`

3. ✅ Labor calculation method
   - Sets `ProfileMarkupPercent = customer.LaborAndTrip`

4. ✅ Trip calculation method
   - Sets `ProfileMarkupPercent = customer.LaborAndTrip`

---

## Next Steps

1. **Test with Real Data**
   - Create a test estimate with all three line types (material, labor, trip)
   - Verify both markup columns display correctly

2. **Verify Edge Cases**
   - Test with 0% markup customers
   - Test with missing rate table entries
   - Test with emergency jobs (overtime)

3. **User Training**
   - Inform admins about the new column
   - Explain the difference between profile vs. actual markup

---

## Support

If you encounter issues:
1. Check console logs for the API response
2. Verify `profileMarkupPercent` is present in the `lineItems` array
3. Check if customer has markup percentages configured in their profile
4. Review `Customer.MaterialMarkUp` and `Customer.LaborAndTrip` values in database

---

## Summary

✅ **Backend**: Now sends `profileMarkupPercent` in API response  
✅ **Frontend**: Displays the value in "Profile Markup %" column  
✅ **Fallback**: Shows "—" if value is missing (graceful degradation)  
✅ **Documentation**: Updated models, comments, and implementation guides  

**The integration is COMPLETE and ready for testing!** 🎉
