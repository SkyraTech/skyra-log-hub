# DEV-016 Advanced Analytics contract

This feature is implemented for isolated development. Protected activation and real identity-provider setup are separate decisions. Defaults remain off.

## Architecture and activation

The browser calls the authenticated Console BFF. The BFF revalidates persisted membership and project scope, mints the existing short-lived scoped assertion and calls Query. Query reuses the approved archive discovery, manifest/path checks, JSONL/Parquet planner, DuckDB execution and resource governor. Admin owns preference persistence; the browser, BFF session role and ingestion/query metadata role have no preference-table access.

Apply only the additive `docs/admin/migrations/DEV-016-001/migration.sql` on an explicitly approved target. It must have a matching unique migration ledger checksum. Existing twelve migrations remain immutable. The isolated preparation command is `node scripts/prepare-dashboard-preferences.mjs`; it verifies the physical disposable target, prior checksums, structure and narrow grants. It is not a protected activation command.

Enable Admin `DASHBOARD_PREFERENCES_ENABLED=true`, BFF `ADVANCED_ANALYTICS_ENABLED=true` and Console runtime `advancedAnalytics:true` together only after migration/readiness approval. Test processes enable them only for disposable infrastructure. Query's new authenticated internal route does not accept anonymous browser authority. No new IAM capabilities or roles are added.

## Dashboard request

`POST /bff/query/dashboard` requires the existing session cookie and CSRF token. BFF forwards to `POST /query/v1/logs/dashboard` under a signed internal assertion. Both return HTTP 200 on success.

```json
{
  "projects": ["my-authorized-project"],
  "time_range": {"start":"2026-11-16T10:00:00.000Z","end":"2026-11-16T11:00:00.000Z"},
  "interval":"5m",
  "top_n":5,
  "correlation_id":"Order-42",
  "services":["checkout-api"],
  "levels":["warn","error","fatal"],
  "environments":["production"]
}
```

Exactly one project is required. Tenant comes from the authenticated session/assertion. Unknown fields, owner/tenant overrides, raw SQL, ASTs and arbitrary aggregation specifications are rejected. Correlation remains the DEV-015 canonical exact, case-sensitive application workflow ID, independent of trace IDs. Absent correlation includes historical events without it. Filters apply identically to both periods and service trends. Service, environment and severity arrays use existing bounded canonical validation. BFF compares requested versus returned filter sets independent of JSON property order; exact values and scope must agree.

Bounds: 4 KiB request, current window at most seven days, top-N 1..10, at most 240 UTC buckets, intervals 1m/5m/15m/1h/6h/1d, at most 1 MiB aggregate response. Defaults are 5m and top five. The preceding window has the same bounded duration. Query evaluates three bounded plans sequentially: current summaries/distributions, previous summaries and one grouped service/time/severity query. It does not issue one request per service or bucket. Query has a 14-second dashboard cancellation budget, with existing per-plan governor limits also active; BFF has a 15-second deadline and at most four active dashboard handlers. A superseding request from the same session aborts its older work, and older cleanup cannot remove the newer controller.

## Event and comparison semantics

Analytics uses event occurrence time, UTC, `[start,end)`. It does not use admission time. Current is `[start,end)`; previous is `[start-(end-start),start)`. The Console resolves relative time once per evaluation, deriving both windows from that single effective reference. Custom bounds remain fixed. Calendar rollover uses UTC epoch arithmetic.

Counts are unique canonical event IDs within the authorized archive scope. Dashboard SQL deduplicates event identities before aggregate filters. SDK receipt retries are not events; rejected or unpublished data and foreign scope are excluded. Historical logs without correlation remain supported. Missing service values are excluded from service rankings/cardinality but remain in global severity/time totals; canonical ingestion normally requires a service name.

ERROR + FATAL form the error count. WARN alone forms warnings. Error rate is `(errors/total)*100`, with zero for an observed empty complete denominator. Count change is current minus previous, with relative percent `(current-previous)/previous*100`. A zero previous denominator gives null percent, with NEW versus NONE activity explicitly distinguished. Error-rate change is percentage points, not relative percent. Unique service count is independently calculated, not inferred from a truncated top-N list.

Service rankings sort count descending, service name ascending. The response labels top-N overflow. A grouped server-side query returns service event, error/fatal and warning counts per UTC bucket; error rate derives from those counts. Global error/warning time series cover all services, including services outside top-N. Zero fill is allowed only for complete source evaluations. First/last chart buckets may intersect only part of the requested interval; Explorer links clip bounds to the actual requested range.

## Response and completeness

The v1 envelope contains `schemaVersion`, authorized `scope`, applied `filters`, interval/width, `generatedAt`, `current`, `previous`, `comparison`, `serviceTrends`, explicit limits and consistency. Each period has effective UTC range, metrics, existing aggregate results and statistics (scanned segments/bytes, execution time, archive watermark, unavailable segments and partial flag). Service-trend statistics use the same safe vocabulary.

- COMPLETE: known selected canonical archives verified and evaluated. An observed empty result is zero.
- PARTIAL: unavailable selected canonical archives or a detected change between current summary and trend evaluations. Available counts remain labeled partial; comparisons are withheld.
- UNAVAILABLE: unavailable selected archives with no verified scanned segments. Metrics are null, not fabricated zero. HTTP failures/timeouts are also shown as unavailable errors.

If either period or trend evaluation is incomplete, `comparison.complete` is false and `changes` is null. HTTP 200 does not clear completeness warnings. Corrupt/missing Parquet can fall back to valid canonical JSONL under hybrid policy; missing canonical data is not silently treated as complete just because a cache exists. Metadata describes known published catalog scope, not an omniscient guarantee about unpublished data.

Consistency is `bounded-independent-archive-evaluations`, not a global snapshot across the two periods and trend plan. Source publication may occur between plans; the fixed time/filter context and per-plan metadata remain explicit. A detected current-versus-trend count discrepancy marks the evaluation incomplete.

## Automatic refresh and UI lifecycle

Allowed intervals are off, 15, 30, 60 and 300 seconds. One route-owned completion-driven timer schedules the next poll after work settles. Slow requests do not produce overlapping automatic queries. Hidden documents suppress polling; visibility changes re-arm the bounded interval. Errors use bounded exponential delay up to five minutes instead of aggressive retries. Manual repeated refresh commands coalesce while work is pending; project/filter changes cancel and invalidate the older generation.

Leaving the route, logout or component destruction stops the timer. An async preference restore cannot start it after destruction. Session/permission failures stop polling and remove unauthorized data. Temporary Query failure retains prior data only with an explicit stale warning and manual retry. Last-evaluated time and source completeness remain visible. Edited correlation/service inputs are applied explicitly; background polling uses the applied values. Preference changes during a pending evaluation do not let that response overwrite newer presentation settings.

The existing charts, Platform inputs/buttons and responsive layout are reused. KPI comparisons use text and signed values rather than color alone. Service bucket keyboard/click drill-downs preserve authorized project, effective/clipped UTC bounds, applicable service/environment/correlation and the intersection of applicable severity filters. An impossible severity intersection does not widen into an all-level query.

## User-owned preferences

Routes: `GET/PUT /bff/projects/:projectId/dashboard-preferences`, `POST .../reset`. They proxy to matching Admin routes under scope `analytics.preferences`. GET of an absent record returns defaults and `"p0"` without a database write. PUT and reset require exact `If-Match`; missing gives 428, stale gives 409. First persistence creates version one. Reset updates defaults and increments the version, preventing an old create token from becoming valid again.

```json
{"v":1,"range":"1h","refreshSeconds":0,"service":"","interval":"5m","topN":5,"metric":"events"}
```

All seven fields are required. Settings are at most 2 KiB. Relative presets are 15m/1h/6h/24h/7d; refresh intervals are enumerated, service is empty or a canonical name, interval must fit the bucket cap, topN is 1..10, metric is events/errors/warnings. Unknown fields, custom absolute ranges, correlation, arbitrary filter JSON and identity/scope claims are rejected. Preferences are presentation/refresh settings, not a second Explorer saved-search definition. A custom view saves a relative default, not its absolute search timestamps.

The primary key is tenant/project/owner, with restrictive tenant/project/user foreign keys, JSON/version checks and timestamps. Admin alone has SELECT/INSERT/UPDATE; no runtime DELETE or TRUNCATE. Transactional per-owner/project advisory locking plus exact version comparison serializes updates/creation. Both canonical and mirrored Prisma schemas include the additive model/relations. Private preference changes deliberately produce no tenant-wide administrative audit containing service/presentation choices.

Every request requires current identity, active tenant/project access and existing `logs.analytics`; preferences never grant log authority. Other users, including organization admins, see only their own settings. Inactive or inaccessible projects are denied. Rows are retained under foreign-key/soft-lifecycle policy rather than silently deleted or applied in another context. A stored service is revalidated as a canonical scoped query filter when applied; a service absent in that authorized time scope yields a legitimate empty view, not permission to inspect other projects.

## Usage distinction and validation

Usage counts admission-time events and normalized batch bytes; Analytics counts occurrence-time, queryable canonical events. These windows need not match. The live DEV-016 cohort includes two admitted boundary events outside both compared periods, demonstrating the difference without altering accounting.

Reproduction uses owned disposable PostgreSQL only: run the preparation script, build services and optimized Console, package the official SDK locally, install clean consumers, and run `scripts/run-advanced-analytics.mjs` modes sdk/browser/regressions/sessions/lifecycle. Focused suites live under `tests/advanced-analytics`, Query's advanced-dashboard integration test and Console's advanced-analytics tests. Run restart suites sequentially. The optional Python full-suite follow-up needs loopback access for asyncio socketpair setup; the unchanged 78-test suite passes outside the network sandbox. No npm publication, protected writes, real Entra setup or DEV-017 work is included.

The isolated offline Console build keeps production script/style optimization enabled while disabling external font inlining and critical CSS inlining. This loads the full stylesheet directly instead of deferring it behind an external-font-dependent print/onload link. Browser checks assert computed Platform colors as well as theme attributes. Product theme source and immutable Platform packages remain unchanged.
