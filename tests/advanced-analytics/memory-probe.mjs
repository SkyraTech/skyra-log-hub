// Test-only memory sampling. Product services never import this module normally.
import fs from 'node:fs';import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..'),directory=path.join(root,process.env.SKYRA_FINAL_ACCEPTANCE_E2E==='true'?'.tmp/dev018-evidence':process.env.SKYRA_AUDIT_USAGE_E2E==='true'?'.tmp/dev017-evidence':process.env.SKYRA_ANALYTICS_FOCUSED==='true'?'.tmp/dev016-focused-evidence':'.tmp/dev016-evidence'),entry=process.argv[1]??'';
if(process.env.SKYRA_ISOLATED_TEST_ENV!=='true'||!['console-bff','query-service'].some(app=>entry===path.join(root,'apps',app,'dist/main.js'))||fs.lstatSync(directory).isSymbolicLink())throw Error('Unverified isolated memory probe');
const app=entry.includes('console-bff')?'console-bff':'query-service',file=path.join(directory,'memory-'+app+'-'+process.pid+'-'+Date.now()+'.jsonl');fs.writeFileSync(file,'',{flag:'wx'});
const sample=()=>fs.appendFileSync(file,JSON.stringify({at:Date.now(),...process.memoryUsage()})+'\n');sample();const timer=setInterval(sample,100);timer.unref();
