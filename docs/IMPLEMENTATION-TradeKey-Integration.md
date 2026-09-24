# Trade Key Integration for Vendor Rates API

## Overview

This implementation passes the `tradeKey` from the parent component (`assign-vendor`) to the on-site estimate modal, eliminating the need for the backend to perform an extra database lookup to determine the job's trade.

## Problem Statement

Previously, the frontend was calling the vendor rates API without passing the `tradeKey`:

```typescript
this.assignVendorSvc.getVendorRatesLegacy(this.vendorKey(), undefined)
```

This forced the backend to:
1. Look up the job in the database
2. Extract the trade key from the job record
3. Then proceed with the rate hierarchy lookup

This was inefficient because the `tradeKey` was already available in the parent component's `pageContext`.

## Solution

### What Was Changed

#### 1. On-Site Estimate Modal Component (`on-site-estimate-modal.component.ts`)

**Added `tradeKey` signal:**
```typescript
readonly tradeKey = signal<string | null>(null);
```

**Updated `open()` method signature:**
```typescript
open(
  jobKey: string,
  vendorKey: string,
  customerEmail?: string | null,
  customerDne?: number,
  vendorDne?: number,
  tradeKey?: string | null  // ← NEW parameter
): void
```

**Updated `loadVendorRates()` method:**
```typescript
private loadVendorRates(): void {
  const tradeKeyValue = this.tradeKey();
  
  console.log('💰 Loading LEGACY vendor rates for vendor:', this.vendorKey());
  console.log('   Job Key:', this.jobKey());
  console.log('   Trade Key:', tradeKeyValue || '(not provided - backend will look up from job)');
  
  this.isLoadingRates.set(true);
  
  // Pass tradeKey if available from parent component (pageContext.tradeKey)
  // If not available, pass undefined and backend will look it up from the job
  
  this.assignVendorSvc
    .getVendorRatesLegacy(this.vendorKey(), tradeKeyValue || undefined)
    .subscribe({
      // ... rest of the method
    });
}
```

#### 2. Assign Vendor Component (`assign-vendor.component.ts`)

**Updated modal open call to include tradeKey:**
```typescript
// Get trade key from page context
const tradeKey = this.pageContext()?.tradeKey || null;
console.log('  - Trade Key for modal:', tradeKey);

this.onSiteEstimateModal?.open(
  jobKey, 
  vendor.vendorKey, 
  customerEmail, 
  customerDne, 
  vendorDne, 
  tradeKey  // ← NEW parameter
);
```

## Benefits

### 1. **Performance Improvement**
- Eliminates an extra database query on the backend
- Faster response time for vendor rates API

### 2. **Cleaner Architecture**
- Data flows from where it's already available (parent component)
- No need for the backend to reverse-lookup the job's trade

### 3. **Backward Compatible**
- `tradeKey` parameter is **optional**
- If not provided, backend still works (falls back to job lookup)
- No breaking changes to existing code

### 4. **No Backend Changes Required**
- Backend already supports receiving `tradeKey` parameter
- Backend already has fallback logic if `tradeKey` is not provided
- This is purely a frontend optimization

## How It Works

### Data Flow

```
1. User clicks "Provide On-Site Approval" in assign-vendor component
   ↓
2. assign-vendor.component retrieves tradeKey from pageContext
   pageContext.tradeKey is already loaded from the initial page load
   ↓
3. assign-vendor.component passes tradeKey to modal.open()
   ↓
4. Modal stores tradeKey in signal
   ↓
5. Modal calls loadVendorRates() which passes tradeKey to API
   ↓
6. Backend receives tradeKey and skips the job lookup step
   ↓
7. Backend follows vendor rate hierarchy:
   - VendorTrade (specific trade) ← Uses the provided tradeKey directly
   - VendorTrade ("All Trades")
   - VendorRates (general)
   - $0 fallback
```

### API Call

**Before:**
```http
GET /api/v1/admin/on-site-approval/vendor-rates-legacy?vendorKey={guid}
```

**After:**
```http
GET /api/v1/admin/on-site-approval/vendor-rates-legacy?vendorKey={guid}&tradeKey={guid}
```

## Testing

### Manual Testing Steps

1. Navigate to a job in the Assign Vendor tab
2. Select a vendor and click "Provide On-Site Approval"
3. Check browser console for log messages:
   ```
   💰 Loading LEGACY vendor rates for vendor: {vendorKey}
      Job Key: {jobKey}
      Trade Key: {tradeKey}  ← Should show actual GUID, not "(not provided)"
   ```
4. Check network tab for the API call
5. Verify that `tradeKey` parameter is included in the query string
6. Verify that vendor rates are loaded correctly

### Expected Behavior

- **With tradeKey provided:** API call includes `tradeKey` parameter
- **Without tradeKey (edge case):** API call works without `tradeKey`, backend falls back to job lookup

### Console Logs

The implementation includes detailed logging:

```
🔍 DEBUG - Modal Opening:
  - Job Key: {jobKey}
  - Vendor Key: {vendorKey}
  - Trade Key: {tradeKey}  ← Should show actual value
  - Customer Email Param: {email}
  - Customer DNE: {amount}
  - Vendor DNE: {amount}

  - Trade Key Signal After Set: {tradeKey}
```

## Files Modified

1. `src/app/shared/components/on-site-estimate-modal/on-site-estimate-modal.component.ts`
   - Added `tradeKey` signal
   - Updated `open()` method signature
   - Updated `loadVendorRates()` method

2. `src/app/features/job/assign-vendor/assign-vendor.component.ts`
   - Updated `openOnSiteApprovalModal()` method to pass `tradeKey`

## Rollback Plan

If issues arise, rollback is simple:

1. Remove `tradeKey` parameter from `onSiteEstimateModal?.open()` call in `assign-vendor.component.ts`
2. Revert `loadVendorRates()` to pass `undefined` for tradeKey
3. Remove `tradeKey` signal from modal component

The backend will continue to work as before, performing the job lookup.

## Future Enhancements

### Option 1: Add tradeKey to Backend Init Response (Optional)

If desired, the backend could also include `tradeKey` in the `/initialize/{jobKey}` endpoint response. This would provide redundancy and verification.

**Changes needed:**
- Update `OnSiteEstimateInitResponse` interface to include `tradeKey`
- Backend would need to modify the initialization endpoint

**Benefits:**
- Double-verification of trade key
- Useful for debugging mismatches

**Tradeoffs:**
- Requires backend changes
- Not necessary for functionality (data already available in parent)

### Option 2: Add Trade Name Display

Consider displaying the trade name in the modal header for user clarity:

```html
<h2>Provide On-Site Approval - {{tradeName}}</h2>
```

This would help users verify they're working with the correct trade.

## Summary

✅ **Implementation Complete**
- Trade key is now passed from parent to modal
- API calls include `tradeKey` parameter when available
- Backend performs one less database query
- Backward compatible with no breaking changes
- No backend modifications required

🚀 **Ready for Testing**
- All TypeScript changes complete
- No linter errors
- Comprehensive logging for debugging
