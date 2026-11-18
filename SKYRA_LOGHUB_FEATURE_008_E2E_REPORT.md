# FEATURE-008 — End-to-end evidence

Verdict: **PASS — actual isolated services and persisted usage**.

## Topology and data continuity

Actual public Node SDK → managed bearer credential → loopback Nest/Fastify Gateway → owned fsynced WAL → nonowner PostgreSQL accounting. Actual controlled RS256/JWKS OIDC authorization-code/S256 flow → opaque BFF session/CSRF → signed Admin assertion → persisted membership/capability authorization → Angular production build in real Edge/Playwright. Mocks do not replace the database, Gateway, SDK or UI.

The disposable target is 127.0.0.1:5433/skyra_loghub_disposable_validation, PostgreSQL 17.9, cluster marker 26d25080-7655-4147-b05a-512ad359e14f; the physical data directory is .tmp/feature001a-postgres/data. Every mutation runner validates target/marker/role and physical separation. Gateway and management use their established nonowner runtime roles. Test stores are newly marked under .tmp/feature008-ingestion-*; prior-feature stores/evidence are retained.

| Actual SDK cohort | Tenant | Events | Canonical bytes |
|---|---|---:|---:|
| qb-first-7d454639 | 41dc958f-feba-41e0-a27f-d79383ab368c | 5 | 5367 |
| qb-second-fdc6cf06 | 41dc958f-feba-41e0-a27f-d79383ab368c | 5 | 5372 |
| qb-foreign-18475d95 | a78b21dc-81e1-49d2-9c1f-3f0123740f76 | 5 | 5377 |

All cohort values match persisted usage and WAL payloads; mismatch count zero. Separately, the browser fixture starts with 5 SDK events / 5422 bytes, consumes a further actual 5-event SDK batch during the authenticated run and displays 10 events / 10894 bytes. The exhausted event limit rejects another whole batch without changing usage. Later owner policy changes preserve those counters; near-limit, unlimited, disabled, zero and pending states are exercised.

## Threshold, concurrency and recovery gates

See accounting.log (16 leaf cases), boundaries.log (4 leaf cases), concurrency.json, sdk-meter.json, two-tenant-continuity.json and accounting-acceptance.json. Real fault windows cover reservation/no append, durable WAL/no finalization, finalized SQL/no commit/response, interrupted reconciliation, database finalization failure, ambiguous WAL acknowledgement and audit rollback. No timeout blindly refunds a potentially accepted frame.

## Browser and accessibility

browser.log passes 25 leaf tests: inherited OIDC/organization safety plus seven quota scenarios. browser-performance.log adds two scoped-role/near-limit/timing leaves. Six quota Axe scans at 1440, 768 and 390 px in light/dark have zero violations; screenshots were inspected, including the 390 px dark view. Existing full-browser regression passes 79 leaves, including Analytics and Explorer and their 18 scoped scans. No full WCAG certification is claimed.

Screenshots in .tmp/feature008-evidence: quota-1440-light.png, quota-1440-dark.png, quota-768-light.png, quota-768-dark.png, quota-390-light.png, quota-390-dark.png, quota-exhausted.png and quota-near-limit.png. quota-browser-acceptance.json preserves all six detailed scan results and observed counters. Application errors, CSRF denial, conflict handling and real role denials are exercised; no invented live counters are used.

## Tests

| Verification | TAP tests | Leaf tests | Result |
|---|---:|---:|---|
| Quota accounting, real PostgreSQL/Gateway/SDK and crash tests | 17 | 16 | PASS |
| Two-tenant SDK continuity, duplicates and boundaries | 5 | 4 | PASS |
| Full OIDC organization + quota browser suite | 26 | 25 | PASS |
| Additional scoped-role/near-limit browser checks and timing | 3 | 2 | PASS |
| Prior-feature full browser regression | 80 | 79 | PASS |
| Prior actual SDK/pipeline regression | 1 | 1 | PASS |
| Gateway, including live PostgreSQL/WAL/security | 124 | 124 | PASS |
| Admin Service | 94 | 94 | PASS |
| SDK (final code) | 55 | 55 | PASS |
| Contracts | 63 | 63 | PASS |
| Target guards | 15 | 15 | PASS |
| BFF (final, including quota projections) | 110 | 109 | PASS |
| Angular Console | 101 | 101 | PASS |
| Query Service | 214 | 214 | PASS |
| Credential persistence | 29 | 28 | PASS |

All final runs have zero failed, cancelled or skipped tests. Parent containers are excluded from leaf counts; overlapping organization scenarios across browser runs are not summed as unique tests. Builds/typechecks, Prisma validate/generate, repeat deploy, rollback/drift checks, governance, schema sync and git diff --check also pass.

## Reproduction

Run from repository root unless stated; no protected database URL is passed:

```powershell
node scripts/isolated-postgres.mjs start
node scripts/prepare-quota-tests.mjs
node scripts/verify-quota-migration.mjs
./node_modules/.bin/tsc.cmd -p apps/ingestion-gateway/tsconfig.json
./node_modules/.bin/tsc.cmd -p apps/admin-service/tsconfig.json
./node_modules/.bin/tsc.cmd -p apps/console-bff/tsconfig.json
./node_modules/.bin/tsc.cmd -p packages/logger-node/tsconfig.json
# apps/console-web working directory:
./node_modules/.bin/ng.cmd build --configuration production,offline
# repository root:
node --test --test-reporter=tap tests/quotas/quota-integration.test.mjs
node --test --test-reporter=tap tests/quotas/quota-boundaries.test.mjs
node scripts/run-quota-e2e.mjs
node scripts/run-quota-regressions.mjs
# Resume verified legacy browser results when only service checks need rerunning:
node scripts/run-quota-regressions.mjs --services-only
node scripts/measure-quota-performance.mjs
# Additional scoped-role and timing scenarios:
$env:SKYRA_QUOTA_ONLY='true'
$env:SKYRA_QUOTA_PERF_ONLY='true'
node scripts/run-quota-e2e.mjs
# Final SDK test: packages/logger-node working directory
node --import tsx --test tests/**/*.test.ts
# Final BFF test: apps/console-bff working directory
node --test --test-reporter=tap dist-test/tests/**/*.test.js
# repository root, forced-read-only snapshots:
node scripts/protected-catalog-snapshot.mjs before feature008
node scripts/protected-catalog-snapshot.mjs after feature008
git diff --check
```

The before snapshot is captured before work, not after mutations. Reproducing the stateful quota browser suite requires fresh quota-integration fixtures immediately beforehand. The full regression runner creates fresh prior-feature SDK cohorts in .tmp/feature008-regression-evidence. Loopback network tests run in the permitted execution context; an earlier restricted SDK invocation reached no HTTP peer and was superseded by all 55 passing tests. Initial fixture-timestamp, lock-permission, documentation and contrast findings were corrected and their relevant gates rerun.

## Local performance

Windows 10.0.26200, Node v24.14.0, PostgreSQL 17.9 on disposable port 5433, 12 logical CPUs, loopback HTTP. Two warmup and 20 measured five-event SDK batches per mode; phase metrics include warmups (22 samples).

| Local metric | Median ms |
|---|---:|
| Baseline SDK batch round trip, separate unmetered benchmark project | 17.45 |
| Metered SDK batch round trip | 33.71 |
| Observed round-trip difference | 16.26 |
| Reservation | 3.89 |
| WAL append/fsync | 1.02 |
| Counter finalization before commit | 0.99 |
| Entire accounting admission | 7.02 |
| Direct authoritative Admin usage read (12) | 7.34 |
| BFF usage read (12) | 12.43 |
| Angular refresh (5) | 56.24 |

The controlled 100-event metered run took 748.50 ms (133.60 observed events/s). Restart, reconciliation and Nest readiness after an injected durable-WAL crash took 1290.95 ms. These small sequential measurements include local instrumentation and do not establish production throughput, horizontal scale or SLAs.

## Preservation

Protected 5432 snapshots match 90f73c6f2bc6bce568974e27472fd652505e3034284ff4a9883104b1fd02a6ff. No protected DDL/DML, ledger/grant/bootstrap write or activation occurred. Platform remains clean at 928ca4343ab3a1887e586123a6ba5bb88b56a0ef; all 37 archives match HEAD. Prior acceptance reports and executed migrations were preserved. All owned app harnesses stopped; the final audit saw no other disposable client connections. The disposable cluster is stopped after verification. Raw evidence remains in .tmp/feature008-evidence and .tmp/feature008-regression-evidence; private credential state is not copied into reports.

