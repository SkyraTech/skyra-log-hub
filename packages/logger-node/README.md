# @skyra/logger-node

Production-Grade Node.js Logging SDK & Daily JSONL Transport for Skyra LogHub.

Built on top of `@skyra/logger-core`, `@skyra/logger-node` generates canonical, validated, redacted JSONL events conforming to Elastic Common Schema (ECS 8.11.0) and the Skyra Logging Standard v1.0. It provides high-throughput, non-blocking asynchronous writing with UTC midnight rotation, size-based rollover, and partial-line corruption recovery.

---

## Features

- **ECS 8.11.0 & Skyra Canonical Envelope:** Automatically generates `@timestamp` (ISO 8601 UTC), `event.id` (UUIDv4), `ecs.version`, `skyra.project_id`, `skyra.schema_version`, and service identity.
- **Deep Redaction Engine:** Automatically sanitizes passwords, bearer tokens, JWTs, cookies, session identifiers, URL credentials, and sensitive query parameters before disk writes.
- **Storage Contract Compliance (`contracts/storage-contract.md`):** Deterministic directory layout:
  `${LOG_ROOT}/${PROJECT_ID}/${ENVIRONMENT}/${SERVICE_NAME}/${INSTANCE_ID}/${YYYY-MM-DD}.part-${PART_INDEX}.jsonl`
- **UTC Midnight Daily Rotation:** Deterministic calendar rotation based on UTC clock, preventing timezone drift. Low-volume services do not require empty file timers.
- **Size-Based Rollover:** Monotonic zero-padded 4-digit segment indexing (`.part-0000.jsonl`, `.part-0001.jsonl`). Configurable threshold (default 100 MiB).
- **Bounded Write Queue & Single-Writer Priority Eviction:** In-memory queue with backpressure protection and memory limits. Non-critical logs are dropped with observable metrics when queue overflows; `error` and `fatal` logs evict older non-critical logs within the serialized pipeline, preserving strict single-writer FIFO sequencing and eliminating out-of-band concurrent writes.
- **Atomic Single-Writer Instance Isolation:** Exclusive ownership lock (`.instance.owner`) with `O_EXCL`, verified PID liveness (`kill(pid, 0)`), in-process active registry, and automatic dead PID stale lock cleanup.
- **Contextual Child Loggers:** Create child loggers inheriting trace correlation, component names, and tags without mutating the parent logger.
- **Dual Transports:** Supports both local `jsonl-file` and container-native `stdout` transports.

---

## Installation

```bash
pnpm add @skyra/logger-node @skyra/logger-core
```

---

## Usage

```typescript
import { createSkyraLogger } from '@skyra/logger-node';

const logger = createSkyraLogger({
  projectId: 'skyra-erp',
  serviceName: 'erp-api',
  environment: 'production',
  instanceId: 'pod-erp-01',
  level: 'info',
  transport: {
    type: 'file',
    directory: './logs',
    rotation: {
      interval: 'utc-day',
      maxFileSizeBytes: 100 * 1024 * 1024, // 100 MiB
    },
  },
});

// Basic logging
logger.info('Application started', { component: 'bootstrap' });

// Contextual child logger
const requestLogger = logger.child({
  traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
  spanId: '00f067aa0ba902b7',
  component: 'payment-gateway',
});

requestLogger.info('Payment processing initiated', {
  action: 'payment.charge',
  amount: 250.0,
});

// Error logging with stack trace
try {
  throw new Error('Upstream timeout');
} catch (err) {
  requestLogger.error('Payment processing failed', {
    error: err,
    outcome: 'failure',
  });
}

// Graceful flush and shutdown
await logger.flush();
await logger.close();
```

---

## Delivery Guarantees

1. **Synchronous Queue Submission:** Methods like `info()`, `error()`, and `log()` are non-blocking, synchronous queue submissions. Calling a log method does not guarantee immediate disk durability.
2. **Crash Durability via `fsync`:** Logs with severity `error` or `fatal` trigger an OS `fsync` on the underlying file descriptor.
3. **Flushing:** Await `logger.flush()` or `logger.close()` during process shutdown hooks (`SIGTERM`, `beforeExit`) to ensure all buffered events are committed to disk.

---

## License

UNLICENSED (Internal Skyra Tech Proprietary).
