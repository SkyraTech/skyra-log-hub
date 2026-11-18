import { test } from 'node:test';
import assert from 'node:assert/strict';
import { organizationName, organizationPrecondition } from '../../src/modules/organization/organization.service.js';
import { EffectivePermissionResolver } from '../../src/modules/authorization/application/effective-permission.resolver.js';
for (const body of [{}, null, [], { name: 1 }, { name: ' ' }, { name: 'a' }, { name: 'a'.repeat(256) }, { name: 'Valid', status: 'ACTIVE' }, { name: 'Valid', id: 'changed' }]) {
  test(`organization update rejects ${JSON.stringify(body)?.slice(0,70)}`, () => assert.throws(() => organizationName(body)));
}
test('organization display names are trimmed', () => assert.equal(organizationName({ name: '  Organization  ' }), 'Organization'));
test('organization requires a strong concurrency precondition', () => {
  for (const value of [undefined, '*', 'W/"t123"', '"invalid"', '"t9999999999999999999"']) assert.throws(() => organizationPrecondition(value));
  assert.equal(organizationPrecondition('"o11111111-2222-4333-8444-555555555555:1790000000000001"'),'1790000000000001');
  assert.throws(() => organizationPrecondition('"o11111111-2222-4333-8444-555555555555:1790000000000001"','different-organization'));
});
test('unknown persisted role names cannot inherit object prototype capabilities', () => {
  const resolver = new EffectivePermissionResolver();
  assert.equal(resolver.resolveEffectiveCapabilities([{ tenantId:'tenant',userId:'user',role:'__proto__' as any }],'tenant').size,0);
});
test('an empty project scope is not an organization-wide role', () => {
  const resolver = new EffectivePermissionResolver();
  assert.equal(resolver.resolveEffectiveCapabilities([{ tenantId:'tenant',userId:'user',role:'OrgOwner',projectId:'' }],'tenant').size,0);
});
