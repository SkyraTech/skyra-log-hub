# @skyra/logger-browser

> Production-grade, framework-independent browser structured logging SDK for Skyra LogHub.

Complies with Canonical JSON Schema v1 (ECS 8.11.0 / Skyra v1), zero Node.js runtime dependencies, bounded memory buffering, sensitive-data redaction, and optional global error capture.

## Installation

```bash
npm install @skyra/logger-browser
# or
pnpm add @skyra/logger-browser
```

## Quick Start

```typescript
import { createSkyraBrowserLogger } from '@skyra/logger-browser';

const logger = createSkyraBrowserLogger({
  projectId: 'skyra-portal',
  serviceName: 'portal-web',
  environment: 'production',
  level: 'info',

  transport: {
    type: 'http',
    url: 'https://logs.skyra-tech.com/v1/events',
    allowedOrigins: ['https://logs.skyra-tech.com'],
  },

  capture: {
    globalErrors: true,
    unhandledRejections: true,
    navigation: false,
  },
});

logger.info('Dashboard loaded', { component: 'dashboard' });

try {
  riskyOperation();
} catch (error) {
  logger.error('Operation failed', { error });
}

await logger.flush();
logger.dispose();
```

## Features

- **Pure Browser Engine:** Strictly no `node:fs`, `node:path`, `node:crypto`, or `AsyncLocalStorage`.
- **Cryptographic UUIDv4:** RFC 4122 compliant via `crypto.randomUUID()` with secure byte fallback. Zero `Math.random()`.
- **Sensitive Data Redaction:** Masks passwords, JWTs, Bearer tokens, API keys, credentials, and connection strings before buffering.
- **Envelope Defense:** Guarantees immutable canonical envelope fields cannot be overridden by caller metadata.
- **Bounded Buffering & Priority Eviction:** Prevents browser OOM. Under burst saturation, non-critical events are evicted to preserve `error` and `fatal` events.
- **Transports:** `memory` (for testing/SSR), `console` (for development), `http` (for remote ingestion).
- **Lifecycle & sendBeacon:** Flushes pending events on `visibilitychange` and `pagehide` using `navigator.sendBeacon()`.
- **W3C Distributed Tracing:** Validates 32-hex `trace_id` and 16-hex `span_id`. Origin allowlisting prevents header leakage to third parties.
- **Timing & Navigation:** Reusable `startTimer()` and `trackNavigation()` helpers with privacy-safe route parameterization.
