# SKYRA LOGHUB — FEATURE-010
## E2E and regression report

**PASS — real isolated SDK-to-Explorer continuity**

### Environment

Disposable PostgreSQL 17.9 at 127.0.0.1:5433/skyra_loghub_disposable_validation, owner skyra_isolated_user, cluster marker26d25080-7655-4147-b05a-512ad359e14f, independently marked physical directory .tmp/feature001a-postgres/data. Tests verify target/physical marker, runtime identity and migration state before disposable writes; no fallback to 5432. Admin uses skyra_org_runtime; Gateway uses skyra_ingestion_runtime. Marked WAL/archive directories and fresh consumer directories are owned/run-specific. Controlled RS256/JWKS OIDC uses real code exchange and S256 with mock mode disabled.

### Clean consumer and sample

Commands: node scripts/package-node-sdk.mjs .tmp/feature010-evidence/packages; node scripts/verify-sdk-consumer.mjs. Offline verification packages installed Ajv/transitive/type dependencies, then npm installs the actual SDK tarballs in a fresh .tmp consumer. Public TypeScript imports compile; ESM executes; missing configuration exits1; exact UI snippet passes strict checkJs using installed public declarations and --types node. The external regression adapter changes only the old sample import to the public package.

The documented `examples/managed-ingestion/first-log.mjs` was copied to a fresh installed consumer and executed with a canonical managed credential in authorized disposable project `project-cc48e7f9-03`. Unique run ID: `84b57d32-f4e1-4fad-8ffd-57ff8ab49688`. Six canonical events cover trace/debug/info/warn/error/fatal, service onboarding-sample, environment development, structured order attributes and trace/span IDs.

Exact ID sets match WAL, finalized JSONL archive, actual Query Service, authenticated BFF search and Angular raw event detail. Full event objects match, including message, severity, service, environment and trace fields;0 missing IDs and0 field mismatches. The browser starts at onboarding and follows its Explorer link. Foreign project/tenant queries remain rejected. Canonical test credentials are revoked and subsequent credential requests are rejected in the lifecycle/pipeline matrices. No separate fixture is substituted for these six events.

[WAL/archive/Query manifest](.tmp/feature010-evidence/minimal-continuity.json) · [BFF/Explorer manifest](.tmp/feature010-evidence/minimal-browser-continuity.json). The larger external-package regression adapter also verifies 35 primary/recovery events and 250 Explorer variation events, plus the independent Analytics cohort. Its manifest is separate from the documented six-event sample.

### Browser, responsive and accessibility

Combined browser:100 TAP tests,99 leaves,0 failures/skips/cancellations. It includes organization, memberships, projects, credentials, pipeline, Explorer, Analytics and20 developer scenarios. Separate audit browser:10 leaves; quota browser:7 leaves. New onboarding:6 scoped Axe scans,0 violations, widths1440/768/390 in light/dark. Screenshots at top and verification sections (12 files) are under .tmp/feature010-evidence/developer-*.png; desktop/light and mobile/dark/top/bottom were visually inspected. Code overflow stays inside focusable pre panels, not the page. Keyboard, actual clipboard, labels, secret placeholders, project context, error/empty/retry and session-bound access pass. The empty-list/outage UI cases intentionally simulate unavailable/empty responses; authoritative event continuity uses actual services and actual data.

Existing Explorer/Analytics/pipeline accessibility artifacts remain separate; scoped scans do not establish full WCAG compliance. [Developer browser evidence](.tmp/feature010-evidence/developer-browser.json), [combined environment](.tmp/feature010-evidence/e2e-environment.json).

### Regression results

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

### Exact command inventory

Environment-prefix notation below denotes child environment variables; on Windows the runners pass them as a structured env object. Commands run from the LogHub root unless an app/package directory is named. The consolidated regression invocation was node scripts/run-developer-regressions.mjs --quota-and-services; its service child invokes node scripts/run-explorer-regressions.mjs with SKYRA_REGRESSION_EVIDENCE_LABEL=feature010. Final standalone audit reruns supersede its initial plan-assertion failure.

- Combined real OIDC/Angular browser: `node scripts/run-developer-e2e.mjs`
- Focused onboarding browser: `node scripts/run-developer-e2e.mjs --focused`
- Packaged SDK/WAL/archive/Query pipeline: `SKYRA_DEVELOPER_E2E=true SKYRA_EXPLORER_E2E=true SKYRA_ANALYTICS_E2E=true node --test --test-reporter=tap tests/credentials/feature005-pipeline.test.mjs`
- Documented minimal sample failure/lifecycle matrix: `node --test --test-reporter=tap tests/developer/sample.test.mjs`
- Documentation links/contracts/snippet: `node --test --test-reporter=tap tests/developer/documentation.test.mjs`
- Quota accounting: `run-developer-regressions.mjs --quota-and-services: tests/quotas/quota-integration.test.mjs`
- Quota boundary/retry: `same runner: tests/quotas/quota-boundaries.test.mjs`
- Quota browser: `same runner: organization.e2e.mjs with quota flags`
- Gateway including WAL/recovery/live PostgreSQL: `same runner -> run-explorer-regressions.mjs: apps/ingestion-gateway`
- Admin Service: `same runner -> run-explorer-regressions.mjs: apps/admin-service`
- SDK units/integration: `same runner -> packages/logger-node: node --import tsx --test tests/**/*.test.ts`
- Contract tests: `same runner -> node --import tsx --test tests/contracts/**/*.test.ts`
- Isolated target rejection guards: `same runner -> node --test tests/admin/isolated-target.test.mjs`
- BFF authentication/session/authorization: `same runner -> compiled apps/console-bff/dist-test/tests/**/*.test.js`
- Angular Console units: `same runner -> apps/console-web: node --import tsx --test tests/**/*.test.ts`
- Query Service: `same runner -> QUERY_TEST_CONCURRENCY=1 node scripts/run-project-query-tests.mjs`
- PostgreSQL audit hardening: `same runner -> tests/admin/postgres-hardening.test.mjs`
- Credential persistence/lifecycle: `same runner -> tests/credentials/persistence.test.mjs`
- Audit repository/security: `SKYRA_AUDIT_EVIDENCE_LABEL=feature010-audit node --test --test-reporter=tap tests/audit/persistence.test.mjs`
- Audit browser regression: `SKYRA_AUDIT_E2E=true SKYRA_AUDIT_ONLY=true SKYRA_AUDIT_EVIDENCE_LABEL=feature010-audit SKYRA_ORGANIZATION_OIDC_PROTOCOL_TEST=true SKYRA_ORGANIZATION_EVIDENCE_LABEL=feature010-audit node --test --test-reporter=tap tests/organization/organization.e2e.mjs`

Other actual checks: apps/console-web/node_modules/.bin/ng.cmd build --configuration production,offline (cwd apps/console-web); node scripts/sync-schemas.mjs --check; node scripts/verify-design-system-governance.cjs; git diff --check; Prisma CLI validate --schema apps/ingestion-gateway/prisma/schema.prisma with isolated configuration; SKYRA_AUDIT_EVIDENCE_LABEL=feature010-audit node scripts/verify-audit-migration.mjs. Logs and [verification.json](.tmp/feature010-evidence/verification.json) retain explicit test counts.

### Corrections during verification

Native project selection after asynchronous options required an explicit selected binding. Tests normalize Windows clipboard CRLF and accept login returnUrl query parameters. The documented sample uses its own authorized project, avoiding contamination of exact Analytics fixture counts. An audit test now permits either valid bounded tenant index selected by PostgreSQL and rejects sequential scan/sort; immutable index definitions remain checked. Initial failed attempts are not counted as passing acceptance evidence; the final combined cohort and standalone reruns pass.

### Performance

Local observations from the accepted six-event run: consumer launch through WAL/archive/Query validation 588.3ms; SDK flush 131ms. Onboarding page readiness 423.4ms. BFF request through all six Explorer raw-detail comparisons 1422.6ms; this includes opening/closing drawers and is not a pure rendering metric. These small-fixture measurements are not production latency, availability or throughput guarantees.

### Preservation and limits

LogHub remains on main at `19f084ad36fe37bb57ca107103e136d2d4a378be`. Initial folded status:320 entries,124 tracked modifications,196 untracked,0 staged. Final folded status including these four reports:333 entries,126 tracked modifications,207 untracked,0 staged. All 1325 initial source files remain;186 pre-existing reports/migrations/package artifacts retain their raw hashes. FEATURE-010 changes 12 existing files and adds 24 files including four reports. One generated Angular compiler lock changed; the build-info cache was restored only after its initial hash matched HEAD. No reset, clean, rebase, merge, commit or push occurred.

Platform remains clean at `928ca4343ab3a1887e586123a6ba5bb88b56a0ef`; all 37 immutable archives match HEAD. Prisma mirrors remain byte-identical, SHA256 `ac8a9051a312cf34e24030ce054c9b4a159243933dfe6a5fbe19f3c2f1769c7c`. All 10 isolated migration checksums remain unchanged. No FEATURE-010 migration was needed.

Protected PostgreSQL `127.0.0.1:5432/skyra_loghub_dev`, role `skyra_loghub_user`, was inspected only through exact-target checks and forced read-only repeatable-read transactions. Before/after SHA256 is `90f73c6f2bc6bce568974e27472fd652505e3034284ff4a9883104b1fd02a6ff`. Its eight tables, one baseline ledger and zero application rows remain unchanged. [Preservation evidence](.tmp/feature010-evidence/final-audit.json).

Local isolated acceptance only. Public npm publication, hosting/deployment, real Entra configuration, protected feature activation and real customer onboarding remain outside scope. Node 24.14.0 was executed; the local artifact declares Node>=22, but no separate Node 22 binary was tested. ESM is supported; CommonJS compatibility is not promised. Third-party Ajv dependencies need registry access/cache for ordinary installation; offline validation repacks already installed dependencies. HTTP memory buffering does not persist across process death. Gateway admission precedes query visibility. SDK automatic retries do not schedule Retry-After and may exhaust before a rate window resets. Hard quota can require a policy change before a batch fits. Accessibility evidence is scoped automated scanning plus visual/keyboard inspection, not full WCAG certification. No FEATURE-011 work was started.
