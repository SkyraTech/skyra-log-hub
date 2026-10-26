# Testing Strategy & Quality Gate Standards

**Document Version:** 1.0.0  
**Status:** Approved Enterprise Architecture Baseline  
**Task Reference:** LOGHUB-ARCH-001  
**Scope:** Automated Test Suites, Test Pyramid, CI Quality Gates, and Release Verification

---

## 1. Testing Philosophy & Test Pyramid

Skyra LogHub enforces a rigorous, multi-layered automated testing pyramid across all TypeScript and Python packages:

```text
               ▲
              / \     End-to-End & Browser CDP Suites
             /   \    (Real Chrome/Edge CDP, Node/Python Spool Shipping)
            /─────\
           /       \   Integration & Fault-Injection Tests
          /         \  (Live PostgreSQL, DuckDB, WAL Crash Recovery, 7-day Idempotency)
         /───────────\
        /             \ Contract & Schema Tests
       /               \ (OpenAPI 3.1, Canonical ECS Schema v1, Query Schemas, Cross-SDK Fixtures)
      /─────────────────\
     /                   \ Unit Tests
    /                     \ (Domain Logic, Redaction Engine, Checkpoint Codec, AST Compilers)
   └───────────────────────┘
```

---

## 2. Test Suite Categorization

### 2.1 Unit Tests (`tests/unit/` or `*.test.ts`)
- **Execution Target:** High-speed, isolated execution without physical databases, external networks, or long timers.
- **Mocking & Doubles:** Use in-memory repository doubles (`InMemoryReceiptRepository`) rather than mocking deep internal framework methods.
- **Duration Budget:** Entire unit test suite must execute in $< 5$ seconds.

### 2.2 Integration Tests (`tests/integration/` or `twelve-scenarios.test.ts`)
- **Execution Target:** Verifies coordination across physical components: local filesystem, binary WAL journal, DuckDB engine, and PostgreSQL metadata.
- **Graceful Preflight:** Live database integration tests must check connection availability during preflight and skip gracefully with actionable diagnostics if unconfigured.

### 2.3 Contract & Schema Tests (`tests/contracts/`)
- **Execution Target:** Authoritative Ajv Draft 2020-12 validation of OpenAPI and JSON Schemas.
- **Cross-SDK Compliance:** Shared test fixtures in `contracts/fixtures/cross-sdk/` must be executed against both TypeScript and Python test runners to verify cross-runtime schema parity.

### 2.4 Security & Penetration Tests (`tests/security/`)
- **Execution Target:** Systematic verification of negative security properties:
  - SQL injection attempts (`' OR 1=1 --`).
  - Path traversal and symlink escapes (`../../etc/passwd`).
  - Cross-tenant data retrieval and forged tenant IDs.
  - Keyset cursor tampering and HMAC signature corruption.
  - Priority queue eviction under DoS burst saturation.

---

## 3. Ten Mandatory Pull-Request Quality Gates

Before any task or pull request can be merged or accepted, the following 10 quality gates must pass cleanly:

| Gate | Check Description | Standard Command | Passing Criteria |
| :--- | :--- | :--- | :--- |
| **G1** | Static Typechecking | `pnpm run typecheck` | 0 errors across all 8 packages and applications. |
| **G2** | Monorepo Build | `pnpm run build` | 0 compilation errors; distribution bundles emitted. |
| **G3** | Contract Validation | `pnpm run test:contracts` | 100% of contract test suites pass (45/45 tests). |
| **G4** | Unit Test Suites | `pnpm run test:node`, `test:nestjs`, `test:browser`, etc. | 0 failures; zero unhandled promise rejections. |
| **G5** | Python SDK Tests | `pnpm run test:python` | 75/75 Python tests pass (Python 3.10+). |
| **G6** | Ingestion Gateway Tests | `pnpm run test:gateway` | 100% gateway test suites pass (unit, storage, failure scenarios). |
| **G7** | Isolated Consumer Verification | `pnpm run verify:consumers` | Fresh `.tgz` / `.whl` tarballs install and run in isolated directories. |
| **G8** | Security Invariant Checks | `pnpm --filter @skyra/ingestion-gateway test:security` | All negative authorization and traversal tests pass. |
| **G9** | Working Tree Integrity | `git status --short` | No untracked build residue or accidental file mutations. |
| **G10**| Clean Regression | `pnpm run test:all` | Monorepo test suites exit with code 0. |

---

## 4. Test Reporting Discipline

- **Unique Test Counting:** Test reports must itemize unique test cases, not duplicate assertion counts or aggregate runner ticks.
- **No False Passes:** Skipped tests must be clearly identified and cannot be counted as verified passes.
- **Exit Code Verification:** Every test execution command must explicitly record its exit code (e.g. `Exit Code: 0`).
