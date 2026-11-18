# DEV-012 retention invariants

Maintenance is explicit, offline and limited to a verified disposable store. It never deletes finalized JSONL, manifests, catalog rows, quota windows or admission identities. An active Gateway and maintenance cannot own the same journal concurrently. Other journals may ingest under existing per-project accounting locks.

A closed segment is eligible only when every frame passes CRC/digest parsing, every scoped admission is COMMITTED in the same registered journal with matching digest/count/normalized bytes/receipt, and every derived JSONL partition, manifest and catalog row matches the original canonical events. RESERVED, missing, corrupt, unregistered and ambiguous evidence stays. Age is only a minimum, never sufficient proof.

Retirement persists an fsynced proof before rename, rechecks successor evidence before unlink, and can resume interrupted work. A durable monotonic segment watermark prevents name reuse after retirement/restart. Pending operations are revalidated; malformed metadata and unexplained missing evidence fail closed. File fsync is required; Windows directory fsync is not claimed. Process-kill validation does not certify physical power-loss recovery.

The permanent quota_admissions table remains the compact historical identity index. It preserves tenant/project/batch, digest, original UTC admission period, counts/bytes, journal identity and original receipt. It is not purged and can grow without bound. Deleting all old identities would weaken the existing permanent retry contract, so no bounded-ledger claim is made.

Only byte-identical redundant publisher temporary files with a verified finalized successor may be removed. Unknown files, links/junctions, traversal, missing/corrupt archive or catalog state block retirement. Maintenance uses the nonowner Gateway database role for reads only and does not grant new rights or expose an HTTP cleanup endpoint.

Canonical JSONL remains required even when verified derived Parquet is selected by Query. Parquet capability must be exercised independently; derived caches do not authorize deletion of the canonical archive.

Existing ingestion_checkpoints rows lack tenant/journal ownership scope. There is no active reader implementation in this source, but any registered checkpoint conservatively blocks retirement and resume/unlink until its retention dependency can be proved. Historical manifest and receipt WAL references remain provenance; Query reads archive locators and metered replay reads the permanent identity ledger.
