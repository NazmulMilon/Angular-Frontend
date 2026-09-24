# AdminPortal V2 — project instructions

AdminPortal V2 is the Angular 21 (standalone components + signals) frontend for RFI's "V2" stack.
It talks to the RFIJobOps ASP.NET Core API, which shares one SQL Server database with two legacy
ASP.NET MVC 5 / EF6 apps (Admin Portal V1 `ProjectRCS`, Email App `RCS_app`). For any feature or
bug fix that touches more than just this repo, **use the `rfi-integrated-feature` skill**
(`.claude/skills/rfi-integrated-feature/SKILL.md`) — it has the investigate → define → plan →
implement → verify → report workflow and links to the full ecosystem reference. A second copy of
that skill lives in the RFIJobOps repo for backend-rooted sessions; the two are independent files,
not synced automatically.

## Standing constraints (do not violate)

- **Neither legacy repo — `ProjectRCS` (Admin Portal V1) nor `RCS_app` (Email App) — may ever be
  invoked by RFIJobOps or RFIEmailService.** This repo has no direct relationship to them either;
  if a feature needs legacy logic, it gets ported into RFIJobOps, not called cross-process from
  anywhere.
- **Never run schema-changing SQL, or any operation against a real environment, without the user's
  direct involvement.** This repo has no direct DB access, but a feature here often implies a
  backend/schema change — flag that dependency rather than guessing the backend contract.
- **Never create a git commit unless explicitly asked.**
- Two frameworks answer to the name "Angular admin portal" — make sure you're editing this repo
  (`D:\RFI PROJECTS\AdminPortal V2`, Angular 21, standalone/signals), not the legacy `ProjectRCS`
  Razor views.

## Quick facts (see the skill's `references/ecosystem.md` for full detail + citations)

- Every backend response is wrapped in `ApiResponse<T>` (`status`/`responseCode`/`message`/`data`/
  `details`/`traceId`, camelCase over the wire). **Always read `res.data`, never deserialize a
  response straight into the model** — this has silently zeroed out every field on at least one
  past feature.
- Auth: a Bearer JWT is the default for most endpoints (`auth.interceptor.ts`), but some
  (`SystemSetupData/*`) authenticate via a shared `RFIApiKey` header instead — check which an
  endpoint expects before assuming.
- Live-update features use a shared SignalR hub (`/hubs/job-chat`, group `StaffInboxGroupName`).
  The established Angular pattern is a small per-feature `*-notification.service.ts` that joins/
  watches the job and refetches on the relevant event name — follow an existing one
  (`change-request-notification.service.ts` is a clean example) rather than inventing a new shape.
- `CONTEXT.md` (this repo's root) is a maintained glossary of domain terms and resolved
  backend-contract questions (Vendor Estimate status lifecycle, the 3-call "approve chain," known
  contract gaps) — read it before touching Vendor Estimate/invoice-approval flows, and add to it
  when you resolve a new one.
- A running dev server is `ng serve` on `:4200`; the paired local API is expected on `:7028`
  (`https://localhost:7028`, per this repo's own `proxy.conf.*.json`/environment files) — confirm
  which `ng serve` configuration (`start`, `start:hosted-dev`, `start:uat`) points where before
  assuming a target.
- `npm test` (Karma/Jasmine unit tests) and `npm run e2e` (Playwright, `e2e/*.spec.ts`) are both
  real and runnable — a green `ng build` proves the code compiles, not that the feature works.
