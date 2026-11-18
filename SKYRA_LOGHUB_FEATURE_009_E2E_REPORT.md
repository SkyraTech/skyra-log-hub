# FEATURE-009 — End-to-end evidence

**PASS — real isolated PostgreSQL → Admin → authenticated BFF → Angular.**

## Real topology and event provenance

Disposable PostgreSQL 17.9 at 127.0.0.1:5433/skyra_loghub_disposable_validation, marker 26d25080-7655-4147-b05a-512ad359e14f, independent physical data directory .tmp/feature001a-postgres/data. Established target guards validate marker, live identity and physical separation before test writes. Management uses skyra_org_runtime; new read APIs run read-only transactions.

Existing real service operations create organization rename, member role change/suspension/reactivation, project create/update/suspend/reactivate, credential create/rotate/revoke and quota update events. 12 canonical events are reconciled by ID/action with SQL and public reads. A separate 3000-row cohort exercises indexed filters; 67 equal-microsecond timestamps exercise seven cursor pages. Six metadata compatibility fixtures and one foreign-tenant event supplement actual producers. Browser organization mutations and a stored-HTML fixture are additional actual database records, not replacements for these producer checks.

Actual controlled signed OIDC authorization-code/S256 flow and RS256/JWKS verification create opaque HttpOnly BFF sessions. Actual Admin/BFF processes, Angular production build and real Edge/Playwright execute the workflow. No mock audit API supplies accepted business rows. Loading delays continue the actual request; the outage test stops/restarts the owned Admin process.

## Browser evidence

The final combined run passes 28 leaf tests (29 TAP including its parent): 18 inherited organization/OIDC cases plus ten audit cases. Audit flows cover real list/action/actor/resource/date/combined filters, clear, seven cursor pages, details, correct stored before/after values, actual clipboard UUID, focus wrapping/return, unknown/missing/oversized/HTML metadata, denied roles/membership revocation, tenant/cursor isolation, expired cookie/logout, read-only HTTP verbs, all five settings links, loading/empty/outage/retry and latency.

Twelve scoped Axe scans cover list and dialog at 1440/768/390 px in light/dark; zero violations. Mobile menu navigation, reduced motion, no page-wide overflow and desktop Details visibility are verified. Final desktop and mobile dialog screenshots were visually inspected. Automated checks are not full WCAG certification.

Screenshots: audit-overview.png, audit-details.png, audit-empty.png, audit-error.png and audit-{1440,768,390}-{light,dark}.png / audit-{width}-{theme}-details.png under .tmp/feature009-evidence. browser-acceptance.json holds detailed scans, timing observations, source action types and copied UUID; e2e-environment.json records topology and zero uncaught page errors.

## Final checks

| Final verification | Reported TAP tests | Individual leaves | Result |
|---|---:|---:|---|
| Real audit producers/repository/security | 11 | 10 | PASS |
| Combined signed-OIDC organization + Audit browser | 29 | 28 | PASS |
| Prior FEATURE-001–007 browser regressions | 80 | 79 | PASS |
| Prior actual SDK/pipeline | 1 | 1 | PASS |
| Quota accounting/crash recovery | 17 | 16 | PASS |
| Quota two-tenant/boundary checks | 5 | 4 | PASS |
| Quota authenticated browser | 8 | 7 | PASS |
| Admin Service, including four new audit units | 98 | 98 | PASS |
| Console BFF, including two new audit units | 112 | 111 | PASS |
| Angular Console | 101 | 101 | PASS |
| Gateway/live PostgreSQL/WAL/security | 124 | 124 | PASS |
| Query Service | 214 | 214 | PASS |
| SDK | 55 | 55 | PASS |
| Contracts, including three audit tests | 66 | 66 | PASS |
| Audit hardening/rollback | 10 | 10 | PASS |
| Credential persistence | 29 | 28 | PASS |
| Target-rejection guards | 15 | 15 | PASS |

Every final run has zero failed, cancelled or skipped tests. TAP parent containers and wrapper scripts are excluded from leaf counts; overlapping organization/browser tests are not summed as distinct scenarios. Prisma validate/generate, repeat deploy, injected rollback/index drift, canonical/mirror equality, Angular production/offline build, service typechecks, governance, schema sync and whitespace checks pass. Relevant exact commands/exit codes and raw summaries are retained in regression-summary.json and regressions.json.

## Local performance

Local environment: Windows 10.0.26200, Node v24.14.0, 12 logical CPUs, PostgreSQL 17.9 on disposable port 5433, actual loopback Admin/BFF/Edge. Browser-round-trip samples include JSON decoding and public-schema validation. Last five controlled samples per BFF/UI metric:

| Metric | Samples | Observed median ms |
|---|---:|---:|
| BFF initial page (25 events) | 5 | 16.39 |
| BFF exact action filter | 5 | 10.45 |
| BFF event detail | 5 | 10.27 |
| BFF oversized historical detail (withheld) | 5 | 12.36 |
| Angular refresh to rendered records | 5 | 51.17 |
| Direct Admin cursor pages | 7 | 6.79 |

Direct Admin initial list: 9.77 ms; filtered 3000-row fixture cohort: 6.75 ms; direct detail: 5.13 ms (one observation each). EXPLAIN ANALYZE uses admin_audit_tenant_action_time_id_idx with an Index Only Scan; measured SQL execution 0.24 ms. The 200000-character historical metadata fixture returns a 405-byte public event with metadata withheld. This is a small local correctness exercise, not a production benchmark or SLA.

## Reproduction

```powershell
# Repository root; guarded disposable target only:
node scripts/isolated-postgres.mjs start
node scripts/protected-catalog-snapshot.mjs before feature009
node scripts/prepare-audit-tests.mjs
node scripts/verify-audit-migration.mjs
./node_modules/.bin/tsc.cmd -p apps/admin-service/tsconfig.json
./node_modules/.bin/tsc.cmd -p apps/console-bff/tsconfig.json
./node_modules/.bin/tsc.cmd -p apps/admin-service/tsconfig.test.json
./node_modules/.bin/tsc.cmd -p apps/console-bff/tsconfig.test.json
node --test --test-reporter=tap tests/audit/persistence.test.mjs
# apps/console-web working directory:
./node_modules/.bin/ng.cmd build --configuration production,offline
# Repository root:
node scripts/run-audit-e2e.mjs
node scripts/run-audit-regressions.mjs
# Resume from verified legacy browser evidence when only quota/services need rerunning:
node scripts/run-audit-regressions.mjs --quota-and-services
# Or resume only service/security gates:
node scripts/run-audit-regressions.mjs --services-only
# Final complete audit run uses the latest repository fixture after regressions:
node scripts/run-audit-e2e.mjs
node scripts/protected-catalog-snapshot.mjs after feature009
git diff --check
node scripts/isolated-postgres.mjs stop
```

The before snapshot is taken before work. Do not reproduce protected writes. Test runners resolve only verified disposable state and nonowner runtimes; loopback tests use the permitted execution context. The full regression runner creates fresh SDK cohorts immediately before prior-feature browser tests and gives quota/legacy evidence separate FEATURE-009 labels. The stateful quota browser needs fresh quota fixtures; resume modes preserve only already-verified earlier results. An optional focused audit run sets SKYRA_AUDIT_ONLY=true; final acceptance leaves it unset.

Resolved findings are retained in logs: initial test ETag/parameter fixtures, bounded nested JSON deserialization, native-filter label ambiguity, slotted dialog focus, loading-fixture routing race, unsettled theme snapshots and inherited mobile viewport setup. Theme scans await actual finite animations; no Axe rule is disabled. Final desktop table checks also require Details actions to fit without horizontal scrolling. Business reads use actual APIs, not mocked audit responses.

## Preservation and cleanup

Protected PostgreSQL stayed unchanged (90f73c6f2bc6bce568974e27472fd652505e3034284ff4a9883104b1fd02a6ff). All 181 historical reports/migrations/package artifacts and 37 immutable Platform archives are preserved. Prior acceptance reports/evidence were not overwritten; QA outputs use .tmp/feature009-evidence, .tmp/feature009-regression-evidence and .tmp/feature009-quota-evidence. Owned app processes stop in finally blocks; the final audit finds no remaining disposable client connections and the manifest-owned cluster is stopped after checks.

