import {test} from 'node:test';import assert from 'node:assert/strict';import {publicAuditEvent,auditFilters} from '../../src/modules/auth/api/audit-history.controller.js';
const id='11111111-2222-4333-8444-555555555555',row={id,timestamp:'2026-11-09T00:00:00.123456Z',action:'CREDENTIAL_REVOKED',actorId:id,resourceType:'credential',resourceId:id,correlationId:null,metadataOmitted:false,changes:[{field:'isRevoked',before:false,after:true,beforeAvailable:true,afterAvailable:true}]};
test('audit BFF projects canonical safe fields and rebuilds untrusted labels/summaries',()=>{
 const event=publicAuditEvent({...row,summary:'PRIVATE-TOKEN',actorEmail:'PRIVATE-EMAIL',rawToken:'PRIVATE',actionLabel:'PRIVATE'});assert.equal(event.actionLabel,'Credential revoked');assert.equal(JSON.stringify(event).includes('PRIVATE'),false);
 for(const r of [{...row,actorId:'foreign'},{...row,changes:[{...row.changes[0],field:'password'}]},{...row,resourceId:'skyra_live_'+'a'.repeat(64)},{...row,correlationId:'f'.repeat(64)}])assert.throws(()=>publicAuditEvent(r));
 const unknown=publicAuditEvent({...row,action:'FUTURE_ADMIN_ACTION',changes:row.changes});assert.deepEqual(unknown.changes,[]);assert.equal(unknown.metadataOmitted,true);
});
test('audit BFF rejects tenant/role overrides, arrays and oversized cursors',()=>{
 for(const q of [{tenantId:id},{role:'OrgOwner'},{cursor:'x'.repeat(2049)},{action:['PROJECT_CREATED','TENANT_UPDATED']}])assert.throws(()=>auditFilters(q));assert.equal(auditFilters({actorId:id,limit:'25'}),'actorId='+id+'&limit=25');
});
