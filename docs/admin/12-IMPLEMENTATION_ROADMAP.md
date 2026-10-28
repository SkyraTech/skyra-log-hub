# Skyra LogHub — Administration Backend Implementation Roadmap

**Document Version:** 1.0.0  
**Status:** Approved Architecture Specification  
**Task ID:** `LOGHUB-ADMIN-001`  
**Phase:** Phase 4 — Administration Backend Foundation  
**Date:** 2026-10-28  

---

## 1. Phased Milestone Sequencing

To ensure strict database safety, contract discipline, and zero breaking changes across existing ingestion and query workloads, the administration capability is executed across distinct, auditable milestones:

```text
LOGHUB-ADMIN-001: Architecture, Security Modeling & Versioned OpenAPI Contracts [THIS MILESTONE - PASS]
         │
         ▼
[Approval Gate: Review Proposed Schema Extensions & Migration Strategy]
         │
         ▼
LOGHUB-ADMIN-002: Approved Prisma Migration, IAM Entities & Authoritative Membership Provider
         │
         ▼
LOGHUB-ADMIN-003: Tenant, Project & User Membership Management REST APIs
         │
         ▼
LOGHUB-ADMIN-004: Ingestion Credential Lifecycle, Quota & Retention APIs
         │
         ▼
LOGHUB-ADMIN-005: Security Hardening, STRIDE Negative Testing & Backend Acceptance
         │
         ▼
LOGHUB-CONSOLE-006: Angular Administration Workstation (Projects, Credentials, Team RBAC)
         │
         ▼
LOGHUB-CONSOLE-007: Performance, Accessibility & Playwright E2E Hardening
         │
         ▼
LOGHUB-CONSOLE-008: Phase 4 Final Operational Acceptance
```

---

## 2. Milestone Detailed Scope

### LOGHUB-ADMIN-001: Architecture, RBAC & Contracts (CURRENT)
- **Status:** **PASS — Architecture Ready.**
- **Scope:** 12 architectural specifications in `docs/admin/`, 7 new ADRs (ADR-027 to ADR-033), OpenAPI 3.1 contracts in `contracts/admin/v1/`, contract verification test suite, and implementation report.
- **Invariants:** Zero database changes, zero CRUD endpoints implemented.

### LOGHUB-ADMIN-002: Approved Schema Migration & Membership Foundation
- **Prerequisite:** Approval of `docs/admin/10-DATABASE_MIGRATION_PROPOSAL.md`.
- **Target:** Execute additive Prisma migration in `apps/ingestion-gateway` and `apps/query-service`.
- **Scope:**
  - Create tables: `users`, `tenant_memberships`, `project_memberships`, `roles`, `permissions`, `role_permissions`, `role_assignments`, `invitations`, `admin_audit_events`.
  - Seed baseline system roles (`OrgOwner`, `OrgAdmin`, `ProjectAdmin`, `Developer`, `Viewer`) and permissions.
  - Implement PostgreSQL-backed `MembershipService` in `apps/console-bff` replacing development fixtures.
- **Verification:** Unit tests for user identity resolution, membership state machine, and fail-closed behavior.

### LOGHUB-ADMIN-003: Tenant, Project & Membership Management APIs
- **Target:** Deliver core organizational REST APIs.
- **Scope:**
  - Initialize `apps/admin-service` NestJS application.
  - Implement `/admin/v1/tenants`, `/admin/v1/projects`, and `/admin/v1/members`.
  - Enforce server-side RBAC guards and anti-escalation policies.
  - Integrate transactional `AdminAuditEvent` recording.
- **Verification:** Controller unit tests, integration tests with PostgreSQL, and RFC 7807 problem details.

### LOGHUB-ADMIN-004: Credential, Quota & Retention APIs
- **Target:** Deliver machine credential and operational configuration APIs.
- **Scope:**
  - Implement `/admin/v1/projects/{projectId}/credentials` (create with one-time secret, rotate with overlap, revoke).
  - Implement `/admin/v1/projects/{projectId}/quotas` with instant admission propagation.
  - Implement `/admin/v1/projects/{projectId}/retention` with destructive action safeguards.
- **Verification:** Full compatibility verification against `apps/ingestion-gateway` SHA-256 verifier.

### LOGHUB-ADMIN-005: Security Hardening & Backend Acceptance
- **Target:** Execute all 40 quality gate scenarios.
- **Scope:** Negative security testing, cross-tenant isolation verification, concurrency conflict testing, and monorepo regression gate.

### LOGHUB-CONSOLE-006: Angular Administration Workstation
- **Prerequisite:** Completion of `LOGHUB-ADMIN-003` and `LOGHUB-ADMIN-004`.
- **Target:** Build the Angular 19 administrative screens:
  - Project Management (`/projects`)
  - Ingestion Credentials (`/ingestion`)
  - Team & Access Control (`/team`)
