# Public ingestion API

The operator supplies the Gateway base URL. The public route is **POST /ingest/v1/logs**, `Content-Type: application/json`, `Authorization: Bearer <managed credential>`. Console BFF/Admin routes are not public ingestion endpoints. Prefer the Node SDK to hand-building ECS events.

Canonical sources: [OpenAPI](../../contracts/ingestion/v1/openapi.yaml), [request](../../contracts/ingestion/v1/batch-request.schema.json), [response](../../contracts/ingestion/v1/batch-response.schema.json), [errors](../../contracts/ingestion/v1/error-response.schema.json), [event schema](../../contracts/schemas/v1/log-event.schema.json). OpenAPI server entries are examples, not proof of deployment. Runtime operator limits can differ from schema defaults; the portable default contract is at most500 events and5MiB request bytes.

Authoritative envelope fields: `protocol_version: "1.0"`, UUIDv4 `batch_id`, UTC `sent_at` ending Z, `batch_size` equal to array length, `events` nonempty array. Do not add unsupported envelope fields. Each event requires `@timestamp`, `ecs.version: "8.11.0"`, `event.id` UUIDv4, `log`, `message`, `service`, `skyra`. Use canonical nested field definitions from the schema; severity is trace/debug/info/warn/error/fatal. The SDK builds timestamp, identity, resource and structured metadata fields. Gateway derives tenant identity from the credential, not client claims.

HTTP200 body: `status: "durably_accepted"`, `batch_id`, `accepted_count`, `duplicate`, `receipt` with `receipt_id`, `journal_segment`, `journal_offset`, `committed_at`, `content_digest`. The whole batch is accepted or rejected; no207 partial success. Receipt identifies WAL admission, not Query visibility.

Retry the exact retained batch ID and payload. Identical replay yields duplicate200; a changed digest under the same receipt identity yields409 `IDEMPOTENCY_CONFLICT`. This is tested receipt deduplication/recovery, not an unconditional exactly-once guarantee across every storage failure. Credential rate limiting happens before admission, including retries.

| Status | Applicable codes / action |
|---|---|
|400|INVALID_JSON, UNSUPPORTED_PROTOCOL_VERSION; correct request|
|401|UNAUTHORIZED; missing/invalid/expired/revoked credential|
|403|PROJECT_ACCESS_DENIED, ENVIRONMENT_MISMATCH; verify permitted project/environment|
|409|IDEMPOTENCY_CONFLICT; inspect retained batch identity, never mutate a retry|
|413|BATCH_OVERSIZED, PAYLOAD_TOO_LARGE; reduce batch/body|
|422|SCHEMA_VALIDATION_FAILED, BATCH_EMPTY; correct event/envelope|
|429|RATE_LIMIT_EXCEEDED (Retry-After seconds) or PROJECT_QUOTA_EXCEEDED (hard budget; no blind retry)|
|503|STORAGE_NOT_READY, JOURNAL_UNAVAILABLE; retry identical batch within a bounded policy|

The canonical error envelope has `error.code`, `message`, `requestId`, `retryable`, optional validation `details`. Unexpected internal failures can produce500; clients must not expose raw bodies or assume a receipt. Consult [retry semantics](errors-and-retries.md). SDK default transport128 events/1MiB is deliberately below default Gateway batch/request limits; event-size SDK controls are not a separate promised Gateway per-event setting.

Optional canonical `correlation: {id: 'order-42'}` identifies an application workflow independently of trace/span. IDs are 1..128 ASCII characters matching `[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}`, case-sensitive; missing is supported, null/invalid is rejected by canonical validation. Gateway does not infer this field from arbitrary attributes. The SDK exposes it as LogContext.correlationId. [Search/export contract](../DEV-015-advanced-explorer.md).
