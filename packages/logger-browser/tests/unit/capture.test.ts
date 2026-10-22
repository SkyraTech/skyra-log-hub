/**
 * @skyra/logger-browser - Global Error and Rejection Capture Tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSkyraBrowserLogger,
  MemoryTransport,
  installGlobalErrorCapture,
  installUnhandledRejectionCapture,
} from '../../src/index.js';

describe('Logger Browser: Error & Rejection Capture', () => {
  it('30. Global error handler captures and logs browser errors', async () => {
    const memory = new MemoryTransport();
    const logger = createSkyraBrowserLogger({
      projectId: 'error-capture-test',
      serviceName: 'web',
      environment: 'production',
      transport: memory,
    });

    const cleanup = installGlobalErrorCapture(logger);

    // Mock an ErrorEvent dispatch if running in Node
    const fakeErrorEvent = {
      message: 'Uncaught TypeError: Cannot read property of undefined',
      filename: 'https://app.skyra.com/main.js',
      lineno: 42,
      colno: 12,
      error: new TypeError('Cannot read property of undefined'),
    } as unknown as ErrorEvent;

    // Simulate event handler invocation
    logger.error(`Uncaught error: ${fakeErrorEvent.message}`, {
      error: fakeErrorEvent.error,
      code_location: {
        filename: fakeErrorEvent.filename,
        lineno: fakeErrorEvent.lineno,
        colno: fakeErrorEvent.colno,
      },
      action: 'browser.error.uncaught',
    });

    await logger.flush();
    const events = memory.getEvents();
    assert.equal(events.length, 1);
    const ev = events[0]!;
    assert.equal(ev.log.level, 'error');
    assert.equal(ev.event.action, 'browser.error.uncaught');
    assert.equal(ev.error?.type, 'TypeError');
    assert.equal(ev.error?.message, 'Cannot read property of undefined');

    cleanup();
  });

  it('31. Unhandled rejection capture extracts promise rejection values', async () => {
    const memory = new MemoryTransport();
    const logger = createSkyraBrowserLogger({
      projectId: 'rejection-capture-test',
      serviceName: 'web',
      environment: 'production',
      transport: memory,
    });

    const cleanup = installUnhandledRejectionCapture(logger);

    const rejectionErr = new Error('Async promise rejected');
    logger.error(`Unhandled Promise rejection: ${rejectionErr.message}`, {
      error: rejectionErr,
      action: 'browser.promise.unhandled_rejection',
    });

    await logger.flush();
    const events = memory.getEvents();
    assert.equal(events.length, 1);
    const ev = events[0]!;
    assert.equal(ev.event.action, 'browser.promise.unhandled_rejection');
    assert.equal(ev.error?.type, 'Error');
    assert.equal(ev.error?.message, 'Async promise rejected');

    cleanup();
  });

  it('32. Listener cleanup on logger disposal', async () => {
    const memory = new MemoryTransport();
    const logger = createSkyraBrowserLogger({
      projectId: 'cleanup-test',
      serviceName: 'web',
      environment: 'production',
      transport: memory,
      capture: {
        globalErrors: true,
        unhandledRejections: true,
      },
    });

    await logger.dispose();
    assert.equal(logger.getStatus().isDisposed, true);
  });

  it('33. Cross-origin script error mask handling', async () => {
    const memory = new MemoryTransport();
    const logger = createSkyraBrowserLogger({
      projectId: 'cors-script-test',
      serviceName: 'web',
      environment: 'production',
      transport: memory,
    });

    // Simulate cross-origin error event
    logger.error('Cross-origin script error', {
      error: {
        type: 'ScriptError',
        message: 'Cross-origin script error (stack and message masked by browser CORS policy).',
      },
      action: 'browser.error.uncaught',
    });

    await logger.flush();
    const ev = memory.getEvents()[0]!;
    assert.equal(ev.error?.type, 'ScriptError');
    assert.match(ev.error?.message ?? '', /Cross-origin script error/);
  });

  it('34. Redacts sensitive credentials inside exception messages and stack traces', async () => {
    const memory = new MemoryTransport();
    const logger = createSkyraBrowserLogger({
      projectId: 'redact-err-test',
      serviceName: 'web',
      environment: 'production',
      transport: memory,
    });

    const sensitiveErr = new Error('Failed to connect with password=SuperSecretPassword123');
    sensitiveErr.stack = 'Error: Failed to connect with password=SuperSecretPassword123\n    at login (app.js:10)';

    logger.error('Auth failure', { error: sensitiveErr });
    await logger.flush();

    const ev = memory.getEvents()[0]!;
    assert.equal(ev.error?.message, 'Failed to connect with password=[REDACTED]');
    assert.ok(ev.error?.stack_trace?.includes('password=[REDACTED]'));
    assert.ok(!ev.error?.stack_trace?.includes('SuperSecretPassword123'));
  });
});
