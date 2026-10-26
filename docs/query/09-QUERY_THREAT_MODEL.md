# Query Service Threat Model & Security Analysis

**Document Version:** 1.0.0  
**Status:** Approved Architecture Specification  
**Task Reference:** LOGHUB-QUERY-001  
**Applies To:** Query Service Foundation (`apps/query-service`)

---

## 1. System Boundary & Attacker Profiles

### System Boundary
The Query Service boundary encompasses:
- External HTTPS API callers (Angular Dashboard, CLI tools, automated alerting, future Jarvis/MCP agents).
- The Query Service application runtime (`apps/query-service`).
- Read-only filesystem mounts for the canonical JSONL archive and derived Parquet store.
- Temporary scratch filesystem for DuckDB spill files.
- Read-only connection to PostgreSQL metadata (`archive_segments`, `parquet_segments`) and read-write connection to `query_audit_logs`.

### Attacker Profiles
1. **Malicious Tenant / Authorized User:** An authenticated user attempting to read logs belonging to another tenant or project outside their grant.
2. **Untrusted Internet Client:** An unauthenticated or unauthorized caller attempting credential stuffing, DDoS, or injection attacks.
3. **Compromised Upstream Service / Malicious Log Emitter:** An attacker injecting crafted payloads into log messages (`message`, structured metadata) to exploit query-time parsing or SQL compilation.

---

## 2. STRIDE Threat Analysis & Mitigations

| Threat ID | STRIDE Category | Threat Description | Severity | Architecture Mitigation |
| :--- | :--- | :--- | :--- | :--- |
| **THREAT-01** | Information Disclosure | Cross-tenant data leakage via forged request parameters (`tenant_id`, `projects`). | Critical | **Server-Enforced Scope:** The server unconditionally ignores client `tenant_id` and derives it from the verified JWT principal. Requested projects are intersected with authorized projects. |
| **THREAT-02** | Tampering / Elevation | SQL Injection via structured field filters or message search queries. | Critical | **Zero String Concatenation:** All DuckDB queries use parameterized placeholders (`$1`, `$2`). Structured filters are translated from an AST strictly into static allowlisted SQL expressions. |
| **THREAT-03** | Information Disclosure | Local File Inclusion (LFI) / Path Traversal via segment paths or glob patterns. | Critical | **Metadata-Driven Discovery:** Clients cannot specify paths or filenames. All scanned file paths originate exclusively from verified PostgreSQL records and are checked against `ARCHIVE_ROOT`. |
| **THREAT-04** | Elevation of Privilege | Execution of malicious DuckDB extensions or external network exfiltration. | Critical | **Engine Sandboxing:** DuckDB initialized with `SET enable_external_access = false`, `SET autoinstall_known_extensions = false`, and `SET autoload_known_extensions = false`. |
| **THREAT-05** | Denial of Service | Resource exhaustion via unbounded queries (multi-year scans, memory exhaustion). | High | **Multi-Tier Guardrails:** Max time range enforced (30 days), max memory ceiling (`SET max_memory = '256MB'`), hard timeout aborts (30s), and fair-share tenant scheduling. |
| **THREAT-06** | Tampering | Pagination cursor forgery to skip authorization checks or access arbitrary offsets. | High | **HMAC Keyset Cursors:** Cursors contain query filter hash, tenant boundary, timestamp, and UUIDv7 signed with server HMAC-SHA256 secret. Tampered cursors fail validation. |
| **THREAT-07** | Information Disclosure | Event ID enumeration across tenants via `GET /query/v1/logs/{eventId}`. | Medium | **Scoped ID Resolution:** Event lookup requires tenant and project scoping. Cross-tenant event lookups return generic `404 Not Found`. |
| **THREAT-08** | Tampering | Symlink / Junction traversal in archive directory pointing to `/etc/passwd`. | High | **Symlink Verification:** Server resolves `fs.realpathSync` and verifies the target path remains inside `ARCHIVE_ROOT` before providing it to DuckDB. |
| **THREAT-09** | Information Disclosure | Sensitive log content (passwords, tokens) exposed to unauthorized roles. | Medium | **Canonical Redaction & Role Masking:** Sensitive data redacted during Phase 1 SDK ingestion; query service supports role-based field masking. |
| **THREAT-10** | Repudiation | Unaudited data exfiltration by rogue employees. | Medium | **Query Audit Trail:** Every query writes an immutable record to `query_audit_logs` capturing principal ID, tenant, project, criteria, and record counts. |
| **THREAT-11** | Tampering | Poisoned Parquet metadata or malformed Parquet files causing engine crashes. | Medium | **Parity Verification & Fallback:** Parquet files generated exclusively by internal trusted workers with checksum verification. If DuckDB fails to parse a Parquet file, query falls back to JSONL. |
| **THREAT-12** | Information Disclosure | Sensitive data leakage via temporary spill files left on disk. | Low | **Ephemeral Spill Scratch:** Spill directory `/tmp/skyra-query-spill` isolated with `0700` POSIX permissions and purged on process restart or query completion. |

---

## 3. Residual Risk & Defense-in-Depth Summary

The combination of:
1. Strict fail-closed query authorization,
2. In-memory parameterized DuckDB execution,
3. Complete disablement of DuckDB external access,
4. HMAC-authenticated keyset pagination, and
5. Read-only filesystem mounts

provides robust defense-in-depth against the most critical threats facing modern analytical log search engines.
