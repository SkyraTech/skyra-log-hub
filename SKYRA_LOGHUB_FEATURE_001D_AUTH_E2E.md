# FEATURE-001D — isolated authentication and organization E2E

Date: 2026-11-04, Asia/Calcutta. **Signed protocol integration passed in isolation. No live Microsoft sign-in is claimed.**

## Environment and real application path

The existing independent PostgreSQL 17.9 cluster at 127.0.0.1:5433 was reverified before writes: database skyra_loghub_disposable_validation, marker `26d25080-7655-4147-b05a-512ad359e14f`, exact `.tmp/feature001a-postgres/data`, separate administrator and ordinary test credentials. Static/live role, port, marker, PostgreSQL version and physical-directory checks precede the runner. Protected 5432 was never accepted as a test target.

Admin/BFF are built NestJS processes; Angular is its built browser application, served behind the existing same-origin test proxy. The application connects as non-owner skyra_org_runtime. The test owner is used only for synthetic fixture administration and independent assertions; it is not used to prove runtime authorization or audit permissions. Runtime marker/identity checks remain in force.

The controlled OIDC peer is a separate local HTTP server from `apps/console-bff/tests/helpers/oidc-test-provider.fixture.ts`. It generates RSA-2048 keys in memory, serves discovery/JWKS, redirects with random one-use authorization codes, checks exact registered test redirects/client authentication and validates S256 verifier at its token endpoint. Tokens are actually RS256-signed and verified by the production BFF discovery/JWKS path. ENABLE_MOCK_OIDC=false. Three explicit test-only flags permit HTTP loopback for this peer; no real tenant or credential is invented. Its issuer is an ephemeral `http://127.0.0.1:<allocated-port>/tenant/v2.0`, never a Microsoft endpoint. Latest exact public ports/issuer are recorded in `.tmp/feature001d-evidence/e2e-environment.json`.

Existing synthetic users are temporarily associated with that test issuer and restored to their original fixture issuer in finally cleanup. No real identity/organization bootstrap is performed. Test tenants are the existing guarded fixture tenants. Audit/name mutations are intentionally durable isolated test evidence; no production data is involved. Child processes, browser and OIDC peer are closed after the test; the owned PostgreSQL cluster remains available.

## Current signed-provider scenarios

Command: `node scripts/run-entra-organization-e2e.mjs`, exit 0. Reuses `tests/organization/organization.e2e.mjs` with protocol-test mode; it does not replace the application backend with fake API responses. The first signed-provider run and final post-hardening rerun both pass **18 leaf scenarios / 19 reported including the parent**.

| Scenario | Result |
|---|---|
| Real browser starts BFF login, follows provider authorization, exchanges code+PKCE, validates JWKS and opens Angular organization overview | pass |
| Reauthentication rotates the session and rejects the previous cookie; CSRF logout clears local session and follows provider end-session redirect | pass |
| Bad signature, wrong issuer/audience/nonce, expired/unsigned token and unknown kid callbacks create no session | pass; variants within one reported scenario |
| Cryptographically verified identity without active membership; provider OrgOwner claims do not grant organization access | pass for missing/revoked/suspended membership |
| Existing signed-provider session is denied on next organization request after its persisted membership is revoked | pass; fixture membership restored |
| Ordinary runtime cannot alter audit/schema, immutable tenant columns or grant itself authority | pass |
| Composite project/member and role scope cannot mismatch tenants | pass |
| Anonymous/forged/expired internal assertion and cross-tenant GET/PATCH denied | pass |
| Disabled/revoked/missing/suspended identity/membership and Viewer mutation denied | pass |
| Session/CSRF/name-only payload/If-Match/context protections | pass |
| Browser loading/saving feedback on delayed real backend path | pass |
| Trimmed name saves, refresh persists and correct actor/correlation audit exists | pass |
| Validation, cancel and unsaved-change behavior | pass |
| Two browser contexts reject stale ETag save and preserve first update | pass |
| Controlled audit failure rolls back organization update | pass |
| Non-ACTIVE organization readable but cannot be renamed | pass |
| Persisted OrgAdmin can rename organization | pass |
| Existing responsive light/dark keyboard/accessibility checks | pass; six scoped axe runs, no fatal page errors |
| Real Admin process outage shows safe error; restart/Retry recovers persisted organization | pass |

The standard existing mock-preview organization runner separately still passes 14 leaf scenarios / 15 reported. It is regression evidence only and is not represented as signed-provider evidence. Controlled key rotation is verified by the BFF security suite against the real local JWKS endpoint, including the five-second cooldown and new-kid refresh, rather than by inventing a production rotation.

## Commands and evidence

`node scripts/feature001c-regression.mjs services feature001d` ran Admin/BFF/Angular typechecks/builds/tests, recording separate D evidence. `node scripts/feature001c-regression.mjs integration feature001d` ran contracts, guards, persistent adapters, existing mock-preview browser regression, governance/schema sync, signed-provider E2E, hardened PostgreSQL tests and ingestion repository compatibility. All commands exited 0. Final BFF build/test and Angular tests were repeated after targeted security/test additions; final counts supersede earlier runs rather than being summed twice.

Logs: `.tmp/feature001d-evidence/{services.json,integration.json,services-*.log,integration-*.log,bff-final-build.log,bff-final-test.log,angular-final.log,signed-final-e2e.log}`. The browser harness also records sanitized e2e-environment.json, six scoped accessibility results and screenshots there. Session cookies, tokens, confidential credentials and private keys are never written to these evidence files. Parent containers and runners are excluded from leaf-case totals; [final acceptance](SKYRA_LOGHUB_FEATURE_001D_FINAL_ACCEPTANCE.md) is the command/count authority.

## Explicit limitations

No actual Entra external tenant, app registration, customer user flow, callback registration or live Microsoft metadata/sign-in was configured. The peer validates the documented protocol contract, not Microsoft's hosted policies, MFA, branding, password recovery or actual tenant issuer. The selected tenant's real discovery document must still be reviewed against explicit trust roots before live authentication.

Production HTTPS cookie behavior, Vercel/Azure/VPS reverse proxy, shared session/pending-state infrastructure and certificate/federation client authentication are documented prerequisites, not deployed/tested infrastructure. Current session expiry/CSRF tests and new fixation/logout cases validate the single-worker implementation. Organization authorization stays in Admin, independent of provider roles or email. No protected migration, bootstrap, audit insertion, role change, backup/restore, credential change or activation was performed.
