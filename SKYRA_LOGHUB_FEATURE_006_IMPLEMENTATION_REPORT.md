# FEATURE-006 — Log Explorer implementation

Date: 2026-11-06. Scope: isolated local implementation; no deployment or FEATURE-007.

## Existing architecture and gaps

The working FEATURE-005 public Node SDK, managed credentials, durable Gateway WAL, finalized JSONL publication/catalog, Prisma/DuckDB Query Service, signed-OIDC BFF session and Angular Explorer were reused. Existing Query filters, keyset pagination, permission resolution, facets, event endpoint, table and drawer were retained. Ingestion was not redesigned.

| Initial gap | Delivered change |
|---|---|
| Custom range had no editable controls and silently fell back on invalid input | Millisecond UTC controls; ordered, valid calendar bounds; actionable validation |
| Canonical trace filter lacked a complete investigation workflow | Trace input, chip, URL restoration, copy and Investigate trace action |
| Environment/page/project filter state was incomplete on refresh | Allowlisted URL state, authoritative project restoration, page-size reset |
| Relative bounds changed while paging | Existing FEATURE-005 frozen interval retained and regression verified |
| Detail keyboard focus and stale requests needed stronger handling | Composed-tree Tab containment, inert background, focus return, canceled stale detail requests |
| Search failure could leave misleading data/metrics/export state | Clear failed results and scope; safe error, Search retry, disabled paging |
| Missing archive segments could look like a complete search | Additive partial-result statistics and visible recovery warning |
| No bounded export | Current displayed authorized page as JSON, maximum 500 events / 5 MiB |
| Shared URLs polluted breadcrumbs; table time was implicitly local | Path-only breadcrumbs and explicitly labeled UTC table timestamps |

## Changes and compatibility

`apps/console-web/src/app/features/log-explorer/` contains the feature state, toolbar, facets, status and detail changes. Shared log-table formatting, authoritative workspace handling, API types and breadcrumbs received focused integration fixes. `apps/console-bff/src/modules/query-proxy/api/` validates the canonical search envelope, preserves authorization precedence, prevents caching, projects canonical response fields and returns safe upstream errors. Query planner/mapper/DTO and `contracts/query/v1/search-response.schema.json` add only optional `partial_results` / `unavailable_segments` statistics; normal successful response shapes remain compatible.

All filters execute in Query; Angular does not simulate search results. Source organizations, memberships, roles, projects, ingestion schemas and seven applied migrations remain intact. No migration is required.

## Platform and accessibility

Installed immutable Skyra Platform input, button, badge, tabs, drawer, notification, loader/skeleton and shell packages are reused alongside the existing Angular feature compositions. UTC date controls are labeled native inputs. Feature-scoped public CSS variables correct dark-theme text and selected-state contrast; no Platform archive or sibling repository was modified. The offline production build retains script/style optimization and disables only remote font inlining.

## Optional scope decisions

- **Delivered:** canonical `trace.id` investigation and bounded current-page JSON export, with successful applied filters and server scope. CSV is not emitted.
- **Deferred:** persistent saved searches/views and a new query DSL; these require storage/language scope beyond this feature. Existing literal substring search is explicit.
- **Unsupported canonical field:** event correlation ID. Request correlation IDs remain diagnostic metadata and are not presented as an event search filter.

## Evidence and reproduction

Final results are in [the acceptance report](SKYRA_LOGHUB_FEATURE_006_FINAL_ACCEPTANCE.md), [E2E report](SKYRA_LOGHUB_FEATURE_006_E2E_REPORT.md), and [security report](SKYRA_LOGHUB_FEATURE_006_QUERY_SECURITY.md). Local evidence is retained in `.tmp/feature006-evidence/`; earlier feature evidence is preserved.

Use installed binaries: build Query/BFF with their local `tsc`; build Console with `ng build --configuration production,offline`. With the provisioner-owned disposable cluster verified and running, set `SKYRA_EXPLORER_E2E=true`, run `node --test tests/credentials/feature005-pipeline.test.mjs`, then `node scripts/run-explorer-e2e.mjs`. Run `node scripts/run-explorer-regressions.mjs` separately. These runners verify the isolated target; never substitute a protected database URL.
