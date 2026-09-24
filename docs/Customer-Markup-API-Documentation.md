# Customer Markup Percentage API Documentation

## Overview

The Customer Markup API provides endpoints to retrieve customer markup percentages used for calculating customer estimates from vendor estimates. These endpoints return material markup, labor/trip markup, and admin markup percentages configured per customer.

## Implementation Status

✅ **COMPLETED** - All endpoints implemented and tested

## Endpoints

### 1. Get All Customer Markups

**Endpoint**: `GET /api/v1/admin/on-site-approval/customer-markups`

**Description**: Returns markup percentages for all active customers.

**Authentication**: Requires admin JWT token

**Request**: No parameters required

**Response** (200 OK):
```json
{
  "status": true,
  "responseCode": 200,
  "message": "Retrieved 104 customers with markup data",
  "data": [
    {
      "customerKey": "1bedf734-a801-4dc3-94ec-c2a3ea577f64",
      "customerName": "(TEST CUSTOMER)SMCP",
      "materialMarkupPercent": 25.00,
      "laborAndTripMarkupPercent": 10.00,
      "adminMarkupPercent": 18.00,
      "companyEmail": "rcscustomer@ntiers.dev",
      "companyPhone": null,
      "markupStatus": "Full Markup Configured"
    }
  ],
  "traceId": "..."
}
```

**Markup Status Values**:
- `"No Markup Configured"` - All three markup fields are NULL
- `"Full Markup Configured"` - Material and Labor/Trip markups are set
- `"Partial Markup Configured"` - Some but not all markups are set

**Use Cases**:
- Display customer list with markup configuration
- Admin dashboard showing all customer markups
- Dropdown selection for customer estimate creation

---

### 2. Get Customer Markup by Customer Key

**Endpoint**: `GET /api/v1/admin/on-site-approval/customer-markups/{customerKey}`

**Description**: Returns markup percentages for a specific customer.

**Authentication**: Requires admin JWT token

**Path Parameters**:
- `customerKey` (Guid, required) - The customer's unique identifier

**Request Example**:
```
GET /api/v1/admin/on-site-approval/customer-markups/1bedf734-a801-4dc3-94ec-c2a3ea577f64
```

**Response** (200 OK):
```json
{
  "status": true,
  "responseCode": 200,
  "message": "Customer markup data retrieved",
  "data": {
    "customerKey": "1bedf734-a801-4dc3-94ec-c2a3ea577f64",
    "customerName": "(TEST CUSTOMER)SMCP",
    "materialMarkupPercent": 25.00,
    "laborAndTripMarkupPercent": 10.00,
    "adminMarkupPercent": 18.00,
    "companyEmail": "rcscustomer@ntiers.dev",
    "companyPhone": null,
    "markupStatus": "Full Markup Configured"
  },
  "traceId": "..."
}
```

**Error Response** (404 Not Found):
```json
{
  "status": false,
  "responseCode": 404,
  "message": "Customer not found",
  "data": null,
  "traceId": "..."
}
```

**Use Cases**:
- Display customer markup on customer detail page
- Validate markup configuration before creating estimate
- Customer profile edit form

---

### 3. Get Customer Markup by Job Key

**Endpoint**: `GET /api/v1/admin/on-site-approval/customer-markups/by-job/{jobKey}`

**Description**: Returns markup percentages for the customer associated with a job. This is the most commonly used endpoint when creating customer estimates from vendor estimates.

**Authentication**: Requires admin JWT token

**Path Parameters**:
- `jobKey` (Guid, required) - The job's unique identifier

**Request Example**:
```
GET /api/v1/admin/on-site-approval/customer-markups/by-job/a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

**Response** (200 OK):
```json
{
  "status": true,
  "responseCode": 200,
  "message": "Customer markup data retrieved for job",
  "data": {
    "customerKey": "1bedf734-a801-4dc3-94ec-c2a3ea577f64",
    "customerName": "(TEST CUSTOMER)SMCP",
    "materialMarkupPercent": 25.00,
    "laborAndTripMarkupPercent": 10.00,
    "adminMarkupPercent": 18.00,
    "companyEmail": "rcscustomer@ntiers.dev",
    "companyPhone": null,
    "markupStatus": "Full Markup Configured"
  },
  "traceId": "..."
}
```

**Error Response** (404 Not Found):
```json
{
  "status": false,
  "responseCode": 404,
  "message": "Job not found",
  "data": null,
  "traceId": "..."
}
```

**Use Cases**:
- **Primary use**: Get markup data when creating customer estimate from vendor estimate
- Display customer markup in on-site approval modal
- Validate markup configuration before estimate calculations

---

### 4. Get Customer Markup Statistics

**Endpoint**: `GET /api/v1/admin/on-site-approval/customer-markups/statistics`

**Description**: Returns aggregate statistics for customer markup percentages across all active customers.

**Authentication**: Requires admin JWT token

**Request**: No parameters required

**Response** (200 OK):
```json
{
  "status": true,
  "responseCode": 200,
  "message": "Customer markup statistics retrieved",
  "data": {
    "totalActiveCustomers": 104,
    "customersWithMaterialMarkup": 62,
    "customersWithLaborTripMarkup": 62,
    "customersWithAdminMarkup": 62,
    "avgMaterialMarkup": 21.66,
    "avgLaborTripMarkup": 31.87,
    "avgAdminMarkup": 15.05,
    "minMaterialMarkup": 0.00,
    "maxMaterialMarkup": 78.00,
    "minLaborTripMarkup": 0.00,
    "maxLaborTripMarkup": 100.00
  },
  "traceId": "..."
}
```

**Use Cases**:
- Admin reporting dashboard
- Customer markup analytics
- Configuration audit/validation

---

## Markup Percentage Usage

### Material Markup
- **Field**: `materialMarkupPercent`
- **Usage**: Applied to material line items
- **Calculation**: `CustomerAmount = VendorAmount × (1 + MaterialMarkup/100)`
- **Example**: If vendor charges $100 for materials and markup is 25%, customer pays $125

### Labor and Trip Markup
- **Field**: `laborAndTripMarkupPercent`
- **Usage**: Applied to labor and trip charge line items
- **Calculation**: 
  - Minimum amount: `VendorAmount × (1 + LaborMarkup/100)`
  - Customer rates from `CustomerTradeCharge` table are also used
  - Hours may be adjusted in 0.5 increments to meet minimum margin
- **Example**: If vendor charges $200 for labor and markup is 35%, minimum customer amount is $270

### Admin Markup
- **Field**: `adminMarkupPercent`
- **Usage**: Applied to subtotal as separate line item
- **Calculation**: `AdminFee = CustomerSubtotal × (AdminMarkup/100)`
- **Line Item**: Added with NULL `ChargeTypeKey` and description showing percentage
- **Example**: If customer subtotal is $1,000 and admin markup is 18%, admin fee is $180

---

## Frontend Integration

### TypeScript Service Example

```typescript
export class AssignVendorService {
  private onSiteEstimateBase = '/api/v1/admin/on-site-approval';

  // Get all customer markups
  getAllCustomerMarkups(): Observable<ApiResponse<CustomerMarkupResponse[]>> {
    return this.http.get<ApiResponse<CustomerMarkupResponse[]>>(
      `${this.onSiteEstimateBase}/customer-markups`
    );
  }

  // Get customer markup by customer key
  getCustomerMarkupByKey(customerKey: string): Observable<ApiResponse<CustomerMarkupResponse>> {
    return this.http.get<ApiResponse<CustomerMarkupResponse>>(
      `${this.onSiteEstimateBase}/customer-markups/${customerKey}`
    );
  }

  // Get customer markup by job key (most common)
  getCustomerMarkupByJobKey(jobKey: string): Observable<ApiResponse<CustomerMarkupResponse>> {
    return this.http.get<ApiResponse<CustomerMarkupResponse>>(
      `${this.onSiteEstimateBase}/customer-markups/by-job/${jobKey}`
    );
  }

  // Get customer markup statistics
  getCustomerMarkupStatistics(): Observable<ApiResponse<CustomerMarkupStatisticsResponse>> {
    return this.http.get<ApiResponse<CustomerMarkupStatisticsResponse>>(
      `${this.onSiteEstimateBase}/customer-markups/statistics`
    );
  }
}
```

### TypeScript Interfaces

```typescript
export interface CustomerMarkupResponse {
  customerKey: string;
  customerName: string;
  materialMarkupPercent: number | null;
  laborAndTripMarkupPercent: number | null;
  adminMarkupPercent: number | null;
  companyEmail: string | null;
  companyPhone: string | null;
  markupStatus: 'No Markup Configured' | 'Full Markup Configured' | 'Partial Markup Configured';
}

export interface CustomerMarkupStatisticsResponse {
  totalActiveCustomers: number;
  customersWithMaterialMarkup: number;
  customersWithLaborTripMarkup: number;
  customersWithAdminMarkup: number;
  avgMaterialMarkup: number | null;
  avgLaborTripMarkup: number | null;
  avgAdminMarkup: number | null;
  minMaterialMarkup: number | null;
  maxMaterialMarkup: number | null;
  minLaborTripMarkup: number | null;
  maxLaborTripMarkup: number | null;
}
```

### Usage in On-Site Estimate Modal

```typescript
export class OnSiteEstimateModalComponent {
  customerMarkup: CustomerMarkupResponse | null = null;

  ngOnInit(): void {
    // Load customer markup when modal opens
    this.loadCustomerMarkup();
  }

  loadCustomerMarkup(): void {
    this.assignVendorService.getCustomerMarkupByJobKey(this.jobKey)
      .subscribe({
        next: (response) => {
          if (response.status) {
            this.customerMarkup = response.data;
            this.displayMarkupInfo();
          }
        },
        error: (error) => {
          console.error('Failed to load customer markup:', error);
        }
      });
  }

  displayMarkupInfo(): void {
    if (this.customerMarkup) {
    }
  }

  // Use markup data for calculations or display
  calculateCustomerPrice(vendorAmount: number, lineType: 'material' | 'labor'): number {
    if (!this.customerMarkup) return vendorAmount;

    const markup = lineType === 'material' 
      ? this.customerMarkup.materialMarkupPercent 
      : this.customerMarkup.laborAndTripMarkupPercent;

    if (markup === null) return vendorAmount;

    return vendorAmount * (1 + markup / 100);
  }
}
```

---

## Database Schema

### Customer Table Fields

```sql
-- Material markup percentage
MaterialMarkUp DECIMAL(18,2) NULL

-- Labor and trip markup percentage
LaborAndTrip DECIMAL(18,2) NULL

-- Admin markup percentage (added to subtotal)
AdminMarkup DECIMAL(18,2) NULL
```

### Related Tables
- `Customer` - Main customer table with markup percentages
- `Job` - Links to customer via `CustomerKey`
- `CustomerTradeCharge` - Customer-specific rates by charge type and trade
- `JobSalesInvoice` - Customer estimates
- `JobSalesInvoiceDetail` - Customer estimate line items with calculated markup

---

## Testing

### Test Case 1: Get All Customer Markups

**Request**:
```
GET /api/v1/admin/on-site-approval/customer-markups
Authorization: Bearer <admin-jwt-token>
```

**Expected**:
- Status: 200
- Returns list of all active customers with markup data
- Customers ordered alphabetically by name

### Test Case 2: Get Customer Markup by Key

**Request**:
```
GET /api/v1/admin/on-site-approval/customer-markups/1bedf734-a801-4dc3-94ec-c2a3ea577f64
Authorization: Bearer <admin-jwt-token>
```

**Expected**:
- Status: 200
- Returns single customer with markup data

### Test Case 3: Get Customer Markup by Job Key

**Request**:
```
GET /api/v1/admin/on-site-approval/customer-markups/by-job/{valid-job-key}
Authorization: Bearer <admin-jwt-token>
```

**Expected**:
- Status: 200
- Returns customer markup for the job's customer
- Customer name matches job's customer

### Test Case 4: Invalid Job Key

**Request**:
```
GET /api/v1/admin/on-site-approval/customer-markups/by-job/00000000-0000-0000-0000-000000000000
Authorization: Bearer <admin-jwt-token>
```

**Expected**:
- Status: 404
- Message: "Job not found"

### Test Case 5: Get Statistics

**Request**:
```
GET /api/v1/admin/on-site-approval/customer-markups/statistics
Authorization: Bearer <admin-jwt-token>
```

**Expected**:
- Status: 200
- Returns aggregate statistics
- Averages match manual calculation

---

## Common Markup Configurations

Based on actual customer data:

### Most Common Material Markup: 20%
- Used by: Advanced Med Aesthetics, Alterra, CareATC, Cranial Technologies, etc.
- Calculation: Vendor $100 → Customer $120

### Most Common Labor/Trip Markup: 35%
- Used by: Advanced Med Aesthetics, Blair Sign, Bloomin' Brands, CareATC, etc.
- Calculation: Vendor $100 → Customer $135

### Most Common Admin Markup: 18%
- Used by: SMCP, Advanced Med Aesthetics, Alterra, Bono Care, etc.
- Applied to subtotal as separate fee

### Zero Markup Customers
- Sears SHC: 0% all categories
- IVX Health: 0% all categories
- Amer Testing: 0% all categories

### High Markup Customers
- Global Franchise Group: 35% materials, 100% labor/trip, 25% admin
- Marlboro: 78% materials, 89% labor/trip, 89% admin

---

## Error Handling

### 400 Bad Request
- Empty GUID provided for customerKey or jobKey
- Invalid GUID format

### 404 Not Found
- Customer does not exist
- Job does not exist
- Job exists but has no customer linked

### 500 Internal Server Error
- Database connection failure
- Unexpected exception during query

---

## Performance Considerations

1. **Caching**: Consider caching customer markup data as it changes infrequently
2. **Indexing**: `Customer.CustomerKey` is already indexed (primary key)
3. **Pagination**: Not implemented for "get all" endpoint - consider adding if customer count exceeds 1000

---

## Related Documentation

- `Customer-Estimate-Calculation-Logic.md` - How markups are applied
- `IMPLEMENTATION-COMPLETE-Update-Customer-Estimate.md` - Update endpoint
- `OnSiteApproval-Frontend-Integration-Guide.md` - Frontend integration
- `Estimate-Data-Storage-Specification.md` - Database schema

---

## Changelog

### 2026-06-30
- ✅ Initial implementation of all 4 customer markup endpoints
- ✅ DTOs created for request/response
- ✅ Service layer implementation
- ✅ Controller endpoints added
- ✅ Build successful, no errors
- ✅ Documentation created
