# On-Site Approval API - Frontend Integration Guide

This document provides complete integration details for the frontend team to connect to the new On-Site Approval API endpoints.

---

## Table of Contents

1. [Base URL](#base-url)
2. [Authentication](#authentication)
3. [API Endpoints Overview](#api-endpoints-overview)
4. [Complete Workflow](#complete-workflow)
5. [Endpoint Details](#endpoint-details)
6. [Error Handling](#error-handling)
7. [TypeScript Interfaces](#typescript-interfaces)

---

## Base URL

**Local Development:**
```
https://localhost:7028
```

**DEV Environment:**
```
https://service-rfi-job-operation-api-dev.retailfixitapp.com
```

**Production:**
```
https://service-rfi-job-operation-api.retailfixitapp.com
```

---

## Authentication

**Currently:** Authorization is temporarily disabled for local testing (commented out `[Authorize]` attribute)

**Production:** Will require JWT Bearer token:
```typescript
headers: {
  'Authorization': `Bearer ${jwtToken}`,
  'Content-Type': 'application/json'
}
```

---

## API Endpoints Overview

All endpoints use the base path: `/api/v1/admin/on-site-approval`

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/check-status` | Check if estimate exists for job |
| GET | `/initialize/{jobKey}` | Get form initialization data |
| POST | `/save-estimate` | Save/update estimate with line items |
| GET | `/customer-dne/{jobKey}` | Get 65% DNE threshold |
| POST | `/submit-for-customer-approval` | Submit estimate to customer |
| POST | `/approve-vendor-estimate` | Direct vendor approval (skip customer) |
| POST | `/upload-files` | Upload estimate files/photos |
| GET | `/files/{jobKey}` | Get list of uploaded files |
| DELETE | `/files/{uploadKey}` | Delete an uploaded file |

---

## Complete Workflow

### User Journey: "Provide On-Site Approval"

```
1. User clicks "Provide On-Site Approval" button
   ↓
2. Frontend calls: GET /check-status
   → If estimate exists (flag 2 or 3), show edit mode
   → If no estimate (flag 1), proceed to step 3
   ↓
3. Frontend calls: GET /initialize/{jobKey}
   → Receive job details, vendor info, DNE amounts, new estimateKey
   ↓
4. User fills out multi-step wizard:
   Step 1: Add labor line items
   Step 2: Add material/trip line items
   Step 3: Upload files (optional)
   ↓
5. User clicks "Save Estimate"
   → Frontend calls: POST /save-estimate (with all line items)
   ↓
6. Frontend calls: GET /customer-dne/{jobKey}
   → Check if estimate total exceeds 65% threshold
   ↓
7. User chooses approval path:
   
   Path A (Customer Approval):
   → Frontend calls: POST /submit-for-customer-approval
   
   Path B (Direct Vendor Approval):
   → Frontend calls: POST /approve-vendor-estimate
   → If exceeds threshold, backend returns warning
   → User confirms, frontend calls again with adminConfirmed: true
```

---

## Endpoint Details

### 1. Check Estimate Status

**Purpose:** Determine if an estimate already exists for this job/vendor

**Method:** `GET`

**Endpoint:** `/api/v1/admin/on-site-approval/check-status`

**Query Parameters:**
```typescript
{
  jobKey: string;      // GUID (required)
  vendorKey: string;   // GUID (required)
}
```

**Example Request:**
```typescript
const response = await fetch(
  `${baseUrl}/api/v1/admin/on-site-approval/check-status?jobKey=${jobKey}&vendorKey=${vendorKey}`,
  { method: 'GET' }
);
```

**Response:**
```json
{
  "status": true,
  "responseCode": 200,
  "message": "Status retrieved",
  "data": {
    "flag": 1,
    "estimateKey": null,
    "message": "No estimate exists - show 'Provide on-site approval' button"
  }
}
```

**Flag Values:**
- `1` = No estimate exists (create new)
- `2` = Simple estimate exists (few line items)
- `3` = Complex estimate exists (many line items)

---

### 2. Initialize Form

**Purpose:** Get all data needed to render the form

**Method:** `GET`

**Endpoint:** `/api/v1/admin/on-site-approval/initialize/{jobKey}`

**URL Parameters:**
```typescript
{
  jobKey: string;  // GUID (in URL path)
}
```

**Query Parameters:**
```typescript
{
  vendorKey: string;  // GUID (required)
}
```

**Example Request:**
```typescript
const response = await fetch(
  `${baseUrl}/api/v1/admin/on-site-approval/initialize/${jobKey}?vendorKey=${vendorKey}`,
  { method: 'GET' }
);
```

**Response:**
```json
{
  "status": true,
  "responseCode": 200,
  "message": "Initialization successful",
  "data": {
    "jobVendorKey": "25e98f2f-bc1b-425b-81a7-6cd96af22c4f",
    "newEstimateKey": "2ce448a6-a95e-47e8-9565-e76671bc6775",
    "jobName": "Job PO : 25927 ( STANDARD )",
    "isEmergency": 0,
    "locationName": "Location : CLEAN JUICE (BIRKDALE)",
    "vendorName": "Vendor : Islands Services",
    "vendorDNE": 1500,
    "customerDNE": 2000,
    "tempHeader": "1",
    "documentTypes": {
      "estimateDocLabel": "ESTIMATE FILE",
      "estimateDocKey": "13bab6d2-30c1-4a7a-8ba1-5f2f85a5748e",
      "signOffLabel": "Sign-off Sheet",
      "signOffKey": "9d3b736e-4a29-43be-881a-b84ff7a11897",
      "jobPicturesLabel": "Job pictures",
      "jobPicturesKey": "8b63828a-2645-4767-9377-150f3687e471"
    }
  }
}
```

**Frontend Actions:**
1. Save `newEstimateKey` - you'll need this for save-estimate
2. Display job/vendor info to user
3. Show DNE amounts
4. Use `documentTypes` for file upload categorization

---

### 3. Save Estimate

**Purpose:** Save estimate header + all line items (labor, materials, trip charges)

**Method:** `POST`

**Endpoint:** `/api/v1/admin/on-site-approval/save-estimate`

**Content-Type:** `application/json`

**Request Body:**
```json
{
  "jobKey": "6af781b3-a771-4ea2-a90d-b6979080c56b",
  "vendorKey": "42fa6af3-7f6b-4aca-b8f0-d734943201fe",
  "vendorEstimateKey": "2ce448a6-a95e-47e8-9565-e76671bc6775",
  "lineItems": [
    {
      "chargeTypeKey": "Flat Trip Charge",
      "itemName": "Trip Charge",
      "costIncurred": 0,
      "description": "Service call to location",
      "displayLevel": "1",
      "rate": 150.00,
      "quantity": 1.0,
      "laborHours": null,
      "techCount": null,
      "isLabor": false
    },
    {
      "chargeTypeKey": "Standard Hourly Rate",
      "itemName": "Standard Hourly Rate",
      "costIncurred": 0,
      "description": "<p>Repair HVAC unit</p>",
      "displayLevel": "1",
      "rate": 125.00,
      "quantity": 0,
      "laborHours": 3.0,
      "techCount": 1,
      "isLabor": true
    },
    {
      "chargeTypeKey": "MATERIALS",
      "itemName": "Materials",
      "costIncurred": 0,
      "description": "<p>Parts and supplies</p>",
      "displayLevel": "1",
      "rate": 275.00,
      "quantity": 1.0,
      "laborHours": null,
      "techCount": null,
      "isLabor": false
    }
  ]
}
```

**Field Details:**

| Field | Type | Required | Description | Used For |
|-------|------|----------|-------------|----------|
| `jobKey` | GUID | ✅ | Job identifier | All items |
| `vendorKey` | GUID | ✅ | Vendor identifier | All items |
| `vendorEstimateKey` | GUID | ✅ | From initialize endpoint | All items |
| `lineItems` | Array | ✅ | All estimate line items | - |

**Line Item Fields:**

| Field | Type | Required | Labor | Material/Trip | Description |
|-------|------|----------|-------|---------------|-------------|
| `chargeTypeKey` | string | ✅ | ✅ | ✅ | Type of charge (e.g., "Standard Hourly Rate", "MATERIALS") |
| `itemName` | string | ✅ | ✅ | ✅ | Display name (can be same as chargeTypeKey) |
| `costIncurred` | int | ✅ | ✅ | ✅ | 0 = Proposed, 1 = Incurred |
| `description` | string | ✅ | ✅ | ✅ | HTML description of work/materials |
| `displayLevel` | string | ✅ | ✅ | ✅ | Visibility level (usually "1") |
| `rate` | decimal | ✅ | ✅ | ✅ | Hourly rate (labor) or unit price (material) |
| `quantity` | decimal | ❌ | ❌ | ✅ | Quantity for materials/trip (not used for labor) |
| `laborHours` | decimal | ❌ | ✅ | ❌ | Hours worked (labor only) |
| `techCount` | int | ❌ | ✅ | ❌ | Number of technicians (labor only) |
| `isLabor` | boolean | ✅ | ✅ | ✅ | **true** = labor, **false** = material/trip |

**Example TypeScript Code:**
```typescript
// Trip Charge (Material Type)
const tripCharge = {
  chargeTypeKey: "Flat Trip Charge",
  itemName: "Trip Charge",
  costIncurred: 0,
  description: "Service call",
  displayLevel: "1",
  rate: 150.00,
  quantity: 1.0,
  laborHours: null,
  techCount: null,
  isLabor: false  // ← Not labor
};

// Labor Item
const laborItem = {
  chargeTypeKey: "Standard Hourly Rate",
  itemName: "Standard Hourly Rate",
  costIncurred: 0,
  description: "<p>Repair work description</p>",
  displayLevel: "1",
  rate: 125.00,
  quantity: 0,        // Not used for labor
  laborHours: 3.0,    // ← Labor specific
  techCount: 1,       // ← Labor specific
  isLabor: true       // ← Is labor
};

// Material Item
const materialItem = {
  chargeTypeKey: "MATERIALS",
  itemName: "Materials",
  costIncurred: 0,
  description: "<p>Parts list</p>",
  displayLevel: "1",
  rate: 45.00,
  quantity: 2.0,      // ← Material specific
  laborHours: null,
  techCount: null,
  isLabor: false      // ← Not labor
};

const requestBody = {
  jobKey: jobKey,
  vendorKey: vendorKey,
  vendorEstimateKey: estimateKey,  // From initialize response
  lineItems: [tripCharge, laborItem, materialItem]
};

const response = await fetch(
  `${baseUrl}/api/v1/admin/on-site-approval/save-estimate`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  }
);
```

**Response:**
```json
{
  "status": true,
  "responseCode": 200,
  "message": "Estimate saved",
  "data": {
    "invoiceKey": "2ce448a6-a95e-47e8-9565-e76671bc6775",
    "message": "Estimate saved successfully"
  }
}
```

---

### 4. Get Customer DNE (65% Threshold)

**Purpose:** Calculate 65% of customer DNE to determine if admin approval is needed

**Method:** `GET`

**Endpoint:** `/api/v1/admin/on-site-approval/customer-dne/{jobKey}`

**URL Parameters:**
```typescript
{
  jobKey: string;  // GUID (in URL path)
}
```

**Example Request:**
```typescript
const response = await fetch(
  `${baseUrl}/api/v1/admin/on-site-approval/customer-dne/${jobKey}`,
  { method: 'GET' }
);
```

**Response:**
```json
{
  "status": true,
  "responseCode": 200,
  "message": "Customer DNE retrieved",
  "data": {
    "customerDNE": 2000,
    "thresholdAmount": 1300.00
  }
}
```

**Frontend Logic:**
```typescript
// After saving estimate, calculate total
const estimateTotal = calculateTotalFromLineItems();

// Get threshold
const dneResponse = await fetch(`${baseUrl}/api/v1/admin/on-site-approval/customer-dne/${jobKey}`);
const { customerDNE, thresholdAmount } = dneResponse.data;

if (estimateTotal > thresholdAmount) {
  // Show warning: "Estimate exceeds 65% of customer DNE"
  // Require admin confirmation before direct approval
}
```

---

### 5. Submit for Customer Approval

**Purpose:** Send estimate to customer for review (Status = 5)

**Method:** `POST`

**Endpoint:** `/api/v1/admin/on-site-approval/submit-for-customer-approval`

**Content-Type:** `application/json`

**Request Body:**
```json
{
  "estimateKey": "2ce448a6-a95e-47e8-9565-e76671bc6775",
  "jobKey": "6af781b3-a771-4ea2-a90d-b6979080c56b"
}
```

**Example TypeScript:**
```typescript
const response = await fetch(
  `${baseUrl}/api/v1/admin/on-site-approval/submit-for-customer-approval`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      estimateKey: estimateKey,
      jobKey: jobKey
    })
  }
);
```

**Response:**
```json
{
  "status": true,
  "responseCode": 200,
  "message": "Submitted for customer approval",
  "data": {
    "success": true,
    "message": "Estimate submitted for customer approval",
    "estimateKey": "2ce448a6-a95e-47e8-9565-e76671bc6775"
  }
}
```

---

### 6. Approve Vendor Estimate (Direct Approval)

**Purpose:** Admin directly approves estimate, skipping customer review

**Method:** `POST`

**Endpoint:** `/api/v1/admin/on-site-approval/approve-vendor-estimate`

**Content-Type:** `application/json`

**Request Body:**
```json
{
  "estimateKey": "2ce448a6-a95e-47e8-9565-e76671bc6775",
  "adminConfirmed": false
}
```

**Field Details:**
- `adminConfirmed`: `false` on first attempt, `true` if confirming after threshold warning

**Example TypeScript:**
```typescript
// First attempt
const response1 = await fetch(
  `${baseUrl}/api/v1/admin/on-site-approval/approve-vendor-estimate`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      estimateKey: estimateKey,
      adminConfirmed: false
    })
  }
);

const result = await response1.json();

if (result.data.requiresConfirmation) {
  // Show warning modal to user
  const confirmed = await showWarningModal(result.data.message);
  
  if (confirmed) {
    // Second attempt with confirmation
    const response2 = await fetch(
      `${baseUrl}/api/v1/admin/on-site-approval/approve-vendor-estimate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estimateKey: estimateKey,
          adminConfirmed: true  // ← User confirmed
        })
      }
    );
  }
}
```

**Response (Under Threshold):**
```json
{
  "status": true,
  "responseCode": 200,
  "message": "Estimate approved",
  "data": {
    "success": true,
    "requiresConfirmation": false,
    "message": "Estimate approved successfully",
    "estimateTotal": 1055.00,
    "customerDNE": 2000,
    "thresholdAmount": 1300.00
  }
}
```

**Response (Over Threshold - Requires Confirmation):**
```json
{
  "status": true,
  "responseCode": 200,
  "message": "Confirmation required",
  "data": {
    "success": false,
    "requiresConfirmation": true,
    "message": "The Vendor approval amount of 1500.00 has exceeded the 65% of customer DNE 2000.00 which amounts to: 1300.00. Only proceed if you have received approval from the customer.",
    "estimateTotal": 1500.00,
    "customerDNE": 2000,
    "thresholdAmount": 1300.00
  }
}
```

---

### 7. Upload Files

**Purpose:** Upload estimate documents, photos, sign-off sheets

**Method:** `POST`

**Endpoint:** `/api/v1/admin/on-site-approval/upload-files`

**Content-Type:** `multipart/form-data`

**Form Data Fields:**
```typescript
{
  jobKey: string;           // GUID (required)
  vendorKey: string;        // GUID (required)
  documentTypeKey: string;  // GUID (required) - from documentTypes in initialize response
  files: File[];            // Array of files (required)
}
```

**Example TypeScript (using FormData):**
```typescript
const formData = new FormData();
formData.append('jobKey', jobKey);
formData.append('vendorKey', vendorKey);
formData.append('documentTypeKey', '13bab6d2-30c1-4a7a-8ba1-5f2f85a5748e'); // Estimate docs

// Add multiple files
files.forEach(file => {
  formData.append('files', file);
});

const response = await fetch(
  `${baseUrl}/api/v1/admin/on-site-approval/upload-files`,
  {
    method: 'POST',
    body: formData  // Don't set Content-Type header, browser will set it
  }
);
```

**Document Type Keys (from initialize response):**
- **Estimate Documents:** `13bab6d2-30c1-4a7a-8ba1-5f2f85a5748e`
- **Sign-off Sheets:** `9d3b736e-4a29-43be-881a-b84ff7a11897`
- **Job Pictures:** `8b63828a-2645-4767-9377-150f3687e471`

**Response:**
```json
{
  "status": true,
  "responseCode": 200,
  "message": "Files uploaded successfully",
  "data": {
    "uploadedFiles": [
      {
        "uploadKey": "826871a8-7475-4dac-9d70-b23045266eae",
        "fileName": "estimate.pdf",
        "fileType": "application/pdf",
        "documentTypeKey": "13bab6d2-30c1-4a7a-8ba1-5f2f85a5748e"
      }
    ]
  }
}
```

---

### 8. Get Uploaded Files

**Purpose:** Retrieve list of all uploaded files for job/vendor

**Method:** `GET`

**Endpoint:** `/api/v1/admin/on-site-approval/files/{jobKey}`

**URL Parameters:**
```typescript
{
  jobKey: string;  // GUID (in URL path)
}
```

**Query Parameters:**
```typescript
{
  vendorKey: string;  // GUID (required)
}
```

**Example Request:**
```typescript
const response = await fetch(
  `${baseUrl}/api/v1/admin/on-site-approval/files/${jobKey}?vendorKey=${vendorKey}`,
  { method: 'GET' }
);
```

**Response:**
```json
{
  "status": true,
  "responseCode": 200,
  "message": "Files retrieved",
  "data": [
    {
      "uploadKey": "826871a8-7475-4dac-9d70-b23045266eae",
      "fileName": "Screenshot 2026-06-22 at 4.00.21 PM.png",
      "fileType": "image/png",
      "uploadDate": "2026-06-30T02:42:14.2700000",
      "documentTypeName": "ESTIMATE FILE",
      "documentTypeKey": "13bab6d2-30c1-4a7a-8ba1-5f2f85a5748e",
      "secureUrl": "https://service-rfi-file-storage-api-dev.retailfixitapp.com/api/files/serve-file?..."
    }
  ]
}
```

**Frontend Actions:**
- Display file list with download links
- Use `secureUrl` to download/preview files
- Use `uploadKey` for delete operations

---

### 9. Delete Uploaded File

**Purpose:** Remove an uploaded file

**Method:** `DELETE`

**Endpoint:** `/api/v1/admin/on-site-approval/files/{uploadKey}`

**URL Parameters:**
```typescript
{
  uploadKey: string;  // GUID (in URL path)
}
```

**Example Request:**
```typescript
const response = await fetch(
  `${baseUrl}/api/v1/admin/on-site-approval/files/${uploadKey}`,
  { method: 'DELETE' }
);
```

**Response:**
```json
{
  "status": true,
  "responseCode": 200,
  "message": "File deleted successfully",
  "data": {
    "uploadKey": "826871a8-7475-4dac-9d70-b23045266eae",
    "message": "File deleted successfully"
  }
}
```

---

## Error Handling

All endpoints return standardized error responses:

```json
{
  "status": false,
  "responseCode": 400,
  "message": "Error message",
  "data": null,
  "details": [
    {
      "field": "lineItems",
      "message": "At least one line item is required"
    }
  ],
  "unixTime": 1782787799,
  "traceId": "00-82ecfff01c3bf2d0ca04983e116aadac-fb7a46b07d6a5643-00"
}
```

**Common HTTP Status Codes:**
- `200` - Success
- `400` - Bad Request (validation error)
- `404` - Not Found (job/vendor/estimate not found)
- `500` - Internal Server Error

**Error Handling Example:**
```typescript
const response = await fetch(url, options);
const result = await response.json();

if (!result.status) {
  // Handle error
  console.error(`Error: ${result.message}`);
  
  if (result.details?.length > 0) {
    result.details.forEach(detail => {
      console.error(`  ${detail.field}: ${detail.message}`);
    });
  }
  
  throw new Error(result.message);
}

return result.data;
```

---

## TypeScript Interfaces

```typescript
// ==========================================
// API Response Wrapper
// ==========================================
interface ApiResponse<T> {
  status: boolean;
  responseCode: number;
  message: string;
  data: T | null;
  details: ApiErrorDetail[];
  unixTime: number;
  traceId: string;
}

interface ApiErrorDetail {
  field?: string;
  message: string;
}

// ==========================================
// Check Status
// ==========================================
interface CheckStatusRequest {
  jobKey: string;
  vendorKey: string;
}

interface CheckStatusResponse {
  flag: number;          // 1 = no estimate, 2 = simple, 3 = complex
  estimateKey: string | null;
  message: string;
}

// ==========================================
// Initialize
// ==========================================
interface InitializeRequest {
  jobKey: string;
  vendorKey: string;
}

interface InitializeResponse {
  jobVendorKey: string;
  newEstimateKey: string;
  jobName: string;
  isEmergency: number;
  locationName: string;
  vendorName: string;
  vendorDNE: number;
  customerDNE: number;
  tempHeader: string;
  documentTypes: DocumentTypeLabels;
}

interface DocumentTypeLabels {
  estimateDocLabel: string;
  estimateDocKey: string;
  signOffLabel: string;
  signOffKey: string;
  jobPicturesLabel: string;
  jobPicturesKey: string;
}

// ==========================================
// Save Estimate
// ==========================================
interface SaveEstimateRequest {
  jobKey: string;
  vendorKey: string;
  vendorEstimateKey: string;
  lineItems: LineItem[];
}

interface LineItem {
  chargeTypeKey: string;
  itemName: string;
  costIncurred: number;        // 0 = proposed, 1 = incurred
  description: string;
  displayLevel: string;
  rate: number;
  quantity: number;            // For materials/trip only
  laborHours: number | null;   // For labor only
  techCount: number | null;    // For labor only
  isLabor: boolean;            // true = labor, false = material/trip
}

interface SaveEstimateResponse {
  invoiceKey: string;
  message: string;
}

// ==========================================
// Customer DNE
// ==========================================
interface CustomerDNEResponse {
  customerDNE: number;
  thresholdAmount: number;  // 65% of customerDNE
}

// ==========================================
// Submit for Customer Approval
// ==========================================
interface SubmitForCustomerApprovalRequest {
  estimateKey: string;
  jobKey: string;
}

interface SubmitForCustomerApprovalResponse {
  success: boolean;
  message: string;
  estimateKey: string;
}

// ==========================================
// Approve Vendor Estimate
// ==========================================
interface ApproveEstimateRequest {
  estimateKey: string;
  adminConfirmed: boolean;  // false first time, true if confirming threshold warning
}

interface ApproveEstimateResponse {
  success: boolean;
  requiresConfirmation: boolean;
  message: string;
  estimateTotal: number;
  customerDNE: number;
  thresholdAmount: number;
}

// ==========================================
// Upload Files
// ==========================================
interface UploadFilesRequest {
  jobKey: string;
  vendorKey: string;
  documentTypeKey: string;
  files: File[];
}

interface UploadFilesResponse {
  uploadedFiles: UploadedFile[];
}

interface UploadedFile {
  uploadKey: string;
  fileName: string;
  fileType: string;
  documentTypeKey: string;
}

// ==========================================
// Get Files
// ==========================================
interface GetFilesRequest {
  jobKey: string;
  vendorKey: string;
}

interface GetFilesResponse {
  uploadKey: string;
  fileName: string;
  fileType: string;
  uploadDate: string;
  documentTypeName: string;
  documentTypeKey: string;
  secureUrl: string;
}

// ==========================================
// Delete File
// ==========================================
interface DeleteFileResponse {
  uploadKey: string;
  message: string;
}
```

---

## Complete React Example

```typescript
import React, { useState, useEffect } from 'react';

const OnSiteApprovalModal: React.FC<{ jobKey: string; vendorKey: string }> = ({ 
  jobKey, 
  vendorKey 
}) => {
  const [estimateKey, setEstimateKey] = useState<string>('');
  const [jobInfo, setJobInfo] = useState<InitializeResponse | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [loading, setLoading] = useState(false);

  const baseUrl = 'https://localhost:7028';

  // Step 1: Check if estimate exists
  useEffect(() => {
    checkEstimateStatus();
  }, []);

  const checkEstimateStatus = async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/admin/on-site-approval/check-status?jobKey=${jobKey}&vendorKey=${vendorKey}`
    );
    const result: ApiResponse<CheckStatusResponse> = await response.json();
    
    if (result.data?.flag === 1) {
      // No estimate exists, initialize new one
      initializeForm();
    } else {
      // Estimate exists, load it for editing
      setEstimateKey(result.data?.estimateKey || '');
    }
  };

  // Step 2: Initialize form
  const initializeForm = async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/admin/on-site-approval/initialize/${jobKey}?vendorKey=${vendorKey}`
    );
    const result: ApiResponse<InitializeResponse> = await response.json();
    
    if (result.data) {
      setJobInfo(result.data);
      setEstimateKey(result.data.newEstimateKey);
    }
  };

  // Step 3: Add line item
  const addLineItem = (item: LineItem) => {
    setLineItems([...lineItems, item]);
  };

  // Step 4: Save estimate
  const saveEstimate = async () => {
    setLoading(true);
    
    const requestBody: SaveEstimateRequest = {
      jobKey,
      vendorKey,
      vendorEstimateKey: estimateKey,
      lineItems
    };

    const response = await fetch(
      `${baseUrl}/api/v1/admin/on-site-approval/save-estimate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      }
    );

    const result: ApiResponse<SaveEstimateResponse> = await response.json();
    setLoading(false);

    if (result.status) {
      alert('Estimate saved successfully!');
    }
  };

  // Step 5: Approve estimate
  const approveEstimate = async () => {
    const requestBody: ApproveEstimateRequest = {
      estimateKey,
      adminConfirmed: false
    };

    const response = await fetch(
      `${baseUrl}/api/v1/admin/on-site-approval/approve-vendor-estimate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      }
    );

    const result: ApiResponse<ApproveEstimateResponse> = await response.json();

    if (result.data?.requiresConfirmation) {
      // Show warning and get confirmation
      const confirmed = window.confirm(result.data.message);
      
      if (confirmed) {
        // Re-submit with confirmation
        await approveEstimateWithConfirmation();
      }
    } else {
      alert('Estimate approved successfully!');
    }
  };

  const approveEstimateWithConfirmation = async () => {
    const requestBody: ApproveEstimateRequest = {
      estimateKey,
      adminConfirmed: true  // User confirmed
    };

    const response = await fetch(
      `${baseUrl}/api/v1/admin/on-site-approval/approve-vendor-estimate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      }
    );

    const result: ApiResponse<ApproveEstimateResponse> = await response.json();
    
    if (result.status) {
      alert('Estimate approved successfully!');
    }
  };

  return (
    <div>
      {/* Your UI components here */}
      <button onClick={saveEstimate} disabled={loading}>
        Save Estimate
      </button>
      <button onClick={approveEstimate}>
        Approve Estimate
      </button>
    </div>
  );
};
```

---

## Summary Checklist

**Before calling any endpoints:**
- ✅ Obtain `jobKey` and `vendorKey` from current context
- ✅ Set base URL based on environment (local/dev/prod)
- ✅ Include JWT token in Authorization header (when auth is enabled)

**For save-estimate endpoint:**
- ✅ Use `vendorEstimateKey` from initialize response
- ✅ Set `isLabor: true` for labor items
- ✅ Set `isLabor: false` for materials/trip items
- ✅ Include `laborHours` and `techCount` for labor only
- ✅ Include `quantity` for materials/trip only
- ✅ Use HTML formatting in `description` field
- ✅ Set `costIncurred: 0` for proposed costs
- ✅ Set `displayLevel: "1"` (as string, not number)

**For approval flow:**
- ✅ Check threshold before allowing direct approval
- ✅ Handle `requiresConfirmation` response
- ✅ Re-submit with `adminConfirmed: true` after user confirms

---

## Questions?

If you encounter any issues or have questions, contact the backend team with:
1. The endpoint you're calling
2. The request payload you're sending
3. The error response you're receiving
4. The `traceId` from the error response

Good luck with the integration! 🚀
