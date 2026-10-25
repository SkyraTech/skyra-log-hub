import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import { validateLogEvent } from '@skyra/logger-core';

const PORT = 3589;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const LOG_DIR = path.join(os.tmpdir(), `skyra-next-int-${Date.now()}`);

function findJsonlFilesRecursively(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findJsonlFilesRecursively(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      results.push(fullPath);
    }
  }
  return results;
}

describe('Real Next.js App Router Integration (Production Build)', () => {
  let serverProcess: ChildProcess | undefined;

  before(async () => {
    fs.mkdirSync(LOG_DIR, { recursive: true });

    const fixtureDir = path.resolve(process.cwd(), 'tests/fixtures/app-router-fixture');
    const nextEntry = fileURLToPath(import.meta.resolve('next'));
    const nextBin = path.resolve(path.dirname(nextEntry), '../bin/next');
    const cmd = process.execPath;
    const args = [nextBin, 'start', '-p', String(PORT), '-H', '127.0.0.1'];

    let serverLogs = '';
    serverProcess = spawn(cmd, args, {
      cwd: fixtureDir,
      shell: false,
      env: {
        ...process.env,
        PORT: String(PORT),
        SKYRA_TEST_LOG_DIR: LOG_DIR,
        NODE_ENV: 'production'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    serverProcess.stdout?.on('data', (d) => { serverLogs += d.toString(); });
    serverProcess.stderr?.on('data', (d) => { serverLogs += d.toString(); });

    // Wait for server to become healthy
    let ready = false;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`${BASE_URL}/api/status`);
        if (res.status === 200) {
          ready = true;
          break;
        }
      } catch {
        // Retry
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    if (!ready) {
      throw new Error(`Next.js integration server failed to start within 20 seconds. Logs:\n${serverLogs}`);
    }
  });

  after(async () => {
    if (serverProcess && serverProcess.pid) {
      if (process.platform === 'win32') {
        try {
          spawn('taskkill', ['/pid', String(serverProcess.pid), '/T', '/F']);
        } catch {
          // ignore
        }
      } else {
        serverProcess.kill('SIGTERM');
      }
      // Give server time to terminate and flush
      await new Promise((r) => setTimeout(r, 1000));
    }
    // Clean up temporary log dir
    try {
      fs.rmSync(LOG_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('1. GET /api/status - returns 200, handles traceparent and stamps x-request-id', async () => {
    const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';
    const spanId = '00f067aa0ba902b7';
    const traceparent = `00-${traceId}-${spanId}-01`;
    const requestId = 'req-status-001';

    const res = await fetch(`${BASE_URL}/api/status`, {
      method: 'GET',
      headers: {
        traceparent,
        'x-request-id': requestId,
        'authorization': 'Bearer secret_super_token',
        'cookie': 'session=secret_cookie_val'
      }
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.status, 'ok');
    assert.equal(res.headers.get('x-request-id'), requestId);
  });

  it('2. POST /api/orders - executes Server Action and returns 201', async () => {
    const res = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        orderId: 'ord-int-777',
        amount: 350
      })
    });

    assert.equal(res.status, 201);
    const body = (await res.json()) as any;
    assert.equal(body.success, true);
    assert.equal(body.orderId, 'ord-int-777');
    assert.equal(body.status, 'confirmed');
  });

  it('3. GET /api/users/[userId] - dynamic route captures parameterized template', async () => {
    const res = await fetch(`${BASE_URL}/api/users/usr-8899`, {
      method: 'GET'
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.userId, 'usr-8899');
  });

  it('4. GET /api/stream - streaming response completes without buffering or truncation', async () => {
    const res = await fetch(`${BASE_URL}/api/stream`, {
      method: 'GET'
    });

    assert.equal(res.status, 200);
    const text = await res.text();
    assert.equal(text, 'chunk1\nchunk2\n');
  });

  it('5. GET /api/error - captures unhandled error, returns 500, rethrows correctly', async () => {
    const res = await fetch(`${BASE_URL}/api/error`, {
      method: 'GET'
    });

    assert.equal(res.status, 500);
  });

  it('6. Concurrent HTTP requests maintain strict correlation context isolation', async () => {
    const count = 10;
    const promises = Array.from({ length: count }, async (_, i) => {
      const traceId = `000000000000000000000000000000${i.toString().padStart(2, '0')}`;
      const spanId = `00000000000000${i.toString().padStart(2, '0')}`;
      const traceparent = `00-${traceId}-${spanId}-01`;
      const requestId = `req-concurrent-${i}`;

      const res = await fetch(`${BASE_URL}/api/status`, {
        headers: {
          traceparent,
          'x-request-id': requestId
        }
      });

      assert.equal(res.status, 200);
      assert.equal(res.headers.get('x-request-id'), requestId);
      return { index: i, traceId, requestId };
    });

    const results = await Promise.all(promises);
    assert.equal(results.length, count);
  });

  it('7. Inspect generated JSONL file logs and validate complete canonical schema compliance', async () => {
    // Wait briefly for file transport write buffers to flush
    await new Promise((r) => setTimeout(r, 1500));

    const files = findJsonlFilesRecursively(LOG_DIR);
    assert.ok(files.length > 0, `At least one .jsonl log file should exist in ${LOG_DIR}`);

    const logLines: any[] = [];
    for (const f of files) {
      const content = fs.readFileSync(f, 'utf-8');
      const lines = content.split('\n').filter((l) => l.trim().length > 0);
      for (const line of lines) {
        logLines.push(JSON.parse(line));
      }
    }

    assert.ok(logLines.length > 0, `Expected log events in ${LOG_DIR}, found ${logLines.length}`);

    // Validate EVERY event against canonical schema
    for (let i = 0; i < logLines.length; i++) {
      const event = logLines[i];
      const validation = validateLogEvent(event);
      if (!validation.valid) {
        throw new Error(
          `Event ${i} failed schema validation: ${JSON.stringify(validation.errors)}\nEvent: ${JSON.stringify(event)}`
        );
      }
    }

    // Verify security: no raw secret headers or sensitive data in normal logs
    for (const event of logLines) {
      const serialized = JSON.stringify(event);
      assert.ok(!serialized.includes('secret_super_token'), 'Authorization bearer token must never appear in logs');
      assert.ok(!serialized.includes('secret_cookie_val'), 'Cookie session secrets must never appear in logs');
    }

    // Verify dynamic route template logging
    const dynamicEvents = logLines.filter(
      (e) => e.http?.route === '/api/users/[userId]' || e.url?.path === '/api/users/[userId]'
    );
    assert.ok(dynamicEvents.length > 0, 'Expected at least one event with route /api/users/[userId]');

    // Verify server action execution event
    const actionEvents = logLines.filter((e) => e.event?.action === 'action.completed');
    assert.ok(actionEvents.length > 0, 'Expected action.completed event from Server Action');

    // Verify error event from GET /api/error
    const errorEvents = logLines.filter((e) => e.http?.response?.status_code === 500);
    assert.ok(errorEvents.length > 0, 'Expected error HTTP event with status 500');
  });
});
