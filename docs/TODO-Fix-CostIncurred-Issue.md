# TODO: Fix CostIncurred Issue in Vendor Estimates

## Problem
When vendors create estimates, all line items are being set to `costIncurred: 0` (Incurred), even for labor and materials that haven't been completed yet.

## Investigation Complete
See `FIX-CostIncurred-Not-Set-Properly.md` for full details.

## Next Steps

### 1. Find the Frontend Code (Vendor Portal)
**Goal**: Locate where vendors submit estimates and where `costIncurred` is being set.

**Files to check**:
- Vendor Portal frontend (likely Angular or React)
- Look for estimate submission form
- Search for `costIncurred` or `CostIncurred` in frontend code

**What to look for**:
```typescript
// Bad - defaulting everything to 0
itemList.forEach(item => {
  item.costIncurred = 0;  // ❌ WRONG
});

// Good - intelligent defaults
itemList.forEach(item => {
  if (item.itemName.toLowerCase().includes('trip')) {
    item.costIncurred = 0;  // Trip charges are incurred
  } else {
    item.costIncurred = 1;  // Labor/materials are proposed
  }
});
```

### 2. Implement Frontend Fix
**Option A: Add UI Control**
- Add radio buttons or toggle for each line item: "Incurred" / "Proposed"
- Let vendor explicitly choose for each item
- Pre-select intelligent defaults (trip=incurred, labor/materials=proposed)

**Option B: Apply Intelligent Defaults** (Quicker fix)
- Update the estimate submission logic to set:
  - Trip charges → `costIncurred = 0` (Incurred)
  - Labor items → `costIncurred = 1` (Proposed)
  - Material items → `costIncurred = 1` (Proposed)

### 3. Update API Documentation
**File**: `Controllers/VendorEstimateController.cs`
**Lines**: 180-233 (example JSON payloads)

Fix the examples to show correct `costIncurred` values:
```json
{
  "itemName": "Flat Rate Trip Charge",
  "costIncurred": 0,  // ✅ Incurred (already charged)
},
{
  "itemName": "Standard Hourly Rate",
  "description": "Proposed work: Repair refrigeration unit",
  "costIncurred": 1,  // ✅ Proposed (work to be done)
},
{
  "itemName": "MATERIALS",
  "description": "Materials proposed: Replacement parts",
  "costIncurred": 1,  // ✅ Proposed (not yet purchased)
}
```

### 4. Add Backend Validation (Optional)
**File**: `Repository/ManageVendorActionRepository.cs`
**Method**: `SaveVendorEstimate`

Add logging to warn when suspicious values are detected:
```cs
// Before serialization
foreach (var estimate in estimateList)
{
    if (estimate.ItemList != null)
    {
        var suspiciousItems = estimate.ItemList
            .Where(item => item.CostIncurred == 0 && 
                          (item.ItemName?.ToLower().Contains("material") == true ||
                           item.IsLineItemLaborOrOthers == true))
            .ToList();
        
        if (suspiciousItems.Any())
        {
            _logger.LogWarning(
                "Vendor estimate for JobKey={JobKey} has {Count} line items marked as Incurred that may be Proposed work. " +
                "Items: {Items}",
                jobKey, 
                suspiciousItems.Count,
                string.Join(", ", suspiciousItems.Select(i => i.ItemName)));
        }
    }
}
```

### 5. Database Fix for Existing Estimates (One-time script)
Create a SQL script to fix existing estimates:

```sql
-- Fix labor items incorrectly marked as Incurred
UPDATE VendorEstimateDetail1
SET CostIncurred = 1  -- Change to Proposed
WHERE CostIncurred = 0 
  AND MarkAsIncurredCmt IS NULL  -- Not explicitly marked as incurred
  AND MarkNotNeededCmt IS NULL;  -- Not marked as not needed

-- Fix material items incorrectly marked as Incurred  
UPDATE VendorEstimateDetail
SET CostIncurred = 1  -- Change to Proposed
WHERE CostIncurred = 0
  AND ItemName LIKE '%MATERIAL%'
  AND MarkAsIncurredCmt IS NULL
  AND MarkNotNeededCmt IS NULL;

-- DO NOT change trip charges (they should remain as Incurred)
```

**⚠️ WARNING**: Only run this after verifying which estimates are affected and getting approval.

### 6. Testing Checklist
After implementing the fix:

- [ ] Vendor creates new estimate with trip charge → Verify `CostIncurred = 0`
- [ ] Vendor creates new estimate with labor → Verify `CostIncurred = 1`
- [ ] Vendor creates new estimate with materials → Verify `CostIncurred = 1`
- [ ] Customer estimate inherits correct values
- [ ] Customer sees correct labels ("Completed Work" vs "Proposed Work")
- [ ] Admin can still edit and change Incurred/Proposed status
- [ ] Reports show correct incurred vs proposed totals

## Current Status
- ✅ Issue identified and documented
- ✅ Database investigation complete
- ⏳ Frontend code location pending
- ⏳ Frontend fix pending
- ⏳ Testing pending

## Priority
**HIGH** - Affects customer estimates and approval flow accuracy

## Estimated Effort
- Frontend fix (Option B): 1-2 hours
- Testing: 1 hour
- Total: 2-3 hours

## Related Issues
- May affect on-site approval logic if it checks incurred vs proposed
- May affect reporting and analytics on estimate costs
- Customer dashboard may show incorrect information
