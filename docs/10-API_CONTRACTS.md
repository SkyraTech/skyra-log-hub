# API Contracts and Query Interface Specification

> **Product:** Skyra LogHub  |  **Status:** Proposed baseline — review before implementation  |  **Version:** 0.1-draft  |  **Date:** 2026-10-21
> **Repository:** `skyra-loghub` (renamed by project owner). Assumptions and undecided items are marked **TBD**. These documents are design specifications, not assertions that code already exists.

## 1. Rules
NestJS `/api/v1` REST interface; HTTPS only outside localhost; OpenAPI as authoritative machine contract; generated Angular API client. Consistent server-enforced roles/project access, payload limits, correlation ID, RFC3339 UTC and safe error envelope. Endpoints below are **proposals**, not implemented routes.

## 2. Management endpoints
| Method/path | Scope | Purpose |
|---|---|---|
| `GET /api/v1/me` | session | Principal, effective project permissions |
| `GET /api/v1/projects` | `projects:read` | Authorized project list |
| `POST /api/v1/projects` | `projects:manage` | Register project, unique immutable ID |
| `GET /api/v1/projects/:id/services` | `projects:read` | Registered services/environments |
| `POST /api/v1/credentials` | `tokens:manage` | Issue scoped expiring opaque credential (secret returned once) |
| `GET /api/v1/credentials` | `tokens:manage` | Nonsecret metadata only |
| `POST /api/v1/credentials/:id/revoke` | `tokens:manage` | Invalidate immediately |
| `GET /api/v1/audit-events` | authorized admin | Security history; audit access itself |

## 3. Log Explorer endpoints
| Method/path | Scope | Purpose |
|---|---|---|
| `POST /api/v1/logs/search` | `logs:read` | Safe structured query with page/cursor |
| `GET /api/v1/logs/fields` | `logs:read` | Allowed approved field names/types |
| `POST /api/v1/logs/histogram` | `logs:read` | Time buckets grouped by UTC |
| `GET /api/v1/logs/:eventId` | `logs:read` | One sanitized event, supplied project |
| `POST /api/v1/logs/export` | `logs:export` | Bounded async export request |
| `GET /api/v1/saved-searches` | `logs:read` | Saved query definitions |
| `POST /api/v1/saved-searches` | `logs:read` | Create owned query with permission checks |
| `GET /api/v1/performance/api` | `logs:read` | API latency aggregates |
| `GET /api/v1/performance/database` | `logs:read` | Slow fingerprint and durations |

## 4. Search request example
```json
{
  "projectId": "skyra-erp",
  "environments": ["production"],
  "services": ["skyra-erp-api"],
  "time": {"from": "2026-10-21T10:00:00Z", "to": "2026-10-21T11:00:00Z"},
  "filter": {"all": [
    {"field": "log.level", "op": "eq", "value": "error"},
    {"field": "event.action", "op": "eq", "value": "http.request.completed"}
  ]},
  "columns": ["@timestamp", "log.level", "message", "trace.id"],
  "sort": [{"field": "@timestamp", "direction": "desc"}],
  "pageSize": 50
}
```
Project ID is a **requested scope**, not authorization. API must derive effective scope from identity and reject B-project queries before execution. Validate fields/op/type and prohibit unapproved wildcard/regex operations.

## 5. Search result example
```json
{
  "items": [],
  "page": {"nextCursor": null, "returned": 0},
  "summary": {"matched": 0, "elapsedMs": 19, "partial": false},
  "warnings": [],
  "requestId": "req_example"
}
```
Cursor must be opaque, time-bound, signed, and bound to caller/project/query hash. Histogram responses include `interval`, `buckets: [{key, count}]` and partial/timeout indicators. Fields endpoint returns `[{name,type,searchable,aggregatable}]` for authorized mappings only.

## 6. Query language policy
MVP: validated structured filter AST and safe visual builder; advanced text mode may use an **explicitly defined limited grammar** compiled into AST. Future restricted Skyra Query Language support requires parser validation and fully enforced scoping, cost/row limits, routing safeguards and thorough adversarial tests. Never construct unrestricted `FROM <index>` from user input or forward full restricted Skyra Query Language text to central JSONL/Parquet storage and DuckDB query service unreviewed.

## 7. Ingestion API
`POST /ingest/v1/logs` accepts **bounded batched JSON** from authenticated service agents only. Validate service identity ↔ project; maximum uncompressed payload, batch count, schema version, event IDs, timestamps, field lengths. Return accepted/rejected counts and stable error categories, never echo sensitive records; retries use deterministic IDs. Browsers use a distinct safe frontend error endpoint, never trusted service tokens.

## 8. Errors and pagination
```json
{"error":{"code":"PROJECT_ACCESS_DENIED","message":"Access denied","requestId":"req_example"}}
```
HTTP 400 invalid input; 401 unauthenticated; 403 forbidden; 404 not visible; 409 conflict; 413 too large; 422 schema invalid; 429 throttled with `Retry-After`; 503 temporary failure. Standard max time window/page size are **TBD** by measured load, default proposed 24h and 100 records per page.

## 9. Tests and versioning
OpenAPI schema snapshot tests, generated client compilation, query fuzz tests, authz cross-project negative tests, allowed field/type tests, expired cursor tests, ingest retry/dedupe, timeouts, response sanitization and backward compatibility. Breaking APIs require version bump and migration notes.


## Report-first API additions (proposed)
| Method/path | Scope | Notes |
|---|---|---|
| `GET /api/v1/reports` | `reports:read` | Only authorized project reports |
| `POST /api/v1/reports` | `reports:write` | Validate canonical definition; actor/project binding |
| `GET /api/v1/reports/:id` | `reports:read` | Definition plus version/freshness |
| `PATCH /api/v1/reports/:id` | `reports:write` | Optimistic concurrency/version/audit |
| `POST /api/v1/reports/preview` | `reports:read` | Bounded AST; preview measures/grouping and fields |
| `POST /api/v1/reports/:id/run` | `reports:read` | DuckDB execution/cached rollup; elapsed/freshness/partial flags |
| `GET /api/v1/reports/:id/results` | `reports:read` | Permission-bound cached or async result |
| `GET /api/v1/logs/fields` | `logs:read` | Project-scoped schema/catalog field discovery |

Report definition must encode scope, time range, dimensions, measures, aggregations, filters, sort and visualization; text and visual builders both compile to the **same validated AST**. Queries are generated inside the NestJS/DuckDB query boundary against server-resolved manifests; never accept arbitrary SQL, file paths, remote URLs or extension load requests. Response includes archive freshness and cache-hit information. PostgreSQL stores report/identity metadata only.
