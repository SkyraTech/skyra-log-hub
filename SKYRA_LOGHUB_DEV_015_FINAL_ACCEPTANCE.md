# SKYRA LOGHUB — DEV-015

Acceptance date: 2026-11-16 (Asia/Calcutta). Evidence is local, isolated and sanitized.

## 1. Executive summary

**PASS — DEV-015 IMPLEMENTED IN ISOLATION.** Persistent saved searches, canonical independent correlation IDs and bounded multi-page JSON/CSV export are implemented and verified through the real product path. All mandatory DEV-015 acceptance boundaries and relevant regressions passed. This verdict does not activate protected development or assert real Microsoft login.

## 2. Initial Git/source state

Initial main HEAD `19f084ad36fe37bb57ca107103e136d2d4a378be`: 395 folded entries, 150 tracked modified, 245 untracked, 0 staged. Final same main HEAD: 422 folded entries, 162 tracked modified, 260 untracked, 0 staged. All 1408 initial files remain, including original untracked work. 210 historical reports/migration/archive artifacts are byte-unchanged. 73 existing source files changed for this feature, 25 files were added, and 1 generated cache changes were recorded.

Platform remains clean at `928ca4343ab3a1887e586123a6ba5bb88b56a0ef`; all 37 immutable package archives match their initial/HEAD bytes. Gateway storage/DEV-012 maintenance and the Parquet converter, DEV-013 session repository/crypto/OIDC code and DEV-014 HttpTransport/write queue are byte-preserved. The session guard extraction enables reuse of the same authentication logic for export revalidation. Both Prisma mirrors match, and removal of only the three new inverse relations plus new SavedSearch model reproduces the exact initial schema bytes, including original mixed line endings. Existing eleven ledger identities/checksums remain unchanged; the sole additive ledger entry is `20261116000000_dev015_saved_searches`. Git whitespace check passes. No git commit/reset/rebase/merge/push was performed. [`.tmp/dev015-evidence/final-audit.json`](.tmp/dev015-evidence/final-audit.json)

## 3. Existing Explorer architecture

Existing components were Angular LogExplorerFacade/FilterStateService/CursorHistoryService, BFF session/CSRF/query proxy, Query planner/canonical-field compiler/signed cursor, Admin project IAM/audit and SDK canonical schema → Gateway WAL/archive. The precise gaps were server-persisted saved configurations, an explicit canonical correlation field and server-side multi-page export. Changes reuse those dependencies; no storage/authentication/analytics redesign was introduced.

## 4. Saved-search data model

One additive saved_searches table has UUID identity, tenant/project composite foreign key, immutable creator FK, bounded name/description, PRIVATE/PROJECT visibility, v1 JSON filters, bigint version and timestamps. Unique owner/project/name and owner/shared keyset indexes support scoped reads. The API accepts only text, severity, service, environment, independent trace/correlation and relative/absolute UTC ranges; no SQL/AST/owner/scope overrides. Relative presets resolve at application time; absolute bounds remain fixed.

Admin enforces current IAM in every transaction. Private ownership is strict even against OrgAdmin; shared management reuses projects.update and does not expand the existing 20-capability policy. Shared creator departure retains manageable project searches; private searches remain inaccessible. GET/list are authorized; create/update/delete are transactional. If-Match is required for update/delete, locked rows serialize version comparison, stale writes conflict, and duplicate names fail predictably. Browser reload, BFF crash, actual PostgreSQL stop/start, cold browser process and a new signed OIDC session preserve the records/filter semantics. No localStorage persistence is used.

New migration SHA-256 `cff6b71a0d456ba9eda2a7937b8f90e7fce641a0925769ca4637cdc0dff9518f`; initial transaction rollback, first deployment, repeat verification, nine constraints, eleven columns, four indexes and restricted grants passed. Intentional constraint/index/grant/ledger drift was detected and rolled back. All previous migration checksums remain intact.

## 5. Saved-search authorization

| Boundary | Demonstrated result |
|---|---|
| Private owner | Read/edit/delete only with current log/project access |
| Other owner, ordinary member, OrgAdmin | Private listing/read/edit/delete denied or not found |
| Shared reader | Read allowed; mutate/sharing escalation denied |
| Shared manager | projects.update plus logs.search/current project access required |
| Creator sharing transition | Owner-only; shared transition also requires projects.update |
| Tenant/project overrides and foreign IDs | Rejected; no foreign saved filters or log events returned |
| Revoked/suspended identity, removed project scope | Direct API denial; reactivation does not revive revoked cookie |
| Inactive project | Saved-search/export denied according to current Explorer authority |
| CSRF/missing session | Mutation/export denied |
| Stale/missing version | 409/428; simultaneous updates produce one success and one conflict |
| Shared mutation/audit failure | Entire transaction rolls back |
| Mid-export revocation or suspension | Buffered events discarded before download headers |
| Query scope/record/cursor/partial-result faults | No apparently complete partial file |
| File name/formula/Unicode inputs | Constant file names, bounded cells, formula neutralization, round-trip canonical JSON |
| Limits/concurrency/deadline/disconnect | Event/byte/page bounds, 1/session and 2/BFF, abort and slot release tested |
| Database roles | Only Admin CRUD on saved_searches; Gateway/Query/BFF no table grants; no TRUNCATE |
| Audit privilege | Admin append/read only; UPDATE/DELETE/TRUNCATE remain denied |

## 6. Saved-search persistence and concurrency

Fourteen real persisted API security leaves plus the browser journey passed. Two concurrent updates accept one current ETag and reject the other, with stale rename/delete conflicts. A separate real PostgreSQL restart retained both saved configuration and session; transient restart reads were allowed to fail safely until readiness recovered. A BFF crash and two new cold browser processes/new authenticated session restored exact filters. [`.tmp/dev015-evidence/saved-search-security.json`](.tmp/dev015-evidence/saved-search-security.json)

## 7. Canonical correlation-ID schema

Optional correlation: {id:string}; ASCII [A-Za-z0-9][A-Za-z0-9._:/-]{0,127}, case-sensitive, 1..128 characters. Missing is valid; null/empty/malformed is rejected. Node LogContext.correlationId is independent of traceId and nested attributes. SDK invalid-event rejection increments observable drop count. Canonical v1 TypeScript/Python mirrors remain synchronized; previous callers/events remain valid.

## 8. SDK/Gateway/WAL propagation

Actual local topology: fresh public ESM SDK tarballs on Node 24.14.0 and 22.23.4 → managed-credential Gateway → actual WAL → canonical JSONL → actual Query Service (JSONL then Parquet-only) → authenticated BFF → optimized Angular Console in Playwright/Edge. Admin and BFF use their restricted runtime roles; Gateway/Query use the established ingestion/query metadata role. A local signed controlled OIDC provider drives the real code/state/PKCE/nonce/session flow. It is test configuration, not Microsoft login. A test-only delaying proxy forwards real Query business responses to exercise publication/cancellation. Synthetic export-fault peers are labeled separately and do not substitute for same-event continuity. Owner connections are confined to guarded test provisioning/verification, never the SDK process or BFF launch.

Project `advanced-7398f558-8c1` admitted 1247 distinct real SDK events: initial 1,246 plus one during export. The independent correlation cohort initially had 237 events across three services and two traces; it became 238 after the later publication. A lower-case correlation variant matched only its five events, three legacy events remained absent from correlation, and the 1,001-event cohort exercised the event limit. Same-correlation events in another project and tenant did not leak. 238 final correlated IDs and all 1247 admitted IDs are recorded in [`.tmp/dev015-evidence/advanced-e2e.json`](.tmp/dev015-evidence/advanced-e2e.json). Example same-event IDs: `004bda92-da4b-4bbf-84fb-49a89396160d`, `006aa3b1-02fc-4fad-a59f-231ee07d2595`. WAL payloads match original SDK events; authoritative tenant belongs to the WAL frame and is enriched into archive records. Archive/Query/BFF/drawer fields compare to that precisely defined enriched event. No client-generated tenant authority is accepted.

Twelve actual Parquet segments materialized and supported Parquet-only correlation search/export with identical canonical fields/IDs; all three historical no-correlation events remained readable. No old WAL/archive rewrite or physical correlation column was needed. Initial real JSON/CSV matching exports traversed three server pages for exactly 237 events; browser files round-trip the same IDs. Current-page JSON/CSV match the 25 displayed IDs. Empty export, exact 1,000 completion, 1,001 truncation, duplicate timestamps, new publication during export, cursor binding and actual expiry/tampering are verified. [`.tmp/dev015-evidence/advanced-materialized.json`](.tmp/dev015-evidence/advanced-materialized.json); [`.tmp/dev015-evidence/changing-dataset.json`](.tmp/dev015-evidence/changing-dataset.json)

## 9. JSONL/Parquet query compatibility

The original Parquet converter stores full canonical JSON. Catalog JSON extraction therefore supports correlation without changing the physical converter or rewriting existing caches. JSONL and Parquet-only tests compare the same SDK IDs and complete canonical fields, including legacy absence. Twelve segments were materialized and verified. [`.tmp/dev015-evidence/advanced-materialized.json`](.tmp/dev015-evidence/advanced-materialized.json)

## 10. Correlation-ID filtering

Direct Query/BFF correlation_id and UI URL correlation perform exact equality. Structured correlation.id supports eq/in/exists only. Combined severity/trace/text/time search and case-variant separation passed. Correlation participates in signed cursor fingerprints only when present, preserving old no-correlation fingerprints. Modified filters, tampered cursors and expiry fail safely; correlation never selects tenant/project authority.

## 11. Multi-page export design

BFF POST /bff/query/export authenticates session/CSRF and a single authorized project, freezes effective time/filter context and starts matching traversal at page one. It validates Query response scope, canonical records, pagination, unavailable/partial segments and duplicate identities. Authority is refreshed before each page and before sending. Current-page event IDs can be supplied to reject changed displayed pages with 409. Errors preserve safe Query validation status (including 422 invalid cursor) and BFF authorization status.

Limits: 1,000 matching events, 10 pages × 100 events, 5 MiB uncompressed output, 15 seconds, two exports per BFF and one per session. Current-page scope preserves up to 500 displayed rows. Query JSON is at most 8 KiB, request options 32 KiB and an upstream response 6 MiB. Slots remain until response finish/close and pending authority work settle; stalled downloads are destroyed at the deadline. Disconnect/cancel aborts upstream fetch. Buffering is bounded before download headers, so late failures do not produce deceptively complete files.

JSON has scope/filters/metadata/events; CSV quotes all nine columns and retains complete canonical_json. Formula-leading display values are prefixed with an apostrophe, including leading whitespace/control/Unicode format characters. Original JSON message content is preserved. Valid byte truncation occurs only at an event boundary. Metadata and exposed X-Export headers/constant -truncated filenames explicitly distinguish completion from truncation; effective consistency is bounded-keyset-traversal. The Console warns and allows cancellation. [Advanced Explorer contract](docs/DEV-015-advanced-explorer.md)

## 12. JSON/CSV correctness

Actual matching JSON and CSV each traverse three Query pages and round-trip the original 237 authorized IDs and all canonical fields. Current-page files match 25 displayed IDs. Zero matches remain a valid empty result. The 1,000 boundary is complete; 1,001 is explicitly truncated with 1,000 distinct IDs. Unit tests verify exact byte capacity and one-byte-over behavior; large BFF CSV output verifies the configured byte cap. Unicode, quotes/newlines, duplicate timestamps, canonical nested attributes and public-field projection passed. [`.tmp/dev015-evidence/advanced-export-json.json`](.tmp/dev015-evidence/advanced-export-json.json); [`.tmp/dev015-evidence/browser-export.csv`](.tmp/dev015-evidence/browser-export.csv)

## 13. Export limits and cancellation

The event/byte/page/time/concurrency limits in section 11 are enforced by the backend. Actual client disconnect, browser cancellation, Query outage, BFF crash, mid-export authority changes and held-request deadline passed. Buffered partial data is discarded on failure. Two active exports are allowed across distinct sessions; the same session and a third concurrent export are denied with 429 until response/authority work settles. [`.tmp/dev015-evidence/export-faults.json`](.tmp/dev015-evidence/export-faults.json)

## 14. CSV injection protection

Every cell is quoted and quotes doubled. A formula marker =,+,-,@ after whitespace/control/Unicode format characters receives an apostrophe prefix; leading control/format cells are also neutralized. Tests include tabs, C1/zero-width/control cases, Unicode, embedded quotes and newlines. canonical_json starts as a JSON object and preserves the raw original event content. No filename comes from user data.

## 15. Angular saved-search/filter/export UX

The existing Explorer/facade/filter/cursor architecture remains. The targeted panel uses existing Skyra Platform inputs/buttons and native labeled selects: My/private versus Project-shared names, create/save-current/apply/update/rename/delete with confirmation, version-conflict feedback, relative/custom ranges and loading/errors. Correlation is an independent toolbar input/chip and drawer display/copy/filter action. Current-page and matching JSON/CSV exports are distinct, use the last successfully applied search, and report cancellation/truncation/failure truthfully. Scope changes clear saved state and cancel pending export; generation checks discard stale responses. URL correlation/search references and back/forward restore without expanding project authority. Existing Analytics trace/time/level deep links remain covered by the integrated regressions.

The production Console build passed with optimized scripts/styles. Only external Google-font build-time inlining was disabled in the temporary offline build helper; product configuration was not altered. Playwright exercised six advanced Explorer scans at 1440/768/390 px in light/dark, zero WCAG A/AA/2.1 AA Axe violations, no document overflow, reduced motion and keyboard focus. Existing multi-feature accessibility coverage also passed. The loading-state progress bar now has an accessible name and the Cancel button uses the existing theme-safe outline variant. [`.tmp/dev015-evidence/advanced-accessibility.json`](.tmp/dev015-evidence/advanced-accessibility.json)

## 16. Browser navigation/deep links

Actual back/forward restored case-sensitive correlation state and kept the requested authorized project. Saved-search deep links resolve through the authorized backend. Missing/inaccessible saved references show a safe error while retaining manual filters. Existing trace, severity, UTC custom ranges, project and Analytics-to-Explorer links continue to work. [`.tmp/dev015-evidence/advanced-e2e.json`](.tmp/dev015-evidence/advanced-e2e.json)

## 17. Audit integration decision

Private saved-search operations intentionally create no tenant-wide administrative audit, avoiding leakage of private query text. Shared creates/updates/deletes write append-only administrative audit events inside the same transaction, with resource ID, actor, project, version, outcome and operation correlation only. Names/descriptions/filters are excluded. Both Admin and BFF audit projections recognize the new target/actions. Forced audit failure proved the shared mutation rollback. Read/export activity uses existing Query operational audit rather than new administrative mutation noise. Existing audit retention/settings remain unchanged.

## 18. Full same-event integration

Project `advanced-7398f558-8c1` admitted 1247 distinct real SDK events: initial 1,246 plus one during export. The independent correlation cohort initially had 237 events across three services and two traces; it became 238 after the later publication. A lower-case correlation variant matched only its five events, three legacy events remained absent from correlation, and the 1,001-event cohort exercised the event limit. Same-correlation events in another project and tenant did not leak. 238 final correlated IDs and all 1247 admitted IDs are recorded in [`.tmp/dev015-evidence/advanced-e2e.json`](.tmp/dev015-evidence/advanced-e2e.json). Example same-event IDs: `004bda92-da4b-4bbf-84fb-49a89396160d`, `006aa3b1-02fc-4fad-a59f-231ee07d2595`. WAL payloads match original SDK events; authoritative tenant belongs to the WAL frame and is enriched into archive records. Archive/Query/BFF/drawer fields compare to that precisely defined enriched event. No client-generated tenant authority is accepted.

Twelve actual Parquet segments materialized and supported Parquet-only correlation search/export with identical canonical fields/IDs; all three historical no-correlation events remained readable. No old WAL/archive rewrite or physical correlation column was needed. Initial real JSON/CSV matching exports traversed three server pages for exactly 237 events; browser files round-trip the same IDs. Current-page JSON/CSV match the 25 displayed IDs. Empty export, exact 1,000 completion, 1,001 truncation, duplicate timestamps, new publication during export, cursor binding and actual expiry/tampering are verified. [`.tmp/dev015-evidence/advanced-materialized.json`](.tmp/dev015-evidence/advanced-materialized.json); [`.tmp/dev015-evidence/changing-dataset.json`](.tmp/dev015-evidence/changing-dataset.json)

## 19. Analytics/Usage reconciliation

Final Usage: 1247 accepted events and 864275 canonical admitted bytes, exactly equal to WAL payload totals; exports did not charge ingestion. Byte definition is UTF-8 normalized event-array JSON including brackets/commas, excluding HTTP envelope, WAL framing and query/export bytes. The test clock pins the quota period to 2030-01-01; this is isolated fixture time, not a real current billing period. Analytics grouped supported log.level under the canonical correlation.id equality filter and totaled the final 238 correlated events. The managed key was revoked and a fresh public SDK send was rejected. [`.tmp/dev015-evidence/advanced-final-accounting.json`](.tmp/dev015-evidence/advanced-final-accounting.json)

## 20. Security matrix

| Boundary | Demonstrated result |
|---|---|
| Private owner | Read/edit/delete only with current log/project access |
| Other owner, ordinary member, OrgAdmin | Private listing/read/edit/delete denied or not found |
| Shared reader | Read allowed; mutate/sharing escalation denied |
| Shared manager | projects.update plus logs.search/current project access required |
| Creator sharing transition | Owner-only; shared transition also requires projects.update |
| Tenant/project overrides and foreign IDs | Rejected; no foreign saved filters or log events returned |
| Revoked/suspended identity, removed project scope | Direct API denial; reactivation does not revive revoked cookie |
| Inactive project | Saved-search/export denied according to current Explorer authority |
| CSRF/missing session | Mutation/export denied |
| Stale/missing version | 409/428; simultaneous updates produce one success and one conflict |
| Shared mutation/audit failure | Entire transaction rolls back |
| Mid-export revocation or suspension | Buffered events discarded before download headers |
| Query scope/record/cursor/partial-result faults | No apparently complete partial file |
| File name/formula/Unicode inputs | Constant file names, bounded cells, formula neutralization, round-trip canonical JSON |
| Limits/concurrency/deadline/disconnect | Event/byte/page bounds, 1/session and 2/BFF, abort and slot release tested |
| Database roles | Only Admin CRUD on saved_searches; Gateway/Query/BFF no table grants; no TRUNCATE |
| Audit privilege | Admin append/read only; UPDATE/DELETE/TRUNCATE remain denied |

[`.tmp/dev015-evidence/saved-search-security.json`](.tmp/dev015-evidence/saved-search-security.json); [`.tmp/dev015-evidence/export-faults.json`](.tmp/dev015-evidence/export-faults.json); [`.tmp/dev015-evidence/saved-search-migration.json`](.tmp/dev015-evidence/saved-search-migration.json)

## 21. Performance measurements

Successful API requests only; milliseconds on this local Windows laptop with disposable PostgreSQL and controlled OIDC. Small samples are descriptive, not production SLAs.

| Operation | n | p50 ms | p95 ms | max ms |
|---|---:|---:|---:|---:|
| POST /saved-searches | 2 | 41.46 | 41.46 | 41.46 |
| GET /saved-searches | 6 | 27.96 | 32.03 | 32.03 |
| GET /saved-searches/:id | 6 | 32.04 | 69.68 | 69.68 |
| PUT /saved-searches/:id | 3 | 33.65 | 36.17 | 36.17 |
| DELETE /saved-searches/:id | 1 | 29.62 | 29.62 | 29.62 |
| /bff/query/search | 34 | 87.1 | 145.42 | 212.79 |
| /bff/query/export json matching | 7 | 547.61 | 1134.24 | 1134.24 |
| /bff/query/export csv matching | 1 | 411.01 | 411.01 | 411.01 |
| /bff/query/export json page | 1 | 134.01 | 134.01 | 134.01 |
| /bff/query/export csv page | 1 | 136.32 | 136.32 | 136.32 |

The combined-filter/correlation/keyset scenario took 1914.28 ms in total, including assertions and multiple HTTP calls. The browser history/filter/deep-link scenario took 1863.81 ms; the two cold-browser/new-session checks took 8861.14 ms. These are scenario times, not single rendering latencies.

Near-byte-limit export: 5,209,262 CSV bytes below 5,242,880 bytes. Test-only 50 ms IPC samples around the actual BFF with synthetic Query pages observed RSS 109.13 → 143.29 MiB, heap 35.46 → 52.41 MiB (2 samples during this short export). This is a sampled maximum, not a proof of absolute peak RSS. Output/event/page/concurrency bounds are tested separately.

At final audit, 6 remaining disposable saved-search rows used 8192 table bytes and 65536 bytes across four indexes (saved_searches_owner_list_idx: 16384; saved_searches_owner_name_key: 16384; saved_searches_pkey: 16384; saved_searches_shared_list_idx: 16384). This small fixture is not a capacity benchmark. Serial membership/session checks and per-page archive planning account for repeated export work; no unbounded batching or index-throughput claim is made. [`.tmp/dev015-evidence/performance.json`](.tmp/dev015-evidence/performance.json)

## 22. Accessibility/responsiveness

The existing Explorer/facade/filter/cursor architecture remains. The targeted panel uses existing Skyra Platform inputs/buttons and native labeled selects: My/private versus Project-shared names, create/save-current/apply/update/rename/delete with confirmation, version-conflict feedback, relative/custom ranges and loading/errors. Correlation is an independent toolbar input/chip and drawer display/copy/filter action. Current-page and matching JSON/CSV exports are distinct, use the last successfully applied search, and report cancellation/truncation/failure truthfully. Scope changes clear saved state and cancel pending export; generation checks discard stale responses. URL correlation/search references and back/forward restore without expanding project authority. Existing Analytics trace/time/level deep links remain covered by the integrated regressions.

The production Console build passed with optimized scripts/styles. Only external Google-font build-time inlining was disabled in the temporary offline build helper; product configuration was not altered. Playwright exercised six advanced Explorer scans at 1440/768/390 px in light/dark, zero WCAG A/AA/2.1 AA Axe violations, no document overflow, reduced motion and keyboard focus. Existing multi-feature accessibility coverage also passed. The loading-state progress bar now has an accessible name and the Cancel button uses the existing theme-safe outline variant. [`.tmp/dev015-evidence/advanced-accessibility.json`](.tmp/dev015-evidence/advanced-accessibility.json)

## 23. Regression test results

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

Prerequisites: the already-provisioned, physically verified disposable cluster and private runtime manifests. Do not copy its private connection URLs into reports or shells. Start it with node scripts/isolated-postgres.mjs start, then run node scripts/prepare-saved-search-tests.mjs. Build current SDK/packages and both Prisma clients as described in the developer quick start, create fresh local consumers with scripts/verify-sdk-consumer.mjs under the DEV-015 evidence labels, and use scripts/run-advanced-explorer.mjs modes sdk, browser, regressions, sessions and lifecycle. Run session/storage restart suites sequentially. Focused tests: node --test tests/advanced-explorer/{contracts,migration,saved-searches,export-faults}.test.mjs (use individual file paths on Windows). Node 22 runs contracts through the owned portable runtime. The temporary optimized offline build helper and finish-tests.mjs capture exact commands and exits in evidence. Stop only the manifest-owned cluster after verification. Activation flags remain default off outside test process variables.

## 24. Protected PostgreSQL preservation

Exact protected target: `127.0.0.1:5432 / skyra_loghub_dev / skyra_loghub_user`, PostgreSQL 17.9. Separate target-verified snapshots used forced read-only transactions. Before/after catalog, grants, ledger and content snapshots are identical. SHA-256: `90f73c6f2bc6bce568974e27472fd652505e3034284ff4a9883104b1fd02a6ff`. No protected migrations, application records, credentials, audit records, sessions, grants, bootstrap or flags were written. The disposable cluster was separately verified at `127.0.0.1:5433 / skyra_loghub_disposable_validation`, PostgreSQL 17.9, and stopped using its owned manifest after tests; no other database was stopped. [`.tmp/dev015-evidence/protected-after.log`](.tmp/dev015-evidence/protected-after.log); [`.tmp/dev015-evidence/cluster-stop.log`](.tmp/dev015-evidence/cluster-stop.log)

## 25. Remaining limitations

Exports are bounded keyset traversals, not global snapshots. A newer archived event inserted ahead of the cursor appeared in the next search but was not retroactively added to the running export. Limits can truncate valid files; deadline, unavailable archives and late failures return no complete file. Export admission is per BFF instance, not a distributed cluster-wide limit. Bounded buffering still consumes memory; these tests are not production load certification. Cancellation cannot retract bytes already delivered. No durable export-job resume exists.

Saved-search creation has a per-creator accessible-count guard of 200; it is not a global aggregate guarantee when other creators add shared searches. Lists are capped/paginated. Names are unique per owner/project; different owners can intentionally use the same shared name. SQL-only checks and the partial shared index remain in the migration because Prisma 5 does not model them fully.

The optional full Python SDK run stalled in the unchanged storage ownership path after the duplicate-instance conflict diagnostic and was stopped only after verifying its exact task-owned PID/command. Its log is retained; that full suite is **incomplete**, not passed. The relevant 14 Python schema tests passed and only its generated schema mirror changed. No DEV-015 P0/P1 defect remains in the tested scope.

Real Microsoft Entra configuration/login, initial organization/verified owner decisions, protected activation, deployment and publication remain outside this isolated acceptance. No protected records or grants were changed; no DEV-016 work was started.

## 26. Final Git/source state

Initial main HEAD `19f084ad36fe37bb57ca107103e136d2d4a378be`: 395 folded entries, 150 tracked modified, 245 untracked, 0 staged. Final same main HEAD: 422 folded entries, 162 tracked modified, 260 untracked, 0 staged. All 1408 initial files remain, including original untracked work. 210 historical reports/migration/archive artifacts are byte-unchanged. 73 existing source files changed for this feature, 25 files were added, and 1 generated cache changes were recorded.

Platform remains clean at `928ca4343ab3a1887e586123a6ba5bb88b56a0ef`; all 37 immutable package archives match their initial/HEAD bytes. Gateway storage/DEV-012 maintenance and the Parquet converter, DEV-013 session repository/crypto/OIDC code and DEV-014 HttpTransport/write queue are byte-preserved. The session guard extraction enables reuse of the same authentication logic for export revalidation. Both Prisma mirrors match, and removal of only the three new inverse relations plus new SavedSearch model reproduces the exact initial schema bytes, including original mixed line endings. Existing eleven ledger identities/checksums remain unchanged; the sole additive ledger entry is `20261116000000_dev015_saved_searches`. Git whitespace check passes. No git commit/reset/rebase/merge/push was performed. [`.tmp/dev015-evidence/final-audit.json`](.tmp/dev015-evidence/final-audit.json)

## 27. Final verdict

**PASS — DEV-015 IMPLEMENTED IN ISOLATION.** All required persistence, same-event, canonical compatibility, multi-page export, authorization, browser, accounting and preservation checks passed with no unresolved DEV-015 P0/P1 issue. The optional full Python ownership suite remains explicitly incomplete; it is not counted as a pass. All test-owned services stopped and no database clients remained at final audit. Only the manifest-owned disposable PostgreSQL cluster was stopped. Protected activation, Microsoft setup, deployment, npm publication and DEV-016 remain unperformed.
