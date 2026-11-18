# DEV-017 — Advanced Audit and Usage contract

This is isolated development functionality. `ADVANCED_AUDIT_USAGE_ENABLED=true` explicitly enables the new BFF export/history and Admin history routes; it defaults off. Console runtime `advancedAuditUsage: true` exposes the controls. Existing audit, persistence, current IAM and durable-session activation gates remain required. No protected-environment activation is authorized by this document.

## Source inventory and decisions

| Existing authority | Reused source | Gap and change |
|---|---|---|
| Immutable audit writes | Admin core/audit/domain, PrismaAuditRepository; existing mutation transactions | Preserve append-only table, triggers and grants. No new audit writer or schema. |
| Audit reads | AuditHistoryService, PrismaAuditReadRepository, audit-query, audit-projection | Add exact existing metadata correlation predicate, cursor binding, watermark and one scoped actor batch. |
| Browser transport | Auth module AdminClientService and SessionAuthGuard | Add bounded export traversal, cancellation, repeated current authority checks and deep public projection. |
| Usage | QuotasService, project_usage_windows and quota_admissions | Read indexed daily windows once for up to 90 UTC days; preserve accounting/charging code. |
| Historical policy | Mutable project_quotas; audit records are not complete effective policy snapshots | Historical limits/utilization/exceeded state unknown. Optional trend is explicitly a current-policy reference. No speculative policy reconstruction or migration. |
| UI | AuditComponent, UsageComponent and existing TimeSeriesChartComponent | Add applied-filter exports, safe actor labels, correlation, daily charts/table/details. Chart value labels become configurable with existing behavior retained. |

No migration is necessary. Canonical/mirrored Prisma schemas and the 13 existing ledger entries remain unchanged. This avoids changing the admission write path merely to draw charts.

## Audit listing and actor display

Existing Admin and BFF audit list routes accept `correlationId` in addition to action, actorId, resource type/ID, project ID, UTC bounds, limit and cursor. Correlation is exact and case-sensitive, at most 64 ASCII letters/digits/hyphens, sourced from existing safe administrative `details.correlationId`. It is separate from SDK application-log `correlation.id`. No fabricated backfill or new competing representation.

The signed cursor binds tenant, current authenticated reader, every filter including correlation, page size, first-page watermark and last timestamp/UUID. Old cursors whose binding predates this change must be restarted. Pages order by UTC timestamp DESC / UUID DESC, including microsecond ties. Existing TTL is 15 minutes.

Actor IDs remain immutable. `actorDisplayName` is optional nullable current permitted display information, fetched in one batch restricted through memberships in the same tenant. It excludes emails, unsafe secret-like values, controls and Unicode format characters, and is bounded to 80 characters. Names may change between reads/pages; they are not historical snapshots. Missing/unavailable names fall back to `Actor <UUID>`; missing identity falls back to `Actor unavailable`. No IdP claims or foreign directory lookup. Metadata stays allowlisted; corrupt/unknown/oversized details are withheld.

## Audit export

`POST /bff/organization/audit/export` with HttpOnly session + CSRF:

```json
{"format":"json","filters":{"resourceType":"project","resourceId":"my-project"}}
```

Formats are `json` or `csv`. Scope is matching applied filters, starting at the first server page; browser cursor, limit, actor name and tenant overrides are rejected. Request cap 4KiB. Current `audit.read` is required; only canonical tenant-wide grants qualify. Project roles do not acquire organization audit rights.

Limits: 1,000 records, ten 100-record server pages, 5MiB uncompressed output, 15 seconds, one export per session and two per BFF process. Admin responses additionally have a 1MiB per-response transport bound and five-second upstream deadline. Session/membership and Admin audit capability are checked per page and again before completion. Disconnect/deadline aborts upstream transport. Slots remain occupied until response completion/disconnect and outstanding authority work settles. Errors discard buffered records without creating a partially complete attachment.

JSON is `{metadata,items}`; items use the public allowlist. Metadata includes watermark, frozen filters, page count, limits, count, truncated and reason. CSV columns: id, timestamp, actorId, actorLabel, action, resourceType, resourceId, correlationId, summary, changes (JSON), metadataOmitted. Every CSV field is quoted and quotes escaped; formula-leading values after leading controls/format/space characters receive an apostrophe. UTF-8, embedded quotes and newlines are preserved. Filenames are fixed server-controlled names.

Response headers: `X-Export-Truncated`, `X-Export-Reason`, `X-Export-Count`, `X-Export-Pages`, `X-Export-Watermark`, `X-Export-Consistency`; no-store, nosniff, attachment content disposition. Truncated filenames/status explicitly identify incomplete scope. JSON embeds truncation metadata; CSV uses the response headers and UI status.

Consistency is **watermark-bounded keyset traversal**, not one global MVCC snapshot. Filter/time context and first-page server watermark stay fixed; newer timestamped writes are excluded. A transaction that commits later with an older timestamp can still affect a later page or be behind an already traversed key. No complete point-in-time snapshot claim is made. Duplicate IDs, changed watermarks, invalid cursors and nonadvancing order fail safely. Mutable actor labels may reflect the current permitted name at each page.

## Daily Usage

Admin: `GET /admin/v1/tenants/:tenantId/projects/:projectId/usage/history?start=YYYY-MM-DD&end=YYYY-MM-DD`.
BFF: `GET /bff/projects/:projectId/usage/history` with the same query.

Tenant/actor authority is server-derived; existing current `quotas.read`, active tenant/membership and active authorized project are required. Start inclusive, end exclusive, daily UTC boundaries, one to 90 days, ending no later than tomorrow UTC (therefore includes today's partial day). Single project. The existing `(tenant_id,project_id,period)` primary-key range is used with one bounded query, not an archive or per-event/per-day scan. Authentication/authorization adds a fixed query count independent of returned days.

Each day returns accepted event/normalized-byte decimal strings, reserved decimal strings, accounting completeness, whether a window row exists and its update time. Missing windows mean no admitted or pending batches and yield zero. A storage failure is an error, not an empty successful series. `RECONCILING` means either reserved events or bytes remain; accepted and reserved are never combined into accepted counts. `COMPLETE` means counters for admitted batches have no pending reservations, not that the current UTC day is closed or an exactly-once global snapshot of all systems.

Historical quota limit, historical utilization and historical exceeded state are null/unknown because effective historical policy was not snapshotted. `currentPolicyReference` explicitly uses today's policy, including pending capacity. It may exceed 100% after a policy reduction. Unlimited reference has null percentage; zero limit with usage has no finite percentage and `ZERO_LIMIT`; zero/zero reference is zero. Rejected quota requests create no accepted charge and do not provide a durable per-day rejection/exceeded ledger. Policy changes within a day cannot justify inventing a single historical denominator.

Admission day is chosen by the server quota clock. Event occurrence time, Query counts, archives, WAL framing and Parquet size never determine usage. The byte definition is normalized UTF-8 JSON of canonical event arrays, including brackets/commas, excluding the envelope and framing. Permanent admission/receipt identities survive WAL retirement. DEV-017 changes no charging, reservation, reconciliation or retention logic.

## UI and validation

Audit exports use applied URL filters, not unsaved drafts; route/filter changes cancel the operation. Downloads are created only after a successful complete or explicitly truncated bounded response. User cancellation creates no new download.

Usage has 7/30/90-day presets, accepted events/bytes charts, explicitly labeled current-policy reference charts, daily table and selected-day detail. Missing reference percentages are stated rather than plotted as zeros. Project/context changes unsubscribe and invalidate old requests; unauthorized reads clear old history. Table regions scroll internally at narrow widths. Keyboard controls, actual computed themes, reduced motion and scoped Axe checks supplement screenshot review; this is not WCAG certification.

Test-only Gateway clock/fault controls are in existing test fixtures and never production main. Real acceptance uses a fresh local packaged SDK consumer, real Admin mutations, disposable PostgreSQL, signed-OIDC test peer, durable BFF, actual Gateway/WAL/accounting and Angular. Synthetic protocol/boundary tests are labeled separately from real-business evidence. Run the regression suites serially around PostgreSQL restart tests. Preserve previous evidence and stop at DEV-017.
