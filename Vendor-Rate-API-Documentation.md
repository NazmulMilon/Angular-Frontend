# Vendor Rate API Documentation

## Overview

The Vendor Rate API provides endpoints to retrieve vendor rate information used for creating vendor estimates and calculating vendor costs. These rates include hourly rates, trip charges, and service charges for both standard and emergency jobs.

## Implementation Status

✅ **COMPLETED** - All vendor rate endpoints implemented and tested

## Vendor Rate Structure

Vendors have two types of rates in the system:
1. **General Rates** (`VendorRate` table) - Basic rates not tied to a specific trade
2. **Trade-Specific Rates** (`VendorTradeCharge` table) - Rates configured per trade

### Rate Types

Each vendor rate configuration includes:
- **Hourly Rate** - Standard hourly labor rate
- **Trip Charge** - Flat trip charge
- **Service Charge** - Service charge
- **Emergency Hourly Rate** - Overtime/weekend hourly rate  
- **Emergency Trip Charge** - Overtime/weekend trip charge
- **Emergency Service Charge** - Emergency service charge
- **Helper Rates** - Standard helper hourly rate
- **Emergency Helper Rates** - Overtime helper hourly rate

## Endpoints

### 1. Get Vendor General Rates

**Endpoint**: `GET /api/v1/admin/on-site-approval/vendor-rates/{vendorKey}`

**Description**: Returns general vendor rates (not trade-specific).

**Authentication**: Requires admin JWT token

**Path Parameters**:
- `vendorKey` (Guid, required) - The vendor's unique identifier

**Request Example**:
```
GET /api/v1/admin/on-site-approval/vendor-rates/12345678-1234-1234-1234-123456789abc
```

**Response** (200 OK):
```json
{
  "status": true,
  "responseCode": 200,
  "message": "Vendor rates retrieved",
  "data": {
    "vendorKey": "12345678-1234-1234-1234-123456789abc",
    "vendorName": "ABC Plumbing Services",
    "hourlyRate": 85.00,
    "tripCharge": 50.00,
    "serviceCharge": 0.00,
    "emergencyHourlyRate": 125.00,
    "emergencyTripCharge": 75.00,
    "emergencyServiceCharge": 0.00,
    "helperRates": 45.00,
    "emergencyHelperRates": 65.00
  },
  "traceId": "..."
}
```

**Error Response** (404 Not Found):
```json
{
  "status": false,
  "responseCode": 404,
  "message": "Vendor rates not found",
  "data": null,
  "traceId": "..."
}
```

**Use Cases**:
- Display vendor rates in vendor detail page
- Pre-populate rates when creating vendor estimate
- Show vendor pricing to admins

---

### 2. Get Vendor Trade-Specific Rates

**Endpoint**: `GET /api/v1/admin/on-site-approval/vendor-trade-rates/{vendorKey}`

**Description**: Returns trade-specific rates for a vendor. Can be filtered by trade.

**Authentication**: Requires admin JWT token

**Path Parameters**:
- `vendorKey` (Guid, required) - The vendor's unique identifier

**Query Parameters**:
- `tradeKey` (Guid, optional) - Filter by specific trade

**Request Example**:
```
GET /api/v1/admin/on-site-approval/vendor-trade-rates/12345678-1234-1234-1234-123456789abc?tradeKey=98765432-9876-9876-9876-987654321abc
```

**Response** (200 OK):
```json
{
  "status": true,
  "responseCode": 200,
  "message": "Retrieved 2 vendor trade rates",
  "data": [
    {
      "pkey": "11111111-1111-1111-1111-111111111111",
      "vendorKey": "12345678-1234-1234-1234-123456789abc",
      "vendorName": "ABC Plumbing Services",
      "tradeKey": "98765432-9876-9876-9876-987654321abc",
      "tradeName": "Plumbing",
      "isPrimary": true,
      "hourlyRate": 90.00,
      "tripCharge": 55.00,
      "serviceCharge": 0.00,
      "emergencyHourlyRate": 135.00,
      "emergencyTripCharge": 85.00,
      "emergencyServiceCharge": 0.00,
      "helperRates": 50.00,
      "emergencyHelperRates": 70.00
    },
    {
      "pkey": "22222222-2222-2222-2222-222222222222",
      "vendorKey": "12345678-1234-1234-1234-123456789abc",
      "vendorName": "ABC Plumbing Services",
      "tradeKey": "87654321-8765-8765-8765-876543210abc",
      "tradeName": "HVAC",
      "isPrimary": false,
      "hourlyRate": 95.00,
      "tripCharge": 60.00,
      "serviceCharge": 0.00,
      "emergencyHourlyRate": 140.00,
      "emergencyTripCharge": 90.00,
      "emergencyServiceCharge": 0.00,
      "helperRates": 55.00,
      "emergencyHelperRates": 75.00
    }
  ],
  "traceId": "..."
}
```

**Use Cases**:
- Display all trades a vendor can service
- Show trade-specific pricing
- Select appropriate rate based on job trade

---

### 3. Get Vendor Rates by Job Key

**Endpoint**: `GET /api/v1/admin/on-site-approval/vendor-rates/by-job/{jobKey}`

**Description**: Returns vendor rates for a specific job. Uses the job's trade to filter vendor rates.

**Authentication**: Requires admin JWT token

**Path Parameters**:
- `jobKey` (Guid, required) - The job's unique identifier

**Query Parameters**:
- `vendorKey` (Guid, required) - The vendor's unique identifier

**Request Example**:
```
GET /api/v1/admin/on-site-approval/vendor-rates/by-job/a1b2c3d4-e5f6-7890-abcd-ef1234567890?vendorKey=12345678-1234-1234-1234-123456789abc
```

**Response** (200 OK):
```json
{
  "status": true,
  "responseCode": 200,
  "message": "Retrieved 1 vendor trade rates for job",
  "data": [
    {
      "pkey": "11111111-1111-1111-1111-111111111111",
      "vendorKey": "12345678-1234-1234-1234-123456789abc",
      "vendorName": "ABC Plumbing Services",
      "tradeKey": "98765432-9876-9876-9876-987654321abc",
      "tradeName": "Plumbing",
      "isPrimary": true,
      "hourlyRate": 90.00,
      "tripCharge": 55.00,
      "serviceCharge": 0.00,
      "emergencyHourlyRate": 135.00,
      "emergencyTripCharge": 85.00,
      "emergencyServiceCharge": 0.00,
      "helperRates": 50.00,
      "emergencyHelperRates": 70.00
    }
  ],
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
- **Primary use**: Pre-populate vendor rates when creating on-site approval estimate
- Auto-fill hourly rate and trip charge fields
- Display vendor rates in on-site approval modal

---

## Rate Usage in On-Site Approval

When creating a vendor estimate (on-site approval), the frontend uses vendor rates to:

1. **Pre-populate Line Items**: 
   - Standard Hourly Rate → `HourlyRate`
   - Overtime/Weekend Rate → `EmergencyHourlyRate`
   - Trip Charge → `TripCharge` or `EmergencyTripCharge`
   - Helper Rate → `HelperRates` or `EmergencyHelperRates`

2. **Calculate Vendor Amounts**:
   - Labor: `Hours × HourlyRate × TechCount`
   - Trip: `TripCharge × Quantity`
   - Materials: Admin enters manually

3. **Determine Emergency vs Standard**:
   - Check `Job.JobTypeKey` to determine if emergency
   - Use `Emergency*` rates for emergency jobs
   - Use standard rates for regular jobs

## Frontend Integration

### TypeScript Service Example

```typescript
export class AssignVendorService {
  private onSiteEstimateBase = '/api/v1/admin/on-site-approval';

  // Get vendor general rates
  getVendorRates(vendorKey: string): Observable<ApiResponse<VendorRateResponse>> {
    return this.http.get<ApiResponse<VendorRateResponse>>(
      `${this.onSiteEstimateBase}/vendor-rates/${vendorKey}`
    );
  }

  // Get vendor trade-specific rates
  getVendorTradeRates(vendorKey: string, tradeKey?: string): Observable<ApiResponse<VendorTradeRateResponse[]>> {
    let url = `${this.onSiteEstimateBase}/vendor-trade-rates/${vendorKey}`;
    if (tradeKey) {
      url += `?tradeKey=${tradeKey}`;
    }
    return this.http.get<ApiResponse<VendorTradeRateResponse[]>>(url);
  }

  // Get vendor rates for a job (most common)
  getVendorRatesByJobKey(jobKey: string, vendorKey: string): Observable<ApiResponse<VendorTradeRateResponse[]>> {
    return this.http.get<ApiResponse<VendorTradeRateResponse[]>>(
      `${this.onSiteEstimateBase}/vendor-rates/by-job/${jobKey}?vendorKey=${vendorKey}`
    );
  }
}
```

### TypeScript Interfaces

```typescript
export interface VendorRateResponse {
  vendorKey: string;
  vendorName: string | null;
  hourlyRate: number | null;
  tripCharge: number | null;
  serviceCharge: number | null;
  emergencyHourlyRate: number | null;
  emergencyTripCharge: number | null;
  emergencyServiceCharge: number | null;
  helperRates: number | null;
  emergencyHelperRates: number | null;
}

export interface VendorTradeRateResponse {
  pkey: string;
  vendorKey: string;
  vendorName: string | null;
  tradeKey: string | null;
  tradeName: string | null;
  isPrimary: boolean | null;
  hourlyRate: number | null;
  tripCharge: number | null;
  serviceCharge: number | null;
  emergencyHourlyRate: number | null;
  emergencyTripCharge: number | null;
  emergencyServiceCharge: number | null;
  helperRates: number | null;
  emergencyHelperRates: number | null;
}
```

### Usage in On-Site Estimate Modal

```typescript
export class OnSiteEstimateModalComponent {
  vendorRates: VendorTradeRateResponse | null = null;
  isEmergencyJob: boolean = false;

  ngOnInit(): void {
    // Load vendor rates when modal opens
    this.loadVendorRates();
  }

  loadVendorRates(): void {
    this.assignVendorService.getVendorRatesByJobKey(this.jobKey, this.vendorKey)
      .subscribe({
        next: (response) => {
          if (response.status && response.data.length > 0) {
            this.vendorRates = response.data[0]; // Use first rate (job's trade)
            this.prefillLineItems();
          }
        },
        error: (error) => {
          console.error('Failed to load vendor rates:', error);
        }
      });
  }

  prefillLineItems(): void {
    if (!this.vendorRates) return;

    // Pre-fill standard hourly rate
    this.lineItems.push({
      chargeType: this.isEmergencyJob ? 'Overtime/ Weekend Hourly Rate' : 'Standard Hourly Rate',
      rate: this.isEmergencyJob 
        ? this.vendorRates.emergencyHourlyRate 
        : this.vendorRates.hourlyRate,
      hours: 0,
      techCount: 1,
      isLabor: true
    });

    // Pre-fill trip charge
    this.lineItems.push({
      chargeType: this.isEmergencyJob ? 'Emergency Trip Charge' : 'Trip Charge',
      rate: this.isEmergencyJob 
        ? this.vendorRates.emergencyTripCharge 
        : this.vendorRates.tripCharge,
      quantity: 1,
      isLabor: false
    });
  }

  // Calculate vendor amount for a line item
  calculateVendorAmount(lineItem: any): number {
    if (lineItem.isLabor) {
      return (lineItem.rate || 0) * (lineItem.hours || 0) * (lineItem.techCount || 1);
    } else {
      return (lineItem.rate || 0) * (lineItem.quantity || 1);
    }
  }
}
```

---

## Database Schema

### VendorRate Table

```sql
CREATE TABLE VendorRate (
    RateKey UNIQUEIDENTIFIER PRIMARY KEY,
    VendorKey UNIQUEIDENTIFIER NOT NULL,
    HourlyRate DECIMAL(18,2) NULL,
    TripCharge DECIMAL(18,2) NULL,
    ServiceCharge DECIMAL(18,2) NULL,
    EmergencyHourlyRate DECIMAL(18,2) NULL,
    EmergencyTripCharge DECIMAL(18,2) NULL,
    EmergencyServiceCharge DECIMAL(18,2) NULL,
    HelperRates DECIMAL(18,2) NULL,
    EmergencyHelperRates DECIMAL(18,2) NULL,
    IsDelete BIT NULL
)
```

### VendorTradeCharge Table

```sql
CREATE TABLE VendorTradeCharge (
    Pkey UNIQUEIDENTIFIER PRIMARY KEY,
    VendorKey UNIQUEIDENTIFIER NOT NULL,
    TradeKey UNIQUEIDENTIFIER NULL,
    HourlyRate DECIMAL(18,2) NULL,
    TripCharge DECIMAL(18,2) NULL,
    ServiceCharge DECIMAL(18,2) NULL,
    EmergencyHourlyRate DECIMAL(18,2) NULL,
    EmergencyTripCharge DECIMAL(18,2) NULL,
    EmergencyServiceCharge DECIMAL(18,2) NULL,
    TradeName NVARCHAR(MAX) NULL,
    HelperRates DECIMAL(18,2) NULL,
    EmergencyHelperRates DECIMAL(18,2) NULL,
    IsPrimary BIT NULL,
    TradeCategoryID INT NULL,
    EnteredOn DATETIME NULL
)
```

---

## Testing

### Test Case 1: Get Vendor General Rates

**Request**:
```
GET /api/v1/admin/on-site-approval/vendor-rates/{valid-vendor-key}
Authorization: Bearer <admin-jwt-token>
```

**Expected**:
- Status: 200
- Returns vendor rates with all rate fields
- Vendor name populated

### Test Case 2: Get Vendor Trade Rates (No Filter)

**Request**:
```
GET /api/v1/admin/on-site-approval/vendor-trade-rates/{valid-vendor-key}
Authorization: Bearer <admin-jwt-token>
```

**Expected**:
- Status: 200
- Returns list of all trades for vendor
- Each trade has rates populated

### Test Case 3: Get Vendor Trade Rates (With Trade Filter)

**Request**:
```
GET /api/v1/admin/on-site-approval/vendor-trade-rates/{valid-vendor-key}?tradeKey={valid-trade-key}
Authorization: Bearer <admin-jwt-token>
```

**Expected**:
- Status: 200
- Returns only rates for specified trade
- Trade name matches filter

### Test Case 4: Get Vendor Rates by Job Key

**Request**:
```
GET /api/v1/admin/on-site-approval/vendor-rates/by-job/{valid-job-key}?vendorKey={valid-vendor-key}
Authorization: Bearer <admin-jwt-token>
```

**Expected**:
- Status: 200
- Returns vendor rates for job's trade
- Trade matches job's trade

### Test Case 5: Invalid Vendor Key

**Request**:
```
GET /api/v1/admin/on-site-approval/vendor-rates/00000000-0000-0000-0000-000000000000
Authorization: Bearer <admin-jwt-token>
```

**Expected**:
- Status: 404
- Message: "Vendor rates not found"

---

## Rate Priority and Fallback

When determining which rate to use:

1. **Trade-Specific Rates** (`VendorTradeCharge`) - Preferred
   - Check for vendor's rate for the specific trade
   - More accurate as rates vary by trade specialty

2. **General Rates** (`VendorRate`) - Fallback
   - Use if no trade-specific rate exists
   - Less granular but provides baseline

3. **Frontend Behavior**:
   - Always try `/vendor-rates/by-job/{jobKey}` first (uses trade-specific)
   - If empty/null, fall back to `/vendor-rates/{vendorKey}` (general)
   - Allow admin to override any pre-filled rate

---

## Common Rate Configurations

Based on typical vendor setups:

### Standard Plumber
- Hourly Rate: $85-$95
- Trip Charge: $50-$60
- Emergency Hourly: $125-$140
- Emergency Trip: $75-$90
- Helper Rate: $45-$55

### HVAC Technician  
- Hourly Rate: $90-$110
- Trip Charge: $60-$75
- Emergency Hourly: $135-$160
- Emergency Trip: $85-$110
- Helper Rate: $50-$60

### Electrician
- Hourly Rate: $95-$115
- Trip Charge: $55-$70
- Emergency Hourly: $145-$170
- Emergency Trip: $85-$105
- Helper Rate: $55-$65

---

## Integration with Customer Markup

Vendor rates flow through to customer estimates:

1. **Vendor Estimate Created** → Uses vendor rates from these endpoints
2. **Customer Estimate Created** → Vendor amounts used as baseline
3. **Customer Markup Applied** → `MaterialMarkUp`, `LaborAndTrip` percentages
4. **Customer Rate Tables** → `CustomerTradeCharge` rates compared
5. **Final Customer Amount** → Higher of markup or rate table

See `Customer-Markup-API-Documentation.md` for customer markup details.

---

## Error Handling

### 400 Bad Request
- Empty GUID provided for vendorKey or jobKey
- Invalid GUID format

### 404 Not Found
- Vendor does not exist
- Vendor has no rates configured
- Job does not exist

### 500 Internal Server Error
- Database connection failure
- Unexpected exception during query

---

## Related Documentation

- `Customer-Markup-API-Documentation.md` - Customer markup endpoints
- `IMPLEMENTATION-COMPLETE-Update-Customer-Estimate.md` - Update endpoint
- `OnSiteApproval-Frontend-Integration-Guide.md` - Frontend integration
- `Customer-Estimate-Calculation-Logic.md` - How vendor rates become customer prices

---

## Changelog

### 2026-06-30
- ✅ Initial implementation of all 3 vendor rate endpoints
- ✅ DTOs created for vendor rates and trade rates
- ✅ Service layer implementation with fallback logic
- ✅ Controller endpoints added with validation
- ✅ Build successful, no errors
- ✅ Documentation created
