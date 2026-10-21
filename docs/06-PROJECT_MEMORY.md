# Project Memory and Working Handoff

> **Product:** Skyra LogHub  |  **Status:** Proposed baseline — review before implementation  |  **Version:** 0.1-draft  |  **Date:** 2026-10-21
> **Repository:** `skyra-loghub` (renamed by project owner). Assumptions and undecided items are marked **TBD**. These documents are design specifications, not assertions that code already exists.

## Purpose
Persistent lightweight source of truth for humans, Antigravity and other assistants. **Do not assert unverified implementation, tests or deployments.** Update after each approved task and preserve chronological history.

## Current snapshot
| Item | State |
|---|---|
| Product | Skyra LogHub |
| Repository | User reports existing `skyra-observability` renamed; final local path/remote confirmation TBD |
| Current phase | Phase 0 — documentation baseline and repository inspection |
| Current task | LH-000 (not yet executed by this documentation) |
| Implemented LogHub features | **Unverified**; current repository not inspected in this operation |
| Documents | 14 baseline drafts generated externally, pending user copy/review/commit |
| Tests | None executed as part of drafting these documents |
| Hosting | AWS / Azure / own server undecided |
| Identity provider | TBD |
| Design branding | Skyra Platform tokens preferred; palette awaiting approval |
| Canonical schema | ECS-compatible Skyra Logging Standard v1.0 proposed; not yet released |

## Confirmed user requirements
- One monorepo for SDKs, Angular frontend, NestJS API, ingestion, MCP and infrastructure.
- Custom Angular dashboard; **do not use Kibana**; retain Discover-like query, time histogram, available fields, project selection, result table, expanded JSON.
- Reuse Skyra Platform components; fix shared issues upstream with approval and regression tests.
- Node/TS (NestJS/Next.js), Python and browser adapters; no .NET priority.
- Isolated UTC daily JSONL log files per project/environment/service/instance where persistent filesystem is available; support file-agent + direct export.
- API/DB/job/external call speed, trace correlation, auth/security audit, sensitive-data controls.
- OIDC employee login; permissioned expiring tokens for developer tools and authenticated read-only MCP.
- Azure, AWS or self-host portability; step-by-step prompt-driven Antigravity development and proper tests.

## Architecture decisions (proposed, not ratified)
| Date | Topic | Proposed outcome | Reference |
|---|---|---|---|
| 2026-10-21 | UI/API | Angular + NestJS | `02-SYSTEM_ARCHITECTURE.md` |
| 2026-10-21 | Storage | Elasticsearch Basic + PostgreSQL + Valkey/Redis | ADR pending |
| 2026-10-21 | Contracts | ECS-compatible JSON with Skyra extension, canonical source `skyra-service-contracts` | `07-LOGGING_STANDARD.md` |
| 2026-10-21 | Authorization | OIDC/MFA + project-scoped opaque credentials; OAuth for remote MCP | `08-SECURITY_AUTHENTICATION.md` |
| 2026-10-21 | Rollout | Do not migrate existing projects until SDK pilot accepted | `05-PROJECT_TASKS.md` |

## Completed tasks
- Requirements discussions and example screenshot reviews completed in chat.
- Draft documentation generated for repository import; **not evidence of source-control changes**.

## In-progress tasks
- User review of draft documents and current repository audit.

## Blockers and decisions needed
1. Confirm existing repo files and whether any new docs would overwrite others.
2. Choose identity provider, expected data volume/EPS, retention and backup objectives.
3. Validate Skyra Platform registry availability and component public APIs.
4. Confirm Elasticsearch distribution/license constraints and hosting sizing.
5. Confirm brand colors and final release package names.

## Next approved action
Run read-only `LH-000`, compare repository to specification, then seek approval for documentation import (`LH-001`), followed by schema (`LH-101`).

## Update template (copy per completed task)
```md
### YYYY-MM-DD — LH-XXX — Task name
- Status: DONE / BLOCKED / IN_REVIEW
- Commit(s): (actual hash, if any)
- Files changed:
- Acceptance evidence:
- Commands run and observed outcomes:
- Documentation updates:
- Known limitations/risks:
- Next task requiring approval:
```

## Session handoff rule
Always start by reading this file, `05-PROJECT_TASKS.md`, relevant ADR and task contract; end with an evidence-based entry. Never remove past decisions silently—mark superseded with rationale.
