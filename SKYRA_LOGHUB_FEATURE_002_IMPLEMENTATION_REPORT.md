# FEATURE-002 — Implementation report

Date: 2026-11-04. Scope: existing members and predefined roles, implemented in the local disposable environment. Final verification and verdict are recorded in the final acceptance report.

## Repository and architecture

Local source of truth: `C:\Users\VAMSHIKA\source\repos\skyra-tech-projects\skyra-log-hub`, branch `main`, starting HEAD `19f084ad36fe37bb57ca107103e136d2d4a378be`. Shared Platform: sibling `skyra-platform`, `main`, HEAD `928ca4343ab3a1887e586123a6ba5bb88b56a0ef`. Existing FEATURE-001A–E changes were already staged/unstaged/untracked as captured in `.tmp/feature002-evidence/initial-status.txt`; they have been preserved. No commit, push, reset, rebase or merge was performed.

Inspection covered the existing IAM entities, Prisma repositories, immutable audit adapter, capability resolver, authoritative membership directory, signed assertions, opaque sessions, CSRF, organization routes and installed Platform exports. Toolchain: Node 24.14.0, pnpm 12.3.4, PostgreSQL 17.9, Prisma/client 5.22.0, Angular 19.2 and service TypeScript 5.7.3.

## Lifecycle and policy

The existing statuses remain ACTIVE, SUSPENDED, REVOKED and PENDING_INVITE. Supported changes are ACTIVE → SUSPENDED/REVOKED and SUSPENDED → ACTIVE/REVOKED. REVOKED is terminal; PENDING_INVITE and disabled identities are read-only. Removal means soft revocation, retaining identity, role history and audit; there is no hard deletion or invitation acceptance workflow.

Suspension blocks authorization and preserves project memberships for reactivation. Revocation also sets existing project memberships to REVOKED; it cannot be undone here. Role changes replace all organization-wide role assignments with one selected canonical role while preserving project grants. Project grants are displayed, not edited. The schema already permits ProjectAdmin/Developer/Viewer at organization scope; OrgOwner and OrgAdmin must have organization scope.

The five roles and authoritative 20 capabilities are unchanged. `tenant.members.read` and `tenant.members.manage` govern these operations; `tenant.update` grants no extra membership authority. OrgOwner has all 20 capabilities. OrgAdmin has membership management but lacks `quotas.manage` and `retention.manage`, so cannot grant or manage OrgOwner. ProjectAdmin, Developer and Viewer lack organization membership read/manage. Each proposed role must be a subset of the actor's persisted effective capabilities. Client/provider role claims confer no permissions.

Duplicate memberships remain prohibited by the existing tenant/user uniqueness constraint. Self-demotion, suspension and revocation are allowed only when another active owner remains. Disabled identities do not count as active owners. Missing identities/memberships and foreign targets fail closed.

## Persistence and Administration Service

`MembersManagementService` uses existing users, tenants, tenant_memberships, project_memberships, role_assignments, roles and admin_audit_events. New additive SQL adds a role-assignment → tenant-membership composite foreign key, stable-list index and administrative role-scope trigger. Canonical ingestion-gateway Prisma and query-service mirror contain the same composite relation/index. SQL-managed trigger remains an explicit SQL responsibility.

New routes: GET collection and GET/PATCH detail under `/admin/v1/tenants/:tenantId/memberships`. Search matches display name/email case-insensitively; status/role filters combine, limit is 1–100, and stable createdAt/id cursors bind tenant, filters and page size. Role filter considers organization-wide assignments. DTO accepts exactly one canonical role or supported status; arbitrary emails, scope/tenant overrides, unknown properties and combined commands are rejected.

Every read resolves trusted issuer/subject, active database identity/membership and effective capabilities. Every mutation first locks the tenant FOR UPDATE, then authorizes and reads the target. Active-owner counting and all owner-impacting writes share this mutex. Reads take a tenant SHARE lock. A membership-specific microsecond ETag is mandatory; missing If-Match is 428, malformed input 400 and stale/context/invalid transition 409. Conditional version advancement, assignment/status changes and audit insertion share one Prisma transaction. Audit failure rolls everything back. No-op role assignment returns the current representation without adding a false mutation event.

Audit events are MEMBER_ROLE_CHANGED, MEMBER_SUSPENDED, MEMBER_REACTIVATED and MEMBER_REMOVED, with tenant/target, database actor, timestamp, before/after roles and status, correlation and SUCCESS outcome. The existing immutable audit constraints and privileges remain enforced.

## BFF and Angular

BFF GET/PATCH `/bff/organization/members[/:id]` derives tenant from the session. It forwards 60-second signed assertions with exactly `members.read` or `members.manage`, retains existing CSRF/HTTP-only session protections, timeout/error mapping and no-store responses, and explicitly projects member fields. Browser responses omit issuer, subject, internal user ID, tokens and secrets. Angular never calls the internal Admin Service.

Member/organization operations revalidate identity and membership in Admin on every request. A directly relevant stale-session gap was corrected: authoritative query requests and workspace selection refresh the persisted membership directory before using cached project grants. Failure has no fixture/cached privilege fallback. Session inspection/logout remain usable. Already issued downstream assertions can live until their existing expiry (up to 60 seconds); this change does not implement global token recall or distributed session storage.

Angular routes `/organization/members` and `/organization/members/:membershipId` provide real search/filter/pagination, identity/status/scope/roles, allowed actions and permission explanations, save/cancel, confirmations, dirty navigation, conflict/reload and loading/empty/denied/error/success states. Existing Organization Management and other routes remain in place. The sidebar exposes the new feature.

## Platform reuse and contract reconciliation

Uses existing installed App Shell, Data Table, Dropdown, Input, Dialog, Button, Badge, Loader, Empty State and Notification packages, with existing design tokens. Button 0.1.1, design tokens 0.1.1, loader 0.1.1; relevant other primitives 0.1.0. No new UI library, duplicated primitive, dependency, Platform source change or immutable archive modification. Consumer fixes use supported `outline` button variant, visible action names, `headline` empty-state input and token-based contrast mapping. Small feature-local accessibility adapters label the exported native dialog and suppress duplicated wrapper menuitem semantics while retaining native interactive items. They do not copy component implementations.

Historical OpenAPI `/members` draft describes an email-invitation workflow. It is retained and marked planned; it is not advertised as implemented. Additive `/memberships` paths and dedicated management view/update JSON schemas describe this feature without breaking that draft. No arbitrary-email identity creation was added.

## Boundaries and operational limits

No real identity, organization or owner was bootstrapped. Real Entra setup/login, customer invitations, email delivery, provisioning, project administration, credentials, billing, deployment and protected activation remain deferred. Runtime SQL privileges are narrower than ownership but are not row-level security: tenant isolation is enforced by application predicates and database composite constraints. Privileged out-of-band SQL and future identity-disable/owner workflows must honor the same locking invariant. Transactions serialize member writes per tenant; large-scale pagination/search optimization and distributed session operations remain future operational concerns.

See database/security report for exact migration hashes, runtime privileges and protected preservation; E2E report for reproducible evidence; final acceptance for completed checks and Git state.
