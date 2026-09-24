/**
 * Location Configuration API — V2 contract (mirrors RFIJobOps `LocationDtos.cs` /
 * `LocationController`, base route `api/v1/admin/locations`).
 *
 * JSON is camelCase; the shared response envelope is {@link AssignVendorApiResponse}.
 */

/** One weekday's store hours; exactly 7 of these (Sunday=0..Saturday=6) are required on Create. */
export interface LocationStoreHourRequest {
  dayOfTheWeek: number;
  dayInText: string;
  /** Empty/null means closed that day — there's no separate "closed" flag server-side. */
  fromTime: string | null;
  toTime: string | null;
}

/** POST /locations — create request body. */
export interface CreateLocationRequest {
  lname: string;
  address: string;
  secondaryAddress?: string | null;
  email?: string | null;
  phone?: string | null;
  specialInstruction?: string | null;
  cityKey: number;
  stateCode: number;
  zipcode?: string | null;
  nonUsaaddress: boolean;
  customerKey: string;
  ccontactKey: string;
  zoneId?: number | null;
  /** Must contain exactly 7 entries (Sunday through Saturday) — the API rejects anything else. */
  storeHours: LocationStoreHourRequest[];
  thumbnailFileKey?: string | null;
  bannerFileKey?: string | null;
}

/** Response body for POST /locations and GET /locations/{locationKey}. */
export interface LocationDetailDto {
  locationKey: string;
  lname: string | null;
  address: string | null;
  secondaryAddress: string | null;
  email: string | null;
  phone: string | null;
  specialInstruction: string | null;
  cityKey: number | null;
  stateCode: number | null;
  zipcode: string | null;
  nonUsaaddress: boolean;
  /** Computed server-side from the address (Google Geocoding) — never collected from the user. */
  lat: string | null;
  lng: string | null;
  /** Computed server-side from lat/lng (Google Time Zone API) — never collected from the user. */
  timeZoneId: string | null;
  timeZoneName: string | null;
  dstOffset: string | null;
  rawOffset: string | null;
  zoneId: number | null;
  thumbnailFileName: string | null;
  bannerFileName: string | null;
  storeHours: LocationStoreHourRequest[];
}
