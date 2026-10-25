import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createSkyraLogger } from '@skyra/logger-node';
import { SkyraLoggerService } from '@skyra/logger-nestjs';
import { LogShipper } from '../../src/shipper.js';
import { startTestGateway, type TestGatewayInstance } from './test-gateway.helper.js';

describe('Framework Logging Adapters Compatibility & Delivery Verification', () => {
  let gateway: TestGatewayInstance;
  let spoolRoot: string;
  let checkpointDir: string;

  before(async () => {
    gateway = await startTestGateway();
    spoolRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-framework-spool-'));
    checkpointDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-framework-ckpt-'));
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

  it('NestJS Framework Adapter: emits structured logs via SkyraLoggerService to spool, shipped to gateway, validated in WAL', async () => {
    const underlying = createSkyraLogger({
      projectId: 'skyra-tech',
      environment: 'production',
      serviceName: 'nestjs-graphql-api',
      instanceId: 'inst-nest-01',
      transport: {
        type: 'file',
        directory: spoolRoot,
      },
    });

    const nestLogger = new SkyraLoggerService(underlying);

    nestLogger.log('NestJS bootstrap completed', 'Bootstrap');
    nestLogger.warn('Slow resolver execution detected', 'GraphQLResolver');
    nestLogger.error('Unhandled database constraint error', 'PrismaFilter');

    await underlying.flush();
    await underlying.close();

    const shipper = new LogShipper({
      spoolRoots: [spoolRoot],
      checkpointDir,
      gatewayUrl: gateway.gatewayUrl,
      authToken: gateway.validToken,
    });

    const shippedCount = await shipper.shipOnce();
    assert.equal(shippedCount, 1, 'Must ship NestJS batch');

    const walFrames = gateway.walService.getAllCommittedFrames();
    assert.equal(walFrames.length, 1);
    assert.equal(walFrames[0]!.eventCount, 3);
    assert.equal(walFrames[0]!.projectId, 'skyra-tech');
  });
});
