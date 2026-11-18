# Node application quick start

Use a server-side Node.js 22+ application with ESM (`.mjs`). Local packages are supported; npm publication and a deployed Gateway are not assumed. Only the Node SDK is covered here.

1. Sign into the Console and select an authorized active project. Open **Developer getting started**.
2. Follow [credential setup](credentials-and-security.md). Request a credential permitting `development` for this sample. Record the project **code**, not an arbitrary tenant UUID.
3. In the LogHub checkout, build local artifacts:

```powershell
node scripts/package-node-sdk.mjs
```

4. In a separate application directory, initialize an ESM consumer and install both artifacts. Replace `CHECKOUT` with the absolute checkout path; quote paths containing spaces. Registry access for Ajv dependencies is needed unless already cached.

```powershell
npm init -y
npm install "CHECKOUT/.tmp/sdk-packages/skyra-logger-core-1.0.0.tgz" "CHECKOUT/.tmp/sdk-packages/skyra-logger-node-1.0.0.tgz"
```

5. Copy [first-log.mjs](../../examples/managed-ingestion/first-log.mjs) into your application. Configure process environment variables using your environment or secret manager:

```powershell
$env:SKYRA_PROJECT_ID = 'replace-with-authorized-project-code'
$env:SKYRA_INGESTION_ENDPOINT = 'https://replace-with-your-gateway.example/ingest/v1/logs'
```

Inject `SKYRA_INGESTION_CREDENTIAL` securely; do not put its value in command history. The [environment template](../../examples/managed-ingestion/.env.example) contains placeholders only. Node does not load `.env` automatically; an application may use `node --env-file=.env first-log.mjs` with a locally protected, untracked file. Never commit that file.

6. Run `node first-log.mjs`. A successful result contains a unique `runId`, six accepted events and local flush timing. The sample imports only `@skyra/logger-node`, logs structured data and awaits `flush()` and `close()`.
7. Open Log Explorer, select the same project, choose the last hour, search the reported run ID, and filter service `onboarding-sample`, environment `development`. Inspect event IDs, severity and trace context. A repeat invocation generates a new run ID and event IDs.

Durable admission means Gateway WAL fsync; it does not mean events are already searchable. Archive publication and Query indexing follow. Refresh after publication, retaining the same project and time range. See [troubleshooting](troubleshooting.md), [SDK reference](node-sdk.md), [ingestion reference](ingestion-api.md) and [examples](examples.md).

For local validation, use only the established marked disposable environment. This guide does not authorize protected database writes, migration, credentials or feature activation. The Gateway address is supplied by your operator, not inferred from the Console URL.
