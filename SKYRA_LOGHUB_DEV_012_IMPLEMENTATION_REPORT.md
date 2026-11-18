# SKYRA LOGHUB DEV-012 — Implementation Report

Date: 2026-11-10. Verdict: **PASS — DEV-012 IMPLEMENTED IN ISOLATION**.

## Baseline and scope

Work continued on branch main at 19f084ad36fe37bb57ca107103e136d2d4a378be, with 346 existing status entries (130 modified tracked entries, 216 untracked entries, nothing staged). All 1359 initial source files remain. Platform stayed clean at 928ca4343ab3a1887e586123a6ba5bb88b56a0ef; all 37 immutable package archives and 197 historical reports/migration/package artifacts were verified unchanged. No commit, reset, deployment, protected migration, Entra change, package publication or DEV-013 work occurred.

The existing architecture already had fsynced framed WAL, deterministic finalized JSONL publication, manifests and PostgreSQL catalog, permanent quota admission identities, advisory project locks and an opt-in DuckDB Parquet converter/planner. Metered automatic compaction correctly refused deletion but supplied no usable retirement lifecycle. Rotation inferred the next sequence only from remaining filenames. Parquet conversion existed but was not automatically invoked by ingestion; its publication could replace derived files, its namespace could collide across service partitions, and stale-job recovery deleted files by age alone.

## Implementation

New StorageMaintenance performs explicit offline, bounded segment retirement. It is not an HTTP endpoint, a startup cleanup or an automatic timer. The existing metered compaction guard remains enabled.

1. Verify a direct owned child of the local disposable parent, cluster/store marker, regular single-link files, canonical directories and registered journal path hash. Reject unknown journal artifacts, links/junctions and traversal.
2. Acquire the same cross-process journal ownership lock used by Gateway. A live Gateway, publisher, recovery worker or second maintainer excludes this worker. Acquire sorted, nonblocking project advisory locks when finishing a retirement; release every held lock on failure.
3. Parse every closed frame with existing CRC/digest validation. Require matching scoped COMMITTED admission, journal, normalized byte/event charge, digest, original receipt and period. Never retire active WAL, unresolved reservations, empty/invalid segments or ambiguous successors.
4. Reproduce original archive event bytes, then verify finalized JSONL, manifest, catalog scope/count/checksum/time bounds and complete event identities. Reconstruct the original payload digest from successor events, including whether tenant_id was originally injected by publication.
5. Fsync verified successor files; persist a monotonic sequence watermark and a checksummed retirement proof before atomic rename. Reparse and compare actual source frames to the proof on recovery. Revalidate successor/ledger evidence before unlink. Clean the proof only after unlink succeeds.
6. Resume PREPARED, renamed, already-unlinked and staged-watermark operations idempotently. Malformed metadata, unexpected retired files, ambiguous names or changed successors preserve evidence and fail closed.
7. Remove only UUID-named, byte-identical redundant publisher intermediates whose finalized successors were verified. Preserve unknown, mismatched, young or excess temporary files.

Existing ingestion_checkpoints rows are unscoped by tenant/journal and have no active consumer implementation in this source. Any registered row therefore conservatively blocks retirement, including recovery/unlink, rather than silently invalidating a possible reader. Historical manifest/receipt WAL offsets remain provenance; Query uses archive locators and metered replay uses the permanent ledger.

The watermark prevents retired sequence reuse across restart; disabling quota accounting on a retired metered journal fails startup. Legacy compactSegment now rejects unsafe filenames, missing ownership and linked files.

## Bounds and operator procedure

Defaults: two segments/cycle, 16 MiB/segment, 128 MiB of charged file reads/cycle, 2,048 frames/segment, eight redundant temporary files/cycle and 24-hour minimum age. Hard ceilings reject invalid options. WAL/root enumeration is bounded; cancellation is checked before mutation stages. The bounded derived staging scanner preserves unknown jobs instead of deleting them solely by age.

The supplied command supports this isolated development target only. First stop its Gateway normally. The fixed .tmp/dev012-evidence/target.json selects the previously verified owned fixture; it is not an arbitrary API path. With the disposable cluster running:

    node scripts/run-storage-maintenance.mjs
    node scripts/run-storage-maintenance.mjs --apply

Default invocation is dry-run. Review retained reasons and eligibility before explicit apply. Tests use minAgeMs=0 only for their new owned fixtures; the operator command keeps the 24-hour default. The helper verifies physical cluster identity and all ten migration checksums, then supplies the existing nonowner Gateway connection with default_transaction_read_only enabled. Migration integrity checks run separately; maintenance executes no DML, DDL or grants. Stop on a retained/corrupt proof; restore known successor evidence from an independently verified source and rerun. Do not delete the proof, watermark, ledger or canonical archive to silence an error.

## Parquet and Query security

Real Query DI discovery now drives the existing materialization use case in isolated verification. New derived paths include the full canonical checksum, preventing same-filename service collisions. Existing validated legacy caches remain readable. Source integrity, metadata scope, source byte/count association, path components and directory links are checked. Publication fsyncs files and uses create-without-replace hard links on the tested NTFS filesystem; an existing different artifact is preserved. Unknown staging jobs remain for investigation, with bounded scanning.

Actual parquet_only reads and restart reuse passed. Corrupt cache is rejected in parquet_only mode; hybrid safely returns identical canonical JSONL events. Canonical JSONL/manifests/catalog are never deleted because Parquet exists. Materialization remains explicitly invoked, not an automatic ingestion scheduler or a new public API.

Every Query Prisma connection, including reconnects, now sets default_transaction_read_only=on. A real attempted admission UPDATE is rejected with PostgreSQL 25006. This is an application connection safeguard; the existing shared Gateway credential's grants were not changed or claimed to be a dedicated read-only database role. No protection against a compromised holder deliberately overriding session settings is claimed.

## Source, schema and limitations

Primary source: apps/ingestion-gateway/src/storage/maintenance/storage-maintenance.ts; WAL sequence/compaction guards; Query parquet-cache components and metadata/prisma.service.ts. Guarded commands and fault fixtures live under scripts/ and tests/storage/. Detailed invariant design: docs/storage/DEV-012-retention-invariants.md. Final source/privilege/migration inventory: .tmp/dev012-evidence/final-audit.json.

No schema migration or grant was required. All ten prior migrations and both Prisma schema mirrors are unchanged. Permanent identities, unresolved reservations, finalized archives and unproven staging artifacts can continue growing. Achieved reclamation removes proven redundant WAL and publisher temporary bytes; it does not bound all storage. Windows file flush, rename, unlink and restart behavior were exercised; directory fsync, physical power loss, hostile filesystem modification by an independent privileged user and distributed filesystems are not certified. Offline same-journal maintenance deliberately pauses its ingestion writer. Local permission/disk-full error handling is fail-closed by design; a full physical disk and hardware power loss were not injected.
