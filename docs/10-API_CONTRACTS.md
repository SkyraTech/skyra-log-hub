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

## 7. Ingestion API (Canonical v1 Contract: contracts/ingestion/v1/openapi.yaml)
`POST /ingest/v1/logs` accepts **atomic, bounded batched JSON** (max 500 events, max 5 MiB uncompressed) from authenticated backend services, shippers, or same-origin application proxies via `Authorization: Bearer <token>`.

### Semantics & Guarantees (ADR-012, ADR-013, ADR-015, ADR-016)
1. **Atomic All-or-Nothing Acceptance:** If any event violates Canonical Schema v1 or project authorization, the whole batch is rejected (`422 Unprocessable Content` or `403 Forbidden`). HTTP 207 Multi-Status is strictly prohibited in MVP.
2. **Durable Journal Acceptance:** `200 OK` (`status: "durably_accepted"`) is emitted only after synchronous fsync to the write-ahead journal (WAL) on non-volatile physical storage.
3. **Idempotency & Replay:** Clients provide RFC 4122 UUIDv4 `batch_id`. Identical retries return `200 OK` with `duplicate: true` and the original durable receipt. Modifying content with an existing batch ID returns `409 Conflict` (`IDEMPOTENCY_CONFLICT`).
4. **Legacy Browser SDK Compatibility:** Batches omitting `protocol_version` or `batch_id` are accepted; the gateway derives a deterministic synthetic batch ID.
5. **Durable Receipt Format:**
```json
{
  "status": "durably_accepted",
  "batch_id": "550e8400-e29b-41d4-a716-446655440000",
  "accepted_count": 2,
  "duplicate": false,
  "receipt": {
    "receipt_id": "rcpt_7f9a8b1c2d3e4f50",
    "journal_segment": "journal-2026-10-24-0001.wal",
    "journal_offset": 1048576,
    "committed_at": "2026-10-24T00:00:01.123Z",
    "content_digest": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  }
}
```

## 8. Errors and Standard Codes
```json
{
  "error": {
    "code": "PROJECT_ACCESS_DENIED",
    "message": "Credential is not authorized to submit logs for project 'skyra-forbidden'.",
    "requestId": "req_example_001",
    "retryable": false
  }
}
```
HTTP Status Mapping:
- **400 Bad Request:** `INVALID_JSON`, `BATCH_EMPTY` (`retryable: false`)
- **401 Unauthorized:** `UNAUTHORIZED` (`retryable: false`)
- **403 Forbidden:** `PROJECT_ACCESS_DENIED`, `ENVIRONMENT_MISMATCH` (`retryable: false`)
- **409 Conflict:** `IDEMPOTENCY_CONFLICT` (`retryable: false`)
- **413 Payload Too Large:** `BATCH_OVERSIZED`, `PAYLOAD_TOO_LARGE` (`retryable: false`)
- **422 Unprocessable Content:** `SCHEMA_VALIDATION_FAILED`, `UNSUPPORTED_PROTOCOL_VERSION` (`retryable: false`)
- **429 Too Many Requests:** `RATE_LIMIT_EXCEEDED` (`retryable: true`, with `Retry-After` header)
- **503 Service Unavailable:** `STORAGE_NOT_READY`, `JOURNAL_UNAVAILABLE` (`retryable: true`)

## 9. Tests and Contract Governance
All contracts are machine-verified offline via `tests/contracts/ingestion-contracts.test.ts` (OpenAPI 3.1.0 compliance, Ajv Draft 2020 schema validation, atomic response assertions, and error-code exhaustiveness). Breaking contract changes require formal ADR, major version bump, and backward compatibility verification.


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
