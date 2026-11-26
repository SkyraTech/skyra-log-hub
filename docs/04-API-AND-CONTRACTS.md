# Skyra LogHub — APIs, Contracts & Protocol Specifications
**Document ID:** `DOC-04-API`  
**Milestone:** Q-04 Canonical Documentation Architecture  
**Status:** Authoritative / Source-Verified  
**Repository:** `skyra-log-hub`  
**Last Verified Baseline:** OpenAPI 3.1 / JSON Schema 2020-12 / Fastify 5

---

## 1. API Architecture & Protocol Foundations

All network interfaces in Skyra LogHub follow strict contract-first principles:
1. **URI Versioning:** All endpoints are explicitly versioned. Public Ingestion endpoints use the `/ingest/v1/` prefix, internal microservices use `/admin/v1/` and `/query/v1/`, while Console Web interactions with the backend-for-frontend are rooted at `/bff/`.
2. **Contract Ownership:** Authoritative schemas reside in `packages/shared-contracts` and exported OpenAPI 3.1 YAML/JSON files. Schemas are synchronized across services via `scripts/sync-schemas.mjs`.
3. **Payload Encodings & Protocols:**
   - Client-to-BFF & Ingestion: `application/json` (UTF-8).
   - Log Streaming Exports: `text/csv` (RFC 4180) and `application/x-ndjson`.
   - Protocol Specifications: Network transport uses HTTP/1.1 and HTTP/2 REST. Binary protocols (gRPC and Protocol Buffers) are planned for high-throughput pipeline iterations and are not exposed in the current v1 release.
4. **Uniform Error Responses:** Every error condition (4xx and 5xx) produces an RFC 7807 Problem Details object with machine-readable error codes.
5. **Cursor Security:** List endpoints utilize opaque, HMAC-SHA256 signed pagination cursors. Clients cannot forge offsets, bypass tenant bounds, or enumerate IDs.

---

## 2. Authentication & Authorization by API Boundary

| Boundary | Target Path | Auth Mechanism | Authorization Model | Rate Limit |
| :--- | :--- | :--- | :--- | :--- |
| **Ingestion API** | `POST /ingest/v1/logs` | `Authorization: Bearer <skyra_live_<64_hex>>` | Validated against project token hash in cache/DB | Enforced per-project token bucket (e.g. 5,000 req/s) |
| **Console Web $\leftrightarrow$ BFF** | `/bff/*` | `__Host-session` Secure Cookie + `X-XSRF-TOKEN` | RBAC Role & Capability Claims on active session | 120 req/min per IP |
| **BFF $\leftrightarrow$ Admin Service** | Internal private network (`/admin/v1/*`) | Mutual TLS / Internal JWT assertion | Tenant Scoped Internal System Client | Unlimited / Internal Service Mesh |
| **BFF $\leftrightarrow$ Query Service** | Internal private network (`/query/v1/*`) | Internal JWT assertion | Injected tenant & project claims | 30 concurrent queries per tenant |

---

## 3. Authoritative Service API Endpoints

### 3.1 Ingestion Gateway API (`apps/ingestion-gateway`)
- **Contract Location:** `contracts/ingestion/v1/openapi.yaml`
- **Batch Log Ingestion:**
  - `POST /ingest/v1/logs`
  - **Headers:** `Authorization: Bearer skyra_live_<64_hex>`, `Content-Type: application/json`
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
  - **Response (`200 OK`):**
    ```json
    {
      "status": "durably_accepted",
      "batch_id": "b8a5e012-3456-4789-abcd-0123456789ab",
      "accepted_count": 1,
      "duplicate": false,
      "receipt": {
        "receipt_id": "rcpt_7f9a8b1c2d3e4f50",
        "journal_segment": "journal-2026-11-20-0001.wal",
        "journal_offset": 1048576,
        "committed_at": "2026-11-20T15:00:00.145892Z",
        "content_digest": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
      }
    }
    ```

### 3.2 Console BFF API (`apps/console-bff`)
- **Routing Scope:** Public frontend gateway routes mounted under `/bff/`.
- **Authentication & Workspace Routes:**
  - `GET /bff/auth/readiness`: Verifies session store health.
  - `GET /bff/auth/login`: Initiates OIDC authorization flow.
  - `GET /bff/auth/callback`: Exchanges authorization code for session cookie.
  - `POST /bff/auth/logout`: Revokes session in PostgreSQL and clears cookies.
  - `POST /bff/auth/rotate`: Rotates session token and CSRF token.
  - `GET /bff/session`: Returns current authenticated identity, active tenant/project, available contexts, and CSRF token.
  - `GET /bff/workspaces`: Lists available workspaces and tenant memberships.
  - `POST /bff/workspaces/select`: Changes active workspace context in session.
- **Organization & Team Management:**
  - `GET /bff/organization`: Retrieves organization details with `ETag`.
  - `PATCH /bff/organization`: Updates display name with `If-Match` header.
  - `GET /bff/organization/members`: Lists organization members with opaque cursor pagination.
  - `POST /bff/organization/members/invite`: Invites user with specified role (`OWNER`, `ADMIN`, `MEMBER`, `VIEWER`).
  - `PATCH /bff/organization/members/:userId/role`: Modifies member role with confirmation and concurrency version.
  - `DELETE /bff/organization/members/:userId`: Removes member from tenant.
- **Projects & Ingestion Credentials:**
  - `GET /bff/projects`: Lists projects within active tenant.
  - `POST /bff/projects`: Provisions new project with kebab-case identifier.
  - `PATCH /bff/projects/:id`: Updates project metadata or status (`ACTIVE`, `ARCHIVED`).
  - `GET /bff/projects/:projectId/credentials`: Lists active and revoked credentials for active project.
  - `POST /bff/projects/:projectId/credentials`: Generates new API key; returns one-time secret (`skyra_live_<64_hex>`).
  - `POST /bff/projects/:projectId/credentials/:id/rotate`: Rotates existing credential.
  - `DELETE /bff/projects/:projectId/credentials/:id`: Immediately revokes credential.
- **Saved Searches & Preferences:**
  - `GET /bff/projects/:projectId/saved-searches`: Lists saved searches for project.
  - `POST /bff/projects/:projectId/saved-searches`: Saves query and filter parameters.
  - `DELETE /bff/projects/:projectId/saved-searches/:id`: Deletes saved search.
  - `GET /bff/projects/:projectId/dashboard-preferences`: Retrieves dashboard configuration.
  - `PUT /bff/projects/:projectId/dashboard-preferences`: Updates dashboard configuration.
- **Query Proxy & Analytics:**
  - `POST /bff/query/search`: Executes search query against Parquet archive via Query Service.
  - `GET /bff/query/facets`: Retrieves dynamic aggregate counts for services, levels, hosts.
  - `GET /bff/query/events/:id`: Fetches single log event with full JSON payload.
  - `POST /bff/query/export`: Streams filtered logs in CSV or JSON format.
  - `POST /bff/query/dashboard`: Computes aggregated metrics, time-series distributions, and service trends.
- **Quotas & Audit:**
  - `GET /bff/projects/:projectId/quota`: Retrieves project quota limits and usage meters.
  - `PATCH /bff/projects/:projectId/quota`: Updates rate limits or daily volume allocations.
  - `GET /bff/projects/:projectId/usage`: Retrieves project usage metrics for a given period.
  - `GET /bff/projects/:projectId/usage/history`: Retrieves chronological quota usage history.
  - `GET /bff/projects/:projectId/retention`: Reads current archive retention policy and legal hold status.
  - `PATCH /bff/projects/:projectId/retention`: Modifies retention duration (1–365 days), Parquet purge preference, and legal hold state.
  - `GET /bff/organization/audit`: Lists audit events with actor, target, and change diff.
  - `GET /bff/organization/audit/export`: Exports compliance audit logs as CSV.
  - `GET /bff/organization/audit/access`: Verifies audit permissions and available action filters.

### 3.3 Internal Backend Service APIs
- **Admin Service (`apps/admin-service`)**:
  - Internal contract: `contracts/admin/v1/openapi.yaml`
  - Routes: `/admin/v1/tenants`, `/admin/v1/tenants/{tenantId}`, `/admin/v1/tenants/{tenantId}/projects`, `/admin/v1/projects/{projectId}/retention`, `/admin/v1/tenants/{tenantId}/projects/{projectId}/credentials`, `/admin/v1/tenants/{tenantId}/projects/{projectId}/quota`, `/admin/v1/tenants/{tenantId}/audit`.
- **Query Service (`apps/query-service`)**:
  - Internal contract: `contracts/query/v1/openapi.yaml`
  - Routes: `/query/v1/logs/search`, `/query/v1/logs/facets`, `/query/v1/logs/events/{id}`, `/query/v1/logs/dashboard`, `/query/v1/logs/aggregate`.

---

## 4. Canonical Error Codes & RFC 7807 Matrix

| HTTP Status | Error Code (`code`) | Trigger Condition | Retry Policy |
| :--- | :--- | :--- | :--- |
| **400 Bad Request** | `SCHEMA_VALIDATION_FAILED` | Batch payload violates Canonical Schema v1 | Do not retry; fix payload format |
| **401 Unauthorized** | `INVALID_CREDENTIALS` | Bearer token unknown or revoked | Do not retry; check API key |
| **401 Unauthorized** | `SESSION_EXPIRED` | Cookie session expired or revoked | Redirect to `/bff/auth/login` |
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
