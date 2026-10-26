import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { FacetsValidationPipe } from '../../../src/modules/analytics/api/pipes/facets-validation.pipe.js';
import {
  InvalidArgumentException,
  TimeRangeExceededException,
} from '../../../src/common/errors/query.errors.js';

describe('FacetsValidationPipe Unit Tests (LOGHUB-QUERY-005)', () => {
  const pipe = new FacetsValidationPipe();

  const validPayload = {
    time_range: {
      start: '2026-10-26T00:00:00.000Z',
      end: '2026-10-26T12:00:00.000Z',
    },
    projects: ['core-api'],
    environments: ['production', 'staging'],
    facet_fields: ['service.name', 'log.level', 'event.action'],
  };

  it('FVP-1: should accept valid facets request payload', () => {
    const transformed = pipe.transform(validPayload, { type: 'body' });
    assert.deepEqual(transformed.facet_fields, ['service.name', 'log.level', 'event.action']);
  });

  it('FVP-2: should reject unknown envelope properties (additionalProperties: false)', () => {
    assert.throws(
      () => pipe.transform({ ...validPayload, unauthorized_attr: 123 }, { type: 'body' }),
      (err: unknown) => {
        assert.ok(err instanceof InvalidArgumentException);
        assert.ok((err as InvalidArgumentException).message.includes('unauthorized_attr'));
        return true;
      },
    );
  });

  it('FVP-3: should reject missing or invalid time_range', () => {
    assert.throws(
      () => pipe.transform({ facet_fields: ['service.name'] }, { type: 'body' }),
      (err: unknown) => {
        assert.ok(err instanceof InvalidArgumentException);
        assert.ok((err as InvalidArgumentException).message.includes('time_range'));
        return true;
      },
    );
  });

  it('FVP-4: should reject non-UTC timestamps', () => {
    assert.throws(
      () =>
        pipe.transform(
          {
            time_range: {
              start: '2026-10-26T00:00:00+05:30',
              end: '2026-10-26T12:00:00.000Z',
            },
            facet_fields: ['service.name'],
          },
          { type: 'body' },
        ),
      (err: unknown) => {
        assert.ok(err instanceof InvalidArgumentException);
        return true;
      },
    );
  });

  it('FVP-5: should reject time_range where end <= start', () => {
    assert.throws(
      () =>
        pipe.transform(
          {
            time_range: {
              start: '2026-10-26T12:00:00.000Z',
              end: '2026-10-26T12:00:00.000Z',
            },
            facet_fields: ['service.name'],
          },
          { type: 'body' },
        ),
      (err: unknown) => {
        assert.ok(err instanceof InvalidArgumentException);
        return true;
      },
    );
  });

  it('FVP-6: should reject time_range exceeding 30 days', () => {
    assert.throws(
      () =>
        pipe.transform(
          {
            time_range: {
              start: '2026-08-01T00:00:00.000Z',
              end: '2026-10-26T00:00:00.000Z',
            },
            facet_fields: ['service.name'],
          },
          { type: 'body' },
        ),
      (err: unknown) => {
        assert.ok(err instanceof TimeRangeExceededException);
        return true;
      },
    );
  });

  it('FVP-7: should reject empty facet_fields array', () => {
    assert.throws(
      () =>
        pipe.transform(
          {
            ...validPayload,
            facet_fields: [],
          },
          { type: 'body' },
        ),
      (err: unknown) => {
        assert.ok(err instanceof InvalidArgumentException);
        return true;
      },
    );
  });

  it('FVP-8: should reject unsupported facet fields', () => {
    assert.throws(
      () =>
        pipe.transform(
          {
            ...validPayload,
            facet_fields: ['service.name', 'arbitrary_metadata_field'],
          },
          { type: 'body' },
        ),
      (err: unknown) => {
        assert.ok(err instanceof InvalidArgumentException);
        assert.ok((err as InvalidArgumentException).message.includes('Unsupported facet field'));
        return true;
      },
    );
  });

  it('FVP-9: should reject duplicate facet fields', () => {
    assert.throws(
      () =>
        pipe.transform(
          {
            ...validPayload,
            facet_fields: ['service.name', 'service.name'],
          },
          { type: 'body' },
        ),
      (err: unknown) => {
        assert.ok(err instanceof InvalidArgumentException);
        assert.ok((err as InvalidArgumentException).message.includes('Duplicate facet field'));
        return true;
      },
    );
  });

  it('FVP-10: should reject unknown environment values', () => {
    assert.throws(
      () =>
        pipe.transform(
          {
            ...validPayload,
            environments: ['production', 'unknown_env_value'],
          },
          { type: 'body' },
        ),
      (err: unknown) => {
        assert.ok(err instanceof InvalidArgumentException);
        assert.ok((err as InvalidArgumentException).message.includes('Unknown environment'));
        return true;
      },
    );
  });
});
