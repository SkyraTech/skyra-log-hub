import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { HybridSourcePlannerService } from '../../../src/modules/parquet-cache/application/hybrid-source-planner.service.js';
import { IParquetCatalogPort } from '../../../src/modules/parquet-cache/domain/parquet-catalog.port.js';
import { QueryConfigService } from '../../../src/config/query-config.service.js';
import { QueryAuditService } from '../../../src/modules/audit/query-audit.service.js';
import { TrustedArchiveSegmentDescriptor } from '../../../src/modules/archive-discovery/domain/archive-segment-descriptor.model.js';
import { TrustedParquetSegmentDescriptor } from '../../../src/modules/parquet-cache/domain/parquet-segment.model.js';

describe('HybridSourcePlannerService Unit Tests (LOGHUB-QUERY-006)', () => {
  const mockAudit = {
    recordSecurityEvent: () => {},
    logOperationalEvent: () => {},
  } as unknown as QueryAuditService;

  const makeJsonlDescriptor = (id: string, checksum: string = 'chk-1'): TrustedArchiveSegmentDescriptor => ({
    id,
    tenantId: 't1',
    projectId: 'p1',
    environment: 'production',
    serviceName: 'backend',
    date: '2026-10-25',
    segmentFilename: `${id}.jsonl`,
    resolvedPath: `/archives/t1/p1/production/2026-10-25/${id}.jsonl`,
    byteSize: 2048,
    recordCount: 50,
    sha256Checksum: checksum,
    firstEventTimestamp: '2026-10-25T10:00:00Z',
    lastEventTimestamp: '2026-10-25T11:00:00Z',
    finalizedAt: '2026-10-25T11:05:00Z',
    verifiedAt: '2026-10-25T11:05:00Z',
    integrityStatus: 'VERIFIED',
  });

  const makeParquetDescriptor = (id: string): TrustedParquetSegmentDescriptor => ({
    id: `pq-${id}`,
    canonicalSegmentId: `${id}.jsonl`,
    tenantId: 't1',
    projectId: 'p1',
    environment: 'production',
    date: '2026-10-25',
    segmentFilename: `${id}.jsonl`,
    parquetFilename: `${id}.parquet`,
    resolvedPath: `/cache/t1/p1/production/2026-10-25/${id}.parquet`,
    byteSize: 1024,
    recordCount: 50,
    sha256Checksum: `parquet-chk-${id}`,
    sourceChecksum: 'chk-1',
    materializationVersion: '1.0.0',
    integrityStatus: 'VERIFIED',
    verifiedAt: new Date().toISOString(),
  });

  it('HSP-1: should route all to JSONL when parquet cache is disabled in config', async () => {
    const config = new QueryConfigService({ nodeEnv: 'test', parquetCacheEnabled: false });
    const catalog: IParquetCatalogPort = {
      getParquetDescriptor: async () => null,
      recordMaterialization: async () => {},
      invalidateSegment: async () => {},
      purgeSegment: async () => {},
    };
    const planner = new HybridSourcePlannerService(catalog, config, mockAudit);

    const s1 = makeJsonlDescriptor('seg-1');
    const s2 = makeJsonlDescriptor('seg-2');

    const plan = await planner.planSources([s1, s2], 't1', ['p1'], 'test-query-1');

    assert.equal(plan.parquetCount, 0);
    assert.equal(plan.jsonlCount, 2);
    assert.equal(plan.canonicalDescriptors.length, 2);
    assert.equal(plan.parquetDescriptors.length, 0);
  });

  it('HSP-2: should plan hybrid sources accurately with zero duplicates and zero omissions', async () => {
    const config = new QueryConfigService({ nodeEnv: 'test', parquetCacheEnabled: true });
    const s1 = makeJsonlDescriptor('seg-1');
    const s2 = makeJsonlDescriptor('seg-2');
    const s3 = makeJsonlDescriptor('seg-3');

    // seg-1 and seg-3 have parquet, seg-2 does not
    const catalog: IParquetCatalogPort = {
      getParquetDescriptor: async (desc) => {
        if (desc.id === 'seg-1') return makeParquetDescriptor('seg-1');
        if (desc.id === 'seg-3') return makeParquetDescriptor('seg-3');
        return null;
      },
      recordMaterialization: async () => {},
      invalidateSegment: async () => {},
      purgeSegment: async () => {},
    };

    const planner = new HybridSourcePlannerService(catalog, config, mockAudit);
    const plan = await planner.planSources([s1, s2, s3], 't1', ['p1'], 'test-query-2');

    assert.equal(plan.parquetCount, 2);
    assert.equal(plan.jsonlCount, 1);
    assert.equal(plan.totalSegments, 3);
    assert.equal(plan.parquetDescriptors.length, 2);
    assert.equal(plan.canonicalDescriptors.length, 1);

    // Verify exactly 1 source per canonical segment
    assert.equal(plan.parquetDescriptors[0]!.canonicalSegmentId, 'seg-1.jsonl');
    assert.equal(plan.parquetDescriptors[1]!.canonicalSegmentId, 'seg-3.jsonl');
    assert.equal(plan.canonicalDescriptors[0]!.id, 'seg-2');
  });

  it('HSP-3: should route all to Parquet when all segments are verified in cache', async () => {
    const config = new QueryConfigService({ nodeEnv: 'test', parquetCacheEnabled: true });
    const s1 = makeJsonlDescriptor('seg-1');
    const s2 = makeJsonlDescriptor('seg-2');

    const catalog: IParquetCatalogPort = {
      getParquetDescriptor: async (desc) => makeParquetDescriptor(desc.id),
      recordMaterialization: async () => {},
      invalidateSegment: async () => {},
      purgeSegment: async () => {},
    };

    const planner = new HybridSourcePlannerService(catalog, config, mockAudit);
    const plan = await planner.planSources([s1, s2], 't1', ['p1'], 'test-query-3');

    assert.equal(plan.parquetCount, 2);
    assert.equal(plan.jsonlCount, 0);
    assert.equal(plan.totalSegments, 2);
    assert.equal(plan.parquetDescriptors.length, 2);
    assert.equal(plan.canonicalDescriptors.length, 0);
  });
});
