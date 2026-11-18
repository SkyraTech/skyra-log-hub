# LOGHUB-FEATURE-001A — isolated PostgreSQL validation

Date: 2026-11-03 (Asia/Calcutta). Independent PostgreSQL 17 environment is operational; protected database unchanged.

## Provisioning and isolation evidence

Local Windows service `postgresql-x64-17` was running with data directory `C:\Program Files\PostgreSQL\17\data`. Protected port 5432 was owned by PID 8972 before and after recovery. No container runtime was found on PATH; only PostgreSQL major 17 was installed. Port 5433 initially had no listener.

The new script uses the installed PostgreSQL 17.9 binaries to initialize a **new** cluster, rather than modifying that service:

| Property | Verified value |
|---|---|
| Host / port | 127.0.0.1 / 5433, loopback-only listener |
| Database | skyra_loghub_disposable_validation |
| Test role | skyra_isolated_user; rolsuper=false; no role/database creation rights |
| Separate bootstrap administrator | skyra_test_admin, only in the new cluster |
| Engine | PostgreSQL 17.9 |
| Cluster marker | 26d25080-7655-4147-b05a-512ad359e14f |
| Data directory | LogHub `.tmp/feature001a-postgres/data` |
| Final isolated listener PID | 53696; separate from protected PID 8972 |
| Authentication | SCRAM; independently generated admin/test passwords |
| Storage relationship | Separate initialized data/WAL/configuration; no protected directory or volume configured |

Administrator verification checks the live `data_directory`, database, role, port and version against the ownership manifest. Ordinary test connections additionally check exact host/database/role/version and an administrator-owned cluster marker. Test role receives only schema USAGE and marker SELECT. Credentials/data reside in an ignored directory with Windows ACLs restricted to the current user, SYSTEM and Administrators. No credentials were committed or printed. Sharing installed PostgreSQL binaries does not share a cluster or data directory.

The initialization refused existing directories by design; the selected directory did not exist before creation and the port was free. No pre-existing database/volume was recreated. Reset later verified marker plus physical directory before dropping only the database this execution created.

Controlled write proof: create a UUID marker table, insert a generated UUID, ROLLBACK, verify the table is absent. Safe stop/start and guarded reset/rebuild were exercised. The isolated cluster is left running for Feature-001B; no Windows startup service was installed.

## Rehearsal and schema verification

`scripts/rehearse-admin-migration.mjs baseline`:

1. Checks live ownership and requires an empty public schema.
2. Stages existing baseline Prisma schema/migration into a fresh ignored directory and uses Prisma migrate deploy to reproduce baseline.
3. Runs the exact ADMIN-002 source text within BEGIN/COMMIT; no normalization or original-file edits.
4. Uses Prisma migrate resolve on the matching staged artifact, then repeat deploy reports no pending migrations.
5. Checks ledger count and byte-exact checksums. Final baseline+ADMIN schema has 16 operational public tables plus the Prisma ledger. The ownership marker is in a separate schema.

Original integration suites verify four enums, unique indexes, foreign-key actions, identity uniqueness, membership uniqueness, scoped SQL filtering, serialized synthetic last-owner/bootstrap workers and SQL transaction rollback. They are not tests of the unfinished persistent Admin adapters. The initial 32/33 result was a `TEST_DEFECT`: ledger table counted as operational; after correction and reset the result is 33/33.

Hardening is applied after original suites. Its own ledger entry makes three total migrations. Separate tests verify append-only and restrictive-FK behavior; compatibility tests verify existing baseline repositories still work. Stage guards prevent accidentally running destructive original fixture cleanup against the hardened schema.

## Failure and drift evidence

- Failure after executing all original ADMIN-002 statements inside an explicit transaction rolls back every administration table; the full baseline schema fingerprint is preserved.
- Separate DDL outside a transaction followed by an error leaves a table behind. The demonstration table was removed. This proves a statement-by-statement executor needs an explicit transaction, not that every PostgreSQL execution mode is non-atomic.
- Failure inserted before the correction's COMMIT rolls back FK, function and trigger changes; original cascade FK and absent function are verified before exact correction application.
- Repeated guarded original SQL and repeated Prisma deploy preserve schema fingerprint and ledger count; raw hardening is one-time, while repeat Prisma deployment has no pending work.
- An added tenant-column drift probe changes the fingerprint and is rolled back. Fingerprints include columns, constraints, indexes, enums and triggers; this supplements Prisma deploy, which is not a full schema-drift detector. Full IAM Prisma datamodel parity is not established.

Original post-rehearsal schema fingerprint: `6b11ce257fb6bbe8596bede65550cf6d02c51c119f590ff99d9dd598225ab605`.

## Integration results and safety comparison

Final counts: original PostgreSQL suites **33 passed**; hardening suite **10 passed** (9 protection checks plus 1 explicitly identified known-gap diagnostic); ingestion Prisma repository compatibility **21 passed**; target-guard unit checks **15 passed**. No failures/skips in these final runs. Details and exact commands appear in final acceptance.

The known-gap diagnostic confirms that original project_memberships permits tenant A with a project belonging to tenant B. Treat as `DATABASE_SCHEMA_FAILURE` for protected activation, not successful isolation. Original SQL filtering tests do not prove a composite FK exists.

Protected snapshot tool uses startup `default_transaction_read_only=on` and REPEATABLE READ READ ONLY. It verifies identity before catalog/data-digest inspection. Before/after JSON is byte-identical:

`90f73c6f2bc6bce568974e27472fd652505e3034284ff4a9883104b1fd02a6ff`.

Eight protected public tables remain; ledger still has one row; all seven application tables still have zero rows. Columns, constraints, indexes, enum labels, ledger contents and ordered row digests match. No protected audit table, DDL/DML, bootstrap, bookkeeping, restore, restart, user change or activation occurred. Snapshot comparison is point-in-time evidence, not a continuous monitoring claim.

Reproducible lifecycle, test commands, credential handling and safe reset procedure: `docs/development/ISOLATED_POSTGRESQL_SETUP.md`. Local evidence JSON/logs are in ignored `.tmp/feature001a-evidence/`; no secret manifest is part of these reports.
