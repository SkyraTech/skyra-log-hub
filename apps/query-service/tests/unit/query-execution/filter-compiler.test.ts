import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  FilterCompilerService,
  MAX_FILTER_COUNT,
  MAX_IN_ARRAY_LENGTH,
  MAX_STRING_FILTER_LENGTH,
} from '../../../src/modules/query-execution/application/filter-compiler.service.js';
import { InvalidArgumentException } from '../../../src/common/errors/query.errors.js';

describe('FilterCompilerService Unit Tests (LOGHUB-QUERY-003)', () => {
  const compiler = new FilterCompilerService();

  it('FCS-1: should resolve allowlisted canonical paths and aliases', () => {
    const ast = compiler.compileFilters([
      { field: 'timestamp', operator: 'gte', value: '2026-10-26T00:00:00.000Z' },
      { field: 'level', operator: 'eq', value: 'error' },
      { field: 'service.name', operator: 'eq', value: 'payment-svc' },
      { field: 'status_code', operator: 'gte', value: 400 },
    ]);

    assert.ok(ast, 'AST should be generated');
    assert.equal(ast.kind, 'logical');
    if (ast.kind === 'logical') {
      assert.equal(ast.operator, 'and');
      assert.equal(ast.children.length, 4);
    }
  });

  it('FCS-2: should reject unknown or non-allowlisted field paths', () => {
    assert.throws(
      () => {
        compiler.compileFilters([{ field: 'arbitrary_internal_field', operator: 'eq', value: 'secret' }]);
      },
      (err: unknown) => {
        assert.ok(err instanceof InvalidArgumentException);
        assert.match(err.message, /not an allowlisted canonical field path/i);
        return true;
      },
    );
  });

  it('FCS-3: should reject incompatible operators for field types', () => {
    // 'contains' is not valid for numeric status_code
    assert.throws(
      () => {
        compiler.compileFilters([{ field: 'http.response.status_code', operator: 'contains', value: '500' }]);
      },
      (err: unknown) => {
        assert.ok(err instanceof InvalidArgumentException);
        assert.match(err.message, /Operator "contains" is not supported for field/i);
        return true;
      },
    );

    // 'gt' is not valid for message
    assert.throws(
      () => {
        compiler.compileFilters([{ field: 'message', operator: 'gt', value: 'abc' }]);
      },
      (err: unknown) => {
        assert.ok(err instanceof InvalidArgumentException);
        assert.match(err.message, /Operator "gt" is not supported/i);
        return true;
      },
    );
  });

  it('FCS-4: should reject invalid data types for numeric fields', () => {
    assert.throws(
      () => {
        compiler.compileFilters([{ field: 'status_code', operator: 'eq', value: 'not-a-number' }]);
      },
      (err: unknown) => {
        assert.ok(err instanceof InvalidArgumentException);
        assert.match(err.message, /must be a finite number/i);
        return true;
      },
    );
  });

  it('FCS-5: should reject invalid timestamp format', () => {
    assert.throws(
      () => {
        compiler.compileFilters([{ field: '@timestamp', operator: 'gt', value: 'invalid-timestamp-value' }]);
      },
      (err: unknown) => {
        assert.ok(err instanceof InvalidArgumentException);
        assert.match(err.message, /valid ISO 8601 UTC date string/i);
        return true;
      },
    );
  });

  it('FCS-6: should reject string filters exceeding maximum length', () => {
    const longString = 'a'.repeat(MAX_STRING_FILTER_LENGTH + 1);
    assert.throws(
      () => {
        compiler.compileFilters([{ field: 'message', operator: 'contains', value: longString }]);
      },
      (err: unknown) => {
        assert.ok(err instanceof InvalidArgumentException);
        assert.match(err.message, /exceeds maximum length/i);
        return true;
      },
    );
  });

  it('FCS-7: should reject "in" arrays exceeding maximum items', () => {
    const bigArray = Array.from({ length: MAX_IN_ARRAY_LENGTH + 1 }, (_, i) => `svc-${i}`);
    assert.throws(
      () => {
        compiler.compileFilters([{ field: 'service.name', operator: 'in', value: bigArray }]);
      },
      (err: unknown) => {
        assert.ok(err instanceof InvalidArgumentException);
        assert.match(err.message, /exceeds maximum allowed length/i);
        return true;
      },
    );
  });

  it('FCS-8: should reject queries with more than MAX_FILTER_COUNT structured filters', () => {
    const tooManyFilters = Array.from({ length: MAX_FILTER_COUNT + 1 }, (_, i) => ({
      field: 'log.level',
      operator: 'eq' as const,
      value: 'info',
    }));

    assert.throws(
      () => {
        compiler.compileFilters(tooManyFilters);
      },
      (err: unknown) => {
        assert.ok(err instanceof InvalidArgumentException);
        assert.match(err.message, /maximum of 15 structured filters/i);
        return true;
      },
    );
  });

  it('FCS-9: should compile single filter without wrapping in logical AND', () => {
    const ast = compiler.compileFilters([{ field: 'log.level', operator: 'eq', value: 'warn' }]);
    assert.ok(ast);
    assert.equal(ast.kind, 'binary');
    if (ast.kind === 'binary') {
      assert.equal(ast.field.canonicalPath, 'log.level');
      assert.equal(ast.operator, 'eq');
      assert.equal(ast.value, 'warn');
    }
  });

  it('FCS-10: should compile "exists" filter correctly', () => {
    const astPresent = compiler.compileFilters([{ field: 'error.type', operator: 'exists', value: true }]);
    assert.ok(astPresent);
    assert.equal(astPresent.kind, 'exists');
    if (astPresent.kind === 'exists') {
      assert.equal(astPresent.exists, true);
    }

    const astAbsent = compiler.compileFilters([{ field: 'trace.id', operator: 'exists', value: false }]);
    assert.ok(astAbsent);
    assert.equal(astAbsent.kind, 'exists');
    if (astAbsent.kind === 'exists') {
      assert.equal(astAbsent.exists, false);
    }
  });
});
