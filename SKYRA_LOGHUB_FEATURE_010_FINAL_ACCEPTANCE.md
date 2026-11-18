# SKYRA LOGHUB — FEATURE-010
## Final acceptance

**PASS — FEATURE-010 IMPLEMENTED IN ISOLATION** · 2026-11-09

### 1. Executive summary

An authorized developer can select a real project, follow existing managed credential permissions, install local SDK artifacts, copy tested integration code, run the documented sample, flush and find the exact same events in authenticated Explorer. No unresolved P0/P1 defect remains in the tested scope.

### 2. Initial Git/source state

main at19f084ad36fe37bb57ca107103e136d2d4a378be;320 folded entries,124 tracked modifications,196 untracked,0 staged;1325 initial source files captured before implementation. Existing FEATURE-001–009 work and evidence were preserved.

### 3. Architecture reused

Reuse: public Node factory/HTTP transport and core validator; managed credential service and one-time reveal; actual Gateway authentication/admission, WAL fsync, archive publisher and Query Service; signed-OIDC BFF session/CSRF boundaries; Angular project/credential APIs, workspace selection and Explorer URL/detail contracts. No new SDK architecture, authentication subsystem, public Admin API or parallel developer portal was introduced.

### 4. Public package/API contract

@skyra/logger-node 1.0.0 and @skyra/logger-core 1.0.0; staged local tarballs, public declarations and existing exports/factory. Node 24.14.0 ESM tested, artifact engines>=22; no CommonJS or npm-publication claim.

### 5. Developer quick start

[Quick start](docs/developers/getting-started.md) · [SDK](docs/developers/node-sdk.md) · [Ingestion API](docs/developers/ingestion-api.md) · [Credentials](docs/developers/credentials-and-security.md) · [Retries](docs/developers/errors-and-retries.md) · [Troubleshooting](docs/developers/troubleshooting.md) · [Examples](docs/developers/examples.md)

### 6. Credential onboarding

Existing authenticated project/credential service decides canCreate. One-time reveal stays in its original screen; generated snippets contain environment names only. Lost/replaced/revoked key guidance and least-scope development environment selection are documented. No permission or credential issuance bypass is added.

### 7. API documentation

Public POST /ingest/v1/logs, Bearer authentication, authoritative envelope/event fields, size limits, atomic acknowledgement/receipts and status/code matrix are linked to canonical schemas. Internal Admin endpoints are not exposed as ingestion APIs. OpenAPI400 empty-batch wording and429 quota example/Retry-After description were corrected to runtime behavior.

### 8. Errors/retries

Finite attempts preserve exact batch identity/bytes. Credential rate limits and daily hard quotas are distinguished. Hard quota stops automatic retries; retained batches, bounded queue, dropped counters, explicit retry and process-memory limits are documented and tested.

### 9. Runnable sample

examples/managed-ingestion/first-log.mjs uses the public installed SDK, secure process environment, unique run/event identities, six levels, structured context, flush/close and sanitized summaries. Eight real local scenarios cover success/repeatability and configuration/auth/quota/unavailable failures.

### 10. Clean-consumer validation

Actual core/Node tarballs install in a fresh project outside SDK source. No source imports/path aliases. External TypeScript declarations compile; ESM runs; the exact Angular copy snippet also passes strict checkJs against installed public types. Offline dependency packaging is explicit.

### 11. Angular onboarding

/developer/getting-started provides project selection, permission-aware credential guidance, local install/code copying, send/flush instructions and supported Explorer context links. Loading/error/empty states, pagination, project changes and session/tenant cancellation preserve scope.

### 12. Skyra Platform

Existing public shell/buttons/tokens reused; semantic native sections/select/pre for domain content. No competing framework, copied Platform source, package archive mutation or Platform repository change.

### 13. Same-event continuity

The documented `examples/managed-ingestion/first-log.mjs` was copied to a fresh installed consumer and executed with a canonical managed credential in authorized disposable project `project-cc48e7f9-03`. Unique run ID: `84b57d32-f4e1-4fad-8ffd-57ff8ab49688`. Six canonical events cover trace/debug/info/warn/error/fatal, service onboarding-sample, environment development, structured order attributes and trace/span IDs.

Exact ID sets match WAL, finalized JSONL archive, actual Query Service, authenticated BFF search and Angular raw event detail. Full event objects match, including message, severity, service, environment and trace fields;0 missing IDs and0 field mismatches. The browser starts at onboarding and follows its Explorer link. Foreign project/tenant queries remain rejected. Canonical test credentials are revoked and subsequent credential requests are rejected in the lifecycle/pipeline matrices. No separate fixture is substituted for these six events.

[WAL/archive/Query manifest](.tmp/feature010-evidence/minimal-continuity.json) · [BFF/Explorer manifest](.tmp/feature010-evidence/minimal-browser-continuity.json). The larger external-package regression adapter also verifies 35 primary/recovery events and 250 Explorer variation events, plus the independent Analytics cohort. Its manifest is separate from the documented six-event sample.

### 14. Authentication/authorization

Controlled signed-OIDC, session/CSRF and authoritative persisted roles remain in force. Developer, ProjectAdmin and Viewer behavior follows actual capabilities. Foreign project/tenant access and expired browser-session navigation are rejected. Existing logout/session regressions pass.

### 15. Credential/security redaction

No key is interpolated into onboarding snippets or browser storage/URLs. Minimal sample prints sanitized constant failures. Evidence scan and browser storage/text checks find no managed-key-shaped values. No real production credentials/provider configuration were invented.

### 16. Browser/accessibility

99 combined browser leaves including 20 onboarding scenarios; separate 10 audit and 7 quota leaves. Six onboarding Axe scans across1440/768/390 and light/dark:0 violations. Top and verification screenshots inspected, keyboard/copy checks pass, no page-wide overflow. Scoped automated results do not assert full WCAG compliance.

### 17. Regression results

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

### 18. Local performance observations

Local observations from the accepted six-event run: consumer launch through WAL/archive/Query validation 588.3ms; SDK flush 131ms. Onboarding page readiness 423.4ms. BFF request through all six Explorer raw-detail comparisons 1422.6ms; this includes opening/closing drawers and is not a pure rendering metric. These small-fixture measurements are not production latency, availability or throughput guarantees.

### 19. Protected database preservation

Protected before/after snapshot SHA256:90f73c6f2bc6bce568974e27472fd652505e3034284ff4a9883104b1fd02a6ff. Forced read-only inspection only; no protected DDL/DML/migration/grant/bootstrap/credential/activation. Isolated10-migration ledger and runtime privileges remain unchanged; no client connections remained at preservation audit. Disposable PostgreSQL is stopped after final checks.

### 20. Remaining limitations

Local isolated acceptance only. Public npm publication, hosting/deployment, real Entra configuration, protected feature activation and real customer onboarding remain outside scope. Node 24.14.0 was executed; the local artifact declares Node>=22, but no separate Node 22 binary was tested. ESM is supported; CommonJS compatibility is not promised. Third-party Ajv dependencies need registry access/cache for ordinary installation; offline validation repacks already installed dependencies. HTTP memory buffering does not persist across process death. Gateway admission precedes query visibility. SDK automatic retries do not schedule Retry-After and may exhaust before a rate window resets. Hard quota can require a policy change before a batch fits. Accessibility evidence is scoped automated scanning plus visual/keyboard inspection, not full WCAG certification. No FEATURE-011 work was started.

### 21. Final Git/source state

LogHub remains on main at `19f084ad36fe37bb57ca107103e136d2d4a378be`. Initial folded status:320 entries,124 tracked modifications,196 untracked,0 staged. Final folded status including these four reports:333 entries,126 tracked modifications,207 untracked,0 staged. All 1325 initial source files remain;186 pre-existing reports/migrations/package artifacts retain their raw hashes. FEATURE-010 changes 12 existing files and adds 24 files including four reports. One generated Angular compiler lock changed; the build-info cache was restored only after its initial hash matched HEAD. No reset, clean, rebase, merge, commit or push occurred.

Platform remains clean at `928ca4343ab3a1887e586123a6ba5bb88b56a0ef`; all 37 immutable archives match HEAD. Prisma mirrors remain byte-identical, SHA256 `ac8a9051a312cf34e24030ce054c9b4a159243933dfe6a5fbe19f3c2f1769c7c`. All 10 isolated migration checksums remain unchanged. No FEATURE-010 migration was needed.

Protected PostgreSQL `127.0.0.1:5432/skyra_loghub_dev`, role `skyra_loghub_user`, was inspected only through exact-target checks and forced read-only repeatable-read transactions. Before/after SHA256 is `90f73c6f2bc6bce568974e27472fd652505e3034284ff4a9883104b1fd02a6ff`. Its eight tables, one baseline ledger and zero application rows remain unchanged. [Preservation evidence](.tmp/feature010-evidence/final-audit.json).

### 22. Final verdict

**PASS — FEATURE-010 IMPLEMENTED IN ISOLATION.** Required functional onboarding, public-package validation, exact six-event chain, security, browser, accessibility, regression and preservation gates pass. Stop at FEATURE-010.

Supporting reports: [Implementation](SKYRA_LOGHUB_FEATURE_010_IMPLEMENTATION_REPORT.md), [SDK/security](SKYRA_LOGHUB_FEATURE_010_SDK_SECURITY.md), [E2E](SKYRA_LOGHUB_FEATURE_010_E2E_REPORT.md).
