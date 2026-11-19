# SKYRA LOGHUB — DEV-018 Preservation Tests

## Focused command

```text
node --test --test-reporter=tap tests/preservation/preservation-lockdown.test.mjs tests/sessions/evidence-routing.test.mjs
```

Final exit code: **0**. Final result: **5/5 passed, 0 failed, 0 skipped**. Evidence: `.tmp/dev018-evidence/preservation-lockdown-tests-final-6.log`.

## Cases covered

- Missing run identifier is rejected.
- Traversal/outside-workspace evidence path is rejected.
- Short/invalid run identifier is rejected.
- Unique run-specific directory creation succeeds.
- Duplicate output publication is rejected without replacement.
- Synthetic exact candidate hash is accepted by the verifier.
- Synthetic candidate hash mismatch is rejected.
- Existing DEV-013 target is rejected.
- Mismatched run label and evidence directory are rejected.
- `SKYRA_ALLOW_HISTORICAL_OVERWRITE=true` cannot bypass historical refusal.
- Four affected DEV-013 files have identical SHA-256 values before and after the synthetic tests.

## Recovery-candidate command

```text
node scripts/verify-evidence-recovery-candidate.mjs .tmp/dev013-evidence .tmp/dev018-evidence/prior-evidence-hashes.json --provenance=local-current-mismatched-files
```

The read-only result is `.tmp/dev018-evidence/strict-candidate-check-current.json`: all four candidates are `match:false`, `restorationRecommended:false`, and no file was changed.

## Publication behavior

`publishEvidenceFile` uses an exclusive temporary file, flushes before publication, refuses existing targets, and records an incomplete marker on failed publication. The live Admin log uses exclusive `wx` creation after path validation.

## Preservation hashes

Before/after synthetic-test hashes are recorded in `.tmp/dev018-evidence/strict-current-hashes-after-tests.json` and match the current values in the strict inventory. The original expected hashes remain only in the unchanged authoritative manifest. The final strict verification is `.tmp/dev018-evidence/strict-prior-evidence-verification-lockdown-final.json`.

## Known limitations

The tests do not claim physical power-loss durability, mounted VSS recovery, or restoration of historical bytes. VSS/File History were unavailable or absent in the current environment. No broad product suite was rerun.
