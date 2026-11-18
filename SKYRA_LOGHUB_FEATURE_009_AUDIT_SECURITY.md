# FEATURE-009 — Audit security

**PASS — isolated authorization, safe projection, cursor and immutability gates.**

## Authorization and isolation

The five roles and 20 capabilities remain unchanged. Existing tenant-wide OrgOwner and OrgAdmin grants supply audit.read; ProjectAdmin, Developer and Viewer do not gain it. Even a project-scoped assignment cannot grant organization audit access because the read authorization loads only assignments with projectId=null. No project-only audit-read mode is introduced.

Every list/detail/access request resolves the trusted issuer+subject, ACTIVE identity, ACTIVE tenant, ACTIVE membership and current persisted audit.read capability. Path tenant must match the signed principal. Resource/project/actor filters constrain an already-authorized tenant and never grant access. Suspended/revoked memberships fail immediately at Admin even if an opaque BFF session still exists. Foreign and absent detail IDs return the same 404. Browser/provider role claims and localStorage cannot elevate access.

Audit transactions are REPEATABLE READ and explicitly SET TRANSACTION READ ONLY, with a five-second SQL statement limit and ten-second transaction limit. Internal audit assertions use the existing configured signing secret and short lifetime; audit.read is included in the hardened scope checks. The new flag AUDIT_HISTORY_ENABLED defaults off and does not activate protected persistence/OIDC.

Stored-role tests cover OrgOwner, OrgAdmin, scoped ProjectAdmin, Developer, Viewer, suspended/revoked membership, disabled identity, missing membership and inactive tenant. Foreign-event lookup, tenant override, actor filter isolation, browser role tampering, wrong assertion scope and cross-reader/tenant cursor replay are denied. BFF projections rebuild presentation text from validated public fields and never forward raw details. There is no actor search directory or distinct/count side channel.

## Cursor security

Descending keyset order is (created_at, id); the wire timestamp and cursor retain all six PostgreSQL fractional digits. SQL compares timestamp/UUID tuples without offset scans. A first-page server-time anchor limits later timestamps. HMAC-SHA256, a cursor-specific domain separator and canonical base64url validation protect version-1 cursors. The binding includes tenant, reader UUID, authorization scope, all filters and page size. Expiry is 15 minutes and does not extend on each page; key rotation, tampering, changed filters, another reader or another tenant require returning to page one. Current permissions are rechecked independently of cursor validity.

This is an anchored keyset traversal, not an exported MVCC snapshot across HTTP requests. Deliberately backdated or same-timestamp concurrent appends can appear on later pages. Existing immutable records do not move or disappear; refreshing starts a new traversal.

## Redaction and historical compatibility

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

All 16 known canonical action identifiers retain their established meanings. Actual service producers generated 12 action types spanning FEATURES 001/002/003/004/008; old missing fields, future unknown action, deeply nested JSON, stored HTML and oversized metadata are also tested without rewriting records. Secrets intentionally stored in a compatibility fixture remain absent from API/network/UI responses.

## Append-only and transaction protection

No runtime grants or existing audit rows/triggers were changed. Management retains its existing SELECT/INSERT authority for business transactions; UPDATE, DELETE, TRUNCATE, TRIGGER and public-schema CREATE remain denied. New read transactions reject even an otherwise permitted INSERT. Existing owner-level append-only triggers, fixed-search-path rejection function and restrictive tenant/actor foreign keys remain intact. Runtime ALTER TRIGGER/schema attempts are denied, and existing mutation/audit rollback tests pass. This does not claim protection against a PostgreSQL superuser or an infrastructure administrator.

Runtime UPDATE/DELETE/TRUNCATE/ALTER TRIGGER/CREATE TABLE attempts fail; owner trigger rejection, restrictive FKs, existing producer INSERT and audit-failure rollback pass. A test repository deliberately attempted INSERT inside the new read transaction and PostgreSQL rejected it as read-only.

## Migration/index evidence

Migration: 20261109000000_feature009_audit_read. SHA-256: 4db4894a6ecfc0b1431f7246aefc542d54d7f10172c351532c114e6a3f311956. Only four indexes are created. No new grants. Injected migration failure rolled back all indexes before exact application; two repeat deploy checks pass. Removing an index inside a test transaction is detected as drift and rolled back. Trigger/function definitions match the original immutable artifact. Prior nine ledger checksums remain unchanged; the isolated ledger now contains ten entries.

Prisma mirror SHA-256: ac8a9051a312cf34e24030ce054c9b4a159243933dfe6a5fbe19f3c2f1769c7c. Protected before/after SHA-256: 90f73c6f2bc6bce568974e27472fd652505e3034284ff4a9883104b1fd02a6ff. Runtime ACL and all initial artifacts are checked again in final-audit.json.

## Limits

- Acceptance is isolated development only. No protected migration, grant, audit/bootstrap write, activation, Microsoft-account change or deployment occurred. Protected activation requires separate authorization and the existing persistence/OIDC prerequisites; AUDIT_HISTORY_ENABLED remains off by default.
- Audit reads follow the existing OrgOwner/OrgAdmin policy. Project-scoped roles have no new audit grant; optional project filtering is not a separate project-user permission.
- Optional export, correlation-ID filtering and actor display-name enrichment are deferred. There is no existing authorized audit-export contract to reuse; this slice exposes bounded reads, not a new export/retention/SIEM subsystem. Correlation IDs are available in safe details. Historical actor references deliberately avoid unnecessary email/profile disclosure.
- Date controls select millisecond-resolution UTC boundaries; APIs/cursors and displayed detail timestamps retain PostgreSQL microseconds. Date ranges are capped at 366 days; unfiltered historical traversal remains paginated. Cursors expire in 15 minutes and are not persistent MVCC snapshots.
- Unknown or unsupported historical metadata is withheld rather than inferred. Oversized metadata is intentionally not rendered. No raw JSON viewer, audit mutation endpoint or global platform-admin view exists.
- Local performance samples and scoped Axe checks are not production SLAs, scale guarantees or full WCAG certification. Retention and protection against database superusers are outside this feature.
- FEATURE-010 was not started.

