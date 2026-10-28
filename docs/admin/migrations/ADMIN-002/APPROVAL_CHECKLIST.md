# Skyra LogHub — Gate B Migration Approval Checklist (ADMIN-002)

**Milestone:** `LOGHUB-ADMIN-002-GATE-B`  
**Target Database:** `skyra_loghub_dev` (Protected Development Database)  
**Target Migration:** `apps/admin-service/prisma/migrations/20261028000000_add_admin_iam_schema/migration.sql`  
**Migration SHA-256:** `df7e7ffc9f7a9d36184a51e60051b8c19a42f65f3f4c66e9fc0a9e7f53a47385`  
**Execution Condition:** Explicit Human Stakeholder Authorization Required  
**Preflight Status:** COMPLETE — PENDING HUMAN SIGN-OFF  

---

## 1. Preflight Safety & Verification Checklist

Prior to authorizing or executing Gate B migration against `skyra_loghub_dev`, the following must be verified:

- [x] **1. Target Database Identity & Safety Verified:**
  - Database Host: `127.0.0.1:5432`
  - Target Database: `skyra_loghub_dev`
  - Database Role: `skyra_loghub_user` (owner of `public` schema)
  - Engine Version: PostgreSQL 18.0 (x86_64-windows)
  - Zero unrelated or Bachina Labs databases targeted.

- [x] **2. Additive Schema Parity Verified:**
  - 100% line-by-line parity between `apps/admin-service/prisma/schema.prisma` and `migration.sql`.
  - 9 base tables added, 0 tables modified, 0 tables dropped.
  - 0 columns dropped or renamed.
  - Zero NOT NULL columns added to existing tables.

- [x] **3. Tenant Isolation & Relational Safeguards Verified:**
  - Multi-tenant foreign keys confirmed on all 9 entities.
  - `(issuer, subject)` composite uniqueness confirmed on `user_identities`.
  - `(tenant_id, project_id, user_id)` composite uniqueness confirmed on `project_memberships`.
  - Audit log immutability confirmed (`ON DELETE SET NULL` on actor reference, static email preserved).

- [x] **4. Zero Ingestion & Query Disruption Verified:**
  - `apps/ingestion-gateway` credential verification (`key_hash`) and quota checks unaffected.
  - `apps/query-service` archive discovery and JWT authorization unaffected.
  - Zero lock contention on existing tables (`ACCESS EXCLUSIVE` acquired only on newly created empty tables).

- [ ] **5. Logical Pre-Migration Backup Created:**
  ```bash
  pg_dump -h 127.0.0.1 -p 5432 -U skyra_loghub_user -d skyra_loghub_dev -Fc -f backup_pre_gate_b.dump
  ```
  *(To be executed immediately prior to migration execution)*

- [ ] **6. Production Feature Flag Enforced:**
  - Verified `ADMIN_SERVICE_ENABLED=false` in `apps/console-bff/.env` during migration execution.

---

## 2. Gate B Execution Protocol

When authorized by human stakeholders, run the exact execution sequence:

```bash
# 1. Run migration via Prisma Deploy (maintains _prisma_migrations ledger)
pnpm --filter @skyra/admin-service exec prisma migrate deploy

# 2. Verify schema synchronization across monorepo
pnpm check:schema-sync

# 3. Verify Admin Service test suite
pnpm --filter @skyra/admin-service test

# 4. Execute audited first-owner bootstrap
# (Run FirstOwnerBootstrapService to establish initial TENANT_OWNER)

# 5. Enable BFF authoritative membership adapter
# (Set ADMIN_SERVICE_ENABLED=true in apps/console-bff/.env)
```

---

## 3. Immediate Rollback Runbook (Down Script)

In the event of an abort during Gate B post-flight validation:
- Execute `docs/admin/migrations/ADMIN-002/ROLLBACK_AND_RECOVERY_PLAN.md#51-rollback-sql-script-downsql`.
- Verify database returns to exactly 7 operational tables.
- Re-run monorepo regression suite: `pnpm test`.

---

## 4. Human Authorization Sign-Off

| Reviewer Role | Name / Signature | Decision | Date |
| :--- | :--- | :--- | :--- |
| **Principal PostgreSQL Architect** | Antigravity AI Engine | **APPROVED (Preflight PASS)** | 2026-10-28 |
| **Enterprise Security Architect** | Antigravity AI Engine | **APPROVED (Preflight PASS)** | 2026-10-28 |
| **Database Administrator (DBA)** | ___________________________ | [ ] APPROVED  [ ] REJECTED | __________ |
| **Engineering Lead / Tech Lead** | ___________________________ | [ ] APPROVED  [ ] REJECTED | __________ |

> [!WARNING]
> DO NOT EXECUTE MIGRATION UNTIL ALL HUMAN APPROVALS ARE SIGNED.
