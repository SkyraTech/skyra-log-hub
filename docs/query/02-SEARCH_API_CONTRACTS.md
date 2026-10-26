# Search API Contracts Specification

**Document Version:** 1.0.0  
**Status:** Approved Architecture Specification  
**Task Reference:** LOGHUB-QUERY-001  
**Applies To:** Query Service Foundation (`apps/query-service`)

---

## 1. Overview & Protocol Principles

The Skyra LogHub Query Service exposes an HTTP/REST API rooted at `/query/v1/`. The API provides read-only search, analytical aggregation, and facet discovery across centrally archived canonical log events.

### Protocol Invariants

1. **Transport Security:** All endpoints require TLS 1.3 in production (`https://`).
2. **Payload Encodings:**
   - Content-Type: `application/json; charset=utf-8`
   - Time representations: Strict ISO 8601 UTC with trailing `Z` (e.g. `2026-10-25T14:30:00.000Z`).
   - Numerical representations: Large counts represented as standard numbers or integer strings where precision exceeds 53 bits (standard 64-bit counts fit safely in JSON numbers up to $9 \times 10^{15}$).
3. **Idempotency & Safety:** All query endpoints are read-only (`GET` or `POST` search/aggregation). Even though complex searches use `POST` to accommodate large structured filter bodies without URI length truncation, they are non-mutating and safe.
4. **Fail-Closed Authorization:** Every request must include an authenticated identity (`Authorization: Bearer <query-token>`). The server evaluates tenant boundaries, project allowlists, and environment restrictions *before* checking request filters.

---

## 2. API Endpoints Catalog

| Method | Path | Purpose | Authentication |
| :--- | :--- | :--- | :--- |
| `POST` | `/query/v1/logs/search` | Full-text, structured, and range-based log search with cursor pagination | Bearer Query Token |
| `GET` | `/query/v1/logs/{eventId}` | Fetch single canonical log event by ID | Bearer Query Token |
| `POST` | `/query/v1/logs/aggregate` | Multi-bucket, time-series, and metric aggregations | Bearer Query Token |
| `POST` | `/query/v1/logs/facets` | Discover unique values and distribution for filter fields | Bearer Query Token |
| `GET` | `/health/live` | Container liveness check | Anonymous / Localhost |
| `GET` | `/health/ready` | Service readiness check (PostgreSQL + archive storage mount) | Anonymous / Localhost |

---

## 3. Detailed Endpoint Contracts

### 3.1 Search Logs (`POST /query/v1/logs/search`)

Searches archived canonical log events matching a specified time range, scoping criteria, text query, and structured field filters.

#### Request Headers
- `Authorization: Bearer <query_token>` (Required)
- `Content-Type: application/json` (Required)
- `X-Correlation-ID: <uuid>` (Optional; generated if absent)

#### Request Body (`search-request.schema.json`)

```json
{
  "time_range": {
    "start": "2026-10-25T00:00:00.000Z",
    "end": "2026-10-25T12:00:00.000Z"
  },
  "projects": ["proj_backend_core"],
  "environments": ["production"],
  "services": ["auth-service", "billing-service"],
  "levels": ["error", "fatal"],
  "query": "connection timeout database",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "event_id": "0192e4a8-6b8c-7f2e-a5e1-8f9d0c2e3a4b",
  "filters": [
    {
      "field": "http.response.status_code",
      "operator": "gte",
      "value": 500
    },
    {
      "field": "service.version",
      "operator": "eq",
      "value": "2.4.1"
    }
  ],
  "sort": {
    "order": "desc"
  },
  "page_size": 50,
  "cursor": null
}
```

#### Response Body (`search-response.schema.json`)

```json
{
  "meta": {
    "scanned_segments": 4,
    "scanned_bytes": 1420850,
    "scanned_events": 12500,
    "matched_events": 42,
    "execution_time_ms": 38,
    "archive_watermark": "2026-10-25T11:58:30.000Z"
  },
  "items": [
    {
      "@timestamp": "2026-10-25T11:45:12.104Z",
      "event": {
        "id": "0192e4a8-6b8c-7f2e-a5e1-8f9d0c2e3a4b",
        "action": "database.connect",
        "kind": "event"
      },
      "log": {
        "level": "error"
      },
      "message": "connection timeout database: pool exhausted",
      "service": {
        "name": "auth-service",
        "version": "2.4.1"
      },
      "trace": {
        "id": "4bf92f3577b34da6a3ce929d0e0e4736"
      },
      "skyra": {
        "tenant_id": "tenant_skyra_prod",
        "project_id": "proj_backend_core",
        "environment": "production"
      }
    }
  ],
  "page": {
    "size": 50,
    "has_more": false,
    "next_cursor": null
  }
}
```

---

### 3.2 Get Event by ID (`GET /query/v1/logs/{eventId}`)

Retrieves a single canonical log record by its UUIDv7 `event.id`.

#### Security Check
Even if the client knows `eventId`, the server scopes the search to the caller's authorized tenant and projects. If the event exists in another tenant, the endpoint returns `404 Not Found` (preventing tenant enumeration).

#### URL Parameters
- `eventId`: UUID format (e.g. `0192e4a8-6b8c-7f2e-a5e1-8f9d0c2e3a4b`).

#### Query Parameters
- `timestamp_hint`: ISO 8601 UTC timestamp (Optional). If provided, prunes discovery to the partition matching that date, accelerating resolution from milliseconds to microseconds.

#### Response Body
Returns the exact unmutated canonical JSON object as stored in the archive segment.

---

### 3.3 Aggregate Logs (`POST /query/v1/logs/aggregate`)

Executes high-performance grouped aggregations over log events matching scoping criteria.

#### Request Body (`aggregate-request.schema.json`)

```json
{
  "time_range": {
    "start": "2026-10-25T00:00:00.000Z",
    "end": "2026-10-25T23:59:59.999Z"
  },
  "projects": ["proj_backend_core"],
  "environments": ["production"],
  "aggregations": [
    {
      "name": "errors_over_time",
      "type": "date_histogram",
      "field": "@timestamp",
      "interval": "1h"
    },
    {
      "name": "top_failing_services",
      "type": "terms",
      "field": "service.name",
      "size": 10
    },
    {
      "name": "status_distribution",
      "type": "terms",
      "field": "log.level"
    }
  ]
}
```

#### Response Body (`aggregate-response.schema.json`)

```json
{
  "meta": {
    "scanned_segments": 12,
    "scanned_bytes": 8420100,
    "scanned_events": 85000,
    "execution_time_ms": 64,
    "archive_watermark": "2026-10-25T23:55:00.000Z"
  },
  "aggregations": {
    "errors_over_time": {
      "type": "date_histogram",
      "interval": "1h",
      "buckets": [
        { "key": "2026-10-25T00:00:00.000Z", "count": 12 },
        { "key": "2026-10-25T01:00:00.000Z", "count": 4 }
      ]
    },
    "top_failing_services": {
      "type": "terms",
      "field": "service.name",
      "buckets": [
        { "key": "auth-service", "count": 890 },
        { "key": "billing-service", "count": 210 }
      ]
    },
    "status_distribution": {
      "type": "terms",
      "field": "log.level",
      "buckets": [
        { "key": "info", "count": 78000 },
        { "key": "warn", "count": 5900 },
        { "key": "error", "count": 1100 }
      ]
    }
  }
}
```

---

### 3.4 Discover Facets (`POST /query/v1/logs/facets`)

Discovers available filter terms and approximate counts for dynamic UI dropdowns.

#### Request Body (`facets-request.schema.json`)

```json
{
  "time_range": {
    "start": "2026-10-25T00:00:00.000Z",
    "end": "2026-10-25T12:00:00.000Z"
  },
  "projects": ["proj_backend_core"],
  "fields": ["service.name", "log.level", "environment"],
  "max_values": 25
}
```

#### Response Body (`facets-response.schema.json`)

```json
{
  "meta": {
    "scanned_segments": 4,
    "execution_time_ms": 19
  },
  "facets": {
    "service.name": [
      { "value": "auth-service", "count": 5400 },
      { "value": "billing-service", "count": 3200 }
    ],
    "log.level": [
      { "value": "info", "count": 7800 },
      { "value": "error", "count": 800 }
    ]
  }
}
```

---

## 4. Error Responses (`error.schema.json`)

All HTTP 4xx and 5xx responses conform to RFC 7807 problem details:

```json
{
  "type": "https://api.skyra.dev/errors/QUERY_TIMEOUT",
  "title": "Query Execution Timeout",
  "status": 504,
  "detail": "The query exceeded the maximum allowed wall-clock duration of 30000ms.",
  "instance": "/query/v1/logs/search?req_id=b39d10e7-817a-4ecb-99f1-6780c8831a29",
  "code": "QUERY_TIMEOUT",
  "invalid_params": []
}
```

Standard Error Codes:
- `UNAUTHORIZED` (401): Missing or expired query bearer token.
- `FORBIDDEN` (403): Tenant or project access denied.
- `INVALID_ARGUMENT` (400): Schema validation failure or unknown filter field.
- `INVALID_CURSOR` (400): Tampered, expired, or filter-mismatched pagination cursor.
- `TIME_RANGE_TOO_LARGE` (400): Requested interval exceeds configured maximum (e.g. 30 days).
- `RESOURCE_EXHAUSTED` (429): Concurrent query queue saturated or memory budget exceeded.
- `QUERY_TIMEOUT` (504): Query cancelled after exceeding deadline.
