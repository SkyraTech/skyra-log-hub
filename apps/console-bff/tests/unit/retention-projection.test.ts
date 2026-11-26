import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicRetention } from '../../src/modules/auth/api/retention.controller.js';

const validRetention = {
  id: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
  tenantId: 'b2c3d4e5-f6a1-4b2c-9d3e-4f5a6b7c8d9e',
  projectId: 'test-project',
  retentionDays: 45,
  enableParquetPurge: true,
  isLegalHold: false,
  updatedAt: '2026-11-20T10:00:00.000Z',
};

test('publicRetention correctly projects valid authoritative retention response', () => {
  const result = publicRetention(validRetention, validRetention.tenantId, validRetention.projectId);
  assert.deepEqual(result, validRetention);
});

test('publicRetention strips internal or rogue fields from upstream response', () => {
  const withInternal = {
    ...validRetention,
    internalSecret: 'sensitive-value',
    rawToken: 'skyra_secret',
    databaseId: 12345,
  };
  const result = publicRetention(withInternal, validRetention.tenantId, validRetention.projectId);
  assert.equal(Object.hasOwn(result, 'internalSecret'), false);
  assert.equal(Object.hasOwn(result, 'rawToken'), false);
  assert.equal(Object.hasOwn(result, 'databaseId'), false);
  assert.deepEqual(result, validRetention);
});

test('publicRetention rejects mismatched tenantId or projectId', () => {
  assert.throws(() => publicRetention(validRetention, '00000000-0000-0000-0000-000000000000', validRetention.projectId));
  assert.throws(() => publicRetention(validRetention, validRetention.tenantId, 'other-project'));
});

for (const invalid of [
  null,
  undefined,
  'string',
  {},
  { ...validRetention, id: 'not-a-uuid' },
  { ...validRetention, retentionDays: 0 },
  { ...validRetention, retentionDays: 366 },
  { ...validRetention, retentionDays: '30' },
  { ...validRetention, enableParquetPurge: 'true' },
  { ...validRetention, isLegalHold: null },
  { ...validRetention, updatedAt: 'invalid-date' },
]) {
  test('publicRetention throws BadGatewayException for ' + JSON.stringify(invalid), () => {
    assert.throws(() => publicRetention(invalid, validRetention.tenantId, validRetention.projectId));
  });
}
