# SKYRA LOGHUB DEV-012 — Durability and Accounting

Verdict: **PASS — isolated contract verification**.

## Evidence that survives retirement

| Evidence | Policy |
| --- | --- |
| Active WAL | Always retained; never a retirement candidate |
| Closed WAL | Retire only after every frame has verified durable archive and committed accounting successors |
| quota_admissions COMMITTED | Permanent scoped identity, digest, original UTC period, events/bytes, journal and receipt retained unchanged |
| RESERVED / uncertain admission | Retain; no time-based refund and no maintenance reconciliation mutation |
| Project usage windows | Retain accepted and reserved counters; never infer charges from query timestamps |
| Finalized JSONL, manifest and catalog | Retain and verify; Parquet does not replace their durability responsibility |
| Derived Parquet | Optional verified query acceleration; canonical fallback preserved |
| Unknown files and uncertain proofs | Preserve and report; never classify by age alone |
| Redundant publication temporary | Remove only after exact finalized-successor and ownership proof |

The permanent admission ledger remains unbounded. No identity TTL, archive tombstone substitution or public retry-contract weakening was introduced. Maintenance performs no ledger cleanup, so an interrupted ledger deletion state does not exist. PostgreSQL restores its own durable committed records after restart.

## Retirement protocol and failure classification

The filesystem state machine is source WAL -> fsynced proof + watermark -> renamed retired WAL -> source unlink -> proof cleanup. All successor/ledger checks precede unlink. Actual source bytes and parsed frames must still match the proof. Recovery after source removal reconstructs the original admission digest using immutable archive events and the preserved identity ledger.

Process termination was injected before prepare, after prepare, after rename, after unlink and before proof cleanup. Each paused worker excluded a second maintainer. Dead-owner recovery retained accounting, validated successors and completed cleanup. A real disposable PostgreSQL stop/start while paused before unlink also recovered, reclaiming 5600 bytes with unchanged ledger and usage. These are process/database restart observations, not physical power-loss certification.

Corrupt JSONL, missing manifest, corrupt catalog checksum, RESERVED identity, missing owner, unknown journal file, hardlinked WAL, actual archive junction escape, traversal, insufficient work budget, cancellation and retention minimum all preserve source or refuse the operation. A live Gateway excludes maintenance. No accepted event or reservation is refunded by the cleaner. Unknown Parquet jobs remain even when old.

## Replay and quota results

The SDK fixture's measured admission representation stayed at 2 rows and 1392 -> 1392 PostgreSQL row bytes, with 0 -> 0 pending reservations. Row-byte measurement uses sum(pg_column_size(row)); it excludes shared indexes, table overhead and any claim about total database disk allocation.

Original receipt replay succeeds after actual WAL deletion, Gateway restart, with the fixture's short-lived deduplication receipt cache absent. It returns duplicate=true and the original receipt, performs no WAL append and changes no quota counter or admission row. A changed payload for the same retired identity returns 409. New ingestion rotates beyond the retired sequence watermark.

Quota regressions cover exact event/byte limits, whole-batch rejection, two Gateway processes, concurrent admissions, uncertain fsync/finalization, reservations with/without WAL, rollover, fresh policy/authority checks and tenant/project boundaries. They passed: 17 accounting, five boundary and eight browser TAP-reported tests. Permanent identity matching remains tenant/project/batch scoped.

## Security and preservation

No additional grants or schema objects were created. Existing Admin and Gateway privileges were rechecked, including audit immutability, credential-hash visibility and denied project/quota administration. The maintenance connection defaults to read-only and executes only scoped SELECT/advisory-lock operations. Query connections default to read-only and actual ledger DML fails with 25006; the shared credential itself was not converted into a separate read-only role. No public maintenance endpoint or client-supplied deletion path was added.

Protected before/after snapshot SHA-256: 90f73c6f2bc6bce568974e27472fd652505e3034284ff4a9883104b1fd02a6ff. Protected schema, grants, migration ledger and application row counts are unchanged. All ten isolated migration entries retain their canonical checksums. No owner database credentials are passed into normal Gateway or maintenance operation.

Evidence: lifecycle.log, lifecycle.json, storage-measurements.json, retirement.json, ownership.log, database-restart.json/log, query-readonly.json, quota integration/boundary/browser logs and final-audit.json under .tmp/dev012-evidence/; quota browser fixture artifacts under .tmp/dev012-quota-evidence/.
