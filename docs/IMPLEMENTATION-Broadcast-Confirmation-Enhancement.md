# Broadcast Confirmation Modal Enhancement

## Overview

Enhanced the "Broadcast to Vendors" confirmation modal to handle multiple scenarios based on:
1. Vendor ETA status (with/without ETA)
2. Job type (Standard/Emergency vs Project/Bid Request)

## Status

✅ **COMPLETE** - Conditional modal options based on job type and vendor status

## What Was Implemented

### 1. New Computed Properties (`assign-vendor.component.ts`)

Added three computed properties to track different vendor states:

```typescript
/** Vendors who have accepted and set ETA */
assignedVendorsWithEta = computed(() => {
  const vendors = this.jobHeaderDetail()?.assignedVendors || [];
  return vendors.filter(v => v.scheduleDateIso || v.scheduleDate);
});

/** Vendors who are assigned but haven't set ETA */
assignedVendorsWithoutEta = computed(() => {
  const vendors = this.jobHeaderDetail()?.assignedVendors || [];
  return vendors.filter(v => !v.scheduleDateIso && !v.scheduleDate);
});

/** Total assigned vendors (with or without ETA) */
allAssignedVendors = computed(() => {
  return this.jobHeaderDetail()?.assignedVendors || [];
});
```

### 2. Updated Broadcast Logic (`onBroadcastToVendors()`)

Changed the trigger logic to show modal whenever ANY vendors are assigned:

**Before:**
```typescript
// Only checked for vendors with ETA
if (vendorsWithEta.length > 0) {
  // Show modal
}
```

**After:**
```typescript
// Check for ANY assigned vendors (with or without ETA)
if (allVendors.length > 0) {
  // Show modal
}
```

### 3. Enhanced Modal Content (`assign-vendor.component.html`)

#### A. Dynamic Warning Message

Shows different messages based on vendor status:

**Vendors with ETA:**
```
You have X vendor(s) who have accepted and set ETA.
What would you like to do?
```

**Vendors without ETA:**
```
You have X vendor(s) who haven't accepted and set ETA.
What would you like to do?
```

#### B. Enhanced Vendor List

Shows all assigned vendors with their status:

```html
@for (vendor of allAssignedVendors(); track vendor.jobVendorKey) {
  <div class="broadcast-confirm-vendor-item">
    <strong>{{ vendor.vendorName }}</strong>
    @if (vendor.scheduleDate) {
      <span class="broadcast-confirm-eta">ETA: {{ vendor.scheduleDate }}</span>
    } @else {
      <span class="broadcast-confirm-eta broadcast-confirm-eta--no-eta">No ETA set</span>
    }
  </div>
}
```

**Visual:**
- Vendors with ETA: Show schedule date (gray text)
- Vendors without ETA: Show "No ETA set" badge (red background)

#### C. Conditional Radio Options

Options now change based on job type:

**For Standard/Emergency Jobs:**
- ✅ Remove existing vendor(s) first
- ✅ Cancel broadcast
- ❌ Keep and broadcast (hidden)

**For Project/Bid Request Jobs:**
- ✅ Remove existing vendor(s) first
- ✅ Cancel broadcast
- ✅ Keep existing vendor(s) and broadcast to more

```html
<!-- Option 3: Only shown for Project/Bid Request -->
@if (jobHeaderDetail(); as hd) {
  @if (isBidOrProjectJobType(hd.jobTypeKey)) {
    <label class="broadcast-confirm-option">
      <!-- "Keep and broadcast to more" option -->
    </label>
  }
}
```

### 4. CSS Styling (`assign-vendor.component.scss`)

Added styling for "No ETA set" badge:

```scss
.broadcast-confirm-eta {
  color: var(--text-secondary, #64748b);
  font-size: 0.85rem;
  
  &--no-eta {
    color: #dc2626;
    font-weight: 500;
    padding: 2px 8px;
    background: #fee2e2;
    border-radius: 4px;
  }
}
```

## Decision Logic Flow

### Scenario 1: No Vendors Assigned
```
User clicks "Broadcast to Vendors"
         ↓
No assigned vendors found
         ↓
Skip confirmation modal
         ↓
Open Broadcast Modal directly
```

### Scenario 2: Vendors with ETA (Standard/Emergency Job)
```
User clicks "Broadcast to Vendors"
         ↓
Vendors with ETA found
Job Type: Standard or Emergency
         ↓
Show Confirmation Modal with:
  - "X vendor(s) who have accepted and set ETA"
  - Vendor list (showing ETA dates)
  - Option 1: Remove vendor(s) first
  - Option 2: Cancel broadcast
  - (Option 3 HIDDEN)
```

### Scenario 3: Vendors without ETA (Standard/Emergency Job)
```
User clicks "Broadcast to Vendors"
         ↓
Vendors without ETA found
Job Type: Standard or Emergency
         ↓
Show Confirmation Modal with:
  - "X vendor(s) who haven't accepted and set ETA"
  - Vendor list (showing "No ETA set" badge)
  - Option 1: Remove vendor(s) first
  - Option 2: Cancel broadcast
  - (Option 3 HIDDEN)
```

### Scenario 4: Any Vendors (Project/Bid Request Job)
```
User clicks "Broadcast to Vendors"
         ↓
Any vendors found (with or without ETA)
Job Type: Project or Bid Request
         ↓
Show Confirmation Modal with:
  - Dynamic message based on ETA status
  - Vendor list (showing ETA or "No ETA set")
  - Option 1: Remove vendor(s) first
  - Option 2: Cancel broadcast
  - Option 3: Keep and broadcast to more ✅ SHOWN
```

## Job Type Detection

Uses existing helper methods:

```typescript
// Check if job is Project or Bid Request
isBidOrProjectJobType(jobTypeKey: string | null | undefined): boolean {
  const key = this.normalizeSelectKey(jobTypeKey ?? '');
  return key === AssignVendorComponent.BID_JOB_TYPE_KEY
    || key === AssignVendorComponent.PROJECT_JOB_TYPE_KEY;
}
```

**Job Type Constants:**
- `BID_JOB_TYPE_KEY = 'b2652bbb-fa8a-4382-9e2b-77ba60fbeae5'`
- `PROJECT_JOB_TYPE_KEY = 'bebc6067-145c-4dc7-9882-b2efa84053c8'`
- `EMERGENCY_JOB_TYPE_KEY = 'fc078fd5-5ddc-4088-8a9f-d982436e20fd'`

## User Experience

### Standard/Emergency Jobs
When broadcasting on standard or emergency jobs:
- Admins must choose between removing existing vendors or canceling
- No option to keep vendors and broadcast to more (prevents multiple vendors on non-bid jobs)
- Clear warning if vendors haven't set ETA yet

### Project/Bid Request Jobs
When broadcasting on project or bid request jobs:
- All three options available
- Admins can add more vendors while keeping existing ones
- Supports competitive bidding scenarios

### Visual Feedback
- Vendors with ETA: Gray "ETA: MM/DD/YYYY" text
- Vendors without ETA: Red "No ETA set" badge
- Dynamic pluralization ("vendor" vs "vendors", "has" vs "have")
- Loading state when removing vendors

## Testing Checklist

### Job Type Testing
- [ ] Standard job with vendor (with ETA) - 2 options shown
- [ ] Standard job with vendor (without ETA) - 2 options shown
- [ ] Emergency job with vendor (with ETA) - 2 options shown
- [ ] Emergency job with vendor (without ETA) - 2 options shown
- [ ] Project job with vendor (with ETA) - 3 options shown
- [ ] Project job with vendor (without ETA) - 3 options shown
- [ ] Bid Request job with vendor - 3 options shown

### Vendor Status Testing
- [ ] Single vendor with ETA - singular text ("vendor who has")
- [ ] Multiple vendors with ETA - plural text ("vendors who have")
- [ ] Single vendor without ETA - singular text ("vendor who hasn't")
- [ ] Multiple vendors without ETA - plural text ("vendors who haven't")
- [ ] Mixed (some with ETA, some without) - shows all with correct badges

### Functional Testing
- [ ] Remove option removes ALL vendors (not just those with ETA)
- [ ] Cancel option closes modal without changes
- [ ] Keep option (when shown) opens broadcast modal with vendors intact
- [ ] "No ETA set" badge displays in red
- [ ] ETA dates display correctly
- [ ] Loading spinner shows when removing vendors
- [ ] Success message appears after vendor removal
- [ ] Broadcast modal opens after successful removal

### Edge Cases
- [ ] Job with no assigned vendors - skip modal entirely
- [ ] Job type change while modal open - options update correctly
- [ ] Vendor accepts/sets ETA while modal open - refreshes on next open

## Files Modified

1. **`src/app/features/job/assign-vendor/assign-vendor.component.ts`**
   - Added `assignedVendorsWithoutEta` computed property
   - Added `allAssignedVendors` computed property
   - Updated `onBroadcastToVendors()` to check for all assigned vendors
   - Updated `onBroadcastConfirmProceed()` to remove all vendors (not just those with ETA)

2. **`src/app/features/job/assign-vendor/assign-vendor.component.html`**
   - Added dynamic warning message based on vendor ETA status
   - Updated vendor list to show all vendors with status badges
   - Made "Keep and broadcast" option conditional on job type
   - Updated all text to use `allAssignedVendors()` instead of `assignedVendorsWithEta()`

3. **`src/app/features/job/assign-vendor/assign-vendor.component.scss`**
   - Added `.broadcast-confirm-eta--no-eta` modifier for red badge styling

## Business Rules Summary

### When to Show Modal
- **YES**: Any vendors assigned (with or without ETA)
- **NO**: No vendors assigned at all

### Radio Button Options

| Job Type | Option 1: Remove | Option 2: Cancel | Option 3: Keep & Broadcast |
|----------|------------------|------------------|----------------------------|
| Standard | ✅ Always | ✅ Always | ❌ Hidden |
| Emergency | ✅ Always | ✅ Always | ❌ Hidden |
| Project | ✅ Always | ✅ Always | ✅ Shown |
| Bid Request | ✅ Always | ✅ Always | ✅ Shown |

### Vendor Removal Scope
- **Remove option removes ALL assigned vendors**, regardless of ETA status
- This ensures clean slate before broadcasting to new vendors

## Summary

✅ **Implementation Complete**
- Modal now handles vendors with and without ETA
- Conditional options based on job type
- Clear visual distinction between vendor states
- Proper pluralization and grammar
- No breaking changes to existing functionality

🎯 **Business Logic**
- Standard/Emergency: 2 options (remove or cancel)
- Project/Bid Request: 3 options (remove, cancel, or keep)
- Always shows modal if ANY vendors assigned

🎨 **Visual Design**
- Red "No ETA set" badge for vendors without ETA
- Gray ETA text for vendors with scheduled dates
- Consistent styling with existing modal design
