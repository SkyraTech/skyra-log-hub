// Focused local readiness checks. Database runners enforce the owned isolated target.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { root } from './isolated-postgres.mjs';
const label=process.argv[3]??'feature001c';if(!/^feature001[cde]$/.test(label))throw Error('Invalid evidence label');
const dir=path.join(root,`.tmp/${label}-evidence`); fs.mkdirSync(dir,{recursive:true});
const groups={
  migrations:[['node','scripts/isolated-postgres.mjs','reset'],['node','scripts/rehearse-admin-migration.mjs','baseline'],['node','scripts/run-isolated-pg-tests.mjs'],['node','scripts/rehearse-admin-migration.mjs','harden'],['node','scripts/prepare-organization-tests.mjs'],['node','scripts/run-isolated-pg-tests.mjs','hardened']],
  services:['admin-service','console-bff','console-web'].flatMap(app=>['typecheck','build','test'].map(task=>['pnpm','--filter',`@skyra/${app}`,task])),
  integration:[['node','--experimental-strip-types','--test','tests/contracts/admin-contracts.test.ts','tests/contracts/organization-contracts.test.ts'],['node','--test','tests/admin/isolated-target.test.mjs'],['node','--test','tests/organization/persistence.test.mjs'],['node','--test','tests/organization/organization.e2e.mjs'],['node','scripts/verify-design-system-governance.cjs'],['node','scripts/sync-schemas.mjs','--check']],
};
const group=process.argv[2]; if(!groups[group])throw Error('Use migrations|services|integration');
if(['feature001d','feature001e'].includes(label)&&group==='integration')groups.integration.push(['node','scripts/run-entra-organization-e2e.mjs'],['node','scripts/run-isolated-pg-tests.mjs','hardened'],['node','scripts/run-isolated-compatibility.mjs']);
const results=[];
const commandEnv={...process.env,SKYRA_ORGANIZATION_EVIDENCE_LABEL:label};
for(const [tool,...args] of groups[group]) {
  const command=[tool,...args].join(' '), start=new Date().toISOString();
  const result=tool==='pnpm' && process.platform==='win32'
    ? spawnSync('cmd.exe',['/d','/s','/c',command],{cwd:root,env:commandEnv,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:20*1024*1024})
    : spawnSync(tool==='node'?process.execPath:tool,args,{cwd:root,env:commandEnv,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:20*1024*1024});
  const log=(result.stdout||'')+(result.stderr||'');
  const file=`${group}-${results.length+1}.log`;fs.writeFileSync(path.join(dir,file),log);
  const row={command,start,exitCode:result.status,error:result.error?.code,log:file,summary:log.split(/\r?\n/).filter(l=>/^(?:#|ℹ) (tests|pass|fail|suites|cancelled|skipped)\b/.test(l))};
  results.push(row);fs.writeFileSync(path.join(dir,`${group}.json`),JSON.stringify(results,null,2));console.log(JSON.stringify(row));
  if(result.status!==0)process.exit(1);
}
