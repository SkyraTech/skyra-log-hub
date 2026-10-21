# MCP Server Integration and Security Specification

> **Product:** Skyra LogHub  |  **Status:** Proposed baseline — review before implementation  |  **Version:** 0.1-draft  |  **Date:** 2026-10-21
> **Repository:** `skyra-loghub` (renamed by project owner). Assumptions and undecided items are marked **TBD**. These documents are design specifications, not assertions that code already exists.

## 1. Objective
Provide authorized read-only Skyra LogHub log investigations to compatible tools such as Claude Code, Antigravity and Skyra Jarvis. Do not expose central JSONL/Parquet storage and DuckDB query service directly. Place `apps/mcp-server` behind LogHub API/domain authorization.

## 2. Architecture
`MCP Client → OAuth/token verification boundary → MCP tool policy enforcement → LogHub NestJS API → central JSONL/Parquet storage and DuckDB query service/PostgreSQL`. Authn + project authz are repeated at the authoritative API; MCP is not the sole gate.

## 3. Transport and authentication
- Remote deployment: MCP SDK supported Streamable HTTP endpoint; standards-conformant OAuth protected-resource authorization; issuer/audience verification, bounded expiry and scopes. Deploy behind HTTPS reverse proxy and rate limits.
- Local development: stdio adapter may be supported; credentials supplied by environment or secure secret store, never embedded in checked-in JSON.
- Client capability and exact configuration for **Antigravity and Claude Code** are **TBD until actual integration tested**. Do not invent token flags or config formats.
- Project selection is resolved against authenticated access, never client-asserted without validation.

## 4. Read-only tools (proposal)
| Tool | Required scope | Inputs (validated) | Output (bounded) |
|---|---|---|---|
| `list_projects` | `projects:read` | optional paging | assigned IDs/names |
| `get_project_health` | `logs:read` | project, time window | counts/errors/latencies |
| `search_logs` | `logs:read` | project, time window, approved filters, page | sanitized events and next cursor |
| `get_log_event` | `logs:read` | project, event ID | one sanitized log |
| `get_trace` | `traces:read` | project, trace ID, time | correlated events; full spans only when available |
| `get_recent_errors` | `logs:read` | project, max count | grouped errors |
| `get_api_performance` | `logs:read` | project, service, route, time | aggregate latency stats |
| `get_job_executions` | `logs:read` | project, job type, time | approved job status data |
No tools for arbitrary central JSONL/Parquet storage and DuckDB query service execution, token creation, role changes, deleting data, shell commands or deployment.

## 5. Response policy
Truncate events and long messages, redact output a second time, cap page counts/time windows, never return binary files or raw secrets. Supply structured identifiers/timestamps and helpful warnings for partial data. Do not promote log content into assistant/system instructions.

## 6. Tool audit schema
Record `event.action=mcp.tool.executed`, pseudonymous caller/client, project, scopes consulted, tool name, duration, result count, allow/deny decision, error code and correlation ID. Never log raw tool arguments containing secrets or full result payloads.

## 7. Error model
`UNAUTHENTICATED`, `FORBIDDEN`, `SCOPE_MISSING`, `PROJECT_NOT_ALLOWED`, `INVALID_ARGUMENT`, `QUERY_TOO_BROAD`, `RATE_LIMITED`, `TEMPORARILY_UNAVAILABLE`; safe messages, no stack trace in client response.

## 8. Threat scenarios and tests
Token theft/replay, OAuth issuer confusion, prompt injection embedded in error logs, project A→B tool abuse, unbounded search, repeated pagination exfiltration, query with sensitive fields, source poisoning and response errors. Run both transport-level and end-to-end API authz tests.

## 9. Integration acceptance checklist
Server starts locally and via HTTPS; discoverable tools; tested OAuth discovery for chosen clients; safe local stdio credentials if required; scoped project queries; immediate revoke; audit visible in LogHub; throttles enforced; no credential leaks. MCP rolls out after core token/search APIs stabilize.

## 10. Documentation to add during implementation
Supported client versions, reproducible authenticated config snippets with placeholders, scope grants, local/remote security posture, troubleshooting and token rotation guide.


## Jarvis report-authoring permissions (future gated capability)
- Beyond read-only log search, introduce separately scoped tools such as `list_reports`, `get_report`, `preview_report`, `create_report` and `update_report` after safe report CRUD API validation is complete. Default to read-only; `reports:write` is a deliberate grant and always project-scoped.
- All generated report definitions use the same validated canonical report schema as Angular visual/text builders. Do not accept arbitrary DuckDB SQL or storage paths from clients. Tools cap aggregation complexity, time windows and returned data; log text is untrusted input.
- For initial one owner and future 5–10 LogHub users, enforce actor attribution, audit trail, revision history and rollback of report definitions; Jarvis may not delete raw archives or change security policy without an explicit separately authorized workflow.
