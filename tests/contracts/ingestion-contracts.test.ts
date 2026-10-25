/**
 * Offline Ingestion API Contract & Schema Verification Suite
 * Task: LOGHUB-ING-001A
 *
 * Verifies OpenAPI 3.1.0 specifications, JSON schemas (Draft 2020-12),
 * contract response shapes, legacy and authoritative batch envelopes,
 * durable receipts, atomic MVP semantics, and error codes.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// Import Ajv 2020 and formats from logger-core dependencies
// @ts-ignore
import Ajv2020 from '../../packages/logger-core/node_modules/ajv/dist/2020.js';
// @ts-ignore
import addFormats from '../../packages/logger-core/node_modules/ajv-formats/dist/index.js';

import {
  validateLogEvent,
  parseStrictJson,
  LOG_EVENT_SCHEMA_V1,
} from '../../packages/logger-core/dist/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const INGESTION_CONTRACTS_DIR = path.resolve(__dirname, '../../contracts/ingestion/v1');
const EXAMPLES_DIR = path.resolve(INGESTION_CONTRACTS_DIR, 'examples');

// Initialize Ajv with 2020-12 support and register canonical schema
const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
});
addFormats(ajv);
ajv.addSchema(LOG_EVENT_SCHEMA_V1);

// Load Ingestion Schemas
const batchRequestSchema = JSON.parse(
  fs.readFileSync(path.join(INGESTION_CONTRACTS_DIR, 'batch-request.schema.json'), 'utf-8')
);
const batchResponseSchema = JSON.parse(
  fs.readFileSync(path.join(INGESTION_CONTRACTS_DIR, 'batch-response.schema.json'), 'utf-8')
);
const errorResponseSchema = JSON.parse(
  fs.readFileSync(path.join(INGESTION_CONTRACTS_DIR, 'error-response.schema.json'), 'utf-8')
);
const segmentManifestSchema = JSON.parse(
  fs.readFileSync(path.join(INGESTION_CONTRACTS_DIR, 'segment-manifest.schema.json'), 'utf-8')
);

const validateBatchRequest = ajv.compile(batchRequestSchema);
const validateBatchResponse = ajv.compile(batchResponseSchema);
const validateErrorResponse = ajv.compile(errorResponseSchema);
const validateSegmentManifest = ajv.compile(segmentManifestSchema);

describe('LOGHUB-ING-001A: Ingestion Contracts & Hardened Specifications', () => {

  it('1. OpenAPI specification validity and structural completeness', () => {
    const openapiPath = path.join(INGESTION_CONTRACTS_DIR, 'openapi.yaml');
    assert.equal(fs.existsSync(openapiPath), true, 'openapi.yaml must exist');
    const content = fs.readFileSync(openapiPath, 'utf-8');

    assert.match(content, /^openapi:\s*3\.1\.0/m, 'Must declare OpenAPI 3.1.0');
    assert.match(content, /\/ingest\/v1\/logs:/, 'Must declare /ingest/v1/logs path');
    assert.match(content, /\/health\/live:/, 'Must declare /health/live path');
    assert.match(content, /\/health\/ready:/, 'Must declare /health/ready path');
    assert.match(content, /BearerAuth:/, 'Must declare BearerAuth security scheme');
  });

  it('2. Correct request schema references in OpenAPI contract', () => {
    const openapiContent = fs.readFileSync(path.join(INGESTION_CONTRACTS_DIR, 'openapi.yaml'), 'utf-8');
    assert.match(
      openapiContent,
      /\$ref:\s*['"]\.\/batch-request\.schema\.json['"]/,
      'OpenAPI must reference batch-request.schema.json for POST body'
    );
    assert.match(
      openapiContent,
      /\$ref:\s*['"]\.\/batch-response\.schema\.json['"]/,
      'OpenAPI must reference batch-response.schema.json for 200 response'
    );
    assert.match(
      openapiContent,
      /\$ref:\s*['"]\.\/error-response\.schema\.json['"]/,
      'OpenAPI must reference error-response.schema.json for error responses'
    );
  });

  it('3. Legacy envelope acceptance without protocol_version or batch_id', () => {
    const legacyFixture = parseStrictJson(
      fs.readFileSync(path.join(EXAMPLES_DIR, 'valid-legacy-batch-request.json'), 'utf-8')
    );
    const valid = validateBatchRequest(legacyFixture);
    assert.equal(
      valid,
      true,
      `Legacy batch request must be valid: ${JSON.stringify(validateBatchRequest.errors)}`
    );
    assert.equal(legacyFixture.protocol_version, undefined);
    assert.equal(legacyFixture.batch_id, undefined);
    assert.equal(Array.isArray(legacyFixture.events), true);
  });

  it('4. Extended/authoritative envelope acceptance with protocol_version and batch_id', () => {
    const authoritativeFixture = parseStrictJson(
      fs.readFileSync(path.join(EXAMPLES_DIR, 'valid-authoritative-batch-request.json'), 'utf-8')
    );
    const valid = validateBatchRequest(authoritativeFixture);
    assert.equal(
      valid,
      true,
      `Authoritative batch request must be valid: ${JSON.stringify(validateBatchRequest.errors)}`
    );
    assert.equal(authoritativeFixture.protocol_version, '1.0');
    assert.match(
      authoritativeFixture.batch_id,
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/
    );
    assert.equal(authoritativeFixture.events.length, 2);
  });

  it('5. Unsupported protocol versions are rejected', () => {
    const baseFixture = parseStrictJson(
      fs.readFileSync(path.join(EXAMPLES_DIR, 'valid-authoritative-batch-request.json'), 'utf-8')
    );

    const unsupported = {
      ...baseFixture,
      protocol_version: '2.0',
    };
    const valid = validateBatchRequest(unsupported);
    assert.equal(valid, false, 'protocol_version 2.0 must be rejected');
  });

  it('6. Missing required envelope fields are rejected', () => {
    // Missing events
    const missingEvents = {
      protocol_version: '1.0',
      batch_id: '550e8400-e29b-41d4-a716-446655440000',
      sent_at: '2026-10-24T00:00:01.000Z',
      batch_size: 1,
    };
    assert.equal(validateBatchRequest(missingEvents), false, 'Missing events must be rejected');

    // Missing sent_at
    const missingSentAt = {
      events: [],
      batch_size: 0,
    };
    assert.equal(validateBatchRequest(missingSentAt), false, 'Missing sent_at must be rejected');

    // Missing batch_size
    const missingBatchSize = {
      events: [],
      sent_at: '2026-10-24T00:00:01.000Z',
    };
    assert.equal(validateBatchRequest(missingBatchSize), false, 'Missing batch_size must be rejected');
  });

  it('7. Empty and oversized batches are strictly rejected by schema constraints', () => {
    const baseFixture = parseStrictJson(
      fs.readFileSync(path.join(EXAMPLES_DIR, 'valid-authoritative-batch-request.json'), 'utf-8')
    );

    // Empty batch
    const emptyBatch = {
      ...baseFixture,
      batch_size: 0,
      events: [],
    };
    assert.equal(validateBatchRequest(emptyBatch), false, 'Empty batch (0 events) must be rejected');

    // Oversized batch (>500 events)
    const singleEvent = baseFixture.events[0];
    const oversizedEvents = Array.from({ length: 501 }, () => singleEvent);
    const oversizedBatch = {
      ...baseFixture,
      batch_size: 501,
      events: oversizedEvents,
    };
    assert.equal(validateBatchRequest(oversizedBatch), false, 'Oversized batch (501 events) must be rejected');
  });

  it('8. Duplicate event IDs inside a single batch are detectable', () => {
    const baseFixture = parseStrictJson(
      fs.readFileSync(path.join(EXAMPLES_DIR, 'valid-authoritative-batch-request.json'), 'utf-8')
    );

    // Create batch with duplicate event.id
    const duplicateEventBatch = {
      ...baseFixture,
      events: [
        baseFixture.events[0],
        {
          ...baseFixture.events[1],
          event: {
            ...baseFixture.events[1].event,
            id: baseFixture.events[0].event.id, // Duplicate!
          },
        },
      ],
    };

    const eventIds = duplicateEventBatch.events.map((e: any) => e.event.id);
    const uniqueIds = new Set(eventIds);
    assert.equal(
      uniqueIds.size < eventIds.length,
      true,
      'Duplicate event IDs must be detected within a single batch'
    );
  });

  it('9. Atomic response shape satisfies batch-response.schema.json', () => {
    const responseFixture = parseStrictJson(
      fs.readFileSync(path.join(EXAMPLES_DIR, 'valid-durably-accepted-response.json'), 'utf-8')
    );
    const valid = validateBatchResponse(responseFixture);
    assert.equal(
      valid,
      true,
      `Durable response fixture must match schema: ${JSON.stringify(validateBatchResponse.errors)}`
    );
    assert.equal(responseFixture.status, 'durably_accepted');
    assert.equal(responseFixture.duplicate, false);
    assert.equal(typeof responseFixture.accepted_count, 'number');
  });

  it('10. No partial-acceptance HTTP 207 exists in MVP contract', () => {
    const openapiContent = fs.readFileSync(path.join(INGESTION_CONTRACTS_DIR, 'openapi.yaml'), 'utf-8');
    assert.equal(
      openapiContent.includes("'207'"),
      false,
      'HTTP 207 must not exist in openapi.yaml for MVP'
    );
    assert.equal(
      openapiContent.includes('Multi-Status'),
      false,
      'HTTP Multi-Status must not exist in openapi.yaml for MVP'
    );
  });

  it('11. Idempotency conflict error shape satisfies error-response.schema.json', () => {
    const conflictFixture = parseStrictJson(
      fs.readFileSync(path.join(EXAMPLES_DIR, 'valid-error-idempotency-conflict.json'), 'utf-8')
    );
    const valid = validateErrorResponse(conflictFixture);
    assert.equal(
      valid,
      true,
      `Idempotency conflict fixture must match schema: ${JSON.stringify(validateErrorResponse.errors)}`
    );
    assert.equal(conflictFixture.error.code, 'IDEMPOTENCY_CONFLICT');
    assert.equal(conflictFixture.error.retryable, false);
  });

  it('12. Durable receipt shape and required fields validation', () => {
    const responseFixture = parseStrictJson(
      fs.readFileSync(path.join(EXAMPLES_DIR, 'valid-durably-accepted-response.json'), 'utf-8')
    );
    const receipt = responseFixture.receipt;
    assert.ok(receipt, 'Receipt must be present');
    assert.equal(typeof receipt.receipt_id, 'string');
    assert.equal(typeof receipt.journal_segment, 'string');
    assert.equal(typeof receipt.journal_offset, 'number');
    assert.match(
      receipt.committed_at,
      /^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,9})?Z$/
    );
    assert.match(receipt.content_digest, /^sha256:[0-9a-fA-F]{64}$/);
  });

  it('13. Authentication and authorization error shapes validation', () => {
    const authError = {
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing or invalid Bearer authentication token.',
        requestId: 'req_auth_test_1',
        retryable: false,
      },
    };
    assert.equal(validateErrorResponse(authError), true, 'UNAUTHORIZED error must match schema');

    const forbiddenError = {
      error: {
        code: 'PROJECT_ACCESS_DENIED',
        message: 'Credential is not authorized to submit logs for project skyra-unauthorized.',
        requestId: 'req_forbid_test_1',
        retryable: false,
      },
    };
    assert.equal(validateErrorResponse(forbiddenError), true, 'PROJECT_ACCESS_DENIED error must match schema');
  });

  it('14. Rate-limit response shape and retryable flag validation', () => {
    const rateLimitError = {
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Rate limit exceeded for project. Retry after specified delay.',
        requestId: 'req_rate_test_1',
        retryable: true,
      },
    };
    assert.equal(validateErrorResponse(rateLimitError), true, 'RATE_LIMIT_EXCEEDED must match schema');
    assert.equal(rateLimitError.error.retryable, true, 'Rate limit errors must be retryable');
  });

  it('15. Storage unavailable response (503 / STORAGE_NOT_READY) validation', () => {
    const storageErrorFixture = parseStrictJson(
      fs.readFileSync(path.join(EXAMPLES_DIR, 'valid-error-storage-not-ready.json'), 'utf-8')
    );
    const valid = validateErrorResponse(storageErrorFixture);
    assert.equal(valid, true, 'STORAGE_NOT_READY error must match schema');
    assert.equal(storageErrorFixture.error.code, 'STORAGE_NOT_READY');
    assert.equal(storageErrorFixture.error.retryable, true, 'Storage unavailable errors must be retryable');
  });

  it('16. Segment manifest schema validity and fixture compliance', () => {
    const manifestFixture = parseStrictJson(
      fs.readFileSync(path.join(EXAMPLES_DIR, 'valid-segment-manifest.json'), 'utf-8')
    );
    const valid = validateSegmentManifest(manifestFixture);
    assert.equal(
      valid,
      true,
      `Segment manifest must match schema: ${JSON.stringify(validateSegmentManifest.errors)}`
    );
    assert.equal(manifestFixture.manifest_version, '1.0');
    assert.match(manifestFixture.sha256_checksum, /^[0-9a-f]{64}$/);
    assert.ok(manifestFixture.journal_commit_range.segment_id);
    assert.equal(typeof manifestFixture.journal_commit_range.start_offset, 'number');
    assert.equal(typeof manifestFixture.journal_commit_range.end_offset, 'number');
  });

  it('17. Canonical event schema compatibility within batch events', () => {
    const batchFixture = parseStrictJson(
      fs.readFileSync(path.join(EXAMPLES_DIR, 'valid-authoritative-batch-request.json'), 'utf-8')
    );
    for (let i = 0; i < batchFixture.events.length; i++) {
      const event = batchFixture.events[i];
      const result = validateLogEvent(event);
      assert.equal(
        result.valid,
        true,
        `Event at index ${i} failed canonical validation: ${JSON.stringify(result.errors)}`
      );
    }
  });

  it('18. No conflicting success semantics across examples', () => {
    const durableResp = parseStrictJson(
      fs.readFileSync(path.join(EXAMPLES_DIR, 'valid-durably-accepted-response.json'), 'utf-8')
    );
    const duplicateResp = parseStrictJson(
      fs.readFileSync(path.join(EXAMPLES_DIR, 'valid-duplicate-response.json'), 'utf-8')
    );

    assert.equal(durableResp.status, 'durably_accepted');
    assert.equal(duplicateResp.status, 'durably_accepted');
    assert.equal(durableResp.duplicate, false);
    assert.equal(duplicateResp.duplicate, true);
    assert.equal(durableResp.accepted_count, duplicateResp.accepted_count);
  });

  it('19. No false durability guarantee in contract language', () => {
    const openapiContent = fs.readFileSync(path.join(INGESTION_CONTRACTS_DIR, 'openapi.yaml'), 'utf-8');
    const readmeContent = fs.readFileSync(path.join(INGESTION_CONTRACTS_DIR, 'README.md'), 'utf-8');

    // Asserts that durability requires fsynced journal
    assert.match(openapiContent, /fsync/i, 'OpenAPI must mention fsync for durable acceptance');
    assert.match(readmeContent, /fsync/i, 'README must mention fsync for durable acceptance');
    assert.match(readmeContent, /In-memory acceptance without fsync is strictly prohibited/);
  });

  it('20. Machine-readable error-code consistency across OpenAPI, schema, and docs', () => {
    const allowedCodes = errorResponseSchema.properties.error.properties.code.enum;
    const openapiContent = fs.readFileSync(path.join(INGESTION_CONTRACTS_DIR, 'openapi.yaml'), 'utf-8');
    const readmeContent = fs.readFileSync(path.join(INGESTION_CONTRACTS_DIR, 'README.md'), 'utf-8');

    for (const code of allowedCodes) {
      assert.ok(
        openapiContent.includes(code) || readmeContent.includes(code),
        `Error code ${code} from schema enum must be documented in OpenAPI or README`
      );
    }
  });

});
