# Legacy Vendor Rates - Quick Start Guide

## What Just Changed?

The on-site estimate modal now uses a **single API endpoint** that matches the old ProjectRCS behavior for vendor rate lookup.

---

## For Developers

### New Endpoint
```typescript
GET /api/v1/admin/on-site-approval/vendor-rates-legacy?vendorKey={guid}&tradeKey={guid}
```

### Usage in Frontend
```typescript
this.assignVendorSvc.getVendorRatesLegacy(vendorKey, tradeKey).subscribe(res => {
  if (res.status && res.data && res.data.success) {
    const rates = res.data;
    console.log('Rate source:', rates.rateSource); // Shows hierarchy level used
    // Pre-fill forms with rates...
  }
});
```

### Files Modified
1. `src/app/models/on-site-estimate.model.ts` - Added `VendorRateLegacyResponse` interface
2. `src/app/services/assign-vendor.service.ts` - Added `getVendorRatesLegacy()` method
3. `src/app/shared/components/on-site-estimate-modal/on-site-estimate-modal.component.ts` - Replaced rate loading logic

---

## For Admins/Users

### What You'll See

#### Before (Problem)
- Vendor had no rates configured
- Forms were empty
- Had to manually enter rates every time

#### After (Solution)
- Vendor rates **always** pre-fill (even if $0)
- Backend checks 4 hierarchy levels automatically:
  1. Trade-specific rates (e.g., Plumbing rates)
  2. "All Trades" fallback rates
  3. General vendor rates
  4. Creates $0 record if nothing exists

### New Vendors
- Will automatically get $0 rates pre-filled
- You can then edit the rates in the form
- This matches how ProjectRCS worked

---

## Key Rules (From Legacy System)

### Hourly Rates
- **Priority**: Trade-specific > "All Trades" > General > $0
- Example: If vendor has Plumbing rates ($120) and general rates ($100), uses $120

### Trip Charges
- **ALWAYS from general rates** (VendorRates table)
- **NEVER from trade-specific rates** (even if they exist)
- Example: Even with Plumbing-specific rates, trip charge comes from general VendorRates

### Service Charge
- **Calculated**: `Hourly Rate + Trip Charge`
- Never stored, always computed

---

## Debugging

### Console Output
The system now provides detailed, formatted output:
```
═══════════════════════════════════════════════════════
💰 VENDOR RATE SOURCE: VendorTrade (specific) + VendorRates (trip)
═══════════════════════════════════════════════════════

✅ Using TRADE-SPECIFIC rates for this job's trade
   Hourly rates from trade-specific configuration
   Trip charges from general VendorRates (correct per legacy rules)

Rate Details:
  - Hourly Rate:          $120.00
  - Trip Charge:          $75.00
  - Service Charge:       $195.00
  - Emergency Hourly:     $180.00
  - Emergency Trip:       $100.00
  - Helper Rate:          $65.00
  - Emergency Helper:     $95.00
═══════════════════════════════════════════════════════
```

### Rate Source Values
- `"VendorTrade (specific) + VendorRates (trip)"` → Found trade-specific rates
- `"VendorTrade (All Trades) + VendorRates (trip)"` → Used "All Trades" fallback
- `"VendorRates (general)"` → Only general rates exist
- `"Created $0 fallback"` → No rates found, created $0 record

---

## FAQ

### Q: Why were we getting 404 errors before?
**A**: The vendor had no rates configured in either table (VendorTrades or VendorRates). The old system gave up after two 404s.

### Q: What happens now with no rates?
**A**: The backend creates a new VendorRates record with all rates set to $0, then pre-fills the form with $0 values.

### Q: Is this a breaking change?
**A**: No. The old endpoints still exist. Only the on-site estimate modal uses the new legacy endpoint.

### Q: Why is it called "legacy"?
**A**: It replicates the exact rate retrieval logic from ProjectRCS (the legacy system), including the hierarchical fallback and rate merging rules.

### Q: Do we still need the old endpoints?
**A**: For now, yes. Other components may still use them. We can migrate those components later if desired.

---

## Testing Checklist

- [ ] Open modal for vendor with no rates → Should pre-fill with $0
- [ ] Open modal for vendor with trade-specific rates → Should use trade rates + general trip
- [ ] Open modal for vendor with only "All Trades" rates → Should use All Trades fallback
- [ ] Open modal for vendor with only general rates → Should use general rates
- [ ] Open modal for emergency job → Should use emergency rates
- [ ] Check console logs → Should show `rateSource` for debugging

---

## Need More Info?

See detailed documentation:
- `LEGACY-VENDOR-RATES-INTEGRATION-SUMMARY.md` - Complete overview
- `IMPLEMENTATION-COMPLETE-Legacy-Vendor-Rates-Frontend.md` - Frontend details
- `IMPLEMENTATION-COMPLETE-Legacy-Vendor-Rates.md` - Backend details
- `Vendor-Rate-Retrieval-System.md` - Legacy system logic

---

**Status**: ✅ Complete and Ready  
**Build**: ✅ Successful (no errors)  
**Date**: June 30, 2026
