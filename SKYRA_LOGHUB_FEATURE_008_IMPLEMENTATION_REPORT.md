# FEATURE-008 — Implementation report

Verdict: **PASS — FEATURE-008 IMPLEMENTED IN ISOLATION**. Technical resource management only.

## Source inventory and reuse

| Area | Existing | Missing before FEATURE-008 | Action |
|---|---|---|---|
| Quota model | ProjectQuota, tenant/project FK, batch/payload/per-second fields | Daily policy/version | Extend existing table; preserve legacy fields |
| Usage | Seven-day receipts and archive catalog | Authoritative window counters/permanent accounting | Add usage windows, admission ledger, journal registry |
| Gateway | Auth/rate/validation/ACTIVE checks, WAL fsync, receipts, archive publication | Shared daily enforcement and cross-resource recovery | Integrate reservation/finalization and owned reconciliation |
| Concurrency | In-process same-batch lock, exclusive WAL ownership | Cross-Gateway project budget serialization | Pinned PostgreSQL advisory lock |
| Admin | Persisted membership/capabilities, QUOTA_UPDATED audit type | Usage and daily policy implementations | Reuse authorization/audit; strict ETags and limits |
| BFF | Opaque sessions, CSRF, signed assertions, active tenant | Typed usage/policy proxy | Add no-store, scope-checked response projections |
| Angular | Project Settings, Platform shell/buttons/inputs/tokens | Real usage page/settings | Add project navigation and responsive usage composition |
| Tests | Actual SDK/WAL/PostgreSQL/OIDC/browser harnesses | Quota boundaries and crash windows | Extend harnesses; retain prior-feature regression evidence |

## Metering and policies

Accepted events are normalized event-array entries in a durably admitted batch. Canonical ingestion bytes are Buffer.byteLength(JSON.stringify(normalizedEvents), 'utf8'): array brackets and commas count, including UTF-8 Unicode bytes. The HTTP envelope, compression, WAL framing, archive enrichment/size and Query reads do not count. Changing batching can change bracket/comma overhead. Analytics and archive visibility are not the accounting authority.

Hard project budgets use UTC daily windows [00:00:00, next 00:00:00). The server admission clock selects the window; event timestamps and browser dates cannot select it. A reservation remains in its original window across midnight. No reset cron runs. Null event/byte limits are unlimited; a missing row is enabled/unlimited; disabled policies still meter usage. Zero blocks new nonempty batches. The whole batch must fit both limits. Remaining capacity is max(0, limit - accepted - reserved); percentages include reservations and clamp to 100, including zero limits. Reductions never rewrite usage. Policy edits serialize with admission, affect new reservations, and require the current ETag. API counters/limits are decimal strings bounded at 9007199254740991.

## Persistence and Gateway

The existing ProjectQuota gains daily_events, daily_bytes, enabled and version. ProjectUsageWindow is keyed by tenant/project/date; QuotaAdmission permanently binds tenant/project/batch identity; QuotaJournal binds a UUID to the owned store path hash. Composite FKs, checks and unique keys enforce scope and nonnegative safe bounds. The lock-only SECURITY DEFINER function is owner-controlled, fixed to pg_catalog, schema-qualifies tables and grants no metadata DML to the Gateway. Nine total isolated migration entries preserve the prior seven. Prisma mirrors are byte-identical.

1. Existing authentication/rate guard, strict validation and whole-batch tenant/project/environment authorization run first. Metered batches must contain one project. Credential rate limiting remains before idempotency, so a throttled retry can receive the separate retryable rate error without a quota charge.
2. A pinned pg PoolClient acquires a session advisory lock keyed by tenant/project. Separate processes and credentials share this lock. Admin edits take the matching transaction advisory lock before project row locks.
3. Resolve permanent batch identity and digest before budget admission. COMMITTED returns the persisted receipt without append or charge; mismatched content is 409. Another journal's pending reservation is 503 until its owner recovers.
4. In a short transaction, verify ACTIVE tenant/project through a fixed-search-path lock-only function, check policy and counters, reserve exact events/bytes and persist a stable receipt ID. Commit the reservation.
5. In a second transaction, reacquire ACTIVE row locks, append/fsync the existing WAL, then atomically move reserved capacity to accepted counters and mark the ledger COMMITTED. The project advisory lock spans both transactions and the filesystem operation.
6. Fsync acceptance remains authoritative. If finalization fails after fsync, return durable acceptance, retain reserved capacity and reconcile; usage reads expose RECONCILING. Ambiguous append/fsync failures quarantine admission and return 503, retaining capacity.
7. On owned restart, validate every retained WAL segment, fsync verified frame-bearing files, reconcile exact matching pending frames once, and cancel reservations with no frame only after complete owned-journal recovery. Runtime reconciliation finalizes matching frames but never refunds missing frames by timeout. Reconciliation interruption rolls back; the next restart repeats safely.

The Gateway reports quota-specific HTTP 429 PROJECT_QUOTA_EXCEEDED with retryable=false, distinct from credential rates, validation, oversized input and temporary storage failure. Health readiness includes accounting availability. WAL rotation now continues from existing segment indexes instead of reusing a rotated filename after restart.

## SDK, Admin, BFF and Angular

SDK hard-quota flushes stop automatic retries with a safe quota-exhausted message, retain the stable bounded batch, and never sleep until a daily reset. Error-body inspection is capped at 8 KiB and response text/tokens are not exposed.

Admin routes: GET usage, GET quota and PATCH quota under /admin/v1/tenants/:tenantId/projects/:projectId. BFF equivalents omit tenantId and use the server-selected organization. Optional period=YYYY-MM-DD reads a UTC day. Existing quotas.read/quotas.manage capabilities are enforced against active persisted identities/memberships; only existing OrgOwner grants mutation. Signed quota assertions use the short internal token lifetime. If-Match protects missing policy creation and subsequent edits. Policy and immutable QUOTA_UPDATED audit commit together.

Angular /projects/:projectId/usage reuses Project navigation, shell, Platform buttons/inputs/spinner and tokens. Native labeled progress composes the domain meter; there is no competing UI library. Cards show exact accepted/reserved/remaining values, utilization, UTC reset, freshness, reconciling, empty, unlimited, disabled, error/retry and access denial. Editing supports strict bounds, confirmation, cancel, stale conflicts and unsaved-change guards. Text accompanies warning/exhaustion states.

## Changed and added files

This task changes 27 existing source/config/test files and adds 26 implementation/test files plus these four reports. Exact raw hashes and file inventory are in .tmp/feature008-evidence/final-audit.json. The tracked generated TypeScript cache was restored only after proving it matched the initial clean HEAD; an Angular generated lock hash changed without a Git content change.

- `apps/admin-service/src/api/controllers/quotas.controller.ts`
- `apps/admin-service/src/app.module.ts`
- `apps/admin-service/src/core/config/admin-config.service.ts`
- `apps/admin-service/src/core/security/trusted-assertion.guard.ts`
- `apps/admin-service/src/modules/projects/projects.service.ts`
- `apps/admin-service/src/modules/projects/quotas.service.ts`
- `apps/console-bff/src/modules/auth/api/quotas.controller.ts`
- `apps/console-bff/src/modules/auth/application/admin-client.service.ts`
- `apps/console-bff/src/modules/auth/auth.module.ts`
- `apps/console-bff/tests/unit/quota-validation.test.ts`
- `apps/console-web/src/app/app.routes.ts`
- `apps/console-web/src/app/features/projects/projects.component.html`
- `apps/console-web/src/app/features/projects/projects.component.ts`
- `apps/console-web/src/app/features/usage/usage.component.css`
- `apps/console-web/src/app/features/usage/usage.component.html`
- `apps/console-web/src/app/features/usage/usage.component.ts`
- `apps/ingestion-gateway/package.json`
- `apps/ingestion-gateway/prisma/schema.prisma`
- `apps/ingestion-gateway/src/common/types/error-code.enum.ts`
- `apps/ingestion-gateway/src/health/health.service.ts`
- `apps/ingestion-gateway/src/ingestion/ingestion.service.ts`
- `apps/ingestion-gateway/src/storage/quota-accounting.service.ts`
- `apps/ingestion-gateway/src/storage/storage.module.ts`
- `apps/ingestion-gateway/src/storage/wal/wal-journal.service.ts`
- `apps/query-service/prisma/schema.prisma`
- `contracts/admin/v1/daily-quota-request.schema.json`
- `contracts/admin/v1/daily-quota-response.schema.json`
- `contracts/admin/v1/openapi.yaml`
- `contracts/admin/v1/project-usage-response.schema.json`
- `contracts/ingestion/v1/README.md`
- `contracts/ingestion/v1/error-response.schema.json`
- `docs/admin/migrations/FEATURE-008-001/migration.sql`
- `docs/admin/migrations/FEATURE-008-002/runtime-privileges.sql`
- `docs/admin/migrations/FEATURE-008-003/migration.sql`
- `packages/logger-node/src/transports/http.transport.ts`
- `packages/logger-node/tests/http-transport.test.ts`
- `pnpm-lock.yaml`
- `scripts/lib/quota-migration-integrity.mjs`
- `scripts/measure-quota-performance.mjs`
- `scripts/prepare-quota-tests.mjs`
- `scripts/protected-catalog-snapshot.mjs`
- `scripts/run-explorer-regressions.mjs`
- `scripts/run-quota-e2e.mjs`
- `scripts/run-quota-regressions.mjs`
- `scripts/verify-quota-migration.mjs`
- `tests/contracts/quota-management-contracts.test.ts`
- `tests/credentials/feature005-pipeline.test.mjs`
- `tests/organization/organization.e2e.mjs`
- `tests/quotas/browser-scenarios.mjs`
- `tests/quotas/gateway-child.mjs`
- `tests/quotas/gateway-stack.mjs`
- `tests/quotas/quota-boundaries.test.mjs`
- `tests/quotas/quota-integration.test.mjs`

## Exclusions and operational limits

- Development acceptance only. Protected activation, deployment, real Entra setup and FEATURE-009 were not performed.
- Activation is explicit and coordinated: all ingesting Gateways need INGESTION_QUOTAS_ENABLED=true; Admin HTTP quota APIs require QUOTA_USAGE_ENABLED=true plus persisted auth configuration. Defaults remain off. Mixed metered/unmetered Gateway rollout is unsupported; operators must coordinate cutover. Existing unmetered history is not inferred from archives. First activation requires empty owned WAL stores.
- Lost journals require operator recovery; pending capacity is not blindly refunded by TTL. A no-frame reservation after a failed second transaction is released by verified owned restart. Original receipt ID/count/digest/window remain stable; recovery reconstructs segment/offset and committed_at from recovered evidence, with committed_at representing recovery time when finalization never persisted.
- Metered automatic compaction is disabled to preserve pending evidence; WAL and permanent admission ledger retention need explicit accounting-aware maintenance before production volume. Recovery/publication still scan retained journals; this local milestone does not establish production scale.
- Daily quotas are distributed through PostgreSQL. The inherited credential rate limiter and maxEventsPerSec metadata are separate and are not presented as a new distributed rate engine. Servers require a consistent UTC clock.
- Usage history is window-keyed; displayed policy is current policy, not historical plan pricing. No billing, plans, adjustments UI, destructive reset or new analytics store was added.
- Fault tests terminate processes and exercise actual fsync/PostgreSQL failures; they do not simulate physical power loss. Scoped Axe checks are not full WCAG certification. Local timings are not SLAs.

