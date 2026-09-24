# Negotiating-agent hosted-dev E2E

The test in `live-chat-negotiating-agent.spec.ts` covers:

- fresh on-site estimate creation;
- Live Chat Negotiate recommendation loading;
- accessible bulb insight rendering and containment;
- Accept All response and negotiation round advancement;
- exact persisted labor total;
- failed HTTP responses and browser errors.

## Gated shared-dev run

Run this suite only from a manually approved or scheduled shared-dev stage. Do not add it to pull-request validation because it creates real dev data and emails the test vendor.

Required setup:

1. Start the Test Automation Hub with its credentials supplied by a protected CI variable group.
2. Set `E2E_NEGOTIATION_CREATE_FRESH=1`. CI runs fail immediately without this guard, preventing reuse of an old PO.
3. Optionally set `E2E_AUTOMATION_HUB_URL` when the hub is not listening on `http://127.0.0.1:3847`.
4. Run `npm run e2e:negotiation:dev`.

For pre-deployment frontend verification, set `E2E_ADMIN_BASE_URL=http://127.0.0.1:4200`. The authenticated route is then opened against the local Angular build while API traffic continues to target hosted dev.

Do not store JWTs, admin passwords, vendor passwords, or hub configuration in this repository.

