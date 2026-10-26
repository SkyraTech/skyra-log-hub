import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { PathSafetyService } from '../../src/modules/archive-discovery/infrastructure/path-safety.service.js';
import { QueryConfigService } from '../../src/config/query-config.service.js';
import { PathTraversalException } from '../../src/common/errors/query.errors.js';

describe('PathSafetyService Unit Tests (LOGHUB-QUERY-002)', () => {
  let tempRoot: string;
  let service: PathSafetyService;

  before(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-path-safety-'));
    const config = new QueryConfigService({
      nodeEnv: 'test',
      archiveRoot: tempRoot,
    });
    service = new PathSafetyService(config);
  });

  after(() => {
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('should validate and resolve legitimate segment path within archive root', () => {
    const resolved = service.resolveAndValidateSegmentPath(
      'tenant-alpha',
      'project-x',
      'production',
      'billing-service',
      '2026-10-25',
      'segment_0001.jsonl',
    );
    const expected = path.resolve(
      tempRoot,
      'tenant-alpha',
      'project-x',
      'production',
      'billing-service',
      '2026-10-25',
      'segment_0001.jsonl',
    );
    assert.equal(resolved, expected);
  });

  it('should reject dot-dot path traversal attempts in components', () => {
    assert.throws(
      () =>
        service.resolveAndValidateSegmentPath(
          '..',
          'project-x',
          'production',
          'billing-service',
          '2026-10-25',
          'segment_0001.jsonl',
        ),
      (err: unknown) => {
        assert.ok(err instanceof PathTraversalException);
        return true;
      },
    );
  });

  it('should reject invalid characters in path components', () => {
    assert.throws(
      () =>
        service.resolveAndValidateSegmentPath(
          'tenant/escape',
          'project-x',
          'production',
          'billing-service',
          '2026-10-25',
          'segment_0001.jsonl',
        ),
      (err: unknown) => {
        assert.ok(err instanceof PathTraversalException);
        return true;
      },
    );
  });

  it('should reject invalid date partitions', () => {
    assert.throws(
      () =>
        service.resolveAndValidateSegmentPath(
          'tenant-1',
          'project-1',
          'production',
          'service-1',
          '2026-13-99',
          'segment_0001.jsonl',
        ),
      (err: unknown) => {
        assert.ok(err instanceof PathTraversalException);
        return true;
      },
    );
  });

  it('should reject invalid file extensions', () => {
    assert.throws(
      () =>
        service.resolveAndValidateSegmentPath(
          'tenant-1',
          'project-1',
          'production',
          'service-1',
          '2026-10-25',
          'malicious.sh',
        ),
      (err: unknown) => {
        assert.ok(err instanceof PathTraversalException);
        return true;
      },
    );
  });
});
