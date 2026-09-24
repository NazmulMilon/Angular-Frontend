# Edit Existing Estimate Feature Implementation

**Created:** July 1, 2026  
**Status:** ✅ Complete

---

## Overview

Implemented full edit functionality for existing vendor estimates in the on-site approval workflow. When a vendor has a pre-existing estimate, users can now load and modify all line items instead of creating a new estimate from scratch.

---

## Files Modified

### 1. Models (`on-site-estimate.model.ts`)

**Added Interfaces:**
- `EditEstimateResponse` - Response from loading an existing estimate
- `EditEstimateLineItem` - Line item format from backend edit endpoint
- `UpdateEstimateRequest` - Request to update an existing estimate
- `UpdateEstimateResponse` - Response from update endpoint

### 2. Service (`assign-vendor.service.ts`)

**New Methods:**
```typescript
loadEstimateForEdit(estimateKey: string): Observable<AssignVendorApiResponse<EditEstimateResponse>>
updateOnSiteEstimate(request: UpdateEstimateRequest): Observable<AssignVendorApiResponse<UpdateEstimateResponse>>
```

**Imports:** Added `EditEstimateResponse`, `UpdateEstimateRequest`, `UpdateEstimateResponse`

### 3. Component (`on-site-estimate-modal.component.ts`)

**New State:**
```typescript
readonly isEditMode = signal(false);
readonly existingEstimateKey = signal<string | null>(null);
readonly editData = signal<EditEstimateResponse | null>(null);
```

**New Methods:**
- `openForEdit(estimateKey)` - Opens modal in edit mode
- `loadEstimateForEdit(estimateKey)` - Loads estimate from backend
- `convertEditLineItemsToFrontend(backendItems)` - Converts backend format to frontend
- `updateExistingEstimate(onSuccess)` - Calls update API
- `proceedWithCustomerApproval(estimateKey)` - Extracted customer approval flow
- `proceedWithDirectApproval(estimateKey)` - Extracted vendor approval flow

**Modified Methods:**
- `open()` - Now only handles create mode
- `submitForCustomerApproval()` - Checks edit mode, calls update instead of save
- `approveVendorEstimateDirectly()` - Checks edit mode, calls update instead of save

### 4. Template (`on-site-estimate-modal.component.html`)

**Header Changes:**
```html
<h2 class="modal-title">
  @if (isEditMode()) {
    <span>Edit On-Site Estimate</span>
    <span class="modal-title__badge">EDITING</span>
  } @else {
    <span>Provide On-Site Approval</span>
  }
</h2>
```

**Dynamic Subtitle:**
Shows job/vendor info from either `initData` or `editData` depending on mode.

### 5. Styles (`on-site-estimate-modal.component.scss`)

**Added Styles:**
```scss
.modal-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.modal-title__badge {
  display: inline-flex;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 4px 10px;
  background: $warning-color;
  color: #fff;
  border-radius: 12px;
  text-transform: uppercase;
}
```

### 6. Parent Component (`assign-vendor.component.ts`)

**Modified Method:**
```typescript
onProvideOnsiteApproval(vendor: AssignedVendorDetail): void
```

**Logic:**
1. Check if `vendor.hasEstimate` is true
2. If yes:
   - Call `getVendorEstimateList(jobVendorKey)`
   - Get the `invoiceKey` from latest estimate
   - Call `onSiteEstimateModal.openForEdit(invoiceKey)`
3. If no:
   - Proceed with normal create flow
   - Save NTE values
   - Call `onSiteEstimateModal.open()`

---

## Feature Flow

### Creating New Estimate (Existing Behavior)
1. User clicks "Provide on-site approval"
2. Modal opens with title: "Provide On-Site Approval"
3. `POST /api/v1/admin/on-site-approval/initialize/{jobKey}`
4. User fills forms step-by-step
5. `POST /api/v1/admin/on-site-approval/save-estimate`

### Editing Existing Estimate (New Feature)
1. User clicks "Update / Edit on-site approval"
2. System fetches vendor's estimate list
3. Modal opens with:
   - Title: "Edit On-Site Estimate" + orange "EDITING" badge
   - `GET /api/v1/admin/on-site-approval/edit-estimate/{estimateKey}`
4. All existing line items pre-populate:
   - Trip charges in Step 1
   - Materials in Step 2
   - Labor in Step 3
5. User can:
   - Modify quantities, rates, descriptions
   - Add new line items (get `detailKey = Guid.Empty`)
   - Remove line items (deleted from form)
6. When saved:
   - `PUT /api/v1/admin/on-site-approval/update-estimate`
   - Backend archives old version
   - Updates existing items (by `detailKey`)
   - Inserts new items
   - Soft-deletes removed items
   - Resets approval status

---

## Backend Integration

### Endpoints Used

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/v1/admin/job-vendor/estimate-list/{jobVendorKey}` | Get vendor's estimate(s) |
| GET | `/api/v1/admin/on-site-approval/edit-estimate/{estimateKey}` | Load estimate for editing |
| PUT | `/api/v1/admin/on-site-approval/update-estimate` | Update existing estimate |

### Data Transformation

**Backend → Frontend:**
```typescript
EditEstimateLineItem (backend format)
  ↓ convertEditLineItemsToFrontend()
  ↓
TripChargeLineItem | MaterialLineItem | LaborLineItem (frontend format)
```

**Frontend → Backend:**
```typescript
TripChargeLineItem | MaterialLineItem | LaborLineItem
  ↓ updateExistingEstimate()
  ↓
UpdateEstimateLineItem (backend format)
```

### Key Backend Behaviors

1. **Archiving:** Backend automatically archives the current estimate version before applying updates
2. **Version Control:** Each update increments the version number
3. **Soft Deletes:** Omitted line items get `MarkNotNeededCmt = "No Longer Needed (removed during edit)"`
4. **New Items:** Items with `detailKey = "00000000-0000-0000-0000-000000000000"` are inserted
5. **Approval Reset:** Edited estimates always require re-approval (`IsApproved = false`, `Status = 5`)
6. **Audit Trail:** Updates are logged to `AdminActionNotes`

---

## Validation & Error Handling

### Edit Restrictions

| `tempHeader` | Meaning | Action |
|--------------|---------|--------|
| `"1"` | Normal editable state | Allow editing |
| `"3"` | Already approved | Show warning, allow editing |
| `"33"` | Soft-deleted | Block editing |
| `"99"` | Blocked (vendor removed) | Block editing with error |

### Error Messages

- **Missing estimate key:** "Missing estimate key for update"
- **Failed to load:** "Could not load existing estimate"
- **Update failed:** "Failed to update estimate"
- **Blocked estimate:** "This estimate cannot be edited (vendor removed or job archived)"

---

## Testing Checklist

- [x] Load existing estimate with trip charges
- [x] Load existing estimate with materials
- [x] Load existing estimate with labor
- [x] Edit existing line item (change rate)
- [x] Edit existing line item (change quantity)
- [x] Add new line item during edit
- [x] Remove line item during edit
- [x] Save changes (calls update endpoint)
- [x] Create customer estimate after edit
- [x] Approve vendor estimate directly after edit
- [x] Display "EDITING" badge in modal header
- [x] Handle approved estimate (tempHeader = "3")
- [x] Block blocked estimate (tempHeader = "99")
- [x] Preserve detailKey for existing items
- [x] Generate Guid.Empty for new items

---

## UI/UX Improvements

✅ **Visual Indicators:**
- Orange "EDITING" badge in modal title
- Job/vendor info displayed correctly in both modes

✅ **Button Labels:**
- "Provide on-site approval" → Create new estimate
- "Update / Edit on-site approval" → Edit existing estimate

✅ **User Experience:**
- Seamless transition between create and edit modes
- All existing data pre-populated
- No data loss when switching forms
- Clear indication of which mode user is in

---

## Known Limitations

1. **Multiple Estimates:** Currently loads the most recent estimate only (first in the array from `estimate-list`)
2. **File Uploads:** Edit mode doesn't re-display previously uploaded files (backend limitation)
3. **DNE Values:** Edit mode uses DNE from backend; doesn't fetch from job header like create mode

---

## Future Enhancements

- [ ] Add estimate history viewer (show all versions)
- [ ] Add "Compare with previous version" feature
- [ ] Display uploaded files in edit mode
- [ ] Add "Revert to previous version" option
- [ ] Add inline diff view for changed line items

---

## Related Documentation

- [EDIT-ESTIMATE-ENDPOINTS.md](/Users/cole-sathngam/Workspace/RetailFixIt/RFIJobOps/EDIT-ESTIMATE-ENDPOINTS.md) - Backend API documentation
- [OnSiteApproval-Frontend-Integration-Guide.md](./OnSiteApproval-Frontend-Integration-Guide.md) - Full approval workflow
- [IMPLEMENTATION-Admin-Markup-Display.md](./IMPLEMENTATION-Admin-Markup-Display.md) - Admin markup feature

---

## Support

For questions or issues:
- Check estimate status: `SELECT * FROM VendorEstimate WHERE InvoiceKey = '...'`
- Check archive history: `SELECT * FROM VendorEstimateArchive WHERE OriginalInvoiceKey = '...' ORDER BY Version`
- Check line items: `SELECT * FROM VendorEstimateDetail WHERE InvoiceKey = '...'`
