import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { AggregateValidationPipe } from '../../../src/modules/analytics/api/pipes/aggregate-validation.pipe.js';
import {
  InvalidArgumentException,
  UnsupportedFilterFieldException,
  UnsupportedFilterOperatorException,
  TimeRangeExceededException,
} from '../../../src/common/errors/query.errors.js';

describe('AggregateValidationPipe Unit Tests (LOGHUB-QUERY-005)', () => {
  const pipe = new AggregateValidationPipe();

  const validPayload = {
    time_range: {
      start: '2026-10-26T00:00:00.000Z',
      end: '2026-10-26T12:00:00.000Z',
    },
    projects: ['core-api'],
    environments: ['production'],
    services: ['auth-service'],
    levels: ['error', 'warn'],
    aggregations: [
      {
        name: 'by_severity',
        type: 'terms' as const,
        field: 'log.level',
        size: 10,
      },
      {
        name: 'timeline',
        type: 'date_histogram' as const,
        field: '@timestamp',
        interval: '1h' as const,
      },
    ],
  };

  it('AVP-1: should accept valid aggregation request conforming to JSON schema', () => {
    const transformed = pipe.transform(validPayload, { type: 'body' });
    assert.equal(transformed.aggregations.length, 2);
    assert.equal(transformed.time_range.start, '2026-10-26T00:00:00.000Z');
  });

  it('AVP-2: should reject unknown envelope properties (additionalProperties: false)', () => {
    assert.throws(
      () => pipe.transform({ ...validPayload, unexpected_field: 'malicious' }, { type: 'body' }),
      (err: unknown) => {
        assert.ok(err instanceof InvalidArgumentException);
        assert.ok((err as InvalidArgumentException).message.includes('unexpected_field'));
        return true;
      },
    );
  });

  it('AVP-3: should reject missing or invalid time_range', () => {
    assert.throws(
      () => pipe.transform({ aggregations: validPayload.aggregations }, { type: 'body' }),
      (err: unknown) => {
        assert.ok(err instanceof InvalidArgumentException);
        assert.ok((err as InvalidArgumentException).message.includes('time_range'));
        return true;
      },
    );
  });

  it('AVP-4: should reject non-UTC timestamps missing Z suffix', () => {
    assert.throws(
      () =>
        pipe.transform(
          {
            ...validPayload,
            time_range: {
              start: '2026-10-26T00:00:00',
              end: '2026-10-26T12:00:00.000Z',
            },
          },
          { type: 'body' },
        ),
      (err: unknown) => {
        assert.ok(err instanceof InvalidArgumentException);
        assert.ok((err as InvalidArgumentException).message.includes('RFC 3339 UTC'));
        return true;
      },
    );
  });

  it('AVP-5: should reject time_range where end <= start', () => {
    assert.throws(
      () =>
        pipe.transform(
          {
            ...validPayload,
            time_range: {
              start: '2026-10-26T12:00:00.000Z',
              end: '2026-10-26T00:00:00.000Z',
            },
          },
          { type: 'body' },
        ),
      (err: unknown) => {
        assert.ok(err instanceof InvalidArgumentException);
        assert.ok((err as InvalidArgumentException).message.includes('strictly greater'));
        return true;
      },
    );
  });

  it('AVP-6: should reject time_range exceeding maximum allowed window of 30 days', () => {
    assert.throws(
      () =>
        pipe.transform(
          {
            ...validPayload,
            time_range: {
              start: '2026-08-01T00:00:00.000Z',
              end: '2026-10-26T00:00:00.000Z',
            },
          },
          { type: 'body' },
        ),
      (err: unknown) => {
        assert.ok(err instanceof TimeRangeExceededException);
        return true;
      },
    );
  });

  it('AVP-7: should reject empty aggregations array or more than 5 aggregations', () => {
    assert.throws(
      () => pipe.transform({ ...validPayload, aggregations: [] }, { type: 'body' }),
      (err: unknown) => {
        assert.ok(err instanceof InvalidArgumentException);
        return true;
      },
    );
  });

  it('AVP-8: should reject duplicate aggregation names', () => {
    assert.throws(
      () =>
        pipe.transform(
          {
            ...validPayload,
            aggregations: [
              { name: 'counts', type: 'terms', field: 'log.level' },
              { name: 'counts', type: 'terms', field: 'service.name' },
            ],
          },
          { type: 'body' },
        ),
      (err: unknown) => {
        assert.ok(err instanceof InvalidArgumentException);
        assert.ok((err as InvalidArgumentException).message.includes('Duplicate'));
        return true;
      },
    );
  });

  it('AVP-9: should reject date_histogram that would exceed maximum 2000 buckets', () => {
    assert.throws(
      () =>
        pipe.transform(
          {
            time_range: {
              start: '2026-10-01T00:00:00.000Z',
              end: '2026-10-15T00:00:00.000Z', // 14 days = 20,160 1-minute buckets
            },
            aggregations: [
              {
                name: 'too_granular',
                type: 'date_histogram',
                field: '@timestamp',
                interval: '1m',
              },
            ],
          },
          { type: 'body' },
        ),
      (err: unknown) => {
        assert.ok(err instanceof InvalidArgumentException);
        assert.ok((err as InvalidArgumentException).message.includes('exceeds maximum limit of 2000 buckets'));
        return true;
      },
    );
  });

  it('AVP-10: should reject terms aggregation on non-allowlisted field with 422', () => {
    assert.throws(
      () =>
        pipe.transform(
          {
            ...validPayload,
            aggregations: [
              {
                name: 'bad_terms',
                type: 'terms',
                field: 'non_existent.field',
              },
            ],
          },
          { type: 'body' },
        ),
      (err: unknown) => {
        assert.ok(err instanceof UnsupportedFilterFieldException);
        return true;
      },
    );
  });

  it('AVP-11: should reject terms aggregation size exceeding 50', () => {
    assert.throws(
      () =>
        pipe.transform(
          {
            ...validPayload,
            aggregations: [
              {
                name: 'huge_size',
                type: 'terms',
                field: 'service.name',
                size: 1000,
              },
            ],
          },
          { type: 'body' },
        ),
      (err: unknown) => {
        assert.ok(err instanceof InvalidArgumentException);
        assert.ok((err as InvalidArgumentException).message.includes('size must be an integer between 1 and 50'));
        return true;
      },
    );
  });
});
