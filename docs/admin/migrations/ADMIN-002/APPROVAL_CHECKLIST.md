# Skyra LogHub — Gate B Migration Approval Checklist (ADMIN-002)

**Milestone:** `LOGHUB-ADMIN-002-GATE-B`  
**Target Database:** `skyra_loghub_dev`  
**Execution Condition:** Explicit Stakeholder Authorization Required  
**Document Status:** PENDING APPROVAL  

---

## 1. Preflight Safety Checklist

Before executing `migration.sql` in Gate B, the following checks must be verified:

- [ ] **1. Active Database Connection Verified:**
  - Database Host: `localhost` (or verified RDS instance)
  - Database Port: `5432`
  - Target Database Name: `skyra_loghub_dev` (Confirmed not `bachina_labs_academy` or production)
  - Connection User: `skyra_admin` (Non-superuser with DDL privileges on public schema)

- [ ] **2. Backup Pre-Requisite:**
  - PostgreSQL metadata schema dump taken:
    ```bash
    pg_dump -U skyra_admin -d skyra_loghub_dev --schema-only -f backup_pre_admin002_schema.sql
    ```
  - Operational tables data dump taken:
    ```bash
    pg_dump -U skyra_admin -d skyra_loghub_dev -t tenants -t projects -t ingestion_credentials -t project_quotas -f backup_pre_admin002_data.sql
    ```

- [ ] **3. Ingestion & Query Isolation Check:**
  - Verified `ingestion-gateway` is processing healthy traffic or in maintenance window.
  - Verified no long-running transactions are locking the `tenants` or `projects` tables.

- [ ] **4. Artifact Integrity Check:**
  - SHA-256 of `docs/admin/migrations/ADMIN-002/migration.sql` matches approved commit.
  - Review confirms 0 `ALTER TABLE ... DROP` or `TRUNCATE` statements.

---

## 2. Gate B Execution Steps

When authorized:

1. **Apply Migration:**
   ```bash
   psql -h localhost -U skyra_admin -d skyra_loghub_dev -f docs/admin/migrations/ADMIN-002/migration.sql
   ```
2. **Synchronize Prisma Schemas:**
   Append additive models to `apps/ingestion-gateway/prisma/schema.prisma` and `apps/query-service/prisma/schema.prisma`.
3. **Generate Prisma Clients:**
   ```bash
   pnpm --filter @skyra/ingestion-gateway exec prisma generate
   pnpm --filter @skyra/query-service exec prisma generate
   ```
4. **Seed System Roles & Capabilities:**
   Execute seed script inserting the 5 standard roles (`OrgOwner`, `OrgAdmin`, `ProjectAdmin`, `Developer`, `Viewer`) and 22 permission capabilities.
5. **Run Controlled Bootstrap:**
   Execute audited bootstrap script to establish the primary tenant owner identity.
6. **Activate Backend Membership Provider:**
   Toggle `useAuthoritativeMembership = true` in `apps/console-bff`.

---

## 3. Rollback & Disaster Recovery Checklist

In the event of failure during Gate B:
- [ ] 1. Execute rollback script in `docs/admin/migrations/ADMIN-002/MIGRATION_REVIEW.md#5-rollback-procedure`.
- [ ] 2. Confirm existing metadata tables (`tenants`, `projects`, `ingestion_credentials`, `project_quotas`) are intact.
- [ ] 3. Restore from backup dump if any integrity check fails.
- [ ] 4. Re-run `pnpm test:gateway` and `pnpm test:query` to verify zero regression.
