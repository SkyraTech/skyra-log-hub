# SKYRA LOGHUB — DEV-018 P1-001 Exception Assessment

## 1. Executive summary

DEV-018 application validation is technically strong and independently supported by fresh current evidence, but the historical preservation gate did not pass. Four original DEV-013 evidence files differ from the DEV-018-start SHA-256 manifest and no authentic byte-for-byte recovery source was found. The overwrite cause has been corrected and regression-tested. P1-001 remains an unrecoverable, open historical-evidence exception. No exception approval is granted by this assessment.

## 2. Exact affected files and hashes

| Exact path | Expected SHA-256 | Current SHA-256 | Original evidence purpose | First observable divergence | Recovery sources investigated | Recovery status | Historical verification impact |
|---|---|---|---|---|---|---|---|
| `.tmp/dev013-evidence/http-security.json` | `5e3a7bc9cf2f6d2e5b2d758128754ea6b3477619a1a336cc9a243e596a770b25` | `ea9eeedc94b000bb29b55d4495e6fd950ce724a91e0e565015619c597fe6a81f` | DEV-013 durable signed-OIDC/session HTTP security results; the current corresponding session log records 12 passing tests. | Current file last-write observed 2026-11-17 12:27:18, after the manifest at 12:19:32. | Workspace tree and accessible `.codex/attachments` tree, SHA-256 matched only. | No exact copy found. | Original bytes and their exact historical run output cannot be verified byte-for-byte. Current rerun behavior remains separately evidenced. |
| `.tmp/dev013-evidence/outage-recovery.json` | `a244bdc79900ff92ee3d82a6c4a23e3eed73bfc046c8c9911c9245c4f3a902df` | `29fdf79179f1157b9604abf726980167b3ebc459fbdea28a34b51e498906136d` | DEV-013 session-store outage, PostgreSQL restart, expiry, and tenant-suspension recovery evidence; the current corresponding session log records 5 passing tests. | Current file last-write observed 2026-11-17 12:27:32, after the manifest at 12:19:32. | Workspace tree and accessible `.codex/attachments` tree, SHA-256 matched only. | No exact copy found. | The original recovery artifact cannot be authenticated; current recovery behavior is supported by current DEV-018 session evidence. |
| `.tmp/dev013-evidence/persistence.json` | `032db25eabb0f9c76c6afd6fdca66b27e88ac78b9c64cb686a6829418c5c2b6c` | `fa232441d10bda6f12dbb2d755baa309ca3e7a19ae80c81d86314115b400e596` | DEV-013 durable session repository persistence, encryption, rotation, revocation, OIDC-state, and cleanup checks; the current corresponding session log records 16 passing tests. | Current file last-write observed 2026-11-17 12:26:52, after the manifest at 12:19:32; this is the earliest observed divergence among the four. | Workspace tree and accessible `.codex/attachments` tree, SHA-256 matched only. | No exact copy found. | Original persistence artifact authenticity is lost; current durable-session behavior is supported by fresh DEV-018 session evidence and final browser recovery scenarios. |
| `.tmp/dev013-evidence/session-admin.log` | `38b93c9002511f23d2c493be1f70a5a489ce019bdd7703a4bf26f8fde22708fe` | `056a20c78aebaae75909b1eef55071227caed617d2089043bb24f98993b7f4a6` | DEV-013 Admin-service startup and route/runtime diagnostic log used by the session harness. | Current file last-write observed 2026-11-17 12:27:28, after the manifest at 12:19:32. | Workspace tree and accessible `.codex/attachments` tree, SHA-256 matched only. | No exact copy found. | The original diagnostic trace is not independently verifiable; it does not invalidate current runtime test results, but it blocks exact historical artifact preservation. |

The first observable divergence dates are filesystem last-write observations, not proof of the exact write instruction. The root-cause evidence below makes the session harness overwrite the supported explanation.

## 3. Root cause

During the original DEV-018 session execution, several session tests selected `.tmp/dev013-evidence` when the run label was not handled. `tests/sessions/identity-stack.mjs` opened `session-admin.log` with `fs.openSync(...,'w')`, truncating an existing file. The DEV-018 session logs and file timestamps align with that execution window.

## 4. Recovery attempts

The recorded recovery search (`.tmp/dev018-evidence/authentic-copy-search.json`) recursively searched the workspace and `C:/Users/VAMSHIKA/.codex/attachments`, comparing exact SHA-256 values. It found no candidate for any expected hash. DEV-014/015/016 similarly named files were inspected but did not match and were not substituted.

## 5. Why authentic restoration is unavailable

The original bytes are not present in any accessible local source. Regenerating the tests would produce new random identifiers, timestamps, process logs, and execution context; it would not recreate the original bytes. The original manifest is retained unchanged, and no expected hash was edited.

## 6. Prevention fix

`tests/sessions/evidence-target.mjs` now requires `SKYRA_SESSION_TEST_LABEL` to match the evidence directory and refuses to overwrite an existing DEV-013 `session-admin.log`; the `SKYRA_ALLOW_HISTORICAL_OVERWRITE` variable is no longer honored for that historical target. `identity-stack.mjs` uses this guard before opening the log. Session writers route DEV-017/DEV-018 outputs to their matching run-specific directories.

## 7. Prevention test evidence

`tests/sessions/evidence-routing.test.mjs` passed 1/1. It verifies a valid DEV-018 target, rejects a label/directory mismatch, and rejects an existing historical DEV-013 target. The focused DEV-018 session regression also passed migration, persistence, HTTP security, outage recovery, and cleanup-recovery runs without changing the four historical paths.

## 8. Historical verification impact

The final historical hash verification checks 4,462 entries and reports exactly four mismatches, with no additional historical artifacts changed. Therefore the original preservation requirement is failed for these four paths. Current DEV-018 evidence must not be described as proof that the original DEV-013 bytes survived.

## 9. Current technical acceptance evidence

The following claims remain supported by current evidence:

- Integrated browser acceptance: 92 tests, 92 passes, zero failures/skips (`integrated-browser-success.log`).
- Python SDK suite: 78 tests passed (`python-full.json`).
- Node package/consumer coverage: Node 24 and Node 22 builds, SDK tests, and contract tests exited 0 (`sdk-results.json`, consumer logs).
- Fresh master cohort: 261 canonical event IDs and 106 administrative audit records, reconciled across SDK, WAL, JSONL, Parquet, Query, Explorer/export, Analytics, Usage, and Audit (`reconciliation-index.json`, `master-storage-ledger.json`, `master-retirement.json`).
- Authentication and IAM: controlled signed OIDC, durable sessions, current role matrix, and least-privilege runtime checks passed (`service-topology.json`, `final-audit-final-remediation.log`, `query-runtime-after.json`).
- Quota/WAL/archive durability: authoritative admission bytes, permanent receipts, retirement, and replay behavior passed in the master cohort.
- Query/Explorer/Analytics/Usage/Audit integration and cross-tenant security passed in the 92-test integrated run.
- Recovery paths: BFF/session recovery, Query/Admin outage handling, PostgreSQL/session recovery, cancellation/deadline, and WAL replay passed in current evidence.
- Protected PostgreSQL and Skyra Platform preservation passed: protected snapshot unchanged, Platform clean, and 37 archives verified unchanged by the final audit.

These current claims are technical acceptance evidence, not restoration of the four historical files.

## 10. Residual risks

The original DEV-013 artifacts cannot be independently audited byte-for-byte; exact historical process diagnostics and serialized evidence are unavailable. The exception also means downstream reports that relied solely on those original bytes require qualification. No production-readiness, Entra, deployment, backup, or scale claim is added by this assessment.

## 11. Proposed exception disposition

Keep P1-001 **OPEN — UNRECOVERABLE HISTORICAL EVIDENCE EXCEPTION**. Mark root-cause prevention resolved, historical-byte recovery unresolved, current application validation passed, and formal preservation acceptance failed.

## 12. Explicit approval requirements

Only an authorized human acceptance owner may approve a change to the historical-evidence acceptance criterion after reviewing this assessment and the four hashes. Approval must be recorded separately and must not claim that the original preservation gate passed. No approval is granted or assumed here.

## 13. Recommended final wording

Until explicit approval changes the acceptance criteria, retain:

**FAIL — DEV-018 preservation evidence unrecoverable.**

If an authorized human later approves a documented exception, a separate report may state:

**QUALIFIED TECHNICAL ACCEPTANCE — SKYRA LOGHUB DEVELOPMENT VALIDATED IN ISOLATION; HISTORICAL EVIDENCE EXCEPTION APPROVED.**

The unconditional PASS wording must not be used unless the original preservation conditions are genuinely satisfied.
