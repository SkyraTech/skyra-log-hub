# FEATURE-009 — Implementation report

**PASS — FEATURE-009 IMPLEMENTED IN ISOLATION.** Existing canonical audit persistence and mutation/audit guarantees are reused; no new service deployment or second audit table.

## Source inventory

| Capability | Existing | Missing before FEATURE-009 | Implemented change |
|---|---|---|---|
| Persistence | Canonical AdminAuditEvent/admin_audit_events and transactional writers | No new persistence required | Reuse table, FK protections and event values |
| Listing/details | Internal minimal list method; illustrative OpenAPI | Authenticated public read workflow | Dedicated read repository/service inside existing Admin process |
| Filtering | Action index and tenant/time index | Actor/resource/project/time filters | Parameterized exact filters, UTC bounds |
| Pagination | No public audit cursor | Stable bounded read pagination | Timestamp+UUID keyset, signed context-bound cursor |
| Authorization | Existing audit.read on OrgOwner/OrgAdmin | HTTP enforcement and navigation hints | Current persisted tenant-wide capability; scoped roles denied |
| Projection | Internal persistence sanitizer | Safe public historical metadata | Typed field allowlist, bounded JSON text, explicit missing/unknown handling |
| BFF | Opaque sessions, CSRF policy, internal signed assertions | Audit proxy/projection | Three read endpoints; no tenant override, no-store |
| Angular | Existing settings, Platform table/dialog/input/button | Usable audit page | Filters, wrapped table cells, details, copy, pagination, states |
| Settings navigation | Existing Organization/Members/Project/Credential/Quota pages | Context links | Links guarded by actual audit access; no settings redesign |

## Contracts and read behavior

Admin: GET /admin/v1/tenants/:tenantId/audit-events, GET /admin/v1/tenants/:tenantId/audit-events/:eventId, GET /admin/v1/tenants/:tenantId/audit-events/access.

BFF: GET /bff/organization/audit, GET /bff/organization/audit/:eventId, GET /bff/organization/audit/access. The session selects the tenant; the browser cannot supply one. Access metadata contains only the authorized flag/current tenant and a static action catalog, never an actor directory or counts.

List filters: action, actorId, resourceType, resourceId, projectId, start, end, limit, cursor. Exact action/actor/resource matches; projectId matches project/quota targets and credential project metadata. UTC start is inclusive and end exclusive. Both date bounds are required together, with a maximum 366-day span; omitting both reads all retained history in bounded pages. Page size defaults to 25, maximum 100.

Public event fields: ID, UTC timestamp, canonical action/label, historical actor UUID/reference, resource type/identifier, safe summary, optional safe correlation ID, typed before/after values with availability flags, and metadata-withheld state. No raw details, actor email, IP, secret, verifier, session or assertion fields. The page contains items, nextCursor, order and pageSize, with no offset/total/distinct actor enumeration. New public JSON schemas and canonical OpenAPI are tested against fixtures and actual browser-read responses.

Descending keyset order is (created_at, id); the wire timestamp and cursor retain all six PostgreSQL fractional digits. SQL compares timestamp/UUID tuples without offset scans. A first-page server-time anchor limits later timestamps. HMAC-SHA256, a cursor-specific domain separator and canonical base64url validation protect version-1 cursors. The binding includes tenant, reader UUID, authorization scope, all filters and page size. Expiry is 15 minutes and does not extend on each page; key rotation, tampering, changed filters, another reader or another tenant require returning to page one. Current permissions are rechecked independently of cursor validity.

This is an anchored keyset traversal, not an exported MVCC snapshot across HTTP requests. Deliberately backdated or same-timestamp concurrent appends can appear on later pages. Existing immutable records do not move or disappear; refreshing starts a new traversal.

## Authorization and safe data

The five roles and 20 capabilities remain unchanged. Existing tenant-wide OrgOwner and OrgAdmin grants supply audit.read; ProjectAdmin, Developer and Viewer do not gain it. Even a project-scoped assignment cannot grant organization audit access because the read authorization loads only assignments with projectId=null. No project-only audit-read mode is introduced.

Every list/detail/access request resolves the trusted issuer+subject, ACTIVE identity, ACTIVE tenant, ACTIVE membership and current persisted audit.read capability. Path tenant must match the signed principal. Resource/project/actor filters constrain an already-authorized tenant and never grant access. Suspended/revoked memberships fail immediately at Admin even if an opaque BFF session still exists. Foreign and absent detail IDs return the same 404. Browser/provider role claims and localStorage cannot elevate access.

Audit transactions are REPEATABLE READ and explicitly SET TRANSACTION READ ONLY, with a five-second SQL statement limit and ten-second transaction limit. Internal audit assertions use the existing configured signing secret and short lifetime; audit.read is included in the hardened scope checks. The new flag AUDIT_HISTORY_ENABLED defaults off and does not activate protected persistence/OIDC.

| Source data | Public projection |
|---|---|
| Actor email/IP/current profile | Not selected or exposed; show recorded UUID, or Actor unavailable |
| Organization/project fields | Bounded safe name and recognized status only |
| Membership fields | Canonical five-role values and recognized membership status |
| Credential fields | UUID identifiers, revoke flag, UTC expiry, replacement reference only |
| Quota fields | Enforcement boolean; bounded decimal event/byte limits or explicit unlimited null |
| Correlation | At most 64 safe ASCII characters; sensitive-looking values withheld |
| Missing before/after | Explicit availability flags; never fabricate old values |
| Unknown action | Safe canonical identifier retained; unknown label and no guessed metadata |
| Unexpected/deep fields | Denied by default; no recursive raw-JSON display |
| Large metadata | Serialized details over 65536 bytes replaced with empty details before transfer; metadataOmitted=true |

Size-bounded details are retrieved as JSON text so deeply nested legacy JSON cannot trip Prisma's JSON deserializer. Only shallow typed fields are read after parsing. Sensitive-looking bearer/verifier/JWT/private-key/connection strings are suppressed. BFF independently validates/project fields, rebuilds labels/summaries, and rejects unavailable-side values that are not null. Angular interpolation and Platform text/slot rendering escape stored HTML. Summaries identify fields whose recorded values differ; the detail view preserves actual recorded before/after values, including unchanged values, under an accurate heading.

## Angular, Settings and Platform

/organization/audit provides actual persisted history, action/actor/resource/project/UTC filters, active-filter indicators, bounded pages, refresh, loading/empty/denied/error/retry states and safe details. Closing details preserves filters/cursor/list. Copy uses the actual event UUID. The Platform dialog retains its native behavior, with a narrow focus bridge for its shadow-header and slotted action buttons; focus containment/return and Escape are tested.

The existing Platform shell, table, dialog, buttons, inputs, spinner and tokens remain canonical. Public cell slots wrap resource and summary columns so desktop Details actions remain visible; smaller screens use a labeled inner scroll region without page-wide overflow. Native labeled date/select fields are domain compositions, not a competing UI framework. No Platform source or immutable package was edited.

Audit access metadata guards sidebar/context-link visibility, independently of browser roles. Organization Settings, Members & Roles, Project Settings, Credential Management and Quota Settings link to relevant audit filters only when authorized and their parent data is accessible. Existing forms/business rules remain intact.

## Persistence and files

One index-only additive migration adds tenant/time/UUID, tenant/action/time/UUID, tenant/actor/time/UUID and tenant/resource/time/UUID access paths on admin_audit_events. Existing rows, grants, event names, immutable triggers and FKs remain unchanged. Canonical and mirrored Prisma schemas match.

28 existing files changed; 25 implementation/test/contract/migration files added, plus these four reports. Full raw task-delta inventory is in final-audit.json; the generated Angular cache lock is separately recorded.

- `apps/admin-service/src/api/controllers/audit-history.controller.ts`
- `apps/admin-service/src/app.module.ts`
- `apps/admin-service/src/core/audit/application/audit-history.service.ts`
- `apps/admin-service/src/core/audit/application/audit-projection.ts`
- `apps/admin-service/src/core/audit/application/audit-query.ts`
- `apps/admin-service/src/core/audit/infrastructure/prisma-audit-read.repository.ts`
- `apps/admin-service/src/core/config/admin-config.service.ts`
- `apps/admin-service/src/core/security/trusted-assertion.guard.ts`
- `apps/admin-service/tests/unit/audit-history.test.ts`
- `apps/console-bff/src/modules/auth/api/audit-history.controller.ts`
- `apps/console-bff/src/modules/auth/application/admin-client.service.ts`
- `apps/console-bff/src/modules/auth/auth.module.ts`
- `apps/console-bff/tests/unit/audit-validation.test.ts`
- `apps/console-web/src/app/app.routes.ts`
- `apps/console-web/src/app/features/audit/audit-link.component.ts`
- `apps/console-web/src/app/features/audit/audit-navigation.service.ts`
- `apps/console-web/src/app/features/audit/audit.component.css`
- `apps/console-web/src/app/features/audit/audit.component.html`
- `apps/console-web/src/app/features/audit/audit.component.ts`
- `apps/console-web/src/app/features/credentials/credentials.component.html`
- `apps/console-web/src/app/features/credentials/credentials.component.ts`
- `apps/console-web/src/app/features/members/members.component.html`
- `apps/console-web/src/app/features/members/members.component.ts`
- `apps/console-web/src/app/features/organization/organization.component.html`
- `apps/console-web/src/app/features/organization/organization.component.ts`
- `apps/console-web/src/app/features/projects/projects.component.html`
- `apps/console-web/src/app/features/projects/projects.component.ts`
- `apps/console-web/src/app/features/usage/usage.component.html`
- `apps/console-web/src/app/features/usage/usage.component.ts`
- `apps/console-web/src/app/layout/sidebar/sidebar.component.html`
- `apps/console-web/src/app/layout/sidebar/sidebar.component.ts`
- `apps/ingestion-gateway/prisma/schema.prisma`
- `apps/query-service/prisma/schema.prisma`
- `contracts/admin/v1/audit-history-access.schema.json`
- `contracts/admin/v1/audit-history-page.schema.json`
- `contracts/admin/v1/openapi.yaml`
- `contracts/admin/v1/public-audit-event.schema.json`
- `docs/admin/migrations/FEATURE-009-001/migration.sql`
- `scripts/lib/audit-migration-integrity.mjs`
- `scripts/prepare-audit-tests.mjs`
- `scripts/protected-catalog-snapshot.mjs`
- `scripts/run-audit-e2e.mjs`
- `scripts/run-audit-regressions.mjs`
- `scripts/run-explorer-regressions.mjs`
- `scripts/verify-audit-migration.mjs`
- `tests/audit/browser-scenarios.mjs`
- `tests/audit/persistence.test.mjs`
- `tests/contracts/audit-history-contracts.test.ts`
- `tests/credentials/feature005-pipeline.test.mjs`
- `tests/organization/organization.e2e.mjs`
- `tests/quotas/browser-scenarios.mjs`
- `tests/quotas/quota-boundaries.test.mjs`
- `tests/quotas/quota-integration.test.mjs`

## Scope limits

- Acceptance is isolated development only. No protected migration, grant, audit/bootstrap write, activation, Microsoft-account change or deployment occurred. Protected activation requires separate authorization and the existing persistence/OIDC prerequisites; AUDIT_HISTORY_ENABLED remains off by default.
- Audit reads follow the existing OrgOwner/OrgAdmin policy. Project-scoped roles have no new audit grant; optional project filtering is not a separate project-user permission.
- Optional export, correlation-ID filtering and actor display-name enrichment are deferred. There is no existing authorized audit-export contract to reuse; this slice exposes bounded reads, not a new export/retention/SIEM subsystem. Correlation IDs are available in safe details. Historical actor references deliberately avoid unnecessary email/profile disclosure.
- Date controls select millisecond-resolution UTC boundaries; APIs/cursors and displayed detail timestamps retain PostgreSQL microseconds. Date ranges are capped at 366 days; unfiltered historical traversal remains paginated. Cursors expire in 15 minutes and are not persistent MVCC snapshots.
- Unknown or unsupported historical metadata is withheld rather than inferred. Oversized metadata is intentionally not rendered. No raw JSON viewer, audit mutation endpoint or global platform-admin view exists.
- Local performance samples and scoped Axe checks are not production SLAs, scale guarantees or full WCAG certification. Retention and protection against database superusers are outside this feature.
- FEATURE-010 was not started.

