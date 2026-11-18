# SKYRA LOGHUB — DEV-015

Acceptance date: 2026-11-16 (Asia/Calcutta). Evidence is local, isolated and sanitized.

## Outcome and dependency inventory

**PASS — DEV-015 IMPLEMENTED IN ISOLATION.** Persistent saved searches, canonical independent correlation IDs and bounded multi-page JSON/CSV export are implemented and verified through the real product path. All mandatory DEV-015 acceptance boundaries and relevant regressions passed. This verdict does not activate protected development or assert real Microsoft login.

Existing components were Angular LogExplorerFacade/FilterStateService/CursorHistoryService, BFF session/CSRF/query proxy, Query planner/canonical-field compiler/signed cursor, Admin project IAM/audit and SDK canonical schema → Gateway WAL/archive. The precise gaps were server-persisted saved configurations, an explicit canonical correlation field and server-side multi-page export. Changes reuse those dependencies; no storage/authentication/analytics redesign was introduced.

## Saved searches

One additive saved_searches table has UUID identity, tenant/project composite foreign key, immutable creator FK, bounded name/description, PRIVATE/PROJECT visibility, v1 JSON filters, bigint version and timestamps. Unique owner/project/name and owner/shared keyset indexes support scoped reads. The API accepts only text, severity, service, environment, independent trace/correlation and relative/absolute UTC ranges; no SQL/AST/owner/scope overrides. Relative presets resolve at application time; absolute bounds remain fixed.

Admin enforces current IAM in every transaction. Private ownership is strict even against OrgAdmin; shared management reuses projects.update and does not expand the existing 20-capability policy. Shared creator departure retains manageable project searches; private searches remain inaccessible. GET/list are authorized; create/update/delete are transactional. If-Match is required for update/delete, locked rows serialize version comparison, stale writes conflict, and duplicate names fail predictably. Browser reload, BFF crash, actual PostgreSQL stop/start, cold browser process and a new signed OIDC session preserve the records/filter semantics. No localStorage persistence is used.

New migration SHA-256 `cff6b71a0d456ba9eda2a7937b8f90e7fce641a0925769ca4637cdc0dff9518f`; initial transaction rollback, first deployment, repeat verification, nine constraints, eleven columns, four indexes and restricted grants passed. Intentional constraint/index/grant/ledger drift was detected and rolled back. All previous migration checksums remain intact.

## Correlation and pipeline

Optional correlation: {id:string}; ASCII [A-Za-z0-9][A-Za-z0-9._:/-]{0,127}, case-sensitive, 1..128 characters. Missing is valid; null/empty/malformed is rejected. Node LogContext.correlationId is independent of traceId and nested attributes. SDK invalid-event rejection increments observable drop count. Canonical v1 TypeScript/Python mirrors remain synchronized; previous callers/events remain valid.

Actual local topology: fresh public ESM SDK tarballs on Node 24.14.0 and 22.23.4 → managed-credential Gateway → actual WAL → canonical JSONL → actual Query Service (JSONL then Parquet-only) → authenticated BFF → optimized Angular Console in Playwright/Edge. Admin and BFF use their restricted runtime roles; Gateway/Query use the established ingestion/query metadata role. A local signed controlled OIDC provider drives the real code/state/PKCE/nonce/session flow. It is test configuration, not Microsoft login. A test-only delaying proxy forwards real Query business responses to exercise publication/cancellation. Synthetic export-fault peers are labeled separately and do not substitute for same-event continuity. Owner connections are confined to guarded test provisioning/verification, never the SDK process or BFF launch.

## Export implementation

BFF POST /bff/query/export authenticates session/CSRF and a single authorized project, freezes effective time/filter context and starts matching traversal at page one. It validates Query response scope, canonical records, pagination, unavailable/partial segments and duplicate identities. Authority is refreshed before each page and before sending. Current-page event IDs can be supplied to reject changed displayed pages with 409. Errors preserve safe Query validation status (including 422 invalid cursor) and BFF authorization status.

Limits: 1,000 matching events, 10 pages × 100 events, 5 MiB uncompressed output, 15 seconds, two exports per BFF and one per session. Current-page scope preserves up to 500 displayed rows. Query JSON is at most 8 KiB, request options 32 KiB and an upstream response 6 MiB. Slots remain until response finish/close and pending authority work settle; stalled downloads are destroyed at the deadline. Disconnect/cancel aborts upstream fetch. Buffering is bounded before download headers, so late failures do not produce deceptively complete files.

JSON has scope/filters/metadata/events; CSV quotes all nine columns and retains complete canonical_json. Formula-leading display values are prefixed with an apostrophe, including leading whitespace/control/Unicode format characters. Original JSON message content is preserved. Valid byte truncation occurs only at an event boundary. Metadata and exposed X-Export headers/constant -truncated filenames explicitly distinguish completion from truncation; effective consistency is bounded-keyset-traversal. The Console warns and allows cancellation. [Advanced Explorer contract](docs/DEV-015-advanced-explorer.md)

## Console and navigation

The existing Explorer/facade/filter/cursor architecture remains. The targeted panel uses existing Skyra Platform inputs/buttons and native labeled selects: My/private versus Project-shared names, create/save-current/apply/update/rename/delete with confirmation, version-conflict feedback, relative/custom ranges and loading/errors. Correlation is an independent toolbar input/chip and drawer display/copy/filter action. Current-page and matching JSON/CSV exports are distinct, use the last successfully applied search, and report cancellation/truncation/failure truthfully. Scope changes clear saved state and cancel pending export; generation checks discard stale responses. URL correlation/search references and back/forward restore without expanding project authority. Existing Analytics trace/time/level deep links remain covered by the integrated regressions.

The production Console build passed with optimized scripts/styles. Only external Google-font build-time inlining was disabled in the temporary offline build helper; product configuration was not altered. Playwright exercised six advanced Explorer scans at 1440/768/390 px in light/dark, zero WCAG A/AA/2.1 AA Axe violations, no document overflow, reduced motion and keyboard focus. Existing multi-feature accessibility coverage also passed. The loading-state progress bar now has an accessible name and the Cancel button uses the existing theme-safe outline variant. [`.tmp/dev015-evidence/advanced-accessibility.json`](.tmp/dev015-evidence/advanced-accessibility.json)

## Audit decision

Private saved-search operations intentionally create no tenant-wide administrative audit, avoiding leakage of private query text. Shared creates/updates/deletes write append-only administrative audit events inside the same transaction, with resource ID, actor, project, version, outcome and operation correlation only. Names/descriptions/filters are excluded. Both Admin and BFF audit projections recognize the new target/actions. Forced audit failure proved the shared mutation rollback. Read/export activity uses existing Query operational audit rather than new administrative mutation noise. Existing audit retention/settings remain unchanged.

## Activation and operator contract

[Advanced Explorer contract](docs/DEV-015-advanced-explorer.md) documents the exact API/permissions/filters/limits and flags: Admin SAVED_SEARCHES_ENABLED, BFF ADVANCED_EXPLORER_ENABLED, Console runtime advancedExplorer. All defaults remain off. The new additive migration was applied only to disposable PostgreSQL.

## Validation

Counts below are completed leaf tests; parent containers and suites are excluded. Repeated runtime executions are shown separately and are not asserted to be unique test definitions.

| Evidence log | Passing leaves | Result |
|---|---:|---|
| contracts.log | 40 | PASS |
| contracts22.log | 40 | PASS |
| saved-search-security-final.log | 14 | PASS |
| saved-search-migration.log | 5 | PASS |
| export-faults-final.log | 20 | PASS |
| integrated-browser.log | 47 | PASS |
| sdk-tests24.log | 103 | PASS |
| sdk-tests22.log | 103 | PASS |
| core-contracts24.log | 66 | PASS |
| core-contracts22.log | 66 | PASS |
| ingestion-gateway-tests.log | 124 | PASS |
| admin-service-tests.log | 98 | PASS |
| bff-tests.log | 115 | PASS |
| console-tests.log | 108 | PASS |
| query-tests.log | 214 | PASS |
| target-guards.log | 15 | PASS |
| quota-integration.log | 16 | PASS |
| quota-boundaries.log | 4 | PASS |
| admin-postgres-hardening.log | 10 | PASS |
| credentials-persistence.log | 28 | PASS |
| audit-persistence.log | 10 | PASS |
| developer-documentation.log | 4 | PASS |
| developer-sample.log | 8 | PASS |
| storage-lifecycle.test.log | 15 | PASS |
| storage-ownership.test.log | 4 | PASS |
| storage-database-restart.log | 1 | PASS |
| session-migration.log | 5 | PASS |
| session-persistence.log | 15 | PASS |
| session-http-security.log | 11 | PASS |
| session-outage-recovery.log | 4 | PASS |
| session-cleanup-recovery.log | 1 | PASS |
| sdk-gateway-lifecycle.log | 6 | PASS |
| sdk-app-exit.log | 2 | PASS |

Additional checks: all 12 package/application typechecks, optimized Console production build, both Prisma validate/generate pairs, schema synchronization, design governance, both fresh tarball consumers/public declarations, package safety/API audit and 14 Python schema tests passed.

## Preservation

Initial main HEAD `19f084ad36fe37bb57ca107103e136d2d4a378be`: 395 folded entries, 150 tracked modified, 245 untracked, 0 staged. Final same main HEAD: 422 folded entries, 162 tracked modified, 260 untracked, 0 staged. All 1408 initial files remain, including original untracked work. 210 historical reports/migration/archive artifacts are byte-unchanged. 73 existing source files changed for this feature, 25 files were added, and 1 generated cache changes were recorded.

Platform remains clean at `928ca4343ab3a1887e586123a6ba5bb88b56a0ef`; all 37 immutable package archives match their initial/HEAD bytes. Gateway storage/DEV-012 maintenance and the Parquet converter, DEV-013 session repository/crypto/OIDC code and DEV-014 HttpTransport/write queue are byte-preserved. The session guard extraction enables reuse of the same authentication logic for export revalidation. Both Prisma mirrors match, and removal of only the three new inverse relations plus new SavedSearch model reproduces the exact initial schema bytes, including original mixed line endings. Existing eleven ledger identities/checksums remain unchanged; the sole additive ledger entry is `20261116000000_dev015_saved_searches`. Git whitespace check passes. No git commit/reset/rebase/merge/push was performed. [`.tmp/dev015-evidence/final-audit.json`](.tmp/dev015-evidence/final-audit.json)

## Limitations

Exports are bounded keyset traversals, not global snapshots. A newer archived event inserted ahead of the cursor appeared in the next search but was not retroactively added to the running export. Limits can truncate valid files; deadline, unavailable archives and late failures return no complete file. Export admission is per BFF instance, not a distributed cluster-wide limit. Bounded buffering still consumes memory; these tests are not production load certification. Cancellation cannot retract bytes already delivered. No durable export-job resume exists.

Saved-search creation has a per-creator accessible-count guard of 200; it is not a global aggregate guarantee when other creators add shared searches. Lists are capped/paginated. Names are unique per owner/project; different owners can intentionally use the same shared name. SQL-only checks and the partial shared index remain in the migration because Prisma 5 does not model them fully.

The optional full Python SDK run stalled in the unchanged storage ownership path after the duplicate-instance conflict diagnostic and was stopped only after verifying its exact task-owned PID/command. Its log is retained; that full suite is **incomplete**, not passed. The relevant 14 Python schema tests passed and only its generated schema mirror changed. No DEV-015 P0/P1 defect remains in the tested scope.

Real Microsoft Entra configuration/login, initial organization/verified owner decisions, protected activation, deployment and publication remain outside this isolated acceptance. No protected records or grants were changed; no DEV-016 work was started.
