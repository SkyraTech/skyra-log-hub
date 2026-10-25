import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ArchiveWriterService } from '../../src/storage/archive/archive-writer.service.js';
import { InMemoryArchiveSegmentRepository } from '../../src/metadata/repositories/in-memory-archive-segment.repository.js';

describe('Central JSONL Archive Writer & Manifest Tests', () => {
  let tempArchiveRoot: string;
  let repo: InMemoryArchiveSegmentRepository;
  let writer: ArchiveWriterService;

  beforeEach(() => {
    tempArchiveRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skyra-archive-test-'));
    repo = new InMemoryArchiveSegmentRepository();
    writer = new ArchiveWriterService(repo, {
      archiveRoot: tempArchiveRoot,
      maxSegmentSizeBytes: 500, // Small threshold for rollover test
    });
  });

  afterEach(async () => {
    await writer.closeAll();
    if (fs.existsSync(tempArchiveRoot)) {
      fs.rmSync(tempArchiveRoot, { recursive: true, force: true });
    }
  });

  it('should enforce strict path validation and reject path traversal attempts', () => {
    // Valid path
    const validDir = writer.resolvePartitionDir('tenant-1', 'project-a', 'production', 'api-service', '2026-10-24');
    assert.ok(validDir.startsWith(path.resolve(tempArchiveRoot)));

    // Path traversal with ..
    assert.throws(() => {
      writer.resolvePartitionDir('../tenant-1', 'project-a', 'production', 'api-service', '2026-10-24');
    }, /Security Violation/);

    // Invalid character
    assert.throws(() => {
      writer.resolvePartitionDir('tenant$1', 'project-a', 'production', 'api-service', '2026-10-24');
    }, /Security Violation/);

    // Invalid environment
    assert.throws(() => {
      writer.resolvePartitionDir('tenant-1', 'project-a', 'invalid_env', 'api-service', '2026-10-24');
    }, /Security Violation/);
  });

  it('should append events to JSONL and trigger rollover and manifest generation', async () => {
    const meta = {
      tenantId: 'tenant-acme',
      projectId: 'project-auth',
      environment: 'production' as const,
      serviceName: 'user-service',
      date: '2026-10-24',
      journalSegment: 'active.wal',
      journalStartOffset: 0,
      journalEndOffset: 1024,
    };

    const events = [
      {
        '@timestamp': '2026-10-24T12:00:00.000Z',
        message: 'User login success',
        skyra: { project_id: 'project-auth' },
        service: { name: 'user-service', environment: 'production' },
      },
      {
        '@timestamp': '2026-10-24T12:01:00.000Z',
        message: 'User token refreshed',
        skyra: { project_id: 'project-auth' },
        service: { name: 'user-service', environment: 'production' },
      },
    ];

    await writer.appendEvents(meta, events);

    const partitionDir = writer.resolvePartitionDir(
      meta.tenantId,
      meta.projectId,
      meta.environment,
      meta.serviceName,
      meta.date,
    );
    assert.ok(fs.existsSync(partitionDir));

    const segmentFile = path.join(partitionDir, 'segment-0000.jsonl');
    assert.ok(fs.existsSync(segmentFile));
    const lines = fs.readFileSync(segmentFile, 'utf-8').trim().split('\n');
    assert.equal(lines.length, 2);

    // Manually trigger finalization of segment-0000
    const partitionKey = `${meta.tenantId}#${meta.projectId}#${meta.environment}#${meta.serviceName}#${meta.date}`;
    const manifest = await writer.finalizeSegment(partitionKey, meta);

    assert.ok(manifest);
    assert.equal(manifest?.manifest_version, '1.0');
    assert.equal(manifest?.segment_filename, 'segment-0000.jsonl');
    assert.equal(manifest?.record_count, 2);
    assert.ok(manifest?.byte_size > 0);
    assert.equal(manifest?.sha256_checksum.length, 64);
    assert.equal(manifest?.first_event_timestamp, '2026-10-24T12:00:00.000Z');
    assert.equal(manifest?.last_event_timestamp, '2026-10-24T12:01:00.000Z');

    // Companion manifest file must exist on disk
    const manifestFile = path.join(partitionDir, 'segment-0000.manifest.json');
    assert.ok(fs.existsSync(manifestFile));

    // Validate manifest against official JSON Schema (contracts/ingestion/v1/segment-manifest.schema.json)
    const schemaPath = path.resolve(
      process.cwd(),
      '..',
      '..',
      'contracts',
      'ingestion',
      'v1',
      'segment-manifest.schema.json',
    );
    const schemaContent = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));

    // Dynamic import Ajv from packages/logger-core
    const ajvModulePath = path.resolve(process.cwd(), '../../packages/logger-core/node_modules/ajv/dist/2020.js');
    const formatsModulePath = path.resolve(
      process.cwd(),
      '../../packages/logger-core/node_modules/ajv-formats/dist/index.js',
    );

    const { pathToFileURL } = await import('node:url');
    const { default: Ajv2020 } = await import(pathToFileURL(ajvModulePath).href);
    const { default: addFormats } = await import(pathToFileURL(formatsModulePath).href);

    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    const validate = ajv.compile(schemaContent);
    const valid = validate(manifest);
    assert.equal(valid, true, `Manifest validation errors: ${JSON.stringify(validate.errors)}`);

    // Repository record check
    const savedSegment = await repo.findSegment(
      meta.tenantId,
      meta.projectId,
      meta.environment,
      meta.serviceName,
      meta.date,
      'segment-0000.jsonl',
    );
    assert.ok(savedSegment);
    assert.equal(savedSegment?.recordCount, 2);
  });
});
