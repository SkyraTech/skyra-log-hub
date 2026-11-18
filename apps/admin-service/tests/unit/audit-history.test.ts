import {test} from 'node:test';import assert from 'node:assert/strict';
import {auditQuery,auditMicros,signAuditCursor,readAuditCursor} from '../../src/core/audit/application/audit-query.js';
import {projectAudit} from '../../src/core/audit/application/audit-projection.js';
const secret='test-only-cursor-key-'.repeat(3),id='11111111-2222-4333-8444-555555555555';
test('audit time filters preserve microsecond boundaries and reject normalized impossible dates',()=>{
 const q=auditQuery({start:'2024-01-01T12:00:00.123456Z',end:'2024-01-01T12:00:00.123457Z'});assert.equal(auditMicros(q.end)-auditMicros(q.start),1n);
 for(const d of [{start:'2024-02-30T00:00:00Z',end:'2024-03-01T00:00:00Z'},{start:q.end,end:q.start},{start:'2020-01-01T00:00:00Z',end:'2026-01-01T00:00:00Z'},{tenantId:id},{limit:'1000'},{action:"' OR TRUE--"}])assert.throws(()=>auditQuery(d));
});
test('audit cursors bind filters/reader, expire, and reject alternate signature encodings',()=>{
 const anchor='2026-11-09T12:00:00.123457Z',last={timestamp:'2026-11-09T12:00:00.123456Z',id},token=signAuditCursor(secret,'scope',anchor,last);
 assert.deepEqual(readAuditCursor(secret,token,'scope').last,last);assert.throws(()=>readAuditCursor(secret,token,'foreign'));assert.throws(()=>readAuditCursor(secret+'x',token,'scope'));
 assert.throws(()=>readAuditCursor(secret,signAuditCursor(secret,'scope',anchor,last,1),'scope'));const [payload,sig]=token.split('.');const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',lastIndex=alphabet.indexOf(sig!.at(-1)!);const alternate=sig!.slice(0,-1)+alphabet[lastIndex^1];assert.throws(()=>readAuditCursor(secret,payload+'.'+alternate,'scope'));
});
test('audit projection withholds unknown, oversized and nested credential/session fields',()=>{
 const row={id,timestamp:'2026-11-09T00:00:00.000001Z',actor_user_id:id,action:'CREDENTIAL_REVOKED',target_type:'credential',target_id:id,details:JSON.stringify({before:{id,isRevoked:false,password:'PRIVATE'},after:{id,isRevoked:true,rawToken:'skyra_live_'+'a'.repeat(64)},sessionId:'PRIVATE-SESSION',connection:'postgresql://private',correlationId:'safe-correlation'})};
 const projected=projectAudit(row);assert.equal(projected.changes.find(c=>c.field==='isRevoked')?.after,true);assert.equal(/PRIVATE|skyra_live_|postgresql/.test(JSON.stringify(projected)),false);
 assert.deepEqual(projectAudit({...row,action:'FUTURE_ACTION'}).changes,[]);assert.equal(projectAudit({...row,actor_user_id:null}).actorLabel,'Actor unavailable');assert.equal(projectAudit({...row,action:'TENANT_UPDATED',details:{after:{name:'Bearer private'}}}).changes.length,0);
});

test('audit summaries name actual changed fields while preserving stored unchanged values',()=>{
 const d=projectAudit({id,timestamp:'2026-11-09T00:00:00Z',actor_user_id:id,action:'PROJECT_UPDATED',target_type:'project',target_id:'test-project',details:{before:{name:'Old',status:'ACTIVE'},after:{name:'New',status:'ACTIVE'}}});assert.equal(d.summary,'Project updated \u00b7 Project name');assert.equal(d.changes.length,2);
});
