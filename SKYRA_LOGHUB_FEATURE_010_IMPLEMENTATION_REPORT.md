# SKYRA LOGHUB — FEATURE-010
## Implementation report

**PASS — FEATURE-010 IMPLEMENTED IN ISOLATION** · 2026-11-09

### Initial inventory and focused gaps

Reuse: public Node factory/HTTP transport and core validator; managed credential service and one-time reveal; actual Gateway authentication/admission, WAL fsync, archive publisher and Query Service; signed-OIDC BFF session/CSRF boundaries; Angular project/credential APIs, workspace selection and Explorer URL/detail contracts. No new SDK architecture, authentication subsystem, public Admin API or parallel developer portal was introduced.

Inspection found a workspace-only core dependency in the raw Node manifest, a regression sample importing relative dist output, an SDK README assuming registry availability, no project-aware developer journey and no externally verified copy snippet. Gateway OpenAPI needed correction for empty-batch400/422 wording and hard-quota429 guidance. [Focused inventory](.tmp/feature010-evidence/gap-inventory.json).

### Public package and runnable sample

The packaging script compiles existing core/Node sources, stages manifests and changes only the staged core dependency to 1.0.0. It never publishes or modifies workspace manifests. The existing API/export structure and transport behavior remain compatible. A clean isolated consumer installs actual tarballs, resolves its own installed packages, compiles public declarations and executes ESM without source imports/path aliases. The official six-event sample reads process configuration, validates it, awaits flush/close, reports a unique run ID and sanitized failure/success. Existing FEATURE-005 helper remains available.

### Console and Platform

Route /developer/getting-started uses the existing organization session guard and navigation. Active authorized projects are fetched with bounded pagination. Selection/context changes cancel stale requests; credential guidance uses authoritative canCreate, never role guesses or secret issuance. Existing credential creation and Explorer links remain the action paths. No raw credential input, persistence, URL interpolation or browser Gateway call is added. The native project selector correctly reflects the selected option after asynchronous loading.

Installed public Platform shell/buttons/tokens are reused. No installed card/code/stepper package exists, so semantic section/pre/select elements provide domain layout and scrollable code; no shared primitive or competing framework was added. Twelve top/verification screenshots cover three widths and two themes.

### Documentation

[Quick start](docs/developers/getting-started.md) · [SDK](docs/developers/node-sdk.md) · [Ingestion API](docs/developers/ingestion-api.md) · [Credentials](docs/developers/credentials-and-security.md) · [Retries](docs/developers/errors-and-retries.md) · [Troubleshooting](docs/developers/troubleshooting.md) · [Examples](docs/developers/examples.md)

The existing SDK README now points to local artifacts and distinguishes local file/stdout logging from remote ingestion. Canonical schemas remain unchanged; OpenAPI descriptions/examples were aligned with current runtime errors.

### Verification and preservation

The documented `examples/managed-ingestion/first-log.mjs` was copied to a fresh installed consumer and executed with a canonical managed credential in authorized disposable project `project-cc48e7f9-03`. Unique run ID: `84b57d32-f4e1-4fad-8ffd-57ff8ab49688`. Six canonical events cover trace/debug/info/warn/error/fatal, service onboarding-sample, environment development, structured order attributes and trace/span IDs.

Exact ID sets match WAL, finalized JSONL archive, actual Query Service, authenticated BFF search and Angular raw event detail. Full event objects match, including message, severity, service, environment and trace fields;0 missing IDs and0 field mismatches. The browser starts at onboarding and follows its Explorer link. Foreign project/tenant queries remain rejected. Canonical test credentials are revoked and subsequent credential requests are rejected in the lifecycle/pipeline matrices. No separate fixture is substituted for these six events.

[WAL/archive/Query manifest](.tmp/feature010-evidence/minimal-continuity.json) · [BFF/Explorer manifest](.tmp/feature010-evidence/minimal-browser-continuity.json). The larger external-package regression adapter also verifies 35 primary/recovery events and 250 Explorer variation events, plus the independent Analytics cohort. Its manifest is separate from the documented six-event sample.

|Suite|TAP tests|Leaf scenarios|Failures|Skips|Cancellations|Evidence|
|---|---:|---:|---:|---:|---:|---|
|Combined real OIDC/Angular browser|100|99|0|0|0|[log](.tmp/feature010-evidence/browser.log)|
|Focused onboarding browser|21|20|0|0|0|[log](.tmp/feature010-evidence/browser-focused.log)|
|Packaged SDK/WAL/archive/Query pipeline|1|1|0|0|0|[log](.tmp/feature010-evidence/pipeline-final.log)|
|Documented minimal sample failure/lifecycle matrix|9|8|0|0|0|[log](.tmp/feature010-evidence/sample-tests.log)|
|Documentation links/contracts/snippet|4|4|0|0|0|[log](.tmp/feature010-evidence/documentation-final.log)|
|Quota accounting|17|16|0|0|0|[log](.tmp/feature010-evidence/quota-accounting.log)|
|Quota boundary/retry|5|4|0|0|0|[log](.tmp/feature010-evidence/quota-boundaries.log)|
|Quota browser|8|7|0|0|0|[log](.tmp/feature010-evidence/quota-browser.log)|
|Gateway including WAL/recovery/live PostgreSQL|124|124|0|0|0|[log](.tmp/feature010-evidence/ingestion-gateway-tests.log)|
|Admin Service|98|98|0|0|0|[log](.tmp/feature010-evidence/admin-service-tests.log)|
|SDK units/integration|55|55|0|0|0|[log](.tmp/feature010-evidence/sdk-node-tests.log)|
|Contract tests|66|66|0|0|0|[log](.tmp/feature010-evidence/contract-tests.log)|
|Isolated target rejection guards|15|15|0|0|0|[log](.tmp/feature010-evidence/target-guards.log)|
|BFF authentication/session/authorization|112|111|0|0|0|[log](.tmp/feature010-evidence/bff-tests.log)|
|Angular Console units|101|101|0|0|0|[log](.tmp/feature010-evidence/console-tests.log)|
|Query Service|214|214|0|0|0|[log](.tmp/feature010-evidence/query-tests.log)|
|PostgreSQL audit hardening|10|10|0|0|0|[log](.tmp/feature010-evidence/audit-hardening.log)|
|Credential persistence/lifecycle|29|28|0|0|0|[log](.tmp/feature010-evidence/credential-persistence.log)|
|Audit repository/security|11|10|0|0|0|[log](.tmp/feature010-evidence/audit-repository-final.log)|
|Audit browser regression|11|10|0|0|0|[log](.tmp/feature010-evidence/audit-browser-final.log)|

All listed commands exited0. Parent `t.test` containers are excluded from leaf counts; describe suites are not tests. Overlapping suites are not summed.

Additional successful gates: local core/Node package builds and tarball generation; clean consumer npm install (offline dependency artifacts), TypeScript public-import compilation, ESM execution, missing-config exit1, exact Angular snippet strict checkJs typecheck with --types node; Admin/Gateway/BFF/Query compilers; Angular production,offline build; Prisma validate using isolated DATABASE_URL; schema sync; four-index/migration integrity with transactional drift detection/rollback; Platform governance; Git whitespace. No service build ran while its final browser cohort was active. [Consumer evidence](.tmp/feature010-evidence/consumer.json), [build log](.tmp/feature010-evidence/angular-build.log), [Prisma log](.tmp/feature010-evidence/prisma-validate.log).

LogHub remains on main at `19f084ad36fe37bb57ca107103e136d2d4a378be`. Initial folded status:320 entries,124 tracked modifications,196 untracked,0 staged. Final folded status including these four reports:333 entries,126 tracked modifications,207 untracked,0 staged. All 1325 initial source files remain;186 pre-existing reports/migrations/package artifacts retain their raw hashes. FEATURE-010 changes 12 existing files and adds 24 files including four reports. One generated Angular compiler lock changed; the build-info cache was restored only after its initial hash matched HEAD. No reset, clean, rebase, merge, commit or push occurred.

Platform remains clean at `928ca4343ab3a1887e586123a6ba5bb88b56a0ef`; all 37 immutable archives match HEAD. Prisma mirrors remain byte-identical, SHA256 `ac8a9051a312cf34e24030ce054c9b4a159243933dfe6a5fbe19f3c2f1769c7c`. All 10 isolated migration checksums remain unchanged. No FEATURE-010 migration was needed.

Protected PostgreSQL `127.0.0.1:5432/skyra_loghub_dev`, role `skyra_loghub_user`, was inspected only through exact-target checks and forced read-only repeatable-read transactions. Before/after SHA256 is `90f73c6f2bc6bce568974e27472fd652505e3034284ff4a9883104b1fd02a6ff`. Its eight tables, one baseline ledger and zero application rows remain unchanged. [Preservation evidence](.tmp/feature010-evidence/final-audit.json).

### Changed files

- [scripts/protected-catalog-snapshot.mjs](scripts/protected-catalog-snapshot.mjs)
- [scripts/run-explorer-regressions.mjs](scripts/run-explorer-regressions.mjs)
- [scripts/verify-audit-migration.mjs](scripts/verify-audit-migration.mjs)
- [tests/audit/persistence.test.mjs](tests/audit/persistence.test.mjs)
- [tests/credentials/feature005-pipeline.test.mjs](tests/credentials/feature005-pipeline.test.mjs)
- [tests/organization/organization.e2e.mjs](tests/organization/organization.e2e.mjs)
- [tests/quotas/quota-boundaries.test.mjs](tests/quotas/quota-boundaries.test.mjs)
- [tests/quotas/quota-integration.test.mjs](tests/quotas/quota-integration.test.mjs)
- [apps/console-web/src/app/app.routes.ts](apps/console-web/src/app/app.routes.ts)
- [apps/console-web/src/app/layout/sidebar/sidebar.component.ts](apps/console-web/src/app/layout/sidebar/sidebar.component.ts)
- [contracts/ingestion/v1/openapi.yaml](contracts/ingestion/v1/openapi.yaml)
- [packages/logger-node/README.md](packages/logger-node/README.md)
- [apps/console-web/src/app/features/developer/getting-started.component.css](apps/console-web/src/app/features/developer/getting-started.component.css)
- [apps/console-web/src/app/features/developer/getting-started.component.html](apps/console-web/src/app/features/developer/getting-started.component.html)
- [apps/console-web/src/app/features/developer/getting-started.component.ts](apps/console-web/src/app/features/developer/getting-started.component.ts)
- [docs/developers/credentials-and-security.md](docs/developers/credentials-and-security.md)
- [docs/developers/errors-and-retries.md](docs/developers/errors-and-retries.md)
- [docs/developers/examples.md](docs/developers/examples.md)
- [docs/developers/getting-started.md](docs/developers/getting-started.md)
- [docs/developers/ingestion-api.md](docs/developers/ingestion-api.md)
- [docs/developers/node-sdk.md](docs/developers/node-sdk.md)
- [docs/developers/troubleshooting.md](docs/developers/troubleshooting.md)
- [examples/managed-ingestion/.env.example](examples/managed-ingestion/.env.example)
- [examples/managed-ingestion/first-log.mjs](examples/managed-ingestion/first-log.mjs)
- [scripts/package-node-sdk.mjs](scripts/package-node-sdk.mjs)
- [scripts/run-developer-e2e.mjs](scripts/run-developer-e2e.mjs)
- [scripts/run-developer-regressions.mjs](scripts/run-developer-regressions.mjs)
- [scripts/verify-sdk-consumer.mjs](scripts/verify-sdk-consumer.mjs)
- [tests/developer/browser-scenarios.mjs](tests/developer/browser-scenarios.mjs)
- [tests/developer/documentation.test.mjs](tests/developer/documentation.test.mjs)
- [tests/developer/minimal-pipeline.mjs](tests/developer/minimal-pipeline.mjs)
- [tests/developer/sample.test.mjs](tests/developer/sample.test.mjs)

Plus the four required FEATURE-010 reports. Generated ignored evidence is under .tmp/feature010-evidence, .tmp/feature010-quota-evidence and .tmp/feature010-audit-evidence; prior milestone evidence is retained. Test harness edits add isolated evidence labels and a clean-consumer path. Audit planner verification accepts either valid tenant index while rejecting sequential scans/sorts; all four index definitions/checksums remain independently checked.

### Deferred scope and limitations

Local isolated acceptance only. Public npm publication, hosting/deployment, real Entra configuration, protected feature activation and real customer onboarding remain outside scope. Node 24.14.0 was executed; the local artifact declares Node>=22, but no separate Node 22 binary was tested. ESM is supported; CommonJS compatibility is not promised. Third-party Ajv dependencies need registry access/cache for ordinary installation; offline validation repacks already installed dependencies. HTTP memory buffering does not persist across process death. Gateway admission precedes query visibility. SDK automatic retries do not schedule Retry-After and may exhaust before a rate window resets. Hard quota can require a policy change before a batch fits. Accessibility evidence is scoped automated scanning plus visual/keyboard inspection, not full WCAG certification. No FEATURE-011 work was started.
