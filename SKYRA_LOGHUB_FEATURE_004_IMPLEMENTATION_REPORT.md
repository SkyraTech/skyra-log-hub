# FEATURE-004 — Ingestion Credential Management

Date: 2026-11-05. Scope: implementation and acceptance in isolation. See the companion final acceptance report for the final verdict and exact verification results.

## Source inventory and decisions

Existing: ingestion_credentials stores unique SHA-256 key_hash, key_prefix, description, tenant, allowed-project/environment arrays, expiry, revocation flag and best-effort authentication timestamp. Gateway uses indexed Prisma lookup on every authentication, checks tenant and project ACTIVE state, then performs synchronous-fsync WAL admission and optional JSONL archive append. No credential cache or external queue is used in the default local path. Admin has canonical credential capabilities/events and proposed contracts but no credential service/controller. Console has real Project Management and packaged Platform controls, but no credential UI. SDK-facing protocol is Authorization: Bearer with the existing ingestion batch contract.

Security decision: keep the existing secure verifier protocol for high-entropy bearer secrets. Newly issued secrets use 32 cryptographically random bytes (256 bits), encoded as `skyra_live_<64 lowercase hex>`. Persist SHA-256 only, never recoverable plaintext. This is a high-entropy token verifier, not a password hash; no separate pepper/key is needed. Database lookup is unique/bounded; Gateway additionally compares fixed-size digests with timingSafeEqual. The public prefix is the constant `skyra_live_`, exposing none of the random bytes; credential UUID identifies individual keys. Existing valid legacy bearer formats remain supported with bounded parsing.

New credentials belong to exactly one server-authorized project. Existing exact-single-project legacy rows can be mapped only when tenant/project consistency and valid verifier are established; wildcard/multi-project/unknown rows remain unchanged and are not silently adopted into project management. Existing SDK authentication is not rewritten.

Creation uses the existing description label (3–255 trimmed characters), explicit bounded environments (production default), rate limit (600 default; existing 60–60000 contract) and expiry (90 days default, 1–365). Duplicate labels are allowed; UUIDs distinguish credentials. New scopes cannot use project/environment wildcard. Canonical roles/capabilities remain unchanged: OrgOwner/OrgAdmin and scoped ProjectAdmin have credential read/create/rotate/revoke; Developer has read/rotate but not create/revoke; Viewer has none. Rotation does not broaden scope, rate or expiry.

Replacement decision: explicit overlap until old-key revocation or original expiry, not an implicit zero-downtime promise. Each source permits one replacement; concurrent/retried rotation cannot issue additional children. Replacement inherits source project, environments, rate and absolute expiry. A revoked/expired source cannot rotate. Revocation is terminal and repeated revoke is safe without duplicate audit. Create/rotate require a request UUID; retry never replays a secret. If a response is lost, review metadata and revoke the unconfigured credential, then deliberately issue another request. Secrets are returned only after the entire transaction commits.

Management reuses authoritative Project/IAM authorization, plus the specific credential capability. Read/revoke can remain available for inactive projects; issuance/replacement require ACTIVE. Tenant/project/membership locks coordinate with existing feature mutations. Credential mutation, version and safe correlated canonical audit are atomic. Gateway authenticates each request against persisted state; requests starting after revocation commit fail without a cache delay. Already authenticated/in-flight work is not retroactively cancelled. Last-used is legacy best-effort authentication activity, not proof of ingestion; the UI does not advertise it as reliable usage telemetry.

One-time UI handoff: masked by default, reveal/copy in browser memory only, explicit saved acknowledgement, clear on leaving/destroy/pagehide, never URL/history/storage/notifications/analytics. Authorized browser network tools can observe the creation response; this is not claimed to be technically hidden from the recipient. Screenshots/traces must not persist revealed secrets. No plaintext, full verifier or credential-bearing request headers enter reports/audits/application logs.

Durability acceptance uses fresh, marked, physically verified disposable WAL/archive directories and the verified disposable PostgreSQL. It distinguishes HTTP admission, fsynced WAL receipt, PostgreSQL receipt and finalized archive evidence; it will not claim full query availability from HTTP acceptance alone.

## Implemented vertical slice

| Layer | Implementation |
|---|---|
| PostgreSQL / Prisma | Additive project/creator/replacement/request/version fields on the canonical table; composite scope FKs, unique issuance/replacement constraints, immutable-scope/permanent-revocation trigger; identical Gateway/Query Prisma mappings |
| Administration | `modules/credentials/credentials.service.ts`, `api/controllers/credentials.controller.ts`; registered in AppModule; reuse `ProjectsService.credentialAccess` and canonical permission resolver/audit repository |
| Trusted assertions | Credential operation scopes require the existing configured internal signing key, issuer/audience verification and bounded assertion lifetime; no ingestion-token administrative authentication |
| Console BFF | `modules/auth/api/credentials.controller.ts` and existing Admin client/AuthModule; tenant from session, CSRF/Origin on mutations, narrow operation assertions, whitelist metadata projection |
| Angular | `features/credentials/credentials-api.service.ts` and component TS/HTML/CSS; guarded list/new/detail routes, project detail entry button, actual HttpClient calls |
| Gateway | Existing AuthService: bounded input, exact new format, indexed digest lookup and constant-time digest verification, safe lookup failures; existing Prisma repository selects only authorized columns and updates last-used without reviving revoked keys |
| Contracts | `contracts/admin/v1/managed-credentials.openapi.yaml` and managed request/metadata/issued JSON schemas; main OpenAPI links implemented tenant-scoped routes and labels historical unscoped proposals unimplemented |
| Verification | Guarded preparation/runner, persistence tests, real Gateway stack, combined signed-provider browser scenarios, BFF projection and Gateway failure tests, contract tests |

## API and lifecycle contract

Admin base: `/admin/v1/tenants/:tenantId/projects/:projectId/credentials`.
BFF base: `/bff/projects/:projectId/credentials`.

| Method / suffix | Result / controls |
|---|---|
| GET base | `{items,nextCursor,canCreate,project}`; search by label/credential UUID/request UUID, ACTIVE/EXPIRED/REVOKED, name/creation sorting, asc/desc, bounded 1–100 limit, filter/actor/project-bound cursor |
| GET `/:id` | Safe metadata and ETag; no rawToken/keyHash; 404 for inaccessible project/record |
| POST base | 201, metadata + rawToken once; required UUID Idempotency-Key; strict creation DTO |
| POST `/:id/rotate` | 201, replacement + rawToken once; `{}`, If-Match and new UUID Idempotency-Key required |
| POST `/:id/revoke` | 200 revoked metadata; `{}` and If-Match required; terminal and replay-safe |

All credential responses carry no-store/no-cache/no-referrer headers. Mutation audit receives a validated/generated correlation ID. Missing version is 428, malformed inputs 400, stale/reused/inactive issuance 409, authentication 401, capability/CSRF denial 403, inaccessible scope 404, safe persistence failure 503. The BFF validates context and actions and explicitly removes arbitrary upstream fields. Browser-controlled tenant/user/role fields are not accepted.

Rotation serializes source updates and allows one replacement. Create/rotate insert only explicit authorized columns, then load safe metadata and append audit in the same transaction; plaintext is returned after commit. The management runtime cannot SELECT key_hash. Audit failure rolls back create, rotate and revoke. Concurrent same-request create, rotation, revocation and rotate/revoke races have real PostgreSQL tests.

## Console and Platform integration

Screens provide persisted filtering/pagination, metadata details, validation, busy/loading, empty/permission/error/retry/conflict states, deliberate rotation/revocation confirmation, and lost-response review by issuance reference. One-time handoff is masked by default and supports reveal/hide/copy/saved acknowledgement. Acknowledgement, route change, destruction and pagehide clear the component secret; Angular same-component detail route reuse is handled. Unsaved/handoff navigation prompts are preserved. Clipboard is an explicit recipient-controlled destination; tests restore its previous contents.

Reuses installed public Platform app-shell, table, input, dropdown, dialog, badge, empty-state and notification 0.1.0; button, loader and design-tokens 0.1.1. No dependency or archive replacement, Platform source copying or shared primitive fork. Consumer accessibility adapters follow FEATURE-002/003: native dialog label, one interactive menu-item role, supported outline button variant and theme tokens. Tables scroll inside their responsive panel. Governance passes. Screenshot inspection confirms desktop/mobile layout and masked handoff; scoped Axe results are not full WCAG certification.

## Compatibility and boundaries

Existing SHA-256 Gateway authentication and bearer/batch protocol remain compatible. Unambiguous legacy single-project digest rows can be adopted; wildcard/multiple/invalid legacy scopes remain outside the project manager. Existing legacy Gateway behavior is preserved, not certified as newly generated 256-bit entropy. No public plaintext retrieval, delete, scope widening, reactivation or generic credential editor was added.

The inspected SDK packages produce canonical structured events/local emitters; no supported HTTP ingestion-credential configuration was found to extend. Acceptance sends the existing canonical ingestion batch with a bearer header to the actual Gateway. SDKs, Query architecture, quota policy and the ingestion durability pipeline were not redesigned. The existing Node SDK-to-query pipeline is separately covered by Query regression tests.

No protected migration, real owner/customer bootstrap, Microsoft account setup, deployment, Git commit/push/reset/rebase/merge or FEATURE-005 work was performed. Existing uncommitted FEATURE-001/002/003 work and reports were retained.
