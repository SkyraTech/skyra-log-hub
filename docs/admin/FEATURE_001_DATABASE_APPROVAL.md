# Feature-001 protected execution approval packet — revised after Feature-001B

Feature-001C reference reconciliation: the separate current schema/privilege review packet is [Approval A](FEATURE_001_APPROVAL_A_SCHEMA.md). Its independent [Approval B](FEATURE_001_APPROVAL_B_BOOTSTRAP.md) and [Approval C](FEATURE_001_APPROVAL_C_ACTIVATION.md) cover bootstrap and activation. This cross-reference does not change any historical evidence or grant any approval below.

**NOT AUTHORIZED — AWAITING EXPLICIT HUMAN APPROVAL**

Date: 2026-11-03 (Asia/Calcutta). Isolated implementation/rehearsal passes. This packet is ready for review; it is **not permission to execute** and does not certify protected activation readiness. Current backup/recovery evidence and the separate approvals below are still prerequisites. This revision supersedes the earlier audit-only packet; previous reports remain unchanged.

## Exact protected target and current state

127.0.0.1:5432 / database `skyra_loghub_dev` / schema `public` / current application role `skyra_loghub_user` / PostgreSQL 17.9. READ ONLY identity/catalog checks confirmed eight baseline public tables, one baseline ledger row and zero application rows. The before/after schema/ledger/data snapshot is unchanged: 90F73C6F2BC6BCE568974E27472FD652505E3034284FF4A9883104B1FD02A6FF.

No protected DDL/DML, role provisioning, migration deploy/resolve, audit insertion, bootstrap, restore, service restart or membership activation was executed. All preparation/test writes used a physically separate, marker-verified PostgreSQL 17.9 cluster on port 5433 and independent credentials.

## Three independent approval gates

1. **Schema/infrastructure gate:** approve exact SQL bytes, transaction/ledger procedure and separately reviewed runtime role/grants. Does not authorize tenant/owner data, enabling role login, or application activation.
2. **Identity/tenant/owner bootstrap gate:** separate scoped approval naming existing or newly authorized tenant and verified issuer/subject/owner identity, idempotence/last-owner safeguards and exact DML. No bootstrap SQL is approved or executed by this packet.
3. **Authoritative activation gate:** separate approval of runtime credentials, non-owner connection, OIDC verification configuration, flags and protected mutation smoke tests. Mock OIDC must be disabled. No development fixture membership is allowed.

An approval of one gate does not imply either other gate. Keep administration persistence and BFF authoritative membership disabled in the protected environment until its corresponding activation authorization exists.

## Byte-exact artifacts and order

Existing baseline `20261024000000_init_metadata` must already be successfully applied and match its ledger; do not reapply it. Baseline checkout SHA-256: 071BABA74AEB0C82BE7F904C34E5473FBDB0A02412383C6887E032FF0025DE48.

| Step | File | Bytes | SHA-256 |
|---|---|---:|---|
| 1 | docs/admin/migrations/ADMIN-002/migration.sql | 8695 | 9ABF3D7D1AB6F7BCF195823A610623CECE127D34E81C066C830226FA0F630AEE |
| 2 | docs/admin/migrations/FEATURE-001A-001/migration.sql | 1581 | FA23ADB45E7D2F44DD315CD185FC39240F4C77525DDB9B768B2EE5FF7ACBF1CF |
| 3 | docs/admin/migrations/FEATURE-001B-001/migration.sql | 793 | 77F0375F5EE9E7168C6B1C68DFBC7713C1963423D662740423702C5A9FF597DB |
| Runtime grant step | docs/admin/migrations/FEATURE-001B-002/runtime-privileges.sql | 1755 | E1C15B19F158CEE8F7BA4531D7B7BF70AF4A0A064F8259B0D417A5422614886F |

Original ADMIN-002 is CRLF in this checkout. Historical LF-normalized checksum 156AE317342CA4690EBF8B74BA501D3BB9998DE83293E0F7295E28B1CA1D07B9 describes different bytes. Do not silently normalize before approval/execution; rehash and obtain approval for the representation actually staged. All new corrective/grant files are pinned LF by .gitattributes. No released archive or historical original SQL was overwritten.

Prisma schema migration identities: `20261028000000_admin_iam_foundation`, `20261103000000_feature001a_audit_integrity`, `20261103010000_feature001b_tenant_consistency`. The grant artifact is an operational role step, not an additional invented Prisma schema migration. Stage exact copies in a reviewed release directory containing the existing baseline migration and current canonical schema. No protected deployment migration directory was silently populated by this task.

## SQL/data/privilege scope

ADMIN-002 adds the two IAM enums and nine existing proposed IAM/audit tables with indexes/FKs; no bootstrap DML. Audit correction makes tenant/actor audit references restrictive and blocks audit UPDATE/DELETE/TRUNCATE, preserving audit INSERT. Consistency correction adds projects(tenant_id,id) uniqueness and composite tenant/project FKs to the two affected administration tables, plus the existing name-length contract CHECK. Existing data must validate; no automatic cleanup/backfill is authorized. No description, billing, quotas or new organization properties are added.

Canonical Prisma ownership remains ingestion-gateway; query-service mirrors its model. SQL-managed expression uniqueness, CHECKs and triggers must remain in the release inventory. Do not use db push or accept autogenerated drops to erase SQL-managed invariants.

Runtime must be a distinct role named `skyra_org_runtime`, with no database/schema/table ownership, elevated role memberships, superuser/CREATEDB/CREATEROLE authority or CREATE on public schema. Its creation is a **separate explicitly reviewed infrastructure prerequisite**, not hidden inside data bootstrap. Proposed provisioning statement, not executed here:

```sql
CREATE ROLE skyra_org_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
```

An executor with appropriate DBA/CREATEROLE authority must first prove the role does not already belong to another workflow; do not overwrite an unknown existing role. Review executor permissions explicitly rather than assuming skyra_loghub_user can create roles. Keep NOLOGIN until gate 3. Database CONNECT rights, secure credential provisioning and application DSN selection must be reviewed for the target's actual ACLs. Never commit passwords or copy test credentials.

The tested grant artifact grants relevant SELECT, UPDATE(name,updated_at) on tenants, timestamp-only UPDATE on users/memberships needed for shared locks, and audit INSERT/SELECT. No grants permit changing tenant identifiers/code/creation/status, identity keys, membership status/scope or role assignments. The artifact checks role attributes, ownership and role memberships before granting. Postflight must also verify effective public-schema CREATE and all inherited/PUBLIC privileges; reject unexpected broader access rather than silently revoking unrelated applications' grants.

The service remains trusted infrastructure across tenants, with per-request backend authority checks. Append-only enforcement protects existing history under ordinary runtime DML; owners/superusers can disable protections and are outside that claim. Audit retention/privileged recovery must remain controlled.

## Backup and recovery prerequisites — not yet satisfied for execution

Before requesting execution, obtain an authorized fresh consistent custom-format backup in a durable restricted location, record path/time/size/SHA-256, verify pg_restore TOC, and rehearse restoration into an explicitly verified disposable environment. Compare catalogs, constraints, ledger and data digests. Historical backup paths for another Windows user are not current evidence. Capture a current protected baseline and maintenance/lock window; ensure no pending schema change or invalid existing name/tenant-project records.

The referenced historical down.sql is absent. Do not invoke a nonexistent file or blindly drop administration tables. Pre-commit SQL failure must roll back its whole transaction. Post-commit failures require quiescing affected writes and a reviewed forward correction or separately approved restore, considering data since the backup and ledger state. Grants can be revoked/application flags kept off as containment; do not delete immutable audit history as rollback. Protected recovery writes need their own authorized scope.

## Planned execution method — not executed

1. Verify separate written gate-1 approval, backup/restore prerequisites, exact endpoint/database/role/schema, current ledger and byte checksums. Abort on drift or unexpected objects; IF NOT EXISTS is not drift repair.
2. Under reviewed lock/statement timeouts, run original ADMIN-002 inside an explicit single transaction with stop-on-error semantics. The file itself has no BEGIN/COMMIT. For example, an approved executor can use psql `-X -v ON_ERROR_STOP=1 --single-transaction` with exact host/port/database/role and the approved file; no command from this packet has been run on the protected target.
3. Only after confirmed commit, use Prisma migrate resolve for `20261028000000_admin_iam_foundation` against the exact staged schema/artifact and an explicitly verified target DSN. This is bookkeeping for raw execution, not a second SQL deployment.
4. Apply the two corrective files in order with stop-on-error. They contain their own BEGIN/COMMIT/local timeouts. After each confirmed commit, resolve its exact migration identity. Do not mix native deploy of the same unrecorded SQL with manual execution. If ledger recording fails after commit, stop and inspect rather than automatically retry SQL or overwrite checksums.
5. Provision/review the NOLOGIN non-owner role only under the explicit infrastructure scope, then execute the approved grant artifact with suitable grant authority. Verify effective privileges and no elevated memberships/ownership. Do not activate login credentials or feature flags.
6. Read-only postflight: expected objects/enums/indexes/FKs/CHECK/triggers, schema/ledger checksums, unchanged baseline rows, no tenant/owner bootstrap, correct runtime ACLs, and no pending migrations. Keep application persistence/authoritative flags off. Any protected mutation-based smoke test requires separate approval; otherwise retain isolated test evidence only.
7. Obtain gates 2 and 3 separately after identity/owner design and OIDC deployment compatibility review. Real-mode ID-token verification currently supports configured HS256 only and fails closed on other algorithms; do not enable a provider configuration that has not passed verification tests.

Isolated rehearsal validated raw SQL atomicity, failure injection, repeat deployment, FK/name constraints, runtime grants and successful database-to-browser operations. The original byte artifacts and corrective checksums are recorded in the isolated ledger/evidence. Those tests do not authorize writes or certify backups for the protected environment.

## Current decision

**NOT AUTHORIZED — AWAITING EXPLICIT HUMAN APPROVAL**. No protected migration/bootstrap/activation has occurred. Immediate next action is human review of this exact artifact inventory and prerequisites; obtain current backup/restore/executor evidence before a narrowly scoped gate-1 execution approval. Bootstrap and authoritative activation remain distinct subsequent gates.
