# DEV-014 — Implementation Report

PASS — implemented in isolation.

Run: 2026-11-11, Windows/loopback, synthetic isolated tenants and identities. Paths below are repository-relative unless stated otherwise. Raw credentials, authorization headers, session verifiers and private connection strings are excluded. Evidence root: .tmp/dev014-evidence/; independent Node 22 consumer evidence: .tmp/dev014-node22-evidence/.

## Existing architecture and gap inventory

The existing public SDK uses canonical core validation/redaction, synchronous logger calls feeding a bounded background write queue, and explicit HTTP flush. HttpTransport already retained one batch UUID and serialized envelope across attempts, with three attempts, 5-second request timeouts and 200-ms exponential waits. Gaps: Retry-After was ignored, all 429/5xx were largely grouped together, most response retryability hints were ignored, shutdown waits could not be cancelled, and queue write exceptions could disappear before a successful flush result. Failed close did not reliably finish lifecycle cleanup. Node 22 support was declared by staged metadata but previously only Node 24 was independently exercised. HTTP pre-admission buffering was and remains memory-only.

## Public API and build/package changes

Existing factory, severity methods, event/context fields, write/flush/close signatures, entry points and valid configurations remain supported. Declaration comparison against the preserved DEV-013 consumer verifies existing public members in logger.d.ts, http.transport.d.ts and transport.interface.d.ts; HttpTransport.getStatus() adds return fields. Additions: IngestionError, HttpDiagnostic, IngestionOutcome, parseRetryAfter, retryBudgetMs, retryBaseDelayMs, retryMaxDelayMs, retryJitter, closeTimeoutMs, onDiagnostic, HttpTransport.abort(), optional beginClose transport hook and optional pending/in-flight status fields. No third-party dependency was added. Core event schema and event-generation rules are unchanged. Invalid service/environment/resource limits now fail configuration early; failed flush/close now reject rather than hiding transport failure. These are deliberate reliability corrections, not changes to valid-call signatures. A failed HTTP close now ends the transport; decide about explicit retained-batch retry before closing.

Actual local @skyra/logger-core and @skyra/logger-node 1.0.0 tarballs were built, independently installed with npm into fresh isolated consumer projects, and compiled/executed without monorepo aliases. Installed dist bytes are checked against the final built packages on both runtimes. Public exports/types/dependency linkage and additive declarations pass. Tar inspection rejects traversal/links, development/test/.env material, real credential patterns and absolute workstation source paths; a pre-existing generic credential-redaction documentation example is explicitly recognized as a nonsecret placeholder. Maps remain relative. Package/API details and SHA-256 values are recorded in package-api-audit.json. Neither package was published or tagged.

## Retry classification and scheduling

Automatic retries apply to network/timeout/invalid acknowledgements and HTTP 408, rate-limit 429, 500, 502, 503 and 504. Explicit Gateway error.retryable=false overrides transient classification. PROJECT_QUOTA_EXCEEDED is terminal for the automatic cycle even when 429/Retry-After is supplied. HTTP 400/401/403/409/413 and other statuses stop automatically. A 409 never causes altered payload under the same identity. A later explicit flush may retry retained bytes after operator remediation, but no automatic loop waits until the next daily reset. A previous server minimum remains enforced. Retryable is a classification, not proof that another attempt is scheduled after budget exhaustion. Server quota/accounting/authentication decisions remain authoritative.

Retry-After supports nonnegative delay-seconds and HTTP-date, independent of header case. Invalid/fractional/negative values fall back to exponential backoff; zero/past dates still respect backoff. Overflow or excessive valid guidance produces a bounded budget-exhausted result, not an enormous timer. For dates, conservative delay is max(0, target-localWallClock, target-serverDate when available). The server-relative interval prevents early retry under clock skew. Delay is max(serverMinimum, min(base*2^(attempt-1), maxBackoff)*(1+random*jitter)). Eligibility/deadlines use monotonic performance time after initial wall-date interpretation; timer rounding is followed by an eligibility recheck. No retry occurs before the valid minimum. If the minimum cannot fit, RETRY_BUDGET_EXHAUSTED retains the batch without retrying early. Defaults: 3 attempts, 5000-ms attempt timeout, 15000-ms retry horizon, 200-ms base, 2000-ms backoff cap, positive jitter up to 20%, and 15000-ms close deadline. Zero retry budget permits one bounded attempt. Retry budget and close timeout are independently validated and bounded to at most 300000 ms.

## Identity, queue and lifecycle

Each batch generates identity and sent_at once, serializes canonical event order once and reuses the exact request body for every permitted retry. Later writes cannot join an attempted batch. Response acknowledgement must match status durably_accepted, batch UUID and event count. Unknown outcomes remain unknown until a valid acknowledgement; they are not reported as proven event drops. Controlled and actual Gateway tests compare SHA-256 request hashes, IDs and accepted counts. This provides stable idempotent retries under the Gateway contract, not distributed exactly-once delivery.

The original logger waiting queue remains bounded (defaults 10000 events / 64 MiB), with observable priority eviction and drops. One processing slice holds at most 256 events or approximately 64 KiB, with one allowed maximum-size event crossing the byte threshold. The HTTP transport holds one bounded immutable batch (default 128 events / 1 MiB, allowed up to 1000 / 4 MiB), plus bounded envelope overhead, and one network attempt at a time. Direct write callers must await automatic full-batch flush. New writes while a batch is in flight/retained are refused. Rejected handoffs and overflow cannot turn into a successful flush. In-flight queue ownership and pending transport state are separately exposed; they overlap during handoff and must not be summed as unique events. A retained rejected/unknown batch is unresolved rather than a proven drop. A sticky queue failure preserves evidence of earlier unsuccessful handoffs. There is no periodic HTTP send timer or disk queue.

OPEN -> FLUSHING -> OPEN; close establishes CLOSING immediately and stops producers, then CLOSED on either completion or failure. Concurrent transport flush calls share the current operation, and concurrent closes share completion including rejection. Logger flush drains to quiescence then confirms transport acknowledgement; stop producers for a finite synchronization point. HTTP closeTimeoutMs starts before the logger drains its queue. Abort/deadline cancellation interrupts request and retry wait, clears owned timers and releases the credential reference. No new attempt starts after cancellation. A failed/aborted close never proves rejection of an ambiguous request or claims delivery success. Logger onError and flush/close expose failures formerly swallowed by WriteQueue. Retained data cannot be retried through a closed transport. Memory-only records can be lost on process exit before admission; the two actual runtime process-exit checks demonstrate no implicit send without flush.

## Diagnostics

IngestionError supplies stable code, safe static message, retryability classification, HTTP status when known, SDK-generated batch reference, attempt count, retry delay when relevant and accepted/rejected/unknown/not_sent outcome. Only known Gateway error codes are adopted; arbitrary backend text, HTML and payloads are never surfaced. Responses are read only up to 8192 bytes, including acknowledgements, within the request timeout. Redirects are refused. Invalid URL errors do not retain raw input. Credential-bearing events are rejected both before and after JSON normalization, including escaped representations. Diagnostic callback exceptions are isolated and synchronous re-entrancy is suppressed. No provider assertions or browser secrets are introduced.

## Runtime compatibility

Actual execution passed on portable Node v22.23.4 and existing Node v24.14.0. The portable executable is under .tmp/dev014-evidence/runtime22/, downloaded from the official Node release endpoint and checked against its official SHASUMS256 entry; no global runtime was replaced. Each runtime passed 103 SDK leaves, 66 core/contract leaves, public declarations and ESM execution. Both fresh npm consumers executed against the real Gateway. Package engines remain >=22; this is an installation range, while independently verified versions are the two patches above. Other runtimes and CommonJS are not independently certified.

## Documentation, sample and Angular

Updated docs/developers/errors-and-retries.md defines status policy, Retry-After, backoff, deadlines, retention, queue pressure and shutdown. node-sdk.md documents the additive API/runtime scope; troubleshooting.md covers credential/project/quota/throttle/unknown outcomes; examples.md updates actual commands. Existing getting-started, ingestion API and security references were inspected and retained where accurate. Existing first-log.mjs now reports safe structured IngestionError properties; sample.mjs accepts optional retryOptions and returns safe diagnostics for controlled modes. Snippets and relative links compile/resolve against the public package declarations. No credential is hardcoded.

Developer getting-started now states verified Node 22/24 support, bounded Retry-After policy, the memory durability boundary and bounded close guidance. Project selection, permission checks, BFF-only browser access, credential handoff and copyable environment-only snippets are preserved. A discovered organization-detail light-theme contrast defect was fixed by explicitly using the existing text token for dd; no redesign or Platform change. Real browser checks cover onboarding, signed OIDC, keyboard/navigation, direct routes, responsive layouts and light/dark themes. Final optimized browser run: 28 independent scenarios and 84 accessibility scans, zero violations.

## Files changed

Changed since the DEV-014 initial snapshot (not since HEAD):

- apps/console-web/src/app/features/developer/getting-started.component.html
- apps/console-web/src/app/features/organization/organization.component.css
- docs/developers/errors-and-retries.md
- docs/developers/examples.md
- docs/developers/node-sdk.md
- docs/developers/troubleshooting.md
- examples/managed-ingestion/first-log.mjs
- examples/managed-ingestion/sample.mjs
- packages/logger-node/src/transports/http.transport.ts
- scripts/protected-catalog-snapshot.mjs
- scripts/run-explorer-regressions.mjs
- scripts/run-integrated-acceptance.mjs
- scripts/verify-sdk-consumer.mjs
- tests/audit/persistence.test.mjs
- tests/credentials/feature005-ambiguous-proxy.mjs
- tests/developer/documentation.test.mjs
- tests/developer/sample.test.mjs
- tests/integrated/browser-scenarios.mjs
- tests/organization/organization.e2e.mjs
- tests/quotas/quota-boundaries.test.mjs
- tests/quotas/quota-integration.test.mjs
- tests/sessions/bff-fault-child.mjs
- tests/sessions/browser-scenarios.mjs
- tests/sessions/cleanup-child.mjs
- tests/sessions/cleanup-recovery.test.mjs
- tests/sessions/http-security.test.mjs
- tests/sessions/identity-stack.mjs
- tests/sessions/migration.test.mjs
- tests/sessions/outage-recovery.test.mjs
- tests/sessions/persistence.test.mjs
- tests/storage/database-restart.mjs
- tests/storage/lifecycle.test.mjs
- tests/storage/ownership.test.mjs
- packages/logger-core/package.json
- packages/logger-node/package.json
- packages/logger-node/src/internal/write-queue.ts
- packages/logger-node/src/logger.ts
- packages/logger-node/src/transports/transport.interface.ts
- packages/logger-node/tests/hardening/hardening-verification.test.ts

New implementation/test files:

- packages/logger-node/tests/http-reliability.test.ts
- scripts/run-sdk-reliability.mjs
- tests/sdk-reliability/app-exit.test.mjs
- tests/sdk-reliability/gateway-lifecycle.test.mjs
- tests/sdk-reliability/resource-probe.mjs

The four DEV-014 root reports are additional deliverables. Label-only test-harness edits route this run to owned evidence paths; private durable-session provisioning manifests remain unchanged. Generated cache changes are separately recorded in final-audit.json.

## Decisions and deferred work

HTTP buffering remains memory-only before durable admission; process death can lose those events. Retry/close deadlines are bounded local policies, not guarantees of delivery during prolonged outage. Explicit operator retries do not make unlimited automatic retry safe. Runtime claims are limited to the tested Node 22/24 versions; CommonJS, public npm publication, production load/SLA and cloud deployment remain unverified/out of scope. Real Entra configuration and protected environment activation remain pending their separate approval/configuration work. Historical permanent-ledger growth from DEV-012 is unchanged. Windows directory fsync limitations remain those of the existing storage contract. No DEV-015, Git commit/push/tag, global Node replacement, protected activation or npm publication occurred.
