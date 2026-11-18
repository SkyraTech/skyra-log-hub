# FEATURE-005 — Durability and security

Date: 2026-11-05. Local isolation only.

## Trust and storage boundaries

All database writes use verified `127.0.0.1:5433/skyra_loghub_disposable_validation`, PostgreSQL 17.9, marker `26d25080-7655-4147-b05a-512ad359e14f`. Existing helpers verify exact URL/live identity/role/version/marker and physical data directory before mutation. Manager and Gateway use their existing separate nonowner runtime roles. Query runs actual Prisma discovery using the verified ingestion runtime's read privileges, not a test in-memory catalog. No schema/grant expansion or new migration is required. One isolated archive INSERT privilege is deliberately withdrawn/restored for fault injection.

Each Gateway store is freshly created with a unique ownership marker under repository `.tmp`; the reused factory's directory prefix is feature004-ingestion, not a reused FEATURE-004 data store. WAL/archive/benchmark paths belong to that marker. No unrelated process or unverified directory is deleted. The signal-exit double-stop bug in the test helper was corrected; only a verified stuck test child was terminated during diagnosis.

Protected PostgreSQL `5432/skyra_loghub_dev/skyra_loghub_user` is inspected only through the separate forced READ ONLY snapshot script. Before/after catalog, ledger and row digest comparison must match historical SHA-256 `90f73c6f2bc6bce568974e27472fd652505e3034284ff4a9883104b1fd02a6ff`. No protected credential, bootstrap, migration, grant, audit, backup/restore or activation is performed.

## Acknowledgement and recovery contract

1. SDK submission is bounded memory, not durable storage.
2. Gateway authenticates the persisted credential and validates schema/scope.
3. WAL serialization, append and synchronous fsync precede `durably_accepted`.
4. PostgreSQL receipt aids deduplication; retained WAL remains authoritative across receipt/publication failure windows.
5. Queryable archive requires finalized JSONL, integrity metadata and catalog registration. A legacy append alone is insufficient.
6. Query/BFF/UI visibility is separately verified with exact event IDs and field comparison.

Publication retries use deterministic batch/partition filenames and validate existing bytes rather than append duplicates. The opt-in embedded worker retries retained frames at startup and periodically; it is not separate distributed infrastructure. Accepted events survive the tested archive catalog denial and process/worker restart. Incomplete trailing WAL bytes are truncated to the last valid commit; corruption must fail closed or require repair, not be silently published.

No exactly-once, replication, multi-host durability, crash-consistent distributed publication or arbitrary OS/power-failure SLA is claimed. Directory fsync support on Windows is limited. Retained WAL must remain available; this feature performs no compaction. Corrupt or conflicting published bytes require intervention and are not overwritten. Production-scale retention/rotation/fault combinations are not certified by these local tests.

## Failure matrix and evidence level

| Failure / behavior | Verification | Classification |
|---|---|---|
| Normal multi-event WAL admission and exact query/UI identities | Actual public SDK, managed credential, Gateway, PostgreSQL, finalized JSONL, Query, signed-provider BFF and browser | PASS |
| Connection lost after actual Gateway acknowledgement | Loopback fault proxy drops first real response; SDK retries unchanged UUID; Gateway returns duplicate; no second frame | PASS |
| Archive catalog unavailable after WAL fsync | Real isolated INSERT denial; SDK still receives durable acknowledgement; grant restored; worker restart publishes original IDs | PASS |
| Gateway/worker restart and partial trailing frame | Actual owned journal receives three trailing bytes while stopped; startup truncates tail; same records recovered | PASS |
| Corrupt frames, write/fsync faults, rotation and checkpoint/compaction prerequisites | Existing Gateway/WAL real-file fault and process-crash regression suites; not all exercised in the browser's single run | PASS for named regression cases |
| Transient 503, hung peer/timeout, 401/403 | Real HTTP SDK peer tests; bounded attempts; authorization failures attempted once | PASS |
| Wrong project/environment, missing/invalid/expired/revoked key, inactive project/tenant, rate limit, verification DB access failure | Existing credential browser scenarios run against real isolated Gateway in a separate owned store | PASS |
| Invalid timestamp/schema and oversized request | Actual Gateway returns 422/422/413 and appends no frame | PASS |
| Cross-tenant query | Actual SDK data in two tenants; direct Query and authenticated BFF deny forbidden scope | PASS |
| Query transport failure and UI retry | Browser aborts one query request, sees safe error, then retrieves actual records on retry | PASS (simulated transport failure) |
| Session/membership revocation | Existing real signed-provider browser/session regressions | PASS |
| Full PostgreSQL server outage or host power loss during this exact run | Shared database not stopped; no unsafe crash of unrelated infrastructure | NOT TESTED in same-event run |
| Parquet publication for this run | Query reads supported canonical JSONL directly; independent existing Parquet regression retained | NOT APPLICABLE to selected path |

## Security and disclosure

FEATURE-004 generates the real credential through canonical Admin service authorization and transactionally persists only its verifier. Credentials never enter fixture/evidence JSON, source literals, URLs, browser storage, screenshots or application logs. Both primary and foreign test credentials are explicitly revoked; subsequent actual Gateway requests are denied. No new credential subsystem or administrative bearer authorization was introduced.

Tenant identity comes from the authenticated WAL header when publishing; per-event project authorization remains in admission. Query applies verified principal scope, safe partition resolution, checksum checks and row tenant/project filters. BFF uses existing persisted membership/session validation, CSRF and short-lived query assertions. No provider role claim, preview identity or browser project override grants scope. Direct Log Explorer navigation now bootstraps that same real session/workspace.

Final redaction checks compare evidence and persisted metadata against known issued secrets without printing those values. SDK errors intentionally omit request headers, credential, response body and fetch cause. No authentication tokens, cookies or private keys are exported in the sanitized continuity manifest.
