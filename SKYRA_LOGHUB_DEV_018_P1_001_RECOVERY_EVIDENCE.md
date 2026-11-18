# SKYRA LOGHUB — DEV-018 P1-001 Recovery Evidence

## Investigation

The DEV-018-start manifest contains 4,462 prior evidence hashes. The four divergent paths are:

| Path | Baseline SHA-256 | Current SHA-256 | Current last write |
|---|---|---|---|
| `.tmp/dev013-evidence/http-security.json` | `5e3a7bc9cf2f6d2e5b2d758128754ea6b3477619a1a336cc9a243e596a770b25` | `ea9eeedc94b000bb29b55d4495e6fd950ce724a91e0e565015619c597fe6a81f` | 2026-11-17 12:27:18 |
| `.tmp/dev013-evidence/outage-recovery.json` | `a244bdc79900ff92ee3d82a6c4a23e3eed73bfc046c8c9911c9245c4f3a902df` | `29fdf79179f1157b9604abf726980167b3ebc459fbdea28a34b51e498906136d` | 2026-11-17 12:27:32 |
| `.tmp/dev013-evidence/persistence.json` | `032db25eabb0f9c76c6afd6fdca66b27e88ac78b9c64cb686a6829418c5c2b6c` | `fa232441d10bda6f12dbb2d755baa309ca3e7a19ae80c81d86314115b400e596` | 2026-11-17 12:26:52 |
| `.tmp/dev013-evidence/session-admin.log` | `38b93c9002511f23d2c493be1f70a5a489ce019bdd7703a4bf26f8fde22708fe` | `056a20c78aebaae75909b1eef55071227caed617d2089043bb24f98993b7f4a6` | 2026-11-17 12:27:28 |

The manifest was captured at approximately 12:19. The timestamps and DEV-018 session logs place the first divergence in the original DEV-018 session execution window at approximately 12:26–12:27.

## Root cause

`tests/sessions/identity-stack.mjs` opened `session-admin.log` with mode `w`. Several session tests also selected `dev013-evidence` when no matching label branch existed. The DEV-018 runner therefore executed session work against historical DEV-013 paths before routing was corrected.

## Recovery search

`authentic-copy-search.json` records a recursive SHA-256 search of the workspace and `C:/Users/VAMSHIKA/.codex/attachments`. No file matched any of the four baseline hashes. Older-looking DEV-014/015/016 files were inspected but did not match and were not used.

## Restoration decision

No exact authentic copy exists in the accessible recovery sources. The four files were not modified during remediation and were not replaced with regenerated evidence. P1-001 remains an unrecoverable preservation exception pending an external backup.

## Prevention change

Added `tests/sessions/evidence-target.mjs`, used by `identity-stack.mjs`, which:

- requires `SKYRA_SESSION_TEST_LABEL` to match the evidence directory;
- refuses an existing DEV-013 `session-admin.log`; `SKYRA_ALLOW_HISTORICAL_OVERWRITE` cannot bypass the historical-target refusal;
- prevents the DEV-018 runner from writing historical evidence.

The migration writer was also routed to `dev018` when the DEV-018 label is active. `tests/sessions/evidence-routing.test.mjs` passed, and the focused DEV-018 session regression passed.

## Reverification

- `prior-evidence-verification-remediation.log`: four expected mismatches remain, unchanged.
- `final-audit-remediation.log`: source, migration, Platform, privilege, whitespace, and protected-catalog checks passed.
- `protected-remediation-after.log`: protected target remained read-only and unchanged.
- `cluster-stop-remediation.log`: only the manifest-owned disposable cluster was stopped.

## Conclusion

P1-001 is root-caused and future overwrites are prevented, but the original bytes cannot be restored from accessible sources. The DEV-018 verdict therefore remains non-PASS.
