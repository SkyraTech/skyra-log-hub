# SKYRA LOGHUB DEV-014 — Final Acceptance

Run: 2026-11-11, Windows/loopback, synthetic isolated tenants and identities. Paths below are repository-relative unless stated otherwise. Raw credentials, authorization headers, session verifiers and private connection strings are excluded. Evidence root: .tmp/dev014-evidence/; independent Node 22 consumer evidence: .tmp/dev014-node22-evidence/.

## 1. Executive summary

PASS — DEV-014 IMPLEMENTED IN ISOLATION. Standards-aware retry scheduling, immutable requests, bounded work/lifecycle and safe diagnostics are implemented and verified with final local packages. No unresolved P0/P1 defect was identified in the tested scope.

## 2. Initial Git/source state

Branch main, HEAD 19f084ad36fe37bb57ca107103e136d2d4a378be. Initial folded status: 382 entries, 144 tracked modified, 238 untracked, zero staged. The tree was already modified; prior work was preserved. Source inventory: initial-source.json.

## 3. Baseline SDK architecture

The existing public SDK uses canonical core validation/redaction, synchronous logger calls feeding a bounded background write queue, and explicit HTTP flush. HttpTransport already retained one batch UUID and serialized envelope across attempts, with three attempts, 5-second request timeouts and 200-ms exponential waits. Gaps: Retry-After was ignored, all 429/5xx were largely grouped together, most response retryability hints were ignored, shutdown waits could not be cancelled, and queue write exceptions could disappear before a successful flush result. Failed close did not reliably finish lifecycle cleanup. Node 22 support was declared by staged metadata but previously only Node 24 was independently exercised. HTTP pre-admission buffering was and remains memory-only.

## 4. Public API compatibility

Existing factory, severity methods, event/context fields, write/flush/close signatures, entry points and valid configurations remain supported. Declaration comparison against the preserved DEV-013 consumer verifies existing public members in logger.d.ts, http.transport.d.ts and transport.interface.d.ts; HttpTransport.getStatus() adds return fields. Additions: IngestionError, HttpDiagnostic, IngestionOutcome, parseRetryAfter, retryBudgetMs, retryBaseDelayMs, retryMaxDelayMs, retryJitter, closeTimeoutMs, onDiagnostic, HttpTransport.abort(), optional beginClose transport hook and optional pending/in-flight status fields. No third-party dependency was added. Core event schema and event-generation rules are unchanged. Invalid service/environment/resource limits now fail configuration early; failed flush/close now reject rather than hiding transport failure. These are deliberate reliability corrections, not changes to valid-call signatures. A failed HTTP close now ends the transport; decide about explicit retained-batch retry before closing.

## 5. Retryable/terminal response classification

Automatic retries apply to network/timeout/invalid acknowledgements and HTTP 408, rate-limit 429, 500, 502, 503 and 504. Explicit Gateway error.retryable=false overrides transient classification. PROJECT_QUOTA_EXCEEDED is terminal for the automatic cycle even when 429/Retry-After is supplied. HTTP 400/401/403/409/413 and other statuses stop automatically. A 409 never causes altered payload under the same identity. A later explicit flush may retry retained bytes after operator remediation, but no automatic loop waits until the next daily reset. A previous server minimum remains enforced. Retryable is a classification, not proof that another attempt is scheduled after budget exhaustion. Server quota/accounting/authentication decisions remain authoritative.

## 6. Retry-After scheduling

Retry-After supports nonnegative delay-seconds and HTTP-date, independent of header case. Invalid/fractional/negative values fall back to exponential backoff; zero/past dates still respect backoff. Overflow or excessive valid guidance produces a bounded budget-exhausted result, not an enormous timer. For dates, conservative delay is max(0, target-localWallClock, target-serverDate when available). The server-relative interval prevents early retry under clock skew. Delay is max(serverMinimum, min(base*2^(attempt-1), maxBackoff)*(1+random*jitter)). Eligibility/deadlines use monotonic performance time after initial wall-date interpretation; timer rounding is followed by an eligibility recheck. No retry occurs before the valid minimum. If the minimum cannot fit, RETRY_BUDGET_EXHAUSTED retains the batch without retrying early. Defaults: 3 attempts, 5000-ms attempt timeout, 15000-ms retry horizon, 200-ms base, 2000-ms backoff cap, positive jitter up to 20%, and 15000-ms close deadline. Zero retry budget permits one bounded attempt. Retry budget and close timeout are independently validated and bounded to at most 300000 ms.

## 7. Backoff and jitter

Retry-After supports nonnegative delay-seconds and HTTP-date, independent of header case. Invalid/fractional/negative values fall back to exponential backoff; zero/past dates still respect backoff. Overflow or excessive valid guidance produces a bounded budget-exhausted result, not an enormous timer. For dates, conservative delay is max(0, target-localWallClock, target-serverDate when available). The server-relative interval prevents early retry under clock skew. Delay is max(serverMinimum, min(base*2^(attempt-1), maxBackoff)*(1+random*jitter)). Eligibility/deadlines use monotonic performance time after initial wall-date interpretation; timer rounding is followed by an eligibility recheck. No retry occurs before the valid minimum. If the minimum cannot fit, RETRY_BUDGET_EXHAUSTED retains the batch without retrying early. Defaults: 3 attempts, 5000-ms attempt timeout, 15000-ms retry horizon, 200-ms base, 2000-ms backoff cap, positive jitter up to 20%, and 15000-ms close deadline. Zero retry budget permits one bounded attempt. Retry budget and close timeout are independently validated and bounded to at most 300000 ms.

## 8. Stable batch identity/payload

Each batch generates identity and sent_at once, serializes canonical event order once and reuses the exact request body for every permitted retry. Later writes cannot join an attempted batch. Response acknowledgement must match status durably_accepted, batch UUID and event count. Unknown outcomes remain unknown until a valid acknowledgement; they are not reported as proven event drops. Controlled and actual Gateway tests compare SHA-256 request hashes, IDs and accepted counts. This provides stable idempotent retries under the Gateway contract, not distributed exactly-once delivery.

## 9. Queue and backpressure

The original logger waiting queue remains bounded (defaults 10000 events / 64 MiB), with observable priority eviction and drops. One processing slice holds at most 256 events or approximately 64 KiB, with one allowed maximum-size event crossing the byte threshold. The HTTP transport holds one bounded immutable batch (default 128 events / 1 MiB, allowed up to 1000 / 4 MiB), plus bounded envelope overhead, and one network attempt at a time. Direct write callers must await automatic full-batch flush. New writes while a batch is in flight/retained are refused. Rejected handoffs and overflow cannot turn into a successful flush. In-flight queue ownership and pending transport state are separately exposed; they overlap during handoff and must not be summed as unique events. A retained rejected/unknown batch is unresolved rather than a proven drop. A sticky queue failure preserves evidence of earlier unsuccessful handoffs. There is no periodic HTTP send timer or disk queue.

## 10. Flush/close/cancellation

OPEN -> FLUSHING -> OPEN; close establishes CLOSING immediately and stops producers, then CLOSED on either completion or failure. Concurrent transport flush calls share the current operation, and concurrent closes share completion including rejection. Logger flush drains to quiescence then confirms transport acknowledgement; stop producers for a finite synchronization point. HTTP closeTimeoutMs starts before the logger drains its queue. Abort/deadline cancellation interrupts request and retry wait, clears owned timers and releases the credential reference. No new attempt starts after cancellation. A failed/aborted close never proves rejection of an ambiguous request or claims delivery success. Logger onError and flush/close expose failures formerly swallowed by WriteQueue. Retained data cannot be retried through a closed transport. Memory-only records can be lost on process exit before admission; the two actual runtime process-exit checks demonstrate no implicit send without flush.

## 11. Safe diagnostics

IngestionError supplies stable code, safe static message, retryability classification, HTTP status when known, SDK-generated batch reference, attempt count, retry delay when relevant and accepted/rejected/unknown/not_sent outcome. Only known Gateway error codes are adopted; arbitrary backend text, HTML and payloads are never surfaced. Responses are read only up to 8192 bytes, including acknowledgements, within the request timeout. Redirects are refused. Invalid URL errors do not retain raw input. Credential-bearing events are rejected both before and after JSON normalization, including escaped representations. Diagnostic callback exceptions are isolated and synchronous re-entrancy is suppressed. No provider assertions or browser secrets are introduced.

## 12. Node 22 and 24 compatibility

Actual execution passed on portable Node v22.23.4 and existing Node v24.14.0. The portable executable is under .tmp/dev014-evidence/runtime22/, downloaded from the official Node release endpoint and checked against its official SHASUMS256 entry; no global runtime was replaced. Each runtime passed 103 SDK leaves, 66 core/contract leaves, public declarations and ESM execution. Both fresh npm consumers executed against the real Gateway. Package engines remain >=22; this is an installation range, while independently verified versions are the two patches above. Other runtimes and CommonJS are not independently certified.

## 13. Package installation and declarations

Actual local @skyra/logger-core and @skyra/logger-node 1.0.0 tarballs were built, independently installed with npm into fresh isolated consumer projects, and compiled/executed without monorepo aliases. Installed dist bytes are checked against the final built packages on both runtimes. Public exports/types/dependency linkage and additive declarations pass. Tar inspection rejects traversal/links, development/test/.env material, real credential patterns and absolute workstation source paths; a pre-existing generic credential-redaction documentation example is explicitly recognized as a nonsecret placeholder. Maps remain relative. Package/API details and SHA-256 values are recorded in package-api-audit.json. Neither package was published or tagged.

## 14. Developer documentation/examples

Updated docs/developers/errors-and-retries.md defines status policy, Retry-After, backoff, deadlines, retention, queue pressure and shutdown. node-sdk.md documents the additive API/runtime scope; troubleshooting.md covers credential/project/quota/throttle/unknown outcomes; examples.md updates actual commands. Existing getting-started, ingestion API and security references were inspected and retained where accurate. Existing first-log.mjs now reports safe structured IngestionError properties; sample.mjs accepts optional retryOptions and returns safe diagnostics for controlled modes. Snippets and relative links compile/resolve against the public package declarations. No credential is hardcoded.

## 15. Angular onboarding changes

Developer getting-started now states verified Node 22/24 support, bounded Retry-After policy, the memory durability boundary and bounded close guidance. Project selection, permission checks, BFF-only browser access, credential handoff and copyable environment-only snippets are preserved. A discovered organization-detail light-theme contrast defect was fixed by explicitly using the existing text token for dd; no redesign or Platform change. Real browser checks cover onboarding, signed OIDC, keyboard/navigation, direct routes, responsive layouts and light/dark themes. Final optimized browser run: 28 independent scenarios and 84 accessibility scans, zero violations.

## 16. Real Gateway failure/recovery

Real topology: Angular Console -> durable-session Console BFF -> authoritative Admin/Query; external npm-installed Node SDK -> actual Gateway -> WAL fsync -> archive publisher -> Query -> authenticated BFF -> Angular Explorer. PostgreSQL is the guarded disposable 127.0.0.1:5433 / skyra_loghub_disposable_validation on 17.9; runtime roles and physical marker/directory are verified. The controlled provider performs signed RS256/JWKS code exchange/PKCE; no real Microsoft tenant was configured. A test-only proxy first supplies a 503 with Retry-After:1, then loses a real durable Gateway acknowledgement. All three requests have the same SHA-256/UUID; the second actual Gateway admission response is a duplicate. Focused actual-service tests additionally prove a client timeout after admission, actual Parquet publication before retry, restart after two WAL segments retire, receipt-cache removal and UTC rollover. Parquet-only Query then returns exactly one byte-equivalent canonical event for the retained SDK request. The retained SDK body then receives the original receipt without recreating WAL or charging the next period. Project suspension and real Admin credential revocation between attempts terminate with 4xx and retain the unknown prior outcome. No business response mock substitutes for authoritative Gateway accounting.

## 17. Same-event Query/BFF/Explorer continuity

Integrated acceptance creates/selects a disposable project and issues a real managed credential through BFF. The exact packaged quick-start submits six events; the retry cohort adds twenty. The same 26 unique canonical event IDs and fields are verified in WAL, JSONL/archive publication, actual Query, authenticated BFF and Angular Explorer. The DEV-012 path retires real WAL and verifies Parquet-only Query/BFF/Angular continuity with unchanged canonical fields and ledger. Multi-project/foreign-tenant, CSRF, credential handoff/revocation, signed OIDC and current membership checks remain enforced.

## 18. Analytics/Usage reconciliation

Integrated Usage accepts 26 events and 25360 normalized UTF-8 bytes; duplicate and rejected charge are both zero. Reservations finish at zero and completeness is COMPLETE. Accounting uses the server UTC admission period (2030-01-01), independently of event timestamp days. Analytics reconciles its filtered searchable event scope rather than treating admission usage as a query count. The isolated restart/retirement cohort separately commits one 5416-byte event, preserves its original receipt/period after cache removal and rollover, and creates no second-day usage window. See usage.json, analytics.json, reconciliation.json, browser-retirement.json and sdk-gateway-lifecycle.json.

## 19. Security and tenant isolation

Secrets stay solely in the Node consumer/server processes and dedicated private test configuration. Angular snippets contain environment variable names only. Known error-code allowlisting, bounded response parsing, URL sanitization, escaped-key refusal and diagnostics re-entrancy checks pass. Foreign tenant/project, wrong environment, revoked credential and suspended project requests remain denied. Quotas and rate limits remain server-enforced. No SDK disk persistence, arbitrary writes, provider changes or new infrastructure was introduced. DEV-013 BFF auth runtime and DEV-012 Gateway storage/Query runtime remain byte-preserved.

## 20. Regression test results

| Suite | Independent passing leaves |
|---|---:|
| sdk-tests22 | 103 |
| sdk-tests24 | 103 |
| core-contracts22 | 66 |
| core-contracts24 | 66 |
| session-migration | 5 |
| session-persistence | 15 |
| session-http-security | 11 |
| session-outage-recovery | 4 |
| session-cleanup-recovery | 1 |
| bff-tests | 115 |
| console-tests | 108 |
| quota-integration | 16 |
| quota-boundaries | 4 |
| admin-postgres-hardening | 10 |
| credentials-persistence | 28 |
| audit-persistence | 10 |
| developer-documentation-final | 4 |
| developer-sample | 8 |
| storage-lifecycle.test | 15 |
| storage-ownership.test | 4 |
| sdk-gateway-lifecycle | 6 |
| app-exit | 2 |
| integrated-browser | 28 |
| ingestion-gateway-tests | 124 |
| admin-service-tests | 98 |
| query-tests | 214 |
| target-guards | 15 |

All final listed leaves pass, with zero failure/skip. The Gateway/Admin/Query, WAL/recovery/retention, quota, credential, audit, BFF, durable-session, Angular, onboarding, Explorer, Analytics and integrated product paths passed. The service helper SDK run predates the last additive diagnostic tests and is superseded by the final 103-leaf Node matrices. Full final command/results and retained diagnostic failures are listed below.

Run from the LogHub checkout, with existing private disposable manifests intact. Do not substitute a protected DATABASE_URL.

- node scripts/run-sdk-reliability.mjs sdk — builds SDK; actual Node 22/24 SDK and core tests.
- node scripts/package-node-sdk.mjs .tmp/dev014-evidence/packages
- SKYRA_SDK_EVIDENCE_LABEL=dev014 node scripts/verify-sdk-consumer.mjs (set the variable using PowerShell syntax on Windows).
- Node 22 consumer: copy final tarballs into .tmp/dev014-node22-evidence/packages; set SKYRA_SDK_EVIDENCE_LABEL=dev014-node22 and SKYRA_SDK_NPM_CLI to the existing npm-cli.js; run .tmp/dev014-evidence/runtime22/node.exe scripts/verify-sdk-consumer.mjs.
- node .tmp/dev014-evidence/package-api-audit.mjs
- node .tmp/dev014-evidence/resource-matrix.mjs
- node --test --test-reporter=tap tests/sdk-reliability/app-exit.test.mjs
- node --test --test-reporter=tap tests/sdk-reliability/gateway-lifecycle.test.mjs
- node scripts/run-sdk-reliability.mjs sessions — actual disposable DB restart tests, sequential.
- node scripts/run-sdk-reliability.mjs regressions — service, quota, credential, audit, developer and storage checks.
- node .tmp/dev014-evidence/build-console-offline.mjs — production target with scripts/styles optimized and external font inlining disabled.
- node scripts/run-sdk-reliability.mjs browser — launches integrated signed-OIDC real-product browser acceptance with DEV-014 evidence.
- node .tmp/dev014-evidence/typechecks.mjs — twelve package/application no-emit checks.
- node .tmp/dev014-evidence/verify-prisma.mjs — guarded schema validation/generation.
- node scripts/protected-catalog-snapshot.mjs before|after dev014 — forced read-only only.
- node .tmp/dev014-evidence/final-audit.mjs

Expanded argv, runtime paths, working directories, exits and durations are in sdk-results.json, sessions-results.json, regressions-results.json and browser-results.json. Service helper results are in regressions.json. No TAP parent container or storage database-restart file wrapper is counted as an independent business leaf. Resource probes, twelve typechecks, four Prisma actions, packaging/declaration checks, schema sync and governance are additional checks rather than invented test leaves. Multiple runtime rows intentionally rerun the same suite; do not sum them as unique business behaviors.

Superseded diagnostics:

- Restricted-context loopback HTTP tests could not reach their peer; the approved isolated-network run passed.
- An old EBADF test expected successful flush/close after a write failure. It now requires truthful rejection and passes; the original failed log is retained.
- Actual browser accessibility found organization detail text contrast in light theme. The scoped token fix passed 84 final scans.
- Default optimized build attempted external Google font inlining and DNS failed. The final optimized production build disables only build-time external font inlining; script/style optimization remains on. Development build also passed.
- A new lifecycle fixture exceeded the supported maintenance segment bound; it now uses 16. Another assertion converted PostgreSQL DATE through host timezone; it now reads period::text. A revocation fixture assumed a nonexistent status column; it now calls the actual Admin revoke operation. All six final Gateway lifecycle leaves pass.
- Prisma generation encountered a Windows engine DLL held by live browser services. Repeating after service exit passed validation/generation for both schemas.
- Prototype package-audit tooling tried a TypeScript API unavailable in the installed compiler and initially flagged a generic redaction documentation placeholder. The accepted audit compares declaration source, explicitly recognizes that nonsecret placeholder, and verifies every installed dist byte.
- Earlier passing 94/100/101/102-leaf SDK runs are superseded by the final 103-leaf matrix. Final accepted evidence includes the last package installation and actual Gateway/browser reruns.

## 21. Performance observations

Synthetic loopback probes; controlled 32-event success and 1000-call overloaded producer (queue configured to 64 events / 64 KiB), not production throughput/SLA. One batch remains pending under failure and zero retry timers remain after close. The configured queue bounds hold; overlapping in-flight/transport views are exposed rather than hidden. RSS includes Node, SDK and test process effects; it is not a calibrated per-event memory cost.

| Runtime | Init ms | Enqueue us/event | Success flush ms | Throttled flush ms | Failure close ms | Peak retry-wait timers | RSS bytes |
|---|---:|---:|---:|---:|---:|---:|---:|
| v22.23.4 | 0.099 | 155.175 | 27.336 | 1024.492 | 75.163 | 1 | 68296704 |
| v24.14.0 | 0.069 | 136.278 | 25.782 | 1009.597 | 75.599 | 1 | 70987776 |

Actual Gateway admission durations and WAL/accounting stages are in reconciliation.json. Not every stage is populated on duplicate paths; null/absent values are not zero. Canonical byte totals come from durable normalized payloads, separately from SDK input-line byte counters. External installation elapsed time is in each consumer-install.log. No comparable production baseline or throughput claim is made.

## 22. Protected database preservation

Protected PostgreSQL 127.0.0.1:5432 / skyra_loghub_dev was accessed only through the established forced-read-only snapshot tool. Before/after snapshots are byte-identical: SHA-256 90f73c6f2bc6bce568974e27472fd652505e3034284ff4a9883104b1fd02a6ff. No protected DDL/DML, grants, session writes, bootstrap, credential issuance or activation occurred. Disposable ledger remains exactly 11 migrations; all checksums and existing runtime grants pass. All 1399 initial files remain; 206 historical artifacts and all 37 immutable Platform archives are unchanged. Platform remains clean at 928ca4343ab3a1887e586123a6ba5bb88b56a0ef. No source from the previous milestones was reset or deleted.

## 23. Remaining limitations

HTTP buffering remains memory-only before durable admission; process death can lose those events. Retry/close deadlines are bounded local policies, not guarantees of delivery during prolonged outage. Explicit operator retries do not make unlimited automatic retry safe. Runtime claims are limited to the tested Node 22/24 versions; CommonJS, public npm publication, production load/SLA and cloud deployment remain unverified/out of scope. Real Entra configuration and protected environment activation remain pending their separate approval/configuration work. Historical permanent-ledger growth from DEV-012 is unchanged. Windows directory fsync limitations remain those of the existing storage contract. No DEV-015, Git commit/push/tag, global Node replacement, protected activation or npm publication occurred.

## 24. Final Git/source state

395 folded entries, 150 tracked modified, 245 untracked, zero staged. Branch main and HEAD 19f084ad36fe37bb57ca107103e136d2d4a378be are unchanged. Full file inventory and hashes are in final-audit.json. No staged changes, branch/HEAD change, commit, tag or push.

## 25. Final verdict

PASS — DEV-014 IMPLEMENTED IN ISOLATION. All required local acceptance checks passed using the final installed package bytes. Protected/production activation is not performed. The manifest-owned disposable cluster is stopped at task completion. Stop after DEV-014.
