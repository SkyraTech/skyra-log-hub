# Skyra LogHub — Stage 1 Migration Runbook (ADMIN-002)

**Document ID:** `LOGHUB-ADMIN-002-STAGE-1-MIGRATION-RUNBOOK`  
**Milestone:** `LOGHUB-ADMIN-002-GATE-B` (Stage 1 — Protected Development Database Migration)  
**Execution Condition:** STRICTLY PENDING EXPLICIT HUMAN AUTHORIZATION  
**Target Environment:** Local Development Cluster (`127.0.0.1:5432`)  
**Target Database:** `skyra_loghub_dev`  
**Target Migration File:** `docs/admin/migrations/ADMIN-002/migration.sql`  
**Expected SHA-256:** `156AE317342CA4690EBF8B74BA501D3BB9998DE83293E0F7295E28B1CA1D07B9`  

---

> [!CAUTION]
> **DO NOT EXECUTE THIS RUNBOOK WITHOUT EXPLICIT STAGE 1 WRITTEN SIGN-OFF.**  
> Stage 0 readiness DOES NOT authorize database mutation. Stage 1 is restricted purely to DDL execution on `skyra_loghub_dev`.  
> No user bootstrap, membership seeding, or service activation is permitted during Stage 1.

---

## 1. Preflight Verification Checklist (Pre-Execution Gate)

Immediately prior to launching Stage 1, the execution operator MUST verify each of the following:

### 1.1 Verify Target Database Identity
Execute read-only check:
```bash
psql -h 127.0.0.1 -p 5432 -U skyra_loghub_user -d skyra_loghub_dev -c "SELECT current_database(), current_user, inet_server_addr(), inet_server_port(), version();"
```
**Expected Output:**
- `current_database`: `skyra_loghub_dev`
- `current_user`: `skyra_loghub_user`
- `inet_server_addr`: `127.0.0.1`
- `inet_server_port`: `5432`
- `version`: PostgreSQL 18.0

### 1.2 Verify Migration Artifact Fingerprint
Execute cryptographic hash check:
```powershell
Get-FileHash docs/admin/migrations/ADMIN-002/migration.sql -Algorithm SHA256
```
**Expected Output:**
- Hash: `156AE317342CA4690EBF8B74BA501D3BB9998DE83293E0F7295E28B1CA1D07B9`
*If the hash does not match, ABORT IMMEDIATELY.*

### 1.3 Verify Baseline Migration Ledger
Check existing Prisma migration state:
```sql
SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at ASC;
```
**Expected Output:**
- Exactly 1 row: `20261024000000_init_metadata`, `rolled_back_at IS NULL`.
- No pending or partially applied admin migration exists.

---

## 2. Logical Pre-Migration Backup Protocol

A binary custom-format (`-Fc`) logical backup must be captured prior to any DDL execution:

```powershell
# Create backup directory if not exists
New-Item -ItemType Directory -Force -Path "backups"

# Execute pg_dump
pg_dump -h 127.0.0.1 -p 5432 -U skyra_loghub_user -d skyra_loghub_dev -Fc -f "backups/skyra_loghub_dev_pre_admin_002_$(Get-Date -Format 'yyyyMMdd_HHmmss').dump"

# Verify backup file size and checksum
Get-Item backups/*.dump | Select-Object Name, Length, LastWriteTime
```

**Verification criteria:**
- Exit code: `0`
- Backup file size: > 0 bytes (approx 10 KB to 50 KB for baseline structure).
- Non-destructive rehearsal: verify archive table of contents via `pg_restore -l <dumpfile>`.

---

## 3. Migration Execution Protocol

Execute the approved migration SQL within a single transactional session.

### 3.1 Migration Command
```bash
psql -h 127.0.0.1 -p 5432 -U skyra_loghub_user -d skyra_loghub_dev -v ON_ERROR_STOP=1 -f docs/admin/migrations/ADMIN-002/migration.sql
```
*Note: Alternatively, if invoking through Prisma CLI:*
```bash
pnpm --filter @skyra/admin-service exec prisma migrate deploy
```

### 3.2 Execution Logging Requirements
The operator must record:
1. Execution start timestamp (UTC).
2. Execution end timestamp (UTC).
3. Exact exit code (`0` required).
4. Full stdout and stderr capture.

---

## 4. Post-Migration Database Catalog Verification

Immediately after execution, run the following catalog checks against `skyra_loghub_dev`:

### 4.1 Verify Table Count and Names
```sql
SELECT tablename, tableowner 
FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY tablename;
```
**Expected Tables (Total: 17 base tables):**
- **Existing (8):** `_prisma_migrations`, `archive_segments`, `deduplication_receipts`, `ingestion_checkpoints`, `ingestion_credentials`, `project_quotas`, `projects`, `tenants`
- **New Administration (9):**
  1. `admin_audit_events`
  2. `invitations`
  3. `permissions`
  4. `project_memberships`
  5. `role_assignments`
  6. `role_permissions`
  7. `roles`
  8. `tenant_memberships`
  9. `users`

### 4.2 Verify Enums
```sql
SELECT typname FROM pg_type WHERE typname IN ('UserStatus', 'MembershipStatus') ORDER BY typname;
```
**Expected:** Both `MembershipStatus` and `UserStatus` present.

### 4.3 Verify Foreign Key Integrity
```sql
SELECT conname, confrelid::regclass AS references_table 
FROM pg_constraint 
WHERE contype = 'f' AND connamespace = 'public'::regnamespace
ORDER BY conname;
```
**Expected Foreign Keys:**
- Minimum 14 foreign keys connecting admin tables to `tenants(id)`, `projects(id)`, `users(id)`, `roles(id)`, and `permissions(id)`.

### 4.4 Verify Existing Operational Data Integrity
Verify that existing baseline tables remain uncorrupted and intact:
```sql
SELECT 
  (SELECT count(*) FROM tenants) AS tenants_count,
  (SELECT count(*) FROM projects) AS projects_count,
  (SELECT count(*) FROM ingestion_credentials) AS credentials_count;
```

---

## 5. Non-Destructive Monorepo Regression Verification

Run the full automated verification suite to guarantee zero regression:
```bash
# 1. Monorepo schema synchronization
pnpm check:schema-sync

# 2. Monorepo typecheck
pnpm typecheck

# 3. Monorepo test suite
pnpm test
```

---

## 6. Strict Stage 1 Boundaries

During Stage 1:
- [ ] **NO Initial Owner Bootstrapped:** Do not execute `FirstOwnerBootstrapService` or insert rows into `users`/`tenant_memberships`.
- [ ] **NO Feature Flag Changes:** `ADMIN_SERVICE_ENABLED` in `apps/console-bff/.env` must remain `false`.
- [ ] **NO Prisma Persistence Toggle:** `persistenceEnabled` in `apps/admin-service` remains `false`.
- [ ] **Stage 2 Pending:** Authoritative membership resolution remains deactivated until separate Stage 2 review.

---

## 7. Immediate Abort & Rollback Criteria

If ANY of the following occurs:
1. Migration command exits with non-zero exit code.
2. Error during table, enum, or constraint creation.
3. Lock timeout or contention detected on existing operational tables.
4. Schema drift or unexpected table names in catalog check.

**Action:**
1. The transaction automatically rolls back via `ON_ERROR_STOP=1`.
2. If committed partially: Execute `docs/admin/migrations/ADMIN-002/ROLLBACK_AND_RECOVERY_PLAN.md` down script (`down.sql`).
3. If necessary, restore baseline from pre-migration dump:
   ```bash
   pg_restore -h 127.0.0.1 -p 5432 -U skyra_loghub_user -d skyra_loghub_dev --clean --if-exists backups/<dumpfile>
   ```
4. Record incident details in post-mortem log.
