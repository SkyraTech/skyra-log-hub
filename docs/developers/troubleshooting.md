# Troubleshooting

| Symptom | Check |
|---|---|
|Missing configuration|Set all three SKYRA environment variables in the server process. `.env` requires explicit loading.|
|Invalid credential constructor error|Obtain a managed key through authorized Console handoff; never fabricate one.|
|401 / replaced or revoked key|Review metadata/expiry and securely configure a replacement; old secrets cannot be recovered.|
|403 / wrong project|Use the credential's project code and permitted environment; ask an administrator for access.|
|422|Validate required fields, UTC timestamps, supported severity and nested attributes against the canonical schema.|
|413|Reduce batch events and serialized bytes. Defaults:500 events/5MiB Gateway,128 events/1MiB SDK buffer.|
|Gateway unavailable / timeout|Confirm operator-provided endpoint and TLS; retry retained bytes within a bounded budget. Do not print fetch causes or headers.|
|Lost acknowledgement / duplicate200|The original batch may already be durable. Retrying the retained batch is safe within the receipt contract.|
|409 receipt conflict|Do not reuse a batch ID with altered events; inspect application batching and preserve original identity.|
|Credential rate limit|Honor Gateway Retry-After in an application policy where needed; SDK automatic waits are short and bounded.|
|Daily events/bytes quota|Check project Usage, including pending reservations and UTC reset; request an authorized policy change. Hard quota halts automatic retry.|
|Pending SDK batch / full queue|Stop producers; inspect drop counts, resolve delivery and explicitly flush. No process-restart persistence is promised.|
|Admitted but not searchable|Wait for finalized archive publication, then refresh. Verify project, occurrence-time range, message/run ID, service and environment filters.|
|Explorer denied|Query access is separate from ingestion permission; ask for appropriate project access.|
|No events before process exit|Await flush and close, inspect drop counters; avoid immediate process.exit().|

Never bypass authentication, quotas, target isolation or runtime privileges to troubleshoot. [Quick start](getting-started.md).


## Retry and shutdown diagnosis

Use safe IngestionError.code/httpStatus/attempt/outcome and the batchId correlation reference. UNAUTHORIZED/401 means check or replace a revoked/invalid credential; PROJECT_ACCESS_DENIED/403 means check project activity and credential scope. ENVIRONMENT_MISMATCH means align logger service environment with the credential allowance. PROJECT_QUOTA_EXCEEDED needs an authorized policy/reset decision, not an infinite retry loop. RATE_LIMIT_EXCEEDED honors Retry-After while budget permits. RETRY_BUDGET_EXHAUSTED may leave admission unknown; retain the same transport batch, never fabricate new event IDs to retry it. SDK_ABORTED or SDK_CLOSED requires inspecting whether final admission was confirmed before shutdown.

BUFFER_FULL/EVENT_TOO_LARGE requires reducing production rate or event size and checking onDrop/pending counters. A failed queue entry can never be repaired by declaring a later flush successful. Missing events after successful admission can reflect archive publication/query delay, incorrect time range, service/environment filters or Explorer permission. Memory-only events are lost on process termination before admission. Never print credentials, raw backend bodies or whole log payloads while diagnosing.
