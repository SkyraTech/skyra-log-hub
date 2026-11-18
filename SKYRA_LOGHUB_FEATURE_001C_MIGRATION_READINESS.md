# FEATURE-001C — migration and database readiness

Date: 2026-11-03. Status: isolated candidate verified; protected execution NOT AUTHORIZED.

## Exact inventory

Computed from current checkout bytes by `node scripts/verify-feature001c-readiness.mjs`. No new schema correction was required in 001C. The original baseline and ADMIN-002 are tracked and unchanged; all three later SQL artifacts remain untracked pre-existing 001A/001B work. Do not approve an LF-normalized hash while executing CRLF bytes.

| Order | Artifact / Prisma identity | Bytes | SHA-256 |
|---|---|---:|---|
| Existing prerequisite | `apps/ingestion-gateway/prisma/migrations/20261024000000_init_metadata/migration.sql` / `20261024000000_init_metadata` | 5641 | `071baba74aeb0c82be7f904c34e5473fbdb0a02412383c6887e032ff0025de48` |
| 1 | `docs/admin/migrations/ADMIN-002/migration.sql` / `20261028000000_admin_iam_foundation` | 8695 | `9abf3d7d1ab6f7bcf195823a610623cece127d34e81c066c830226fa0f630aee` |
| 2 | `docs/admin/migrations/FEATURE-001A-001/migration.sql` / `20261103000000_feature001a_audit_integrity` | 1581 | `fa23adb45e7d2f44dd315cd185fc39240f4c77525ddb9b768b2ee5ff7acbf1cf` |
| 3 | `docs/admin/migrations/FEATURE-001B-001/migration.sql` / `20261103010000_feature001b_tenant_consistency` | 793 | `77f0375f5ee9e7168c6b1c68dfbc7713c1963423d662740423702c5a9ff597db` |
| 4, after separate runtime provisioning | `docs/admin/migrations/FEATURE-001B-002/runtime-privileges.sql` / operational grant step, no Prisma row | 1755 | `e1c15b19f158cee8f7ba4531d7b7bf70af4a0a064f8259b0d417a5422614886f` |

ADMIN-002 LF-normalized SHA-256 is `156ae317342ca4690ebf8b74ba501d3bb9998de83293e0f7295e28b1ca1d07b9`; it is not the executed checkout hash. Baseline LF-normalized SHA-256 is `4faf3b018ee0c34adbb615486cbb04bb06cc2d5c2919c27f7209fa38f4558a82`. Corrective/grant artifacts are LF and pinned by `.gitattributes`.

Baseline supplies seven application metadata tables plus the Prisma ledger. ADMIN-002 depends on tenants/projects and adds two enums and nine IAM/audit tables with indexes and foreign keys. The audit correction depends on that foundation and replaces tenant/actor audit foreign keys with RESTRICT, installs mutation/truncate triggers and revokes PUBLIC audit mutation permissions. The consistency correction depends on the foundation and existing projects: it adds `(tenant_id,id)` project uniqueness, two composite tenant/project foreign keys, and trimmed tenant-name length CHECK. The grant step requires all these objects plus a separately reviewed `skyra_org_runtime` role. It creates no role or credential.

All five artifacts were executed in isolation in this milestone. Protected read-only evidence shows only the baseline was applied; its ledger checksum matches the exact baseline above. None of the four subsequent artifacts is present on the protected database. This describes the current ledger/catalog, not a claim about every past action on that server.

## Fresh rehearsal and transactions

`node scripts/feature001c-regression.mjs migrations` reset only the marker-owned disposable database, using host 127.0.0.1:5433, role skyra_isolated_user, cluster marker `26d25080-7655-4147-b05a-512ad359e14f`, and the separately verified `.tmp/feature001a-postgres/data` directory. Independent generated isolated credentials were used. The physical administrator check verified PostgreSQL 17.9 and exact data directory before administrative writes. Target guard tests reject 5432, wrong identity/version/marker and unapproved connection forms.

The original ADMIN-002 has no transaction wrapper. The rehearsal explicitly sends BEGIN, SET LOCAL lock_timeout, exact original SQL, COMMIT on the same verified connection. Failure after the complete candidate rolled back all IAM objects and preserved the baseline fingerprint. A separate autocommit probe demonstrated retained partial DDL, then removed that disposable probe. Never infer atomicity from IF NOT EXISTS.

The audit and consistency corrections contain their own BEGIN/COMMIT and local lock/statement timeouts. Audit failure injected before COMMIT restored the original cascade foreign keys and removed the new trigger function. A derived consistency fixture removed/reconstructed its prerequisites inside one test transaction and injected a missing relation before commit; rollback restored the complete prior schema. The runtime grant artifact contains BEGIN/COMMIT; a derived failure after an ACL revoke restored all ACLs. Fixture bytes are explicitly different from approved artifact bytes and are never staged as migrations.

Baseline has no explicit transaction wrapper. Prisma deploy was used only to create the fresh disposable baseline; this report does not claim Prisma automatically makes every PostgreSQL migration atomic. Protected baseline already exists and must never be reapplied as part of Approval A.

## Ledger, repeat and drift

Exact SQL bytes were staged in a unique ignored release directory. After each successful manual SQL application, Prisma `migrate resolve --applied <exact-id> --schema <staged-schema>` recorded the real application. Subsequent deploy reported no pending migrations. This is bookkeeping for already-executed SQL, not invented application evidence. The final isolated ledger contains exactly four successful entries matching the four schema checksums, with no rolled-back entries. Operational grants have no synthetic ledger entry.

SQL commit and Prisma resolve are separate commits. On interruption, stop and compare exact artifact hash and full catalog before any resolution. If SQL committed and matches completely, only the separately authorized executor may resolve that exact staged migration. Never reapply a non-idempotent correction or write ledger rows manually to hide uncertainty. If partial/autocommit drift exists, stop for recovery review.

Repeated original ADMIN-002 under a transaction preserved schema; IF NOT EXISTS is not a drift repair mechanism. Repeated Prisma deployment preserved schema/ledger. Raw consistency replay correctly failed on the existing index (42P07), with rollback and unchanged ledger/catalog. Runtime grants repeated twice with no ACL drift. An extra-column probe changed the fingerprint and rolled back. Catalog comparison covers columns, constraints, indexes, enums and triggers. Recovery also compares function definitions, owners and ACLs. Canonical ingestion and mirrored query Prisma schemas pass synchronization and actual generated-client operations. SQL-managed expression uniqueness, CHECKs and triggers remain explicit catalog obligations; no db push or autogenerated destructive reconciliation is approved.

## Ordinary runtime proof

The restored database retained the exact owners and ACLs. As `skyra_org_runtime`, actual OrganizationService/Prisma queries read the tenant and performed an authorized optimistic name update with an atomic durable audit insert. Direct audit UPDATE, DELETE, TRUNCATE; tenant DELETE; ALTER TABLE; DROP TABLE; and disabling triggers each failed with 42501. Owner-level hardening tests separately proved mutation/truncate trigger errors (55000), tenant/actor deletion restrictions (23503), audit failure rollback and composite tenant/project enforcement. Browser E2E uses ordinary runtime credentials for the full API path.

Catalog evidence: runtime is NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOINHERIT, NOBYPASSRLS, with no memberships or application object ownership and no role-level session settings. CONNECT and public USAGE succeed; public CREATE is false. It has SELECT on the eight necessary IAM/tenant/project/audit tables, INSERT on audit, UPDATE(name,updated_at) on tenants, and UPDATE(updated_at) on users/memberships for SELECT FOR SHARE. No general identity/role/membership mutation is enabled. UUID defaults use gen_random_uuid; no application sequences need runtime grants. No additional default-privilege grants exist. Future objects require explicit review.

The audit function is SECURITY INVOKER, owner skyra_isolated_user, fixed search_path pg_catalog; default PUBLIC EXECUTE remains. Calling it can only raise the audit-mutation exception. Trigger ownership follows the owning table; runtime cannot replace the function, alter table, or disable triggers. Tests use Prisma transactions with normal runtime connections and no privileged session override. The grant artifact itself does not configure CONNECT or credentials; Approval A must include explicit CONNECT and verified ownership separation. Test-only marker-schema privileges are not proposed protected application grants.

These controls do not supply database row-level tenant isolation: the runtime can SELECT across tenants and can directly update permitted name columns or insert audit rows. Application authorization and transactions enforce tenant scope and attribution. They do not defeat a compromised superuser or a schema owner deliberately removing controls.

## Minimal audit/lifecycle policy for review

Feature-001 exposes no tenant hard deletion or status-change endpoint. Existing architecture describes suspension/decommissioning and log retention; it does not establish an administrative-audit retention duration. No retention duration or deletion job was introduced.

Proposed approval policy: no tenant hard deletion through this slice; future deactivation preserves tenant identity and audit rows; ordinary runtime audit history is append-only; authorized investigations retain controlled read access, including after deactivation. The current name-update path denies non-ACTIVE mutations while allowing authorized metadata reads. A future investigation API must separately define access, export and privacy controls. Audit tenant/actor RESTRICT prevents cascades from deleting history; other membership cascades cannot override it. Product/legal owners must decide retention and lawful deletion separately, without an arbitrary legal period here. Acceptance of the no-hard-delete/append-only boundary is an Approval A dependency, and is not permission for indefinite retention.

## Evidence and limitations

Ignored evidence: `.tmp/feature001c-evidence/{migrations.json,migrations-*.log,readiness.json,recovery.json}` and the referenced A rehearsal JSON files. The C logs reflect fresh runs; old acceptance totals were not substituted. `readiness.json` contains exact inventory, successful ledger entries, runtime catalogs and failure/repeat checks. No protected migration, resolution, role mutation, bootstrap or activation occurred. Recovery details and remaining human decisions are in the companion backup/activation report and Approvals A/B/C.
