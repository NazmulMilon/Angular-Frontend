# On-Site Estimate Flow Documentation

## Complete Workflow

### Phase 1: Vendor Estimate Creation (Steps 1-4)

**Steps**:
1. **Trip Charge** - Add trip charge line item
2. **Materials** - Add material line items  
3. **Labor** - Add labor line items
4. **Review** - Review all line items

**What Happens**:
- Line items are stored in component state (signals)
- **NO** database records created yet
- Vendor rates pre-filled from legacy vendor rate endpoint

---

### Phase 2: Submit for Customer Approval (Step 5)

**User Action**: Clicks "Submit for Customer Approval"

**Backend Flow** (3-step process):
```
1. POST /save-estimate
   └─> Creates VendorEstimate record
       Returns: vendorEstimateKey

2. POST /create-customer-estimate
   └─> Creates CustomerEstimate record
       Applies markup percentages
       Returns: customerEstimateKey + line items with markup

3. POST /send-customer-estimate-email
   └─> Sends email to customer
       Returns: confirmation
```

**What's Created**:
- ✅ `VendorEstimate` record in database
- ✅ `VendorEstimateDetail` records (line items)
- ✅ `CustomerEstimate` record in database
- ✅ `CustomerEstimateDetail` records (line items with markup)
- ✅ Email sent to customer

**UI Changes**:
- Wizard hides
- **Comparison grid appears** showing vendor vs customer estimate
- **Save button appears**
- **Send Email button appears**

---

### Phase 3: Customer Estimate Editing (Post-Creation)

**Available Actions**:

#### 1. **Inline Edit (Auto-Save)**
- Click any customer value (Qty, Rate, Markup %)
- Edit inline
- On blur → **Auto-saves** to database via `PUT /update-customer-estimate`
- Updates `hasUnsavedChanges` flag

#### 2. **Save Button** (Manual Save)
- Click "Save" button
- Saves **all** current customer estimate values to database
- Use case: After making multiple inline edits, ensure everything is saved before sending email

#### 3. **Send Email Button**
- Click "Send Customer Estimate Email"
- Sends email to customer with current estimate
- **Disabled if** `hasUnsavedChanges() === true` (forces save first)

---

## Button Visibility Logic

### "Submit for Customer Approval" Button
**When**: Step 5 (Review), **before** customer estimate is created  
**Shown**: `!customerEstimateResponse()`  
**Action**: Creates vendor estimate + customer estimate + sends email

### "Save" Button
**When**: **After** customer estimate is created  
**Shown**: `customerEstimateResponse()` exists  
**Action**: `PUT /update-customer-estimate` (updates existing customer estimate)

### "Send Customer Estimate Email" Button
**When**: **After** customer estimate is created  
**Shown**: `customerEstimateResponse()` exists  
**Action**: `POST /send-customer-estimate-email` (sends email for existing customer estimate)

---

## Error Case: Premature Save

### What Happened
You tried to click "Save" **before** clicking "Submit for Customer Approval"

### Why It Failed
```
Error: 500 Internal Server Error
PUT /update-customer-estimate

Reason: CustomerEstimateKey was null/undefined
        (customer estimate doesn't exist yet)
```

### Solution Implemented

**1. Gating via UI**:
```html
@if (customerEstimateResponse()) {
  <!-- Save and Send Email buttons only show AFTER customer estimate is created -->
  <button (click)="saveCustomerEstimate()">Save</button>
  <button (click)="sendCustomerEstimateEmail()">Send Email</button>
}
```

**2. Validation in Method**:
```typescript
saveCustomerEstimate(): void {
  const response = this.customerEstimateResponse();
  
  if (!response || !response.customerEstimateKey) {
    this.errorMessage.set(
      'Customer estimate has not been created yet. ' +
      'Please submit for customer approval first.'
    );
    return;
  }
  
  // ... proceed with update
}
```

---

## API Endpoints Summary

| Endpoint | When Called | Purpose |
|----------|-------------|---------|
| `POST /save-estimate` | Submit for Approval (Step 1) | Create vendor estimate |
| `POST /create-customer-estimate` | Submit for Approval (Step 2) | Create customer estimate with markup |
| `POST /send-customer-estimate-email` | Submit for Approval (Step 3) OR Send Email Button | Send email to customer |
| `PUT /update-customer-estimate` | Inline Edit (blur) OR Save Button | Update existing customer estimate |

---

## State Signals

| Signal | Type | Purpose |
|--------|------|---------|
| `customerEstimateResponse` | `signal<any \| null>` | Stores created customer estimate. `null` = not created yet. Non-null = created, show comparison grid |
| `hasUnsavedChanges` | `signal<boolean>` | Tracks inline edits that haven't been saved. Disables "Send Email" if `true` |
| `isSubmitting` | `signal<boolean>` | Tracks if API call is in progress. Disables buttons during save/send |
| `isSavingChanges` | `signal<boolean>` | Tracks if auto-save is in progress |

---

## User Journey

### Journey A: Submit and Send Immediately
```
1. Admin fills out estimate (steps 1-4)
2. Admin clicks "Submit for Customer Approval"
   └─> Backend creates both estimates + sends email
3. Done! Customer receives email
```

### Journey B: Submit, Edit, Then Send
```
1. Admin fills out estimate (steps 1-4)
2. Admin clicks "Submit for Customer Approval"
   └─> Backend creates both estimates + sends email
3. Admin realizes markup is wrong
4. Admin edits customer rate inline
   └─> Auto-saves on blur
5. Admin clicks "Save" (optional, to ensure all saved)
6. Admin clicks "Send Customer Estimate Email" again
   └─> Sends updated estimate to customer
```

### Journey C: Submit, Edit Multiple Times, Save, Send
```
1. Admin fills out estimate (steps 1-4)
2. Admin clicks "Submit for Customer Approval"
   └─> Backend creates both estimates + sends email
3. Admin edits multiple line items (Qty, Rate, Markup %)
   └─> Each edit auto-saves on blur
   └─> hasUnsavedChanges flag may toggle
4. Admin clicks "Save" to ensure everything is persisted
   └─> hasUnsavedChanges = false
5. Admin clicks "Send Customer Estimate Email"
   └─> Sends final estimate to customer
```

---

## Common Issues

### ❌ Issue: 500 Error when clicking "Save"
**Cause**: Clicked "Save" before "Submit for Customer Approval"  
**Solution**: "Save" button is now gated by `customerEstimateResponse()` - only appears after submission

### ❌ Issue: "Send Email" button is disabled
**Cause**: `hasUnsavedChanges() === true` (inline edits not saved)  
**Solution**: Click "Save" first, or wait for auto-save to complete

### ❌ Issue: Customer estimate shows old values
**Cause**: Inline edits made but not saved  
**Solution**: Click "Save" or blur the input field to trigger auto-save

---

## Testing Checklist

- [ ] Fill out vendor estimate (steps 1-4)
- [ ] "Submit for Customer Approval" creates customer estimate
- [ ] Comparison grid appears
- [ ] "Save" and "Send Email" buttons appear
- [ ] Inline edit a customer rate → auto-saves on blur
- [ ] Click "Save" → success message appears
- [ ] Click "Send Email" → email sent confirmation
- [ ] Try clicking "Save" with no customer estimate → shows error message
- [ ] Edit multiple values → "Send Email" disabled until saved

---

**Last Updated**: June 30, 2026  
**Status**: ✅ Complete and Documented
