# Approval A — protected schema and database privileges

**NOT AUTHORIZED — AWAITING EXPLICIT HUMAN APPROVAL**

Prepared 2026-11-03. This packet does not authorize protected backup creation, identity/tenant/owner DML, runtime LOGIN/credential installation, feature flags or activation. Approvals B and C are independent.

## Scope and exact candidate

Target: 127.0.0.1:5432 / skyra_loghub_dev / public / PostgreSQL 17.9. Observed current owner/application role: skyra_loghub_user. Named maintenance operator and credential source: **not yet supplied**. The operator must confirm this owner can execute the three schema artifacts, and separately name a cluster security administrator for CREATE ROLE/grants; do not assume database ownership confers CREATEROLE.

Existing baseline prerequisite: `20261024000000_init_metadata`, 5641 bytes, SHA-256 `071baba74aeb0c82be7f904c34e5473fbdb0a02412383c6887e032ff0025de48`. Already applied; do not run it again.

| Order | Exact relative file | Bytes | SHA-256 |
|---|---|---:|---|
| 1 | docs/admin/migrations/ADMIN-002/migration.sql | 8695 | `9abf3d7d1ab6f7bcf195823a610623cece127d34e81c066c830226fa0f630aee` |
| 2 | docs/admin/migrations/FEATURE-001A-001/migration.sql | 1581 | `fa23adb45e7d2f44dd315cd185fc39240f4c77525ddb9b768b2ee5ff7acbf1cf` |
| 3 | docs/admin/migrations/FEATURE-001B-001/migration.sql | 793 | `77f0375f5ee9e7168c6b1c68dfbc7713c1963423d662740423702c5a9ff597db` |
| 4, operational | docs/admin/migrations/FEATURE-001B-002/runtime-privileges.sql | 1755 | `e1c15b19f158cee8f7ba4531d7b7bf70af4a0a064f8259b0d417a5422614886f` |

Prisma IDs for steps 1–3, respectively: `20261028000000_admin_iam_foundation`, `20261103000000_feature001a_audit_integrity`, `20261103010000_feature001b_tenant_consistency`. Runtime grants have no Prisma schema entry. ADMIN-002 checkout is CRLF; approve the exact bytes above, not its normalized Git blob. Artifact inventory, tracked status, changes and rehearsal evidence are in [migration readiness](../../SKYRA_LOGHUB_FEATURE_001C_MIGRATION_READINESS.md).

## Preconditions and stop conditions

Current protected snapshot matches the baseline checksum and contains zero application rows/no IAM tables. Recheck at the approved window using READ ONLY identity/catalog/ledger/data queries; stop on any difference or concurrent writer. A current protected full custom-format backup must first be **separately authorized, created and verified by actual isolated restore**, following [backup plan](../../SKYRA_LOGHUB_FEATURE_001C_BACKUP_ACTIVATION.md). The synthetic C archive is not a protected recovery artifact. Destination, executor, backup ID/hash/time and verification evidence are presently missing.

Freeze an exact staged release directory with canonical schema, baseline and these three migration folders, and hashes. Review additive schema against current live data; name and tenant/project checks must validate without automatic cleanup. Obtain explicit acceptance of the slice's no-hard-delete/append-only audit boundary. Check disk, lock budget and maintenance window. Stop if an unknown runtime role already exists, ownership differs, elevated memberships exist, or any artifact/hash changes.

## Operations proposed after approval only

1. Record operator, authorization ID, target identity, baseline schema/data/ledger fingerprints, backup manifest and exact file hashes. Prevent application writes; keep persistence and authoritative flags off. Credentials stay in approved secret transport.
2. On one explicitly verified schema-owner connection execute BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s'; exact step-1 SQL; COMMIT. Step 1 itself has no wrapper. Run steps 2 and 3 as separate exact complete files with their own BEGIN/COMMIT and timeouts. Abort and rollback on every error; do not continue a failed session.
3. After each committed schema artifact, compare exact expected catalog and successful SQL evidence before `prisma migrate resolve --applied <its-exact-id> --schema <approved-staged-schema>`. Resolution is separately scoped here and cannot stand in for running SQL. Record exact applied checksum. At the end `prisma migrate status` and repeat `migrate deploy` on the reviewed directory must report no pending work and preserve the ledger/catalog. Do not use db push, hand-written ledger rows or deploy against an unreviewed directory.
4. By the named security administrator only, provision the specifically approved role with `CREATE ROLE skyra_org_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;` after confirming it does not already exist. This is a proposed statement, not executed here. Confirm no database/schema/table/function ownership or memberships and no public CREATE. No broad PUBLIC revoke affecting other roles is implicitly approved; unexpected privileges stop for narrower review.
5. Explicitly grant CONNECT on skyra_loghub_dev to skyra_org_runtime, then execute the exact operational grant artifact in its transaction with a short executor lock/statement timeout. Do not include isolated skyra_test marker-schema privileges. Verify effective table/column/schema/database/function/default privileges and identity before application use. NOLOGIN remains until separate Approval C authorizes credential activation.

This ordering creates nine IAM/audit tables and two enums, audit RESTRICT/triggers, composite project/tenant constraints and tenant-name CHECK, followed by constrained runtime privileges. No organization/user/role-definition/membership seed DML is included. Full-database superuser accounts are not application accounts.

## Verification, recovery and evidence

Required evidence: approved input hashes and operator; protected before/after schema/ledger/table-count/digest snapshots showing baseline preservation and only approved additions; four successful ledger rows with exact checksums; catalog FK/index/trigger comparisons; effective runtime privilege/ownership matrix; no protected application DML; runtime still NOLOGIN; flags still off; exact logs/exit codes with secrets removed.

Isolated proofs currently pass: fresh migration chain, transactional failure/rollback, raw repeat refusal, repeated grants/deploy, catalog drift detection, non-owner application read/update/audit, audit mutation/DDL denials and real backup restoration. These do not authorize protected writes.

On failure within a schema transaction, ROLLBACK and verify baseline/previous successful stage. If SQL committed but ledger resolution failed, stop, compare full catalog and exact bytes and reconcile only with the approved executor; do not rerun non-idempotent SQL. If partial drift or data uncertainty exists, keep activation off and preserve evidence. Destructive down scripts, role deletion and in-place protected restore are not preapproved. Obtain a separate recovery authorization; verified archive restore into a new guarded target and reviewed cutover is the recovery path.

**Not yet actionable:** separately authorized/current verified protected backup; named executors and credential source; approved release staging and maintenance window; explicit audit-policy acceptance. Authorization must name this target, hashes, schema/ledger operations, role/grants and exclusions. Generic permission to continue development is insufficient.
