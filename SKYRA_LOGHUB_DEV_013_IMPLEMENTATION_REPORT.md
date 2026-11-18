# DEV-013 — Implementation Report

PASS — implemented in isolation.

All evidence paths below are repository-relative under .tmp/dev013-evidence/. This is local run evidence from 2026-11-11, not production verification.

Normal BFF operation uses PostgreSQL with no in-memory fallback. The previous per-process session and pending OIDC maps could not survive restart or synchronize revocation. Explicitly isolated unit tests retain a gated memory adapter. Session tokens have 256 bits of randomness; only SHA-256 digests are persisted. AES-256-GCM encrypts minimal identity, CSRF and selected context with digest-bound authenticated data; no provider access/refresh/ID tokens or cached membership/role authority are stored. Dedicated database configuration and a separate 32-byte data key are mandatory. Normal launchers remove owner database URLs.

Additive docs/admin/migrations/DEV-013-001/migration.sql creates bff_sessions and bff_login_transactions with six indexes and eight checks. Ledger name: 20261110000000_dev013_sessions. SHA-256: a5005caa73ba15a153fb2b72901d4a87f537874e9a3cd3bf9fb249b1713a4e7a. Disposable ledger now contains 11 entries; all previous ten checksums are preserved. Both Prisma schemas append matching models, preserve their original byte prefixes and pass validation/generation. Preparation exercises transactional rollback, application and repeat no-op verification.

Insert-only creation prevents stale writes from reviving sessions. Reads check revocation, idle and absolute expiry against database time before decryption. Conditional activity updates cannot extend the absolute lifetime. Versioned context updates preserve identity. Rotation locks and revokes the old record and inserts the new token atomically, retaining the original absolute deadline; failure rolls back. The response cookie is emitted only after commit. Logout persists revocation. Two BFF processes share these authoritative decisions, with no positive session cache. A request already authorized before a concurrent revocation cannot be retroactively cancelled; subsequent validation rejects the old token.

Encrypted durable login transactions retain state, nonce, PKCE verifier, callback, issuer/client and browser binding. Atomic one-time consumption precedes token exchange. Transactions expire within ten minutes and active count is capped at 1000 under a global transaction lock. Signed controlled-provider tests verify restart before callback, state/binding/expiry rejection, concurrent one-exchange behavior and replay denial. Existing signature/JWKS, issuer, audience, nonce and PKCE checks remain intact. Failure after consumption requires restarting login; there is no unsafe callback replay.

Opaque HttpOnly cookies and existing Secure/localhost development policy are preserved. CSRF is required for authenticated mutation including rotation/logout; origin checks reject forbidden origins with 403. Rotation changes CSRF. Callback error instances redact query strings and correlation identifiers are bounded/encoded. Session verifiers, encryption keys, database credentials and raw provider tokens are absent from these reports.

Every protected request resolves current Admin membership and project authority. Explicit invalid/empty membership revokes the observed session; transient Admin failure fails closed without revoking a potentially valid session. Disabling tenant/member, changing scope and foreign-context attempts remain authoritative after restart. Restoration of a membership does not revive its previously revoked cookie.

skyra_bff_sessions_runtime is a restricted non-superuser with no elevated role capabilities or memberships: CRUD only on the two new tables; no TRUNCATE, schema CREATE, tenant/user, audit, credential, archive or accounting access. Existing Admin and Gateway grants remain unchanged and cannot read the new session tables. Required schema/role readiness is checked at initialization. Database configuration is explicit and never falls back to the owner URL.

Cleanup deletes at most the configured bounded batch per table (validated 1..500; scheduled default 100 every 60 seconds), using SKIP LOCKED. Two table passes commit independently and are safely repeatable. An actual child process was killed after the session DELETE committed; the next pass completed remaining login cleanup while active records survived. Expiry enforcement does not depend on cleanup running.

Actual disposable PostgreSQL stop/start produced sanitized 503 for lookup, creation, login and logout. No identity was fabricated and failed logout did not clear the valid cookie or pretend revocation succeeded. After recovery the original session identity, CSRF and absolute deadline remained consistent; expired or disabled-member sessions stayed invalid. Pool connection/query limits bound failures, readiness reports dependency failure, and there is no stale-authority fallback.

Angular retains the established cookie/CSRF flow. Direct-route hydration and refresh work after BFF crash. Temporary dependency errors expose Retry session without treating cached display state as authenticated authority; 401/419 clears auth. Auth epochs prevent late hydration from restoring state after logout. Logout hydrates current CSRF even on an unguarded unauthorized route and reports retryable backend failure. Signed-out labels and theme-compliant login messaging were corrected without redesign.

Operational references: docs/auth/DEV-013-session-invariants.md and docs/auth/DEV-013-session-operations.md. Source inventory below compares the initial run snapshot, not HEAD; it excludes unrelated pre-existing changes.

- apps/console-bff/tests/security/activation-readiness.test.ts

- apps/console-bff/tests/security/membership-freshness.test.ts

- apps/console-bff/tests/security/oidc-jwks.test.ts

- apps/console-bff/tests/security/oidc-signature.test.ts

- scripts/lib/integrated-migration-integrity.mjs

- scripts/lib/isolated-target.mjs

- scripts/protected-catalog-snapshot.mjs

- scripts/run-explorer-regressions.mjs

- scripts/run-integrated-acceptance.mjs

- scripts/verify-sdk-consumer.mjs

- tests/audit/persistence.test.mjs

- tests/developer/documentation.test.mjs

- tests/developer/sample.test.mjs

- tests/integrated/browser-scenarios.mjs

- tests/organization/organization.e2e.mjs

- tests/quotas/browser-scenarios.mjs

- tests/quotas/quota-boundaries.test.mjs

- tests/quotas/quota-integration.test.mjs

- tests/storage/database-restart.mjs

- tests/storage/lifecycle.test.mjs

- tests/storage/ownership.test.mjs

- apps/console-bff/package.json

- apps/console-bff/src/common/filters/problem-details.filter.ts

- apps/console-bff/src/config/bff-config.service.ts

- apps/console-bff/src/main.ts

- apps/console-bff/src/modules/auth/api/auth.controller.ts

- apps/console-bff/src/modules/auth/application/oidc.service.ts

- apps/console-bff/src/modules/auth/application/session-store.service.ts

- apps/console-bff/src/modules/auth/domain/session-store.port.ts

- apps/console-bff/src/modules/auth/domain/session.model.ts

- apps/console-bff/src/modules/auth/guards/session-auth.guard.ts

- apps/console-bff/tests/integration/bff-http.test.ts

- apps/console-bff/tests/integration/bff-query-proxy.test.ts

- apps/console-bff/tests/security/oidc.security.test.ts

- apps/console-bff/tests/security/session.security.test.ts

- apps/console-web/src/app/core/auth/auth.service.ts

- apps/console-web/src/app/features/login/login.component.ts

- apps/console-web/src/app/features/unauthorized/unauthorized.component.ts

- apps/console-web/src/app/layout/topbar/topbar.component.html

- apps/ingestion-gateway/prisma/schema.prisma

- apps/query-service/prisma/schema.prisma

- pnpm-lock.yaml

- apps/console-bff/src/modules/auth/application/memory-session.store.ts

- apps/console-bff/src/modules/auth/application/postgres-session.repository.ts

- apps/console-bff/tests/security/durable-store-config.test.ts

- apps/console-web/tests/auth-reliability.test.ts

- docs/admin/migrations/DEV-013-001/migration.sql

- docs/auth/DEV-013-session-invariants.md

- docs/auth/DEV-013-session-operations.md

- scripts/lib/session-migration-integrity.mjs

- scripts/lib/session-test-runtime.mjs

- scripts/prepare-session-tests.mjs

- scripts/run-session-regressions.mjs

- scripts/run-session-security.mjs

- tests/sessions/bff-fault-child.mjs

- tests/sessions/bff-process.mjs

- tests/sessions/browser-scenarios.mjs

- tests/sessions/cleanup-child.mjs

- tests/sessions/cleanup-recovery.test.mjs

- tests/sessions/http-security.test.mjs

- tests/sessions/identity-stack.mjs

- tests/sessions/migration.test.mjs

- tests/sessions/outage-recovery.test.mjs

- tests/sessions/persistence.test.mjs

Protected PostgreSQL snapshots before/after are byte-identical, SHA-256 90f73c6f2bc6bce568974e27472fd652505e3034284ff4a9883104b1fd02a6ff. Protected endpoint remained 127.0.0.1:5432; no protected writes, migrations or grants occurred. Physical/manifest target guards restricted writes to disposable PostgreSQL 17.9 at 127.0.0.1:5433, database skyra_loghub_disposable_validation. Final audit preserves all 1373 initial files, 201 historical report/migration/package artifacts and 37 immutable Platform archives; Platform stays clean at 928ca4343ab3a1887e586123a6ba5bb88b56a0ef. DEV-012 Gateway storage and Query runtime source is unchanged.

Real Entra tenant/app registration and Microsoft login remain pending external configuration. Protected environment migration, least-privilege role provisioning, independent encryption-key provisioning and coordinated BFF activation require separate authorized operations. All BFF instances must share issuer/client configuration and the data key. Key loss or incompatible key replacement invalidates encrypted sessions; no online multi-key rollover is implemented. Local synthetic measurements establish no production load/SLA or comparable in-memory baseline. No DEV-014, deployment, publication, real onboarding or Git commit/push was performed.
