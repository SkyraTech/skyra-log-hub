import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert/strict';
import { parseStrictJson, validateLogEvent } from '@skyra/logger-core';
import { createNextSkyraLogger, withSkyraAction, runWithRequestContext, } from '../../src/index.js';
import { resetGlobalNextLogger } from '../../src/internal/singleton.js';
describe('Server Actions & Server Functions (Unit)', () => {
    beforeEach(() => {
        resetGlobalNextLogger();
    });
    it('1. measures asynchronous action, logs action.completed on success, preserves return value', async () => {
        const writtenEvents = [];
        const logger = createNextSkyraLogger({
            projectId: 'skyra-portal',
            serviceName: 'portal-web',
            environment: 'test',
            instanceId: 'inst-action-01',
            level: 'trace',
            transport: { type: 'stdout' },
        });
        logger.getUnderlying().getTransport().write = async (_level, line) => {
            writtenEvents.push(parseStrictJson(line));
        };
        const createOrderAction = withSkyraAction('orders.create', async (customerId, totalAmount) => {
            await new Promise((res) => setTimeout(res, 5));
            return { orderId: 'ord-9988', status: 'created', customerId, totalAmount };
        }, {
            logger,
            metadata: { region: 'eu-west-1' },
        });
        const result = await createOrderAction('cust-42', 1500);
        await logger.flush();
        assert.deepEqual(result, { orderId: 'ord-9988', status: 'created', customerId: 'cust-42', totalAmount: 1500 });
        assert.equal(writtenEvents.length, 1);
        const event = writtenEvents[0];
        assert.equal(event.event.action, 'action.completed');
        assert.equal(event.event.outcome, 'success');
        assert.equal(event.log.level, 'info');
        assert.equal(event.skyra.business?.action_name, 'orders.create');
        assert.equal(event.skyra.business?.action_status, 'completed');
        assert.equal(event.skyra.business?.region, 'eu-west-1');
        assert.ok(typeof event.skyra.duration_ms === 'number');
        assert.ok(typeof event.event.duration === 'number');
        const validation = validateLogEvent(event);
        assert.equal(validation.valid, true, `Schema validation failed: ${JSON.stringify(validation.errors)}`);
    });
    it('2. privacy: does not serialize raw function arguments or return payloads by default', async () => {
        const writtenEvents = [];
        const logger = createNextSkyraLogger({
            projectId: 'skyra-portal',
            serviceName: 'portal-web',
            environment: 'test',
            instanceId: 'inst-action-02',
            level: 'trace',
            transport: { type: 'stdout' },
        });
        logger.getUnderlying().getTransport().write = async (_level, line) => {
            writtenEvents.push(parseStrictJson(line));
        };
        const sensitiveAction = withSkyraAction('auth.login', async (credentials) => {
            return { sessionToken: 'sess_secret_token_12345', sensitiveUserData: { ssn: credentials.ssn } };
        }, { logger });
        await sensitiveAction({
            username: 'dinesh.jetti',
            passwordHash: 'SuperSecretHash123!',
            ssn: '123-45-6789',
        });
        await logger.flush();
        assert.equal(writtenEvents.length, 1);
        const eventStr = JSON.stringify(writtenEvents[0]);
        assert.ok(!eventStr.includes('SuperSecretHash123!'), 'Raw argument password must never be serialized');
        assert.ok(!eventStr.includes('123-45-6789'), 'Raw SSN argument must never be serialized');
        assert.ok(!eventStr.includes('sess_secret_token_12345'), 'Raw returned session token must never be serialized');
    });
    it('3. captures action failure, logs action.failed, and rethrows original exception', async () => {
        const writtenEvents = [];
        const logger = createNextSkyraLogger({
            projectId: 'skyra-portal',
            serviceName: 'portal-web',
            environment: 'test',
            instanceId: 'inst-action-03',
            level: 'trace',
            transport: { type: 'stdout' },
        });
        logger.getUnderlying().getTransport().write = async (_level, line) => {
            writtenEvents.push(parseStrictJson(line));
        };
        const expectedError = new Error('Insufficient inventory for SKU-404');
        const failingAction = withSkyraAction('inventory.reserve', async () => {
            throw expectedError;
        }, { logger });
        await assert.rejects(async () => {
            await failingAction();
        }, (err) => err === expectedError);
        await logger.flush();
        assert.equal(writtenEvents.length, 1);
        const event = writtenEvents[0];
        assert.equal(event.event.action, 'action.failed');
        assert.equal(event.event.outcome, 'failure');
        assert.equal(event.log.level, 'error');
        assert.equal(event.skyra.business?.action_name, 'inventory.reserve');
        assert.equal(event.skyra.business?.action_status, 'failed');
        assert.equal(event.error?.type, 'Error');
        assert.equal(event.error?.message, 'Insufficient inventory for SKU-404');
    });
    it('4. automatically enriches action log with active AsyncLocalStorage correlation context', async () => {
        const writtenEvents = [];
        const logger = createNextSkyraLogger({
            projectId: 'skyra-portal',
            serviceName: 'portal-web',
            environment: 'test',
            instanceId: 'inst-action-04',
            level: 'trace',
            transport: { type: 'stdout' },
        });
        logger.getUnderlying().getTransport().write = async (_level, line) => {
            writtenEvents.push(parseStrictJson(line));
        };
        const action = withSkyraAction('billing.charge', async () => ({ success: true }), { logger });
        await runWithRequestContext({
            requestId: 'req-als-777',
            traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
            spanId: '00f067aa0ba902b7',
        }, async () => {
            await action();
        });
        await logger.flush();
        assert.equal(writtenEvents.length, 1);
        const event = writtenEvents[0];
        assert.equal(event.trace?.id, '4bf92f3577b34da6a3ce929d0e0e4736');
        assert.equal(event.span?.id, '00f067aa0ba902b7');
        assert.equal(event.labels?.request_id, 'req-als-777');
    });
});
//# sourceMappingURL=server-action.test.js.map