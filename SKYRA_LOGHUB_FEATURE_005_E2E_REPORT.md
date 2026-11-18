# FEATURE-005 — Same-event E2E evidence

Date: 2026-11-05. Local evidence directory: `.tmp/feature005-evidence`.

Final verified run: `feature005-4932f35e-72d0-4a66-8c22-848cda0e3e14`. Sanitized joined artifact: `acceptance-manifest.json`; final source/storage/test audit: `final-audit.json`. Full browser run: 56 leaf scenarios passed (57 with parent), zero failed/skipped. The same-event service test is one passing leaf; its assertions are not counted as separate business scenarios.

## Topology and sample

`examples/managed-ingestion/sample.mjs` → actual public Node SDK HttpTransport → managed FEATURE-004 credential → actual Gateway → fsynced WAL → opt-in ArchiveWriter publication/embedded retry worker → finalized canonical JSONL + real PostgreSQL archive catalog → actual JWT-authenticated Query Service/DuckDB → real session/CSRF Console BFF → existing Angular Log Explorer.

The first SDK batch crosses a harness fault proxy that drops the actual first Gateway response after receiving it. Its retry is still the SDK's unchanged batch; subsequent sample batches use the Gateway directly. No fake ingestion/query response substitutes for the required chain. Query runs development/JWT mode with explicit verified nonowner database configuration to select its real Prisma catalog. JSONL direct query is supported; Parquet is not claimed for these events.

Console authentication uses the existing controlled RS256/JWKS/code/S256 provider with mock exchange disabled. All services are loopback-only with random ports and process-local internal signing secrets. No real Entra setup.

## Continuity evidence

`continuity-in-progress.json` captures safe SDK canonical events, expected IDs, actual WAL IDs, actual archive IDs, Query IDs, recovery observations and measurements. `browser-continuity.json` records the same run ID, BFF IDs, UI drawer IDs, page count and zero missing/field mismatch assertions. The final sanitized acceptance manifest joins these after verifying they belong to the same run; it contains no bearer/session secrets.

| Scope / boundary | Expected verified count |
|---|---:|
| Primary SDK run: normal batch | 30 |
| Primary recovery batch | 5 |
| Primary accepted / WAL / finalized archive / Query / BFF / browser | 35 each |
| Foreign tenant SDK / finalized archive / its authorized Query | 5 each |
| Missing primary IDs / unexpected duplicate IDs / field mismatches | 0 / 0 / 0 |
| Primary UI cursor pages at 25 rows | 2 |

Counts are assertions over exact IDs, not approximate timestamps. Each of the 35 browser drawers renders raw canonical JSON compared against its original SDK event plus authoritative tenant enrichment. Timestamp, severity, message, service/environment, nested business attributes, Unicode, trace/span and labels are compared. Query and BFF responses are independently compared to the same SDK expectations. The foreign tenant has actual different data; forbidden scope requests are rejected.

Three application batches produce three primary-store WAL frames: two for the main tenant and one foreign. The first SDK network retry produces no additional frame. A separate owned WAL microbenchmark writes a copied payload outside the application's journal; it is not counted as another accepted application batch.

## Recovery and browser execution

- Real archive catalog INSERT failure after admission; successful WAL acknowledgement; exact grant restoration; actual Gateway/worker restart and publication recovery.
- Three incomplete trailing bytes injected into the stopped owned active journal; startup truncates only the incomplete tail and preserves valid frames.
- Actual malformed timestamp/schema and oversized body rejected with 422/422/413 and no WAL growth.
- Primary and foreign managed credentials revoked, followed by actual 401 responses.
- Browser selects the authoritative project, opens Log Explorer, searches by run ID/time range, traverses two cursor pages and checks all drawer JSON.
- BFF service/severity filters, event-detail API, cross-tenant denial; browser keyboard drawer navigation, empty results and simulated query-network failure followed by real retry.
- Existing signed-OIDC Organization, Members, Projects and Credentials browser scenarios run alongside this chain.

Relative time-window recomputation originally caused genuine cursor-fingerprint rejection. The facade now freezes time bounds across pages; server protection was retained. Direct navigation lacked authoritative bootstrap, and the Search wrapper's event name did not match its output; both compatibility defects were corrected. Resolved failures are retained in local diagnostic history where available; final logs define acceptance.

## Visual/accessibility evidence

`feature005-accessibility.json`: scoped WCAG-tag Axe scans for 1440/768/390 px, light and dark. Safe screenshots `feature005-explorer-<width>-<theme>.png` and `feature005-log-explorer.png` show actual run data. No revealed credential, HAR, trace or video is stored. Existing Platform tokens/public badge part and button API are used for narrow contrast/responsive fixes. These checks do not constitute full WCAG certification.

## Performance interpretation

Measured values are emitted in the current run's manifest: initial 30-event SDK submission duration, observed initial events/sec, approximate serialized event bytes, a real fsynced WAL append microbenchmark, Query HTTP latency and zero pending SDK events after flush. Submission duration includes an intentional lost-response retry/backoff and archive publication; it is not pure Gateway capacity. WAL microbenchmark is separate from network acknowledgement. Query visibility is proven by exact retrieval after catalog/recovery, not inferred from a success response.

No production scale/SLA claim is made. Environment: Windows, Node 24.14.0, pnpm 12.3.4, PostgreSQL 17.9; Query's local DuckDB and default resource limits. Detailed commands/counts and the final measured run are recorded in final acceptance/manifest.

Final run values: 510.32 ms for initial 30-event submission including intentional retry; 58.79 observed events/sec; 1,075.9 bytes/event average; 3.44 ms separate WAL fsync append benchmark; 155 ms first-SDK-event-to-archive-catalog registration; 161.34 ms Query HTTP response; 2,754.82 ms observed upper bound from final main catalog registration to completed query artifact, including service startup/assertions; zero queued events after flush. These are explicitly different measurement boundaries. All six scoped responsive/theme Axe results are zero violations.

## Reproduction

Use the existing provisioned, marker-verified disposable cluster/private runtime state; do not initialize/reset another database.

```powershell
node scripts/isolated-postgres.mjs start
pnpm --filter @skyra/logger-node build
pnpm --filter @skyra/ingestion-gateway build
pnpm --filter @skyra/query-service build
pnpm --filter @skyra/console-web build
# Existing Admin/BFF builds and compiled signed-provider helper must be available.
node --test tests/credentials/feature005-pipeline.test.mjs
node scripts/run-pipeline-e2e.mjs
```

The first test generates fresh fixtures/managed credentials and an owned archive; the second consumes precisely that run and executes full browser regressions. `SKYRA_PIPELINE_ONLY=true` is a focused diagnostic repeat, not additional independent business coverage. No protected configuration is used as fallback.
