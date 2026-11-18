# SKYRA LOGHUB — FEATURE-011
## Security and reliability

**PASS — SKYRA LOGHUB CORE DEVELOPMENT COMPLETE IN ISOLATION.**

### Authentication, authority and isolation

Live persisted model:5 roles/20 capabilities, captured with role-capability mappings in preflight.json. OrgOwner/OrgAdmin tenant-wide audit; project-scoped roles do not gain audit. OrgOwner manages quota; scoped users and Viewer follow actual stored read grants. New/changed member authority, suspension/revocation, last owner, foreign tenant/project, inactive project, credential scope/expiry/revocation, CSRF, cursor and injection-shaped queries are tested. Browser/provider role hints are not authority. Backend Admin/Query assertions enforce signature/issuer/audience/TTL/scope; opaque HTTP-only BFF session state and CSRF remain the browser boundary. Disabled preview cannot fabricate an accepted real session. [Observed role outcomes](.tmp/feature011-evidence/authorization.json) and [Persisted capability model](.tmp/feature011-evidence/preflight.json).

The cryptographically signed synthetic provider is test infrastructure. Real Entra tenant/client/callback/user-flow/verified owner remain pending. Valid internal bearer assertions are scope/TTL limited, not globally single-use; replayed OIDC state/code and expired/tampered assertions fail. No claimed distributed replay-proof or global snapshot contract is added.

### Credential lifecycle and secret hygiene

Actual browser one-time reveal is masked again before screenshots and cleared after acknowledgement. Metadata cannot retrieve the secret. Raw test keys remain only in process memory/authorized issuance responses and disposable verifier persistence; generated snippets use environment names only. SDK samples sanitize failure output and use bounded queues/retries/flush/close. All final-run keys are revoked and new admissions fail401. Reports/evidence omit credentials, signing material, connection URLs and internal request assertions; scan findings must be0. No real customer/provider credentials were used.

### Accounting, WAL and archives

Run `integrated-0d3c08f6-2b42-47cf-90cc-e1db0240c0e0`, project `integrated-b979094e-b54`:26 main events (documented minimal sample6 plus structured SDK cohort20), two services, production/development environments, all six levels, multiple event-time buckets/trace IDs and nested Unicode attributes. The actual installed consumer emits them; no query fixture substitutes for ingestion.

Exact ID sets match WAL → finalized catalog/JSONL → direct Query → authenticated BFF. Explorer raw details verify all six documented sample events field-for-field; the larger earlier-feature pipeline independently traverses35 primary/recovery event IDs in the browser. Main Analytics:26 total,10 ERROR/FATAL,5 WARN,38.46% error rate; severity/service/environment/time buckets match the same query scope. Additional SDK cohorts produce5 other-project staging events and5 foreign-tenant events; their field-for-field reads and the other-project Analytics count5 are verified, and foreign access to the main scope is denied.

Main usage:26 accepted events/25360 accepted normalized UTF-8 bytes,0 reserved. Bytes sum each admitted normalized events-array payload including its own brackets/commas, excluding HTTP/WAL/archive overhead. Duplicate/lost-response replays add0; hard quota rejections add0. Admission clock is deliberately2030-01-01 UTC while event timestamps are the run's actual2026 event time. Usage windows follow server admission; Analytics/Query follow event occurrence/filter/visibility. These are separate contracts, not interchangeable counters.

Canonical administrative audit records identify actual tenant/actor/resource/action and safe recorded changes. They are business audit records, not log events. All final-run managed credentials are revoked; subsequent new requests return401. [Primary manifest](.tmp/feature011-evidence/reconciliation.json), [Explorer IDs](.tmp/feature011-evidence/minimal-browser.json), [Audit reconciliation](.tmp/feature011-evidence/audit-final.json), [Unified evidence index](.tmp/feature011-evidence/reconciliation-index.json).

### Failure and concurrency matrix

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

### Findings and remaining risk

|ID|Severity / scope|Reproduction and actual behavior|Cause and targeted correction|Verification / final status|
|---|---|---|---|---|
|F011-01|P2, offline validation harness|Fresh local consumer failed importing Ajv: missing format-annotation.json after packing installed dependencies|Direct packing of pnpm hard-linked files was not reliable on this Windows extraction path. Copy dependency bytes to an owned staging tree before npm pack; no installed dependency/package publication change|Fresh install, declarations, ESM and real SDK ingestion pass. Fixed|
|F011-02|P2, shared Console contrast|Full-shell Axe found dev badge3.77:1, tenant/environment label4.23:1 and status badge3.23–3.8:1/green3.42:1|Muted text/installed fixed variant colors were insufficient. Component-scoped primary/sidebar text tokens and public neutral badge variants/tokens; no global CSS hack/Platform archive change|84 full-shell scans across14 pages/3 widths/2 themes:0 violations. Fixed|
|F011-03|P2, disabled preview UI/session|previewMode=false still offered sandbox login and initial fabricated preview profile|Login controls and loginPreview ignored the existing flag. Gate UI and service entry, start anonymous when preview is disabled|New AuthService unit + real login page checks and signed-OIDC workflow. Fixed; no backend authorization bypass was demonstrated|
|F011-04|P1, implementation-stage route regression|Starting anonymous under disabled preview exposed synchronous guards redirecting valid cookie sessions on direct protected navigation|Guard must hydrate real BFF session instead of relying on preview initialization. Add fail-closed bootstrap for non-preview auth/role/admin routes|New guard unit, real default SSO landing and refresh. Fixed before final acceptance|
|F011-05|P3, browser test synchronization|Credential search started during pagination reload; expired-session test waited for full document load rather than SPA readiness|Await actual page request and assert submitted search query; use DOM-content readiness plus login URL and actual SSO control|Full99-leaf combined browser rerun passes. Fixed test race; assertions retained|
|F011-06|P3, read-verifier diagnostics|An intermittent direct Query verification fetch failed without retaining a safe cause code|Record sanitized code and allow at most one retry for reset/socket/refused connection of a read-only search; still fail nontransient, repeated or incorrect responses|Latest pipeline and integrated reads pass. No claim that a production network defect was diagnosed or exactly-once transport improved|
|F011-07|P3, new evidence harness setup|New audit output directory was absent; early new assertions used wrong field/format names|Create milestone audit directory and align test assertions with canonical actorId, archive id and two-decimal KPI fields|Final audit/combined/integrated runs pass. Fixed harness construction issues|
|F011-09|P2, Analytics project context|Screenshot review showed the native project selector displaying the first loaded project while KPIs belonged to the URL-selected project|Asynchronous options arrived after the select value binding. Bind each option selection to the actual workspace project; assert its native value in both integrated and Analytics browser tests|Affected11-leaf Analytics rerun and final integrated journey pass. Fixed|
|F011-08|P2, preflight completeness|Existing audit migration guard checked latest migration/index integrity, not the whole ten-artifact chain|Add a read-only integrated guard that compares every live checksum/finished state with canonical SQL before final integrated/regression runs|All 10 match, no migration/ledger change. Fixed|

No discovered P0 or unresolved P1 remains in accepted isolated scope. Initial failing attempts are diagnostic evidence, not counted as passing tests. The logger-core standalone test glob discovers0 tests (no test files in that package); it is not counted as regression coverage. Core validator/parser/redaction behavior is exercised through current SDK/Gateway/contract suites. Operational limitations are listed separately rather than invented as implementation defects.

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

### Preservation

Initial LogHub: main, HEAD `19f084ad36fe37bb57ca107103e136d2d4a378be`,333 folded entries (126 tracked modifications/207 untracked/0 staged). Final including these six reports: 346 folded entries (130 tracked modifications/216 untracked/0 staged), same branch/HEAD. 1349 initial source files remain; 191 historical reports/migrations/package artifacts retain their raw hashes. No reset/rebase/merge/commit/push or unrelated clean/reformat occurred.

Platform remains clean at `928ca4343ab3a1887e586123a6ba5bb88b56a0ef`; all 37 immutable archives match HEAD. Prisma mirrors remain byte-identical, SHA256 `ac8a9051a312cf34e24030ce054c9b4a159243933dfe6a5fbe19f3c2f1769c7c`. All 10 live migration entries match canonical SQL artifacts and historical checksums. No new migration was required. Generated Angular cache changes are listed separately; build-info is restored only when its initial bytes match HEAD.

Protected `127.0.0.1:5432/skyra_loghub_dev`/`skyra_loghub_user` was inspected only after exact-target verification with forced read-only transactions. Before/after snapshot SHA256: `90f73c6f2bc6bce568974e27472fd652505e3034284ff4a9883104b1fd02a6ff`; eight tables, one baseline migration, zero application rows unchanged. No protected DDL/DML/grant/bootstrap/credential/activation, external identity configuration or deployment occurred. Final runtime privileges remain separated and no test client connections remain. The manifest-owned disposable cluster is stopped after final checks. [Preservation evidence](.tmp/feature011-evidence/final-audit.json).
