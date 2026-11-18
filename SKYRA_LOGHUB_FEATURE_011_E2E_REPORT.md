# SKYRA LOGHUB — FEATURE-011
## Integrated end-to-end report

**PASS — SKYRA LOGHUB CORE DEVELOPMENT COMPLETE IN ISOLATION.**

### Topology and owned environment

Actual loopback topology: Angular http://127.0.0.1:56958 → BFF 127.0.0.1:56957 → Admin 127.0.0.1:56956 and Query http://127.0.0.1:56981; public ingestion Gateway http://127.0.0.1:56978. All use verified disposable PostgreSQL 17.9 at 127.0.0.1:5433/skyra_loghub_disposable_validation, cluster26d25080-7655-4147-b05a-512ad359e14f. Admin runs as skyra_org_runtime; Gateway as skyra_ingestion_runtime. Physical cluster directory .tmp/feature001a-postgres/data is independently verified. WAL/archive store:C:\Users\VAMSHIKA\source\repos\skyra-tech-projects\skyra-log-hub\.tmp\feature008-ingestion-ccX6wz (existing helper prefix; fresh ownership marker, not reused unidentified storage).

The existing metered Gateway fixture boots the real production AppModule, authentication, validation, WAL, archive and accounting providers; only the clock and timing/fault hooks are test-injected. No mock business responses participate in the integrated acceptance chain. The controlled provider performs real authorization-code/S256/RS256/JWKS exchange; ENABLE_MOCK_OIDC=false. This is not Microsoft Entra login verification.

Integrated flags are all enabled only in this topology: INGESTION_QUOTAS_ENABLED, INGESTION_PUBLISH_ARCHIVES, QUOTA_USAGE_ENABLED and AUDIT_HISTORY_ENABLED. All metered acceptance Gateways use the same flag policy. Supplemental historical compatibility tests retain their existing unmetered path where that is the contract under test; they are separate from the authoritative metered cohort. Feature activation defaults and protected configuration were not changed.

### Administrative and developer journey

Signed owner updates organization; persisted member role/status changes and last-owner protection; Angular project creation and concurrent update; one-time browser credential handoff; onboarding with authorized context; fresh installed SDK; metered WAL admission; real archive/Query/BFF/Explorer; matching Analytics/Usage; canonical audit filters/details; rotation/revoke/project-state authority; actual process outages and recovery. All data are fresh disposable namespaces.

Run `integrated-0d3c08f6-2b42-47cf-90cc-e1db0240c0e0`, project `integrated-b979094e-b54`:26 main events (documented minimal sample6 plus structured SDK cohort20), two services, production/development environments, all six levels, multiple event-time buckets/trace IDs and nested Unicode attributes. The actual installed consumer emits them; no query fixture substitutes for ingestion.

Exact ID sets match WAL → finalized catalog/JSONL → direct Query → authenticated BFF. Explorer raw details verify all six documented sample events field-for-field; the larger earlier-feature pipeline independently traverses35 primary/recovery event IDs in the browser. Main Analytics:26 total,10 ERROR/FATAL,5 WARN,38.46% error rate; severity/service/environment/time buckets match the same query scope. Additional SDK cohorts produce5 other-project staging events and5 foreign-tenant events; their field-for-field reads and the other-project Analytics count5 are verified, and foreign access to the main scope is denied.

Main usage:26 accepted events/25360 accepted normalized UTF-8 bytes,0 reserved. Bytes sum each admitted normalized events-array payload including its own brackets/commas, excluding HTTP/WAL/archive overhead. Duplicate/lost-response replays add0; hard quota rejections add0. Admission clock is deliberately2030-01-01 UTC while event timestamps are the run's actual2026 event time. Usage windows follow server admission; Analytics/Query follow event occurrence/filter/visibility. These are separate contracts, not interchangeable counters.

Canonical administrative audit records identify actual tenant/actor/resource/action and safe recorded changes. They are business audit records, not log events. All final-run managed credentials are revoked; subsequent new requests return401. [Primary manifest](.tmp/feature011-evidence/reconciliation.json), [Explorer IDs](.tmp/feature011-evidence/minimal-browser.json), [Audit reconciliation](.tmp/feature011-evidence/audit-final.json), [Unified evidence index](.tmp/feature011-evidence/reconciliation-index.json).

### Browser/accessibility

Integrated19 leaves plus current99-leaf earlier-feature/onboarding browser regression; separate quota7/audit10 leaves.84 shared-shell Axe scans:14 pages ×3 widths ×2 themes,0 violations. Pages: organization/settings, members, project list/create/details/settings, credentials, onboarding, Explorer, Analytics, Usage, Audit, public Login. Direct navigation, refresh/history, real default SSO landing/refresh, keyboard/dialog dismissal and safe placeholders are verified. Screenshots are integrated-PAGE-WIDTH-THEME.png; representative desktop/tablet/mobile light/dark views were inspected. Automated scoped scans are not full WCAG certification.

### Concurrency and recovery

|Fault/concurrency boundary|Actual observation and recovery|Evidence|
|---|---|---|
|Lost HTTP acknowledgement after durable admission|SDK retains batch identity; retry recognized as duplicate, no second charge/WAL append|reconciliation.json; legacy-sdk-pipeline.log|
|Two Gateways/two credentials,24 requests, event budget10|10 accepted,14 rejected, overshoot0|.tmp/feature011-quota-evidence/concurrency.json|
|Exact canonical byte budget/one-byte over/whole crossing batch|Exact fit succeeds; over-budget batch rejected without charge|quota-boundaries.log; sdk-meter.json|
|Concurrent identical receipt identity|One durable append/charge; replay/conflict semantics preserved|quota-boundaries.log|
|Kill after reservation / WAL durability / before finalization commit|Owned-journal recovery cancels only proven non-WAL reservation or finalizes durable evidence once|quota-accounting.log|
|Database finalization denied after fsync|Durable acceptance retained; capacity reserved until verified reconciliation; no blind TTL refund|quota-accounting.log|
|Ambiguous append/fsync result|Admission quarantines; restart reconciles surviving owned WAL evidence|quota-accounting.log|
|Partial trailing WAL header + worker/catalog publication interruption|Actual process restart repairs only trailing incomplete bytes and publishes accepted events without duplicates|legacy-sdk-pipeline.log|
|Audit insert failure|Organization/policy mutation and version roll back transactionally|Admin/quota/audit suites|
|Query/Admin process outage|BFF/UI safe errors; owned restart and Retry restore actual results|integrated-browser.log|
|Read-only audit transaction / append-only table|Injected write denied; runtime DML/DDL denied; immutable triggers verified|audit-repository.log; audit-hardening.log|
|Concurrent project changes / stale ETag|Exactly one update succeeds; stale change rejected; fresh inactive-project authority denies reads/ingestion|integrated-browser.log|
|Cursor tamper/expiry/same-time ties|Bounded keyset traversal and fixed filter/time context; replay across reader/tenant rejected|legacy-browser.log; audit-repository.log|

No power-loss, distributed snapshot, multi-region recovery, cross-resource ACID or unconditional exactly-once certification is claimed. A valid internal bearer assertion can be reused within its short validity/scope; this is not a one-time-token contract. Tampered/expired/wrong-scope assertions and replayed OIDC state/callback are rejected by current suites.

### Current regression results

|Suite|TAP tests|Independent leaves|Fail|Skip|Cancel|Evidence|
|---|---:|---:|---:|---:|---:|---|
|Analytics context/selection rerun|12|11|0|0|0|[log](.tmp/feature011-evidence/analytics-browser-final.log)|
|Integrated product journey|20|19|0|0|0|[log](.tmp/feature011-evidence/integrated-browser.log)|
|Earlier-feature + onboarding browser|100|99|0|0|0|[log](.tmp/feature011-evidence/legacy-browser.log)|
|External-package SDK pipeline|1|1|0|0|0|[log](.tmp/feature011-evidence/legacy-sdk-pipeline.log)|
|Quota accounting/recovery|17|16|0|0|0|[log](.tmp/feature011-evidence/quota-accounting.log)|
|Quota boundary/concurrent receipt|5|4|0|0|0|[log](.tmp/feature011-evidence/quota-boundaries.log)|
|Quota browser|8|7|0|0|0|[log](.tmp/feature011-evidence/quota-browser.log)|
|Gateway/WAL/live PostgreSQL|124|124|0|0|0|[log](.tmp/feature011-evidence/ingestion-gateway-tests.log)|
|Administration Service|98|98|0|0|0|[log](.tmp/feature011-evidence/admin-service-tests.log)|
|Node SDK|55|55|0|0|0|[log](.tmp/feature011-evidence/sdk-node-tests.log)|
|Contracts|66|66|0|0|0|[log](.tmp/feature011-evidence/contract-tests.log)|
|Isolation guards|15|15|0|0|0|[log](.tmp/feature011-evidence/target-guards.log)|
|BFF authentication/security|112|111|0|0|0|[log](.tmp/feature011-evidence/bff-tests.log)|
|Console + new auth regressions|103|103|0|0|0|[log](.tmp/feature011-evidence/console-tests-final.log)|
|Query Service|214|214|0|0|0|[log](.tmp/feature011-evidence/query-tests.log)|
|PostgreSQL audit hardening|10|10|0|0|0|[log](.tmp/feature011-evidence/audit-hardening.log)|
|Managed credential persistence|29|28|0|0|0|[log](.tmp/feature011-evidence/credential-persistence.log)|
|Audit producers/read/immutability|11|10|0|0|0|[log](.tmp/feature011-evidence/audit-repository.log)|
|Audit browser|11|10|0|0|0|[log](.tmp/feature011-evidence/audit-browser.log)|
|Developer documentation|4|4|0|0|0|[log](.tmp/feature011-evidence/developer-docs.log)|
|Documented SDK sample matrix|9|8|0|0|0|[log](.tmp/feature011-evidence/developer-sample.log)|

All final commands exited0. Parent test containers and describe suites are excluded from leaf counts. Overlapping suites are not summed.

Additional exit0 gates: SDK core/Node compilation and local tarballs; fresh npm consumer installation, TypeScript public declarations, ESM execution, exact onboarding snippet strict checkJs; Admin/Gateway/BFF/Query compilers; Angular production,offline build; Prisma validate against isolated configuration; schema mirror/sync; ten canonical migration hashes/index/trigger integrity; runtime privilege separation; Platform governance; Git whitespace. Core standalone0-discovery is explicitly not counted as a passed business suite.

### Reproduction commands

Prepare only the marked disposable cluster: node scripts/isolated-postgres.mjs start. Package: node scripts/package-node-sdk.mjs .tmp/feature011-evidence/packages. Fresh consumer: SKYRA_SDK_EVIDENCE_LABEL=feature011 node scripts/verify-sdk-consumer.mjs. Full guard checks canonical source migration artifacts before fixture writes.

- Analytics context/selection rerun: `organization.e2e.mjs with SKYRA_ANALYTICS_ONLY=true and SKYRA_PIPELINE_ONLY=true`
- Integrated product journey: `node scripts/run-integrated-acceptance.mjs`
- Earlier-feature + onboarding browser: `node scripts/run-integrated-regressions.mjs --rerun-legacy --legacy-only`
- External-package SDK pipeline: `same runner; tests/credentials/feature005-pipeline.test.mjs`
- Quota accounting/recovery: `node scripts/run-integrated-regressions.mjs --quota-and-services`
- Quota boundary/concurrent receipt: `same runner; tests/quotas/quota-boundaries.test.mjs`
- Quota browser: `same runner; organization.e2e.mjs with quota-only flags`
- Gateway/WAL/live PostgreSQL: `same runner -> node scripts/run-explorer-regressions.mjs (label feature011)`
- Administration Service: `same service runner; compiled Admin tests`
- Node SDK: `same service runner; packages/logger-node: node --import tsx --test tests/**/*.test.ts`
- Contracts: `same service runner; node --import tsx --test tests/contracts/**/*.test.ts`
- Isolation guards: `same service runner; node --test tests/admin/isolated-target.test.mjs`
- BFF authentication/security: `same regression runner; compiled console-bff test files`
- Console + new auth regressions: `apps/console-web: node --import tsx --test tests/**/*.test.ts`
- Query Service: `QUERY_TEST_CONCURRENCY=1 node scripts/run-project-query-tests.mjs`
- PostgreSQL audit hardening: `node --test --test-reporter=tap tests/admin/postgres-hardening.test.mjs`
- Managed credential persistence: `node --test --test-reporter=tap tests/credentials/persistence.test.mjs`
- Audit producers/read/immutability: `node scripts/run-integrated-regressions.mjs --audit-only`
- Audit browser: `same audit runner; real signed OIDC, audit-only organization.e2e.mjs`
- Developer documentation: `same audit runner; tests/developer/documentation.test.mjs`
- Documented SDK sample matrix: `same audit runner; tests/developer/sample.test.mjs`

The consolidated runner is derived from existing tested commands. --quota-and-services and --audit-only resumed failed setup stages without rerunning unrelated passing suites; --rerun-legacy --legacy-only retained service results and regenerated fresh SDK/browser fixtures. Prefix notation denotes child environment values, supplied as structured env by the runners. No parent wrapper is counted as an independent scenario. Angular command: node_modules/.bin/ng.cmd build --configuration production,offline from apps/console-web. Source hashes/whitespace/governance/schema checks and protected snapshots are recorded independently.

### Performance

All observations are Windows/loopback, PostgreSQL 17.9, actual services and small isolated cohorts. SDK flush:171ms. Per-batch WAL append plus synchronous fsync observations:2.59, 1.60, 1.57, 1.82ms. These measure the real method including append/fsync, not isolated hardware fsync latency. Reservation/finalization/total admission timings carry batch/project IDs in the primary manifest. Archive/catalog and direct/BFF Query visibility are asserted after publication; scenario durations include polling/other verification and are upper-bound observations, not a dedicated production publication SLA.

|Operation sample|Local elapsed ms|
|---|---:|
|get /bff/organization|48.32|
|patch /bff/organization|87.46|
|get /bff/organization/members/2c4aa67a-d31d-4245-ac45-ea2b3ff1c5dd|49.57|
|patch /bff/organization/members/2c4aa67a-d31d-4245-ac45-ea2b3ff1c5dd|68.92|
|patch /bff/organization/members/2c4aa67a-d31d-4245-ac45-ea2b3ff1c5dd|61.65|
|patch /bff/organization/members/2c4aa67a-d31d-4245-ac45-ea2b3ff1c5dd|51.33|
|get /bff/organization/members/37c303fe-15d4-4540-9159-b50d44be7170|26.16|
|patch /bff/organization/members/37c303fe-15d4-4540-9159-b50d44be7170|51.59|
|get /bff/organization/members/e1052e04-7851-4a83-b8b5-3d67ca314ba4|25.51|
|patch /bff/organization/members/e1052e04-7851-4a83-b8b5-3d67ca314ba4|39.07|
|patch /bff/organization/members/37c303fe-15d4-4540-9159-b50d44be7170|49.62|
|get /bff/projects/integrated-b979094e-b54|62.06|
|patch /bff/projects/integrated-b979094e-b54|62.45|
|patch /bff/projects/integrated-b979094e-b54|64.75|

Full per-operation BFF, consumer launch/flush/close, project/credential/UI, aggregate, usage and audit measurements are in reconciliation.json. Browser scan/field-comparison scenario timings include assertions and are not pure server latency. No global throughput, availability or load/retention claim is made.

### Preservation

Initial LogHub: main, HEAD `19f084ad36fe37bb57ca107103e136d2d4a378be`,333 folded entries (126 tracked modifications/207 untracked/0 staged). Final including these six reports: 346 folded entries (130 tracked modifications/216 untracked/0 staged), same branch/HEAD. 1349 initial source files remain; 191 historical reports/migrations/package artifacts retain their raw hashes. No reset/rebase/merge/commit/push or unrelated clean/reformat occurred.

Platform remains clean at `928ca4343ab3a1887e586123a6ba5bb88b56a0ef`; all 37 immutable archives match HEAD. Prisma mirrors remain byte-identical, SHA256 `ac8a9051a312cf34e24030ce054c9b4a159243933dfe6a5fbe19f3c2f1769c7c`. All 10 live migration entries match canonical SQL artifacts and historical checksums. No new migration was required. Generated Angular cache changes are listed separately; build-info is restored only when its initial bytes match HEAD.

Protected `127.0.0.1:5432/skyra_loghub_dev`/`skyra_loghub_user` was inspected only after exact-target verification with forced read-only transactions. Before/after snapshot SHA256: `90f73c6f2bc6bce568974e27472fd652505e3034284ff4a9883104b1fd02a6ff`; eight tables, one baseline migration, zero application rows unchanged. No protected DDL/DML/grant/bootstrap/credential/activation, external identity configuration or deployment occurred. Final runtime privileges remain separated and no test client connections remain. The manifest-owned disposable cluster is stopped after final checks. [Preservation evidence](.tmp/feature011-evidence/final-audit.json).
