# Profile Markup % Implementation Status

## Overview
The customer estimate comparison grid needs to display the **Profile Markup %** - the target markup percentage configured in the customer's profile. This allows admins to compare the target markup vs. the actual markup achieved.

## Current Status

### ✅ Frontend (COMPLETE)
The frontend has been prepared to receive and display the profile markup percentage:

1. **Model Updated** (`src/app/models/on-site-estimate.model.ts`)
   ```typescript
   export interface CustomerEstimateLineItem {
     // ... existing fields ...
     calculatedMarkupPercent: number;  // Actual markup achieved
     profileMarkupPercent?: number;    // Target markup from customer profile
   }
   ```

2. **UI Updated** (`on-site-estimate-modal.component.html`)
   - Profile Markup % column will display the value when available
   - Shows "—" dash if the backend hasn't provided it yet
   - Conditionally renders: `{{ item.profileMarkupPercent.toFixed(2) }}%`

### ⏳ Backend (PENDING)
The backend needs to add this field to the API response.

**Endpoint**: `POST /api/v1/admin/on-site-approval/create-customer-estimate`

**Required Change**: Add `profileMarkupPercent` to each line item in the response.

## Why We Need This

Currently, the comparison grid shows:
- ✅ **Actual Markup %** (calculatedMarkupPercent) - what was achieved after calculations
- ❌ **Profile Markup %** (profileMarkupPercent) - what the customer's profile says it should be

### Use Cases
1. **Verification**: Admins can verify if the markup matches the customer's profile configuration
2. **Discrepancy Detection**: Easily spot when actual markup differs from profile target
3. **Hour Adjustment Context**: Understand why hours were adjusted (to meet profile markup minimum)

### Example Scenario
```
Customer Profile: 35% labor markup

Vendor Labor: $100
Profile Target: $100 × 1.35 = $135 (35% markup)
Customer Rate: $50/hr
Hours Needed: $135 ÷ $50 = 2.7 hours

If vendor submitted 2 hours:
- System adjusts to 3 hours (next 0.5 increment)
- Actual: $50 × 3 = $150 (50% markup achieved)

Grid shows:
Profile Markup%: 35%  ← From customer profile
Actual Markup%: 50%   ← What was achieved (higher due to 0.5hr rounding)
```

## Backend Implementation Details

### Where to Pull Profile Markup %

The backend already uses these values during calculation, just needs to include them in the response:

1. **For Materials**:
   - Source: Customer's `materialMarkup%` field from customer profile/configuration
   - Used in calculation: `customerAmount = vendorAmount × (1 + materialMarkup%)`

2. **For Labor**:
   - Source: Customer's `laborMarkup%` field from customer profile/configuration
   - Used in calculation: `minimumAmount = vendorAmount × (1 + laborMarkup%)`

3. **For Trip Charges**:
   - Source: Same as labor - customer's `laborMarkup%`
   - Used in calculation: Same minimum threshold logic as labor

### Suggested Backend Code Change

```csharp
// In the method that creates CustomerEstimateLineItem objects
var lineItem = new CustomerEstimateLineItem
{
    // ... existing fields ...
    
    // Markup analysis
    CalculatedMarkupPercent = calculatedMarkup,
    ProfileMarkupPercent = item.LineType switch
    {
        "material" => customer.MaterialMarkupPercent,
        "labor" => customer.LaborMarkupPercent,
        "trip" => customer.LaborMarkupPercent,  // Trip uses same as labor
        _ => 0
    },
    
    // ... rest of fields ...
};
```

## Testing Plan

Once backend adds this field:

### Test Case 1: Materials
- Create estimate with material item
- Verify Profile Markup % displays customer's material markup from profile
- Verify Actual Markup % matches calculation

### Test Case 2: Labor (No Adjustment)
- Create estimate where customer rate already meets minimum
- Verify Profile Markup % = Actual Markup % (no adjustment needed)

### Test Case 3: Labor (With Hour Adjustment)
- Create estimate where hours must be adjusted to meet minimum
- Verify Profile Markup % shows the original target
- Verify Actual Markup % shows the higher achieved markup

### Test Case 4: Customer with 0% Markup
- Test with customer configured for 0% markup
- Verify Profile Markup % displays as "0.00%"

### Test Case 5: Missing Data
- If backend doesn't provide the field
- Verify UI shows "—" dash gracefully

## Documentation Updated

- ✅ `BACKEND-TODO-Update-Customer-Estimate-Endpoint.md` - Added requirement as priority #1
- ✅ `src/app/models/on-site-estimate.model.ts` - Added field to interface with comment
- ✅ `src/app/shared/components/on-site-estimate-modal/on-site-estimate-modal.component.html` - Updated to display when available

## Next Steps

1. **Backend Team**: Implement the change to include `profileMarkupPercent` in the API response
2. **Frontend Team**: Test the display once backend deploys the change
3. **QA**: Run through the test cases listed above

## Questions?

Contact the frontend team if you need clarification on:
- The exact field name we're expecting
- The format (should be a number like `35.5` for 35.5%, not `0.355`)
- Where in the response object it should appear
