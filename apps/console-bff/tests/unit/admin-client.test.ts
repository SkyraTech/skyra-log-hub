import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BffConfigService } from '../../src/config/bff-config.service.js';
import { AdminClientService } from '../../src/modules/auth/application/admin-client.service.js';
test('Admin bridge propagates precondition/correlation, scopes assertions and maps timeouts', async () => {
  const old={...process.env}, fetchOriginal=globalThis.fetch;
  try {
    Object.assign(process.env,{NODE_ENV:'test',BFF_USE_AUTHORITATIVE_MEMBERSHIP:'true',INTERNAL_JWT_SECRET:'test-only-secret-32-characters-at-least'});
    const service=new AdminClientService(new BffConfigService());
    globalThis.fetch=async (_url,init) => {
      const h=init!.headers as Record<string,string>;
      assert.equal(h['If-Match'],'"t123"');assert.equal(h['X-Correlation-ID'],'correlation-test');
      const payload=JSON.parse(Buffer.from(h['Authorization']!.split('.')[1]!,'base64url').toString());
      assert.equal(payload.tenant_id,'tenant-scope');assert.equal(payload.sub,'verified-subject');assert.equal(payload.scope,'organization');assert.equal(payload.exp-payload.iat,60);assert.ok(init!.signal);
      return new Response('{}',{headers:{ETag:'"t124"'}});
    };
    assert.equal((await service.request('verified-subject','tenant-scope','PATCH',{name:'Updated'},'"t123"','correlation-test')).etag,'"t124"');
    globalThis.fetch=async()=>{throw new DOMException('timeout','TimeoutError');};
    await assert.rejects(service.request('verified-subject','tenant-scope','GET'),(error: any)=>error.getStatus()===504);
  } finally {globalThis.fetch=fetchOriginal;for(const key of Object.keys(process.env))if(!(key in old))delete process.env[key];Object.assign(process.env,old);}
});
