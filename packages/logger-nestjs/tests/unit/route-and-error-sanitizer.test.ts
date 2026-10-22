import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { HttpException, HttpStatus } from '@nestjs/common';
import { sanitizeRouteTemplate } from '../../dist/internal/route-sanitizer.js';
import { sanitizeError } from '../../dist/internal/error-sanitizer.js';
import {
  W3C_TRACEPARENT_REGEX,
  SAFE_REQUEST_ID_REGEX,
} from '../../dist/constants.js';

describe('Route, Error & Trace Sanitization (Unit)', () => {
  describe('sanitizeRouteTemplate', () => {
    it('1. preserves framework route templates when available', () => {
      const result = sanitizeRouteTemplate('/users/123/orders', '/users/:userId/orders');
      assert.equal(result, '/users/:userId/orders');
    });

    it('2. strips query strings and credentials from raw paths', () => {
      const result = sanitizeRouteTemplate('/api/v1/auth?token=my_secret_token&user=admin');
      assert.equal(result, '/api/v1/auth');
    });

    it('3. replaces UUIDs, Mongo IDs, and numeric IDs with parameter placeholders', () => {
      const withUuid = sanitizeRouteTemplate('/tenants/a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d/settings');
      assert.equal(withUuid, '/tenants/:id/settings');

      const withNumeric = sanitizeRouteTemplate('/orders/98765/items/4321');
      assert.equal(withNumeric, '/orders/:id/items/:id');

      const withMongo = sanitizeRouteTemplate('/products/507f1f77bcf86cd799439011');
      assert.equal(withMongo, '/products/:id');
    });

    it('4. bounds oversized routes to 256 characters', () => {
      const longPath = '/segment/' + 'a'.repeat(300);
      const result = sanitizeRouteTemplate(longPath);
      assert.ok(result.length <= 256);
    });

    it('5. handles empty, null, or undefined paths safely', () => {
      assert.equal(sanitizeRouteTemplate(undefined), '/unknown');
      assert.equal(sanitizeRouteTemplate(''), '/');
    });
  });

  describe('sanitizeError', () => {
    it('6. extracts safe error type, message, and stack trace from standard Error', () => {
      const err = new Error('Database connection failed');
      const sanitized = sanitizeError(err);

      assert.equal(sanitized.type, 'Error');
      assert.equal(sanitized.message, 'Database connection failed');
      assert.ok(sanitized.stack_trace);
    });

    it('7. redacts passwords, tokens, and secrets from error message and stack trace', () => {
      const secretErr = new Error('Failed authenticating with password="SuperSecretPassword123!" and Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-IDcSemACt8x4iTMCda8Yhe3iZaWbvV5XKSTbuAn0M');
      const sanitized = sanitizeError(secretErr);

      assert.ok(!sanitized.message.includes('SuperSecretPassword123!'));
      assert.ok(!sanitized.message.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'));
      assert.ok(sanitized.message.includes('[REDACTED]'));
    });

    it('8. extracts HTTP status code from NestJS HttpException', () => {
      const httpErr = new HttpException('Access Forbidden', HttpStatus.FORBIDDEN);
      const sanitized = sanitizeError(httpErr);

      assert.equal(sanitized.type, 'HttpException');
      assert.equal(sanitized.httpStatus, 403);
    });

    it('9. handles string throws and non-Error objects safely', () => {
      const strErr = sanitizeError('Fatal database crash');
      assert.equal(strErr.type, 'StringException');
      assert.equal(strErr.message, 'Fatal database crash');

      const objErr = sanitizeError({ code: 500, detail: 'network timeout' });
      assert.equal(objErr.type, 'ObjectException');
    });
  });

  describe('W3C Traceparent & Request ID Validation', () => {
    it('10. validates compliant W3C traceparent strings', () => {
      const valid = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
      assert.ok(W3C_TRACEPARENT_REGEX.test(valid));
    });

    it('11. rejects invalid W3C traceparents (version ff, incorrect lengths, non-hex)', () => {
      // Non-hex
      assert.ok(!W3C_TRACEPARENT_REGEX.test('00-xyz92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'));
      // Too short traceId
      assert.ok(!W3C_TRACEPARENT_REGEX.test('00-4bf92f3577b34da6a3ce929d-00f067aa0ba902b7-01'));
      // Too short spanId
      assert.ok(!W3C_TRACEPARENT_REGEX.test('00-4bf92f3577b34da6a3ce929d0e0e4736-00f0-01'));
    });

    it('12. validates safe request ID format and rejects unsafe characters/oversized IDs', () => {
      assert.ok(SAFE_REQUEST_ID_REGEX.test('req-12345-abc_DEF.01'));
      assert.ok(!SAFE_REQUEST_ID_REGEX.test('req 12345')); // spaces forbidden
      assert.ok(!SAFE_REQUEST_ID_REGEX.test('<script>alert(1)</script>')); // special characters forbidden
      assert.ok(!SAFE_REQUEST_ID_REGEX.test('a'.repeat(129))); // > 128 chars rejected
    });
  });
});
