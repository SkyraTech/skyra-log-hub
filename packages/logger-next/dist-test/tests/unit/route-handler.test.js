import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert/strict';
import { parseStrictJson, validateLogEvent } from '@skyra/logger-core';
import { createNextSkyraLogger, withSkyraLogging, } from '../../src/index.js';
import { resetGlobalNextLogger } from '../../src/internal/singleton.js';
describe('Route Handler Logging & Interception (Unit)', () => {
    beforeEach(() => {
        resetGlobalNextLogger();
    });
    it('1. wraps GET Route Handler, records completion event, stamps x-request-id on response', async () => {
        const writtenEvents = [];
        const logger = createNextSkyraLogger({
            projectId: 'skyra-portal',
            serviceName: 'portal-web',
            environment: 'test',
            instanceId: 'inst-rh-01',
            level: 'trace',
            transport: { type: 'stdout' },
        });
        logger.getUnderlying().getTransport().write = async (_level, line) => {
            writtenEvents.push(parseStrictJson(line));
        };
        const handler = withSkyraLogging(async (request) => {
            return Response.json({ status: 'ok' }, { status: 200 });
        }, { route: '/api/status', logger });
        const req = new Request('https://skyra.internal/api/status', {
            method: 'GET',
            headers: {
                'x-request-id': 'req-test-12345',
                'traceparent': '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
            },
        });
        const res = await handler(req);
        await logger.flush();
        assert.equal(res.status, 200);
        assert.equal(res.headers.get('x-request-id'), 'req-test-12345');
        assert.equal(writtenEvents.length, 1);
        const event = writtenEvents[0];
        assert.equal(event.event.action, 'http.request.completed');
        assert.equal(event.event.outcome, 'success');
        assert.equal(event.log.level, 'info');
        assert.equal(event.http?.request?.method, 'GET');
        assert.equal(event.http?.request?.id, 'req-test-12345');
        assert.equal(event.http?.response?.status_code, 200);
        assert.equal(event.http?.route, '/api/status');
        assert.equal(event.skyra.http?.route_template, '/api/status');
        assert.equal(event.trace?.id, '4bf92f3577b34da6a3ce929d0e0e4736');
        assert.equal(event.span?.id, '00f067aa0ba902b7');
        assert.ok(typeof event.skyra.duration_ms === 'number');
        assert.ok(typeof event.event.duration === 'number');
        const validation = validateLogEvent(event);
        assert.equal(validation.valid, true, `Schema validation failed: ${JSON.stringify(validation.errors)}`);
    });
    it('2. maps 4xx status to warn and 5xx status to error severity', async () => {
        const writtenEvents = [];
        const logger = createNextSkyraLogger({
            projectId: 'skyra-portal',
            serviceName: 'portal-web',
            environment: 'test',
            instanceId: 'inst-rh-02',
            level: 'trace',
            transport: { type: 'stdout' },
        });
        logger.getUnderlying().getTransport().write = async (_level, line) => {
            writtenEvents.push(parseStrictJson(line));
        };
        const handler400 = withSkyraLogging(async () => Response.json({ error: 'Bad request' }, { status: 400 }), { route: '/api/bad', logger });
        const handler503 = withSkyraLogging(async () => Response.json({ error: 'Unavailable' }, { status: 503 }), { route: '/api/unavailable', logger });
        await handler400(new Request('https://skyra.internal/api/bad'));
        await handler503(new Request('https://skyra.internal/api/unavailable'));
        await logger.flush();
        assert.equal(writtenEvents.length, 2);
        assert.equal(writtenEvents[0]?.log.level, 'warn');
        assert.equal(writtenEvents[0]?.event.outcome, 'failure');
        assert.equal(writtenEvents[1]?.log.level, 'error');
        assert.equal(writtenEvents[1]?.event.outcome, 'failure');
    });
    it('3. captures unhandled exceptions in Route Handler, records failure log, and rethrows original error', async () => {
        const writtenEvents = [];
        const logger = createNextSkyraLogger({
            projectId: 'skyra-portal',
            serviceName: 'portal-web',
            environment: 'test',
            instanceId: 'inst-rh-03',
            level: 'trace',
            transport: { type: 'stdout' },
        });
        logger.getUnderlying().getTransport().write = async (_level, line) => {
            writtenEvents.push(parseStrictJson(line));
        };
        const expectedError = new Error('Database connection pool exhausted');
        const failingHandler = withSkyraLogging(async () => {
            throw expectedError;
        }, { route: '/api/failing', logger });
        await assert.rejects(async () => {
            await failingHandler(new Request('https://skyra.internal/api/failing'));
        }, (err) => err === expectedError);
        await logger.flush();
        assert.equal(writtenEvents.length, 1);
        const event = writtenEvents[0];
        assert.equal(event.event.outcome, 'failure');
        assert.equal(event.log.level, 'error');
        assert.equal(event.http?.response?.status_code, 500);
        assert.equal(event.error?.type, 'Error');
        assert.equal(event.error?.message, 'Database connection pool exhausted');
    });
    it('4. excludes configured paths without emitting log events', async () => {
        const writtenEvents = [];
        const logger = createNextSkyraLogger({
            projectId: 'skyra-portal',
            serviceName: 'portal-web',
            environment: 'test',
            instanceId: 'inst-rh-04',
            level: 'trace',
            transport: { type: 'stdout' },
            http: {
                excludePaths: ['/api/health', '/api/live'],
            },
        });
        logger.getUnderlying().getTransport().write = async (_level, line) => {
            writtenEvents.push(parseStrictJson(line));
        };
        const healthHandler = withSkyraLogging(async () => Response.json({ status: 'UP' }), { route: '/api/health', logger });
        await healthHandler(new Request('https://skyra.internal/api/health'));
        await logger.flush();
        assert.equal(writtenEvents.length, 0, 'Excluded path must not emit completion log');
    });
    it('5. preserves streaming responses without consuming or buffering response body', async () => {
        const writtenEvents = [];
        const logger = createNextSkyraLogger({
            projectId: 'skyra-portal',
            serviceName: 'portal-web',
            environment: 'test',
            instanceId: 'inst-rh-05',
            level: 'trace',
            transport: { type: 'stdout' },
        });
        logger.getUnderlying().getTransport().write = async (_level, line) => {
            writtenEvents.push(parseStrictJson(line));
        };
        // Create a streaming response
        const stream = new ReadableStream({
            start(controller) {
                controller.enqueue(new TextEncoder().encode('chunk 1\n'));
                controller.enqueue(new TextEncoder().encode('chunk 2\n'));
                controller.close();
            },
        });
        const streamHandler = withSkyraLogging(async () => new Response(stream, { status: 200, headers: { 'content-type': 'text/plain' } }), { route: '/api/stream', logger });
        const response = await streamHandler(new Request('https://skyra.internal/api/stream'));
        await logger.flush();
        // Verify stream was NOT consumed by the logging wrapper
        assert.equal(response.bodyUsed, false, 'Logging wrapper must never mark response body as used');
        const text = await response.text();
        assert.equal(text, 'chunk 1\nchunk 2\n');
        assert.equal(writtenEvents.length, 1);
    });
});
//# sourceMappingURL=route-handler.test.js.map