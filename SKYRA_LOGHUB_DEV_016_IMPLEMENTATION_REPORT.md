# DEV-016 Implementation Report

PASS — DEV-016 IMPLEMENTED IN ISOLATION.

Implemented a bounded Query dashboard endpoint, authenticated BFF projection, current/previous comparisons, service/severity trends, safe configurable refresh and durable user-owned dashboard preferences. Existing legacy Analytics remains available with the new feature flag off.

## Architecture and contracts

POST /query/v1/logs/dashboard is protected by QueryAuthGuard. POST /bff/query/dashboard uses session/CSRF and authoritative current IAM. Three sequential bounded evaluations produce current summary, previous summary and current service/time/severity groups. They are independent archive evaluations, not a shared database snapshot. Duplicate canonical event IDs are collapsed within each dashboard scan.

UTC half-open current [start,end) and immediately preceding equal-duration range use the same authorized filters. Limits: seven days, 240 buckets, top ten services, 4KiB requests, 1MiB output. Deterministic top-N ordering is count descending then service ascending. Global trends include services outside top-N; missing service names remain in global totals.

Count delta = current − previous. Relative percent = 100 × delta / previous only with a positive previous denominator. Zero previous/nonzero current is NEW with null relative percent; both zero is NONE. Error-rate differences are percentage points. Incomplete periods or inconsistent trend counts suppress changes. Unavailable values are null and not zero-filled.

## Refresh and presentation

Off/15/30/60/300 seconds; scheduling begins after completion. Manual repetition coalesces; changed filters/projects cancel and invalidate older responses. Route destruction, hidden state and authorization loss stop polling. Transient errors retain explicitly stale data; backoff caps at 300 seconds. Draft service/correlation inputs apply only on explicit Apply. Explorer drill-downs preserve authorized project, UTC bounds, environment, exact case-sensitive correlation and severity intersection.

Angular includes comparison table, selected-service severity, bounded service trends, accessible controls, status and stale indicators. Mobile input flex sizing was corrected. Actual computed Platform colors and full CSS were verified at 390/768/1440 in both themes. The offline optimized build helper disables external font and critical CSS inlining so its stylesheet loads directly; product theme files are byte-identical to baseline.

## Persistence

Additive DEV-016-001 migration creates dashboard_preferences and ledger 20261116010000_dev016_dashboard_preferences. Mirrored Prisma models remain equal; all preexisting schema bytes and migrations remain preserved. Settings: v, range, refreshSeconds, service, interval, topN, metric. GET absent returns defaults with p0 without writing. PUT/reset require If-Match; transaction lock/version comparison prevents lost updates; reset increments rather than deleting. Current IAM uses logs.analytics. Private preferences are not tenant-wide audit entries.

Migration integrity validates constraints, columns, index and grants; transaction rollback and idempotent repeat tested. The disposable ledger contains 13 entries; earlier 12 checksums unchanged. No protected migration was run.

## Verification and scope

[finish-tests.json](.tmp/dev016-evidence/finish-tests.json) records passing migrations, DEV-015 security/export, broad services, durable sessions, storage, SDK lifecycle, Prisma and twelve typechecks. SDK/core pass on Node 24 and 22; the unchanged Python suite passes 78 tests with required loopback access. Full browser acceptance has 68 leaves, including 21 new analytics scenarios. Focused races and true-theme visual checks are separate.

Changed initial files: 51; added files: 34. These counts include test harnesses/docs and preserve all 1433 initial paths. Historical artifacts verified: 215; immutable Platform archives: 37. HEAD unchanged; staged files zero. Detailed path inventory and hashes: [final-audit.json](.tmp/dev016-evidence/final-audit.json).

See [contract](docs/analytics/DEV-016-contract.md), [security](SKYRA_LOGHUB_DEV_016_ANALYTICS_SECURITY.md), [E2E](SKYRA_LOGHUB_DEV_016_E2E_REPORT.md) and [final acceptance](SKYRA_LOGHUB_DEV_016_FINAL_ACCEPTANCE.md). No publishing, protected activation or DEV-017 work.
