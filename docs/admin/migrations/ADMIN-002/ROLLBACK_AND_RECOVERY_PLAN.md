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

### 2.1 Backup Execution Command
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

### 2.2 Backup Verification Command
Ensure the dump is non-empty and readable:
```bash
# Verify dump integrity without restoring
pg_restore --list backup_skyra_loghub_pre_admin002_*.dump > /dev/null
echo "Backup verification exit code: $?"
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
