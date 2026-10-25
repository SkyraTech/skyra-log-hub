#!/usr/bin/env node
/**
 * @skyra/log-shipper - CLI Entry Point
 */

import * as path from 'node:path';
import { LogShipper } from './shipper.js';
import type { ShipperConfig } from './types.js';

function parseArgs(): ShipperConfig {
  const spoolRoot = process.env['SPOOL_ROOT'] ?? path.resolve(process.cwd(), 'data', 'spool');
  const checkpointDir = process.env['CHECKPOINT_DIR'] ?? path.resolve(process.cwd(), 'data', 'checkpoints');
  const gatewayUrl = process.env['GATEWAY_URL'] ?? 'http://127.0.0.1:3000/ingest/v1/logs';
  const authToken = process.env['AUTH_TOKEN'] ?? '';

  if (!authToken) {
    console.error('[SkyraLogShipper:ERROR] AUTH_TOKEN environment variable is required.');
    process.exit(1);
  }

  return {
    spoolRoots: [spoolRoot],
    checkpointDir,
    gatewayUrl,
    authToken,
    maxBatchEvents: Number.parseInt(process.env['MAX_BATCH_EVENTS'] ?? '100', 10),
    maxBatchBytes: Number.parseInt(process.env['MAX_BATCH_BYTES'] ?? '2097152', 10),
    scanIntervalMs: Number.parseInt(process.env['SCAN_INTERVAL_MS'] ?? '5000', 10),
    quarantineDir: process.env['QUARANTINE_DIR'],
  };
}

const config = parseArgs();
const shipper = new LogShipper(config);

console.log('[SkyraLogShipper:STARTUP] Starting Skyra Log Shipper daemon...');
shipper.start();

const shutdown = () => {
  console.log('[SkyraLogShipper:SHUTDOWN] Stopping Log Shipper...');
  shipper.stop();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
