# Node SDK public contract

Package: `@skyra/logger-node` 1.0.0; dependency `@skyra/logger-core` 1.0.0. Use Node 22+ and ESM. CommonJS consumption is not a supported instruction. Build the two local tarballs using [quick start](getting-started.md); do not assume an npm release exists. The packaging script compiles declarations and stages the Node dependency as a versioned package instead of `workspace:*`.

Public entry points are `.`, `./config` and `./transports`. The root exports `createSkyraLogger`, `SkyraLogger`, `HttpTransport`, configuration/event-builder/formatter exports, the existing stdout/file transports and existing path/recovery/ownership APIs. Beginner integration needs only the factory and HTTP transport. Source: [exports](../../packages/logger-node/src/index.ts), [manifest](../../packages/logger-node/package.json).

`createSkyraLogger(config: SkyraLoggerConfig, transport?: SkyraTransport): SkyraLogger` requires `projectId`, `serviceName`, `environment`, `instanceId`. Environments: production, staging, development, test, local. Set `validationMode: 'strict'` for canonical validation. Optional settings include level (default info), serviceVersion, nodeName, additionalSensitiveKeys, limits, onError, onDrop and clock; see [configuration declarations](../../packages/logger-node/src/config.ts). The default transport is stdout: remote delivery requires explicitly passing `new HttpTransport(...)`.

Logging methods `trace/debug/info/warn/error/fatal(message: string, metadata?: LogContext): void` enqueue synchronously. `log(level,message,metadata)`, `isLevelEnabled(level)`, `setLevel(level)`, `child(context)`, `getStatus()`, `flush(): Promise<void>` and `close(): Promise<void>` are available. Child loggers share transport/queue ownership; close the owning logger once at application shutdown.

`LogContext` supports component, correlationId (an independent application workflow ID), traceId (32 lowercase hex), spanId (16 lowercase hex), labels (`Record<string,string>`), tags, action, outcome, category, durationMs/durationNs, error and structured attributes. For nested domain data use `{attributes:{order:{id:42}}}`. SDK assigns canonical UTC timestamps and random UUIDv4 event IDs. See [event builder](../../packages/logger-node/src/event-builder.ts) and [canonical schema](../../contracts/schemas/v1/log-event.schema.json).

`HttpTransportOptions`: required `endpoint` and `credential`; maxBatchEvents default128 (1..1000), maxBufferBytes default1MiB (1KiB..4MiB), timeoutMs default5000 (100..60000), maxAttempts default3 (1..5). Gateway default batch maximum is500, so stay at128 unless the operator confirms another limit. Endpoint must end exactly in `/ingest/v1/logs`, contain no userinfo/query/fragment, and use HTTPS except localhost/loopback HTTP. The credential is retained privately in memory and cleared after transport close (including failure) or abort. Redirects are refused.

The logger has a bounded background queue (default10000 pending events/64MiB); transport buffering is separately bounded. Full transport or pending failed batches can reject new writes. No HTTP periodic timer is provided: explicitly flush. Check `getStatus().totalEventsDropped` and sanitize onError/onDrop handlers. Logging methods are not delivery acknowledgements. Default event byte cap is1MiB, message cap8192 characters; SDK sanitization can truncate or omit oversized data. The Gateway validates the full batch independently.

`flush()` drains the queue then submits transport data; rejection retains the HTTP batch for explicit retry with identical bytes and identity. `close()` attempts flush and disallows subsequent logger writes; do not call `close()` before deciding whether to retry a failed flush. No synchronous HTTP emergency delivery exists. Do not use immediate `process.exit()` before asynchronous shutdown. In a long-running server, stop accepting application requests, await flush/close within your shutdown budget, and report failure without printing configuration. Memory buffers are lost on process termination; use an approved durable transport when restart persistence is required. [Retries](errors-and-retries.md).


## Reliability options

HttpTransport accepts optional retryBudgetMs, retryBaseDelayMs, retryMaxDelayMs, retryJitter, closeTimeoutMs and onDiagnostic, in addition to existing endpoint/credential/batch/buffer/timeout/attempt options. Existing calls remain valid. IngestionError and HttpDiagnostic are public exports. See [retry and shutdown semantics](errors-and-retries.md) for exact limits, terminal status policy and retained unknown outcomes.

Runtime acceptance uses actual Node 22 and Node 24 ESM execution; other versions admitted by package engines are not independently certified. Both packages remain local artifacts and are not published. The existing file transport is a separate explicitly selected transport; HTTP does not write a durable disk queue.

## Application correlation

Pass `{correlationId: 'order-42'}` as LogContext to emit canonical `correlation.id`. The optional ID is case-sensitive, 1..128 ASCII characters matching `[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}`. It is independent of traceId and is not extracted from nested attributes. Invalid values reject that event and increment the logger drop count; observe sanitized onDrop/getStatus diagnostics. Older callers and events without it remain supported. Do not place credentials or personal data in correlation IDs. [Explorer and export contract](../DEV-015-advanced-explorer.md).
