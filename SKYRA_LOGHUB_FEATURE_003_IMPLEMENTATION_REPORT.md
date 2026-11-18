# FEATURE-003 — Project Management implementation

Date: 2026-11-04. Local implementation only; final acceptance and verification are recorded in the companion final report.

## Existing implementation inventory

| Area | Existing source | Missing behavior | Implemented change |
|---|---|---|---|
| Database | Canonical Project in ingestion-gateway Prisma, query-service mirror; global varchar(64) primary ID, tenant UUID, name/status/timestamps | Listing index, immutable identity enforcement, quota composite consistency | Additive SQL and matching Prisma relations/index; no new project table |
| Admin | Existing IAM/audit adapters, five roles/20 capabilities, proposed project OpenAPI; no project controller/service | Persisted project CRUD/lifecycle and scope enforcement | Focused ProjectsService/controller in existing Admin Service |
| BFF | Opaque sessions, CSRF, operation assertions, workspace/query machinery | Project proxy and directory refresh semantics | Typed project routes/projection, narrow assertions, authoritative workspace refresh |
| Angular | `/projects` workspace-summary placeholder, existing app shell/selector | Real list/create/details/settings | Replace only project placeholder with real API-backed composition and route variants |
| Platform | Installed packaged Web Components and design tokens | No new primitive required | Reuse Data Table, Input, Button, Badge, Dropdown, Dialog, Loader, Empty State, Notification and App Shell |
| Tests | Organization/Members signed-OIDC harness, isolated PostgreSQL guards and compatibility suites | Project-specific persistence/security/browser coverage | Real nonowner persistence, actual ingestion admission, unit/contracts/workspace and browser scenarios |

Inspected ingestion credentials, quotas, archive metadata, project memberships/assignments, permission resolution, query assertion forwarding and existing project admission before changing source. Local repositories remain authoritative; no remote Git operations were used.

## Canonical contract and lifecycle

Project `id` is the existing globally unique canonical code: 3–64 lowercase letters/digits/hyphens, starting/ending alphanumeric, matching the original create contract. There is no separate slug/code column. Global uniqueness is preserved because ingestion, quotas and other existing references use this ID. Duplicate IDs, including IDs owned by another tenant, return a generic conflict without revealing ownership. Omitted create ID is generated as `project-<UUID>`, retaining the prior optional-ID request contract. Legacy stored IDs remain readable; no bulk normalization or deletion was performed.

`tenantId` is the owning organization UUID, resolved from the authenticated session/trust chain. ID, tenant and creation timestamp are immutable in normal updates. Name is trimmed and validated as 2–255 Unicode characters without control characters. Existing legitimate shorter legacy names are not rejected by a new retrospective constraint.

Existing statuses are ACTIVE, SUSPENDED and ARCHIVED. Create defaults to ACTIVE and accepts only ACTIVE as an explicit initial status. Supported transitions: ACTIVE → SUSPENDED/ARCHIVED, SUSPENDED → ACTIVE/ARCHIVED. ARCHIVED is terminal and read-only. Exactly one name or status operation is accepted by PATCH. Unsupported statuses, mixed operations, arrays and identity/tenant override fields are rejected.

Suspension/archive preserve credentials, quotas, memberships, assignments and log/archive references. Existing ingestion ProjectService already checks persisted ACTIVE status before admission; real repository testing verifies immediate refusal for SUSPENDED/ARCHIVED and restored admission for ACTIVE. BFF workspace/query requests refresh persisted grants; inactive projects disappear and invalid selection clears. Already issued internal assertions/in-flight operations may persist until existing expiry, a 60-second token lifetime plus the existing Query Service five-second clock-skew grace. Credentials are retained, not automatically revoked. No hard deletion, credential generation or quota feature was added.

## Authorization, persistence and concurrency

No capabilities or role grants were expanded. OrgOwner/OrgAdmin have `projects.create`, `projects.read`, `projects.update` and `projects.archive`. Existing tenant-wide role capabilities apply across projects. Project-scoped ProjectAdmin requires an ACTIVE project membership and its stored assignment, can read/edit/suspend/reactivate only that project, and cannot create or archive. Scoped Developer is read-only; Viewer has no create/update/archive. Suspended/revoked organization memberships, disabled identities, missing memberships and foreign scope fail closed. Browser/provider role/capability claims do not grant authority.

Every Admin operation resolves trusted issuer/subject and active database identity, tenant and membership, then uses canonical persisted assignments. Service queries bind tenant; scoped listings restrict project IDs before pagination/search. Tenant SHARE locking coordinates with Members/Organization mutation locks. Project reads lock the row for a coherent representation/version; updates lock it FOR UPDATE, compare a required project-specific microsecond If-Match, and execute a conditional atomic update. Timestamp advancement is at least one microsecond. Concurrent edits/lifecycle changes produce one commit and one stale conflict. Global primary-key uniqueness arbitrates duplicate creation.

Project create/edit/status and immutable audit INSERT are a single Prisma transaction. Audit database-trigger failure rolls back project creation or name/status/version updates. Events reuse PROJECT_CREATED, PROJECT_UPDATED and PROJECT_DISABLED, adding PROJECT_REACTIVATED and PROJECT_ARCHIVED to the existing event union. Records contain tenant/project, database actor, timestamp, before/after name/status, correlation and SUCCESS outcome; no credentials.

## API and workspace integration

Admin: GET/POST `/admin/v1/tenants/:tenantId/projects`, GET/PATCH `.../projects/:projectId`. The historical collection array response remains the default; `page=true` opts into `{items,nextCursor,canCreate}`. Search covers name/code; status, createdAt/name/id sort, asc/desc, bounded limits 1–100 and stable ID tie-breaking are supported. Cursors bind tenant, actor and filters, and are re-authorized on each request. Changing sort/filter or losing a cursor project requires reload. Sorting is stable for an unchanged dataset, not a cross-request snapshot under concurrent name edits.

OpenAPI retains the original create request and baseline response fields, adds optional version/actions metadata and explicit paginated representation, and uses a separate strict update schema. No existing live feature endpoint was removed. Missing If-Match is 428; invalid DTO/filter is 400; stale/context/transition conflict 409; inaccessible detail 404; unauthorized operation 403. Existing problem/error mapping is retained. Mutations provide correlation IDs and ETags; responses are no-store.

BFF: GET/POST `/bff/projects`, GET/PATCH `/bff/projects/:id`. Tenant is taken from the session, never browser query/body override. Assertions use exactly `projects.read` or `projects.manage`, an explicitly configured key and maximum 60-second lifetime. CSRF guards cover POST/PATCH. Explicit response projection excludes credentials, tokens and identity metadata and verifies tenant consistency.

A confirmed integration gap was fixed in the existing directory: organization-wide roles previously required separate project-membership rows just to display projects. The directory now follows the already established tenant-wide/project-scoped capability policy, so newly created projects appear without inventing membership grants. GET workspaces now refreshes the authoritative directory, as query requests and workspace selection already do. Valid selection persists; inactive/missing selection clears. Angular authoritative mode clears preview/default data on initialization/outage and does not optimistically retain a failed workspace switch or locally invent a selected project when the server has none.

## Angular and Platform

Routes: `/projects`, `/projects/new`, `/projects/:projectId`, `/projects/:projectId/settings`. Real typed BFF calls drive list/filter/sort/pagination, create validation and duplicate conflict, details/metadata, permitted settings and lifecycle controls. Save/cancel, dirty navigation/beforeunload, loading/saving, empty/error/retry, denied/read-only, stale conflict/draft/reload and workspace-selection feedback are implemented. Consequential status changes require the packaged confirmation dialog.

Uses the existing app-shell/data-table/dropdown/dialog/input/badge/notification/empty-state packages at 0.1.0; button/design-tokens/loader at 0.1.1. Installed public registration exports remain in main.ts. No new library, copied Platform source, replacement primitive or package archive was introduced. Small local accessibility adapters follow the existing verified consumer pattern: label the exported native dialog; leave the native menu item as the sole interactive role; use supported outline buttons and existing theme tokens for contrast. Tablet/mobile tables scroll within their panel; page/document overflow is tested. No Platform source changes were needed.

## File inventory

- Admin: `src/modules/projects/projects.service.ts`, `src/api/controllers/projects.controller.ts`, registration in app.module, trusted scope lifetime guard, audit action union; targeted directory change in OrganizationService.
- BFF: `src/modules/auth/api/projects.controller.ts`, AdminClient project forwarding/error mapping, module registration and authoritative GET-workspaces refresh in SessionAuthGuard.
- Console: `features/projects/projects-api.service.ts`, project component TS/HTML/CSS, app routes, authoritative project header bindings in Topbar TS/HTML and focused WorkspaceContextService corrections.
- Persistence/contracts: canonical and mirrored Prisma; `docs/admin/migrations/FEATURE-003-001` and `FEATURE-003-002`; LF attributes; project response/update schemas and OpenAPI.
- Verification: `prepare-project-tests.mjs`, project migration integrity helper, guarded query runner, project browser runner; additive harness mode; `tests/projects/*`; focused Admin/BFF/Angular/contract tests; protected snapshot label extension.

## Limits

No hard deletion, invitations, project-membership management, machine credential issuance, quota editing, billing, query-engine redesign, analytics redesign, real Entra setup or deployment. Runtime privileges are not RLS; tenant predicates and composite constraints form the application isolation boundary. Owner-level out-of-band SQL remains privileged. Sessions remain the pre-existing server-side implementation; distributed session/token recall is not added. Protected review/activation and real identity setup remain separate prerequisites. Stop after FEATURE-003.
