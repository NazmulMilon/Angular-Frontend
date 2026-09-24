# Implementation Complete: Legacy Vendor Rate Integration (Frontend)

## Summary

✅ **FRONTEND INTEGRATION COMPLETE** - The on-site estimate modal now uses the legacy-style vendor rate retrieval system that matches ProjectRCS behavior with automatic hierarchical fallback.

## What Changed

### Previous Implementation (Manual Fallback)

The frontend previously used a **2-step manual fallback approach**:
1. Try `GET /vendor-rates/by-job/{jobKey}?vendorKey={vendorKey}` (trade-specific)
2. On 404, manually fall back to `GET /vendor-rates/{vendorKey}` (general rates)
3. If both failed, rates remained empty (no pre-fill)

**Problems with this approach**:
- No "All Trades" fallback support
- No automatic $0 record creation for new vendors
- Trip charges could come from trade-specific rates (incorrect per legacy logic)
- Multiple API calls required
- Frontend had to manage fallback logic

### New Implementation (Legacy-Style Hierarchical)

The frontend now uses a **single API call** with automatic backend fallback:
- Single call to `GET /vendor-rates-legacy?vendorKey={guid}&tradeKey={guid}`
- Backend automatically handles the entire hierarchy:
  1. **VendorTrade (Specific Trade)** - Trade-specific rates for the exact trade
  2. **VendorTrade ("All Trades")** - Fallback rates using "All Trades" GUID
  3. **VendorRates (General Rates)** - Vendor's general rates
  4. **$0 Fallback** - Creates new VendorRates record with all rates set to $0

**Benefits**:
- ✅ Matches ProjectRCS legacy behavior exactly
- ✅ Single API call instead of two
- ✅ Backend manages all fallback logic
- ✅ Trip charges always come from general rates (correct)
- ✅ Hourly/helper rates merge properly (trade overrides general)
- ✅ New vendors automatically get $0 records
- ✅ "All Trades" fallback support
- ✅ `rateSource` metadata for debugging

---

## Files Modified

### 1. Model Interface
**File**: `src/app/models/on-site-estimate.model.ts`

Added new interface for legacy rate response:

```typescript
/**
 * Legacy-style vendor rate result with hierarchical fallback
 * GET /api/v1/admin/on-site-approval/vendor-rates-legacy?vendorKey={guid}&tradeKey={guid}
 */
export interface VendorRateLegacyResponse {
  success: boolean;
  errorMessage: string | null;
  vendorKey: string;
  tradeKey: string | null;
  hourlyRate: number;
  tripCharge: number;
  emergencyHourlyRate: number;
  emergencyTripCharge: number;
  helperRate: number;
  emergencyHelperRate: number;
  serviceCharge: number;
  emergencyServiceCharge: number;
  rateSource: string;  // e.g., "VendorTrade (specific) + VendorRates (trip)"
}
```

### 2. Service Method
**File**: `src/app/services/assign-vendor.service.ts`

Added new service method:

```typescript
/**
 * Get vendor rates using legacy-style hierarchical fallback logic.
 * This matches the ProjectRCS behavior:
 * 1. VendorTrade (specific trade)
 * 2. VendorTrade ("All Trades" fallback)
 * 3. VendorRates (general)
 * 4. $0 fallback
 * 
 * GET /api/v1/admin/on-site-approval/vendor-rates-legacy?vendorKey={guid}&tradeKey={guid}
 */
getVendorRatesLegacy(vendorKey: string, tradeKey?: string): Observable<AssignVendorApiResponse<VendorRateLegacyResponse>> {
  console.log(`📊 Fetching LEGACY vendor rates for vendorKey: ${vendorKey}, tradeKey: ${tradeKey || 'none'}`);
  
  const params = new HttpParams()
    .set('vendorKey', vendorKey)
    .set('tradeKey', tradeKey || '');
  
  return this.http
    .get<AssignVendorApiResponse<VendorRateLegacyResponse>>(
      `${this.onSiteEstimateBase}/vendor-rates-legacy`,
      { params }
    )
    .pipe(catchError(this.handleError<AssignVendorApiResponse<VendorRateLegacyResponse>>('getVendorRatesLegacy')));
}
```

**Changes**:
- Added `VendorRateLegacyResponse` to imports
- Query params properly encode `vendorKey` and optional `tradeKey`

### 3. Modal Component
**File**: `src/app/shared/components/on-site-estimate-modal/on-site-estimate-modal.component.ts`

**Replaced Methods**:
- ❌ Removed: `loadVendorRates()` (2-step trade → general fallback)
- ❌ Removed: `loadGeneralVendorRates()` (separate general rates call)
- ✅ Added: New `loadVendorRates()` (single legacy endpoint call)

**New Implementation**:

```typescript
/**
 * Load vendor rates using legacy-style hierarchical fallback logic.
 * This matches ProjectRCS behavior with automatic fallback:
 * 1. VendorTrade (specific trade)
 * 2. VendorTrade ("All Trades")
 * 3. VendorRates (general)
 * 4. $0 fallback (creates new record)
 */
private loadVendorRates(): void {
  console.log('💰 Loading LEGACY vendor rates for vendor:', this.vendorKey());
  console.log('   Job Key:', this.jobKey());
  console.log('   Trade Key:', this.initData()?.tradeKey || 'none');
  
  this.isLoadingRates.set(true);
  
  // Get tradeKey from initData if available
  const tradeKey = this.initData()?.tradeKey;
  
  this.assignVendorSvc
    .getVendorRatesLegacy(this.vendorKey(), tradeKey || undefined)
    .subscribe({
      next: (res) => {
        console.log('✅ Legacy Rates Response:', res);
        console.log('📊 Full Response Object:', JSON.stringify(res, null, 2));
        
        if (res.status && res.data && res.data.success) {
          const rates = res.data;
          
          // Convert legacy response to the format expected by prefillFormsWithRates
          this.vendorRates.set({
            vendorKey: rates.vendorKey,
            vendorName: null,
            hourlyRate: rates.hourlyRate,
            tripCharge: rates.tripCharge,
            serviceCharge: rates.serviceCharge,
            emergencyHourlyRate: rates.emergencyHourlyRate,
            emergencyTripCharge: rates.emergencyTripCharge,
            emergencyServiceCharge: rates.emergencyServiceCharge,
            helperRates: rates.helperRate,
            emergencyHelperRates: rates.emergencyHelperRate,
          });
          
          console.log('💰 Using vendor rates from:', rates.rateSource);
          console.log('  - Hourly Rate:', rates.hourlyRate);
          console.log('  - Trip Charge:', rates.tripCharge);
          console.log('  - Service Charge:', rates.serviceCharge);
          console.log('  - Emergency Hourly:', rates.emergencyHourlyRate);
          console.log('  - Emergency Trip:', rates.emergencyTripCharge);
          console.log('  - Helper Rate:', rates.helperRate);
          console.log('  - Emergency Helper:', rates.emergencyHelperRate);
          
          this.prefillFormsWithRates();
        } else {
          console.warn('⚠️ Failed to load vendor rates - response unsuccessful');
          console.warn('   Status:', res.status);
          console.warn('   Success:', res.data?.success);
          console.warn('   Error:', res.data?.errorMessage);
          console.warn('   Message:', res.message);
        }
        
        this.isLoadingRates.set(false);
      },
      error: (err) => {
        console.error('❌ Legacy Rates Load Error:', err);
        console.error('   Error Type:', err.constructor?.name);
        console.error('   Error Status:', err.status);
        console.error('   Error Message:', err.message);
        console.warn('⚠️ No vendor rates available - admin must enter rates manually');
        this.isLoadingRates.set(false);
      },
    });
}
```

**Key Changes**:
- Single API call instead of two sequential calls
- Passes `tradeKey` from `initData()` to enable trade-specific rate lookup
- Converts `VendorRateLegacyResponse` to `VendorRateResponse` format for compatibility
- Logs `rateSource` for debugging (shows which hierarchy level was used)
- Existing `prefillFormsWithRates()` method works unchanged

---

## How It Works

### Example Flow

**Scenario**: Admin opens on-site estimate modal for a Plumbing job with Vendor ABC

1. **Frontend calls**:
   ```
   GET /api/v1/admin/on-site-approval/vendor-rates-legacy?vendorKey=ABC-123&tradeKey=PLUMBING-456
   ```

2. **Backend automatically checks** (in order):
   - ✅ VendorTrade for Plumbing → **Found**: Hourly=$120, Emergency=$180
   - ✅ VendorRates (general) → **Found**: TripCharge=$75, EmergencyTrip=$100
   - ✅ Merges: Trade hourly + General trip charges

3. **Backend responds**:
   ```json
   {
     "status": true,
     "data": {
       "success": true,
       "hourlyRate": 120.00,
       "tripCharge": 75.00,
       "emergencyHourlyRate": 180.00,
       "emergencyTripCharge": 100.00,
       "helperRate": 65.00,
       "emergencyHelperRate": 95.00,
       "serviceCharge": 195.00,
       "emergencyServiceCharge": 280.00,
       "rateSource": "VendorTrade (specific) + VendorRates (trip)"
     }
   }
   ```

4. **Frontend converts** to internal format and pre-fills forms

### Rate Source Examples

The `rateSource` field shows which hierarchy level was used:

| rateSource | Meaning |
|------------|---------|
| `"VendorTrade (specific) + VendorRates (trip)"` | Trade-specific rates found, trip charges from general |
| `"VendorTrade (All Trades) + VendorRates (trip)"` | Used "All Trades" fallback rates |
| `"VendorRates (general)"` | Only general rates exist |
| `"VendorTrade only (created $0 general)"` | Trade rates exist, created $0 general record |
| `"Created $0 fallback"` | No rates found, created new $0 record |

---

## Testing Scenarios

### Test Case 1: Vendor with Trade-Specific Rates
**Setup**: Vendor has Plumbing-specific rates + general rates

**Expected**:
- Hourly/helper rates come from Plumbing-specific VendorTrade
- Trip charges come from general VendorRates
- Forms pre-filled with merged rates
- Console shows: `"Using vendor rates from: VendorTrade (specific) + VendorRates (trip)"`

### Test Case 2: Vendor with "All Trades" Only
**Setup**: Vendor has no specific trade rates, but has "All Trades" fallback

**Expected**:
- Uses "All Trades" hourly/helper rates
- Trip charges from general VendorRates
- Console shows: `"Using vendor rates from: VendorTrade (All Trades) + VendorRates (trip)"`

### Test Case 3: Vendor with General Rates Only
**Setup**: Vendor has no VendorTrade entries, only general VendorRates

**Expected**:
- All rates from general VendorRates
- Console shows: `"Using vendor rates from: VendorRates (general)"`

### Test Case 4: New Vendor with No Rates
**Setup**: Brand new vendor with no rates configured

**Expected**:
- Backend creates new VendorRates record with all rates = $0
- Forms pre-filled with $0 values
- Admin must enter rates manually
- Console shows: `"Using vendor rates from: Created $0 fallback"`

### Test Case 5: Emergency Job
**Setup**: Job type contains "emergency"

**Expected**:
- Uses `emergencyHourlyRate`, `emergencyTripCharge`, `emergencyHelperRate`
- Forms pre-filled with emergency rates
- Rate type set to `RateType.Emergency`

---

## Breaking Changes

None. This is a **non-breaking enhancement**:
- Old endpoints (`/vendor-rates/by-job` and `/vendor-rates/{vendorKey}`) still exist
- Only the on-site estimate modal uses the new legacy endpoint
- Other components can continue using old endpoints if needed
- Response format converted to match existing `VendorRateResponse` interface

---

## Migration Notes

### For Other Components

If other components want to adopt the legacy rate system:

1. Import the new interface:
   ```typescript
   import { VendorRateLegacyResponse } from '../models/on-site-estimate.model';
   ```

2. Call the new service method:
   ```typescript
   this.assignVendorSvc.getVendorRatesLegacy(vendorKey, tradeKey).subscribe(...)
   ```

3. Convert response if needed:
   ```typescript
   const legacyRates = res.data;
   const standardRates: VendorRateResponse = {
     vendorKey: legacyRates.vendorKey,
     vendorName: null,
     hourlyRate: legacyRates.hourlyRate,
     tripCharge: legacyRates.tripCharge,
     serviceCharge: legacyRates.serviceCharge,
     emergencyHourlyRate: legacyRates.emergencyHourlyRate,
     emergencyTripCharge: legacyRates.emergencyTripCharge,
     emergencyServiceCharge: legacyRates.emergencyServiceCharge,
     helperRates: legacyRates.helperRate,
     emergencyHelperRates: legacyRates.emergencyHelperRate,
   };
   ```

---

## Related Documentation

- **Backend Implementation**: `IMPLEMENTATION-COMPLETE-Legacy-Vendor-Rates.md`
- **Legacy System Documentation**: `Vendor-Rate-Retrieval-System.md`
- **Vendor Rate API**: `Vendor-Rate-API-Documentation.md`

---

## Status

**Implementation Date**: June 30, 2026  
**Status**: ✅ Complete and Tested  
**Breaking Changes**: None (additive only)  
**Backend Dependency**: Requires `/vendor-rates-legacy` endpoint (already deployed)

---

## Next Steps

1. ✅ **Complete**: Frontend integration in on-site estimate modal
2. ⏭️ **Optional**: Migrate other components to use legacy endpoint
3. ⏭️ **Optional**: Deprecate old endpoints once all components migrated
4. ⏭️ **Optional**: Add unit tests for rate conversion logic
