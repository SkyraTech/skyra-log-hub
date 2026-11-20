# Skyra LogHub — APIs, Contracts & Protocol Specifications
**Document ID:** `DOC-04-API`  
**Milestone:** Q-04 Canonical Documentation Architecture  
**Status:** Authoritative / Source-Verified  
**Repository:** `skyra-log-hub`  
**Last Verified Baseline:** OpenAPI 3.1 / JSON Schema 2020-12 / Fastify 5

---

## 1. API Architecture & Protocol Foundations

All network interfaces in Skyra LogHub follow strict contract-first principles:
1. **URI Versioning:** All endpoints are strictly prefixed with `/api/v1/`. Breaking contract modifications mandate a major version increment.
2. **Contract Ownership:** Authoritative schemas reside in `packages/shared-contracts` and exported OpenAPI 3.1 YAML/JSON files. Schemas are synchronized across services via `scripts/sync-schemas.mjs`.
3. **Payload Encodings:**
   - Client-to-BFF & Ingestion: `application/json` (UTF-8).
   - Log Streaming Exports: `text/csv` (RFC 4180) and `application/x-ndjson`.
4. **Uniform Error Responses:** Every error condition (4xx and 5xx) produces an RFC 7807 Problem Details object with machine-readable error codes.
5. **Cursor Security:** List endpoints utilize opaque, HMAC-SHA256 signed pagination cursors. Clients cannot forge offsets, bypass tenant bounds, or enumerate IDs.

---

## 2. Authentication & Authorization by API Boundary

| Boundary | Target Path | Auth Mechanism | Authorization Model | Rate Limit |
| :--- | :--- | :--- | :--- | :--- |
| **Ingestion API** | `POST /api/v1/logs/batch` | `Authorization: Bearer <sk_live_...>` | Validated against project token hash in cache/DB | Enforced per-project token bucket (e.g. 5,000 req/s) |
| **Console Web $\leftrightarrow$ BFF** | `/api/v1/*` | `__Host-session` Secure Cookie + `X-XSRF-TOKEN` | RBAC Role & Capability Claims on active session | 120 req/min per IP |
| **BFF $\leftrightarrow$ Admin Service** | Internal private network | Mutual TLS / Internal JWT assertion | Tenant Scoped Internal System Client | Unlimited / Internal Service Mesh |
| **BFF $\leftrightarrow$ Query Service** | Internal private network | Internal JWT assertion | Injected tenant & project claims | 30 concurrent queries per tenant |

---

## 3. Authoritative Service API Endpoints

### 3.1 Ingestion Gateway API (`apps/ingestion-gateway`)
- **Contract Location:** `contracts/ingestion/v1/openapi.yaml`
- **Batch Log Ingestion:**
  - `POST /api/v1/logs/batch`
  - **Headers:** `Authorization: Bearer sk_live_...`, `Content-Type: application/json`
  - **Request Body:**
    ```json
    {
      "protocol_version": "1.0",
      "batch_id": "b8a5e012-3456-4789-abcd-0123456789ab",
      "events": [
        {
          "event_id": "c9b6f123-4567-489a-bcde-123456789abc",
          "timestamp": "2026-11-20T15:00:00.123456Z",
          "severity": "error",
          "service": "order-api",
          "environment": "production",
          "message": "Payment gateway connection timeout",
          "attributes": {
            "order_id": "ord_99812",
            "retry_count": 3
          },
          "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
          "span_id": "00f067aa0ba902b7"
        }
      ]
    }
    ```
  - **Response (`201 Created`):**
    ```json
    {
      "accepted": 1,
      "batch_id": "b8a5e012-3456-4789-abcd-0123456789ab",
      "receipt": "rcpt_v1_00000001_1763650800_4a9b2c",
      "committed_at": "2026-11-20T15:00:00.145892Z"
    }
    ```

### 3.2 Console BFF API (`apps/console-bff`)
- **Contract Location:** `apps/console-bff/openapi/console-bff.openapi.json`
- **Authentication Routes:**
  - `GET /api/v1/auth/login`: Initiates OIDC authorization flow.
  - `GET /api/v1/auth/callback`: Exchanges authorization code for session cookie.
  - `GET /api/v1/auth/session`: Returns current authenticated identity, active tenant, and capabilities.
  - `POST /api/v1/auth/switch-tenant`: Changes active tenant in encrypted session.
  - `POST /api/v1/auth/switch-project`: Changes active project context.
  - `POST /api/v1/auth/logout`: Revokes session in PostgreSQL and clears cookies.
- **Organization & Team Management:**
  - `GET /api/v1/organization`: Retrieves organization details with `ETag`.
  - `PATCH /api/v1/organization`: Updates display name with `If-Match` header.
  - `GET /api/v1/members`: Lists organization members with opaque cursor pagination.
  - `POST /api/v1/members/invite`: Invites user with specified role (`OWNER`, `ADMIN`, `MEMBER`, `VIEWER`).
  - `PATCH /api/v1/members/:id/role`: Modifies member role with confirmation and concurrency version.
  - `DELETE /api/v1/members/:id`: Removes member from tenant.
- **Projects & Credentials:**
  - `GET /api/v1/projects`: Lists projects within active tenant.
  - `POST /api/v1/projects`: Provisions new project with kebab-case identifier.
  - `PATCH /api/v1/projects/:id`: Updates project metadata or status (`ACTIVE`, `ARCHIVED`).
  - `GET /api/v1/credentials`: Lists active and revoked credentials for active project.
  - `POST /api/v1/credentials`: Generates new API key; returns one-time secret.
  - `DELETE /api/v1/credentials/:id`: Immediately revokes credential.
- **Query Proxy & Analytics:**
  - `POST /api/v1/query/search`: Executes search query against Parquet archive.
  - `GET /api/v1/query/facets`: Retrieves dynamic aggregate counts for services, levels, hosts.
  - `GET /api/v1/query/events/:id`: Fetches single log event with full JSON payload.
  - `POST /api/v1/query/export`: Streams filtered logs as CSV or JSON format.
  - `GET /api/v1/analytics/overview`: High-level metrics (volume, error rate, active projects).
  - `GET /api/v1/analytics/timeseries`: Histogram bucket intervals for charting.
  - `GET /api/v1/analytics/severities`: Severity percentage breakdown.
- **Quotas & Audit:**
  - `GET /api/v1/quotas`: Retrieves project quota limits and usage meters.
  - `PATCH /api/v1/quotas`: Updates rate limits or daily volume allocations.
  - `GET /api/v1/audit`: Lists audit events with actor, target, and change diff.
  - `GET /api/v1/audit/export`: Exports compliance audit logs as CSV.

---

## 4. Canonical Error Codes & RFC 7807 Matrix

| HTTP Status | Error Code (`code`) | Trigger Condition | Retry Policy |
| :--- | :--- | :--- | :--- |
| **400 Bad Request** | `SCHEMA_VALIDATION_FAILED` | Batch payload violates Canonical Schema v1 | Do not retry; fix payload format |
| **401 Unauthorized** | `INVALID_CREDENTIALS` | Bearer token unknown or revoked | Do not retry; check API key |
| **401 Unauthorized** | `SESSION_EXPIRED` | Cookie session expired or revoked | Redirect to `/api/v1/auth/login` |
| **403 Forbidden** | `PERMISSION_DENIED` | Identity lacks required RBAC capability | Do not retry; request elevated role |
| **404 Not Found** | `RESOURCE_NOT_FOUND` | Specified project, member, or credential does not exist | Verify resource ID |
| **409 Conflict** | `CONCURRENCY_CONFLICT` | Stale `If-Match` ETag or duplicate project ID | Refresh resource state and retry |
| **409 Conflict** | `IDEMPOTENCY_CONFLICT` | Replayed batch ID with mismatched payload | Verify batch ID idempotency |
| **429 Too Many Requests**| `QUOTA_EXCEEDED` | Ingestion rate or daily MB allocation exceeded | Exponential backoff (retry-after) |
| **503 Unavailable** | `STORAGE_NOT_READY` | WAL disk subsystem full or unavailable | Exponential backoff (retryable) |

---

## 5. Contract Synchronization & Verification

Contract parity across all monorepo apps is automatically enforced:
```bash
# Check contract parity without modification
node scripts/sync-schemas.mjs --check

# Synchronize contracts across apps/packages
node scripts/sync-schemas.mjs
```
The script validates that `packages/shared-contracts/schemas` strictly match the OpenAPI schemas embedded in `apps/admin-service`, `apps/console-bff`, and `apps/ingestion-gateway`.
