import {test}from'node:test';import assert from'node:assert/strict';import {EventEmitter}from'node:events';import {AuditExportController}from'../../apps/console-bff/dist/modules/auth/api/audit-export.controller.js';
test('Audit server deadline cancels a pending authority check while retaining its resource slot until settlement',{timeout:20000},async()=>{
 let settle;const authority=new Promise(resolve=>settle=resolve),raw=new EventEmitter();raw.writableFinished=false;raw.destroyed=false;const req={raw:new EventEmitter(),session:{sessionId:'isolated-deadline',activeTenantId:'tenant',user:{id:'subject'}}},reply={raw,sent:false};
 const c=new AuditExportController({requestAudit:()=>{throw Error('Should not reach Admin before authority');}},{authenticate:()=>authority},{advancedAuditUsageEnabled:true}),start=performance.now();
 await assert.rejects(c.export({format:'json',filters:{}},req,reply),e=>e.getStatus()===504);assert.ok(performance.now()-start>=14500);assert.equal(c.active.size,1);settle(true);raw.writableFinished=true;raw.emit('finish');await new Promise(setImmediate);assert.equal(c.active.size,0);
});
