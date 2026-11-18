# Advanced Log Explorer contract (DEV-015)

This feature is implemented and tested on isolated development services. It does not activate protected development or configure a real identity provider.

## Activation and persistence

Apply the additive `docs/admin/migrations/DEV-015-001/migration.sql` only to an approved database using its normal migration owner, recording its SHA-256 in the migration ledger. Existing migrations are immutable. Admin alone receives SELECT/INSERT/UPDATE/DELETE on `saved_searches`; Gateway, Query and BFF receive no table access. BFF calls Admin through a signed, audience-bound internal assertion. There is no browser database access.

Enable Admin `SAVED_SEARCHES_ENABLED=true`, BFF `ADVANCED_EXPLORER_ENABLED=true` and Console runtime configuration `advancedExplorer:true` together after schema and approval checks. Defaults remain off. Matching-results exports and saved-search routes fail closed when disabled. Existing current-page export uses the authorized BFF endpoint even when advanced UI is disabled.

## Saved searches

BFF routes: `GET/POST /bff/projects/:projectId/saved-searches`, `GET/PUT/DELETE /bff/projects/:projectId/saved-searches/:id`. Tenant and immutable owner are derived from the verified session and Admin principal. Client scope/owner overrides are rejected. GET lists 20 by default, at most 50, with an opaque UUID `after` keyset and `nextCursor`.

Create/update body: `{name,description,visibility,filters}`. Names are trimmed, 1..120 characters; descriptions at most 500. Visibility is `PRIVATE` or `PROJECT`. Versioned filters allow only `v:1`, `range`, `queryText`, `levels`, `services`, `environments`, `traceId`, `correlationId`, with an 8 KiB serialized bound. No SQL, arbitrary AST, credentials, tenant IDs or project overrides are persisted. Relative ranges are `{kind:'relative',preset:'15m'|'1h'|'6h'|'24h'|'7d'}` and resolve when applied. Absolute ranges are `{kind:'absolute',start,end}` with validated UTC instants and at most seven days.

Active organization membership, current project access and `logs.search` are required for every operation. A private search is readable/editable only by its creator, including against another organization administrator. Shared project searches are readable with project log access; shared create/update/delete additionally require `projects.update`. Only the creator may change sharing, and shared transitions also require `projects.update`. A departed creator's shared search remains manageable by current project managers; their private search remains inaccessible. Inactive projects deny access. Permissions are checked from current server state.

Responses include `version` such as `"s1"`, `owned`, `canEdit`; update/delete require that exact `If-Match`. Missing versions return 428, stale versions 409. Row locks and transactional version increments prevent silent lost updates. A duplicate owner/name in the same project returns 409. Creation is serialized per project and denied when the creator already sees 200 searches; this is a creation guard, not a global aggregate count guarantee across all owners. Lists remain bounded.

Private changes do not appear in tenant-wide audit history because search text can be sensitive. Shared create/update/delete emits an append-only administrative audit in the same transaction. Its metadata contains project, version, actor and resource identifiers, never the name, description or filters. Audit failure rolls back the shared mutation.

## Canonical correlation IDs

The optional event field is `correlation: {id: string}`. IDs contain 1..128 ASCII characters matching `[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}`. They are case-sensitive application workflow IDs. They are independent of trace/span IDs and are never inferred from nested business attributes. Missing is supported; null/empty/malformed values are invalid.

The Node SDK exposes `LogContext.correlationId`. Gateway canonical validation, WAL identity, archive records and Query projections preserve it. Historical events remain unchanged. Parquet caches already retain the complete canonical JSON; the field catalog extracts `correlation.id` from that JSON, so no historical cache rewrite or new physical column is needed. Supported structured operators are eq/in/exists; direct search uses `correlation_id` and exact matching. Signed cursor fingerprints bind the correlation filter while preserving preexisting fingerprints when it is absent.

The Console URL uses `correlation`, and saved filters use `correlationId`. Project and authorization scope are always resolved independently. The detail drawer can display/copy the correlation value and use it as a filter.

## Export protocol and limits

`POST /bff/query/export` requires a current authenticated session, CSRF header and authorized project. Body: `{format:'json'|'csv',scope:'page'|'matching',search,eventIds?}`. The single project's time range and filters are fixed for the traversal. Matching scope rejects a supplied cursor and starts at page one. Page scope honors the displayed page request; optional ordered `eventIds` must match the refreshed page or return 409.

Matching traversal is bounded to 1,000 events, 10 pages of 100, 5 MiB uncompressed response bytes and 15 seconds, including download completion. Page scope permits the existing page size up to 500. Request options are capped at 32 KiB, query filters at 8 KiB, each upstream response at 6 MiB. Two active exports per BFF instance, one per session; slots are held until response finish/close and pending authority work settle. This is an in-process bound, not a cluster-wide distributed limiter.

The BFF buffers within these bounds before sending file headers. It reauthenticates and checks current project authority before each page and immediately before sending. Disconnect/deadline aborts upstream fetch. Late Query failure, unavailable archives, malformed scope/events, cursor failure or mid-export revocation produces an error and no apparently complete partial download. There is no export job persisted across BFF restart. Once bytes are delivered, revocation cannot retract them.

JSON contains `scope`, `filters`, `metadata`, `events`. CSV has quoted timestamp,event_id,level,message,service,environment,trace_id,correlation_id,canonical_json columns. `canonical_json` preserves full structured fields. Formula-leading cells, including after whitespace/control/format characters, receive an apostrophe for spreadsheet safety. JSON and embedded canonical JSON retain original messages; CSV display cells are deliberately neutralized.

Metadata reports count, pages, complete/truncated, reason and `bounded-keyset-traversal` consistency. X-Export headers carry equivalent CSV metadata and are exposed through BFF CORS. Truncated files contain `-truncated` in a constant filename, and the Console warns explicitly. Byte truncation occurs at an event boundary, leaving valid JSON/CSV. Time expiry and unavailable archives fail rather than masquerading as complete files. Duplicate event IDs are de-duplicated; conflicting content for an ID fails.

This is a bounded traversal of a changing dataset, not a global snapshot. Events arriving ahead of a descending cursor may not appear in that export; later searches can see them. No unbounded browser accumulation or full-history promise exists. The UI offers separate current-page/matching scope, JSON/CSV, cancellation and explicit error/truncation messages.

## Reproducible validation

Use only the manifest-owned disposable PostgreSQL cluster. `node scripts/prepare-saved-search-tests.mjs` verifies migration identity, physical target, constraints, indexes and restricted grants. Test entry points are `tests/advanced-explorer/contracts.test.mjs`, `saved-searches.test.mjs`, `export-faults.test.mjs` and the actual SDK/browser journey orchestrated by `node scripts/run-advanced-explorer.mjs browser`. The fault peer is labeled synthetic; actual same-event acceptance uses the real Gateway, archive and Query service. Regression modes are `sdk`, `sessions` and `regressions`. Session/storage restart suites must run sequentially against the owned cluster.
