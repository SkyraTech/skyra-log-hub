# SKYRA LOGHUB — FEATURE-010
## SDK and security report

**PASS — isolated SDK/onboarding security validation**

### Public exports and consumption

@skyra/logger-node 1.0.0 exports the root factory/logger/config/event-builder/formatter/transports and existing recovery/path/ownership helpers; subpaths are ./config and ./transports. Core 1.0.0 supplies canonical types/validation/redaction. Correct .d.ts entries resolve from installed artifacts. Consumer runtime:v24.14.0; ESM. CommonJS is not claimed. The staged package declares Node>=22. No workspace source import, TS monorepo alias or public npm publication is needed. Both local SDK tarballs and installed transitive dependencies are independently resolved in the consumer.

### Configuration and credentials

Factory requires projectId, serviceName, environment, instanceId; logging methods are trace/debug/info/warn/error/fatal and log. Public flush/close/getStatus and child/context APIs remain unchanged. HTTP transport is passed explicitly; default stdout does not remotely ingest. Credentials are injected through server process environment/secret management. The SDK accepts only the existing managed format, keeps it privately in memory and clears it on successful transport close. Endpoints require /ingest/v1/logs, HTTPS except loopback, and reject userinfo/query/hash; redirects are refused.

Onboarding only reads authorized project metadata and credential canCreate. It grants no permissions, automatically reveals no old secret and performs no browser-side ingestion. Missing creation access directs users to an authorized administrator. One-time reveal, replacement/revocation, lost-response handling and project/environment scope remain canonical FEATURE-004 behavior. No raw key is placed in storage, generated code, URLs or telemetry.

### Transport, batching and lifecycle

Default HTTP batch128, buffer1MiB, timeout5s, attempts3; configurable bounded ranges are documented. Gateway default portable contract500 events/5MiB is separate. Queue and transport limits are separate, and new writes may be dropped/rejected while a retained batch is unresolved. Check drop counters; logging calls return synchronously and do not acknowledge delivery. flush drains queue and transport; close is asynchronous and should follow successful flush or a deliberate failure policy. Immediate process.exit and synchronous HTTP emergency delivery are not supported. Memory is not process-restart durable.

Retry preserves exact serialized body/UUID. Network/timeout/lost response,408, credential429 and>=500 use finite exponential backoff. Hard PROJECT_QUOTA_EXCEEDED429 immediately stops automatic retries while retaining the batch; no infinite loop or24hour sleep is added. Retry-After scheduling is not implemented by this transport. Duplicate receipt recovery is tested without claiming unconditional exactly-once delivery.

### API errors

[Canonical ingestion reference](docs/developers/ingestion-api.md) documents400 malformed/protocol,401 invalid/revoked credentials,403 project/environment,409 receipt conflict,413 size,422 schema/empty batch,429 rate or hard quota,503 temporary storage/journal, and unexpected500. Codes match the canonical schema enum. Error payload fields are error.code/message/requestId/retryable and optional validation details. Provider bodies/fetch causes are not exposed by sample error handlers.

### Real security evidence

The documented `examples/managed-ingestion/first-log.mjs` was copied to a fresh installed consumer and executed with a canonical managed credential in authorized disposable project `project-cc48e7f9-03`. Unique run ID: `84b57d32-f4e1-4fad-8ffd-57ff8ab49688`. Six canonical events cover trace/debug/info/warn/error/fatal, service onboarding-sample, environment development, structured order attributes and trace/span IDs.

Exact ID sets match WAL, finalized JSONL archive, actual Query Service, authenticated BFF search and Angular raw event detail. Full event objects match, including message, severity, service, environment and trace fields;0 missing IDs and0 field mismatches. The browser starts at onboarding and follows its Explorer link. Foreign project/tenant queries remain rejected. Canonical test credentials are revoked and subsequent credential requests are rejected in the lifecycle/pipeline matrices. No separate fixture is substituted for these six events.

[WAL/archive/Query manifest](.tmp/feature010-evidence/minimal-continuity.json) · [BFF/Explorer manifest](.tmp/feature010-evidence/minimal-browser-continuity.json). The larger external-package regression adapter also verifies 35 primary/recovery events and 250 Explorer variation events, plus the independent Analytics cohort. Its manifest is separate from the documented six-event sample.

Minimal sample:8 leaf scenarios verify missing/invalid/revoked/wrong-project keys, real success/repeatability, hard quota and unavailable Gateway. Existing124 Gateway,55 SDK,111 BFF and credential/quota/target/audit suites pass; bounded queue, timeout, lost acknowledgement, receipt conflict/duplicate, restart recovery, malformed/unsupported events and limits are covered by those suites. Onboarding20 browser scenarios preserve Developer/ProjectAdmin/Viewer behavior, foreign tenant/project denial, expired browser session and secure placeholders. Controlled signed OIDC is real protocol testing, not an activated external provider.

The accepted sanitized evidence scan covers local JSON/log/text files and finds0 managed-credential-shaped values; browser text/storage checks also pass. Test keys remain in memory/marked disposable persistence; private role/signing configuration is not printed. [Secret scan](.tmp/feature010-evidence/secret-scan.json) and [sample matrix](.tmp/feature010-evidence/sample/acceptance.json).

### Database/source boundary

LogHub remains on main at `19f084ad36fe37bb57ca107103e136d2d4a378be`. Initial folded status:320 entries,124 tracked modifications,196 untracked,0 staged. Final folded status including these four reports:333 entries,126 tracked modifications,207 untracked,0 staged. All 1325 initial source files remain;186 pre-existing reports/migrations/package artifacts retain their raw hashes. FEATURE-010 changes 12 existing files and adds 24 files including four reports. One generated Angular compiler lock changed; the build-info cache was restored only after its initial hash matched HEAD. No reset, clean, rebase, merge, commit or push occurred.

Platform remains clean at `928ca4343ab3a1887e586123a6ba5bb88b56a0ef`; all 37 immutable archives match HEAD. Prisma mirrors remain byte-identical, SHA256 `ac8a9051a312cf34e24030ce054c9b4a159243933dfe6a5fbe19f3c2f1769c7c`. All 10 isolated migration checksums remain unchanged. No FEATURE-010 migration was needed.

Protected PostgreSQL `127.0.0.1:5432/skyra_loghub_dev`, role `skyra_loghub_user`, was inspected only through exact-target checks and forced read-only repeatable-read transactions. Before/after SHA256 is `90f73c6f2bc6bce568974e27472fd652505e3034284ff4a9883104b1fd02a6ff`. Its eight tables, one baseline ledger and zero application rows remain unchanged. [Preservation evidence](.tmp/feature010-evidence/final-audit.json).

### Limits

Local isolated acceptance only. Public npm publication, hosting/deployment, real Entra configuration, protected feature activation and real customer onboarding remain outside scope. Node 24.14.0 was executed; the local artifact declares Node>=22, but no separate Node 22 binary was tested. ESM is supported; CommonJS compatibility is not promised. Third-party Ajv dependencies need registry access/cache for ordinary installation; offline validation repacks already installed dependencies. HTTP memory buffering does not persist across process death. Gateway admission precedes query visibility. SDK automatic retries do not schedule Retry-After and may exhaust before a rate window resets. Hard quota can require a policy change before a batch fits. Accessibility evidence is scoped automated scanning plus visual/keyboard inspection, not full WCAG certification. No FEATURE-011 work was started.
