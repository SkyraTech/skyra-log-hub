# SKYRA LOGHUB — DEV-018 Implementation Report

## Result

The isolated development implementation is integrated and executable. The final browser matrix completed **92/92 tests**, including all nine fresh DEV-018 master-cohort scenarios. No production activation, real Entra configuration, protected-database write, npm publish, commit, or push was performed.

## Topology verified

The acceptance run used the real local Angular Console, Console BFF, Admin service, ingestion Gateway, Query service, WAL/archive storage, disposable PostgreSQL on `127.0.0.1:5433`, controlled signed OIDC, and packaged Node SDK consumers on Node 24 and Node 22. Preview and mock-business modes were disabled. The protected target `127.0.0.1:5432/skyra_loghub_dev` was read-only and unchanged.

## DEV-018 implementation work

- Added a disposable least-privilege `skyra_query_runtime` role and connector. It can read/write only the archive catalog required by Query and cannot access quotas, credentials, sessions, audit, preferences, or arbitrary schema creation.
- Added direct privilege-denial coverage in `tests/final-acceptance/query-runtime.test.mjs` (12/12 pass).
- Added the nine-scenario master cohort in `tests/final-acceptance/browser-scenarios.mjs`.
- Added fresh DEV-018 evidence routing, session-label isolation, browser orchestration, reconciliation artifacts, and final source/resource audits.
- Fixed two demonstrated browser timing defects: deterministic saved-search submission and Explorer deep-link field synchronization. Targeted and full reruns passed.

## Master cohort

One real Admin-created project was used. Actual project mutations, quota changes, saved searches, dashboard preferences, fresh Node 24/22 SDK admissions, lost-ack replay, WAL/JSONL/Parquet reads, Query search/export, Angular Explorer/Analytics/Usage, audit export, BFF restart, signed-session scoping, WAL retirement, and receipt replay were reconciled. The cohort contained 261 canonical events and 106 project audit records.

## Verification artifacts

Primary evidence is under `.tmp/dev018-evidence/`, including `integrated-browser-success.log`, `reconciliation-index.json`, `master-storage-ledger.json`, `master-retirement.json`, `query-runtime-after.json`, `final-audit.json`, `test-counts.json`, `read-measurements.json`, and the protected before/after snapshots.

## Known acceptance exception

The final preservation comparison found four pre-existing DEV-013 evidence paths whose SHA-256 values differ from the DEV-018-start baseline: `http-security.json`, `outage-recovery.json`, `persistence.json`, and `session-admin.log`. The current session rerun was subsequently isolated to `.tmp/dev018-evidence`, but the original bytes are not recoverable from the workspace. This is recorded as an open P1 evidence-integrity defect in the defect register.

## Scope boundary

This report establishes isolated development acceptance only. It does not establish production readiness, scale, physical power-loss durability, distributed exactly-once semantics, real Microsoft Entra login, first-organization bootstrap approval, hosting, backups, monitoring, or npm publication.
