# SKYRA LOGHUB — FEATURE-011
## Operational readiness register

**PASS — SKYRA LOGHUB CORE DEVELOPMENT COMPLETE IN ISOLATION.**

This is a local development acceptance, not a production launch, deployment, protected activation or disaster-recovery certificate. No approval is assumed from passing tests.

### Completed in isolation

All ten feature workflows, actual signed-OIDC sessions/authority, clean Node consumer, durable ingestion/receipt recovery, JSONL/catalog query path, exact Explorer/Analytics/Usage reconciliation, immutable safe audit, quota concurrency, responsive UI and current regressions pass.

### Release prerequisites and limits

|Area|Status|Required next decision/limit|
|---|---|---|
|Real Microsoft Entra External ID|Pending external/human setup|Choose/register real tenant, client, callbacks and user flow; verify live login separately. Isolated issuer is not Entra.|
|Protected schema migration (Approval A)|Pending approval|Protected ledger remains baseline-only; review all migration artifacts/backout and authorize separately.|
|First organization/owner bootstrap (Approval B)|Pending human decisions|Finalize organization/code and independently verify real issuer/sub. No protected identity/member data created.|
|Protected feature activation|Pending approval|Coordinate persistence/auth/audit/quota flags after migrations/bootstrap; no activation performed.|
|Hosting/deployment|Unselected/unverified|Select environment, network/TLS/storage topology and deployment process outside this milestone.|
|SDK npm publication|Not performed or externally verified|Local artifacts are verified. Publication, package access and release signing/version policy need a separate release action.|
|SDK runtime/module support|ESM validated on Node 24.14.0|Artifact declares>=22; no separate Node22 or CommonJS certification.|
|Retained local WAL|Local fsync/process-restart verified|Requires durable owned disk and operator recovery; not power-loss/disaster certification.|
|WAL/ledger retention and compaction|Operational design required|Quota-aware compaction is disabled; retained WAL/admission evidence can grow. Never delete evidence or refund unknown reservations blindly.|
|Coordinated quota activation|Pending rollout procedure|All participating Gateways must use consistent metering flags and registered owned journals. Mixed-mode production rollout is not certified.|
|Queryable JSONL vs Parquet|JSONL path verified|Production Parquet conversion/cache/storage path remains unverified by this acceptance.|
|BFF session persistence|Single-process/in-memory limitation|SessionStoreService uses Map; restart drops sessions. Multi-instance durability/stickiness requires operational design.|
|Distributed exactly-once|Not guaranteed|Tested receipt deduplication/recovery is scoped to registered storage; PG/WAL are not one atomic resource.|
|Production load/retention/DR|Pending production validation|No SLA/global throughput/capacity or regional recovery claim from local fixtures.|
|Real customer onboarding|Pending approved release|Only disposable synthetic identities/projects/credentials used.|
|Monitoring/backup/restore procedures|Operational procedures required|Health/readiness and logs exist; alerts, backup schedule, restore drills, retention and recovery runbooks need owned release procedures.|
|Console preview configuration|Must remain false for real workflows|Disabled preview now prevents fabricated sessions; production runtime configuration and real cookie/SSO hydration must be verified at release.|
|Platform badge colors|Local workaround validated|Installed success/warning colors have contrast limitations. LogHub uses public neutral variants/tokens; Platform remains unchanged for a separately owned upstream fix.|

Approval A/B and activation decisions remain human/external prerequisites. The first real organization/owner and independently verified issuer/sub are not selected by this milestone. Never use synthetic fixture IDs/issuer/keys as a real bootstrap. Hosting, publication, identity account actions and protected migrations require separately authorized work.

### Procedures still required

Define disk/ledger growth alerts, journal ownership and missing-disk incident handling, verified backup/restore drills, session persistence or restart policy, TLS/network boundaries, privilege rollout/rollback, privacy/log retention, capacity limits and production load/recovery exercises. No automatic refund of unknown reservations or arbitrary retained-WAL deletion is recommended.

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

Initial LogHub: main, HEAD `19f084ad36fe37bb57ca107103e136d2d4a378be`,333 folded entries (126 tracked modifications/207 untracked/0 staged). Final including these six reports: 346 folded entries (130 tracked modifications/216 untracked/0 staged), same branch/HEAD. 1349 initial source files remain; 191 historical reports/migrations/package artifacts retain their raw hashes. No reset/rebase/merge/commit/push or unrelated clean/reformat occurred.

Platform remains clean at `928ca4343ab3a1887e586123a6ba5bb88b56a0ef`; all 37 immutable archives match HEAD. Prisma mirrors remain byte-identical, SHA256 `ac8a9051a312cf34e24030ce054c9b4a159243933dfe6a5fbe19f3c2f1769c7c`. All 10 live migration entries match canonical SQL artifacts and historical checksums. No new migration was required. Generated Angular cache changes are listed separately; build-info is restored only when its initial bytes match HEAD.

Protected `127.0.0.1:5432/skyra_loghub_dev`/`skyra_loghub_user` was inspected only after exact-target verification with forced read-only transactions. Before/after snapshot SHA256: `90f73c6f2bc6bce568974e27472fd652505e3034284ff4a9883104b1fd02a6ff`; eight tables, one baseline migration, zero application rows unchanged. No protected DDL/DML/grant/bootstrap/credential/activation, external identity configuration or deployment occurred. Final runtime privileges remain separated and no test client connections remain. The manifest-owned disposable cluster is stopped after final checks. [Preservation evidence](.tmp/feature011-evidence/final-audit.json).
