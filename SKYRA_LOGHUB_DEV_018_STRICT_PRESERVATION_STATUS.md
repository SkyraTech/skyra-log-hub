# SKYRA LOGHUB — DEV-018 Strict Preservation Status

## 1. Current official DEV-018 verdict

**FAIL — DEV-018 preservation evidence unrecoverable.** The original acceptance criteria are unchanged.

## 2. Exception approval

No waiver or exception approval has been granted or assumed.

## 3. Affected files and exact hashes

| Path | Expected SHA-256 | Current SHA-256 | Status |
|---|---|---|---|
| `.tmp/dev013-evidence/http-security.json` | `5e3a7bc9cf2f6d2e5b2d758128754ea6b3477619a1a336cc9a243e596a770b25` | `ea9eeedc94b000bb29b55d4495e6fd950ce724a91e0e565015619c597fe6a81f` | Mismatch |
| `.tmp/dev013-evidence/outage-recovery.json` | `a244bdc79900ff92ee3d82a6c4a23e3eed73bfc046c8c9911c9245c4f3a902df` | `29fdf79179f1157b9604abf726980167b3ebc459fbdea28a34b51e498906136d` | Mismatch |
| `.tmp/dev013-evidence/persistence.json` | `032db25eabb0f9c76c6afd6fdca66b27e88ac78b9c64cb686a6829418c5c2b6c` | `fa232441d10bda6f12dbb2d755baa309ca3e7a19ae80c81d86314115b400e596` | Mismatch |
| `.tmp/dev013-evidence/session-admin.log` | `38b93c9002511f23d2c493be1f70a5a489ce019bdd7703a4bf26f8fde22708fe` | `056a20c78aebaae75909b1eef55071227caed617d2089043bb24f98993b7f4a6` | Mismatch |

The expected values are read from the unchanged `.tmp/dev018-evidence/prior-evidence-hashes.json`. No hash in the manifest was edited.

### Canonical hash record

The authoritative exact values are in `.tmp/dev018-evidence/strict-prior-evidence-verification.json` and are reproduced here without abbreviation:

| Path | Expected SHA-256 | Current SHA-256 |
|---|---|---|
| `.tmp/dev013-evidence/http-security.json` | `5e3a7bc9cf2f6d2e5b2d758128754ea6b3477619a1a336cc9a243e596a770b25` | `ea9eeedc94b000bb29b55d4495e6fd950ce724a91e0e565015619c597fe6a81f` |
| `.tmp/dev013-evidence/outage-recovery.json` | `a244bdc79900ff92ee3d82a6c4a23e3eed73bfc046c8c9911c9245c4f3a902df` | `29fdf79179f1157b9604abf726980167b3ebc459fbdea28a34b51e498906136d` |
| `.tmp/dev013-evidence/persistence.json` | `032db25eabb0f9c76c6afd6fdca66b27e88ac78b9c64cb686a6829418c5c2b6c` | `fa232441d10bda6f12dbb2d755baa309ca3e7a19ae80c81d86314115b400e596` |
| `.tmp/dev013-evidence/session-admin.log` | `38b93c9002511f23d2c493be1f70a5a489ce019bdd7703a4bf26f8fde22708fe` | `056a20c78aebaae75909b1eef55071227caed617d2089043bb24f98993b7f4a6` |

## 4. Preservation inventory

The read-only inventory is `.tmp/dev018-evidence/strict-preservation-inventory.json`. It records the unchanged manifest hash, all four current file hashes and timestamps, the corrected guard/test source hashes, Git HEAD/branch/staged state, Platform state, and identical protected before/after snapshot hashes. The strict verification checked 4,462 prior entries and reports exactly these four mismatches.

## 5. Overwrite-prevention verification

`tests/sessions/evidence-target.mjs` now requires an explicit label and accepts only the matching direct evidence directory or a label-owned run-specific directory. Direct writes to the historical DEV-013 directory are rejected regardless of whether `session-admin.log` already exists. `SKYRA_ALLOW_HISTORICAL_OVERWRITE` is no longer honored for that target, so setting it cannot bypass the refusal. Updated session writers route new output to unique run-specific directories.

## 6. Prevention regression

`tests/sessions/evidence-routing.test.mjs` passed 1/1 in `.tmp/dev018-evidence/evidence-routing-strict-final.log`, including the explicit override case. The new preservation lockdown suite passed 5/5 in `.tmp/dev018-evidence/preservation-lockdown-tests-final-6.log`, covering path validation, unique output, non-replacement, synthetic hash match/mismatch, and historical-byte stability. No broad product suite or historical evidence-writing workflow was rerun for this status review.

## 7. Additional recovery sources inspected

The recorded source inventory is `.tmp/dev018-evidence/strict-recovery-sources.json`. Read-only checks covered the workspace, accessible attachments, local OneDrive sync root, Downloads, explicit local backup paths, workspace archives, Windows File History location, Volume Shadow Copy availability, and restore-point query availability. File History was absent; VSS and restore-point inspection were unavailable under current permissions/module support; no source was mounted or changed. Local OneDrive contained no Skyra evidence candidates, and connected version-history access was not available.

## 8. Authentic candidates

No candidate matched any expected SHA-256. Older-looking similarly named evidence files were not accepted. No regenerated output was treated as historical evidence.

## 9. Restoration actions

None. No affected file was replaced, no current mismatched file was deleted, and the baseline manifest was not changed.

## 10. Verification results

- Strict prior-evidence verification: 4,462 checked; exactly four mismatches remain.
- Evidence-routing regression: 1/1 passed.
- Existing DEV-018 technical evidence remains valid: 92 browser passes, 78 Python tests, Node 22/24 SDK/consumer evidence, 261 event IDs, and 106 audit records.
- Final source/artifact audit previously passed for Git preservation, whitespace, migrations, protected snapshots, and Platform archives.
- Protected before/after snapshot hashes remain identical.
- No protected PostgreSQL write, production activity, Entra setup, deployment, or Platform archive change occurred.

## 11. Remaining mismatches and P1-001 status

All four original DEV-013 files remain mismatched. P1-001 remains **OPEN — UNRECOVERABLE HISTORICAL EVIDENCE-PRESERVATION EXCEPTION**. Root-cause prevention is resolved; historical-byte recovery is unresolved; current application validation is passed; formal preservation acceptance is failed.

## 12. Final recommendation

Retain the official verdict exactly as:

**FAIL — DEV-018 preservation evidence unrecoverable.**

Only an authorized human may approve a documented exception. If such approval is later recorded, a separate report may use qualified technical acceptance language. The unconditional PASS wording must not be used unless all original preservation conditions are genuinely satisfied.
