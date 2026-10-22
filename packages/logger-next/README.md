# @skyra/logger-next

> Production-Grade Next.js Server-Side Logging Adapter, Route Handler Instrumentation & API Observability for Skyra LogHub.

[![ECS Baseline](https://img.shields.io/badge/ECS-8.11.0-blue.svg)](https://www.elastic.co/guide/en/ecs/8.11/index.html)
[![Next.js](https://img.shields.io/badge/Next.js-^14.0.0%20||%20^15.0.0-black.svg)](https://nextjs.org/)
[![License: UNLICENSED](https://img.shields.io/badge/license-UNLICENSED-red.svg)](#)

---

## 1. Overview

`@skyra/logger-next` provides seamless, zero-friction structured observability for Next.js applications adopting the **Next.js App Router**. It is engineered on top of `@skyra/logger-node` and `@skyra/logger-core`, emitting canonical JSONL log events conforming strictly to the Elastic Common Schema (ECS 8.11.0) and Skyra Schema v1.0 specifications.

### Key Capabilities

- **App Router Route Handlers**: Declarative `withSkyraLogging` wrapper capturing monotonic duration, HTTP method, status code, route templates, request IDs, and distributed tracing identifiers without buffering or consuming streaming response bodies.
- **Server Actions & Server Functions**: Type-safe `withSkyraAction` wrapper measuring asynchronous server execution, recording business metadata, and capturing unhandled failures without serializing raw function arguments or sensitive form data.
- **React Server Components (RSC)**: Explicit server-side logging support via `getSkyraServerLogger()` adhering to React Server Components concurrency boundaries.
- **Next.js Instrumentation Hooks**: Official integration for `register()` and `onRequestError()` in `instrumentation.ts`, capturing framework-level unhandled exceptions with automatic error deduplication.
- **Distributed Tracing & Correlation**: Full support for W3C `traceparent` (`traceId` and `spanId`), RFC 4122 `x-request-id` stamping, and Node.js `AsyncLocalStorage` context isolation.
- **Runtime-Aware Transports**: Reliable local file storage with daily UTC rotation and bounded queue buffering for persistent Node.js servers; automatic fallback to non-blocking `stdout` in serverless environments (AWS Lambda, Vercel, Google Cloud Run).

---

## 2. Installation

Install `@skyra/logger-next` along with its peer dependencies:

```bash
pnpm add @skyra/logger-next @skyra/logger-node @skyra/logger-core
```

Ensure `next` (>=14.0.0 or >=15.0.0) and `react` (>=18.2.0 or >=19.0.0) are installed in your application.

---

## 3. Supported Runtimes & Compatibility Matrix

| Runtime Environment | Support Level | Transport Mode | Notes & Boundaries |
| :--- | :--- | :--- | :--- |
| **Node.js Server (App Router)** | Full (Tier 1) | Local JSONL File or Stdout | Persistent filesystem with daily UTC rollover, size-based rotation, and bounded memory queue. |
| **Serverless Node.js (Vercel, AWS Lambda)** | Full (Tier 1) | Stdout Transport | Auto-detected. Non-blocking JSONL output. Ephemeral file storage avoided. |
| **Edge Runtime (`edge`)** | Safe Boundary | Safe No-Op / Diagnostics | Node-specific modules (`node:fs`, `node:async_hooks`) are safely guarded against Edge bundling. |
| **Browser Runtime (Client Components)** | Unsupported | None | Strictly a server-side observability integration. Client components must not import server logger. |

### Supported Next.js Releases
- **Next.js 15.x**: Tested and verified on Next.js `v15.5.28` (App Router, React 19).
- **Next.js 14.x**: Compatible with Next.js App Router (Node.js runtime).

---

## 4. App Router Integration Guide

### 4.1 Route Handler Logging (`withSkyraLogging`)

Wrap your App Router Route Handlers with `withSkyraLogging`. The wrapper preserves handler argument types, streaming semantics, and response immutability:

```typescript
// app/api/users/[userId]/route.ts
import { withSkyraLogging } from "@skyra/logger-next/route-handler";

export const GET = withSkyraLogging(
  async (request: Request, context: { params: Promise<{ userId: string }> }) => {
    const { userId } = await context.params;
    return Response.json({ id: userId, name: "Alice" });
  },
  {
    route: "/api/users/[userId]" // Explicit safe parameterized route template
  }
);
```

#### Streaming Response Semantics
`withSkyraLogging` measures the exact handler execution time and does not buffer or truncate streaming responses:

```typescript
// app/api/stream/route.ts
import { withSkyraLogging } from "@skyra/logger-next/route-handler";

export const GET = withSkyraLogging(
  async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("data: ping\n\n"));
        controller.close();
      }
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream" }
    });
  },
  { route: "/api/stream" }
);
```

### 4.2 Server Actions (`withSkyraAction`)

Wrap Server Actions (`"use server"`) to record duration and business telemetry while preserving argument and return types:

```typescript
// app/actions.ts
"use server";

import { withSkyraAction } from "@skyra/logger-next/server-action";

export interface CreateOrderInput {
  orderId: string;
  totalAmount: number;
}

export const createOrder = withSkyraAction(
  "orders.create",
  async (input: CreateOrderInput) => {
    // Business logic
    return { success: true, orderId: input.orderId };
  },
  {
    // Approved metadata extraction (raw arguments and form data are excluded by default)
    extractMetadata: (input) => ({ orderId: input.orderId })
  }
);
```

### 4.3 Instrumentation Hooks (`instrumentation.ts`)

Integrate with official Next.js instrumentation hooks to initialize the logger singleton and capture framework-level unhandled errors:

```typescript
// instrumentation.ts
import { createNextSkyraLogger } from "@skyra/logger-next";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    createNextSkyraLogger({
      projectId: "portal-web",
      serviceName: "web-frontend",
      environment: process.env.NODE_ENV === "production" ? "production" : "development",
      instanceId: process.env.INSTANCE_ID || `portal-${process.pid}`,
      level: "info",
      transport: {
        type: process.env.VERCEL ? "stdout" : "file",
        directory: process.env.SKYRA_LOG_DIR || "./logs"
      }
    });

    const { registerSkyraInstrumentation } = await import("@skyra/logger-next/instrumentation");
    await registerSkyraInstrumentation();
  }
}

export async function onRequestError(err: unknown, request: any, context: any) {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { createSkyraRequestErrorHandler } = await import("@skyra/logger-next/instrumentation");
    const handler = createSkyraRequestErrorHandler();
    await handler(err, request, context);
  }
}
```

### 4.4 React Server Components (RSC) Logging

Perform explicit server-side logging from Server Components:

```tsx
// app/dashboard/page.tsx
import { getSkyraServerLogger } from "@skyra/logger-next";

export default async function DashboardPage() {
  const logger = getSkyraServerLogger();
  logger.info("Dashboard server component rendered", {
    component: "DashboardPage"
  });

  return (
    <main>
      <h1>Dashboard</h1>
    </main>
  );
}
```

> **Note on RSC**: Never log raw props, state, or user PII. Component render timing is not automatically captured through public Next.js APIs; explicit logging boundaries should be used.

---

## 5. Security & Privacy Guarantees

`@skyra/logger-next` strictly enforces Skyra LogHub security policies:

1. **Header Redaction**: `authorization`, `cookie`, `proxy-authorization`, `x-api-key`, and tokens are permanently scrubbed.
2. **Payload Protection**: Request bodies and response bodies are **never** read, logged, or buffered.
3. **Route Privacy**: Unmatched or dynamic routes containing email addresses or sensitive credentials automatically collapse to `[unmatched-route]`.
4. **Envelope Immutability**: Canonical envelope fields (`@timestamp`, `ecs.version`, `event.id`, `service`, `skyra`) are locked against caller metadata override.
5. **Ajv Validation**: All generated log events are strictly verified against the canonical ECS 8.11.0 / Skyra schema v1.0.

---

## 6. Performance & Overhead Benchmarks

Measured on Node.js v24.21.0, Intel Core i5-10210U (8 cores), Next.js v15.5.28 across 10,000 iterations per scenario:

| Scenario | Throughput | Mean Latency | p50 Latency | p95 Latency | p99 Latency | Completion |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Baseline Route Handler** | 22,835 ops/s | 23.0 µs | 16.0 µs | 41.2 µs | 111.6 µs | N/A |
| **Correlation-Only (ALS + W3C)** | 19,648 ops/s | 34.5 µs | 23.1 µs | 48.2 µs | 175.1 µs | N/A |
| **withSkyraLogging (JSONL File)** | 1,481 ops/s | 602.8 µs | 503.2 µs | 1,205.7 µs | 2,773.7 µs | 100% (0 drops) |
| **Error-Logging (Exception Handling)** | 561 ops/s | 1,733.9 µs | 1,610.2 µs | 2,521.7 µs | 5,796.0 µs | 100% (0 drops) |
| **High-Concurrency Burst (50 burst)** | 6,899 ops/s | 6,296.5 µs | 5,920.4 µs | 9,790.3 µs | 13,303.7 µs | 100% (0 drops) |
| **withSkyraLogging (Stdout)** | 2,656 ops/s | 355.7 µs | 294.5 µs | 669.7 µs | 1,138.3 µs | 100% (0 drops) |

---

## 7. License

UNLICENSED — Proprietary to Skyra Tech.
