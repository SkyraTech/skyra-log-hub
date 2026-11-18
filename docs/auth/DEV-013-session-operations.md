# DEV-013 durable session operations

The normal BFF defaults to PostgreSQL and requires `SESSION_STORE_BACKEND=postgres`, an explicit `BFF_SESSION_DATABASE_URL` for the dedicated `skyra_bff_sessions_runtime` role, and a separately generated 32-byte hexadecimal `BFF_SESSION_DATA_KEY`. Never use ingestion/admin/owner credentials. Keep the encryption key stable across restarts and all BFF instances. Missing configuration fails startup; there is no memory fallback. Durable mode also requires authoritative membership and verified OIDC outside explicitly isolated tests.

Provider configuration and real Microsoft setup remain separate pending activation decisions. This milestone does not authorize protected database activation. Existing issuer/client/callback trust, cookie/Secure/SameSite, internal assertions and CSRF configuration still apply. Session payloads bind their issuer/client configuration; login transactions also bind the registered callback. Changing those values deliberately invalidates incompatible authentication state.

For the verified disposable database only:

1. Start the manifest-owned cluster with `node scripts/isolated-postgres.mjs start`.
2. Run `node scripts/prepare-session-tests.mjs`. It validates the physical target and previous migration checksums, applies only the unique additive session migration, and provisions the narrow test role. It writes private ignored configuration without printing it. Do not paste that file or database URLs into reports.
3. Test launchers obtain verified session configuration through `scripts/lib/session-test-runtime.mjs`. Normal BFF processes receive the dedicated URL/key; unrelated owner datasource environment variables are removed by the acceptance harness.
4. Compile both BFF app and test configurations. Run `node scripts/run-session-security.mjs`; it intentionally runs database-restart tests sequentially. Run `SKYRA_SESSION_E2E=true node scripts/run-integrated-acceptance.mjs` using PowerShell environment syntax on Windows. The browser harness uses real business APIs and blocks public font-CDN requests so local verification does not depend on the internet.
5. Stop only the owned cluster after verification with `node scripts/isolated-postgres.mjs stop`. Keep owned evidence for review.

`GET /bff/auth/readiness` reports connectivity, runtime-role safety and expected session columns. It exposes no identifiers, verifiers, claims or configuration secrets. It is not a test of an external identity provider or encryption-key rotation readiness.

The existing session-service lifecycle runs cleanup every 60 seconds. Each pass removes at most 100 eligible session rows and 100 consumed/expired login rows, using database row locks and `SKIP LOCKED`. The store's explicit cleanup interface accepts bounded batches of 1–500 rows per table. It needs only the BFF role. Active records are never cleanup candidates. Authentication rejects expired/revoked records immediately, regardless of cleanup success. Interrupted cleanup may finish only one table; the next pass is safe and idempotent.

Logout returns success only after server revocation. Temporary store failure returns 503 and does not clear an otherwise valid session cookie. Angular offers retry and does not claim a failed logout completed. Explicit authoritative identity/membership denial revokes observed invalid sessions; current resource permissions are always resolved by Admin.

Rotation atomically revokes the old verifier and creates a new verifier/CSRF context while retaining the original absolute expiry. If the process dies after commit but before cookie delivery, the old token stays invalid and the user must sign in again. A consumed OIDC callback cannot be replayed after a lost token exchange or response; restart login. Losing/changing the data key makes existing encrypted records unavailable and requires operational recovery or fresh authentication. No automatic encryption-key rotation, physical power-loss, multi-region or production-capacity guarantee is claimed.

The `memory-test` backend requires explicit isolated-test configuration. The test factory exists for synthetic unit fixtures only and is forbidden in production. Authoritative browser and HTTP acceptance use PostgreSQL throughout.
