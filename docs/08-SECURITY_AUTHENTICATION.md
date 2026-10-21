# Security, Authentication and Authorization Specification

> **Product:** Skyra LogHub  |  **Status:** Proposed baseline — review before implementation  |  **Version:** 0.1-draft  |  **Date:** 2026-10-21
> **Repository:** `skyra-loghub` (renamed by project owner). Assumptions and undecided items are marked **TBD**. These documents are design specifications, not assertions that code already exists.

## 1. Security objectives and threat model
Protect production diagnostics, developer identities, project boundaries, MCP access and ingestion credentials. Threats include credential theft, malicious log injection/XSS, Elasticsearch query abuse, prompt injection through logs, cross-project leakage, insecure remote log submission, log tampering, exfiltration via export and resource exhaustion.

## 2. Human authentication
- OIDC provider **TBD** (Microsoft Entra ID or another validated provider); require MFA enforced at provider.
- Authorization Code + PKCE where applicable; server-managed sessions with short-lived secure `HttpOnly`, `Secure`, appropriately `SameSite` cookies; CSRF defense for state-changing cookie-authenticated APIs.
- Secure session rotation, logout, idle/absolute expiration, account disable and device/session revocation; log security events without secrets.
- Prefer same-origin reverse proxy for Angular→API to minimize cross-origin cookie complexity; disallow wildcard CORS with credentials.

## 3. Roles and project scoping
| Role | Permissions |
|---|---|
| `super_admin` | System configuration, controlled cross-project operations, membership governance |
| `project_admin` | Project-scoped roles, searches, approved source settings |
| `developer` | Assigned project queries, traces/errors, saved views |
| `viewer` | Read-only sanitized search in assigned projects |
All data APIs and MCP tools enforce membership **server-side** per request and apply query-level project/environment filters. UI hiding is not security. Export is separate permission; administrative scopes never default on.

## 4. Machine/API token model
- **Opaque personal/service access tokens** for supported automation clients: high-entropy random bytes, prefixed non-secret lookup ID, one-time reveal, keyed hash/HMAC verifier at rest, key rotation strategy.
- Metadata: credential ID, owner service/user, allowed project IDs, scopes, createdBy, createdAt, expiresAt, lastUsedAt, revokedAt, issuance purpose, optional network restriction.
- Suggested short defaults: 7 days personal token; service credentials use bounded rotation intervals set by policy; maximum validity 30 days unless explicit admin exception; never unlimited validity for new tokens.
- Verify token validity, revocation, principal active state, allowed scope and project at every access (cache with immediate invalidation). Use constant-time verifier comparison.
- UI create/list/revoke/rotate, once-only secret display and access audit. Never store/log raw tokens, even in audit entries or error messages.
- Token issuance and rotation restricted by role; cannot grant scope beyond issuer's effective access (anti-escalation).

## 5. OAuth for remote MCP
Remote MCP access follows its supported OAuth protected-resource flow; require audience-bound access tokens, discovery metadata, verifiable issuer, expiry, scopes, user/client identity and resource restrictions. **API keys cannot simply be treated as OAuth bearer tokens without a validated auth bridge.** Check actual Antigravity/Claude Code MCP client behavior during integration; support authorized local stdio with credential injection where necessary.

## 6. Ingestion identity
Dedicated service/agent credentials, transport TLS or mTLS, credential ↔ project/service mapping; quota, network controls, schema allowlist, payload caps, batch caps, integrity checks, replay resistance where appropriate; no browser shared ingestion secret.

## 7. Rate limiting (initial nonbinding configuration)
| Surface | Starter cap | Additional enforcement |
|---|---|---|
| Failed login | 5 per 15min per account/IP combination | progressive delays; avoid attacker-forced lockout |
| Search | 60/min/user | max 24h initial window, result page cap, timeout, aggregation budget |
| Export | 5/hour/user | async job, max bytes, full audit |
| Machine/MCP | 30/min/credential | per-project scopes and output cap |
| Ingest | configurable per source | EPS/batch/size/disk budgets and backpressure |
Distributed counters in Redis/Valkey; use gateway/WAF controls for high-volume abuse. Validate defaults via load tests and legitimate usage; account for NAT and proxy IP trust.

## 8. Application/API hardening
- Secure headers, CSP with no unnecessary inline script, input validation and output encoding; JSON viewer treats logs as **untrusted strings**, no innerHTML.
- Query API uses allowlisted parsed AST with fixed authenticated project filters, short timeouts, result caps, cancellation, query depth and field cardinality limits.
- Protect against SSRF in webhook/URL inputs; egress restrictions, DNS/IP checks; no log-message URLs auto-opened.
- Dependency scanning, SBOM, signed/pinned container images, least-privilege runtime, read-only filesystem where feasible and no root containers.

## 9. Data protection and storage
TLS internal/external; encrypted volumes/backups; secrets via vault/provider; PostgreSQL and Elasticsearch private endpoints. Segregate operational logs vs tamper-evident security audit record. Audit login, token issue/revoke, access denial, role changes, queries and exports; audit records must never reveal raw secrets or confidential query results.

## 10. Logging privacy rules
SDK sanitizes first; ingestion sanitizes again. Prohibit authentication headers, cookies, body dumps, SQL bind parameters, AI prompts and sensitive IDs by default. Apply field allowlist, nested object sanitization and bounded size; review retention and data residency with stakeholders before production use.

## 11. Security test gate matrix
| Test | Expected result |
|---|---|
| Project A token requests B | 403, no data, audited |
| Expired/revoked token | 401/403 without grace leakage |
| Stolen token attempts scope elevation | Denied server side |
| Malicious log string `<script>` | Rendered as plain text |
| Arbitrary ES DSL/ES|QL commands | Reject unsupported/unscoped statements |
| Flood oversized JSON/batches | Reject/throttle without service crash |
| MCP attempts log-driven prompt injection | Tool remains read-only and scoped |
| Session CSRF and logout | State mutation protected, old session invalid |
| Redaction fixtures (nested secrets/SQL) | Secrets absent from files/index/search/export |

## 12. Incident response
Revoke compromised credential and sessions, check audits, rotate related secrets, quarantine suspicious source, preserve signed relevant evidence under restricted access, restore/backfill as appropriate and document impact. Define incident owner/rotation and notification channel **TBD**.
