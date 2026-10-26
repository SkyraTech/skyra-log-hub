/**
 * Query API Contract & Schema Verification Suite
 * Task: LOGHUB-QUERY-001
 *
 * Verifies OpenAPI 3.1.0 query specifications, JSON Schemas (Draft 2020-12),
 * search requests/responses, aggregation specifications, facet discovery,
 * cursor integrity, and error response envelopes.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// @ts-ignore
import Ajv2020 from '../../packages/logger-core/node_modules/ajv/dist/2020.js';
// @ts-ignore
import addFormats from '../../packages/logger-core/node_modules/ajv-formats/dist/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const QUERY_CONTRACTS_DIR = path.resolve(__dirname, '../../contracts/query/v1');

const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
});
addFormats(ajv);

// Load Query Schemas
const searchRequestSchema = JSON.parse(
  fs.readFileSync(path.join(QUERY_CONTRACTS_DIR, 'search-request.schema.json'), 'utf-8')
);
const searchResponseSchema = JSON.parse(
  fs.readFileSync(path.join(QUERY_CONTRACTS_DIR, 'search-response.schema.json'), 'utf-8')
);
const aggregateRequestSchema = JSON.parse(
  fs.readFileSync(path.join(QUERY_CONTRACTS_DIR, 'aggregate-request.schema.json'), 'utf-8')
);
const aggregateResponseSchema = JSON.parse(
  fs.readFileSync(path.join(QUERY_CONTRACTS_DIR, 'aggregate-response.schema.json'), 'utf-8')
);
const facetsRequestSchema = JSON.parse(
  fs.readFileSync(path.join(QUERY_CONTRACTS_DIR, 'facets-request.schema.json'), 'utf-8')
);
const facetsResponseSchema = JSON.parse(
  fs.readFileSync(path.join(QUERY_CONTRACTS_DIR, 'facets-response.schema.json'), 'utf-8')
);
const errorSchema = JSON.parse(
  fs.readFileSync(path.join(QUERY_CONTRACTS_DIR, 'error.schema.json'), 'utf-8')
);
const cursorSchema = JSON.parse(
  fs.readFileSync(path.join(QUERY_CONTRACTS_DIR, 'cursor.schema.json'), 'utf-8')
);

const validateSearchRequest = ajv.compile(searchRequestSchema);
const validateSearchResponse = ajv.compile(searchResponseSchema);
const validateAggregateRequest = ajv.compile(aggregateRequestSchema);
const validateAggregateResponse = ajv.compile(aggregateResponseSchema);
const validateFacetsRequest = ajv.compile(facetsRequestSchema);
const validateFacetsResponse = ajv.compile(facetsResponseSchema);
const validateError = ajv.compile(errorSchema);
const validateCursor = ajv.compile(cursorSchema);

describe('LOGHUB-QUERY-001: Query Contracts & Schema Verification Suite', () => {
  it('Search Request: Validates a fully specified valid search request', () => {
    const validRequest = {
      time_range: {
        start: '2026-10-25T00:00:00.000Z',
        end: '2026-10-25T23:59:59.999Z',
      },
      projects: ['skyra-core', 'skyra-auth'],
      environments: ['production'],
      services: ['order-service'],
      levels: ['error', 'warn'],
      query_text: 'connection timeout',
      trace_id: '4bf92f3577b34da6a3ce929d0e0e4736',
      filters: [
        { field: 'event.action', operator: 'eq', value: 'db_query' },
        { field: 'error.type', operator: 'exists', value: true },
      ],
      sort: { field: '@timestamp', direction: 'desc' },
      limit: 100,
    };

    const valid = validateSearchRequest(validRequest);
    assert.ok(valid, `Validation failed: ${JSON.stringify(validateSearchRequest.errors)}`);
  });

  it('Search Request: Rejects invalid or malformed requests', () => {
    // Missing required time_range
    assert.equal(validateSearchRequest({ projects: ['skyra-core'] }), false);

    // Limit exceeds maximum (501 > 500)
    assert.equal(
      validateSearchRequest({
        time_range: { start: '2026-10-25T00:00:00Z', end: '2026-10-25T01:00:00Z' },
        limit: 501,
      }),
      false
    );

    // Invalid operator
    assert.equal(
      validateSearchRequest({
        time_range: { start: '2026-10-25T00:00:00Z', end: '2026-10-25T01:00:00Z' },
        filters: [{ field: 'event.action', operator: 'regex_match', value: '.*' }],
      }),
      false
    );
  });

  it('Search Response: Validates matching search response envelope', () => {
    const validResponse = {
      events: [
        {
          '@timestamp': '2026-10-25T12:00:00.000Z',
          'ecs.version': '8.11.0',
          event: { id: '00000000-0000-4000-8000-000000000001' },
          log: { level: 'error' },
          message: 'Connection failed',
          service: { name: 'order-service', environment: 'production' },
          skyra: { project_id: 'skyra-core', schema_version: '1.0' },
        },
      ],
      pagination: {
        has_more: true,
        next_cursor: 'eyJjdXJzb3JfdmVyc2lvbiI6IjEuMCJ9',
        total_returned: 1,
      },
      statistics: {
        scanned_bytes: 1048576,
        scanned_segments: 2,
        execution_time_ms: 12.5,
        archive_watermark: '2026-10-25T12:00:00.000Z',
      },
      scope: {
        tenant_id: '00000000-0000-0000-0000-000000000001',
        searched_projects: ['skyra-core'],
      },
    };

    const valid = validateSearchResponse(validResponse);
    assert.ok(valid, `Validation failed: ${JSON.stringify(validateSearchResponse.errors)}`);
  });

  it('Aggregate Request & Response: Validates analytical aggregations schema', () => {
    const validAggRequest = {
      time_range: {
        start: '2026-10-25T00:00:00.000Z',
        end: '2026-10-25T23:59:59.999Z',
      },
      projects: ['skyra-core'],
      aggregations: [
        { name: 'errors_over_time', type: 'date_histogram', field: '@timestamp', interval: '1h' },
        { name: 'top_services', type: 'terms', field: 'service.name', size: 10 },
      ],
    };
    assert.ok(validateAggregateRequest(validAggRequest));

    const validAggResponse = {
      aggregations: {
        errors_over_time: {
          type: 'date_histogram',
          buckets: [
            { timestamp: '2026-10-25T00:00:00.000Z', count: 12 },
            { timestamp: '2026-10-25T01:00:00.000Z', count: 4 },
          ],
        },
        top_services: {
          type: 'terms',
          buckets: [
            { key: 'order-service', count: 150 },
            { key: 'auth-service', count: 42 },
          ],
        },
      },
      statistics: {
        scanned_bytes: 2048576,
        scanned_segments: 4,
        execution_time_ms: 22.4,
        archive_watermark: '2026-10-25T23:00:00.000Z',
      },
      scope: {
        tenant_id: '00000000-0000-0000-0000-000000000001',
        searched_projects: ['skyra-core'],
      },
    };
    assert.ok(validateAggregateResponse(validAggResponse));
  });

  it('Facets Request & Response: Validates filter discovery schema', () => {
    const validFacetsReq = {
      time_range: {
        start: '2026-10-25T00:00:00.000Z',
        end: '2026-10-25T23:59:59.999Z',
      },
      facet_fields: ['service.name', 'log.level'],
    };
    assert.ok(validateFacetsRequest(validFacetsReq));

    const validFacetsResp = {
      facets: {
        'service.name': [
          { value: 'order-service', count: 100 },
          { value: 'auth-service', count: 50 },
        ],
        'log.level': [
          { value: 'info', count: 120 },
          { value: 'error', count: 30 },
        ],
      },
      statistics: {
        scanned_bytes: 1048576,
        scanned_segments: 2,
        execution_time_ms: 8.2,
        archive_watermark: '2026-10-25T23:00:00.000Z',
      },
      scope: {
        tenant_id: '00000000-0000-0000-0000-000000000001',
        searched_projects: ['skyra-core'],
      },
    };
    assert.ok(validateFacetsResponse(validFacetsResp));
  });

  it('Cursor Schema: Validates signed keyset cursor payload', () => {
    const validCursor = {
      cursor_version: '1.0',
      timestamp: '2026-10-25T14:00:00.123Z',
      event_id: '12345678-1234-4234-8234-123456789abc',
      segment_id: 'segment-0001.jsonl',
      record_offset: 42,
      sort_direction: 'desc',
      query_fingerprint: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      tenant_id: '00000000-0000-0000-0000-000000000001',
      created_at: 1792914800000,
      signature: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    };

    assert.ok(validateCursor(validCursor));

    // Tampered or missing signature
    const invalidCursor = { ...validCursor, signature: 'short' };
    assert.equal(validateCursor(invalidCursor), false);
  });

  it('Error Envelope: Validates standardized query error responses', () => {
    const validError = {
      error: {
        code: 'INVALID_CURSOR',
        message: 'Pagination cursor signature mismatch or query fingerprint invalid',
        requestId: 'req-query-001',
        retryable: false,
        details: [
          { path: 'cursor', message: 'HMAC signature verification failed' },
        ],
      },
    };
    assert.ok(validateError(validError));

    // Unknown error code
    const badCodeError = {
      error: {
        code: 'SOME_UNKNOWN_CODE',
        message: 'Something happened',
        requestId: 'req-001',
        retryable: true,
      },
    };
    assert.equal(validateError(badCodeError), false);
  });

  it('OpenAPI Specification: Confirms openapi.yaml exists and defines all required paths', () => {
    const openapiPath = path.join(QUERY_CONTRACTS_DIR, 'openapi.yaml');
    assert.ok(fs.existsSync(openapiPath), 'openapi.yaml must exist');
    const content = fs.readFileSync(openapiPath, 'utf-8');
    assert.ok(content.includes('/query/v1/logs/search:'));
    assert.ok(content.includes('/query/v1/logs/{eventId}:'));
    assert.ok(content.includes('/query/v1/logs/aggregate:'));
    assert.ok(content.includes('/query/v1/logs/facets:'));
    assert.ok(content.includes('/health/live:'));
    assert.ok(content.includes('/health/ready:'));
  });
});
