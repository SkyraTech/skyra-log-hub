import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { parseStrictJson, DuplicateKeyError } from '@skyra/logger-core';

describe('Strict JSON Parser Unit Tests', () => {
  it('should parse valid JSON without duplicate keys', () => {
    const raw = JSON.stringify({ a: 1, b: 'hello', nested: { c: true } });
    const parsed = parseStrictJson(raw);
    assert.deepEqual(parsed, { a: 1, b: 'hello', nested: { c: true } });
  });

  it('should throw DuplicateKeyError on top-level duplicate keys', () => {
    const raw = '{"key": "first", "key": "second"}';
    assert.throws(
      () => parseStrictJson(raw),
      (err: any) => {
        assert.ok(err instanceof DuplicateKeyError);
        assert.match(err.message, /Duplicate property 'key'/);
        return true;
      },
    );
  });

  it('should throw DuplicateKeyError on deeply nested duplicate keys', () => {
    const raw = '{"data": {"nested": {"arr": [1, 2], "dup": 1, "dup": 2}}}';
    assert.throws(
      () => parseStrictJson(raw),
      (err: any) => {
        assert.ok(err instanceof DuplicateKeyError);
        assert.match(err.message, /Duplicate property 'dup'/);
        return true;
      },
    );
  });
});
