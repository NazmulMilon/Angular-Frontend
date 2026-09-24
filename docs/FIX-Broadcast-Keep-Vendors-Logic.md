# Fix: Broadcast "Keep Vendors" Option Logic

**Date**: July 1, 2026  
**Status**: ✅ Complete (Partial - awaiting MaxNoOfVendorAccept from backend)

## Problem

The broadcast confirmation modal was not following the correct business rules for when the "Keep existing vendors and broadcast to more" option should be available.

**Business Rules:**
1. **For Bid Request / Project jobs**: Admin can keep vendors if assigned vendor count < `MaxNoOfVendorAccept` (when `MaxNoOfVendorAccept` > 0)
2. **For other job types**: Admin can keep vendors if NONE of the assigned vendors have set ETA yet

**Previous Implementation:**
- ❌ Only showed "Keep" option for Bid Request / Project jobs
- ❌ Did NOT check `MaxNoOfVendorAccept`
- ❌ Did NOT allow "Keep" for non-Bid/Project jobs when no vendors have ETA

## Solution

### 1. Added `canKeepVendorsAndBroadcast` Computed Property

```typescript
canKeepVendorsAndBroadcast = computed(() => {
  const hd = this.jobHeaderDetail();
  if (!hd) return false;

  const isBidOrProject = this.isBidOrProjectJobType(hd.jobTypeKey);
  const vendorsWithEta = this.assignedVendorsWithEta();
  const allVendors = this.allAssignedVendors();

  if (isBidOrProject) {
    // For Bid/Project: Allow keeping vendors if under the max limit
    // TODO: Need to get MaxNoOfVendorAccept from backend
    // For now, always allow for Bid/Project jobs
    return true;
  } else {
    // For other job types: Allow only if NO vendors have set ETA
    return vendorsWithEta.length === 0 && allVendors.length > 0;
  }
});
```

### 2. Updated HTML to Use New Logic

**Before:**
```html
@if (jobHeaderDetail(); as hd) {
  @if (isBidOrProjectJobType(hd.jobTypeKey)) {
    <label>Keep and Broadcast option</label>
  }
}
```

**After:**
```html
@if (canKeepVendorsAndBroadcast()) {
  <label>Keep and Broadcast option</label>
}
```

## Current Behavior

### For Bid Request / Project Jobs:
- ✅ "Keep" option is ALWAYS shown
- ⚠️ TODO: Need to check against `MaxNoOfVendorAccept` once backend provides this field

### For Standard / Emergency / Other Job Types:
- ✅ "Keep" option is shown ONLY when NO vendors have set ETA
- ✅ If ANY vendor has set ETA, option is hidden (correct per business rules)

## Test Scenarios

### Scenario 1: Bid Request Job
- **Given**: Job type is "Bid Request"
- **And**: 2 vendors assigned (both have set ETA)
- **Then**: "Keep" option should be shown
- **Status**: ✅ Working

### Scenario 2: Standard Job with No ETA
- **Given**: Job type is "Standard"
- **And**: 2 vendors assigned (neither has set ETA)
- **Then**: "Keep" option should be shown
- **Status**: ✅ Working

### Scenario 3: Standard Job with ETA
- **Given**: Job type is "Standard"
- **And**: 2 vendors assigned (at least one has set ETA)
- **Then**: "Keep" option should NOT be shown
- **Status**: ✅ Working

### Scenario 4: Emergency Job with No ETA
- **Given**: Job type is "Emergency"
- **And**: 1 vendor assigned (no ETA set)
- **Then**: "Keep" option should be shown
- **Status**: ✅ Working

### Scenario 5: Project Job
- **Given**: Job type is "Project"
- **And**: 3 vendors assigned (all have set ETA)
- **Then**: "Keep" option should be shown
- **Status**: ✅ Working

## Pending Work

### Backend Integration Required

The `MaxNoOfVendorAccept` field needs to be added to the `JobHeaderDetail` model and returned by the backend:

**Model Update Needed:**
```typescript
export interface JobHeaderDetail {
  // ... existing fields ...
  
  /** Maximum number of vendors that can accept for Bid Request / Project jobs */
  maxNoOfVendorAccept?: number | null;
}
```

**Updated Logic (once backend provides the field):**
```typescript
if (isBidOrProject) {
  const maxAccept = hd.maxNoOfVendorAccept ?? 0;
  
  if (maxAccept <= 0) {
    // No limit set, always allow
    return true;
  }
  
  // Allow only if current count is below max
  return allVendors.length < maxAccept;
}
```

## Files Modified

### 1. `assign-vendor.component.ts`

**Lines 680-709**: Added `canKeepVendorsAndBroadcast` computed property
- Implements business rules for when "Keep" option should be available
- Checks job type (Bid/Project vs others)
- Checks if vendors have set ETA for non-Bid/Project jobs
- TODO comment for `MaxNoOfVendorAccept` integration

### 2. `assign-vendor.component.html`

**Lines 2467-2482**: Updated "Keep" option conditional
- Changed from `isBidOrProjectJobType(hd.jobTypeKey)` to `canKeepVendorsAndBroadcast()`
- Now follows correct business rules

## References

- Original requirement: "admin can keep vendors if the job is bid request or Project and assigned Vendor count <MaxNoOfVendorAccept if MaxNoOfVendorAccept>0"
- "admin can keep vendors if the job Priority is something else other than Bid request and Project and none of the assigned vendor still set ETA"

## Notes

- The `isBidOrProjectJobType()` helper method already exists and correctly identifies Bid Request and Project jobs
- The `assignedVendorsWithEta()` computed property correctly filters vendors who have set ETA
- Once `MaxNoOfVendorAccept` is available from backend, only 1 line needs to be updated in the computed property
