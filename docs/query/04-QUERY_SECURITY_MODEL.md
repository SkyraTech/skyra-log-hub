# Query Security & Tenant Isolation Model

**Document Version:** 1.0.0  
**Status:** Approved Architecture Specification  
**Task Reference:** LOGHUB-QUERY-001  
**Applies To:** Query Service Foundation (`apps/query-service`)

---

## 1. Core Security Invariant

**Query authentication is strictly separated from machine ingestion credentials.**

Under no circumstances may an ingestion machine bearer token (`LOGHUB_INGEST_TOKEN`) be accepted as an authorization token for user or dashboard query endpoints. Conversely, user query tokens cannot write to ingestion endpoints.

---

## 2. Query Identity & Token Model

### 2.1 Pluggable Query Identity Contract

The Query Service verifies requests against an authenticated query identity principal:

```typescript
export interface QueryPrincipal {
  principal_id: string;          // User ID, service account UUID, or IAM subject
  principal_type: 'user' | 'service_account' | 'api_key';
  tenant_id: string;             // Home tenant boundary (single tenant isolation)
  authorized_projects: string[]; // List of project IDs the principal is allowed to query (or ['*'] for all)
  allowed_environments: string[];// e.g. ['development', 'staging', 'production']
  roles: ('viewer' | 'analyst' | 'admin')[];
  expires_at: number;            // Unix epoch seconds
}
```

### 2.2 Token Format & Verification
- **Production Standard:** Cryptographically signed JSON Web Tokens (JWT) using asymmetric algorithms (RS256 or EdDSA) issued by Skyra IAM / OAuth2 IdP.
- **Contract / Development Boundary:** A deterministic mock authenticator (`DevQueryAuthGuard`) allowing test fixtures to supply signed test tokens or explicit test principal headers, strictly isolated from production deployments.

---

## 3. Server-Enforced Tenant & Project Authorization

### 3.1 Scope Determination

The client **cannot** elevate access by passing `tenant_id` or `projects` in the request body. Scope resolution operates as a strict mathematical intersection:

$$\text{Effective Projects} = \begin{cases}
\text{Requested Projects} \cap \text{Principal Allowed Projects}, & \text{if Requested Projects provided} \\
\text{Principal Allowed Projects}, & \text{if Requested Projects omitted}
\end{cases}$$

- If $\text{Effective Projects} = \emptyset$, the query returns `403 Forbidden` immediately before inspecting any metadata or filesystem paths.
- If the client requests any project outside their `authorized_projects`, the request fails with `403 Forbidden` (`FORBIDDEN_PROJECT_ACCESS`).
- The `tenant_id` is unconditionally derived from `principal.tenant_id`. No parameter in the HTTP payload can override the caller's tenant.

---

## 4. Archive Discovery & Filesystem Containment

### 4.1 Trusted Metadata-Driven Path Construction

To prevent Local File Inclusion (LFI) and path traversal attacks (`../../etc/passwd`):
1. **No Client-Supplied Paths:** The query engine never accepts file paths, directory names, or glob patterns from HTTP requests.
2. **PostgreSQL Catalog Resolution:** The Query Planner queries the trusted PostgreSQL `archive_segments` table using strictly parameterized SQL:
   ```sql
   SELECT segment_filename, partition_date, tenant_id, project_id, environment
   FROM archive_segments
   WHERE tenant_id = $1
     AND project_id = ANY($2::VARCHAR[])
     AND environment = ANY($3::VARCHAR[])
     AND partition_date >= $4 AND partition_date <= $5
     AND state = 'CLOSED';
   ```
3. **Absolute Server-Controlled Paths:** The application constructs file paths by resolving the catalog's verified relative path against the configured server archive root:
   ```typescript
   const resolvedPath = path.resolve(ARCHIVE_ROOT, segment.tenant_id, segment.project_id, segment.environment, segment.partition_date, segment.segment_filename);
   if (!resolvedPath.startsWith(path.resolve(ARCHIVE_ROOT) + path.sep)) {
     throw new SecurityException('Path traversal detected in archive catalog reference');
   }
   ```
4. **Symlink Defense:** Before registering a file path with DuckDB, the service checks that the path is a regular file (`stats.isFile()`) and resolves symbolic links (`fs.realpathSync`) to confirm the target remains inside `ARCHIVE_ROOT`.

---

## 5. SQL Injection & DuckDB Engine Hardening

### 5.1 Defense Against SQL Injection
- **Zero Dynamic String Concatenation:** SQL queries passed to DuckDB are static templates with parameterized placeholders (`$1`, `$2`, etc.).
- **Parameterized File Lists:** The list of candidate archive files is passed directly into DuckDB's `read_json_auto($1::VARCHAR[])` as a typed array parameter.
- **Strict Filter AST Translation:** Structured filters from the client (`{ field: "service.name", operator: "eq", value: "auth" }`) are parsed into an Abstract Syntax Tree (AST). Only allowlisted canonical field paths and validated comparison operators are mapped to predefined DuckDB SQL expressions. Client strings are bound strictly as parameters.

### 5.2 DuckDB Runtime Sandbox Settings & Least-Privilege Isolation (LOGHUB-QUERY-003)

Empirical runtime verification during task LOGHUB-QUERY-003 confirmed that setting DuckDB's global `enable_external_access = false` completely blocks all file system access, including local JSONL file scans via `read_ndjson_objects` / `read_json_auto`, raising:
`Permission Error: Cannot access file "..." - file system operations are disabled by configuration`.

Because embedded DuckDB requires local filesystem access to scan authorized server archive segments, the Query Service enforces a verified **least-privilege runtime security profile**:

1. **Extension Installation & Loading Blocked:**
   - `autoinstall_known_extensions: 'false'`
   - `autoload_known_extensions: 'false'`
   DuckDB is strictly prohibited from dynamically downloading or auto-loading unverified community or remote extensions from the internet or local directories.
2. **Resource Constraints:**
   - `max_memory: '256MB'` (configurable via `DUCKDB_MAX_MEMORY_MB`)
   - `threads: '2'` (configurable via `DUCKDB_THREADS`)
3. **Application-Level Containment Gate (P0):**
   - File paths are NEVER supplied by clients.
   - All file paths originate exclusively from PostgreSQL catalog metadata (`archive_segments`).
   - Prior to execution, `PathSafetyService` verifies canonical archive root containment, validates regex character allowlists, and enforces `fs.realpathSync` to eliminate symlink and junction redirection attacks.
   - `ManifestVerifierService` computes SHA-256 digests and byte counts against authoritative manifests to guarantee files have not been tampered with or corrupted on disk.
4. **Row-Level Double Defense-in-Depth:**
   - Generated SQL injects parameterized row-level WHERE clauses: `json_extract_string(json, '$.skyra.tenant_id') = $P_tenant` and `json_extract_string(json, '$.skyra.project_id') IN ($P_projects)`.
   - Even in the event of an internal metadata anomaly, DuckDB row filtering eliminates cross-tenant or cross-project data leakage.
5. **Architectural Isolation Boundary:**
   - Application-level path validation and parameter binding provide strict logical and filesystem containment. For multi-tenant hosting environments requiring full kernel-level blast-radius isolation, the Query Service can be deployed within read-only container volumes or OS-level sandboxes (e.g., Linux namespaces / seccomp).

---

## 6. Query Auditing & Sensitive Log Handling

1. **Query Audit Log:** Every executed search, aggregate, or facet query writes an immutable audit record to PostgreSQL (`query_audit_logs`):
   - Timestamp, `principal_id`, `tenant_id`, requested projects, time range.
   - Matched event count, execution duration, scanned bytes.
   - Hash of query criteria (excluding sensitive parameter values where appropriate).
2. **Field-Level Redaction:** Where canonical log events contain sensitive information (PII, authorization headers, passwords), SDKs in Phase 1 already applied canonical redaction. In Phase 3, the Query Service respects field masking configurations based on principal role (e.g. masking user emails for `viewer` roles while exposing them to `analyst` or `admin`).

---

## 7. Pre-Read Tenant Isolation Boundary (LOGHUB-QUERY-004 P0-A)

SQL row-level filtering alone is insufficient to protect local filesystem access. In `DuckDbLogQueryAdapter`, an application-level security gate validates all `TrustedArchiveSegmentDescriptor` objects **before** any path is registered or DuckDB prepares any query plan:

1. **Tenant Ownership Verification:** `descriptor.tenantId === plan.tenantId` is strictly asserted. Any foreign tenant descriptor immediately throws `CrossTenantViolationException` (HTTP 403).
2. **Authorized Project Scoping:** `plan.authorizedProjects.includes(descriptor.projectId)` is strictly asserted. Any descriptor outside authorized project scope throws `ForbiddenProjectException` (HTTP 403).
3. **Integrity Status Verification:** `descriptor.integrityStatus === 'VERIFIED'` is required. Corrupt or unverified segments are rejected before execution.
4. **Physical Identity & Existence:** `path.isAbsolute(descriptor.resolvedPath)` and `fs.existsSync(descriptor.resolvedPath)` ensure the file exists at its verified physical location.
5. **Byte Size Invariant:** `fs.statSync(descriptor.resolvedPath).size === descriptor.byteSize` ensures the file has not been replaced or appended to post-finalization.

Unauthorized archive files are **never opened** by DuckDB, providing complete isolation before read.

---

## 8. Cryptographic Signed Cursor Security (LOGHUB-QUERY-004)

Pagination state is protected using HMAC-SHA256 authenticated opaque base64url cursors:
- **Canonical Query Fingerprinting:** The SHA-256 digest of canonicalized search parameters is embedded within the cursor payload. Any attempt to modify time ranges, projects, environments, log levels, search strings, or structured filters invalidates the cursor.
- **Scope & Tenant Binding:** The authenticated `tenant_id` and authorized `projects` are permanently bound to the cursor. Cross-tenant or cross-project replay is rejected.
- **Constant-Time Verification:** Signature comparison uses `crypto.timingSafeEqual` to eliminate timing side-channel attacks.
- **Fail-Closed Secrets:** In production, missing or default signing secrets (`REPLACE_ME_...`) cause immediate application startup failure.
