# Live Chat feature

Global **Chats** panel: opening the FAB loads the **vendor-scoped inbox** first (each row = **vendor + job**, or **General** for messages with no vendor on that job). **Tap a row** to open that thread. **New** (top right) opens a job by GUID when it is not listed yet.

## API (Job Ops)

| Call | Purpose |
|------|--------|
| `GET /api/v2/job-chat/conversations` | Threads with activity: grouped by **`(jobKey, vendorKey)`**; `vendorKey` null → **General**; includes `vendorLabel` + `jobLabel`. |
| `GET /api/v2/job-chat/jobs/{jobKey}/messages?thread=…` | Messages for a thread: omit `thread` or `thread=all` → entire job; `thread=general` → lines with null `vendorKey`; `thread={vendorGuid}` → that vendor’s lines. |
| `POST /api/v2/job-chat/jobs/{jobKey}/messages` | Staff post (`body`, optional `vendorKey` — must be on the job when set). |

All require **admin JWT** (`authInterceptor` on the SPA).

**Real-time:** `/hubs/job-chat` — after loading a thread, the widget calls **`JoinJob(jobKey, threadVendorKey)`** (null = general group); server pushes **`JobChatMessage`** to the matching **(job, vendor thread)** group after `POST`. JWT via `access_token`.

## Files

| File | Role |
|------|------|
| `live-chat-widget.component.*` | Vendor + job inbox rows, thread, SignalR per thread. |
| `live-chat.service.ts` | HTTP + `thread` query on `getMessages`. |
| `job-chat-signalr.service.ts` | Hub `JoinJob` / `LeaveJob` with vendor thread key. |

## Next

- Vendor sender + tighter job access rules if product requires them.
- Optional: **Azure SignalR** (`AddAzureSignalR`) for scale-out behind multiple instances.
