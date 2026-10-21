# Project Tasks and Phased Delivery Plan

> **Product:** Skyra LogHub  |  **Status:** Proposed baseline — review before implementation  |  **Version:** 0.1-draft  |  **Date:** 2026-10-21
> **Repository:** `skyra-loghub` (renamed by project owner). Assumptions and undecided items are marked **TBD**. These documents are design specifications, not assertions that code already exists.

## Status rules
`NOT_STARTED`, `READY`, `IN_PROGRESS`, `BLOCKED`, `IN_REVIEW`, `DONE`. Only mark `DONE` with evidence (commit, tests, verified deliverables). At creation, **nothing is implemented or tested by this document**. Phases may have preparation work in parallel but production deployments await security gates.

## Phase 0 — Documentation and baseline (no application code)
| ID | Task | Dependencies | Evidence / acceptance |
|---|---|---|---|
| LH-000 | Inspect renamed repository and working-tree state | none | Actual tree, manifest and existing-code inventory; report |
| LH-001 | Commit/review 14-document baseline | LH-000 | Stakeholder approval; internally consistent docs |
| LH-002 | Confirm decisions: identity, volume, retention, branding, hosting, canonical contracts | LH-001 | ADRs; remove relevant TBDs |
| LH-003 | Audit Skyra Platform package public APIs/distribution | LH-000 | Integration matrix and upstream issues |

## Phase 1 — Contracts and package foundations
| ID | Task | Dependencies | Evidence / acceptance |
|---|---|---|---|
| LH-101 | Define canonical logging JSON Schema and fixture corpus | LH-002 | Type-valid samples, duplicate-key negative cases, compatibility suite |
| LH-102 | TS logger-core metadata/redaction | LH-101 | Unit tests: nested secrets, collisions, invalid IDs |
| LH-103 | Node/Pino daily JSONL transport | LH-102 | UTC rotation, size rollover, multi-instance isolation, permission and disk-error tests |
| LH-104 | Python SDK parity | LH-101 | pytest fixture parity, concurrency and rotation tests |
| LH-105 | NestJS/Next.js adapters and sample apps | LH-103 | Request context, trace propagation, install smoke tests |
| LH-106 | Package registry/release automation | LH-103, LH-104 | Versioned packages independently install in clean consumers |

## Phase 2 — Ingestion and data persistence
| ID | Task | Dependencies | Evidence / acceptance |
|---|---|---|---|
| LH-201 | Local Compose stack (Elasticsearch, PG, cache, collector) | LH-002 | Health checks, TLS/security defaults, deterministic startup |
| LH-202 | Agent filelog pipelines and checkpoints | LH-103, LH-201 | Rotation/restart/replay/no-loss-under-test assertions |
| LH-203 | Secure gateway with identity, quotas and normalization | LH-101, LH-201 | Wrong project, malformed JSON, oversized payload denied |
| LH-204 | Elasticsearch mappings/data lifecycle | LH-101, LH-201 | Mapping/retention/scope query integration tests |
| LH-205 | Ingestion observability and failure queues | LH-202, LH-203 | Index errors and dropped events measurable |

## Phase 3 — Identity and search foundation
| ID | Task | Dependencies | Evidence / acceptance |
|---|---|---|---|
| LH-301 | OIDC login/MFA/session enforcement | LH-201, LH-002 | Negative auth tests, logout/session revoke |
| LH-302 | Role/project memberships | LH-301 | Explicit cross-project deny tests |
| LH-303 | Token issue/list/revoke/rotate/expiry | LH-302 | Hashed verifier only, once-visible secret, immediate revoke tests |
| LH-304 | Query service AST, cost controls and field discovery | LH-204, LH-302 | Unauthorized ES access impossible; timeouts and bounded results |
| LH-305 | Distributed throttles and audit trails | LH-303, LH-304 | Per identity/IP/token limits and auditable sensitive actions |

## Phase 4 — Angular Log Explorer
| ID | Task | Dependencies | Evidence / acceptance |
|---|---|---|---|
| LH-401 | Angular shell using Skyra Platform releases | LH-003, LH-301 | Install/build/accessibility smoke tests |
| LH-402 | Project/time/service selectors, saved filter state | LH-401, LH-304 | No stale unauthorized cross-project data |
| LH-403 | Field list and safe visual query builder | LH-402 | Field metadata tests, keyboard use |
| LH-404 | Approved advanced query subset/editor | LH-403 | Reject nonallowlisted commands and runaway queries |
| LH-405 | Histogram, results grid and JSON detail drawer | LH-403 | Search E2E and safe HTML/text rendering |
| LH-406 | Saved searches, controlled export | LH-405, LH-305 | Role/isolation tests and download auditing |

## Phase 5 — Performance and diagnostics
| ID | Task | Dependencies | Evidence / acceptance |
|---|---|---|---|
| LH-501 | API timings/error groups/status metrics | LH-105, LH-405 | p50/p95/p99 with known synthetic load |
| LH-502 | DB client query timings/normalized fingerprints | LH-105 | No raw bind values; measured duration semantics |
| LH-503 | Jobs/dependencies/cache instrumentation | LH-501 | Cross-service trace ID and failure-path checks |
| LH-504 | Performance panels and alerts | LH-501–503 | Load tests, alert cooldown and dedupe |

## Phase 6 — MCP
| ID | Task | Dependencies | Evidence / acceptance |
|---|---|---|---|
| LH-601 | Authenticated MCP HTTP boundary | LH-303, LH-304 | OAuth discovery, scopes, token validation tests |
| LH-602 | Read-only tools: projects/search/errors/traces/performance/jobs | LH-601 | Every tool enforces project and query budgets |
| LH-603 | Claude Code/Antigravity integration pilots | LH-602 | Verified client-supported authentication setup |
| LH-604 | Prompt-injection and exfiltration security review | LH-603 | Untrusted log text cannot control tool behavior |

## Phase 7 — Production readiness and rollout
| ID | Task | Dependencies | Evidence / acceptance |
|---|---|---|---|
| LH-701 | Cloud/on-prem deployment profiles and secrets | LH-305 | No publicly reachable data stores |
| LH-702 | Load/resilience and backup/restore rehearsals | LH-504, LH-701 | Quantified limits and tested restore |
| LH-703 | Security audit and dependency scans | LH-604, LH-701 | No unresolved criticals |
| LH-704 | Pilot 1 NestJS + 1 Python, then migration guide | LH-703 | Production-style validation and signoff |

## Task submission format (Antigravity)
`Task ID`, requirements/source docs, branch, exact scope and allowed files, excluded work, tests, acceptance, outputs, status report. **Never batch an entire phase in one prompt.**

## Next task
`LH-000` inspect current renamed repository; docs baseline can be copied in after existing files are checked. Owner approval required for modifications and commits.
