import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as http from 'node:http';
import { ShipperHttpClient } from '../../src/http-client.js';
import type { PendingBatch } from '../../src/types.js';

describe('ShipperHttpClient Unit Tests', () => {
  let server: http.Server;
  let serverPort: number;
  let serverHandler: (req: http.IncomingMessage, res: http.ServerResponse) => void;

  before(async () => {
    server = http.createServer((req, res) => {
      serverHandler(req, res);
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number };
        serverPort = addr.port;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('submits batch with Bearer token and parses valid durable receipt', async () => {
    let capturedAuth = '';
    serverHandler = (req, res) => {
      capturedAuth = req.headers.authorization ?? '';
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'durably_accepted',
          batch_id: 'test-batch-001',
          accepted_count: 1,
          duplicate: false,
          receipt: {
            receipt_id: 'rcpt_12345',
            journal_segment: 'active.wal',
            journal_offset: 2048,
            committed_at: '2026-10-24T00:00:00.000Z',
            content_digest: 'sha256:abc',
          },
        })
      );
    };

    const client = new ShipperHttpClient({
      gatewayUrl: `http://127.0.0.1:${serverPort}/ingest/v1/logs`,
      authToken: 'sk_live_secret_token_123',
    });

    const pending: PendingBatch = {
      batchId: 'test-batch-001',
      startOffset: 0,
      endOffset: 100,
      contentDigestSha256: 'abc',
      eventCount: 1,
      createdAt: new Date().toISOString(),
      events: [] as any,
    };

    const result = await client.submitBatch(pending);
    assert.equal(capturedAuth, 'Bearer sk_live_secret_token_123');
    assert.equal(result.success, true);
    assert.equal(result.receipt?.receipt_id, 'rcpt_12345');
  });

  it('rejects receipt if batch_id does not match submitted batch', async () => {
    serverHandler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'durably_accepted',
          batch_id: 'DIFFERENT-BATCH-ID',
          accepted_count: 1,
          duplicate: false,
          receipt: {
            receipt_id: 'rcpt_12345',
            journal_segment: 'active.wal',
            journal_offset: 2048,
            committed_at: '2026-10-24T00:00:00.000Z',
            content_digest: 'sha256:abc',
          },
        })
      );
    };

    const client = new ShipperHttpClient({
      gatewayUrl: `http://127.0.0.1:${serverPort}/ingest/v1/logs`,
      authToken: 'sk_live_secret_token_123',
    });

    const pending: PendingBatch = {
      batchId: 'test-batch-001',
      startOffset: 0,
      endOffset: 100,
      contentDigestSha256: 'abc',
      eventCount: 1,
      createdAt: new Date().toISOString(),
      events: [] as any,
    };

    const result = await client.submitBatch(pending);
    assert.equal(result.success, false);
    assert.match(result.error ?? '', /Receipt batch_id mismatch/);
  });

  it('redacts auth token in error messages', async () => {
    serverHandler = (_req, res) => {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid machine token: sk_live_secret_token_123',
          },
        })
      );
    };

    const client = new ShipperHttpClient({
      gatewayUrl: `http://127.0.0.1:${serverPort}/ingest/v1/logs`,
      authToken: 'sk_live_secret_token_123',
    });

    const pending: PendingBatch = {
      batchId: 'test-batch-001',
      startOffset: 0,
      endOffset: 100,
      contentDigestSha256: 'abc',
      eventCount: 1,
      createdAt: new Date().toISOString(),
      events: [] as any,
    };

    const result = await client.submitBatch(pending);
    assert.equal(result.success, false);
    assert.equal(result.retryable, false);
    assert.ok(!result.error?.includes('sk_live_secret_token_123'));
    assert.ok(result.error?.includes('[REDACTED_TOKEN]'));
  });
});
