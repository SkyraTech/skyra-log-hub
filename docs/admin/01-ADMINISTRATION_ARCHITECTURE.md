# Skyra LogHub — Administration Backend Architecture

**Document Version:** 1.0.0  
**Status:** Approved Architecture Specification  
**Task ID:** `LOGHUB-ADMIN-001`  
**Phase:** Phase 4 — Administration Backend Foundation  
**Date:** 2026-10-28  

---

## 1. Executive Summary & Architectural Purpose

Skyra LogHub's operational core currently features high-throughput log ingestion (Ingestion Gateway), durable Write-Ahead Logging (WAL), immutable JSONL/Parquet archival (Storage Shipper), and accelerated analytical queries (Query Service). Furthermore, Phase 4 delivered an enterprise Angular 19 console (`apps/console-web`) fronted by a Backend-for-Frontend (`apps/console-bff`) supporting live log exploration, advanced search, and real-time observability dashboards.

However, management operations—such as creating projects, adjusting quotas, rotating ingestion credentials, provisioning users, assigning role-based permissions, and auditing human administrative actions—currently lack an authoritative backend service and RESTful API layer (as identified in `docs/console/08-ADMINISTRATION_BACKEND_GAPS.md` and ADR-026).

**`LOGHUB-ADMIN-001` defines the architectural foundation for the Skyra LogHub Administration Backend.** It establishes:
1. **Service Ownership & Topological Boundaries:** Evaluation and selection of a dedicated `apps/admin-service` vs. embedded modules.
2. **Authoritative Identity & Membership Model:** Reliable user identity resolution tied to corporate OIDC identity providers, multi-tenant workspace memberships, and project assignments.
3. **Enterprise RBAC Hierarchy:** Five explicit roles (`OrgOwner`, `OrgAdmin`, `ProjectAdmin`, `Developer`, `Viewer`) enforcing deny-by-default, tenant-scoped capabilities.
4. **Ingestion Credential Lifecycle:** Secure creation, rotation with zero-downtime overlap, one-time secret revelation, and immediate revocation, preserving full compatibility with the existing Ingestion Gateway SHA-256 verifier.
5. **Durable Administrative Auditing:** Tamper-evident recording of all configuration and security-relevant mutations.
6. **Cross-Service Authorization Consistency:** Unified trust model integrating Console BFF, Admin Service, and Query Service with bounded assertion lifetimes and revocation guarantees.

---

## 2. Architectural Principles & Clean Architecture Boundaries

The Administration Backend adheres strictly to Clean Architecture, SOLID principles, and defensive design:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        Presentation / API Layer                        │
│   (NestJS Fastify Controllers, OpenAPI 3.1, RFC 7807 Exception Filters)│
├────────────────────────────────────────────────────────────────────────┤
│                       Application / Use Case Layer                     │
│    (Command & Query Handlers, Orchestrators, Event Dispatchers, DTOs)  │
├────────────────────────────────────────────────────────────────────────┤
│                           Domain Core Layer                            │
│  (Entities, Aggregates, Value Objects, Domain Policies, Port Contracts)│
├────────────────────────────────────────────────────────────────────────┤
│                       Infrastructure / Adapter Layer                   │
│   (Prisma Repositories, PostgreSQL 16, OIDC Verifiers, Audit Exporters)│
└────────────────────────────────────────────────────────────────────────┘
```

### Dependency Invariants
- **Domain Independence:** The Domain Core has zero dependencies on NestJS, Prisma, Fastify, or external libraries. All persistence, identity, and transport operations are modeled as abstract ports (interfaces).
- **Inward Dependency Direction:** API Controllers depend on Application Services; Application Services depend on Domain Ports; Infrastructure Adapters implement Domain Ports.
- **No Leaky Database Logic:** Controllers never execute SQL or Prisma queries directly. Authorization checks and tenancy constraints are enforced in application use-case gates, never deferred to database triggers or UI state.
- **Fail-Closed by Default:** Any missing tenant context, expired assertion, unrecognized role, or unmapped capability immediately results in an explicit denial (`403 Forbidden` or `401 Unauthorized`).

---

## 3. Administration Service Ownership Evaluation

An architectural analysis was conducted to determine whether administrative capabilities should be housed in an existing service or in a new, dedicated microservice:

### Option A: Dedicated Service (`apps/admin-service`) [RECOMMENDED & SELECTED]
- **Topology:** An independent NestJS application running on dedicated ports (e.g. HTTP `:3300`).
- **Advantages:**
  - *Workload & Resource Isolation:* Administrative operations involve complex transactional mutations on PostgreSQL. Separating this workload ensures that heavy ingestion bursts (handled by `ingestion-gateway` on port 3000) and expensive analytical scans (handled by `query-service` on port 3100) cannot starve or lock administrative transactions.
  - *Security & Blast Radius Reduction:* Admin Service requires elevated PostgreSQL write permissions on organizational tables (`tenants`, `projects`, `users`, `memberships`, `ingestion_credentials`). The Query Service operates in a strictly read-only posture against the metadata database and archives. Combining them would violate the Principle of Least Privilege.
  - *Deployment Decoupling:* Administrative endpoints change at a different cadence than ingestion protocols and DuckDB query engines. An independent service enables targeted zero-downtime deployments.
  - *BFF Integration Simplicity:* The BFF acts as an API gateway proxying `/admin/v1/*` to `admin-service:3300` and `/query/v1/*` to `query-service:3100`.

### Option B: Dedicated Admin Module inside `ingestion-gateway` [REJECTED]
- **Drawbacks:** Violates Single Responsibility Principle. Ingestion Gateway is optimized for high-throughput, asynchronous WAL spooling with minimal latency. Adding human user session handling, OIDC identity reconciliation, and complex multi-table relational mutations risks degrading ingestion throughput and complicating CPU/memory sizing.

### Option C: Dedicated Admin Module inside `query-service` [REJECTED]
- **Drawbacks:** Violates the Read/Write CQRS boundary established in ADR-017. Query Service is an analytical engine executing DuckDB queries over parquet files. Giving Query Service write access to credential secrets, user roles, and tenant quotas creates an unacceptable security exposure.

### Decision (ADR-027)
**Skyra LogHub adopts Option A: A dedicated `apps/admin-service`.** In local development and monolithic deployments, it can optionally be packaged alongside the BFF or Gateway, but its codebase, module boundaries, and database client remain strictly isolated.

---

## 4. End-to-End Enterprise Trust Boundary

```text
┌───────────────────────────┐
│  Angular Web Console      │  Browser (TypeScript, OnPush Signals)
│     (apps/console-web)    │  Zero stored tokens, zero direct database access
└─────────────┬─────────────┘
              │ HTTPS / Same-Origin
              │ Secure Cookie: __Host-skyra-session (HttpOnly, SameSite=Lax)
              │ Header: X-CSRF-Token
              ▼
┌───────────────────────────┐
│     Console BFF           │  Node.js / Fastify Gateway (:3200)
│     (apps/console-bff)    │  OIDC PKCE Session Handler, Session Store, CSRF Guard
└─────────────┬─────────────┘
              │ Internal Network (Mutual TLS or Isolated VPC)
              │ Authorization: Bearer <Internal Scoped JWT> (60s TTL)
              │ Claims: { sub: userId, tid: tenantId, roles: [...], grants: [...] }
              │ Headers: X-Request-ID, X-Correlation-ID, X-Caller-Identity
              ▼
┌───────────────────────────┐
│   Administration Service  │  NestJS Dedicated Admin Engine (:3300)
│    (apps/admin-service)   │  Domain RBAC Guard, Tenancy Interceptor, Transaction Coordinator
└─────────────┬─────────────┘
              │ Authenticated Connection Pool (Prisma Client)
              │ Least-Privilege Database Role (skyra_admin)
              ▼
┌───────────────────────────┐
│   PostgreSQL 16 Database  │  Relational Metadata, Quotas, Credentials, Audit Trails
│   (skyra_loghub_metadata) │  Composite Unique Constraints, Foreign Key Cascades
└───────────────────────────┘
```

### Security Invariants
1. **No External Network Exposure:** `apps/admin-service` binds exclusively to internal network interfaces (or Docker network). It is never directly addressable by public internet clients.
2. **Authoritative BFF Mediation:** The browser communicates solely with `apps/console-bff`. The BFF validates the session, evaluates CSRF tokens, stamps the internal caller identity, and forwards requests to the Administration Service.
3. **Independent Token Verification:** The Administration Service independently verifies the internal JWT signature, expiration (`exp`), issuer (`https://auth.skyra.internal`), and audience (`skyra-loghub-admin`) on every request.
4. **Dual Tenancy Enforcement:** The Administration Service checks that the `tenantId` in the URL route matches the cryptographic `tid` claim in the verified token. Mismatches are rejected as cross-tenant security violations (`403 Forbidden`).

---

## 5. Architectural Quality Attributes & SLA Targets

| Quality Attribute | Target Metric | Architectural Defense |
|---|---|---|
| **P99 API Latency** | $< 45\text{ ms}$ for reads, $< 120\text{ ms}$ for writes | Indexed PostgreSQL lookups, connection pooling (PgBouncer), lean JSON payloads. |
| **Availability SLA** | 99.95% uptime | Stateless NestJS service instances, health probes (`/health/live`, `/health/ready`). |
| **Tenant Isolation** | Zero cross-tenant leakage | Composite database constraints `(tenant_id, id)`, server-side predicate injection. |
| **Credential Safety** | Zero plaintext leakage | Secrets shown exactly once at creation; stored as SHA-256 verifiers (`key_hash`). |
| **Revocation Propagation** | $\le 60\text{ seconds}$ | Short-lived internal JWT assertions (60s TTL); immediate local session cache eviction. |
| **Audit Completeness** | 100% security operations recorded | Transactional audit recording; mutations fail if audit logging fails. |
