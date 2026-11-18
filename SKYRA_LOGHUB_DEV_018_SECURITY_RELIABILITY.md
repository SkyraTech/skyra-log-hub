# SKYRA LOGHUB — DEV-018 Security & Reliability Report

## Verdict

All exercised security and reliability checks passed in the disposable topology. The only open gate is preservation of four historical evidence bytes, documented separately; it is not an observed runtime authorization failure.

## Identity and session controls

Controlled signed OIDC was used with issuer/audience/signature validation, CSRF checks, HttpOnly session cookies, durable PostgreSQL-backed sessions, restart recovery, expiry, revocation, and foreign-tenant isolation. Real Microsoft Entra configuration remained pending and was not fabricated.

## Authorization matrix

OrgOwner, OrgAdmin, ProjectAdmin, Developer, and Viewer paths were exercised through the real Admin/BFF routes. Cross-tenant, cross-project, forged browser context, stale membership, revoked credential, quota mutation, audit export, and Query-scope attempts were denied as expected.

## Runtime least privilege

The disposable roles were verified directly. Admin cannot read credential hashes or create schema; Gateway cannot update projects/quotas or insert audit rows; BFF session runtime is limited to session/login tables plus required public reads; Query runtime is archive-catalog-only. Query privilege tests passed 12/12.

## Reliability and recovery

The matrix covered lost acknowledgements, duplicate receipts, pending reservations, BFF crash/restart, Query/Admin outage recovery, PostgreSQL restart, session cleanup interruption, export cancellation/deadlines, bounded traversal, WAL retirement, and replay after dedup-cache deletion. No duplicate admission or fabricated data was observed.

## Data safety

CSV formula controls, JSON/CSV redaction, safe filenames, cursor binding, tenant/project scope, actor enrichment limits, audit immutability, and no-secret browser artifacts passed. Protected PostgreSQL before/after snapshots were identical.

## Open issue

Four historical DEV-013 evidence files differ from the DEV-018-start hash manifest. This prevents a clean preservation gate and is tracked as P1-001; no source or protected-database mutation was detected.
