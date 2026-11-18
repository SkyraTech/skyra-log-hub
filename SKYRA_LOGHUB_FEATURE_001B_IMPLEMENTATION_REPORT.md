# LOGHUB-FEATURE-001B — implementation report

Date: 2026-11-03 (Asia/Calcutta). **PASS — ISOLATED FEATURE IMPLEMENTATION COMPLETE**. Protected activation is not performed or authorized.

## Scope and reused architecture

Implemented Organization Overview and display-name-only Organization Settings in the existing Admin Service, Console BFF and Angular 19 console. Reused the existing tenants table, identity/membership/audit ports, five-role/20-capability resolver, trusted assertions, OIDC/session store, HTTP-only cookies, CSRF guard, problem-details filters and versioned Platform packages. No service/application/IAM schema was duplicated. No Members & Roles, Projects, credentials, quotas, billing, organization creation/deletion or ownership-transfer API/UI was introduced.

Initial paths/versions/Git state and exact final checks are recorded in the final acceptance report. Existing Feature-001 and Feature-001A reports and changes were preserved; only the explicitly requested approval packet was superseded with current findings.

## Database foundation and persistence

The ingestion-gateway schema remains the shared metadata owner; query-service mirrors its complete schema. Added User, TenantMembership, ProjectMembership, Role, Permission, RolePermission, RoleAssignment, Invitation and AdminAuditEvent mappings plus enums/relations/index names. The original SQL-managed expression unique index, name CHECK and audit triggers remain explicit SQL assets because Prisma 5 cannot express all of them. Both original single-project FKs and the new composite tenant/project FKs are mapped. No extra tenant field was added.

Existing ADMIN-002 and FEATURE-001A-001 bytes were preserved. New FEATURE-001B-001 adds composite project scoping to project_memberships/role_assignments and enforces the existing display-name length contract in tenants. FEATURE-001B-002 is a separately reviewed runtime-grant artifact. See the database/security report and approval packet for hashes, exact privileges and execution order.

Completed the existing Prisma identity, membership and audit adapters. Identity uses unique issuer+subject and preserves those keys on updates. Membership reads resolve real status/role assignments; persistent last-owner revocation protection locks the tenant and counts active identities/memberships. No membership mutation endpoint was added; general role deletion deliberately remains unavailable pending its own authorized workflow. Organization transactions reuse the existing adapters with the same Prisma transaction context. A focused PrismaTenantRepository handles metadata locking, reads, microsecond versions and conditional name updates. Shared Prisma clients are closed during Nest module shutdown.

Organization identity/membership reads acquire shared row locks; the tenant mutation uses a row lock and an atomic version condition. Ordinary runtime privileges are limited to reading relevant metadata, name/updated_at writes on tenants, timestamp-only UPDATE needed for identity/membership shared locks, and audit INSERT/SELECT. No runtime status/membership/role CRUD or DDL grants were added. Authority is rechecked on every organization request; role grants are derived from the existing matrix, not incoming role/capability claims.

## Admin endpoints and concurrency

- GET `/admin/v1/tenants/:tenantId`: tenant.read, active authoritative identity/membership, authenticated tenant/path equality. Returns the existing six-field tenant contract, strong ETag and filtered capability header; no-store.
- PATCH same route: tenant.update, `{name}` only, trimming and 2–255 Unicode code-point validation. Unknown/immutable/status fields, invalid types and NUL are rejected. Non-active organizations are read-only.
- GET `/admin/v1/me/memberships`: internal directory assertion scope only; resolves the verified issuer/subject into active persisted memberships and real tenant roles. This is the minimal login/workspace prerequisite, not membership CRUD.

The ETag is opaque and organization-bound: `"o<tenant UUID>:<updated_at epoch microseconds>"`. Missing If-Match is 428; malformed preconditions are 400; a stale version or switched organization context is 409. The UPDATE has both tenant and timestamp conditions. Updated_at advances with GREATEST(clock_timestamp(), previous + 1 microsecond), avoiding JavaScript millisecond truncation and repeated-version collisions. Locking ensures coherent read metadata/ETag and an accurate audited before value. No overwrite or automatic stale retry occurs.

Name update and TENANT_UPDATED insertion share one transaction. Audit details contain before/after name, correlation ID and SUCCESS outcome; actor UUID/email come from the persisted identity, not the browser. The existing audit schema requires actor email. Audit failure throws and rolls the name/version back. No tokens or credentials are recorded.

## BFF integration and authentication

New GET/PATCH `/bff/organization` uses the existing session and CSRF guards. Tenant comes exclusively from the session's authorized active workspace; no browser tenant argument changes it. A single AdminClientService creates 60-second signed internal assertions using an explicitly configured key and server OIDC issuer. It propagates correlation and If-Match, bounds upstream requests to five seconds, projects only public metadata/version/capabilities, validates returned tenant identity and maps errors without exposing internal assertions.

The existing authoritative membership adapter now calls the Admin directory endpoint. Callback sessions use persisted tenant roles for display instead of promoting IdP fixture strings into organization roles. Workspace selection supports an organization with no project. New organization forwarding refuses disabled authoritative mode, missing/short internal keys and development mock OIDC outside NODE_ENV=test. Protected flags/configuration files were not activated or edited.

Fixed the existing ID-token verifier's missing signature check. It now verifies HS256, rejects unsigned/unsupported/forged tokens, checks authorized party for multiple audiences and requires finite numeric expiry/string subject. Real-mode verification requires a strong configured secret. Asymmetric/JWKS providers are not implemented by this verifier and fail closed; validate the intended provider's supported algorithm before activation. No new authentication provider or permanent test-login route was added.

The capability resolver now treats only null/undefined project scope as tenant-wide, and unknown/prototype role names resolve to no capabilities. This preserves the five-role matrix: only OrgOwner/OrgAdmin hold tenant.read/update. No new capabilities or implicit administrator were introduced.

## Angular and Platform

Dedicated lazy `/organization` and `/organization/settings` routes preserve the existing theme/application settings page. The route guard always bootstraps a real BFF session, ignoring the legacy preview session as organization authority. Failed bootstrap clears stale local auth. The typed API client sends cookies/CSRF/precondition and never calls Admin directly or supplies a tenant ID.

Implemented persisted metadata, permission-denied/error/loading/empty handling, capability/state-controlled editing, validated name input, saving/success feedback, cancel, unsaved-change/beforeunload protection, cancellation on destroy, conflict draft preservation and explicit refresh. Inactive organizations are readable but settings are read-only; readonly inputs remain focusable. Server response refreshes the saved value/version after success.

Uses actual packaged app-shell, button, input, badge, loader, empty-state, notification and design-tokens. No local shared primitive or replacement library was added. Necessary compatibility fixes:

- Aligned button/design-tokens/loader overrides to the console's already-declared immutable 0.1.1 archives; no archives or Platform source changed.
- Explicitly invoked public registerAppShell; this package does not self-register. Governance now checks that call rather than accepting a side-effect import as proof.
- Used public shell parts for viewport/content sizing and its sidebar-toggle event for mobile state.
- Removed two cyclic local --skyra-text-muted aliases; inherited official tokens now reach shadow inputs. Used official text tokens to meet light/dark contrast.
- Fixed header/breadcrumb responsiveness and suppressed unrelated preview project/environment metadata on organization pages. Header tenant/roles come from the authenticated session.

Existing typography/theme authority was retained. A locale-dependent existing metric-card test was corrected to assert the host's exact grouping format; analytics behavior was not changed.

## Verification and remaining boundaries

Final Admin 61, BFF 56 and Angular 75 tests pass. Contracts, safety guards, original SQL regression, hardened schema, real Prisma repository compatibility, persistent adapters and real-browser acceptance pass; counts/commands are centralized in final acceptance. Six viewport/theme combinations have zero scoped WCAG A/AA violations; screenshots were inspected after correcting actual rendering defects. The browser backend persistence path is real PostgreSQL under a non-owner runtime role; only the external identity exchange is explicitly simulated in the test process.

No unresolved serious defect is known in the tested slice. Protected activation still requires the separate approvals, fresh backup/recovery evidence, controlled runtime-role/credential provisioning and identity/owner bootstrap described in the packet. Privileged operators can disable triggers; append-only auditing does not claim protection against superusers/owners. Future membership workflows must preserve the authorization-row lock convention. Feature-002 was not started.
