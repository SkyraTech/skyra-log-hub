import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ParquetPathSafetyService } from '../../../src/modules/parquet-cache/infrastructure/filesystem/parquet-path-safety.service.js';
import { QueryConfigService } from '../../../src/config/query-config.service.js';
import { PathTraversalException } from '../../../src/common/errors/query.errors.js';

describe('ParquetPathSafetyService Unit Tests (LOGHUB-QUERY-006)', () => {
  let tempRoot: string;
  let service: ParquetPathSafetyService;

  before(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-parquet-safety-'));
    const config = new QueryConfigService({
      nodeEnv: 'test',
      parquetCacheRoot: tempRoot,
    });
    service = new ParquetPathSafetyService(config);
  });

  after(() => {
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('PPS-1: should resolve and validate valid parquet paths within cache root', () => {
    const paths = service.resolveSegmentPaths(
      'tenant-acme',
      'proj-core',
      'prod',
      '2026-10-25',
      'segment-0001.jsonl',
    );
    const expectedParquet = path.resolve(
      tempRoot,
      'tenant-acme',
      'proj-core',
      'prod',
      '2026-10-25',
      'segment-0001.parquet',
    );
    const expectedMetadata = path.resolve(
      tempRoot,
      'tenant-acme',
      'proj-core',
      'prod',
      '2026-10-25',
      'segment-0001.meta.json',
    );
    assert.equal(paths.parquetPath, expectedParquet);
    assert.equal(paths.metadataPath, expectedMetadata);
  });

  it('PPS-2: should reject path traversal in component (..)', () => {
    assert.throws(
      () =>
        service.resolveSegmentPaths(
          '..',
          'proj-core',
          'prod',
          '2026-10-25',
          'segment-0001.jsonl',
        ),
      PathTraversalException,
    );
  });

  it('PPS-3: should reject path traversal with backslashes or slashes in component', () => {
    assert.throws(
      () =>
        service.resolveSegmentPaths(
          'tenant-acme',
          'proj/sub',
          'prod',
          '2026-10-25',
          'segment-0001.jsonl',
        ),
      PathTraversalException,
    );
  });

  it('PPS-4: should reject invalid characters in component', () => {
    assert.throws(
      () =>
        service.resolveSegmentPaths(
          'tenant-acme$',
          'proj-core',
          'prod',
          '2026-10-25',
          'segment-0001.jsonl',
        ),
      PathTraversalException,
    );
  });

  it('PPS-5: should reject invalid date partition format', () => {
    assert.throws(
      () =>
        service.resolveSegmentPaths(
          'tenant-acme',
          'proj-core',
          'prod',
          '25-10-2026',
          'segment-0001.jsonl',
        ),
      PathTraversalException,
    );
  });

  it('PPS-6: should validate containment of existing parquet file', () => {
    const paths = service.resolveSegmentPaths(
      'tenant-acme',
      'proj-core',
      'prod',
      '2026-10-25',
      'segment-0001.jsonl',
    );
    fs.mkdirSync(paths.directory, { recursive: true });
    fs.writeFileSync(paths.parquetPath, 'test-data');

    const validated = service.validateParquetFileContainment(paths.parquetPath);
    assert.equal(validated, path.resolve(paths.parquetPath));
  });

  it('PPS-7: should reject containment validation for path outside root', () => {
    const outsidePath = path.resolve(tempRoot, '..', 'evil.parquet');
    assert.throws(
      () => service.validateParquetFileContainment(outsidePath),
      PathTraversalException,
    );
  });
});
