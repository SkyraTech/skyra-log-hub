const quotaEvidenceLabel=process.env.SKYRA_QUOTA_EVIDENCE_LABEL??'feature008';if(!/^(?:dev01[2345678]-quota|feature(?:008|009-quota|010-quota|011-quota))$/.test(quotaEvidenceLabel))throw Error('Invalid quota evidence label');
import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {root,readState,testEnvironment} from '../../scripts/isolated-postgres.mjs';import {connectIsolatedClient} from '../../scripts/lib/isolated-target.mjs';
import {seedCredentialFixtures} from '../../scripts/lib/credential-test-fixtures.mjs';
import {AdminConfigService} from '../../apps/admin-service/dist/core/config/admin-config.service.js';import {adminPrisma} from '../../apps/admin-service/dist/core/database/admin-prisma.js';import {ProjectsService} from '../../apps/admin-service/dist/modules/projects/projects.service.js';import {QuotasService} from '../../apps/admin-service/dist/modules/projects/quotas.service.js';import {CredentialsService} from '../../apps/admin-service/dist/modules/credentials/credentials.service.js';import {EffectivePermissionResolver} from '../../apps/admin-service/dist/modules/authorization/application/effective-permission.resolver.js';
import {quotaGateway} from './gateway-stack.mjs';import {ingestionBatch,sendCredentialLog} from '../credentials/gateway-stack.mjs';import {runSample} from '../../examples/managed-ingestion/sample.mjs';
test('FEATURE-008 real PostgreSQL, managed credentials, SDK, multi-process Gateway and durable accounting',{timeout:180000},async t=>{
  const state=readState(),env=testEnvironment(state),owner=await connectIsolatedClient(env.ISOLATED_DATABASE_URL,env),evidence=path.join(root,'.tmp/'+quotaEvidenceLabel+'-evidence');
  const privateState=JSON.parse(fs.readFileSync(path.join(root,'.tmp/feature001a-postgres/organization-runtime.json')));assert.equal(privateState.clusterId,state.clusterId);const url=new URL(env.ISOLATED_DATABASE_URL);url.username='skyra_org_runtime';url.password=privateState.password;
  const f=await seedCredentialFixtures(owner,state.clusterId),config=new AdminConfigService({ADMIN_PERSISTENCE_ENABLED:'true',DATABASE_URL:url.href,TRUSTED_OIDC_ISSUERS:f.issuer}),projects=new ProjectsService(config,new EffectivePermissionResolver()),credentials=new CredentialsService(config,projects),quotas=new QuotasService(config,projects),gateways=[];
  const p=(scope,user='owner',tenant=f.tenantA)=>({sub:f.users[user].subject,identityIssuer:f.issuer,tenantId:tenant,scope});
  const createProject=async(name,tenant=f.tenantA)=>{const id='quota-'+name+'-'+crypto.randomUUID().slice(0,8);await owner.query('INSERT INTO projects(id,tenant_id,name,updated_at) VALUES($1,$2,$3,now())',[id,tenant,'Quota '+name]);return id;};
  const issue=async project=>credentials.create(p('credentials.create'),f.tenantA,project,{description:'FEATURE008 isolated credential'},crypto.randomUUID(),'feature008');
  const policy=async(project,events=null,bytes=null,enabled=true)=>{const current=await quotas.read(p('quotas.read'),f.tenantA,project);return quotas.update(p('quotas.manage'),f.tenantA,project,{enabled,dailyEvents:events,dailyBytes:bytes},current.policy.version,'feature008');};
  const usage=async(project,period='2030-01-01')=>(await owner.query('SELECT accepted_events::text,accepted_bytes::text,reserved_events::text,reserved_bytes::text FROM project_usage_windows WHERE tenant_id=$1 AND project_id=$2 AND period=$3',[f.tenantA,project,period])).rows[0]??{accepted_events:'0',accepted_bytes:'0',reserved_events:'0',reserved_bytes:'0'};
  const start=async options=>{const g=await quotaGateway(evidence,{now:'2030-01-01T12:00:00Z',...options});gateways.push(g);return g;};
  let a,b;
  try{
    a=await start();b=await start();
    await t.test('real SDK canonical UTF-8 bytes, exact threshold, duplicate after exhaustion and cross-Gateway replay',async()=>{
      const project=await createProject('sdk'),key=await issue(project);await policy(project,'5');
      const sample=await runSample({endpoint:a.origin+'/ingest/v1/logs',credential:key.rawToken,projectId:project,runId:'quota-sdk-'+crypto.randomUUID()});assert.equal(sample.expected.length,5);
      const row=(await owner.query('SELECT * FROM quota_admissions WHERE tenant_id=$1 AND project_id=$2',[f.tenantA,project])).rows[0];assert.equal(row.state,'COMMITTED');assert.equal(row.events,5);
      const {WalJournalService}=await import('../../apps/ingestion-gateway/dist/storage/wal/wal-journal.service.js');const {deserializeWalFrame}=await import('../../apps/ingestion-gateway/dist/storage/wal/wal-frame.js');const data=fs.readFileSync(path.join(a.store,'wal/active.wal'));const parsed=deserializeWalFrame(data,0);assert.ok(parsed.valid);assert.equal(row.bytes,String(parsed.frame.payload.length));
      assert.deepEqual(await usage(project),{accepted_events:'5',accepted_bytes:row.bytes,reserved_events:'0',reserved_bytes:'0'});
      const replay={protocol_version:'1.0',batch_id:row.batch_id,sent_at:new Date().toISOString(),batch_size:5,events:JSON.parse(parsed.frame.payload.toString())};
      for(const g of [a,b]){const r=await sendCredentialLog(g,key.rawToken,replay);assert.equal(r.status,200);const ack=await r.json();assert.equal(ack.duplicate,true);assert.equal(ack.receipt.receipt_id,row.receipt_id);}
      assert.equal((await sendCredentialLog(a,key.rawToken,ingestionBatch(project))).status,429);assert.equal((await usage(project)).accepted_events,'5');
      const conflict=structuredClone(replay);conflict.events[0].message+='different';assert.equal((await sendCredentialLog(b,key.rawToken,conflict)).status,409);
      fs.writeFileSync(path.join(evidence,'sdk-meter.json'),JSON.stringify({project,events:5,canonicalBytes:row.bytes,batchId:row.batch_id,duplicateCharge:0,byteDefinition:'normalized event-array UTF-8 including brackets and commas'},null,2));
    });
    await t.test('concurrent two-process admission shares one project budget across two credentials',async()=>{
      const project=await createProject('concurrent'),keys=[await issue(project),await issue(project)];await policy(project,'10');
      const requests=Array.from({length:24},(_,i)=>sendCredentialLog(i%2?a:b,keys[i%2].rawToken,ingestionBatch(project)));
      const statuses=(await Promise.all(requests)).map(r=>r.status);assert.equal(statuses.filter(s=>s===200).length,10);assert.equal(statuses.filter(s=>s===429).length,14);assert.equal((await usage(project)).accepted_events,'10');assert.equal((await usage(project)).reserved_events,'0');
      fs.writeFileSync(path.join(evidence,'concurrency.json'),JSON.stringify({processes:2,credentials:2,requests:24,accepted:10,rejected:14,limit:10,overshoot:0},null,2));
    });
    await t.test('byte limit uses exact canonical bytes and rejects the whole batch without charging',async()=>{
      const project=await createProject('bytes'),key=await issue(project),batch=ingestionBatch(project);batch.events[0].message='Unicode cafÃ© ðŸ‘‹';const bytes=Buffer.byteLength(JSON.stringify(batch.events));await policy(project,null,String(bytes));
      assert.equal((await sendCredentialLog(a,key.rawToken,batch)).status,200);assert.equal((await usage(project)).accepted_bytes,String(bytes));
      const r=await sendCredentialLog(a,key.rawToken,ingestionBatch(project));assert.equal(r.status,429);const e=await r.json();assert.equal(e.error.code,'PROJECT_QUOTA_EXCEEDED');assert.equal(e.error.retryable,false);assert.equal((await usage(project)).accepted_events,'1');
    });
    await t.test('invalid credentials, malformed events, suspended projects and foreign project claims do not charge',async()=>{
      const project=await createProject('invalid'),key=await issue(project);await policy(project,'10');
      assert.equal((await sendCredentialLog(a,'skyra_live_'+'0'.repeat(64),ingestionBatch(project))).status,401);
      const malformed=ingestionBatch(project);malformed.events[0].log.level='invalid';assert.equal((await sendCredentialLog(a,key.rawToken,malformed)).status,422);
      assert.equal((await sendCredentialLog(a,key.rawToken,ingestionBatch(f.projectB))).status,403);
      await owner.query("UPDATE projects SET status='SUSPENDED' WHERE id=$1",[project]);assert.equal((await sendCredentialLog(a,key.rawToken,ingestionBatch(project))).status,403);assert.equal((await usage(project)).accepted_events,'0');
    });
    await t.test('separate project and tenant counters cannot consume the first project budget',async()=>{
      const first=await createProject('isolation-a'),second=await createProject('isolation-b'),key1=await issue(first),key2=await issue(second);await policy(first,'0');await policy(second,'1');
      const r=await Promise.all([sendCredentialLog(a,key1.rawToken,ingestionBatch(first)),sendCredentialLog(b,key2.rawToken,ingestionBatch(second))]);assert.deepEqual(r.map(v=>v.status),[429,200]);
      const foreign=await createProject('foreign',f.tenantB);await assert.rejects(quotas.read(p('quotas.read'),f.tenantA,foreign),e=>e.getStatus()===404);await assert.rejects(quotas.read(p('quotas.read'),f.tenantB,foreign),e=>e.getStatus()===403);
    });
    await t.test('UTC rollover anchors reservations to admission time; past event timestamps do not move usage',async()=>{
      const project=await createProject('rollover'),key=await issue(project);await policy(project,'1');await a.clock('2030-01-01T23:59:59.999Z');
      assert.equal((await sendCredentialLog(a,key.rawToken,ingestionBatch(project))).status,200);assert.equal((await sendCredentialLog(a,key.rawToken,ingestionBatch(project))).status,429);
      await a.clock('2030-01-02T00:00:00.000Z');assert.equal((await sendCredentialLog(a,key.rawToken,ingestionBatch(project))).status,200);assert.equal((await usage(project,'2030-01-01')).accepted_events,'1');assert.equal((await usage(project,'2030-01-02')).accepted_events,'1');await a.clock('2030-01-01T12:00:00Z');
    });
    await t.test('missing, unlimited and disabled policies meter normally; limit reductions preserve usage',async()=>{
      const project=await createProject('policy'),key=await issue(project);assert.equal((await sendCredentialLog(a,key.rawToken,ingestionBatch(project))).status,200);await policy(project,'0');assert.equal((await sendCredentialLog(a,key.rawToken,ingestionBatch(project))).status,429);
      await policy(project,'0','0',false);assert.equal((await sendCredentialLog(a,key.rawToken,ingestionBatch(project))).status,200);await policy(project,null,null);assert.equal((await sendCredentialLog(a,key.rawToken,ingestionBatch(project))).status,200);assert.equal((await usage(project)).accepted_events,'3');
    });
    await t.test('quota permission is independent of project editing, stale saves and audit rollback',async()=>{
      const project=await createProject('authorization');const old=await quotas.read(p('quotas.read'),f.tenantA,project);await policy(project,'5');
      await assert.rejects(quotas.update(p('quotas.manage'),f.tenantA,project,{enabled:true,dailyEvents:'10',dailyBytes:null},old.policy.version,'stale'),e=>e.getStatus()===409);
      const names=Object.keys(f.users);fs.writeFileSync(path.join(evidence,'role-fixture-names.json'),JSON.stringify(names));
      const nonowner=names.find(n=>n==='admin'||n==='developer');if(nonowner)await assert.rejects(quotas.update(p('quotas.manage',nonowner),f.tenantA,project,{enabled:true,dailyEvents:'99',dailyBytes:null},'"q1"','unauthorized'),e=>[403,404].includes(e.getStatus?.()??e.statusCode));
      assert.ok((await owner.query("SELECT count(*)::int n FROM admin_audit_events WHERE tenant_id=$1 AND action='QUOTA_UPDATED' AND target_id=$2",[f.tenantA,project])).rows[0].n>=1);
      for(const bad of [-1,'-1','1.5','9007199254740992',1])assert.throws(()=>quotas.update(p('quotas.manage'),f.tenantA,project,{enabled:true,dailyEvents:bad,dailyBytes:null},'"q1"','bad'),e=>e.getStatus()===400);
    });
    for(const stage of ['reserved','wal-durable','finalized-before-commit'])await t.test('actual process termination at '+stage+' reconciles without double charge',async()=>{
      const project=await createProject('crash'),key=await issue(project);await policy(project,'1');let g=await start({pause:stage});const batch=ingestionBatch(project),request=sendCredentialLog(g,key.rawToken,batch).catch(()=>null);await g.until(m=>m.fault===stage);assert.equal((await usage(project)).reserved_events,'1');await g.stop();await request;
      g=await start({store:g.store});const before=await usage(project);assert.equal(before.reserved_events,'0');assert.equal(before.accepted_events,stage==='reserved'?'0':'1');const retry=await sendCredentialLog(g,key.rawToken,batch);assert.equal(retry.status,200);const ack=await retry.json();assert.equal(ack.duplicate,stage!=='reserved');assert.equal((await usage(project)).accepted_events,'1');await g.stop();
    });
    await t.test('database finalization failure after fsync returns acceptance and reconciles pending capacity',async()=>{
      const project=await createProject('reconcile'),key=await issue(project);await policy(project,'1');let g=await start({throw:'wal-durable'});const batch=ingestionBatch(project);assert.equal((await sendCredentialLog(g,key.rawToken,batch)).status,200);
      for(let i=0;i<40&&(await usage(project)).reserved_events!=='0';i++)await new Promise(r=>setTimeout(r,100));assert.equal((await usage(project)).accepted_events,'1');assert.equal((await usage(project)).reserved_events,'0');assert.equal((await sendCredentialLog(g,key.rawToken,batch)).status,200);await g.stop();
    });
    await t.test('ambiguous WAL failure quarantines admission and recovers surviving fsynced evidence once',async()=>{
      const project=await createProject('wal-failure'),key=await issue(project);await policy(project,'1');let g=await start({throw:'wal-append'});const batch=ingestionBatch(project);assert.equal((await sendCredentialLog(g,key.rawToken,batch)).status,503);assert.equal((await usage(project)).reserved_events,'1');assert.equal((await fetch(g.origin+'/health/ready')).status,503);await g.stop();g=await start({store:g.store});assert.equal((await usage(project)).accepted_events,'1');assert.equal((await sendCredentialLog(g,key.rawToken,batch)).status,200);await g.stop();
    });
    await t.test('process termination during reconciliation rolls back counters and restart finalizes once',async()=>{
      const project=await createProject('recovery-crash'),key=await issue(project);await policy(project,'1');let g=await start({pause:'wal-durable'});const batch=ingestionBatch(project),request=sendCredentialLog(g,key.rawToken,batch).catch(()=>null);await g.until(m=>m.fault==='wal-durable');await g.stop();await request;
      g=await start({store:g.store,pause:'reconciliation-before-commit',startupFault:true});assert.equal((await usage(project)).reserved_events,'1');await g.stop();g=await start({store:g.store});assert.equal((await usage(project)).accepted_events,'1');assert.equal((await usage(project)).reserved_events,'0');assert.equal((await sendCredentialLog(g,key.rawToken,batch)).status,200);await g.stop();
    });
    await t.test('actual database finalization denial retains reservation and reconciles after authority restoration',async()=>{
      const project=await createProject('database-failure'),key=await issue(project);await policy(project,'1');const g=await start();
      await owner.query(`CREATE FUNCTION public.feature008_deny_finalization() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.state='COMMITTED' AND NEW.project_id=TG_ARGV[0] THEN RAISE EXCEPTION 'Isolated database finalization failure'; END IF; RETURN NEW; END $$`);
      await owner.query(`CREATE TRIGGER feature008_deny_finalization BEFORE UPDATE ON quota_admissions FOR EACH ROW EXECUTE FUNCTION public.feature008_deny_finalization('${project}')`);
      try{assert.equal((await sendCredentialLog(g,key.rawToken,ingestionBatch(project))).status,200);assert.equal((await usage(project)).reserved_events,'1');assert.equal((await usage(project)).accepted_events,'0');}finally{await owner.query('DROP TRIGGER feature008_deny_finalization ON quota_admissions');await owner.query('DROP FUNCTION public.feature008_deny_finalization()');}
      for(let i=0;i<40&&(await usage(project)).reserved_events!=='0';i++)await new Promise(r=>setTimeout(r,100));assert.equal((await usage(project)).accepted_events,'1');assert.equal((await usage(project)).reserved_events,'0');await g.stop();
    });
    await t.test('actual audit insertion failure rolls back quota policy and version',async()=>{
      const project=await createProject('audit-failure'),before=await quotas.read(p('quotas.read'),f.tenantA,project);await owner.query('REVOKE INSERT ON admin_audit_events FROM skyra_org_runtime');
      try{await assert.rejects(quotas.update(p('quotas.manage'),f.tenantA,project,{enabled:true,dailyEvents:'1',dailyBytes:null},before.policy.version,'audit-failure'));}finally{await owner.query('GRANT INSERT ON admin_audit_events TO skyra_org_runtime');}
      assert.equal((await quotas.read(p('quotas.read'),f.tenantA,project)).policy.version,before.policy.version);
    });
    const browserProject=await createProject('browser'),browserCredential=await issue(browserProject);await policy(browserProject,'10','100000');await runSample({endpoint:a.origin+'/ingest/v1/logs',credential:browserCredential.rawToken,projectId:browserProject,runId:'quota-browser-'+crypto.randomUUID()});
    const browserUsage=await quotas.read(p('quotas.read'),f.tenantA,browserProject,'2030-01-01');fs.writeFileSync(path.join(evidence,'fixtures.json'),JSON.stringify({...f,quotaProject:browserProject,quotaPeriod:'2030-01-01',quotaUsage:browserUsage},null,2));
    fs.writeFileSync(path.join(evidence,'accounting-acceptance.json'),JSON.stringify({actualSdk:true,actualGatewayProcesses:true,exactByteAccounting:true,concurrentOvershoot:0,crashStages:['reserved','wal-durable','finalized-before-commit'],reconciliation:true,browserFixture:{project:browserProject,events:browserUsage.events.accepted,bytes:browserUsage.bytes.accepted}},null,2));
  }finally{for(const g of gateways)await g.stop();await adminPrisma(config).$disconnect();await owner.end();}
});
