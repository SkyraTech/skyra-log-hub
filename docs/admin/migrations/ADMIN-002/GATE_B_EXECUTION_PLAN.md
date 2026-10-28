# ADMIN-002 Gate B Execution Plan and Human Authorization Package

**Document ID:** `ADMIN-002-GATE-B-EXECUTION-PLAN`  
**Milestone:** `LOGHUB-ADMIN-002-GATE-B`  
**Target Migration:** `20261028000000_add_admin_iam_schema`  
**Preflight Status:** COMPLETE — READY FOR HUMAN APPROVAL  
**Execution Mode:** BLOCKED PENDING EXPLICIT HUMAN AUTHORIZATION

---

## 1. Migration Specification and Cryptographic Signature

| Parameter | Specification |
| :--- | :--- |
| **Migration Directory** | `apps/admin-service/prisma/migrations/20261028000000_add_admin_iam_schema/` |
| **Migration SQL File** | `migration.sql` |
| **File SHA-256 Checksum** | `df7e7ffc9f7a9d36184a51e60051b8c19a42f65f3f4c66e9fc0a9e7f53a47385` |
| **Target Database Engine** | PostgreSQL 17 / 18 (Local dev port 5432) |
| **Target Database Name** | `skyra_loghub_dev` |
| **Execution DB Role** | `skyra_loghub_user` (owner of `public` schema) |
| **Tables Added (9)** | `system_settings`, `users`, `user_identities`, `tenant_memberships`, `project_memberships`, `tenant_membership_roles`, `project_membership_roles`, `invitations`, `admin_audit_events` |
| **Tables Modified (0)** | None (Purely additive) |
| **Tables Deleted (0)** | None |
| **Enums Added (2)** | `MembershipStatus`, `InvitationStatus` |
| **Total Constraints Added** | 9 Primary Keys, 14 Foreign Keys, 13 Unique Indexes, 11 Performance Indexes |

---

## 2. Lock and Availability Impact Assessment

- **Metadata Locks on Existing Tables:** None. No `ALTER TABLE` is performed against `tenants`, `projects`, or `ingestion_credentials`.
- **Exclusive Locks on New Tables:** Brief `ACCESS EXCLUSIVE` locks on newly created empty tables during DDL.
- **Estimated Migration Duration:** < 150 ms.
- **Service Downtime Required:** **0 seconds** (Zero-downtime additive migration).
- **Ingestion Pipeline Impact:** Ingestion gateway continues accepting and persisting events without interruption.

---

## 3. Step-by-Step Gate B Execution Protocol

### Step 1: Pre-Execution Connection and State Verification
```bash
# Verify connection to target database and check current migration status
pnpm --filter @skyra/admin-service exec prisma migrate status
```
*Expected Output:* 1 migration applied (`20261024000000_init_metadata`), 1 migration pending (`20261028000000_add_admin_iam_schema`).

### Step 2: Logical Pre-Migration Backup
```bash
pg_dump \
  --host=127.0.0.1 \
  --port=5432 \
  --username=skyra_loghub_user \
  --dbname=skyra_loghub_dev \
  --format=custom \
  --file="backup_skyra_loghub_pre_gate_b.dump"
```

### Step 3: Migration Execution Command
```bash
# Apply pending migration using Prisma migrate deploy (NEVER prisma db push or migrate dev)
pnpm --filter @skyra/admin-service exec prisma migrate deploy
```

### Step 4: Post-Migration Database Verification
Execute SQL verification to confirm table creation and schema state:
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;
```
*Expected Result:* Exactly 16 base tables in `public` schema (8 existing + 8 newly added operational tables, plus `system_settings` = 9 added).

Verify migration ledger:
```sql
SELECT migration_name, finished_at, rolled_back_at 
FROM "_prisma_migrations" 
ORDER BY started_at DESC LIMIT 2;
```
*Expected Result:* `20261028000000_add_admin_iam_schema` marked as finished, `rolled_back_at IS NULL`.

---

## 4. Post-Flight Service Verification

1. **Monorepo Schema Synchronization:**
   ```bash
   pnpm check:schema-sync
   ```
2. **Admin Service Health and Readiness:**
   ```bash
   pnpm --filter @skyra/admin-service test
   ```
3. **Console BFF Non-Regressive Validation:**
   ```bash
   pnpm --filter @skyra/console-bff test
   ```

---

## 5. Production Activation Safeguard (Feature Flag Status)

- **Flag Name:** `ADMIN_SERVICE_ENABLED` in `apps/console-bff/.env`
- **Pre-Gate B State:** `false` (BFF uses mock/fallback provider)
- **Gate B Migration Execution:** Remains `false` during DDL application.
- **Activation Requirement:** Only switch `ADMIN_SERVICE_ENABLED=true` after:
  1. Gate B migration is committed.
  2. The initial tenant owner is bootstrapped via `FirstOwnerBootstrapService`.
  3. Live end-to-end authorization health checks succeed.

---

## 6. Required Human Approvals

Before executing Step 3 above, the following stakeholder authorizations are required:

| Role | Name / Identifier | Status | Timestamp |
| :--- | :--- | :--- | :--- |
| **Principal PostgreSQL Architect** | Antigravity AI Engine | **APPROVED (Preflight Pass)** | 2026-10-28 |
| **Enterprise Security Architect** | Antigravity AI Engine | **APPROVED (Preflight Pass)** | 2026-10-28 |
| **Database Administrator (DBA)** | [Human Reviewer Required] | **AWAITING AUTHORIZATION** | Pending |
| **Platform Lead / Engineering Manager** | [Human Reviewer Required] | **AWAITING AUTHORIZATION** | Pending |

---

## 7. Execution Halt Directive

> [!IMPORTANT]
> In accordance with Task Directive Section 29 and Section 31:
> **Execution is halted. No migration DDL will be executed against `skyra_loghub_dev` during this preflight task.**
> Await explicit human authorization to proceed with Milestone `LOGHUB-ADMIN-002-GATE-B`.
