# FEATURE-008 — Accounting and security

Verdict: **PASS — isolated accounting and security gates**.

## Canonical units and windows

Accepted events are normalized event-array entries in a durably admitted batch. Canonical ingestion bytes are Buffer.byteLength(JSON.stringify(normalizedEvents), 'utf8'): array brackets and commas count, including UTF-8 Unicode bytes. The HTTP envelope, compression, WAL framing, archive enrichment/size and Query reads do not count. Changing batching can change bracket/comma overhead. Analytics and archive visibility are not the accounting authority.

Hard project budgets use UTC daily windows [00:00:00, next 00:00:00). The server admission clock selects the window; event timestamps and browser dates cannot select it. A reservation remains in its original window across midnight. No reset cron runs. Null event/byte limits are unlimited; a missing row is enabled/unlimited; disabled policies still meter usage. Zero blocks new nonempty batches. The whole batch must fit both limits. Remaining capacity is max(0, limit - accepted - reserved); percentages include reservations and clamp to 100, including zero limits. Reductions never rewrite usage. Policy edits serialize with admission, affect new reservations, and require the current ETag. API counters/limits are decimal strings bounded at 9007199254740991.

## Protocol and failure boundaries

1. Existing authentication/rate guard, strict validation and whole-batch tenant/project/environment authorization run first. Metered batches must contain one project. Credential rate limiting remains before idempotency, so a throttled retry can receive the separate retryable rate error without a quota charge.
2. A pinned pg PoolClient acquires a session advisory lock keyed by tenant/project. Separate processes and credentials share this lock. Admin edits take the matching transaction advisory lock before project row locks.
3. Resolve permanent batch identity and digest before budget admission. COMMITTED returns the persisted receipt without append or charge; mismatched content is 409. Another journal's pending reservation is 503 until its owner recovers.
4. In a short transaction, verify ACTIVE tenant/project through a fixed-search-path lock-only function, check policy and counters, reserve exact events/bytes and persist a stable receipt ID. Commit the reservation.
5. In a second transaction, reacquire ACTIVE row locks, append/fsync the existing WAL, then atomically move reserved capacity to accepted counters and mark the ledger COMMITTED. The project advisory lock spans both transactions and the filesystem operation.
6. Fsync acceptance remains authoritative. If finalization fails after fsync, return durable acceptance, retain reserved capacity and reconcile; usage reads expose RECONCILING. Ambiguous append/fsync failures quarantine admission and return 503, retaining capacity.
7. On owned restart, validate every retained WAL segment, fsync verified frame-bearing files, reconcile exact matching pending frames once, and cancel reservations with no frame only after complete owned-journal recovery. Runtime reconciliation finalizes matching frames but never refunds missing frames by timeout. Reconciliation interruption rolls back; the next restart repeats safely.

A PostgreSQL transaction and filesystem append are explicitly not one ACID transaction. Rejected auth/schema/quota requests never become accepted usage. A failed HTTP response after ambiguous storage durability is not treated as proof of rejection: capacity remains reserved until verified recovery. Accepted-but-unfinalized frames remain accounted as pending capacity and cannot oversubscribe a limit.

## Executable evidence

- Same project, two credentials, two Gateway processes: 24 requests, limit 10, exactly 10 accepted and 14 rejected; overshoot zero.
- Twelve concurrent identical requests: one append/charge, stable receipt ID, eleven duplicate acknowledgements. Replay remains deduplicated after deleting the short-lived receipt index.
- Process termination after reservation, after WAL fsync, and after counter changes before commit; cancellation/finalization and duplicate replay are verified on actual restart.
- Process termination during reconciliation rolls back its transaction; the next restart finalizes once.
- A real PostgreSQL finalization-rejection trigger leaves reserved capacity after durable acceptance; removing the disposable trigger lets reconciliation finish. A simulated ambiguous append acknowledgement quarantines the owned WAL and recovers exactly once.
- Revoking runtime audit INSERT makes a policy edit fail and rolls back its version; the original privilege is restored in finally. No test trigger remains.
- Exact byte thresholds, one byte above, whole crossing batches, negative/overflow DB constraints, zero/unlimited/disabled policy, UTC rollover and limit reduction are verified.
- SDK cohorts in two tenants and three projects reconcile 15 accepted events to exact normalized WAL payload bytes.

## Tenant authorization and runtime authority

All usage queries include tenant/project keys and authorize persisted active identity, tenant membership, project scope and quotas.read. Browser tenant/role claims do not grant access. OrgAdmin and scoped ProjectAdmin/Developer cannot manage quotas; Viewer is denied quota reads. A forged projects.manage assertion is denied at the quota endpoint. BFF responses whitelist public fields and discard journal/receipt/token internals.

The ingestion runtime has counter/ledger write and journal registration authority, but no project/quota metadata UPDATE, credential issuance or audit INSERT. Management may read counters and mutate quota policy but cannot SELECT credential key_hash. A lock-only function gives the Gateway row-lock authority without broad metadata UPDATE grants. PUBLIC function execution is revoked. Read-only usage never mutates counters. Audit updates remain transactionally immutable.

## Migration preservation and integrity

| Migration | SHA-256 |
|---|---|
| 20261106000000_feature008_quotas | beb67300844a31a2d315b4a835b19f9ed9a22dba65ee72f7716515a5e365a897 |
| 20261106010000_feature008_lock_authority | 19573408090c2f01a7e23221640801bb928cc253c1ddc29c437ec5f98e499ca6 |

Runtime grant artifact SHA-256: 7c05442ca9e1249657eda73aad0a124f7e527e3ae881ce81d1335c567746de2c. Canonical/mirror Prisma SHA-256: edd8be3008f32de0ec4fdb59590ea8a85ebe142ba3f2b35cdcacd3e2f3ecda44. The additive policy migration failure fixture rolled back fully; repeat deploy succeeded; ledger hashes and catalog checks pass. Dropping usage_bounds inside a disposable transaction was detected as drift and rolled back. Prior seven ledger checksums and 174 historical reports/migrations/package artifacts match the initial snapshot. Protected snapshots before/after match 90f73c6f2bc6bce568974e27472fd652505e3034284ff4a9883104b1fd02a6ff.

## Limits

- Development acceptance only. Protected activation, deployment, real Entra setup and FEATURE-009 were not performed.
- Activation is explicit and coordinated: all ingesting Gateways need INGESTION_QUOTAS_ENABLED=true; Admin HTTP quota APIs require QUOTA_USAGE_ENABLED=true plus persisted auth configuration. Defaults remain off. Mixed metered/unmetered Gateway rollout is unsupported; operators must coordinate cutover. Existing unmetered history is not inferred from archives. First activation requires empty owned WAL stores.
- Lost journals require operator recovery; pending capacity is not blindly refunded by TTL. A no-frame reservation after a failed second transaction is released by verified owned restart. Original receipt ID/count/digest/window remain stable; recovery reconstructs segment/offset and committed_at from recovered evidence, with committed_at representing recovery time when finalization never persisted.
- Metered automatic compaction is disabled to preserve pending evidence; WAL and permanent admission ledger retention need explicit accounting-aware maintenance before production volume. Recovery/publication still scan retained journals; this local milestone does not establish production scale.
- Daily quotas are distributed through PostgreSQL. The inherited credential rate limiter and maxEventsPerSec metadata are separate and are not presented as a new distributed rate engine. Servers require a consistent UTC clock.
- Usage history is window-keyed; displayed policy is current policy, not historical plan pricing. No billing, plans, adjustments UI, destructive reset or new analytics store was added.
- Fault tests terminate processes and exercise actual fsync/PostgreSQL failures; they do not simulate physical power loss. Scoped Axe checks are not full WCAG certification. Local timings are not SLAs.

