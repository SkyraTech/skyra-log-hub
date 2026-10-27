import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { DuckDbInstanceManager } from '../../src/modules/query-execution/infrastructure/duckdb/duckdb-instance.manager.js';
import { QueryConfigService } from '../../src/config/query-config.service.js';
import { QueryAuditService } from '../../src/modules/audit/query-audit.service.js';
import { ParquetPathSafetyService } from '../../src/modules/parquet-cache/infrastructure/filesystem/parquet-path-safety.service.js';
import { FileParquetCatalogService } from '../../src/modules/parquet-cache/infrastructure/catalog/file-parquet-catalog.service.js';
import { DuckDbParquetConverter } from '../../src/modules/parquet-cache/infrastructure/duckdb/duckdb-parquet-converter.js';
import { MaterializeSegmentUseCase } from '../../src/modules/parquet-cache/application/materialize-segment.use-case.js';
import { VerifyParquetUseCase } from '../../src/modules/parquet-cache/application/verify-parquet.use-case.js';
import { RecoverMaterializationUseCase } from '../../src/modules/parquet-cache/application/recover-materialization.use-case.js';
import type { TrustedArchiveSegmentDescriptor } from '../../src/modules/archive-discovery/domain/archive-segment-descriptor.model.js';

describe('Parquet Materialization & Lifecycle Integration Tests (LOGHUB-QUERY-006)', () => {
  let tempArchiveRoot: string;
  let tempCacheRoot: string;
  let instanceManager: DuckDbInstanceManager;
  let pathSafety: ParquetPathSafetyService;
  let materializeUseCase: MaterializeSegmentUseCase;
  let verifyUseCase: VerifyParquetUseCase;
  let recoverUseCase: RecoverMaterializationUseCase;

  const tenantId = 'tenant-acme-prod';
  const projectId = 'proj-core-api';
  const environment = 'production';
  const serviceName = 'gateway';
  const date = '2026-10-25';
  const segmentFilename = 'segment-0001.jsonl';

  let jsonlFilePath: string;
  let jsonlChecksum: string;
  let jsonlSizeBytes: number;

  before(async () => {
    tempArchiveRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-mat-archive-'));
    tempCacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-mat-cache-'));

    const config = new QueryConfigService({
      nodeEnv: 'test',
      archiveRoot: tempArchiveRoot,
      parquetCacheRoot: tempCacheRoot,
      parquetCacheEnabled: true,
      parquetMaterializationEnabled: true,
    });

    instanceManager = new DuckDbInstanceManager(config);
    await instanceManager.initialize();

    const audit = new QueryAuditService(config);
    pathSafety = new ParquetPathSafetyService(config);
    const catalog = new FileParquetCatalogService(pathSafety, config, audit);
    const converter = new DuckDbParquetConverter(instanceManager, pathSafety);
    materializeUseCase = new MaterializeSegmentUseCase(catalog, converter, audit, config);
    verifyUseCase = new VerifyParquetUseCase(catalog, instanceManager);
    recoverUseCase = new RecoverMaterializationUseCase(pathSafety);

    // Create sample canonical JSONL segment
    const segmentDir = path.join(tempArchiveRoot, tenantId, projectId, environment, date);
    fs.mkdirSync(segmentDir, { recursive: true });
    jsonlFilePath = path.join(segmentDir, segmentFilename);

    const events = [
      {
        '@timestamp': '2026-10-25T12:00:00.000Z',
        ecs: { version: '8.11.0' },
        event: { id: 'evt-001', action: 'login' },
        log: { level: 'info' },
        message: 'User logged in successfully: alice',
        service: { name: 'auth-svc', environment },
        skyra: { tenant_id: tenantId, project_id: projectId },
      },
      {
        '@timestamp': '2026-10-25T12:05:00.000Z',
        ecs: { version: '8.11.0' },
        event: { id: 'evt-002', action: 'checkout' },
        log: { level: 'warn' },
        message: 'High latency during payment processing: 1250ms',
        service: { name: 'checkout-svc', environment },
        skyra: { tenant_id: tenantId, project_id: projectId },
        http: { response: { status_code: 200 } },
      },
      {
        '@timestamp': '2026-10-25T12:10:00.000Z',
        ecs: { version: '8.11.0' },
        event: { id: 'evt-003', action: 'notification' },
        log: { level: 'info' },
        message: 'Unicode test: 支付网关成功 🚀 Привет мир! 日本語テスト',
        service: { name: 'notify-svc', environment },
        skyra: { tenant_id: tenantId, project_id: projectId },
      },
    ];

    const content = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
    fs.writeFileSync(jsonlFilePath, content, 'utf8');
    jsonlSizeBytes = Buffer.byteLength(content, 'utf8');
    jsonlChecksum = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  });

  after(async () => {
    if (instanceManager) {
      await instanceManager.shutdown();
    }
    try {
      fs.rmSync(tempArchiveRoot, { recursive: true, force: true });
      fs.rmSync(tempCacheRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  const makeCanonicalDescriptor = (): TrustedArchiveSegmentDescriptor => ({
    id: 'seg-mat-1',
    tenantId,
    projectId,
    environment,
    serviceName,
    date,
    segmentFilename,
    resolvedPath: jsonlFilePath,
    recordCount: 3,
    byteSize: jsonlSizeBytes,
    sha256Checksum: jsonlChecksum,
    firstEventTimestamp: '2026-10-25T12:00:00Z',
    lastEventTimestamp: '2026-10-25T12:10:00Z',
    finalizedAt: '2026-10-25T12:15:00Z',
    verifiedAt: '2026-10-25T12:15:00Z',
    integrityStatus: 'VERIFIED',
  });

  it('MAT-1: should successfully materialize canonical JSONL segment into derived Parquet', async () => {
    const canonical = makeCanonicalDescriptor();
    const result = await materializeUseCase.execute(canonical);

    assert.equal(result.success, true);
    assert.equal(result.canonicalSegmentId, segmentFilename);
    assert.ok(result.parquetDescriptor);
    assert.equal(fs.existsSync(result.parquetDescriptor.resolvedPath), true);
    assert.equal(result.recordCount, 3);
    assert.ok(result.outputBytes > 0);
  });

  it('MAT-2: should verify materialized Parquet content, schema and row count using DuckDB', async () => {
    const canonical = makeCanonicalDescriptor();
    const verification = await verifyUseCase.execute(canonical);

    assert.equal(verification.isValid, true);
    assert.ok(verification.descriptor);
    assert.equal(verification.descriptor.recordCount, 3);
  });

  it('MAT-3: should verify stable record locator and unicode preservation in Parquet', async () => {
    const conn = await instanceManager.createConnection();
    try {
      const paths = pathSafety.resolveSegmentPaths(tenantId, projectId, environment, date, segmentFilename);

      const reader = await conn.run(
        `SELECT "@timestamp", "event.id", "segment_id", "record_offset", "json" 
         FROM read_parquet('${paths.parquetPath.replace(/\\/g, '/')}')
         ORDER BY "record_offset" ASC`,
      );

      const rows = await reader.getRows();
      assert.equal(rows.length, 3);

      // Verify row 0
      assert.equal(rows[0]?.[1], 'evt-001');
      assert.equal(rows[0]?.[2], segmentFilename);
      assert.equal(Number(rows[0]?.[3]), 0);

      // Verify row 2 (unicode)
      assert.equal(rows[2]?.[1], 'evt-003');
      assert.equal(Number(rows[2]?.[3]), 2);
      const jsonParsed = JSON.parse(rows[2]?.[4] as string);
      assert.match(jsonParsed.message, /支付网关成功 🚀 Привет мир! 日本語テスト/);
    } finally {
      conn.closeSync();
    }
  });

  it('MAT-4: should be idempotent: second materialization call returns existing result without re-converting', async () => {
    const canonical = makeCanonicalDescriptor();
    const result = await materializeUseCase.execute(canonical);

    assert.equal(result.success, true);
    assert.equal(result.jobId, 'reused');
    assert.equal(result.recordCount, 3);
  });

  it('MAT-5: should clean up stale staging files during crash recovery', () => {
    const paths = pathSafety.resolveSegmentPaths(tenantId, projectId, environment, date, segmentFilename);
    fs.mkdirSync(paths.stagingDirectory, { recursive: true });
    fs.writeFileSync(paths.stagingParquetPath, 'stale-data');

    // Set mtime to 20 minutes ago
    const twentyMinsAgo = new Date(Date.now() - 20 * 60 * 1000);
    fs.utimesSync(paths.stagingParquetPath, twentyMinsAgo, twentyMinsAgo);

    assert.equal(fs.existsSync(paths.stagingParquetPath), true);

    const recovery = recoverUseCase.execute(600_000); // 10 minutes max age
    assert.ok(recovery.stagedFilesRemoved >= 1);
    assert.equal(fs.existsSync(paths.stagingParquetPath), false);
  });
});
