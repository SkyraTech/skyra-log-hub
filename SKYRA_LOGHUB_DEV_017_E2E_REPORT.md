# DEV-017 Real E2E and Regression Report

PASS in isolation. Topology: real Angular optimized build → durable PostgreSQL-session BFF → Admin/current IAM → disposable PostgreSQL17.9; controlled signed-OIDC peer. Actual managed-credential packaged Node SDK → Gateway/WAL/admission ledger → usage windows → Admin/BFF/Angular. Query/archive services participate in inherited integration regressions. Protected127.0.0.1:5432/skyra_loghub_dev is read-only; physically verified owned test target127.0.0.1:5433/skyra_loghub_disposable_validation uses separated Admin/Gateway/Query/session runtime roles.

## Actual administrative and SDK cohorts

Organization/member role/suspension/reactivation/project/credential issue-rotate-revoke/quota/shared-search mutations run through actual authenticated APIs.105 project updates plus creation produce106 project audit IDs for exact comparison. JSON and CSV both traverse two actual pages and match independently queried IDs; safe fields/redaction checked. Separate API fault suite produces101 actual project-update records across two pages. Synthetic protocol/buffer tests do not replace these cohorts.

SDK admission cohort uses seven UTC days selected by test-only Gateway clock. Expected accepted counts:3,5,0,0,1,0,2 (11 total). Event occurrence timestamps remain in2020, distinct from admission days. Different messages include UTF-8 Telugu/emoji and different lengths. A lost acknowledgement retries identical batch/digest and charges once. Zero event quota rejects the whole batch without accepted charge. One fsynced pending reservation is shown separately, then crash recovery finalizes it once. Foreign project and foreign tenant SDK cohorts remain excluded. Every day's accepted count/normalized bytes reconciles independently with actual WAL payloads, SDK-observed canonical records, admission ledger and usage windows. The SDK's immediate acknowledgement status is distinct from the final recovered durable outcome.

Historical policy snapshots do not exist. Tests change current policy and prove accepted historical counts remain unchanged while only explicitly current-reference percentages change; historical limits/utilization/exceeded states remain unknown.

## Browser acceptance

1. DEV017 real administrative mutations create a multi-page immutable audit cohort
2. DEV017 real audit correlation, actor enrichment and signed multi-page filters reconcile exact IDs
3. DEV017 JSON and CSV matching export traverse actual audit pages and preserve safe IDs
4. DEV017 OrgAdmin allowed; project roles, foreign users and missing CSRF denied audit export
5. DEV017 Angular audit applied correlation and real JSON/CSV downloads match authoritative records
6. DEV017 packaged SDK multi-day admissions, exact UTF-8 bytes and lost-ack retry are durable once
7. DEV017 real pending reservation is separate from accepted and crash recovery finalizes WAL once
8. DEV017 daily Usage matches admission windows, unknown policy and bounded 7/30/90-day reads
9. DEV017 policy changes alter only explicit current references, never unknown historical limits
10. DEV017 historical readers cannot cross projects/tenants or mutate quotas
11. DEV017 Angular Usage charts, table and selected UTC day equal authoritative accounting
12. DEV017 Angular audit cancellation creates no download and changed project discards held history
13. DEV017 audit and usage responsive computed themes, keyboard and scoped Axe checks pass
14. DEV017 BFF crash preserves durable session and exact audit/usage reads

Combined run82 leaves: [final-integrated-browser.log](.tmp/dev017-evidence/final-integrated-browser.log) and [full-browser-e2e.json](.tmp/dev017-evidence/full-browser-e2e.json). Final focused14 leaves: [final-focused-browser.log](.tmp/dev017-evidence/final-focused-browser.log) and [administration-e2e.json](.tmp/dev017-evidence/administration-e2e.json); includes keyboard JSON export/day selection, Usage back/forward/direct refresh, held-history context disposal and download cancellation. Twelve scoped width/theme Axe checks have zero violations at1440/768/390, actual computed light/dark colors, reduced motion and no page overflow. Representative export/history/day screenshots reviewed. This is not full accessibility certification.

## Security/faults

- Actual project mutations produce more than one safe export page
- No session, invalid CSRF and organization/limit/cursor overrides fail without files
- Scoped roles cannot export; OrgAdmin can; foreign tenant sees only its own context
- Mutable safe actor name never changes immutable actor ID; unsafe name falls back
- Mid-export membership revocation discards the actual first page before completion
- Mid-export role downgrade is revalidated by actual Admin audit.read
- One export per session and two per BFF remain bounded while actual pages are held
- Client disconnect aborts actual pending download and releases the slot
- Upstream deadline yields no partially complete file and frees export capacity
- BFF crash interrupts export and durable session recovers
- Audit write denial rolls the actual project mutation back
- Suspended/revoked Usage readers lose access and inactive projects are denied
- Concurrent authorized history readers return identical bounded daily windows
- Expired durable session cannot export audit or read history
- Actual PostgreSQL read outage fails closed and restart restores audit and history

Additional unit tests cover CSV controls/Unicode/formulas/quotes/newlines, malformed projection/scope, corrupt metadata withholding, empty export, strict microsecond order, record/byte caps, UTC leap/month/year boundaries, bounded history and zero/unlimited policy denominators. Actual15s authority deadline retains occupied capacity until outstanding work settles. Existing audit persistence regressions cover immutable triggers/grants and signed tampered/expired cursor cases.

## Commands and results

Primary commands: node scripts/run-advanced-administration.mjs browser; focused; sdk; regressions; sessions; lifecycle. New tests: node --test --test-reporter=tap tests/advanced-administration/contracts.test.mjs, security.test.mjs, deadline.test.mjs and schema-evidence.test.mjs. Contracts also run with the verified portable Node22 runtime. Regression orchestration: [finish-tests.json](.tmp/dev017-evidence/finish-tests.json), [sdk-results.json](.tmp/dev017-evidence/sdk-results.json), [browser-results.json](.tmp/dev017-evidence/browser-results.json), [typechecks.json](.tmp/dev017-evidence/typechecks.json); complete per-command arguments/exits are preserved. Prisma commands validate/generate both existing mirrors against disposable configuration. Local SDK packaging and clean offline consumers on Node24/22 are verified; no publication.

Counts below are independent leaves, excluding TAP parents. Overlapping suites/runtime executions must not be summed as unique requirements.

| Evidence log | Passing leaves | Failed | Skipped |
|---|---:|---:|---:|
| security.log | 15 | 0 | 0 |
| deadline.log | 1 | 0 | 0 |
| schema-contracts.log | 3 | 0 | 0 |
| dev016-contracts.log | 49 | 0 | 0 |
| dev016-contracts22.log | 49 | 0 | 0 |
| contracts.log | 31 | 0 | 0 |
| contracts22.log | 31 | 0 | 0 |
| dev016-preferences.log | 11 | 0 | 0 |
| preference-migration.log | 5 | 0 | 0 |
| dev015-saved-searches.log | 14 | 0 | 0 |
| dev015-migration.log | 5 | 0 | 0 |
| dev015-export-faults.log | 20 | 0 | 0 |
| dev015-contracts.log | 40 | 0 | 0 |
| dev015-contracts22.log | 40 | 0 | 0 |
| integrated-browser.log | 82 | 0 | 0 |
| sdk-tests24.log | 103 | 0 | 0 |
| sdk-tests22.log | 103 | 0 | 0 |
| core-contracts24.log | 66 | 0 | 0 |
| core-contracts22.log | 66 | 0 | 0 |
| ingestion-gateway-tests.log | 124 | 0 | 0 |
| admin-service-tests.log | 98 | 0 | 0 |
| bff-tests.log | 115 | 0 | 0 |
| console-tests.log | 122 | 0 | 0 |
| query-tests.log | 232 | 0 | 0 |
| target-guards.log | 15 | 0 | 0 |
| quota-integration.log | 16 | 0 | 0 |
| quota-boundaries.log | 4 | 0 | 0 |
| admin-postgres-hardening.log | 10 | 0 | 0 |
| credentials-persistence.log | 28 | 0 | 0 |
| audit-persistence.log | 10 | 0 | 0 |
| developer-documentation.log | 4 | 0 | 0 |
| developer-sample.log | 8 | 0 | 0 |
| storage-lifecycle.test.log | 15 | 0 | 0 |
| storage-ownership.test.log | 4 | 0 | 0 |
| storage-database-restart.log | 1 | 0 | 0 |
| session-migration.log | 5 | 0 | 0 |
| session-persistence.log | 15 | 0 | 0 |
| session-http-security.log | 11 | 0 | 0 |
| session-outage-recovery.log | 4 | 0 | 0 |
| session-cleanup-recovery.log | 1 | 0 | 0 |
| sdk-gateway-lifecycle.log | 6 | 0 | 0 |
| sdk-app-exit.log | 2 | 0 | 0 |

Final listed logs have zero failures/skips. An earlier DEV015 deadline test stalled and its parent cancelled; retained as superseded-export-timeout.log. The unchanged suite passed all20 leaves on rerun. An initial schema test harness needed Ajv's standards-valid union-type option for the preexisting before/after schema; retained as superseded-ajv-union-configuration.log; all3 schema tests now pass. Interrupted final audit found the disposable cluster stopped; it was restarted through the ownership-verifying provisioner before the successful final audit. No interrupted run is counted as passed. Python source is unchanged; DEV016's78-test result remains historical and is not claimed as a DEV017 rerun.

## Measurements

Final real audit export: 106 records across 2 pages, 80961 bytes compact JSON / 65141 bytes CSV. Successful export HTTP median 88.0ms (two format executions). Usage history HTTP median 36.5ms, maximum 125.6ms; largest measured history response 41188 bytes. Real 101-record/two-page export sampled BFF RSS peak 108.0MiB, heap 27.5MiB at50ms intervals. Full DEV017 browser-window BFF RSS max 143.0MiB, heap 51.8MiB at100ms intervals. The 7/30/90-day service reads used 12 Prisma operations each, including current authorization and excluding BEGIN/COMMIT protocol. One batched actor enrichment lookup for a100-record page. Local small-cohort observations only; sampled maxima are not absolute peaks or production capacity.

Browser hydration/selected-day timings, separate7/30/90 reads, audit/correlation/enrichment timings, body sizes and sampled memory: [performance.json](.tmp/dev017-evidence/performance.json), [read-measurements.json](.tmp/dev017-evidence/read-measurements.json), [audit-export-memory.json](.tmp/dev017-evidence/audit-export-memory.json). Query count is measured Prisma operations including authorization, excluding transaction protocol/database internals. No per-day or per-actor N+1 work. Two held actual exports enforce the global bound; eight concurrent history reads across two users return identical scoped windows.

Evidence: [audit-export.json](.tmp/dev017-evidence/audit-export.json), [audit-export.csv](.tmp/dev017-evidence/audit-export.csv), [browser-audit.json](.tmp/dev017-evidence/browser-audit.json), [usage-daily-manifest.json](.tmp/dev017-evidence/usage-daily-manifest.json), [usage-pending.json](.tmp/dev017-evidence/usage-pending.json), [usage-history.json](.tmp/dev017-evidence/usage-history.json), [usage-retry.json](.tmp/dev017-evidence/usage-retry.json), [administration-security.json](.tmp/dev017-evidence/administration-security.json), [final-audit.json](.tmp/dev017-evidence/final-audit.json).

All 1467 initially inventoried source paths remain present. 220 historical reports/migration/package artifacts match their baseline hashes; all 37 immutable Platform archives are unchanged. Platform remains clean at 928ca4343ab3a1887e586123a6ba5bb88b56a0ef. Both Prisma schema files match their initial bytes and each other. All 13 migration identities/checksums remain unchanged. Prior Gateway storage/accounting, Query/Analytics authority, SDK/core/Python source and canonical wire contracts are preserved. Protected forced read-only snapshots match: SHA256 90f73c6f2bc6bce568974e27472fd652505e3034284ff4a9883104b1fd02a6ff. No protected writes or activation. Zero final disposable application clients. Only the manifest-owned disposable cluster is stopped after final audit.
