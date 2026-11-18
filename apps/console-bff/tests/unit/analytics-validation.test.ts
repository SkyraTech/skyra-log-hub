import {test} from 'node:test';import assert from 'node:assert/strict';import {validateAggregateRequest} from '../../src/modules/query-proxy/api/aggregate-validation.js';
const body={time_range:{start:'2026-11-06T00:00:00Z',end:'2026-11-06T01:00:00Z'},projects:['project-a'],include_empty_buckets:true,aggregations:[{name:'volume',type:'date_histogram',field:'@timestamp',interval:'1m'}]};
test('analytics accepts bounded canonical UTC aggregation without constructing SQL',()=>assert.deepEqual(validateAggregateRequest(body),body));
test('analytics refuses unknown scope/SQL, prototype intervals and excess aggregate budgets',()=>{for(const b of [{...body,tenantId:'foreign'},{...body,sql:'SELECT private'},{...body,cursor:'not-an-aggregate'},{...body,aggregations:[{...body.aggregations[0],interval:'constructor'}]},{...body,aggregations:Array.from({length:6},(_,i)=>({...body.aggregations[0],name:'n'+i}))},{...body,aggregations:[{name:'terms',type:'terms',field:'service.name',size:51}]}])assert.throws(()=>validateAggregateRequest(b));});
test('analytics bucket limit counts UTC alignment and rejects calendar rollover',()=>{assert.throws(()=>validateAggregateRequest({...body,time_range:{start:'2026-01-01T00:00:00.001Z',end:'2026-01-02T09:20:00.001Z'}}));assert.throws(()=>validateAggregateRequest({...body,time_range:{start:'2026-02-30T00:00:00Z',end:'2026-12-01T00:00:00Z'}}));});

test('analytics rejects non-object envelopes before inspecting fields',()=>{for(const value of [null,[],true])assert.throws(()=>validateAggregateRequest(value as any));});

test('analytics refuses reserved aggregation names',()=>{for(const name of ['__proto__','constructor','prototype'])assert.throws(()=>validateAggregateRequest({...body,aggregations:[{...body.aggregations[0],name}]}));});
