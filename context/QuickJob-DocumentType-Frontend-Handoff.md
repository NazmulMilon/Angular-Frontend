# Quick Job — Document Type Selection: Frontend Handoff

> Goal: let the user pick a document type per attached file when creating a
> Quick Job, the same way legacy lets you save "Before Pictures," "Invoice,"
> "Contract," etc. — not just one fixed type.
> Backend changes already merged. This doc tells the frontend what to call and
> what to send.

---

## 1. Where the dropdown values come from

**Do not hardcode a list of document types in the frontend.** Document types
are admin-configurable per company (`SetupController` lets admins add new
ones — see `context/JobFile-DocumentType-GET-POST-Handoff.md`), so the list
must always come from the API.

`GET /api/v1/admin/quick-job/form-data` (already called once when the Quick
Job form loads) now includes a new field:

```jsonc
{
  "data": {
    // ...existing fields (customers, trades, priorities, etc.)...
    "documentTypes": [
      { "text": "Before Pictures", "value": "3f2a....-...." },
      { "text": "After Pictures",  "value": "9c1b....-...." },
      { "text": "Invoice",         "value": "a01d....-...." }
      // one entry per DocumentType row where DocumentForID = 1 (Jobs),
      // IsDelete = 0, scoped to this company
    ]
  }
}
```

Shape: `OptionGuidValueDto[]` — `{ text: string, value: guid-string }`. Same
shape as `customers`, `trades`, etc., so it should slot into whatever
dropdown component you're already using for those.

Use this list to populate a **per-file** "Document Type" dropdown in the file
upload UI — every entry in that list is valid and should be selectable, there
is no subset to filter out.

---

## 2. Uploading a file with its chosen type

`POST /api/v1/admin/quick-job/temp-files` (multipart/form-data) stages files
before the job exists (keyed server-side to the logged-in admin). It now
accepts an extra field:

| Form field | Type | Required | Notes |
|---|---|---|---|
| `files` (or `file`) | file[] | yes | unchanged — the uploaded bytes |
| `documentTypeKeys` | guid[] | **new, optional but should always be sent** | one entry per uploaded file, **matched by array index** |

**Index-matching is positional**, not keyed by filename — so append
`documentTypeKeys` entries in the exact same order you append `files`. Example
with `FormData`:

```js
const form = new FormData();
for (const item of stagedItems) {           // stagedItems: [{file, documentTypeKey}, ...]
  form.append("files", item.file);
  form.append("documentTypeKeys", item.documentTypeKey ?? "");
}
await fetch("/api/v1/admin/quick-job/temp-files", { method: "POST", body: form });
```

If a file is uploaded with no `documentTypeKey` (empty/omitted), the backend
falls back to a generic "Attachment" document type rather than rejecting the
upload — so the type picker can default to unselected without blocking the
upload, but the UI should still prompt/require a real selection before the
user finalizes the job if you want parity with legacy's required-type
behavior.

---

## 3. Reflecting the chosen type back in the staged-file list

`GET /api/v1/admin/quick-job/temp-files` already returns each staged file's
type so you can show it (and let the user change it before finalizing, if you
build that):

```jsonc
{
  "data": [
    {
      "fileKey": "...",
      "title": "before_photo.jpg",
      "fileName": "before_photo.jpg",
      "fileType": "image/jpeg",
      "documentTypeKey": "3f2a....-....",
      "documentTypeName": null,   // not currently populated server-side; use documentTypeKey to look up the label from documentTypes
      "addedOn": "2026-07-13T..."
    }
  ]
}
```

Note: `documentTypeName` is present in the DTO but not populated by the
server today — resolve the display label client-side by matching
`documentTypeKey` against the `documentTypes` list from form-data.

`DELETE /api/v1/admin/quick-job/temp-files/{fileKey}` is unchanged — removes
one staged file.

---

## 4. What happens on job creation

`POST /api/v1/admin/quick-job` (create the job) is unchanged in its request
shape — file staging happens beforehand via `temp-files`. When the job is
created, every staged file for that admin is promoted to a real `JobFile` row
carrying whichever `documentTypeKey` was set at staging time. No frontend
change needed here beyond having already staged files with the right type.

---

## 5. Known gaps (not yet implemented, flagged for awareness)

These are legacy behaviors the Quick Job upload path does **not** yet
replicate — call them out if the user asks, but they don't block wiring up
"pick a document type per file":

- **Image resize/JPEG re-encode** before upload — not implemented.
- **Location Attachment special case** — legacy also writes a
  `LocationAttachement` row when the chosen document type is the specific
  "Location Attachment" type (`D0D45070-2298-4655-9B42-D5C99582F7B9`). Not
  implemented. If that type appears in the `documentTypes` dropdown and a
  user picks it, the file will save as a normal `JobFile` only.

---

## Summary of endpoint/DTO changes for the frontend

| Endpoint | Change |
|---|---|
| `GET /api/v1/admin/quick-job/form-data` | Response now includes `documentTypes: OptionGuidValueDto[]` |
| `POST /api/v1/admin/quick-job/temp-files` | Accepts new optional multipart field `documentTypeKeys: guid[]`, index-matched to `files` |
| `GET /api/v1/admin/quick-job/temp-files` | Response items already had `documentTypeKey`/`documentTypeName` — `documentTypeKey` is now actually populated when sent on upload |
