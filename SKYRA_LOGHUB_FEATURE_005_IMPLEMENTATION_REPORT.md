# FEATURE-005 — Implementation

Date: 2026-11-05. Continued the existing SDK draft; no FEATURE-005A or replacement architecture.

## Inventory and verified integration gaps

| Component | Reused implementation | Gap / resulting change |
|---|---|---|
| Node SDK | Canonical event builder, sanitizer/redactor, bounded write queue, transport interface, flush/close | Completed/exported HttpTransport and optional transport injection in public factory; real sample uses this API |
| Gateway | FEATURE-004 verifier authentication, project admission, strict validation, rate limits and receipts | Opt-in queryable publication after WAL commit; existing admission/credential policy unchanged |
| WAL | CRC32C/SHA-256 frames, synchronous fsync, receipts, recovery, ownership and rotation | Integrity-checked publication reader for retained active/rotated files; no new WAL format |
| Archive | Existing ArchiveWriterService, partition conventions and Prisma archive repository | Deterministic batch publication, atomic finalized file/manifest publication, authoritative tenant enrichment, catalog registration and retry worker |
| Query | Real Prisma discovery, manifest checks, DuckDB JSONL reader, signed authorization and row isolation | No Query Service source change or mock repository; actual JWT mode and nonowner database runtime used |
| BFF | Signed OIDC/code/PKCE, opaque sessions, CSRF, membership refresh, query assertions/proxy | No BFF production source change; same-event search, filters and detail retrieval exercised |
| Angular | Existing Log Explorer, facade, filters, cursor history, table/drawer and Platform components | Session/workspace bootstrap on direct navigation; freeze relative bounds across cursor pages; correct Search button event; narrow responsive/contrast corrections |

## SDK and sample

Public API: `createSkyraLogger(config, new HttpTransport({endpoint,credential}))`. Existing one-argument usage remains valid. HttpTransport is exported from the public package and transports entry point. Credentials remain private transport fields, never status/output/URL; credential-bearing events are refused. HTTPS is required except loopback HTTP; redirects and URL userinfo/query/fragment are rejected.

Default bounds: 128 events/batch, 1 MiB transport buffer, 5-second timeout and three attempts (configurable within bounded limits). Full event batches drain automatically; explicit flush sends the remainder. Retries reuse identical serialized bytes, batch UUID, sent_at and event IDs. 408/429/5xx/network failures have bounded exponential backoff; 401/403 stop automatic retry. Failed acknowledgement retains the batch for explicit retry. Invalid/buffer-rejected writes cannot later produce a successful flush. Queueing is memory-only; inherited SDK queue/drop/onError policy still applies before durable admission. There is no synchronous remote emergency-delivery guarantee.

`examples/managed-ingestion/sample.mjs` uses the public SDK for DEBUG/INFO/WARN/ERROR/FATAL, unique event IDs, UTC timestamps, structured business attributes, Unicode, long valid messages, trace/span IDs and run labels. A transport observer captures the SDK's canonical output without replacing delivery. No secret is written by the sample. Acceptance uses 30 normal events, five recovery events and five events in a second tenant. The same main-run 35 events reach the browser.

## Publication and compatibility

`INGESTION_PUBLISH_ARCHIVES=true` explicitly opts the local Gateway into publication; WAL_DIRECTORY and ARCHIVE_ROOT must also be explicit for its worker. Default activation and protected configuration remain unchanged. The new branch calls the existing archive service; it does not claim the legacy pending append is queryable.

Each committed batch is grouped by canonical tenant/project/environment/service/date partition. Files use deterministic `batch-<uuid>.jsonl` names. Temporary writes are fsynced before rename; checksum/size/timestamp metadata and a manifest precede database catalog visibility. Retries validate existing bytes and catalog identity. Publication serializes within ArchiveWriterService; the embedded worker scans retained WAL and retries catalog/publication failures on startup and periodically. WAL is not deleted or compacted by this feature.

The WAL payload retains SDK canonical fields and digest; its frame header supplies authenticated tenant identity. Archive publication adds/overrides `skyra.tenant_id` from that header. Query already requires that field for its defense-in-depth row filter; its absence was the demonstrated visibility gap. Project scope is checked by existing Gateway admission. No incompatible event/batch format or new migration was introduced.

Delivery is not described as exactly once. Tested deduplication applies to an unchanged batch UUID/content in the existing retention contract. Publication is deterministic per batch/partition; separate batches can legitimately contain repeated event IDs. WAL acknowledgement does not promise that an archive is already visible.

## Browser corrections

Direct `/logs` navigation now uses existing session bootstrap and loads authoritative workspace state before search. Cursor paging retains the original resolved time interval; explicit search refreshes it. Query's cursor fingerprint protection was retained—the client was corrected. Search/Cancel now use the installed Platform button's actual click API instead of an unmatched wrapper output. Existing public badge part/theme tokens address reproduced contrast issues; mobile input flex sizing avoids an oversized toolbar. No Explorer redesign, copied Platform source, package replacement or new UI framework.

## File inventory

- SDK: `packages/logger-node/src/transports/http.transport.ts`, `transports/index.ts`, `logger.ts`; `tests/http-transport.test.ts`.
- Gateway: `storage/archive/wal-publisher.ts`, `wal-publication.service.ts`, `archive-writer.service.ts`, `storage.module.ts`, `storage/wal/wal-journal.service.ts`, `ingestion/ingestion.service.ts`.
- Angular: `app.routes.ts`; existing Log Explorer component TS/CSS, facade and search-toolbar TS/HTML/CSS; facade regression test.
- Sample/harness: `examples/managed-ingestion/sample.mjs`; `tests/credentials/feature005-{pipeline.test,query-stack,ambiguous-proxy,browser}.mjs`; existing Gateway stack idempotent signal-stop fix; existing organization browser harness extended with a pipeline mode; `scripts/run-pipeline-e2e.mjs`.
- Safety/documentation: protected snapshot label extended to FEATURE-005; these four FEATURE-005 reports. No old migration/report rewrite, dependency installation, protected activation or FEATURE-006.
