# FEATURE-002 — Verification report

Date: 2026-11-04. Evidence directory: `.tmp/feature002-evidence/` (local, ignored). It contains synthetic fixtures and test outputs, not deliverable production credentials. Do not publish private isolated-cluster state files.

## Completed service and database checks

| Check | Result | Evidence |
|---|---|---|
| Admin Service unit/security suite | 77 passed, 0 failed | `admin-tests.log` |
| Console BFF unit/security suite | 94 passed, 0 failed | `bff-tests.log` |
| Angular state suite | 85 passed, 0 failed | `web-tests.log` |
| Admin JSON contracts | 11 passed, 0 failed | `contracts.log` |
| Disposable-target guards | 15 passed, 0 failed | `guards.log` |
| Hardened PostgreSQL/audit/runtime checks | 10 passed, 0 failed | `hardened.log` |
| Existing ingestion PostgreSQL compatibility | 21 passed, 0 failed | `compatibility.log` |
| Members real nonowner persistence | 18 passed including parent, 0 failed | `persistence.log` |
| Organization persistence regression | 10 passed including parent, 0 failed | `organization-persistence.log` |
| Signed-OIDC browser integration | 28 passed including parent, 0 failed | `members-e2e.log` |
| Design-system governance | 6 gates passed | `governance.log` |

Final persistence/browser counts and final rechecks are recorded in the final acceptance report. TAP totals for nested tests include the parent; leaf scenario counts are stated separately where relevant. Tests are scoped to FEATURE-002 and affected integrations, not a claim that every SDK/cloud/deployment path was tested.

## Security evidence

`tests/members/persistence.test.mjs` runs the compiled service against actual isolated PostgreSQL as the nonowner runtime. It checks combined filters and cursor ordering, project-role preservation, safe projection, status lifecycle and project revocation, role/capability denial despite forged claims, OrgAdmin/OrgOwner boundaries, cross-tenant target/cursor rejection, last-owner denial with disabled owners excluded, concurrent two-owner self-demotion, concurrent suspension/demotion, stale-version serialization, audit failure rollback for both role and status changes, self-demotion access loss, pending/disabled read-only policy, FK/unique/scope constraints and audit/DDL privilege denial.

Existing Organization persistence regressions exercise real adapters rather than fixtures masquerading as persistence. Guard tests reject protected host/port/database, credentials and missing/wrong marker targets before writes. Hardened tests verify immutable audit and runtime privilege boundaries. Compatibility tests ensure new IAM constraints do not break existing ingestion metadata writes.

New unit tests cover exact DTO/filter/precondition validation, BFF explicit projection and authoritative directory refresh on query/workspace requests. Angular tests verify real component state transitions including confirmations, ETag forwarding, stale drafts, denied data clearing, lifecycle actions and pagination. These are complemented by real browser/service/database tests.

## Browser method and coverage

Runner: `node scripts/run-members-e2e.mjs`, after `node scripts/prepare-members-tests.mjs` and builds of Admin, BFF and Console. It verifies disposable identity/physical storage first, then launches actual Admin, BFF and built Angular application. Playwright uses installed Microsoft Edge. An isolated ephemeral-RSA OIDC fixture supplies actual discovery/JWKS, one-use authorization codes and PKCE exchange; BFF mock mode is false. No real Microsoft account, tenant or app registration is involved.

The shared organization harness runs 18 signed-provider/Organization regression scenarios, followed by nine Members scenarios:

1. Persisted list, stable next/previous pages, search, status/role filters and details.
2. Confirmed role edit, browser reload persistence and immutable database audit.
3. Draft cancellation and two-browser stale conflict preserving the first commit.
4. Anonymous, CSRF, If-Match, cross-tenant, scope and strict-payload rejection through HTTP.
5. Ordinary-member denied UI and OrgAdmin owner-grant denial.
6. Last-owner backend and UI protection.
7. Confirmed suspension/reactivation/revocation, reload persistence and established-session next-request denial.
8. Empty results, delayed real request loading, network failure feedback and successful retry.
9. Desktop/tablet/mobile light/dark accessibility and confirmation keyboard behavior.

Organization regressions also cover real backend outage/retry, delayed loading/saving, name validation, dirty navigation, transactional audit rollback, scoped identity/membership checks and signed OIDC callback/session/logout failures. Member-specific network failure is injected through Playwright connection abort, distinct from terminating a service.

Screenshots include `members-list.png`, `member-details.png`, `member-conflict.png`, `members-denied.png`, `member-confirmation.png`, and `members-{1440,768,390}-{light,dark}.png`. All six list axe scans have zero violations; open dropdown and open dialog also pass, with modal composed-tree focus and Escape verified. All six list layouts and the mobile dialog were visually inspected. Tablet/mobile tables deliberately scroll horizontally within their panel. Automated checks and screenshots are not a WCAG certification or a complete screen-reader/device matrix.

## Defects discovered during implementation

Early tests exposed incorrect test exception matching and an old FK probe now intercepted by the new administrative role-scope trigger. The probe now uses a valid project role and always rolls back. Browser tests exposed inaccessible host-only action labels, unsupported `secondary` button styling, duplicate alert wrapping, incorrect Empty State property, subtle text contrast and duplicated dropdown roles. Consumer code now uses actual package APIs, visible action labels, correct headline input and scoped token/accessibility adapters. Slotted text required accessible-name rather than textContent menu selection. An intermediate selector-edit syntax failure and a Windows Prisma engine file-lock during overlapping cleanup were resolved before final checks; they were not interpreted as successful validation. Initial failing logs are retained where available.

Final acceptance uses the latest successful run, not preliminary partial outputs. No security check was disabled to obtain a pass. The historical pre-hardening migration suite and FEATURE-001C four-entry-ledger readiness script were not run against the five-entry migrated database; current guard, hardened and integrity checks are the applicable checks.
