# SKYRA LOGHUB — TASK LOGHUB-ADMIN-001 ARCHITECTURE REPORT

**Repository:** `skyra-log-hub`  
**Task ID:** `LOGHUB-ADMIN-001`  
**Phase:** Phase 4 — Administration Backend Foundation  
**Priority:** P0 — Tenant Isolation, Identity Authorization, Data Modeling & API Security  
**Previous Milestone:** `LOGHUB-CONSOLE-005` — Live Analytics Dashboard (Reported PASS)  
**Next Milestone:** `LOGHUB-ADMIN-002` — Administration Backend Implementation & Approved Database Migration  
**Dependent Frontend Milestone:** `LOGHUB-CONSOLE-006` — Administration UI  
**Execution Date:** 2026-10-28  
**Final Verdict:** **PASS — Architecture Ready**

---

## 1. Executive Summary

Task **LOGHUB-ADMIN-001** establishes the comprehensive, implementation-ready architectural foundation for the Skyra LogHub Administration Backend. Grounded directly in the actual PostgreSQL metadata schema (`apps/ingestion-gateway/prisma/schema.prisma` and `apps/query-service/prisma/schema.prisma`), this architecture designs the complete identity, access control, multi-tenant governance, machine credential, and configuration management infrastructure without prematurely executing database migrations or deploying unapproved CRUD code.

### Core Architecture Deliverables
1. **Dedicated Service Ownership (ADR-027):** Selection of `apps/admin-service` to isolate write-heavy administrative transactions from high-throughput log ingestion and analytical queries.
2. **Authoritative Identity & Membership Model (ADR-028):** External enterprise OIDC federation anchored strictly to the cryptographic composite key `@@unique([issuer, subject])`, completely preventing cross-issuer collisions and email mutability vulnerabilities.
3. **Enterprise RBAC Hierarchy (ADR-029):** Five explicit roles (`OrgOwner`, `OrgAdmin`, `ProjectAdmin`, `Developer`, `Viewer`) with 22 granular permissions enforcing deny-by-default, self-escalation rejection, and last-owner protection.
4. **Cross-Service Authorization Consistency (ADR-030):** Unified trust boundary across Console BFF, Admin Service, and Query Service with 60s TTL internal scoped assertions and immediate local session invalidation.
5. **Ingestion Credential Lifecycle (ADR-031):** 100% backward-compatible SHA-256 verifier matching `apps/ingestion-gateway/src/auth/auth.service.ts`, one-time secret revelation, 7-day zero-downtime rotation overlap, and immediate revocation.
6. **Immutable Administrative Audit Trails (ADR-032):** Append-only `admin_audit_events` persistence with atomic transactional rollback on audit write failure.
7. **Additive Database Schema Proposal (ADR-033):** Zero-disruption Prisma schema extension proposing 9 new IAM entities for review in `LOGHUB-ADMIN-002`.
8. **Versioned API Contracts & Test Verification:** Complete OpenAPI 3.1.0 specification and 14 JSON Schema Draft 2020-12 specifications in `contracts/admin/v1/`, verified with automated contract test suite (`tests/contracts/admin-contracts.test.ts` passing 7/7 tests).

---

## 2. Initial Git Status

At task commencement:
- **Active Branch:** `main`
- **Initial HEAD:** `5cb137ad0d2c4bc5019e83b752c6b1927b8be7f4`
- **Working Tree:** Clean (all prior CONSOLE-005 deliverables committed). All existing files preserved without rebasing, resetting, or pushing.

---

## 3. Existing Repository Inspection

A thorough pre-implementation inspection verified:
- **`SKYRA_LOGHUB_CONSOLE_005_FINAL_AUDIT.md` & Implementation Report:** Confirmed live dashboard and analytical aggregations are operational and passing all 748 monorepo tests.
- **Prisma Schemas:** `apps/ingestion-gateway/prisma/schema.prisma` and `apps/query-service/prisma/schema.prisma` are identical and synchronized.
- **Ingestion Authentication:** `apps/ingestion-gateway/src/auth/auth.service.ts` uses SHA-256 hashing on raw tokens and compares with `key_hash` in PostgreSQL.
- **BFF Membership Service:** `apps/console-bff/src/modules/auth/application/membership.service.ts` implements `IMembershipProvider` port, fails closed in production, and uses isolated development fixtures in local dev.
- **Query Service Authorization:** `apps/query-service/src/modules/auth/authorization/project-authorization.service.ts` enforces `principal.tenantId` and `principal.authorizedProjects`.

---

## 4. Current Metadata Schema

The existing PostgreSQL schema contains 7 models:
1. `tenants`: Enterprise organizations (`id`, `code`, `name`, `status`, `createdAt`, `updatedAt`).
2. `projects`: Logging namespaces (`id`, `tenantId`, `name`, `status`, `createdAt`, `updatedAt`).
3. `ingestion_credentials`: Machine tokens (`id`, `tenantId`, `keyHash`, `keyPrefix`, `allowedProjects`, `allowedEnvironments`, `rateLimitPerMin`, `isRevoked`, `expiresAt`, `lastUsedAt`).
4. `project_quotas`: Admission budgets (`id`, `tenantId`, `projectId`, `maxBatchSize`, `maxPayloadBytes`, `maxEventsPerSec`).
5. `archive_segments`: Finalized immutable segment catalog.
6. `deduplication_receipts`: Deduplication receipts retained for 7 days.
7. `ingestion_checkpoints`: Storage consumer watermarks.

---

## 5. Existing Identity & Authorization Architecture

- **Human Authentication:** Console BFF handles OIDC PKCE flow (`GET /bff/auth/login`, `GET /bff/auth/callback`), sets HTTP-only `__Host-skyra-session` cookie, and resolves workspace context.
- **Query Authorization:** Query Service verifies scoped internal JWT minted by BFF (`iss: https://auth.skyra.internal`, `aud: skyra-loghub-query`, 60s TTL).
- **The Core Authorization Gap:** There are currently no database tables for `users`, `memberships`, or `roles`. BFF membership resolution relies on hardcoded development fixtures in dev and fails closed in production.

---

## 6. Administration Service Ownership (ADR-027)

Skyra LogHub adopts a **dedicated `apps/admin-service`**:
- **Why Not Ingestion Gateway:** Ingestion Gateway is optimized for high-throughput, asynchronous WAL spooling. Adding transactional relational mutations risks degrading ingestion throughput.
- **Why Not Query Service:** Query Service operates in a strictly read-only analytical posture. Granting write access to user roles and credentials violates Least Privilege.
- **Topology:** NestJS application running on internal port 3300, fronted by `apps/console-bff`.

---

## 7. Domain Model

Modeled in `docs/admin/02-DOMAIN_AND_DATA_MODEL.md`:
- `Tenant`: Top-level organizational boundary.
- `Project`: Scoped logging namespace within a tenant.
- `Environment`: Scoped allowlist collection (`production`, `staging`, `development`, `local`, `qa`, `dr`).
- `User`: Human identity federated with corporate OIDC.
- `TenantMembership`: User membership in a tenant.
- `ProjectMembership`: User membership in a project.
- `Role`: System or custom security role.
- `Permission`: Functional capability verb.
- `RoleAssignment`: Scoped binding of user to role within tenant/project.
- `IngestionCredential`: Machine token metadata.
- `ProjectQuota`: Admission limits.
- `AdminAuditEvent`: Tamper-evident administrative audit log.

---

## 8. Tenant / Project Boundaries

- Every project strictly belongs to exactly one tenant (`@@map("projects")` foreign key `tenantId`).
- A project cannot be moved between tenants.
- All administrative requests verify that the target entity's `tenantId` strictly matches the caller's verified `tid` token claim.

---

## 9. User Identity

- Anchored to the composite unique key `@@unique([issuer, subject])`.
- Avoids cross-issuer collisions and corporate email mutability vulnerabilities.
- Zero passwords, password hashes, or MFA secrets stored in Skyra LogHub.

---

## 10. Membership Model

- Lifecycle: `PENDING_INVITE` $\rightarrow$ `ACTIVE` $\leftrightarrow$ `SUSPENDED` $\rightarrow$ `REVOKED`.
- First-login workflow matches pending invitations by verified email address (`email_verified: true`).
- No open registration: uninvited users fail closed with `403 Forbidden`.

---

## 11. RBAC Roles & Permissions (ADR-029)

- **Roles:** `OrgOwner`, `OrgAdmin`, `ProjectAdmin`, `Developer`, `Viewer`.
- **Permissions:** 22 granular capabilities documented in `docs/admin/03-RBAC_PERMISSION_MATRIX.md`.
- **Invariants:** Deny-by-default; anti-escalation enforcement; last-owner removal protection.

---

## 12. Effective Authorization Algorithm

```typescript
function hasPermission(principal: AdminPrincipal, permission: string, targetProjectId?: string): boolean {
  if (principal.tenantStatus !== 'ACTIVE') return false;
  if (principal.userStatus !== 'ACTIVE') return false;
  
  // OrgOwner and OrgAdmin hold tenant-wide capabilities
  if (principal.roles.includes('OrgOwner') || principal.roles.includes('OrgAdmin')) {
    return roleHasPermission(principal.highestRole, permission);
  }
  
  // ProjectAdmin, Developer, Viewer evaluated against assigned projects
  if (targetProjectId) {
    if (!principal.assignedProjects.includes(targetProjectId)) return false;
    return roleHasPermission(principal.projectRole(targetProjectId), permission);
  }
  
  return false;
}
```

---

## 13. Revocation Consistency (ADR-030)

- Scoped internal JWTs have a maximum TTL of **60 seconds**.
- Revoking a membership in `apps/admin-service` invalidates the local BFF session cache immediately (0 seconds delay for subsequent user requests).
- Downstream Query Service independently validates token expiration on every request (maximum propagation window bounded to $\le 60\text{ seconds}$).

---

## 14. Credential Lifecycle (ADR-031)

- Format: `skyra_live_[a-f0-9]{64}`.
- Storage: SHA-256 hex digest stored in `key_hash`. Prefix stored in `key_prefix`.
- Reveal Exactly Once: Plaintext token returned in creation response, never stored or returned again.
- Zero-Downtime Rotation: Atomic grace overlap period (default 7 days) during which both old and new credentials authenticate simultaneously.
- Immediate Revocation: Calling `/revoke` disables credential immediately.

---

## 15. Project Lifecycle

- States: `ACTIVE`, `SUSPENDED`, `ARCHIVED`.
- Hard Deletion Rejection: Immediate hard deletion of projects containing retained logs is strictly prevented to avoid orphaned filesystem archives and broken DuckDB queries.

---

## 16. Quotas

- Mapped to existing `project_quotas` table: `maxBatchSize` (500), `maxPayloadBytes` (5 MiB), `maxEventsPerSec` (5,000).
- Directly coupled to runtime enforcement in `apps/ingestion-gateway` (`BatchValidationPipe`, Fastify payload limit, `RateLimitGuard`).

---

## 17. Retention

- Baseline: 30-day retention.
- Configurable range: 1 to 365 days.
- Destructive safeguard: Reducing retention duration requires explicit confirmation header `X-Confirm-Destructive-Action: true`.
- Legal hold flag `isLegalHold = true` halts automated purges.

---

## 18. Audit Event Design (ADR-032)

- Append-only `admin_audit_events` table.
- Atomic Audit Invariant: Mutation rolls back if audit log write fails.
- Secrets and raw tokens strictly scrubbed from audit details.

---

## 19. Proposed Prisma Schema

Documented in `docs/admin/10-DATABASE_MIGRATION_PROPOSAL.md`:
- Purely additive: 9 new models (`User`, `TenantMembership`, `ProjectMembership`, `Role`, `Permission`, `RolePermission`, `RoleAssignment`, `Invitation`, `AdminAuditEvent`).
- Preserves all 7 existing models unchanged.

---

## 20. Migration Proposal

- Proposed for milestone `LOGHUB-ADMIN-002`.
- Zero migrations executed in `LOGHUB-ADMIN-001`.
- Clean rollback script (`DROP TABLE IF EXISTS ... CASCADE`) provided.

---

## 21. Bootstrap & Ownership Recovery (ADR-033)

- Zero hardcoded default admin accounts.
- Initial tenant owner provisioned via explicit, audited CLI command:
  ```bash
  pnpm --filter @skyra/admin-service bootstrap:owner --tenant-code=skyra-internal --email=admin@skyra.internal
  ```

---

## 22. OpenAPI Contracts

Created in `contracts/admin/v1/`:
- `openapi.yaml`: OpenAPI 3.1.0 specification covering all endpoints.
- 14 JSON Schema Draft 2020-12 specifications.

---

## 23. BFF Integration

Angular Console communicates with `apps/console-bff`, which proxies administrative operations to `apps/admin-service:3300` using internal scoped JWTs.

---

## 24. Query Service Authorization Alignment

The proposed IAM database schema will directly serve `apps/query-service`'s `IProjectAuthorizationPort` by generating internal JWTs containing verified `authorizedProjects` grants from PostgreSQL `project_memberships`.

---

## 25. Ingestion Gateway Credential Alignment

Verified 100% compatible with `apps/ingestion-gateway/src/auth/auth.service.ts`. Generated credentials use the exact same SHA-256 verifier algorithm.

---

## 26. Security Threat Model (STRIDE)

Documented in `docs/admin/09-SECURITY_THREAT_MODEL.md`:
- Evaluates 10 attack conditions across Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, and Elevation of Privilege. All residual risks rated Low or Negligible.

---

## 27. Concurrency & Idempotency Strategy

- Optimistic concurrency control via `If-Match` ETag headers.
- Optional `Idempotency-Key` headers on state-mutating requests.
- PostgreSQL transactions with repeatable read isolation for complex mutations.

---

## 28. Testing Strategy

Documented in `docs/admin/11-TESTING_AND_ACCEPTANCE.md`:
- 40 concrete test scenarios covering Identity & Membership (1–10), RBAC (11–20), Credential Lifecycle (21–30), and APIs & Integrity (31–40).

---

## 29. Quality Gates

- Strict TypeScript (`noEmit`).
- Schema validation via Ajv 2020.
- Zero drift against `log-event.schema.json`.
- 100% passing monorepo tests.

---

## 30. ADR Decisions

7 new ADRs authored in `docs/14-ARCHITECTURE_DECISIONS.md`:
- ADR-027: Administration Service Ownership
- ADR-028: Authoritative Multi-Tenant Identity Model
- ADR-029: Hierarchical RBAC & Anti-Escalation
- ADR-030: Cross-Service Authorization Consistency
- ADR-031: Ingestion Credential Lifecycle
- ADR-032: Immutable Administrative Audit Trails
- ADR-033: Additive Database Evolution & Bootstrap

---

## 31. Backend Implementation Roadmap

Documented in `docs/admin/12-IMPLEMENTATION_ROADMAP.md`:
- `ADMIN-001` (This milestone — PASS)
- `ADMIN-002` (Approved Schema Migration & Membership Foundation)
- `ADMIN-003` (Tenant, Project & Member REST APIs)
- `ADMIN-004` (Credential, Quota & Retention APIs)
- `ADMIN-005` (Security Hardening & Acceptance)

---

## 32. Console Integration Prerequisites

Before `LOGHUB-CONSOLE-006` can begin:
- `ADMIN-002`, `ADMIN-003`, and `ADMIN-004` must be completed and passing.

---

## 33. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|:---:|:---:|---|
| Breaking existing DB schema | Low | Critical | Additive migration only; zero column changes on existing tables. |
| Credential secret leakage | Low | Critical | Reveal once pattern; SHA-256 verifier storage; automatic log scrubbing. |
| Cross-tenant data breach | Low | Critical | Composite constraints `(tenant_id, id)`; server-side tenancy enforcement. |
| Stale access grants | Low | High | 60s TTL on internal assertions; immediate local session purge. |

---

## 34. Approval Requirements

Milestone `LOGHUB-ADMIN-002` requires formal stakeholder approval of:
1. `docs/admin/10-DATABASE_MIGRATION_PROPOSAL.md`
2. ADR-027 through ADR-033.

---

## 35. Files Created / Modified

### Created Files:
- `docs/admin/01-ADMINISTRATION_ARCHITECTURE.md`
- `docs/admin/02-DOMAIN_AND_DATA_MODEL.md`
- `docs/admin/03-RBAC_PERMISSION_MATRIX.md`
- `docs/admin/04-IDENTITY_AND_MEMBERSHIP.md`
- `docs/admin/05-INGESTION_CREDENTIAL_LIFECYCLE.md`
- `docs/admin/06-TENANT_PROJECT_LIFECYCLE.md`
- `docs/admin/07-QUOTAS_AND_RETENTION.md`
- `docs/admin/08-ADMIN_API_CONTRACTS.md`
- `docs/admin/09-SECURITY_THREAT_MODEL.md`
- `docs/admin/10-DATABASE_MIGRATION_PROPOSAL.md`
- `docs/admin/11-TESTING_AND_ACCEPTANCE.md`
- `docs/admin/12-IMPLEMENTATION_ROADMAP.md`
- `contracts/admin/v1/openapi.yaml`
- `contracts/admin/v1/error.schema.json`
- `contracts/admin/v1/tenant-request.schema.json`
- `contracts/admin/v1/tenant-response.schema.json`
- `contracts/admin/v1/project-request.schema.json`
- `contracts/admin/v1/project-response.schema.json`
- `contracts/admin/v1/membership-request.schema.json`
- `contracts/admin/v1/membership-response.schema.json`
- `contracts/admin/v1/credential-request.schema.json`
- `contracts/admin/v1/credential-response.schema.json`
- `contracts/admin/v1/credential-created-response.schema.json`
- `contracts/admin/v1/quota-request.schema.json`
- `contracts/admin/v1/quota-response.schema.json`
- `contracts/admin/v1/retention-request.schema.json`
- `contracts/admin/v1/retention-response.schema.json`
- `contracts/admin/v1/audit-events-response.schema.json`
- `tests/contracts/admin-contracts.test.ts`
- `SKYRA_LOGHUB_ADMIN_001_ARCHITECTURE_REPORT.md` (this document)

### Modified Files:
- `docs/14-ARCHITECTURE_DECISIONS.md` (added ADR-027 to ADR-033)
- `docs/05-PROJECT_TASKS.md` (updated Phase 4 tasks)
- `docs/06-PROJECT_MEMORY.md` (appended ADMIN-001 entry)
- `docs/README.md` (indexed `docs/admin/`)
- `docs/console/08-ADMINISTRATION_BACKEND_GAPS.md` (updated architecture resolution)
- `docs/console/11-PHASE4_IMPLEMENTATION_ROADMAP.md` (updated roadmap flow)

---

## 36. Checks Performed

| Check | Command | Exit Code | Details |
|---|---|:---:|---|
| Admin Contracts Test Suite | `node --experimental-strip-types --test tests/contracts/admin-contracts.test.ts` | 0 | **7 / 7 tests passing** |
| All Contracts Test Suite | `pnpm test:contracts` | 0 | **52 / 52 tests passing across 5 suites** |
| Schema Drift Verification | `pnpm check:schema-sync` | 0 | **0 drift detected** |
| Full Monorepo Regressions | `pnpm test` | 0 | **755 / 755 tests passing across 119 suites** |

---

## 37. Known Limitations

- **No Active Administrative REST APIs Yet:** By explicit architectural boundary, no administrative endpoints are running. They are scheduled for implementation in `LOGHUB-ADMIN-003` and `LOGHUB-ADMIN-004`.
- **Database Schema Unmigrated:** The database schema has not been altered; changes are strictly proposed for execution in `LOGHUB-ADMIN-002`.

---

## 38. ADMIN-002 Readiness

The project is **100% Architecture Ready** for `LOGHUB-ADMIN-002`:
- Proposed schema is fully specified in Prisma DSL.
- Zero breaking changes to existing data models.
- Migration and rollback procedures are documented.

---

## 39. Final Git Status

- **Branch:** `main`
- **Working Tree:** All newly created architecture documents, contracts, and test files are staged/unstaged cleanly in the repository.
- **Zero unapproved commits or pushes.**

---

## 40. Final Verdict

# **FINAL VERDICT: PASS — Architecture Ready**

Task **LOGHUB-ADMIN-001** has satisfied all mission requirements. All architectural specifications, data models, RBAC rules, credential workflows, OpenAPI contracts, and test suites are complete and verified. Work halts at the boundary of `LOGHUB-ADMIN-001` pending approval for `LOGHUB-ADMIN-002`.
