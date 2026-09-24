# Negotiating Agent — Integration Spec (Backend + Frontend V2 + Mobile)

**For:** Backend · Frontend V2 · Vendor Mobile  
**Base URL:** `https://rfi-negotiating-agent.wittyground-446a537e.eastus2.azurecontainerapps.io/api/v1`  
**Auth:** `X-API-Key` header on every endpoint  
**API Key:** `2dadefbd6dcde292f17e2dd565b52d9c11332b57eed29b9022fadc0fcd73591a`  
**Date:** July 2, 2026  
**Phase:** 1  
**Status:** Live and working

---

## 0. The one principle that governs everything

**In Phase 1 the agent _thinks_ and _remembers_. It does not _act_ on the vendor.**

- It **thinks** — when an estimate arrives, it produces a per-line recommendation (floor / target / ceiling + a suggested counter value).
- It **remembers** — it records what the admin decided and what round the negotiation is on, in **its own PostgreSQL**.

Every real-world action — notifying the vendor, delivering the counter, escalating to the customer, cancelling the job — is performed by **the backend / web / mobile**, which already have those buttons and workflows. The agent only needs to be *told* (via the endpoints below) so its state stays accurate.

What this means :

- **The agent never contacts the vendor or customer directly.** "Send the counter" = *record it + advance state + return the values*. **The backend delivers it.**
- **The agent only writes to its own PG, never to the RFI/prod DB.** If you want the output in your DB, **you persist it** (see §6).
- **Both web and mobile integrate against the backend, not the agent.** Mobile does **not** talk to the agent directly. The backend is the single caller of the agent's endpoints; it relays to both surfaces. 
- **Wherever an action is initiated — mobile or web — it must be relayed to the agent.** The agent is surface-agnostic: it doesn't care which UI the action came from, it just needs to be told so it can process it and keep its state correct. A vendor submitting from mobile, an admin entering an estimate on the web, an admin clicking a decision button — each must result in a call to the matching agent endpoint. **The agent already has every field it needs** to process the negotiation (see §2); nothing extra is required from you beyond relaying these calls. The optional `created_by` field (`"vendor"` / `"admin"`) is the only thing that tells the agent where it originated.
- **Phase 2** is when the agent gets wired to *act* (auto-send counters through RFI workflows). Not now.

---

## Table of Contents

1. [The lifecycle in one picture](#1-the-lifecycle-in-one-picture)
2. [What you send to the agent (request fields)](#2-what-you-send-to-the-agent-request-fields)
3. [The endpoints you integrate](#3-the-endpoints-you-integrate)
4. [Response payloads](#4-response-payloads)
5. [Real-time: the admin WebSocket](#5-real-time-the-admin-websocket)
6. [How the agent's output reaches you and the state-refresh rule](#6-how-the-agents-output-reaches-you-and-the-state-refresh-rule)
7. [Multiple vendors on one job](#7-multiple-vendors-on-one-job)
8. [Error handling and retries](#8-error-handling-and-retries)
9. [Edge cases](#9-edge-cases)
10. [Timing and quick reference](#10-timing-and-quick-reference)
11. [Admin button to agent endpoint mapping](#11-admin-button-to-agent-endpoint-mapping)

---

## 1. The lifecycle in one picture

### Happy path — vendor submits, admin negotiates, vendor approves

```
STEP 1 — Estimate submitted
   Frontend V2 (or mobile) ──► Backend ──► POST /api/v1/proposals
                                            ├─► 201 { proposal_id, status: "submitted" }
                                            │
                                            │   (agent runs recommender in background ~3–8s)
                                            │
                                            ├─► Agent pushes "recommendations.ready" on admin WebSocket
                                            │
                                            └─► Backend calls GET /api/v1/proposals/{id}/recommendations
                                                 └─► 200 { per-line floor/target/ceiling, suggested_value, flags, reasoning }

STEP 2 — Admin reviews and sends counter
   Frontend V2 ──► Backend ──► POST /api/v1/proposals/{id}/counter
                                { round_number: 1, actions: [{line_item_id, action, value}...], notes_to_vendor, admin_user_id }
                                ├─► 200 { counter_total, dne_status, profit_tier, margin_pct }
                                │
                                └─► Backend takes the counter values from this response
                                    and delivers them.

STEP 3 — Vendor responds
   Frontend V2 (or mobile) ──► Backend ──► POST /api/v1/proposals/{id}/respond
                                            { action: "approve_and_proceed", vendor_id: "..." }
                                            └─► 200 { status: "approved", final_total: 970.00 }
                                                 Done. Negotiation complete.
```

### Vendor pushes back (edit and send back) — multi-round

```
STEP 3 (alt) — Vendor edits and sends back
   Frontend V2 (or mobile) ──► Backend ──► POST /api/v1/proposals/{id}/respond
                                            { action: "edit_and_send_back", vendor_id: "...", line_items: [...] }
                                            └─► 200 { status: "awaiting_vendor", round_number: 2 }

   → Agent re-analyzes the new line items (background ~3–8s)
   → "recommendations.ready" fires again on WebSocket
   → Backend calls GET /api/v1/proposals/{id}/recommendations (fresh round 2 suggestions)
   → Back to STEP 2 (admin reviews, counters again)

   … repeats until: vendor approves / admin cancels / max_rounds reached / timeout expires …
```

### Admin cancels the negotiation

```
   Frontend V2 ──► Backend ──► POST /api/v1/proposals/{id}/cancel
                                { admin_user_id: "...", reason: "Vendor left site" }
                                └─► 200 { status: "declined" }
                                     Terminal. Negotiation over.
```

### Admin defers ("vendor, leave site — we'll resume later")

```
   Frontend V2 ──► Backend ──► POST /api/v1/proposals/{id}/defer
                                { admin_user_id: "..." }
                                └─► 200 { status: "deferred", deferred_at: "..." }
                                     Non-terminal. Proposal stays alive.
                                     Resume later by sending a new POST /counter when ready.
```

### Admin rejects for resubmission (vendor must start fresh)

```
   Frontend V2 ──► Backend ──► POST /api/v1/proposals/{id}/reject-for-resubmission
                                { admin_user_id: "...", reason: "Completely unreasonable estimate" }
                                └─► 200 { status: "rejected_for_resubmission" }
                                     Terminal for THIS proposal.
                                     Vendor can submit a brand-new estimate (new POST /proposals) for the same job.
```

### Customer DNE escalation (counter exceeds customer's price ceiling)

```
   When a counter would breach the customer DNE, POST /counter returns
   dne_status = "needs_escalation" or "hard_block". Surface this to the admin.
   Admin/backend handles customer communication using V2's existing tools.

   When the customer answers, relay it to the agent:

   Frontend V2 ──► Backend ──► POST /api/v1/proposals/{id}/customer-response
                                { escalation_id: "...", response: "approved", new_dne_ceiling: 3500.00 }
                                └─► 200 { next_action: "...", resolved_at: "..." }
                                     Negotiation resumes under the new ceiling.

   OR if customer declines:
                                { escalation_id: "...", response: "declined" }
                                └─► Agent pushes the vendor lower or routes to admin.
```

### Reading state at any time

```
   GET /api/v1/proposals/{id}                  → full current state (status, totals, line items, latest counter)
   GET /api/v1/proposals/{id}/recommendations  → AI per-line suggestions for the current round
   GET /api/v1/proposals                       → list/dashboard (filter by status, vendor_id, job_id)
```

### Timeout — vendor never responds

```
   (Internal — no external call needed)

   Agent's timeout poller checks every 60s.
   Standard jobs: expire after 120 min of no vendor response.
   Emergency jobs: expire after 60 min.

   When expired:
   → status = "expired" (terminal)
   → Backend can detect this on the next GET /proposals/{id} or via Service Bus event "negotiation.completed"
```

> **These timeouts are configurable on the agent side** — they live in `negotiation_policy.json` and can be changed without a code deploy. If you need different values (e.g. longer for projects, shorter for after-hours), let me know and Ill update + restart it's a config.

---

> **Mobile works identically.** Every flow above applies whether the action originates from the Frontend V2 (web admin) or the vendor mobile app. The backend is the single gateway — it relays to the agent regardless of source. The agent is surface-agnostic; it never knows or cares which UI triggered the call.

---

Everything keys off **`proposal_id`**. One proposal = one negotiation = one PG row. Any surface (web, mobile, multiple tabs) hits the same endpoint → same row, so nothing drifts. Concurrent writes are protected by optimistic locking.

---

## 2. What you send to the agent (request fields)

### 2.1 Submit a proposal — `POST /proposals`

**What it is:** the entry point. Call this once, the moment a vendor submits an on-site estimate (or an admin enters one on the vendor's behalf). It hands the agent the vendor's line items + the job context so the agent can analyze them and produce its recommendation.

**When you call it:** as soon as the estimate exists on your side.

**What happens:** the agent saves the estimate, returns `201` in ~150ms, and produces its recommendation in the background. The recommendation (per-line suggested counter) is **not** in this response — you read it from `GET /recommendations` (see §4.3) once it's ready.

> **Why submit and recommendation are two separate calls (not one inline response):** the recommendation isn't a one-time output — it **regenerates every round**. Each time the vendor edits and sends back, the agent re-analyzes and produces a fresh recommendation for the new round. So there's no single "final" recommendation to return inline; it's a moving target across rounds. A read endpoint to fetch *"the latest round's recommendation"* is therefore needed regardless. Folding round 1 into the POST response wouldn't remove the GET — it would just make the flow inconsistent (round 1 inline, rounds 2+ via GET). Keeping it as one read endpoint means the same call works for every round. (You don't have to poll for it — the `recommendations.ready` WebSocket ping in §5 tells you the moment it's ready, then you do a single GET.)

**The fields below** are everything the agent uses to negotiate. The backend has all the key fields available on every job in rcsdb — send them all. Fields marked **Yes** are enforced by the agent (missing → 422). Fields marked **Send always** are optional in the agent's validator but are available in rcsdb on 96–100% of jobs and directly improve recommendation quality — treat them as required in your integration.

```json
{
  "job_id": "786C2C85-93A1-4CDC-AB2C-FA1F7C96B5A8",
  "vendor_id": "1FE7D264-A39A-4257-8215-C4CA020550D7",
  "line_items": [
    { "item_code": "TRAVEL",   "item_description": "Trip Charge",                  "quantity": 1, "unit": "each", "rate": 75,  "total": 75,  "incurred": false, "notes": "" },
    { "item_code": "LABOR",    "item_description": "Diagnose issue",               "quantity": 1, "unit": "hour", "rate": 120, "total": 120, "incurred": false, "notes": "1hr diagnostic" },
    { "item_code": "LABOR",    "item_description": "Rebuild flush valve assembly", "quantity": 6, "unit": "hour", "rate": 120, "total": 720, "incurred": true,  "notes": "corroded internals" },
    { "item_code": "MATERIAL", "item_description": "Flush valve kit + supply line","quantity": 1, "unit": "each", "rate": 285, "total": 285, "incurred": true,  "notes": "" }
  ],
  "notes": "Need full kit replacement — corroded beyond repair.",
  "customer_dne": 3000.00,
  "job_type": "Standard",
  "trade_key": "D3C651BA-B703-466F-8C31-7293DC5778FD",
  "trade_name": "PLUMBING",
  "job_description": "Tenant restroom — flush valve leaking, water pooling at base of fixture.",
  "state_code": 44,
  "invoice_no": "13185"
}
```

> **Reading the `incurred` values in this example (raw prod-DB polarity):** the Trip Charge and the diagnostic hour are work *already performed* — in the prod DB their `CostIncurred` bit is `0`, so you send `incurred: false` and the agent passes them through untouched. The flush-valve rebuild and the material kit are the *proposed* future work — DB bit `1`, so you send `incurred: true` and the agent negotiates them. This looks backwards on purpose; it mirrors the DB exactly (full explanation in the ⚠️ callout below the field table). Send the column as-is.

| Field | Type | Required | Notes |
|---|---|---|---|
| `job_id` | string (UUID) | **Yes** | Normalized to lowercase. |
| `vendor_id` | string (UUID) | **Yes** | Normalized to lowercase. |
| `line_items` | array | **Yes** | ≥ 1 item. Each validated (below). |
| `line_items[].item_code` | string | **Yes** | One of: `TRAVEL, LABOR, MATERIAL, EQUIPMENT, OTHER, DISPOSAL, PERMIT, SUBCONTRACTOR, MARKUP`. |
| `line_items[].item_description` | string | **Yes** | 1–500 chars. |
| `line_items[].quantity` | float | **Yes** | > 0. |
| `line_items[].unit` | string | Optional | One of `each, hour, sqft, lf, unit`. Default `each`. Agent doesn't use this for calculations — purely display. Fine to omit. |
| `line_items[].rate` | float | **Yes** | ≥ 0. |
| `line_items[].total` | float | **Yes** | ≥ 0. **Must equal `quantity × rate` (±$0.01)** or the whole request is rejected with 422. |
| `line_items[].incurred` | bool | **Yes** | Send the **raw prod-DB `CostIncurred` bit, untransformed**. ⚠️ The DB stores it inverted vs its name, so on the wire `true`=proposed, `false`=already-spent — the agent flips it internally (see callout below). Don't convert it. |
| `line_items[].notes` | string | **Yes** | ≤ 1000 chars. Per-line vendor note — whatever the vendor typed to justify this line item (e.g. "corroded internals, full rebuild required"). Send `""` (empty string) if the vendor didn't write anything for that line. The LLM uses this to assess whether the line is justified. |
| `notes` | string | **Yes** | Vendor's overall on-site justification note. ≤ 2000 chars. This is the vendor's free-text reason for the whole visit (e.g. "Found deeper rust hole — need full kit replacement"). Send `""` if vendor didn't write one. The LLM weighs this heavily when deciding how aggressively to counter. |
| `customer_dne` | float | **Yes** | Customer Do-Not-Exceed ceiling. Absence/0/NULL forces every counter to `needs_escalation` — the agent cannot check the price ceiling without this. |
| `job_type` | string | **Yes** | Controls pricing tier. `emergency`/`priority` → 75% start + stricter markup. Pass the value as-is — the agent normalizes it. |
| `trade_key` | string (UUID) | **Yes** | Drives peer benchmarking — without it the agent falls back to national (less precise) benchmarks. |
| `trade_name` | string | **Yes** | Display + LLM context. |
| `job_description` | string | **Yes** | Fed to the LLM to compare scoped-vs-proposed work. Strip HTML tags before sending. ≤ 2000 chars. |
| `state_code` | int | **Yes** | Drives state-level peer benchmarks — without it falls back to national. |
| `invoice_no` | string | **Yes** | Display + lookup. Always present on on-site approvals. |
| `original_scope` | string | Situational | The original work-order description that was dispatched to the vendor — what the vendor was *originally* asked to do. **Only send this when the vendor's estimate represents a scope change** (vendor found additional work beyond what was dispatched). The agent uses it to negotiate only the *delta* between original scope and vendor's new ask, rather than the whole estimate. Omit for standard estimates where the vendor is pricing the originally-dispatched work. The backend knows this context — it's the original dispatch description. |
| `created_by` | `"vendor"`/`"admin"` | Situational | Tells the agent who entered this estimate. Default `"vendor"` (vendor submitted from mobile). **Send `"admin"` only when an admin is manually entering the estimate on the vendor's behalf** (e.g. vendor called in verbally, vendor's phone is down). When `"admin"`, the agent skips vendor-facing auto-messages (the vendor didn't submit digitally, so "we received your estimate" makes no sense). The backend knows which flow triggered the call — it's not a DB field. |
| `option_label` | string | Situational | **Only for multi-option estimates** — when a vendor submits two or more options (e.g. "Option A - Repair $800" and "Option B - Full Replace $2400") and the admin picks one. Send the label of the selected option so the agent can display which option is being negotiated. Most estimates are single-option and this is omitted. The backend/frontend handles the option selection UI; the agent only sees the chosen option's line items. |

> **Summary:** Every field marked **Yes** is needed for the agent to negotiate at full capacity — send them all, always. `line_items[].notes` and `notes` can be empty strings `""` when the vendor didn't write anything, but always include them. The one **Optional** field (`unit`) is purely display — fine to omit entirely. The three **Situational** fields only apply to specific scenarios; when in doubt, omit them.

> ### ⚠️ Important — the `incurred` flag: send it exactly as the prod DB stores it
>
> **Send `incurred` straight from the prod DB's `CostIncurred` column — untransformed. Do NOT
> flip or convert it on your side. The agent handles the correction internally.**
>
> Here's the situation. In the prod DB, this flag is stored in a column whose **values are the
> opposite polarity to what its name suggests** — a line the DB labels *"Proposed"* carries the
> bit = `1`, and a line labeled *"Incurred / Work Incurred (After Hours/ER)"* carries `0`. This was
> confirmed systemic (not a one-off) across 55,977 estimate lines. Rather than requiring any change
> on your side, **the agent normalizes it** at ingestion.
>
> So the contract is simple:
>
> | You send `incurred` = the DB's raw bit | The line actually is | The agent does |
> |---|---|---|
> | `true`  (DB bit `1`) | PROPOSED / future work | **negotiates it** |
> | `false` (DB bit `0`) | already-INCURRED / spent | **passes it through (never countered)** |
>
> Yes — on the wire `incurred: true` means "proposed" and `false` means "already spent," which
> reads backwards. That's fine and intended: it mirrors exactly how your DB stores it, so you send
> the column value with **zero transformation** and the agent flips it to the correct meaning
> internally (single normalization at `LineItemRequest`). The agent already handles this correction —
> you don't need to do anything except send the DB value as-is.
>
> **Why it's handled this way:** so the backend doesn't have to change how it reads or maps the
> column — you already pull it from the DB, just pass it through. The agent owns the polarity fix.

### 2.2 Admin counter — `POST /proposals/{id}/counter`

**What it is:** how the admin's decision gets recorded. After the admin reviews the AI's per-line recommendation and decides — accept / edit / decline on each line — call this to send those decisions to the agent.

**When you call it:** when the admin clicks "Send Counter" (or the equivalent) after reviewing the lines.

**What happens:** the agent records each line decision, persists it for ML training, runs its internal DNE + profit checks, and advances the negotiation state to `counter_sent`. **The primary purpose of this endpoint is state-tracking and ML data collection** — your backend already handles vendor communication and cost logic independently. The response includes some computed fields (see §4.4) that you can use or ignore — they're informational, not required for your workflow.

**Key rules to know:**

- **There are no per-line accept/edit/decline endpoints — there is only this one call.** The per-line ✓ / Edit / ✗ buttons in the UI are **local UI state**: clicking them just records "this line = accept/edit/decline" in the browser. Nothing is sent to the agent on those clicks. Only when the admin clicks **"Send Counter"** does the frontend bundle *all* the per-line choices into the `actions[]` array below and post them in this **single** call. (Same for "Accept All" — it just sets every line to `accept` in the UI, then the one call carries them.) So don't look for per-line endpoints to wire — there aren't any; map the buttons to building this one request.
- **One `action` per proposed line, covering all of them, in one call.** A proposal's lines are either *incurred* (already-spent — trip charge, a diagnostic hour already done) or *proposed* (negotiable). **Incurred lines are never countered** — omit them; the agent passes them through at the vendor's value automatically. For every *proposed* line you must send exactly one `action`. The counter is a complete round — the agent recomputes the whole counter total + DNE check from all proposed lines at once, so it needs a decision for each. Missing a proposed line → `400 MISSING_ACTIONS`; including an incurred or unknown line → `400 UNKNOWN_LINE_ITEMS`.
- **`round_number` is a safety lock:** it must equal the current `rounds_count + 1`. If two admins act at once, the first wins and the second gets `409 stale_round` (reload, recompute, resubmit). This prevents two people from countering the same round.
- **Value rules per action:** an **accept**'s `value` must match the AI's `suggested_value` for that line; a **decline**'s must match the vendor's original line total; an **edit** can be any value. Mismatches → 422. (These guards catch accidental wrong values — see §8.)

```json
{
  "round_number": 1,
  "actions": [
    { "line_item_id": "...", "action": "accept",  "value": 480.00, "qty": 4.0, "notes": null },
    { "line_item_id": "...", "action": "edit",    "value": 220.00, "qty": null, "notes": "matched supplier pricing" },
    { "line_item_id": "...", "action": "decline", "value": 75.00,  "qty": null, "notes": null }
  ],
  "notes_to_vendor": "We've adjusted your pricing. Can you complete for this?",
  "admin_user_id": "ADMIN-UUID"
}
```

| Field | Required | Rule |
|---|---|---|
| `round_number` | **Yes** | Must equal `rounds_count + 1`. Wrong number → `409 stale_round` (reload, recompute, resubmit). |
| `actions[].line_item_id` | **Yes** | Must be a proposed (non-incurred) line on this proposal. |
| `actions[].action` | **Yes** | `accept` / `edit` / `decline`. |
| `actions[].value` | **Yes** | **accept** → must equal the recommendation's `suggested_value`. **decline** → must equal the vendor's original `total`. **edit** → any value ≥ 0. Mismatches → 422. |
| `actions[].qty` | Optional | Optional adjusted quantity. |
| `notes_to_vendor` | Optional | Message to the vendor (backend delivers it). |
| `admin_user_id` | **Yes (Phase 1)** | Who decided. |

### 2.3 Vendor response — `POST /proposals/{id}/respond`

**What it is:** how you tell the agent what the vendor did after they saw the counter. The vendor has two choices: approve, or edit-and-send-back (push back with revised lines).

**When you call it:** when the vendor taps "Approve and Proceed" or "Edit and Send Back" (relayed from mobile/Web through the backend).

**What happens:**
- `approve_and_proceed` → the negotiation is **done** (status `approved`); the response includes the final agreed total.
- `edit_and_send_back` → the agent treats the supplied `line_items` as the vendor's new full estimate, starts the next round, and re-analyzes — so a fresh recommendation generates, and you're back to the admin step (§2.2). You send the **complete current line set** here, not a diff — the agent replaces, it doesn't merge.

```json
// Approve
{ "action": "approve_and_proceed", "vendor_id": "1FE7D264-..." }

// Edit & send back (full current line set — agent does not diff, it replaces)
{
  "action": "edit_and_send_back",
  "vendor_id": "1FE7D264-...",
  "line_items": [ /* same line-item shape as §2.1 */ ],
  "notes": "Reduced labor but materials are firm."
}
```

`vendor_id` must match the proposal. `edit_and_send_back` requires `line_items`.

### 2.4 Customer escalation response — `POST /proposals/{id}/customer-response`

**What it is:** the agent's way of learning the customer's decision when a counter would exceed the customer's DNE (price ceiling). In that situation the agent pauses the proposal at `awaiting_customer` and waits.

**When you call it:** after the customer answers (via Email, SMS link, app, or a CAS rep recording it) — only when the proposal is in `awaiting_customer`.

**What happens:** the agent records the decision and resumes. On `approved` (optionally with a higher `new_dne_ceiling`), it continues the negotiation under the new ceiling; on `declined`, it keeps pushing the vendor down or routes to the admin. The agent never contacts the customer itself — the backend owns that; this endpoint just feeds back the answer.

```json
{ "escalation_id": "...", "response": "approved", "customer_notes": "Go ahead", "new_dne_ceiling": 3500.00 }
```

`response` is `approved` or `declined`. `new_dne_ceiling` optional on approve.

---

## 3. The endpoints you integrate

**Core write (3) — these drive the negotiation:**

| Endpoint | Caller | What it does |
|---|---|---|
| `POST /proposals` | backend (vendor submitted) | Persists the estimate, runs the recommender in the background, returns `201` instantly. |
| `POST /proposals/{id}/counter` | backend (admin decided) | **Records** the decision, runs DNE/profit checks, advances state to `counter_sent`, returns the counter values. **Does not contact the vendor.** |
| `POST /proposals/{id}/respond` | backend (vendor replied) | Approve → terminal; edit → new round + re-analyze. |

**Read (display state):**

| Endpoint | Purpose |
|---|---|
| `GET /proposals/{id}` | Full current proposal state + latest-round line items + latest counter. |
| `GET /proposals/{id}/recommendations` | Per-line floor/target/ceiling + suggested counter (`202` while still generating). |
| `GET /proposals` | Dashboard list, filter by `status` / `vendor_id` / `job_id`, paginated. |

**state-sync hooks — the agent does NOT perform the real-world action; wire each to fire when your existing button (or equivalent functionality) is clicked so the agent's record stays accurate:**

| Endpoint | What it does to the agent's state | Where this maps in the frontend |
|---|---|---|
| `POST /proposals/{id}/takeover` | Marks `takeover` — AI stops on this proposal. | No button exists for this today. This is a Phase 2 concept (admin overrides autonomous AI). Ignore in Phase 1. |
| `POST /proposals/{id}/cancel` | Marks `declined` (terminal). | Maps to the "Not Approved / Decline" option in the Manage Estimate dropdown. |
| `POST /proposals/{id}/defer` | Marks `deferred` (non-terminal; resumes later). | Maps to any "send vendor away / pause for later" action if one exists. If no defer button exists today, ignore. |
| `POST /proposals/{id}/reject-for-resubmission` | Marks terminal; vendor may submit a fresh estimate for the same job+vendor. | Maps to "Change Order Requested" or similar — when you want the vendor to start over with a new estimate. |
| `POST /proposals/{id}/customer-response` | Records the customer DNE decision and resumes. | Maps to the outcome of "Request DNE Increase from Customer" / "Get More Approval from Customer" — call this when the customer answers (approved or declined). |


---

## 4. Response payloads

### 4.1 `POST /proposals` → `201`

```json
{
  "proposal_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "submitted",
  "vendor_total": 1200.00,
  "proposed_total": 1005.00,
  "incurred_total": 195.00,
  "n_lines": 4,
  "n_proposed_lines": 2,
  "dne_status": null,
  "created_at": "2026-06-24T14:30:00Z",
  "message": "Proposal received. Recommendations generating."
}
```

Duplicate retry → `200` with `"is_duplicate": true` and the existing `proposal_id`. A *different* estimate while one is active → `409 ACTIVE_PROPOSAL_EXISTS`.

| Field | Type | What it is |
|---|---|---|
| `proposal_id` | string (UUID) | The agent's ID for this negotiation — use it in every later call. |
| `status` | string | `submitted` (recommendation generating). |
| `vendor_total` | float | Vendor's total across all lines. |
| `proposed_total` | float | Sum of the negotiable (non-incurred) lines. |
| `incurred_total` | float | Sum of the incurred (pass-through) lines. |
| `n_lines` | int | Total line count. |
| `n_proposed_lines` | int | How many lines are negotiable. |
| `dne_status` | string \| null | `null` here (computed at counter time, not submit). |
| `created_at` | datetime | When the proposal was created. |
| `message` | string | Human-readable status note. |
| `is_duplicate` | bool | Only present (and `true`) on a `200` duplicate-retry response. |

### 4.2 `GET /proposals/{id}` → `200`

**This is the main "show me everything the agent has done on this proposal" call.** It returns the full current state of one negotiation — where it is, the running totals, the policy verdicts, every line item for the latest round, and the latest counter that was sent. The Frontend V2 reads this to render the negotiation screen, and re-reads it whenever the proposal changes (see §6). It is always the authoritative source of truth.

```json
{
  "proposal_id": "a1b2c3d4-...", "job_id": "...", "vendor_id": "...",
  "status": "counter_sent",
  "vendor_total": 1200.00, "proposed_total": 1005.00, "incurred_total": 195.00,
  "final_total": null, "rounds_count": 1,
  "dne_status": "safe", "profit_tier": "standard_1k_to_5k", "margin_pct": 72.5,
  "customer_dne": 3000.00, "job_type": "standard", "trade_name": "D3C651BA-...(trade_key UUID — see note below)",
  "created_by": "vendor", "option_label": null,
  "deferred_at": null, "submitted_at": "...", "first_counter_at": "...", "resolved_at": null,
  "line_items": [ { "line_item_id": "...", "round_number": 0, "actor": "vendor",
    "item_code": "LABOR", "item_description": "...", "quantity": 6, "unit": "hour",
    "rate": 120, "total": 720, "incurred": false, "notes": "..." } ],
  "latest_counter": { "round_number": 1, "total_value": 853.50,
    "notes_to_vendor": "...", "sent_at": "...", "vendor_response": null }
}
```

**Top-level fields:**

| Field | Type | What it is |
|---|---|---|
| `proposal_id` | string (UUID) | The agent's ID for this negotiation. Everything keys off this. |
| `job_id` | string (UUID) | The rcsdb job this estimate is for. |
| `vendor_id` | string (UUID) | The vendor who submitted. |
| `status` | string | Where the negotiation is right now (full list below). |
| `vendor_total` | float | The vendor's current asking total (all lines, latest round). |
| `proposed_total` | float | Sum of the **negotiable** (non-incurred) lines only. |
| `incurred_total` | float | Sum of the **incurred** (already-spent, never-countered) lines. |
| `final_total` | float \| null | The agreed total once the negotiation is **approved**. `null` until then. |
| `rounds_count` | int | How many counter rounds have happened. **This is the version marker** — if it changed, your cached copy is stale (see §6). |
| `dne_status` | string \| null | Customer price-ceiling verdict on the latest counter: `safe` / `needs_escalation` / `hard_block`. `null` before the first counter. |
| `profit_tier` | string \| null | Which profit-margin band the deal falls in (e.g. `standard_1k_to_5k`). Set at counter time. |
| `margin_pct` | float \| null | RFI's margin % on the latest counter. Set at counter time. |
| `customer_dne` | float \| null | The customer's Do-Not-Exceed ceiling, as you sent it. `null` if not provided. |
| `job_type` | string \| null | The job type (`standard` / `emergency` / etc.). |
| `trade_name` | string \| null | Returns the trade_key UUID — trade_name is not persisted by the agent. Use your own trade lookup keyed by `trade_key` for display. |
| `created_by` | string \| null | `vendor` or `admin` — who entered the estimate. |
| `option_label` | string \| null | Label for multi-option estimates (e.g. "Option A - Repair"), if any. |
| `deferred_at` | datetime \| null | When the proposal was deferred, if it was. |
| `submitted_at` | datetime | When the estimate was first submitted. |
| `first_counter_at` | datetime \| null | When the first counter was sent. `null` until then. |
| `resolved_at` | datetime \| null | When the negotiation reached a terminal state (approved/declined/expired). `null` while active. |
| `line_items` | array | The line items for the **latest** round (see below). |
| `latest_counter` | object \| null | The most recent counter the admin sent (see below). `null` if no counter yet. |

**`line_items[]` — each line item:**

| Field | Type | What it is |
|---|---|---|
| `line_item_id` | string (UUID) | The line's ID — use this in the `actions[]` of `POST /counter`. |
| `round_number` | int | Which round this line belongs to (0 = original submission). |
| `actor` | string | Who created the line: `vendor` or `admin`. |
| `item_code` | string | `TRAVEL` / `LABOR` / `MATERIAL` / `EQUIPMENT` / `OTHER` / `DISPOSAL` / `PERMIT` / `SUBCONTRACTOR` / `MARKUP`. |
| `item_description` | string \| null | The vendor's text for the line. |
| `quantity` | float | Hours / units / etc. |
| `unit` | string | `each` / `hour` / `sqft` / `lf` / `unit`. |
| `rate` | float | Per-unit rate. |
| `total` | float | Line total (`quantity × rate`). |
| `incurred` | bool | **Normalized (semantic) value** — `true` = already-spent, never countered (passed through); `false` = proposed/negotiable. ⚠️ Note this is the *opposite* polarity to what you **send** on submit: the agent flips the raw prod-DB bit at ingestion (NM-39), so here `incurred` reads in its natural meaning. Don't echo this straight back into a submit — submit always takes the raw DB bit (see §2.1). |
| `notes` | string \| null | Per-line note. |

**`latest_counter` — the last counter sent (null if none yet):**

| Field | Type | What it is |
|---|---|---|
| `round_number` | int | Which round this counter was. |
| `total_value` | float | The counter's full total (counter + incurred). |
| `notes_to_vendor` | string \| null | The message the admin attached for the vendor. |
| `sent_at` | datetime | When it was sent. |
| `vendor_response` | string \| null | What the vendor did with it: `approved` / `edited` / `null` (not responded yet). |

**`status` — every value you may see, and what it means:**

| `status` | Meaning | Whose turn |
|---|---|---|
| `submitted` | Just received; recommendation generating. | agent (working) |
| `reviewing` | Agent is analyzing. | agent (working) |
| `awaiting_admin` | Recommendation ready — admin needs to decide. | **admin** |
| `counter_sent` | Counter sent; waiting on the vendor's reply. | **vendor** |
| `awaiting_vendor` | Vendor edited; agent re-reviewing the new round. | agent (working) |
| `awaiting_customer` | Counter would breach the customer DNE — paused for customer approval. | **customer** |
| `deferred` | Admin paused it ("not today"); resumes later. Non-terminal. | paused |
| `approved` | Terminal — vendor approved; `final_total` is set. | done |
| `declined` | Terminal — cancelled by admin. | done |
| `expired` | Terminal — timed out with no response. | done |
| `takeover` | Admin took manual control; the AI stopped on this proposal. | admin (manual) |
| `rejected_for_resubmission` | Terminal for this proposal; the vendor may submit a fresh one. | vendor (new estimate) |

> **What "negotiation completed" looks like:** when `status` is `approved` (or `declined` / `expired`), the negotiation is over. On `approved`, read `final_total` (the agreed amount), `resolved_at` (when), `rounds_count` (how many rounds it took), and `latest_counter` (the final terms the vendor accepted). The savings = `vendor_total − final_total`.


### 4.3 `GET /proposals/{id}/recommendations` → `200` (or `202` while generating)

**This is what the agent _recommends_ the admin counter on each line.** Call it after submit (and again after every vendor edit) to render the per-line AI suggestion the admin reviews. Returns `202` while still generating (poll, or wait for the `recommendations.ready` ping), then `200` with one entry per line plus a proposal-level `summary`.

```json
{
  "proposal_id": "a1b2c3d4-...",
  "round_number": 0,
  "recommendations": [
    {
      "line_item_id": "...", "item_code": "LABOR", "item_description": "Rebuild flush valve assembly",
      "vendor_value": 720.00, "suggested_value": 480.00, "suggested_qty": 4.0,
      "floor": 360.00, "ceiling": 600.00, "confidence": 0.72, "delta_pct": -33.3,
      "reasoning": "Median labor for this repair in TX is 3.5–4.5h at $120/hr; 6h is 35% above peer median.",
      "flags": [ { "type": "red", "code": "hours_inflated", "detail": "Vendor claims 6h; peer median 3.8h" } ],
      "position_guidance": "low", "layer1_source": "trade_job_type", "counter_this_line": true,
      "explanation": { "numbers": { "vendor_ask": 720, "floor": 360, "target": 480, "ceiling": 600, "counter": 480, "delta_pct": -33.3 }, "layers": { "...": "..." }, "policy": { "applied": ["..."], "starting_pct": 0.85 } }
    },
    {
      "line_item_id": "...", "item_code": "MATERIAL", "item_description": "pre-hung steel exterior door + frame + paint + install materials",
      "vendor_value": 1800.00, "suggested_value": 1350.00, "suggested_qty": null,
      "floor": 1350.00, "ceiling": 1800.00, "confidence": 0.56, "delta_pct": -25.0,
      "reasoning": "Vendor asked $1800.00. Peer benchmark [trade_state] (peer median $30.97) from 26 peer jobs. Confidence gate (NM-42): peer data for this line is not reliable (scope_mismatch:58.1x), so the counter was limited to a conservative -25% off the ask and flagged for manual review rather than slammed to an unjustifiable floor.",
      "flags": [
        { "type": "info", "code": "materials_above_cap", "detail": "Materials line $1800.00 is 5712% above peer median $30.97. (possible benchmark mismatch, not confirmed padding — NM-42)" },
        { "type": "info", "code": "low_confidence_counter", "detail": "Peer data for this line is not reliable (scope_mismatch:58.1x). Counter limited to a conservative -25% and flagged for manual review. Falling back to the confidence-gated safety net until benchmark quality improves. Not a confirmed-padding signal.", "trigger": "scope_mismatch:58.1x", "cap_pct": 0.25 }
      ],
      "position_guidance": "floor", "layer1_source": "trade_state", "counter_this_line": true,
      "explanation": { "numbers": { "vendor_ask": 1800, "floor": 1350, "target": 30.97, "ceiling": 1800, "counter": 1350, "delta_pct": -25.0 }, "layers": { "...": "..." }, "policy": { "applied": ["starting_offer_pct:85%", "counter_confidence_gate:capped_at_25pct"], "starting_pct": 0.85 } }
    },
    {
      "line_item_id": "...", "item_code": "TRAVEL", "item_description": "Trip Charge",
      "vendor_value": 75.00, "suggested_value": 75.00, "suggested_qty": null,
      "floor": 75.00, "ceiling": 75.00, "confidence": 1.0, "delta_pct": 0.0,
      "reasoning": null, "flags": [], "position_guidance": null,
      "layer1_source": "incurred_passthrough", "counter_this_line": false
    }
  ],
  "summary": { "vendor_proposed_total": 1005.00, "suggested_counter_total": 675.00,
    "target_pct": 0.85, "dne_status": "safe", "overall_confidence": 0.68 },
  "generated_at": "...", "processing_ms": 4200
}
```

| Field | Type | Notes |
|---|---|---|
| `proposal_id` | string (UUID) | The proposal these recommendations belong to. |
| `round_number` | int | Which round these are for (0 = original). |
| `recommendations` | array | One entry per line item (fields below). |
| `summary` | object | Proposal-level roll-up (fields below). |
| `generated_at` | datetime | When the agent produced these. |
| `processing_ms` | int | How long the analysis took. |

**`recommendations[]` — each line:**

| Field | Type | What it is |
|---|---|---|
| `line_item_id` | string (UUID) | The line's ID — use this in `POST /counter`. |
| `item_code` | string | The line's category (`LABOR`, `MATERIAL`, …). |
| `item_description` | string \| null | The vendor's text for the line. |
| `vendor_value` | float | The vendor's original ask for this line. |
| `suggested_value` | float | **The agent's recommended counter for this line.** On `accept`, your `POST /counter` `value` must equal this. |
| `suggested_qty` | float \| null | Suggested quantity (e.g. labor hours), if the agent adjusted it. `null` if unchanged. |
| `floor` | float | Hard lower bound — a counter is never below this. |
| `ceiling` | float | Hard upper bound — a counter is never above this (or above vendor ask). |
| `confidence` | float | 0–1 **data-quality** score (how much peer data backs it), *not* a probability. 0.30 = no peer data (pure default); 0.75 = strong data + clean. |
| `delta_pct` | float | % change vs vendor ask (negative = reduction). |
| `reasoning` | string \| null | Plain-English "why this counter." `null` on incurred lines. |
| `flags` | array | Red/green flags the agent detected: `[{type, code, detail}]`. Empty when none. |
| `position_guidance` | string \| null | Where in the band the counter sits: `floor`/`low`/`mid`/`high`/`ceiling`. `null` for incurred lines / LLM off. |
| `layer1_source` | string | Which benchmark produced the bounds (e.g. `trade_job_type`, `trade_state`, `trade_national`, `incurred_passthrough`, `no_data`). Tells you how specific the data was. |
| `counter_this_line` | bool | `false` for incurred lines — those pass through at vendor value and the admin doesn't counter them. |
| `explanation` | object \| null | Structured "why" for rich UI rendering: `{numbers: {vendor_ask, floor, target, ceiling, counter, delta_pct}, layers: {...}, policy: {applied, starting_pct}}`. Optional — `reasoning` is the prose version of the same thing. |
| `llm_reasoning` | string \| null | **The raw LLM one-liner** — a simple, plain-English sentence explaining why this line was countered (e.g. "The labor rate is below the historical median rate and the hours are slightly above the median but within reasonable range"). Shorter and simpler than `reasoning`. Good for showing to admins when the full composed explanation is too detailed. `null` on incurred lines or when LLM was skipped. |

**`flags[]` — each flag object:**

| Field | Type | What it is |
|---|---|---|
| `type` | string | `"red"` = concern/problem detected, `"green"` = vendor justified something well, `"info"` = advisory (does not affect the counter position). |
| `code` | string | Machine-readable identifier. Possible values: `hours_inflated`, `materials_above_cap`, `rate_above_cap`, `multiple_trips`, `over_scoping`, `padding`, `double_billing`, `unreasonable_qty`, `justified_complexity`, `detailed_description`, `low_confidence_counter` (info — see below). |
| `detail` | string | Human-readable one-liner explaining what the flag is about. Show this to the admin as a warning/callout. Example: `"Vendor claims 6h; peer median 3.8h"` or `"Materials $285 is 46% above peer median $195"`. |

> **`low_confidence_counter` (info flag — NM-42):** attached when the per-line benchmark was too weak/thin/mismatched to justify a deep cut, so the counter was capped to a conservative trim (default −25% off the ask) and flagged for manual review. `type` is always `info` (never red — it is *not* a confirmed-padding signal). Extra fields on this flag: `trigger` (`weak_source` / `thin_sample:{n}` / `scope_mismatch:{ratio}x`) and `cap_pct`. When present, benchmark-artifact red flags on the same line (`materials_above_cap` / `unreasonable_qty` / `hours_inflated` / `over_scoping`) are shown as `info` instead of `red` (annotated "possible benchmark mismatch, not confirmed padding"); `rate_above_cap` / `multiple_trips` stay red. Render it as an amber advisory chip with a tooltip, not a hard red warning.

**`summary` — proposal-level roll-up:**

| Field | Type | What it is |
|---|---|---|
| `vendor_proposed_total` | float | Vendor's total across the negotiable lines. |
| `suggested_counter_total` | float | The agent's recommended counter total across those lines. |
| `target_pct` | float | The starting-offer target (e.g. `0.85` standard, `0.75` emergency). |
| `dne_status` | string \| null | Customer price-ceiling verdict on the suggested counter: `safe` / `needs_escalation` / `hard_block`. |
| `overall_confidence` | float | Average data-quality score across the negotiable lines (0–1). |

### 4.4 `POST /proposals/{id}/counter` → `200`

> **You can use or ignore this response.** The primary purpose of `POST /counter` is recording the admin's decision for the agent's state machine and ML training pipeline. The response below is informational — the agent computes these values internally and hands them back in case they're useful to you. Your backend already handles vendor delivery and cost logic independently; nothing in this response is required for your workflow to continue.

```json
{
  "proposal_id": "a1b2c3d4-...", "round_number": 1,
  "counter_total": 775.00, "incurred_total": 195.00, "full_total": 970.00,
  "dne_status": "safe", "profit_tier": "standard_under_1k", "margin_pct": 85.2,
  "notes_to_vendor": "We've adjusted your pricing...", "sent_at": "...",
  "actions_summary": { "accepted": 1, "edited": 1, "declined": 1 }
}
```

| Field | Type | What it means (use if helpful, ignore if not) |
|---|---|---|
| `proposal_id` | string (UUID) | The proposal. |
| `round_number` | int | The round this counter just created. |
| `counter_total` | float | Agent's computed total of the negotiable lines after the admin's decisions. |
| `incurred_total` | float | Total of the pass-through (incurred) lines. |
| `full_total` | float | `counter_total + incurred_total`. |
| `dne_status` | string | Agent's customer price-ceiling verdict: `safe` / `needs_escalation` / `hard_block`. Useful if you want a second-opinion check on whether the counter exceeds the customer's DNE. |
| `profit_tier` | string | Which profit-margin band the deal falls in (agent's internal classification). |
| `margin_pct` | float \| null | RFI's margin % on this counter (agent's computation). |
| `notes_to_vendor` | string \| null | The message you sent (echoed back). |
| `sent_at` | datetime | When the counter was recorded in the agent's PG. |
| `actions_summary` | object | Counts of the admin's decisions: `{accepted, edited, declined}`. |

### 4.5 `POST /proposals/{id}/respond` → `200`

```json
// Approved (terminal)
{ "proposal_id": "...", "status": "approved", "final_total": 970.00, "approved_at": "...", "message": "Vendor approved. Work authorized to proceed." }

// Edited (new round)
{ "proposal_id": "...", "status": "awaiting_vendor", "round_number": 2, "new_vendor_total": 885.00, "new_proposed_total": 885.00, "message": "Vendor edited and sent back. New recommendations generating." }
```

After an edit, a **new recommendation generates** for round 2 — poll `GET /recommendations` again (or wait for the `recommendations.ready` ping).

> **Status note:** this response returns `status: "awaiting_vendor"` immediately. As the agent re-analyzes the new round internally, a follow-up `GET /proposals/{id}` may show `status: "reviewing"` (the agent re-reviewing) before settling. Both are non-terminal "agent working" states — drive your UI off `recommendations.ready` / `rounds_count` rather than the exact intermediate status.

**Approved response fields:**

| Field | Type | What it is |
|---|---|---|
| `proposal_id` | string (UUID) | The proposal. |
| `status` | string | `approved` (terminal). |
| `final_total` | float | The agreed total — what the vendor accepted. |
| `approved_at` | datetime | When it was approved. |
| `message` | string | Human-readable confirmation. |

**Edited response fields:**

| Field | Type | What it is |
|---|---|---|
| `proposal_id` | string (UUID) | The proposal. |
| `status` | string | `awaiting_vendor` (agent re-reviewing the new round). |
| `round_number` | int | The new round number. |
| `new_vendor_total` | float | The vendor's revised total across all lines. |
| `new_proposed_total` | float | Revised total across the negotiable lines. |
| `message` | string | Human-readable note. |

---

## 5. Real-time: the admin WebSocket

**`WS /api/v1/ws/admin`** — one connection per Frontend V2 session. **Optional** — you can poll instead.

- **It carries notifications, not data.** Each event is a lightweight ping; the UI then fetches the real state via the GET endpoints.
- **Auth before upgrade:** session cookie `negotiator_session`, or `?key=<api_key>` for programmatic.
- **Heartbeat:** server sends `{"type":"heartbeat"}` every 30s; client replies `{"type":"pong"}`. 3 missed pongs → server closes; client should reconnect (re-sync via REST on reconnect — there is no replay).

**Events:**

| Event | When | Payload summary |
|---|---|---|
| `proposal.new` | Vendor submitted | `{proposal_id, vendor_name, vendor_total, job_id, trade_name}` |
| `recommendations.ready` | AI finished | `{proposal_id, round_number, suggested_counter_total, dne_status, overall_confidence}` |
| `proposal.approved` | Vendor approved the counter (terminal) | `{proposal_id, final_total, approved_at}` |
| `round.vendor_edited` | Vendor edited and sent back (new round) | `{proposal_id, round_number, new_vendor_total}` |
| `escalation.triggered` | DNE breach | `{proposal_id, dne_status, proposed_amount, customer_dne, trigger_reason}` |
| `admin.takeover_confirmed` | Takeover acknowledged | `{proposal_id, admin_user_id, previous_status}` |

> **Vendor response events:** there is no single `vendor.responded` event — the agent emits `proposal.approved` when the vendor approves, and `round.vendor_edited` when the vendor edits and sends back. Wire both.


---

## 6. How the agent's output reaches you and the state-refresh rule

**The agent only writes to its own PostgreSQL — never to the RFI/prod DB.** For the agent's output to live in your DB, **you persist it.** Three ways (use any combination):

| Mechanism | How |
|---|---|
| **1. The API response** | Every write endpoint returns its result inline (the recommendation via `GET /recommendations`). Simplest — you persist what you read. |
| **2. WebSocket ping + GET** | The admin socket pings "ready for proposal X"; you then `GET /recommendations` / `GET /proposals/{id}`. Live admin UI without polling. |
| **3. Service Bus events** | The agent publishes `negotiation.started`, `negotiation.counter_sent`, `negotiation.completed` to the topic. Subscribe and persist as events arrive. Active when configured. |

### ⚠️ The state-refresh rule (critical if you store the agent's data in your DB)

A negotiation is **multi-round and stateful** — the recommendation, status, totals, and round number all change over time. If you cache the agent's response in your DB, you **must refresh your stored copy every time the proposal changes**, not just on the first submit. Specifically, re-fetch and overwrite your stored copy whenever:

- A new round starts (vendor `edit_and_send_back` → new recommendation, new `round_number`).
- A counter is sent (`status → counter_sent`, new `latest_counter`).
- The vendor responds (`approved` / new round).
- A customer escalation resolves (`awaiting_customer` → back into negotiation).
- Any lifecycle action fires (`takeover` / `cancel` / `defer` / `reject-for-resubmission`).

The reliable triggers: the **`recommendations.ready` / `proposal.approved` / `round.vendor_edited` / `escalation.triggered` WebSocket pings**, or the **Service Bus events**. On any of them, re-`GET` the proposal + recommendations and overwrite your copy. **Never treat the first recommendation as final** — `rounds_count` is the version marker; if it changed, your cached copy is stale.

> **Authoritative source of truth is always the agent's `GET /proposals/{id}`.** Your DB copy is a convenience mirror; keep it in sync off the events above.

---

## 7. Multiple vendors on one job

Multiple competing vendors on the same job is fully supported and **needs no special endpoint** — each vendor is just its **own proposal** that shares the same `job_id`:

1. **Submit each vendor independently** — call `POST /proposals` once per vendor, same `job_id`, different `vendor_id`. You get a separate `proposal_id` per vendor.
2. **Track each `proposal_id` separately** — each has its own status, rounds, recommendations, and counters. Use `GET /proposals?job_id=<job>` to list all vendors on a job.
3. **Competing-estimate leverage is automatic** — when 2+ vendors are active on the same job, the agent anchors each vendor's counter toward the **cheapest competing total** (only ever pushes *down*; never raises). You don't send anything extra — it keys off `job_id`.

So the UI pattern for a multi-vendor job: list the N proposals for the `job_id`, show each as its own negotiation block, and let the admin work each independently.

---

## 8. Error handling and retries

| HTTP | `error.code` | Retry? | Action |
|---|---|---|---|
| 503 | `service_unavailable` | Yes — backoff | DB briefly down. Honor `Retry-After: 2`, then 4s, 8s, give up after 3. |
| 202 | — | Yes — poll | `GET /recommendations` still generating. Poll every 1–2s (resolves in ~3–8s). |
| 429 | `rate_limit_exceeded` | Yes — after delay | Honor `Retry-After`. Limit is 200 req/min. |
| 200 + `is_duplicate:true` | — | Yes — no-op | Retry of a submit — `proposal_id` is the existing one. |
| 409 | `ACTIVE_PROPOSAL_EXISTS` | No | A *different* estimate is already active on this job+vendor. Show the admin. |
| 409 | `stale_round` | No (not as-is) | `GET /proposals/{id}`, recompute `round_number = rounds_count + 1`, resubmit. |
| 409 | `INVALID_STATE_FOR_COUNTER` / `..._RESPONSE` | No | Status changed underneath you. Reload. |
| 400 / 422 | `bad_request` / `validation_error` | No — never | Fix the payload (bad field, total ≠ qty×rate, wrong enum). |
| 401 / 403 | `unauthorized` / `forbidden` | No — never | Wrong/missing `X-API-Key`. |
| 404 | `not_found` | No — never | Wrong ID or cleaned up. |
| 500 | `internal_error` | No — no auto-retry | Surface to admin; log the `request_id`. |

**Write-retry safety:**
- `POST /proposals` — safe (idempotent via `Idempotency-Key` / payload hash).
- `POST /counter` and `POST /respond` — **on a network timeout, `GET /proposals/{id}` first** to see if it landed (`rounds_count` / `status` changed). If it did, don't re-send. They are not blindly idempotent.
- All GETs — always safe.

**Idempotency on submit:** send `Idempotency-Key: <stable-uuid-per-submit>`. Same key → same proposal (200). Without it, an identical line-item set is auto-detected as a retry.

---

## 9. Edge cases

| Condition | Behavior |
|---|---|
| All lines `incurred` | Nothing to negotiate — every line passes through at vendor value; status goes to `awaiting_admin` with no real counter to make. Inflated incurred costs still get a flag for admin review. |
| `customer_dne` missing / 0 / null | Every counter resolves to `needs_escalation` (the agent never guesses a ceiling). Send DNE whenever you have it. |
| `dne_status = needs_escalation` / `hard_block` | The counter would breach the customer DNE. Proposal parks at `awaiting_customer`; resolve via `POST /customer-response`. |
| Vendor prices a line *below* the agent's floor | The agent accepts their price (floor = ceiling = vendor ask for that line). |
| `GET /recommendations` returns `202` | Still generating — poll. Normal for the first few seconds after submit and after each vendor edit. |
| `trade_key` omitted | Benchmarks fall back to national → less precise. Send it when you can. |
| `job_type` unknown to the agent (e.g. "recall") | Accepted as-is; gets standard pricing. Only `emergency`/`priority` change the pricing tier. |
| Two admins counter the same round | First wins; second gets `409 stale_round` → reload + retry. |
| Vendor double-taps Approve | Idempotent — second call returns the same approved result, no double-processing. |
| Proposal already terminal | Counter/respond/takeover/etc. return `409 PROPOSAL_TERMINAL`. |
| `max_rounds` reached | Negotiation routes to admin takeover — surface to the admin to handle manually. |

---

## 10. Timing and quick reference

| Call | Expected |
|---|---|
| `POST /proposals` | ~100–200ms (recommendation runs in background after) |
| `GET /recommendations` | `202` for ~3–8s, then `200` |
| `POST /counter` | ~200ms |
| `POST /respond` | ~300–500ms |
| `GET /proposals/{id}` | ~50ms |

Set HttpClient timeouts: ~5s for synchronous calls, 15–30s for the recommendation poll loop.

| Item | Value |
|---|---|
| Base URL | `https://rfi-negotiating-agent.wittyground-446a537e.eastus2.azurecontainerapps.io/api/v1` |
| Auth header | `X-API-Key` |
| **API Key (backend)** | `2dadefbd6dcde292f17e2dd565b52d9c11332b57eed29b9022fadc0fcd73591a` |
| Key Vault secret name | `NEGOTIATOR-API-KEY-V2-BACKEND`  |
| Rate limit | 200 req/min (backend key) |
| Health check | `GET https://rfi-negotiating-agent.wittyground-446a537e.eastus2.azurecontainerapps.io/health` |
| Admin WebSocket | `WS /api/v1/ws/admin` (optional; cookie or `?key=`) |
| Phase | 1 — admin-in-the-loop (agent recommends + records; backend acts) |

---

---

## 11. Admin button to agent endpoint mapping

### Confirmed buttons

| # | Button / Action | Agent endpoint | What to send | What the agent does |
|---|---|---|---|---|
| 1 | **Request DNE Increase from Customer** | No agent call at click time. **When the customer responds** → `POST /proposals/{id}/customer-response` | `{ "escalation_id": "...", "response": "approved" or "declined", "new_dne_ceiling": 3500.00 }` | Agent records the customer's decision and resumes the negotiation under the new ceiling (or pushes vendor lower if declined). The agent doesn't send the email or contact the customer — that's your existing flow. Just tell the agent the outcome. |
| 2 | **Approve On-Site Request** (green button — removed in new Figma, but if one exists) | `POST /proposals/{id}/counter` with all lines set to `action: "accept"` | `{ "round_number": 1, "actions": [{ "line_item_id": "...", "action": "accept", "value": <suggested_value>, "qty": null }...], "admin_user_id": "..." }` — use each line's `suggested_value` from `GET /recommendations` as the `value`. | Agent records that admin accepted all lines as-is, advances state. Functionally the same as "Accept All" + send. |
| 3 | **Per-line Accept / Edit / Decline + "Send Counter"** | `POST /proposals/{id}/counter` | `{ "round_number": <rounds_count + 1>, "actions": [{ "line_item_id": "...", "action": "accept"/"edit"/"decline", "value": <amount>, "qty": <optional> }...], "notes_to_vendor": "...", "admin_user_id": "..." }` | Agent records each per-line decision, runs DNE/profit checks, advances to `counter_sent`. |
| 4 | **Accept All** | Same as #3 — `POST /proposals/{id}/counter` with every action set to `"accept"` | Same shape as #3 but all `action: "accept"` with `value` = the recommendation's `suggested_value` for each line. | Identical to #3 — just a UI shortcut. |

### Manage Status dropdown (5 options — PENDING confirmation)

These 5 dropdown options are from the Figma. Waiting on exact confirmation on what each does on the backend side before mapping:

| # | Dropdown option | Likely agent endpoint | Status |
|---|---|---|---|
| 5 | On-Site Approval Requested | Possibly no agent call (display status only?) | ⏳ Pending |
| 6 | Estimate Submitted | Possibly maps to `POST /proposals` (if this triggers a new estimate into the system) | ⏳ Pending |
| 7 | Change Order Requested | Possibly `POST /proposals/{id}/reject-for-resubmission` or a new `POST /proposals` | ⏳ Pending |
| 8 | On-Site Approval Request – Approved | Possibly `POST /proposals/{id}/counter` (accept all) — same as button #2 | ⏳ Pending |
| 9 | Estimate Reject/Resubmit | `POST /proposals/{id}/reject-for-resubmission` | ⏳ Pending |

> Once its confirmed what each dropdown option does, these will be locked.

---

### What to send back to the agent (summary)

The agent needs to be told about every action that changes the negotiation. Here's the complete list of "when X happens on your side, call Y on the agent":

| When this happens on your side | Call this on the agent | Minimum payload |
|---|---|---|
| Vendor submits an on-site estimate | `POST /proposals` | All **Yes** fields from §2.1. **⚠️ Send `incurred` as the raw prod-DB `CostIncurred` bit, untransformed — the agent flips it internally (NM-39, see §2.1 callout). Don't convert it.** |
| Admin reviews and sends a counter | `POST /proposals/{id}/counter` | `round_number`, `actions[]` (one per proposed line), `admin_user_id` |
| Vendor approves the counter | `POST /proposals/{id}/respond` | `{ "action": "approve_and_proceed", "vendor_id": "..." }` |
| Vendor edits and sends back | `POST /proposals/{id}/respond` | `{ "action": "edit_and_send_back", "vendor_id": "...", "line_items": [...] }` |
| Customer responds to DNE increase request | `POST /proposals/{id}/customer-response` | `{ "escalation_id": "...", "response": "approved"/"declined", "new_dne_ceiling": ... }` |
| Admin cancels / declines the estimate | `POST /proposals/{id}/cancel` | `{ "admin_user_id": "...", "reason": "..." }` |
| Admin rejects for resubmission | `POST /proposals/{id}/reject-for-resubmission` | `{ "admin_user_id": "...", "reason": "..." }` |
| Admin defers (vendor leave, resume later) | `POST /proposals/{id}/defer` | `{ "admin_user_id": "..." }` |

> **If you don't call the agent, the agent doesn't know it happened.** Its state goes stale. The negotiation will eventually time out (120 min standard / 60 min emergency) and expire on its own — but that's not ideal. Keep the agent in sync by calling the matching endpoint whenever the admin or vendor acts.

---

*Created: June 24, 2026. Updated June 30, 2026 — `incurred` flag (§2.1 + §11): send the raw prod-DB `CostIncurred` bit untransformed; the agent normalizes the inverted polarity internally (NM-39).*
