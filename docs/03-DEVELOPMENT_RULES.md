# Development Rules and Engineering Standards

> **Product:** Skyra LogHub  |  **Status:** Proposed baseline — review before implementation  |  **Version:** 0.1-draft  |  **Date:** 2026-10-21
> **Repository:** `skyra-loghub` (renamed by project owner). Assumptions and undecided items are marked **TBD**. These documents are design specifications, not assertions that code already exists.

## 1. Principles
Correctness, security, maintainability, observable failure, minimal coupling, explicit contracts, deterministic builds. **Implement one approved task at a time**. Do not silently expand scope, refactor unrelated modules, introduce packages without rationale or claim tests passed if not run.

## 2. Task execution contract
For every Antigravity task: read `06-PROJECT_MEMORY.md`, relevant PRD/ADR/contracts; enumerate changed files; identify risks; implement only authorized scope; add tests; run available validation; update docs and memory; report commands/results, remaining issues and next task. Approval required for deployment, data deletion, schema-breaking change, secrets handling, repository rename and Skyra Platform modifications.

## 3. Structure and layering
- Apps own composition/deployment, packages expose stable reusable contracts; no business logic inside generic logging core.
- Prefer small cohesive modules and public interfaces; dependency injection at external boundaries.
- No circular package dependencies, deep imports into other package internals or cross-repository path links.
- Extract repeated pure logic to functions; extract packages only when stable, multi-consumer reuse is expected. Avoid premature over-abstraction.
- UI generic reusable control → Skyra Platform; application-specific LogHub workflow → LogHub feature folder.

## 4. TypeScript/NestJS
- Strict TS; avoid `any`, broad casting, magic strings and unchecked nulls.
- Feature-based NestJS modules (`projects`, `logs`, `tokens`, `auth`, `saved-searches`, `audit`); controllers thin; use services/repositories.
- DTO schema validation; globally consistent error envelope; code-generated API clients preferred.
- No sensitive info in logs, exceptions, Swagger examples or error responses.
- Async IO with bounded timeouts; close streams/jobs gracefully; no hidden fire-and-forget.

## 5. Angular
- Standalone components and lazy feature routes; typed Reactive Forms where suitable; Signals for UI state, RxJS for async streams.
- Reuse `@skyra-tech-platform/*` components before authoring new primitives.
- Query editor and log details always safely render untrusted log strings as text, never execute them as HTML.
- Accessible semantics, keyboard interaction, meaningful loading/empty/error states, responsive density and virtualization/pagination for long results.

## 6. Python
- Typed Python SDK public API; configurable standard `logging` handlers/formatters; optional Loguru bridge without required vendor coupling.
- Tests with pytest, ruff/mypy or equivalent pinned tooling; thread/process safe rotation strategy clearly tested.
- Never log raw exception locals automatically; scrub secrets before serialization.

## 7. Schemas and naming
- Canonical schema version pinned in repository; all SDKs and ingest gateway run fixture-based compatibility tests.
- ECS field names as canonical indexed shape; `skyra.*` extension; UTC ISO-8601; numeric nanosecond `event.duration`.
- Use stable IDs not display names as routing keys. Reject duplicate keys; default-deny arbitrary unknown top-level fields in high-risk intake paths.

## 8. Security, privacy and supply chain
- Least privilege, server-side project checks on every request, no secrets in source code, never store raw machine tokens.
- Authenticate ingestion and MCP separately; require expiry, scope, revocation, rate limits; validate payload size/cardinality.
- Harden headers, CORS, CSRF for cookie mutation endpoints, SSRF controls, output escaping, CSP, dependency/SBOM scans, pinned image tags/digests.
- Use secret managers/environment injection; `.env.example` must contain placeholders only.

## 9. Testing and CI gates
- Tests submitted with feature changes; unit, integration, schema, security-negatives and E2E as applicable.
- CI: format/lint, TS/type check, Python check, builds, schema fixtures, unit/integration, critical authz tests, license/security scan.
- **85% unit coverage target** for logging core and security modules (not a replacement for behavioral testing). Block releases on failing critical tests; record skipped tests explicitly.
- Bug fixes require regression tests; integration changes require working sample app.

## 10. Error handling and observability
- Stable error codes; fail closed for auth/query parsing, graceful degrade for SDK/network failures.
- No `console.log` for normal production backend diagnostics; use Skyra logger after rollout.
- Correlation IDs across API/DB/jobs; threshold-based slow warnings; don't emit high-volume logs for every DB statement by default.

## 11. Documentation, release and Git
- Every public SDK method has usage reference; configuration defaults and compatibility matrix maintained.
- Conventional commits or consistent team convention; version packages semantically; CHANGELOG and ADR for breaking changes.
- Update `05-PROJECT_TASKS.md` and `06-PROJECT_MEMORY.md` after **verified** actions only.
- Never fabricate build, coverage, audit or deployment outcomes.

## 12. Cross-repo Skyra Platform fix procedure
Create reproducible bug + regression test in Skyra Platform, obtain permission to modify that repo, fix upstream, run its own CI, publish version, update LogHub dependency and verify. No local source copying or permanent `link:../` workaround.

## 13. Definition of done
Requirements and threat considerations satisfied; code reviewed; tests and docs updated; safe migration/rollback plan if needed; reproducible commands and evidence; memory updated; outstanding risks declared.
