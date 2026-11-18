# FEATURE-007 — Analytics implementation

Date: 2026-11-06. Local isolated implementation; no deployment or FEATURE-008.

## Initial source inventory

LogHub began on main at 19f084ad36fe37bb57ca107103e136d2d4a378be: 242 folded Git entries, 98 tracked modifications, 144 untracked, zero staged. Platform was clean on main at 928ca4343ab3a1887e586123a6ba5bb88b56a0ef. Initial path inventories and file hashes are retained in .tmp/feature007-evidence/initial-source.json. Previous reports and applied migrations are preserved.

| Capability | Existing implementation | Gap and delivered change |
|---|---|---|
| Total events / severity | Query terms aggregation; Angular KPI mapper | Request all six possible severities; reconcile totals; show total/error/warning/rate KPIs |
| Volume | DuckDB date histogram and SVG chart | Optional bounded zero filling, explicit UTC width/range metadata |
| Error/warning trends | Top-level severity filters | Two additional bounded histogram requests using identical frozen bounds |
| Top services | Deterministic terms and cardinality | Keep top 10; percentages use all matching logs, not only returned top groups |
| Environments | Existing canonical grouping/filter | Add environment distribution and matching Explorer drill-down |
| Project/time scope | Authoritative workspace directory and toolbar | Await session/bootstrap; real project selection; strict custom ranges; adaptive intervals |
| Investigation | Existing navigation and FEATURE-006 URL state | Freeze successful scope, filters and time bounds; clamp bucket drill-down at range edges |
| Completeness/errors | FEATURE-006 search warnings; aggregation dropped warnings | Propagate missing/corrupt archive indicators; qualify inconsistent concurrent results; clear failed data |

## Architecture and contracts

Reuses public SDK → managed credential → Gateway/fsynced WAL → finalized JSONL/manifest/catalog → Prisma/DuckDB → authenticated BFF → Angular. No new database, migration, streaming system, chart dependency or authentication subsystem.

Existing POST aggregate endpoints remain. Each request permits at most five aggregations. The dashboard sends three bounded requests over one resolved scope/window: five overview aggregations, one ERROR+FATAL histogram, and one WARN histogram. It never scans Explorer pages to calculate analytics. Scalar KPI arithmetic uses complete server severity counts.

The canonical request adds optional include_empty_buckets, default false. Responses add optional query_range, histogram interval_ms and partial-result statistics. Existing sparse-histogram consumers remain compatible. Applied Query validation rejects calendar rollover, excess/alignment-expanded bucket counts, unsupported fields and reserved aggregation names. The archive watermark uses actual finalized event timestamps rather than a fabricated end-of-day timestamp.

## Source and UI changes

- Query: analytics DTOs, validation, aggregate use case, aggregation plan and canonical aggregate schemas.
- BFF: existing aggregate proxy, dedicated input validator and unit coverage; tenant comes from the session. No new privilege is introduced.
- Angular: existing analytics component/facade/mapper/toolbar, metric cards, SVG/time-series/severity/service compositions, API types and Analytics route guard.
- Tests: tests/analytics contains real SDK cohort generation and eleven browser groups. Existing pipeline/root harnesses gain isolated FEATURE-007 branches; older defaults remain. Regression runners gain separate evidence labels and optional sequential Query execution.

The dashboard provides skeletons, empty/zero, unavailable/retry, denied, partial and stale-request states. It uses the existing session guard rather than the old preview-aware Analytics guard. Chart data tables, numeric legends and native keyboard actions supplement the SVGs. Installed Platform shell, skeleton/loader and design tokens are reused with the existing feature compositions; immutable packages and sibling Platform are unchanged. Custom windows select a suitable interval, while explicit interval selection remains available. Reduced motion is supported.

## Scope decisions

Manual refresh and a successful-fetch timestamp are delivered. Previous-period comparisons, automatic refresh, service-specific dashboard trends and persistent dashboard customization are deferred. Environment-specific Explorer drill-down is delivered. Canonical trace remains available in Explorer; no event correlation-ID dimension is invented. Finalized archives are eventually visible; this is not a streaming dashboard or a global snapshot of concurrent archive publication.

See the security, E2E and final acceptance reports for reproducible commands, measurements, screenshots and preservation evidence.

## Exact final file inventory

- scripts/protected-catalog-snapshot.mjs
- scripts/run-explorer-regressions.mjs
- scripts/run-project-query-tests.mjs
- tests/credentials/feature005-pipeline.test.mjs
- tests/organization/organization.e2e.mjs
- apps/console-bff/src/modules/query-proxy/api/query-proxy.controller.ts
- apps/console-web/src/app/app.routes.ts
- apps/console-web/src/app/core/http/api-client.port.ts
- apps/console-web/src/app/features/analytics/analytics.component.css
- apps/console-web/src/app/features/analytics/analytics.component.html
- apps/console-web/src/app/features/analytics/analytics.component.ts
- apps/console-web/src/app/features/analytics/application/analytics.facade.ts
- apps/console-web/src/app/features/analytics/application/analytics.mapper.ts
- apps/console-web/src/app/features/analytics/components/analytics-toolbar/analytics-toolbar.component.ts
- apps/console-web/src/app/features/analytics/components/metric-card/metric-card.component.ts
- apps/console-web/src/app/features/analytics/components/service-distribution/service-distribution.component.ts
- apps/console-web/src/app/features/analytics/components/severity-chart/severity-chart.component.ts
- apps/console-web/src/app/features/analytics/components/time-series-chart/time-series-chart.component.ts
- apps/console-web/src/app/features/analytics/domain/analytics-metric.model.ts
- apps/console-web/tests/analytics.facade.test.ts
- apps/query-service/src/modules/analytics/api/dto/aggregate-request.dto.ts
- apps/query-service/src/modules/analytics/api/dto/aggregate-response.dto.ts
- apps/query-service/src/modules/analytics/api/pipes/aggregate-validation.pipe.ts
- apps/query-service/src/modules/analytics/application/aggregate-logs.use-case.ts
- apps/query-service/src/modules/analytics/domain/aggregation.model.ts
- apps/query-service/src/modules/query-execution/application/query-planner.service.ts
- apps/query-service/tests/security/query-isolation.test.ts
- contracts/query/v1/aggregate-request.schema.json
- contracts/query/v1/aggregate-response.schema.json
- tests/contracts/query-contracts.test.ts
- SKYRA_LOGHUB_FEATURE_007_DATA_SECURITY.md
- SKYRA_LOGHUB_FEATURE_007_E2E_REPORT.md
- SKYRA_LOGHUB_FEATURE_007_FINAL_ACCEPTANCE.md
- SKYRA_LOGHUB_FEATURE_007_IMPLEMENTATION_REPORT.md
- apps/console-bff/src/modules/query-proxy/api/aggregate-validation.ts
- apps/console-bff/tests/unit/analytics-validation.test.ts
- apps/query-service/tests/unit/analytics/dashboard-validation.test.ts
- scripts/run-analytics-e2e.mjs
- tests/analytics/browser-scenarios.mjs
- tests/analytics/ingest-cohort.mjs
