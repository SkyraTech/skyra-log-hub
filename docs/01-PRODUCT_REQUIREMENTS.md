# Product Requirements Document (PRD)

> **Product:** Skyra LogHub  |  **Status:** Proposed baseline — review before implementation  |  **Version:** 0.1-draft  |  **Date:** 2026-10-21
> **Repository:** `skyra-loghub` (renamed by project owner). Assumptions and undecided items are marked **TBD**. These documents are design specifications, not assertions that code already exists.

## 1. Product overview
Skyra LogHub is Skyra Tech's internal, custom-built centralized logs, performance diagnostics and security-audit exploration platform. It ingests logs produced by reusable SDKs and hosted-file collectors, indexes them in Elasticsearch, and exposes a **custom Angular dashboard** and secure NestJS API. **Kibana is not part of the product.** One `skyra-loghub` monorepo holds applications, language SDKs, collector configuration, tests and operations documentation.

## 2. Problem statement
Skyra applications currently use inconsistent text logs, `console.*`, NestJS default output and Python Loguru; there is no unified event schema, project boundary, safe redaction, correlation, performance visibility, consistent file rotation or cross-application explorer. Existing business audit storage must not be silently replaced by ephemeral diagnostic logs.

## 3. Goals and measures
| Goal | Acceptance measure (MVP) |
|---|---|
| Reusable instrumentation | Pilot NestJS and Python services independently install packages; schema-valid logs produced |
| Isolated host files | Per-project/environment/service/instance UTC daily `.jsonl` files, size rollover and tested retention |
| Central ingestion | Agent-driven file collection plus authenticated optional direct export; errors do not block application requests |
| Custom discovery | Authorized project selector, time range, field list, filter/query, histogram, table and JSON details |
| Operational insight | API duration, DB operation duration, slow events, exceptions, job durations with trace correlation |
| Secure internal access | OIDC with MFA, server-side project RBAC, expiring scoped machine tokens, audit trail |
| Extensibility | MCP read-only tools; deployable on VM or container platform on AWS/Azure/on-prem |

## 4. Users and personas
- **Platform administrator:** governs project registration, retention, identity integration, roles, ingestion, tokens, audit and alerts.
- **Project administrator:** manages assigned project's monitoring configuration and developer membership.
- **Developer:** searches authorized logs, compares performance, inspects traces and saved searches.
- **Read-only viewer:** sees authorized sanitized operational data.
- **Automation/MCP client:** accesses only permissions explicitly granted to its identity.

## 5. Scope and features
### MVP / P0
- Project registry and service/environment identifiers; agent and SDK integration examples.
- Log Explorer: project/environment/service selection, time window, sortable result columns, discoverable available fields, saved query definitions, bounded search, histogram, details drawer, permitted copy/export.
- Basic structured search and advanced **safe subset** query mode. Full arbitrary ES|QL is **not** an MVP promise; see `10-API_CONTRACTS.md`.
- Node/TypeScript + Python SDKs with JSONL, redaction, size/day rotation, error handling, structured context and graceful failure.
- Collector → Elasticsearch; schema validation; project isolation; retention configuration.
- Authentication through OIDC/MFA; RBAC; scoped, expiring, revocable tokens; audit log; distributed rate limits.
- API and SQL client-observed latency events; errors, jobs and request correlation.
- Unit, integration, security, and UI E2E tests with representative sample services.

### P1
- NestJS/Next.js/framework adapters; frontend sanitized error reporting; alert rules and notifications; richer API metrics and SQL fingerprint investigation; dashboards; MCP read-only OAuth integration; export jobs.
### P2 / deferred
- Full trace waterfall with dedicated trace ingest/storage, advanced SLOs, AI summaries, customer multi-tenancy, ingestion replay UI, long-term archival and complex ES|QL authoring.

## 6. User journeys
1. Admin enrolls project and service, assigns an identity, configures approved ingest method and retention.
2. Developer installs language SDK; production service writes safe project-separated JSONL or stdout logs.
3. Collector follows new files or secure exporter sends batches; pipeline validates, enriches, indexes; failures surface in operational health.
4. Developer signs in with MFA, selects a project and time window, queries available fields and opens correlated events.
5. Admin creates a scope-limited integration credential, chooses expiry, inspects use, rotates/revokes it.
6. Authorized MCP client searches only assigned project logs, with audit and query limits.

## 7. Detailed functional requirements
| ID | Requirement | Priority |
|---|---|---|
| FR-01 | Project CRUD, immutable internal project IDs and membership | P0 |
| FR-02 | Search must enforce identity/project/environment authorization | P0 |
| FR-03 | UTC histogram interval auto/manual; result count and search execution time | P0 |
| FR-04 | Field explorer from authorized mapped fields with search/type labels and selected columns | P0 |
| FR-05 | Expand record: structured sanitized JSON, trace IDs and event metadata | P0 |
| FR-06 | API request and DB operation timers; slow thresholds configurable per service | P0 |
| FR-07 | Daily UTC rotation and safe size rollover, per host/instance separation | P0 |
| FR-08 | Source redaction + ingestion redaction, duplicate JSON key rejection | P0 |
| FR-09 | Create/revoke/rotate expiring project-scoped credentials | P0 |
| FR-10 | Save personal/project-shared queries (permission governed) | P1 |
| FR-11 | Read-only MCP project health/log/trace/error tools | P1 |
| FR-12 | Alerts on error-rate and latency thresholds | P1 |

## 8. Nonfunctional requirements and preliminary targets
- **Security:** TLS, least privilege, admin MFA, no browser Elasticsearch credentials, rate limits, audit actions, safely escaped log rendering.
- **Reliability:** logging failures never crash/slow app materially; bounded async buffers; observable dropped-event counters; recover after collector interruption.
- **Performance:** initial target p95 interactive search under 3s for 24h windows on pilot volume; validate in representative load tests, not guaranteed.
- **Scale:** prioritize correctness for ~5–20 services; actual capacity based on daily ingest, peak EPS, retention and source cardinality (**TBD**).
- **Portability:** Linux container images, externalized config, portable storage/backup strategy across AWS/Azure/on-prem.
- **Availability:** single-node pilot is explicitly non-HA; production SLO/HA topology **TBD**.
- **Accessibility:** keyboard-friendly workflows and WCAG 2.2 AA target for UI screens.

## 9. Out of scope and boundaries
- Do not duplicate Kibana UI or require Kibana.
- Do not expose Elasticsearch or query DSL to browsers/MCP clients.
- Do not log raw request/response bodies, credentials, personal data, raw SQL bind values or AI prompts by default.
- No automatic rewriting of current Skyra projects until SDK acceptance and pilot approval.
- No promise of guaranteed delivery in process crashes before persistence; explicitly report loss behavior.

## 10. Product acceptance gates
- All MVP features mapped to task IDs; architecture/security sign-off; two language pilot services; per-project isolation tests; query permissions; token expiry/revocation; sanitized ingestion; search E2E; restore drill; no critical defects.
- UX review compares feature coverage (query editor, fields, histogram, results) with reference Elastic Discover screenshots, **not pixel-level copying**.

## 11. Open decisions
Identity provider; expected daily GB/EPS, retention by classification, geography/data residency, hosting choice, license review, team capacity, initial pilot repositories and naming scheme for immutable project IDs.
