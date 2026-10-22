import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { extractTraceparent, resolveRequestId, generateTraceId, generateSpanId, SAFE_REQUEST_ID_REGEX, sanitizeRouteTemplate, runWithRequestContext, getNextRequestContext, } from '../../src/index.js';
describe('Correlation, Route Sanitization & Async Context (Unit)', () => {
    describe('W3C Traceparent & Request ID', () => {
        it('1. parses and validates compliant W3C traceparent headers', () => {
            const validHeader = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
            const extracted = extractTraceparent(validHeader);
            assert.ok(extracted);
            assert.equal(extracted.traceId, '4bf92f3577b34da6a3ce929d0e0e4736');
            assert.equal(extracted.spanId, '00f067aa0ba902b7');
        });
        it('2. rejects malformed traceparents (version ff, all zeros, incorrect lengths)', () => {
            // Version ff
            assert.equal(extractTraceparent('ff-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'), undefined);
            // All-zero traceId
            assert.equal(extractTraceparent('00-00000000000000000000000000000000-00f067aa0ba902b7-01'), undefined);
            // All-zero spanId
            assert.equal(extractTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01'), undefined);
            // Non-hex
            assert.equal(extractTraceparent('00-zzzz2f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'), undefined);
            // Malformed format
            assert.equal(extractTraceparent('invalid-traceparent-format'), undefined);
            assert.equal(extractTraceparent(null), undefined);
            assert.equal(extractTraceparent(undefined), undefined);
        });
        it('3. generates valid 32-hex traceId and 16-hex spanId', () => {
            const traceId = generateTraceId();
            const spanId = generateSpanId();
            assert.equal(traceId.length, 32);
            assert.ok(/^[0-9a-f]{32}$/.test(traceId));
            assert.equal(spanId.length, 16);
            assert.ok(/^[0-9a-f]{16}$/.test(spanId));
        });
        it('4. validates incoming request IDs and generates UUIDv4 fallback', () => {
            const validIncoming = 'req-prod-9988-abc_01';
            assert.equal(resolveRequestId(validIncoming), validIncoming);
            // Invalid characters or empty string falls back to UUIDv4
            const invalid = resolveRequestId('req with spaces & <script>');
            assert.ok(SAFE_REQUEST_ID_REGEX.test(invalid));
            assert.notEqual(invalid, 'req with spaces & <script>');
            const fromNull = resolveRequestId(null);
            assert.ok(SAFE_REQUEST_ID_REGEX.test(fromNull));
        });
    });
    describe('Route Sanitization', () => {
        it('5. preserves explicit framework route templates', () => {
            const result = sanitizeRouteTemplate('/api/users/123/orders', '/api/users/[userId]/orders');
            assert.equal(result, '/api/users/[userId]/orders');
        });
        it('6. strips query strings and hash fragments', () => {
            const result = sanitizeRouteTemplate('/api/v1/auth?token=super_secret_token#section');
            assert.equal(result, '/api/v1/auth');
        });
        it('7. parameterizes UUIDs, Mongo IDs, and numeric segments', () => {
            assert.equal(sanitizeRouteTemplate('/api/tenants/a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d/settings'), '/api/tenants/:id/settings');
            assert.equal(sanitizeRouteTemplate('/api/products/507f1f77bcf86cd799439011'), '/api/products/:id');
            assert.equal(sanitizeRouteTemplate('/api/orders/998877/items/4433'), '/api/orders/:id/items/:id');
        });
        it('8. privacy: unknown or unmatched routes with emails or secret tokens fall back to [unmatched-route]', () => {
            const withEmail = sanitizeRouteTemplate('/api/users/john.doe@skyra-tech.com/profile');
            assert.equal(withEmail, '[unmatched-route]');
            const withToken = sanitizeRouteTemplate('/api/auth/reset/a1b2c3d4e5f60718293a4b5c6d7e8f90');
            assert.equal(withToken, '[unmatched-route]');
        });
        it('9. bounds oversized route strings to 256 characters', () => {
            const longPath = '/api/resource/' + 'a'.repeat(300);
            const result = sanitizeRouteTemplate(longPath);
            assert.ok(result.length <= 256);
        });
    });
    describe('AsyncLocalStorage Context Isolation', () => {
        it('10. concurrent asynchronous executions maintain strict context isolation', async () => {
            const count = 50;
            const runConcurrentRequest = async (id) => {
                const requestId = `req-iso-${id}`;
                const traceId = `${id}`.padStart(32, '0');
                const spanId = `${id}`.padStart(16, '0');
                return runWithRequestContext({
                    requestId,
                    traceId,
                    spanId,
                    startTimeNs: process.hrtime.bigint(),
                    customContext: { runIndex: id },
                }, async () => {
                    // Variable async delay simulating real I/O
                    await new Promise((res) => setTimeout(res, Math.random() * 20));
                    const store = getNextRequestContext();
                    assert.ok(store);
                    assert.equal(store.requestId, requestId);
                    assert.equal(store.traceId, traceId);
                    assert.equal(store.spanId, spanId);
                    assert.equal(store.customContext?.runIndex, id);
                    return id;
                });
            };
            const results = await Promise.all(Array.from({ length: count }, (_, i) => runConcurrentRequest(i)));
            assert.equal(results.length, count);
        });
    });
});
//# sourceMappingURL=correlation-and-sanitizer.test.js.map