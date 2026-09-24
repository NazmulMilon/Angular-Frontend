# Assign Vendor Page — Frontend & Business-Logic Guide

**Audience:** Developers, QA, product, and support who need to understand exactly what this page does and how each function behaves.
**App:** `rfi-admin-portal-v2` (Angular, standalone components + signals)
**Route:** `/job/:jobKey/assign-vendor`
**Legacy equivalent:** ProjectRCS → `MgtJobVendor/CreateVendor` (Edit Job → Assign Vendor tab)
**Last regenerated:** 10 July 2026 — rewritten as a function-by-function reference against the current component.

> This document supersedes the earlier product-only guide. It is a **full function-by-function rewrite** covering every method in
> [`assign-vendor.component.ts`](../src/app/features/job/assign-vendor/assign-vendor.component.ts) (9,272 lines, ~260 members),
> the modals declared in [`assign-vendor.component.html`](../src/app/features/job/assign-vendor/assign-vendor.component.html),
> and the HTTP surface in [`assign-vendor.service.ts`](../src/app/services/assign-vendor.service.ts).

---

## 1. What this page is for

The Assign Vendor page is the admin command center for a single service job. An account manager or dispatcher uses it to:

- Review job, customer, and location context before dispatching work.
- Find and compare vendors — internal RFI vendors (with **Scorecard Agent** scoring) and AI-sourced external prospects (**Sourcing Agent**).
- Assign one or more vendors and send work orders.
- Manage each assigned vendor through the job lifecycle (status, schedule/ETA, check-in/out, emails, estimates, approvals).
- Pin candidates for later, broadcast the job to nearby unassigned vendors, or duplicate the job to another location.

Mental model: **read the job → pick a vendor → assign & send W/O → manage the vendor card until the job moves forward.**

## 2. How you get here & authentication

| Entry | URL |
|---|---|
| Admin Portal V2 | `http://localhost:4200/job/{jobKey}/assign-vendor` |
| From legacy Admin | Often opened with `?token=` JWT for authentication; `?broadcast=1` auto-opens the broadcast flow |

- `jobKey` is read from the route in `ngOnInit`; if missing, an error toast is shown and loading stops.
- The route uses `authGuard`. The JWT may arrive via `?token=` on first load or from browser storage afterwards. The admin key is decoded from the token via `AuthTokenService.getAdminKeyFromToken()` and is required by several mutations (upline override, unassign-with-email, bulk cancellation, vendor login).
- If the Job Ops API is unreachable, `consolidateParallelLoadFailures` collapses the repeated failures into a single actionable message pointing at `environment.apiBaseUrl`.

## 3. Architecture

- **Component (`AssignVendorComponent`)** holds all UI state as Angular **signals** and computed signals, plus every user event handler. It is `standalone` and imports the shared Accordion, DataGrid, SearchableSelect, AttachmentThumbnailGrid, the Notes & Activity feature, and the On-Site Estimate modal component.
- **`AssignVendorService`** owns every HTTP call (~90 endpoints across 11 API bases) and exposes grid/header data as RxJS `BehaviorSubject` streams that the component subscribes to in `subscribeToDataStreams`.
- **Modals** are declared inline in the template as `@if(signal){ … }` overlays (~46 of them); there are no separate routed modal pages except the On-Site Estimate wizard component.
- **Reactivity contract:** streams push server data → signals; computed signals derive display shapes (ordering, filtering, score enrichment, NTE resolution); event handlers call the service then either optimistically patch `jobHeaderDetail` / reload it. Background polling keeps Job Details fresh without a manual refresh.

### 3.1 Static keys & thresholds

| Constant | Value / meaning |
|---|---|
| `EMERGENCY_JOB_TYPE_KEY` | `fc078fd5-…` job priority = Emergency |
| `RECALL_JOB_TYPE_KEY` | `4905d351-…` Recall priority (not user-selectable) |
| `BID_JOB_TYPE_KEY` / `PROJECT_JOB_TYPE_KEY` | Bid / Project priorities (vendor NTE = 0) |
| `JOB_DETAILS_POLL_MS` | `15_000` — background Job Details sync interval |
| `RETURN_SCHEDULE_EDIT_TRIGGER_BITS` | `{15,16,17,18,22}` — return-ETA editable |
| `SCHEDULE_DATE_LOCKED_TRIGGER_BITS` | `{4,17}` — vendor on-site, ETA locked |
| `SRI_FIELDS` | serviceRequest, additionalApproval, specialInstruction, locationSpecialInstruction |
| Score poll schedule | `[0, 5s, 15s, 30s, 60s]` staggered scorecard fetches |
| AI sourcing poll | `timer(0, 10s)` until status terminal |
| Wait popup | 3-minute blocking reload for auto-assign/emergency-broadcast jobs |

### 3.2 State-signal groups (high level)

Job/page (`jobKey`, `pageContext`, `jobHeaderDetail`), NTE editable form, login-email modal, broadcast config + vendor-selection + files, duplicate-job modal, vendor grids (`assignedVendors`, `locationHistoryVendors`, `defaultVendors`, `searchResults`, `pinnedVendors`), dropdowns (vendor/contact/trade/state/city), Send & Select W/O flow, unassign-vendor chain, work-order form + survey + files, AI sourcing, scorecard scores, check-in/out, vendor status-action modals, confirm-ETA, ETA-set email, approve-vendor / additional-approval, customer-reminder, and on-site approval + estimate picker.

Key **computed** signals: `orderedAssignedVendors` (default first), `jobManagementVendor`, `customerRequestorSelectKey`, `jobPrioritySelectKey`, `jobPriorityChangeAllowed`, `filteredNotes`, `assignedVendorsWithEta` / `assignedVendorsWithoutEta` / `allAssignedVendors`, `canKeepVendorsAndBroadcast`, `filteredInternalVendors`, `filteredAiVendors`, `filteredLocationHistoryVendors`, `displayPinnedVendors`, `cleanedServiceRequest(+Preview)`, `specialInstructionHighlight`, `broadcastSearchDistanceMiles`, `broadcastAttachmentCards`, `filteredDuplicateLocations`.

## 4. What happens on load (`ngOnInit` → `runFormLoadWithUplineCheck` → `loadInitialData`)

1. Build reactive forms, read `jobKey`, subscribe to service streams, start scorecard scoring and Job Details polling, register `visibilitychange`/`focus` refresh listeners.
2. **Upline gate:** `checkUplineApproval` → `0` loads data then runs the create-vendor-context / primary-vendor-intro check; `2` just loads; anything else opens the **Upline Approval** modal (override required) and loads.
3. **Auto-assign gate:** for customer-submitted jobs within 4 minutes of creation, `checkPrimaryVendorIntro` may open the 3-minute **Wait popup** (primary-vendor assign or emergency broadcast) then auto-reload.
4. `loadInitialData` forkJoins page context, header detail, dropdowns (trade/state/status/priority/requestor) and active-vendor list; independently loads assigned/location-history/pinned grids, the in-radius vendor list (default 70 mi), customer-profile DNE, and AI sourcing status. Grid loads are independent so one failure doesn't block the rest.
5. Scorecard scores stream in asynchronously (skeleton cells until ready). If `?broadcast=1`, the broadcast flow opens once loading finishes.

---

# Function Reference

The sections below document **every** component member in source order within each range. Legend: methods are `public` unless marked `(private)`, `(computed)`, `(arrow field)`, or `(getter)`. Service calls are written `AssignVendorService.x`.

## A. Layout, bootstrap, broadcast, duplicate & lifecycle

#### `scrollToSection(sectionId: string, tab: string): void`
- **Purpose:** Toggle/open the accordion for a nav tab and smooth-scroll to a section.
- **Behavior:**
  - Resolves the accordion via `accordionForTab(tab)`; compares against `activeNavTab()`.
  - If that accordion is already open AND it is the same tab, collapses it (`accordion.isOpen.set(false)`) and returns (toggle-off behavior).
  - Otherwise sets `activeNavTab.set(tab)` and opens the accordion if closed.
  - Defers one tick via `setTimeout`, then `document.getElementById(sectionId)` and `scrollIntoView({behavior:'smooth', block:'start'})`.
- **Calls:** `accordionForTab`; reads/writes signal `activeNavTab`; accordion `isOpen`.
- **Notes:** The `setTimeout` gives Angular a tick to expand before scrolling.

---

#### `filteredInternalVendors` (computed)
- **Purpose:** Produce the filtered, score-enriched vendor list for the SCORECARD AGENT table.
- **Behavior:**
  - Reads `internalVendorSearch()` (lowercased/trimmed term) and `internalScoringFilter()`.
  - Source is `searchResults()` if non-empty (cast to `LocationHistoryVendor[]`), otherwise `defaultVendors()`.
  - Runs `enrichWithScores(raw)` to merge score data.
  - Filter `'scored'` keeps rows whose `scoreTier` is non-null and not `'N/A'`; `'unscored'` keeps rows whose `scoreTier` is null or `'N/A'`.
  - If no search term, returns all; else filters by term against `vendorName`, `vname`, `contactName`, `tradeName`.
- **Calls:** `enrichWithScores`; reads signals `internalVendorSearch`, `internalScoringFilter`, `searchResults`, `defaultVendors`.

---

#### `filteredAiVendors` (computed)
- **Purpose:** Filter the AI sourcing vendor grid by search term.
- **Behavior:**
  - Reads `aiSourcingSearch()` (lowercased/trimmed) and `aiSourcingVendors()`.
  - Returns all when no term; else filters by `company_name`, `phone`, `email`, and `address`.
- **Calls:** reads signals `aiSourcingSearch`, `aiSourcingVendors`.

---

#### `assignedRowClass = (row): string` (arrow field)
- **Purpose:** Row CSS class for the assigned-vendors grid.
- **Behavior:** Returns `row--default-vendor`, `row--primary-vendor`, `row--full-consolidator`, or `row--possible-consolidator` based on `isDefault`/`isPrimaryVendor`/`isFullConsolidator`/`isPossibleConsolidator`; else empty string. Priority is default > primary > full > possible.

---

#### `vendorListRowClass = (row): string` (arrow field)
- **Purpose:** Row CSS class for Add Vendor search / location history grids.
- **Behavior:**
  - Returns `row--full-consolidator` if `fullConsolidator===true` or `isFullConsolidator===true`.
  - Returns `row--possible-consolidator` if `possibleConsolidator===true` or `isPossibleConsolidator===true`.
  - Otherwise derives a label via `formatConsolidatorLabel(row['consolidator'])` and maps `'Full Consolidator'` / `'Possible consolidator'` to the respective classes; else empty.
- **Calls:** `formatConsolidatorLabel`.

---

#### `formatConsolidatorLabel(value: string | null | undefined): string | null`
- **Purpose:** Normalize a consolidator label for display.
- **Behavior:** Trims the value; returns `null` for empty or `'--'`; otherwise returns the trimmed string.

---

#### `getPriorityClass(priority: string | null): string`
- **Purpose:** Map a priority string to a CSS class name.
- **Behavior:** Lowercases/trims; matches substring `emergency`/`standard`/`high`/`medium`/`low` (in that order) returning the corresponding class; else `'default'`.
- **Notes:** Substring `includes` matching, so `'emergency'` wins even if other words present.

---

#### `boundOnReassignFromInactive = (row): void` (arrow field)
- **Purpose:** Stable bound reference delegating to `onReassignFromInactive(row)`.
- **Calls:** `onReassignFromInactive`.

---

#### `boundOnUnassignVendor = (row): void` (arrow field)
- **Purpose:** Stable bound reference delegating to `onUnassignVendor(row)`.
- **Calls:** `onUnassignVendor`.

---

#### `ngOnInit(): void`
- **Purpose:** Component initialization.
- **Behavior:**
  - Calls `buildForms()`.
  - Reads `jobKey` route param, sets `jobKey` signal; if missing, sets `errorMessage` and returns early.
  - Calls `subscribeToDataStreams()`.
  - Sets `pendingBroadcastFromQuery` from query param `broadcast === '1'`.
  - Calls `loadAndApplyScores(jobKey)`, `runFormLoadWithUplineCheck(jobKey)`, `startJobDetailsPolling()`.
  - Registers document `visibilitychange` → `onPageVisibilityRefresh` and window `focus` → `onWindowFocusRefresh` listeners.
- **Calls:** `buildForms`, `subscribeToDataStreams`, `loadAndApplyScores`, `runFormLoadWithUplineCheck`, `startJobDetailsPolling`.

---

#### `onSave(): void`
- **Purpose:** Handle the Save (NTE) button.
- **Behavior:** If `hasPendingSriEdits()` is true, calls `persistSriEdits()` and returns; otherwise sets `successMessage` to "No pending edits to save." and clears it after 3s.
- **Calls:** `hasPendingSriEdits`, `persistSriEdits`.

---

#### `onBroadcastToVendors(): void`
- **Purpose:** Entry point for the Broadcast button.
- **Behavior:**
  - Console-logs; returns if no `jobKey`.
  - Reads `assignedVendorsWithEta()`, `assignedVendorsWithoutEta()`, `allAssignedVendors()`.
  - If any assigned vendors exist, opens confirmation modal (`showBroadcastConfirmModal.set(true)`, `broadcastConfirmChoice.set(null)`) and returns.
  - Else calls `openBroadcastConfigModal()`.
- **Calls:** `openBroadcastConfigModal`; reads signals `assignedVendorsWithEta`, `assignedVendorsWithoutEta`, `allAssignedVendors`.
- **Notes:** Heavy debug `console.log` output remains.

---

#### `openBroadcastConfigModal(): void`
- **Purpose:** Open and reset the broadcast configuration modal.
- **Behavior:** Sets `showBroadcastConfigModal(true)`; resets broadcast config signals (`broadcastEtaLimit`, `broadcastDefaultEtaLimit`, `broadcastExpandedMiles`, `broadcastDefaultBroadcastRadiusMiles`, `broadcastMaxAccept`, `broadcastAdditionalTrades`, `broadcastSelectedTradeKey`); then `loadAvailableTrades()` and `loadBroadcastConfig()`.
- **Calls:** `loadAvailableTrades`, `loadBroadcastConfig`.

---

#### `closeBroadcastConfigModal(): void`
- **Purpose:** Close the broadcast config modal.
- **Behavior:** Sets `showBroadcastConfigModal(false)`.

---

#### `loadAvailableTrades(): void`
- **Purpose:** Load the trade dropdown for adding additional broadcast trades.
- **Behavior:** Calls `assignVendorSvc.getTradeDropdown()`; on success filters out the current `pageContext().tradeKey` and stores in `broadcastAvailableTrades`; on error sets `errorMessage`.
- **Calls:** `AssignVendorService.getTradeDropdown`.

---

#### `loadBroadcastConfig(): void`
- **Purpose:** Load saved broadcast configuration for the job.
- **Behavior:**
  - Returns if no `jobKey`.
  - Calls `assignVendorSvc.getBroadcastConfig(jobKey)`; on success populates signals: `broadcastIsEmergency`, `broadcastShowMaxAccept`, `broadcastDefaultEtaLimit`, `broadcastDefaultBroadcastRadiusMiles`, `broadcastEtaLimit`, `broadcastMaxAccept`.
  - `broadcastExpandedMiles` is clamped: null stays null, otherwise `min(max(0, 150 - defaultRadius), max(0, expandedMiles))`.
  - Maps `config.additionalTrades` into `VendorDropdownOption[]` (value/text/label) into `broadcastAdditionalTrades`.
  - On error, warns and keeps defaults.
- **Calls:** `AssignVendorService.getBroadcastConfig`.
- **Notes:** Expanded miles cap enforces total radius ≤ 150 mi.

---

#### `onAddBroadcastTrade(): void`
- **Purpose:** Add currently-selected trade to the additional-trades list.
- **Behavior:** Reads `broadcastSelectedTradeKey()`; returns if empty; looks up in `broadcastAvailableTrades`; skips if already present; appends and resets selection.

---

#### `onSelectBroadcastTrade(tradeKey: string): void`
- **Purpose:** Add a trade via dropdown selection.
- **Behavior:** Returns if empty; looks up trade; if already in list, resets selection and returns; otherwise appends to `broadcastAdditionalTrades` and resets `broadcastSelectedTradeKey`.
- **Notes:** Functionally similar to `onAddBroadcastTrade` but driven by selection event.

---

#### `onBroadcastSearchDistanceInput(totalMiles: number): void`
- **Purpose:** Convert a total-miles slider value into expanded-miles add-on.
- **Behavior:** Caps total to `[0,150]`, then sets `broadcastExpandedMiles = max(0, cappedTotal - baseRadius)` where base is `broadcastDefaultBroadcastRadiusMiles()`.

---

#### `onRemoveBroadcastTrade(tradeKey: string): void`
- **Purpose:** Remove a trade from the additional-trades list.
- **Behavior:** Filters `broadcastAdditionalTrades` to exclude the given key.

---

#### `onProceedToBroadcast(): void`
- **Purpose:** Save broadcast config then advance to vendor selection.
- **Behavior:**
  - Returns with error if no `jobKey`.
  - Builds `SaveBroadcastConfigRequest` with `etaLimit` (falls back to default), `expandedMiles` (0 fallback), `maxVendorAccept` (only when `broadcastShowMaxAccept()`, else null), and `additionalTradeKeys`.
  - Calls `assignVendorSvc.saveBroadcastConfig(request)`; on success closes config modal and opens broadcast modal; else sets `errorMessage`.
- **Calls:** `AssignVendorService.saveBroadcastConfig`, `closeBroadcastConfigModal`, `openBroadcastModal`.

---

#### `openBroadcastModal(): void`
- **Purpose:** Open the vendor-selection broadcast modal.
- **Behavior:** Sets `broadcastModalOpen(true)`; clears `broadcastMessage`/`broadcastError`; resets selected vendor and file key sets; sets `broadcastRadius` to `getBroadcastSearchRadius()` (or 50 if ≤0); calls `loadBroadcastVendors()` and `loadBroadcastFiles()`.
- **Calls:** `getBroadcastSearchRadius`, `loadBroadcastVendors`, `loadBroadcastFiles`.

---

#### `loadBroadcastFiles(): void`
- **Purpose:** Load job files eligible for broadcast attachment.
- **Behavior:** Returns if no `jobKey`; sets loading flag; clears `broadcastFiles`; calls `assignVendorSvc.getJobFilesForBroadcast(jobKey)`; on success filters out `documentTypeName === 'CUSTOMER WORK ORDER'`; if `isBusinessHours()` auto-selects all files.
- **Calls:** `AssignVendorService.getJobFilesForBroadcast`, `selectAllBroadcastFiles`, `isBusinessHours` (util).
- **Notes:** Business-hours auto-select of attachments; Customer Work Order excluded.

---

#### `toggleBroadcastFile(fileKey: string): void`
- **Purpose:** Toggle a file in the broadcast selection set.
- **Behavior:** Clones `broadcastSelectedFileKeys`, adds/removes the key, sets it back.

---

#### `selectAllBroadcastFiles(): void`
- **Purpose:** Select all broadcast files.
- **Behavior:** Sets `broadcastSelectedFileKeys` to a Set of all `broadcastFiles()` fileKeys.

---

#### `deselectAllBroadcastFiles(): void`
- **Purpose:** Clear all broadcast file selections.
- **Behavior:** Sets `broadcastSelectedFileKeys` to an empty Set.

---

#### `onViewBroadcastAttachment(file: AttachmentCardFile): void`
- **Purpose:** Open a broadcast attachment in a new tab.
- **Behavior:** If `file.fileUrl` present, `window.open(fileUrl, '_blank', 'noopener')`; else warns and sets `broadcastError`.

---

#### `private getBroadcastSearchRadius(): number`
- **Purpose:** Compute total vendor search radius.
- **Behavior:** Returns `min(150, defaultBroadcastRadiusMiles + expandedMiles)` (system default + per-job expanded add-on), capped at 150 mi.

---

#### `onBroadcastConfirmProceed(): void`
- **Purpose:** Act on the user's choice in the "vendors already assigned" confirm modal.
- **Behavior:**
  - `'cancel'`: closes confirm modal, returns.
  - `'remove'`: validates `jobKey` and admin key (from `authTokenSvc.getAdminKeyFromToken()`); errors if missing; builds `UnassignVendorWithEmailRequest` for each of `allAssignedVendors()`; runs them in parallel via `forkJoin`; on success refreshes header detail + re-runs `lastVendorListLoader`, then opens broadcast config modal after 500ms; handles partial failures and errors with messages; toggles `broadcastConfirmRemoving`.
  - `'keep'`: closes confirm modal and opens broadcast config modal.
  - No choice: sets `errorMessage` prompting to select an option.
- **Calls:** `authTokenSvc.getAdminKeyFromToken`, `AssignVendorService.unassignVendorWithEmail`, `AssignVendorService.loadJobHeaderDetail`, `closeBroadcastConfirmModal`, `openBroadcastConfigModal`, `lastVendorListLoader`.
- **Notes:** Bulk parallel unassign with email; heavy emoji debug logging; 500ms delay lets data refresh before reopening config.

---

#### `closeBroadcastConfirmModal(): void`
- **Purpose:** Close/reset the broadcast confirm modal.
- **Behavior:** Sets `showBroadcastConfirmModal(false)`, `broadcastConfirmChoice(null)`, `broadcastConfirmRemoving(false)`.

---

#### `onCloseBroadcastModal(): void`
- **Purpose:** Close the broadcast vendor-selection modal.
- **Behavior:** Sets `broadcastModalOpen(false)`.

---

#### `loadBroadcastVendors(): void`
- **Purpose:** Load vendors available for broadcast at the current radius.
- **Behavior:** Returns if no `jobKey`; sets loading; clears `broadcastVendors`; calls `assignVendorSvc.getVendorsForBroadcast(jobKey, broadcastRadius())`; on success stores data, else sets `broadcastError`.
- **Calls:** `AssignVendorService.getVendorsForBroadcast`.

---

#### `onBroadcastRadiusChange(miles: number): void`
- **Purpose:** Change the broadcast search radius.
- **Behavior:** Sets `broadcastRadius(miles)` and reloads via `loadBroadcastVendors()`.
- **Calls:** `loadBroadcastVendors`.

---

#### `toggleBroadcastVendor(vendorKey: string): void`
- **Purpose:** Toggle a vendor in the broadcast selection set.
- **Behavior:** Clones `broadcastSelectedKeys`, adds/removes key, sets back.

---

#### `selectAllBroadcastVendors(): void`
- **Purpose:** Select all broadcast vendors.
- **Behavior:** Sets `broadcastSelectedKeys` to Set of all `broadcastVendors()` vendorKeys.

---

#### `deselectAllBroadcastVendors(): void`
- **Purpose:** Clear all broadcast vendor selections.
- **Behavior:** Sets `broadcastSelectedKeys` to empty Set.

---

#### `onSendBroadcast(): void`
- **Purpose:** Send the broadcast to selected vendors with selected files.
- **Behavior:** Returns if no `jobKey` or no selected vendors; sets `broadcastSending`; clears message/error; builds `BroadcastToVendorsRequest {jobKey, vendorKeys, fileKeys}`; calls `assignVendorSvc.broadcastToVendors(req)`; on success sets success message, clears both selection sets, reloads vendors; else sets `broadcastError`.
- **Calls:** `AssignVendorService.broadcastToVendors`, `loadBroadcastVendors`.

---

#### `onReassignInactiveVendor(vendor: AssignedVendorDetail): void`
- **Purpose:** Open the reassign-inactive-vendor modal.
- **Behavior:** Errors if no `jobKey`; stores vendor in `reassignVendor`; shows `showReassignModal`; clears success/error messages.

---

#### `onReassignWithReset(): void`
- **Purpose:** Reassign resetting status to "Pending ETA" and clearing schedule.
- **Behavior:** Calls `executeReassignVendor(false, true)`.
- **Calls:** `executeReassignVendor`.

---

#### `onReassignWithoutReset(): void`
- **Purpose:** Reassign preserving current status/schedule.
- **Behavior:** Calls `executeReassignVendor(false, false)`.
- **Calls:** `executeReassignVendor`.

---

#### `onCancelReassign(): void`
- **Purpose:** Cancel the reassign modal.
- **Behavior:** Hides `showReassignModal`; clears `reassignVendor`.

---

#### `private buildReassignFromInactiveRequest(jobKey, jobVendorKey, options): ReassignVendorFromInactiveRequest`
- **Purpose:** Build the reassign request object.
- **Behavior:** Returns `{jobKey, jobVendorKey, ...options}` where options are `{restorePreviousState, resetStatusAndSchedule}`.
- **Notes:** Both flags sent explicitly so backend logs intent (reset defaults to true if omitted).

---

#### `private executeReassignVendor(restorePreviousState: boolean, resetStatusAndSchedule: boolean): void`
- **Purpose:** Execute the reassign-from-inactive API call.
- **Behavior:**
  - Errors if no vendor/jobKey.
  - Hides modal; sets `reassignProcessing`.
  - Builds request via `buildReassignFromInactiveRequest`; calls `assignVendorSvc.reassignFromInactive(request)`.
  - On success: clears processing; sets success message (server message or generated text differing by reset flag); refreshes header detail and re-runs `lastVendorListLoader`; clears `reassignVendor`.
  - On failure/error: clears processing; sets error message; clears `reassignVendor`.
- **Calls:** `buildReassignFromInactiveRequest`, `AssignVendorService.reassignFromInactive`, `AssignVendorService.loadJobHeaderDetail`, `lastVendorListLoader`.

---

#### `onDuplicateJob(): void`
- **Purpose:** Open the duplicate-job modal and load customer locations.
- **Behavior:** Returns if no `pageContext().customerKey`; opens `duplicateModalOpen`; resets duplicate signals (message, error, selectedLoc, jobResult, searchQuery); sets loading; calls `assignVendorSvc.getCustomerLocations(customerKey)`; on success stores locations, else sets `duplicateError`.
- **Calls:** `AssignVendorService.getCustomerLocations`.

---

#### `onCloseDuplicateModal(): void`
- **Purpose:** Close the duplicate-job modal.
- **Behavior:** Sets `duplicateModalOpen(false)`; clears `duplicateSearchQuery`.

---

#### `onConfirmDuplicate(): void`
- **Purpose:** Confirm and perform job duplication to a selected location.
- **Behavior:** Returns if no `jobKey` or no selected location; sets `duplicateSaving`; clears message/error; builds `DuplicateJobRequest {jobKey, locationKey}`; calls `assignVendorSvc.duplicateJob(req)`; on success stores result and message, else sets `duplicateError`.
- **Calls:** `AssignVendorService.duplicateJob`.

---

#### `navigateToDuplicatedJob(): void`
- **Purpose:** Open the newly duplicated job in a new tab.
- **Behavior:** If `duplicateJobResult().newJobKey` exists, `window.open('/job/{newJobKey}/assign-vendor', '_blank')`.

---

#### `ngOnDestroy(): void`
- **Purpose:** Cleanup on component teardown.
- **Behavior:** Clears `waitPopupTimeoutId` and `jobDetailsRefreshDebounceId` timeouts (nulling them); emits `jobDetailsPollingStop$`; removes `visibilitychange` and window `focus` listeners; sets `aiSourcingPolling(false)`; emits and completes `destroy$`.

---

#### `private buildForms(): void`
- **Purpose:** Build all reactive forms.
- **Behavior:** Calls `buildVendorForm`, `buildSearchForm`, `buildQuickVendorForm`, `buildVendorNoteForm`, `buildPinForm`.

---

#### `private buildVendorForm(): void`
- **Purpose:** Build the Vendor Selection form (SRS §8.1).
- **Behavior:** `vendorForm` with required `vendorKey` and `contactKey`.

---

#### `private buildSearchForm(): void`
- **Purpose:** Build the Vendor Search Panel form (SRS §10).
- **Behavior:** `searchForm` with `radius` (default 70, required, min 0.01) and `searchType` (default 1).

---

#### `private buildQuickVendorForm(): void`
- **Purpose:** Build the Quick Vendor Creation form (SRS §20.3/§25.3).
- **Behavior:** Builds `quickVendorForm` with many controls: required companyName, companyemail (email), phone, address, stateKey/cityKey (min 1), zip, tradeKey, contactName, contactemail (email); optional address1; rate fields defaulting to 0; `wcom` and `genL` required booleans (null default); optional accName/accEmail/accPhone; group-level validator `AssignVendorComponent.accountingFieldsValidator`.
- **Notes:** Cross-field accounting validator applied at group level.

---

#### `private buildVendorNoteForm(): void`
- **Purpose:** Build the Vendor Notes form (SRS §21.4/§25.4).
- **Behavior:** `vendorNoteForm` with noteKey (optional), required vendorKey, noteTitle, notesDetail; `newNote` default 1.

---

#### `private buildPinForm(): void`
- **Purpose:** Build the Pin Vendor form (SRS §17.2).
- **Behavior:** `pinForm` with required vendorKey, optional vendorName, `noMaybe` default 'No', optional notes.

---

#### `static accountingFieldsValidator(group: AbstractControl): ValidationErrors | null`
- **Purpose:** Cross-field validator: if any accounting field filled, all three required (SRS §25.3).
- **Behavior:** Trims accName/accEmail/accPhone; if any filled but not all, returns `{accountingIncomplete: true}`; else null.

---

#### `isValidPhoneNumber(phone: string | null | undefined): boolean`
- **Purpose:** Heuristic check that a phone number looks legitimate.
- **Behavior:** Returns false if empty; strips non-digits; returns false if fewer than 10 digits; returns false if all digits identical (e.g. 9999999999); else true.
- **Notes:** Rejects placeholder repeated-digit numbers.

## B. Upline gate, add-vendor, consolidator/distance, search & W/O entry points

#### `formatPhoneDisplay(raw: string | null | undefined): string`
- **Purpose:** Format a `tel:` value for display, stripping the `tel:` prefix and optionally applying US formatting.
- **Behavior:**
  - Returns `''` for falsy input.
  - Strips `tel:` prefix and all non-digits.
  - 11 digits starting with `1` → `(XXX) XXX-XXXX` (drops leading 1).
  - 10 digits → `(XXX) XXX-XXXX`.
  - Otherwise returns the raw value with only the `tel:` prefix stripped.
- **Calls:** none.
- **Notes:** Pure formatting helper; falls back to lightly-cleaned raw string for non-standard lengths.

#### `formatPhoneWithExt(phone, ext): string`
- **Purpose:** Format a phone number plus an optional extension.
- **Behavior:**
  - Delegates to `formatPhoneDisplay(phone)`.
  - Returns `''` if the formatted display is empty.
  - Appends ` x{ext}` when an extension is present.
- **Calls:** `this.formatPhoneDisplay`.
- **Notes:** none.

#### `getErrorMessage(form: FormGroup, field: string): string`
- **Purpose:** Return the first validation error message (client or server) for a form control.
- **Behavior:**
  - Returns `''` if control missing, no errors, or untouched.
  - Prefers `serverError` message.
  - `required` → looks up `requiredMessages[field]` (default `'This field is required'`).
  - `email` → contact-specific vs generic message (`contactemail` special-cased).
  - `min` → radius-specific vs generic positive-value message.
- **Calls:** reads `this.requiredMessages`.
- **Notes:** Ties to SRS §25.1/§25.3 wording.

#### `requiredMessages` (private readonly Record<string,string>)
- **Purpose:** Field → exact required-error wording map per SRS §25.1/§25.3.
- **Behavior:** Static lookup for vendorKey, contactKey, radius, companyName, companyemail, phone, address, stateKey, cityKey, zip, tradeKey, contactName, contactemail, wcom, genL, noteTitle, notesDetail.
- **Calls:** n/a (data member, not a method).
- **Notes:** `wcom` and `genL` share the same message.

#### `subscribeToDataStreams(): void` (private)
- **Purpose:** Wire component signals to all `AssignVendorService` observable streams.
- **Behavior:**
  - `pageContext$`: sets `pageContext`; while `tradeSaving()` preserves current tradeKey/tradeName over incoming ctx.
  - `jobHeaderDetail$`: logs, sets `jobHeaderDetail`; on data → `syncNteDisplay`, `applyJobPriorityOptions` (unless edit in progress), `applyCustomerRequestorOptions` (unless saving), auto-selects default/first assigned vendor into `selectedVendorDetailKey`, and `syncVendorScheduleDrafts`.
  - `assignedVendors$`, `vendorDropdown$`, `contactDropdown$`, `tradeDropdown$`, `stateDropdown$`, `cityDropdown$`, `loading$`, `aiSourcingVendors$`, `aiSourcingStatus$`: set corresponding signals.
  - `locationHistory$` / `defaultVendors$`: set signal, and if non-empty call `loadAndApplyScores(jobKey, vendorKeys)`.
  - `searchResults$`: set signal; also `loadAndApplyScores`.
  - `pinnedVendors$`: set signal and rebuild `pinnedNoMaybeCache` keyed by lowercased vendorKey and `name:{vendorName}` for rows with a `noMaybe` choice.
- **Calls:** `syncNteDisplay`, `applyJobPriorityOptions`, `applyCustomerRequestorOptions`, `syncVendorScheduleDrafts`, `loadAndApplyScores`; reads many signals; subscribes to `AssignVendorService` streams. All piped through `takeUntil(this.destroy$)`.
- **Notes:** Uses an `unknown → Record` cast to read `jobKey` off search-result rows.

#### `runFormLoadWithUplineCheck(jobKey: string): void` (private)
- **Purpose:** Gate page load on upline-approval status (SRS §5.3).
- **Behavior:**
  - Calls `checkUplineApproval(jobKey)`.
  - value `0` → `loadInitialData` then `runCreateVendorContextAndIntroCheck`.
  - value `2` → `loadInitialData` only.
  - otherwise → open upline modal (`showUplineModal=true`) and `loadInitialData`.
  - On error sets an error message.
- **Calls:** `AssignVendorService.checkUplineApproval`; `loadInitialData`, `runCreateVendorContextAndIntroCheck`.
- **Notes:** Numeric coercion; non-number `data` treated as `-1`.

#### `runCreateVendorContextAndIntroCheck(jobKey: string): void` (private)
- **Purpose:** After upline=0, run create-vendor-context and conditionally the primary-vendor-intro check.
- **Behavior:**
  - Calls `getCreateVendorContext`; bails if no status/data.
  - Requires `fromCustomer===1` and `minutesLeft<=4` (minutesLeft from ctx or `jobVendorModel`).
  - Then calls `checkPrimaryVendorIntro`; code `'1'` → primary-vendor-assign wait message; `'2'` → emergency-broadcast wait message. Both set `showWaitPopup`, `formBlockedByWait=true`, and `scheduleWaitPopupReload`.
- **Calls:** `AssignVendorService.getCreateVendorContext`, `AssignVendorService.checkPrimaryVendorIntro`; `scheduleWaitPopupReload`.
- **Notes:** Blocks the form for jobs the system is auto-processing.

#### `scheduleWaitPopupReload(jobKey: string): void` (private)
- **Purpose:** After a wait popup, reload data in 3 minutes and clear the block.
- **Behavior:**
  - Clears any existing `waitPopupTimeoutId`.
  - Sets a 3-minute `setTimeout` that clears `showWaitPopup`, `formBlockedByWait`, `waitPopupMessage` and calls `loadInitialData`.
- **Calls:** `loadInitialData`.
- **Notes:** 3 min = `3 * 60 * 1000` ms.

#### `onUplineCancel(): void`
- **Purpose:** Close the upline modal.
- **Behavior:** Sets `showUplineModal=false`, `showUplineOverrideSection=false`, clears `uplineOverrideReason`.
- **Calls:** none.
- **Notes:** Reused by `onUplineSave` on success.

#### `onUplineOverrideClick(): void`
- **Purpose:** Reveal the override-reason section.
- **Behavior:** Sets `showUplineOverrideSection=true`.
- **Calls:** none.

#### `onUplineSave(): void`
- **Purpose:** Save an upline-approval override with a reason.
- **Behavior:**
  - No-op if trimmed reason empty.
  - Requires an admin key from token; else sets error and returns.
  - Sets `uplineOverrideSaving=true`; calls `saveUplineOverride({jobKey, reason, adminKey})`; on success closes via `onUplineCancel`, else error message. Resets saving flag in both next/error.
- **Calls:** `AuthTokenService.getAdminKeyFromToken`, `AssignVendorService.saveUplineOverride`; `onUplineCancel`.
- **Notes:** none.

#### `loadInitialData(jobKey: string, onSuccess?: () => void): void` (private)
- **Purpose:** Bulk-load the page's data (SRS §5.3).
- **Behavior:**
  - Sets `isLoading=true`, clears error; kicks off vendor-list load independently via `enqueueVendorListLoadForCurrentSearch` (non-blocking).
  - `forkJoin` of: loadAssignVendorPage, getActiveVendorsDropdown, loadJobHeaderDetail, getTradeDropdown, getStateDropdown, getJobStatusList, getJobPriorityOptions, getCustomerRequestorOptions.
  - Sets `jobStatusList`; aggregates failed loads via `formatHttpFailureForUi` + grid labels and, if any, sets error via `consolidateParallelLoadFailures`.
  - Applies job-priority & customer-requestor options using resolved header data.
  - Calls `refreshJobPriorityVendorCheck`.
  - On page success: if customerKey → `loadCustomerProfileDne`; then loads assigned vendors, location-history, pinned vendors (each appending grid failure lines); `loadAISourcingData`; shows transient (5s) success message if present.
  - Always clears `isLoading`, runs `onSuccess`, and if `pendingBroadcastFromQuery` triggers `onBroadcastToVendors` and strips `broadcast` query param.
  - On error: sets generic error and clears loading.
- **Calls:** many `AssignVendorService` methods (loadAssignVendorPage, getActiveVendorsDropdown, loadJobHeaderDetail, getTradeDropdown, getStateDropdown, getJobStatusList, getJobPriorityOptions, getCustomerRequestorOptions, loadAssignedVendors, loadLocationHistoryVendors, loadPinnedVendors, formatHttpFailureForUi); component methods `enqueueVendorListLoadForCurrentSearch`, `applyJobPriorityOptions`, `applyCustomerRequestorOptions`, `refreshJobPriorityVendorCheck`, `loadCustomerProfileDne`, `loadAISourcingData`, `consolidateParallelLoadFailures`, `onBroadcastToVendors`; `router.navigate`.
- **Notes:** Grid loads are independent subscriptions so one failure does not block others.

#### `consolidateParallelLoadFailures(lines: string[]): string` (private)
- **Purpose:** Collapse repeated network-unreachable failures into one actionable line.
- **Behavior:**
  - `<=1` line → join as-is.
  - If every line indicates the Job Ops API is unreachable, returns a single guidance message referencing `environment.apiBaseUrl` (token/legacy Admin hint, API-running/firewall/VPN checks).
  - Otherwise joins all lines.
- **Calls:** reads `environment.apiBaseUrl`.
- **Notes:** Matches specific unreachable substrings to decide.

#### `onVendorSelected(): void`
- **Purpose:** On vendor-dropdown change, load contacts, service charge, distance, consolidator label.
- **Behavior:**
  - If no vendorKey: clears contactKey, contactDropdown, distance, serviceCharge, consolidator, laborKey; returns.
  - Sets `selectedVendorConsolidator` from the matched option via `formatConsolidatorLabel`; resets contact/distance/serviceCharge/laborKey.
  - `getVendorContacts`: auto-selects the default contact into the form.
  - If `pageContext().tradeKey`: `getServiceCharge(jobKey, vendorKey, tradeKey, customerKey, jobTypeKey)` → sets distance, serviceCharge, laborKey.
- **Calls:** `AssignVendorService.getVendorContacts`, `AssignVendorService.getServiceCharge`; `formatConsolidatorLabel`.
- **Notes:** SRS §8.2.

#### `onStateChange(): void`
- **Purpose:** Cascading dropdown — load cities when state changes (quick-vendor form).
- **Behavior:** Reads `quickVendorForm.stateKey`, resets `cityKey=0`; if state > 0 calls `getCityDropdown(stateKey)`, else clears `cityDropdown`.
- **Calls:** `AssignVendorService.getCityDropdown`.
- **Notes:** none.

#### `onAddVendorToJob(): void`
- **Purpose:** Entry point to add a vendor to the job (WF-1, SRS §13; mirrors legacy SaveVendor).
- **Behavior:**
  - Marks vendorForm touched; returns if invalid.
  - Reads vendorKey/contactKey; error if missing.
  - Resolves vendorName from dropdown; requires jobKey.
  - Clears messages; runs consolidator pre-check with source `'addVendor'`, continuing into `runAddVendorDistanceFlow`.
- **Calls:** `runVendorConsolidatorPrecheck`, `runAddVendorDistanceFlow`, `clearMessages`.
- **Notes:** Consolidator pre-check runs before the distance rule.

#### `runAddVendorDistanceFlow(vendorKey, vendorName): void` (private)
- **Purpose:** Apply the distance rule before assigning.
- **Behavior:**
  - `isSubmitting=true`; calls `checkDistanceRule(jobKey, vendorKey)`.
  - If `exceedsRule`: if logged-in admin equals `qcManagerKey` (case-insensitive) → bypass approval and `proceedWithAddVendor`; else populate `distanceExceededData` and open `showDistanceExceededModal`.
  - If not exceeded → `proceedWithAddVendor`.
  - On error → warn and proceed anyway (non-blocking). Resets `isSubmitting` appropriately.
- **Calls:** `AssignVendorService.checkDistanceRule`, `AuthTokenService.getAdminKeyFromToken`; `proceedWithAddVendor`.
- **Notes:** QC Manager override lets them skip the distance approval.

#### `runVendorConsolidatorPrecheck(jobKey, vendorKey, source, onContinue): void` (private)
- **Purpose:** Job Ops check-if-consolidator gate before continuing.
- **Behavior:**
  - Calls `checkIfVendorIsConsolidator`; on non-status → error and stop.
  - `data !== true` → run `onContinue` immediately.
  - `data === true` → stash `onContinue`/keys/source, set precheck message, open `showConsolidatorPrecheckModal`.
  - On error → error message.
- **Calls:** `AssignVendorService.checkIfVendorIsConsolidator`.
- **Notes:** `source` is `'addVendor' | 'grid'`.

#### `onConsolidatorPrecheckProceed(): void`
- **Purpose:** Proceed past consolidator precheck modal.
- **Behavior:** Closes modal; captures pending continue/keys; clears pending fields; if keys present sets `pendingPostWoQcDispatch` (for QC mail after WO/dispatch); runs the stored callback.
- **Calls:** the stashed `onContinue`.
- **Notes:** none.

#### `onConsolidatorPrecheckCancel(): void`
- **Purpose:** Cancel the consolidator precheck.
- **Behavior:** Closes modal; clears pending continue/keys/source; if source was `'addVendor'` resets the vendor selection form.
- **Calls:** `resetVendorSelectionForm`.
- **Notes:** none.

#### `resetVendorSelectionForm(): void` (private)
- **Purpose:** Clear vendor + contact selection (form Section B).
- **Behavior:** Patches `vendorForm` `{vendorKey:'', contactKey:''}`.
- **Calls:** none.

#### `onQcDispatchOutcomeClose(): void`
- **Purpose:** Close QC-dispatch outcome modal.
- **Behavior:** Sets `showQcDispatchOutcomeModal=false` then `window.location.reload()`.
- **Calls:** none.
- **Notes:** Hard page reload after QC manager dispatch mail.

#### `invokeQcManagerDispatchThenShowOutcome(): void` (private)
- **Purpose:** Send QC-manager consolidator dispatch mail and show outcome.
- **Behavior:**
  - Reads and clears `pendingPostWoQcDispatch`; returns if none.
  - Calls `sendMailQcManagerConsolidatorDispatch(jobKey, vendorKey)`; sets outcome message (trimmed message, else status-based fallback) and opens modal. Error path shows server/error message.
- **Calls:** `AssignVendorService.sendMailQcManagerConsolidatorDispatch`.
- **Notes:** Runs after successful assign/WO or primary dispatch when precheck flagged a consolidator.

#### `clearPendingPostWoQcDispatch(): void` (private)
- **Purpose:** Cancel pending QC dispatch if the assign/WO pipeline fails.
- **Behavior:** Sets `pendingPostWoQcDispatch` to null.
- **Calls:** none.

#### `onDistanceExceededSendApproval(): void`
- **Purpose:** Send distance-exceeded approval request to QC Manager.
- **Behavior:** Reads `distanceExceededData`; returns if none; closes modal; calls `createDistantVendorApprovalRequest(vendorKey, distance)`; clears data.
- **Calls:** `createDistantVendorApprovalRequest`.

#### `onDistanceExceededCancel(): void`
- **Purpose:** Cancel the distance-exceeded modal.
- **Behavior:** Closes modal and clears `distanceExceededData`.
- **Calls:** none.

#### `createDistantVendorApprovalRequest(vendorKey, distance): void` (private)
- **Purpose:** Create a distant-vendor approval request (email-sending; may be slow).
- **Behavior:**
  - Sets `isSubmitting=true`, shows processing overlay message, clears messages.
  - Calls `createDistantVendorApprovalRequest({jobKey, vendorKey, distance})`.
  - Success → success message with `distance.toFixed(2)` and approval-pending text; else error message.
  - Error → timeout-specific vs generic message. Clears submitting/overlay in both paths.
- **Calls:** `AssignVendorService.createDistantVendorApprovalRequest`, `clearMessages`.
- **Notes:** Handles `TimeoutError` explicitly.

#### `proceedWithAddVendor(vendorKey, vendorName): void` (private)
- **Purpose:** Set up work-order state and start the assign flow after distance passes.
- **Behavior:** Sets WO signals (`woSelectedVendorKey`, `woSelectedVendorName`, `woDefaultVendorValue='1'`, `woSendFromWhere='0'`, `woMessage=''`), calls `woResetWorkOrderForm`, then `avProcessSaveVendor`.
- **Calls:** `woResetWorkOrderForm`, `avProcessSaveVendor`.

#### `avProcessSaveVendor(): void` (private)
- **Purpose:** Add Vendor Step 1 — existing-vendor then same-vendor checks, then branch (mirrors legacy SaveVendor exactly).
- **Behavior:**
  - `checkForExistingVendor(jobKey)` → `hasExisting = data===1`.
  - `checkForSameVendor(jobKey, vendorKey)`: if same (`data===1`) → stop submitting, open `showAlreadyAssignedModal`.
  - Else set `woDefaultVendorValue` to `''` when hasExisting, `'1'` otherwise, then `woCheckTradeThenAssign`.
  - Error paths reset submitting and set error messages.
- **Calls:** `AssignVendorService.checkForExistingVendor`, `AssignVendorService.checkForSameVendor`; `woCheckTradeThenAssign`.
- **Notes:** No Consolidator/Primary/Default modals here by design (legacy parity).

#### `onSearchVendors(): void`
- **Purpose:** Execute vendor search by type/radius (SRS §10.3).
- **Behavior:** Marks searchForm touched; returns if no jobKey or invalid; clears messages; runs `enqueueVendorListLoadForCurrentSearch`.
- **Calls:** `enqueueVendorListLoadForCurrentSearch`, `clearMessages`.

#### `enqueueVendorListLoadForCurrentSearch(jobKey): void` (private)
- **Purpose:** Store and run the current vendor-list loader so pin/refresh can replay it.
- **Behavior:**
  - Assigns `lastVendorListLoader` a closure that reads radius/searchType from `searchForm` at run time and switches:
    - type 1 → `loadVendorsInRadius(jobKey, radius)`
    - type 2 → `loadVendorsTradeRadius(jobKey, radius)`
    - type 3 → `loadVendorsLocationHistory(jobKey)`
  - Immediately invokes the loader.
- **Calls:** `AssignVendorService.loadVendorsInRadius / loadVendorsTradeRadius / loadVendorsLocationHistory`.
- **Notes:** Type 2 responses mapped to LocationHistoryVendor so they share type-1 grid columns/actions.

#### `onLoadAllVendors(): void`
- **Purpose:** Load all vendors (no radius) into the grid (SRS §11 browse).
- **Behavior:** Returns if no jobKey; sets `lastVendorListLoader` to call `loadVendorsNoRadius(key)` and runs it.
- **Calls:** `AssignVendorService.loadVendorsNoRadius`.

#### `onSelectVendorFromGrid(row): void`
- **Purpose:** Select a grid vendor into the selection form (SRS §8.2).
- **Behavior:** Patches `vendorForm.vendorKey`; calls `onVendorSelected`; sets success message prompting contact selection.
- **Calls:** `onVendorSelected`.

#### `onSetDefault(row): void`
- **Purpose:** Set vendor as default (WF-4, SRS §16) — placeholder.
- **Behavior:** Only sets a "modal integration in Layer 6" success message.
- **Calls:** none.
- **Notes:** Stub/not yet implemented.

#### `onSendWorkOrder(row): void`
- **Purpose:** Send work order (WF-2, SRS §14) — placeholder.
- **Behavior:** Sets a "modal integration in Layer 6" success message.
- **Calls:** none.
- **Notes:** Stub.

#### `onResendWorkOrder(row): void`
- **Purpose:** Resend work order (WF-10, SRS §22) — placeholder.
- **Behavior:** Sets a "modal integration in Layer 6" success message.
- **Calls:** none.
- **Notes:** Stub.

#### `onSendCancellationEmail(row): void`
- **Purpose:** Send a cancellation email for a job-vendor (SRS §15.3/§23.4).
- **Behavior:**
  - Reads `jobVendorKey`; returns if missing or user declines `confirm()`.
  - Sets `isSubmitting`, clears messages; calls `sendCancellationEmail(jvKey)`.
  - Success → success message and `refreshGrids`; else error message. Resets submitting.
- **Calls:** `AssignVendorService.sendCancellationEmail`; `refreshGrids`, `clearMessages`.
- **Notes:** Uses native `confirm`.

#### `cleanTradeHtml(raw: string): string` (private)
- **Purpose:** Strip legacy HTML/"Show More" button markup from a trade-list string.
- **Behavior:**
  - Inlines `<button value="...">` content (reconstructs truncated trade names).
  - Decodes common HTML entities; strips remaining tags.
  - Converts newline-separated `and`/`or` connectors and remaining newlines to commas.
  - Collapses repeated commas, trims leading/trailing commas.
- **Calls:** none.
- **Notes:** Deliberately does not touch `and`/`or` inside a trade name.

#### `splitTradeList(raw: string): string[]` (private)
- **Purpose:** Split a cleaned comma-separated trade list, respecting parentheses.
- **Behavior:**
  - Cleans via `cleanTradeHtml`, iterates chars tracking paren depth, splits on top-level commas only.
  - Skips bare `and`/`or` connector tokens.
- **Calls:** `cleanTradeHtml`.

#### `onViewTrade(row): void`
- **Purpose:** Open the trade-list modal for a vendor row.
- **Behavior:** Splits `row.tradeList` via `splitTradeList`; sets `tradeModalTrades`, `tradeModalVendorName`; opens `showTradeModal`.
- **Calls:** `splitTradeList`.

#### `onShowVendorRates(row): void`
- **Purpose:** Open the vendor-rates modal and load rate data.
- **Behavior:** Returns if no vendorKey; sets `ratesVendorName`, clears `ratesData`, `ratesLoading=true`, opens `showRatesModal`; calls `getVendorRates(vendorKey)` → sets `ratesData` on success; clears loading.
- **Calls:** `AssignVendorService.getVendorRates`.

#### `onShowVendorPacket(row): void`
- **Purpose:** Open the registered-vendor-packet modal and load packet data.
- **Behavior:** Returns if no vendorKey; sets `packetVendorName` (from `vendorName`/`vname`), `packetVendorKey`, clears `packetData`, `packetLoading=true`, opens `showPacketModal`; calls `getRegisteredVendorPacket(vendorKey)` → sets `packetData` on success; clears loading.
- **Calls:** `AssignVendorService.getRegisteredVendorPacket`.

#### `onSetVendorAsDefault(row): void`
- **Purpose:** Set an assigned vendor as the job's default vendor.
- **Behavior:**
  - Casts row; reads jobVendorKey/vendorKey/vendorName; errors if key info or jobKey missing.
  - Sets `setDefaultVendorSaving=jobVendorKey`, clears messages; calls `setVendorAsDefault({jobKey, jobVendorKey, vendorKey, keepOtherVendors:true})` with `finalize` clearing the saving flag.
  - Success → success message, sets `selectedVendorDetailKey`, reloads assigned vendors and job header detail; else error message.
  - Error path shows generic error.
- **Calls:** `AssignVendorService.setVendorAsDefault`, `AssignVendorService.loadAssignedVendors`, `AssignVendorService.loadJobHeaderDetail`.
- **Notes:** `keepOtherVendors:true` preserves other assigned vendors.

#### `isSetDefaultVendorSaving(jobVendorKey: string): boolean`
- **Purpose:** Whether a set-default request is in flight for a given job-vendor.
- **Behavior:** Returns `setDefaultVendorSaving() === jobVendorKey`.
- **Calls:** none.

#### `onReassignFromInactive(row): void`
- **Purpose:** Reassign a previously unassigned/deleted vendor back to the job (legacy AssignFromInactive).
- **Behavior:**
  - Reads jobVendorKey/vendorName; errors if jobVendorKey or jobKey missing.
  - Sets `isLoading`, clears messages; calls `checkForExistingVendor(jobKey)`.
  - If existing active vendors → populate assign-vendor modal signals and open `showAssignVendorModal` (two reset/no-reset options).
  - If none → directly `executeReassignFromInactive(jobKey, jobVendorKey, vendorName, true)` (reset).
  - Non-status/error → error message. Clears loading.
- **Calls:** `AssignVendorService.checkForExistingVendor`; `executeReassignFromInactive`.
- **Notes:** Two modal options map to legacy ReassignVendor (reset) vs ReassignVendorOnly (no reset).

## C. Reassign, unassign chain, pin, quick vendor, notes, status & DNE helpers

### Assign vendor (reassign from inactive)

#### `onAssignVendorWithReset(): void`
- **Purpose:** Handle the "Assign vendor and reset status and schedule date to new" button.
- **Behavior:**
  - Reads `jobKey()`, `assignVendorModalJobVendorKey()`, `assignVendorModalVendorName()`.
  - Guards: returns early if `jobKey` or `jobVendorKey` is falsy.
  - Sets `assignVendorModalProcessing` = true and `assignVendorModalMessage` to a "please wait" string.
  - Delegates to `executeReassignFromInactive(..., true)` (resetStatusAndSchedule = true).
- **Calls:** `executeReassignFromInactive`.
- **Notes:** Reset variant resets vendor status + schedule date to "new".

#### `onAssignVendorWithoutReset(): void`
- **Purpose:** Handle the "Assign vendor and don't reset" button.
- **Behavior:**
  - Same reads/guards/signal writes as the reset variant.
  - Delegates to `executeReassignFromInactive(..., false)` (resetStatusAndSchedule = false).
- **Calls:** `executeReassignFromInactive`.
- **Notes:** Preserves existing status/schedule.

#### `private executeReassignFromInactive(jobKey: string, jobVendorKey: string, vendorName: string, resetStatusAndSchedule: boolean): void`
- **Purpose:** Perform the reassign-from-inactive API call and update UI on result.
- **Behavior:**
  - Calls `AssignVendorService.reassignVendorFromInactive` with a request built by `buildReassignFromInactiveRequest` (restorePreviousState: false, plus resetStatusAndSchedule).
  - On success (`res.status`): clears `assignVendorModalProcessing`, hides `showAssignVendorModal`, clears `isLoading`; sets `successMessage` (from `res.message` or a variant message depending on resetStatusAndSchedule) and reloads assigned vendors.
  - On non-status response: sets `errorMessage`.
  - On error: clears processing/modal/loading and sets a generic error message.
- **Calls:** `AssignVendorService.reassignVendorFromInactive`, `AssignVendorService.loadAssignedVendors`, `buildReassignFromInactiveRequest`.
- **Notes:** Uses `takeUntil(destroy$)`.

### Unassign vendor chain (RemoveVendorProcess1 replication)

#### `onUnassignVendor(row: Record<string, unknown>): void`
- **Purpose:** Entry point for the unassign-vendor flow.
- **Behavior:**
  - Extracts `jobVendorKey`, `vendorName` from row; reads `jobKey()`. Guards: sets errorMessage and returns if either key missing.
  - Resets all unassign-related signals (jobKey, jobVendorKey, vendorName, processing=true, message, insufficient flags/reason, sendCancellationEmail, requiresEstimateHandling, emailComment, selectedNewDefault) and clears success/error messages.
  - Step 1: calls `checkIfVendorBillExist`; if a bill exists (result === 1) shows `showUnassignBillExistsModal`; otherwise proceeds to `checkPendingApprovalForUnassign`.
  - On error: clears processing, sets errorMessage.
- **Calls:** `AssignVendorService.checkIfVendorBillExist`, `checkPendingApprovalForUnassign`.
- **Notes:** Multi-step legacy flow: bill → pending approval → vendor count → default check → confirm.

#### `onUnassignBillExistsCancel(): void`
- **Purpose:** Cancel from the bill-exists modal.
- **Behavior:** Hides `showUnassignBillExistsModal`, clears `unassignProcessing`.

#### `onUnassignBillExistsProceed(): void`
- **Purpose:** "Remove and Delete" — proceed despite existing bill.
- **Behavior:** Hides bill modal, sets processing=true, continues to `checkPendingApprovalForUnassign`.
- **Calls:** `checkPendingApprovalForUnassign`.

#### `private checkPendingApprovalForUnassign(): void`
- **Purpose:** Check for pending estimate approvals before removal.
- **Behavior:**
  - Calls `checkIfThereIsAnyPendingApproval(jobVendorKey)`.
  - If result is 1 or 2: sets `unassignEstimateType`, clears processing, shows `showUnassignEstimateModal`.
  - Else proceeds to `checkVendorCountForUnassign`.
  - Non-status/error paths clear processing and set errorMessage.
- **Calls:** `AssignVendorService.checkIfThereIsAnyPendingApproval`, `checkVendorCountForUnassign`.

#### `onUnassignEstimateNotNow(): void`
- **Purpose:** Cancel unassign from the estimate modal.
- **Behavior:** Hides estimate modal, clears processing.

#### `onUnassignEstimateYes(): void`
- **Purpose:** Proceed after acknowledging pending estimate (set to NOT APPROVED).
- **Behavior:** Hides estimate modal, sets `unassignRequiresEstimateHandling` = true, shows `showUnassignConfirmModal`.

#### `private checkVendorCountForUnassign(): void`
- **Purpose:** Determine flow branch by number of assigned vendors.
- **Behavior:**
  - Calls `checkForMoreThan1Vendor(jobKey)`.
  - If count ≤ 2: clears processing, shows simple `showUnassignConfirmModal`.
  - If > 2: proceeds to `checkIfDefaultVendorForUnassign`.
  - Non-status/error clear processing and set errorMessage.
- **Calls:** `AssignVendorService.checkForMoreThan1Vendor`, `checkIfDefaultVendorForUnassign`.

#### `private checkIfDefaultVendorForUnassign(): void`
- **Purpose:** Check whether the removed vendor is the default vendor.
- **Behavior:**
  - Calls `checkIfThisIsTheDefaultVendor(jobVendorKey)`.
  - If default (result === 1): calls `loadVendorsForNewDefault`.
  - Else: clears processing, shows `showUnassignConfirmModal`.
  - Non-status/error clear processing and set errorMessage.
- **Calls:** `AssignVendorService.checkIfThisIsTheDefaultVendor`, `loadVendorsForNewDefault`.

#### `private loadVendorsForNewDefault(): void`
- **Purpose:** Load candidate vendors for promoting a new default.
- **Behavior:**
  - Calls `getVendorsExceptDefault(jobKey)`; clears processing.
  - On success: sets `unassignNewDefaultOptions`, clears `unassignSelectedNewDefault`, shows `showUnassignSelectDefaultModal`.
  - On non-status/error: sets errorMessage.
- **Calls:** `AssignVendorService.getVendorsExceptDefault`.

#### `onUnassignConfirmNo(): void`
- **Purpose:** Cancel the delete confirmation.
- **Behavior:** Hides confirm modal, clears `unassignRequiresEstimateHandling`, clears processing.

#### `onUnassignConfirmYes(): void`
- **Purpose:** Confirm removal.
- **Behavior:** Hides confirm modal, sets processing=true. If `unassignRequiresEstimateHandling()` is true, resets that flag and calls `handleEstimateThenFinalize`; otherwise calls `finalizeUnassign`.
- **Calls:** `handleEstimateThenFinalize`, `finalizeUnassign`.

#### `onUnassignSelectDefaultClose(): void`
- **Purpose:** Cancel the select-new-default modal.
- **Behavior:** Hides select-default modal, clears processing.

#### `onUnassignSelectDefaultSave(): void`
- **Purpose:** Promote a new default while removing the current default vendor.
- **Behavior:**
  - Guards: if no `unassignSelectedNewDefault`, sets `unassignMessage` and returns.
  - Hides modal, sets processing, clears message; reads jobKey, jobVendorKey, adminKey (from `authTokenSvc.getAdminKeyFromToken`), comment, insufficient flag, reason.
  - Calls `unassignDefaultVendorAndPromote({...})`; via `switchMap` optionally saves a note (`saveUnassignNote`) if the call succeeded and a comment exists.
  - `finalize`: clears processing, refreshes vendors, invokes `lastVendorListLoader`.
  - On success: `completeUnassignSuccess(false)`; if note save failed, sets errorMessage. On failure/error: sets errorMessage.
- **Calls:** `AssignVendorService.unassignDefaultVendorAndPromote`, `saveUnassignNote`, `completeUnassignSuccess`, `refreshAssignedVendors`, `authTokenSvc.getAdminKeyFromToken`.
- **Notes:** insufficient = 1 or null; reason nullable.

#### `private finalizeUnassign(): void`
- **Purpose:** Remove vendor (with or without cancellation email) and optionally save a note.
- **Behavior:**
  - Reads jobKey, jobVendorKey, adminKey, comment, sendEmail, insufficient, reason.
  - Chooses `unassignVendorWithEmail` when sendEmail true, else `unassignVendor`.
  - `switchMap`: on success with comment, saves note; else passes through.
  - `finalize`: clears processing, refreshes vendors, invokes `lastVendorListLoader`.
  - On success: `completeUnassignSuccess(sendEmail)`; note-save failure sets errorMessage. On failure/error: sets errorMessage (email-aware wording).
- **Calls:** `AssignVendorService.unassignVendorWithEmail`/`unassignVendor`, `saveUnassignNote`, `completeUnassignSuccess`, `refreshAssignedVendors`.

#### `private handleEstimateThenFinalize(): void`
- **Purpose:** Pending-estimate path — set estimate NOT APPROVED + unassign, then email/note.
- **Behavior:**
  - Calls `handleEstimateAndUnassign({jobKey, jobVendorKey, adminKey, setEstimateToNotApproved: true})`.
  - `switchMap`: if failed, phase 'failed'; else runs `finalizeUnassignPostRemoval$()` and marks phase 'done'.
  - `finalize`: clears processing, refreshes vendors, invokes `lastVendorListLoader`.
  - On next: handles 'failed', emailFailed, note-failure cases with errorMessage; success calls `completeUnassignSuccess`.
- **Calls:** `AssignVendorService.handleEstimateAndUnassign`, `finalizeUnassignPostRemoval$`, `completeUnassignSuccess`, `refreshAssignedVendors`.

#### `private finalizeUnassignPostRemoval$(): Observable<{emailRes; emailFailed; noteRes}>`
- **Purpose:** Post-removal email + note handling for the estimate path.
- **Behavior:**
  - Reads jobKey, jobVendorKey, adminKey, comment, sendEmail.
  - If sendEmail: calls `unassignVendorWithEmail`; on failure returns emailFailed=true; on success saves note if comment present.
  - If only comment: saves note via `saveUnassignNote`.
  - Else returns a no-op observable.
- **Calls:** `AssignVendorService.unassignVendorWithEmail`, `saveUnassignNote`.
- **Notes:** Returns structured result object rather than mutating state.

#### `private saveUnassignNote(comment: string): Observable<{status; message?}>`
- **Purpose:** Persist a general admin note recording vendor removal.
- **Behavior:** Calls `saveGeneralAdminNote({jobKey, title: "Vendor removed — <name>", comment})`.
- **Calls:** `AssignVendorService.saveGeneralAdminNote`.

#### `private completeUnassignSuccess(sentEmail: boolean): void`
- **Purpose:** Set the success toast text after unassign.
- **Behavior:** Sets `successMessage` to a removed-with-email or removed message using `unassignVendorName()`.

#### `private refreshAssignedVendors(): void`
- **Purpose:** Reload assigned-vendors grid and job header detail (DNE fields) after unassign.
- **Behavior:**
  - Guards on jobKey.
  - Uses a `timer(500)` delay (to let backend settle), then `loadAssignedVendors`, then `loadJobHeaderDetail`, logging DNE fields.
- **Calls:** `AssignVendorService.loadAssignedVendors`, `AssignVendorService.loadJobHeaderDetail`.
- **Notes:** Debug console logging throughout.

### Pin / Unpin (WF-5)

#### `onOpenPinModal(row: Record<string, unknown>, noMaybe: string): void`
- **Purpose:** Open the pin modal pre-populated for a vendor row.
- **Behavior:** Patches `pinForm` (vendorKey, vendorName from vendorName/vname, noMaybe, empty notes); shows `showPinModal`.

#### `onSubmitPin(): void`
- **Purpose:** Submit a pin (add-pinned-vendor) and reload the vendor grid.
- **Behavior:**
  - Guards: returns if `pinForm.invalid`; sets errorMessage and returns if no jobKey.
  - Builds request {jobKey, vendorKey, no: pinChoice ('No' default), notes|null}; calls `addPinnedVendor`.
  - On success: updates `pinnedNoMaybeCache` keyed by lowercased vendorKey and `name:<vendorName>`; sets successMessage; invokes `lastVendorListLoader?.()`.
  - On failure: sets errorMessage. Always hides `showPinModal`.
- **Calls:** `AssignVendorService.addPinnedVendor`, `lastVendorListLoader`.

#### `onViewPinnedNote(row: Record<string, unknown>): void`
- **Purpose:** Show a modal displaying the note captured when a vendor was pinned (Maybe/No reason).
- **Behavior:**
  - Extracts vendorName, noMaybe, specialNotes.
  - Cleans specialNotes: strips HTML tags, removes leading "Maybe"/"No" prefix; nulls if empty.
  - Sets `showPinNoteModal` object {vendorName, noMaybe|'N/A', notes|'No note provided'}.

#### `onUnpinVendor(row: Record<string, unknown>): void`
- **Purpose:** Unpin a single vendor.
- **Behavior:**
  - Extracts `pinKey`, reads jobKey; guards on both.
  - Calls `unpinVendor(pinKey, key)`; on success sets successMessage and invokes `lastVendorListLoader`; on failure sets errorMessage.
- **Calls:** `AssignVendorService.unpinVendor`, `lastVendorListLoader`.

#### `onUnpinAll(): void`
- **Purpose:** Unpin all vendors for the job.
- **Behavior:** Guards on jobKey; calls `unpinAllVendors(key)`; on success sets successMessage and reloads list via `lastVendorListLoader`; on failure sets errorMessage.
- **Calls:** `AssignVendorService.unpinAllVendors`, `lastVendorListLoader`.

### Quick vendor creation (WF-8)

#### `onOpenQuickVendor(): void`
- **Purpose:** Open and reset the quick vendor modal.
- **Behavior:** Resets `quickVendorForm` to defaults; clears `showDuplicateWarning` and `duplicateResult`; shows `showQuickVendorModal`.

#### `onCloseQuickVendor(): void`
- **Purpose:** Close the quick vendor modal.
- **Behavior:** Hides `showQuickVendorModal`.

#### `onSubmitQuickVendor(skipDuplicateCheck = false): void`
- **Purpose:** Submit quick vendor with optional duplicate check.
- **Behavior:** Marks form touched; guards on invalid. If not skipping, calls `checkDuplicateBeforeSave`; otherwise `saveQuickVendor`.
- **Calls:** `checkDuplicateBeforeSave`, `saveQuickVendor`.

#### `private checkDuplicateBeforeSave(values: Record<string, unknown>): void`
- **Purpose:** SRS §20.4 duplicate check before save.
- **Behavior:** Builds `CheckDuplicateVendorRequest` {name, email, phone}; sets `isSubmitting`; calls `checkDuplicateVendor`. If flag === 1, sets `duplicateResult` + shows `showDuplicateWarning`; else calls `saveQuickVendor`.
- **Calls:** `AssignVendorService.checkDuplicateVendor`, `saveQuickVendor`.

#### `private saveQuickVendor(values: Record<string, unknown>): void`
- **Purpose:** SRS §20.5 create the vendor.
- **Behavior:**
  - Hides duplicate warning, sets `isSubmitting`, clears messages via `clearMessages`.
  - Builds `QuickVendorRequest` from form values (company/contact info, address, rates, insurance flags wcom/genL, accounting contact).
  - Calls `saveQuickVendor`. On success (flag === 1): hides modal, sets successMessage; if jobKey present, refreshes `getActiveVendorsDropdown`, sets `vendorDropdown`, and after a 100ms `setTimeout` sets the new vendorKey on `vendorForm` and calls `onVendorSelected`; if no jobKey but a new key, sets vendorKey and calls `onVendorSelected`.
  - On error details: `handleApiError(res, quickVendorForm)`; else sets errorMessage.
- **Calls:** `AssignVendorService.saveQuickVendor`, `AssignVendorService.getActiveVendorsDropdown`, `clearMessages`, `handleApiError`, `onVendorSelected`.

### Vendor notes (WF-9)

#### `formatVendorNoteAddedOn(addedOn: string | null | undefined): string`
- **Purpose:** Format a note's addedOn timestamp for the Vendor Notes modal table only.
- **Behavior:** Returns '' for null/empty; parses Date; on invalid date returns original string; else returns a localized month/day/year hour:minute (12h) string.
- **Notes:** Display-only; does not mutate model/API data.

#### `onOpenNotesActivityModal(row: Record<string, unknown>): void`
- **Purpose:** Open full Notes & Activity UI in a modal with the row's vendor pre-selected.
- **Behavior:** Extracts trimmed vendorKey; guards on empty; sets `notesActivityModalVendorKey`; shows `showNotesActivityModal`.

#### `onNavigateToNotesActivity(options?: {tab?; vendorKey?; email?}): void`
- **Purpose:** Navigate to the Notes & Activity route with optional query params.
- **Behavior:** Guards on jobKey; builds queryParams (tab, vendorKey, email if present); `router.navigate(['/job', jobKey, 'notes-activity'], {queryParams})`.
- **Calls:** `router.navigate`.

#### `onOpenNotesForCustomerEmail(email: string): void`
- **Purpose:** Navigate to Notes & Activity customer tab for an email.
- **Behavior:** Calls `onNavigateToNotesActivity({tab: 'customer', email})`.

#### `onOpenNotesForLocationEmail(email: string): void`
- **Purpose:** Navigate to Notes & Activity "all" tab for a location email.
- **Behavior:** Calls `onNavigateToNotesActivity({tab: 'all', email})`.

#### `onOpenNotesForVendorEmail(vendorKey: string, email?: string | null): void`
- **Purpose:** Navigate to Notes & Activity vendor tab for a vendor/email.
- **Behavior:** Calls `onNavigateToNotesActivity({tab: 'vendor', vendorKey, email})`.

#### `onCloseNotesActivityModal(): void`
- **Purpose:** Close the Notes & Activity modal.
- **Behavior:** Hides modal, clears `notesActivityModalVendorKey`.

#### `onOpenNotes(vendorKey: string): void`
- **Purpose:** Open the (legacy) notes modal and load existing notes.
- **Behavior:** Guards on vendorKey (errorMessage if missing); logs; sets `notesVendorKey`; clears `vendorNotes`, `noteMessage`, `notesSearchTerm`; resets `vendorNoteForm` (newNote=1); shows `showNotesModal`; calls `loadNotesForVendor`.
- **Calls:** `loadNotesForVendor`.

#### `private loadNotesForVendor(vendorKey: string): void`
- **Purpose:** Fetch the notes list from the API.
- **Behavior:** Sets `notesLoading`, sets loading message; calls `loadVendorNotes`; on success sets `vendorNotes`; else sets `noteMessage`. Clears loading.
- **Calls:** `AssignVendorService.loadVendorNotes`.

#### `private loadNoteTooltip(row: Record<string, unknown>): void`
- **Purpose:** Lazy-load the latest note comment as a hover tooltip, cached on the row.
- **Behavior:** Returns if `_noteTooltip` already set; guards on vendorKey; sets 'Loading...'; calls `loadVendorNotes`; sets `_noteTooltip` to plaintext latest comment (truncated to 200 chars) or 'No notes'; error sets 'Failed to load'.
- **Calls:** `AssignVendorService.loadVendorNotes`.
- **Notes:** Mutates the row object as a cache.

#### `private invalidateNoteTooltipCache(vendorKey: string): void`
- **Purpose:** Clear the cached tooltip so it re-fetches next hover.
- **Behavior:** Iterates locationHistoryVendors, pinnedVendors, defaultVendors, searchResults; deletes `_noteTooltip` on the matching row.

#### `private buildVendorLoginUrl(row: Record<string, unknown>): string`
- **Purpose:** Build the "Vendor login" impersonation URL for the Contact column.
- **Behavior:** Reads contactKey and admin key; returns `{vendorPortalBaseUrl}/VendorLogin/LoginByRCSadmin/{contactKey}?adminKey={adminKey}`.
- **Calls:** `authTokenSvc.getAdminKeyFromToken`.

#### `private cleanAddress(address: string): string`
- **Purpose:** Normalize an address string (collapse commas/whitespace).
- **Behavior:** Regex-based cleanup: collapse multiple commas, strip leading/trailing commas, normalize whitespace, trim.

#### `onCloseNotes(): void`
- **Purpose:** Close notes modal and clear state.
- **Behavior:** Hides modal; clears `notesVendorKey`, `vendorNotes`, `noteMessage`, `notesSearchTerm`; resets `vendorNoteForm`.

#### `onEditNote(note: VendorNoteItem): void`
- **Purpose:** Populate the note form from an existing note for editing.
- **Behavior:** Patches `vendorNoteForm` (noteKey, noteTitle, notesDetail, newNote=0); clears `noteMessage`.

### Vendor card helpers

#### `vcStatusColor(status: string | null): string`
- **Purpose:** Map a job-status label to a color token for the status badge.
- **Behavior:** Returns 'blue' if null; lowercases; 'amber' for estimate/invoice/pending payment; 'green' for on-site/complete/done/closed; 'red' for cancel/fail/reject; else 'blue'.

#### `getVendorJobStatusLabel(vendor: AssignedVendorDetail): string`
- **Purpose:** Resolve vendor status text from `jobStatusList` (same source as FINANCIAL STATUS dropdown).
- **Behavior:** Matches `vendor.jobStatusKey` against `jobStatusList()` by `normalizeSelectKey`; returns matched text or falls back to `vendor.jobStatusName`.
- **Calls:** `normalizeSelectKey`.

#### `vendorJobStatusOptions(vendor: AssignedVendorDetail): JobStatusOption[]`
- **Purpose:** FINANCIAL STATUS dropdown options, injecting the vendor's current status if absent.
- **Behavior:** Returns full list; if the vendor's key/label exist and are missing from the list, prepends `{value, text}`.
- **Calls:** `getVendorJobStatusLabel`, `normalizeSelectKey`.

#### `vendorJobStatusSelectKey(vendor: AssignedVendorDetail): string`
- **Purpose:** Normalized select key for the vendor's job status.
- **Behavior:** Returns `normalizeSelectKey(vendor.jobStatusKey)`.

#### `vendorFinancialStatusOptions(currentStatus: string | null): string[]`
- **Purpose:** Frontend-only vendor financial status options sourced from loaded vendor data.
- **Behavior:** Builds a Set from currentStatus plus each assigned vendor's `jobStatusName`; returns array.

#### `getVendorFinancialStatus(vendorKey: string, currentStatus: string | null): string`
- **Purpose:** Current frontend status selection for a vendor card.
- **Behavior:** Returns `selectedVendorFinancialStatuses()[vendorKey]` or currentStatus or ''.

#### `setVendorFinancialStatus(vendorKey: string, value: string): void`
- **Purpose:** Update the frontend-only status dropdown selection.
- **Behavior:** Updates `selectedVendorFinancialStatuses` signal map.

### DNE helpers

#### `isEmergencyJobType(jobTypeKey: string | null | undefined): boolean`
- **Purpose:** True when job priority is Emergency (legacy SetTheEmergencyDNE).
- **Behavior:** Compares normalized key to `EMERGENCY_JOB_TYPE_KEY`.
- **Calls:** `normalizeSelectKey`.

#### `isBidOrProjectJobType(jobTypeKey: string | null | undefined): boolean`
- **Purpose:** True for Bid or Project job types.
- **Behavior:** Compares normalized key to `BID_JOB_TYPE_KEY` / `PROJECT_JOB_TYPE_KEY`.
- **Calls:** `normalizeSelectKey`.

#### `private getExpectedNteForPriority(hd: JobHeaderDetail): { customer: number; vendor: number }`
- **Purpose:** Expected job-level NTE from priority + customer profile (mirrors Job Ops UpdateJobJobType).
- **Behavior:** Computes emergency/bid-or-project flags; reads standard/emergency profile customer and vendor DNE; picks customer by emergency; vendor = 0 for bid/project, emergency vendor if emergency, else standard.
- **Calls:** `isEmergencyJobType`, `isBidOrProjectJobType`, `getProfileCustomerDne`, `getProfileVendorDne`.

#### `private loadCustomerProfileDne(customerKey: string): void`
- **Purpose:** Load DNE from the customer profile (legacy JobOpsCustomerDneLoad).
- **Behavior:** Calls `getCustomerProfileDne`; sets `customerProfileDne`; if a header detail exists, calls `syncNteDisplay`.
- **Calls:** `AssignVendorService.getCustomerProfileDne`, `syncNteDisplay`.

#### `private isJobDneFieldSet(value: string | null | undefined): boolean`
- **Purpose:** Whether job DNE was explicitly set at creation.
- **Behavior:** False if null/blank; treats "0" as unset (returns false); else true.
- **Calls:** `vendorDneNumber`.
- **Notes:** Legacy stores "0" for blank DNE — treated as unset so customer profile is used.

#### `private resolveDefaultCustomerNte(hd: JobHeaderDetail, profileFallback: number): number`
- **Purpose:** Job.CustomerDne only, with profile fallback; never RevCustomerDne.
- **Behavior:** Returns numeric `hd.customerDne` if set, else `profileFallback`.
- **Calls:** `isJobDneFieldSet`, `vendorDneNumber`.

#### `private resolveRevisedCustomerNte(hd: JobHeaderDetail, defaultCustomerNte: number): number`
- **Purpose:** Job.RevCustomerDne when set; else defaults to customer NTE.
- **Behavior:** Returns numeric `hd.revCustomerDne` if set, else `defaultCustomerNte`.
- **Calls:** `isJobDneFieldSet`, `vendorDneNumber`.

#### `private isVendorRowDneSet(value: number | null | undefined): boolean`
- **Purpose:** Whether a vendor-row DNE is set.
- **Behavior:** True when value != null and != 0.

#### `private resolveDefaultVendorNte(dv, hd: JobHeaderDetail, profileFallback: number): number`
- **Purpose:** JobVendor.VendorDne (original) with job then profile fallback; never RevVendorDne.
- **Behavior:** Returns vendor row `vendorDne` if set; else job `vendorDne` if set; else profileFallback.
- **Calls:** `isVendorRowDneSet`, `isJobDneFieldSet`, `vendorDneNumber`.

#### `private resolveRevisedVendorNte(dv, hd: JobHeaderDetail, defaultVendorNte: number): number`
- **Purpose:** JobVendor.RevVendorDne when set; else job RevVendorDne; else default.
- **Behavior:** Returns vendor row `revVendorDne` if set; else job `revVendorDne` if set; else defaultVendorNte.
- **Calls:** `isVendorRowDneSet`, `isJobDneFieldSet`, `vendorDneNumber`.

#### `private getProfileCustomerDne(hd: JobHeaderDetail, isEmergency: boolean): number`
- **Purpose:** Customer profile DNE (standard or emergency).
- **Behavior:** Uses `customerProfileDne()` values, falling back to header `customerProfile*` fields; returns emergency or standard.
- **Calls:** `vendorDneNumber`.

#### `private getProfileVendorDne(hd: JobHeaderDetail, isEmergency: boolean): number`
- **Purpose:** Vendor profile DNE (standard or emergency).
- **Behavior:** Uses `customerProfileDne()` vendor values, falling back to header fields; returns emergency or standard.
- **Calls:** `vendorDneNumber`.

#### `private syncNteDisplay(hd: JobHeaderDetail): void`
- **Purpose:** Populate the Job Details NTE panel signals.
- **Behavior:**
  - Logs debug info; computes expected NTE and bid/project flag.
  - Customer NTE from `resolveDefaultCustomerNte`/`resolveRevisedCustomerNte`.
  - Finds default vendor (isDefault or first); for bid/project vendor NTE = 0; else uses `resolveDefaultVendorNte`/`resolveRevisedVendorNte`.
  - Sets `nteCustomer`, `nteRevCustomer`, `nteVendor`, `nteRevVendor` (as strings).
- **Calls:** `getExpectedNteForPriority`, `isBidOrProjectJobType`, `resolveDefaultCustomerNte`, `resolveRevisedCustomerNte`, `resolveDefaultVendorNte`, `resolveRevisedVendorNte`.
- **Notes:** Customer NTE never uses RevCustomerDne (preserves pre-approval value).

#### `getVendorCardVendorDne(vendorDne: number | null, revVendorDne: number | null): number`
- **Purpose:** Vendor card FINANCIAL DNE — per-vendor original VendorDne only.
- **Behavior:** Returns vendor row `vendorDne` if set, else `nteVendor()` numeric.
- **Calls:** `isVendorRowDneSet`, `vendorDneNumber`.

#### `getVendorCardRevVendorDne(vendorDne: number | null, revVendorDne: number | null): number`
- **Purpose:** Vendor card Revised DNE.
- **Behavior:** Returns revVendorDne if set; else vendorDne if set; else `nteRevVendor()` numeric.
- **Calls:** `isVendorRowDneSet`, `vendorDneNumber`.

#### `vendorDneNumber(value: number | string | null | undefined): number`
- **Purpose:** Normalize a DNE value to a number (legacy defaults to 0).
- **Behavior:** 0 for null/undefined; finite numbers pass; strings parsed, non-finite → 0.

#### `private resolveVendorDneForDisplay(vendorValue, jobValue): number`
- **Purpose:** Choose vendor value if present else job value.
- **Behavior:** Returns `vendorValue` if not null, else `vendorDneNumber(jobValue)`.
- **Calls:** `vendorDneNumber`.

#### `getVendorFinancialDne(vendorKey: string, vendorDne: number | null, revVendorDne: number | null): string`
- **Purpose:** Editable Vendor DNE string shown in the Vendors accordion.
- **Behavior:** Returns local edited value from `selectedVendorFinancialDnes()` if present; else uses vendorDne (if set) or revVendorDne as string.
- **Calls:** `isVendorRowDneSet`, `vendorDneNumber`.

#### `getVendorFinancialDneNumber(vendorKey: string, vendorDne: number | null, revVendorDne: number | null): number`
- **Purpose:** Numeric DNE currently displayed for Revised Vendor DNE.
- **Behavior:** Trims `getVendorFinancialDne`; falls back to revVendorDne (if set) or vendorDne; returns numeric.
- **Calls:** `getVendorFinancialDne`, `isVendorRowDneSet`, `vendorDneNumber`.

#### `setVendorFinancialDne(vendorKey: string, value: string): void`
- **Purpose:** Update the frontend-only Vendor DNE input.
- **Behavior:** Updates `selectedVendorFinancialDnes` signal map.

#### `isVendorDneSaving(jobVendorKey: string): boolean`
- **Purpose:** Whether a Vendor DNE save is in progress for a jobVendorKey.
- **Behavior:** Returns `vendorDneSaving()[jobVendorKey] === true`.
- **Notes:** The next method (`saveVendorFinancialDne`, "Saves the edited Vendor DNE...") begins at line 4699, past the 4700 boundary, so it is not documented here.

## D. Vendor DNE/schedule save, ETA & login email, priority/trade/SRI, NTE & on-site approval

Documented in source order.

---

#### `onSaveVendorDne(vendor: { jobVendorKey; vendorKey; vendorDne; revVendorDne }): void`
- **Purpose:** Persist an edited per-vendor DNE value from a vendor card.
- **Behavior:**
  - Reads the draft via `getVendorFinancialDne`, `parseFloat`s it; if blank or non-finite sets `errorMessage` and returns (validation guard).
  - Flips `vendorDneSaving[jobVendorKey]` true (cleared in `finalize`).
  - On success updates `jobHeaderDetail` so the matched assigned vendor's `vendorDne` and `revVendorDne` both equal `parsed`, then calls `syncNteDisplay`.
  - Clears the draft entry in `selectedVendorFinancialDnes` so the input shows the saved value; sets a transient `successMessage` (3s).
  - Non-success sets `errorMessage`; error branch sets error toast.
- **Calls:** `AssignVendorService.updateVendorDne`; `getVendorFinancialDne`, `syncNteDisplay`.
- **Notes:** Writes both current and revised DNE to keep them in sync after a manual save.

#### `syncVendorScheduleDrafts(vendors): void` (private)
- **Purpose:** Seed the schedule draft map from server vendor data.
- **Behavior:** For each vendor builds `{ scheduleDate, returnScheduleDate }` preferring the ISO field (`toDateTimeLocalValue`) and falling back to parsing the display string (`parseDisplayScheduleToLocalValue`); sets `vendorScheduleDrafts`.
- **Calls:** `toDateTimeLocalValue`, `parseDisplayScheduleToLocalValue`.

#### `toDateTimeLocalValue(rawIso: string | null): string` (private)
- **Purpose:** Convert a backend schedule ISO into an `<input type=datetime-local>` value.
- **Behavior:**
  - Empty → `''`. If already `yyyy-MM-ddTHH:mm`, returns as-is (API returns wall-clock at service location, not UTC).
  - Legacy payloads with `Z`/offset: builds a `Date` (appending `Z` if none), returns `''` on invalid, else formats to local `YYYY-MM-DDTHH:mm`.
- **Notes:** Comment flags that instant→location display isn't available here, so falls back to browser-local interpretation.

#### `parseDisplayScheduleToLocalValue(displayValue: string | null): string` (private)
- **Purpose:** Parse backend display strings into `YYYY-MM-DDTHH:mm`.
- **Behavior:** Prefers the "M/D/YYYY at h:mm AM/PM" (service-location) form, else the plain "M/D/YYYY h:mm AM/PM" form; converts 12h→24h (12 AM→0, PM+12); returns `''` if no match.
- **Notes:** Handles the "(Pacific) ... EST" dual-timezone display by preferring the local "at" time.

#### `toScheduleLocalIsoString(value: string): string | null` (private)
- **Purpose:** Validate a datetime-local value for send to API as location wall time.
- **Behavior:** Returns trimmed value if it matches `yyyy-MM-ddTHH:mm`, else `null` (empty → null).
- **Notes:** Backend converts to UTC using job service-location time zone (legacy parity).

#### `buildScheduleFieldPayload(vendor, draftValue, savedIso, canEdit): string | null` (private)
- **Purpose:** Compute the schedule field payload where `null` = omit/unchanged, `''` = clear, value = set/update.
- **Behavior:**
  - `!canEdit` → null. Empty draft → `''` if there was a saved value else null.
  - Otherwise validates draft via `toScheduleLocalIsoString`; null if invalid or unchanged vs saved; else returns the ISO.
- **Notes:** Prevents re-sending an unchanged regular ETA when only the return ETA changed.

#### `static RETURN_SCHEDULE_EDIT_TRIGGER_BITS = Set([15,16,17,18,22])`
- Trigger bits where the return schedule may be edited (return-visit workflow).

#### `static SCHEDULE_DATE_LOCKED_TRIGGER_BITS = Set([4,17])`
- Trigger bits where vendor is on-site — schedule ETA cannot be edited.

#### `canEditScheduleDate(vendor: AssignedVendorDetail): boolean`
- **Purpose:** Whether the ETA field is editable.
- **Behavior:** false if `isCheckedIn`; else true unless `triggerBit` is in `SCHEDULE_DATE_LOCKED_TRIGGER_BITS`.
- **Notes:** Legacy: ETA locked after check-in (must check out or use on-site approval).

#### `canEditReturnScheduleDate(vendor: AssignedVendorDetail): boolean`
- **Purpose:** Whether the return schedule field is editable.
- **Behavior:** true if `triggerBit` in `RETURN_SCHEDULE_EDIT_TRIGGER_BITS`; also true if bit === 8 and `hasApprovedEstimate === true`.
- **Notes:** Editable only after Pending Return ETA or later.

#### `getVendorScheduleDraft(jobVendorKey, field, fallbackIso, fallbackDisplay): string`
- **Purpose:** Return the current draft or a computed fallback for a schedule field.
- **Behavior:** Returns the local draft if non-empty; else `toDateTimeLocalValue(fallbackIso)` or `parseDisplayScheduleToLocalValue(fallbackDisplay)`.

#### `setVendorScheduleDraft(jobVendorKey, field, value, vendor?): void`
- **Purpose:** Update a schedule draft, respecting edit permissions.
- **Behavior:** Returns early if the field is not editable for the vendor (`canEditScheduleDate` / `canEditReturnScheduleDate`); else merges the value into `vendorScheduleDrafts`.

#### `isVendorScheduleSaving(jobVendorKey: string): boolean`
- Returns whether `vendorScheduleSaving[jobVendorKey]` is true.

#### `vendorHasStatusAction(vendor, actionId): boolean`
- True when the vendor's `statusActions` contains the given `actionId` (e.g. `confirm_eta_manually`).

#### `resolveJobStatusFromTrigger(triggerBit: number): {jobStatusKey; jobStatusName; triggerBit} | null` (private)
- **Purpose:** Map a legacy trigger bit to a job status option for immediate UI update.
- **Behavior:** Uses regex patterns for bits 2/3/15/16 (pending eta / pending check-in / pending return eta / pending return check), finds a matching option in `jobStatusList`; null if no pattern or no match.

#### `applyVendorScheduleStatusUpdate(jobVendorKey, patch): void` (private)
- **Purpose:** Apply a vendor row + header status patch immediately after schedule save.
- **Behavior:** Delegates to `AssignVendorService.patchAssignedVendor`.

#### `scheduleSaveResultFromDataReturn(res): {status; message; vendorPatch}` (private)
- **Purpose:** Normalize a schedule-save response into status/message/vendor patch.
- **Behavior:**
  - If the data is a `SetEtaEmailPromptResponse` (has `vendorContacts`), returns success with `vendorPatch: null` (patch handled by save handler).
  - Otherwise builds a patch: copies `jobStatusKey/Name/triggerBit` if all present; else resolves status from `triggerBit` via `resolveJobStatusFromTrigger`; copies `statusActions`, `etaConfirmedByAdmin/Vendor`, `returnEtaConfirmedByAdmin/Vendor` when non-null.
  - Returns null patch if no keys accumulated.

#### `saveVendorSchedule(jobVendorKey: string, vendor?: AssignedVendorDetail): void`
- **Purpose:** Persist edited ETA / return-ETA schedule dates for a vendor.
- **Behavior:**
  - Reads the draft. Guards: if scheduleDate set but not editable → error toast/return; same for returnScheduleDate.
  - Builds both payloads via `buildScheduleFieldPayload`; if both null → "No schedule changes" and return.
  - Sets `vendorScheduleSaving` true, then calls the service; in the `switchMap` clears the saving flag.
  - First-time ETA (response has `vendorContacts`): opens the ETA email modal (`openEtaEmailModal`), still patches the vendor card ISO fields, returns EMPTY.
  - Regular update: maps result; on failure sets error; else patches ISO + mapped vendor patch, sets success message (with status name if available, 5s), then reloads header detail via `loadJobHeaderDetail`.
- **Calls:** `AssignVendorService.updateVendorScheduleDates`, `.loadJobHeaderDetail`; `buildScheduleFieldPayload`, `canEditScheduleDate`, `canEditReturnScheduleDate`, `openEtaEmailModal`, `applyVendorScheduleStatusUpdate`, `scheduleSaveResultFromDataReturn`.

---

### ETA SET EMAIL NOTIFICATION MODAL

#### `openEtaEmailModal(data: SetEtaEmailPromptResponse): void`
- **Purpose:** Open the ETA-set email modal with vendor contact data.
- **Behavior:** Sets `showEtaEmailModal`, seeds `etaEmailNote` from `defaultEmailNote`, resets custom email/sending/error; clears then pre-selects default contacts into `etaSelectedContacts`.

#### `isContactSelected(contactKey: string): boolean`
- Whether `etaSelectedContacts` has the key.

#### `onToggleContact(contactKey: string, event: Event): void`
- Adds/removes the contact key based on the checkbox `checked` state.

#### `onSendEtaEmail(): void`
- **Purpose:** Send the ETA-set email notification.
- **Behavior:**
  - Returns if no modal data. Validates at least one selected contact or a custom email; else sets `etaEmailError`.
  - Builds a `SendEtaSetEmailRequest` (jobVendorKey, trimmed note-or-null, selected keys-or-null, custom email-or-null); sets `etaSending`.
  - On success: success toast (5s), `onCloseEtaEmailModal`, refresh header detail. On failure/error sets `etaEmailError`, clears sending.
- **Calls:** `AssignVendorService.sendEtaSetNotification`, `.loadJobHeaderDetail`; `onCloseEtaEmailModal`.

#### `onSkipEtaEmail(): void`
- Sets "ETA saved. Email notification skipped." (5s), closes modal, refreshes header detail.

#### `onCloseEtaEmailModal(): void`
- Resets modal signal to null, clears error, note, custom email, and selected contacts.

---

### VENDOR LOGIN EMAIL MODAL

#### `openLoginEmailModal(vendor: {jobVendorKey; vendorKey; vendorName}): void`
- **Purpose:** Open the login-email modal and load the vendor's contacts.
- **Behavior:** Sets `loginEmailVendor`, resets selection/note, sets contacts-loading true; calls `getVendorContactList`, on result sets `loginEmailContacts` and pre-selects default contacts.
- **Calls:** `AssignVendorService.getVendorContactList`.

#### `closeLoginEmailModal(): void`
- Clears vendor, contacts, selection, and note signals.

#### `toggleLoginEmailContact(contactKey: string): void`
- Toggles a key in the `loginEmailSelected` set.

#### `isLoginContactSelected(contactKey: string): boolean`
- Whether the key is selected.

#### `sendLoginEmails(): void`
- **Purpose:** Send a login email to each selected contact.
- **Behavior:**
  - Guards on vendor and jobKey. Requires at least one selected contact (else error). Builds one `sendVendorLoginEmail` request per selected contact that has an email; if none → error and stop.
  - `forkJoin`s the requests; success toast "sent to N contact(s)" (4s) and closes modal; error toast on failure. Toggles `loginEmailSending` via `finalize`.
- **Calls:** `AssignVendorService.sendVendorLoginEmail`; `closeLoginEmailModal`.

---

### CUSTOMER REQUESTOR DROPDOWN

#### `onCustomerRequestorChange(newContactKey: string): void`
- **Purpose:** Persist a Customer Requestor dropdown change.
- **Behavior:**
  - Guards on jobKey. Resolves display name from options via `normalizeSelectKey`. Optimistically updates `jobHeaderDetail`.
  - Sets `customerRequestorSaving`; calls service. On non-success sets error and reloads via `loadInitialData`; on success shows toast (3s). Error branch reloads.
- **Calls:** `AssignVendorService.updateJobCustomerRequestor`; `normalizeSelectKey`, `loadInitialData`.

#### `normalizeSelectKey(value: string | null | undefined): string`
- Returns trimmed lowercased value (for reliable native-select GUID matching).

#### `resolveCustomerRequestorKey(hd, opts): string | null` (private)
- Returns normalized `customerRequestorKey` if present; else matches by name against options; null if none.

#### `applyCustomerRequestorOptions(opts, hd, syncSelection=true): void` (private)
- **Purpose:** Set the requestor dropdown options and optionally sync the selection.
- **Behavior:** Merges via `mergeCustomerRequestorOptions` and sets `customerRequestorOptions`; if `hd` and syncing, resolves the key and, when it differs, updates `jobHeaderDetail` key + display name.

#### `mergeCustomerRequestorOptions(opts, hd): CustomerRequestorOption[]` (private)
- **Purpose:** Ensure the job's current requestor contact appears in options.
- **Behavior:** Derives key/name from header (matching by name if no key); normalizes all option values; if the current key isn't present, prepends it as a synthetic option.

#### `resolveJobPriorityKey(hd, opts): string | null` (private)
- Returns normalized `jobTypeKey` if present; else matches `jobTypeName` against options; null otherwise.

#### `applyJobPriorityOptions(opts, hd, page, syncUiKey=true): void` (private)
- **Purpose:** Set job-priority options and sync the UI/original key.
- **Behavior:** Merges options and sets `jobPriorityOptions`; resolves key (falling back to `page.jobTypeKey`); updates `jobHeaderDetail` key/name; commits the original key (`commitOriginalJobPriorityKey`) and, when the key came from header rather than page, also updates `pageContext.jobTypeKey`.

#### `commitOriginalJobPriorityKey(value): void` (private)
- Normalizes and stores value in both `originalJobTypeKey` and `jobPriorityUiKey`.

#### `refreshJobPriorityVendorCheck(jobKey: string): void` (private)
- Calls `getJobPriorityVendorCheck` and stores result in `jobPriorityVendorCheck`.

#### `hasAssignedVendorsForPriorityChange(): boolean` (private)
- Always returns false. Comment: front-end gate removed; backend enforcement pending removal.

#### `isRecallJobPriority(jobTypeKey): boolean`
- True when the normalized key equals `RECALL_JOB_TYPE_KEY`.

#### `isJobPriorityOptionDisabled(option: JobPriorityOption): boolean`
- Disabled if the option is the Recall priority.

#### `formatPriorityCurrency(amount): string`
- Formats a number as USD currency (0 for non-finite).

#### `priorityResponseTimeChanged(preview): boolean`
- True if preview's old vs new response time differ.

#### `mergeJobPriorityOptions(opts, hd, page): JobPriorityOption[]` (private)
- Analogous to the requestor merge: derives priority key/name (page then header, matching by name), normalizes option values, prepends a synthetic current-priority option if missing.

#### `onJobPriorityChange(newJobTypeKey: string): void`
- **Purpose:** Handle a Job Priority dropdown change (opens confirmation modal).
- **Behavior:**
  - Sets `jobPriorityUiKey`. Returns if no jobKey, no new key, or unchanged.
  - Blocks if new key is Recall (`blockJobPriorityChange`). Also checks `hasAssignedVendorsForPriorityChange` (currently no-op).
  - Fetches a change preview (`getJobPriorityChangePreview` with customerKey); on failure blocks with message.
  - On success stores pending key, sets UI key, stores preview, resets status; computes `revisedVendors` (rows where both DNEs are set and revised differs from current), defaults each to `'keep'`; opens `jobPriorityChangeModalOpen`.
- **Calls:** `AssignVendorService.getJobPriorityChangePreview`; `isRecallJobPriority`, `blockJobPriorityChange`, `isVendorRowDneSet`, `normalizeSelectKey`.

#### `onJobPriorityVendorDneChoiceChange(jobVendorKey, choice: 'keep'|'change'): void`
- Sets the Keep/Change choice for a revised vendor's DNE in the modal.

#### `blockJobPriorityChange(revertKey, message): void` (private)
- Reverts `jobPriorityUiKey` and sets a cleaned error message (6s); replaces empty/"ok" with a generic message.

#### `onCancelJobPriorityChange(): void`
- Reverts UI key to original and resets all priority-change modal signals (pending key, preview, status, modal open, revised vendors, DNE choices).

#### `onConfirmJobPriorityChange(event?: Event): void`
- **Purpose:** Commit the job priority change from the modal.
- **Behavior:**
  - Prevents default/propagation. Resolves new key from pending/preview/UI. Validates jobKey, non-empty key, changed, and non-Recall (blocks + cancels if Recall) — each sets `jobPriorityChangeStatus`.
  - Sets `jobPrioritySaving` and "Saving..." status; calls `updateJobJobType`.
  - Success (status true or `data.flag === 1`): closes modal, resets priority signals, success toast (3s). If preview present, sets NTE signals (customer/rev customer/vendor/rev vendor) and updates `jobHeaderDetail` (jobTypeKey/name and all four DNEs), updates `pageContext.jobTypeKey`, commits original key.
  - If `newVendorDne` present, applies per-vendor "change" choices via `applyRevisedVendorDneChanges`; else `loadInitialData`.
  - Failure/error sets status and reverts UI key.
- **Calls:** `AssignVendorService.updateJobJobType`; `isRecallJobPriority`, `blockJobPriorityChange`, `onCancelJobPriorityChange`, `commitOriginalJobPriorityKey`, `applyRevisedVendorDneChanges`, `loadInitialData`.

#### `applyRevisedVendorDneChanges(vendors, newVendorDne, jobKey): void` (private)
- **Purpose:** After a priority change, apply the "Change" choice to each affected vendor's DNE.
- **Behavior:** If no vendors, just `loadInitialData`. Else `forkJoin`s `updateVendorDne` per vendor (mapping ok, catching errors); if any failed, sets an error toast listing vendor names (8s); always reloads via `loadInitialData`.
- **Calls:** `AssignVendorService.updateVendorDne`; `loadInitialData`.

#### `onTradeChange(newTradeKey: string): void`
- **Purpose:** Persist a Trade dropdown change.
- **Behavior:** Guards jobKey. Resolves trade name from `tradeDropdown`. Optimistically updates `pageContext`. Sets `tradeSaving`; calls `updateJobTrade`. On non-success sets error + `loadInitialData`; on success toast (3s) then reloads the vendor list for the current search (`enqueueVendorListLoadForCurrentSearch`). Error branch reloads.
- **Calls:** `AssignVendorService.updateJobTrade`; `loadInitialData`, `enqueueVendorListLoadForCurrentSearch`.

---

### SERVICE REQUEST & INSTRUCTIONS (SRI)

#### `sriFieldValue(field): string`
- Returns the pending edit for the field if defined, else the plain-text value derived from the header (`sriPlainFromHeader`).

#### `onSriFieldInput(field, value): void`
- Stores the value into `sriFieldEdits`.

#### `onSriFieldBlur(field): void`
- Calls `persistSriEdits(field)`.

#### `hasPendingSriEdits(): boolean` (private)
- True if any SRI field's current value differs from the header plain-text value.

#### `sriPlainFromHeader(hd, field): string` (private)
- Returns `htmlToPlainText(hd[field])`.

#### `persistSriEdits(_triggerField?): void` (private)
- **Purpose:** Save edited SRI fields.
- **Behavior:** Returns if already saving. Guards jobKey/header. If no pending edits, clears `sriFieldEdits` and returns. Builds `UpdateServiceRequestInstructionsRequest` (each field value-or-null), sets `sriSaving`, calls service. On non-success sets error; on success reloads header detail then clears edits + success toast (3s).
- **Calls:** `AssignVendorService.updateServiceRequestInstructions`, `.loadJobHeaderDetail`.

---

### JOB STATUS DROPDOWN

#### `onVendorStatusChange(vendor: AssignedVendorDetail, newStatusKey: string): void`
- **Purpose:** Handle the JOB STATUS select change in JOB MANAGEMENT.
- **Behavior:**
  - Guards on newStatusKey and jobKey. Snapshots prev status key/name/actions and header status name. Resolves next status name from `jobStatusList`.
  - Optimistically `patchAssignedVendor` with the new key/name and empty actions.
  - Calls `updateVendorJobStatus`; on failure reverts the patch (restoring header status name for default vendors) and sets error; on success sets toast and reloads header detail.
- **Calls:** `AssignVendorService.patchAssignedVendor`, `.updateVendorJobStatus`, `.loadJobHeaderDetail`; `normalizeSelectKey`.

---

### LOCATION MAP

#### `getLocationHref(address, city, state, zip, locationName=null): string`
- Builds a plain `https://maps.google.com/?q=` URL from address parts (or location name fallback), URL-encoded.

#### `getLocationMapUrl(address, city, state, zip): SafeResourceUrl`
- Builds a sanitized Google Maps embed URL (`output=embed&z=14`) via `sanitizer.bypassSecurityTrustResourceUrl`.

#### `legacyCustomerEditUrl(customerKey): string`
- Returns `{legacyAdminBaseUrl}/MgtCustomer/EditCustomer/{key}` or `''`.

#### `legacyLocationEditUrl(locationKey): string`
- Returns `{legacyAdminBaseUrl}/MgtLocation/EditLocation/{key}` or `''`.

#### `legacyVendorEditUrl(vendorKey): string`
- Returns `{legacyAdminBaseUrl}/MgtVendor/EditVendor/{key}` or `''`.

---

### NOT TO EXCEED (NTE)

#### `onSaveDneChange(): void`
- **Purpose:** Save edited Revised Customer/Vendor NTE values.
- **Behavior:** Guards jobKey and not-already-saving. Sets `nteSaving`, clears error. Builds `UpdateNteRequest` from the four NTE signals (value-or-null). Calls `updateNte`; on success sets success message, else error message; clears saving.
- **Calls:** `AssignVendorService.updateNte`.
- **Notes:** Response typed `any`; no header reload after save.

#### `onSiteApprovalButtonLabel(vendor): string`
- Returns "Update / Edit on-site approval" if `hasEstimate`, else "Provide on-site approval" (mirrors legacy `GetOnSiteButtonLabel`; shows for default and secondary vendors).

#### `onProvideOnsiteApproval(vendor: AssignedVendorDetail): void`
- **Purpose:** Open the on-site estimate modal (replaces legacy MdtVendorEstimateNew create/edit).
- **Behavior:**
  - Guards jobKey and not-already-loading; sets `onSiteApprovalLoading`, clears error.
  - Edit path (vendor.hasEstimate + jobVendorKey): loads `getVendorEstimateList`; on the first/most-recent estimate opens `onSiteEstimateModal.openForEdit(invoiceKey)`; error if none. (Has console.log debug output.)
  - Create path: saves NTE via `updateNte`; on failure sets error; on success reads customer email + DNEs (`vendorDneNumber`) + tradeKey + jobTypeKey from context/header and opens `onSiteEstimateModal.open(...)` with those. (Heavy console.log debug output.)
- **Calls:** `AssignVendorService.getVendorEstimateList`, `.updateNte`; `vendorDneNumber`, child `onSiteEstimateModal.openForEdit/open`.
- **Notes:** Supports both default and secondary vendors (legacy parity); each vendor has an independent estimate.

#### `onCloseOnSiteEstimatePickerModal(): void`
- Sets `onSiteEstimatePickerModal` to null.

#### `onSelectOnSiteEstimate(invoiceKey: string): void`
- Closes the picker modal and calls `openLegacyOnSiteEditEstimate(invoiceKey)`.

#### `openLegacyOnSiteCreateEstimate(jobKey, vendorKey): void` (private)
- Opens `{legacyAdminBaseUrl}/MdtVendorEstimateNew/CreateEstimate/{jobKey}?id2={vendorKey}` in a new tab (`noopener`).

#### `openLegacyOnSiteEditEstimate(invoiceKey): void` (private)
- Opens `{legacyAdminBaseUrl}/MdtVendorEstimateNew/EditEstimate/{invoiceKey}?id1=1` in a new tab (`noopener`).

#### `onSaveVendorNote(): void` (starts at line 6096; only opening lines in range)
- **Purpose:** Save a vendor note (create or update) then reload the list.
- **Behavior (visible portion):** Marks `vendorNoteForm` all-touched and returns if invalid. (Body continues past line 6100.)

## E. Files/refresh, Send & Select W/O pipeline, survey & work-order save

_Source file: `/Users/cole-sathngam/Workspace/RetailFixIt/rfi-admin-portal-v2/src/app/features/job/assign-vendor/assign-vendor.component.ts`_

> Note: line 6100 lands in the middle of `onSaveVendorNote` (its body starts before this range). The tail of that method is documented first for completeness.

#### `onSaveVendorNote(): void` (tail, body continues from before line 6100)
- **Purpose:** Validate and persist a vendor note, then refresh the note list for the current vendor.
- **Behavior:**
  - Reads/trims `noteTitle` and `notesDetail` from `vendorNoteForm`; builds an inline validation message and sets `noteMessage` and returns early if either is empty.
  - Sets `noteMessage` to "Saving...." and `isSubmitting(true)`; builds `SaveVendorNoteRequest` from form value, nulling `noteKey` when `newNote === 1`.
  - Calls `assignVendorSvc.saveVendorNote(request)`; on success resets the form (clears fields, sets `newNote: 1`), marks untouched, clears `noteMessage`, invalidates the tooltip cache, and reloads notes.
  - On failure: if `res.details` present, routes through `handleApiError(res, vendorNoteForm)`; otherwise sets `errorMessage` via `formatHttpFailureForUi`.
- **Calls:** `AssignVendorService.saveVendorNote`, `AssignVendorService.formatHttpFailureForUi`; `invalidateNoteTooltipCache`, `loadNotesForVendor`, `handleApiError`.
- **Notes:** `newNote === 1` means "create new" (noteKey forced null); otherwise updates existing note by `noteKey`.

#### `onCheckUploadedFiles(): void`
- **Purpose:** Report how many temp files are currently uploaded for the job.
- **Behavior:** Guards on `jobKey()`; calls `checkUploadedFiles(key)`; on success sets `successMessage` to `"{count} file(s) uploaded."`.
- **Calls:** `AssignVendorService.checkUploadedFiles`.
- **Notes:** SRS §23.8. Silent on failure.

#### `onRemoveUploadedFiles(): void`
- **Purpose:** Remove all temp uploaded files for the job.
- **Behavior:** Guards on `jobKey()`; calls `removeUploadedFiles(key)`; sets success or error message based on `res.status`.
- **Calls:** `AssignVendorService.removeUploadedFiles`.

#### `onRefresh(): void`
- **Purpose:** Refresh all page data.
- **Behavior:** Guards on `jobKey()`; clears messages then calls `loadInitialData(key)`.
- **Calls:** `clearMessages`, `loadInitialData`.

#### `private startJobDetailsPolling(): void`
- **Purpose:** Poll job details on an interval while the tab is visible so external changes appear without manual reload.
- **Behavior:**
  - Emits on `jobDetailsPollingStop$` to cancel any prior polling.
  - Starts a `timer(JOB_DETAILS_POLL_MS, JOB_DETAILS_POLL_MS)`, taking until `destroy$` or `jobDetailsPollingStop$`.
  - Filters to `document.visibilityState === 'visible'`; `switchMap`s to `refreshJobDetailsQuietly(key)` (or `EMPTY` if no key).
- **Calls:** `refreshJobDetailsQuietly`.

#### `private readonly onPageVisibilityRefresh = (): void` (arrow field)
- **Purpose:** Refresh job details when the tab becomes visible.
- **Behavior:** If `document.visibilityState === 'visible'`, calls `scheduleJobDetailsRefresh()`.

#### `private readonly onWindowFocusRefresh = (): void` (arrow field)
- **Purpose:** Refresh job details on window focus.
- **Behavior:** Calls `scheduleJobDetailsRefresh()` unconditionally.

#### `private scheduleJobDetailsRefresh(): void`
- **Purpose:** Debounce visibility + focus events into a single quiet refresh.
- **Behavior:** Clears any pending `jobDetailsRefreshDebounceId` timeout; sets a new 300ms `setTimeout` that (if `jobKey()` present) runs `refreshJobDetailsQuietly(key)` subscribed with `takeUntil(destroy$)`.
- **Calls:** `refreshJobDetailsQuietly`.

#### `private isJobDetailsRefreshBlocked(): boolean`
- **Purpose:** Determine whether an in-progress user edit should block background sync.
- **Behavior:** Returns true if any of `tradeSaving()`, `jobPrioritySaving()`, `customerRequestorSaving()`, or `jobPriorityChangeModalOpen()` are truthy.

#### `private isJobPriorityEditInProgress(): boolean`
- **Purpose:** Whether a job-priority edit is underway.
- **Behavior:** Returns `jobPrioritySaving() || jobPriorityChangeModalOpen()`.

#### `private refreshJobDetailsQuietly(jobKey: string): Observable<void>`
- **Purpose:** Reload Job Details data sources (header, page context, contacts, profile DNE) without global spinner or toasts.
- **Behavior:**
  - Returns `EMPTY` if `isJobDetailsRefreshBlocked()`.
  - Calls `loadAssignVendorPage(jobKey, { quiet: true })`; derives `customerKey` from response, else current `pageContext()`.
  - `forkJoin`s header detail, requestor options, customer profile DNE (only if customerKey), and the page response.
  - In `tap`: applies requestor options (auto-select unless `customerRequestorSaving()`), sets `customerProfileDne` if present, syncs NTE display, and re-applies job priority options unless a priority edit is in progress.
  - Maps to `void`.
- **Calls:** `AssignVendorService.loadAssignVendorPage`, `loadJobHeaderDetail`, `getCustomerRequestorOptions`, `getCustomerProfileDne`; `applyCustomerRequestorOptions`, `syncNteDisplay`, `applyJobPriorityOptions`.
- **Notes:** Central quiet-refresh used by polling, focus/visibility handlers, and `onWoClose`.

#### `private refreshGrids(): void`
- **Purpose:** Refresh only the grid data streams.
- **Behavior:** Guards on `jobKey()`; calls `refreshAllGrids(key)`.
- **Calls:** `AssignVendorService.refreshAllGrids`.

#### `onResetVendorForm(): void`
- **Purpose:** Reset the vendor selection form to empty state.
- **Behavior:** Resets `vendorForm` to `{ vendorKey:'', contactKey:'' }`, marks untouched, clears `contactDropdown`, `selectedVendorDistance`, `selectedVendorServiceCharge`, `selectedVendorConsolidator`, `selectedVendorLaborKey`.

#### `private clearMessages(): void`
- **Purpose:** Clear error and success messages.
- **Behavior:** Sets `errorMessage` and `successMessage` to `''`.

#### `applyServerErrors(details: ApiErrorDetail[], form: FormGroup): string`
- **Purpose:** Map API `details[]` field errors onto the matching FormControls; return joined non-field messages.
- **Behavior:**
  - Iterates details; entries without `field` collected into `unmapped`.
  - Converts PascalCase field name to camelCase; if a matching control exists, sets `{ serverError }` and marks touched; else pushes to `unmapped`.
  - Returns `unmapped.join('. ')`.
- **Notes:** Layer 7 server-side error mapping; API field names arrive PascalCase, controls are camelCase.

#### `handleApiError<T>(res: AssignVendorApiResponse<T>, form?: FormGroup): void`
- **Purpose:** Route a failed mutation response to per-field form errors or the global message.
- **Behavior:** If `form` and `res.details.length > 0`, delegates to `applyServerErrors` and sets `errorMessage` to the global remainder (or `res.message`/"Validation failed."). Otherwise sets `errorMessage` from `formatHttpFailureForUi` (when `clientOperation`) or `res.message`.
- **Calls:** `applyServerErrors`, `AssignVendorService.formatHttpFailureForUi`.

#### `get searchTypeOptions()` (getter)
- **Purpose:** Provide radio-button options for vendor search type.
- **Behavior:** Returns a static array: 1 "All vendors in radius", 2 "Vendors in selected trade within radius", 3 "Vendors in current location history".

#### `onVendorLogin(row: Record<string, unknown>): void`
- **Purpose:** Open the vendor portal in a new tab, logging in as the vendor contact (admin troubleshooting).
- **Behavior:** Reads `contactKey` from row (warns & returns if absent); gets `adminKey` from JWT via `authTokenSvc.getAdminKeyFromToken()` (warns & returns if absent); builds `{vendorPortalBaseUrl}/VendorLogin/LoginByRCSadmin/{contactKey}?adminKey={adminKey}` and `window.open`s it (`_blank`, noopener).
- **Calls:** `authTokenSvc.getAdminKeyFromToken`.

#### `onSendAndSelectWorkOrder(row: Record<string, unknown>): void`
- **Purpose:** Entry point for "Send & Select W/O" on a vendor grid row; runs parallel prechecks.
- **Behavior:**
  - Reads `vendorKey` (returns if empty); guards `jobKey()` (else sets error). Reads `tradeKey` from page context.
  - Sets `sendAndSelectWorkOrderLoadingVendorKey` to vendorKey.
  - `forkJoin`s `checkIfVendorIsConsolidator`, `checkForExistingVendor`, `checkVendorTrade`; on next clears loading key and calls `handleSendAndSelectWorkOrderPrechecks`; on error clears loading key and sets error.
- **Calls:** `AssignVendorService.checkIfVendorIsConsolidator`, `checkForExistingVendor`, `checkVendorTrade`; `handleSendAndSelectWorkOrderPrechecks`.
- **Notes:** Parallelizes the three upfront prechecks instead of running them sequentially.

#### `private handleSendAndSelectWorkOrderPrechecks(row, consolidatorRes, existingVendorRes, tradeRes): void`
- **Purpose:** Branch on precheck results, opening the consolidator precheck modal when needed.
- **Behavior:**
  - If `!consolidatorRes.status`, sets error and returns.
  - If `consolidatorRes.data === true`: stashes a pending-continue closure (calls `continueSendAndSelectWorkOrderAfterPrechecks`), stores pending keys `{jobKey,vendorKey}`, sets source `'grid'`, sets `consolidatorPrecheckMessage`, and opens `showConsolidatorPrecheckModal`.
  - Else calls `continueSendAndSelectWorkOrderAfterPrechecks`.
- **Calls:** `continueSendAndSelectWorkOrderAfterPrechecks`.
- **Notes:** Replays the decision logic of the sequential `runVendorConsolidatorPrecheck`/`woProcessSaveVendor`/`woCheckTradeThenAssign` path.

#### `private continueSendAndSelectWorkOrderAfterPrechecks(row, existingVendorRes, tradeRes): void`
- **Purpose:** Feed already-fetched precheck results forward instead of refetching.
- **Behavior:** Stores `woPrefetchedExistingVendorResult` and `woPrefetchedTradeResult`, then calls `executeSendAndSelectWorkOrder(row)`.
- **Calls:** `executeSendAndSelectWorkOrder`.

#### `private executeSendAndSelectWorkOrder(row: Record<string, unknown>): void`
- **Purpose:** Original W/O pipeline after consolidator check passes; sets grid flags and either opens consolidator modal or starts step 1.
- **Behavior:**
  - Reads vendorKey and vendorName (`vendorName`/`vname`); sets `woSelectedVendorKey`, `woSelectedVendorName`, `woDefaultVendorValue('1')`, `woSendFromWhere('0')`, clears `woMessage`, resets WO form.
  - Determines consolidator status from the `consolidator` string column ("consolidator"/"full consolidator") and the `fullConsolidator` field (true/1/"consolidator"); sets `woIsConsolidator`.
  - If consolidator, opens `showConsolidatorModal`; else calls `woSendWorkOrderStep1()`.
- **Calls:** `woResetWorkOrderForm`, `woSendWorkOrderStep1`.

#### `onConsolidatorProceed(): void`
- **Purpose:** Consolidator modal "Proceed With this Vendor".
- **Behavior:** Closes `showConsolidatorModal`; calls `woSendWorkOrderStep1()`.

#### `onConsolidatorCancel(): void`
- **Purpose:** Consolidator modal "Cancel and Go Back".
- **Behavior:** Closes `showConsolidatorModal`.

#### `private woSendWorkOrderStep1(): void`
- **Purpose:** Step 1 — check primary/preferred vendor conditions before assigning.
- **Behavior:**
  - If no page context, goes straight to `woProcessSaveVendor()`.
  - Computes `isPrimary`, `selectedIsNotPrimary`, `alreadyAssignedOnce`. Only when all three true: calls `checkForPrimaryVendor(jobKey, locationKey, tradeKey)`.
    - No status/data → `woProcessSaveVendor()`.
    - `flag === 0` → `woProcessSaveVendor()`.
    - `flag === 1` → if `localStorage 'DontShowPrimaryVen' !== '1'`, set `woPrimaryVendorMessage` and open `showPrimaryVendorModal`; else `woProcessSaveVendor()`.
    - Otherwise sets error message.
  - Else `woProcessSaveVendor()`.
- **Calls:** `AssignVendorService.checkForPrimaryVendor`; `woProcessSaveVendor`.
- **Notes:** Honors `DontShowPrimaryVen` localStorage suppression flag.

#### `onPrimaryVendorDispatch(): void`
- **Purpose:** Primary Vendor modal "Dispatch To the Primary Vendor Now".
- **Behavior:** Closes modal; calls `sendToPrimaryVendor(jobKey)`. On success: if `pendingPostWoQcDispatch()`, calls `invokeQcManagerDispatchThenShowOutcome()`; else sets success message and reloads window after 1500ms. On non-status/error: clears pending QC dispatch and sets error.
- **Calls:** `AssignVendorService.sendToPrimaryVendor`; `invokeQcManagerDispatchThenShowOutcome`, `clearPendingPostWoQcDispatch`.

#### `onPrimaryVendorContinue(): void`
- **Purpose:** Primary Vendor modal "Continue Assigning Selected Vendor".
- **Behavior:** Closes modal; sets `localStorage 'DontShowPrimaryVen' = '1'`; calls `woProcessSaveVendor()`.
- **Calls:** `woProcessSaveVendor`.

#### `private woProcessSaveVendor(): void`
- **Purpose:** Step 2 — check for existing vendor already on job.
- **Behavior:**
  - Uses `woPrefetchedExistingVendorResult` if present (then nulls it), else calls `checkForExistingVendor(jobKey)`.
  - On non-status → error.
  - If `data === 1`: calls `checkForSameVendor(jobKey, selectedVendorKey)`; if same (`data === 1`) opens `showAlreadyAssignedModal`, else opens `showDefaultVendorModal`.
  - Else sets `woDefaultVendorValue('1')` and calls `woCheckTradeThenAssign()`.
- **Calls:** `AssignVendorService.checkForExistingVendor`, `checkForSameVendor`; `woCheckTradeThenAssign`.

#### `onDefaultVendorReplace(): void`
- **Purpose:** Default Vendor modal "Replace and unassign previous vendor(s)".
- **Behavior:** Closes modal; sets `woDefaultVendorValue('1')`; calls `woLoadUnassignVendors()`.
- **Calls:** `woLoadUnassignVendors`.

#### `onDefaultVendorAdd(): void`
- **Purpose:** Default Vendor modal "Add as additional vendor".
- **Behavior:** Closes modal; sets `woDefaultVendorValue('0')`; calls `woCheckTradeThenAssign()`.
- **Calls:** `woCheckTradeThenAssign`.

#### `private woLoadUnassignVendors(): void`
- **Purpose:** Populate and open the Unassign-All modal from the currently assigned vendors.
- **Behavior:** Maps `assignedVendors()` into `{pKey (jobVendorKey), vendorName, checked:false}`; sets `woUnassignVendors`, clears `woCancellationNotes`, `woSelectAllUnassign(false)`, `woUnassignValidationMessage('')`; opens `showUnassignAllModal`.

#### `onUnassignToggle(pKey: string): void`
- **Purpose:** Toggle an individual vendor checkbox in the Unassign-All modal.
- **Behavior:** Flips `checked` for the matching `pKey`; recomputes `woSelectAllUnassign` (true only if every row checked).

#### `onUnassignSelectAll(): void`
- **Purpose:** Toggle select-all in the Unassign-All modal.
- **Behavior:** Inverts `woSelectAllUnassign` and sets every row's `checked` to the new value.

#### `onUnassignSendMail(): void`
- **Purpose:** Unassign-All "Send Mail" — validate selection/notes and send bulk cancellation emails, then continue assignment.
- **Behavior:**
  - Validates: requires at least one selected vendor and non-empty notes; on failure sets `woUnassignValidationMessage` and returns.
  - Closes modal, sets `woMessage` progress text, `woSaving(true)`.
  - Gets `adminKey` from token; if missing, resets saving/message and sets error.
  - Calls `sendBulkCancellationWithEmail({notesJobKey, notes, vendorEmailList, adminKey})`. On success shows message then after 1500ms clears message, sets `woDefaultVendorValue('1')`, calls `woCheckTradeThenAssign()`. On failure/error: sets error but STILL proceeds (`woDefaultVendorValue('1')` + `woCheckTradeThenAssign()`).
- **Calls:** `authTokenSvc.getAdminKeyFromToken`, `AssignVendorService.sendBulkCancellationWithEmail`; `woCheckTradeThenAssign`.
- **Notes:** Assignment continues regardless of email success/failure (legacy parity).

#### `onUnassignDontSend(): void`
- **Purpose:** Unassign-All "Don't Send" — skip email but proceed with assignment.
- **Behavior:** Closes modal; clears validation message, cancellation notes, unchecks all vendors, `woSelectAllUnassign(false)`; sets `woDefaultVendorValue('1')`; calls `woCheckTradeThenAssign()`.
- **Calls:** `woCheckTradeThenAssign`.

#### `onUnassignAllModalClose(): void`
- **Purpose:** Unassign-All header close — dismiss without sending mail/continuing; reopen Default Vendor modal.
- **Behavior:** Closes modal; clears validation message/notes, unchecks all, `woSelectAllUnassign(false)`; opens `showDefaultVendorModal`.
- **Notes:** This popup is only entered from the replace-and-unassign path, so closing returns to the Default Vendor decision.

#### `private woCheckTradeThenAssign(): void`
- **Purpose:** Step 3 — check whether the vendor has the job's trade; branch to DNE/WO modal or New Trade modal.
- **Behavior:** Uses `woPrefetchedTradeResult` if present (then nulls), else calls `checkVendorTrade(jobKey, selectedVendorKey, tradeKey)`. If `data === 1` calls `woLoadDNEAndShowModal()`; else opens `showNewTradeModal`.
- **Calls:** `AssignVendorService.checkVendorTrade`; `woLoadDNEAndShowModal`.

#### `onNewTradeAdd(): void`
- **Purpose:** New Trade modal "YES (ADD THIS TRADE TO THE VENDOR SELECTED)".
- **Behavior:** Closes modal; calls `addTradeToVendor(selectedVendorKey, tradeKey)`. If `flag === 1`: calls `checkIfVendorAlreadyAssigned(...)`; if already assigned (`data === 1`) sets "Cannot assign same vendor twice." error, else calls `woLoadDNEAndShowModal()`. If add fails, sets error from response.
- **Calls:** `AssignVendorService.addTradeToVendor`, `checkIfVendorAlreadyAssigned`; `woLoadDNEAndShowModal`.

#### `onNewTradeChooseAnother(): void`
- **Purpose:** New Trade modal "CHOOSE ANOTHER VENDOR WHO HAS THIS TRADE".
- **Behavior:** Closes `showNewTradeModal`.

#### `private woLoadDNEAndShowModal(): void`
- **Purpose:** Load DNE + survey items, open the Work Order modal, then lazily load job/location files.
- **Behavior:**
  - Resets survey form; sets `woSurveyLoading(true)`; clears job/location files and selected keys.
  - `forkJoin`s `getVendorDNE(jobKey, selectedVendorKey)` and `getAccountManagerSurveyItems()`.
  - Sets `woCurrentDNE`/`woChangeDNE` from DNE data; sets `woSurveyOptions` (or `woSurveyError` if failed); clears survey loading; applies WO modal defaults; opens `showWorkOrderModal`.
  - Builds a shared `broadcastFileByKey$` map from `getJobFilesForBroadcast(jobKey)` and calls `woLoadJobFiles`/`woLoadLocationFiles` with it.
- **Calls:** `resetWoSurveyForm`, `AssignVendorService.getVendorDNE`, `getAccountManagerSurveyItems`, `getJobFilesForBroadcast`; `woApplyWorkOrderModalDefaults`, `woLoadJobFiles`, `woLoadLocationFiles`.
- **Notes:** Job/location/broadcast file endpoints are deliberately excluded from the blocking batch so slow endpoints don't delay the modal.

#### `private woLoadJobFiles(broadcastFileByKey$: Observable<Map<string, BroadcastJobFileDto>>): void`
- **Purpose:** Load job files after the modal is open, overlaying document type name + fileUrl from the broadcast map.
- **Behavior:** Sets `woJobFilesLoading(true)`; `forkJoin`s `getJobFiles(jobKey)` and the broadcast map; overlays `fileType`←`documentTypeName` and `fileUrl` per matching `fileKey`; filters out `'CUSTOMER WORK ORDER'`; sets `woJobFiles`. During business hours (`isBusinessHours()`), pre-selects all job file keys. Clears loading.
- **Calls:** `AssignVendorService.getJobFiles`; `isBusinessHours`.
- **Notes:** Stopgap for backend `job-files/{jobKey}` returning MIME type as fileType and no fileUrl.

#### `private woLoadLocationFiles(broadcastFileByKey$: Observable<Map<string, BroadcastJobFileDto>>): void`
- **Purpose:** Load location files after the modal is open, with the same overlay stopgap.
- **Behavior:** Sets `woLocationFilesLoading(true)`; `forkJoin`s `getLocationFiles(jobKey)` and the broadcast map; filters out `'CUSTOMER WORK ORDER'`, overlays `fileType`/`fileUrl`; sets `woLocationFiles`. Business hours pre-selects all location file keys. Clears loading.
- **Calls:** `AssignVendorService.getLocationFiles`; `isBusinessHours`.

#### `private woApplyWorkOrderModalDefaults(): void`
- **Purpose:** Set default control values when the Send Work Order modal opens.
- **Behavior:** `woTalkedToVendor(2)`, `woHaveScheduleDate(false)`, `woSurveyOtherReason(true)`.

#### `onToggleJobFile(fileKey: string, checked: boolean): void`
- **Purpose:** Handle a job-file checkbox change.
- **Behavior:** Returns if no fileKey; when `checked`, appends fileKey (dedup) to `woSelectedJobFileKeys`; when unchecked, removes it.
- **Notes:** Uses `event.checked` (not a toggle) to stay in sync with `[checked]` binding.

#### `onViewJobFile(file: JobFileItem): void`
- **Purpose:** Open a job file in a new tab.
- **Behavior:** `window.open(fileUrl, '_blank', 'noopener')` if fileUrl present; else warns.

#### `onViewLocationFile(file: LocationFileItem): void`
- **Purpose:** Open a location file in a new tab.
- **Behavior:** `window.open(fileUrl,...)` if present; else warns.

#### `onToggleLocationFile(fileKey: string, checked: boolean): void`
- **Purpose:** Handle a location-file checkbox change.
- **Behavior:** Same add/remove logic as `onToggleJobFile` against `woSelectedLocationFileKeys`.

#### `onWoFilesDrop(event: DragEvent): void`
- **Purpose:** Handle drag-and-drop of files onto the WO modal.
- **Behavior:** Prevents default/propagation; passes `dataTransfer.files` (as array) to `woAddFiles`.
- **Calls:** `woAddFiles`.

#### `onWoFilesDragOver(event: DragEvent): void`
- **Purpose:** Allow dropping by suppressing default drag behavior.
- **Behavior:** `preventDefault()` + `stopPropagation()`.

#### `onWoFilesSelect(event: Event): void`
- **Purpose:** Handle file-input change.
- **Behavior:** Adds selected files via `woAddFiles`; resets `input.value` to allow re-selecting the same file.
- **Calls:** `woAddFiles`.

#### `private woAddFiles(files: File[]): void`
- **Purpose:** Append newly chosen files to the pending upload list.
- **Behavior:** Sets `woUploadedFiles` to current + new files.

#### `onWoRemoveFile(index: number): void`
- **Purpose:** Remove a pending uploaded file by index (client-side only until save).
- **Behavior:** Splices index out of a copy of `woUploadedFiles` and sets it.

#### `onWoConvertScheduleDate(): void`
- **Purpose:** Convert the schedule date dropdowns to the vendor's timezone for display.
- **Behavior:** Reads month/day/year/hour/minute/ampm signals; if any missing (except ampm), clears `woConvertedScheduleDate` and returns. Builds `M/D/Y h:min ampm`; calls `convertETAToVendorDate(jobKey, dateStr)`; sets `woConvertedScheduleDate` from result.
- **Calls:** `AssignVendorService.convertETAToVendorDate`.

#### `private woGetScheduleDateString(): string | null`
- **Purpose:** Build the US-format schedule date string from dropdowns.
- **Behavior:** Returns null if `woHaveScheduleDate() !== true` or any part missing; else returns `M/D/Y h:min ampm`.

#### `private woGetScheduleDateIso(): string | null`
- **Purpose:** Produce an ISO-8601 schedule date for the Job Ops API.
- **Behavior:** Gets the display string; returns null if absent or `new Date()` is NaN; else returns `.toISOString()`.
- **Notes:** Avoids US date-string JSON parse failures on the backend.

#### `private woValidateForm(): string | null`
- **Purpose:** Validate the work order form pre-submit.
- **Behavior:** Returns an error string if `woHaveScheduleDate()` is null (no option chosen) or if true but the date string is incomplete; else null.

#### `isWoSurveyOptionChecked(reasonCode: string): boolean`
- **Purpose:** Whether a survey option is selected.
- **Behavior:** Returns `woSurveySelectedCodes().includes(reasonCode)`.

#### `onWoSurveyToggleOption(reasonCode: string): void`
- **Purpose:** Toggle a survey reason option.
- **Behavior:** Adds/removes the code in `woSurveySelectedCodes`; resets `woSurveySavedSignature(null)` and clears `woSurveyError`.

#### `onWoSurveyOtherReasonChange(checked: boolean): void`
- **Purpose:** Handle the "Other" survey reason checkbox.
- **Behavior:** Sets `woSurveyOtherReason(checked)`; if unchecked clears `woSurveyOtherRemark`; resets saved signature and clears error.

#### `onWoSurveyFieldChange(): void`
- **Purpose:** Invalidate the saved survey signature when any survey field changes.
- **Behavior:** Sets `woSurveySavedSignature(null)` and clears `woSurveyError`.

#### `private woCollectSurveyResponses(): {ok:true; responses} | {ok:false; message}`
- **Purpose:** Assemble selected survey responses for save.
- **Behavior:** Builds responses from selected `woSurveyOptions` (reasonCode + displayLabel); if `woSurveyOtherReason()`, appends `WO_SURVEY_OTHER_REASON` with the trimmed remark or "Other". Returns `{ok:false}` with a message if none selected; else `{ok:true, responses}`.

#### `private woValidateSurveyMainRemark(): string | null`
- **Purpose:** Validate the admin's main remark.
- **Behavior:** Trims remark; returns error if empty ("required"), <15 chars, or >500 chars; else null.

#### `private woBuildSurveySignature(responses, mainRemark): string`
- **Purpose:** Build a stable signature to detect whether the survey needs re-saving.
- **Behavior:** Maps responses to `reasonCode=responseValue`, sorts, joins with `|`; returns `jobKey::selectedVendorKey::tokens::mainRemark`.

#### `private buildMlDispatchCapture(): {scoringRunUid; chosenVendorScore; displayedVendors}`
- **Purpose:** Build ML dispatch capture fields for AIVendorSelection (scoring run uid, chosen vendor score, admin's filtered vendor view).
- **Behavior:**
  - Resolves chosen vendor score from `vendorScores()` (jobSpecificScore if tier != 'N/A', else unscoredRankScore).
  - Maps `filteredInternalVendors()` to `DisplayedVendorCapture[]` (via `mapVendorRowToDisplayedCapture`, filtering nulls).
  - If chosen vendor not in the displayed list, appends it (via `findVendorRowForMlCapture` + map, or `mapScoreEntryToDisplayedCapture`).
  - Returns all-null object if there's no uid/score/vendors; else the capture.
- **Calls:** `mapVendorRowToDisplayedCapture`, `findVendorRowForMlCapture`, `mapScoreEntryToDisplayedCapture`.

#### `private findVendorRowForMlCapture(vendorKey: string): LocationHistoryVendor | null`
- **Purpose:** Locate a vendor row across the display pools for ML capture.
- **Behavior:** Searches concatenated `filteredInternalVendors()`, `defaultVendors()`, `searchResults()` for a case-insensitive `vendorKey` match; returns it or null.

#### `private mapVendorRowToDisplayedCapture(v: LocationHistoryVendor): DisplayedVendorCapture | null`
- **Purpose:** Convert a vendor row to a DisplayedVendorCapture.
- **Behavior:** Returns null if no vendorKey. Determines scored status from `scoreTier`; computes `score` from row `score`/`unscoredRankScore`, preferring the authoritative value from `vendorScores()` lookup (jobSpecificScore for scored, unscoredRankScore for unscored). Returns `{vendorKey, score, isScored}`.

#### `private mapScoreEntryToDisplayedCapture(vendorKey, entry?): DisplayedVendorCapture | null`
- **Purpose:** Build a capture entry directly from a score lookup entry (fallback when no row).
- **Behavior:** Null if no vendorKey. No entry → `{score:0, isScored:false}`. Tier != 'N/A' → `{jobSpecificScore, isScored:true}`. Else `{unscoredRankScore ?? 0, isScored:false}`.

#### `private woEnsureSurveySavedThen(proceed: () => void): void`
- **Purpose:** Save the vendor-selection survey (if not already saved) then run the WO submit callback.
- **Behavior:**
  - Collects responses (sets error and returns if not ok); validates main remark (sets error and returns on failure).
  - Builds signature; if it equals `woSurveySavedSignature()`, clears error and calls `proceed()` immediately.
  - Returns if `woSurveySaving()` already in progress.
  - Sets `woSurveySaving(true)`; builds ML capture; calls `saveWorkOrderVendorSurvey({...responses, mainRemark, ML fields})`. On success stores signature and calls `proceed()`; on failure/error sets `woSurveyError`.
- **Calls:** `woCollectSurveyResponses`, `woValidateSurveyMainRemark`, `woBuildSurveySignature`, `buildMlDispatchCapture`, `AssignVendorService.saveWorkOrderVendorSurvey`.

#### `private resetWoSurveyForm(): void`
- **Purpose:** Reset all survey-related signals.
- **Behavior:** Clears `woSurveyOptions`, loading/saving/error, selected codes, other-reason/remark, main remark, saved signature.

#### `onWoSubmitWithFiles(): void`
- **Purpose:** WO modal "Select and send work order now" (WITH files).
- **Behavior:** Runs `woValidateForm()` (sets `woMessage` and returns on error). Requires at least one file (uploaded / job / location) else sets message. If `woDefaultVendorValue() !== '1'` and `woSendFromWhere() === '0'`, sets `woSendFromWhere('1')` and opens `showDNEWarningModal`. Otherwise `woEnsureSurveySavedThen(() => woSaveWithFiles())`.
- **Calls:** `woValidateForm`, `woEnsureSurveySavedThen`, `woSaveWithFiles`.

#### `onWoSubmitWithoutFiles(): void`
- **Purpose:** WO modal "Send work order without any Attachments".
- **Behavior:** Runs `woValidateForm()`. Fires `removeUploadedFiles(jobKey)` (fire-and-forget). If `woDefaultVendorValue() !== '1'` and `woSendFromWhere() === '0'`, sets `woSendFromWhere('2')` and opens DNE warning. Otherwise `woEnsureSurveySavedThen(() => woSaveWithoutFiles())`.
- **Calls:** `woValidateForm`, `AssignVendorService.removeUploadedFiles`, `woEnsureSurveySavedThen`, `woSaveWithoutFiles`.

#### `onDNEProceed(): void`
- **Purpose:** DNE Warning modal "Proceed Without Changing DNE".
- **Behavior:** Closes DNE modal; if `woSendFromWhere() === '2'` runs `woEnsureSurveySavedThen(woSaveWithoutFiles)`, else `woEnsureSurveySavedThen(woSaveWithFiles)`.
- **Calls:** `woEnsureSurveySavedThen`, `woSaveWithoutFiles`/`woSaveWithFiles`.

#### `onDNEGoBack(): void`
- **Purpose:** DNE Warning modal "Go Back to Changing DNE".
- **Behavior:** Closes `showDNEWarningModal`.

#### `private logWorkOrderFileFailureToNotes(title: string, detail: string): void`
- **Purpose:** Record WO file upload/attachment failures on the job's Notes & Activity feed.
- **Behavior:** Builds a comment from detail + attempted file names + vendor key; calls `saveGeneralAdminNote({jobKey, title, comment})`; logs a console warning on error.
- **Calls:** `AssignVendorService.saveGeneralAdminNote`.

#### `private woSaveWithFiles(): void`
- **Purpose:** Begin the save-with-files flow.
- **Behavior:** Sets `woSaving(true)`, `woMessage("Saving vendor and files...")`, closes WO modal, calls `runSaveVendorToJobWithFiles()`.
- **Calls:** `runSaveVendorToJobWithFiles`.

#### `private runSaveVendorToJobWithFiles(): void`
- **Purpose:** Save the vendor to the job with attached files, then send the WO email.
- **Behavior:** Builds `saveRequest` (jobKey, vendorKey, defaultValue, sendWorkOrder:1, checkedFileList, locationFile, talkedToVendor, etaLimit [only when no schedule date], etaDate ISO, savedDNE). Calls `saveVendorToJobWithFiles(saveRequest, [...woUploadedFiles()])`. On success with `flag === 1`, sets message and calls `woSendEmail(jobVendorKey, workOrderKey)`. On failure/error clears saving, clears pending QC dispatch, sets error.
- **Calls:** `AssignVendorService.saveVendorToJobWithFiles`; `woSendEmail`, `clearPendingPostWoQcDispatch`.

#### `private woSaveWithoutFiles(): void`
- **Purpose:** Save the vendor to the job without files, then send the WO email.
- **Behavior:** Sets `woSaving(true)`, message, closes modal. Calls `saveVendorToJob({jobKey, vendorKey, defaultValue, sendWorkOrder:1, talkedToVendor, etaLimit, etaDate, savedDNE})`. On `flag === 1` calls `woSendEmail(jobVendorKey)`; on failure/error clears saving, clears pending QC dispatch, sets error.
- **Calls:** `AssignVendorService.saveVendorToJob`; `woSendEmail`, `clearPendingPostWoQcDispatch`.

#### `private woSendEmail(jobVendorKey: string, workOrderKey: string | null = null): void`
- **Purpose:** Send the work order email (step 2 of the two-step save+send).
- **Behavior:** Filters checked job/location file keys; calls `sendWorkOrderEmail(jobVendorKey, {talkedToVendor, etaDate, locationFile, workOrderKey, checkedFileList})`. On success with `flag === 1`: if `pendingPostWoQcDispatch()` calls `invokeQcManagerDispatchThenShowOutcome()`, else sets success and reloads window after 2000ms. On failure/error clears saving, clears pending QC dispatch, sets error.
- **Calls:** `AssignVendorService.sendWorkOrderEmail`; `invokeQcManagerDispatchThenShowOutcome`, `clearPendingPostWoQcDispatch`.

#### `onWoClose(): void`
- **Purpose:** WO modal "Close" — refresh in place and stay on the page.
- **Behavior:** Clears pending QC dispatch; closes `showWorkOrderModal`; if `jobKey()` present runs `refreshJobDetailsQuietly(jobKey)`; then `refreshGrids()`.
- **Calls:** `clearPendingPostWoQcDispatch`, `refreshJobDetailsQuietly`, `refreshGrids`.

## F. AI sourcing, scorecard, vendor status actions, check-in/out, approvals & utilities

Documented in source order. Note: this range does **not** contain any dedicated `vendorEstimateDecline`/negotiation-agent methods as standalone functions — the vendor-estimate lifecycle here is handled generically through `onVendorStatusAction` (action IDs like `view_vendor_estimate`, `estimate_upload_reject`) and the `openVendorActionMailModal`/`onSendVendorActionMail` mail flow. See the "Estimate-decline / negotiation" note at the end.

---

#### `woResetWorkOrderForm(): void` (private)
- **Purpose:** Reset all work-order form signal state to defaults.
- **Behavior:**
  - Clears every `wo*` signal (talked-to-vendor, schedule date parts, ETA limit days, current/change DNE, job/location file arrays and selected keys, uploaded files, saving flag, message, send-from-where `'0'`).
  - Calls `resetWoSurveyForm()` to clear the survey sub-form.
- **Calls:** `resetWoSurveyForm()`.
- **Notes:** Tail end of the work-order block; pure state reset.

#### `loadAISourcingData(jobKey: string): void`
- **Purpose:** Load AI sourcing vendors for a job by polling status (does NOT trigger a new sourcing request).
- **Behavior:**
  - Sets `aiSourcingLoading` true, clears `aiSourcingError`.
  - Delegates to `startAISourcingPolling(jobKey)`.
- **Calls:** `startAISourcingPolling()`.
- **Notes:** Comment: polls `GET /api/sourcing/status/{jobKey}` every 10s (immediate first call); never calls `POST /api/sourcing/request`.

#### `startAISourcingPolling(jobKey: string): void` (private)
- **Purpose:** Poll sourcing status until terminal, then load vendors.
- **Behavior:**
  - Emits `aiSourcingPollingStop$`, sets `aiSourcingPolling` true, `aiSourcingLoading` false.
  - `timer(0, 10_000)` polls `getSourcingStatus`, `takeUntil(destroy$ ∪ stop$)`, `takeWhile` still pending/in_progress.
  - On `completed` → stop polling + `loadAIVendors`; on `failed` → stop + set error (uses `status.errorMessage`); on `not_started` → just stop polling.
- **Calls:** `AssignVendorService.getSourcingStatus`, `loadAIVendors()`.

#### `loadAIVendors(jobKey: string): void` (private)
- **Purpose:** Fetch sourced vendor rows once status is completed.
- **Behavior:** Sets loading true; calls `getSourcingVendors`; on result clears loading and applies via `applyAIVendors`.
- **Calls:** `AssignVendorService.getSourcingVendors`, `applyAIVendors()`.

#### `onInlineSaveEmail(v: AISourcingVendor, email: string): void`
- **Purpose:** Handle inline email edit in the sourcing table (Enter/blur).
- **Behavior:**
  - No-op if trimmed email empty.
  - Optimistically updates matching vendor in `aiSourcingVendors` (matched by `google_maps_uri`, else `company_name`+`phone`).
  - Persists via `persistAiSourcingVendorEmail`.
- **Calls:** `persistAiSourcingVendorEmail()`.

#### `persistAiSourcingVendorEmail(row, email): void` (private)
- **Purpose:** Save inline-edited sourced-vendor email to Job Ops API.
- **Behavior:**
  - Guards on `jobKey()`; sets `errorMessage` if missing.
  - Builds `UpdateSourcedVendorEmailRequest` (email + identity fingerprint fields via `aiSourcingIdentityString`).
  - Calls `saveSourcingVendorEmail`; on error sets error message and reloads grid via `loadAIVendors`.
- **Calls:** `AssignVendorService.saveSourcingVendorEmail`, `aiSourcingIdentityString()`, `loadAIVendors()`.

#### `aiSourcingIdentityString(value): string | null` (private)
- **Purpose:** Normalize optional fingerprint cell values (null if blank).
- **Behavior:** Returns trimmed string or null.

#### `getFitScore(relevanceScore: unknown): number`
- **Purpose:** Convert a 0–1 relevance score to a rounded 0–100 percent.
- **Behavior:** `Math.round(n*100)` when finite, else 0.

#### `getFitScoreClass(relevanceScore: unknown): string`
- **Purpose:** CSS class for the fit-score badge.
- **Behavior:** ≥90 green, ≥75 orange, ≥50 yellow, else red.
- **Calls:** `getFitScore()`.

#### `aiVendorHasRating(v: AISourcingVendor): boolean`
- **Purpose:** Whether the sourced vendor has rating data.
- **Behavior:** True when `avg_rating != null` and `review_count` truthy.

#### `resolvePinnedMaybeNoChoice(v, cache): 'No'|'Maybe'|null` (private)
- **Purpose:** Resolve a pinned vendor's No/Maybe choice from API fields or session cache.
- **Behavior:** Prefers normalized API `noMaybe`/`NoMaybe`/`no`; else looks up cache by vendorKey, `name:`, or `pin:` keys.
- **Calls:** `normalizeMaybeNoChoice()`.

#### `normalizeMaybeNoChoice(raw): 'No'|'Maybe'|null` (private)
- **Purpose:** Normalize free-form input to 'No'/'Maybe'/null.
- **Behavior:** Contains "maybe" → Maybe; `no`/`no …` → No; else null.

#### `enrichWithScores<T>(vendors: T[]): T[]` (private)
- **Purpose:** Merge scorecard data into vendor rows.
- **Behavior:**
  - Reads `vendorScores()`, `scoresLoading()`, `scoreAgentFailed()`.
  - No scores yet: return unchanged while loading (skeleton), else map all to `asUnscoredVendorRow` (N/A).
  - Per vendor by lowercased vendorKey: if absent and still loading → transient null tier (keep skeleton); if absent and done → tier `'N/A'`; if present → set score (null when N/A tier), tier (null while pending-unscored), workloadFlag, pillarScores, rank, completedJobs, flags, aiExplanation, unscoredRankScore, signalScores, signalExplanations, llmReasoning.
- **Calls:** `asUnscoredVendorRow()`.
- **Notes:** Careful anti-flicker logic — avoids flashing N/A before the 5/15/30/60s poll retries finish.

#### `asUnscoredVendorRow<T>(v: T): T` (private)
- **Purpose:** N/A stub display shape (per SCORECARD_RESPONSE_SPEC).
- **Behavior:** Sets score null, tier 'N/A', flags/scores empty/null, rank 0, completedJobs 0.

#### `onOpenScoreModal(row): void`
- **Purpose:** Open score-breakdown modal.
- **Behavior:** Sets `scoreModal` signal to the row.

#### `getScoreBarColor(val: number): string`
- **Purpose:** Bar fill color for a 0–100 value.
- **Behavior:** ≥90 #28cd41 green, ≥75 #ff8800 orange, ≥50 #ffc200 yellow, else #ff3b30 red.

#### `getScoreModalBars(row): Array<{label,value,color,explanation}>`
- **Purpose:** Ordered bar definitions for the score-modal chart.
- **Behavior:**
  - If tier is 'N/A'/null → use `signalScores`/`signalExplanations` with 5 signal bars (Distance, LLM Job Fit, Trade, Profile Compliance, Engagement).
  - Else → use `pillarScores` with 5 pillar bars (Cost, Dependability, System Use, Communication, Behavior).
  - Each bar rounds value, colors via `getScoreBarColor`, trims explanation.
- **Calls:** `getScoreBarColor()`.

#### `vendorStatusActions(vendor): VendorStatusAction[]`
- **Purpose:** Status-action buttons for a vendor card, with TriggerBit fallback when API omits `statusActions`.
- **Behavior:** Returns API `statusActions` if present. Else by `triggerBit`: 1/null → none; 4 or 17 → "Check-out tech yourself"; 6 or 66 → none; otherwise → "Check-in tech yourself".
- **Notes:** Legacy TriggerBit parity fallback.

#### `statusActionsAfterEtaConfirmed(vendor, isReturn): VendorStatusAction[]` (private)
- **Purpose:** Swap the manual-confirm button for a legacy "Admin confirmed" status label after ETA confirm.
- **Behavior:** Removes the manual action id; if a "confirmed" status label already exists returns as-is; else appends a `status_label` action.

#### `onVendorStatusAction(action, vendor): void`
- **Purpose:** Dispatch a vendor-card status action.
- **Behavior:** No-op if `isStatusLabel`. Switches on `actionId`:
  - `check_in_tech`→`onCheckInTech`; `check_out_tech`→`onCheckOutTech`; `view_vendor_estimate`→`openVendorEstimate`; `confirm_eta_manually`/`confirm_return_eta_manually`→`openConfirmEtaModal(_, isReturn)`; `approve_vendor` & `send_additional_approval_set_return_eta`→`openApproveVendorModal` (title varies); `request_approval_again`→`openCustomerEstimateForApproval`; `send_reminder_customer`→`openCustomerReminderModal`; default→`openVendorActionMailModal`.
- **Calls:** the above component methods.

#### `openVendorActionMailModal(vendor, action): void`
- **Purpose:** Load mail context and open the resend-vendor-action modal.
- **Behavior:** Resets vendor-action signals; calls `getVendorActionMailContext(jobVendorKey, actionId)`; on failure sets `errorMessage`; on success sets `vendorActionEmailNote` and `vendorActionModal`.
- **Calls:** `AssignVendorService.getVendorActionMailContext`.
- **Notes:** This is the generic path used for estimate-related actions (e.g. `estimate_upload_reject`).

#### `onCloseVendorActionModal(): void`
- Clears `vendorActionModal`, error, result HTML.

#### `toggleVendorActionContact(contactKey, checked): void`
- Adds/removes a contact key in `vendorActionSelectedContacts`.

#### `onSendVendorActionMail(): void`
- **Purpose:** Send the vendor-action email.
- **Behavior:**
  - Guards modal; requires ≥1 contact or custom email (else error).
  - Requires a note for `estimate_upload_reject` (rejecting an estimate for resubmission).
  - Resolves `estimateKey`: `'NoVal'` when selection required but none, `'NoESTIMATE'` for emailType 23/24, else selected.
  - Sends via `sendVendorActionMail`, on success sets result HTML then reloads job header; on failure sets error.
- **Calls:** `AssignVendorService.sendVendorActionMail`, `AssignVendorService.loadJobHeaderDetail`.
- **Notes:** emailType 23/24 special-cased; `estimate_upload_reject` requires message — this is the estimate reject-for-resubmission flow.

#### `openVendorEstimate(vendor): void`
- **Purpose:** Open the vendor estimate page.
- **Behavior:** Calls `getVendorEstimateNavigation` (unhighlights), then `window.open`s legacy `MgtVendorInvoice/EIndex/{jobKey}` (or returned path) in a new tab; error on failure.
- **Calls:** `AssignVendorService.getVendorEstimateNavigation`.

#### `openConfirmEtaModal(vendor, isReturn): void`
- Resolves default confirmed datetime via `resolveVendorScheduleDateTimeLocal`, sets `confirmEtaDraft`, clears error, opens `confirmEtaModal`.
- **Calls:** `resolveVendorScheduleDateTimeLocal()`.

#### `resolveVendorScheduleDateTimeLocal(vendor, isReturn): string` (private)
- Returns a datetime-local value: prefers `vendorScheduleDrafts` draft (return/normal), else vendor ISO via `toDateTimeLocalValue`, else parsed display via `parseDisplayScheduleToLocalValue`, else `currentDateTimeLocalValue`.

#### `currentDateTimeLocalValue(): string` (private)
- Formats "now" as `YYYY-MM-DDTHH:mm`.

#### `onCloseConfirmEtaModal(): void`
- Clears `confirmEtaModal` and error.

#### `onSaveConfirmEtaManually(): void`
- **Purpose:** Admin manually confirms (return) ETA.
- **Behavior:**
  - Guards modal and `confirmedDate`.
  - Sets saving; converts date via `toScheduleLocalIsoString` (error if invalid).
  - Calls `confirmReturnEtaManually` or `confirmEtaManually`; on success closes modal, patches vendor schedule status (etaConfirmedByAdmin true / byVendor false, or return variants) plus `statusActionsAfterEtaConfirmed`, shows 5s success toast, reloads job header.
- **Calls:** `AssignVendorService.confirmEtaManually`/`confirmReturnEtaManually`, `applyVendorScheduleStatusUpdate()`, `statusActionsAfterEtaConfirmed()`, `AssignVendorService.loadJobHeaderDetail`.

#### `openApproveVendorModal(vendor, title?): void`
- **Purpose:** Load approve-vendor context and open modal.
- **Behavior:** Calls `getApproveVendorContext`; errors if no context, or if `!hasWorkOrder`/`revVendorDne === -11` ("no work order for this vendor"). Seeds `approveVendorText` (prefixed "Approval To Proceed :"), clears note/email/contacts, selects first estimate key, opens modal with title.
- **Calls:** `AssignVendorService.getApproveVendorContext`.

#### `onCloseApproveVendorModal(): void`
- Clears modal + error.

#### `toggleApproveVendorContact(contactKey, checked): void`
- Toggles a key in `approveVendorSelectedContacts`.

#### `onSendAdditionalApproval(): void`
- **Purpose:** Send the additional-approval email.
- **Behavior:** Requires ≥1 contact or custom email; sets sending; calls `sendAdditionalApproval` with DNE values, approval text, workOrderKey, estimateKey; on success closes modal, 5s success toast, reloads job header; failure sets error.
- **Calls:** `AssignVendorService.sendAdditionalApproval`, `AssignVendorService.loadJobHeaderDetail`.

#### `openCustomerEstimateForApproval(): void`
- Guards jobKey; calls `getLatestCustomerEstimate`; errors if no estimate; else `window.open`s legacy nav path. (Handles `request_approval_again`.)
- **Calls:** `AssignVendorService.getLatestCustomerEstimate`.

#### `openCustomerReminderModal(vendor): void`
- Loads `getCustomerReminderContext`; errors if none; resets reminder signals; opens modal.
- **Calls:** `AssignVendorService.getCustomerReminderContext`.

#### `onCloseCustomerReminderModal(): void`
- Clears modal, error, result HTML.

#### `toggleCustomerReminderContact(contactKey, checked): void`
- Toggles a key in `customerReminderSelectedContacts`.

#### `onSendCustomerReminder(): void`
- Requires ≥1 contact or custom email; calls `sendCustomerReminder`; on success sets result HTML; failure sets error.
- **Calls:** `AssignVendorService.sendCustomerReminder`.

#### `setConfirmEtaDate(v): void` / `setConfirmEtaComment(v): void`
- Update `confirmEtaDraft` fields.

#### `onCheckInTech(v): void`
- Opens check-in modal: seeds `checkInDraft` (local ISO now, noOfTech 1), clears error/post-state, resets checkout-email state, sets `checkInModalVendor`.
- **Calls:** `resetCheckoutEmailContactState()`.

#### `onCloseCheckInModal(): void`
- Resets check-in modal + post-check-in + checkout email state.
- **Calls:** `resetCheckoutEmailContactState()`.

#### `resetCheckoutEmailContactState(): void` (private)
- Clears checkout-email contacts, selection set, loading, error.

#### `loadCheckoutEmailContacts(vendor): void` (private)
- Loads vendor contacts (`getVendorContactList`) for the post-check-in checkout-email step; filters to those with email; default-selects `isDefault` contacts (or the sole contact).
- **Calls:** `AssignVendorService.getVendorContactList`.

#### `toggleCheckoutEmailContact(contactKey): void`
- Toggles key in selection set; clears error.

#### `isCheckoutEmailContactSelected(contactKey): boolean`
- Membership check on selection set.

#### `onSaveCheckIn(): void`
- **Purpose:** Save admin check-in, then transition modal to "send checkout email?" step.
- **Behavior:** Guards vendor + `checkInDate`; sends `adminSaveCheckIn`; on success patches vendor (`isCheckedIn` true, statusActions [], triggerBit 4), sets `postCheckInState` with returned checkinKey, loads checkout email contacts, reloads job header; failure sets error.
- **Calls:** `AssignVendorService.adminSaveCheckIn`, `AssignVendorService.patchAssignedVendor`, `loadCheckoutEmailContacts()`, `AssignVendorService.loadJobHeaderDetail`.

#### `onSendCheckoutEmail(): void`
- Sends the checkout-link email (`adminSendCheckoutEmail`) to selected contacts; requires ≥1 contact; on success closes modal ("Not Now" path skips this).
- **Calls:** `AssignVendorService.adminSendCheckoutEmail`.

#### `onCheckOutTech(v): void`
- Opens checkout modal: seeds `checkOutDraft` (status 5, workPerformed true, blank details, local ISO now), sets vendor.

#### `onCloseCheckOutModal(): void`
- Clears checkout modal + error.

#### Field setters (one-liners)
- `setCheckInDate`, `setCheckInNoOfTech` (coerces `+v`), `setCheckOutWorkPerformed`, `setCheckOutDate`, `setCheckOutStatus`, `setCheckOutWorkDetails` — each `update`s its draft signal.
- **Notes:** Comment: arrow functions aren't usable in Angular templates, hence explicit methods.

#### `onSaveCheckOut(): void`
- Guards vendor + `checkOutDate`; sends `adminSaveCheckOut` (status/workPerformed/details/ISO date); on success closes modal, patches vendor (isCheckedIn false, activeCheckinKey null, statusActions []), reloads job header; failure sets error.
- **Calls:** `AssignVendorService.adminSaveCheckOut`, `AssignVendorService.patchAssignedVendor`, `AssignVendorService.loadJobHeaderDetail`.

#### `loadAndApplyScores(jobKey, expectedVendorKeys?): void` (private)
- **Purpose:** Fetch scorecard scores and update `vendorScores`, merging expected keys across grids rather than restarting per grid.
- **Behavior:** Lowercases/filters keys; if jobKey changed, resets poll state (stops poll, clears expected keys/scores/runUid/failed/active). Adds new keys to `expectedScoreVendorKeys`, updates loading state; starts polling only if not already active.
- **Calls:** `resolveExpectedScoreVendorKeys()`, `updateScoresLoadingState()`, `startScorePolling()`.

#### `startScorePolling(jobKey): void` (private)
- **Purpose:** Run the staggered scorecard poll sequence.
- **Behavior:** Stops prior poll; bumps `latestScoreLoadId`; delays `[0,5s,15s,30s,60s]` via `concatMap(timer)`; each calls `getScorecardScores`. Ignores stale loadIds; records `scoringRunUid`; merges scores; on `agentStatus==='failed'` finishes + sets `scoreAgentFailed`; finishes when all expected loaded; else updates loading state. On complete, finishes.
- **Calls:** `AssignVendorService.getScorecardScores`, `finishScorePolling()`, `areExpectedScoresLoaded()`, `updateScoresLoadingState()`.

#### `finishScorePolling(): void` (private)
- Sets `scorePollingActive` false, `scoresLoading` false.

#### `updateScoresLoadingState(): void` (private)
- If agent failed or not active → loading false; else loading = !allExpectedLoaded.
- **Calls:** `areExpectedScoresLoaded()`.

#### `resolveExpectedScoreVendorKeys(explicit?): string[]` (private)
- Returns explicit lowercased keys, else keys from `searchResults()` (or `defaultVendors()`).

#### `areExpectedScoresLoaded(): boolean` (private)
- True when every expected key has a displayable score entry.
- **Calls:** `isScoreEntryDisplayable()`.

#### `isScoreEntryDisplayable(score): boolean` (private)
- Displayable when tier ≠ 'N/A', or (N/A but) `unscoredRankScore != null`.

#### `getAiVendorSourceLabel(v): string`
- Maps sourced-vendor `sources`/rating into a label: "Verified directory" / "Membership directory" / "Web + reviews" / first two sources joined / ''.

#### `applyAIVendors(vendors): void` (private)
- Enriches each row with `_jobTrade` (from `tradeName()`) and `rank` (API rank or index+1); falls back email to first `website_enrichment.alternate_emails`; sets `aiSourcingVendors`.

#### `onRequestAISourcing(): void`
- Retry path: clears grid/error/polling, `clearAISourcingStatus()`, reruns `loadAISourcingData`.
- **Calls:** `AssignVendorService.clearAISourcingStatus`, `loadAISourcingData()`.

#### `onStartAISourcing(): void`
- Triggers a NEW sourcing request (`POST /api/sourcing/request` via `startSourcing`) then begins polling. Guards jobKey + `aiSourcingStarting`; clears status/grid; on failure sets error.
- **Calls:** `AssignVendorService.clearAISourcingStatus`, `AssignVendorService.startSourcing`, `loadAISourcingData()`.

#### `onOpenAIVendorInfo(row): void`
- Sets `selectedAIVendor`, shows AI info modal.

#### `openLegacyEstimatePage(): void`
- `window.open`s legacy `MgtVendorInvoice/EIndex/{jobKey}`.

#### `onOpenRecruitEmail(row): void`
- **Purpose:** Open the recruitment-email modal for a sourced vendor.
- **Behavior:** Sets vendor, default subject, resolved To address; fetches `getSupportContactInfo`, builds HTML body, shows modal, and after render patches the contenteditable via `patchRecruitEmailBodyEditorFromSignal` (`afterNextRender` with injector).
- **Calls:** `getRecruitEmailDefaultSubject()`, `resolveRecruitEmailAddress()`, `AssignVendorService.getSupportContactInfo`, `buildRecruitEmailBodyHtml()`, `patchRecruitEmailBodyEditorFromSignal()`.
- **Notes:** Explicitly avoids `[innerHTML]` binding to prevent caret reset on keystroke.

#### `getRecruitEmailDefaultSubject(): string`
- Returns the fixed time-sensitive subject line.

#### `resolveRecruitEmailAddress(v): string`
- Primary email or first alternate email or ''.

#### `getRowContactFormUrl(row): string` (private)
- Trimmed `website_enrichment.contact_form_url`.

#### `isRecruitEmailModalForRow(row): boolean` (private)
- True when the recruit modal is open for the same vendor as `row` (matches company name, email, contact-form URL) — so clipboard uses live edits.
- **Calls:** `getRowContactFormUrl()`.

#### `getPlainTextForContactFormClipboard(row): string`
- If modal open for this row → plain text from live `#recruit-body` DOM; else builds from template.
- **Calls:** `isRecruitEmailModalForRow()`, `clipboardPlainTextFromHtmlBody()`, `buildRecruitEmailBodyText()`.

#### `buildRecruitEmailBodyText(vendorRow): string`
- Builds HTML body (with default support contact fallback) then converts to plain text.
- **Calls:** `buildRecruitEmailBodyHtml()`, `clipboardPlainTextFromHtmlBody()`.

#### `buildRecruitEmailBodyHtml(vendorRow, contactInfo): string`
- **Purpose:** Build the full structured recruitment email HTML.
- **Behavior:** Pulls job header detail; computes trade/service type/details (`stripServiceRequestPhrasing`), emergency dispatch window, location lines, registration URL, support display; emits sectioned HTML (Service Opportunity, Overview, Location, Next Steps w/ registration link, About, Footer); collapses inter-tag whitespace.
- **Calls:** `stripServiceRequestPhrasing()`, `escapeHtml()`, `compactRecruitEmailInterTagWhitespace()`.

#### `patchRecruitEmailBodyEditorFromSignal(): void` (private)
- Writes `recruitEmailBody()` into `#recruit-body` innerHTML once after render.

#### `compactRecruitEmailInterTagWhitespace(html): string` (private)
- `>\s+<` → `><`, trims.

#### `clipboardPlainTextFromHtmlBody(html): string` (private)
- Converts email HTML to clipboard plain text via a DOM walk (`serializeRecruitEmailHtmlToPlainText`); normalizes nbsp/CRLF, trims trailing spaces, collapses 3+ newlines. SSR fallback strips tags with regex.
- **Calls:** `serializeRecruitEmailHtmlToPlainText()`.
- **Notes:** Deliberately avoids `innerText` on a detached node (browsers collapse block boundaries → run-on line).

#### `serializeRecruitEmailHtmlToPlainText(root): string` (private)
- Recursive DOM serializer inserting line breaks per block: text/CDATA passthrough, skip comments/style/script; `br`/`hr`→newline; `img`→alt+`\n\n`; `ul`/`ol`→one line per `li`; `pre` preserved; block tags (`p`,`h1`-`h6`,`blockquote`)→trimmed + `\n\n`; sibling-only `div` rows joined with `\n`.

#### `escapeHtml(text): string` (private)
- Escapes `& < > " '` (XSS-safe email body).

#### `cleanServiceRequestText(raw): string` (private)
- Strips "Service Request(details):" prefixes; normalizes whitespace.

#### `stripServiceRequestPhrasing(raw): string` (private)
- Like above but also removes all "service request" phrasing; falls back to "Work order and scope will be provided after you complete registration." when empty.

#### `htmlToPlainText(raw): string`  *(note: defined public, unusual indent at 9043)*
- Wraps HTML in a div, returns textContent normalized (nbsp/whitespace/newlines).

#### `extractHighlightedText(raw): string` (private)
- Returns text of first element with `background-color`/`background:` style (a highlighted span).

#### `formatJobLocationLine(hd): string` (private)
- Formats `"{name} {address} - {city}, {state} {zip}"` (or '—').

#### `getPreviewText(html, maxLength=150): string`
- Returns original html if plain-text length ≤ max, else truncated plain text + '...'.
- **Calls:** `htmlToPlainText()`.

#### `needsShowMore(html, maxLength=150): boolean`
- Plain-text length > max.
- **Calls:** `htmlToPlainText()`.

#### `onRecruitSubjectInput(event)` / `onRecruitToInput(event)` / `onRecruitBodyInput(event)`
- Set respective recruit-email signals from input/textarea value.

#### `onRecruitBodyHtmlInput(event): void`
- Sets `recruitEmailBody` from contenteditable `innerHTML`.

#### `onSendRecruitmentEmail(): void`
- **Purpose:** Send the recruitment/onboarding email and log an admin note.
- **Behavior:** Alerts if no recipient; builds `RecruitmentEmailRequest` (to/subject/body/company/registrationUrl); calls `sendRecruitmentEmail`; if `flag !== 1` → email_failed; else chains `saveGeneralAdminNote` ("Sent Vendor Onboarding Email — {company}"). On done alerts success, closes modal, warns if note-save failed; on transport error alerts.
- **Calls:** `AssignVendorService.sendRecruitmentEmail`, `AssignVendorService.saveGeneralAdminNote`.
- **Notes:** Uses `window.alert` (not toasts); "Onborading" typo in note comment.

#### `aiFormatHours(hours): string`
- Returns joined `weekday_descriptions`/`weekdayDescriptions`, else "See website for hours"/"Not available".

#### `aiWorkTypeLabel(val): string`
- commercial/residential/both → labels; else raw / "Not specified".

#### `onOpenContactFormCopyBody(event, contactFormUrl, vendorRow?): void`
- Prevents default; copies recruitment plain text (live editor when modal open for row) to clipboard; opens contact-form URL in new tab.
- **Calls:** `getPlainTextForContactFormClipboard()`, `clipboardPlainTextFromHtmlBody()`.

#### `getTimezoneForState(stateName): string`
- Maps US state name (lowercased) to a primary timezone label (ET/CT/MT/PT/AKT/HST); '' when unknown. Final method / end of class.

---

# Template Reference (`assign-vendor.component.html`)

## Quick-nav tabs

Driven by `activeNavTab()` + `scrollToSection(sectionId, tabKey)`; each badge is a live count.

| # | Tab | Badge |
|---|---|---|
| 1 | Job Details | — |
| 2 | Dispatching Agent | `assignedVendors.length` |
| 3 | Selected Vendors | `assignedVendors.length` |
| 4 | Previously Serviced | `locationHistoryVendors().length` |
| 5 | Sourcing Agent | `aiSourcingVendors().length` |
| 6 | Internal Vendors | `filteredInternalVendors().length` |
| 7 | Add Vendor | — |
| 8 | Notes & Activity | — (opens the Notes & Activity modal) |

## Accordions (6, `<app-accordion variant="figma">`)

1. **Job Details** (`section-job-details`, default open) — Job Management (info, status, AM, PO, dates, trade, NTE), Customer, Service Request & Instructions, Location (+ Store Hours + map).
2. **Selected Vendors** (`section-selected`) — vendor chips in the header; one vendor card at a time (contact / financial / schedule columns + status-action footer + on-site approval).
3. **Sourcing Agent** (`section-sourcing`, default closed) — AI external-vendor sourcing states + results table + Run/Re-Run.
4. **Add Vendor** (`section-add-vendor`) — Select Vendor + Vendor Search forms, action row, and "Vendors Who Previously Serviced This Location" sub-table.
5. **Internal Vendors / Scorecard Agent** (`section-internal-vendors`) — scored in-radius vendors, filter (All/Scored/Unscored), per-row score arcs.
6. **Pinned Vendors** — only when count > 0.

## Modals & popups (controlling signal → purpose)

| Modal | Signal | Purpose |
|---|---|---|
| AI Vendor Info | `showAIInfoModal` (+`selectedAIVendor`) | Detail card for an AI-sourced vendor |
| Recruit / Onboarding Email | `showRecruitEmailModal` (+`recruitEmailVendor`) | Send onboarding email to a sourced vendor |
| Quick Vendor Create | `showQuickVendorModal` (+`showDuplicateWarning`) | Onboard an outside vendor |
| Vendor Notes | `showNotesModal` | List / add / edit vendor notes |
| Notes & Activity | `showNotesActivityModal` | Full job notes & activity feature |
| Pin Vendor / Pin Note | `showPinModal` / `showPinNoteModal` | Pin (No/Maybe) a vendor / view its note |
| Broadcast Confirm | `showBroadcastConfirmModal` | "Vendors already assigned" keep/remove/cancel |
| Broadcast Config | `showBroadcastConfigModal` | ETA limit, expanded miles, additional trades |
| Broadcast (send) | `broadcastModalOpen` | Select vendors + files and broadcast |
| ETA Email | `showEtaEmailModal` | Send ETA-set notification email |
| Vendor Rates / Packet | `showRatesModal` / `showPacketModal` | Rate breakdown / registered vendor packet |
| Upline Approval | `showUplineModal` (+`showUplineOverrideSection`) | Customer-not-approved override gate |
| Wait Popup (3 min) | `showWaitPopup` | Blocking auto-assign / emergency-broadcast wait |
| Consolidator Precheck / Consolidator | `showConsolidatorPrecheckModal` / `showConsolidatorModal` | Consolidator gate + confirm |
| QC Dispatch Outcome | `showQcDispatchOutcomeModal` | QC-manager consolidator dispatch result |
| Primary Vendor / Default Vendor | `showPrimaryVendorModal` / `showDefaultVendorModal` | W/O primary + default decisions |
| Distance Exceeded | `showDistanceExceededModal` | Distant-vendor approval workflow |
| Work Order | `showWorkOrderModal` | Send & Select W/O — file selection + survey + email |
| DNE Warning | `showDNEWarningModal` | Proceed without changing DNE |
| Unassign All | `showUnassignAllModal` | Bulk cancellation before replace |
| New Trade | `showNewTradeModal` | Add the job trade to the selected vendor |
| Already Assigned | `showAlreadyAssignedModal` | Vendor already on the job |
| Assign Vendor (reassign) | `showAssignVendorModal` | Reassign inactive vendor (reset / no reset) |
| Reassign Inactive | `showReassignModal` | Reassign a previously-unassigned vendor |
| Unassign chain | `showUnassignBillExistsModal`, `showUnassignEstimateModal`, `showUnassignConfirmModal`, `showUnassignSelectDefaultModal` | Bill → estimate → confirm → select-new-default |
| Vendor Login Email | `loginEmailVendor` | Send vendor portal login email |
| Store Hours | `storeHoursModalOpen` | Location weekly hours |
| Job Priority Change | `jobPriorityChangeModalOpen` | DNE / response-time change confirmation |
| Duplicate Job | `duplicateModalOpen` | Duplicate job to another location |
| Construction Trades | `showTradeModal` | Vendor trade list |
| Check-In / Check-Out | `checkInModalVendor` / `checkOutModalVendor` | Admin check-in / check-out |
| Scorecard Score | `scoreModal` | Score breakdown (pillars or signals) |
| **Vendor Action Mail** | `vendorActionModal` | Resend vendor-action email **and vendor-estimate decline** (`actionId === 'estimate_upload_reject'` makes the note required) |
| Confirm ETA | `confirmEtaModal` | Manually confirm (return) ETA |
| Approve Vendor | `approveVendorModal` | Approve vendor estimate / additional approval |
| Customer Reminder | `customerReminderModal` | Send customer reminder email |
| On-Site Estimate Picker / Wizard | `onSiteEstimatePickerModal` / `<app-on-site-estimate-modal>` | Pick an on-site estimate / full estimate wizard component |

### Newer UI notes

- **Vendor estimate decline** is not a dedicated modal — it is the **Vendor Action Mail** modal on the `estimate_upload_reject` action, which requires an explanation ("Explain why the estimate is being rejected…") and posts through `sendVendorActionMail`. This rejects a vendor's uploaded estimate for resubmission.
- **Additional approval** is surfaced through the **Approve Vendor** modal (`sendAdditionalApproval` / `saveVendorApprovalData`) and the job-header `additionalApproval` text field in Service Request & Instructions.
- **File selection / approval** lives in the **Work Order** modal (job/location file checkboxes + dropzone) and the on-site estimate wizard (uploads).
- **Negotiation agent:** there is **no** negotiation/counter-offer UI or model in this component or `assign-vendor.model.ts`. Despite the "Negotiation agents" commit, that feature lives elsewhere in the app and is out of scope for this page.

---

# Service Reference (`assign-vendor.service.ts`)

~90 public methods across these API bases (primary base `apiBase = /api/v1/admin/job-vendor`):

**Page init / header:** `loadAssignVendorPage`, `checkUplineApproval`, `getCreateVendorContext`, `checkPrimaryVendorIntro`, `saveUplineOverride`, `loadJobHeaderDetail`, `patchAssignedVendor` (local stream patch, no HTTP).

**Grids / vendor lists:** `loadAssignedVendors`, `loadLocationHistoryVendors`, `loadPinnedVendors`, `loadVendorsNoRadius`, `loadVendorsInRadius`, `loadVendorsTradeRadius`, `loadVendorsLocationHistory`, `loadAllVendors`, `refreshAllGrids`.

**Scorecard:** `getScorecardScores`.

**Pin / notes / cancellation:** `sendCancellationEmail`, `addPinnedVendor`, `unpinVendor`, `unpinAllVendors`, `loadVendorNotes`, `saveVendorNote`, `saveGeneralAdminNote`.

**Broadcast:** `getBroadcastConfig`, `saveBroadcastConfig`, `getVendorsForBroadcast`, `broadcastToVendors`, `getJobFilesForBroadcast`.

**Dropdowns / duplicate / quick vendor:** `saveQuickVendor`, `checkDuplicateVendor`, `checkUploadedFiles`, `removeUploadedFiles`, `getActiveVendorsDropdown`, `getVendorContacts` / `getVendorContactList`, `getServiceCharge`, `getVendorRates`, `getRegisteredVendorPacket`, `getTradeDropdown`, `getStateDropdown`, `getCityDropdown`, `getCustomerLocations`, `duplicateJob`, `getCustomerProfileDne`.

**Send & Select W/O:** `checkForExistingVendor`, `checkForSameVendor`, `checkForPrimaryVendor`, `checkVendorTrade`, `addTradeToVendor`, `checkIfVendorAlreadyAssigned`, `getVendorDNE`, `saveVendorToJob`, `saveVendorToJobWithFiles` (multipart), `sendWorkOrderEmail`, `sendToPrimaryVendor`, `checkIfVendorIsConsolidator`, `sendMailQcManagerConsolidatorDispatch`, `getJobFiles`, `getLocationFiles`, `convertETAToVendorDate`.

**Schedule / status / ETA:** `updateVendorScheduleDates`, `sendEtaSetNotification`, `updateVendorJobStatus`, `confirmEtaManually`, `confirmReturnEtaManually`.

**Job field edits:** `getJobStatusList`, `getCustomerRequestorOptions`, `updateJobTrade`, `updateJobCustomerRequestor`, `getAccountManagerOptions`, `updateJobAccountManager`, `getJobPriorityOptions`, `updateJobJobType`, `getJobPriorityVendorCheck`, `getJobPriorityChangePreview`, `sendVendorLoginEmail`, `updateServiceRequestInstructions`, `updateNte`, `updateVendorDne`.

**AM survey / ML capture:** `getAccountManagerSurveyItems`, `saveWorkOrderVendorSurvey`.

**Unassign / cancellation (`vendor-cancellation` base):** `sendBulkCancellation`, `sendBulkCancellationWithEmail`, `setVendorAsDefault`, `reassignVendorFromInactive` / `reassignFromInactive`, `checkIfVendorBillExist`, `checkIfThereIsAnyPendingApproval`, `checkForMoreThan1Vendor`, `checkIfThisIsTheDefaultVendor`, `getVendorsExceptDefault`, `unassignDefaultVendorAndPromote`, `unassignVendorWithEmail`, `handleEstimateAndUnassign` (`unassignVendor` / `setOtherVendorDefault` deprecated).

**AI sourcing (`/api/sourcing`):** `startSourcing` (POST request), `getSourcingStatus`, `getSourcingVendors`, `saveSourcingVendorEmail`, `clearAISourcingStatus` (local).

**Support / recruitment:** `getSupportContactInfo`, `sendRecruitmentEmail`.

**Distant vendor (`distant-vendor` base):** `checkDistanceRule`, `createDistantVendorApprovalRequest`, `getDistantVendorApprovalDetails`, `processDistantVendorApproval`, `processDistantVendorDecline`.

**Admin check-in/out (`checkinout` base):** `adminGetCheckInStatus`, `adminSaveCheckIn`, `adminSendCheckoutEmail`, `adminSaveCheckOut`.

**Vendor status action / estimate (`vendor-status-action` base):** `getVendorEstimateList`, `getVendorActionMailContext`, `sendVendorActionMail` (includes estimate reject/decline), `getVendorEstimateNavigation`, `getLatestCustomerEstimate`, `getApproveVendorContext`, `sendAdditionalApproval`, `setVendorEstimateToApproved`, `getCustomerReminderContext`, `sendCustomerReminder`.

**On-site approval estimate wizard (`on-site-approval` base):** `initializeOnSiteEstimate`, `checkOnSiteEstimateStatus`, `saveOnSiteEstimate`, `getCustomerDneCalculation`, `submitOnSiteEstimateForCustomerApproval`, `createCustomerEstimate`, `getCustomerEstimate`, `sendCustomerEstimateEmail`, `updateCustomerEstimate`, `approveOnSiteVendorEstimate`, `loadEstimateForEdit`, `updateOnSiteEstimate`, `uploadOnSiteEstimateFiles`, `getOnSiteEstimateFiles`, `deleteOnSiteEstimateFile`, `getVendorRatesLegacy`, plus customer-markup reads (`getAllCustomerMarkups`, `getCustomerMarkupByKey`, `getCustomerMarkupByJobKey`, `getCustomerMarkupStatistics`).

**Additional approval / tech check / WO email:** `saveVendorApprovalData`, `checkBeforeCheckout`, `checkBeforeCreateInvoice`, `saveTechCheckIn`, `saveTechCheckOut`, `getEmailWorkOrderCompose`, `sendEmailToVendor`.

## Key model types (`assign-vendor.model.ts`)

- **API wrapper:** `AssignVendorApiResponse<T>`, `ApiErrorDetail`, `DataReturn`.
- **Page/header:** `AssignVendorPage`, `CreateVendorContext`, `CustomerProfileDne`, `JobHeaderDetail`, `AssignedVendorDetail`, `VendorStatusAction`, `JobStatusOption`, `CustomerRequestorOption`, `JobPriorityOption`, `JobPriorityChangePreview`, `JobPriorityVendorCheck`, `UpdateNteRequest`, `UpdateServiceRequestInstructionsRequest`.
- **Vendor lists:** `VendorListItem`, `LocationHistoryVendor`, `VendorDropdownOption`, `VendorContactOption`, `VendorRates`, `RegisteredVendorPacket`, `QuickVendorRequest`, `VendorNoteItem`, `SendVendorLoginEmailRequest`.
- **Assign / W-O:** `SaveVendorToJobRequest`, `SaveVendorToJobWithFilesRequest`, `SendWorkOrderEmailRequest`, `UpdateVendorScheduleDatesRequest`, `SetVendorAsDefaultRequest`, `ReassignVendorFromInactiveRequest`, `JobFileItem`, `LocationFileItem`, `SetEtaEmailPromptResponse`, `SendEtaSetEmailRequest`.
- **Broadcast / duplicate:** `BroadcastConfigDto`, `SaveBroadcastConfigRequest`, `BroadcastVendorOptionDto`, `BroadcastToVendorsRequest`, `BroadcastJobFileDto`, `CustomerLocationOptionDto`, `DuplicateJobRequest`, `DuplicateJobResultDto`.
- **AI sourcing:** `AISourcingVendor`, `AISourcingStatus`, `AIWebsiteEnrichment`, `UpdateSourcedVendorEmailRequest`, `RecruitmentEmailRequest`, `SupportContactInfo`, `SaveGeneralAdminNoteRequest`.
- **Scorecard:** `VendorScorecardScore`, `VendorScorecardScoresLookup`, `VendorWorkloadFlag`.
- **Unassign checks:** `VendorBillCheckResult`, `PendingApprovalCheckResult`, `VendorRadioOption`, `UnassignDefaultVendorAndPromoteRequest`, `UnassignVendorWithEmailRequest`, `HandleEstimateAndUnassignRequest`.
- **Check-in/out:** `AdminSaveCheckInRequest`, `AdminSendCheckoutEmailRequest`, `AdminSaveCheckOutRequest`.
- **Vendor status action / estimate / decline:** `VendorActionMailContext`, `VendorActionEstimateOption`, `SendVendorActionMailRequest` (carries the decline note via the `estimate_upload_reject` action), `ConfirmEtaManuallyRequest`, `VendorEstimateNavigation`, `VendorEstimateListResult`, `LatestCustomerEstimate`.
- **Approval:** `ApproveVendorContext`, `SendAdditionalApprovalRequest`, `CustomerReminderContext`, `SendCustomerReminderRequest`.
- **ML capture:** `AccountManagerSurveySetupItem`, `AccountManagerSurveyWorkOrderSaveRequest`, `DisplayedVendorCapture`.
- **On-site estimate** (`on-site-estimate.model.ts`): full estimate wizard request/response set (`SaveOnSiteEstimateRequest`, `CreateCustomerEstimateRequest`, `SubmitForCustomerApprovalRequest`, `ApproveVendorEstimateRequest`, `UpdateEstimateRequest`, line-item types, `CustomerMarkupResponse`, etc.).

## Source files

| Layer | Path |
|---|---|
| Route | [`src/app/app.routes.ts`](../src/app/app.routes.ts) |
| Component | [`src/app/features/job/assign-vendor/assign-vendor.component.ts`](../src/app/features/job/assign-vendor/assign-vendor.component.ts) |
| Template | [`src/app/features/job/assign-vendor/assign-vendor.component.html`](../src/app/features/job/assign-vendor/assign-vendor.component.html) |
| Styles | [`src/app/features/job/assign-vendor/assign-vendor.component.scss`](../src/app/features/job/assign-vendor/assign-vendor.component.scss) |
| Service | [`src/app/services/assign-vendor.service.ts`](../src/app/services/assign-vendor.service.ts) |
| Models | [`src/app/models/assign-vendor.model.ts`](../src/app/models/assign-vendor.model.ts), [`on-site-estimate.model.ts`](../src/app/models/on-site-estimate.model.ts) |
| On-site estimate modal | [`src/app/shared/components/on-site-estimate-modal/`](../src/app/shared/components/on-site-estimate-modal/) |
| Notes & Activity | [`src/app/features/job/notes-activity/`](../src/app/features/job/notes-activity/) |
| Spec / E2E | `assign-vendor.component.spec.ts`, `assign-vendor-e2e-integration.spec.ts` |
