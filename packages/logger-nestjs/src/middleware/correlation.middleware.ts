import { Injectable, NestMiddleware } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { RequestContextService } from '../context/request-context.service.js';
import {
  W3C_TRACEPARENT_REGEX,
  SAFE_REQUEST_ID_REGEX,
} from '../constants.js';

/**
 * Express/Fastify compatible Request interface subset.
 */
interface IncomingHttpRequest {
  headers: Record<string, string | string[] | undefined>;
  [key: string]: unknown;
}

interface OutgoingHttpResponse {
  setHeader?(name: string, value: string): void;
  [key: string]: unknown;
}

/**
 * SkyraCorrelationMiddleware extracts or generates distributed tracing identifiers
 * (W3C traceparent and request ID) and initializes the AsyncLocalStorage context
 * for the incoming request lifecycle.
 */
@Injectable()
export class SkyraCorrelationMiddleware implements NestMiddleware {
  constructor(private readonly requestContextService: RequestContextService) {}

  public use(
    req: IncomingHttpRequest,
    res: OutgoingHttpResponse,
    next: (error?: unknown) => void
  ): void {
    // 1. Extract or generate Request ID
    let requestId: string | undefined;
    const rawRequestId = req.headers['x-request-id'] || req.headers['request-id'];

    if (typeof rawRequestId === 'string') {
      const trimmed = rawRequestId.trim();
      if (SAFE_REQUEST_ID_REGEX.test(trimmed)) {
        requestId = trimmed;
      }
    } else if (Array.isArray(rawRequestId) && rawRequestId.length > 0) {
      const first = rawRequestId[0];
      if (typeof first === 'string' && SAFE_REQUEST_ID_REGEX.test(first.trim())) {
        requestId = first.trim();
      }
    }

    if (!requestId) {
      requestId = crypto.randomUUID();
    }

    // Set response header for downstream clients
    if (typeof res.setHeader === 'function') {
      try {
        res.setHeader('x-request-id', requestId);
      } catch {
        // Ignore if headers are already sent or immutable
      }
    }

    // 2. Parse W3C traceparent header
    let traceId: string | undefined;
    let spanId: string | undefined;
    const rawTraceparent = req.headers['traceparent'];
    const traceparentStr = Array.isArray(rawTraceparent) ? rawTraceparent[0] : rawTraceparent;

    if (typeof traceparentStr === 'string') {
      const match = W3C_TRACEPARENT_REGEX.exec(traceparentStr.trim());
      if (match) {
        const version = match[1]!.toLowerCase();
        const rawTraceId = match[2]!.toLowerCase();
        const rawSpanId = match[3]!.toLowerCase();

        // W3C spec constraints:
        // Version 'ff' is forbidden
        // All-zero traceId or spanId is invalid
        const isAllZerosTrace = /^0{32}$/.test(rawTraceId);
        const isAllZerosSpan = /^0{16}$/.test(rawSpanId);

        if (version !== 'ff' && !isAllZerosTrace && !isAllZerosSpan) {
          traceId = rawTraceId;
          spanId = rawSpanId;
        }
      }
    }

    // If no valid W3C trace ID was provided, generate a fresh 32-hex trace ID
    if (!traceId) {
      traceId = crypto.randomBytes(16).toString('hex');
      spanId = crypto.randomBytes(8).toString('hex');
    }

    const startTimeNs = process.hrtime.bigint();

    // 3. Run downstream pipeline inside isolated AsyncLocalStorage scope
    this.requestContextService.run(
      {
        requestId,
        traceId,
        spanId,
        startTimeNs,
        customContext: {},
      },
      () => next()
    );
  }
}
