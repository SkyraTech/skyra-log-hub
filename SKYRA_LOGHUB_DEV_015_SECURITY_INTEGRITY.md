# SKYRA LOGHUB — DEV-015

Acceptance date: 2026-11-16 (Asia/Calcutta). Evidence is local, isolated and sanitized.

## Verdict

PASS for the isolated DEV-015 security/integrity scope. No protected activation or new IAM capabilities.

## Threat boundaries and outcomes

| Boundary | Demonstrated result |
|---|---|
| Private owner | Read/edit/delete only with current log/project access |
| Other owner, ordinary member, OrgAdmin | Private listing/read/edit/delete denied or not found |
| Shared reader | Read allowed; mutate/sharing escalation denied |
| Shared manager | projects.update plus logs.search/current project access required |
| Creator sharing transition | Owner-only; shared transition also requires projects.update |
| Tenant/project overrides and foreign IDs | Rejected; no foreign saved filters or log events returned |
| Revoked/suspended identity, removed project scope | Direct API denial; reactivation does not revive revoked cookie |
| Inactive project | Saved-search/export denied according to current Explorer authority |
| CSRF/missing session | Mutation/export denied |
| Stale/missing version | 409/428; simultaneous updates produce one success and one conflict |
| Shared mutation/audit failure | Entire transaction rolls back |
| Mid-export revocation or suspension | Buffered events discarded before download headers |
| Query scope/record/cursor/partial-result faults | No apparently complete partial file |
| File name/formula/Unicode inputs | Constant file names, bounded cells, formula neutralization, round-trip canonical JSON |
| Limits/concurrency/deadline/disconnect | Event/byte/page bounds, 1/session and 2/BFF, abort and slot release tested |
| Database roles | Only Admin CRUD on saved_searches; Gateway/Query/BFF no table grants; no TRUNCATE |
| Audit privilege | Admin append/read only; UPDATE/DELETE/TRUNCATE remain denied |

## Persistent scope and audit

One additive saved_searches table has UUID identity, tenant/project composite foreign key, immutable creator FK, bounded name/description, PRIVATE/PROJECT visibility, v1 JSON filters, bigint version and timestamps. Unique owner/project/name and owner/shared keyset indexes support scoped reads. The API accepts only text, severity, service, environment, independent trace/correlation and relative/absolute UTC ranges; no SQL/AST/owner/scope overrides. Relative presets resolve at application time; absolute bounds remain fixed.

Admin enforces current IAM in every transaction. Private ownership is strict even against OrgAdmin; shared management reuses projects.update and does not expand the existing 20-capability policy. Shared creator departure retains manageable project searches; private searches remain inaccessible. GET/list are authorized; create/update/delete are transactional. If-Match is required for update/delete, locked rows serialize version comparison, stale writes conflict, and duplicate names fail predictably. Browser reload, BFF crash, actual PostgreSQL stop/start, cold browser process and a new signed OIDC session preserve the records/filter semantics. No localStorage persistence is used.

New migration SHA-256 `cff6b71a0d456ba9eda2a7937b8f90e7fce641a0925769ca4637cdc0dff9518f`; initial transaction rollback, first deployment, repeat verification, nine constraints, eleven columns, four indexes and restricted grants passed. Intentional constraint/index/grant/ledger drift was detected and rolled back. All previous migration checksums remain intact.

Private saved-search operations intentionally create no tenant-wide administrative audit, avoiding leakage of private query text. Shared creates/updates/deletes write append-only administrative audit events inside the same transaction, with resource ID, actor, project, version, outcome and operation correlation only. Names/descriptions/filters are excluded. Both Admin and BFF audit projections recognize the new target/actions. Forced audit failure proved the shared mutation rollback. Read/export activity uses existing Query operational audit rather than new administrative mutation noise. Existing audit retention/settings remain unchanged.

## Export trust and resource boundaries

BFF POST /bff/query/export authenticates session/CSRF and a single authorized project, freezes effective time/filter context and starts matching traversal at page one. It validates Query response scope, canonical records, pagination, unavailable/partial segments and duplicate identities. Authority is refreshed before each page and before sending. Current-page event IDs can be supplied to reject changed displayed pages with 409. Errors preserve safe Query validation status (including 422 invalid cursor) and BFF authorization status.

Limits: 1,000 matching events, 10 pages × 100 events, 5 MiB uncompressed output, 15 seconds, two exports per BFF and one per session. Current-page scope preserves up to 500 displayed rows. Query JSON is at most 8 KiB, request options 32 KiB and an upstream response 6 MiB. Slots remain until response finish/close and pending authority work settle; stalled downloads are destroyed at the deadline. Disconnect/cancel aborts upstream fetch. Buffering is bounded before download headers, so late failures do not produce deceptively complete files.

JSON has scope/filters/metadata/events; CSV quotes all nine columns and retains complete canonical_json. Formula-leading display values are prefixed with an apostrophe, including leading whitespace/control/Unicode format characters. Original JSON message content is preserved. Valid byte truncation occurs only at an event boundary. Metadata and exposed X-Export headers/constant -truncated filenames explicitly distinguish completion from truncation; effective consistency is bounded-keyset-traversal. The Console warns and allows cancellation. [Advanced Explorer contract](docs/DEV-015-advanced-explorer.md)

## Exact-byte, compatibility and privilege evidence

Initial main HEAD `19f084ad36fe37bb57ca107103e136d2d4a378be`: 395 folded entries, 150 tracked modified, 245 untracked, 0 staged. Final same main HEAD: 422 folded entries, 162 tracked modified, 260 untracked, 0 staged. All 1408 initial files remain, including original untracked work. 210 historical reports/migration/archive artifacts are byte-unchanged. 73 existing source files changed for this feature, 25 files were added, and 1 generated cache changes were recorded.

Platform remains clean at `928ca4343ab3a1887e586123a6ba5bb88b56a0ef`; all 37 immutable package archives match their initial/HEAD bytes. Gateway storage/DEV-012 maintenance and the Parquet converter, DEV-013 session repository/crypto/OIDC code and DEV-014 HttpTransport/write queue are byte-preserved. The session guard extraction enables reuse of the same authentication logic for export revalidation. Both Prisma mirrors match, and removal of only the three new inverse relations plus new SavedSearch model reproduces the exact initial schema bytes, including original mixed line endings. Existing eleven ledger identities/checksums remain unchanged; the sole additive ledger entry is `20261116000000_dev015_saved_searches`. Git whitespace check passes. No git commit/reset/rebase/merge/push was performed. [`.tmp/dev015-evidence/final-audit.json`](.tmp/dev015-evidence/final-audit.json)

The migration drift tests detect missing constraints/indexes, a forbidden BFF table grant and a changed ledger checksum, rolling each injected defect back. Final roles remain five with twenty permissions. Session runtime role can access only its own session/login tables; Admin cannot read credential hashes or mutate audit history; ingestion role cannot mutate projects/quota policy/audit. Test fault triggers are removed. Public tarballs contain no private runtime data, credentials or workstation source paths. Original public SDK member signatures and Node 22/24 declarations pass. [`.tmp/dev015-evidence/package-api-audit.json`](.tmp/dev015-evidence/package-api-audit.json); [`.tmp/dev015-evidence/saved-search-migration.json`](.tmp/dev015-evidence/saved-search-migration.json)

## Protected database and cleanup

Exact protected target: `127.0.0.1:5432 / skyra_loghub_dev / skyra_loghub_user`, PostgreSQL 17.9. Separate target-verified snapshots used forced read-only transactions. Before/after catalog, grants, ledger and content snapshots are identical. SHA-256: `90f73c6f2bc6bce568974e27472fd652505e3034284ff4a9883104b1fd02a6ff`. No protected migrations, application records, credentials, audit records, sessions, grants, bootstrap or flags were written. The disposable cluster was separately verified at `127.0.0.1:5433 / skyra_loghub_disposable_validation`, PostgreSQL 17.9, and stopped using its owned manifest after tests; no other database was stopped. [`.tmp/dev015-evidence/protected-after.log`](.tmp/dev015-evidence/protected-after.log); [`.tmp/dev015-evidence/cluster-stop.log`](.tmp/dev015-evidence/cluster-stop.log)

## Safe failures and limitations

Exports are bounded keyset traversals, not global snapshots. A newer archived event inserted ahead of the cursor appeared in the next search but was not retroactively added to the running export. Limits can truncate valid files; deadline, unavailable archives and late failures return no complete file. Export admission is per BFF instance, not a distributed cluster-wide limit. Bounded buffering still consumes memory; these tests are not production load certification. Cancellation cannot retract bytes already delivered. No durable export-job resume exists.

Saved-search creation has a per-creator accessible-count guard of 200; it is not a global aggregate guarantee when other creators add shared searches. Lists are capped/paginated. Names are unique per owner/project; different owners can intentionally use the same shared name. SQL-only checks and the partial shared index remain in the migration because Prisma 5 does not model them fully.

The optional full Python SDK run stalled in the unchanged storage ownership path after the duplicate-instance conflict diagnostic and was stopped only after verifying its exact task-owned PID/command. Its log is retained; that full suite is **incomplete**, not passed. The relevant 14 Python schema tests passed and only its generated schema mirror changed. No DEV-015 P0/P1 defect remains in the tested scope.

Real Microsoft Entra configuration/login, initial organization/verified owner decisions, protected activation, deployment and publication remain outside this isolated acceptance. No protected records or grants were changed; no DEV-016 work was started.
