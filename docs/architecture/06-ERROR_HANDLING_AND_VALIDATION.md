# Error Handling & Input Validation Standards

**Document Version:** 1.0.0  
**Status:** Approved Enterprise Architecture Baseline  
**Task Reference:** LOGHUB-ARCH-001  
**Scope:** HTTP Error Responses, RFC 7807 Problem Details, and Runtime Validation

---

## 1. Unified Error Architecture

Skyra LogHub enforces a clear separation between **internal diagnostic errors** and **external client-facing error responses**:

```text
Internal Exception (Domain / Infrastructure / Framework)
                      │
                      ▼
        [ Central Exception Filter ]
                      │
        ┌─────────────┴─────────────┐
        ▼                           ▼
[ Structured Skyra Logger ]  [ Sanitized Client Response ]
- Full error stack           - Safe HTTP status
- Correlation ID             - Stable error code
- Hostname & internal paths  - RFC 7807 Problem Details
- Database error codes       - Zero credentials / paths
```

### Information Leakage Prevention Invariant
Under no circumstances may client-facing HTTP responses expose:
1. Database connection strings, SQL queries, or internal table names.
2. Local filesystem paths (`/var/loghub/...` or `C:\Users\...`).
3. Bearer tokens, secrets, or API keys.
4. Internal stack traces or raw Node.js runtime errors.

---

## 2. Standardized Error Formats

### 2.1 Query API Error Format: RFC 7807 Problem Details (`error.schema.json`)
All 4xx and 5xx responses from `/query/v1/` conform strictly to RFC 7807:

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

#### Field Specifications:
- `type`: URI identifying the error category.
- `title`: Short, human-readable summary of the problem type.
- `status`: Standard HTTP status code matching the response header.
- `detail`: Human-readable explanation specific to this occurrence.
- `instance`: URI reference identifying the specific occurrence of the problem.
- `code`: Machine-readable, uppercase underscore-delimited stable error code.
- `invalid_params`: Optional array of `{ name, reason }` objects for validation failures.

### 2.2 Ingestion API Error Format: Phase 2 Contract Compatibility (`error-response.schema.json`)
The Ingestion Gateway (`/ingest/v1/`) preserves its accepted Phase 2 error structure:

```json
{
  "error": {
    "code": "IDEMPOTENCY_CONFLICT",
    "message": "Batch ID was previously accepted with a different payload digest",
    "retryable": false,
    "details": {
      "batch_id": "0192e4a8-6b8c-7f2e-a5e1-8f9d0c2e3a4b",
      "expected_digest": "3fa85f64...",
      "received_digest": "4c92b810..."
    }
  }
}
```

---

## 3. Standard Stable Error Codes

| Error Code | HTTP Status | Meaning | Retryable |
| :--- | :--- | :--- | :--- |
| **`UNAUTHORIZED`** | 401 | Missing, malformed, or expired authentication token. | No |
| **`FORBIDDEN`** | 403 | Tenant mismatch or project access denied. | No |
| **`INVALID_ARGUMENT`** | 400 | Request body or parameters failed schema validation. | No |
| **`INVALID_CURSOR`** | 400 | Keyset cursor is tampered, expired, or filter-mismatched. | No |
| **`TIME_RANGE_TOO_LARGE`** | 400 | Requested search interval exceeds maximum allowed limit. | No |
| **`IDEMPOTENCY_CONFLICT`**| 409 | Reused batch ID with altered content digest. | No |
| **`RATE_LIMIT_EXCEEDED`** | 429 | Sliding-window or tenant concurrency quota exceeded. | Yes (Respect Retry-After) |
| **`RESOURCE_EXHAUSTED`**  | 429 | Query memory budget or system queue depth exceeded. | Yes |
| **`QUERY_TIMEOUT`**       | 504 | Query canceled after exceeding maximum runtime ceiling. | Yes |
| **`STORAGE_NOT_READY`**   | 503 | WAL or archive disk is unmounted or in crash recovery. | Yes |
| **`INTERNAL_ERROR`**      | 500 | Unexpected system failure; diagnostic recorded in logs. | No |

---

## 4. Runtime Input Validation Architecture

1. **Fastify JSON Parser:** Fastify custom parser uses `@skyra/logger-core` `parseStrictJson` to reject malformed JSON and duplicate keys at any depth with `400 Bad Request`.
2. **Ajv Draft 2020-12 Validation Pipes:** Validates request DTOs against authoritative JSON Schemas before invoking controller logic.
3. **Fail-Fast Pipe Behavior:** If any validation error occurs, execution terminates immediately with structured `invalid_params` details.
4. **Boundary Type Guards:** TypeScript interfaces provide compile-time safety, but runtime Ajv validation guarantees that untrusted network inputs conform to types before business logic executes.
