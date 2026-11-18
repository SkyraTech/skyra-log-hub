# FEATURE-007 — Analytics data and security

Date: 2026-11-06. Evidence is isolated under .tmp/feature007-evidence/.

## Semantics and completeness

All analytics originate from bounded DuckDB aggregations over verified, authorized archives. Counts are not calculated from a paginated log response. Errors mean ERROR + FATAL; warnings mean WARN. Error percentage is 100 × errors / total, rounded to two decimal places; an empty total yields 0%, never NaN/Infinity. Severity supports trace/debug/info/warn/error/fatal; absent categories can be omitted, and returned severity groups reconcile to the complete total.

Time bounds are UTC start inclusive/end exclusive. Histogram widths are allowlisted: 1m, 5m, 15m, 1h, 6h, 1d. Buckets align to UTC epoch boundaries and can be zero-filled when requested. The first/last buckets may intersect only part of the selected window; Explorer drill-down clamps their bounds to the applied query range. At most 2,000 intersecting buckets are permitted per histogram, counting alignment, and at most five aggregations per request. Defaults retain sparse responses for existing callers.

Service terms sort by count descending, then key ascending. Dashboard top-N is 10; API maximum is 50. Service percentages use the overall matching count; the top-N tail is not portrayed as a full distribution. Canonical service/environment are required by ingestion; malformed missing/empty required values are rejected there. Missing optional grouping values, such as absent error.type in this cohort, are omitted by SQL IS NOT NULL rather than fabricated. Generic explicit empty optional strings remain explicit keys.

Missing/corrupt relevant archive segments propagate partial_results and unavailable_segments. Resource ceilings reject the request rather than returning unqualified truncated totals. A partial warning also appears if independently returned severity/trend totals disagree during concurrent publication. The three requests share frozen bounds but are not an atomic global archive snapshot. Last refreshed means successful fetch completion; archive_watermark is the latest eligible finalized event timestamp, not proof that every possible event has arrived.

## Authorization and validation

Analytics uses the existing HttpOnly-cookie session, CSRF guard, fresh authoritative memberships, active project directory and scoped internal Query assertion. BFF tenant selection comes from the session; browser tenant overrides are rejected. Query independently verifies tenant/project scope and performs row and pre-open file provenance checks. All five stored roles already possess logs.analytics within their actual effective scope; no broad new privilege is added. Browser role strings cannot grant authority.

BFF and Query validate envelope structure, UTC dates, lists, field/operator allowlists, widths, group sizes and bucket counts. Reserved aggregation names and inherited-object interval names are rejected. DuckDB uses prepared value/path parameters and fixed allowlisted SQL fragments. No browser SQL or arbitrary grouping identifier is executed. Search and aggregation errors are safe; no-store is applied to successful aggregate proxy responses. Null/array envelopes return 400. Inactive/foreign scope and logout cannot obtain analytics.

Existing defaults remain: 30-day range, 500 segments, 524,288,000 estimated scanned bytes, 30-second query budget and 256 MiB/two-thread DuckDB configuration. These are ceilings, not production capacity claims.

## Reconciliation and adversarial evidence

A pre-ingestion plan defines 110 SDK events in the analytics project: 95 inside the accepted window and 15 outside its boundaries. Inside: 19 at each of five emitted severities, 38 error/fatal, 19 warn, 40% error rate, services 60/30/5, environments 60/30/5 and one-minute totals 45/30/20/0. A second authorized project has 20 events; a foreign tenant has five additional in-window events. IDs, nested attributes and actual archived events are retained for reconciliation. Historical FEATURE-006 counts are not hardcoded in application code.

Real Query/BFF/browser checks cover boundaries, missing optional dimensions, 2,000 buckets, maximum group size, invalid calendars/intervals/groupings, foreign and multi-project widening, ProjectAdmin/Developer/Viewer scope, suspended/revoked memberships, inactive project, browser role tampering, precise Explorer subsets, delayed actual responses, actual archive unavailability, actual Query stop/restart and logout. Secrets remain in process memory; response/URL evidence contains no credential or session tokens.

Protected PostgreSQL remains read-only throughout; all writes use the provisioner-verified disposable cluster and owned run-specific storage. Performance measurements and final snapshot/source hashes are in the E2E and final acceptance reports. Physical scanned-row counts and peak memory are not instrumented; file/byte statistics and known fixture counts are reported without inventing those measurements.
