import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { FileParquetCatalogService } from '../../../src/modules/parquet-cache/infrastructure/catalog/file-parquet-catalog.service.js';
import { ParquetPathSafetyService } from '../../../src/modules/parquet-cache/infrastructure/filesystem/parquet-path-safety.service.js';
import { QueryConfigService } from '../../../src/config/query-config.service.js';
import { QueryAuditService } from '../../../src/modules/audit/query-audit.service.js';
import { DerivedParquetMetadata } from '../../../src/modules/parquet-cache/domain/parquet-segment.model.js';
import { TrustedArchiveSegmentDescriptor } from '../../../src/modules/archive-discovery/domain/archive-segment-descriptor.model.js';

describe('FileParquetCatalogService Unit Tests (LOGHUB-QUERY-006)', () => {
  let tempRoot: string;
  let pathSafety: ParquetPathSafetyService;
  let catalog: FileParquetCatalogService;

  before(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-catalog-test-'));
    const config = new QueryConfigService({
      nodeEnv: 'test',
      parquetCacheRoot: tempRoot,
      parquetCacheEnabled: true,
      parquetVerifyChecksums: true,
    });
    pathSafety = new ParquetPathSafetyService(config);
    const audit = new QueryAuditService(config);
    catalog = new FileParquetCatalogService(pathSafety, config, audit);
  });

  after(() => {
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  const tenantId = 'tenant-test';
  const projectId = 'proj-analytics';
  const environment = 'production';
  const serviceName = 'gateway';
  const date = '2026-10-25';
  const segmentFilename = 'segment-0001.jsonl';
  const sourceChecksum = crypto.createHash('sha256').update('dummy-jsonl-content').digest('hex');

  const makeCanonicalDescriptor = (checksum: string = sourceChecksum): TrustedArchiveSegmentDescriptor => ({
    id: 'seg-1',
    tenantId,
    projectId,
    environment,
    serviceName,
    date,
    segmentFilename,
    resolvedPath: `/archives/${tenantId}/${projectId}/${environment}/${date}/${segmentFilename}`,
    recordCount: 10,
    byteSize: 1024,
    sha256Checksum: checksum,
    firstEventTimestamp: '2026-10-25T10:00:00Z',
    lastEventTimestamp: '2026-10-25T11:00:00Z',
    finalizedAt: '2026-10-25T11:05:00Z',
    verifiedAt: '2026-10-25T11:05:00Z',
    integrityStatus: 'VERIFIED',
  });

  it('FPC-1: should return null when parquet file and metadata do not exist', async () => {
    const desc = await catalog.getParquetDescriptor(makeCanonicalDescriptor());
    assert.equal(desc, null);
  });

  it('FPC-2: should record materialization and retrieve valid parquet descriptor', async () => {
    const paths = pathSafety.resolveSegmentPaths(tenantId, projectId, environment, date, segmentFilename);

    // Create dummy parquet file
    fs.mkdirSync(paths.directory, { recursive: true });
    const dummyContent = 'dummy-parquet-data-content-12345';
    fs.writeFileSync(paths.parquetPath, dummyContent);
    const parquetSize = fs.statSync(paths.parquetPath).size;
    const parquetChecksum = crypto.createHash('sha256').update(dummyContent).digest('hex');

    const meta: DerivedParquetMetadata = {
      manifestVersion: '1.0.0',
      materializationVersion: '1.0.0',
      generationId: 'gen-001',
      sourceSegmentId: segmentFilename,
      sourceTenantId: tenantId,
      sourceProjectId: projectId,
      sourceEnvironment: environment,
      sourcePartitionDate: date,
      sourceChecksum,
      sourceByteSize: 1024,
      sourceRecordCount: 10,
      parquetFilename: 'segment-0001.parquet',
      parquetSha256Checksum: parquetChecksum,
      parquetByteSize: parquetSize,
      parquetRecordCount: 10,
      state: 'READY',
      locatorScheme: 'record_offset_composite',
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };

    await catalog.recordMaterialization(meta);

    const desc = await catalog.getParquetDescriptor(makeCanonicalDescriptor());

    assert.ok(desc !== null);
    assert.equal(desc.canonicalSegmentId, segmentFilename);
    assert.equal(desc.tenantId, tenantId);
    assert.equal(desc.projectId, projectId);
    assert.equal(desc.resolvedPath, paths.parquetPath);
    assert.equal(desc.integrityStatus, 'VERIFIED');
    assert.equal(desc.recordCount, 10);
    assert.equal(desc.byteSize, parquetSize);
  });

  it('FPC-3: should return null and detect checksum drift when sourceChecksum changed', async () => {
    const alteredSourceChecksum = crypto.createHash('sha256').update('altered-jsonl-content').digest('hex');
    const desc = await catalog.getParquetDescriptor(makeCanonicalDescriptor(alteredSourceChecksum));
    assert.equal(desc, null, 'Checksum drift must cause descriptor lookup to return null');
  });

  it('FPC-4: should invalidate parquet file and mark metadata as INVALID, and purge removes all', async () => {
    const paths = pathSafety.resolveSegmentPaths(tenantId, projectId, environment, date, segmentFilename);

    await catalog.invalidateSegment(tenantId, projectId, environment, date, segmentFilename, 'MANUAL_TEST');

    assert.equal(fs.existsSync(paths.parquetPath), false);
    assert.equal(fs.existsSync(paths.metadataPath), true);

    const desc = await catalog.getParquetDescriptor(makeCanonicalDescriptor());
    assert.equal(desc, null, 'Invalidated segment must return null descriptor');

    await catalog.purgeSegment(tenantId, projectId, environment, date, segmentFilename);
    assert.equal(fs.existsSync(paths.metadataPath), false);
  });
});
