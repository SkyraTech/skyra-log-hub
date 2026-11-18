# SKYRA LOGHUB — DEV-015

Acceptance date: 2026-11-16 (Asia/Calcutta). Evidence is local, isolated and sanitized.

## Outcome and actual topology

PASS: 47 integrated browser leaf scenarios, including 19 DEV-015 leaves. The TAP total of 48 includes the parent test and is not reported as 48 independent scenarios.

Actual local topology: fresh public ESM SDK tarballs on Node 24.14.0 and 22.23.4 → managed-credential Gateway → actual WAL → canonical JSONL → actual Query Service (JSONL then Parquet-only) → authenticated BFF → optimized Angular Console in Playwright/Edge. Admin and BFF use their restricted runtime roles; Gateway/Query use the established ingestion/query metadata role. A local signed controlled OIDC provider drives the real code/state/PKCE/nonce/session flow. It is test configuration, not Microsoft login. A test-only delaying proxy forwards real Query business responses to exercise publication/cancellation. Synthetic export-fault peers are labeled separately and do not substitute for same-event continuity. Owner connections are confined to guarded test provisioning/verification, never the SDK process or BFF launch.

Exact protected target: `127.0.0.1:5432 / skyra_loghub_dev / skyra_loghub_user`, PostgreSQL 17.9. Separate target-verified snapshots used forced read-only transactions. Before/after catalog, grants, ledger and content snapshots are identical. SHA-256: `90f73c6f2bc6bce568974e27472fd652505e3034284ff4a9883104b1fd02a6ff`. No protected migrations, application records, credentials, audit records, sessions, grants, bootstrap or flags were written. The disposable cluster was separately verified at `127.0.0.1:5433 / skyra_loghub_disposable_validation`, PostgreSQL 17.9, and stopped using its owned manifest after tests; no other database was stopped. [`.tmp/dev015-evidence/protected-after.log`](.tmp/dev015-evidence/protected-after.log); [`.tmp/dev015-evidence/cluster-stop.log`](.tmp/dev015-evidence/cluster-stop.log)

## Actual SDK cohort and same-event continuity

Project `advanced-7398f558-8c1` admitted 1247 distinct real SDK events: initial 1,246 plus one during export. The independent correlation cohort initially had 237 events across three services and two traces; it became 238 after the later publication. A lower-case correlation variant matched only its five events, three legacy events remained absent from correlation, and the 1,001-event cohort exercised the event limit. Same-correlation events in another project and tenant did not leak. 238 final correlated IDs and all 1247 admitted IDs are recorded in [`.tmp/dev015-evidence/advanced-e2e.json`](.tmp/dev015-evidence/advanced-e2e.json). Example same-event IDs: `004bda92-da4b-4bbf-84fb-49a89396160d`, `006aa3b1-02fc-4fad-a59f-231ee07d2595`. WAL payloads match original SDK events; authoritative tenant belongs to the WAL frame and is enriched into archive records. Archive/Query/BFF/drawer fields compare to that precisely defined enriched event. No client-generated tenant authority is accepted.

Twelve actual Parquet segments materialized and supported Parquet-only correlation search/export with identical canonical fields/IDs; all three historical no-correlation events remained readable. No old WAL/archive rewrite or physical correlation column was needed. Initial real JSON/CSV matching exports traversed three server pages for exactly 237 events; browser files round-trip the same IDs. Current-page JSON/CSV match the 25 displayed IDs. Empty export, exact 1,000 completion, 1,001 truncation, duplicate timestamps, new publication during export, cursor binding and actual expiry/tampering are verified. [`.tmp/dev015-evidence/advanced-materialized.json`](.tmp/dev015-evidence/advanced-materialized.json); [`.tmp/dev015-evidence/changing-dataset.json`](.tmp/dev015-evidence/changing-dataset.json)

SDK consumer runs: v24.14.0 / 1246 events / owner credentials and internal assertions absent; v22.23.4 / 1 events / owner credentials and internal assertions absent; v24.14.0 / 1 events / owner credentials and internal assertions absent; v24.14.0 / 1 events / owner credentials and internal assertions absent. Portable Node 22 executable SHA-256 matches the retained official manifest. No npm publication occurred.

## Persistence, concurrency and authorization

One additive saved_searches table has UUID identity, tenant/project composite foreign key, immutable creator FK, bounded name/description, PRIVATE/PROJECT visibility, v1 JSON filters, bigint version and timestamps. Unique owner/project/name and owner/shared keyset indexes support scoped reads. The API accepts only text, severity, service, environment, independent trace/correlation and relative/absolute UTC ranges; no SQL/AST/owner/scope overrides. Relative presets resolve at application time; absolute bounds remain fixed.

Admin enforces current IAM in every transaction. Private ownership is strict even against OrgAdmin; shared management reuses projects.update and does not expand the existing 20-capability policy. Shared creator departure retains manageable project searches; private searches remain inaccessible. GET/list are authorized; create/update/delete are transactional. If-Match is required for update/delete, locked rows serialize version comparison, stale writes conflict, and duplicate names fail predictably. Browser reload, BFF crash, actual PostgreSQL stop/start, cold browser process and a new signed OIDC session preserve the records/filter semantics. No localStorage persistence is used.

New migration SHA-256 `cff6b71a0d456ba9eda2a7937b8f90e7fce641a0925769ca4637cdc0dff9518f`; initial transaction rollback, first deployment, repeat verification, nine constraints, eleven columns, four indexes and restricted grants passed. Intentional constraint/index/grant/ledger drift was detected and rolled back. All previous migration checksums remain intact.

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

## Browser and export checks

1. DEV015 authorized BFF creates project and managed credential for a fresh SDK consumer
2. DEV015 official SDK admits multi-service/trace correlations, legacy absence and 1001-event export cohort
3. DEV015 WAL and canonical JSONL preserve exact SDK IDs, correlation values and admitted byte totals
4. DEV015 JSONL Query/BFF correlation filtering is exact and combines traces, severity, text and time
5. DEV015 same correlation in foreign project/tenant cannot override authorization or cursor binding
6. DEV015 Angular correlation filter and detail drawer show the identical canonical event
7. DEV015 browser saves a private relative preset and restores it after refresh and BFF crash
8. DEV015 saved preset survives an actual cold browser process and a new authenticated session
9. DEV015 browser update/rename is versioned and stale writes report conflict
10. DEV015 current-page JSON/CSV and real multi-page JSON/CSV contain exact authorized IDs and canonical fields
11. DEV015 actual Query traversal completes at 1000 events and explicitly truncates the 1001st
12. DEV015 browser downloads matching JSON/CSV and displays truthful truncated-result warning
13. DEV015 cancellation, actual Query outage and retry never fabricate a complete download
14. DEV015 new archive publication during export preserves frozen bounds and honest bounded-traversal semantics
15. DEV015 Parquet-only search/export preserves correlations and historical absence without rewriting canonical data
16. DEV015 changing correlation invalidates cursors; expired export cursors fail explicitly
17. DEV015 browser history and saved-search deep links restore correlation without widening project
18. DEV015 saved-search controls and correlation/export remain accessible in responsive light/dark layouts
19. DEV015 delete saved search safely; Usage and supported Analytics scope still reconcile after exports

The existing Explorer/facade/filter/cursor architecture remains. The targeted panel uses existing Skyra Platform inputs/buttons and native labeled selects: My/private versus Project-shared names, create/save-current/apply/update/rename/delete with confirmation, version-conflict feedback, relative/custom ranges and loading/errors. Correlation is an independent toolbar input/chip and drawer display/copy/filter action. Current-page and matching JSON/CSV exports are distinct, use the last successfully applied search, and report cancellation/truncation/failure truthfully. Scope changes clear saved state and cancel pending export; generation checks discard stale responses. URL correlation/search references and back/forward restore without expanding project authority. Existing Analytics trace/time/level deep links remain covered by the integrated regressions.

The production Console build passed with optimized scripts/styles. Only external Google-font build-time inlining was disabled in the temporary offline build helper; product configuration was not altered. Playwright exercised six advanced Explorer scans at 1440/768/390 px in light/dark, zero WCAG A/AA/2.1 AA Axe violations, no document overflow, reduced motion and keyboard focus. Existing multi-feature accessibility coverage also passed. The loading-state progress bar now has an accessible name and the Cancel button uses the existing theme-safe outline variant. [`.tmp/dev015-evidence/advanced-accessibility.json`](.tmp/dev015-evidence/advanced-accessibility.json)

## Usage and Analytics

Final Usage: 1247 accepted events and 864275 canonical admitted bytes, exactly equal to WAL payload totals; exports did not charge ingestion. Byte definition is UTF-8 normalized event-array JSON including brackets/commas, excluding HTTP envelope, WAL framing and query/export bytes. The test clock pins the quota period to 2030-01-01; this is isolated fixture time, not a real current billing period. Analytics grouped supported log.level under the canonical correlation.id equality filter and totaled the final 238 correlated events. The managed key was revoked and a fresh public SDK send was rejected. [`.tmp/dev015-evidence/advanced-final-accounting.json`](.tmp/dev015-evidence/advanced-final-accounting.json)

## Performance and resources

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

## Current regression executions

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

## Failure history and evidence limits

Earlier attempts found loading-state accessibility defects and export authorization/422 status mapping defects; those were corrected and current suites passed. Fixture corrections distinguished wire WAL payloads from tenant-enriched archives, used the established 422 cursor contract and narrowed web-component/select locators. The browser runner now builds current services explicitly to prevent stale compiled acceptance. Superseded diagnostic logs are retained and are not counted as passing acceptance. [`.tmp/dev015-evidence/superseded-loading-accessibility.log`](.tmp/dev015-evidence/superseded-loading-accessibility.log); [`.tmp/dev015-evidence/superseded-stale-bff-build.log`](.tmp/dev015-evidence/superseded-stale-bff-build.log); [`.tmp/dev015-evidence/superseded-shadow-button-locator.log`](.tmp/dev015-evidence/superseded-shadow-button-locator.log)

Exports are bounded keyset traversals, not global snapshots. A newer archived event inserted ahead of the cursor appeared in the next search but was not retroactively added to the running export. Limits can truncate valid files; deadline, unavailable archives and late failures return no complete file. Export admission is per BFF instance, not a distributed cluster-wide limit. Bounded buffering still consumes memory; these tests are not production load certification. Cancellation cannot retract bytes already delivered. No durable export-job resume exists.

Saved-search creation has a per-creator accessible-count guard of 200; it is not a global aggregate guarantee when other creators add shared searches. Lists are capped/paginated. Names are unique per owner/project; different owners can intentionally use the same shared name. SQL-only checks and the partial shared index remain in the migration because Prisma 5 does not model them fully.

The optional full Python SDK run stalled in the unchanged storage ownership path after the duplicate-instance conflict diagnostic and was stopped only after verifying its exact task-owned PID/command. Its log is retained; that full suite is **incomplete**, not passed. The relevant 14 Python schema tests passed and only its generated schema mirror changed. No DEV-015 P0/P1 defect remains in the tested scope.

Real Microsoft Entra configuration/login, initial organization/verified owner decisions, protected activation, deployment and publication remain outside this isolated acceptance. No protected records or grants were changed; no DEV-016 work was started.
