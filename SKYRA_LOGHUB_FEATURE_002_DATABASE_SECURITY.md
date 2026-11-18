# FEATURE-002 — Database and security

## Verified targets

All writes used the disposable PostgreSQL 17.9 instance at `127.0.0.1:5433`, database `skyra_loghub_disposable_validation`, owner `skyra_isolated_user`, marker `26d25080-7655-4147-b05a-512ad359e14f`, physical storage `.tmp/feature001a-postgres/data`. The isolated helpers verify exact URL host/port/database/role, live identity and marker; administrative connection additionally verifies PostgreSQL version and physical data_directory. No default/fallback target is used.

Protected PostgreSQL `127.0.0.1:5432/skyra_loghub_dev`, role `skyra_loghub_user`, received read-only catalog/data-digest inspection only, with startup default_transaction_read_only and a repeatable-read READ ONLY transaction. The FEATURE-002 before checkpoint was taken during final regression preparation, not at the beginning of development. Final comparison passed byte-for-byte and matches the historical FEATURE-001D baseline: SHA-256 `90f73c6f2bc6bce568974e27472fd652505e3034284ff4a9883104b1fd02a6ff`, eight tables, baseline ledger row only, zero application rows. No protected migration, DML, privilege/ledger mutation, bootstrap, backup/restore or activation was executed.

## Additive artifacts

| Artifact | Bytes (LF) | SHA-256 |
|---|---:|---|
| `docs/admin/migrations/FEATURE-002-001/migration.sql` | 1119 | `e1901d132be565063fa98272a4c02facc34e26c4d6446947b2a9be78c2d38ba8` |
| `docs/admin/migrations/FEATURE-002-002/runtime-privileges.sql` | 1272 | `dc37d947c1a5f7fcf530b122bce15790efbfa81aa604509575c2a6dfc4931f8b` |

The first artifact is schema migration `20261104000000_feature002_membership_integrity`. The second is reviewed operational grants, not a fabricated Prisma migration. Existing executed SQL was not rewritten. New .gitattributes entries preserve these exact LF bytes.

Preparation preflight found zero orphan role assignments and zero project-scoped OrgOwner/OrgAdmin assignments. It intentionally aborts for either condition rather than repairing unknown data. First application injected a missing-relation error before COMMIT and verified rollback of constraint catalog and absence of the new function, then executed the exact reviewed SQL transaction. Prisma resolve registered actually executed SQL; validate/generate and repeat migrate deploy succeeded with no pending migrations. Final disposable ledger has five successful entries: baseline, ADMIN-002 foundation, FEATURE-001A audit integrity, FEATURE-001B tenant consistency and FEATURE-002 membership integrity, with matching checksums. Detailed hashes/ledger are in `.tmp/feature002-evidence/migration.json`.

New foreign key `role_assignments_membership_fkey` requires the same tenant/user membership, with RESTRICT delete/update. Existing tenant/project, role, identity and uniqueness constraints remain. Stable listing index covers tenant/createdAt/id. Invoker trigger `enforce_admin_role_scope`, fixed search_path pg_catalog with public-qualified roles, rejects project-scoped OrgOwner/OrgAdmin (23514). No schema object was dropped or rebuilt.

## Runtime authority

Real service/persistence testing uses nonowner `skyra_org_runtime`, not the schema owner. It remains NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOINHERIT, NOBYPASSRLS, no role memberships, no database/schema/table ownership or public CREATE. Grants add column UPDATE(status,updated_at) on tenant/project memberships and INSERT/DELETE on role_assignments. Existing SELECT, limited tenant-name UPDATE and audit INSERT stay in place. No identity creation/edit, canonical-role mutation, schema DDL, audit UPDATE/DELETE/TRUNCATE or self-grant privilege is provided. Repeated grant execution is safe.

The runtime can execute application membership writes across tenants at the SQL privilege layer; it is not an RLS isolation boundary. Every service query binds tenant, and composite FKs prevent inconsistent grants. A compromised database owner remains outside this runtime security model.

## Mutation invariants

The tenant row lock is acquired before authorization and before target/owner inspection. This serializes role/status writes, including two simultaneous owner self-demotions and mixed suspension/demotion. Active owners require ACTIVE identity, ACTIVE tenant membership and organization-wide OrgOwner role. Disabled owners cannot satisfy preservation. Last-owner demotion/suspension/revocation is rejected without audit or partial state.

If-Match contains membership UUID plus database microsecond version; update uses a conditional version predicate and advances at least one microsecond. Concurrent stale writers yield one commit and one conflict. Assignment changes, project revocation, membership version and immutable audit insert are one transaction. Injected audit failure reverses role/status/version changes. Server-derived actor, target, action, outcome and correlation are audited without credentials.

## Authentication and authorization

Existing signed OIDC tests use an ephemeral RSA provider, actual discovery/JWKS, code exchange, PKCE, browser-bound state/nonce and real RS256 verification. OIDC mock mode is disabled. Synthetic provider configuration is test-only and is not a real Entra tenant. Existing forged/expired/malformed assertions and callback failures remain denied. Admin re-resolves persisted issuer/subject and active membership; claim roles/capabilities are ignored. Internal assertions have operation-specific scope and at most 60 seconds lifetime. Browser CSRF, session, selected tenant, payload validation and safe projections remain mandatory.

Role/status changes affect the next Admin-authorized request. Authoritative BFF query/workspace operations now refresh memberships before minting project assertions. Existing issued assertions can remain valid until expiry; session storage and downstream in-flight requests are not globally invalidated. Audit immutability, cross-tenant denial, disabled/missing/revoked access and lack of privilege escalation are covered by unit, real PostgreSQL and browser tests listed in the E2E report.

## Activation remains separate

These are candidate protected artifacts only. Existing Approval A/schema, Approval B/verified initial organization and owner, and Approval C/activation are still pending; FEATURE-002 grants also need review before any protected execution. Real Entra tenant/app configuration and verified human identity remain external prerequisites. Nothing in this report authorizes protected writes or activates authentication.
