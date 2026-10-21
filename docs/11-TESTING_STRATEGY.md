# Testing Strategy and Quality Gates

> **Product:** Skyra LogHub  |  **Status:** Proposed baseline — review before implementation  |  **Version:** 0.1-draft  |  **Date:** 2026-10-21
> **Repository:** `skyra-loghub` (renamed by project owner). Assumptions and undecided items are marked **TBD**. These documents are design specifications, not assertions that code already exists.

## 1. Objectives
Demonstrate log correctness, confidentiality, project isolation, performance fidelity, user workflows and operational recovery. **Every phase must have tests and evidence**; do not infer functionality from generated code.

## 2. Test pyramid
| Layer | Tools | Scope |
|---|---|---|
| TypeScript unit | Vitest or NestJS-compatible Jest choice (choose one per module) | Formatter, redaction, token policies, query AST |
| Python unit | pytest | Serialization, handlers, context, rotation |
| Schema contract | JSON Schema validator + golden fixtures | Cross-language identical required fields/types |
| Component | Angular TestBed + DOM accessibility checks | Field picker, query builder, results, errors |
| Integration | Testcontainers or Docker Compose | PG/Elasticsearch/Valkey/OTel Collector, indexed events |
| E2E | Playwright | Login, scoped search, histogram, token life cycle, MCP UI interaction where applicable |
| Security | Negative suites + SAST/DAST/dependency checks | Cross-project attacks, XSS, OAuth/token misuse |
| Load/resilience | k6/Artillery/custom controlled harness | Search p95, ingestion EPS, disk/full queues, disconnect/recovery |

## 3. Canonical fixtures
Include valid HTTP request, slow DB query, job success/failure, auth denial, exception, Unicode, long messages, concurrency and UTC rollover. Invalid fixtures: duplicate JSON keys, malformed timestamps, unsafe project ID, nested secret, SQL bind parameters, oversized strings, NaN, wrong schema and spoofed project identities.

## 4. Non-negotiable integration scenarios
1. Two projects with same service name cannot share log file path, index visibility or token access.
2. Day change creates new UTC file; size rollover is deterministic; collector tails correctly across rename/restart.
3. Network/Elasticsearch outage does not stop application; drop/buffer behavior visible and bounded.
4. API latency measured with monotonic clock and nanosecond conversion; DB duration explicitly client-observed.
5. Direct ingestion authentication rejects bad/mismatched service/project mapping.
6. Revoked/expired/scope-limited token is denied immediately including through MCP.
7. Query editor rejects unbounded, unauthorized, complex or unsupported expressions.
8. Log entries containing malicious HTML/scripts appear as escaped text everywhere including exports.
9. Search/cursor cannot cross project or query boundaries.
10. Backup/restore produces usable indexes and management DB without credential resurrection.

## 5. Quality gate targets
- Proposed 85% unit coverage for logging core/security modules; branch tests for redaction/token validation mandatory. Use thresholds after baseline measurements.
- Zero failing critical security suites; schema contracts green across Node and Python; nonblocking logging performance regression benchmark.
- Performance targets are **provisional**, not promises: p95 basic search <3s for pilot representative data; ingestion throughput and resource budgets to be established with agreed log volume.
- Release blocked on critical vulnerability without approved, documented exception.

## 6. CI stages
Format/lint → type check → build → schema fixtures → unit → ephemeral infra integration → security scans → Playwright e2e → package consumer smoke → artifact publication (approval). Use test DB/index namespaces and controlled seed data, never production credentials or customer logs.

## 7. Test evidence template
For each task capture test command, environment/image version, executed count, pass/fail/skip, coverage where measured, log snippets redacted, and defects with links. Tests NOT run must say **not run** and why. `06-PROJECT_MEMORY.md` references actual evidence and commit.

## 8. Release certification
Pilot services, privilege isolation, credential revocation, log rotation, ingestion replay, query load, deployment smoke, offsite backup and restore, performance budget, and documentation acceptance. Apply regression set to Skyra Platform component changes separately.
