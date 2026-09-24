# Legacy Email Route Integration

## Overview

Updated the "Send Customer Estimate Email" button to route to the legacy admin page instead of calling the new API endpoint. This allows admins to send emails through the existing ProjectRCS interface.

## Status

✅ **COMPLETE** - Button now opens legacy admin email page in new tab

## What Was Changed

### 1. Import Environment Configuration

Added environment import to access `legacyAdminBaseUrl`:

```typescript
import { environment } from '../../../../environments/environment';
```

### 2. Updated `sendCustomerEstimateEmail()` Method

**Before (API Call):**
```typescript
sendCustomerEstimateEmail(): void {
  const customerEstimateKey = this.customerEstimateResponse()?.customerEstimateKey;
  const custEmail = this.customerEmail();
  
  // Validation checks...
  
  const emailRequest = {
    customerEstimateKey,
    customerEmail: custEmail.trim(),
    customNotes: 'Please review and approve this estimate...',
  };

  this.assignVendorSvc.sendCustomerEstimateEmail(emailRequest).subscribe({
    next: (emailRes) => {
      // Handle success
    },
    error: (emailErr) => {
      // Handle error
    }
  });
}
```

**After (Legacy Route):**
```typescript
/**
 * Opens the legacy admin page to send customer estimate email.
 * Uses the JobSalesInvoice.InvoiceKey (customer estimate key) to route to:
 * https://admin-dev.retailfixitapp.com/MgtJobSalesOrder/EmailEstimateToCustomer/{invoiceKey}
 */
sendCustomerEstimateEmail(): void {
  const customerEstimateKey = this.customerEstimateResponse()?.customerEstimateKey;
  
  if (!customerEstimateKey) {
    this.errorMessage.set('No customer estimate found. Please create the estimate first.');
    return;
  }
  
  // Construct legacy admin URL for email estimate page
  // Uses JobSalesInvoice.InvoiceKey at the end of the URL
  const url = `${environment.legacyAdminBaseUrl}/MgtJobSalesOrder/EmailEstimateToCustomer/${customerEstimateKey}`;
  
  console.log('🔗 Opening legacy admin email page:', url);
  console.log('📧 Customer Estimate Key (InvoiceKey):', customerEstimateKey);
  
  // Open in new tab
  window.open(url, '_blank', 'noopener');
  
  this.successMessage.set('Opening email estimate page in new tab...');
}
```

## URL Pattern

### Legacy Admin Email Estimate URL

**Pattern:**
```
{legacyAdminBaseUrl}/MgtJobSalesOrder/EmailEstimateToCustomer/{invoiceKey}
```

**Example:**
```
https://admin-dev.retailfixitapp.com/MgtJobSalesOrder/EmailEstimateToCustomer/0bab2987-b651-4897-a9c3-bf86d9e1458c
```

**URL Components:**
- `{legacyAdminBaseUrl}`: Environment-specific base URL
  - **Dev**: `https://admin-dev.retailfixitapp.com`
  - **UAT**: `https://admin-uat.retailfixitapp.com`
  - **Prod**: `https://admin.retailfixitapp.com`
- `/MgtJobSalesOrder/EmailEstimateToCustomer/`: Legacy route path
- `{invoiceKey}`: The customer estimate key from `JobSalesInvoice.InvoiceKey`

## Database Context

The `invoiceKey` parameter corresponds to:

```sql
SELECT * 
FROM JobSalesInvoice 
WHERE InvoiceKey = '14a706a6-b064-4def-8c93-5e013a72bc75'
```

**Table:** `JobSalesInvoice`  
**Column:** `InvoiceKey` (GUID)  
**Purpose:** Unique identifier for customer estimates

## User Flow

### Before (API-based):
1. Admin clicks "Send Customer Estimate Email" button
2. Modal makes API call with customer email and estimate key
3. Backend sends email
4. Modal shows success/error message
5. Admin stays on current page

### After (Legacy Route):
1. Admin clicks "Send Customer Estimate Email" button
2. Modal constructs legacy admin URL with customer estimate key
3. Modal opens URL in new browser tab (`window.open`)
4. Admin is taken to legacy ProjectRCS email page
5. Admin can send email through legacy interface
6. Original modal stays open in background

## Benefits

### 1. Reuses Existing Functionality
- Leverages battle-tested legacy email page
- No need to rebuild email template UI
- Maintains consistency with existing admin workflow

### 2. Flexibility
- Admin can review estimate details in legacy system
- Admin can customize email content before sending
- Admin can attach additional files if needed

### 3. Reduced Complexity
- No need to maintain duplicate email sending logic
- No need to handle email failures in new modal
- Simpler error handling (just check if estimate exists)

## Validation

The method performs minimal validation:

```typescript
if (!customerEstimateKey) {
  this.errorMessage.set('No customer estimate found. Please create the estimate first.');
  return;
}
```

**Validation Check:**
- Ensures customer estimate has been created
- Displays error message if estimate key is missing
- Prevents opening broken URL

## Console Logging

For debugging, the method logs:

```typescript
console.log('🔗 Opening legacy admin email page:', url);
console.log('📧 Customer Estimate Key (InvoiceKey):', customerEstimateKey);
```

**Example Output:**
```
🔗 Opening legacy admin email page: https://admin-dev.retailfixitapp.com/MgtJobSalesOrder/EmailEstimateToCustomer/14a706a6-b064-4def-8c93-5e013a72bc75
📧 Customer Estimate Key (InvoiceKey): 14a706a6-b064-4def-8c93-5e013a72bc75
```

## Window Opening

Uses standard `window.open()` with security best practices:

```typescript
window.open(url, '_blank', 'noopener');
```

**Parameters:**
- `url`: The legacy admin URL
- `'_blank'`: Opens in new tab
- `'noopener'`: Security flag to prevent new tab from accessing `window.opener`

## Success Message

Displays friendly confirmation:
```typescript
this.successMessage.set('Opening email estimate page in new tab...');
```

## Testing Checklist

### Functional Testing
- [ ] Customer estimate key is correctly extracted from response
- [ ] URL is correctly constructed with environment base URL
- [ ] New tab opens with correct URL
- [ ] Legacy email page loads successfully
- [ ] Estimate details are displayed correctly in legacy page
- [ ] Admin can send email from legacy page
- [ ] Original modal remains open in background

### Environment Testing
- [ ] Dev environment: Uses `https://admin-dev.retailfixitapp.com`
- [ ] UAT environment: Uses `https://admin-uat.retailfixitapp.com`
- [ ] Prod environment: Uses `https://admin.retailfixitapp.com`

### Edge Cases
- [ ] No customer estimate created yet (should show error)
- [ ] Customer estimate key is null/undefined (should show error)
- [ ] Browser blocks popup (user needs to allow)
- [ ] Legacy page requires login (user redirected to login)

### Error Handling
- [ ] Error message displayed if estimate key is missing
- [ ] Error message is clear and actionable
- [ ] No broken URLs are opened

## Files Modified

**`src/app/shared/components/on-site-estimate-modal/on-site-estimate-modal.component.ts`**
- Added environment import
- Replaced API call with legacy URL routing
- Simplified validation logic
- Removed email validation (not needed for route)
- Removed API subscription logic

## Related Files

### Environment Configuration
- `src/environments/environment.ts` - Dev config
- `src/environments/environment.azure-dev.ts` - Azure Dev config
- `src/environments/environment.uat.ts` - UAT config
- `src/environments/environment.prod.ts` - Production config

### Legacy Admin Routes
The legacy route is handled by ProjectRCS:
- Controller: `MgtJobSalesOrderController`
- Action: `EmailEstimateToCustomer`
- Parameter: `invoiceKey` (from route)

## Migration Notes

### Why Route Instead of API?

1. **Email Templates**: Legacy system has established email templates
2. **Testing**: Admins can preview and test emails before sending
3. **Customization**: Legacy page allows customization before sending
4. **Audit Trail**: Legacy system maintains email send history
5. **Attachments**: Legacy page supports file attachments

### Future Considerations

If email sending is moved to the new system in the future:
1. Rebuild email template UI in Angular
2. Add email preview functionality
3. Implement file attachment support
4. Build email send history tracking
5. Update this method to use new API endpoint

## Summary

✅ **Implementation Complete**
- Removed API-based email sending
- Added legacy admin URL routing
- Simplified validation logic
- Opens email page in new tab
- Maintains user context in original modal

🔗 **URL Pattern**
```
{env.legacyAdminBaseUrl}/MgtJobSalesOrder/EmailEstimateToCustomer/{customerEstimateKey}
```

📧 **User Experience**
- One-click access to legacy email page
- Original modal stays open for reference
- Familiar legacy email interface
- No duplicate functionality to maintain
