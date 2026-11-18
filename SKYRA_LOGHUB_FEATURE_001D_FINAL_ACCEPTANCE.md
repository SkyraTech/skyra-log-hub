# FEATURE-001D — final acceptance

Date: 2026-11-04 (Asia/Calcutta; implementation/test UTC timestamps span 2026-11-03). Task LOGHUB-FEATURE-001D.

**PASS — ENTRA COMPATIBILITY IMPLEMENTED IN ISOLATION.**

Microsoft Entra External ID customer authentication is the selected provider direction. The existing BFF now implements trusted discovery, maintained JOSE RS256/JWKS verification, exact issuer/audience/directory/nonce claims, bounded key rotation, code/PKCE exchange and browser-bound one-time callback state. Existing opaque sessions, CSRF and PostgreSQL-authoritative organization permissions remain in use. Real signed-provider browser verification and current regressions pass. No actual Microsoft tenant/app/credential/flow was registered or live sign-in tested, and protected activation remains unauthorized.

## Initial Git state and existing architecture

Workspace: `C:\Users\VAMSHIKA\source\repos\skyra-tech-projects`. LogHub branch main, HEAD `19f084ad36fe37bb57ca107103e136d2d4a378be`; no staged files, 98 folded porcelain entries of existing FEATURE-001/A/B/C changes. The initial inventory is `.tmp/feature001d-evidence/initial-status.txt`. Platform was clean at HEAD `928ca4343ab3a1887e586123a6ba5bb88b56a0ef`, branch main. No reset/rebase/merge/commit/push occurred. Existing user changes and prior reports were retained; no remote repository was used as implementation source.

Angular already delegated login to BFF and consumed safe server-side session state. BFF already owned state/nonce/PKCE, HttpOnly opaque cookies, sessions and mutation CSRF. Admin/Prisma already mapped issuer+subject identities and active memberships/capabilities, with organization name-only update, concurrency and transactional audit. The real OIDC implementation was HS256-only and synthesized Keycloak endpoint paths. The task corrected that real path rather than adding an authentication system or new business feature.

## Entra requirements and implementation

Official Microsoft sources were checked for customer **external tenants**, user-flow association, confidential Web registration, tenant-specific CIAM authority/metadata, code+PKCE, token claims, key rollover, redirect restrictions and logout. Those sources and the distinction between Microsoft instructions, LogHub proposals and untested live steps are in the [setup guide](docs/auth/MICROSOFT_ENTRA_EXTERNAL_ID_SETUP.md). Workforce common/organizations and old Azure AD B2C policy patterns were not adopted. No tenant-specific live metadata URL was invented or queried; exact deployed metadata remains a user configuration prerequisite.

Console BFF uses **jose 6.1.3**, declared exactly and installed with --ignore-scripts. `oidc-provider.ts` validates explicit discovery URL, exact issuer and trusted HTTPS endpoint origins; validates RS256/code/client_secret_post metadata; and uses JOSE's remote resolver for signature verification. Requests have five-second aborts, no redirects, bounded bodies and sanitized errors. Metadata and key caches expire after ten minutes; unknown-kid refresh uses a five-second cooldown. Real JWTs require RS256 and kid; token-supplied jku/jwk/x5u are rejected. JOSE verifies signature, issuer, audience, expiry/nbf and required claims; explicit checks enforce nonce, subject, iat, azp and configured directory tid. Unsupported algorithms, missing keys/configuration or invalid metadata fail closed. Real mode never falls back to mock exchange or development memberships.

Login now awaits discovery, retains S256/state/nonce and additionally binds real callbacks to a random HttpOnly browser cookie, with one-use ten-minute server state. Return paths reject normalized open redirects and control characters. Successful authorized callback replaces any old session with a fresh random ID. Tokens stay in BFF memory and are excluded from Angular-safe session DTOs. Production accepts only the configured session cookie. Logout revokes local state, clears cookies and optionally supplies a trusted provider end-session URL; Angular clears its local state before navigation and does not follow javascript URLs. Existing idle/absolute expiry, CSRF and route bootstrap remain.

See [implementation report](SKYRA_LOGHUB_FEATURE_001D_ENTRA_IMPLEMENTATION.md) for full file inventory and cache/flow behavior, and [security report](SKYRA_LOGHUB_FEATURE_001D_SECURITY_VERIFICATION.md) for threats, tested controls and limits. No schema change, parallel identity/tenant database, frontend auth SDK, Members & Roles or unrelated feature was introduced. Only Approval C was updated for the selected provider and verified isolated requirements; A/B packets and prior milestone reports remain unchanged.

## Identity, authorization and Angular integration

Identity remains unique verified `(issuer,subject)`, not email. External tid is validated against the configured customer directory and is never treated as a LogHub organization. Provider role claims are discarded. Admin still refuses disabled identities and inactive/missing memberships and determines roles/capabilities from PostgreSQL. No automatic user/tenant/owner provisioning occurs. Signed provider OrgOwner claims do not grant a Viewer or a user without membership organization access. Established sessions lose organization access on the next operation after membership revocation.

Angular retains its existing login/guard/session/organization screens and Skyra Platform components. The only frontend source correction follows BFF-provided provider logout after clearing local state. OIDC tokens, client secret, internal keys and DB credentials are not browser configuration. Real-browser code flow, organization overview/settings, save/refresh/audit, conflict/rollback and safe error behavior were verified against actual backend services.

## Isolated E2E and exact regression results

All commands below exited **0**. The verified disposable PostgreSQL 17.9 cluster, exact marker and independent physical directory were checked before writes; application operations used skyra_org_runtime. The controlled local provider creates ephemeral RSA keys and implements discovery/JWKS and real one-use code/PKCE exchange. Signed E2E explicitly sets ENABLE_MOCK_OIDC=false. The existing harness serves actual built Angular and runs actual Admin/BFF/Prisma/PostgreSQL; no application API mock replaces persistence or authorization.

| Command | Current result |
|---|---|
| `pnpm --filter @skyra/console-bff add jose@6.1.3 --save-exact --ignore-scripts` | declared/installed exact JOSE dependency; no install scripts |
| `node scripts/protected-catalog-snapshot.mjs before feature001d` | verified read-only protected baseline |
| `node scripts/isolated-postgres.mjs verify` | exact identity/marker/physical storage and rolled-back write probe |
| `node scripts/feature001c-regression.mjs services feature001d` | package checks below; separate D logs |
| `pnpm --filter @skyra/admin-service typecheck` | pass |
| `pnpm --filter @skyra/admin-service build` | pass |
| `pnpm --filter @skyra/admin-service test` | 63 passed |
| `pnpm --filter @skyra/console-bff typecheck` | pass |
| `pnpm --filter @skyra/console-bff build` | pass; final post-hardening build also pass |
| `pnpm --filter @skyra/console-bff test` | final 89 reported / 88 leaf cases, all pass |
| `pnpm --filter @skyra/console-web typecheck` | pass |
| `pnpm --filter @skyra/console-web build` | pass |
| `pnpm --filter @skyra/console-web test` | final 77 passed |
| `node scripts/feature001c-regression.mjs integration feature001d` | all nine component commands below pass |
| `node --experimental-strip-types --test tests/contracts/admin-contracts.test.ts tests/contracts/organization-contracts.test.ts` | 9 passed |
| `node --test tests/admin/isolated-target.test.mjs` | 15 passed |
| `node --test tests/organization/persistence.test.mjs` | 10 reported / 9 leaf cases, all pass |
| `node --test tests/organization/organization.e2e.mjs` | legacy mock-preview regression: 15 reported / 14 scenarios, all pass |
| `node scripts/verify-design-system-governance.cjs` | six gates pass |
| `node scripts/sync-schemas.mjs --check` | pass |
| `node scripts/run-entra-organization-e2e.mjs` | signed-provider: 19 reported / 18 scenarios, all pass; final post-hardening rerun also pass |
| `node scripts/run-isolated-pg-tests.mjs hardened` | 10 passed |
| `node scripts/run-isolated-compatibility.mjs` | 21 passed |
| `node scripts/protected-catalog-snapshot.mjs after feature001d` | byte-identical protected snapshot |
| `git diff --check` | pass; pre-existing line-ending advisory messages only |

Total: **324 passing leaf cases/scenarios; 328 reported including four parent containers; zero failed, skipped or cancelled cases.** No runner/build/governance gate is counted as a test. The BFF and Angular final results supersede warm-up/intermediate runs; signed E2E reruns are not counted twice. Evidence: `.tmp/feature001d-evidence/final-results.json`, service/integration JSON, final BFF/Angular logs and signed-final-e2e.log. Earlier C counts are not used as D verification.

New signed-token tests cover wrong signature/issuer/audience/nonce, expired/future/missing temporal claims, tid/azp, none/HS256 confusion, malformed token/missing kid, unknown kid, forbidden key URLs, malformed/untrusted metadata, unsupported contracts, JWKS outage, network failure, PKCE/browser-binding/state reuse and new-key rotation after cooldown. Existing session/CSRF tests pass; new browser scenarios prove session replacement/old-ID rejection, local/provider logout, no-session creation on cryptographic failure, provider-role non-elevation and next-request revocation. The 18-scenario signed harness also covers real organization name save/refresh/audit, ETag conflict, audit failure rollback and real Admin outage/recovery. Six light/dark responsive scoped axe checks and keyboard navigation pass with no fatal page errors. See [E2E report](SKYRA_LOGHUB_FEATURE_001D_AUTH_E2E.md).

## Protected preservation, registration and production limits

Protected identity reconfirmed 127.0.0.1:5432 / skyra_loghub_dev / skyra_loghub_user / PostgreSQL 17.9. Snapshot transactions were explicitly repeatable-read READ ONLY with startup default_transaction_read_only. Before/after schema/constraints/indexes/enums/ledger/data digests are byte-identical, SHA-256 `90f73c6f2bc6bce568974e27472fd652505e3034284ff4a9883104b1fd02a6ff`. Eight baseline public tables, one baseline ledger row, zero application rows and no IAM tables remain.

No protected migration, DDL/DML, role/credential change, audit insertion, backup/restore, bootstrap, flag activation or service restart occurred. No Azure tenant, app, secret, account setting or deployment was created/changed. Platform remains clean/read-only at its initial HEAD. The generated Angular cache file, initially clean, was restored to its initial HEAD bytes after the build; no user source changes were removed.

Real Entra status: **PROVIDER_CONFIGURATION_REQUIRED**. Provider is selected, but external tenant/actual metadata, Web client registration, callback/logout registration, confidential credential and successful live customer sign-in are pending user actions. The proposed local callback is `http://127.0.0.1:3200/bff/auth/callback`; it matches the BFF route/default port, but Microsoft registration acceptance must still be confirmed, including its documented HTTP-IP manifest restriction. A deployed public HTTPS callback is not selected. Actual hosted policy/MFA/customer recovery and real key rollover have not been tested.

Current single-worker in-memory session and pending state are not a production scale/durability solution. A tested shared store, centralized revocation, approved TLS/same-origin proxy/cookie/CORS/CSRF topology and production credential strategy are required before deployment. Client_secret_post is implemented for confidential development clients; production certificate/federation authentication remains a separate change/decision. No global front/back-channel logout, token refresh or automatic provider-account revocation synchronization is claimed. Key removal is bounded by the ten-minute cache, not instantaneous. These limitations do not block isolated acceptance and do block any unreviewed production activation.

## Final Git state and separate approvals

LogHub remains main at its initial HEAD, no staged changes or commits. Final folded porcelain inventory: 113 entries, including preserved prior work and the new implementation/helper/tests/docs. Full initial/final inventories, package/test results and current hashes of preserved prior reports/A/B packets are retained under `.tmp/feature001d-evidence`. Only the requested Approval C dependency text changed; prior root reports and A/B packets retain pre-D modification timestamps. The final evidence script verifies Platform clean, unchanged heads, no staged files and exact leaf-count reconciliation.

| Gate | Status and remaining prerequisites |
|---|---|
| A — protected schema/runtime privileges | **NOT AUTHORIZED — AWAITING EXPLICIT HUMAN APPROVAL**. Exact artifact approval, separately authorized/current verified protected backup, named executors and existing policy/window dependencies remain. |
| B — first organization/owner | **NOT AUTHORIZED — AWAITING EXPLICIT HUMAN APPROVAL**. Real organization name/code and independently verified owner issuer+subject plus exact transactional bootstrap manifest/rehearsal remain. |
| C — real authentication/organization activation | **NOT AUTHORIZED — AWAITING EXPLICIT HUMAN APPROVAL**. Completed A/B; actual external tenant/app/metadata/callback/logout setup; successful live sign-in; approved managed runtime/secrets/configuration, session topology and smoke-test scope remain. |

**Exact next user action:** follow [the setup guide](docs/auth/MICROSOFT_ENTRA_EXTERNAL_ID_SETUP.md) to select/create the real **customer external tenant** and prepare its **development BFF Web registration**, including the intended user flow and exact proposed callback. Then provide only the public directory/client IDs, verified metadata URL/issuer and registered callback/logout URIs for review; never send secret values or tokens. That setup does not authorize any protected database bootstrap or activation. Stop here after FEATURE-001D; no Members & Roles/Feature-002 work is started.
