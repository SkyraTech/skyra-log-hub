# @skyra/admin-service — Enterprise Administration Service

**Service Name:** Skyra LogHub Administration Backend (`apps/admin-service`)  
**Internal Port:** `3300` (Configurable via `PORT`)  
**Phase:** Phase 4 — Administration Backend Foundation  
**Task ID:** `LOGHUB-ADMIN-002`  
**Architecture:** Clean Architecture (`API → Application → Domain ← Infrastructure`)  

---

## 1. Overview

`apps/admin-service` is the dedicated backend authority responsible for:
* Multi-tenant identity resolution and enterprise OIDC anchoring (`@@unique([issuer, subject])`).
* Tenant workspace and project memberships.
* 5-tier hierarchical RBAC (`OrgOwner`, `OrgAdmin`, `ProjectAdmin`, `Developer`, `Viewer`) and 22-capability permission resolution.
* Atomic transactional administrative audit logging.
* Ingestion credential lifecycle management and rotation (ADMIN-004).
* Quota and retention policy administration (ADMIN-004).

---

## 2. Gate A Execution Status

In compliance with **Gate A** safety guidelines:
* Database persistence against live `skyra_loghub_dev` is **disabled by default** behind `AdminConfigService.persistenceEnabled = false`.
* High-assurance in-memory adapters implement and verify all domain invariants, referential checks, last-owner constraints, and RBAC rules.
* Live PostgreSQL migration execution is staged under `docs/admin/migrations/ADMIN-002/` awaiting explicit Gate B approval.

---

## 3. Directory Layout

```text
src/
├── core/
│   ├── config/          # Environment & service configuration
│   ├── errors/          # RFC 7807 Problem Details definitions
│   ├── security/        # Service-to-service assertion verification
│   └── audit/           # Audit event domain models & persistence ports
├── modules/
│   ├── identity/        # OIDC tuple resolution, user state invariants
│   ├── authorization/   # RBAC capability matrix & effective permission resolver
│   ├── membership/      # Tenant/project membership & revocation management
│   └── bootstrap/       # Idempotent first-owner bootstrap service
├── api/
│   ├── controllers/     # Health, liveness, readiness, and capability metadata
│   └── filters/         # Global RFC 7807 exception filter
├── app.module.ts        # NestJS dependency injection composition root
└── main.ts              # Fastify bootstrap & graceful shutdown handler
```

---

## 4. Scripts & Verification

* `pnpm build`: Compiles TypeScript to `dist/`.
* `pnpm typecheck`: Strict typecheck with `tsc --noEmit`.
* `pnpm test`: Runs all unit, security, and API test suites via Node native runner (`dist-test/`).
