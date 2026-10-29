# Skyra LogHub — Protected Migration Execution & Recovery Runbook (ADMIN-002)

**Document Identifier:** `ADMIN-002-MIGRATION-EXECUTION-AND-RECOVERY-RUNBOOK`  
**Milestone:** `LOGHUB-ADMIN-002-GATE-B-STAGE-1B`  
**Phase:** Phase 4 — Administration Backend Foundation  
**Classification:** Standard Operating Procedure (SOP) & Disaster Recovery Runbook  
**Target Environment:** Local Development Database (`skyra_loghub_dev`)  
**Target Host & Port:** `127.0.0.1:5432`  
**Target Role:** `skyra_loghub_user`  
**Target Migration:** `20261028000000_admin_iam_foundation` (`migration.sql`)  
**Date:** October 2026  

---

> [!CAUTION]
> **DO NOT EXECUTE THIS RUNBOOK WITHOUT EXPLICIT WRITTEN HUMAN AUTHORIZATION.**  
> Preflight verification DOES NOT constitute permission to execute mutations against `skyra_loghub_dev`.  
> Stage 1 is restricted purely to applying DDL to the target database. Zero user bootstrapping or membership activation is permitted during Stage 1.

---

## 1. Preconditions & Go/No-Go Checklist

Before executing any migration commands, the operator must verify:

| Step | Check Item | Required State | Pass/Fail |
|---|---|---|:---:|
| 1.1 | **Explicit Written Approval** | Stakeholder sign-off on `ADMIN_002_PROTECTED_MIGRATION_APPROVAL_PACKET.md` | Required |
| 1.2 | **Target Host & Port** | `127.0.0.1:5432` confirmed | Required |
| 1.3 | **Target Database** | `skyra_loghub_dev` confirmed via read-only SQL | Required |
| 1.4 | **Target User** | `skyra_loghub_user` (owner of `public` schema) | Required |
| 1.5 | **Durable Backup Verified** | `C:\Users\jetti\.skyra\backups\skyra_loghub_dev_pre_admin002_20261028051943.dump` exists, size 18,122 bytes, SHA-256: `1FA688AD20ECDC6EBF4CBCE5B1F257CEE3BE0DD08F76412FB32ACA83955D7CA2` | Required |
| 1.6 | **Migration File Integrity** | `docs/admin/migrations/ADMIN-002/migration.sql` SHA-256: `156AE317342CA4690EBF8B74BA501D3BB9998DE83293E0F7295E28B1CA1D07B9` | Required |
| 1.7 | **Active Connections** | No long-running uncommitted transactions holding locks on `tenants` or `projects` | Required |

---

## 2. Target Database Identity Pre-Flight Check

Run the following command immediately before migration:
```bash
psql -h 127.0.0.1 -p 5432 -U skyra_loghub_user -d skyra_loghub_dev -c "SELECT current_database() as db, current_user as usr, inet_server_port() as port, version();"
```
**Abort Condition:** If `db != 'skyra_loghub_dev'` or `port != 5432`, **STOP IMMEDIATELY**.

---

## 3. Migration Execution Procedure

### Option A: Native Prisma Migration Workflow (Recommended)

1. Verify migration directory setup:
   Copy migration into Prisma migrations folder:
   ```powershell
   New-Item -ItemType Directory -Force -Path "apps/ingestion-gateway/prisma/migrations/20261028000000_admin_iam_foundation"
   Copy-Item "docs/admin/migrations/ADMIN-002/migration.sql" "apps/ingestion-gateway/prisma/migrations/20261028000000_admin_iam_foundation/migration.sql"
   ```
2. Execute migration deployment:
   ```bash
   pnpm --filter @skyra/ingestion-gateway exec prisma migrate deploy
   ```
   *This applies `migration.sql` transactionally and records migration entry in `_prisma_migrations` atomically.*

### Option B: Direct PSQL Execution with Ledger Resolution

1. Execute SQL script with strict error handling:
   ```bash
   psql -h 127.0.0.1 -p 5432 -U skyra_loghub_user -d skyra_loghub_dev -v ON_ERROR_STOP=1 -f docs/admin/migrations/ADMIN-002/migration.sql
   ```
2. Confirm exit code is `0`.
3. Register migration in Prisma ledger without arbitrary manual SQL:
   ```bash
   pnpm --filter @skyra/ingestion-gateway exec prisma migrate resolve --applied 20261028000000_admin_iam_foundation
   ```

---

## 4. Post-Migration Verification Checklist

Immediately after execution, run:
```bash
psql -h 127.0.0.1 -p 5432 -U skyra_loghub_user -d skyra_loghub_dev -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"
```
### Required Verification Criteria
1. **Table Count:** Exactly **17 base tables** (8 baseline + 9 administration):
   - `_prisma_migrations`
   - `admin_audit_events` (NEW)
   - `archive_segments`
   - `deduplication_receipts`
   - `ingestion_checkpoints`
   - `ingestion_credentials`
   - `invitations` (NEW)
   - `permissions` (NEW)
   - `project_memberships` (NEW)
   - `project_quotas`
   - `projects`
   - `role_assignments` (NEW)
   - `role_permissions` (NEW)
   - `roles` (NEW)
   - `tenant_memberships` (NEW)
   - `tenants`
   - `users` (NEW)
2. **Prisma Ledger State:**
   ```sql
   SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY finished_at;
   ```
   Must display 2 completed rows:
   - `20261024000000_init_metadata`
   - `20261028000000_admin_iam_foundation`
3. **Enum Verification:**
   Verify `UserStatus` and `MembershipStatus` exist in `pg_type`.
4. **Baseline Invariant:**
   Zero changes to rows in `tenants`, `projects`, `ingestion_credentials`, `project_quotas`, etc.

---

## 5. Rollback & Recovery Runbook

### Scenario A: Migration Fails Mid-Execution (Transaction Rollback)
- **Behavior:** PostgreSQL DDL is transactional. If any error occurs, PostgreSQL automatically aborts the transaction.
- **Action:**
  1. Inspect the error message.
  2. Verify catalog state: `SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';`.
  3. If table count is 8, database remains untouched.
  4. Do not retry without investigating root cause.

### Scenario B: Post-Migration Defect Detected (Clean DDL Rollback)
If migration succeeded but runtime issues or integration defects require rolling back:
1. Execute the validated down script:
   ```bash
   psql -h 127.0.0.1 -p 5432 -U skyra_loghub_user -d skyra_loghub_dev -v ON_ERROR_STOP=1 -f docs/admin/migrations/ADMIN-002/down.sql
   ```
2. Rollback Prisma ledger record:
   ```bash
   pnpm --filter @skyra/ingestion-gateway exec prisma migrate resolve --rolled-back 20261028000000_admin_iam_foundation
   ```
3. Verify table count returns to exactly 8.

### Scenario C: Disaster Recovery (Full Database Restore from Backup)
If catastrophic corruption or unexpected data loss occurs:

#### Step 1: Pre-Restoration Safeguards
- Confirm target database name is `skyra_loghub_dev`.
- Verify backup artifact checksum:
  ```powershell
  Get-FileHash "C:\Users\jetti\.skyra\backups\skyra_loghub_dev_pre_admin002_20261028051943.dump" -Algorithm SHA256
  ```
  Must match: `1FA688AD20ECDC6EBF4CBCE5B1F257CEE3BE0DD08F76412FB32ACA83955D7CA2`.

#### Step 2: Terminate Active Connections
```sql
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE datname = 'skyra_loghub_dev' AND pid <> pg_backend_pid();
```

#### Step 3: Recreate Schema & Execute Restore
```powershell
# Drop and recreate schema public
psql -h 127.0.0.1 -p 5432 -U skyra_loghub_user -d skyra_loghub_dev -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public AUTHORIZATION skyra_loghub_user;"

# Execute pg_restore
& "C:\Program Files\PostgreSQL\18\bin\pg_restore.exe" -h 127.0.0.1 -p 5432 -U skyra_loghub_user -d skyra_loghub_dev --no-owner --role=skyra_loghub_user --exit-on-error "C:\Users\jetti\.skyra\backups\skyra_loghub_dev_pre_admin002_20261028051943.dump"
```

#### Step 4: Post-Restoration Verification
1. Table count = 8.
2. Row counts match pre-migration baseline.
3. Total constraints = 79.
4. Total indexes = 16.
5. Migration ledger contains exactly `20261024000000_init_metadata`.

---

## 6. Stop Conditions & Escalation

**ABORT IMMEDIATELY and escalate if:**
1. Database identity query returns any name other than `skyra_loghub_dev`.
2. Port is not 5432.
3. Pre-migration backup checksum cannot be verified.
4. Migration script SHA-256 does not match `156AE317342CA4690EBF8B74BA501D3BB9998DE83293E0F7295E28B1CA1D07B9`.
5. Any existing table is locked or unavailable during migration.
6. Execution fails with any non-zero exit code.

