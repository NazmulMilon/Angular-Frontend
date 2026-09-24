# FIXED: Cost Incurred/Proposed Issue

## Problem Summary
The frontend was sending **inverted** `costIncurred` values to the backend:
- Frontend was treating `0` as "Proposed" and `1` as "Incurred"
- Backend expects `0` as "Incurred" and `1` as "Proposed"

This caused all estimates to have incorrect cost status, affecting customer estimates and approval flows.

## Root Cause
The `CostIncurredType` enum in the frontend model had the values backwards compared to the backend API specification.

## Changes Made

### 1. Fixed the Enum Definition
**File**: `src/app/models/on-site-estimate.model.ts`

```typescript
// BEFORE (WRONG)
export enum CostIncurredType {
  Proposed = 0,  // ❌ Backend expects 0 = Incurred
  Incurred = 1,  // ❌ Backend expects 1 = Proposed
}

// AFTER (CORRECT)
export enum CostIncurredType {
  Incurred = 0,  // ✅ 0 = Already charged/completed (trip charges, completed work)
  Proposed = 1,  // ✅ 1 = Work to be done (labor, materials not yet purchased)
}
```

### 2. Fixed HTML Radio Button Values
**File**: `src/app/shared/components/on-site-estimate-modal/on-site-estimate-modal.component.html`

Swapped the radio button values to match the corrected enum:
- "Proposed" radio now has `[value]="1"`
- "Incurred" radio now has `[value]="0"`

**Applied to**: Trip Charge form, Materials form, and Labor form (3 occurrences)

### 3. Fixed Display Logic
**File**: `src/app/shared/components/on-site-estimate-modal/on-site-estimate-modal.component.html`

Updated conditional display logic:
```typescript
// BEFORE
{{ item.costIncurred === 1 ? 'Incurred' : 'Proposed' }}

// AFTER
{{ item.costIncurred === 0 ? 'Incurred' : 'Proposed' }}
```

**Applied to**: Trip charge display, Materials list, Labor list (3 occurrences)

### 4. Fixed Form Default Values
**File**: `src/app/shared/components/on-site-estimate-modal/on-site-estimate-modal.component.ts`

Updated constructor to use intelligent defaults:
- **Trip Charge Form**: Defaults to `CostIncurredType.Incurred` (0) - trips are already charged when arriving
- **Material Form**: Defaults to `CostIncurredType.Proposed` (1) - materials are work to be done
- **Labor Form**: Defaults to `CostIncurredType.Proposed` (1) - labor is work to be done

### 5. Fixed Infinite Saving Loop
**File**: `src/app/shared/components/on-site-estimate-modal/on-site-estimate-modal.component.ts`

Added proper save state management:
- Added `isSavingChanges` signal to track save-in-progress state
- Prevents duplicate simultaneous saves
- Clears `hasUnsavedChanges` immediately when save starts (prevents loop)
- Restores `hasUnsavedChanges` on save error
- Updates UI to show "Saving..." vs "Unsaved changes"

## Expected Backend Behavior

Now when vendors create estimates:

| Item Type | Default Status | costIncurred Value | Backend Interpretation |
|-----------|---------------|-------------------|------------------------|
| Trip Charge | **Incurred** | `0` | ✅ Already charged (correct) |
| Labor | **Proposed** | `1` | ✅ Work to be done (correct) |
| Materials | **Proposed** | `1` | ✅ Work to be done (correct) |

## Files Modified

1. `src/app/models/on-site-estimate.model.ts` - Fixed enum values
2. `src/app/shared/components/on-site-estimate-modal/on-site-estimate-modal.component.ts` - Fixed defaults and save loop
3. `src/app/shared/components/on-site-estimate-modal/on-site-estimate-modal.component.html` - Fixed radio buttons and display logic

## Testing Checklist

- [x] Code compiles without errors
- [x] No linter errors
- [ ] Vendor creates estimate with trip charge → Verify `costIncurred = 0` in API request
- [ ] Vendor creates estimate with labor → Verify `costIncurred = 1` in API request  
- [ ] Vendor creates estimate with materials → Verify `costIncurred = 1` in API request
- [ ] Customer estimate inherits correct values
- [ ] Customer sees correct labels ("Incurred" vs "Proposed")
- [ ] Edit customer estimate → Verify no infinite "Saving..." loop
- [ ] Admin can view and approve estimates with correct status
- [ ] Reports show correct incurred vs proposed totals

## Validation Steps

1. **Create a Test Estimate**:
   - Add a trip charge → Should default to "Incurred"
   - Add materials → Should default to "Proposed"
   - Add labor → Should default to "Proposed"

2. **Check Browser Console**:
   - Look for `📤 Save On-Site Estimate Request (Backend API Format)`
   - Verify `costIncurred` values in payload:
     - Trip: `costIncurred: 0`
     - Materials: `costIncurred: 1`
     - Labor: `costIncurred: 1`

3. **Verify Backend Database**:
   ```sql
   SELECT 
     ItemName,
     CostIncurred,
     CASE CostIncurred 
       WHEN 0 THEN 'Incurred' 
       WHEN 1 THEN 'Proposed' 
     END as Status
   FROM VendorEstimateDetail1
   WHERE VendorEstimateKey = '<your-estimate-key>'
   ```

## Related Issues

- Fixes issue described in `TODO-Fix-CostIncurred-Issue.md`
- Affects customer estimate creation (`CustomerEstimate-Email-Implementation.md`)
- Impacts on-site approval flow (`OnSiteApproval-Frontend-Integration-Guide.md`)

## Next Steps

1. Test with real vendor estimate creation
2. Verify customer estimates receive correct values
3. Check reporting dashboards for accuracy
4. Consider database migration script for existing incorrect estimates (see TODO file)
