# Isolated PostgreSQL 17 development setup

This procedure modifies only a newly owned test cluster. Never use the protected `skyra_loghub_dev`, port 5432, its credentials, Windows service, or storage for mutation tests. Organization APIs, membership activation and bootstrap in the protected database remain unauthorized.

## Prerequisites and dependency repair

Validated on Windows with Node 24.14.0, repository-pinned pnpm 12.3.4, Corepack 0.34.6 and PostgreSQL 17.9. Admin/BFF use TypeScript 5.7.3; the root compiler is 7.0.2. Install PostgreSQL 17 client/server binaries; a new Windows service or Docker installation is unnecessary. Run commands from the LogHub repository root.

```powershell
node --version
pnpm --version
pnpm install --frozen-lockfile --ignore-scripts --filter @skyra/admin-service... --filter @skyra/console-bff...
pnpm --filter @skyra/admin-service exec prisma generate --schema ../ingestion-gateway/prisma/schema.prisma
pnpm --filter @skyra/logger-core build
pnpm --filter @skyra/logger-node build
pnpm --filter @skyra/logger-nestjs build
pnpm verify:backend-dependencies
pnpm --filter @skyra/admin-service typecheck
pnpm --filter @skyra/console-bff typecheck
pnpm --filter @skyra/admin-service test
pnpm --filter @skyra/console-bff test
```

Prisma generate writes generated client code, not database schema/data. Lifecycle scripts are deliberately skipped during dependency hydration; client generation is explicit. On the first run, allow access to the configured npm registry and pnpm cache. Subsequent filtered installs can add `--offline`; missing offline metadata is a dependency/cache limitation, not permission to upgrade dependencies or relax supply-chain policy. The tracked lockfile is required; do not regenerate it to fix links. The pinned local tsx runner replaces runtime `pnpm dlx` downloads.

## Initialize once

Optional overrides are software/test-port configuration, not database credentials:

```powershell
# Optional only if PostgreSQL 17 binaries are not in the normal Program Files installation:
# $env:PG_BIN = 'D:\PostgreSQL\17\bin'
# $env:ISOLATED_PG_PORT = '5433'
pnpm db:isolated init
pnpm db:isolated verify
```

The script checks that the port is free and the directory does not exist. It initializes `.tmp/feature001a-postgres/data`, binds only `127.0.0.1`, and creates:

- A separate administrator `skyra_test_admin` and non-superuser test role `skyra_isolated_user` with independently generated passwords.
- Database `skyra_loghub_disposable_validation` and an administrator-owned `skyra_test.environment_identity` marker.
- Ignored `state.json` with local credentials and ownership identity. Windows ACLs restrict the directory to the current user, SYSTEM and Administrators. Never paste or commit this file.

Existing directories, occupied ports and missing/invalid manifests fail closed. Never delete an unknown existing directory to get past initialization. Diagnose it first. `PG_BIN`/`ISOLATED_PG_PORT` are initialization settings; subsequent commands use the verified manifest. The live physical data directory must match the manifest and remain under the repository; redirected data directories are rejected.

## Baseline, migration rehearsal and tests

For the first newly initialized empty test database:

```powershell
pnpm test:admin:target-guards
pnpm db:isolated:rehearse
pnpm test:admin:postgres
pnpm db:isolated:harden
pnpm test:admin:postgres:hardened
pnpm test:postgres:compatibility
```

The original suites intentionally run **before** audit hardening because they verify original CASCADE/SET NULL behavior and delete their fixtures. The runner rejects a schema-stage mismatch. The hardened suite rolls fixtures back instead and verifies restrictive foreign keys and append-only triggers. One explicitly named diagnostic demonstrates the original missing composite tenant/project FK; it is not a tenant-isolation acceptance.

Rehearsal stages the existing baseline Prisma schema/migration and byte-exact ADMIN-002 candidate into a new ignored directory. Prisma deploy applies the baseline; guarded SQL executes original ADMIN-002 inside an explicit transaction, followed by Prisma resolve of the matching staged artifact. Repeat deploy has no pending migrations. Hardening executes a separately versioned SQL artifact, then records it in the isolated ledger. SQL/ledger checksums, rollback failures and a schema-drift probe are verified. These commands never use protected `.env` credentials. Do not copy their resolved URLs into general application environment files.

The repository Prisma model still omits IAM models; successful ledger/catalog rehearsal does not mean full Prisma datamodel parity or completed application adapters. See the migration security report before proposing protected execution.

## Restart, stop and verified reset

```powershell
pnpm db:isolated stop
pnpm db:isolated start
pnpm db:isolated verify

# Destructive ONLY to the manifest-owned test database; preserves the separate cluster/role.
pnpm db:isolated reset
pnpm db:isolated:rehearse
pnpm test:admin:postgres
pnpm db:isolated:harden
pnpm test:admin:postgres:hardened
pnpm test:postgres:compatibility
```

Reset verifies the live role/database/port/version, cluster marker and administrator-reported data directory before dropping/recreating only the fixed disposable database. It does not delete a filesystem directory or change the protected service. Start refuses a conflicting port. Stop uses pg_ctl with only the owned data directory, not Windows service control. Keep the cluster running while developing; stop it when finished. No automatic startup service was registered.

## Optional protected read-only preservation evidence

```powershell
node scripts/protected-catalog-snapshot.mjs before
# Run isolated work only.
node scripts/protected-catalog-snapshot.mjs after
```

This separate read-only tool validates the configured protected host, port, database and role, enforces READ ONLY from connection startup, and compares schema, ledger and per-table data digests. It reads existing ingestion configuration without displaying credentials. It does not migrate, seed or restore the protected database. Do not overwrite an existing before snapshot until its comparison has been reviewed. Concurrent legitimate protected writes can cause a mismatch; investigate rather than accepting a new baseline silently.

## Troubleshooting and guard requirements

- If pnpm produces no script banner, inspect the launcher/cache/registry access before diagnosing an application test hang. In the Codex sandbox, pnpm cache/bootstrap access required the tool's approved external-cache execution; the same command completed outside that restriction. Do not kill unrelated Node processes.
- If modules fail to resolve, rerun the filtered frozen install and dependency verifier. Do not change TS module resolution, add fake declarations, mix npm installations or delete all node_modules.
- If the client was not generated on a clean install, run explicit Prisma generate above; it does not activate persistence.
- Port occupied or cluster identity mismatch: do not reuse that server. Stop and investigate its owning process/manifest. Never substitute port 5432.
- A normal test connection needs `SKYRA_ISOLATED_TEST_ENV=true`, the manifest's `ISOLATED_CLUSTER_ID`, and its `ISOLATED_DATABASE_URL`. The provided runners supply these only to child processes. Guards reject missing markers, unexpected hosts, roles, databases, URL options, server versions and protected ports, and verify the live marker before mutations.
- Backend tests pass with staged/in-memory adapters; they do not establish persistent organization behavior. Existing database tests exercise SQL and synthetic workers, not the unfinished Admin Prisma adapters.
- Existing UI peer warning: dropdown-menu/popover request design-tokens 0.1.1 while the workspace override pins 0.1.0. This does not affect isolated backend tests; do not change Platform/UI packages in this milestone.

Local outputs are in `.tmp/feature001a-evidence/`; credentials/data are in a different restricted ignored directory. No real credential belongs in committed configuration. Recovery of this test database is guarded reset plus the procedure above; this is not a protected backup/restore plan.
