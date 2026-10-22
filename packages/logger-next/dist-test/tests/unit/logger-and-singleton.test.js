import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert/strict';
import { createNextSkyraLogger, getSkyraServerLogger, SkyraNextLogger, } from '../../src/index.js';
import { resetGlobalNextLogger } from '../../src/internal/singleton.js';
describe('Next.js Logger & Singleton Lifecycle (Unit)', () => {
    beforeEach(() => {
        resetGlobalNextLogger();
    });
    it('1. initializes logger with provided configuration', () => {
        const logger = createNextSkyraLogger({
            projectId: 'skyra-portal',
            serviceName: 'portal-web',
            environment: 'test',
            instanceId: 'inst-unit-01',
            level: 'debug',
            transport: { type: 'stdout' },
        });
        assert.ok(logger instanceof SkyraNextLogger);
        const opts = logger.getOptions();
        assert.equal(opts.projectId, 'skyra-portal');
        assert.equal(opts.serviceName, 'portal-web');
        assert.equal(opts.level, 'debug');
    });
    it('2. reuses existing singleton on repeated initialization with matching identifiers (hot-reload safety)', () => {
        const first = createNextSkyraLogger({
            projectId: 'skyra-portal',
            serviceName: 'portal-web',
            environment: 'development',
            instanceId: 'inst-hmr-01',
            transport: { type: 'stdout' },
        });
        const second = createNextSkyraLogger({
            projectId: 'skyra-portal',
            serviceName: 'portal-web',
            environment: 'development',
            instanceId: 'inst-hmr-02',
            transport: { type: 'stdout' },
        });
        assert.equal(first, second, 'Expected hot-reload to reuse singleton without recreating file writers');
    });
    it('3. getSkyraServerLogger returns global singleton or initializes sensible fallback', () => {
        const fallback = getSkyraServerLogger();
        assert.ok(fallback instanceof SkyraNextLogger);
        assert.ok(fallback.getOptions().serviceName);
        // Subsequent call returns exact same instance
        const secondCall = getSkyraServerLogger();
        assert.equal(fallback, secondCall);
    });
    it('4. delegates all standard logging methods and child logger creation', async () => {
        const written = [];
        const logger = createNextSkyraLogger({
            projectId: 'skyra-portal',
            serviceName: 'portal-web',
            environment: 'test',
            instanceId: 'inst-methods-01',
            level: 'trace',
            transport: { type: 'stdout' },
        });
        logger.getUnderlying().getTransport().write = async (_level, line) => {
            written.push(line);
        };
        logger.trace('trace log');
        logger.debug('debug log');
        logger.info('info log');
        logger.warn('warn log');
        logger.error('error log');
        logger.fatal('fatal log');
        const child = logger.child({ component: 'user-profile' });
        child.info('child log message');
        await logger.flush();
        assert.equal(written.length, 7);
        assert.ok(written[0]?.includes('trace log'));
        assert.ok(written[6]?.includes('child log message'));
        assert.ok(written[6]?.includes('user-profile'));
    });
    it('5. defaults to stdout transport in serverless runtime environment', () => {
        const origVercel = process.env.VERCEL;
        try {
            process.env.VERCEL = '1';
            resetGlobalNextLogger();
            const serverlessLogger = createNextSkyraLogger({
                projectId: 'skyra-lambda',
                serviceName: 'lambda-fn',
                environment: 'production',
                instanceId: 'lambda-01',
            });
            assert.equal(serverlessLogger.getOptions().transport?.type, 'stdout');
        }
        finally {
            if (origVercel !== undefined) {
                process.env.VERCEL = origVercel;
            }
            else {
                delete process.env.VERCEL;
            }
        }
    });
    it('6. concurrent initialization returns consistent singleton instance', async () => {
        resetGlobalNextLogger();
        const tasks = Array.from({ length: 20 }, (_, i) => createNextSkyraLogger({
            projectId: 'skyra-concurrent',
            serviceName: 'concurrent-service',
            environment: 'test',
            instanceId: `inst-${i}`,
            transport: { type: 'stdout' },
        }));
        const instances = await Promise.all(tasks);
        const firstInstance = instances[0];
        for (const inst of instances) {
            assert.equal(inst, firstInstance);
        }
    });
    it('7. flush and close execute idempotently without unhandled rejections', async () => {
        const logger = createNextSkyraLogger({
            projectId: 'skyra-lifecycle',
            serviceName: 'lifecycle-service',
            environment: 'test',
            instanceId: 'inst-life-01',
            transport: { type: 'stdout' },
        });
        await logger.flush();
        await logger.flush();
        await logger.close();
        await logger.close();
        const status = logger.getStatus();
        assert.equal(status.isClosed, true);
    });
});
//# sourceMappingURL=logger-and-singleton.test.js.map