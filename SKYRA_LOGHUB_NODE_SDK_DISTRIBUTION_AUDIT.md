# Skyra LogHub Node SDK Distribution Audit

Date: 2026-10-23. Repository: `skyra-log-hub`.

## Verdict: READY

**READY for controlled local-artifact installation into a separate Node 24 ESM project using the verified pnpm workflow below.** Both packed packages were installed outside the monorepo and exercised through their actual compiled exports. This is distribution readiness, not certification of central ingestion, deployment, all SDKs, or every production failure mode. No E2E integration was performed.

## Working tree and preservation

Initial `git status --short` was empty. No existing tracked changes were present to overwrite. Final status before this report was also empty; `git diff --check` and `git diff --cached --stat` were empty, exit 0. Source, manifests and tracked lockfiles were not edited. Builds and evidence are in ignored `dist`/`.tmp` directories. This requested report is the only new tracked-visible file. No staging, commit, push, publish or deployment occurred. The E2E repository was not modified.

pnpm's first command automatically verified/restored workspace dependencies, including unrelated workspace dependencies and its already permitted NestJS postinstall. This changed local ignored dependency state, not tracked source or lockfiles. The first restricted invocation hit registry DNS failures and remained in retry; that specific audit process was stopped after a successful approved retry. No SDK defect was inferred from that environment failure.

## Environment and actual manifests

- Windows; Node `v24.21.0`; pnpm `12.3.4`; TypeScript `7.0.2`; Node types `26.6.5`.
- LogHub declares Node >=20, pnpm >=9 and packageManager pnpm12.3.4. This verification uses Node24, not all supported Node versions.
- Both SDK manifests declare version `1.0.0`, ESM (`type: module`), root `dist/index.js`, declarations `dist/index.d.ts`, and packaged `dist` contents.
- Core dependencies: `ajv:^8.20.0`, `ajv-formats:^3.0.1`; isolated installation resolved 8.20.0 and 3.0.1 respectively.
- Node source dependency: `@skyra/logger-core:workspace:*`. Packed manifest dependency: **`@skyra/logger-core:1.0.0`**. No workspace protocol remains in either packed manifest.
- Core root and subpath exports: `.`, `/types`, `/validator`, `/parser`, `/redaction`, `/schema`.
- Node root and subpath exports: `.`, `/transports`, `/config`.
- Every declared import and declaration entry was confirmed present in the archive; all nine runtime module entrypoints loaded in the isolated consumer. Consumer TypeScript checked root APIs and their referenced declarations without skipLibCheck.

## Commands, exit codes and results

Commands below ran from LogHub unless an alternate directory is specified. PowerShell wrappers preserved failures with `$LASTEXITCODE`.

| Command/check | Exit | Result |
| --- | --- | --- |
| `node --version`; `pnpm --version` | 0 | 24.21.0 / 12.3.4 |
| Initial restricted build | interrupted | Registry DNS failures during pnpm's automatic dependency verification; stopped audit-owned retry |
| `pnpm --filter @skyra/logger-core build` | 0 | Core compiled first |
| `pnpm --filter @skyra/logger-node build` | 0 | Node compiled second |
| `pnpm --filter @skyra/logger-core exec tsc --noEmit` | 0 | Core typecheck |
| `pnpm --filter @skyra/logger-node exec tsc --noEmit` | 0 | Node typecheck |
| `pnpm check:schema-sync` | 0 | TypeScript/Python schema copies match canonical v1 |
| First `pnpm test:contracts` | 1 | 13 passed; cross-SDK test could not import missing browser dist |
| `pnpm --filter @skyra/logger-browser build` | 0 | Built existing contract-test prerequisite, no source edits |
| Repeated `pnpm test:contracts` | 0 | 17/17 passed, no skips |
| `pnpm test:node` | 0 | 46/46 passed, no skips |
| Core and Node `pnpm pack` commands below | 0 | Both archives generated |
| Archive manifest/export inspection | 0 | Import/types entries present; workspace protocol removed |
| First isolated install using package.json `pnpm.overrides` | 1 | pnpm12 ignores that legacy configuration location; transitive core lookup hit registry404 |
| Corrected isolated install with pnpm-workspace.yaml overrides | 0 | Both SDKs and dependencies installed from verified local artifacts |
| Isolated `pnpm add -D typescript@7.0.2 @types/node@26.6.5 --ignore-scripts` | 0 | Independent declaration-check tools installed |
| Isolated `pnpm exec tsc --noEmit --strict --module NodeNext --moduleResolution NodeNext --target ES2022 consumer.ts` | 0 | Packed declarations usable |
| Isolated `node verify.mjs` | 0 | Actual artifact logging and lifecycle checks passed |
| `git diff --check`; `git diff --cached --stat` | 0 | No tracked whitespace changes or staging |

Relevant package/canonical tests total **63 passing tests** after satisfying the browser fixture prerequisite. The first failed commands are retained here rather than hidden.

## Artifacts

Directory:

```text
C:\Users\hp\OneDrive\Documents\My Docs\Personal Projects\Skyra-Tech\skyra-tech-Jarvis\apps\skyra-log-hub\.tmp\node-distribution-20261023\artifacts
```

| Filename | Bytes | SHA-256 |
| --- | ---: | --- |
| `skyra-logger-core-1.0.0.tgz` | 19997 | `c55044cd4b3eda76cb35a9159505d89df3532176c21fc5c4fb2fba50b9d9cb56` |
| `skyra-logger-node-1.0.0.tgz` | 40866 | `010d1a48398a21420dd6a89babb461f876b6943e165658ae22a5d4699c61cac3` |

Exact pack commands:

```powershell
pnpm --dir packages/logger-core pack --pack-destination ../../.tmp/node-distribution-20261023/artifacts
pnpm --dir packages/logger-node pack --pack-destination ../../.tmp/node-distribution-20261023/artifacts
```

Archive inspection used `tar -tzf <archive>` and `tar -xOf <archive> package/package.json`. Compiled JS, declarations and referenced internal modules are included; maps are included. Core/node archives contain 25/66 entries respectively as recorded in the local manifest inventories. Source files were not copied into the consumer or E2E. These artifacts are in an ignored temporary location: retain them in an approved versioned artifact location before relying on them for a durable release.

## Verified isolated installation recipe

Actual temporary consumer:

```text
C:\Users\hp\AppData\Local\Temp\skyra-node-sdk-gcdjXh
```

It is outside the repository/workspace, with its own manifest, configuration, lockfile and node_modules. Realpath verification resolved core to this consumer's pnpm installation, not a LogHub workspace symlink. Both SDKs are tarball dependencies. Transitive core uses the same local artifact via an override.

Reproduction in a NEW consumer (commands shown for later E2E adaptation; not executed in E2E):

```powershell
$sdkArtifacts = 'C:/Users/hp/OneDrive/Documents/My Docs/Personal Projects/Skyra-Tech/skyra-tech-Jarvis/apps/skyra-log-hub/.tmp/node-distribution-20261023/artifacts'
```

Set this consumer manifest (absolute forward-slash paths; JSON shown with the verified location):

```json
{
  "name": "skyra-node-sdk-isolated-check",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@12.3.4",
  "dependencies": {
    "@skyra/logger-core": "file:C:/Users/hp/OneDrive/Documents/My Docs/Personal Projects/Skyra-Tech/skyra-tech-Jarvis/apps/skyra-log-hub/.tmp/node-distribution-20261023/artifacts/skyra-logger-core-1.0.0.tgz",
    "@skyra/logger-node": "file:C:/Users/hp/OneDrive/Documents/My Docs/Personal Projects/Skyra-Tech/skyra-tech-Jarvis/apps/skyra-log-hub/.tmp/node-distribution-20261023/artifacts/skyra-logger-node-1.0.0.tgz"
  }
}
```

Create/merge `pnpm-workspace.yaml` at the consumer root:

```yaml
overrides:
  '@skyra/logger-core': 'file:C:/Users/hp/OneDrive/Documents/My Docs/Personal Projects/Skyra-Tech/skyra-tech-Jarvis/apps/skyra-log-hub/.tmp/node-distribution-20261023/artifacts/skyra-logger-core-1.0.0.tgz'
```

Then run from that consumer:

```powershell
pnpm install --ignore-scripts
pnpm add -D typescript@7.0.2 @types/node@26.6.5 --ignore-scripts
node verify.mjs
pnpm exec tsc --noEmit --strict --module NodeNext --moduleResolution NodeNext --target ES2022 consumer.ts
```

`verify.mjs` and `consumer.ts` are the retained audit harness files in the temporary consumer, not SDK exports. Installing both tarballs without resolving the Node package's versioned core dependency is insufficient for this unpublished release in the tested pnpm workflow. Do not use `workspace:*` from a separate repository or depend on undeclared monorepo links. Do not overwrite an existing project's manifest/workspace configuration: merge deliberately during the separately authorized integration. E2E currently declares pnpm11.25.0; that exact package-manager version was not tested here. The verified recipe uses12.3.4; adopting or adapting it requires a separate E2E integration check, not an automatic manager upgrade.

## Actual artifact behavior

Harness imported `createSkyraLogger` from installed `@skyra/logger-node` and validator/parser from installed `@skyra/logger-core`. Configuration:

```js
const logger = createSkyraLogger({
  projectId: 'skyra-e2e-suite',
  serviceName: 'e2e-sdk-audit',
  environment: 'test',
  instanceId: 'audit-' + randomUUID(),
  transport: { type: 'file', directory: resolve('logs') },
  validationMode: 'strict',
  additionalSensitiveKeys: ['customCredential'],
  onError: error => errors.push(error.message),
  onDrop: (count, reason) => drops.push({ count, reason })
});
```

The local output root was inside the unique temporary consumer; no production/client data was used.

Verified assertions:

- Wrote two newline-terminated records, parsed with `parseJsonl`, zero parsing errors, each independently passed `validateLogEvent`.
- Mandatory timestamp, ECS8.11.0, UUIDv4 event ID, log level, message, service and Skyra identity/schema passed canonical validation.
- Custom `case_id`, `test_status`, `target_project_id` mapped into `skyra.business`, not unsupported root fields.
- Action/outcome and labels retained; `durationMs:1250` produced `event.duration:1250000000` and `skyra.duration_ms:1250`.
- Password, token, cookie, authorization/bearer, nested password and configured custom credential markers were absent from serialized output; sensitive password field was `[REDACTED]`.
- Error event used a synthetic safe Error and canonical error representation.
- After `flush`: two submitted/accepted/written events, zero dropped, zero pending count/bytes, zero transport errors; 1477 bytes written and reported fsync count2.
- `close` reported closed; repeated close completed; a deliberate post-close log was rejected, drop count became1, written count stayed2. The expected safe WriteAfterClose diagnostic appeared on stderr.
- A second logger with a one-byte queue limit deliberately rejected one info event; dropped count1 and onDrop callback reported the queue memory limit. This tests observable bounded-queue behavior without needing load assumptions.

Evidence: temporary consumer `verification-result.json`, `verify.mjs`, `consumer.ts`, lockfile and JSONL logs. Repo evidence under `.tmp/node-distribution-20261023` includes archive inventories/manifests, consumer path, harness generators, Node test output, first and corrected contract output.

## Limitations and integration conditions

- READY applies to these exact artifact hashes on Node24.21/Windows/pnpm12.3.4. Other Node versions, OSes and E2E's pnpm11 were not exercised.
- This did not run the E2E suite with logging installed, change its reports/exit codes, or prove performance compatibility. That remains the next separate integration task.
- Redaction passed the specified synthetic cases. Arbitrary secrets embedded in free-text messages, screenshots, traces or DOM cannot be assumed safe. Use allowlisted metadata, exclude credentials/payloads and sanitize errors before logging.
- No production authentication, collector, remote shipping, LogHub dashboard ingestion or server deployment was tested. File flush/fsync is not central delivery confirmation.
- Queue saturation is observable and may lose events by design. File rotation, ownership, recovery and error paths have package test coverage, but this audit did not simulate every disk crash/permission failure or long-duration workload.
- Schema validation is explicitly strict in the harness; the SDK's default is off. Install-time package resolution and release provenance remain important even when strict event validation passes.
- No publishing occurred; the packed manifest's1.0.0 core dependency requires a resolvable local override or future authenticated registry release.

**Stop point: verification complete. No E2E source/config/dependency changes, publishing, deployment, staging, commits or pushes.**
