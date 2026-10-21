# Architecture Decision Records (ADR Index)

> **Product:** Skyra LogHub  |  **Status:** Proposed baseline — review before implementation  |  **Version:** 0.1-draft  |  **Date:** 2026-10-21
> **Repository:** `skyra-loghub` (renamed by project owner). Assumptions and undecided items are marked **TBD**. These documents are design specifications, not assertions that code already exists.

## How to use this log
Each ADR is a *proposal* until the owner approves it. Record context, alternatives, trade-offs, consequences, approver/date and migration strategy. Supersede rather than deleting previous decisions.

## ADR index
| ADR | Decision | Status |
|---|---|---|
| ADR-001 | One `skyra-loghub` monorepo, independently deployable apps/SDKs | Proposed |
| ADR-002 | Angular SPA + NestJS APIs; Skyra Platform UI | Proposed |
| ADR-003 | File-first JSONL + Parquet + DuckDB evaluation; no Kibana | Proposed |
| ADR-004 | PostgreSQL management DB and Valkey/Redis for transient controls | Proposed |
| ADR-005 | ECS-compatible canonical schema owned/versioned via `skyra-service-contracts` | Proposed |
| ADR-006 | JSONL file agent + optional secure direct export | Proposed |
| ADR-007 | Human OIDC/MFA; machine scoped opaque tokens; MCP standards-based OAuth | Proposed |
| ADR-008 | Hosted containers portable to AWS, Azure, dedicated server | Proposed |
| ADR-009 | Read-only MCP tools initially | Proposed |
| ADR-010 | Safe visual filter AST first; advanced query subset before full Skyra Query Language | Proposed |

## ADR-001 — Monorepo and repo boundaries
**Context:** All operational apps, SDKs, UI and MCP must be coordinated and documented. Existing Skyra Platform focuses on Web Components and cannot own Python/server runtime distribution cleanly. **Decision:** Keep all LogHub-related code under renamed `skyra-loghub`; continue consuming Skyra Platform packages and authoritative service contracts by version. **Consequence:** Multi-language CI orchestration required; publish SDKs independently. **Alternative:** separate `skyra-logging` repo (less toolchain coupling, more coordination).

## ADR-002 — Dashboard
**Decision:** Angular SPA + NestJS API, original Skyra design with reusable Skyra Platform Web Components. **Rationale:** Internal developer-heavy filters and long-running administration UI. **Trade-off:** Must maintain typed API boundary; Angular package compatibility needs verification. **Alternative:** Next.js + NestJS.

## ADR-003 — Search backend
**Status:** Superseded by proposed ADR-011. Original Elasticsearch proposal is not the active candidate; evaluation now favors central JSONL plus derived Parquet/DuckDB, pending benchmarks.

## ADR-004 — Metadata and transient processing
**Decision:** PostgreSQL + Prisma; Valkey/Redis for rates/cache/queues when compatibility established. **Trade-off:** Extra services and backup runbooks. **Alternative:** DB-only throttling or different queue; reevaluate at measured scale.

## ADR-005 — Schema
**Decision:** ECS-aligned canonical JSON Schema, Skyra extensions under `skyra`, shared contracts pinned to version. **Consequences:** Cross-runtime schema conformance CI and breaking-change discipline. **Alternative:** ad hoc SDK fields rejected.

## ADR-006 — Transport
**Decision:** Project/environment/service/instance-separated daily UTC JSONL where persistent disk available; collector follow/checkpoints. Optional async remote export with service authentication and bounded buffers; stdout for ephemeral/serverless. **Trade-off:** file system operations/agent deployment vs direct path cost; duplicates possible under retry.

## ADR-007 — Access and tokens
**Decision:** Employees OIDC+MFA+session; opaque expiring/scoped machine credentials in supported internal API; OAuth verified for remote MCP. **Consequences:** revocation, authorization and audit systems are P0 infrastructure. **Alternative:** static permanent shared key rejected.

## ADR-008 — Hosting
**Decision:** Docker images/config portability, provider independent core. **Trade-off:** Operating ES/PG and backups in self-host mode; HA requires additional design. **Alternative:** provider-exclusive managed stack deferred.

## ADR-009 — MCP
**Decision:** Separate read-only MCP server using LogHub API; limit results, audit and filter prompt injection. **Alternative:** direct ES tool rejected due to privilege/data exfiltration risk.

## ADR-010 — Queries
**Decision:** Parse safe query AST, fixed auth scope, bounded execution, allowlisted fields. **Trade-off:** cannot promise arbitrary Skyra Query Language parity with prior screenshots at MVP. **Alternative:** passthrough Skyra Query Language rejected pending security design.

## Approval process
Add for each ADR `Status: Accepted`, `Approved by`, `Date`, `Evidence`, `Implementation references`, `Rollback/migration` after validation. No proposal here alone authorizes code changes or deployment.

## Pending cross-cutting decisions
Identity provider, exact design token palette, regulatory retention requirements, volume/price budget, HA/RPO/RTO, registry and release namespace, traces storage, audit tamper-evidence, Parquet partition/catalog architecture and MCP client interoperability.


## ADR-011 — Centralized file-first analytical engine (new proposal, 2026-10-21)
**Status:** PROPOSED — requires prototype and owner approval. **Context:** LogHub owner prioritizes fast project-specific interactive reports, then log search. Long-term LogHub dashboard use is expected to be 5–10 internal members, while observed Skyra products may serve many more end users and produce much larger log volumes.
**Decision candidate:** centralized immutable per-project daily JSONL archive as source of truth; derived Parquet optimized for analytical/report queries; bounded DuckDB query workers; Valkey report caching; PostgreSQL **only** for admin/report metadata. No Elasticsearch/OpenSearch/Kibana requirement and no raw diagnostic event rows in PostgreSQL.
**Rationale:** file-first ownership, portable AWS/Azure/self-host storage, strong columnar report loading and fewer infrastructure services. **Trade-offs:** Parquet is a second file representation; DuckDB is not a full indexed full-text search engine, so arbitrary text search may need a future Tantivy index once measured. Require ingestion safety, archive manifests, query access isolation, conversion/recovery and realistic performance benchmarks.
**Decision gate:** approve only after test corpus, report query workload and volume sizing; validate cold/warm report p95, searchable fields, cross-project isolation, cache freshness, backups and failure recovery. **Supersedes earlier proposed ADR-003 Elasticsearch option**, without erasing its historical rationale.
