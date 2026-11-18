# FEATURE-003 — Database and security

Date: 2026-11-04. All mutations are confined to independently verified disposable PostgreSQL.

## Targets and preservation

Isolated: `127.0.0.1:5433`, database `skyra_loghub_disposable_validation`, migration owner `skyra_isolated_user`, PostgreSQL 17.9, marker `26d25080-7655-4147-b05a-512ad359e14f`, physical data `.tmp/feature001a-postgres/data`. Preparation and administrative test helpers verify exact URL, live database/role/port, marker, engine and physical storage before writes. Runtime connection is separately checked as `skyra_org_runtime`; no protected fallback exists.

Protected: `127.0.0.1:5432/skyra_loghub_dev`, role `skyra_loghub_user`. The initial FEATURE-003 snapshot was taken before project database implementation, using startup read-only mode and a verified repeatable-read READ ONLY transaction. Final comparison passes byte-for-byte and matches the historical baseline: SHA-256 `90f73c6f2bc6bce568974e27472fd652505e3034284ff4a9883104b1fd02a6ff`, eight tables, one baseline migration record, no application rows. No protected writes, grants, migration/ledger updates, bootstrap, backup/restore or activation are authorized or executed.

## Exact additive artifacts

| Artifact | LF bytes | SHA-256 |
|---|---:|---|
| `docs/admin/migrations/FEATURE-003-001/migration.sql` | 944 | `e2bbb45069e43f92fc06824daf9c183bd013463a0e6cb854a5f3b130350f28a6` |
| `docs/admin/migrations/FEATURE-003-002/runtime-privileges.sql` | 1045 | `dfd8aa4cd59140c004ca6fb5d37e3e2e09af68fe6f9eb9717d23bb2924ff55ca` |

Schema migration name: `20261104010000_feature003_projects`. Existing executed artifacts remain unchanged. Operational grants are not represented by a fabricated Prisma migration. Exact LF bytes are pinned through .gitattributes.

Adds tenant/createdAt/id project listing index; quota composite FK `(tenant_id,project_id) → projects(tenant_id,id)` with RESTRICT update/delete; and an invoker trigger rejecting project ID/tenant movement. The trigger uses fixed `pg_catalog` search_path. Existing global project primary key, tenant FK, legacy quota single-project FK, membership/assignment composite constraints and all existing records remain intact. Canonical Prisma models both new composite and retained legacy quota references, and the listing index; the query-service mirror is synchronized byte-for-byte. No table rebuild, mass conversion or deletion occurred.

Existing quota preflight found zero inconsistent references; it aborts rather than cleaning unknown data. Existing legacy project IDs/names remain valid because no retrospective code/minimum-name constraint was imposed. Application create/update validation applies the canonical new-input rules.

## Migration rehearsal and drift

Before first application, intentional missing-relation failure before COMMIT verified rollback of the new index, constraint and function; its trigger creation is covered by that same transaction. Then exact SQL was executed and Prisma resolve registered actually executed SQL. Validate/generate and repeat deploy pass with a six-entry ledger: baseline, ADMIN-002 foundation, FEATURE-001A audit, FEATURE-001B tenant consistency, FEATURE-002 membership integrity, FEATURE-003 projects. Ledger checksum matches the reviewed SQL. Operational grants were applied twice successfully.

The shared project migration integrity check validates successful ledger/checksum, valid listing index definition, validated composite FK, enabled immutable-identity trigger and fixed function search_path. Preparation uses this check before granting/seeding. Tests pass altered candidate bytes to this actual check and verify rejection without touching immutable artifacts/ledger. A disposable transaction temporarily drops only the new index; the same check detects catalog drift, then ROLLBACK restores it and verification passes. No fake ledger state is introduced. The old four-/five-entry readiness assumptions are not used for current acceptance.

## Runtime grants and tenant boundary

Runtime remains a nonowner NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOINHERIT/NOBYPASSRLS role, no inherited memberships, no database/schema/table ownership and no public CREATE. FEATURE-003 grants only project INSERT columns `(id,tenant_id,name,status,created_at,updated_at)` and UPDATE `(name,status,updated_at)`. Existing SELECT and append-only audit permissions remain. No ID/tenant UPDATE, project DELETE, credential/quota mutation, schema DDL or audit UPDATE/DELETE/TRUNCATE is granted. Migration/preflight and fixture operations use independently verified isolated owner/admin helpers, not production credentials.

SQL privileges alone do not restrict the runtime to a single tenant: every service query binds the authorized tenant, while composite FKs prevent inconsistent references. Canonical role capabilities and active organization/project memberships restrict scope before list/search/detail and writes. A project-scoped ProjectAdmin cannot promote scope, create projects or archive; stored claims from the browser/provider are ignored. Inactive tenant/identity/membership is denied on every operation. Cross-tenant details return not found, and foreign duplicate IDs use a generic conflict.

## Concurrency, audit and lifecycle

Tenant SHARE locks coordinate with Organization/Members exclusive mutation locks. Project row locks give coherent metadata/ETag and serialize updates. Required project-specific microsecond If-Match is included in the SQL UPDATE predicate; advancement is at least one microsecond. Concurrent duplicate creation is arbitrated by global primary-key uniqueness. Name/status changes, version and immutable audit INSERT share a transaction. Real database-trigger failures test rollback for creation, name and status, including absence of partial audit/state. Existing audit immutability and runtime DDL denials remain tested.

Lifecycle follows existing ACTIVE/SUSPENDED/ARCHIVED enum: active creation; suspend/reactivate; terminal archive. Existing ingestion ProjectService reads actual persisted status on each admission through Prisma, rejecting inactive projects without deleting quotas or revoking machine credentials. The dedicated integration test exercises this actual service/repositories with a previously authenticated synthetic machine identity; it generates no credential. Before/after digests of existing credential rows remain equal.

BFF workspace/query calls revalidate persisted membership/project grants. Inactive projects disappear, stale selected IDs clear, newly created/renamed projects appear according to canonical tenant-wide/project-scoped policy. New internal assertions are operation scoped with configured signing keys and maximum 60 seconds lifetime, explicitly tested for both project scopes. Already issued assertions/in-flight requests can survive to existing expiry; no global token recall is claimed. Query-engine internals and credential workflows were not modified.

Final individual test counts, browser evidence and protected comparison appear in the E2E/final reports. Real Entra setup, initial real owner selection and protected schema/privilege/activation approvals remain pending external decisions, not actions performed here.
