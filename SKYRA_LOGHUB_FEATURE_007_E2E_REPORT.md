# FEATURE-007 — E2E acceptance

Date: 2026-11-06. **PASS — FEATURE-007 IMPLEMENTED IN ISOLATION.**

## Actual topology and event set

Public Node SDK and managed credentials → real Gateway/nonowner PostgreSQL role → fsynced WAL → finalized JSONL/manifest/catalog → real Prisma/DuckDB Query → session/CSRF BFF → production-built Angular. The controlled loopback OIDC provider performs real code exchange, S256 and RS256/JWKS; mock OIDC is disabled. Writes use the physically separate, marker-verified PostgreSQL 17.9 cluster at 5433, never protected 5432.

Run: analytics-74f7568d-8879-4c65-9cc3-b27a85910d6b. The pre-ingestion plan records 110 events in the primary analytics project: **95 inside** the four-minute accepted window and 15 deliberately outside its boundaries. Another authorized project has 20 events; a foreign tenant has five additional in-window events. These 135 events plus the retained 290-event FEATURE-005/006 cohort make **425 real SDK events** in this run. The expected answer is not application code or a mocked analytics response.

| Primary window metric | Expected | Actual Query/BFF/browser |
|---|---:|---:|
| Total | 95 | 95 |
| ERROR + FATAL | 38 | 38 |
| WARN | 19 | 19 |
| Error percentage | 40% | 40% |
| Each emitted severity: debug/info/warn/error/fatal | 19 | 19 |
| Services alpha / beta / gamma | 60 / 30 / 5 | 60 / 30 / 5 |
| Environments production / staging / development | 60 / 30 / 5 | 60 / 30 / 5 |
| Aligned one-minute buckets | 45 / 30 / 20 / 0 | 45 / 30 / 20 / 0 |
| Other project | 20 | 20, excluded from primary |

analytics-continuity.json verifies all 135 IDs and canonical payloads in CRC-checked WAL and catalogued archives, accounting for authoritative tenant enrichment. analytics-query-result.json contains the actual aggregate response. The 95 expected in-window IDs match the SDK set; four KPI/bucket/service/environment drill-downs verify corresponding actual Explorer response IDs. The earlier 285-event Explorer continuity is separately retained. No missing/duplicate cohort IDs or canonical field mismatches.

## Browser scenarios and accessibility

The full run passes **80 Node tests / 79 leaves / zero failed, cancelled or skipped**: 38 Organization/OIDC/Members/Projects, 17 Credentials, one FEATURE-005 browser chain, 12 Explorer groups and 11 Analytics groups. Repeated focused runs are not added to these totals. Assertions within a group are not claimed as independent tests.

The eleven Analytics groups cover: aggregate reconciliation; time boundaries/invalid inputs/max limits; roles and scope; real UI/table values; range/project/empty/zero/invalid-range controls; four exact Explorer drill-downs; cancellation of delayed actual responses; real archive removal/restoration; actual Query stop/restart; responsive states/accessibility; and established-session logout. Browser role strings, foreign/multiple-project widening, inactive membership/project, malformed envelopes, unsupported grouping and reserved names cannot grant data access. Inherited authentication tests cover expiry and cryptographic failures.

All **six** Analytics scoped Axe scans at 1440/768/390 pixels × light/dark report **zero violations**. Every configuration captures dashboard, lower trends, distributions, loading, empty and error states: **36 viewport/state screenshots**, plus a partial-result screenshot. No page-wide overflow; numeric legends/data tables and keyboard actions supplement charts. Fatal console errors: **0**. Desktop and mobile charts/distributions were visually inspected. The twelve inherited Explorer list/detail scans also have zero violations. These checks are not full WCAG certification.

Screenshots include [desktop](.tmp/feature007-evidence/analytics-1440-dark.png), [mobile](.tmp/feature007-evidence/analytics-390-light.png), [mobile trends](.tmp/feature007-evidence/analytics-390-light-trends.png), and [mobile distributions](.tmp/feature007-evidence/analytics-390-light-groups.png).

## Local performance

| Request | Authenticated round trip ms | Query execution ms | Returned buckets | Selected files / estimated bytes |
|---|---:|---:|---:|---:|
| four-minute overview | 123.23 | 66 | 4 | 4 / 106554 |
| two-minute overview | 74.31 | 43 | 2 | 3 / 84100 |
| errors | 41.44 | 11 | 4 | 4 / 106554 |
| warnings | 46.25 | 10 | 4 | 4 / 106554 |
| 2000 empty UTC buckets | 29.87 | 0 | 2000 | 0 / 0 |

Navigation to ready dashboard KPIs: **477.77 ms**, including session/workspace/API work. Three services and three environments are returned in the primary window. Maximum 2,000 zero buckets and a size-50 terms request succeed; size 51 and alignment-expanded 2,001 buckets fail. This is not a 50-distinct-service load test. Round-trip measurements include the test helper's session/CSRF fetch. File bytes are plan estimates, not cumulative physical I/O across repeated aggregate SQL. The selected fixture set has 95 events; physical engine-scanned rows and peak memory are not instrumented. No production throughput or SLA is inferred.

## Exact regression results

| Suite | Command / working directory | Passed / skipped |
|---|---|---:|
| Query | QUERY_TEST_CONCURRENCY=1 node scripts/run-project-query-tests.mjs | 214 / 0 |
| BFF | node --test dist-test/tests/**/*.test.js, apps/console-bff | 108 / 0; 107 leaves + parent |
| Console | node --import tsx --test tests/**/*.test.ts, apps/console-web | 101 / 0 |
| SDK | same local tsx test command, packages/logger-node | 54 / 0 |
| Gateway including actual PostgreSQL | guarded regression runner | 124 / 0 |
| Admin | guarded regression runner | 94 / 0 |
| Contracts | node --import tsx --test tests/contracts/**/*.test.ts | 61 / 0 |
| Target guards | node --test tests/admin/isolated-target.test.mjs | 15 / 0 |
| Credential persistence | node --test tests/credentials/persistence.test.mjs | 29 / 0; 28 leaves + parent |
| Real SDK pipeline | SKYRA_ANALYTICS_E2E=true node --test tests/credentials/feature005-pipeline.test.mjs | 1 / 0 |
| Full browser | node scripts/run-analytics-e2e.mjs | 80 / 0; 79 leaves + parent |

All listed final commands exit 0. The guarded aggregate runner is SKYRA_REGRESSION_EVIDENCE_LABEL=feature007 node scripts/run-explorer-regressions.mjs; individual exit codes/counts are in regressions.json. Local tsc builds/test compilation and typechecks pass. Console build: ng build --configuration production,offline (script/style optimization retained; remote font inlining disabled). Schema sync, design governance and Git whitespace validation pass.

An inherited extension test attempted network installation of a nonexistent extension and could stall in this restricted environment. It now checks actual runtime settings and rejection of a local unsigned extension, without changing the engine. Earlier debug/approval-timeout and aged-fixture attempts are excluded from acceptance; the final full browser run uses immediately regenerated SDK cohorts. Protected/source reconciliation is recorded in final-audit.json.
