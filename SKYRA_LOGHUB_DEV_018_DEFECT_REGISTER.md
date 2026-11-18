# SKYRA LOGHUB — DEV-018 Defect Register

| ID | Severity | Status | Finding | Resolution / next action |
|---|---|---|---|---|
| P1-001 | P1 | OPEN — UNRECOVERABLE HISTORICAL EVIDENCE EXCEPTION | Four `.tmp/dev013-evidence` files no longer match the DEV-018-start SHA-256 manifest: `http-security.json`, `outage-recovery.json`, `persistence.json`, `session-admin.log`. No authentic byte-for-byte copy was found in accessible local sources. | Root-cause prevention: RESOLVED. Historical-byte recovery: UNRESOLVED. Current application validation: PASSED. Formal preservation acceptance: FAILED. External exact-byte backup and authorized acceptance decision are required; no exception approval is granted here. |
| P1-002 | P1 | RESOLVED | Query harness used the ingestion runtime role, exposing unnecessary quota/credential/session capabilities. | Added `skyra_query_runtime`, archive-only grants, connector guards, and 12 direct denial tests; full matrix passed. |
| P2-001 | P2 | RESOLVED | Saved-search browser submission was timing-sensitive in the first full run. | Awaited the POST and click deterministically; focused and full reruns passed. |
| P2-002 | P2 | RESOLVED | Explorer correlation deep-link assertion could run before Angular form hydration. | Added explicit field synchronization; full run passed. |

## P1-001 exception assessment

See `SKYRA_LOGHUB_DEV_018_P1_001_EXCEPTION_ASSESSMENT.md`, `SKYRA_LOGHUB_DEV_018_P1_001_RECOVERY_EVIDENCE.md`, `SKYRA_LOGHUB_DEV_018_STRICT_PRESERVATION_STATUS.md`, `.tmp/dev018-evidence/authentic-copy-search.json`, `.tmp/dev018-evidence/strict-recovery-sources.json`, `.tmp/dev018-evidence/strict-prior-evidence-verification.json`, and `.tmp/dev018-evidence/evidence-routing-strict-final.log`.

No P0 defect, unresolved runtime authorization failure, protected-database change, or production activation was observed.
