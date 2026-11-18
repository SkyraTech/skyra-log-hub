# DEV-017 Implementation Report

PASS — DEV-017 IMPLEMENTED IN ISOLATION.

Implemented authorized matching audit exports, safe current actor labels, exact administrative correlation filters, authoritative daily Usage reads and Angular reporting. New capabilities default off behind ADVANCED_AUDIT_USAGE_ENABLED and the Console advancedAuditUsage flag; existing audit/persistence/session/IAM gates remain required.

## Source architecture and API contracts

Reused AuditHistoryService, PrismaAuditReadRepository, audit-query/projection and the existing immutable audit writer. Added correlation equality to the parameterized predicate and signed binding, a first-page watermark and one tenant-scoped actor batch. Current permitted display name augments the immutable actor UUID; it does not modify historical records or disclose emails.

POST /bff/organization/audit/export accepts JSON/CSV plus matching filters. It traverses existing signed100-record pages, with current authorization per page and before completion, strict public projection, duplicate/order/watermark checks, bounded buffers, abort/deadline handling and fixed filenames. Limits1000 records/5MiB/10 pages/15s, one export/session and two/BFF. JSON embeds explicit metadata; CSV uses response headers and UI status for completeness/truncation.

GET /admin/v1/tenants/:tenantId/projects/:projectId/usage/history and GET /bff/projects/:projectId/usage/history accept inclusive UTC start and exclusive end dates, at most90 days. Indexed daily admission windows provide decimal-string accepted/reserved events/bytes; missing windows mean no admitted/pending batches. Storage errors remain errors. Current IAM and active project are required.

No schema migration is necessary. Existing project_quotas is mutable and cannot prove effective historical limits. Historical quota limits/utilization/exceeded states remain null; separately labeled current-policy references include reservations and correctly handle zero/unlimited/over100% cases. Charging, reconciliation, WAL, Query and archives are unchanged.

Contracts: [operator/API semantics](docs/administration/DEV-017-contract.md), [OpenAPI](contracts/admin/v1/openapi.yaml), audit-export-request/json and usage-history-request/response schemas under contracts/admin/v1. Existing public audit schemas add optional safe display/watermark transport fields; strict JSON schema tests validate real exports/history. Current cursor binding changes require reloading old in-flight cursors.

## Angular

Audit History gains administrative correlation input, current safe actor labels, applied-filter JSON/CSV export, cancellation and explicit limit/progress/error statuses. It creates a download only after successful bounded response. Usage retains existing cards/quota controls and adds7/30/90-day accepted-event/normalized-byte and current-reference charts, daily table and selected-day detail. The existing chart component gains configurable units without changing Query calculations. Route/context cancellation prevents held old-project responses from reappearing. Keyboard activation, query history/back-forward/direct refresh, both computed themes and narrow layouts are verified.

## Validation and compatibility

Combined browser run:82 independent leaves (83 TAP tests including parent), including14 new scenarios. Final focused14-scenario run additionally verifies explicit keyboard activation and Usage back/forward. Real-service security/fault suite:15 leaves. New contract suite:31 leaves each on Node24 and Node22; server deadline1 and schema evidence3. Relevant DEV012–016 service, audit, quota, storage, session, search/export, SDK and developer regressions pass. Twelve package/application typechecks, optimized Console build, both Prisma validate/generate pairs, canonical schema synchronization, governance and whitespace pass. Exact commands/results are in the E2E report and evidence JSON.

All 1467 initially inventoried source paths remain present. 220 historical reports/migration/package artifacts match their baseline hashes; all 37 immutable Platform archives are unchanged. Platform remains clean at 928ca4343ab3a1887e586123a6ba5bb88b56a0ef. Both Prisma schema files match their initial bytes and each other. All 13 migration identities/checksums remain unchanged. Prior Gateway storage/accounting, Query/Analytics authority, SDK/core/Python source and canonical wire contracts are preserved. Protected forced read-only snapshots match: SHA256 90f73c6f2bc6bce568974e27472fd652505e3034284ff4a9883104b1fd02a6ff. No protected writes or activation. Zero final disposable application clients. Only the manifest-owned disposable cluster is stopped after final audit.

## File inventory relative to the DEV-017 baseline

Changed initial files (45); generated cache files are classified separately in final-audit.json:

- `apps/admin-service/src/api/controllers/quotas.controller.ts`
- `apps/admin-service/src/core/audit/application/audit-history.service.ts`
- `apps/admin-service/src/core/audit/application/audit-projection.ts`
- `apps/admin-service/src/core/audit/application/audit-query.ts`
- `apps/admin-service/src/core/audit/infrastructure/prisma-audit-read.repository.ts`
- `apps/admin-service/src/modules/projects/quotas.service.ts`
- `apps/console-bff/src/modules/auth/api/audit-history.controller.ts`
- `apps/console-bff/src/modules/auth/application/admin-client.service.ts`
- `apps/console-web/src/app/features/audit/audit.component.html`
- `apps/console-web/src/app/features/audit/audit.component.ts`
- `apps/console-web/src/app/features/usage/usage.component.html`
- `apps/console-web/src/app/features/usage/usage.component.ts`
- `contracts/admin/v1/audit-history-page.schema.json`
- `contracts/admin/v1/public-audit-event.schema.json`
- `scripts/prepare-dashboard-preferences.mjs`
- `scripts/protected-catalog-snapshot.mjs`
- `scripts/run-explorer-regressions.mjs`
- `scripts/run-integrated-acceptance.mjs`
- `scripts/verify-sdk-consumer.mjs`
- `tests/advanced-analytics/browser-runtime.mjs`
- `tests/advanced-analytics/memory-probe.mjs`
- `tests/advanced-analytics/migration.test.mjs`
- `tests/advanced-analytics/preferences.test.mjs`
- `tests/advanced-explorer/browser-scenarios.mjs`
- `tests/advanced-explorer/export-faults.test.mjs`
- `tests/advanced-explorer/migration.test.mjs`
- `tests/advanced-explorer/saved-searches.test.mjs`
- `tests/audit/persistence.test.mjs`
- `tests/developer/documentation.test.mjs`
- `tests/developer/sample.test.mjs`
- `tests/organization/organization.e2e.mjs`
- `tests/quotas/quota-boundaries.test.mjs`
- `tests/quotas/quota-integration.test.mjs`
- `tests/sdk-reliability/app-exit.test.mjs`
- `tests/sdk-reliability/gateway-lifecycle.test.mjs`
- `tests/sessions/identity-stack.mjs`
- `tests/storage/database-restart.mjs`
- `tests/storage/lifecycle.test.mjs`
- `tests/storage/ownership.test.mjs`
- `apps/admin-service/src/core/config/admin-config.service.ts`
- `apps/console-bff/src/config/bff-config.service.ts`
- `apps/console-bff/src/modules/auth/auth.module.ts`
- `apps/console-web/src/app/core/config/app-config.service.ts`
- `apps/console-web/src/app/features/analytics/components/time-series-chart/time-series-chart.component.ts`
- `contracts/admin/v1/openapi.yaml`

Added source/report files (24):

- `SKYRA_LOGHUB_DEV_017_E2E_REPORT.md`
- `SKYRA_LOGHUB_DEV_017_FINAL_ACCEPTANCE.md`
- `SKYRA_LOGHUB_DEV_017_IMPLEMENTATION_REPORT.md`
- `SKYRA_LOGHUB_DEV_017_SECURITY_INTEGRITY.md`
- `apps/admin-service/src/modules/projects/usage-history.ts`
- `apps/console-bff/src/modules/auth/api/audit-export.controller.ts`
- `apps/console-bff/src/modules/auth/api/usage-history.controller.ts`
- `apps/console-bff/src/modules/auth/application/audit-export-format.ts`
- `apps/console-web/src/app/features/usage/usage-history.component.css`
- `apps/console-web/src/app/features/usage/usage-history.component.html`
- `apps/console-web/src/app/features/usage/usage-history.component.ts`
- `contracts/admin/v1/audit-export-json.schema.json`
- `contracts/admin/v1/audit-export-request.schema.json`
- `contracts/admin/v1/usage-history-request.schema.json`
- `contracts/admin/v1/usage-history-response.schema.json`
- `docs/administration/DEV-017-contract.md`
- `scripts/run-advanced-administration.mjs`
- `tests/advanced-administration/admin-fault-proxy.mjs`
- `tests/advanced-administration/browser-scenarios.mjs`
- `tests/advanced-administration/contracts.test.mjs`
- `tests/advanced-administration/deadline.test.mjs`
- `tests/advanced-administration/schema-evidence.test.mjs`
- `tests/advanced-administration/sdk-runner.mjs`
- `tests/advanced-administration/security.test.mjs`

Initial/final inventories and hashes: [initial-source.json](.tmp/dev017-evidence/initial-source.json), [final-audit.json](.tmp/dev017-evidence/final-audit.json). No reset, clean, commit, staging, push or Platform edit.
