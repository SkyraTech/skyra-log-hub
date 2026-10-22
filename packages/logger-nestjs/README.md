# @skyra/logger-nestjs

> Production-Grade NestJS Logging Adapter & Automatic API Observability for Skyra LogHub.

Built on `@skyra/logger-node` and `@skyra/logger-core`, `@skyra/logger-nestjs` provides developer-friendly, zero-boilerplate structured logging and automatic API observability adhering to the **ECS 8.11.0-compatible Skyra Logging Standard v1.0**.

---

## Features

- **Automatic HTTP Request & Response Observability**: Automatically logs `http.request.completed` events with monotonic execution duration (`process.hrtime.bigint()`), HTTP status code, sanitized route template, and outcome.
- **W3C Distributed Trace Correlation**: Automatically parses W3C `traceparent` headers (`trace.id` 32-hex, `span.id` 16-hex) and propagates them seamlessly through Node.js `AsyncLocalStorage`.
- **Request ID Generation & Propagation**: Reuses incoming `x-request-id` or generates fresh RFC 4122 UUIDv4 identifiers, stamping them on outgoing HTTP response headers.
- **Route & Secret Sanitization**: Automatically strips query strings, auth tokens, and raw IDs from route templates (e.g. `/users/:userId/orders`), preventing sensitive data leakage into metrics and log indices.
- **Deep Sensitive Data Redaction**: Pre-serialization scrubbing of passwords, bearer tokens, JWTs, cookies, URL credentials, and credit card PANs across all log levels.
- **Exception & Error Handling**: Captures known NestJS `HttpException` and uncaught exceptions with sanitized stack traces while strictly preserving default framework response semantics (stack traces are never exposed to API clients).
- **Instrumentation Helpers**:
  - `measureJob()`: Monotonic timing and telemetry for asynchronous background jobs.
  - `measureDatabase()`: Monotonic timing and schema-bounded telemetry for database operations (strictly zero raw bind parameters).
  - `measureOperation()`: Monotonic timing and outcome tracking for generic business workflows.
- **Graceful Lifecycle Integration**: Implements NestJS `OnApplicationShutdown` and `BeforeApplicationShutdown` lifecycle hooks to ensure all buffered in-memory queue logs are flushed and fsynced to disk on application termination.
- **Zero-Bypass Single-Writer Safety**: Backed by `@skyra/logger-node`'s atomic instance ownership (`.instance.owner` with `O_EXCL`), bounded priority-eviction queue, and daily UTC rotation.

---

## Installation

```bash
# In your NestJS application
pnpm add @skyra/logger-nestjs @skyra/logger-node @skyra/logger-core
```

### Peer Dependencies
Ensure compatible NestJS peer dependencies are installed:
```bash
pnpm add @nestjs/common @nestjs/core reflect-metadata rxjs
```

---

## Quick Start

### 1. Register Module in `AppModule`

```typescript
import { Module } from '@nestjs/common';
import { SkyraLoggerModule } from '@skyra/logger-nestjs';

@Module({
  imports: [
    SkyraLoggerModule.forRoot({
      projectId: 'skyra-erp',
      serviceName: 'erp-api',
      environment: 'production',
      instanceId: process.env.INSTANCE_ID || 'erp-api-01',
      level: 'info',
      transport: {
        type: 'file',
        directory: './logs',
      },
      http: {
        enabled: true,
        captureDuration: true,
        excludePaths: ['/health', '/metrics'],
        sampleRate: 1.0,
      },
    }),
  ],
})
export class AppModule {}
```

### 2. Inject `SkyraLoggerService` in Services / Controllers

```typescript
import { Injectable } from '@nestjs/common';
import { SkyraLoggerService } from '@skyra/logger-nestjs';

@Injectable()
export class PaymentsService {
  constructor(private readonly logger: SkyraLoggerService) {}

  async processPayment(orderId: string, amount: number) {
    this.logger.info('Processing customer payment', {
      component: 'payments',
      orderId,
      amount,
    });

    return this.logger.measureOperation('charge-stripe', async () => {
      // business logic here
      return { status: 'PAID', transactionId: 'tx-12345' };
    });
  }
}
```

---

## Asynchronous Configuration

Use `forRootAsync` to load options from environment variables or a configuration service:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SkyraLoggerModule } from '@skyra/logger-nestjs';

@Module({
  imports: [
    ConfigModule.forRoot(),
    SkyraLoggerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        projectId: config.getOrThrow('PROJECT_ID'),
        serviceName: config.getOrThrow('SERVICE_NAME'),
        environment: config.getOrThrow('NODE_ENV'),
        instanceId: config.getOrThrow('POD_NAME'),
        level: config.get('LOG_LEVEL', 'info'),
        transport: {
          type: 'file',
          directory: config.get('LOG_DIR', './logs'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
})
export class AppModule {}
```

---

## Automatic HTTP Logging Example

When an HTTP request finishes, an event is emitted adhering to ECS 8.11.0:

```json
{
  "@timestamp": "2026-10-22T10:30:15.123Z",
  "ecs.version": "8.11.0",
  "event": {
    "id": "a5c68e32-8438-4e4b-9725-b827568c0762",
    "action": "http.request.completed",
    "outcome": "success",
    "category": ["web"],
    "duration": 245000000
  },
  "log": {
    "level": "info"
  },
  "message": "GET /api/v1/orders/:id 200 - 245.000ms",
  "service": {
    "name": "erp-api",
    "environment": "production",
    "node": {
      "name": "erp-api-01"
    }
  },
  "skyra": {
    "project_id": "skyra-erp",
    "schema_version": "1.0",
    "duration_ms": 245.0,
    "http": {
      "route_template": "/api/v1/orders/:id"
    }
  },
  "trace": {
    "id": "4bf92f3577b34da6a3ce929d0e0e4736"
  },
  "span": {
    "id": "00f067aa0ba902b7"
  },
  "http": {
    "request": {
      "method": "GET",
      "id": "req-client-01"
    },
    "response": {
      "status_code": 200
    },
    "route": "/api/v1/orders/:id"
  }
}
```

---

## Background Job & Database Instrumentation

### Background Jobs
```typescript
await this.logger.measureJob(
  'invoice-generation',
  async () => {
    await this.generateInvoices();
  },
  {
    queue: 'billing',
    attempt: 1,
    maxAttempts: 3,
  }
);
```

### Database Operations
```typescript
const customers = await this.logger.measureDatabase(
  {
    system: 'postgresql',
    name: 'erp_main',
    operation: 'SELECT',
    table: 'customers',
    statementSanitized: 'SELECT id, name FROM customers WHERE tenant_id = $1',
    queryFingerprint: 'hash-abc-123',
  },
  async () => {
    return this.customerRepository.find();
  }
);
```

---

## Benchmark Performance Summary

Benchmarked on Intel Core i5-10210U (8 logical cores), Node.js v24.21.0, Windows x64:

| Workload Scenario | Throughput | p50 Latency | p99 Latency | Memory Impact |
| :--- | :---: | :---: | :---: | :---: |
| **Request Correlation (Middleware + ALS)** | 384,608 ops/sec | 1.5 µs | 13.5 µs | +3.9 MB |
| **Basic HTTP Event Build & Nonblocking Enqueue** | 12,035 ops/sec | 65.1 µs | 240.6 µs | +8.1 MB |
| **Request + Exception Logging (Deep Redaction)** | 6,696 ops/sec | 108.7 µs | 446.4 µs | +11.9 MB |
| **End-to-End JSONL File Transport Under Load** | 14,789 ops/sec | 51.6 µs | 156.2 µs | 10,000 written, 0 dropped |

---

## License

UNLICENSED — Proprietary to Skyra Tech.
