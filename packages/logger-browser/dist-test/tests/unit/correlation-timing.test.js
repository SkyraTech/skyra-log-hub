/**
 * @skyra/logger-browser - Correlation and Timing Tests
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSkyraBrowserLogger, MemoryTransport, isValidTraceId, isValidSpanId, generateTraceparent, parseTraceparent, isAllowedOrigin, sanitizeRoute, } from '../../src/index.js';
describe('Logger Browser: Correlation, Timing & Navigation', () => {
    it('36. Validates compliant W3C trace identifiers and rejects invalid/all-zero', () => {
        assert.equal(isValidTraceId('4bf92f3577b34da6a3ce929d0e0e4736'), true);
        assert.equal(isValidTraceId('00000000000000000000000000000000'), false, 'All-zero trace ID rejected');
        assert.equal(isValidTraceId('not-a-hex-string-at-all'), false);
        assert.equal(isValidTraceId('4bf92f3577b34da6a3ce929d0e0e473'), false, '31 chars rejected');
        assert.equal(isValidSpanId('00f067aa0ba902b7'), true);
        assert.equal(isValidSpanId('0000000000000000'), false, 'All-zero span ID rejected');
        assert.equal(isValidSpanId('short-span'), false);
    });
    it('37. Generates and parses W3C traceparent headers', () => {
        const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';
        const spanId = '00f067aa0ba902b7';
        const header = generateTraceparent(traceId, spanId, true);
        assert.equal(header, '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
        const parsed = parseTraceparent(header);
        assert.ok(parsed);
        assert.equal(parsed.traceId, traceId);
        assert.equal(parsed.spanId, spanId);
        assert.equal(parsed.sampled, true);
    });
    it('38. Safe origin allowlisting prevents trace header leakage to third parties', () => {
        const allowed = ['https://api.skyra-tech.com', 'https://auth.skyra-tech.com'];
        assert.equal(isAllowedOrigin('https://api.skyra-tech.com/users', allowed), true);
        assert.equal(isAllowedOrigin('https://auth.skyra-tech.com/v1/token', allowed), true);
        assert.equal(isAllowedOrigin('https://third-party-tracker.com/pixel', allowed), false);
        assert.equal(isAllowedOrigin('https://attacker-site.com', allowed), false);
        assert.equal(isAllowedOrigin('https://api.skyra-tech.com', undefined), false);
    });
    it('39. Explicit timing with startTimer measures monotonic durations', async () => {
        const memory = new MemoryTransport();
        const logger = createSkyraBrowserLogger({
            projectId: 'timing-test',
            serviceName: 'web',
            environment: 'production',
            transport: memory,
        });
        const timer = logger.startTimer('widget.render', { component: 'analytics' });
        // Simulate work
        const elapsedMs = timer.stop({ outcome: 'success' });
        assert.ok(elapsedMs >= 0);
        await logger.flush();
        const ev = memory.getEvents()[0];
        assert.equal(ev.event.action, 'operation.completed');
        assert.equal(ev.event.outcome, 'success');
        assert.ok(typeof ev.event.duration === 'number');
        assert.ok(typeof ev.skyra.duration_ms === 'number');
        assert.equal(ev.skyra.component, 'analytics');
    });
    it('40. Prevents double-completion on stopTimer', async () => {
        const memory = new MemoryTransport();
        const logger = createSkyraBrowserLogger({
            projectId: 'double-stop',
            serviceName: 'web',
            environment: 'production',
            transport: memory,
        });
        const timer = logger.startTimer('single.run');
        const firstElapsed = timer.stop({ outcome: 'success' });
        const secondElapsed = timer.stop({ outcome: 'failure' });
        assert.equal(firstElapsed, secondElapsed);
        await logger.flush();
        // Only one event emitted!
        assert.equal(memory.getEvents().length, 1);
    });
    it('41. Enforces consistent duration units (nanoseconds in event.duration, ms in skyra.duration_ms)', async () => {
        const memory = new MemoryTransport();
        const logger = createSkyraBrowserLogger({
            projectId: 'units-test',
            serviceName: 'web',
            environment: 'production',
            transport: memory,
        });
        const timer = logger.startTimer('units.check');
        timer.stop();
        await logger.flush();
        const ev = memory.getEvents()[0];
        assert.ok(ev.event.duration >= 0, 'event.duration must be non-negative integer');
        assert.ok(ev.skyra.duration_ms >= 0, 'skyra.duration_ms must be non-negative number');
        // Ensure duration_ms * 1,000,000 is approximately equal to event.duration
        const converted = Math.round(ev.skyra.duration_ms * 1_000_000);
        assert.ok(Math.abs(converted - ev.event.duration) <= 1000);
    });
    it('42. Route sanitization strips query parameters, tokens, and fragments', () => {
        assert.equal(sanitizeRoute('/dashboard?token=secret123&user=john'), '/dashboard');
        assert.equal(sanitizeRoute('/profile#section-2'), '/profile');
        assert.equal(sanitizeRoute('orders/list?page=1'), '/orders/list');
        assert.equal(sanitizeRoute(''), '/');
    });
    it('43. Navigation tracking records privacy-safe route events', async () => {
        const memory = new MemoryTransport();
        const logger = createSkyraBrowserLogger({
            projectId: 'nav-test',
            serviceName: 'web',
            environment: 'production',
            transport: memory,
        });
        logger.trackNavigation({
            route: '/settings/billing?secret_tab=payments',
            previousRoute: '/dashboard',
        });
        await logger.flush();
        const ev = memory.getEvents()[0];
        assert.equal(ev.event.action, 'navigation.completed');
        assert.equal(ev.http?.route, '/settings/billing');
        assert.equal(ev.url?.path, '/settings/billing');
        assert.ok(!ev.message.includes('secret_tab'));
    });
});
//# sourceMappingURL=correlation-timing.test.js.map