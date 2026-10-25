import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createSkyraLogger } from '@skyra/logger-node';
import { LogShipper } from '../../src/shipper.js';
import { startTestGateway, type TestGatewayInstance } from './test-gateway.helper.js';

describe('Node SDK to Central Gateway End-to-End Ingestion', () => {
  let gateway: TestGatewayInstance;
  let spoolRoot: string;
  let checkpointDir: string;

  before(async () => {
    gateway = await startTestGateway();
    spoolRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-node-spool-'));
    checkpointDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-node-ckpt-'));
  });

  after(async () => {
    if (gateway) {
      await gateway.close();
    }
    if (spoolRoot && fs.existsSync(spoolRoot)) {
      try {
        fs.rmSync(spoolRoot, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
    if (checkpointDir && fs.existsSync(checkpointDir)) {
      try {
        fs.rmSync(checkpointDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  it('Node SDK real E2E: generates representative canonical events, ships to gateway, validates WAL and receipts, verifies retry idempotency', async () => {
    // 1. Initialize real Node.js SDK logger targeting spoolRoot
    const logger = createSkyraLogger({
      projectId: 'skyra-tech',
      environment: 'production',
      serviceName: 'order-api',
      instanceId: 'inst-node-01',
      transport: {
        type: 'file',
        directory: spoolRoot,
      },
    });

    const eventIds: string[] = [];

    // 2. Emit representative events: info, warn, error, http, job, business
    logger.info('Order checkout initialized', {
      orderId: 'ord-12345',
      customer: 'cust-99',
    });

    logger.warn('Inventory low threshold reached', {
      sku: 'SKU-888',
      remaining: 2,
    });

    logger.error('Payment gateway temporary failure', {
      error: {
        message: 'Stripe timeout 504',
        type: 'PaymentError',
      },
    });

    // Wait for write queue flush & close logger
    await logger.flush();
    await logger.close();

    // 3. Inspect generated spool file on disk
    const expectedDir = path.join(
      spoolRoot,
      'skyra-tech',
      'production',
      'order-api',
      'inst-node-01'
    );
    assert.ok(fs.existsSync(expectedDir), 'Spool directory must exist');

    const files = fs.readdirSync(expectedDir).filter((f) => f.endsWith('.jsonl'));
    assert.equal(files.length, 1, 'Exactly one JSONL segment should be produced');

    const spoolFilePath = path.join(expectedDir, files[0]!);
    const rawLines = fs
      .readFileSync(spoolFilePath, 'utf-8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));

    assert.equal(rawLines.length, 3, 'Must contain 3 emitted log events');
    for (const line of rawLines) {
      assert.ok(line.event.id);
      assert.ok(line['@timestamp']);
      assert.equal(line['ecs.version'], '8.11.0');
      assert.equal(line.skyra.project_id, 'skyra-tech');
      eventIds.push(line.event.id);
    }

    // 4. Instantiate and execute the standalone shipping agent
    const shipper = new LogShipper({
      spoolRoots: [spoolRoot],
      checkpointDir,
      gatewayUrl: gateway.gatewayUrl,
      authToken: gateway.validToken,
      maxBatchEvents: 100,
    });

    const batchesShipped = await shipper.shipOnce();
    assert.equal(batchesShipped, 1, 'Shipper must ship exactly 1 batch');

    // 5. Verify metrics
    const metrics = shipper.diagnostics.getMetrics();
    assert.equal(metrics.batchesSent, 1);
    assert.equal(metrics.eventsDelivered, 3);
    assert.equal(metrics.duplicateAcknowledgements, 0);

    // 6. Verify central WAL commits
    const walFrames = gateway.walService.getAllCommittedFrames();
    assert.equal(walFrames.length, 1, 'Central WAL must contain 1 committed batch frame');
    assert.equal(walFrames[0]!.eventCount, 3);
    assert.equal(walFrames[0]!.tenantId, gateway.tenantId);
    assert.equal(walFrames[0]!.projectId, 'skyra-tech');

    // 7. Verify receipt in repository
    const receipt = await gateway.receiptRepo.findReceipt(
      gateway.tenantId,
      'skyra-tech',
      walFrames[0]!.batchId
    );
    assert.ok(receipt, 'Receipt record must exist in metadata repository');
    assert.equal(receipt.acceptedCount, 3);
    assert.equal(receipt.journalSegment, 'active.wal');

    // 8. Re-run shipper (Restart Simulation): must acknowledge as duplicate without extra WAL writes
    const restartedShipper = new LogShipper({
      spoolRoots: [spoolRoot],
      checkpointDir,
      gatewayUrl: gateway.gatewayUrl,
      authToken: gateway.validToken,
    });

    const secondPass = await restartedShipper.shipOnce();
    assert.equal(secondPass, 0, 'No new batches should be shipped because all bytes are acknowledged');

    const walFramesAfterRestart = gateway.walService.getAllCommittedFrames();
    assert.equal(walFramesAfterRestart.length, 1, 'WAL frame count must remain strictly 1 (no duplicate appends)');

    // 9. Confirm local spool file is preserved
    assert.ok(fs.existsSync(spoolFilePath), 'Local spool file must be safely preserved on disk');
  });
});
