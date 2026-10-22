import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert/strict';
import { parseStrictJson, validateLogEvent } from '@skyra/logger-core';
import { createNextSkyraLogger, measureDatabase, measureOperation, measureJob, } from '../../src/index.js';
import { resetGlobalNextLogger } from '../../src/internal/singleton.js';
describe('Next.js Timing & Telemetry Helpers (Unit)', () => {
    beforeEach(() => {
        resetGlobalNextLogger();
    });
    it('1. measureDatabase records duration, database metadata, and query fingerprint', async () => {
        const writtenEvents = [];
        const logger = createNextSkyraLogger({
            projectId: 'skyra-portal',
            serviceName: 'portal-web',
            environment: 'test',
            instanceId: 'inst-db-01',
            level: 'trace',
            transport: { type: 'stdout' },
        });
        logger.getUnderlying().getTransport().write = async (_level, line) => {
            writtenEvents.push(parseStrictJson(line));
        };
        const rows = await measureDatabase(logger, {
            system: 'postgresql',
            name: 'portal_prod',
            operation: 'SELECT',
            table: 'users',
            statementSanitized: 'SELECT id, email FROM users WHERE id = $1',
            queryFingerprint: 'sha256-query-fp-123',
            rowsAffected: 1,
        }, async () => {
            await new Promise((res) => setTimeout(res, 5));
            return [{ id: 'usr-1', email: 'alice@skyra.io' }];
        });
        await logger.flush();
        assert.equal(rows.length, 1);
        assert.equal(writtenEvents.length, 1);
        const event = writtenEvents[0];
        assert.equal(event.event.action, 'database.query.completed');
        assert.equal(event.event.outcome, 'success');
        assert.equal(event.database?.system, 'postgresql');
        assert.equal(event.database?.operation, 'SELECT');
        assert.equal(event.database?.table, 'users');
        assert.equal(event.database?.statement_sanitized, 'SELECT id, email FROM users WHERE id = $1');
        assert.equal(event.database?.rows_affected, 1);
        assert.equal(event.skyra.db?.query_fingerprint, 'sha256-query-fp-123');
        assert.ok(typeof event.skyra.db?.client_duration_ms === 'number');
        assert.ok(typeof event.event.duration === 'number');
        const validation = validateLogEvent(event);
        assert.equal(validation.valid, true, `Schema validation failed: ${JSON.stringify(validation.errors)}`);
    });
    it('2. measureDatabase on error records database.query.failed and rethrows exception', async () => {
        const writtenEvents = [];
        const logger = createNextSkyraLogger({
            projectId: 'skyra-portal',
            serviceName: 'portal-web',
            environment: 'test',
            instanceId: 'inst-db-02',
            level: 'trace',
            transport: { type: 'stdout' },
        });
        logger.getUnderlying().getTransport().write = async (_level, line) => {
            writtenEvents.push(parseStrictJson(line));
        };
        const expectedErr = new Error('deadlock detected on table accounts');
        await assert.rejects(async () => {
            await measureDatabase(logger, {
                system: 'mysql',
                operation: 'UPDATE',
                table: 'accounts',
            }, async () => {
                throw expectedErr;
            });
        }, (err) => err === expectedErr);
        await logger.flush();
        assert.equal(writtenEvents.length, 1);
        const event = writtenEvents[0];
        assert.equal(event.event.action, 'database.query.failed');
        assert.equal(event.event.outcome, 'failure');
        assert.equal(event.error?.type, 'Error');
        assert.equal(event.error?.message, 'deadlock detected on table accounts');
    });
    it('3. measureOperation records generic business operation duration and outcome', async () => {
        const writtenEvents = [];
        const logger = createNextSkyraLogger({
            projectId: 'skyra-portal',
            serviceName: 'portal-web',
            environment: 'test',
            instanceId: 'inst-op-01',
            level: 'trace',
            transport: { type: 'stdout' },
        });
        logger.getUnderlying().getTransport().write = async (_level, line) => {
            writtenEvents.push(parseStrictJson(line));
        };
        const result = await measureOperation(logger, 'export-csv-report', async () => {
            return { generatedFiles: 3 };
        }, { exportFormat: 'csv' });
        await logger.flush();
        assert.deepEqual(result, { generatedFiles: 3 });
        assert.equal(writtenEvents.length, 1);
        const event = writtenEvents[0];
        assert.equal(event.event.action, 'operation.completed');
        assert.equal(event.event.outcome, 'success');
        assert.equal(event.skyra.business?.operation_name, 'export-csv-report');
    });
    it('4. measureJob records background job telemetry adhering to canonical schema', async () => {
        const writtenEvents = [];
        const logger = createNextSkyraLogger({
            projectId: 'skyra-portal',
            serviceName: 'portal-web',
            environment: 'test',
            instanceId: 'inst-job-01',
            level: 'trace',
            transport: { type: 'stdout' },
        });
        logger.getUnderlying().getTransport().write = async (_level, line) => {
            writtenEvents.push(parseStrictJson(line));
        };
        const jobResult = await measureJob(logger, 'purge-stale-tokens', async () => {
            return { purgedCount: 420 };
        }, {
            id: 'job-9911',
            attempt: 1,
            maxAttempts: 3,
            queueDurationMs: 8.5,
        });
        await logger.flush();
        assert.deepEqual(jobResult, { purgedCount: 420 });
        assert.equal(writtenEvents.length, 1);
        const event = writtenEvents[0];
        assert.equal(event.event.action, 'job.execution.completed');
        assert.equal(event.event.outcome, 'success');
        assert.equal(event.skyra.job?.id, 'job-9911');
        assert.equal(event.skyra.job?.type, 'purge-stale-tokens');
        assert.equal(event.skyra.job?.status, 'completed');
        assert.equal(event.skyra.job?.attempt, 1);
        const validation = validateLogEvent(event);
        assert.equal(validation.valid, true, `Job schema validation failed: ${JSON.stringify(validation.errors)}`);
    });
});
//# sourceMappingURL=timing.test.js.map