# LOGHUB-FEATURE-001B — browser and E2E verification

Date: 2026-11-03, Asia/Calcutta. **PASS in the isolated environment**.

## Environment and authenticity of the test

PostgreSQL 17.9, 127.0.0.1:5433, skyra_loghub_disposable_validation, independently initialized cluster/data directory and ownership marker from Feature-001A. The driver verifies both the owner test target and the separate skyra_org_runtime connection before launching applications. Admin/BFF use the compiled real Nest applications, their normal guards/filters, real Prisma persistence and restricted runtime credentials. Test HTTP ports are allocated dynamically; the final values are recorded in `.tmp/feature001b-evidence/e2e-environment.json`.

Browser: installed Microsoft Edge through Playwright's msedge channel, headless. Bundled Playwright Chromium was unavailable; no browser validation was claimed until the installed browser actually ran. A local test static server serves the production Angular build and proxies /bff to the real BFF. Its public runtime configuration contains only the BFF URL and preview=false, never service credentials.

Authentication uses the **existing** OIDC mock code exchange explicitly enabled in NODE_ENV=test, with synthetic issuer/subject identities that already exist in the real database. Login state/callback, session creation, HTTP-only cookies, session bootstrap and CSRF are the application paths. Directory resolution, role decisions, tenant reads/updates and audit transactions are not mocked. Organization forwarding rejects mock OIDC outside test mode. No permanent test-login endpoint, fixture membership provider or backend persistence mock was added.

Paths: GET/PATCH `/admin/v1/tenants/:tenantId`, internal directory GET `/admin/v1/me/memberships`, GET/PATCH `/bff/organization`, and browser `/organization` / `/organization/settings`.

## Final scenarios

`pnpm test:organization:e2e` exits 0. **14 scenario tests passed**, with zero failures/skips; Node additionally reports the parent test, so its raw test count is 15, not 15 independent scenarios.

| Scenario | Verified result |
|---|---|
| Runtime boundary | Non-owner role cannot rewrite/delete/truncate audit, disable triggers, create tables or update tenant id/code/creation/status |
| Tenant/project integrity | Both mismatched membership and role-assignment inserts fail with FK violations |
| Assertion/auth scope | Anonymous/forged/expired assertions rejected; tenant A cannot read or PATCH tenant B |
| Membership/permission | Disabled identity, missing/suspended/revoked membership and Viewer refused; rejected mutation preserves name/audit count; denied UI captured |
| BFF security/validation | Missing session 401; anonymous UI redirected to login; missing CSRF 403; missing precondition 428; invalid/immutable/unknown fields 400; wrong organization-bound precondition 409; browser tenant query cannot select another organization |
| Loading/saving | Delayed requests continue to the real backend; loading/saving feedback appears |
| Persisted browser update | Owner reads real metadata, saves trimmed name, refreshes, sees persisted value; DB audit contains stored actor, before/after, correlation and SUCCESS |
| Form behavior | Invalid input disables save; cancel restores current value; unsaved navigation is rejected when dialog is dismissed |
| Concurrency | Two authenticated browser contexts load the same version; first save persists; stale second save gets conflict; explicit reload adopts latest value |
| Atomic audit failure | Test-created DB trigger rejects one correlation-specific audit insert; HTTP mutation fails and both name and successful-audit count remain unchanged; trigger/function are removed afterward |
| Inactive state | Suspended organization remains readable, PATCH denied, no mutation audit; settings show read-only state; test restores ACTIVE |
| OrgAdmin | Persisted OrgAdmin membership successfully updates through the same BFF/API path |
| UI/accessibility | Desktop/tablet/mobile, light/dark, visible in-viewport content, no horizontal overflow, real keyboard focus/Enter navigation, no fatal page errors |
| Error recovery | Real test Admin process stopped; browser shows service error; same application restarted and Retry reloads persisted organization |

The separate `pnpm test:organization:persistence` run passes **9 adapter cases** (raw Node count 10 including parent), covering identity uniqueness/trust/status, real memberships/roles, last owner, cross-tenant lookup, audit persistence/redaction and name CHECK. This is database integration evidence, not substituted for browser E2E.

## Visual/accessibility evidence

Screenshots are under `C:\Users\VAMSHIKA\source\repos\skyra-tech-projects\skyra-log-hub\.tmp\feature001b-evidence\`:

- organization-overview.png
- desktop-light.png, desktop-dark.png — 1440×1000
- tablet-light.png, tablet-dark.png — 768×1024
- mobile-light.png, mobile-dark.png — 390×844
- permission-denied.png, concurrency-conflict.png, service-error.png

Screenshots were captured from real authenticated application states and inspected. Initial screenshots exposed an unregistered shell that placed content outside the viewport; the public registerAppShell call and supported part sizing corrected it. Mobile header/breadcrumb crowding and local theme-token cycles were also fixed. Tests now assert the organization has visible viewport bounds, rather than relying only on the absence of a scrollbar.

`accessibility.json` records **zero violations in all six combinations**, using axe-core WCAG 2 A/AA and 2.1 AA tags scoped to the organization component and its shadow components. This is not a whole-console or assistive-technology certification. Keyboard testing moves from the name input to the real enabled Back button and activates it with Enter. Fatal JavaScript page-error collection is empty; expected failed network requests in negative scenarios are not presented as application crashes.

## Failures found and corrected

Earlier failing runs are not final acceptance: missing bundled browser; selectors ambiguous after correct header/error rendering; assertions preceding Angular rendering; missing shell registration; dark/light text contrast; cyclic muted-token aliases; and the missing organization-bound ETag context. All final scenarios pass after those fixes. The external IdP exchange remains simulated only for isolated tests. Real provider credentials/algorithm compatibility, protected bootstrap and activation require separate review; no protected browser workflow is claimed.
