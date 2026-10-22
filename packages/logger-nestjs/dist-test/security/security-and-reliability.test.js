import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { createSkyraLogger } from '@skyra/logger-node';
import { validateLogEvent, parseStrictJson } from '@skyra/logger-core';
import { SkyraLoggerService } from '../../dist/skyra-logger.service.js';
import { RequestContextService } from '../../dist/context/request-context.service.js';
import { sanitizeError } from '../../dist/internal/error-sanitizer.js';
import { sanitizeRouteTemplate } from '../../dist/internal/route-sanitizer.js';
import { buildHttpCompletedEventContext } from '../../dist/internal/http-event-builder.js';
import { SkyraHttpLoggingInterceptor } from '../../dist/interceptors/http-logging.interceptor.js';
import { measureDatabase } from '../../dist/instrumentation/database-timer.js';
describe('Security & Reliability Invariants (NestJS Adapter)', () => {
    it('1. nested errors and cyclic references do not crash logging', () => {
        const cyclicErr = new Error('Cyclic parent');
        cyclicErr.cause = { nested: cyclicErr };
        const sanitized = sanitizeError(cyclicErr);
        assert.equal(sanitized.type, 'Error');
        assert.equal(sanitized.message, 'Cyclic parent');
    });
    it('2. raw request and response bodies are excluded from HTTP completed events', () => {
        const eventContext = buildHttpCompletedEventContext({
            method: 'POST',
            statusCode: 200,
            durationMs: 45.2,
            durationNs: 45200000,
            routeTemplate: '/api/v1/checkout',
            requestId: 'req-secure-01',
        });
        const contextStr = JSON.stringify(eventContext);
        assert.ok(!contextStr.includes('requestBody'));
        assert.ok(!contextStr.includes('responseBody'));
        assert.ok(!contextStr.includes('body'));
    });
    it('3. sensitive tokens, authorization headers and cookies are never persisted', () => {
        const rawPathWithSecrets = '/api/v1/auth/callback?code=def_secret_code_12345&access_token=ya29.a0AfH6SM...&cookie=session_id%3Dxyz';
        const sanitized = sanitizeRouteTemplate(rawPathWithSecrets);
        assert.equal(sanitized, '/api/v1/auth/callback');
        assert.ok(!sanitized.includes('def_secret_code_12345'));
        assert.ok(!sanitized.includes('ya29.a0AfH6SM'));
        assert.ok(!sanitized.includes('session_id'));
    });
    it('4. concurrent requests maintain strict AsyncLocalStorage context isolation', async () => {
        const contextService = new RequestContextService();
        const count = 50;
        const runRequest = async (id) => {
            const requestId = `req-iso-${id}`;
            const traceId = `${id}`.padStart(32, '0');
            const spanId = `${id}`.padStart(16, '0');
            return contextService.run({
                requestId,
                traceId,
                spanId,
                startTimeNs: process.hrtime.bigint(),
                customContext: { runIndex: id },
            }, async () => {
                // Simulate variable async delay
                await new Promise((res) => setTimeout(res, Math.random() * 20));
                // Verify no cross-talk occurred during async delay
                assert.equal(contextService.getRequestId(), requestId);
                assert.equal(contextService.getTraceId(), traceId);
                assert.equal(contextService.getSpanId(), spanId);
                assert.equal(contextService.get('runIndex'), id);
                return id;
            });
        };
        const results = await Promise.all(Array.from({ length: count }, (_, i) => runRequest(i)));
        assert.equal(results.length, count);
    });
    it('5. logger queue saturation holds hard memory limits and tracks drops', () => {
        let droppedCount = 0;
        const rawLogger = createSkyraLogger({
            projectId: 'skyra-erp',
            serviceName: 'erp-api',
            environment: 'test',
            instanceId: 'inst-sat-01',
            level: 'info',
            transport: { type: 'stdout' },
            limits: {
                maxPendingEvents: 10,
                maxQueueMemoryBytes: 2000,
            },
            onDrop: (count) => {
                droppedCount += count;
            },
        });
        const service = new SkyraLoggerService(rawLogger);
        // Flood with events
        for (let i = 0; i < 50; i++) {
            service.info(`High volume payload event index ${i}`, {
                payload: 'x'.repeat(200),
            });
        }
        const status = service.getStatus();
        assert.ok(status.droppedEventsCount > 0);
        assert.ok(status.pendingQueueCount <= 10);
    });
    it('6. every emitted event validates against canonical Ajv Draft 2020-12 schema', () => {
        const rawLogger = createSkyraLogger({
            projectId: 'skyra-erp',
            serviceName: 'erp-api',
            environment: 'test',
            instanceId: 'inst-schema-01',
            level: 'trace',
            transport: { type: 'stdout' },
        });
        const writtenLines = [];
        // Intercept underlying transport write
        const origWrite = rawLogger.getTransport().write.bind(rawLogger.getTransport());
        rawLogger.getTransport().write = async (level, line, bytes) => {
            writtenLines.push(line);
            return origWrite(level, line, bytes);
        };
        const service = new SkyraLoggerService(rawLogger);
        service.info('Test canonical event', {
            component: 'test-runner',
            action: 'http.request.completed',
            outcome: 'success',
            category: ['web'],
            durationMs: 12.345,
            traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
            spanId: '00f067aa0ba902b7',
            http: {
                request: { method: 'GET', id: 'req-val-01' },
                response: { status_code: 200 },
                route: '/api/v1/health',
            },
            skyra: {
                http: { route_template: '/api/v1/health' },
            },
        });
        // Parse and validate each line
        for (const line of writtenLines) {
            const parsed = parseStrictJson(line);
            const result = validateLogEvent(parsed);
            assert.equal(result.valid, true, `Validation failed: ${JSON.stringify(result.errors)} for line: ${line}`);
        }
    });
    it('7. Phase A1: abandoned/aborted HTTP requests are recorded as failure with status 499, not success', async () => {
        const writtenEvents = [];
        const rawLogger = createSkyraLogger({
            projectId: 'skyra-erp',
            serviceName: 'erp-api',
            environment: 'test',
            instanceId: 'inst-abort-01',
            level: 'trace',
            transport: { type: 'stdout' },
        });
        rawLogger.getTransport().write = async (_level, line) => {
            writtenEvents.push(parseStrictJson(line));
        };
        // Simulate Express request and response where client closes before response ends
        const listeners = {};
        const mockReq = {
            method: 'GET',
            originalUrl: '/test/abandoned-stream',
            aborted: true,
            destroyed: true,
            once: (evt, cb) => {
                listeners[evt] = listeners[evt] || [];
                listeners[evt].push(cb);
            },
        };
        const mockRes = {
            statusCode: 200, // Left at 200 by default in Express
            writableEnded: false, // NOT ended!
            once: (evt, cb) => {
                listeners[evt] = listeners[evt] || [];
                listeners[evt].push(cb);
            },
        };
        const interceptor = new SkyraHttpLoggingInterceptor({
            projectId: 'skyra-erp',
            serviceName: 'erp-api',
            environment: 'test',
            instanceId: 'inst-abort-01',
            http: { enabled: true },
        }, rawLogger);
        const executionContext = {
            getType: () => 'http',
            switchToHttp: () => ({
                getRequest: () => mockReq,
                getResponse: () => mockRes,
            }),
        };
        const callHandler = {
            handle: () => ({
                pipe: () => ({
                    subscribe: () => { },
                }),
            }),
        };
        interceptor.intercept(executionContext, callHandler);
        // Trigger close on response before writableEnded
        if (listeners['close']) {
            listeners['close'].forEach((cb) => cb());
        }
        await rawLogger.flush();
        assert.equal(writtenEvents.length, 1);
        const event = writtenEvents[0];
        assert.equal(event.http.response.status_code, 499);
        assert.equal(event.event.outcome, 'failure');
        assert.equal(event.log.level, 'warn');
        assert.ok(event.error);
        assert.equal(event.error.message, 'Client closed request prematurely');
    });
    it('8. Phase A2: unknown or unmatched routes with emails or tokens fall back to [unmatched-route]', () => {
        const withEmail = sanitizeRouteTemplate('/api/users/dinesh.jetti@skyra.io/profile');
        assert.equal(withEmail, '[unmatched-route]');
        const withSecretToken = sanitizeRouteTemplate('/api/auth/reset/a1b2c3d4e5f60718293a4b5c6d7e8f90');
        assert.equal(withSecretToken, '[unmatched-route]');
        // Preserves framework route template when available
        const withFramework = sanitizeRouteTemplate('/api/users/dinesh.jetti@skyra.io/profile', '/api/users/:userId/profile');
        assert.equal(withFramework, '/api/users/:userId/profile');
    });
    it('9. Phase A3: validates trace and span identifiers and prevents metadata override of canonical envelope', async () => {
        const writtenEvents = [];
        const rawLogger = createSkyraLogger({
            projectId: 'skyra-erp',
            serviceName: 'erp-api',
            environment: 'test',
            instanceId: 'inst-env-01',
            level: 'trace',
            transport: { type: 'stdout' },
        });
        rawLogger.getTransport().write = async (_level, line) => {
            writtenEvents.push(parseStrictJson(line));
        };
        // Metadata attempts to override canonical fields and inject non-hex / all-zero trace IDs
        rawLogger.info('Canonical envelope defense test', {
            traceId: '00000000000000000000000000000000', // all zero - must be rejected
            spanId: 'not-a-valid-span', // invalid length / non-hex - must be rejected
            'ecs.version': '9.99.0', // forbidden override
            '@timestamp': '1970-01-01T00:00:00Z', // forbidden override
            service: { name: 'attacker-service' }, // forbidden override
            skyra: { project_id: 'attacker-project' }, // forbidden override
        });
        await rawLogger.flush();
        assert.equal(writtenEvents.length, 1);
        const event = writtenEvents[0];
        assert.equal(event['ecs.version'], '8.11.0');
        assert.notEqual(event['@timestamp'], '1970-01-01T00:00:00Z');
        assert.equal(event.service.name, 'erp-api');
        assert.equal(event.skyra.project_id, 'skyra-erp');
        assert.equal(event.trace, undefined, 'Invalid all-zero traceId must not be set on canonical event');
        assert.equal(event.span, undefined, 'Invalid spanId must not be set on canonical event');
    });
    it('10. Phase A4: database instrumentation emits canonical schema-valid database.query events', async () => {
        const writtenEvents = [];
        const rawLogger = createSkyraLogger({
            projectId: 'skyra-erp',
            serviceName: 'erp-api',
            environment: 'test',
            instanceId: 'inst-db-01',
            level: 'trace',
            transport: { type: 'stdout' },
        });
        rawLogger.getTransport().write = async (_level, line) => {
            writtenEvents.push(parseStrictJson(line));
        };
        const result = await measureDatabase(rawLogger, {
            system: 'postgresql',
            name: 'erp_main',
            operation: 'SELECT',
            table: 'orders',
            statementSanitized: 'SELECT id, total FROM orders WHERE customer_id = $1',
            queryFingerprint: 'fp-sha256-abc123',
            rowsAffected: 3,
        }, async () => {
            return [{ id: 1 }, { id: 2 }, { id: 3 }];
        });
        await rawLogger.flush();
        assert.equal(result.length, 3);
        assert.equal(writtenEvents.length, 1);
        const event = writtenEvents[0];
        // Schema validation
        const validation = validateLogEvent(event);
        assert.equal(validation.valid, true, `Database event validation failed: ${JSON.stringify(validation.errors)}`);
        assert.equal(event.event.action, 'database.query.completed');
        assert.equal(event.event.outcome, 'success');
        assert.equal(event.database.system, 'postgresql');
        assert.equal(event.database.operation, 'SELECT');
        assert.equal(event.database.table, 'orders');
        assert.equal(event.database.rows_affected, 3);
        assert.equal(event.skyra.db.query_fingerprint, 'fp-sha256-abc123');
        assert.ok(typeof event.skyra.db.client_duration_ms === 'number');
        assert.ok(typeof event.event.duration === 'number');
    });
});
//# sourceMappingURL=security-and-reliability.test.js.map