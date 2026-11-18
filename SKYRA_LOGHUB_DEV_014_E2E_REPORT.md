# DEV-014 — Developer Experience E2E

PASS — verified in isolation.

Run: 2026-11-11, Windows/loopback, synthetic isolated tenants and identities. Paths below are repository-relative unless stated otherwise. Raw credentials, authorization headers, session verifiers and private connection strings are excluded. Evidence root: .tmp/dev014-evidence/; independent Node 22 consumer evidence: .tmp/dev014-node22-evidence/.

## Runtime and clean packages

Actual execution passed on portable Node v22.23.4 and existing Node v24.14.0. The portable executable is under .tmp/dev014-evidence/runtime22/, downloaded from the official Node release endpoint and checked against its official SHASUMS256 entry; no global runtime was replaced. Each runtime passed 103 SDK leaves, 66 core/contract leaves, public declarations and ESM execution. Both fresh npm consumers executed against the real Gateway. Package engines remain >=22; this is an installation range, while independently verified versions are the two patches above. Other runtimes and CommonJS are not independently certified.

Actual local @skyra/logger-core and @skyra/logger-node 1.0.0 tarballs were built, independently installed with npm into fresh isolated consumer projects, and compiled/executed without monorepo aliases. Installed dist bytes are checked against the final built packages on both runtimes. Public exports/types/dependency linkage and additive declarations pass. Tar inspection rejects traversal/links, development/test/.env material, real credential patterns and absolute workstation source paths; a pre-existing generic credential-redaction documentation example is explicitly recognized as a nonsecret placeholder. Maps remain relative. Package/API details and SHA-256 values are recorded in package-api-audit.json. Neither package was published or tagged.

## Actual service topology and fault injection

Real topology: Angular Console -> durable-session Console BFF -> authoritative Admin/Query; external npm-installed Node SDK -> actual Gateway -> WAL fsync -> archive publisher -> Query -> authenticated BFF -> Angular Explorer. PostgreSQL is the guarded disposable 127.0.0.1:5433 / skyra_loghub_disposable_validation on 17.9; runtime roles and physical marker/directory are verified. The controlled provider performs signed RS256/JWKS code exchange/PKCE; no real Microsoft tenant was configured. A test-only proxy first supplies a 503 with Retry-After:1, then loses a real durable Gateway acknowledgement. All three requests have the same SHA-256/UUID; the second actual Gateway admission response is a duplicate. Focused actual-service tests additionally prove a client timeout after admission, actual Parquet publication before retry, restart after two WAL segments retire, receipt-cache removal and UTC rollover. Parquet-only Query then returns exactly one byte-equivalent canonical event for the retained SDK request. The retained SDK body then receives the original receipt without recreating WAL or charging the next period. Project suspension and real Admin credential revocation between attempts terminate with 4xx and retain the unknown prior outcome. No business response mock substitutes for authoritative Gateway accounting.

## Same-event continuity

Integrated acceptance creates/selects a disposable project and issues a real managed credential through BFF. The exact packaged quick-start submits six events; the retry cohort adds twenty. The same 26 unique canonical event IDs and fields are verified in WAL, JSONL/archive publication, actual Query, authenticated BFF and Angular Explorer. The DEV-012 path retires real WAL and verifies Parquet-only Query/BFF/Angular continuity with unchanged canonical fields and ledger. Multi-project/foreign-tenant, CSRF, credential handoff/revocation, signed OIDC and current membership checks remain enforced.

## Analytics and Usage

Integrated Usage accepts 26 events and 25360 normalized UTF-8 bytes; duplicate and rejected charge are both zero. Reservations finish at zero and completeness is COMPLETE. Accounting uses the server UTC admission period (2030-01-01), independently of event timestamp days. Analytics reconciles its filtered searchable event scope rather than treating admission usage as a query count. The isolated restart/retirement cohort separately commits one 5416-byte event, preserves its original receipt/period after cache removal and rollover, and creates no second-day usage window. See usage.json, analytics.json, reconciliation.json, browser-retirement.json and sdk-gateway-lifecycle.json.

## Browser and accessibility

Developer getting-started now states verified Node 22/24 support, bounded Retry-After policy, the memory durability boundary and bounded close guidance. Project selection, permission checks, BFF-only browser access, credential handoff and copyable environment-only snippets are preserved. A discovered organization-detail light-theme contrast defect was fixed by explicitly using the existing text token for dd; no redesign or Platform change. Real browser checks cover onboarding, signed OIDC, keyboard/navigation, direct routes, responsive layouts and light/dark themes. Final optimized browser run: 28 independent scenarios and 84 accessibility scans, zero violations.

## Lifecycle, failure and security

OPEN -> FLUSHING -> OPEN; close establishes CLOSING immediately and stops producers, then CLOSED on either completion or failure. Concurrent transport flush calls share the current operation, and concurrent closes share completion including rejection. Logger flush drains to quiescence then confirms transport acknowledgement; stop producers for a finite synchronization point. HTTP closeTimeoutMs starts before the logger drains its queue. Abort/deadline cancellation interrupts request and retry wait, clears owned timers and releases the credential reference. No new attempt starts after cancellation. A failed/aborted close never proves rejection of an ambiguous request or claims delivery success. Logger onError and flush/close expose failures formerly swallowed by WriteQueue. Retained data cannot be retried through a closed transport. Memory-only records can be lost on process exit before admission; the two actual runtime process-exit checks demonstrate no implicit send without flush.

Secrets stay solely in the Node consumer/server processes and dedicated private test configuration. Angular snippets contain environment variable names only. Known error-code allowlisting, bounded response parsing, URL sanitization, escaped-key refusal and diagnostics re-entrancy checks pass. Foreign tenant/project, wrong environment, revoked credential and suspended project requests remain denied. Quotas and rate limits remain server-enforced. No SDK disk persistence, arbitrary writes, provider changes or new infrastructure was introduced. DEV-013 BFF auth runtime and DEV-012 Gateway storage/Query runtime remain byte-preserved.

## Independent tests and commands

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

## Performance

Synthetic loopback probes; controlled 32-event success and 1000-call overloaded producer (queue configured to 64 events / 64 KiB), not production throughput/SLA. One batch remains pending under failure and zero retry timers remain after close. The configured queue bounds hold; overlapping in-flight/transport views are exposed rather than hidden. RSS includes Node, SDK and test process effects; it is not a calibrated per-event memory cost.

| Runtime | Init ms | Enqueue us/event | Success flush ms | Throttled flush ms | Failure close ms | Peak retry-wait timers | RSS bytes |
|---|---:|---:|---:|---:|---:|---:|---:|
| v22.23.4 | 0.099 | 155.175 | 27.336 | 1024.492 | 75.163 | 1 | 68296704 |
| v24.14.0 | 0.069 | 136.278 | 25.782 | 1009.597 | 75.599 | 1 | 70987776 |

Actual Gateway admission durations and WAL/accounting stages are in reconciliation.json. Not every stage is populated on duplicate paths; null/absent values are not zero. Canonical byte totals come from durable normalized payloads, separately from SDK input-line byte counters. External installation elapsed time is in each consumer-install.log. No comparable production baseline or throughput claim is made.

## Superseded diagnostics

- Restricted-context loopback HTTP tests could not reach their peer; the approved isolated-network run passed.
- An old EBADF test expected successful flush/close after a write failure. It now requires truthful rejection and passes; the original failed log is retained.
- Actual browser accessibility found organization detail text contrast in light theme. The scoped token fix passed 84 final scans.
- Default optimized build attempted external Google font inlining and DNS failed. The final optimized production build disables only build-time external font inlining; script/style optimization remains on. Development build also passed.
- A new lifecycle fixture exceeded the supported maintenance segment bound; it now uses 16. Another assertion converted PostgreSQL DATE through host timezone; it now reads period::text. A revocation fixture assumed a nonexistent status column; it now calls the actual Admin revoke operation. All six final Gateway lifecycle leaves pass.
- Prisma generation encountered a Windows engine DLL held by live browser services. Repeating after service exit passed validation/generation for both schemas.
- Prototype package-audit tooling tried a TypeScript API unavailable in the installed compiler and initially flagged a generic redaction documentation placeholder. The accepted audit compares declaration source, explicitly recognizes that nonsecret placeholder, and verifies every installed dist byte.
- Earlier passing 94/100/101/102-leaf SDK runs are superseded by the final 103-leaf matrix. Final accepted evidence includes the last package installation and actual Gateway/browser reruns.

## Preservation and limits

Protected PostgreSQL 127.0.0.1:5432 / skyra_loghub_dev was accessed only through the established forced-read-only snapshot tool. Before/after snapshots are byte-identical: SHA-256 90f73c6f2bc6bce568974e27472fd652505e3034284ff4a9883104b1fd02a6ff. No protected DDL/DML, grants, session writes, bootstrap, credential issuance or activation occurred. Disposable ledger remains exactly 11 migrations; all checksums and existing runtime grants pass. All 1399 initial files remain; 206 historical artifacts and all 37 immutable Platform archives are unchanged. Platform remains clean at 928ca4343ab3a1887e586123a6ba5bb88b56a0ef. No source from the previous milestones was reset or deleted.

HTTP buffering remains memory-only before durable admission; process death can lose those events. Retry/close deadlines are bounded local policies, not guarantees of delivery during prolonged outage. Explicit operator retries do not make unlimited automatic retry safe. Runtime claims are limited to the tested Node 22/24 versions; CommonJS, public npm publication, production load/SLA and cloud deployment remain unverified/out of scope. Real Entra configuration and protected environment activation remain pending their separate approval/configuration work. Historical permanent-ledger growth from DEV-012 is unchanged. Windows directory fsync limitations remain those of the existing storage contract. No DEV-015, Git commit/push/tag, global Node replacement, protected activation or npm publication occurred.
