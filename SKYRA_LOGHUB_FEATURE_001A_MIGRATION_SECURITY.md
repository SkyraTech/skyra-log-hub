# LOGHUB-FEATURE-001A — migration integrity and security

Date: 2026-11-03 (Asia/Calcutta). **Protected execution is NOT READY and NOT AUTHORIZED.** The test environment is ready for Feature-001B; this is a distinct decision.

## Source/artifact identity

| Artifact | Bytes executed in isolation | SHA-256 |
|---|---:|---|
| Existing baseline `apps/ingestion-gateway/prisma/migrations/20261024000000_init_metadata/migration.sql` | 5641 | 071BABA74AEB0C82BE7F904C34E5473FBDB0A02412383C6887E032FF0025DE48 |
| Original `docs/admin/migrations/ADMIN-002/migration.sql` CRLF checkout | 8695 | 9ABF3D7D1AB6F7BCF195823A610623CECE127D34E81C066C830226FA0F630AEE |
| New `docs/admin/migrations/FEATURE-001A-001/migration.sql` LF artifact | 1581 | FA23ADB45E7D2F44DD315CD185FC39240F4C77525DDB9B768B2EE5FF7ACBF1CF |

Original ADMIN-002 Git blob: `17ab41232948cda205d247b7ac437d396e442a9b`. Git reports `i/lf w/crlf`; core.autocrlf=true. LF-normalized 8,522-byte content matches historical SHA-256 `156AE317342CA4690EBF8B74BA501D3BB9998DE83293E0F7295E28B1CA1D07B9`. No SQL-source change beyond checkout line endings was found. Original bytes remain unchanged. A narrowly scoped .gitattributes entry fixes the **new correction** to LF; historical migration was not renormalized.

Every staged migration is copied as bytes. Isolated Prisma ledger checksums match those bytes, not the normalized historical digest. A derived hardening failure fixture has its own digest `B7EEAAE8674A0FEA17A6998F45B4C7EC995877C453D626A4A9B5AFD24CC75708`; it is not represented as the original/corrective artifact.

## Original SQL review

Creation order is users, tenant/project memberships, roles, permissions, role junctions/assignments, invitations and audit, after the existing tenant/project baseline. Defaults and enums/unique indexes are exercised in integration tests. The original has no explicit transaction wrapper or bootstrap DML. IF NOT EXISTS makes a repeated candidate tolerate existing objects but does not repair mismatched object definitions. Generic single-column project FKs do not enforce tenant/project pairing; membership-to-user FKs do not by themselves establish active authoritative membership. Application authorization remains mandatory.

Original audit rows have tenant ON DELETE CASCADE and actor ON DELETE SET NULL, plus ON UPDATE CASCADE. Rows can be updated/deleted and parent actions can delete/rewrite history. Previous reports' blanket immutable/tamper-evident and automatic all-file transaction claims are not supported by that artifact. No privilege separation protecting an ordinary runtime application role is established by the original DDL.

## Atomic execution strategy and evidence

Baseline: Prisma migrate deploy into the verified isolated target. Original ADMIN-002: BEGIN, lock timeout, exact original SQL, COMMIT; on error ROLLBACK. Only after commit is the exact staged file recorded using Prisma migrate resolve. This is one raw-SQL-plus-bookkeeping path, not a second deployment of the same migration. The separately versioned correction contains its own BEGIN/COMMIT and local timeouts.

Failure after original DDL and before commit leaves no administration tables or schema drift. A separate statement-by-statement no-BEGIN probe leaves prior DDL behind; cleaned up afterward. Derived correction failure before COMMIT restores original FKs and removes newly created trigger/function objects. Exact correction then succeeds. Repeat Prisma deploy finds no pending migrations, and ledger count/checksums match; deploying alone does not guarantee datamodel or drift parity. A column injection is detected by the catalog fingerprint and rolled back.

Raw SQL and ledger resolution are separate commits. If ledger recording fails, schema may exist without a matching ledger entry: stop, inspect, and reconcile only under authorized target-specific scope. Do not automatically reapply SQL or overwrite checksums. This rehearsal runner is test-only; it is not an approved protected deployment tool.

## Versioned correction and limits

FEATURE-001A-001 preserves original history and changes only audit integrity:

- Restricts tenant and actor deletes/identifier updates that would remove or rewrite audit history.
- Rejects audit UPDATE/DELETE through a row trigger and TRUNCATE through a statement trigger.
- Removes PUBLIC update/delete/truncate grants; keeps normal insertion/read behavior.

Nine real PostgreSQL checks verify insertion/read, rejected update/delete/truncate, parent retention, actor identity retention, transaction rollback on audit failure and restrictive trigger/FK definitions. The suite's tenth test diagnoses the remaining tenant/project schema gap. All fixture writes roll back.

This is append-only enforcement under normal DML, not protection from a superuser/table owner who deliberately disables triggers or drops objects. Before protected activation, define a non-owner runtime role with narrowly scoped grants and migrations owned separately; review the operational/deactivation/retention behavior affected by RESTRICT. Do not claim tamper-proof storage against privileged database administrators. No runtime role or protected grant was changed here.

## Recovery and protected readiness blockers

The historical referenced down.sql does not exist; no fictitious rollback file was added. The old rollback test creates/drops synthetic tables in a scratch schema, not a complete production recovery rehearsal. Test recovery is the verified disposable reset plus baseline/rehearsal procedure. Protected restoration needs a fresh authorized backup, checksum/TOC verification, restore rehearsal and a reviewed data-preserving recovery plan; none was performed against the protected database in this milestone.

Before any future protected approval:

1. Prepare/review a separate additive correction for cross-tenant project FK consistency and required membership relationships. The diagnostic actually inserted a mismatched tenant/project membership in a rolled-back isolated transaction; classify `DATABASE_SCHEMA_FAILURE`.
2. Complete/reconcile shared IAM Prisma models and migration history. Current Prisma schemas still describe baseline metadata, not administration models.
3. Review non-owner runtime grants and audit lifecycle/retention/deactivation semantics; incorporate the correction into a byte-pinned approval packet.
4. Complete persistent identity/membership/audit adapters and BFF authoritative resolution in Feature-001B; classify current stubs `APPLICATION_NOT_IMPLEMENTED`. Do not enable flags to hide this gap.
5. Refresh the protected backup/recovery evidence and precise approved execution plan on PostgreSQL 17.9. Request separate migration, bootstrap and activation approvals; none are implied by isolated rehearsal.

The protected database was accessed only by the read-only snapshot tool; before/after schema, ledger and data digests are unchanged. Existing Feature-001 approval packet/reports remain historical and unmodified. A revised packet incorporating these findings is required before asking for protected execution.
