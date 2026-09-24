# Plan: Business-Hours Auto-Select for Dispatch Attachments

## Background

Spec requirement (paraphrased): when dispatching a job to a vendor during business
hours (Mon–Fri, 9am–5pm America/New_York), all customer-supplied attachments should
be **automatically checked** for sending, but the admin can still uncheck/remove any
before sending. "Customer Work Order" is no longer a sendable attachment type at all.
Attachments should render as large thumbnail/preview cards instead of small checkbox
rows. After-hours automatic broadcast (no human in the loop) is a **separate,
backend-owned trigger** that is out of scope here — when it fires, it must always
send all customer-supplied attachments unconditionally, which is naturally satisfied
because there's no UI gate in that path to begin with.

This plan covers **frontend only**. There is no existing business-hours / auto-broadcast
/ scheduler logic anywhere in this repo — this is net-new.

See `CONTEXT.md` → "Dispatch attachments (Work Order modal & Broadcast modal)" for the
resolved vocabulary (sendable attachment, customer-supplied attachment, business hours).

## Decisions already made (do not re-litigate)

1. **Scope**: frontend-only. No cron/scheduler/after-hours-detection code is being built here.
2. **Business hours**: client-side clock, converted to `America/New_York`, Mon–Fri 9am–5pm
   (Sat/Sun always after-hours regardless of time). Evaluated **once** per file-list load
   event — not a live timer, not re-checked at send time.
3. **"Customer-supplied attachment"**: since none of `JobFileItem`, `LocationFileItem`,
   `BroadcastJobFileDto` has a real source/provenance flag, treat **every** sendable
   attachment in these lists as customer-supplied. Auto-select = select all of them.
4. **Customer Work Order removal**: fully filter it out of the list (not shown, not just
   disabled) — apply the same `documentTypeName !== 'CUSTOMER WORK ORDER'` /
   `fileType !== 'CUSTOMER WORK ORDER'` filter already used elsewhere, but currently
   missing from `woLocationFiles`.
5. **UI**: replace checkbox-row lists with a grid of large thumbnail cards. Real image
   preview for image files; real PDF preview (`<object type="application/pdf">` or
   equivalent) for PDFs, falling back to a static file-type icon if the embed fails to
   load or errors. Each card shows a checked/selected affordance the admin can toggle.
6. **Auto-select timing**: each file list auto-selects the instant its own data arrives
   (job files select as soon as they resolve; location files select ~4s later when
   *their* slower call resolves) — no waiting for both lists together.
7. **Scope of modals**: apply this to **both** the single-vendor Work Order modal
   (`woJobFiles` / `woLocationFiles`) and the multi-vendor Broadcast modal
   (`broadcastFiles`).
8. **Code sharing**: extract a shared `isBusinessHours()` utility and a shared,
   reusable thumbnail-grid presentational component used by both modals, rather than
   duplicating the logic/markup twice.

## Relevant existing code (facts, from exploration)

- `src/app/features/job/assign-vendor/assign-vendor.component.ts`
  - Work Order modal signals: `woJobFiles` (`JobFileItem[]`), `woLocationFiles`
    (`LocationFileItem[]`), `woSelectedJobFileKeys` (`string[]`),
    `woSelectedLocationFileKeys` (`string[]`) — lines ~613–618.
  - `woLoadDNEAndShowModal()` (~6837–6882): loads job files fast (~44ms), filters out
    `CUSTOMER WORK ORDER` at line 6867, then calls `woLoadLocationFiles()`.
  - `woLoadLocationFiles()` (~6889–6907): loads location files slower (~4s), overlays
    `documentTypeName`/`fileUrl` from the broadcast-files map — **no** Customer Work
    Order filter applied here yet.
  - `onToggleJobFile` / `onToggleLocationFile` (~6917–6960): toggle via array
    include/filter on the `string[]` signals.
  - Broadcast modal: `broadcastFiles` (`BroadcastJobFileDto[]`),
    `broadcastSelectedFileKeys` (`Set<string>`) — note this one already uses a `Set`,
    unlike the Work Order modal's `string[]`.
  - `openBroadcastModal()` (~1632–1642) resets selection, calls `loadBroadcastFiles()`.
  - `loadBroadcastFiles()` (~1644–1659): already filters `CUSTOMER WORK ORDER` at
    line 1655.
  - `toggleBroadcastFile` / `selectAllBroadcastFiles` / `deselectAllBroadcastFiles`
    (~1661–1674).
- `src/app/features/job/assign-vendor/assign-vendor.component.html`
  - Work Order modal file checkboxes: ~lines 3080–3146 (`wo-file-checkbox-row`,
    `wo-file-checkbox-group`).
  - Broadcast modal file list: search for `broadcastFiles()` / `broadcastSelectedFileKeys`.
- Models: `src/app/models/assign-vendor.model.ts`
  - `JobFileItem` / `LocationFileItem` (~1064–1080): `{ fileKey, fileName, fileType, fileUrl }`.
  - `BroadcastJobFileDto` (~1561–1568): `{ fileKey, title, documentTypeName, addedOn, addedByName, fileUrl }`.

## Implementation steps

### 1. Shared business-hours utility
- New file: `src/app/shared/utils/business-hours.util.ts` (or similar shared location —
  match existing shared-utils conventions if any exist; otherwise create the file).
- Export `isBusinessHours(date: Date = new Date()): boolean`:
  - Use `Intl.DateTimeFormat` with `timeZone: 'America/New_York'` to get the hour
    (`hour12: false`) and weekday abbreviation.
  - Return `true` only if weekday is Mon–Fri and hour is in `[9, 17)`.
- No live timer/interval anywhere — this is called once per invocation site.

### 2. Shared thumbnail-grid component
- New standalone component, e.g.
  `src/app/shared/components/attachment-thumbnail-grid/attachment-thumbnail-grid.component.ts`.
- Generic input shape (adapter, not tied to any one DTO):
  ```ts
  interface AttachmentCardFile {
    fileKey: string;
    fileName: string | null;
    fileUrl: string | null;
    fileType: string | null; // used for icon/type detection
  }
  ```
- `@Input() files: AttachmentCardFile[]`
- `@Input() selectedKeys: string[]` (or accept a `Set<string>` — pick one and adapt both
  call sites; recommend `string[]` for consistency with the Work Order modal's existing
  signals, with the Broadcast modal's `Set` converted to/from array at the call site)
- `@Output() toggle = new EventEmitter<{ fileKey: string; checked: boolean }>()`
- `@Output() view = new EventEmitter<AttachmentCardFile>()` (opens fileUrl in new tab,
  reusing the existing `onViewJobFile` / `onViewBroadcastFile` pattern)
- Template: CSS grid of cards. Per card:
  - If `isImage(file)` (extension check: jpg/jpeg/png/gif/webp/bmp) → `<img [src]="file.fileUrl">`.
  - Else if `isPdf(file)` (extension `.pdf` or fileType indicates PDF) → attempt
    `<object [data]="file.fileUrl" type="application/pdf" (error)="onPreviewError(file.fileKey)">`;
    track failed keys in a local `Set`/signal and fall back to a static file icon when
    the key is in that set.
  - Else → static generic file-type icon.
  - Checkbox/selected-state indicator overlay + filename label.
  - Clicking the card (or its checkbox) toggles selection via the `toggle` output.

### 3. Work Order modal wiring (`assign-vendor.component.ts` / `.html`)
- In `woLoadDNEAndShowModal()`'s subscribe (where `woJobFiles` is set, ~line 6867):
  after filtering out `CUSTOMER WORK ORDER`, if `isBusinessHours()`, set
  `woSelectedJobFileKeys` to all resulting `fileKey`s. If not business hours, leave
  selection empty (unchanged legacy behavior — nothing pre-selected outside business
  hours for manual dispatch).
- In `woLoadLocationFiles()` (~6889–6907):
  - Add the same `.filter(lf => lf.fileType !== 'CUSTOMER WORK ORDER')` before the
    `.map(...)` that overlays doc type/fileUrl.
  - After `this.woLocationFiles.set(...)`, if `isBusinessHours()`, set
    `woSelectedLocationFileKeys` to all resulting `fileKey`s.
- Replace the checkbox-row markup at `assign-vendor.component.html:~3080-3146` with two
  `<app-attachment-thumbnail-grid>` instances (one for job files, one for location
  files), wiring `(toggle)` to the existing `onToggleJobFile` / `onToggleLocationFile`
  handlers and `(view)` to the existing `onViewJobFile` handler (add an equivalent for
  location files if one doesn't already exist).

### 4. Broadcast modal wiring
- In `loadBroadcastFiles()` (~1644–1659): after the existing Customer Work Order
  filter, if `isBusinessHours()`, call `selectAllBroadcastFiles()` (already exists,
  ~1667–1670) to select everything; otherwise leave `broadcastSelectedFileKeys` empty
  (as `openBroadcastModal()` already resets it to `new Set()` before load).
- Replace the Broadcast modal's file list markup with
  `<app-attachment-thumbnail-grid>`, adapting `broadcastSelectedFileKeys` (a `Set`) to
  the array shape the component expects at the template boundary (e.g.
  `[selectedKeys]="[...broadcastSelectedFileKeys()]"`), and wiring `(toggle)` to
  `toggleBroadcastFile(fileKey)` and `(view)` to `onViewBroadcastFile`.

### 5. Verify
- Manually test in-browser (per project convention — start dev server, exercise the
  flow):
  - Open Work Order modal during business hours → confirm all non-Customer-Work-Order
    job files and location files render as thumbnail cards, pre-checked; uncheck one,
    confirm it's excluded from send.
  - Mock/force `isBusinessHours()` to return `false` (e.g. temporarily hardcode in a
    local test, or test outside 9–5 EST) → confirm nothing is pre-checked but all
    files are still visible/selectable.
  - Confirm no "Customer Work Order" row appears in either modal's file list at all.
  - Confirm PDF thumbnails render a real preview when reachable, and gracefully fall
    back to an icon when `fileUrl` is broken/unreachable (test with a bad URL).
  - Repeat the above for the Broadcast modal.

## Explicitly out of scope

- Any backend/API work: detecting after-hours, triggering automatic broadcast,
  cron/scheduler infrastructure. This plan assumes that trigger already exists or is
  being built elsewhere, and that when it fires, it sends all customer-supplied
  attachments with no frontend involvement at all.
- Any new backend field for real attachment provenance (e.g. `isCustomerUpload`) — not
  needed under the "treat everything as customer-supplied" decision above.
- Re-checking business hours at send time or live-updating selection if the modal
  spans the 9am/5pm boundary while open.
