# FEATURE-003 — Browser, persistence and regression evidence

Date: 2026-11-04. Evidence: `.tmp/feature003-evidence/` (local ignored test artifacts). Synthetic fixture identifiers are not production configuration. Private cluster state/runtime password files are not deliverables.

## Actual test chain

The browser runner verifies disposable identity/marker and physical storage before launching actual compiled Admin Service, Console BFF and built Angular through a loopback UI proxy. Applications use nonowner `skyra_org_runtime`; fixture creation/assertions use separately verified isolated owner helpers. The test provider performs real code exchange, S256 PKCE, browser-bound state/nonce and RS256/JWKS verification; BFF mock OIDC mode is false. Microsoft Edge is controlled through Playwright. No real Microsoft tenant/app registration, production credentials or fake Admin/persistence responses are used.

The shared harness preserves Organization and Members regressions and appends Project scenarios. Final environment, synthetic browser fixtures, process logs, screenshots and accessibility JSON are retained. `e2e-environment.json` identifies actual loopback ports/issuer and fatal console errors; final outcome appears in final acceptance.

## Individual tests and commands

| Command | Individual result | Evidence |
|---|---|---|
| `pnpm --filter @skyra/admin-service test` | 94 passed | `admin-tests.log` |
| `pnpm --filter @skyra/console-bff test` | 97 passed | `bff-tests.log` |
| `pnpm --filter @skyra/console-web test` | 97 passed | `web-tests.log` |
| `node --experimental-strip-types --test tests/contracts/admin-contracts.test.ts tests/contracts/organization-contracts.test.ts tests/contracts/member-management-contracts.test.ts tests/contracts/project-management-contracts.test.ts` | 14 passed | `contracts-tests.log` |
| `node --test tests/projects/persistence.test.mjs tests/projects/ingestion-lifecycle.test.mjs` | 27 leaf tests; TAP 28 includes one parent | `project-database-tests.log` |
| `node --test tests/admin/isolated-target.test.mjs` | 15 passed | `guards.log` |
| `node scripts/run-isolated-pg-tests.mjs hardened` | 10 passed | `hardened.log` |
| `node scripts/run-isolated-compatibility.mjs` | 21 passed | `ingestion-compatibility.log` |
| `node scripts/run-project-query-tests.mjs` | 210 passed, 0 skipped | `query-isolated-tests.log` |
| `node --test tests/members/persistence.test.mjs` | 17 leaf tests; TAP 18 includes parent | `members-persistence.log` |
| `node --test tests/organization/persistence.test.mjs` | 9 leaf tests; TAP 10 includes parent | `organization-persistence.log` |
| `node scripts/run-projects-e2e.mjs` | 38 leaf scenarios; TAP 39 includes parent, 0 failed/skipped | `projects-e2e.log` |
| `node scripts/verify-design-system-governance.cjs` | 6 gates passed; not added to test count | `governance.log` |

All listed passing commands exit 0. Final browser and Organization/Members persistence rechecks are recorded in final acceptance. No totals are inflated by wrapper commands, describe suites or nested parent containers. Build/typecheck/migration checks are separate checks, not test cases.

Prerequisites: `node scripts/prepare-project-tests.mjs`, current Admin/BFF/Console builds and BFF test compilation (which supplies the signed-provider fixture). Then `node scripts/run-projects-e2e.mjs`. The preparer validates/applies only reviewed disposable SQL and rejects changed migration bytes/catalog. It also creates fresh synthetic organization/identity fixtures using existing guarded seed infrastructure. Repeated runs do not delete unrelated records. Do not run the historical pre-hardening/four-entry-ledger suites against the current six-entry database.

## Real PostgreSQL coverage

Project cases cover server-resolved tenant/default ACTIVE/optional ID, trimmed validation, generic foreign-code duplicate conflict, concurrent duplicate creation and one audit; bounded tenant/scoped lists, compound filters, sorting, stable cursor context, foreign/inaccessible detail denial; scoped ProjectAdmin read/edit versus create/archive denial; Developer read-only, inactive identity/membership and forged claims; immutable field rejection; microsecond versions, missing/malformed/context/stale preconditions; concurrent name/status writers; valid suspend/reactivate/archive and terminal archive; actual database-trigger audit INSERT failure rolling create/name/status/version back; retained quota/membership references and cross-tenant quota FK; runtime ID/tenant/delete/audit privilege denials; workspace directory refresh after create/rename/inactivation; role/membership revalidation; and changed migration artifact/catalog rejection with rollback.

Separate ingestion integration invokes the actual ingestion ProjectService and Prisma project/quota repositories against the same persisted project while Admin changes its status. ACTIVE admission succeeds, SUSPENDED/ARCHIVED fail 403, reactivation restores admission. Quotas remain and a digest of existing credential rows is unchanged. A previously authenticated synthetic machine identity is supplied to the project admission layer; this is not a full transport/batch-ingestion or credential issuance test.

The initial general Query suite reported 209 passes and one offline live-database skip because its legacy fallback uses a placeholder URL. The guarded isolated runner explicitly verifies target/physical storage, supplies the disposable URL and runs all compiled Query tests: 210 passes, no skips. No Query Service source redesign was performed.

## Browser scenarios

The suite runs 18 existing signed-OIDC/Organization scenarios, nine Members scenarios and 11 Project scenarios (38 individual scenarios; TAP 39 includes the shared parent):

1. Real list, next/previous page, search, ACTIVE filter and name-descending server sort.
2. Create-form validation, actual project creation, refresh persistence, tenant/default status and database audit.
3. Settings cancellation, dirty navigation, saved rename, second-browser stale conflict, preserved draft/reload and persisted audit.
4. Duplicate code with actionable conflict and no second row.
5. Session, CSRF, If-Match, strict typed status/immutable fields, assertion scope and tenant override/cross-tenant denial.
6. Scoped ProjectAdmin sees one project, edits only it, and cannot create/archive/escape; create screen denied.
7. New/renamed projects appear in real workspace directory; valid selection remains tenant-safe.
8. Confirmed suspend/reactivate/archive, persistence, inactive workspace removal/selection clearing, new query-grant denial and terminal archive.
9. Empty list, gated real request loading, network failure and successful Retry.
10. Desktop/tablet/mobile light/dark list, form labels, scoped axe, document overflow, modal keyboard focus and Escape.
11. Expired browser session cookie leads to project API 401/login navigation; explicit CSRF-protected logout denies subsequent project access. Server idle/absolute lifetime handling is additionally covered by BFF security tests; the browser cookie case is not a clock-travel test of those server timers.

Project list navigation additionally asserts the actual signed-provider profile and absence of the old demo profile. Organization regression includes real Admin outage/restart, delayed saving, audit rollback, callback failures, session fixation prevention and provider/local logout. Project-specific network failure uses Playwright connection abort and is not represented as terminating a service.

## Visual and accessibility evidence

Screenshots: `projects-{1440,768,390}-{light,dark}.png`, `projects-filtered.png`, `project-details.png`, `project-conflict.png`, `project-workspace.png`, `project-create-mobile.png`, `project-confirmation.png`. Six list axe scans report zero violations in `projects-accessibility.json`; scoped create-form and open-dialog checks run without excluded rules. Keyboard focus is checked through the composed slot/shadow tree, Escape closes the modal, and the document width is asserted not to exceed viewport width. Wide tables intentionally scroll within their panel on tablet/mobile.

Final visual review checks all six list layouts, create form, project details/conflict and confirmation, including the corrected real user/header. This is scoped browser/automated/manual evidence, not full WCAG certification or a comprehensive screen-reader/device matrix.

## Failures corrected and limits

Initial persistence assertions incorrectly expected synchronous DTO throws as already-created promises; corrected asynchronous test wrappers retained the actual 400/428 behavior. Audit rollback tests now use database-trigger insertion failure, not a mocked persistence success. Angular tests exposed automatic local fallback selection after server selection disappeared; this was removed. Visual review exposed the existing `/projects` list still using its preview-friendly guard and topbar fallback profile/context: authoritative bootstrap and actual project header context replaced that path. DTO review caught status-array coercion; explicit string validation and unit/real-HTTP regression checks were added. All production fixes are checked in the latest applicable runs.

Automatic approval review timed out once before starting a database-test command; the same authorized isolated test was retried successfully. That timeout was not treated as a security rejection or bypassed. Preliminary skipped/failing results are not counted as final passes.

No real Entra login, protected activation, deployment, credential-issuance feature, quota feature, hard deletion or unrelated milestone is tested/claimed. Existing compatibility suites use disposable synthetic data. Internal assertions already issued before a change may live until their 60-second lifetime plus existing five-second Query Service clock-skew grace; work already authorized is not globally cancelled. See database/security report for runtime boundary, exact migrations and protected preservation.
