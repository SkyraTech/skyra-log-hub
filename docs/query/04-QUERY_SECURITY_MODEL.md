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

### 5.2 DuckDB Runtime Sandbox Settings
Upon creating an in-memory DuckDB connection, the Query Service applies strict security settings:
```sql
-- Disable arbitrary external file loading and extension installation
SET enable_external_access = false;
SET autoinstall_known_extensions = false;
SET autoload_known_extensions = false;

-- Constrain memory and execution threads
SET max_memory = '256MB';
SET threads = 2;
```
Setting `enable_external_access = false` disables network I/O, HTTP/S3 remote file access, and extension downloads within DuckDB, restricting the engine exclusively to local files explicitly provided by the server.

---

## 6. Query Auditing & Sensitive Log Handling

1. **Query Audit Log:** Every executed search, aggregate, or facet query writes an immutable audit record to PostgreSQL (`query_audit_logs`):
   - Timestamp, `principal_id`, `tenant_id`, requested projects, time range.
   - Matched event count, execution duration, scanned bytes.
   - Hash of query criteria (excluding sensitive parameter values where appropriate).
2. **Field-Level Redaction:** Where canonical log events contain sensitive information (PII, authorization headers, passwords), SDKs in Phase 1 already applied canonical redaction. In Phase 3, the Query Service respects field masking configurations based on principal role (e.g. masking user emails for `viewer` roles while exposing them to `analyst` or `admin`).
