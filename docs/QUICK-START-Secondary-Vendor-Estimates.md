# Quick Start: Secondary Vendor Estimates

## TL;DR

✅ **You can now create on-site estimates for ANY vendor** (default or secondary)  
✅ **Frontend updated** - Button shows for all vendors  
✅ **Backend confirmed** - Already supports multi-vendor  
✅ **No breaking changes** - Existing estimates still work  

---

## Quick Test

### 1. Assign Multiple Vendors to a Job

```
Job #26471
├─ ABC Plumbing (Default) ✅
├─ XYZ Electric (Secondary) ✅
└─ DEF HVAC (Secondary) ✅
```

### 2. Each Vendor Card Shows Button

```
┌─────────────────────────────────────┐
│ ABC Plumbing         [DEFAULT]      │
│ [Provide on-site approval]          │  ← Click here
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ XYZ Electric                         │
│ [Provide on-site approval]          │  ← Or here
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ DEF HVAC                             │
│ [Provide on-site approval]          │  ← Or here
└─────────────────────────────────────┘
```

### 3. Create Independent Estimates

Each vendor gets their own:
- Vendor estimate (VendorEstimate table)
- Customer estimate (JobSalesInvoice table)
- Approval workflow
- Email notifications

---

## What Changed

### Before
```typescript
// ❌ Only default vendor could create estimates
@if (v.isDefault) {
  <button (click)="onProvideOnsiteApproval(v)">
    Provide on-site approval
  </button>
}
```

### After
```typescript
// ✅ ALL vendors can create estimates
<button (click)="onProvideOnsiteApproval(v)">
  Provide on-site approval
</button>
```

---

## Files Changed

1. `assign-vendor.component.html` - Removed `@if (v.isDefault)`
2. `assign-vendor.component.ts` - Removed `!vendor.isDefault` check

That's it! No other changes needed.

---

## Backend APIs (Already Working)

All these endpoints accept **any VendorKey**:

- ✅ `POST /api/v1/admin/on-site-approval/initialize`
- ✅ `POST /api/v1/admin/on-site-approval/save-estimate`
- ✅ `POST /api/v1/admin/on-site-approval/create-customer-estimate`
- ✅ `PUT /api/v1/admin/on-site-approval/update-customer-estimate`
- ✅ `POST /api/v1/admin/on-site-approval/submit-for-customer-approval`
- ✅ `POST /api/v1/admin/on-site-approval/send-customer-estimate-email`

---

## Use Case Example

### Multi-Trade Job

**Job**: Retail store repair  
**Vendors**:
- Plumber (default) - $450
- Electrician (secondary) - $320
- HVAC tech (secondary) - $275

**Workflow**:
1. Click "Provide on-site approval" on plumber card
2. Create estimate: 3hrs labor + parts = $450
3. Submit for customer approval
4. Repeat for electrician ($320)
5. Repeat for HVAC tech ($275)
6. Customer sees 3 separate estimates totaling $1,045
7. Customer approves all 3
8. All 3 vendors receive work orders

---

## Database Structure

```sql
-- One job, multiple vendors, multiple estimates
Job #26471
  ├─ JobVendor (3 records)
  │  ├─ ABC Plumbing (IsDefault=true)
  │  ├─ XYZ Electric (IsDefault=false)
  │  └─ DEF HVAC (IsDefault=false)
  │
  ├─ VendorEstimate (3 records)
  │  ├─ EST-001 (ABC Plumbing)
  │  ├─ EST-002 (XYZ Electric)
  │  └─ EST-003 (DEF HVAC)
  │
  └─ JobSalesInvoice (3 records)
     ├─ CE-001 (ABC Plumbing)
     ├─ CE-002 (XYZ Electric)
     └─ CE-003 (DEF HVAC)
```

---

## Testing Steps

1. ✅ Open a job with multiple vendors
2. ✅ Verify all vendor cards show "Provide on-site approval" button
3. ✅ Click button for secondary vendor
4. ✅ Modal opens with vendor-specific data
5. ✅ Create estimate
6. ✅ Submit for customer approval
7. ✅ Verify customer estimate created
8. ✅ Check database for separate VendorEstimate records

---

## FAQ

**Q: Can I create estimates for non-default vendors?**  
A: ✅ Yes! That's what this feature enables.

**Q: Will this break existing estimates?**  
A: ❌ No, all existing estimates continue to work.

**Q: Does the backend support this?**  
A: ✅ Yes, backend already supports it.

**Q: Do I need to make backend changes?**  
A: ❌ No, backend is already ready.

**Q: Can each vendor have multiple estimates?**  
A: ⚠️ One active estimate per vendor. Multiple drafts allowed.

**Q: Does the default vendor have priority?**  
A: ℹ️ Default vendor is listed first, but all vendors have equal estimate capabilities.

---

## Related Documentation

- `SECONDARY-VENDOR-ESTIMATE-SUPPORT.md` - Full documentation
- `ON-SITE-ESTIMATE-FLOW-DOCUMENTATION.md` - Complete workflow
- `INTEGRATION-COMPLETE-Customer-Estimate-Save.md` - Save functionality

---

**Date**: June 30, 2026  
**Status**: ✅ Ready for Testing
