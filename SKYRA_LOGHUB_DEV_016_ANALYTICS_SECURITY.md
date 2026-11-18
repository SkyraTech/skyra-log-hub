# DEV-016 Analytics Security Acceptance

Verdict: PASS in verified isolation. No production activation or real identity-provider configuration.

| Boundary | Enforcement and verified result |
|---|---|
| Session / CSRF | BFF session guard, CSRF on mutations/query POST, no-store; expired/revoked/logout polling stops. Existing session HTTP, outage and cleanup regressions pass. |
| Query authority | BFF derives tenant, actor and project authorization through current IAM; signed trusted context reaches Query. No browser-supplied actor/tenant overrides. |
| Tenant/project isolation | Foreign SDK events remain excluded; foreign/inactive projects denied. Exact correlation is an additional filter, never authority. |
| Response scope | BFF deep public projection rejects foreign scopes, false completeness, mismatched filters, invalid counts, excessive rows/body size. Canary fields cannot cross the boundary. |
| Preference ownership | Server derives owner; project + tenant + authenticated user is the key. A second owner/admin receives their own defaults, not another user's settings. |
| Current IAM | Read/write/reset require logs.analytics and active tenant/project/membership. Revoked/suspended/deleted context denied; retained preferences do not grant access. |
| Concurrency | If-Match required (428 absent); stale version 409; advisory transaction lock serializes creation/update/reset. Reset increments the version and prevents ABA restoration. |
| Payload | Exact seven-field v1 settings; forbidden fields, malformed intervals, oversized settings and unsafe versions rejected. Preferences contain no correlation IDs, absolute custom times or credentials. |
| SQL / limits | Canonical filter compiler and server-owned scope; fixed request shape, 4KiB request, seven-day range, 240 buckets, ten services, 1MiB response. No service-by-service RPC loop. |
| Lifecycle | Route-owned completion-driven refresh, context abort/generation, hidden-state suppression, auth failure stop, bounded retry backoff. BFF four active handlers and 15s deadline; Query 14s dashboard deadline. |
| Completeness | Partial sources do not become complete zeros. All-unavailable metrics are null; incomplete comparisons suppressed. Previous and current status remain separate. |
| Persistence grants | Only Admin runtime SELECT/INSERT/UPDATE on preferences; no DELETE/TRUNCATE. Gateway, Query and BFF have no direct preference privileges. FK/check/unique constraints verified. |
| Privacy | Private settings are not copied into tenant-wide audit history. No tokens, passwords or session cookies in published evidence. |
| Protected environment | Read-only repeatable-read catalog snapshots match; migration executed only on physically verified disposable PG. |

Evidence: [preferences.log](.tmp/dev016-evidence/preferences.log), [preference-migration.log](.tmp/dev016-evidence/preference-migration.log), [contracts.log](.tmp/dev016-evidence/contracts.log), [session-http-security.log](.tmp/dev016-evidence/session-http-security.log), [advanced-analytics-e2e.json](.tmp/dev016-evidence/advanced-analytics-e2e.json), [final-audit.json](.tmp/dev016-evidence/final-audit.json).

Coverage includes actual PostgreSQL restart, BFF crash/new signed session, concurrent edits, cross-user isolation, CSRF, revoked/suspended users, inactive projects, missing/corrupt archives, Query outage/deadline and stale-response cancellation. Isolated signed OIDC is test configuration; real Microsoft login remains an external activation prerequisite. Features remain default-off without explicit local test flags.
