# FEATURE-006 — Query and security

Date: 2026-11-06. Evidence: `.tmp/feature006-evidence/`.

## Search semantics

Search uses the existing `POST /query/v1/logs/search`, through authenticated `POST /bff/query/search`. `time_range` is required. Bounds are UTC **start inclusive, end exclusive**; invalid calendar dates, equal/reversed bounds and malformed timestamps are rejected. Relative ranges resolve once per search and remain fixed across pages. A new search or filter/page-size change resets pagination.

Values within severity/service/environment lists are ORed; filter categories, literal message text and trace ID are ANDed. Message search is a trimmed, case-insensitive literal substring, including Unicode; SQL-like text is data. Trace IDs are 32 lowercase hexadecimal characters (UI normalizes case). No SQL editor, regex execution or new DSL is introduced. Facets describe the authorized project/time window and can include values outside the currently selected categories.

The existing field/operator allowlist and prepared DuckDB parameters remain authoritative. Browser values cannot supply SQL identifiers, archive paths or SQL fragments. Service/environment filters prune discovery; time, tenant/project and compiled filters also constrain execution. Archive paths and manifests are verified before files are opened, with existing cross-tenant, containment and integrity security tests retained.

## Authorization and data handling

BFF requires a server-side session and CSRF protection. It resolves project/tenant scope from authoritative memberships and permissions, then validates the complete envelope before forwarding a scoped internal assertion. Scope authorization precedes full filter validation, preserving the existing denied-project 403 behavior. Browser selectors and provider role claims do not grant authority. Query verifies its assertion and authorized scope independently.

Search responses are `Cache-Control: no-store`; the BFF projects canonical event roots and the response envelope. Event IDs, timestamps, canonical ECS version, trace/span, service, severity and payload remain faithful to ingested events. The export uses only the successful displayed page and applied request, excludes the cursor, and checks the final JSON Blob against 5 MiB. It does not export BFF session/assertion metadata. Raw sensitive-looking queries are omitted from generated URL state. Normal application-log payloads remain subject to the existing SDK/ingestion data policy.

## Cursor and resource bounds

Existing signed cursors bind tenant, normalized query fingerprint, sort and keyset position. Altered, expired or mismatched cursors fail; they never broaden scope. Malformed request envelopes return 400; canonical cursor policy rejection uses the existing 422 contract. Default ordering is deterministic timestamp plus event identity; API supports ascending/descending timestamp order. Fixed archives give stable traversal; no global snapshot isolation is promised when new late archives become visible.

| Default bound | Value |
|---|---:|
| Result rows/page | 1–500; UI 25/50/100/200 |
| Time window | 30 days |
| Segments/query | 500 |
| Estimated scanned bytes | 524,288,000 |
| Query execution budget | 30 seconds |
| DuckDB memory / threads | 256 MiB / 2 |
| Cursor TTL | 24 hours |
| Message text / cursor length | 512 / 1,024 characters |
| Project/service/environment/level lists | 20 / 20 / 5 / 6 |
| Structured filters | 15, existing field/operator/type validation |

## Failures and verification

Missing/corrupt relevant catalog segments set additive partial-result statistics and a visible warning. Search failure clears displayed data/scope/metrics and allows Search retry. Upstream connection failure is a safe 502; upstream 5xx responses are normalized to a generic 503/504. Browser errors do not expose SQL, stack traces, credential verifiers or internal archive locations. Request correlation metadata remains available for diagnosis.

Real-service tests exercise literal SQL-like input, strict bounds, same-timestamp traversal, tampering, actual short-TTL expiry, tenant/project overrides, inactive memberships/project, logout, a temporarily unavailable owned archive and an actual Query stop/restart. Query's 211 tests and BFF's 103 tests pass, supplemented by the full browser and existing regression evidence. Protected configuration is unchanged; real Microsoft login remains an external configuration prerequisite, not a claim of this isolated acceptance.

Performance observations and exact result counts are recorded in [the E2E report](SKYRA_LOGHUB_FEATURE_006_E2E_REPORT.md). They describe a local 285-event cohort, not a production capacity or memory benchmark.
