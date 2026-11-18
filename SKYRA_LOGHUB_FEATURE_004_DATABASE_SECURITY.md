# FEATURE-004 — Database and credential security

Date: 2026-11-05. All mutations described here target the independently verified disposable environment only.

## Targets and guards

| Target | Verified identity / result |
|---|---|
| Disposable | `127.0.0.1:5433/skyra_loghub_disposable_validation`; PostgreSQL 17.9; owner `skyra_isolated_user`; cluster marker `26d25080-7655-4147-b05a-512ad359e14f` |
| Physical cluster | Existing `.tmp/feature001a-postgres/data`; admin helper verifies physical data directory/server version; startup reused this cluster without initialization/reset |
| Manager | `skyra_org_runtime`, nonowner login; URL, live host/port/database/user/version and marker checked |
| Gateway | Separate `skyra_ingestion_runtime`, nonowner login; fixed-role verifier performs the same live checks; private cluster-bound password is never included in reports |
| Protected | `127.0.0.1:5432/skyra_loghub_dev`, `skyra_loghub_user`; separate snapshot connection forces READ ONLY and verifies identity; no writes |

Target guards reject missing isolation flag/marker, malformed/wrong URLs, protected port/database, unexpected role, wrong live identity and marker. 15 guard tests pass. WAL/archive paths are fresh children of the verified repository `.tmp`, reject symbolic-link redirection, and have their own cluster-bound ownership marker before Gateway startup/restart. No external cache/queue/object store is configured in this path.

## Immutable SQL artifacts

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| `docs/admin/migrations/FEATURE-004-001/migration.sql` | 2904 | `b21c56e916cba08ac9821213162a1ac352d722e8da2afca06fb29914ad897e7b` |
| `docs/admin/migrations/FEATURE-004-002/runtime-privileges.sql` | 2312 | `fcdad1d583db86fa7defbc3a52e1171077fc14ee29f000cae4987333451d5cc0` |

Schema SQL is ledgered as `20261105000000_feature004_credentials`, seventh migration. Grants are a separately versioned operational artifact. Both are LF-pinned and were not edited after successful application. Earlier migration artifacts are retained.

Adds nullable project_id/created_by/revoked_at/rotated_from_id/issuance_request_id and non-null updated_at to the existing ingestion_credentials table. A composite tenant/project FK prevents foreign project attribution; a composite replacement FK prevents cross-project or cross-tenant chains; unique replacement and issuance request constraints prevent duplicate minting. Creator deletion may null the creator FK without rewriting credential identity. Scope/hash checks and a fixed-search-path invoker trigger protect managed identity, scope, verifier and terminal revocation. No raw-secret column exists. Listing has a tenant/project/created_at/id index.

Backfill adopts only rows with one actual project in the same tenant and a correctly shaped SHA-256 digest. Initial isolated preflight had zero credentials; subsequent preparation counts include acceptance fixtures and are not a production inventory. Wildcard/multi-project/invalid legacy rows remain unmanaged. Legacy entropy cannot be inferred from digest shape; inventory/replacement remains an activation review item if such rows exist elsewhere.

Validation: injected pre-commit migration failure restored row digest and left no new columns/function; exact candidate applied/resolved; Prisma validate/generate succeeded; repeated deploy reports seven migrations and none pending. Grants applied repeatedly without broadening rights. Live checker verifies ledger checksum, index, exact validated FK/check/unique definitions, enabled row-level BEFORE UPDATE trigger, invoker status, fixed search path and function body. Transactional index removal, weakened constraint and altered trigger body are detected, then rolled back. Canonical and Query mirror schemas match.

## Runtime privileges

| Role | Allowed | Denied / excluded |
|---|---|---|
| Management | Safe metadata SELECT; explicit credential issuance INSERT columns; UPDATE is_revoked/revoked_at/updated_at; existing authoritative IAM/project/audit privileges | SELECT key_hash; credential DELETE; immutable scope/verifier updates; schema ownership/CREATE/DDL or self-granting |
| Ingestion | SELECT legacy authentication columns including verifier; UPDATE last_used_at only; tenant/project/quota reads; receipt SELECT/INSERT; archive/checkpoint SELECT/INSERT/UPDATE needed by existing pipeline | Credential INSERT, revoke/update scope, admin audit INSERT; schema ownership/CREATE/DDL or role membership |

Both runtimes are NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOINHERIT/NOBYPASSRLS with no parent role memberships or public object/database/schema ownership. Test marker schema read access is harness-only, outside the production grant artifact. The Gateway production code path does not acquire manager/owner credentials.

## Cryptography and disclosure

New tokens use `crypto.randomBytes(32)` (256 random bits), formatted `skyra_live_` plus 64 lowercase hex characters. Persist only indexed SHA-256; constant-time comparison checks the returned digest. An unkeyed digest is appropriate for uniformly random 256-bit bearer secrets; no verifier key/pepper is introduced or stored with the database. Public prefix is the constant `skyra_live_`, exposing zero random bits; UUID is the safe identifier. No claim is made that database administrators cannot see verifiers, or that the intended browser recipient cannot inspect an issuance response.

Secrets are emitted only by committed create/rotate responses and held in browser memory until cleared. Metadata schemas and BFF projection reject/remove plaintext, verifier and arbitrary grant fields. Labels reject token-shaped new credentials. Audit contains actor/tenant/project/credential IDs, public prefix, lifecycle/expiry, correlation and outcome; no raw token/verifier or user-supplied label. No secret recovery/replay endpoint or reversible encryption exists.

Real persistence tests verify unique generation/digest storage, scope FKs, canonical roles, inactive memberships, request replay, version preconditions, concurrent mutation outcomes, three audit-failure rollbacks, immutable revocation, privilege denial and redaction. Browser tests scan persisted rows/audits, Admin/BFF/Gateway logs, WAL payloads and browser DOM/storage/history for known issued plaintext. Revealed secrets are never captured in screenshots, HAR, traces or reports.

## Authorization, failures and activation

Canonical policy is unchanged: OrgOwner/OrgAdmin and correctly scoped ProjectAdmin have read/create/rotate/revoke; Developer has read/rotate, no create/revoke; Viewer has none. Active persisted tenant/user/membership and scoped project assignment are resolved for each operation. Internal assertion roles and provider claims cannot grant authority. Ingestion credentials do not authorize Admin APIs.

Management locks coordinate with existing member/project updates; credential mutation and canonical audit commit atomically. If audit fails, no usable newly issued secret is returned and changes roll back. UUID idempotency prevents a second issuance; ambiguous response requires safe metadata review and revocation of any unconfigured key. Permanent revoke is idempotent. Runtime last-used updates cannot revive a revoked key and do not alter management ETags.

Gateway makes a database lookup on each new authentication. After revoke commits, the next authentication is rejected without a credential-cache window; already authenticated work may finish. Expired/invalid/missing keys fail closed. Controlled verifier SELECT denial yields safe retryable HTTP 503 and no WAL append, then restores the exact privilege. This is a real database-access failure test, not a claim that the PostgreSQL server was shut down. Unit tests also cover thrown lookup/tenant errors and malformed returned verifiers.

Protected before/after snapshot SHA-256: `90f73c6f2bc6bce568974e27472fd652505e3034284ff4a9883104b1fd02a6ff`; unchanged catalog, one baseline migration row and zero application rows across eight tables. Future protected activation still requires explicit human approval, reviewed runtime grants/credentials, real Entra configuration and independently verified initial owner/organization decisions. No approval or production credential is fabricated here.
