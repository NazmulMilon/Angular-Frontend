# Handoff — `SystemSetupData` Auth Change (Frontend Action Needed)

**Date:** 2026-07-21
**Owner (backend):** Cole
**Affects:** `SystemSetupDataController` — route prefix `RFISystemData/SystemSetupData`

---

## TL;DR for the frontend

We changed how **every** `SystemSetupData` endpoint authenticates.

- **Before:** endpoints required a logged-in user (`[Authorize]` → Bearer/JWT in the `Authorization` header). One endpoint (`get-job-statuses`) required nothing.
- **After:** every endpoint now requires the shared **`RFIApiKey`** header instead — the same service-to-service key the CRM feeds already use. It does **not** accept a user Bearer/JWT anymore.

**What this means for you:** any frontend call to a `SystemSetupData` endpoint that sends **only** a Bearer/JWT token (and no `RFIApiKey` header) will now get **`401 Unauthorized`**.

We need the frontend to tell us: **which of these endpoints do you call, and what header do you send?**

---

## Why we did this

These endpoints serve **centralized setup/reference data** (states, cities, trades, priorities, staff, job statuses, etc.) that is meant to be consumed across multiple repositories and backend services — not tied to a single logged-in user session. `[Authorize]` required a real user identity, which broke cross-repo/service-to-service use. The `RFIApiKey` shared-secret filter keeps the endpoints protected (not anonymous, not public) while allowing that cross-repo access.

As a side effect, `get-job-statuses` — which was previously **completely unauthenticated** — is now protected too.

---

## The endpoints that changed

All under base route **`RFISystemData/SystemSetupData`**:

| # | Method | Path | Purpose |
|---|--------|------|---------|
| 1 | GET | `/FillStateList` | State dropdown list |
| 2 | GET | `/FillCityList/{StateKey}` | City dropdown list for a state |
| 3 | GET | `/GetVendorMasterRateSetup` | Vendor master rate data |
| 4 | GET | `/get-active-customers` | Active customers list |
| 5 | GET | `/get-priority-list` | Priority dropdown list |
| 6 | GET | `/get-staff-list` | Staff list |
| 7 | GET | `/get-trades` | Trades list |
| 8 | GET | `/function-mains` | List FunctionMain rows |
| 9 | POST | `/function-mains` | Create FunctionMain |
| 10 | PUT | `/function-mains/{pkey}` | Update FunctionMain |
| 11 | DELETE | `/function-mains/{pkey}` | Delete FunctionMain |
| 12 | GET | `/action-traces` | Action trace list |
| 13 | GET | `/get-job-statuses` | Job status dropdown (**was previously anonymous**) |

---

## What we need from the frontend

For **each** endpoint in the table above that your app calls, please report:

1. **Do you call it?** (yes / no)
2. **Where** — file path / component / service.
3. **What auth header does the request send today?**
   - `RFIApiKey: <value>`  → ✅ safe, no change needed
   - `Authorization: Bearer <jwt>` (and NO `RFIApiKey`) → ⚠️ **will now return 401 — needs fixing**
   - Neither / anonymous → ⚠️ was working via `get-job-statuses` only; now needs `RFIApiKey`

### Fastest way to find the call sites

Search the frontend repo (case-insensitive) for any of:

- `SystemSetupData`  ← best single catch-all
- `RFISystemData`  ← route prefix
- Individual segments if you want to pinpoint: `FillStateList`, `FillCityList`, `GetVendorMasterRateSetup`, `get-active-customers`, `get-priority-list`, `get-staff-list`, `get-trades`, `function-mains`, `action-traces`, `get-job-statuses`

> Note the mixed casing in this controller — some paths are PascalCase (`FillStateList`), others kebab-case (`get-trades`) — so use a case-insensitive search.

Then check the **shared HTTP client / interceptor** those calls route through to see which header it attaches.

---

## How to tell it's fixed / how to test

Each endpoint should behave like this after the change:

- **With a valid `RFIApiKey` header** → `200 OK` with data.
- **With no `RFIApiKey` header** (even if a valid Bearer token is present) → `401 Unauthorized`.

If any call site is currently sending a Bearer token, switch it to send the `RFIApiKey` header instead (same value/mechanism already used for the CRM feed calls — check with backend if you don't have it).

---

## Report-back template

Please fill this in and send back:

```
Endpoint                         | Do we call it? | Header sent today        | Status
---------------------------------|----------------|--------------------------|------------------
/FillStateList                   | yes/no         | RFIApiKey / Bearer / none | OK / needs fix
/FillCityList/{StateKey}         |                |                          |
/GetVendorMasterRateSetup        |                |                          |
/get-active-customers            |                |                          |
/get-priority-list               |                |                          |
/get-staff-list                  |                |                          |
/get-trades                      |                |                          |
/function-mains (GET)            |                |                          |
/function-mains (POST)           |                |                          |
/function-mains/{pkey} (PUT)     |                |                          |
/function-mains/{pkey} (DELETE)  |                |                          |
/action-traces                   |                |                          |
/get-job-statuses                |                |                          |
```

Any row marked **needs fix** = a place we have to update the request to send `RFIApiKey`.

---

## Frontend report-back (completed 2026-07-27)

**Fixed.** The frontend HTTP interceptor (`src/app/interceptors/auth.interceptor.ts`) previously stopped sending the Bearer token on `SystemSetupData` routes but did **not** attach `RFIApiKey` — so every call went out unauthenticated and got 401 (silently swallowed to `[]` by the services, which is why dropdowns rendered blank instead of erroring). The interceptor now attaches `RFIApiKey: <environment.rfiApiKey>` on any URL containing `RFISystemData/SystemSetupData`. The value is the `RFIExternalAuthKey` cipher (added to all `environment*.ts` files). Verified against local API: `get-trades` now returns `200` with data.

```
Endpoint                         | Do we call it? | Header sent (before) | Header sent (now) | Status
---------------------------------|----------------|----------------------|-------------------|--------
/FillStateList                   | yes (assign-vendor.service) | none    | RFIApiKey | FIXED
/FillCityList/{StateKey}         | yes (assign-vendor.service) | none    | RFIApiKey | FIXED
/GetVendorMasterRateSetup        | no             | —                    | —                 | n/a
/get-active-customers            | yes (report.service)        | none    | RFIApiKey | FIXED
/get-priority-list               | yes (report.service)        | none    | RFIApiKey | FIXED
/get-staff-list                  | yes (report.service)        | none    | RFIApiKey | FIXED
/get-trades                      | yes (assign-vendor + report) | none   | RFIApiKey | FIXED
/function-mains (GET/POST/PUT/DELETE) | no        | —                    | —                 | n/a
/action-traces                   | no             | —                    | —                 | n/a
/get-job-statuses                | yes (assign-vendor.service) | none    | RFIApiKey | FIXED
```

All calls route through the one global interceptor, so the single fix covers every call site (both `assign-vendor.service.ts` and `report.service.ts`). We do not call `GetVendorMasterRateSetup`, `function-mains`, or `action-traces`.

Additional hardening: `JobDetailsAccordionComponent` now shows an error banner if the trade list comes back empty (which only happens on a failed load), so a future auth/API failure won't silently present as a blank dropdown.
