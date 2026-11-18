import {test} from 'node:test';import assert from 'node:assert/strict';
import {publicQuota,publicUsage} from '../../src/modules/auth/api/quotas.controller.js';
const policy={enabled:true,canManage:false,version:'"q1"',dailyEvents:'10',dailyBytes:null};
const metric={accepted:'5',reserved:'1',limit:'10',remaining:'4',utilization:60};
const usage={tenantId:'tenant-a',projectId:'project-a',projectName:'Project',period:'2030-01-01',periodStart:'2030-01-01T00:00:00Z',periodEnd:'2030-01-02T00:00:00Z',policy,events:metric,bytes:metric,completeness:'RECONCILING',updatedAt:null,measuredAt:'2030-01-01T12:00:00Z'};
test('quota response projection rejects foreign scope and malformed counters, strips internal accounting fields',()=>{
 const safe=publicUsage({...usage,journal_id:'private',receipt_id:'private',rawToken:'private'},'tenant-a','project-a');assert.equal(JSON.stringify(safe).includes('private'),false);assert.equal(safe.events.reserved,'1');
 for(const d of [{...usage,tenantId:'foreign'},{...usage,projectId:'foreign'},{...usage,events:{...metric,accepted:'-1'}},{...usage,bytes:{...metric,accepted:'9007199254740992'}},{...usage,events:{...metric,utilization:NaN}},{...usage,completeness:'fake'}])assert.throws(()=>publicUsage(d,'tenant-a','project-a'));
});
test('quota projection preserves exact decimal limits without accepting browser grants or secrets',()=>{
 assert.deepEqual(publicQuota({...policy,secret:'private',roles:['OrgOwner']}),policy);
 for(const d of [{...policy,canManage:'true'},{...policy,dailyEvents:10},{...policy,dailyBytes:'9007199254740992'}])assert.throws(()=>publicQuota(d));
});
