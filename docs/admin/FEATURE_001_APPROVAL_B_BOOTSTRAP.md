# Approval B — initial organization, identity and owner bootstrap

**NOT AUTHORIZED — AWAITING EXPLICIT HUMAN APPROVAL**

Prepared 2026-11-03. Approval A does not grant this approval. This packet authorizes no action today and does not include runtime activation or changes to any IdP account.

## Exact scope and unresolved manifest

Confirmed human decision status: organization name/code are not finalized; the owner's provider is not configured and issuer/subject are not available or independently verified. These remain pending decisions under Approval B. Continue only with isolated synthetic organizations/identities; this does not block independent schema/security readiness work or authorize any protected record creation.

Protected target is 127.0.0.1:5432 / skyra_loghub_dev after separately approved A. Read-only evidence currently shows no tenant rows and no IAM tables. Bootstrap will be needed, but the following values must be supplied and frozen before this packet becomes executable:

| Record/evidence | Required value | Status |
|---|---|---|
| Organization | approved UUID, unique code, display name, ACTIVE status; create/select decision | NOT SUPPLIED |
| External identity | actual issuer and immutable subject; independent provider verification reference/time/operator | NOT SUPPLIED |
| Internal user | approved UUID, verified email/display name, ACTIVE status | NOT SUPPLIED |
| System role | exact OrgOwner UUID/definition, is_system=true, canonical SYSTEM_ROLES description | NOT SELECTED |
| Tenant membership | approved UUID, exact tenant/user UUIDs, ACTIVE | NOT SELECTED |
| Role assignment | approved UUID, exact tenant/user/OrgOwner UUIDs, project_id NULL | NOT SELECTED |
| One-time execution | authorization/correlation ID, operator/executor, hashed parameter manifest and runner | NOT SUPPLIED |

Do not replace these blanks with fixture identities. Email alone is not identity verification. Public identity information can be approved without storing provider tokens/passwords. Any additional role catalogue or permissions seed is outside this minimal proposal until explicitly enumerated.

## Preconditions and operations

Require completed A with exact verified ledger/catalog; separately authorized current backup; actual compatible OIDC provider and independently verified owner's issuer/subject; no existing active owner or conflicting keys; exact data manifest and named short-lived maintenance executor; materialized one-transaction procedure rehearsal with representative sanitized values and recorded script hash. Protected runtime remains NOLOGIN and service flags remain off.

The detailed minimal procedure is in [bootstrap design](../../SKYRA_LOGHUB_FEATURE_001C_BACKUP_ACTIVATION.md#initial-tenant-identity-and-owner-bootstrap). Use a single SERIALIZABLE transaction with short timeouts and a transaction advisory lock; exact-match existing approved records only, otherwise insert the approved tenant, identity, canonical OrgOwner role, ACTIVE membership and tenant-scoped assignment. Lock/recheck no previous owner, preserve all unique constraints, and append OWNER_BOOTSTRAPPED audit in the same transaction with approval/operator/provider-verification references and actual actor mapping. Recheck exactly one active owner and correct capability, then commit once.

Existing BootstrapService calls multiple repositories independently and does not create the tenant; it is not approved as the protected transactional executor. An exact runner must be frozen/rehearsed after the real input manifest exists. No HTTP bootstrap endpoint, generic role assignment route, credential bypass, fixture claim or public self-enrolment is permitted.

## Safety, rollback and expected evidence

Unknown identity/tenant conflicts, an existing owner or previous one-time correlation marker reject writes. An already successful run may be recognized read-only and reported; never silently add another owner. Audit failure or any mismatch rolls back all bootstrap DML. Never disable audit triggers, remove an existing owner, rewrite identity issuer/subject or reassign ownership to repair an error.

Evidence must include approved manifest/runner hashes, verification reference/operator/time, exact created/selected UUIDs, before/after membership and role projection, exactly one active owner, one correlated bootstrap audit, transaction result and ordinary runtime read-only membership sanity. No token/credential/cookie in evidence. Close/revoke temporary maintenance access and remove the offline runner from deployed services immediately after success; do not grant bootstrap privileges to runtime.

If the connection is lost after commit, verify exact records/audit read-only before any retry. After committed bootstrap, corrective changes must be separately approved and audited; deletion of audit or owner history is not a rollback. Recovery from archive requires separate explicit permission. C remains independently unauthorized.

**Not actionable:** real provider/owner verification and organization inputs are absent; exact manifest/runner/hash and its rehearsal cannot yet be completed. Approve only after these are concrete and reviewed. This packet records the missing dependencies and procedure; it does not fabricate an approvable real identity.
