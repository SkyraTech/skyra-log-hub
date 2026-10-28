import '@angular/compiler';
import 'zone.js';
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { createEnvironmentInjector, Injector, runInInjectionContext } from '@angular/core';
import { JsonInspectorComponent } from '../src/app/features/log-explorer/components/json-inspector/json-inspector.component';

describe('JsonInspectorComponent — Safe Text-Only Rendering & Payload Bounding', () => {
  const injector = createEnvironmentInjector([], Injector.NULL as any);

  it('1. Correctly identifies primitive and complex data types', () => {
    runInInjectionContext(injector, () => {
      const comp = new JsonInspectorComponent();

      assert.equal(comp.getType(null), 'null');
      assert.equal(comp.getType([1, 2, 3]), 'array');
      assert.equal(comp.getType({ key: 'value' }), 'object');
      assert.equal(comp.getType('hello'), 'string');
      assert.equal(comp.getType(123), 'number');
      assert.equal(comp.getType(true), 'boolean');
    });
  });

  it('2. Formats untrusted string safely with quotes without HTML execution', () => {
    runInInjectionContext(injector, () => {
      const comp = new JsonInspectorComponent();
      const maliciousPayload = '<script>alert(1)</script>';
      const formatted = comp.formatValue(maliciousPayload);

      assert.equal(formatted, `"${maliciousPayload}"`);
    });
  });

  it('3. Formats complex nested objects as clean JSON string without throwing', () => {
    runInInjectionContext(injector, () => {
      const comp = new JsonInspectorComponent();
      const obj = {
        '@timestamp': '2026-10-28T00:00:00.000Z',
        log: { level: 'error' },
        message: 'Failed database handshake',
        nested: { a: 1, b: [true, false] },
      };

      const formatted = comp.formatValue(obj);
      assert.ok(formatted.includes('Failed database handshake'));
    });
  });

  it('4. Handles null and undefined safely', () => {
    runInInjectionContext(injector, () => {
      const comp = new JsonInspectorComponent();
      assert.equal(comp.formatValue(null), 'null');
      assert.equal(comp.formatValue(undefined), 'undefined');
    });
  });
});
