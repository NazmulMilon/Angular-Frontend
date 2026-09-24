# Customer Estimate Email - Frontend Integration Guide

## Overview

After creating a customer estimate, you can send it to the customer via email using this endpoint. The email will include estimate details, approve/decline buttons, and optional file attachments.

---

## API Endpoint

```
POST /api/v1/admin/on-site-approval/send-customer-estimate-email
```

**Authentication:** Requires JWT Bearer token

---

## Request Body

### TypeScript Interface

```typescript
interface SendCustomerEstimateEmailRequest {
  customerEstimateKey: string;     // REQUIRED - The customer estimate GUID
  customerEmail: string;            // REQUIRED - Customer's email address
  customNotes?: string;             // OPTIONAL - Admin notes to include in email
  ccEmails?: string[];              // OPTIONAL - Additional email addresses to CC
  attachJobFiles?: string[];        // OPTIONAL - Job file GUIDs to attach
  attachVendorFiles?: string[];     // OPTIONAL - Vendor upload GUIDs to attach
}
```

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `customerEstimateKey` | string (GUID) | The customer estimate key returned from `create-customer-estimate` endpoint |
| `customerEmail` | string | Email address where estimate will be sent |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `customNotes` | string | Personal message from admin to customer (shown in email body) |
| `ccEmails` | string[] | Additional recipients (e.g., account manager, customer contact) |
| `attachJobFiles` | string[] | Array of job file GUIDs to attach as PDFs/images |
| `attachVendorFiles` | string[] | Array of vendor upload GUIDs (from on-site approval uploads) |

---

## Response

### Success Response (200)

```typescript
interface SendCustomerEstimateEmailResponse {
  success: true;
  message: string;
  data: {
    success: true;
    message: "Customer estimate email sent successfully";
    sentToEmail: string;
    emailSubject: string;
  };
  responseCode: 200;
  traceId: string;
}
```

### Error Responses

#### 400 - Validation Error
```json
{
  "success": false,
  "message": "CustomerEstimateKey is required",
  "responseCode": 400,
  "traceId": "..."
}
```

#### 404 - Not Found
```json
{
  "success": false,
  "message": "Customer estimate not found",
  "responseCode": 404,
  "traceId": "..."
}
```

#### 500 - Server Error
```json
{
  "success": false,
  "message": "Failed to send customer estimate email",
  "errors": [
    {
      "message": "Unknown error from email service"
    }
  ],
  "responseCode": 500,
  "traceId": "..."
}
```

---

## Complete Workflow Example

### Step 1: Submit Vendor Estimate for Customer Approval

```typescript
const submitResponse = await fetch('/api/v1/admin/on-site-approval/submit-for-customer-approval', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    estimateKey: vendorEstimateKey
  })
});
```

### Step 2: Create Customer Estimate with Markups

```typescript
const createResponse = await fetch('/api/v1/admin/on-site-approval/create-customer-estimate', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    vendorEstimateKey: vendorEstimateKey
  })
});

const { customerEstimateKey } = await createResponse.json().then(r => r.data);
```

### Step 3: Send Email to Customer

```typescript
const emailResponse = await fetch('/api/v1/admin/on-site-approval/send-customer-estimate-email', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    customerEstimateKey: customerEstimateKey,
    customerEmail: 'customer@example.com',
    customNotes: 'Please review and approve this estimate at your earliest convenience.',
    ccEmails: ['manager@example.com'],
    attachJobFiles: ['file-guid-1', 'file-guid-2'],
    attachVendorFiles: ['upload-guid-1']
  })
});

const result = await emailResponse.json();
if (result.success) {
  alert(`Email sent to ${result.data.sentToEmail}`);
}
```

---

## Real-World Examples

### Example 1: Simple Email (No Attachments)

```json
{
  "customerEstimateKey": "f5e8c7b3-2a41-4e9d-8f73-9c1d6e4a8b2f",
  "customerEmail": "customer@store123.com"
}
```

### Example 2: Email with Custom Notes

```json
{
  "customerEstimateKey": "f5e8c7b3-2a41-4e9d-8f73-9c1d6e4a8b2f",
  "customerEmail": "customer@store123.com",
  "customNotes": "Hi John, attached is the estimate for the electrical outlet repair. Please review and let us know if you have any questions. Thanks!"
}
```

### Example 3: Email with CC and Attachments

```json
{
  "customerEstimateKey": "f5e8c7b3-2a41-4e9d-8f73-9c1d6e4a8b2f",
  "customerEmail": "customer@store123.com",
  "customNotes": "Estimate for repair work as discussed.",
  "ccEmails": ["manager@retailfixit.com", "accounting@store123.com"],
  "attachJobFiles": ["a1b2c3d4-e5f6-7890-abcd-ef1234567890"],
  "attachVendorFiles": ["b2c3d4e5-f6a7-8901-bcde-f12345678901"]
}
```

---

## Angular Service Example

```typescript
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class CustomerEstimateService {
  private baseUrl = 'https://localhost:7028/api/v1/admin/on-site-approval';

  constructor(private http: HttpClient) {}

  sendCustomerEstimateEmail(request: SendCustomerEstimateEmailRequest): Observable<ApiResponse<SendCustomerEstimateEmailResponse>> {
    return this.http.post<ApiResponse<SendCustomerEstimateEmailResponse>>(
      `${this.baseUrl}/send-customer-estimate-email`,
      request
    );
  }

  // Complete workflow method
  async submitEstimateForCustomerApproval(
    vendorEstimateKey: string,
    customerEmail: string,
    customNotes?: string,
    attachments?: { jobFiles?: string[], vendorFiles?: string[] }
  ) {
    try {
      // Step 1: Submit for approval
      const submitResult = await this.http.post<ApiResponse<any>>(
        `${this.baseUrl}/submit-for-customer-approval`,
        { estimateKey: vendorEstimateKey }
      ).toPromise();

      if (!submitResult.success) {
        throw new Error(submitResult.message);
      }

      // Step 2: Create customer estimate
      const createResult = await this.http.post<ApiResponse<CreateCustomerEstimateResponse>>(
        `${this.baseUrl}/create-customer-estimate`,
        { vendorEstimateKey }
      ).toPromise();

      if (!createResult.success) {
        throw new Error(createResult.message);
      }

      // Step 3: Send email
      const emailResult = await this.sendCustomerEstimateEmail({
        customerEstimateKey: createResult.data.customerEstimateKey,
        customerEmail,
        customNotes,
        attachJobFiles: attachments?.jobFiles,
        attachVendorFiles: attachments?.vendorFiles
      }).toPromise();

      if (!emailResult.success) {
        throw new Error(emailResult.message);
      }

      return {
        success: true,
        customerEstimateKey: createResult.data.customerEstimateKey,
        emailSentTo: emailResult.data.sentToEmail
      };

    } catch (error) {
      console.error('Error in customer approval workflow:', error);
      throw error;
    }
  }
}
```

---

## UI Implementation Suggestions

### Modal for Email Confirmation

Before sending the email, show a modal to collect:

```typescript
interface EmailModalData {
  customerEmail: string;           // Pre-filled from job/customer
  customNotes: string;              // Text area for admin
  ccEmails: string[];               // Multi-input field
  attachJobFiles: string[];         // Checkboxes for available files
  attachVendorFiles: string[];      // Checkboxes for vendor uploads
}
```

### Form Validation

```typescript
function validateEmailRequest(data: SendCustomerEstimateEmailRequest): string[] {
  const errors: string[] = [];
  
  if (!data.customerEstimateKey) {
    errors.push('Customer estimate key is required');
  }
  
  if (!data.customerEmail) {
    errors.push('Customer email is required');
  } else if (!isValidEmail(data.customerEmail)) {
    errors.push('Customer email is invalid');
  }
  
  if (data.ccEmails && data.ccEmails.length > 0) {
    const invalidCCs = data.ccEmails.filter(email => !isValidEmail(email));
    if (invalidCCs.length > 0) {
      errors.push(`Invalid CC emails: ${invalidCCs.join(', ')}`);
    }
  }
  
  return errors;
}
```

### Success Toast Message

```typescript
this.toastr.success(
  `Estimate sent to ${result.data.sentToEmail}`,
  'Email Sent Successfully',
  { timeOut: 5000 }
);
```

### Error Handling

```typescript
try {
  const result = await this.sendEmail(request);
  this.showSuccess(result);
} catch (error) {
  if (error.status === 404) {
    this.toastr.error('Estimate not found. Please refresh and try again.');
  } else if (error.status === 500) {
    this.toastr.error(
      'Failed to send email. The estimate was saved but email could not be sent. ' +
      'You can retry from the estimate details page.',
      'Email Failed',
      { timeOut: 8000 }
    );
  } else {
    this.toastr.error('An unexpected error occurred. Please try again.');
  }
}
```

---

## What Happens After Email Sends

### Database Updates

The backend automatically:
1. ✅ Sets `JobSalesInvoice.EstimatesSent = true`
2. ✅ Sets `JobSalesInvoice.SentToCustomer = true`
3. ✅ Sets `JobSalesInvoice.EmailToCustomerDate = (current date/time)`
4. ✅ Sets `JobSalesInvoice.EmailedToEmail = (customer email)`
5. ✅ Creates audit note in `AdminActionNotes`

### Email Contents (Handled by RFIEmailService)

The customer receives:
- **Subject:** "Estimate for Job [PO Number]"
- **Body:** 
  - Company branding
  - Job details (PO, location, description)
  - Estimate line items (materials, labor, trip charges)
  - Total amount
  - Custom admin notes (if provided)
  - **Approve Button** - links to customer portal
  - **Decline Button** - links to customer portal
  - Account manager contact information
- **Attachments:**
  - Estimate PDF (auto-generated)
  - Job files (if specified)
  - Vendor uploads (if specified)

### Customer Actions

When customer clicks approve/decline:
1. Redirected to customer portal
2. Shows estimate details
3. Confirms action
4. Portal updates `JobSalesInvoiceEstimateStatus` table
5. Admin receives notification

---

## Testing Checklist

### Required Tests

- [ ] Send email with only required fields
- [ ] Send email with custom notes
- [ ] Send email with CC recipients
- [ ] Send email with job file attachments
- [ ] Send email with vendor file attachments
- [ ] Send email with all optional fields
- [ ] Handle 404 error (invalid estimate key)
- [ ] Handle 400 error (missing email)
- [ ] Handle 500 error (email service down)
- [ ] Verify toast notifications appear
- [ ] Verify error messages are user-friendly
- [ ] Test email validation
- [ ] Test with special characters in notes
- [ ] Test with multiple CC emails
- [ ] Test with invalid CC email format

### Integration Tests

- [ ] Complete flow: submit → create → email
- [ ] Verify database flags updated after send
- [ ] Verify audit note created
- [ ] Check customer actually receives email
- [ ] Verify attachments are included
- [ ] Test approve/decline links work

---

## Troubleshooting

### "Customer estimate not found" (404)

**Cause:** Invalid `customerEstimateKey` or estimate was deleted

**Solution:**
- Verify the estimate key from create-customer-estimate response
- Check that estimate exists in database
- Ensure you're using customer estimate key, not vendor estimate key

### "Failed to send customer estimate email" (500)

**Cause:** RFIEmailService unavailable or returned error

**Solution:**
- Check RFIEmailService is running
- Verify `RFIApiKey` configuration is correct
- Check email service logs for detailed error
- Allow admin to retry sending

### Email sent but customer didn't receive it

**Cause:** Email in spam, wrong email address, or email service issue

**Solution:**
- Verify email address is correct
- Check spam folder
- Check email service delivery logs
- Resend email if needed

---

## Quick Reference

### Minimum Required Request

```json
{
  "customerEstimateKey": "guid-here",
  "customerEmail": "email@example.com"
}
```

### Full Request with All Options

```json
{
  "customerEstimateKey": "f5e8c7b3-2a41-4e9d-8f73-9c1d6e4a8b2f",
  "customerEmail": "customer@example.com",
  "customNotes": "Please review this estimate.",
  "ccEmails": ["manager@example.com", "accounting@example.com"],
  "attachJobFiles": ["file-guid-1", "file-guid-2"],
  "attachVendorFiles": ["upload-guid-1", "upload-guid-2"]
}
```

### cURL Example

```bash
curl -X POST "https://localhost:7028/api/v1/admin/on-site-approval/send-customer-estimate-email" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "customerEstimateKey": "f5e8c7b3-2a41-4e9d-8f73-9c1d6e4a8b2f",
    "customerEmail": "customer@example.com",
    "customNotes": "Please review and approve."
  }'
```

---

## Summary

**Endpoint:** `POST /api/v1/admin/on-site-approval/send-customer-estimate-email`

**Required:**
- `customerEstimateKey` (GUID)
- `customerEmail` (string)

**Optional:**
- `customNotes` (string)
- `ccEmails` (string[])
- `attachJobFiles` (string[])
- `attachVendorFiles` (string[])

**Returns:** Success/failure with email sent status

**Next Steps:**
1. Implement the service method
2. Create the email modal UI
3. Wire up form validation
4. Add error handling
5. Test the complete flow

---

Questions? Issues? Check the main documentation: `CustomerEstimate-Email-Implementation.md`
