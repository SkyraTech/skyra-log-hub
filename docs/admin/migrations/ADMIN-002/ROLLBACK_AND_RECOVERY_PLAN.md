# ADMIN-002 Database Migration Rollback and Disaster Recovery Plan

**Document ID:** `ADMIN-002-ROLLBACK-RECOVERY-PLAN`  
**Milestone:** `LOGHUB-ADMIN-002-GATE-B-PREFLIGHT`  
**Target Migration:** `20261028000000_add_admin_iam_schema`  
**Target Database:** `skyra_loghub_dev` / Production PostgreSQL  
**Status:** VALIDATED PREFLIGHT RECOVERY RUNBOOK

---

## 1. Scope and Principles

This document defines the operational procedures for:
1. Pre-migration backup and snapshot validation.
2. In-flight failure abort and rollback.
3. Post-migration recovery scenarios (immediate vs. post-provisioning).
4. Forward-fix strategies.

> [!CAUTION]
> Dropping newly created IAM tables after user accounts, memberships, and credentials have been provisioned in production causes permanent identity and security metadata loss. A post-deployment table drop must **never** be treated as a routine rollback.

---

## 2. Pre-Migration Backup Procedure

Before executing Gate B migration on any target database, a full, consistent pre-migration logical backup must be captured and verified.

### 2.1 Verified Pre-Migration Backup Artifact (Stage 1A Rehearsal)

The pre-migration backup for `skyra_loghub_dev` was executed and certified during milestone `LOGHUB-ADMIN-002-GATE-B-STAGE-1A`:
- **Artifact Path:** `C:\Users\jetti\.gemini\antigravity-ide\brain\71a6602c-0719-497d-b8ea-32065da7e315\backups\skyra_loghub_dev_pre_admin002_20261028051943.dump`
- **Format:** PostgreSQL Custom Binary Archive (`-Fc`)
- **File Size:** 18,122 bytes
- **SHA-256 Checksum:** `1FA688AD20ECDC6EBF4CBCE5B1F257CEE3BE0DD08F76412FB32ACA83955D7CA2`
- **Capture Duration:** 458 ms (Exit code: 0)
- **TOC Entries:** 39 entries verified via `pg_restore --list`

### 2.2 Rehearsed Restore Execution Metrics
The backup was restored into an isolated PostgreSQL 18 cluster on port 5433 (`skyra_loghub_restore_rehearsal`):
- **Restore Command:** `pg_restore -h 127.0.0.1 -p 5433 -U skyra_isolated_user -d skyra_loghub_restore_rehearsal --no-owner --role=skyra_isolated_user --exit-on-error <dumpfile>`
- **Restore Duration:** 205 ms
- **Exit Code:** `0` (Zero errors, zero warnings)
- **Catalog Parity:** 100% parity across tables, columns, constraints, indexes, enums, migrations, and row counts.

### 2.3 Standby Backup Command (For Future Production Migrations)
```bash
# Capture full custom-format dump including schema, data, and constraints
pg_dump \
  --host=127.0.0.1 \
  --port=5432 \
  --username=skyra_loghub_user \
  --dbname=skyra_loghub_dev \
  --format=custom \
  --file="backup_skyra_loghub_pre_admin002_$(date +%Y%m%d_%H%M%S).dump" \
  --verbose
```

---

## 3. Recovery Scenarios and Decision Matrix

```
                     Migration Execution Started
                                 │
                     Did Migration SQL Succeed?
                                ╱ ╲
                             No    Yes
                            ╱        ╲
             [Scenario A: Failure]   [Gate B Applied]
             Transaction Aborted     Has New IAM Data Been Written?
             Zero DB State Changed               ╱ ╲
                                              No    Yes
                                             ╱        ╲
                              [Scenario B: Day 0]     [Scenario C: Day 1+]
                              Immediate Rollback      Forward-Fix ONLY
                              Run down.sql            Never drop tables!
```

---

## 4. Scenario A: In-Flight Failure (Pre-Commit)

The migration `20261028000000_add_admin_iam_schema` executes inside an atomic transactional block (`BEGIN; ... COMMIT;`).

- **Trigger:** Syntax error, lock timeout, connection termination, or disk exhaustion during `prisma migrate deploy`.
- **Database Behavior:** PostgreSQL automatically issues `ROLLBACK`.
- **Impact:** Zero schema changes are committed. The `_prisma_migrations` table is not updated or is marked as failed.
- **Recovery Action:**
  1. Inspect migration logs for error code.
  2. If lock timeout occurred, inspect blocking transactions:
     ```sql
     SELECT pid, usename, query, state, age(clock_timestamp(), query_start) 
     FROM pg_stat_activity 
     WHERE state != 'idle' AND pid <> pg_backend_pid();
     ```
  3. Resolve blockers and retry migration.

---

## 5. Scenario B: Immediate Post-Deployment Rollback (Zero User Data)

If Gate B was committed, but immediate post-deployment smoke tests fail **before** any users, invitations, or audit events are created:

### 5.1 Rollback SQL Script (`down.sql`)
Execute against the target database:
```sql
BEGIN;

-- Drop foreign keys and dependent IAM tables in reverse dependency order
DROP TABLE IF EXISTS "admin_audit_events" CASCADE;
DROP TABLE IF EXISTS "invitations" CASCADE;
DROP TABLE IF EXISTS "project_membership_roles" CASCADE;
DROP TABLE IF EXISTS "tenant_membership_roles" CASCADE;
DROP TABLE IF EXISTS "project_memberships" CASCADE;
DROP TABLE IF EXISTS "tenant_memberships" CASCADE;
DROP TABLE IF EXISTS "user_identities" CASCADE;
DROP TABLE IF EXISTS "users" CASCADE;
DROP TABLE IF EXISTS "system_settings" CASCADE;

-- Drop newly added enums
DROP TYPE IF EXISTS "InvitationStatus";
DROP TYPE IF EXISTS "MembershipStatus";

-- Remove migration record from Prisma history
DELETE FROM "_prisma_migrations" 
WHERE "migration_name" = '20261028000000_add_admin_iam_schema';

COMMIT;
```

### 5.2 Verification of Rollback
```sql
-- Verify exactly 7 operational tables remain
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;
```
Expected output:
- `_prisma_migrations`
- `archive_segments`
- `deduplication_receipts`
- `ingestion_checkpoints`
- `ingestion_credentials`
- `project_quotas`
- `projects`
- `tenants`

---

## 6. Scenario C: Production Rollback with Existing IAM Data (Forward-Fix Only)

If the administration service has been operating in production and has created live users, memberships, and audit trails:
- **Rule:** `down.sql` (dropping tables) is **STRICTLY PROHIBITED**.
- **Strategy:**
  1. **Disable Service Traffic:** Set `ADMIN_SERVICE_ENABLED=false` in Console BFF to deactivate authoritative membership checks and fall back to cached/configured roles.
  2. **Preserve Data:** Keep all tables intact.
  3. **Develop Forward-Fix Migration:** Author an additive corrective migration (e.g., `20261029000000_patch_admin_iam_constraints.sql`) to resolve defects without data loss.

---

## 7. Operational Readiness Checklist

- [x] Pre-migration backup command defined and tested.
- [x] Rollback script `down.sql` prepared and verified for exact reverse dependency order.
- [x] Forward-fix strategy explicitly mandated for post-provisioning defects.
- [x] Prisma migration tracking table rollback statement verified.
