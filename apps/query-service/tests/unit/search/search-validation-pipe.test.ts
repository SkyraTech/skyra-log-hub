import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { SearchValidationPipe } from '../../../src/modules/search/api/pipes/search-validation.pipe.js';
import {
  InvalidArgumentException,
  UnsupportedFilterFieldException,
  UnsupportedFilterOperatorException,
} from '../../../src/common/errors/query.errors.js';

describe('SearchValidationPipe Unit Tests (LOGHUB-QUERY-004)', () => {
  const pipe = new SearchValidationPipe();

  const validPayload = {
    time_range: {
      start: '2026-10-26T00:00:00.000Z',
      end: '2026-10-26T12:00:00.000Z',
    },
    projects: ['core-api'],
    environments: ['production'],
    services: ['auth-service'],
    levels: ['error', 'warn'],
    limit: 25,
  };

  it('SVP-1: should accept valid search request payload conforming to contract', () => {
    const transformed = pipe.transform(validPayload, { type: 'body' });
    assert.deepEqual(transformed, validPayload);
  });

  it('SVP-2: should reject unknown envelope properties (additionalProperties: false)', () => {
    assert.throws(
      () => pipe.transform({ ...validPayload, malicious_field: 'drop table' }, { type: 'body' }),
      (err: unknown) => {
        assert.ok(err instanceof InvalidArgumentException);
        assert.ok((err as InvalidArgumentException).message.includes('malicious_field'));
        return true;
      },
    );
  });

  it('SVP-3: should reject missing or invalid time_range', () => {
    assert.throws(
      () => pipe.transform({ projects: ['core-api'] }, { type: 'body' }),
      (err: unknown) => {
        assert.ok(err instanceof InvalidArgumentException);
        assert.ok((err as InvalidArgumentException).message.includes('time_range'));
        return true;
      },
    );
  });

  it('SVP-4: should reject non-UTC or malformed timestamps', () => {
    assert.throws(
      () =>
        pipe.transform(
          {
            time_range: {
              start: '2026-10-26 12:00:00', // Missing T and Z
              end: '2026-10-26T14:00:00.000Z',
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

  it('SVP-5: should reject time_range where end <= start', () => {
    assert.throws(
      () =>
        pipe.transform(
          {
            time_range: {
              start: '2026-10-26T14:00:00.000Z',
              end: '2026-10-26T10:00:00.000Z',
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

  it('SVP-6: should reject out-of-bounds limit', () => {
    assert.throws(
      () => pipe.transform({ ...validPayload, limit: 1000 }, { type: 'body' }),
      (err: unknown) => {
        assert.ok(err instanceof InvalidArgumentException);
        assert.ok((err as InvalidArgumentException).message.includes('between 1 and 500'));
        return true;
      },
    );

    assert.throws(
      () => pipe.transform({ ...validPayload, limit: 0 }, { type: 'body' }),
      (err: unknown) => {
        assert.ok(err instanceof InvalidArgumentException);
        return true;
      },
    );
  });

  it('SVP-7: should reject invalid project IDs', () => {
    assert.throws(
      () => pipe.transform({ ...validPayload, projects: ['INVALID_UPPERCASE!'] }, { type: 'body' }),
      (err: unknown) => {
        assert.ok(err instanceof InvalidArgumentException);
        assert.ok((err as InvalidArgumentException).message.includes('Invalid project ID'));
        return true;
      },
    );
  });

  it('SVP-8: should reject unsupported filter fields with 422 exception', () => {
    assert.throws(
      () =>
        pipe.transform(
          {
            ...validPayload,
            filters: [{ field: 'unsupported; DROP TABLE;', operator: 'eq', value: '1' }],
          },
          { type: 'body' },
        ),
      (err: unknown) => {
        assert.ok(err instanceof UnsupportedFilterFieldException);
        return true;
      },
    );
  });

  it('SVP-9: should reject unsupported filter operators with 422 exception', () => {
    assert.throws(
      () =>
        pipe.transform(
          {
            ...validPayload,
            filters: [{ field: 'message', operator: 'regex_match_injection', value: '.*' }],
          },
          { type: 'body' },
        ),
      (err: unknown) => {
        assert.ok(err instanceof UnsupportedFilterOperatorException);
        return true;
      },
    );
  });
});
