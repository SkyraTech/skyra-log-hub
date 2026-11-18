# LOGHUB-FEATURE-001A — environment recovery

Date: 2026-11-03, Asia/Calcutta. **PASS — ENVIRONMENT READY FOR FEATURE-001B**. This verdict concerns test infrastructure, not Feature-001 completion or protected migration approval.

## Initial environment

Workspace `C:\Users\VAMSHIKA\source\repos\skyra-tech-projects`; LogHub and Platform are its `skyra-log-hub` and `skyra-platform` directories. Both branches were `main`. LogHub HEAD `19f084ad36fe37bb57ca107103e136d2d4a378be`; Platform HEAD `928ca4343ab3a1887e586123a6ba5bb88b56a0ef`. No staged/unstaged tracked changes. Exactly three existing untracked Feature-001 reports were preserved. Platform was and remains clean. No AGENTS.md was found in the workspace search during the parent audit; no new applicable instruction file was observed.

Node 24.14.0; global pnpm package 11.25.0; repository pin and successfully bootstrapped pnpm 12.3.4; Corepack 0.34.6; PostgreSQL client/server 17.9 (only installed PostgreSQL major directory: 17); Prisma/client 5.22.0. Admin/BFF compiler 5.7.3; root compiler 7.0.2. No repository .npmrc or Turbo configuration was found. Workspace patterns, allowBuilds and Platform archive overrides already exist in pnpm-workspace.yaml. The tracked lockfile contains pnpm bootstrap and workspace dependency documents; its opening manager-only document is not evidence of lockfile corruption.

## Confirmed root causes and repairs

1. Admin/BFF manifests already declared NestJS, Fastify, reflection and cookies. Existing virtual-store packages were present, but the service-local links and root pg dependency were not fully hydrated. Frozen filtered pnpm install repaired them. No service dependency manifest or TypeScript resolution workaround was necessary.
2. Sandboxed pnpm stalled before emitting a script banner; the global launcher was bootstrapping the pinned manager and accessing external cache/registry state. Approved external-cache execution returned pnpm 12.3.4 and subsequently ran the same commands normally. No backend runner hang remained after repair. Process/service inspection was performed; only our stalled invocations were interrupted. No unrelated process was killed.
3. An offline frozen attempt failed with `ERR_PNPM_NO_OFFLINE_META` for `@babel/plugin-syntax-import-attributes`; it also initially reported a supply-chain metadata check failure. Online access completed policy checks successfully and fetched missing locked dependencies. No policy bypass, forced reinstall, package upgrade or full node_modules deletion was used.
4. The old isolated runner downloaded an unpinned tsx using dlx and guessed a database URL. Root tsx 4.20.6 is now explicitly pinned; runner uses local `node --import tsx`, serial test files and manifest-owned credentials. This justified the package.json/lockfile update. Lock diff adds tsx/get-tsconfig/resolve-pkg-maps and optional peer graph links; existing package versions were not upgraded. pnpm hydrated further locked workspace packages while adding the root runner; no unrelated source changed.
5. Port 5433 had no server. Implemented a separate PostgreSQL 17 cluster lifecycle and shared fail-closed test guards; see the isolated PostgreSQL report.
6. Fixed confirmed test defects: exclude `_prisma_migrations` from the operational-table count; seed the current authoritative 20 capabilities rather than an invented 22; await verified pools; relabel SET NULL behavior without falsely calling it immutable. Original schema expectations remain explicit and separate from hardening tests.
7. The ingestion live test previously auto-read the protected .env and explicitly required the protected database name. It now skips without explicit test configuration, rejects unsafe targets, checks the live marker before writes, and confines its outage probe to the disposable instance. Only this relevant test infrastructure changed; no ingestion business logic changed.
8. Windows pg_ctl background startup initially kept inherited pipe handles open. Lifecycle subprocesses now use hidden windows and ignored stdio for pg_ctl; final stop/start verification succeeded. An initial guard rejected PostgreSQL's `inet` text containing `/32`; comparing `host(inet_server_addr())` fixed the representation mismatch without relaxing host validation.

## Changed files

- Root package.json: local runner and focused recovery/test scripts; pnpm-lock.yaml: corresponding locked graph additions; .gitattributes: LF bytes for the new correction only.
- Scripts: isolated-postgres.mjs; lib/isolated-target.mjs; protected-catalog-snapshot.mjs; rehearse-admin-migration.mjs; run-isolated-pg-tests.mjs; run-isolated-compatibility.mjs; verify-backend-dependencies.mjs.
- Admin test infrastructure: fixtures.ts, guard.ts, migration/parity, tenant-isolation, RBAC, concurrency and bootstrap test files; new isolated-target.test.mjs and postgres-hardening.test.mjs.
- Ingestion live-postgresql.test.ts: safety/isolated compatibility only.
- New versioned `docs/admin/migrations/FEATURE-001A-001/migration.sql`, setup guide and four requested Feature-001A reports (five documentation deliverables total).

No Admin/BFF business logic, Angular source, Platform source, existing ADMIN-002 bytes, protected configuration, activation flags or prior reports changed.

## Verified recovery

Dependency verifier resolves Nest core/common/platform-fastify, Fastify, reflect-metadata, all three workspace loggers in both services; Prisma/client/pg in Admin; cookie in BFF; root pg 8.23.1 and tsx 4.20.6. Prisma engine/CLI version works, and explicit baseline client generation succeeds without database writes.

Both service typechecks and builds pass. Shared logger-core, logger-node and logger-nestjs builds pass. Admin 48 tests and BFF 54 tests pass; logger-node and logger-nestjs each pass 46 tests. logger-core's existing test script exits 0 with **zero discovered tests**, not a test-coverage claim. Existing admin contracts pass 7 tests. Exact commands and individual counts are centralized in the final acceptance report.

Repeat `pnpm install --frozen-lockfile --offline --ignore-scripts --filter @skyra/admin-service... --filter @skyra/console-bff... --reporter append-only` exits 0, already up to date. No dependency upgrade is needed to repeat backend tests.

## Remaining limitations

`pnpm peers check` exits 1 for an existing UI-only mismatch: dropdown-menu/popover require design-tokens 0.1.1 but the workspace override selects archive 0.1.0. It does not compromise these backend tests and was not changed under the Platform/UI freeze. Initial root-runner hydration logged slow tarball downloads and deprecated glob/tar notices. Expected negative-path Nest logs are test behavior, not failed tests.

Persistent Admin identity/membership/audit adapters and BFF authoritative resolution remain `APPLICATION_NOT_IMPLEMENTED` for Feature-001B. Schema/privilege/model concerns remain blockers to protected execution, detailed separately. No Organization Management API or UI was implemented in this recovery milestone.
