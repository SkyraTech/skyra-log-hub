# SKYRA LOGHUB — DEV-018 Preservation Lockdown Status

## 1. Executive summary

DEV-018 remains formally failed because four original DEV-013 evidence files are unrecoverable. This lockdown preserved the current mismatched bytes, did not edit the original hash manifest, added fail-closed evidence-output policy, added read-only recovery-candidate verification, and passed focused preservation tests.

## 2. Initial Git/source state

The original DEV-018 state remains Git HEAD `19f084ad36fe37bb57ca107103e136d2d4a378be`, branch `main`, with existing modified/untracked work preserved. No reset, clean, rebase, merge, commit, or push was performed. The sibling Platform repository remains clean at `928ca4343ab3a1887e586123a6ba5bb88b56a0ef`.

## 3. Historical manifest verification

The unchanged `.tmp/dev018-evidence/prior-evidence-hashes.json` was checked against 4,462 historical entries using `.tmp/dev018-evidence/strict-prior-evidence-verification-lockdown-final.json`. Exactly four known mismatches remain; no additional historical entry was identified.

## 4. Four mismatch details

The exact expected/current SHA-256 values, file sizes, timestamps, purpose, recovery status, and impact are in `SKYRA_LOGHUB_DEV_018_STRICT_PRESERVATION_STATUS.md`. No candidate matched an expected hash.

## 5. Evidence-writer inspection

The original risk was a live Admin log opened with truncating mode and session path branches that could default to DEV-013. The inspection also found fixed legacy evidence paths. The new policy requires explicit labels, `.tmp` containment, label ownership, `-evidence` directories, and rejects symlink/junction escapes.

## 6. Changes made

- Added `scripts/lib/evidence-output-policy.mjs` for label/path validation, unique run directories, non-replacing publication, incomplete markers, and candidate hashing.
- Updated `tests/sessions/evidence-target.mjs` to use the central policy.
- Changed `tests/sessions/identity-stack.mjs` to use exclusive `wx` log creation.
- Historical DEV-013 overwrite refusal ignores `SKYRA_ALLOW_HISTORICAL_OVERWRITE`.
- Added `scripts/verify-evidence-recovery-candidate.mjs`.
- Added synthetic preservation and evidence-routing tests.

No historical evidence, expected hash, Prisma migration, protected database, Platform archive, or old acceptance report was rewritten.

## 7. Safe-writer tests

`node --test --test-reporter=tap tests/preservation/preservation-lockdown.test.mjs tests/sessions/evidence-routing.test.mjs` exited 0 with **5/5 passed**. Cases include missing/mismatched labels, traversal, duplicate runs, existing output, concurrent-safe publication behavior, synthetic hash match/mismatch, override bypass, and current historical-byte stability.

## 8. Atomic publication results

Synthetic output was written to a unique run directory through an exclusive temporary file, flushed, and published without replacing an existing target. A duplicate publication was rejected. Windows hard-link limitations were handled by a non-replacing rename fallback. No physical power-loss durability is claimed.

## 9. New current-state manifests

- `SKYRA_LOGHUB_DEV_018_CURRENT_STATE_MANIFEST.json` is the original supplementary current-state snapshot.
- `SKYRA_LOGHUB_DEV_018_CURRENT_STATE_MANIFEST_LOCKDOWN.json` is the final lockdown snapshot and includes the policy, verifier, tests, strict reports, recovery result, and 37 Platform archives.
- `SKYRA_LOGHUB_DEV_018_CURRENT_STATE_MANIFEST_LOCKDOWN_FINAL.json` is the supplementary final-state snapshot captured during lockdown; the separately retained final focused-test log is `.tmp/dev018-evidence/preservation-lockdown-tests-final-6.log`.

Neither manifest replaces the original DEV-018 baseline.

## 10. Recovery-candidate verification

`scripts/verify-evidence-recovery-candidate.mjs` was run read-only against the current `.tmp/dev013-evidence` directory. `.tmp/dev018-evidence/strict-candidate-check-current.json` reports all four candidates as `match:false` and `restorationRecommended:false`. Synthetic fixtures verified exact match and mismatch behavior without restoration.

## 11. Historical artifact preservation

The four current mismatched files remained byte-identical through the focused tests. Their after-test hashes are recorded in `.tmp/dev018-evidence/strict-current-hashes-after-tests.json`. No historical files were deleted, replaced, or regenerated.

## 12. Platform integrity

All 37 immutable Platform archives remain present and were previously verified unchanged by the DEV-018 final audit. Platform Git status remains clean.

## 13. Protected database status

No protected PostgreSQL connection or write was used for this lockdown. The existing protected before/after catalog hashes remain identical at `90f73c6f2bc6bce568974e27472fd652505e3034284ff4a9883104b1fd02a6ff`.

## 14. Remaining limitations

The missing historical bytes cannot be reconstructed. Local File History was absent; VSS and restore-point inspection were unavailable under current permissions/module support; connected OneDrive version history was unavailable. The policy cannot establish physical power-loss durability or recover inaccessible backup data.

## 15. P1-001 status

P1-001 remains **OPEN — UNRECOVERABLE HISTORICAL EVIDENCE-PRESERVATION EXCEPTION**. Root-cause prevention is resolved. Historical-byte recovery is unresolved. Current application validation remains passed. Formal preservation acceptance remains failed.

## 16. DEV-018 official verdict

**FAIL — DEV-018 preservation evidence unrecoverable.** This focused lockdown PASS, if considered independently, does not change DEV-018’s official verdict and does not grant an acceptance waiver.
