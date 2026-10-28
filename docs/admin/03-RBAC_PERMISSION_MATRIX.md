# Skyra LogHub — Role-Based Access Control (RBAC) & Permission Matrix

**Document Version:** 1.0.0  
**Status:** Approved Architecture Specification  
**Task ID:** `LOGHUB-ADMIN-001`  
**Phase:** Phase 4 — Administration Backend Foundation  
**Date:** 2026-10-28  

---

## 1. RBAC Architectural Principles

The Skyra LogHub administrative access control system adheres to:
1. **Deny-by-Default:** Every API request is rejected with `403 Forbidden` unless the calling principal possesses an explicit, unexpired permission grant matching the target resource scope.
2. **Explicit Hierarchy & Least Privilege:** Roles grant only the minimum necessary capabilities required for specific operational personas.
3. **No Global / Root Superuser:** There is no hardcoded "god mode" superuser across tenants. All administrative privileges are strictly bound to a specific tenant ID.
4. **Anti-Escalation Controls:**
   - A user cannot grant a role higher than their own effective role.
   - A user cannot assign roles to themselves (self-escalation rejection).
   - A tenant must have at least one active `OrgOwner`. Removing or demoting the last remaining owner is rejected at the domain policy level.
   - A `ProjectAdmin` cannot elevate themselves or any other user to `OrgAdmin` or `OrgOwner`.
5. **Separation of Concerns:** Managing platform infrastructure (credentials, quotas, project creation) is logically decoupled from viewing raw telemetry data where feasible.

---

## 2. Defined Roles & Personas

```text
       ┌───────────────┐
       │   OrgOwner    │  Tenant governance, billing ownership, tenant deletion
       └───────┬───────┘
               ▼
       ┌───────────────┐
       │   OrgAdmin    │  User invitations, project creation, credential management
       └───────┬───────┘
               ▼
       ┌───────────────┐
       │ ProjectAdmin  │  Quota adjustments, project credentials, retention setup
       └───────┬───────┘
               ▼
       ┌───────────────┐
       │   Developer   │  Log search, interactive analytics, trace inspection, exports
       └───────┬───────┘
               ▼
       ┌───────────────┐
       │    Viewer     │  Read-only telemetry search and dashboard metrics
       └───────────────┘
```

1. **`OrgOwner` (Organization Owner):** Ultimate administrative authority within a tenant. Responsible for legal compliance, tenant configuration, role delegation, and decommissioning.
2. **`OrgAdmin` (Organization Administrator):** Day-to-day organizational management. Creates projects, manages memberships across all projects, provisions ingestion credentials, and audits actions.
3. **`ProjectAdmin` (Project Administrator):** Scoped to specific assigned projects. Configures project-level ingestion keys, tunes quotas, reviews project-scoped logs, and inspects project errors.
4. **`Developer` (Software Engineer / SRE):** Investigates incidents. Executes complex log searches, keyset cursor queries, time-series aggregations, and downloads forensic exports.
5. **`Viewer` (Read-Only Observer / Stakeholder):** Inspects high-level overview dashboards, view-only time-series metrics, and sanitized search screens without export or modification rights.

---

## 3. Granular Permission Catalog

| Permission Code | Description | Scope Level |
|---|---|---|
| `tenant.read` | View tenant configuration, name, code, and status | Tenant |
| `tenant.update` | Update tenant display attributes and metadata | Tenant |
| `tenant.delete` | Initiate tenant decommissioning or archival | Tenant |
| `tenant.members.read` | List tenant members, invitations, and active roles | Tenant |
| `tenant.members.manage` | Invite members, change roles, revoke memberships | Tenant |
| `projects.read` | View project metadata, status, and reporting endpoints | Tenant / Project |
| `projects.create` | Provision new project namespaces within tenant | Tenant |
| `projects.update` | Modify project name and operational metadata | Tenant / Project |
| `projects.archive` | Transition project status to ARCHIVED | Tenant |
| `projects.members.manage` | Add or remove user assignments to a project | Tenant / Project |
| `logs.search` | Execute search queries and view individual log events | Project |
| `logs.analytics` | Execute date histograms, terms, and cardinality aggregations | Project |
| `logs.export` | Download large raw log extracts in CSV/JSONL formats | Project |
| `ingestion.credentials.read` | View credential metadata (keyPrefix, rate limits, status) | Project |
| `ingestion.credentials.create` | Generate new machine credentials (one-time secret) | Project |
| `ingestion.credentials.rotate` | Trigger credential rotation with zero-downtime overlap | Project |
| `ingestion.credentials.revoke` | Immediately revoke and disable a machine credential | Project |
| `quotas.read` | View project admission quotas and ingestion throughput | Project |
| `quotas.manage` | Adjust max payload bytes, batch size, and rate limits | Project |
| `retention.read` | View configured archive retention policies | Project |
| `retention.manage` | Update archive retention duration and cleanup windows | Project |
| `audit.read` | View administrative audit logs and security events | Tenant |

---

## 4. Comprehensive Role-to-Permission Matrix

| Permission | Viewer | Developer | ProjectAdmin | OrgAdmin | OrgOwner |
|---|:---:|:---:|:---:|:---:|:---:|
| `tenant.read` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `tenant.update` | ❌ | ❌ | ❌ | ✅ | ✅ |
| `tenant.delete` | ❌ | ❌ | ❌ | ❌ | ✅ |
| `tenant.members.read` | ❌ | ❌ | ❌ | ✅ | ✅ |
| `tenant.members.manage` | ❌ | ❌ | ❌ | ✅ | ✅ |
| `projects.read` | Assigned | Assigned | Assigned | ✅ All | ✅ All |
| `projects.create` | ❌ | ❌ | ❌ | ✅ | ✅ |
| `projects.update` | ❌ | ❌ | Assigned | ✅ | ✅ |
| `projects.archive` | ❌ | ❌ | ❌ | ✅ | ✅ |
| `projects.members.manage` | ❌ | ❌ | Assigned | ✅ | ✅ |
| `logs.search` | Assigned | Assigned | Assigned | ✅ All | ✅ All |
| `logs.analytics` | Assigned | Assigned | Assigned | ✅ All | ✅ All |
| `logs.export` | ❌ | Assigned | Assigned | ✅ All | ✅ All |
| `ingestion.credentials.read` | ❌ | ❌ | Assigned | ✅ All | ✅ All |
| `ingestion.credentials.create` | ❌ | ❌ | Assigned | ✅ All | ✅ All |
| `ingestion.credentials.rotate` | ❌ | ❌ | Assigned | ✅ All | ✅ All |
| `ingestion.credentials.revoke` | ❌ | ❌ | Assigned | ✅ All | ✅ All |
| `quotas.read` | ❌ | ❌ | Assigned | ✅ All | ✅ All |
| `quotas.manage` | ❌ | ❌ | Assigned | ✅ All | ✅ All |
| `retention.read` | ❌ | ❌ | Assigned | ✅ All | ✅ All |
| `retention.manage` | ❌ | ❌ | Assigned | ✅ All | ✅ All |
| `audit.read` | ❌ | ❌ | ❌ | ✅ | ✅ |

*Legend:*  
- `✅ All`: Permitted across all projects within the tenant.  
- `Assigned`: Permitted only for projects where the user possesses an explicit `ProjectMembership`.  
- `❌`: Strictly forbidden and rejected with `403 Forbidden`.

---

## 5. Server-Side Enforcement Architecture

In accordance with Section 9 of the mandate, client-side route guards (such as Angular's `authGuard` and `roleGuard`) are strictly treated as **presentation-tier UX conveniences**, never security boundaries.

### Enforcement Stack
1. **BFF Session Guard (`apps/console-bff`):** Rejects unauthenticated requests (`401`) and validates active workspace context.
2. **Admin API Security Guard (`apps/admin-service`):**
   - Extracts verified `QueryPrincipal` or `AdminPrincipal` from internal JWT.
   - Evaluates caller's effective roles and resolved permissions against the requested endpoint using the `@RequirePermissions(...)` decorator.
3. **Tenancy Resolution Interceptor:** Ensures the `:tenantId` route parameter strictly matches the caller's authorized tenant context.
4. **Entity Ownership Verification:** Before mutating a project, credential, or quota, the service confirms via database query that the target entity's `tenantId` matches the caller's tenant.
