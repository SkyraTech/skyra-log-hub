# Skyra LogHub — Administration API Contracts & Interface Specification

**Document Version:** 1.0.0  
**Status:** Approved Architecture Specification  
**Task ID:** `LOGHUB-ADMIN-001`  
**Phase:** Phase 4 — Administration Backend Foundation  
**Date:** 2026-10-28  

---

## 1. RESTful API Architecture

The Administration API exposes secure, versioned endpoints under the base path `/admin/v1`. All requests and responses are strictly validated against JSON Schema Draft 2020-12 and OpenAPI 3.1.0 specifications stored in `contracts/admin/v1/`.

### 1.1 HTTP Headers & Invariants
- `Authorization: Bearer <Internal JWT>` (Scoped internal assertion minted by Console BFF).
- `X-Request-ID`: UUIDv4 tracking identifier forwarded across all microservices.
- `Idempotency-Key`: Optional client-provided UUID on state-mutating requests (`POST`, `PATCH`) to prevent double-execution during network retries.
- `If-Match: "<ETag>"`: Optimistic concurrency control token for updates to projects and quotas.
- `Content-Type: application/json`: Required for all request payloads.
- Responses on failure strictly adhere to **RFC 7807 Problem Details** (`application/problem+json`).

---

## 2. Comprehensive Endpoint Catalog

### 2.1 Tenant Administration
- **`GET /admin/v1/tenants`**
  - *Summary:* List all tenants accessible to the calling principal.
  - *Permission:* `tenant.read`
  - *Response (200):* `TenantListResponseDto`
- **`GET /admin/v1/tenants/{tenantId}`**
  - *Summary:* Retrieve tenant metadata, quota summaries, and active status.
  - *Permission:* `tenant.read` (Caller must belong to `{tenantId}`).
- **`PATCH /admin/v1/tenants/{tenantId}`**
  - *Summary:* Update tenant display name or operational metadata.
  - *Permission:* `tenant.update` (`OrgOwner`, `OrgAdmin`).

### 2.2 Project Management
- **`GET /admin/v1/tenants/{tenantId}/projects`**
  - *Summary:* List projects within a tenant. Returns all projects for `OrgAdmin`/`OrgOwner`, or assigned projects for `ProjectAdmin`/`Developer`.
  - *Permission:* `projects.read`
- **`POST /admin/v1/tenants/{tenantId}/projects`**
  - *Summary:* Provision a new project namespace and initialize default quotas.
  - *Permission:* `projects.create` (`OrgAdmin`, `OrgOwner`).
  - *Payload:* `{ "id": "billing-gateway", "name": "Billing Gateway Service" }`
- **`GET /admin/v1/tenants/{tenantId}/projects/{projectId}`**
  - *Summary:* Inspect single project details.
  - *Permission:* `projects.read`
- **`PATCH /admin/v1/tenants/{tenantId}/projects/{projectId}`**
  - *Summary:* Update project metadata or transition status (`ACTIVE`, `SUSPENDED`, `ARCHIVED`).
  - *Permission:* `projects.update`

### 2.3 User Membership & RBAC
- **`GET /admin/v1/tenants/{tenantId}/members`**
  - *Summary:* List tenant members, assigned roles, and membership statuses.
  - *Permission:* `tenant.members.read` (`OrgAdmin`, `OrgOwner`).
- **`POST /admin/v1/tenants/{tenantId}/members`**
  - *Summary:* Invite a user to the tenant with an assigned role.
  - *Permission:* `tenant.members.manage`
  - *Payload:* `{ "email": "dev@acme.com", "role": "Developer", "projectIds": ["billing"] }`
- **`PATCH /admin/v1/tenants/{tenantId}/members/{membershipId}`**
  - *Summary:* Update member's role or status. Prevents demoting the last `OrgOwner`.
  - *Permission:* `tenant.members.manage`
- **`DELETE /admin/v1/tenants/{tenantId}/members/{membershipId}`**
  - *Summary:* Revoke user membership and immediately terminate active sessions.
  - *Permission:* `tenant.members.manage`

### 2.4 Ingestion Credentials
- **`GET /admin/v1/projects/{projectId}/credentials`**
  - *Summary:* List machine credentials for a project. Returns only safe metadata (prefix, status, expiry). Plaintext secrets are NEVER returned.
  - *Permission:* `ingestion.credentials.read`
- **`POST /admin/v1/projects/{projectId}/credentials`**
  - *Summary:* Generate a new machine credential. Returns the plaintext secret **exactly once**.
  - *Permission:* `ingestion.credentials.create`
  - *Response (201):* `{ "id": "...", "keyPrefix": "skyra_live_...", "rawToken": "skyra_live_7c9e...", "expiresAt": "..." }`
- **`POST /admin/v1/projects/{projectId}/credentials/{credentialId}/rotate`**
  - *Summary:* Issue a new credential and begin grace overlap period for old credential. Returns new raw secret once.
  - *Permission:* `ingestion.credentials.rotate`
- **`POST /admin/v1/projects/{projectId}/credentials/{credentialId}/revoke`**
  - *Summary:* Immediately disable and revoke a credential.
  - *Permission:* `ingestion.credentials.revoke`

### 2.5 Quotas & Retention
- **`GET /admin/v1/projects/{projectId}/quotas`**
  - *Summary:* Retrieve current admission budgets (`maxBatchSize`, `maxPayloadBytes`, `maxEventsPerSec`).
  - *Permission:* `quotas.read`
- **`PATCH /admin/v1/projects/{projectId}/quotas`**
  - *Summary:* Adjust admission quotas. Takes effect on next ingestion batch.
  - *Permission:* `quotas.manage`
- **`GET /admin/v1/projects/{projectId}/retention`**
  - *Summary:* Inspect configured archive retention policy.
  - *Permission:* `retention.read`
- **`PATCH /admin/v1/projects/{projectId}/retention`**
  - *Summary:* Update archive retention duration. Requires confirmation header if reducing duration.
  - *Permission:* `retention.manage`

### 2.6 Audit Trails
- **`GET /admin/v1/tenants/{tenantId}/audit-events`**
  - *Summary:* Paginated log of administrative actions with filter by actor, action type, and date range.
  - *Permission:* `audit.read` (`OrgAdmin`, `OrgOwner`).

---

## 3. RFC 7807 Error Response Model

Every non-2xx response follows RFC 7807:
```json
{
  "type": "https://errors.skyra-tech.com/admin/v1/LAST_OWNER_REMOVAL_BLOCKED",
  "title": "Last Owner Removal Blocked",
  "status": 409,
  "detail": "Cannot revoke membership for user 'user-123' because they are the sole OrgOwner of tenant 'tenant-456'.",
  "instance": "/admin/v1/tenants/tenant-456/members/mem-789",
  "code": "LAST_OWNER_REMOVAL_BLOCKED",
  "requestId": "req-9876543210"
}
```
