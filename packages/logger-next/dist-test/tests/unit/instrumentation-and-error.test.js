import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert/strict';
import { parseStrictJson, validateLogEvent } from '@skyra/logger-core';
import { createNextSkyraLogger, registerSkyraInstrumentation, createSkyraRequestErrorHandler, sanitizeError, } from '../../src/index.js';
import { resetGlobalNextLogger } from '../../src/internal/singleton.js';
describe('Next.js Instrumentation & Error Handling (Unit)', () => {
    beforeEach(() => {
        resetGlobalNextLogger();
    });
    it('1. registerSkyraInstrumentation initializes logger singleton', async () => {
        const logger = await registerSkyraInstrumentation({
            projectId: 'skyra-inst',
            serviceName: 'inst-web',
            environment: 'test',
            instanceId: 'inst-01',
            transport: { type: 'stdout' },
        });
        assert.ok(logger);
        assert.equal(logger.getOptions().serviceName, 'inst-web');
    });
    it('2. createSkyraRequestErrorHandler logs error adhering to canonical schema', async () => {
        const writtenEvents = [];
        const logger = createNextSkyraLogger({
            projectId: 'skyra-inst',
            serviceName: 'inst-web',
            environment: 'test',
            instanceId: 'inst-02',
            level: 'trace',
            transport: { type: 'stdout' },
        });
        logger.getUnderlying().getTransport().write = async (_level, line) => {
            writtenEvents.push(parseStrictJson(line));
        };
        const errorHandler = createSkyraRequestErrorHandler(logger);
        const error = new Error('Render timeout occurred while fetching user profile');
        errorHandler(error, {
            path: '/profile/user_123',
            method: 'GET',
            headers: {
                'x-request-id': 'req-error-hook-01',
                'traceparent': '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
            },
        }, {
            routerKind: 'App Router',
            routePath: '/profile/[id]',
            routeType: 'render',
        });
        await logger.flush();
        assert.equal(writtenEvents.length, 1);
        const event = writtenEvents[0];
        assert.equal(event.event.action, 'framework.request.error');
        assert.equal(event.event.outcome, 'failure');
        assert.equal(event.log.level, 'error');
        assert.equal(event.http?.request?.method, 'GET');
        assert.equal(event.http?.request?.id, 'req-error-hook-01');
        assert.equal(event.http?.route, '/profile/[id]');
        assert.equal(event.trace?.id, '4bf92f3577b34da6a3ce929d0e0e4736');
        assert.equal(event.span?.id, '00f067aa0ba902b7');
        assert.equal(event.skyra.business?.framework?.router_kind, 'App Router');
        assert.equal(event.skyra.business?.framework?.route_type, 'render');
        assert.equal(event.error?.type, 'Error');
        assert.equal(event.error?.message, 'Render timeout occurred while fetching user profile');
        const validation = validateLogEvent(event);
        assert.equal(validation.valid, true, `Schema validation failed: ${JSON.stringify(validation.errors)}`);
    });
    it('3. deduplicates duplicate error reports for the same error instance', async () => {
        const writtenEvents = [];
        const logger = createNextSkyraLogger({
            projectId: 'skyra-inst',
            serviceName: 'inst-web',
            environment: 'test',
            instanceId: 'inst-03',
            level: 'trace',
            transport: { type: 'stdout' },
        });
        logger.getUnderlying().getTransport().write = async (_level, line) => {
            writtenEvents.push(parseStrictJson(line));
        };
        const errorHandler = createSkyraRequestErrorHandler(logger);
        const errorInstance = new Error('Duplicate error trigger');
        // Call twice with the exact same error
        errorHandler(errorInstance, { path: '/api/test', method: 'GET' });
        errorHandler(errorInstance, { path: '/api/test', method: 'GET' });
        await logger.flush();
        assert.equal(writtenEvents.length, 1, 'Expected duplicate error trigger to be suppressed');
    });
    it('4. sanitizeError redacts secrets from error messages and stack traces', () => {
        const secretError = new Error('Failed connecting with postgres://app_user:SuperSecretPassword123@db.prod.internal:5432/core and Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-IDcSemACt8x4iTMCda8Yhe3iZaWbvV5XKSTbuAn0M');
        const sanitized = sanitizeError(secretError);
        assert.ok(!sanitized.message.includes('SuperSecretPassword123'));
        assert.ok(!sanitized.message.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'));
        assert.ok(sanitized.message.includes('[REDACTED]'));
        assert.ok(sanitized.stack_trace);
        assert.ok(!sanitized.stack_trace.includes('SuperSecretPassword123'));
    });
    it('5. Edge runtime guard: registerSkyraInstrumentation safely handles edge environment without crashing', async () => {
        const origRuntime = process.env.NEXT_RUNTIME;
        try {
            process.env.NEXT_RUNTIME = 'edge';
            resetGlobalNextLogger();
            const logger = await registerSkyraInstrumentation({
                projectId: 'skyra-edge',
                serviceName: 'edge-proxy',
                environment: 'production',
                instanceId: 'edge-01',
            });
            assert.ok(logger);
        }
        finally {
            if (origRuntime !== undefined) {
                process.env.NEXT_RUNTIME = origRuntime;
            }
            else {
                delete process.env.NEXT_RUNTIME;
            }
        }
    });
});
//# sourceMappingURL=instrumentation-and-error.test.js.map