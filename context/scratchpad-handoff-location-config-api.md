# Handoff: Location Configuration API — Frontend Integration

## Goal
Backend API for creating a Location (V2 replication of the legacy ProjectRCS "Location Configuration" screen / `MgtLocationController`/`ManageLocationSetup.SaveMainData` flow) is implemented and merged into RFIJobOps. This handoff gives the frontend team everything needed to build the Create Location UI against it.

## Base route
`api/v1/admin/locations` — all endpoints require `[Authorize]` with a valid admin JWT (same token/claims contract as the rest of the Admin Portal V2 API, e.g. Create Quick Job). Swagger group: **"33. Location Configuration"**.

## Endpoints

### 1. `POST /api/v1/admin/locations/temp-files`
Stage a thumbnail or banner image before the Location exists (multipart form, single file per call — call twice if uploading both).

- **Request:** `multipart/form-data`, field name `file`
- **Response:** `ApiResponse<Guid>` — the staged file's `FileKey`. Save this and pass it back as `ThumbnailFileKey` / `BannerFileKey` on Create.
- Files are staged per-admin (keyed by the admin's PersonnelKey from the JWT), so only the current session's staged files are visible/usable.

### 2. `GET /api/v1/admin/locations/temp-files`
Lists files staged by the current admin (e.g. to re-render "already uploaded" state after a page refresh mid-form).

- **Response:** `ApiResponse<List<LocationTempFileDto>>` — `{ fileKey, title, fileName, fileType, addedOn }`

### 3. `DELETE /api/v1/admin/locations/temp-files/{fileKey}`
Removes a single staged file (e.g. user clicks "x" to remove a preview before submitting).

- **Response:** `ApiResponse<string>`

### 4. `POST /api/v1/admin/locations`
Creates the Location. This is a **single call** — the backend internally handles geocoding, time zone lookup, store hours, customer/contact linkage, portal-access grants, zone assignment, and promoting any staged thumbnail/banner files. The frontend does not need to call anything else afterward.

**Request body** (`CreateLocationRequest`):

```json
{
  "lname": "string (required)",
  "address": "string (required)",
  "secondaryAddress": "string (optional)",
  "email": "string (optional)",
  "phone": "string (optional)",
  "specialInstruction": "string (optional)",
  "cityKey": 0,
  "stateCode": 0,
  "zipcode": "string (optional)",
  "nonUsaaddress": false,
  "customerKey": "guid (required)",
  "ccontactKey": "guid (required)",
  "zoneId": 0,
  "storeHours": [
    { "dayOfTheWeek": 0, "dayInText": "Sunday", "fromTime": "09:00", "toTime": "17:00" }
  ],
  "thumbnailFileKey": "guid (optional, from temp-files upload)",
  "bannerFileKey": "guid (optional, from temp-files upload)"
}
```

Important validation rules:
- `storeHours` must contain **exactly 7 entries** (one per day, `dayOfTheWeek` 0=Sunday..6=Saturday). The API rejects anything other than 7 with a 400 and per-field validation errors. There is currently no "closed" flag — if a location is closed on a given day, send empty/null `fromTime`/`toTime` for that day's row; the frontend is responsible for representing "closed" however the UI needs, the API just stores whatever times are given.
- `cityKey` / `stateCode` are foreign keys into `CityList`/`StateList` (plain integer `Pkey`s) — **there is currently no lookup endpoint on this controller** for city/state dropdown options. If the Create Quick Job or another existing screen already has a city/state picker, reuse whatever endpoint backs that; otherwise this is a known gap, flag it back to backend if you need one added here.
- `zoneId` is optional. If provided, it's validated against `LocationZone` rows scoped to the given `customerKey` — an invalid/mismatched zone is silently ignored (location is still created, just without a zone), it does not fail the request.

**Response** (`ApiResponse<LocationDetailDto>`):

```json
{
  "status": true,
  "responseCode": 200,
  "data": {
    "locationKey": "guid",
    "lname": "string",
    "address": "string",
    "secondaryAddress": "string",
    "email": "string",
    "phone": "string",
    "specialInstruction": "string",
    "cityKey": 0,
    "stateCode": 0,
    "zipcode": "string",
    "nonUsaaddress": false,
    "lat": "string",
    "lng": "string",
    "timeZoneId": "string",
    "timeZoneName": "string",
    "dstOffset": "string",
    "rawOffset": "string",
    "zoneId": 0,
    "thumbnailFileName": "string",
    "bannerFileName": "string",
    "storeHours": [ { "dayOfTheWeek": 0, "dayInText": "Sunday", "fromTime": "09:00", "toTime": "17:00" } ]
  }
}
```

`lat`/`lng`/`timeZoneId`/`timeZoneName` are computed server-side (Google Geocoding + Time Zone APIs) from the address fields — **do not collect these from the user**, they'll be populated in the response after Create.

### 5. `GET /api/v1/admin/locations/{locationKey}`
Fetch a previously created location (same `LocationDetailDto` shape as the Create response). Useful for a confirmation screen or re-loading after navigation.

## Suggested frontend flow
1. User fills the Location form (name, address, city/state/zip, customer + contact, store hours for all 7 days).
2. If the user attaches a thumbnail/banner, call `POST /temp-files` immediately on file selection and hold onto the returned `FileKey` client-side (don't wait for the main form submit).
3. On form submit, call `POST /api/v1/admin/locations` with the full payload including any staged `FileKey`s.
4. On success, use the returned `LocationDetailDto` (it already includes computed lat/lng/timezone) to render a confirmation or redirect into the location detail view.

## Known gaps / out of scope (flag if you hit these)
- **Update/Edit is not implemented yet** — this API only supports Create. A follow-up task will add PATCH/Update.
- **No city/state dropdown endpoint on this controller** — reuse an existing one if available.
- Legacy's weekend-flag columns (`IsMondayWeekend`, etc.) don't exist in this schema — there's no server-side concept of "weekend" hours, just per-day from/to times.
