# Runnable examples

The official minimal ESM application is [first-log.mjs](../../examples/managed-ingestion/first-log.mjs). Copy it into an application with both local packages installed. Use the [environment template](../../examples/managed-ingestion/.env.example) and [quick start](getting-started.md). It emits all six levels with structured attributes, a unique run ID, trace/span context, awaits flush/close and prints only a sanitized summary. Missing configuration and failures exit nonzero. Running again generates fresh identities.

The existing [pipeline sample](../../examples/managed-ingestion/sample.mjs) remains the internal deterministic regression helper. Its relative built-source import is not the installation instruction for external consumers. No new framework SDK is introduced.

Maintainer local packaging/consumer validation:

```powershell
$env:SKYRA_SDK_EVIDENCE_LABEL='dev014'
node scripts/package-node-sdk.mjs .tmp/dev014-evidence/packages
node scripts/verify-sdk-consumer.mjs
```

Consumer validation installs real tarballs in a fresh application directory, compiles `.mts` against public declarations and executes ESM. For an offline machine it repacks already installed third-party dependency artifacts; this does not imply those dependencies are bundled into the two SDK packages. Guarded real-service tests remain necessary for admission-to-Explorer acceptance.


For controlled normal/transient/throttled validation, the existing pipeline sample accepts optional retryOptions (HttpTransport options) and returns safe diagnostics. This is an acceptance helper, not a second installation API. The minimal externally installed first-log sample reports structured IngestionError code/status/attempt/outcome/batchId without raw response text. A service should stop its producers on SIGTERM/SIGINT, await bounded logger.close(), and report rejection; avoid immediate process.exit(). Never embed credentials into examples.
