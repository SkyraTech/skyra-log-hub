# Skyra LogHub — Web Console Authentication & Authorization Architecture

**Document Version:** 1.1.0  
**Status:** Implemented & Verified in Milestone `LOGHUB-CONSOLE-003`  
**Phase:** Phase 4 — Web Console, Administration & Observability Experience  
**Date:** 2026-10-27  
**Implementation Package:** `@skyra/console-bff` (`apps/console-bff`) & `@skyra/console-web` (`apps/console-web`)  

---

## 1. Browser Authentication Strategy & Threat Defense

Storing long-lived JWT access tokens or refresh tokens in browser storage (`localStorage` or `sessionStorage`) is **strictly prohibited** by enterprise security standards due to the risk of token exfiltration via Cross-Site Scripting (XSS).

The Skyra LogHub Web Console adopts a **Backend-for-Frontend (BFF) Session Security Pattern**:

```text
┌─────────────────────────┐          ┌───────────────────────────┐          ┌─────────────────────────┐
│     Angular Browser     │          │    BFF / Gateway Server   │          │   Corporate OIDC IdP    │
│    (apps/console-web)   │          │ (Fastify / Reverse Proxy) │          │ (Entra ID, Okta, IdP)   │
└────────────┬────────────┘          └─────────────┬─────────────┘          └────────────┬────────────┘
             │                                     │                                     │
             │ 1. Click "Sign in with SSO"         │                                     │
             │────────────────────────────────────>│ 2. Generate PKCE & State            │
             │                                     │────────────────────────────────────>│
             │                                     │                                     │
             │ 3. User authenticates with MFA at IdP                                     │
             │<──────────────────────────────────────────────────────────────────────────│
             │                                     │                                     │
             │ 4. Redirect with auth code + state  │                                     │
             │────────────────────────────────────>│ 5. Code exchange with PKCE verifier│
             │                                     │────────────────────────────────────>│
             │                                     │ 6. Returns Access & Refresh JWTs    │
             │                                     │<────────────────────────────────────│
             │                                     │                                     │
             │ 7. Set-Cookie: __Host-skyra-session │                                     │
             │    (HttpOnly, Secure, SameSite)     │                                     │
             │<────────────────────────────────────│                                     │
             │                                     │                                     │
             │ 8. API Call (cookie automatically)  │ 9. Injects Bearer JWT               │
             │────────────────────────────────────>│────────────────────────────────────>│
             │                                     │    (Internal Query Service: 3100)   │
```

### 1.1 Cookie Security Attributes
- **Name:** `__Host-skyra-session` (Enforces HTTPS, top-level domain, and root path).
- **`HttpOnly: true`:** JavaScript cannot read the cookie document object, preventing token theft.
- **`Secure: true`:** Transmitted exclusively over TLS/HTTPS.
- **`SameSite: Strict`:** Defends against Cross-Site Request Forgery (CSRF).
- **`Path: /`:** Bound to the application root.

---

## 2. Multi-Tab Session Synchronization

When a user logs out or experiences session expiration in one browser tab, all other active tabs must immediately lock to prevent unauthorized access:

- Implemented using the browser **`BroadcastChannel` API** (`skyra-auth-channel`).
- Events emitted:
  - `SESSION_LOGOUT`: Triggers immediate cache purge and navigation to `/login`.
  - `SESSION_REFRESHED`: Synchronizes expiration timers across all tabs.
  - `TENANT_CHANGED`: Reloads active workspace context.

---

## 3. Role-Based Access Control (RBAC) Hierarchy

The administrative permission model is structured into five distinct roles:

```text
       ┌───────────────┐
       │   OrgOwner    │  Full tenant governance, billing, decommissioning
       └───────┬───────┘
               ▼
       ┌───────────────┐
       │   OrgAdmin    │  User invitations, project creation, credential management
       └───────┬───────┘
               ▼
       ┌───────────────┐
       │ ProjectAdmin  │  Quota management, project credentials, retention
       └───────┬───────┘
               ▼
       ┌───────────────┐
       │   Developer   │  Query, search, aggregations, event detail inspection
       └───────┬───────┘
               ▼
       ┌───────────────┐
       │    Viewer     │  Read-only dashboard metrics and search views
       └───────────────┘
```

### 3.1 Permission Matrix

| Capability / Action | Viewer | Developer | ProjectAdmin | OrgAdmin | OrgOwner |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Search Logs (`searchLogs`)** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Inspect Event Detail (`getLogEventById`)** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **View Analytics (`aggregateLogs`)** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **View Facets (`getLogFacets`)** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Export Log Data (JSON/CSV)** | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Manage Ingestion Keys** | ❌ | ❌ | Assigned Proj | ✅ | ✅ |
| **Configure Project Quotas** | ❌ | ❌ | Assigned Proj | ✅ | ✅ |
| **Create / Archive Projects** | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Invite / Manage Team Members**| ❌ | ❌ | ❌ | ✅ | ✅ |
| **Decommission Tenant** | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## 4. Production vs. Development Authentication Boundary

1. **Production Mode (`NODE_ENV === 'production'`):**
   - Requires valid `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, and corporate JWKS.
   - Mock tokens and dev bypasses fail closed at startup.
2. **Local Development Mode:**
   - Query Service supports mock developer claims (`sub: "dev-alex"`, `tenant_id: "tenant-acme-prod"`, `projects: ["*"]`, `roles: ["OrgAdmin"]`).
   - Enables offline local testing without external corporate network dependencies.
