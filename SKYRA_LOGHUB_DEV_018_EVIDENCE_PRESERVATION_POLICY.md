# SKYRA LOGHUB — DEV-018 Evidence Preservation Policy

## Purpose and status

This policy protects existing DEV-013/DEV-018 artifacts without changing the original DEV-018 acceptance criteria or baseline hashes. It is a supplementary lockdown policy; the original `.tmp/dev018-evidence/prior-evidence-hashes.json` remains authoritative.

## Evidence classifications

- **Historical immutable:** evidence recorded before or during earlier milestones. Existing files are read-only inputs and are never replaced by a test run.
- **Current technical evidence:** fresh DEV-018 run output. It must use a dedicated run label and must not be presented as historical DEV-013 bytes.
- **Preservation infrastructure evidence:** policy tests, inventories, manifests, and candidate-verification results from DEV-018-P1-001.
- **Immutable Platform package:** the 37 tracked Skyra Platform archives verified by the final audit.

## Run-specific directories and labels

`assertAuthorizedEvidenceDirectory` requires a non-empty approved label, an evidence path inside the workspace `.tmp` tree, a `-evidence` suffix, and a label-matching directory or label-specific session-run parent. Missing labels, ambiguous labels, absolute paths outside `.tmp`, traversal, and symlink/junction ancestors are rejected. `createUniqueEvidenceDirectory` creates a fresh `<label>-session-runs/<runId>-evidence` directory and rejects duplicate run IDs.

## Safe output writing

`publishEvidenceFile` writes to a uniquely named temporary file using exclusive creation, flushes and closes it, then publishes without replacing an existing target. Windows link limitations fall back to non-replacing rename only after a second existence check. Existing targets are rejected. Failed publication attempts remove the temporary file when possible and create an `.incomplete` marker. File names cannot contain path separators or begin with `.`.

The live Admin process log remains an exclusive-create stream because the process must write while running; `identity-stack.mjs` now opens it with `wx` after directory validation. A repeated run therefore fails safely instead of truncating prior output. Live-stream output is not claimed to have physical power-loss durability.

## Historical immutability

The DEV-013 target refuses overwrite whenever `session-admin.log` already exists. `SKYRA_ALLOW_HISTORICAL_OVERWRITE` is ignored for that target and cannot bypass the refusal. The original manifest is never an output target and is never edited.

## Hash manifests and verification

The current-state manifests record relative path, SHA-256, size, evidence category, milestone, run identifier, verification status, and historical-authenticity status. The four mismatched DEV-013 files are explicitly marked `not-established`. `verify-evidence-recovery-candidate.mjs` only reads candidates, compares exact hashes, records provenance, and never restores or modifies files.

## Failure behavior

Missing labels, duplicate run IDs, path escapes, symlink escapes, existing output files, candidate mismatches, and historical targets fail closed. A failed atomic publication is not reported as completed evidence. Synthetic fixtures are permitted only for testing verifier behavior and are never evidence of historical recovery.

## Current limitations

The policy cannot recover missing bytes. Windows VSS/File History availability depends on permissions and configuration. Ordinary filesystem flushing is not a physical power-loss guarantee. Existing legacy runners that do not provide a matching run label fail closed rather than silently writing historical paths.
