# SKYRA LOGHUB DEV-012 — End-to-End Verification

Verdict: **PASS — real isolated services and actual removal**.

## Same-event pipeline

The clean installed ESM SDK consumer submitted the documented six-event onboarding sample and a packaged SDK lost-acknowledgement cohort. The primary integrated project contains 26 exact canonical events. Its run ID is integrated-a6fbe97c-46b5-49c6-b12e-a7c8c3b51364; project is integrated-b858d76c-d90. Separate project and foreign-tenant five-event cohorts exercised isolation.

The path was actual managed credential -> Gateway -> synchronous-fsync WAL -> finalized JSONL/manifest/catalog -> Query -> signed test-OIDC BFF session -> Angular. The test provider is isolated; no Microsoft tenant, real owner identity or protected organization was created.

Before maintenance, WAL payload fields and event IDs matched the archive, Query and authenticated BFF. Angular raw detail JSON matched all six documented sample events field-for-field. Retirement then actually removed 3 sealed segments / 31361 bytes while retaining active WAL. The same BFF event objects, ledger rows and usage/policy values matched afterward; only measuredAt was excluded from equality because it is a fresh response timestamp. Real Parquet conversion, duplicate materialization reuse and parquet_only Query restart then preceded a second Angular raw-detail comparison. No synthetic event substitution or JSONL fallback was used for that Parquet-only browser assertion.

The final integrated run reports 21 tests, zero failures. It also covers organization/member/project/credential workflows, current persisted authority, replacement/revocation, Usage, Analytics, Audit History, developer onboarding, service outages and recovery, session expiry, forged scope denial and secret handling. There were 84 scoped accessibility scans with 0 violations across six themes/responsive layouts. No UI redesign was introduced.

## Actual lifecycle and failures

The independent lifecycle run reports 16 tests, zero failures. Five worker termination boundaries, duplicate worker exclusion, unknown artifacts, corrupt/missing successor metadata, reservation retention, work limits, cancellation, hardlinks, minimum age, actual temporary deletion and sequence safety were exercised. Ownership/junction/downgrade tests report five tests, zero failures. PostgreSQL restart recovery passed separately. Short-lived cache absence cannot make a retired committed identity newly chargeable.

The measured lifecycle fixture retained 2 -> 2 canonical archive segments while WAL fell 11130 -> 5600 bytes, reclaiming 5530 bytes. Its ledger row count and measured row bytes were unchanged. Later fresh ingestion was tested after this paired measurement.

## Local observations

| Query phase | Elapsed ms | Returned events |
| --- | ---: | ---: |
| before | 155.33 | 10 |
| after-retirement | 48.73 | 10 |
| after-retirement | 120.43 | 10 |
| parquet-only | 123.11 | 10 |
| parquet-only | 163.84 | 10 |
| hybrid-fallback | 173.3 | 10 |

SDK observations: before: 10 events in 826.03 ms; after-retirement: 5 events in 134.43 ms. These include SDK flush/network work and are different batch counts, not a controlled throughput comparison. Same-journal maintenance is offline; ingestion is rejected by ownership exclusion while it runs.

The bounded parent maintenance calls took 9.85-85.75 ms across successes and deliberate refusals. The final prepared-operation cleanup call took 49.52 ms. Parent RSS peaked at 107720704 bytes; per-call user/system CPU microseconds are recorded in storage-measurements.json. Child worker, PostgreSQL and browser resource usage are not included. No production scalability or latency improvement claim follows from these small local observations.

## Regression results

Counts below use each runner's reported test count; nested TAP parents may be included, so they are not summed as unique leaf tests.

| Suite | Reported result | Verdict |
| --- | --- | --- |
| ingestion-gateway-tests | tests 124; fail 0 | PASS |
| admin-service-tests | tests 98; fail 0 | PASS |
| sdk-node-tests | tests 55; fail 0 | PASS |
| contract-tests | tests 66; fail 0 | PASS |
| target-guards | tests 15; fail 0 | PASS |
| quota-integration | tests 17; fail 0 | PASS |
| quota-boundaries | tests 5; fail 0 | PASS |
| quota-browser | tests 8; fail 0 | PASS |
| bff-tests | tests 112; fail 0 | PASS |
| console-tests | tests 103; fail 0 | PASS |
| postgres-hardening | tests 10; fail 0 | PASS |
| credential-persistence | tests 29; fail 0 | PASS |
| Query Service | 214 tests; zero failures | PASS |
| DEV-012 lifecycle | 16 tests; zero failures | PASS |
| DEV-012 ownership/junction/downgrade | 5 tests; zero failures | PASS |
| Integrated product/browser | 21 tests; zero failures | PASS |
| PostgreSQL restart during retirement | Guarded restart and accounting equality | PASS |
| Prisma | Both schema validate + generate | PASS |
| Governance / mirrored schemas / whitespace | Successful checks | PASS |

Early fixture runs exposed invalid RESERVED test setup, rotating-file enumeration assumptions and changing measuredAt; these test assumptions were corrected. A direct sandbox-only native hard-link test was denied by the filesystem sandbox; the full guarded Query runner subsequently passed with required native access. Final acceptance uses the successful final runs, not those superseded failures.

## Reproduction and evidence

Compile Gateway and Query app/test projects with their existing TypeScript configurations. Start only the existing guarded disposable cluster. Run tests/storage/lifecycle.test.mjs, ownership.test.mjs and then database-restart.mjs after other database clients stop. Run scripts/run-storage-regressions.mjs and scripts/run-explorer-regressions.mjs with SKYRA_REGRESSION_EVIDENCE_LABEL=dev012. Build/package the SDK into .tmp/dev012-evidence/packages and verify its consumer with SKYRA_SDK_EVIDENCE_LABEL=dev012. Run scripts/run-integrated-acceptance.mjs with SKYRA_STORAGE_E2E=true. Query's existing guarded test runner uses QUERY_TEST_CONCURRENCY=1.

Primary evidence: reconciliation.json (full canonical events, IDs, receipts, admissions, scope and timing); browser-retirement.json; minimal-browser.json; retired-parquet-browser.json; accessibility.json; materialized-*.json; lifecycle.json/log; storage-measurements.json; parquet.json; ownership.log; database-restart.json/log; regressions.json; additional-regressions.json; query-regression.log; prisma-verification.log. All reside under .tmp/dev012-evidence/. Previous milestone evidence was preserved.
