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
| ADR-003 | Elasticsearch Basic for indexed logs; **no Kibana** | Proposed |
| ADR-004 | PostgreSQL management DB and Valkey/Redis for transient controls | Proposed |
| ADR-005 | ECS-compatible canonical schema owned/versioned via `skyra-service-contracts` | Proposed |
| ADR-006 | JSONL file agent + optional secure direct export | Proposed |
| ADR-007 | Human OIDC/MFA; machine scoped opaque tokens; MCP standards-based OAuth | Proposed |
| ADR-008 | Hosted containers portable to AWS, Azure, dedicated server | Proposed |
| ADR-009 | Read-only MCP tools initially | Proposed |
| ADR-010 | Safe visual filter AST first; advanced query subset before full ES|QL | Proposed |

## ADR-001 — Monorepo and repo boundaries
**Context:** All operational apps, SDKs, UI and MCP must be coordinated and documented. Existing Skyra Platform focuses on Web Components and cannot own Python/server runtime distribution cleanly. **Decision:** Keep all LogHub-related code under renamed `skyra-loghub`; continue consuming Skyra Platform packages and authoritative service contracts by version. **Consequence:** Multi-language CI orchestration required; publish SDKs independently. **Alternative:** separate `skyra-logging` repo (less toolchain coupling, more coordination).

## ADR-002 — Dashboard
**Decision:** Angular SPA + NestJS API, original Skyra design with reusable Skyra Platform Web Components. **Rationale:** Internal developer-heavy filters and long-running administration UI. **Trade-off:** Must maintain typed API boundary; Angular package compatibility needs verification. **Alternative:** Next.js + NestJS.

## ADR-003 — Search backend
**Decision:** Elasticsearch for logs, without Kibana. **Trade-off:** Must implement own explorer, dashboards, ACL safeguards and alerts; ES resource cost and license review. **Alternative:** OpenSearch evaluated only if future policy requires it.

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
**Decision:** Parse safe query AST, fixed auth scope, bounded execution, allowlisted fields. **Trade-off:** cannot promise arbitrary ES|QL parity with prior screenshots at MVP. **Alternative:** passthrough ES|QL rejected pending security design.

## Approval process
Add for each ADR `Status: Accepted`, `Approved by`, `Date`, `Evidence`, `Implementation references`, `Rollback/migration` after validation. No proposal here alone authorizes code changes or deployment.

## Pending cross-cutting decisions
Identity provider, exact design token palette, regulatory retention requirements, volume/price budget, HA/RPO/RTO, registry and release namespace, traces storage, audit tamper-evidence, ES data stream architecture and MCP client interoperability.
