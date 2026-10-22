# Skyra Logger (Python)

Production-grade, ECS-aligned structured logging SDK, daily UTC rotating JSONL transport, standard library logging adapter, and telemetry instrumentation for Skyra Tech Python applications, microservices, and background workers.

---

## 1. Installation

```bash
pip install skyra-logger
```

Requirements: Python >= 3.10.

---

## 2. Core Architecture & Storage Contract

`skyra-logger` implements the canonical Skyra analytical file-first architecture (ADR-002, ADR-011):
- **Deterministic Storage Hierarchy**:
  ```text
  ${LOG_ROOT}/${PROJECT_ID}/${ENVIRONMENT}/${SERVICE_NAME}/${INSTANCE_ID}/YYYY-MM-DD.part-0000.jsonl
  ```
- **Single-Writer Process Ownership**: Enforced by atomic `.instance.owner` exclusive marker creation with stale lock detection.
- **Daily UTC Midnight Rotation**: Rollover triggers strictly at `00:00:00.000Z`.
- **Size-Based Rollover**: Configurable threshold (default 100 MiB) with monotonic part indexing (`0000`, `0001`, ...).
- **Crash Recovery & Quarantine**: Automated recovery from incomplete trailing lines and truncated JSON with metadata quarantining into `${YYYY-MM-DD}.corrupt.log`.
- **Bounded Write Queue**: Bounded in-memory event count and byte limits with priority eviction for critical events (`error`, `fatal`).

---

## 3. Quickstart & Public API

```python
from skyra_logger import create_skyra_logger

logger = create_skyra_logger(
    project_id="skyra-erp",
    service_name="erp-worker",
    environment="production",
    instance_id="worker-01",
    level="info",
    transport={
        "type": "file",
        "directory": "./logs",
        "rotation": {
            "interval": "utc-day",
            "max_file_size_bytes": 100 * 1024 * 1024,
        },
    },
)

# Standard logging
logger.info("Worker started", {"component": "startup"})

# Error with exception serialization
try:
    raise ValueError("Invalid payment state")
except Exception as err:
    logger.error("Operation failed", {"component": "payments", "error": err})

# Child logger with inherited context
child = logger.child({"tenant_id": "tnt_001"})
child.info("Tenant action executed")

# Ensure durability on shutdown
logger.flush()
logger.close()
```

### Context Manager Usage
```python
with create_skyra_logger(project_id="skyra-job", service_name="batch-runner") as logger:
    logger.info("Batch execution started")
```

---

## 4. Standard Python `logging` Module Integration

Attach `SkyraLoggingHandler` to any standard library `logging.Logger`:

```python
import logging
from skyra_logger import create_skyra_logger, SkyraLoggingHandler

skyra_logger = create_skyra_logger(project_id="skyra-web", service_name="api-gateway")

std_logger = logging.getLogger("my_service")
std_logger.addHandler(SkyraLoggingHandler(skyra_logger=skyra_logger))

std_logger.info("Service initialized", extra={"component": "network"})
std_logger.exception("Database query failed")
```

Severity mappings:
- `logging.CRITICAL` -> `fatal`
- `logging.ERROR` -> `error`
- `logging.WARNING` -> `warn`
- `logging.INFO` -> `info`
- `logging.DEBUG` -> `debug`
- Level <= 5 -> `trace`

---

## 5. Request & Trace Correlation

Propagate W3C traceparent and request identifiers across tasks and async contexts using `skyra_context`:

```python
from skyra_logger import skyra_context

with skyra_context(
    request_id="req-12345",
    trace_id="4bf92f3577b34da6a3ce929d0e0e4736",
    span_id="00f067aa0ba902b7",
):
    logger.info("Handling order checkout")
```

---

## 6. Timing Instrumentation

### Database Timing
```python
result = logger.measure_database(
    system="postgresql",
    operation="SELECT",
    table="customers",
    function=lambda: db.query("SELECT * FROM customers"),
)
```

### Background Job Timing
```python
result = logger.measure_job(
    name="generate-invoices",
    function=lambda: invoice_service.process_pending(),
    job_id="job_8829",
)
```

### Generic Operation Timing
```python
result = logger.measure_operation(
    action="business.inventory.reconciliation",
    function=lambda: reconcile_inventory(),
)
```

Async equivalents: `measure_database_async`, `measure_job_async`, `measure_operation_async`.

---

## 7. Deep Sensitive Data Redaction

All log events pass through non-mutating deep redaction before disk or stdout emission:
- Password, token, api_key, authorization, cookie, and credential scrubbing.
- Bearer tokens, raw JWTs (`eyJ...`), PEM private keys, URL credentials.
- Protection against circular references and deep recursion.
- Invariant post-redaction envelope locking guarantees that canonical ECS envelope fields cannot be overridden.

---

## 8. Verification & Performance

- **Automated Tests**: 75 tests covering functional, storage, reliability, security, and cross-language interop with Node.js fixtures.
- **Isolated Verification**: Confirmed via wheel installation and execution in an isolated virtual environment outside the repository.
- **Benchmarks**: >600 ops/sec stdout throughput, >420 ops/sec disk throughput, p50 latency <2.1ms on standard systems.
