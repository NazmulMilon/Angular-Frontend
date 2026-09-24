# On-Site Approval API Endpoint Mapping

This document shows the mapping from the old V1 API paths to the new V2 API paths for the On-Site Approval feature.

## Base URL Change

| Version | Base URL |
|---------|----------|
| **V1 (Old)** | `/api/vendor-estimate` |
| **V2 (New)** | `/api/v1/admin/on-site-approval` |

## Complete Endpoint Mapping

### 1. Check Status
**Purpose**: Checks if an estimate already exists  
**Method**: `GET`

| Version | Endpoint |
|---------|----------|
| V1 | `/api/vendor-estimate/check-status` |
| V2 | `/api/v1/admin/on-site-approval/check-status` |

**Query Parameters**: `jobKey`, `vendorKey`  
**Response**: `IntResponse` with status code (1 = no estimate, 2 = basic, 3+ = complex)

---

### 2. Initialize Estimate Session
**Purpose**: Initializes a new on-site approval estimate session  
**Method**: `GET`

| Version | Endpoint |
|---------|----------|
| V1 | `/api/vendor-estimate/initialize/{jobKey}` |
| V2 | `/api/v1/admin/on-site-approval/initialize/{jobKey}` |

**Query Parameters**: `vendorKey`  
**Response**: `OnSiteEstimateInitResponse` with temp estimate key, job/vendor details, DNE values, and document type labels

---

### 3. Save Estimate
**Purpose**: Saves estimate line items (trip charge, materials, labor)  
**Method**: `POST`

| Version | Endpoint |
|---------|----------|
| V1 | `/api/vendor-estimate/save` |
| V2 | `/api/v1/admin/on-site-approval/save-estimate` |

**Request Body**: `SaveOnSiteEstimateRequest`  
**Response**: `SaveOnSiteEstimateResponse` with persisted estimate key

---

### 4. Get Customer DNE Calculation
**Purpose**: Gets 65% customer DNE calculation for validation  
**Method**: `GET`

| Version | Endpoint |
|---------|----------|
| V1 | `/api/vendor-estimate/customer-dne/{jobKey}` |
| V2 | `/api/v1/admin/on-site-approval/customer-dne/{jobKey}` |

**Response**: `CustomerDneCalculationResponse` with calculated 65% threshold

---

### 5. Submit for Customer Approval
**Purpose**: Sends estimate to customer for approval  
**Method**: `POST`

| Version | Endpoint |
|---------|----------|
| V1 | `/api/vendor-estimate/submit-for-approval` |
| V2 | `/api/v1/admin/on-site-approval/submit-for-customer-approval` |

**Request Body**: `SubmitForCustomerApprovalRequest`  
**Response**: `SubmitForCustomerApprovalResponse` with navigation URL

---

### 6. Approve Vendor Estimate Directly
**Purpose**: Approves vendor estimate directly (skips customer approval)  
**Method**: `POST`

| Version | Endpoint |
|---------|----------|
| V1 | `/api/vendor-estimate/approve-direct` |
| V2 | `/api/v1/admin/on-site-approval/approve-vendor-estimate` |

**Request Body**: `ApproveVendorEstimateRequest`  
**Response**: `ApproveVendorEstimateResponse` with validation against 65% DNE rule

---

### 7. Upload Files
**Purpose**: Uploads files for the estimate (multipart/form-data)  
**Method**: `POST`

| Version | Endpoint |
|---------|----------|
| V1 | `/api/vendor-estimate/upload-files` |
| V2 | `/api/v1/admin/on-site-approval/upload-files` |

**Content-Type**: `multipart/form-data`  
**Form Fields**: `tempEstimateKey`, `documentTypeKey`, `jobKey`, `vendorKey`, `files`  
**Response**: `UploadEstimateFilesResponse` with structure:
```json
{
  "status": true,
  "responseCode": 200,
  "message": "Files uploaded",
  "data": {
    "filesUploaded": 1,
    "message": "1 file(s) have been successfully uploaded.",
    "uploadedFiles": [
      {
        "uploadKey": "...",
        "fileName": "...",
        "documentTypeKey": "..."
      }
    ]
  }
}
```

**Note**: Backend validation requires all of `tempEstimateKey`, `documentTypeKey`, `jobKey`, and `vendorKey` to be present.

---

### 8. Get Uploaded Files
**Purpose**: Gets list of uploaded files for the estimate  
**Method**: `GET`

| Version | Endpoint |
|---------|----------|
| V1 | `/api/vendor-estimate/files/{jobKey}` |
| V2 | `/api/v1/admin/on-site-approval/files/{jobKey}` |

**Query Parameters**: `vendorKey`  
**Response**: Array of `EstimateUploadedFile`

---

### 9. Delete Uploaded File
**Purpose**: Deletes a single uploaded file  
**Method**: `DELETE`

| Version | Endpoint |
|---------|----------|
| V1 | `/api/vendor-estimate/files/{uploadKey}` |
| V2 | `/api/v1/admin/on-site-approval/files/{uploadKey}` |

**Response**: `StringResponse` with success/failure message

---

### 10. Create Customer Estimate
**Purpose**: Creates a customer estimate from a vendor estimate  
**Method**: `POST`

| Version | Endpoint |
|---------|----------|
| V1 | N/A |
| V2 | `/api/v1/admin/on-site-approval/create-customer-estimate` |

**Request Body**: `CreateCustomerEstimateRequest` with vendor estimate key  
**Response**: `CreateCustomerEstimateResponse` with customer estimate details, line items, and totals

---

### 11. Send Customer Estimate Email
**Purpose**: Sends customer estimate email with approval link  
**Method**: `POST`

| Version | Endpoint |
|---------|----------|
| V1 | N/A |
| V2 | `/api/v1/admin/on-site-approval/send-customer-estimate-email` |

**Request Body**: `SendCustomerEstimateEmailRequest` with customer estimate key, email, and optional notes  
**Response**: `SendCustomerEstimateEmailResponse` with sent email details

---

### 12. Update Customer Estimate ✨ NEW
**Purpose**: Updates customer estimate line items (quantity, rate, amount) for admin editing  
**Method**: `PUT`

| Version | Endpoint |
|---------|----------|
| V1 | N/A |
| V2 | `/api/v1/admin/on-site-approval/update-customer-estimate` |

**Request Body**: 
```json
{
  "customerEstimateKey": "guid",
  "lineItems": [
    {
      "lineItemKey": "guid",
      "customerQty": 1.0,
      "customerRate": 150.00,
      "customerAmount": 150.00
    }
  ]
}
```

**Response**: `UpdateCustomerEstimateResponse` with updated totals and markup percentage  
**Use Case**: Auto-save functionality when admin edits customer estimate in comparison grid

---

### 13. Get Customer Markup by Job Key
**Purpose**: Gets customer markup percentages for a job's customer (used during customer estimate creation)  
**Method**: `GET`

| Version | Endpoint |
|---------|----------|
| V1 | N/A |
| V2 | `/api/v1/admin/on-site-approval/customer-markups/by-job/{jobKey}` |

**Path Parameters**: `jobKey` (Guid, required)  
**Response**: `CustomerMarkupResponse` with material markup %, labor/trip markup %, and admin markup %  
**Use Case**: Automatically fetch and apply customer markup when creating customer estimate from vendor estimate

---

## Implementation Details

### Frontend Service Location
- **File**: `src/app/services/assign-vendor.service.ts`
- **Base URL**: Line 2363 (updated to V2 path)
- **Methods**: Lines 2365-2503

### Frontend Model Location
- **File**: `src/app/models/on-site-estimate.model.ts`
- **Contains**: All TypeScript interfaces for requests, responses, and line items

### Frontend Component Location
- **File**: `src/app/shared/components/on-site-estimate-modal/on-site-estimate-modal.component.ts`
- **Purpose**: Multi-step modal wizard for creating on-site estimates

## Migration Status

✅ **Complete** - All frontend endpoints have been updated to use the V2 API paths as of this commit.

## Testing Endpoints

To test the endpoints, ensure the backend is running and use the following curl examples:

```bash
# 1. Initialize estimate session
curl -X GET "http://localhost:5000/api/v1/admin/on-site-approval/initialize/{jobKey}?vendorKey={vendorKey}"

# 2. Check status
curl -X GET "http://localhost:5000/api/v1/admin/on-site-approval/check-status?jobKey={jobKey}&vendorKey={vendorKey}"

# 3. Save estimate
curl -X POST "http://localhost:5000/api/v1/admin/on-site-approval/save-estimate" \
  -H "Content-Type: application/json" \
  -d '{"tempEstimateKey":"...","lineItems":[...]}'

# 4. Get customer DNE
curl -X GET "http://localhost:5000/api/v1/admin/on-site-approval/customer-dne/{jobKey}"

# 5. Submit for customer approval
curl -X POST "http://localhost:5000/api/v1/admin/on-site-approval/submit-for-customer-approval" \
  -H "Content-Type: application/json" \
  -d '{"tempEstimateKey":"...","sendEmail":true}'

# 6. Approve directly
curl -X POST "http://localhost:5000/api/v1/admin/on-site-approval/approve-vendor-estimate" \
  -H "Content-Type: application/json" \
  -d '{"tempEstimateKey":"..."}'

# 7. Upload files
curl -X POST "http://localhost:5000/api/v1/admin/on-site-approval/upload-files" \
  -F "tempEstimateKey=..." \
  -F "documentTypeKey=..." \
  -F "files[email protected]"

# 8. Get uploaded files
curl -X GET "http://localhost:5000/api/v1/admin/on-site-approval/files/{jobKey}?vendorKey={vendorKey}"

# 9. Delete file
curl -X DELETE "http://localhost:5000/api/v1/admin/on-site-approval/files/{uploadKey}"

# 10. Create customer estimate
curl -X POST "http://localhost:5000/api/v1/admin/on-site-approval/create-customer-estimate" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {token}" \
  -d '{"vendorEstimateKey":"..."}'

# 11. Send customer estimate email
curl -X POST "http://localhost:5000/api/v1/admin/on-site-approval/send-customer-estimate-email" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {token}" \
  -d '{"customerEstimateKey":"...","customerEmail":"customer@example.com","customNotes":"..."}'

# 12. Update customer estimate (NEW)
curl -X PUT "http://localhost:5000/api/v1/admin/on-site-approval/update-customer-estimate" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {token}" \
  -d '{"customerEstimateKey":"...","lineItems":[{"lineItemKey":"...","customerQty":1.0,"customerRate":150.00,"customerAmount":150.00}]}'

# 13. Get customer markup by job key (NEW)
curl -X GET "http://localhost:5000/api/v1/admin/on-site-approval/customer-markups/by-job/{jobKey}" \
  -H "Authorization: Bearer {token}"
```

## Notes

- All endpoints now use the consistent `/api/v1/admin/on-site-approval` base path
- The V1 paths are deprecated and should not be used
- Request/response models remain the same between V1 and V2
- Authentication and authorization requirements remain unchanged
