# Security, Auditing & Observability Standards

**Document Version:** 1.0.0  
**Status:** Approved Enterprise Architecture Baseline  
**Task Reference:** LOGHUB-ARCH-001  
**Scope:** Security Controls, Tenant Isolation, File System Containment, DuckDB Sandboxing, and Audit Logging

---

## 1. Authentication vs Authorization Separation

Skyra LogHub maintains a strict architectural boundary between verifying caller identity (Authentication) and enforcing access boundaries (Authorization).

### 1.1 Machine Ingestion vs User Query Credentials
- **Ingestion Tokens:** Machine-to-machine, high-entropy bearer tokens (`LOGHUB_INGEST_TOKEN`) hashed with SHA-256 in PostgreSQL. Ingestion tokens **cannot** be used to query or search logs.
- **Query Principals:** User and service account tokens verifying identity via signed JWTs or pluggable authenticators. Query tokens **cannot** be used to write or ingest logs.

### 1.2 Fail-Closed Tenant & Project Scoping
- Scope resolution is server-authoritative:
  $$\text{Effective Projects} = \begin{cases}
  \text{Requested Projects} \cap \text{Authorized Projects}, & \text{if Requested Projects provided} \\
  \text{Authorized Projects}, & \text{if Requested Projects omitted}
  \end{cases}$$
- If a client requests any project outside their authorized grant, the request immediately terminates with `403 Forbidden` (`FORBIDDEN_PROJECT_ACCESS`).
- The `tenant_id` is derived exclusively from the authenticated principal. Request-supplied `tenant_id` parameters are ignored.

---

## 2. Archive Filesystem Containment & Symlink Defenses

To defend against Local File Inclusion (LFI) and path traversal attacks (`../../`):
1. **Metadata-Driven File Discovery:** The query engine never accepts file paths or glob patterns from HTTP requests. All scanned segments are discovered via parameterized PostgreSQL queries against `archive_segments`.
2. **Strict Regex Validation:** Every path element (`tenant_id`, `project_id`, `environment`, `date`, `segment_filename`) is verified against `/^[a-zA-Z0-9_\-\.]+$/`.
3. **Root Containment:** The server resolves the absolute path:
   ```typescript
   const resolvedPath = path.resolve(ARCHIVE_ROOT, tenantId, projectId, environment, date, filename);
   if (!resolvedPath.startsWith(path.resolve(ARCHIVE_ROOT) + path.sep)) {
     throw new SecurityException('Path traversal detected in archive catalog reference');
   }
   ```
4. **Symlink / Junction Verification:** Before registering a file with DuckDB, the server inspects `fs.lstatSync` and `fs.realpathSync` to confirm that symbolic links or junctions do not point outside `ARCHIVE_ROOT`.

---

## 3. Safe DuckDB SQL Construction & Sandboxing

### 3.1 Resolving Feasibility Spike Limitations
In the initial `LOGHUB-QUERY-001` spike, file lists were assembled using rudimentary string concatenation. Under enterprise standards, this is hardened into a **two-tier safe parameterization architecture**:

1. **SQL File Literal Formatter:**
   Because DuckDB's `read_json_auto()` requires constant path literals at bind time, server-verified archive paths are formatted using strict sanitization:
   ```typescript
   export function formatSafeDuckDbFileList(paths: string[]): string {
     if (paths.length === 0) throw new InvalidArgumentException('No archive paths provided for query execution');
     for (const p of paths) {
       // Enforce strict allowlist of path characters
       if (!/^[a-zA-Z0-9_\-\.\/:]+$/.test(p)) {
         throw new SecurityException(`Invalid characters detected in archive path: ${p}`);
       }
     }
     // Escape single quotes for SQL string literals
     return '[' + paths.map(p => "'" + p.replace(/'/g, "''") + "'").join(', ') + ']';
   }
   ```
2. **Strict Parameter Binding for Predicates:**
   All client search terms, filters, timestamps, and levels are passed strictly as positional parameters (`?` in `@duckdb/node-api`):
   ```sql
   SELECT ... FROM read_json_auto(/* safe server file list */)
   WHERE "skyra"."tenant_id" = ?
     AND "@timestamp" >= ?
     AND "@timestamp" < ?
     AND "log"."level" = ?
   ```
   **Zero user-supplied strings are ever interpolated into DuckDB SQL.**

### 3.2 DuckDB Runtime Sandbox Settings
Upon creating an in-memory DuckDB connection, the following sandbox commands are executed:
```sql
SET enable_external_access = false;
SET autoinstall_known_extensions = false;
SET autoload_known_extensions = false;
SET max_memory = '256MB';
SET threads = 2;
```
Disabling external access prevents DuckDB from executing HTTP requests, downloading extensions, or reading arbitrary system files.

---

## 4. Auditing & Operational Observability

### 4.1 Security Audit Trail vs Application Logs
- **Operational Logs:** Emitted via `@skyra/logger-core` / `@skyra/logger-nestjs` capturing system health, latencies, and debug traces.
- **Security Audit Logs:** Immutable records written to PostgreSQL `query_audit_logs` capturing:
  - Timestamp, `principal_id`, `tenant_id`, requested projects.
  - Query filter hash, matched event count, scanned byte volume, duration.
  - Client IP address and User-Agent.

### 4.2 Preventing Recursive Logging Loops
Skyra LogHub components must **never** ingest their own operational error logs into the LogHub gateway.
- Gateway and Query Service errors are written to local stdout/stderr or dedicated systemd/Docker logs.
- If the gateway fails while logging to itself, a cascading recursive failure loop could crash the process.
