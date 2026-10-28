# @skyra/console-bff — Backend-for-Frontend (BFF) Security Gateway

## Overview

`@skyra/console-bff` is the enterprise security boundary for the Skyra LogHub Web Console adhering strictly to **ADR-024 (Backend-for-Frontend Architecture)**. It provides:

1. **OIDC Authorization Code Flow with PKCE S256**: Standards-compliant OpenID Connect integration with cryptographically unguessable state and nonce parameters.
2. **Server-Side Secure Sessions**: Encrypted, opaque session identifiers stored server-side and transmitted via `__Host-skyra-session` HTTP-only, SameSite=Lax, Secure cookies. Browser JavaScript never receives long-lived tokens.
3. **Authoritative Workspace & Tenant Membership**: Explicit `IMembershipProvider` port that isolates tenants and projects. In production, membership resolution fails closed unless connected to an authoritative IAM directory.
4. **Scoped Internal Query Proxy**: Authenticates browser sessions, verifies project membership, and mints short-lived (60s) internal JWTs (`iss: https://auth.skyra.internal`, `aud: skyra-loghub-query`) bound strictly to the authorized tenant and project.
5. **CSRF Protection**: Origin verification and timing-safe `X-CSRF-Token` validation on all state-changing operations.
6. **RFC 7807 Problem Details**: Consistent machine-readable error responses across all failure scenarios.

---

## Architectural Trust Boundaries

```text
Browser (Angular Console)
  │
  │ HTTPS / Same-Origin
  │ Secure HTTP-only Cookie (__Host-skyra-session)
  ▼
Console BFF (:3200)
  │
  │ Verified User Identity
  │ Authoritative Server-side Membership Resolution
  │ Scoped HS256/RS256 Internal JWT (60s TTL)
  ▼
Query Service (:3100)
  │
  │ Independent Token Verification & Tenant Enforcement
  │ Trusted Parquet & JSONL Engine (DuckDB)
  ▼
Canonical Telemetry Storage
```

---

## BFF API Endpoints

| Method | Path | Description | Protection |
|---|---|---|---|
| `GET` | `/bff/auth/login` | Initiates OIDC PKCE flow, returns auth URL | Public |
| `GET` | `/bff/auth/callback` | Validates code, state, nonce; creates session; sets cookie | Public / OIDC IdP |
| `POST` | `/bff/auth/logout` | Revokes session in store, clears session cookies | SessionAuthGuard + CsrfGuard |
| `GET` | `/bff/session` | Returns safe session DTO (user, active workspace, CSRF token) | SessionAuthGuard |
| `GET` | `/bff/me` | Returns user profile and memberships | SessionAuthGuard |
| `GET` | `/bff/workspaces` | Lists authorized tenants and projects | SessionAuthGuard |
| `POST` | `/bff/workspaces/select` | Updates active workspace in session context | SessionAuthGuard + CsrfGuard |
| `GET` | `/bff/csrf` | Returns current CSRF token | SessionAuthGuard |
| `POST` | `/bff/query/search` | Proxies log search query with scoped internal JWT | SessionAuthGuard + CsrfGuard |
| `GET` | `/bff/query/events/:eventId` | Proxies single event retrieval | SessionAuthGuard |
| `POST` | `/bff/query/aggregate` | Proxies analytical time-series aggregations | SessionAuthGuard + CsrfGuard |
| `POST` | `/bff/query/facets` | Proxies dynamic facet discovery | SessionAuthGuard + CsrfGuard |

---

## Testing & Quality Gates

Run BFF security and integration tests:
```bash
pnpm --filter @skyra/console-bff test
```

Test breakdown:
- `tests/security/oidc.security.test.ts`: OIDC PKCE, state/nonce replay, signature, issuer/audience validation (10 tests).
- `tests/security/session.security.test.ts`: Fixation prevention, cookie flags, idle/absolute expiry, revocation (10 tests).
- `tests/security/authorization.security.test.ts`: Workspace isolation, cross-tenant denial, production fail-closed (10 tests).
- `tests/security/csrf-proxy.security.test.ts`: CSRF validation, origin checking, query token verification (10 tests).
- `tests/integration/bff-http.test.ts`: Real HTTP end-to-end authentication lifecycle (3 tests).
- `tests/integration/bff-query-proxy.test.ts`: Query proxy search, facets, point lookup, CSRF, tenant scoping, and batch aggregation proxying (9 tests).
Total: 52 passing tests.
