import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as http from 'node:http';
import { HttpTransport, buildBrowserLogEvent, resolveBrowserConfig } from '@skyra/logger-browser';
import { startTestGateway, type TestGatewayInstance } from './test-gateway.helper.js';

describe('Browser SDK HTTP & Same-Origin Backend Proxy End-to-End Integration', () => {
  let gateway: TestGatewayInstance;
  let proxyServer: http.Server;
  let proxyUrl: string;
  let proxyRequestsReceived = 0;

  before(async () => {
    gateway = await startTestGateway();

    // Start reference same-origin application backend proxy
    proxyServer = http.createServer(async (req, res) => {
      proxyRequestsReceived++;

      // Verify browser does NOT send permanent gateway token
      const clientAuth = req.headers.authorization;
      if (clientAuth?.includes('sk_live_e2e_valid_token_001')) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'Security violation: machine token leaked in browser request!' }));
        return;
      }

      // Read browser request body
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });

      req.on('end', async () => {
        try {
          // Proxy forwards to central gateway attaching the secure server-side Bearer token
          const gwResponse = await fetch(gateway.gatewayUrl, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: `Bearer ${gateway.validToken}`,
            },
            body,
          });

          const gwText = await gwResponse.text();
          res.writeHead(gwResponse.status, {
            'content-type': 'application/json',
            'access-control-allow-origin': '*',
          });
          res.end(gwText);
        } catch (err) {
          res.writeHead(502, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
    });

    await new Promise<void>((resolve) => {
      proxyServer.listen(0, '127.0.0.1', () => {
        const addr = proxyServer.address() as { port: number };
        proxyUrl = `http://127.0.0.1:${addr.port}/api/logs`;
        resolve();
      });
    });
  });

  after(async () => {
    if (proxyServer) {
      await new Promise<void>((resolve) => proxyServer.close(() => resolve()));
    }
    if (gateway) {
      await gateway.close();
    }
  });

  it('Browser SDK real E2E: transmits batch through same-origin proxy without leaking token, verifies synthetic batch ID and replay deduplication', async () => {
    const config = resolveBrowserConfig({
      projectId: 'skyra-tech',
      environment: 'production',
      serviceName: 'customer-portal',
      transport: {
        type: 'http',
        url: proxyUrl,
      },
    });

    const event1 = buildBrowserLogEvent(config, { level: 'info', message: 'User viewed dashboard', metadata: { tab: 'overview' } });
    const event2 = buildBrowserLogEvent(config, { level: 'warn', message: 'Slow API response observed', metadata: { endpoint: '/api/v1/orders' } });

    const transport = new HttpTransport({
      type: 'http',
      url: proxyUrl,
    });

    // 1. Send first transmission
    const result1 = await transport.send([event1, event2]);
    assert.equal(result1.success, true);
    assert.equal(result1.deliveredCount, 2);

    // Verify WAL received 1 batch
    const walFrames = gateway.walService.getAllCommittedFrames();
    assert.equal(walFrames.length, 1);
    assert.equal(walFrames[0]!.eventCount, 2);
    const firstBatchId = walFrames[0]!.batchId;
    assert.ok(firstBatchId, 'Gateway must assign synthetic batch ID to legacy browser batch');

    // 2. Retry identical events (simulating browser network retry or page reload re-send)
    // Note: HttpTransport formats a new sent_at timestamp, but event payload remains identical
    const result2 = await transport.send([event1, event2]);
    assert.equal(result2.success, true);
    assert.equal(result2.deliveredCount, 2);

    // Verify central WAL still has ONLY 1 batch (deduplication recognized the identical events)
    const walFramesAfter = gateway.walService.getAllCommittedFrames();
    assert.equal(walFramesAfter.length, 1, 'Replay must NOT create duplicate WAL frame');
    assert.equal(walFramesAfter[0]!.batchId, firstBatchId);

    // 3. Verify PostgreSQL receipt metadata
    const receipt = await gateway.receiptRepo.findReceipt(
      gateway.tenantId,
      'skyra-tech',
      firstBatchId
    );
    assert.ok(receipt);
    assert.equal(receipt.acceptedCount, 2);

    assert.equal(proxyRequestsReceived, 2, 'Proxy must have received both HTTP submissions');
  });
});
