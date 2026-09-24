# Implementation Complete: Legacy-Style Vendor Rate Retrieval

## Summary

✅ **IMPLEMENTATION COMPLETE** - Full legacy-style vendor rate retrieval with hierarchical fallback logic has been implemented and is ready for use.

## What Was Implemented

### Legacy Rate Retrieval Logic

Implemented the full hierarchical vendor rate retrieval system that matches the legacy ProjectRCS behavior, as documented in `Vendor-Rate-Retrieval-System.md`.

**Hierarchy (in order of priority)**:
1. **VendorTrade (Specific Trade)** - Trade-specific rates for the exact trade
2. **VendorTrade ("All Trades")** - Fallback rates using the "All Trades" GUID (`287EEC8C-84CB-42AF-B8A1-00A676E64D0B`)
3. **VendorRates (General Rates)** - Vendor's general rates (not trade-specific)
4. **$0 Fallback** - Creates new VendorRates record with all rates set to $0

**Rate Merging Rules**:
- **Hourly rates**: Trade-specific takes priority, falls back to general if trade rate is null or 0
- **Emergency hourly rates**: Same as hourly rates
- **Helper rates**: Same as hourly rates
- **Trip charges**: **ALWAYS** come from VendorRates (general) - never from VendorTrade
- **Service charge**: Calculated as `HourlyRate + TripCharge`

---

## Files Created/Modified

### 1. New DTO Class
**File**: `CustomModel/OnSiteApprovalDTO.cs`

Added `VendorRateResult` class:
```csharp
public class VendorRateResult
{
    public bool Success { get; set; }
    public string? ErrorMessage { get; set; }
    public Guid VendorKey { get; set; }
    public Guid? TradeKey { get; set; }
    public decimal HourlyRate { get; set; }
    public decimal TripCharge { get; set; }
    public decimal EmergencyHourlyRate { get; set; }
    public decimal EmergencyTripCharge { get; set; }
    public decimal HelperRate { get; set; }
    public decimal EmergencyHelperRate { get; set; }
    public decimal ServiceCharge { get; set; }
    public decimal EmergencyServiceCharge => EmergencyHourlyRate + EmergencyTripCharge;
    public string RateSource { get; set; } = string.Empty;
}
```

**Key Fields**:
- `RateSource` - Debugging/logging metadata showing which rate source was used:
  - `"VendorTrade (specific) + VendorRates (trip)"` - Trade-specific rates merged with general trip charges
  - `"VendorTrade (All Trades) + VendorRates (trip)"` - "All Trades" fallback merged with general trip charges
  - `"VendorRates (general)"` - Only general rates found
  - `"VendorTrade only (created $0 general)"` - Trade rates exist but no general rates
  - `"Created $0 fallback"` - No rates found, created new $0 record

### 2. Service Interface
**File**: `Services/IOnSiteApprovalService.cs`

Added two new method signatures:
```csharp
Task<VendorRateResult> GetVendorRatesLegacyAsync(Guid vendorKey, Guid? tradeKey);
Task<JobVendor> SetVendorRatesLegacyAsync(JobVendor jobVendor);
```

### 3. Service Implementation
**File**: `Services/OnSiteApprovalService.cs`

Implemented two methods:

#### `GetVendorRatesLegacyAsync()`
- Full hierarchical rate retrieval logic
- Queries `VendorTrades` and `VendorRates` tables
- Creates $0 fallback records when no rates exist
- Merges trade-specific and general rates per legacy rules
- Returns `VendorRateResult` with all rates and metadata

#### `SetVendorRatesLegacyAsync()`
- Convenience method for populating `JobVendor` objects
- Calls `GetVendorRatesLegacyAsync()` internally
- Maps rates to JobVendor properties
- Equivalent to legacy `VendorHelper.SetVendorRates()` method

### 4. API Endpoint
**File**: `Controllers/AdminOnSiteApprovalController.cs`

Added new endpoint:
```
GET /api/v1/admin/on-site-approval/vendor-rates-legacy?vendorKey={guid}&tradeKey={guid}
```

**Query Parameters**:
- `vendorKey` (Guid, required) - The vendor's identifier
- `tradeKey` (Guid, optional) - The trade identifier for trade-specific rates

**Response** (200 OK):
```json
{
  "status": true,
  "message": "Vendor rates retrieved successfully",
  "data": {
    "success": true,
    "errorMessage": null,
    "vendorKey": "12345678-1234-1234-1234-123456789abc",
    "tradeKey": "87654321-4321-4321-4321-cba987654321",
    "hourlyRate": 120.00,
    "tripCharge": 75.00,
    "emergencyHourlyRate": 180.00,
    "emergencyTripCharge": 100.00,
    "helperRate": 65.00,
    "emergencyHelperRate": 95.00,
    "serviceCharge": 195.00,
    "emergencyServiceCharge": 280.00,
    "rateSource": "VendorTrade (specific) + VendorRates (trip)"
  },
  "traceId": "..."
}
```

---

## Build Status

✅ **Build Successful** - No compilation errors
- `dotnet build` completes successfully
- Only pre-existing warnings (not related to this implementation)
- All linter checks passed

---

## How It Works

### Example Scenario 1: Trade-Specific Rates with General Trip Charges

**Database State**:
- `VendorTrade` for Plumbing: HourlyRate = $120, EmergencyHourlyRate = $180
- `VendorRates` (general): HourlyRate = $100, TripCharge = $75, EmergencyTripCharge = $100

**Request**: 
```
GET /api/v1/admin/on-site-approval/vendor-rates-legacy?vendorKey=ABC-123&tradeKey=PLUMBING-456
```

**Result**:
```json
{
  "hourlyRate": 120.00,           // From VendorTrade (plumbing)
  "tripCharge": 75.00,            // From VendorRates (general) - ALWAYS from general
  "emergencyHourlyRate": 180.00,  // From VendorTrade (plumbing)
  "emergencyTripCharge": 100.00,  // From VendorRates (general) - ALWAYS from general
  "serviceCharge": 195.00,        // Calculated: 120 + 75
  "rateSource": "VendorTrade (specific) + VendorRates (trip)"
}
```

### Example Scenario 2: "All Trades" Fallback

**Database State**:
- No `VendorTrade` for specific trade (Electrical)
- `VendorTrade` for "All Trades": HourlyRate = $95, EmergencyHourlyRate = $140
- `VendorRates` (general): TripCharge = $75, EmergencyTripCharge = $100

**Request**: 
```
GET /api/v1/admin/on-site-approval/vendor-rates-legacy?vendorKey=ABC-123&tradeKey=ELECTRICAL-789
```

**Result**:
```json
{
  "hourlyRate": 95.00,            // From VendorTrade (All Trades fallback)
  "tripCharge": 75.00,            // From VendorRates (general)
  "emergencyHourlyRate": 140.00,  // From VendorTrade (All Trades fallback)
  "emergencyTripCharge": 100.00,  // From VendorRates (general)
  "serviceCharge": 170.00,        // Calculated: 95 + 75
  "rateSource": "VendorTrade (All Trades) + VendorRates (trip)"
}
```

### Example Scenario 3: General Rates Only

**Database State**:
- No `VendorTrade` entries for this vendor
- `VendorRates` (general): HourlyRate = $100, TripCharge = $75, EmergencyHourlyRate = $150

**Request**: 
```
GET /api/v1/admin/on-site-approval/vendor-rates-legacy?vendorKey=ABC-123&tradeKey=PLUMBING-456
```

**Result**:
```json
{
  "hourlyRate": 100.00,           // From VendorRates (general)
  "tripCharge": 75.00,            // From VendorRates (general)
  "emergencyHourlyRate": 150.00,  // From VendorRates (general)
  "emergencyTripCharge": 75.00,   // From VendorRates (general)
  "helperRate": 60.00,            // From VendorRates (general)
  "emergencyHelperRate": 90.00,   // From VendorRates (general)
  "serviceCharge": 175.00,        // Calculated: 100 + 75
  "rateSource": "VendorRates (general)"
}
```

### Example Scenario 4: $0 Fallback (No Rates Exist)

**Database State**:
- No `VendorTrade` entries
- No `VendorRates` record

**Request**: 
```
GET /api/v1/admin/on-site-approval/vendor-rates-legacy?vendorKey=ABC-123
```

**Result**:
- Creates new `VendorRates` record with all rates = $0
- Returns all rates as $0
- `rateSource`: `"Created $0 fallback"`

---

## Usage Examples

### 1. Frontend - Pre-populate Vendor Estimate Form

```javascript
async function loadVendorRates(vendorKey, tradeKey) {
    const response = await fetch(
        `/api/v1/admin/on-site-approval/vendor-rates-legacy?vendorKey=${vendorKey}&tradeKey=${tradeKey || ''}`
    );
    
    const result = await response.json();
    
    if (result.status && result.data.success) {
        const rates = result.data;
        
        // Pre-populate standard rates
        document.getElementById('standardHourlyRate').value = rates.hourlyRate;
        document.getElementById('standardTripCharge').value = rates.tripCharge;
        document.getElementById('helperRate').value = rates.helperRate;
        
        // Pre-populate emergency rates
        document.getElementById('emergencyHourlyRate').value = rates.emergencyHourlyRate;
        document.getElementById('emergencyTripCharge').value = rates.emergencyTripCharge;
        document.getElementById('emergencyHelperRate').value = rates.emergencyHelperRate;
        
        // Log the rate source for debugging
        console.log('Rate source:', rates.rateSource);
    }
}
```

### 2. Backend - Assign Vendor to Job with Rates

```csharp
// Example: Assigning a vendor to a job
public async Task<JobVendor> AssignVendorToJob(Guid vendorKey, Guid jobKey, Guid tradeKey)
{
    var jobVendor = new JobVendor
    {
        Pkey = Guid.NewGuid(),
        VendorKey = vendorKey,
        JobKey = jobKey,
        TradeKey = tradeKey,
        IsDefault = true,
        IsDelete = false,
        EnteredOn = DateTime.UtcNow
    };
    
    // Populate with legacy-style rates
    jobVendor = await _onSiteApprovalService.SetVendorRatesLegacyAsync(jobVendor);
    
    _db.JobVendors.Add(jobVendor);
    await _db.SaveChangesAsync();
    
    return jobVendor;
}
```

### 3. Backend - Direct Rate Retrieval

```csharp
// Example: Get rates for calculations
var rates = await _onSiteApprovalService.GetVendorRatesLegacyAsync(vendorKey, tradeKey);

if (rates.Success)
{
    decimal vendorCost = rates.HourlyRate * hours + rates.TripCharge;
    decimal customerPrice = vendorCost * (1 + markupPercent / 100m);
    
    _logger.LogInformation(
        "Calculated pricing using {RateSource}: VendorCost=${VendorCost}, CustomerPrice=${CustomerPrice}",
        rates.RateSource, vendorCost, customerPrice);
}
```

---

## Integration with On-Site Approval

### Current State

The On-Site Approval `SaveEstimateAsync()` method currently **does not** retrieve rates from the database. It accepts rates from the frontend in the request payload.

### Recommended Integration Options

#### Option A: Frontend Calls Endpoint Before Submitting
Frontend retrieves rates using the new endpoint and pre-populates the form. User can edit rates if needed before submitting.

```javascript
// Initialize form
const rates = await loadVendorRates(vendorKey, tradeKey);

// User edits rates if desired
// ...

// Submit estimate with (possibly modified) rates
await saveEstimate({
    lineItems: [
        { rate: rates.hourlyRate, ... },
        { rate: rates.tripCharge, ... }
    ]
});
```

#### Option B: Backend Retrieves and Validates on Save
Modify `SaveEstimateAsync()` to retrieve rates from database and optionally validate/override frontend-provided rates.

```csharp
public async Task<ApiResponse<SaveEstimateResponse>> SaveEstimateAsync(...)
{
    // Get legacy rates for validation/fallback
    var jobVendor = await _db.JobVendors
        .FirstOrDefaultAsync(jv => jv.JobKey == request.JobKey && jv.VendorKey == request.VendorKey);
    
    if (jobVendor != null)
    {
        var rates = await GetVendorRatesLegacyAsync(jobVendor.VendorKey ?? Guid.Empty, jobVendor.TradeKey);
        
        // Option 1: Use database rates (ignore frontend)
        // Option 2: Validate frontend rates against database rates
        // Option 3: Use frontend rates but log database rates for audit
    }
    
    // Continue with save logic...
}
```

---

## Comparison with Legacy System

| Feature | Legacy ProjectRCS | New Implementation | Status |
|---------|-------------------|-------------------|---------|
| Checks VendorTrade (specific) | ✅ Yes | ✅ Yes | ✅ Match |
| Checks VendorTrade ("All Trades") | ✅ Yes | ✅ Yes | ✅ Match |
| Checks VendorRates (general) | ✅ Yes | ✅ Yes | ✅ Match |
| Creates $0 fallback | ✅ Yes | ✅ Yes | ✅ Match |
| Merges trade + general rates | ✅ Yes | ✅ Yes | ✅ Match |
| Trip charges from general only | ✅ Yes | ✅ Yes | ✅ Match |
| Hourly rates priority order | ✅ Trade → General → $0 | ✅ Trade → General → $0 | ✅ Match |
| Service charge calculation | ✅ Hourly + Trip | ✅ Hourly + Trip | ✅ Match |
| Logging/debugging | ❌ Limited | ✅ Extensive | ✅ Improved |

---

## Testing Recommendations

### Unit Tests
```csharp
[Fact]
public async Task GetVendorRatesLegacy_WithTradeSpecificRates_ReturnsTradeRates()
{
    // Arrange: Create vendor with trade-specific rates
    // Act: Call GetVendorRatesLegacyAsync
    // Assert: Returns trade rates for hourly, general rates for trip
}

[Fact]
public async Task GetVendorRatesLegacy_WithAllTradesFallback_ReturnsAllTradesRates()
{
    // Arrange: Create vendor with "All Trades" rates but no specific trade
    // Act: Call GetVendorRatesLegacyAsync with specific trade
    // Assert: Falls back to "All Trades" rates
}

[Fact]
public async Task GetVendorRatesLegacy_NoRatesExist_CreatesFallbackRecord()
{
    // Arrange: Vendor with no rates
    // Act: Call GetVendorRatesLegacyAsync
    // Assert: Creates VendorRates with $0, returns all zeros
}
```

### Integration Tests
1. Test with real database connections
2. Verify `VendorRates` record creation
3. Test all hierarchy paths
4. Verify rate merging logic

### Manual Testing Scenarios
1. Vendor with trade-specific rates for Plumbing
2. Vendor with "All Trades" rates only
3. Vendor with general rates only
4. New vendor with no rates (should create $0 fallback)
5. Vendor with partial rates (some fields null)

---

## Related Documentation

- **Legacy System Documentation**: `Vendor-Rate-Retrieval-System.md`
- **Vendor Rate API**: `Vendor-Rate-API-Documentation.md`
- **Customer Markup API**: `Customer-Markup-API-Documentation.md`
- **On-Site Approval API**: `OnSiteApproval-API-TestResults.md`
- **All Rate Endpoints**: `IMPLEMENTATION-COMPLETE-All-Rate-Endpoints.md`

---

## Next Steps

1. **Frontend Integration**: Update On-Site Approval UI to call new endpoint
2. **Backend Integration**: Decide on Option A vs Option B for SaveEstimateAsync
3. **Testing**: Create comprehensive test suite
4. **Documentation**: Update API documentation with new endpoint
5. **Monitoring**: Add logging/metrics for rate retrieval patterns

---

**Implementation Date**: June 30, 2026  
**Status**: ✅ Complete and Ready for Integration  
**Build Status**: ✅ Successful  
**Breaking Changes**: None (additive only)
