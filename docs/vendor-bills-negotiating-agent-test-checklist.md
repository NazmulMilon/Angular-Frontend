# Vendor Bills — Negotiating Agent manual test checklist

Run `Scripts/Sql/CreateVendorEstimateNegotiation.sql` against the RFI DB before testing.

## Backend

1. Set `NegotiatingAgent:ApiKey` locally or ensure Key Vault secret `NEGOTIATOR-API-KEY-V2-BACKEND` is available.
2. `GET /api/v1/admin/vendor-bills/estimates/{estimateKey}/negotiation` — returns `recommendationsReady` after agent poll (~3–8s).
3. `POST .../accept-all` — agent status advances; estimate lines update in prod DB.
4. `POST .../send-counter` with per-line actions — validates accept/decline/edit value rules via agent.

## Frontend

1. Open `/job/{jobKey}/vendor-bills` — Estimating section shows two-column cards with agent sidebar.
2. DNE banner shows 50% approval rule copy.
3. Line table column reads **Vendor gave status of**.
4. Footer shows **Manage Estimate Dropdown**, **Negotiate with Vendor**, **Get More Approval from Customer**.
5. Agent panel loads skeleton, then per-line Accept / Edit / Decline and **Accept All**.
6. **Negotiate with Vendor** sends counter with selected line decisions.
7. **Approve On-Site Request** triggers accept-all agent counter.

## Automated

- `dotnet build` in `RFIJobOps`
- `npm test` / `ng test` for `estimate-negotiation-panel.component.spec.ts`
