# Errors, retries and quotas

HTTP transport keeps one immutable batch UUID, timestamp, event order and serialized body for every retry. A timeout or connection loss can occur after admission: `unknown` is not proof of rejection. Retrying identical bytes can return a duplicate receipt without another admission charge. This is not distributed exactly-once delivery.

| Response | Automatic policy |
|---|---|
| Network error, timeout, invalid acknowledgement | Retry identical bytes within budget; outcome may be unknown |
| 408, 429 rate limit, 500, 502, 503, 504 | Bounded retries unless the Gateway explicitly says retryable=false |
| 429 PROJECT_QUOTA_EXCEEDED | Stop immediately; do not wait blindly until tomorrow |
| 400, 401, 403, 409, 413 and other statuses | Stop; fix payload, authorization or request size |

A known Gateway error code is exposed, never its arbitrary message, HTML or payload. `IngestionError` supplies code, retryable, httpStatus when known, batchId, attempt, outcome and retryDelayMs when applicable. The safe `onDiagnostic` callback reports scheduling and acceptance. retryable describes classification, not a promise of another scheduled attempt: RETRY_BUDGET_EXHAUSTED stops automatically. Callback errors cannot alter delivery, and synchronous recursive diagnostic reporting is suppressed. Avoid logging diagnostics through the same logger.

## Scheduling

Defaults: maxAttempts=3, timeoutMs=5000 per attempt, retryBudgetMs=15000 per explicit flush, retryBaseDelayMs=200, retryMaxDelayMs=2000, retryJitter=0.2. Local backoff is exponential, capped before adding positive jitter. Retry-After accepts nonnegative integer seconds or an HTTP date. The wait is the greater of server minimum and local backoff. Header casing is immaterial. When a valid server Date is available, HTTP dates conservatively honor both local absolute time and the server-relative interval to avoid early retries under clock skew. Past dates and zero do not remove local backoff. Invalid, fractional or negative guidance falls back to backoff. Overflow is treated as an excessive valid delay, never wrapped into a timer.

Validated option bounds are retryBudgetMs 0..300000, closeTimeoutMs 1..300000, retryBaseDelayMs 1..60000, retryMaxDelayMs between base and 60000, and retryJitter 0..1. Invalid service names/environments and nonpositive or noninteger resource limits fail configuration validation. The elapsed retry deadline uses a monotonic clock. A server minimum beyond the remaining budget produces RETRY_BUDGET_EXHAUSTED without retrying early or installing a huge timer. retryBudgetMs=0 allows one bounded attempt and disables automatic retries. The request timeout includes reading the bounded response body. Only one request and at most one retry-wait timer run per transport. There is no retry of redirects.

## Quota versus throttling

Daily quota rejection is terminal for the automatic flush cycle even with Retry-After. A batch larger than policy may never fit. Stop producers and inspect policy, UTC admission period and retained batch. After an authorized policy change or reset, an explicit flush may retry the same retained bytes; do not loop indefinitely. A previous valid server minimum still applies to explicit retries. Credential revocation or project suspension must be resolved independently. A 409 identity/digest conflict must never be addressed by changing payload under that identity.

## Queue and lifecycle

Logging calls enqueue synchronously into the existing bounded logger queue (default 10000 waiting events / 64 MiB). Critical events can evict waiting noncritical events; onDrop and status counters expose this. The processing slice is additionally bounded to 256 events/about 64 KiB (one maximum-size event can cross that slice threshold). HttpTransport bounds one batch to maxBatchEvents=128 and maxBufferBytes=1 MiB by default (up to 1000 / 4 MiB). Envelope overhead is additional and bounded. It accepts no new events while that batch is in flight or retained. Direct callers must await write, including automatic flush at the event-count boundary. Rejected writes poison successful flush reporting; a logger write failure also remains observable through flush/close. Do not treat queue acceptance counters as remote admission. Logger status separately exposes inFlightQueueCount/Bytes, pendingTransportEvents/Bytes/Batches and retryTimers. The in-flight processing slice can include events already handed to the transport; do not sum these overlapping ownership views as unique events. A retained rejected or unknown batch is unresolved and is not counted as a proven drop.

Concurrent flush calls share the in-flight operation; a new batch cannot join an already attempted batch. Logger flush drains its queue to quiescence and then confirms transport admission; stop producers for a finite synchronization boundary. Terminal automatic failure retains the exact batch for inspection/explicit retry. Earlier dropped or failed queue entries cannot be recovered by a later successful transport retry; the logger continues to report its failure.

Close stops logger producers immediately and starts the HTTP closeTimeoutMs deadline (default 15000) before queue draining. Direct transport close rejects new writes and attempts bounded final admission. Concurrent closes share completion, including rejection. A failed close marks transport closed and releases credential/timer resources; it does not claim delivery success. HttpTransport.abort() irreversibly cancels active fetch/wait and closes; unknown admission remains unknown. An application that wants cancellation of logger delivery can abort its HTTP transport, then observe logger close rejection. Stop application producers before graceful shutdown.

**Events buffered only in SDK memory may be lost if the application process terminates before the Gateway durably admits them.** There is no disk-backed pre-admission HTTP queue, background persistence, unlimited retry or CommonJS promise. Successful flush confirms durable Gateway admission, not immediate archive/query visibility. See [Node SDK](node-sdk.md) and [troubleshooting](troubleshooting.md).

Retry-After syntax follows [RFC 9110 section 10.2.3](https://www.rfc-editor.org/rfc/rfc9110.html#section-10.2.3).
