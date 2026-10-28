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
| ADR-011 | Centralized file-first analytical engine (JSONL + Parquet + DuckDB) | Proposed |
| ADR-012 | Browser Ingestion Trust Boundary via Same-Origin Backend Proxy | Proposed |
| ADR-013 | Durable Ingestion Acknowledgement Boundary via Crash-Recoverable Journal | Proposed |
| ADR-014 | Tenant-Isolated File-First Archive Segments and Manifests | Proposed |
| ADR-015 | Authoritative Durable Idempotency and Journal-Reconstructible Replay State | Proposed |
| ADR-016 | Atomic All-or-Nothing Batch Ingestion Semantics | Proposed |
| ADR-017 | Query Service Boundary & Workload Isolation | Proposed |
| ADR-018 | DuckDB Analytical Query Acceleration & Derived Parquet Lifecycle | Proposed |
| ADR-019 | Tenant-Safe Metadata-Driven Query Planning & Filesystem Containment | Proposed |
| ADR-020 | Keyset Cursor Pagination & Eventual Consistency Watermark | Proposed |
| ADR-021 | Multi-Tenant Resource Governance & Query Scheduling | Proposed |
| ADR-022 | Angular 19 Standalone Web Console Architecture & Workspace Layout | Proposed |
| ADR-023 | Token-Driven Dual-Theme Design System & WCAG 2.2 AA Accessibility | Proposed |
| ADR-024 | Backend-for-Frontend (BFF) Session Architecture & OIDC PKCE Authentication | Proposed |
| ADR-026 | Administrative API Gateway Boundary & Phased Schema Strategy | Proposed |
| ADR-027 | Dedicated Administration Service Topology & Workload Isolation | Proposed |
| ADR-028 | Authoritative Multi-Tenant Identity and Composite Key Model | Proposed |
| ADR-029 | Hierarchical Role-Based Access Control (RBAC) & Anti-Escalation | Proposed |
| ADR-030 | Cross-Service Authorization Consistency & Revocation Propagation | Proposed |
| ADR-031 | Ingestion Credential Storage, Rotation Overlap & Revocation | Proposed |
| ADR-032 | Immutable Administrative Audit Trail Persistence & Failure Semantics | Proposed |
| ADR-033 | Additive Database Schema Evolution & Safe Bootstrap Strategy | Proposed |

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


## ADR-012 — Browser Ingestion Trust Boundary via Same-Origin Backend Proxy (new proposal, 2026-10-24)
- **Status:** PROPOSED (Pending Review Gate)
- **Context:** Browser clients (@skyra/logger-browser, Angular, React) run in untrusted user runtimes. Direct transmission to LogHub gateway using static API keys risks credential extraction, unmetered log injection, and project spoofing.
- **Previous Proposal:** Direct ingestion using client-embedded static secrets or custom `X-Skyra-Proxy-Secret` header, or complex ephemeral JWT grant infrastructure.
- **Corrected MVP Decision:** Ingestion from browser applications must traverse a trusted same-origin application backend proxy (e.g. Next.js, NestJS backend) using the application's existing session authentication, CSRF protections, and rate limits. The application backend forwards batches to LogHub using standard `Authorization: Bearer <token>`. Custom header `X-Skyra-Proxy-Secret` is superseded by standard RFC 6750 Bearer authentication.
- **Alternatives Rejected:**
  - *Direct browser-to-gateway with static token:* Rejected due to credential theft and unbounded DDoS vulnerability.
  - *Short-lived JWT grant tokens:* Rejected for MVP due to distributed cryptographic key distribution and clock-skew complexity; preserved as future enhancement candidate.
- **Security Impact:** Eliminates client-side secret exposure; binds browser telemetry to authenticated application user sessions; enables centralized rate-limiting.
- **Data-Loss Assumptions:** Application backend failure drops un-spooled browser telemetry; acceptable for non-critical client UI diagnostics.
- **Implementation Dependencies:** `LOGHUB-ING-002` (Gateway Bearer authentication), existing `@skyra/logger-browser` HTTP transport.
- **Unresolved Risks:** High-traffic consumer applications require properly scaled backend telemetry proxies to prevent reverse-proxy bottlenecks.


## ADR-013 — Durable Ingestion Acknowledgement Boundary via Crash-Recoverable Journal (new proposal, 2026-10-24)
- **Status:** PROPOSED (Pending Review Gate)
- **Context:** Preliminary designs permitted acknowledging batches as `durably_accepted` without rigorous specification of physical disk synchronization, risking data loss if the server crashed while data remained in volatile OS page cache.
- **Previous Proposal:** Acknowledging batches after in-memory ingestion buffer or asynchronous worker queue enqueue.
- **Corrected MVP Decision:** Durable acceptance (`200 OK`, `status: "durably_accepted"`) is emitted **if and only if** the entire batch is serialized into a contiguous binary journal frame, appended via `write()`, and synchronously persisted to non-volatile disk via `fsync()` (or `fdatasync()`) on the journal file descriptor and parent directory (on file creation/rotation). In-memory acknowledgement is strictly prohibited.
- **Alternatives Rejected:**
  - *Asynchronous background fsync:* Rejected because sudden host power loss causes unacknowledged data loss for batches previously reported as successful.
  - *Per-event database transaction:* Rejected due to severe throughput bottlenecks (<500 EPS).
- **Security Impact:** Guarantees auditability and crash consistency; prevents false telemetry confirmation during service crashes.
- **Data-Loss Assumptions:** RPO = 0 for all acknowledged batches on hardware with power-loss protected (PLP) write caches. Non-PLP consumer SSDs with lying flush implementations carry residual risk upon physical power loss.
- **Implementation Dependencies:** `LOGHUB-ING-002` (must return 503 until journal is mounted), `LOGHUB-ING-003` (WAL engine implementation).
- **Unresolved Risks:** High IOPS pressure on slow storage volumes if concurrent batches are not grouped within bounded microsecond commit windows.


## ADR-014 — Tenant-Isolated File-First Archive Segments and Manifests (new proposal, 2026-10-24)
- **Status:** PROPOSED (Pending Review Gate)
- **Context:** Centralized storage must preserve strict multi-tenancy, cross-project isolation, and zero concurrent write collisions without requiring complex database locks.
- **Previous Proposal:** Loosely defined central archive paths or multi-writer append into shared remote objects.
- **Corrected MVP Decision:** Central archive is partitioned strictly by `${ARCHIVE_ROOT}/${TENANT_ID}/${PROJECT_ID}/${ENVIRONMENT}/${SERVICE_NAME}/${YYYY-MM-DD}/segment-${PART_INDEX}.jsonl`. Every finalized segment is accompanied by a cryptographically signed companion `segment-${PART_INDEX}.manifest.json` containing record counts, byte sizes, timestamp ranges, and a SHA-256 checksum. Segments rotate at 100 MiB or UTC midnight, after which they are marked read-only (`0o440`).
- **Alternatives Rejected:**
  - *Concurrent application writes to central archive:* Rejected due to file corruption and lock contention.
  - *Storing raw event JSON in PostgreSQL:* Rejected to preserve file-first architecture and avoid database bloat.
- **Security Impact:** Path traversal prevention through strict regex allowlists (`^[a-z0-9_-]+$`) and realpath containment checks. Tenant ID is server-authoritative.
- **Data-Loss Assumptions:** Storage media reliability. Offline segment checksums detect bit rot.
- **Implementation Dependencies:** `LOGHUB-ING-003` (Archive Writer), `contracts/storage-contract.md`.
- **Unresolved Risks:** Long-term file-count scaling on standard filesystems requires periodic Parquet compaction (`LH-DATA-002`).


## ADR-015 — Authoritative Durable Idempotency and Journal-Reconstructible Replay State (new proposal, 2026-10-24)
- **Status:** PROPOSED (Pending Review Gate)
- **Context:** The preliminary design proposed a transient 24-hour Valkey/Redis cache as the authoritative deduplication mechanism. Transient caches can evict keys, restart, or be flushed, causing client retries to inject duplicate events into the permanent archive.
- **Previous Proposal:** 24-hour Valkey replay cache as the authoritative duplicate prevention mechanism.
- **Corrected MVP Decision:** Authoritative deduplication is backed by the persistent Write-Ahead Journal (WAL) and a PostgreSQL receipt index (`deduplication_receipts`). Valkey is relegated strictly to an **optional, non-authoritative read-through optimization**. Deduplication keys use the namespace `${TENANT_ID}#${PROJECT_ID}#${BATCH_ID}` combined with a SHA-256 payload digest. Reusing a batch ID with altered content yields `409 Conflict` (`IDEMPOTENCY_CONFLICT`). A bounded 7-day retention horizon is enforced.
- **Alternatives Rejected:**
  - *Relying solely on Valkey/Redis:* Rejected due to volatile eviction, lack of durable crash recovery, and total loss on `FLUSHALL`.
  - *Global infinite exactly-once delivery:* Rejected because unbounded deduplication indexes consume infinite storage; 7-day horizon is an explicit, bounded trade-off.
- **Security Impact:** Prevents replay attacks, cross-tenant collisions, and silent telemetry tampering via batch ID reuse.
- **Data-Loss Assumptions:** Within the 7-day horizon, deduplication is 100% guaranteed. Client spools replayed after 7 days will be appended as new events.
- **Implementation Dependencies:** `LOGHUB-ING-003` (WAL receipt index), `LOGHUB-ING-004` (High-concurrency locking and Valkey integration).
- **Unresolved Risks:** Manual operator re-spooling of multi-week outages can introduce duplicate events after the 7-day cutoff.


## ADR-016 — Atomic All-or-Nothing Batch Ingestion Semantics (new proposal, 2026-10-24)
- **Status:** PROPOSED (Pending Review Gate)
- **Context:** Preliminary proposals permitted partial batch acceptance using HTTP 207 Multi-Status, creating ambiguous client delivery states, complex retry spools, and partial journal writes.
- **Previous Proposal:** Optional HTTP 207 Multi-Status partial batch acceptance where valid events were accepted and invalid events were rejected.
- **Corrected MVP Decision:** Ingestion Gateway enforces **atomic all-or-nothing batch processing**. If any single event in a batch violates Canonical Schema v1 or project authorization, the entire batch is rejected (`422 Unprocessable Content` or `403 Forbidden`). Only batches where 100% of events are valid are committed to the journal and acknowledged with `200 OK` (`durably_accepted`). HTTP 207 Multi-Status is removed from the active contract and rejected for MVP.
- **Alternatives Rejected:**
  - *HTTP 207 Multi-Status:* Rejected due to client retry complexity (requiring clients to split and re-serialize failed sub-batches) and unrecoverable partial journal framing.
  - *HTTP 202 Accepted without durability:* Rejected due to false delivery confirmation.
- **Security Impact:** Eliminates partial-injection attacks; simplifies client error handling and deterministic retry loops.
- **Data-Loss Assumptions:** Entire batches containing invalid events are quarantined by the shipper; client applications are alerted to schema bugs immediately.
- **Implementation Dependencies:** `LOGHUB-ING-002` (Validation Pipe), `contracts/ingestion/v1/openapi.yaml`.
- **Unresolved Risks:** A single invalid log event in a batch of 500 will cause all 500 events to be rejected until the shipper quarantines the offending record.


## ADR-017 — Query Service Boundary & Workload Isolation (new proposal, 2026-10-25)
- **Status:** PROPOSED (Pending Review Gate)
- **Context:** The Phase 2 Ingestion Gateway (`apps/ingestion-gateway`) is a single-active-writer service responsible for durable WAL writes and immutable JSONL archival. Hosting analytical queries inside the ingestion gateway risks memory bloat, CPU starvation, and process crashes that could degrade ingestion durability.
- **Previous Proposal:** Single unified NestJS application handling both ingestion and search/query.
- **Corrected MVP Decision:** Implement a dedicated query service application (`apps/query-service`) deployed as an isolated process/container. The Query Service maintains strictly read-only access to archive storage and read-only access to PostgreSQL archive metadata (`archive_segments`). Ingestion and query run on independent resource budgets.
- **Alternatives Rejected:**
  - *Unified Ingestion + Query Process:* Rejected due to the risk of analytical queries causing OOM crashes or thread starvation in the ingestion journal writer.
  - *Database-only querying (storing logs in PostgreSQL):* Rejected to maintain file-first architecture and avoid database scaling limits.
- **Security Impact:** Prevents query vulnerabilities (e.g. DuckDB memory exhaustion) from compromising ingestion uptime. Strict separation of machine ingestion tokens and user query tokens.
- **Data-Loss Assumptions:** RPO = 0 preserved for ingestion regardless of query load.
- **Implementation Dependencies:** `LOGHUB-QUERY-001`, `LOGHUB-QUERY-002`.
- **Unresolved Risks:** Requires deploying and monitoring two separate services.


## ADR-018 — DuckDB Analytical Query Acceleration & Derived Parquet Lifecycle (new proposal, 2026-10-25)
- **Status:** PROPOSED (Pending Review Gate)
- **Context:** Canonical JSONL archive is immutable and authoritative. However, scanning gigabytes of compressed or uncompressed JSONL for ad-hoc search and multi-bucket aggregations incurs high deserialization overhead.
- **Previous Proposal:** Elasticsearch/OpenSearch cluster or direct Elasticsearch ingestion.
- **Corrected MVP Decision:** Adopt DuckDB as an in-memory, embedded vectorized execution engine scanning canonical JSONL directly for near-real-time segments, combined with an asynchronous background converter generating ZSTD-compressed Apache Parquet for closed segments. Canonical JSONL remains the permanent source of truth; Parquet is derived and 100% reproducible.
- **Alternatives Rejected:**
  - *Elasticsearch / OpenSearch cluster:* Rejected due to operational complexity, heavy memory footprint (JVM heap), and violation of the lightweight file-first mandate.
  - *Direct SQLite querying:* Rejected due to lack of vectorized columnar execution and poor JSON/Parquet scanning throughput.
- **Security Impact:** DuckDB runs in-memory with `enable_external_access = false`, blocking network calls and extension loading.
- **Data-Loss Assumptions:** Loss or corruption of Parquet files incurs zero data loss, as files can be regenerated from JSONL.
- **Implementation Dependencies:** `@duckdb/node-api`, `LOGHUB-QUERY-003`, `LOGHUB-QUERY-006`.
- **Unresolved Risks:** Feasibility spike verified `@duckdb/node-api` works on Node 24; long-term multi-worker memory management must be monitored.


## ADR-019 — Tenant-Safe Metadata-Driven Query Planning & Filesystem Containment (new proposal, 2026-10-25)
- **Status:** PROPOSED (Pending Review Gate)
- **Context:** An analytical engine scanning files on disk is vulnerable to Local File Inclusion (LFI), path traversal (`../../`), and cross-tenant data leaks if client-provided paths are used.
- **Previous Proposal:** Client specifies file paths or filesystem glob patterns directly in search queries.
- **Corrected MVP Decision:** Filesystem scanning is entirely driven by trusted server-side metadata. The Query Planner consults PostgreSQL `archive_segments` for candidate segments matching tenant, project, and time filters. File paths are synthesized strictly within `ARCHIVE_ROOT`, verified against symlink escapes via `realpath`, and passed as parameterized arrays to DuckDB. Client-provided `tenant_id` is ignored in favor of the authenticated JWT principal.
- **Alternatives Rejected:**
  - *Recursive filesystem crawling on query request:* Rejected due to catastrophic I/O amplification and path traversal risks.
  - *Client-supplied archive glob patterns:* Rejected as an unacceptable LFI vulnerability.
- **Security Impact:** Guarantees absolute tenant and project boundary isolation. Prevents arbitrary file reads.
- **Data-Loss Assumptions:** None.
- **Implementation Dependencies:** `LOGHUB-QUERY-002`, `apps/ingestion-gateway/prisma/schema.prisma`.
- **Unresolved Risks:** Corrupted metadata in PostgreSQL could cause segments to be temporarily skipped until catalog reconciliation runs.


## ADR-020 — Keyset Cursor Pagination & Eventual Consistency Watermark (new proposal, 2026-10-25)
- **Status:** PROPOSED (Pending Review Gate)
- **Context:** Traditional `OFFSET / LIMIT` pagination suffers from $O(N)$ performance degradation and record shifting when new log segments rotate during pagination. Furthermore, clients need transparency regarding when newly ingested logs become queryable.
- **Previous Proposal:** Traditional SQL offset pagination with undefined freshness semantics.
- **Corrected MVP Decision:** Enforce keyset pagination using a deterministic composite sort key: `(@timestamp, event.id)`. Cursors are opaque, tamper-proof, base64url-encoded JSON payloads authenticated with HMAC-SHA256, binding the cursor to query filters and caller scope. The query engine queries finalized archive segments only, reporting `archive_watermark` and freshness lag in response metadata.
- **Alternatives Rejected:**
  - *SQL OFFSET / LIMIT pagination:* Rejected due to $O(N)$ scan cost and unstable page results during active ingestion.
  - *Active WAL querying:* Rejected due to write contention, file lock conflicts, and dirty read hazards on unfinalized frames.
- **Security Impact:** Cryptographic cursor binding prevents cursor forgery, parameter swapping, and privilege escalation.
- **Data-Loss Assumptions:** None. Newly acknowledged events appear in search once their segment rotates and closes (5s to 60s lag).
- **Implementation Dependencies:** `LOGHUB-QUERY-004`.
- **Unresolved Risks:** Heavy log skew across services with unsynchronized clocks requires tie-breaking by `event.id`.


## ADR-021 — Multi-Tenant Resource Governance & Query Scheduling (new proposal, 2026-10-25)
- **Status:** PROPOSED (Pending Review Gate)
- **Context:** Analytical queries can monopolize CPU, exhaust memory, and cause Denial of Service across tenants if unconstrained.
- **Previous Proposal:** Unbounded synchronous query execution with default web server timeouts.
- **Corrected MVP Decision:** Implement multi-tiered resource governance: hard ceilings on time ranges (30 days), page sizes (500), scanned segments (2,000), memory per query (`max_memory = '256MB'`), and query duration (30 seconds). A Deficit Round-Robin (DRR) fair scheduler prevents a single tenant from starving concurrent workers. Exceeded limits terminate DuckDB execution via `connection.interrupt()` and return RFC 7807 problem details (`429` or `504`).
- **Alternatives Rejected:**
  - *Unbounded query execution:* Rejected due to trivial DoS vulnerability and memory exhaustion.
  - *First-Come-First-Served (FIFO) queuing:* Rejected because one heavy tenant could block all other tenants indefinitely.
- **Security Impact:** Prevents computational Denial of Service and noisy-neighbor resource starvation.
- **Data-Loss Assumptions:** None.
- **Implementation Dependencies:** `LOGHUB-QUERY-006`, `LOGHUB-QUERY-007`.
- **Unresolved Risks:** Memory limits enforced by DuckDB must be complemented by container cgroups to guard against native driver memory overhead.


## ADR-022 — Angular 19 Standalone Web Console Architecture & Workspace Layout (new proposal, 2026-10-27)
- **Status:** PROPOSED (Pending Review Gate)
- **Context:** Phase 4 requires an enterprise observability web console (`apps/console-web`) providing developers, SREs, and administrators with fast search, analytics, and project governance.
- **Decision:** Build a single Angular 19 SPA located at `apps/console-web/` within the existing pnpm monorepo. Use standalone components exclusively (zero `NgModule`s), Signal-based reactivity (`signal()`, `computed()`), modern template control flow (`@if`, `@for`, `@switch`), route-level lazy loading, and functional route guards/interceptors.
- **Alternatives Rejected:**
  - *Micro-frontends / Module Federation:* Rejected as unjustified complexity for a unified observability workstation; introduces excessive bundle overhead and version-skew risks.
  - *Next.js / React Web Console:* Rejected to maintain consistency with Skyra Platform Angular engineering standards and `@skyra/logger-angular` SDK capabilities.
  - *Traditional NgModules:* Deprecated in modern Angular; standalone components provide faster compilation and cleaner tree-shaking.
- **Security Impact:** Single SPA boundary enables unified Content Security Policy (CSP) and centralized authentication interceptors.
- **Implementation Dependencies:** `LOGHUB-CONSOLE-001`, `LOGHUB-CONSOLE-002`.


## ADR-023 — Token-Driven Dual-Theme Design System & WCAG 2.2 AA Accessibility (new proposal, 2026-10-27)
- **Status:** PROPOSED (Pending Review Gate)
- **Context:** Observability workstations require high information density, long sessions in dark environments, and accessible contrast for incident response teams.
- **Decision:** Implement a token-driven design system using vanilla CSS Custom Properties. Provide dual first-class Light and Dark themes. Enforce strict WCAG 2.2 AA contrast ratios ($\ge 4.5:1$ text contrast), multi-cue severity indicators (color tint + bold label + icon), visible focus rings, full keyboard shortcuts (`j`/`k`, `Enter`, `Esc`, `/`), and `prefers-reduced-motion` compliance.
- **Alternatives Rejected:**
  - *TailwindCSS / Utility-first CSS:* Rejected per workspace technology guidelines favoring standard vanilla CSS custom properties for maximum design token flexibility without build-time utility lock-in.
  - *Component library framework lock-in (Material/Bootstrap):* Rejected to maintain bespoke high-density log layouts, custom ECS-aligned severity tokens, and lightweight bundle footprints.
- **Security Impact:** Clean CSS custom properties avoid dangerous dynamic runtime stylesheet injection.
- **Implementation Dependencies:** `LOGHUB-CONSOLE-002`.


## ADR-024 — Backend-for-Frontend (BFF) Session Architecture & OIDC PKCE Authentication (new proposal, 2026-10-27)
- **Status:** PROPOSED (Pending Review Gate)
- **Context:** Browser-based SPAs that store bearer JWT access tokens or refresh tokens in `localStorage` or `sessionStorage` are vulnerable to token theft via Cross-Site Scripting (XSS).
- **Decision:** Adopt a Backend-for-Frontend (BFF) session security pattern. The frontend communicates with a same-origin gateway using secure, HTTP-only, `SameSite: Strict` cookies (`__Host-skyra-session`). The BFF interacts with the corporate OIDC identity provider via Authorization Code Flow with PKCE, manages token refresh, and injects bearer JWTs into internal Query Service requests. Multi-tab synchronization is maintained via `BroadcastChannel`. For local offline development, a pluggable dev session provider is supported that fails closed in production.
- **Alternatives Rejected:**
  - *Storing JWTs in localStorage:* Strictly rejected due to critical XSS token exfiltration risk.
  - *Direct browser-to-IdP Implicit Flow:* Deprecated and forbidden by OAuth 2.1 standards.
- **Security Impact:** Eliminates browser access to raw token secrets; defends against XSS token harvesting and CSRF.
- **Implementation Dependencies:** `LOGHUB-AUTH-001`, `LOGHUB-CONSOLE-003`.


## ADR-025 — Keyset Pagination State Management & URL-Driven Navigation (new proposal, 2026-10-27)
- **Status:** PROPOSED (Pending Review Gate)
- **Context:** Log investigation requires shareable deep-links, browser history navigation (Back/Forward), and deterministic pagination over millions of records without offset drift.
- **Decision:** Serialize search queries, active structured filter chips, time boundaries, and active cursor keys into standard URL query parameters. Keyset cursor navigation maintains an in-memory cursor stack in `LogExplorerFacade` enabling forward and backward traversal over signed HMAC-SHA256 cursors. Tampered cursors fail gracefully to page 1.
- **Alternatives Rejected:**
  - *SQL Offset-based page numbers:* Incompatible with backend keyset pagination; leads to skipped rows during active ingestion.
  - *Storing query state in global persistent storage:* Prevents shareable URLs and multi-tab independent investigations.
- **Security Impact:** Signed base64url HMAC-SHA256 cursors prevent parameter tampering or client-side scope manipulation.
- **Implementation Dependencies:** `LOGHUB-CONSOLE-004`.


## ADR-026 — Administrative API Gateway Boundary & Phased Schema Strategy (new proposal, 2026-10-27)
- **Status:** PROPOSED (Pending Review Gate)
- **Context:** While Phase 3 delivered production-ready Search and Analytics Query APIs, the PostgreSQL database models for projects and credentials currently lack REST management endpoints, and user/membership models do not yet exist.
- **Decision:** Strictly separate Phase 4 frontend milestones based on backend readiness:
  1. CONSOLE-002 through CONSOLE-005 implement screens 100% backed by existing Query Service APIs (Log Explorer, Event Drawer, Overview, Analytics Histograms, Dynamic Facets).
  2. Administrative screens (Projects, Ingestion Credentials, Team Access) are deferred until separate backend milestones (`LOGHUB-ADMIN-001` and `LOGHUB-AUTH-001`) deliver verified REST APIs and database models.
  3. The frontend is strictly forbidden from implementing "mock" or client-side-only persistence for administrative mutations.
- **Alternatives Rejected:**
  - *Frontend mock/fake CRUD:* Strictly rejected as a violation of enterprise data integrity and security standards.
  - *Merging backend admin API development into frontend tasks:* Rejected to maintain clean separation of concerns and rigorous API contract-first design.
- **Security Impact:** Guarantees all administrative operations are authenticated, authorized, and audited server-side.
- **Implementation Dependencies:** `LOGHUB-ADMIN-001`, `LOGHUB-CONSOLE-006`.


## ADR-027 — Dedicated Administration Service Topology & Workload Isolation (new proposal, 2026-10-28)
- **Status:** PROPOSED (Pending Review Gate)
- **Context:** Administrative operations (project lifecycle, user onboarding, role management, machine credential provisioning, and quota configuration) perform write-heavy transactional operations on PostgreSQL metadata. Combining this with high-throughput ingestion in `ingestion-gateway` or analytical queries in `query-service` violates clean separation of concerns and least-privilege database isolation.
- **Decision:** Establish a dedicated NestJS backend service `apps/admin-service` binding to internal network interfaces (port 3300). The service owns administrative domain aggregates, writes to PostgreSQL via an isolated database role (`skyra_admin`), and exposes versioned `/admin/v1` REST APIs fronted by `apps/console-bff`.
- **Alternatives Rejected:**
  - *Embedding admin controllers in `ingestion-gateway`:* Rejected due to risk of ingestion pipeline starvation and bloated runtime memory footprint.
  - *Embedding admin controllers in `query-service`:* Rejected because query service operates in a strictly read-only analytical posture; giving it elevated database write access violates the Principle of Least Privilege.
- **Security Impact:** Enforces least privilege, limits blast radius of administrative vulnerabilities, and preserves independent scalability.
- **Implementation Dependencies:** `LOGHUB-ADMIN-001`, `LOGHUB-ADMIN-002`, `LOGHUB-ADMIN-003`.


## ADR-028 — Authoritative Multi-Tenant Identity and Composite Key Model (new proposal, 2026-10-28)
- **Status:** PROPOSED (Pending Review Gate)
- **Context:** Skyra LogHub delegates user authentication to enterprise OpenID Connect (OIDC) identity providers. Anchoring accounts solely on email or plain subject strings exposes the system to identity collisions across independent corporate tenants and account hijacking if corporate emails change.
- **Decision:** Anchor all human user identities in PostgreSQL to the composite unique key `@@unique([issuer, subject])`. The system never stores user passwords or MFA secrets. New user onboarding requires an explicit, active invitation or pre-provisioned `TenantMembership` (no open self-registration). In the absence of an active membership, authentication fails closed (`403 Forbidden`).
- **Alternatives Rejected:**
  - *Email-as-primary-key:* Rejected due to corporate email mutability and lack of cryptographic guarantee across distinct IdPs.
  - *Automatic tenant owner creation for new SSO users:* Rejected to prevent unauthorized tenant takeovers.
- **Security Impact:** Eliminates cross-issuer subject collisions and enforces deterministic user identity resolution.
- **Implementation Dependencies:** `LOGHUB-ADMIN-001`, `LOGHUB-ADMIN-002`.


## ADR-029 — Hierarchical Role-Based Access Control (RBAC) & Anti-Escalation (new proposal, 2026-10-28)
- **Status:** PROPOSED (Pending Review Gate)
- **Context:** The Web Console and Administration backend require fine-grained authorization spanning tenant governance, project administration, credential rotation, and log exploration.
- **Decision:** Implement a 5-tier role hierarchy (`OrgOwner`, `OrgAdmin`, `ProjectAdmin`, `Developer`, `Viewer`) enforcing deny-by-default, server-side permission gates:
  1. Requests without matching permission grants fail with `403 Forbidden`.
  2. Users cannot assign roles higher than their own effective role.
  3. Users cannot assign roles to themselves (self-escalation rejection).
  4. Demoting or deleting the last remaining `OrgOwner` of a tenant is strictly prohibited at the domain policy layer.
  5. Angular route guards serve only as presentation UX conveniences; domain access enforcement is performed independently on every backend mutation.
- **Alternatives Rejected:**
  - *Hardcoded global superuser:* Rejected to prevent single-point-of-failure cross-tenant breaches.
  - *Attribute-Based Access Control (ABAC) dynamic engine:* Rejected as over-engineered for current enterprise requirements; RBAC provides transparent, auditable access boundaries.
- **Security Impact:** Guarantees strict least privilege and mathematical immunity against self-escalation and tenant abandonment.
- **Implementation Dependencies:** `LOGHUB-ADMIN-001`, `LOGHUB-ADMIN-002`, `LOGHUB-ADMIN-003`.


## ADR-030 — Cross-Service Authorization Consistency & Revocation Propagation (new proposal, 2026-10-28)
- **Status:** PROPOSED (Pending Review Gate)
- **Context:** When an administrator revokes a user's membership or suspends a project, downstream services (`apps/console-bff`, `apps/query-service`, `apps/admin-service`) must not continue serving authorized data under stale cached tokens.
- **Decision:** Adopt an authoritative assertion architecture with aggressive bounds:
  1. Internal scoped JWTs minted by the BFF have a maximum Time-to-Live (TTL) of **60 seconds**.
  2. Membership revocations in `apps/admin-service` trigger immediate local session invalidation in `apps/console-bff` (0 seconds propagation delay for new user requests).
  3. Downstream services independently verify token expiration on every request. Maximum revocation window for in-flight tokens is bounded to $\le 60$ seconds without requiring distributed cache locks.
  4. If metadata storage is partitioned, membership resolution fails closed (`503 Service Unavailable`).
- **Alternatives Rejected:**
  - *Long-lived JWTs with real-time revocation blacklists in Redis:* Rejected due to operational complexity and external dependency failure modes during outages.
  - *Permanent internal tokens without expiration:* Strictly forbidden by enterprise security standards.
- **Security Impact:** Prevents zombie access grants and guarantees cross-service authorization convergence within 60 seconds.
- **Implementation Dependencies:** `LOGHUB-ADMIN-001`, `LOGHUB-ADMIN-002`, `LOGHUB-ADMIN-003`.


## ADR-031 — Ingestion Credential Storage, Rotation Overlap & Revocation (new proposal, 2026-10-28)
- **Status:** PROPOSED (Pending Review Gate)
- **Context:** Log shippers and SDKs require durable machine bearer credentials to push logs to `apps/ingestion-gateway`. Credential generation, rotation, and revocation must maintain 100% backward compatibility with the existing Ingestion Gateway SHA-256 verifier.
- **Decision:**
  1. Generate machine credentials with format `skyra_live_[a-f0-9]{64}`.
  2. The raw token secret is revealed to the administrator **exactly once** upon creation or rotation; subsequent GET endpoints return only safe metadata (`id`, `keyPrefix`, `allowedProjects`, `expiresAt`).
  3. Store only the SHA-256 hex digest in `ingestion_credentials.key_hash`, matching `apps/ingestion-gateway/src/auth/auth.service.ts`.
  4. Rotation provides an atomic zero-downtime grace period (default 7 days) during which both old and new credentials authenticate simultaneously.
  5. Revocation sets `is_revoked = true` immediately, blocking subsequent gateway requests.
- **Alternatives Rejected:**
  - *Storing plaintext or reversible encrypted tokens:* Strictly rejected as a critical security vulnerability.
  - *Immediate rotation without overlap:* Rejected because it induces log drops across distributed server fleets during deployment.
- **Security Impact:** Prevents credential harvesting from database dumps and guarantees zero-downtime fleet token rotations.
- **Implementation Dependencies:** `LOGHUB-ADMIN-001`, `LOGHUB-ADMIN-004`.


## ADR-032 — Immutable Administrative Audit Trail Persistence & Failure Semantics (new proposal, 2026-10-28)
- **Status:** PROPOSED (Pending Review Gate)
- **Context:** Regulatory compliance (SOC 2, ISO 27001) and security forensics require an unalterable history of all administrative actions (project creation, role modifications, credential rotations, quota alterations).
- **Decision:** Persist administrative audit records to an append-only PostgreSQL table `admin_audit_events`. Audit persistence is executed within the same database transaction as the administrative mutation. If the audit record fails to persist, the entire administrative transaction rolls back (`Atomic Audit Invariant`). Sensitive fields (raw tokens, passwords, private keys) are strictly scrubbed before persistence.
- **Alternatives Rejected:**
  - *Asynchronous fire-and-forget audit emission to message queues:* Rejected because a message queue partition could cause unrecorded administrative mutations.
  - *Application log file scraping:* Rejected due to risk of log rotation truncation and lack of structured queryability.
- **Security Impact:** Guarantees non-repudiation and provides complete audit integrity across all tenant configuration changes.
- **Implementation Dependencies:** `LOGHUB-ADMIN-001`, `LOGHUB-ADMIN-002`, `LOGHUB-ADMIN-003`.


## ADR-033 — Additive Database Schema Evolution & Safe Bootstrap Strategy (new proposal, 2026-10-28)
- **Status:** PROPOSED (Pending Review Gate)
- **Context:** Introducing IAM, memberships, and administrative models must not destabilize existing Phase 2 and Phase 3 database schemas (`tenants`, `projects`, `ingestion_credentials`, `project_quotas`, `archive_segments`). Furthermore, the initial system must be securely bootstrapped without hardcoding default admin credentials.
- **Decision:**
  1. All Prisma schema changes are strictly additive. No existing columns are renamed or dropped.
  2. No migrations are executed during `LOGHUB-ADMIN-001`. A comprehensive migration proposal is reviewed for execution in `LOGHUB-ADMIN-002`.
  3. Tenant bootstrapping utilizes an explicit, audited CLI command or configuration script requiring environment variable verification (`SKYRA_BOOTSTRAP_OWNER_EMAIL`, `SKYRA_BOOTSTRAP_TENANT_CODE`). This provisions the initial `OrgOwner` without hardcoding credentials in seed scripts.
- **Alternatives Rejected:**
  - *Hardcoding 'admin@skyra.internal / password' seed script:* Rejected as an unacceptable security risk in production environments.
  - *Executing migrations directly in architecture milestone:* Rejected to maintain strict quality gates and review boundaries.
- **Security Impact:** Protects production database stability and prevents pre-seeded default credential backdoors.
- **Implementation Dependencies:** `LOGHUB-ADMIN-001`, `LOGHUB-ADMIN-002`.




