# Canonical ECS Log Event Query Field Mapping

**Document Version:** 1.0.0  
**Status:** Approved Architecture Specification  
**Task Reference:** LOGHUB-QUERY-001  
**Source Schema:** `contracts/schemas/v1/log-event.schema.json`

---

## 1. Overview & Allowlist Rules

To prevent arbitrary SQL injection, unbounded memory usage, and exposure of internal fields, the Skyra LogHub Query Service strictly restricts search queries, filter operators, sorting, and aggregations to an **allowlisted canonical schema mapping**.

Client requests referencing field paths not listed in this specification are rejected with `400 Bad Request` (`INVALID_ARGUMENT`).

---

## 2. Canonical Field Mapping Table

| Canonical JSON Path | Query Field Alias | Data Type | Nullable | Filter Operators | Sortable | Aggregable | Default Display |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `@timestamp` | `timestamp` | `TIMESTAMP` (ISO 8601 UTC) | No | `eq`, `gt`, `gte`, `lt`, `lte` | Yes (Primary) | `date_histogram` | Always (Column 1) |
| `event.id` | `event_id` | `VARCHAR(36)` (UUIDv7) | No | `eq`, `in` | Yes (Tie-breaker) | No | Always (Column 2) |
| `event.action` | `action` | `VARCHAR(128)` | Yes | `eq`, `in`, `exists` | Yes | `terms` | In Details |
| `event.kind` | `kind` | `VARCHAR(32)` | Yes | `eq`, `in` | No | `terms` | In Details |
| `log.level` | `level` | `VARCHAR(16)` (enum) | No | `eq`, `in` | Yes | `terms` | Always (Badge) |
| `message` | `message` | `VARCHAR` | No | `contains`, `eq` | No | No | Always (Column 4) |
| `service.name` | `service` | `VARCHAR(64)` | No | `eq`, `in` | Yes | `terms` | Always (Column 3) |
| `service.version` | `service_version` | `VARCHAR(32)` | Yes | `eq`, `in`, `exists` | No | `terms` | In Details |
| `trace.id` | `trace_id` | `VARCHAR(64)` | Yes | `eq`, `in`, `exists` | No | No | Trace Link |
| `span.id` | `span_id` | `VARCHAR(32)` | Yes | `eq`, `exists` | No | No | Trace Link |
| `error.type` | `error_type` | `VARCHAR(128)` | Yes | `eq`, `in`, `exists` | Yes | `terms` | In Error Panel |
| `error.message` | `error_message` | `VARCHAR` | Yes | `contains`, `exists` | No | No | In Error Panel |
| `error.stack_trace` | `stack_trace` | `VARCHAR` | Yes | `exists` | No | No | In Error Modal |
| `http.request.method` | `http_method` | `VARCHAR(16)` | Yes | `eq`, `in`, `exists` | No | `terms` | In HTTP Details |
| `http.response.status_code` | `status_code` | `INTEGER` | Yes | `eq`, `in`, `gt`, `gte`, `lt`, `lte`, `exists` | Yes | `terms` | In HTTP Details |
| `http.url` | `url` | `VARCHAR` | Yes | `contains`, `eq`, `exists` | No | No | In HTTP Details |
| `user.id` | `user_id` | `VARCHAR(64)` | Yes | `eq`, `in`, `exists` | No | `terms` | Masked / Details |
| `skyra.tenant_id` | `tenant_id` | `VARCHAR(64)` | No | `eq` (Server Enforced) | No | `terms` (Admin) | Hidden (Scoping) |
| `skyra.project_id` | `project_id` | `VARCHAR(64)` | No | `eq`, `in` | Yes | `terms` | Always (Badge) |
| `skyra.environment` | `environment` | `VARCHAR(32)` | No | `eq`, `in` | Yes | `terms` | Always (Badge) |

---

## 3. Operator Semantics by Type

### 3.1 String Fields (`VARCHAR`)
- `eq`: Exact string equality (case-sensitive).
- `in`: Membership in a provided string array (`field = ANY($1::VARCHAR[])`). Maximum array length: 100 items.
- `contains`: Case-insensitive substring search (`contains(lower(field), lower($1))`). Maximum query string length: 256 characters.
- `exists`: Boolean check for presence and non-null status (`field IS NOT NULL`).

### 3.2 Numerical Fields (`INTEGER`, `FLOAT`)
- `eq`, `gt`, `gte`, `lt`, `lte`: Standard mathematical inequalities.
- `in`: Membership in a numerical array (`field = ANY($1::BIGINT[])`).
- `exists`: Field presence check (`field IS NOT NULL`).

### 3.3 Timestamp Fields (`TIMESTAMP`)
- `gt`, `gte`, `lt`, `lte`: ISO 8601 UTC chronological comparisons.
- Interval standard: `startInclusive <= @timestamp < endExclusive`.

---

## 4. Sensitive Field Masking & RBAC Rules

1. **`user.id` / `user.email`:** Displayed as plain text only for principals with `analyst` or `admin` roles. For `viewer` roles, user identifiers are hashed or masked (`usr_***4a8b`).
2. **`error.stack_trace`:** Stack traces can contain sensitive environment paths or internal IP addresses. Restricted to users with explicit project permissions.
3. **`skyra.tenant_id`:** Immutable tenant identity; strictly filtered by server token validation and hidden from general UI presentation as a redundant attribute.
