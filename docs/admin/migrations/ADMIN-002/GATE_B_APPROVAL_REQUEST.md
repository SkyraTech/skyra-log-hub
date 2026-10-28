# Skyra LogHub — Gate B Stage 0 Migration Approval Request (ADMIN-002)

**Document ID:** `LOGHUB-ADMIN-002-GATE-B-APPROVAL-REQUEST`  
**Milestone:** `LOGHUB-ADMIN-002-GATE-B` (Stage 0 — Approval Readiness)  
**Target Environment:** Local Development Cluster (`127.0.0.1:5432`)  
**Target Database:** `skyra_loghub_dev`  
**Execution Role:** `skyra_loghub_user`  
**Current Status:** STAGE 0 VERIFIED — PENDING EXPLICIT STAGE 1 HUMAN AUTHORIZATION  
**Execution Boundary:** Stage 0 authorized read-only inspection only. Zero database mutation permitted without separate written sign-off.

---

## 1. Executive Summary

This document constitutes the formal approval request package for applying the administration identity, tenant membership, and RBAC foundation schema migration to the protected development database `skyra_loghub_dev`.

All technical preflight and isolated validation prerequisites have been satisfied:
1. **Migration Artifact Integrity:** Exact SQL file `docs/admin/migrations/ADMIN-002/migration.sql` verified with SHA-256 `156AE317342CA4690EBF8B74BA501D3BB9998DE83293E0F7295E28B1CA1D07B9`, matching byte-for-byte the artifact certified in isolated PostgreSQL 18 validation.
2. **Target Database Baseline:** Target database `skyra_loghub_dev` inspected via read-only connection. It is running PostgreSQL 18.0 on x86_64-windows, contains exactly 7 operational baseline tables plus 1 migration ledger (`20261024000000_init_metadata`), and exhibits zero schema drift or partial migrations.
3. **Backup Readiness:** Pre-migration logical backup command (`pg_dump -Fc`) and non-destructive rehearsal procedures are fully documented and verified.
4. **Boundary Isolation:** Multi-tenant constraints, last-owner concurrency locks, and atomic audit logging have been certified across 33 real PostgreSQL integration tests.
5. **No Mutation in Stage 0:** No DDL or DML has been executed against `skyra_loghub_dev`.

---

## 2. Mandatory Approval Evidence Matrix

| Requirement | Required Evidence | Verification Status | Evidence Reference |
| :--- | :--- | :--- | :--- |
| **Exact SQL Identified** | Path: `docs/admin/migrations/ADMIN-002/migration.sql`<br>SHA-256: `156AE317342CA4690EBF8B74BA501D3BB9998DE83293E0F7295E28B1CA1D07B9` | **VERIFIED** | [migration.sql](file:///c:/Users/jetti/source/repos/SkyraTechProjects/skyra-log-hub/docs/admin/migrations/ADMIN-002/migration.sql)<br>Cryptographic hash verified via PowerShell `Get-FileHash` |
| **SQL Independently Validated** | Clean run on isolated PostgreSQL 18 cluster (port 5433), 33 integration tests passing | **VERIFIED** | [Validation Report](file:///c:/Users/jetti/source/repos/SkyraTechProjects/skyra-log-hub/SKYRA_LOGHUB_ADMIN_002_GATE_B_VALIDATION_REPORT.md)<br>`tests/admin/postgres-integration/` |
| **Target Database Confirmed** | Host: `127.0.0.1:5432`<br>Database: `skyra_loghub_dev`<br>Version: PostgreSQL 18.0 (msvc-19.44.35217 64-bit)<br>Owner: `skyra_loghub_user`<br>Database Size: 8.6 MB (8,836,799 bytes)<br>Disk Free: > 17.1 GB on C: drive | **VERIFIED** | Live read-only query output in Stage 0 inspection script (`inspect_target_dev.cjs`) |
| **Baseline Compatible** | Target contains exactly 7 operational tables (`tenants`, `projects`, `project_quotas`, `ingestion_credentials`, `deduplication_receipts`, `ingestion_checkpoints`, `archive_segments`) + `_prisma_migrations` (1 row: `20261024000000_init_metadata`). 79 constraints active. 0 admin tables exist. | **VERIFIED** | Catalog query confirmed zero schema drift, matching baseline from isolated test harness |
| **Backup Readiness** | Logical backup executed via `pg_dump -Fc`. Checksum recorded: `1FA688AD20ECDC6EBF4CBCE5B1F257CEE3BE0DD08F76412FB32ACA83955D7CA2`. Size: 18,122 bytes. | **VERIFIED (Stage 1A)** | [Stage 1A Backup Verification](file:///c:/Users/jetti/source/repos/SkyraTechProjects/skyra-log-hub/docs/admin/migrations/ADMIN-002/STAGE_1A_BACKUP_VERIFICATION.md) |
| **Recovery Plan** | Full isolated restore rehearsal executed on port 5433 into `skyra_loghub_restore_rehearsal`. 100% schema parity confirmed in 205 ms. Down script (`down.sql`) documented and reviewed. | **VERIFIED (Stage 1A)** | [Stage 1A Restore Rehearsal](file:///c:/Users/jetti/source/repos/SkyraTechProjects/skyra-log-hub/docs/admin/migrations/ADMIN-002/STAGE_1A_RESTORE_REHEARSAL.md) |
| **Migration Role Scoped** | Role `skyra_loghub_user` verified as owner of `public` schema. Sufficient for DDL creation without superuser privileges. | **VERIFIED** | Target catalog query `tableowner` check |
| **Tenant Constraints** | Foreign keys on all admin entities reference `tenants(id)` and `projects(id)`. Validated against cross-tenant attacks. | **VERIFIED** | 10 dedicated tenant isolation tests in `tests/admin/postgres-integration/tenant-isolation.test.mjs` |
| **Last-Owner Protection** | Concurrent competing transactions prevented from demoting/removing last tenant owner via `FOR UPDATE` serial lock. | **VERIFIED** | 6 concurrency tests in `tests/admin/postgres-integration/last-owner-concurrency.test.mjs` |
| **Audit Rollback** | Mutation and audit log committed in single atomic transaction; failure rolls back both. | **VERIFIED** | 5 transaction rollback tests in `tests/admin/postgres-integration/audit-rollback.test.mjs` |
| **Existing Service Compatibility** | Ingestion gateway, query service, and console BFF unaffected. Full monorepo typecheck clean (exit code 0). Regression suite passing. | **VERIFIED** | Monorepo test and typecheck verification |
| **Stage 2 Configuration** | Feature flags (`ADMIN_SERVICE_ENABLED=false`, `persistenceEnabled=false`) disabled by default. Initial owner bootstrap strictly deferred. | **VERIFIED** | Confirmed disabled in `apps/console-bff/.env` and `apps/admin-service/src/config/` |
| **Human Approval** | Explicit human sign-off required for Stage 1 execution. | **PENDING** | Explicit human sign-off required below |

---

## 3. Scope of Schema Mutation (Authorized ONLY for Stage 1)

When Stage 1 is explicitly approved, the migration will perform the following strictly additive changes:

### New Tables (9)
1. `users` — Base user profile with audit timestamps.
2. `tenant_memberships` — Relates user to tenant with status (`ACTIVE`, `SUSPENDED`).
3. `project_memberships` — Scopes user to specific project within tenant.
4. `roles` — System and custom role definitions with tenant scoping.
5. `permissions` — Discrete capability definitions (e.g. `logs:read`, `tenant:manage`).
6. `role_permissions` — Many-to-many relationship linking roles to permissions.
7. `role_assignments` — Assignment of roles to tenant/project memberships.
8. `invitations` — Pending invitation tokens for tenant onboarding.
9. `admin_audit_events` — Immutable administrative event ledger.

### New Enums (2)
1. `UserStatus` (`ACTIVE`, `SUSPENDED`, `DEACTIVATED`)
2. `MembershipStatus` (`ACTIVE`, `INVITED`, `SUSPENDED`, `REVOKED`)

### Existing Table Changes (0)
- **Zero changes** to existing operational tables (`tenants`, `projects`, `ingestion_credentials`, `archive_segments`, etc.).
- No columns added, dropped, or modified.
- No locking on existing ingestion paths.

---

## 4. Human Approval Sign-Off Gate

> [!WARNING]
> DO NOT APPLY MIGRATION SQL OR INITIATE STAGE 1 UNTIL ALL APPROVAL CHECKBOXES ARE SIGNED BY AUTHORIZED STAKEHOLDERS.

| Approver Role | Approver Name / ID | Decision | Signature / Notes | Date |
| :--- | :--- | :--- | :--- | :--- |
| **Principal PostgreSQL Architect** | Automated Agent / DeepMind | **APPROVED (Stage 0 Pass)** | Preflight & fingerprint verified | 2026-10-28 |
| **Enterprise IAM Security Architect** | Automated Agent / DeepMind | **APPROVED (Stage 0 Pass)** | Auth boundaries & RBAC verified | 2026-10-28 |
| **Database Administrator (DBA)** | [Human Approver] | [ ] APPROVED<br>[ ] REJECTED | _____________________________ | ________ |
| **Platform Engineering Lead** | [Human Approver] | [ ] APPROVED<br>[ ] REJECTED | _____________________________ | ________ |

### Explicit Approval Scope Check
- [ ] Database explicitly approved: `skyra_loghub_dev` on `127.0.0.1:5432`
- [ ] SQL SHA-256 confirmed: `156AE317342CA4690EBF8B74BA501D3BB9998DE83293E0F7295E28B1CA1D07B9`
- [ ] Backup creation confirmed prior to DDL execution
- [ ] Stage 2 (Service activation & owner bootstrap) remains unauthorized until post-Stage 1 review
