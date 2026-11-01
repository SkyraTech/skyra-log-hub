# Skyra LogHub — Post-Migration Database Integrity Verification Checklist
## Milestone LOGHUB-ADMIN-002-GATE-B-STAGE-2 (Non-Destructive Post-Migration Audit)

**Document Identifier:** `ADMIN-002-POST-MIGRATION-VERIFICATION`  
**Milestone:** `LOGHUB-ADMIN-002-GATE-B-STAGE-2`  
**Phase:** Phase 4 — Administration Backend Foundation  
**Classification:** Post-Execution Verification Standard Operating Procedure (SOP)  
**Target Environment:** Local Development Database (`skyra_loghub_dev`)  
**Target Host & Port:** `127.0.0.1:5432`  
**Date:** October 30, 2026  

---

> [!NOTE]
> This checklist defines the exact read-only queries and verification steps to be executed immediately following the separately authorized execution of Stage 2B.
> None of the queries below perform data modification (DML) or schema alteration (DDL).

---

## 1. Catalog Inventory Verification (Tables & Views)

Run against `skyra_loghub_dev`:
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;
```

### Expected Result: Exactly 17 Base Tables
- [ ] `_prisma_migrations` (Baseline)
- [ ] `admin_audit_events` (**NEW Administration**)
- [ ] `archive_segments` (Baseline)
- [ ] `deduplication_receipts` (Baseline)
- [ ] `ingestion_checkpoints` (Baseline)
- [ ] `ingestion_credentials` (Baseline)
- [ ] `invitations` (**NEW Administration**)
- [ ] `permissions` (**NEW Administration**)
- [ ] `project_memberships` (**NEW Administration**)
- [ ] `project_quotas` (Baseline)
- [ ] `projects` (Baseline)
- [ ] `role_assignments` (**NEW Administration**)
- [ ] `role_permissions` (**NEW Administration**)
- [ ] `roles` (**NEW Administration**)
- [ ] `tenant_memberships` (**NEW Administration**)
- [ ] `tenants` (Baseline)
- [ ] `users` (**NEW Administration**)

**Verification Criteria:**
- Total count is exactly `17`.
- All 8 baseline tables remain intact.
- All 9 new administration tables exist.

---

## 2. PostgreSQL Enumeration Types Verification

Run:
```sql
SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS enum_values
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
GROUP BY t.typname
ORDER BY t.typname;
```

### Expected Result: Exactly 4 Enums
- [ ] `MembershipStatus`: `['PENDING_INVITE', 'ACTIVE', 'SUSPENDED', 'REVOKED']` (**NEW**)
- [ ] `ProjectStatus`: `['ACTIVE', 'SUSPENDED', 'ARCHIVED']` (Baseline)
- [ ] `TenantStatus`: `['ACTIVE', 'SUSPENDED', 'DECOMMISSIONED']` (Baseline)
- [ ] `UserStatus`: `['ACTIVE', 'SUSPENDED', 'DEACTIVATED']` (**NEW**)

---

## 3. Foreign Key Constraint Topology Verification

Run:
```sql
SELECT 
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.delete_rule,
    rc.update_rule
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.referential_constraints AS rc
  ON tc.constraint_name = rc.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
ORDER BY tc.table_name, kcu.column_name;
```

### Expected Result: Exactly 18 Foreign Keys (4 Baseline + 14 Administration)

#### Baseline Foreign Keys (4):
- [ ] `archive_segments.project_id` -> `projects(id)` (`CASCADE`)
- [ ] `ingestion_credentials.tenant_id` -> `tenants(id)` (`CASCADE`)
- [ ] `project_quotas.project_id` -> `projects(id)` (`CASCADE`)
- [ ] `projects.tenant_id` -> `tenants(id)` (`CASCADE`)

#### Administration Foreign Keys (14):
- [ ] `admin_audit_events.actor_user_id` -> `users(id)` (`SET NULL`)
- [ ] `admin_audit_events.tenant_id` -> `tenants(id)` (`CASCADE`)
- [ ] `invitations.invited_by_user_id` -> `users(id)` (`SET NULL`)
- [ ] `invitations.tenant_id` -> `tenants(id)` (`CASCADE`)
- [ ] `project_memberships.project_id` -> `projects(id)` (`CASCADE`)
- [ ] `project_memberships.tenant_membership_id` -> `tenant_memberships(id)` (`CASCADE`)
- [ ] `role_assignments.assigned_by_user_id` -> `users(id)` (`SET NULL`)
- [ ] `role_assignments.project_id` -> `projects(id)` (`CASCADE`)
- [ ] `role_assignments.role_id` -> `roles(id)` (`CASCADE`)
- [ ] `role_assignments.tenant_id` -> `tenants(id)` (`CASCADE`)
- [ ] `role_assignments.user_id` -> `users(id)` (`CASCADE`)
- [ ] `role_permissions.permission_id` -> `permissions(id)` (`CASCADE`)
- [ ] `role_permissions.role_id` -> `roles(id)` (`CASCADE`)
- [ ] `tenant_memberships.tenant_id` -> `tenants(id)` (`CASCADE`)
- [ ] `tenant_memberships.user_id` -> `users(id)` (`CASCADE`)

---

## 4. Index & Uniqueness Constraint Verification

Run:
```sql
SELECT 
    schemaname, 
    tablename, 
    indexname, 
    indexdef 
FROM pg_indexes 
WHERE schemaname = 'public' 
ORDER BY tablename, indexname;
```

### Expected Result: Exactly 31 Indexes (16 Baseline + 15 Administration)

#### Mandatory Security & Integrity Indexes:
- [ ] `uq_users_issuer_subject`: `UNIQUE INDEX ON users (issuer, subject)` (Prevents cross-IdP impersonation)
- [ ] `uq_users_email`: `UNIQUE INDEX ON users (email)`
- [ ] `uq_tenant_memberships_tenant_user`: `UNIQUE INDEX ON tenant_memberships (tenant_id, user_id)`
- [ ] `uq_project_memberships_project_member`: `UNIQUE INDEX ON project_memberships (project_id, tenant_membership_id)`
- [ ] `uq_roles_name`: `UNIQUE INDEX ON roles (name)`
- [ ] `uq_permissions_name`: `UNIQUE INDEX ON permissions (name)`
- [ ] `uq_role_permissions_role_perm`: `UNIQUE INDEX ON role_permissions (role_id, permission_id)`
- [ ] `uq_role_assignments_scope`: `UNIQUE INDEX ON role_assignments (tenant_id, user_id, role_id, COALESCE(project_id, '00000000-0000-0000-0000-000000000000'))`
- [ ] `uq_invitations_token_hash`: `UNIQUE INDEX ON invitations (token_hash)`
- [ ] `idx_audit_tenant_created`: `INDEX ON admin_audit_events (tenant_id, created_at DESC)`

---

## 5. Prisma Migration History Ledger Check

Run:
```sql
SELECT 
    id, 
    migration_name, 
    checksum, 
    finished_at, 
    applied_steps_count, 
    rolled_back_at 
FROM "_prisma_migrations" 
ORDER BY finished_at ASC;
```

### Expected Result: Exactly 2 Ledger Records
- [ ] Row 1: `20261024000000_init_metadata` (`finished_at IS NOT NULL`, `applied_steps_count = 1`, `rolled_back_at IS NULL`)
- [ ] Row 2: `20261028000000_admin_iam_foundation` (`finished_at IS NOT NULL`, `applied_steps_count = 1`, `rolled_back_at IS NULL`)

---

## 6. Baseline Data Preservation Check

Run:
```sql
SELECT 
    (SELECT COUNT(*) FROM tenants) AS tenants_count,
    (SELECT COUNT(*) FROM projects) AS projects_count,
    (SELECT COUNT(*) FROM ingestion_credentials) AS credentials_count,
    (SELECT COUNT(*) FROM archive_segments) AS segments_count,
    (SELECT COUNT(*) FROM deduplication_receipts) AS receipts_count,
    (SELECT COUNT(*) FROM ingestion_checkpoints) AS checkpoints_count,
    (SELECT COUNT(*) FROM project_quotas) AS quotas_count;
```

### Expected Result:
- [ ] All baseline operational table counts match the pre-migration baseline exactly (0 rows in development baseline).
- [ ] No existing rows modified or corrupted.

---

## 7. Application Invariant & Flag Check

Verify that runtime administrative capabilities remain locked in Gate A mode:
- [ ] `ADMIN_SERVICE_ENABLED = false` in service configuration.
- [ ] `apps/console-bff`: `AuthoritativeMembershipAdapter` continues to fail closed for production calls.
- [ ] Zero user bootstrap records created in `users` or `tenant_memberships`.
- [ ] Ingestion endpoint `/ingest/v1/logs` remains 100% operational and unaffected.
- [ ] Query proxy `/bff/query/*` remains 100% operational and unaffected.

---

## 8. Verification Sign-Off Table

| Verification Check | Query / Command Executed | Expected State | Actual State | Verified By | Date |
|---|---|:---:|:---:|---|---|
| Catalog Tables (17) | `information_schema.tables` | 17 tables | Pending Stage 2B | Pending | Pending |
| Enum Types (4) | `pg_type`, `pg_enum` | 4 enums | Pending Stage 2B | Pending | Pending |
| Foreign Keys (18) | `information_schema.table_constraints` | 18 FKs | Pending Stage 2B | Pending | Pending |
| Indexes (31) | `pg_indexes` | 31 indexes | Pending Stage 2B | Pending | Pending |
| Prisma History (2) | `_prisma_migrations` | 2 migrations | Pending Stage 2B | Pending | Pending |
| Baseline Data | `SELECT COUNT(*)` on operational tables | 0 rows / match baseline | Pending Stage 2B | Pending | Pending |
| Service Invariants | Config & Adapter checks | Flags disabled | Pending Stage 2B | Pending | Pending |

