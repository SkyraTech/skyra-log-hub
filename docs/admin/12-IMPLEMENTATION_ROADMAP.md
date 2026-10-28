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

### LOGHUB-ADMIN-002: Authoritative Identity, Membership Foundation & Gate A Preparation (COMPLETED — PASS)
- **Status:** **PASS — Gate A Ready for Approval.**
- **Scope Completed:**
  - Initialized dedicated `apps/admin-service` microservice on port 3300 following Clean Architecture.
  - Implemented authoritative `IdentityService` anchored to `(issuer, subject)`.
  - Implemented `EffectivePermissionResolver` with 5-tier RBAC, 22 capabilities, anti-escalation, and last-owner protection.
  - Implemented `MembershipService` and `BootstrapService` for auditable tenant onboarding.
  - Implemented `TrustedAssertionGuard` for 60s bounded internal assertion verification.
  - Added `AuthoritativeMembershipAdapter` in `apps/console-bff` behind `useAuthoritativeMembership` configuration gate.
  - Prepared reviewed migration package in `docs/admin/migrations/ADMIN-002/` (`migration.sql`, `MIGRATION_REVIEW.md`, `APPROVAL_CHECKLIST.md`).
  - Automated test suite: 48 tests passing in `apps/admin-service`, 54 tests passing in `apps/console-bff`, 802 total monorepo tests passing.
- **Invariants:** Zero database changes made against `skyra_loghub_dev`. Active Prisma schema untouched.

### LOGHUB-ADMIN-002-GATE-B: Controlled Database Migration & Live Integration (STAGE 1A PASSED — STAGE 1B PENDING)
- **Status:** **STAGE 1A VERIFIED (Backup & Restore Certified) — PENDING STAGE 1B HUMAN AUTHORIZATION.**
- **Stage 0 (Completed):** Exact migration fingerprint (`156AE317342CA4690EBF8B74BA501D3BB9998DE83293E0F7295E28B1CA1D07B9`) verified. Read-only target database inspection of `skyra_loghub_dev` on `127.0.0.1:5432` completed. Baseline compatibility confirmed.
- **Stage 1A (Completed):** Live logical backup created via `pg_dump -Fc` (18,122 bytes, SHA-256 `1FA688AD20ECDC6EBF4CBCE5B1F257CEE3BE0DD08F76412FB32ACA83955D7CA2`). Restored into isolated PostgreSQL 18 instance on port 5433 with 100% schema and data parity in 205 ms. Source database `skyra_loghub_dev` remained strictly read-only and unmodified.
- **Stage 1B (Pending Explicit Human Approval):** Apply `docs/admin/migrations/ADMIN-002/migration.sql` to `skyra_loghub_dev`. Verify 9 new tables, 2 enums, 14 foreign keys. Zero operational disruption.
- **Stage 2 (Pending Post-Stage-1B Review):** One-time initial owner bootstrap, activate Prisma persistence in `apps/admin-service`, activate `ADMIN_SERVICE_ENABLED=true` in `apps/console-bff`, run 20-scenario cross-service security test suite.

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
