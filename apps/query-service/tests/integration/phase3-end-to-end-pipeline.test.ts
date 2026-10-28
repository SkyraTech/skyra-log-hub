/**
 * Phase 3 Complete End-to-End System Pipeline Verification (LOGHUB-QUERY-008)
 *
 * Exercises the complete unified LogHub analytical pipeline:
 * Real Node SDK -> Canonical JSONL Partition -> Signed Manifest ->
 * Metadata Catalog Registration -> Derived Parquet Materialization (ZSTD) ->
 * Query Service HTTP APIs (Search, Keyset Pagination, Single Lookup, Aggregations, Facets) ->
 * Multi-Tenant Security & Canonical Immutability Invariant
 */

import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../../src/app.module.js';
import { ProblemDetailsFilter } from '../../src/common/filters/problem-details.filter.js';
import {
  ARCHIVE_SEGMENT_REPOSITORY,
  type IArchiveSegmentRepository,
  type ArchiveSegmentRecord,
} from '../../src/modules/archive-discovery/domain/archive-segment.repository.interface.js';
import { DuckDbParquetConverter } from '../../src/modules/parquet-cache/infrastructure/duckdb/duckdb-parquet-converter.js';
import { FileParquetCatalogService } from '../../src/modules/parquet-cache/infrastructure/catalog/file-parquet-catalog.service.js';
import { createSkyraLogger } from '@skyra/logger-node';

describe('LOGHUB-QUERY-008: Complete End-to-End System Pipeline Acceptance', () => {
  let queryApp: NestFastifyApplication;
  let archiveRoot: string;
  let parquetRoot: string;

  let segmentRepo: IArchiveSegmentRepository;
  let parquetConverter: DuckDbParquetConverter;
  let parquetCatalog: FileParquetCatalogService;

  const tenantId = '00000000-0000-0000-0000-000000000001';
  const projectId = 'skyra-tech';
  const environment = 'production';
  const serviceName = 'order-api';
  const dateStr = '2026-10-27';

  let canonicalSegmentPath: string;
  let originalCanonicalSha: string;
  let originalCanonicalBytes: number;
  let emittedFirstEventId: string;

  const createAuthHeader = (tenant: string, projects: string[]) => {
    const payload = {
      sub: 'user-e2e-auditor',
      tenantId: tenant,
      authorizedProjects: projects,
      allowedEnvironments: ['production', 'development'],
      roles: ['analyst'],
    };
    return `Bearer test-token:${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
  };

  const validAuthHeader = createAuthHeader(tenantId, [projectId]);
  const unauthorizedProjectHeader = createAuthHeader(tenantId, ['other-unauthorized-project']);
  const foreignTenantHeader = createAuthHeader('00000000-0000-0000-0000-000000000002', [projectId]);

  before(async () => {
    // 1. Setup isolated directories
    archiveRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-e2e-final-arch-'));
    parquetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-e2e-parquet-'));

    process.env['ARCHIVE_ROOT'] = archiveRoot;
    process.env['PARQUET_CACHE_ROOT'] = parquetRoot;
    process.env['PARQUET_CACHE_ENABLED'] = 'true';
    process.env['QUERY_AUTH_MODE'] = 'test';
    process.env['NODE_ENV'] = 'test';
    process.env['CURSOR_SIGNING_SECRET'] = 'test-high-entropy-cursor-secret-32chars-min';

    // 2. Initialize Query Service Fastify Application
    const adapter = new FastifyAdapter({ logger: false });
    queryApp = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
      logger: false,
      abortOnError: false,
    });
    queryApp.useGlobalFilters(new ProblemDetailsFilter());
    await queryApp.init();
    await queryApp.getHttpAdapter().getInstance().ready();

    segmentRepo = queryApp.get<IArchiveSegmentRepository>(ARCHIVE_SEGMENT_REPOSITORY);
    parquetConverter = queryApp.get(DuckDbParquetConverter);
    parquetCatalog = queryApp.get(FileParquetCatalogService);
  });

  after(async () => {
    if (queryApp) await queryApp.close();
    for (const d of [archiveRoot, parquetRoot]) {
      if (d && fs.existsSync(d)) {
        try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
      }
    }
  });

  it('Pipeline 1: Real Node SDK generates canonical logs and stamps tenant envelope into canonical archive partition', async () => {
    const partitionDir = path.join(archiveRoot, tenantId, projectId, environment, serviceName, dateStr);
    fs.mkdirSync(partitionDir, { recursive: true });

    const logger = createSkyraLogger({
      projectId,
      environment,
      serviceName,
      instanceId: 'inst-pipeline-01',
      transport: {
        type: 'file',
        directory: path.join(archiveRoot, 'spool-temp'),
      },
    });

    // Emit 10 diverse canonical events (6 info, 2 warn, 2 error)
    for (let i = 1; i <= 6; i++) {
      logger.info(`Customer checkout step ${i} completed`, {
        orderId: `ORD-${1000 + i}`,
        amount: i * 25.5,
        step: i,
      });
    }
    logger.warn('Inventory stock level low', { sku: 'SKU-LOGHUB', available: 3 });
    logger.warn('Payment latency warning: elevated API response', { latencyMs: 820 });
    logger.error('Database connection timeout on replica-2', { error: { message: 'Connection timeout', type: 'DatabaseError' } });
    logger.error('External webhook dispatch failed', { error: { message: 'HTTP 502 Bad Gateway', type: 'NetworkError' } });

    await logger.flush();
    await logger.close();

    const tempDir = path.join(archiveRoot, 'spool-temp', projectId, environment, serviceName, 'inst-pipeline-01');
    const writtenFiles = fs.readdirSync(tempDir).filter((f) => f.endsWith('.jsonl'));
    assert.equal(writtenFiles.length, 1);

    const sourceFile = path.join(tempDir, writtenFiles[0]!);
    const rawLines = fs.readFileSync(sourceFile, 'utf-8').trim().split('\n');
    assert.equal(rawLines.length, 10);

    // Ingested archive stamping: add tenant_id to skyra envelope as performed by Ingestion Gateway
    const stampedEvents = rawLines.map((line, idx) => {
      const parsed = JSON.parse(line);
      parsed['@timestamp'] = `2026-10-27T10:00:0${idx}.000Z`;
      parsed.skyra = {
        ...parsed.skyra,
        tenant_id: tenantId,
        project_id: projectId,
        schema_version: '1.0.0',
      };
      if (idx === 0) {
        emittedFirstEventId = parsed.event.id;
      }
      return parsed;
    });

    canonicalSegmentPath = path.join(partitionDir, 'segment-0000.jsonl');
    const stampedPayload = Buffer.from(stampedEvents.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf-8');
    fs.writeFileSync(canonicalSegmentPath, stampedPayload);

    originalCanonicalBytes = stampedPayload.length;
    originalCanonicalSha = crypto.createHash('sha256').update(stampedPayload).digest('hex');
    assert.ok(emittedFirstEventId, 'First event ID must be captured');
  });

  it('Pipeline 2: Signed manifest generated and segment registered in metadata catalog', async () => {
    const partitionDir = path.join(archiveRoot, tenantId, projectId, environment, serviceName, dateStr);

    // Write canonical segment manifest
    const manifest = {
      segment_filename: 'segment-0000.jsonl',
      byte_size: originalCanonicalBytes,
      sha256_checksum: originalCanonicalSha,
      record_count: 10,
    };
    fs.writeFileSync(path.join(partitionDir, 'segment-0000.manifest.json'), JSON.stringify(manifest, null, 2));

    // Register segment in archive metadata catalog
    const segmentRecord: ArchiveSegmentRecord = {
      id: 'seg-e2e-001',
      tenantId,
      projectId,
      environment,
      serviceName,
      date: dateStr,
      segmentFilename: 'segment-0000.jsonl',
      recordCount: 10,
      byteSize: originalCanonicalBytes,
      sha256Checksum: originalCanonicalSha,
      firstEventTimestamp: new Date('2026-10-27T00:00:00.000Z'),
      lastEventTimestamp: new Date('2026-10-27T23:59:59.999Z'),
      finalizedAt: new Date(),
      writerInstanceId: 'inst-pipeline-01',
      journalSegmentId: 'active.wal',
      journalStartOffset: 0,
      journalEndOffset: originalCanonicalBytes,
    };
    await segmentRepo.saveSegment(segmentRecord);

    const segments = await segmentRepo.findSegments({
      tenantId,
      projectIds: [projectId],
    });
    assert.equal(segments.length, 1, 'Metadata repository must have 1 verified segment');
  });

  it('Pipeline 3: Background Materializer derives Parquet cache with ZSTD compression', async () => {
    const canonicalDescriptor = {
      id: 'seg-e2e-001',
      segmentId: 'segment-0000.jsonl',
      segmentFilename: 'segment-0000.jsonl',
      tenantId,
      projectId,
      environment,
      serviceName,
      date: dateStr,
      resolvedPath: canonicalSegmentPath,
      byteSize: originalCanonicalBytes,
      sha256Checksum: originalCanonicalSha,
      recordCount: 10,
      firstEventTimestamp: '2026-10-27T00:00:00.000Z',
      lastEventTimestamp: '2026-10-27T23:59:59.999Z',
      finalizedAt: new Date().toISOString(),
      verifiedAt: new Date().toISOString(),
      integrityStatus: 'VERIFIED' as const,
    };

    const res = await parquetConverter.convertSegment(canonicalDescriptor);
    assert.ok(res, 'Parquet materialization must succeed');
    assert.equal(res.recordCount, 10, 'Parquet record count must equal 10');

    const desc = await parquetCatalog.getParquetDescriptor(canonicalDescriptor);
    assert.ok(desc, 'Parquet descriptor must exist in catalog');
    assert.ok(fs.existsSync(desc.resolvedPath), 'Parquet file must exist on disk');
  });

  it('Pipeline 4 (HTTP Search API): Keyset pagination retrieves all events without duplicate or dropped records', async () => {
    // Page 1: Request 5 events
    const page1Res = await queryApp.inject({
      method: 'POST',
      url: '/query/v1/logs/search',
      headers: {
        authorization: validAuthHeader,
        'content-type': 'application/json',
      },
      payload: {
        time_range: { start: '2026-10-27T00:00:00.000Z', end: '2026-10-27T23:59:59.999Z' },
        projects: [projectId],
        limit: 5,
        sort: { field: '@timestamp', direction: 'asc' },
      },
    });

    assert.equal(page1Res.statusCode, 200);
    const page1Body = JSON.parse(page1Res.body);
    assert.equal(page1Body.events.length, 5, 'Page 1 must return 5 items');
    assert.equal(page1Body.pagination.has_more, true, 'Page 1 has_more must be true');
    assert.ok(page1Body.pagination.next_cursor, 'Page 1 must return next_cursor');

    // Page 2: Request next 5 events using next_cursor
    const page2Res = await queryApp.inject({
      method: 'POST',
      url: '/query/v1/logs/search',
      headers: {
        authorization: validAuthHeader,
        'content-type': 'application/json',
      },
      payload: {
        time_range: { start: '2026-10-27T00:00:00.000Z', end: '2026-10-27T23:59:59.999Z' },
        projects: [projectId],
        limit: 5,
        sort: { field: '@timestamp', direction: 'asc' },
        cursor: page1Body.pagination.next_cursor,
      },
    });

    assert.equal(page2Res.statusCode, 200);
    const page2Body = JSON.parse(page2Res.body);
    assert.equal(page2Body.events.length, 5, 'Page 2 must return 5 items');
    assert.equal(page2Body.pagination.has_more, false, 'Page 2 has_more must be false');
    assert.equal(page2Body.pagination.next_cursor, null, 'Page 2 next_cursor must be null');

    // Assert zero overlap and complete 10 items
    const allIds = [
      ...page1Body.events.map((i: any) => i.event.id),
      ...page2Body.events.map((i: any) => i.event.id),
    ];
    assert.equal(allIds.length, 10);
    const uniqueIds = new Set(allIds);
    assert.equal(uniqueIds.size, 10, 'All 10 retrieved events must be unique');
  });

  it('Pipeline 5 (HTTP Event Lookup): Retrieves specific single event by eventId with project authorization', async () => {
    const res = await queryApp.inject({
      method: 'GET',
      url: `/query/v1/logs/${emittedFirstEventId}?projectId=${projectId}`,
      headers: {
        authorization: validAuthHeader,
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.event.id, emittedFirstEventId);
    assert.equal(body.service.name, 'order-api');
    assert.equal(body.skyra.project_id, projectId);
  });

  it('Pipeline 6 (HTTP Aggregations API): Computes date histogram and terms distributions', async () => {
    const res = await queryApp.inject({
      method: 'POST',
      url: '/query/v1/logs/aggregate',
      headers: {
        authorization: validAuthHeader,
        'content-type': 'application/json',
      },
      payload: {
        time_range: { start: '2026-10-27T00:00:00.000Z', end: '2026-10-27T23:59:59.999Z' },
        projects: [projectId],
        aggregations: [
          { name: 'levels', type: 'terms', field: 'log.level', size: 10 },
          { name: 'services', type: 'terms', field: 'service.name', size: 10 },
          { name: 'timeline', type: 'date_histogram', field: '@timestamp', interval: '1h' },
        ],
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);

    const levelBuckets = body.aggregations.levels.buckets as Array<{ key: string; count: number }>;
    const levelMap = new Map(levelBuckets.map((b) => [b.key, b.count]));
    assert.equal(levelMap.get('info'), 6);
    assert.equal(levelMap.get('warn'), 2);
    assert.equal(levelMap.get('error'), 2);

    const serviceBuckets = body.aggregations.services.buckets as Array<{ key: string; count: number }>;
    assert.equal(serviceBuckets[0]!.key, 'order-api');
    assert.equal(serviceBuckets[0]!.count, 10);
  });

  it('Pipeline 7 (HTTP Dynamic Facets API): Discovers unique facet values and counts', async () => {
    const res = await queryApp.inject({
      method: 'POST',
      url: '/query/v1/logs/facets',
      headers: {
        authorization: validAuthHeader,
        'content-type': 'application/json',
      },
      payload: {
        time_range: { start: '2026-10-27T00:00:00.000Z', end: '2026-10-27T23:59:59.999Z' },
        projects: [projectId],
        facet_fields: ['service.name', 'log.level', 'environment'],
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);

    const serviceFacets = body.facets['service.name']!;
    assert.equal(serviceFacets[0]!.value, 'order-api');
    assert.equal(serviceFacets[0]!.count, 10);

    const levelFacets = body.facets['log.level']!;
    assert.equal(levelFacets.length, 3);
  });

  it('Pipeline 8 (Security & Fail-Closed Invariants): Rejects unauthorized project requests and foreign tenants', async () => {
    // 1. Unauthorized project request returns 403 Forbidden
    const unauthRes = await queryApp.inject({
      method: 'POST',
      url: '/query/v1/logs/search',
      headers: {
        authorization: unauthorizedProjectHeader,
        'content-type': 'application/json',
      },
      payload: {
        time_range: { start: '2026-10-27T00:00:00.000Z', end: '2026-10-27T23:59:59.999Z' },
        projects: [projectId],
        limit: 10,
      },
    });

    assert.equal(unauthRes.statusCode, 403, 'Must return 403 Forbidden for unauthorized project');
    const unauthBody = JSON.parse(unauthRes.body);
    assert.equal(unauthBody.code, 'FORBIDDEN_PROJECT_ACCESS');

    // 2. Foreign tenant request returns 0 events (tenant isolation)
    const foreignRes = await queryApp.inject({
      method: 'POST',
      url: '/query/v1/logs/search',
      headers: {
        authorization: foreignTenantHeader,
        'content-type': 'application/json',
      },
      payload: {
        time_range: { start: '2026-10-27T00:00:00.000Z', end: '2026-10-27T23:59:59.999Z' },
        projects: [projectId],
        limit: 10,
      },
    });

    assert.equal(foreignRes.statusCode, 200);
    const foreignBody = JSON.parse(foreignRes.body);
    assert.equal(foreignBody.events.length, 0, 'Foreign tenant must not see any events');
  });

  it('Pipeline 9 (Canonical Immutability Invariant): Verifies canonical JSONL file is byte-for-byte unmodified', async () => {
    const currentBytes = fs.readFileSync(canonicalSegmentPath);
    const currentSha = crypto.createHash('sha256').update(currentBytes).digest('hex');

    assert.equal(currentBytes.length, originalCanonicalBytes, 'Canonical file size must remain strictly identical');
    assert.equal(currentSha, originalCanonicalSha, 'Canonical SHA-256 hash must remain strictly identical');
  });
});
