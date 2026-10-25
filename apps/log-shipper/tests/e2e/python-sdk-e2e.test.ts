import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as cp from 'node:child_process';
import { LogShipper } from '../../src/shipper.js';
import { startTestGateway, type TestGatewayInstance } from './test-gateway.helper.js';

describe('Python SDK to Central Gateway End-to-End Ingestion', () => {
  let gateway: TestGatewayInstance;
  let spoolRoot: string;
  let checkpointDir: string;

  before(async () => {
    gateway = await startTestGateway();
    spoolRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-py-spool-'));
    checkpointDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-py-ckpt-'));
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

  it('Python SDK real E2E: executes real skyra-logger to spool JSONL, ships to gateway, validates WAL and receipt, verifies restart idempotency', async () => {
    // 1. Run Python script invoking real create_skyra_logger to emit canonical events
    const monorepoRoot = path.resolve(process.cwd(), '../..');
    const pythonPkgDir = path.join(monorepoRoot, 'packages', 'logger-python');

    const pyScript = `
import sys
from skyra_logger import create_skyra_logger

spool_dir = sys.argv[1]

logger = create_skyra_logger(
    project_id="skyra-tech",
    environment="production",
    service_name="billing-worker",
    instance_id="inst-py-01",
    transport={"type": "file", "directory": spool_dir}
)

logger.info("Billing cycle initiated", {"billingCycleId": "bc-2026-10", "accounts": 150})
logger.warn("Slow invoice generation detected", {"latency_ms": 1250})
try:
    raise ValueError("Failed to charge credit card on file")
except Exception as err:
    logger.exception("Credit card transaction failed", exc=err)

logger.flush()
logger.close()
`;

    cp.execFileSync('python', ['-c', pyScript, spoolRoot], {
      env: {
        ...process.env,
        PYTHONPATH: pythonPkgDir,
      },
      stdio: 'pipe',
    });

    // 2. Inspect generated spool file on disk
    const expectedDir = path.join(
      spoolRoot,
      'skyra-tech',
      'production',
      'billing-worker',
      'inst-py-01'
    );
    assert.ok(fs.existsSync(expectedDir), 'Python spool directory must exist');

    const files = fs.readdirSync(expectedDir).filter((f) => f.endsWith('.jsonl'));
    assert.equal(files.length, 1, 'Exactly one Python JSONL segment produced');

    const spoolFilePath = path.join(expectedDir, files[0]!);
    const rawLines = fs
      .readFileSync(spoolFilePath, 'utf-8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));

    assert.equal(rawLines.length, 3, 'Must contain 3 emitted log events from Python');
    for (const line of rawLines) {
      assert.ok(line.event.id);
      assert.ok(line['@timestamp']);
      assert.equal(line['ecs.version'], '8.11.0');
      assert.equal(line.skyra.project_id, 'skyra-tech');
    }

    // 3. Instantiate and run shipping agent
    const shipper = new LogShipper({
      spoolRoots: [spoolRoot],
      checkpointDir,
      gatewayUrl: gateway.gatewayUrl,
      authToken: gateway.validToken,
      maxBatchEvents: 100,
    });

    const shippedCount = await shipper.shipOnce();
    assert.equal(shippedCount, 1, 'Must ship exactly 1 batch');

    // 4. Verify central WAL commit
    const walFrames = gateway.walService.getAllCommittedFrames();
    assert.equal(walFrames.length, 1, 'Central WAL must contain 1 committed batch frame');
    assert.equal(walFrames[0]!.eventCount, 3);
    assert.equal(walFrames[0]!.projectId, 'skyra-tech');

    // 5. Verify metadata receipt
    const receipt = await gateway.receiptRepo.findReceipt(
      gateway.tenantId,
      'skyra-tech',
      walFrames[0]!.batchId
    );
    assert.ok(receipt, 'Receipt record must exist in PostgreSQL metadata repository');
    assert.equal(receipt.acceptedCount, 3);

    // 6. Restart shipper pass -> verify zero duplicate commits
    const restarted = new LogShipper({
      spoolRoots: [spoolRoot],
      checkpointDir,
      gatewayUrl: gateway.gatewayUrl,
      authToken: gateway.validToken,
    });

    const secondShipped = await restarted.shipOnce();
    assert.equal(secondShipped, 0, 'Zero new batches should be sent');

    const walFramesAfter = gateway.walService.getAllCommittedFrames();
    assert.equal(walFramesAfter.length, 1, 'WAL frame count must remain strictly 1');

    // 7. Verify source spool file is preserved
    assert.ok(fs.existsSync(spoolFilePath), 'Python source spool file must remain intact');
  });
});
