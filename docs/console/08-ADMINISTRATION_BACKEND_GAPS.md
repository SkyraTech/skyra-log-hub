# Skyra LogHub — Backend Capability & Administration Gap Analysis

**Document Version:** 1.0.0  
**Status:** Approved Architecture Specification  
**Task ID:** `LOGHUB-CONSOLE-001`  
**Phase:** Phase 4 — Web Console, Administration & Observability Experience  
**Date:** 2026-10-27  

---

## 1. Executive Summary & Architectural Invariant

To preserve enterprise data integrity and security, **the frontend must never implement "fake" client-side persistence or mock administrative mutations**. 

While the Query Service endpoints for Log Search, Event Lookup, Aggregations, and Dynamic Facets are 100% implemented, tested, and verified (Phase 3), the administrative capabilities (managing projects, user invitations, RBAC roles, and ingestion tokens) **currently lack REST management APIs**.

This document provides an exhaustive gap analysis separating:
1. **Existing Backend APIs:** Production-ready endpoints ready for immediate Angular integration.
2. **Existing Database Models (Missing APIs):** PostgreSQL tables defined in Prisma that require new REST endpoints.
3. **Missing Database Models & APIs:** Capabilities requiring new database schemas and backend services before frontend screens can be enabled.

---

## 2. Comprehensive API Readiness & Gap Matrix

| Feature / Capability | Existing Backend API | New API Required | DB Change Required | Auth Requirement | Priority | Implementation Milestone |
| :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| **Log Search** | `POST /query/v1/logs/search` | None | None | Bearer JWT (Any Role) | P0 | Verified Ready (Phase 3) |
| **Log Event Lookup** | `GET /query/v1/logs/{eventId}` | None | None | Bearer JWT (Any Role) | P0 | Verified Ready (Phase 3) |
| **Log Aggregations** | `POST /query/v1/logs/aggregate`| None | None | Bearer JWT (Any Role) | P0 | Verified Ready (Phase 3) |
| **Dynamic Facets** | `POST /query/v1/logs/facets` | None | None | Bearer JWT (Any Role) | P0 | Verified Ready (Phase 3) |
| **Service Liveness** | `GET /health/live` | None | None | None (Public Probe) | P0 | Verified Ready (Phase 3) |
| **Service Readiness**| `GET /health/ready` | None | None | None (Public Probe) | P0 | Verified Ready (Phase 3) |
| **Login / Session** | None (Pluggable JWT Guard) | `POST /api/v1/auth/login`<br>`GET /api/v1/auth/session`<br>`POST /api/v1/auth/logout` | No (External OIDC IdP session) | None (Public Auth) | P0 | `LOGHUB-AUTH-001` |
| **Current User Profile**| None (Derived from JWT) | `GET /api/v1/user/profile` | No (JWT claims) | Authenticated Session | P1 | `LOGHUB-AUTH-001` |
| **Tenant List** | None | `GET /api/v1/user/tenants` | No (Uses `tenants` table)| Authenticated Session | P1 | `LOGHUB-AUTH-001` |
| **Project List** | None (Prisma repo only) | `GET /api/v1/projects` | No (Uses `projects` table)| Authenticated User | P1 | `LOGHUB-ADMIN-001` |
| **Project Creation** | None | `POST /api/v1/projects` | No (Uses `projects` table)| `OrgAdmin`, `OrgOwner` | P1 | `LOGHUB-ADMIN-001` |
| **Project Quotas** | None | `GET /api/v1/projects/:id/quota`<br>`PUT /api/v1/projects/:id/quota` | No (Uses `project_quotas`) | `OrgAdmin`, `ProjectAdmin` | P2 | `LOGHUB-ADMIN-001` |
| **Ingestion Credentials**| None | `GET /api/v1/credentials`<br>`POST /api/v1/credentials`<br>`DELETE /api/v1/credentials/:id` | No (Uses `ingestion_credentials`)| `OrgAdmin`, `ProjectAdmin` | P1 | `LOGHUB-ADMIN-001` |
| **Member List** | None | `GET /api/v1/members` | **Yes** (Requires `users` & `memberships` tables) | `OrgAdmin`, `OrgOwner` | P2 | `LOGHUB-AUTH-002` |
| **Invite Member** | None | `POST /api/v1/members/invite` | **Yes** (Requires `invitations` table) | `OrgAdmin`, `OrgOwner` | P2 | `LOGHUB-AUTH-002` |
| **Role Assignment** | None | `PUT /api/v1/members/:id/role`| **Yes** (Requires `memberships` table) | `OrgAdmin`, `OrgOwner` | P2 | `LOGHUB-AUTH-002` |
| **Saved Searches** | None | `GET /api/v1/saved-searches`<br>`POST /api/v1/saved-searches` | **Yes** (Requires `saved_searches` table) | Authenticated User | P3 | `LOGHUB-SAVED-001` |
| **Audit History** | Operational logs only | `GET /api/v1/audit/logs` | **Yes** (Requires `audit_logs` table) | `OrgAdmin`, `OrgOwner` | P3 | `LOGHUB-AUDIT-001` |
| **Retention Policy** | Fixed 30-day default | `GET /api/v1/retention`<br>`PUT /api/v1/retention` | **Yes** (Requires `retention_policies` table)| `OrgAdmin`, `OrgOwner` | P3 | `LOGHUB-RETENTION-001` |

---

## 3. Analysis of Existing Database Models vs. Missing APIs

The PostgreSQL database currently contains four metadata tables in `apps/ingestion-gateway/prisma/schema.prisma` that can immediately support new administrative APIs without schema migrations:

1. **`tenants`:** Registered enterprise organizations (`id`, `code`, `name`, `status`).
2. **`projects`:** Observability project namespaces (`id`, `tenantId`, `name`, `status`).
3. **`project_quotas`:** Ingestion throughput and payload limits (`maxBatchSize`, `maxPayloadBytes`, `maxEventsPerSec`).
4. **`ingestion_credentials`:** Machine tokens for shippers and SDKs (`keyHash`, `keyPrefix`, `allowedProjects`, `allowedEnvironments`, `rateLimitPerMin`, `expiresAt`, `isRevoked`).

### Architectural Resolution: Milestone `LOGHUB-ADMIN-001` (Complete — PASS)
The architectural foundation, security threat modeling, RBAC permission hierarchy, OpenAPI 3.1 contracts (`contracts/admin/v1/`), and additive Prisma schema migration proposal have been delivered in **`LOGHUB-ADMIN-001`**.

---

## 4. Completely Missing Models (Addressed in Proposed Schema Migration)

The proposed schema extension in `docs/admin/10-DATABASE_MIGRATION_PROPOSAL.md` resolves these missing capabilities without breaking existing tables:

1. **User Identity & Multi-Tenant Membership:**
   - Adds `users`, `tenant_memberships`, and `project_memberships` tables with `(issuer, subject)` composite uniqueness.
   - Enables Team & Access Management (`/team`) backed by authoritative PostgreSQL relational queries.
2. **Fine-Grained RBAC & Anti-Escalation:**
   - Adds `roles`, `permissions`, `role_permissions`, and `role_assignments` tables with 5 baseline system roles.
3. **Human Administrative Audit Trails:**
   - Adds `admin_audit_events` with atomic transactional rollback guarantees.

---

## 5. Phased Delivery Strategy

To avoid shipping broken or unbacked UI screens, Phase 4 features are strictly sequenced:

- **Milestone CONSOLE-002 through CONSOLE-005:** Focused exclusively on **verified Query APIs** (Log Explorer, Event Detail Drawer, Overview Dashboard, Analytics Histograms, and Dynamic Facets). **[COMPLETE — PASS]**
- **Milestone LOGHUB-ADMIN-001:** Administration backend architecture, RBAC, domain modeling, and OpenAPI contracts. **[COMPLETE — PASS]**
- **Milestone LOGHUB-ADMIN-002 through ADMIN-005:** Backend database migration, IAM foundation, Admin Service implementation, and security hardening.
- **Milestone CONSOLE-006:** Activated only after backend milestone `LOGHUB-ADMIN-004` delivers verified REST APIs.
- **Milestone CONSOLE-007:** Hardening, security, accessibility, and E2E verification.

