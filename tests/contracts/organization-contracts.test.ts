import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
// Same Draft 2020 validator used by the existing admin contract suite.
import Ajv2020 from '../../packages/logger-core/node_modules/ajv/dist/2020.js';
import addFormats from '../../packages/logger-core/node_modules/ajv-formats/dist/index.js';
const ajv=new Ajv2020({strict:false});addFormats(ajv);
const load=(name:string)=>JSON.parse(fs.readFileSync(new URL(`../../contracts/admin/v1/${name}`,import.meta.url),'utf8'));
const update=ajv.compile(load('organization-name-update.schema.json'));
test('organization request contract permits only display-name changes',()=>{
  assert.ok(update({name:'Organization'}));
  for(const body of [{name:'a'},{name:'   '},{name:3},{name:'Valid',status:'SUSPENDED'},{name:'Valid',id:'changed'},{name:'Valid',tenantId:'other'},{}])assert.equal(update(body),false);
});
test('console organization response contract excludes credentials and internal grants',()=>{
  const validate=ajv.compile(load('organization-console.schema.json'));
  const value={id:'11111111-2222-4333-8444-555555555555',code:'test',name:'Organization',status:'ACTIVE',createdAt:'2026-11-03T00:00:00Z',updatedAt:'2026-11-03T00:00:00Z',version:'"o11111111-2222-4333-8444-555555555555:1790000000000000"',capabilities:['tenant.read','tenant.update']};
  assert.ok(validate(value));
  assert.equal(validate({...value,accessToken:'not-allowed'}),false);
  assert.equal(validate({...value,version:'W/"t1"'}),false);
});
