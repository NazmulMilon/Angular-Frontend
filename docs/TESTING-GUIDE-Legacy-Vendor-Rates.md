# Testing Guide: Legacy Vendor Rates Integration

## Expected Response Structure

The API now returns this structure:

```javascript
{
  "status": true,
  "responseCode": 200,
  "message": "Vendor rates retrieved successfully",
  "data": {
    "success": true,
    "vendorKey": "67e95ef6-52bb-463c-961b-3fda71e33373",
    "tradeKey": null,
    "hourlyRate": 0.00,
    "tripCharge": 0.00,
    "emergencyHourlyRate": 0.00,
    "emergencyTripCharge": 0.00,
    "helperRate": 0.00,
    "emergencyHelperRate": 0.00,
    "serviceCharge": 0.00,
    "emergencyServiceCharge": 0.00,
    "rateSource": "Created $0 fallback"
  },
  "traceId": "00-abc123..."
}
```

## What to Look For

### 1. Check the `rateSource` Field

This tells you **exactly** what happened:

| rateSource Value | Meaning | Expected Rates |
|-----------------|---------|----------------|
| `"Created $0 fallback"` | **No rates configured** for this vendor | All rates = `0.00` |
| `"VendorRates (general)"` | Only general rates found | Non-zero general rates |
| `"VendorTrade (specific) + VendorRates (trip)"` | Trade-specific rates found | Trade hourly + general trip |
| `"VendorTrade (All Trades) + VendorRates (trip)"` | "All Trades" fallback used | All Trades hourly + general trip |
| `"VendorTrade only (created $0 general)"` | Trade rates exist, no general | Trade hourly, $0 trip |

### 2. Check the Console Output

The frontend now provides **formatted, detailed output**:

```
═══════════════════════════════════════════════════════
💰 VENDOR RATE SOURCE: Created $0 fallback
═══════════════════════════════════════════════════════

⚠️ NO RATES CONFIGURED FOR THIS VENDOR
   The backend created a new $0 VendorRates record.
   This is expected behavior for new vendors.
   Forms will be pre-filled with $0 - admin must enter rates manually.

Rate Details:
  - Hourly Rate:          $0.00
  - Trip Charge:          $0.00
  - Service Charge:       $0.00
  - Emergency Hourly:     $0.00
  - Emergency Trip:       $0.00
  - Helper Rate:          $0.00
  - Emergency Helper:     $0.00
═══════════════════════════════════════════════════════
```

## Testing Scenarios

### Scenario 1: Vendor with No Rates (Your Current Case)

**Setup**: Vendor `67e95ef6-52bb-463c-961b-3fda71e33373` has no rates in database

**Steps**:
1. Open on-site estimate modal
2. Check console output

**Expected Console Output**:
```
📊 Fetching LEGACY vendor rates for vendorKey: 67e95ef6-52bb-463c-961b-3fda71e33373, tradeKey: (not provided)
   ℹ️  No tradeKey provided - backend will check all trades in hierarchy
✅ Legacy Rates Response: {...}
═══════════════════════════════════════════════════════
💰 VENDOR RATE SOURCE: Created $0 fallback
═══════════════════════════════════════════════════════
⚠️ NO RATES CONFIGURED FOR THIS VENDOR
   The backend created a new $0 VendorRates record.
   This is expected behavior for new vendors.
   Forms will be pre-filled with $0 - admin must enter rates manually.

Rate Details:
  - Hourly Rate:          $0.00
  - Trip Charge:          $0.00
  ...
```

**Expected Behavior**:
- ✅ API returns `status: true`, `success: true`
- ✅ All rates are `0.00`
- ✅ `rateSource: "Created $0 fallback"`
- ✅ Forms pre-filled with `$0.00` values
- ✅ Backend creates new `VendorRates` record with `$0` in database
- ✅ Admin can manually edit rates in the form

**This is CORRECT behavior** for a vendor with no configured rates!

---

### Scenario 2: Configure Rates and Test Again

**Setup**: Add rates for the vendor in the database

**Option A - Add General Rates Only**:
```sql
INSERT INTO VendorRates (VendorKey, HourlyRate, TripCharge, EmergencyHourlyRate, EmergencyTripCharge, HelperRate, EmergencyHelperRate)
VALUES ('67e95ef6-52bb-463c-961b-3fda71e33373', 100.00, 75.00, 150.00, 100.00, 60.00, 90.00);
```

**Option B - Add Trade-Specific Rates**:
```sql
INSERT INTO VendorTrades (VendorKey, TradeKey, HourlyRate, EmergencyHourlyRate, HelperRate, EmergencyHelperRate)
VALUES ('67e95ef6-52bb-463c-961b-3fda71e33373', 'PLUMBING-TRADE-GUID', 120.00, 180.00, 65.00, 95.00);
```

**Option C - Add "All Trades" Fallback**:
```sql
INSERT INTO VendorTrades (VendorKey, TradeKey, HourlyRate, EmergencyHourlyRate)
VALUES ('67e95ef6-52bb-463c-961b-3fda71e33373', '287EEC8C-84CB-42AF-B8A1-00A676E64D0B', 95.00, 140.00);
```

**Then Retest**:
1. Refresh the page
2. Open modal again
3. Check `rateSource` in console

**Expected for Option A**:
```
💰 VENDOR RATE SOURCE: VendorRates (general)
✅ Using GENERAL vendor rates only
   No trade-specific rates configured

Rate Details:
  - Hourly Rate:          $100.00
  - Trip Charge:          $75.00
  ...
```

**Expected for Option B**:
```
💰 VENDOR RATE SOURCE: VendorTrade (specific) + VendorRates (trip)
✅ Using TRADE-SPECIFIC rates for this job's trade
   Hourly rates from trade-specific configuration
   Trip charges from general VendorRates (correct per legacy rules)

Rate Details:
  - Hourly Rate:          $120.00  ← From VendorTrade (Plumbing)
  - Trip Charge:          $75.00   ← From VendorRates (general)
  ...
```

**Expected for Option C**:
```
💰 VENDOR RATE SOURCE: VendorTrade (All Trades) + VendorRates (trip)
✅ Using "ALL TRADES" fallback rates
   No specific trade rates found, using catch-all rates

Rate Details:
  - Hourly Rate:          $95.00   ← From VendorTrade (All Trades)
  - Trip Charge:          $75.00   ← From VendorRates (general)
  ...
```

---

### Scenario 3: Emergency Job

**Setup**: Job type contains "emergency"

**Expected**:
- Forms use `emergencyHourlyRate` and `emergencyTripCharge`
- Rate type set to `RateType.Emergency`

---

## Interpreting the Response

### All Zeros (rateSource: "Created $0 fallback")
```json
{
  "hourlyRate": 0.00,
  "tripCharge": 0.00,
  "rateSource": "Created $0 fallback"
}
```
**Meaning**: Vendor has NO rates in database. Backend created a new $0 record. This is **expected and correct** for new/unconfigured vendors.

### General Rates Only
```json
{
  "hourlyRate": 100.00,
  "tripCharge": 75.00,
  "rateSource": "VendorRates (general)"
}
```
**Meaning**: Vendor has general rates but no trade-specific rates.

### Trade-Specific Rates
```json
{
  "hourlyRate": 120.00,
  "tripCharge": 75.00,
  "rateSource": "VendorTrade (specific) + VendorRates (trip)"
}
```
**Meaning**: Vendor has trade-specific hourly rates ($120) PLUS general trip charges ($75). **Note**: Trip charges ALWAYS come from general, never from trade-specific (this is correct per legacy rules).

### All Trades Fallback
```json
{
  "hourlyRate": 95.00,
  "tripCharge": 75.00,
  "rateSource": "VendorTrade (All Trades) + VendorRates (trip)"
}
```
**Meaning**: No specific trade rates found, used "All Trades" catch-all rates.

---

## Key Points to Remember

### Trip Charges ALWAYS Come from General Rates
Even if you have trade-specific rates, **trip charges MUST come from VendorRates (general)**, NOT from VendorTrade.

**Example**:
- VendorTrade(Plumbing): `HourlyRate = $120`, `TripCharge = $50` ❌ (trip charge ignored)
- VendorRates(general): `HourlyRate = $100`, `TripCharge = $75` ✅ (trip charge used)

**Result**: `hourlyRate = $120` (from trade), `tripCharge = $75` (from general)

This is **correct per ProjectRCS legacy behavior**.

---

## Troubleshooting

### Problem: All rates showing as $0.00

**Check**:
1. Look at `rateSource` in console
2. If it says `"Created $0 fallback"` → Vendor has no rates in database (expected)
3. If it says something else → Check the `data` object in the response

**Solution**:
- Add rates to the database (see Scenario 2 above)
- OR manually enter rates in the form (forms are pre-filled with $0 to allow manual entry)

### Problem: Trip charges showing as $0.00 but hourly rates are populated

**Check**:
- Does vendor have `VendorRates` (general) record in database?
- Trip charges ONLY come from `VendorRates` table, never from `VendorTrade`

**Solution**:
- Add general `VendorRates` record with trip charges

### Problem: API returning 404

**This should NOT happen anymore**. The legacy endpoint always returns 200 with either:
- Real rates (if found in hierarchy)
- $0 rates (if nothing found, after creating new record)

If you're seeing 404:
- Check the endpoint URL is `/vendor-rates-legacy` (not `/vendor-rates` or `/vendor-rates/by-job`)
- Check the backend endpoint is deployed and accessible

---

## Success Criteria

✅ **API returns 200 OK** (even for vendors with no rates)  
✅ **Response has `status: true` and `data.success: true`**  
✅ **Console shows formatted rate source output**  
✅ **Forms pre-fill with rates** (even if $0)  
✅ **`rateSource` clearly indicates which hierarchy level was used**  
✅ **Admin can manually edit rates if needed**

---

## Database Queries for Testing

### Check if Vendor Has Rates
```sql
-- Check general rates
SELECT * FROM VendorRates 
WHERE VendorKey = '67e95ef6-52bb-463c-961b-3fda71e33373';

-- Check trade-specific rates
SELECT * FROM VendorTrades 
WHERE VendorKey = '67e95ef6-52bb-463c-961b-3fda71e33373';

-- Check "All Trades" rates
SELECT * FROM VendorTrades 
WHERE VendorKey = '67e95ef6-52bb-463c-961b-3fda71e33373'
  AND TradeKey = '287EEC8C-84CB-42AF-B8A1-00A676E64D0B';
```

### Add Test Rates
```sql
-- Add general rates
INSERT INTO VendorRates (VendorKey, HourlyRate, TripCharge, EmergencyHourlyRate, EmergencyTripCharge, HelperRate, EmergencyHelperRate)
VALUES ('67e95ef6-52bb-463c-961b-3fda71e33373', 100.00, 75.00, 150.00, 100.00, 60.00, 90.00);

-- Add Plumbing-specific rates (replace TRADE-GUID with actual GUID)
INSERT INTO VendorTrades (VendorKey, TradeKey, HourlyRate, EmergencyHourlyRate, HelperRate, EmergencyHelperRate)
VALUES ('67e95ef6-52bb-463c-961b-3fda71e33373', 'YOUR-PLUMBING-TRADE-GUID', 120.00, 180.00, 65.00, 95.00);

-- Add "All Trades" fallback
INSERT INTO VendorTrades (VendorKey, TradeKey, HourlyRate, EmergencyHourlyRate)
VALUES ('67e95ef6-52bb-463c-961b-3fda71e33373', '287EEC8C-84CB-42AF-B8A1-00A676E64D0B', 95.00, 140.00);
```

---

**Last Updated**: June 30, 2026  
**Status**: ✅ Ready for Testing
