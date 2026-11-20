import {pathToFileURL} from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import axe from 'axe-core';
import { root, readState, testEnvironment, isolatedAdminClient } from '../../scripts/isolated-postgres.mjs';
import { connectIsolatedClient, connectIsolatedRuntimeClient } from '../../scripts/lib/isolated-target.mjs';

test('Organization vertical slice: real PostgreSQL → Admin → BFF → Angular', { timeout: process.env.SKYRA_INTEGRATED_E2E==='true'?1200000:300000 }, async t => {
  const state=readState(), env=testEnvironment(state);
  const owner=await connectIsolatedClient(env.ISOLATED_DATABASE_URL,env);
  const physical=await isolatedAdminClient(state);await physical.end();
  const runtimeSecret=JSON.parse(fs.readFileSync(path.join(root,'.tmp/feature001a-postgres/organization-runtime.json'),'utf8'));
  assert.equal(runtimeSecret.clusterId,state.clusterId);
  const runtimeUrl=new URL(env.ISOLATED_DATABASE_URL); runtimeUrl.username='skyra_org_runtime';runtimeUrl.password=runtimeSecret.password;
  const runtime=await connectIsolatedRuntimeClient(runtimeUrl.href,env);
  const quotaEvidenceLabel=process.env.SKYRA_QUOTA_EVIDENCE_LABEL??'feature008';if(!process.env.SKYRA_EVIDENCE_DIR&&!/^(?:dev01[2345678](?:-quota|-focused)?|feature(?:008|009-quota|010|010-audit|010-quota|011|011-regression|011-audit|011-quota))$/.test(quotaEvidenceLabel))throw Error('Invalid quota evidence label');
  const integratedMode=process.env.SKYRA_INTEGRATED_E2E==='true';
  const auditMode=process.env.SKYRA_AUDIT_E2E==='true';
  const quotaMode=process.env.SKYRA_QUOTA_E2E==='true';
  const pipelineMode=process.env.SKYRA_PIPELINE_E2E==='true';
  const credentialsMode=process.env.SKYRA_CREDENTIALS_E2E==='true';
  const projectsMode=process.env.SKYRA_PROJECTS_E2E==='true'||credentialsMode||pipelineMode;
  const membersMode=process.env.SKYRA_MEMBERS_E2E==='true'||projectsMode;
  const fixtures=JSON.parse(fs.readFileSync(path.join(root,integratedMode?'.tmp/'+(process.env.SKYRA_FINAL_ACCEPTANCE_E2E==='true'?'dev018':process.env.SKYRA_AUDIT_USAGE_E2E==='true'?'dev017':process.env.SKYRA_ANALYTICS_FOCUSED==='true'?'dev016-focused':process.env.SKYRA_ADVANCED_ANALYTICS_E2E==='true'?'dev016':process.env.SKYRA_ADVANCED_EXPLORER_E2E==='true'?'dev015':process.env.SKYRA_SDK_RELIABILITY_E2E==='true'?'dev014':process.env.SKYRA_SESSION_E2E==='true'?'dev013':process.env.SKYRA_STORAGE_E2E==='true'?'dev012':'feature011')+'-evidence/fixtures.json':auditMode?'.tmp/'+(process.env.SKYRA_AUDIT_EVIDENCE_LABEL??'feature009')+'-evidence/fixtures.json':quotaMode?'.tmp/'+quotaEvidenceLabel+'-evidence/fixtures.json':pipelineMode?(process.env.SKYRA_FEATURE011_REGRESSIONS==='true'?'.tmp/feature011-regression-evidence/fixtures.json':process.env.SKYRA_DEVELOPER_E2E==='true'?'.tmp/feature010-evidence/fixtures.json':process.env.SKYRA_FEATURE009_REGRESSIONS==='true'?'.tmp/feature009-regression-evidence/fixtures.json':process.env.SKYRA_QUOTA_REGRESSIONS==='true'?'.tmp/feature008-regression-evidence/fixtures.json':process.env.SKYRA_ANALYTICS_E2E==='true'?'.tmp/feature007-evidence/fixtures.json':process.env.SKYRA_EXPLORER_E2E==='true'?'.tmp/feature006-evidence/fixtures.json':'.tmp/feature005-evidence/fixtures.json'):credentialsMode?'.tmp/feature004-evidence/fixtures.json':projectsMode?'.tmp/feature003-evidence/fixtures.json':membersMode?'.tmp/feature002-evidence/fixtures.json':'.tmp/feature001b-evidence/fixtures.json'),'utf8'));
  const protocol=process.env.SKYRA_ORGANIZATION_OIDC_PROTOCOL_TEST==='true';
  const peer=protocol?await (await import('../../apps/console-bff/dist-test/tests/helpers/oidc-test-provider.fixture.js')).startOidcTestProvider():null;
  const originalIssuer=fixtures.issuer;
  const evidenceLabel=process.env.SKYRA_ORGANIZATION_EVIDENCE_LABEL??(protocol?'feature001d':'feature001b');
  if(!process.env.SKYRA_EVIDENCE_DIR&&!/^(?:dev01[2345678](?:-quota|-focused)?|feature(?:001[bcde]|002|003|004|005|006|007|008|008-regression|009|009-regression|009-quota|010|010-audit|010-quota|011|011-regression|011-audit|011-quota))$/.test(evidenceLabel))throw Error('Invalid organization evidence label');
  const evidence=process.env.SKYRA_EVIDENCE_DIR?path.resolve(process.env.SKYRA_EVIDENCE_DIR):path.join(root,`.tmp/${evidenceLabel}-evidence`);fs.mkdirSync(evidence,{recursive:true});
  if(peer)fixtures.issuer=peer.issuer;
  const freePort=()=>new Promise(resolve=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});
  const adminPort=await freePort(), bffPort=await freePort();
  const secret=crypto.randomBytes(48).toString('hex');
  let adminChild,bffChild,browser,pipelineQuery,integratedGateway,exportProxy;
  const logs=[];
  const launches=new Map();
  const launch=(app,variables)=>{
    const count=launches.get(app)||0;launches.set(app,count+1);
    const output=fs.openSync(path.join(evidence,`${app}${count?'-restart':''}.log`),'w'); logs.push(output);
    const runtimeEnv={...process.env,NODE_ENV:'test',...variables};if(app==='console-bff'){delete runtimeEnv.DATABASE_URL;delete runtimeEnv.ISOLATED_DATABASE_URL;}
    return spawn(process.execPath,[...(process.env.SKYRA_ADVANCED_ANALYTICS_E2E==='true'&&app==='console-bff'?['--import',pathToFileURL(path.join(root,'tests/advanced-analytics/memory-probe.mjs')).href]:[]),path.join(root,`apps/${app}/dist/main.js`)],{cwd:root,windowsHide:true,env:runtimeEnv,stdio:['ignore',output,output]});
  };
  const wait=async url=>{for(let i=0;i<100;i++){try{const r=await fetch(url);if(r.status<500)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw new Error(`Service did not start: ${url}`);};
  const adminEnv={ADVANCED_AUDIT_USAGE_ENABLED:process.env.SKYRA_AUDIT_USAGE_E2E==='true'?'true':'false',DASHBOARD_PREFERENCES_ENABLED:process.env.SKYRA_ADVANCED_ANALYTICS_E2E==='true'?'true':'false',SAVED_SEARCHES_ENABLED:process.env.SKYRA_ADVANCED_EXPLORER_E2E==='true'?'true':'false',AUDIT_HISTORY_ENABLED:auditMode||integratedMode?'true':'false',QUOTA_USAGE_ENABLED:quotaMode||auditMode||integratedMode?'true':'false',PORT:String(adminPort),ADMIN_PERSISTENCE_ENABLED:'true',DATABASE_URL:runtimeUrl.href,INTERNAL_JWT_SECRET:secret,TRUSTED_OIDC_ISSUERS:fixtures.issuer};
  const dist=path.join(root,'apps/console-web/dist/console-web/browser');
  const ui=http.createServer((req,res)=>{
    if(req.url.startsWith('/bff/')){
      const proxy=http.request({hostname:'127.0.0.1',port:bffPort,path:req.url,method:req.method,headers:req.headers},up=>{res.writeHead(up.statusCode,up.headers);up.pipe(res);});
      proxy.on('error',()=>{if(res.destroyed)return;if(!res.headersSent){res.writeHead(502);res.end();}else res.destroy();});req.pipe(proxy);return;
    }
    const pathname=new URL(req.url,'http://localhost').pathname;
    let file=path.resolve(dist,'.'+pathname);
    if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(dist,'index.html');
    const mime={'.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.json':'application/json','.html':'text/html'};
    let content=fs.readFileSync(file);
    if(file.endsWith('index.html'))content=Buffer.from(content.toString().replace('<head>',`<head><script>globalThis.__SKYRA_CONFIG__={adminApiBaseUrl:${JSON.stringify(uiOrigin)},previewMode:false,advancedAuditUsage:${process.env.SKYRA_AUDIT_USAGE_E2E==='true'},advancedAnalytics:${process.env.SKYRA_ADVANCED_ANALYTICS_E2E==='true'},advancedExplorer:${process.env.SKYRA_ADVANCED_EXPLORER_E2E==='true'}};</script>`));
    res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(content);
  });
  await new Promise(resolve=>ui.listen(0,'127.0.0.1',resolve));
  const browserHost=process.env.SKYRA_ORGANIZATION_BROWSER_HOST??'127.0.0.1';
  if(!['127.0.0.1','localhost'].includes(browserHost))throw Error('Unapproved local browser host');
  const uiOrigin=`http://${browserHost}:${ui.address().port}`;
  const token=(tenant,subject=fixtures.users.owner.subject,extra={})=>{
    const now=Math.floor(Date.now()/1000), h=Buffer.from(JSON.stringify({alg:'HS256'})).toString('base64url');
    const p=Buffer.from(JSON.stringify({iss:'https://auth.skyra.internal',aud:'skyra-admin-service',sub:subject,identity_issuer:fixtures.issuer,tenant_id:tenant,scope:'organization',iat:now,exp:now+60,...extra})).toString('base64url');
    return `${h}.${p}.${crypto.createHmac('sha256',secret).update(`${h}.${p}`).digest('base64url')}`;
  };
  const direct=(tenant,subject,options={},claims={})=>fetch(`http://127.0.0.1:${adminPort}/admin/v1/tenants/${tenant}`,{...options,headers:{Authorization:`Bearer ${token(fixtures.tenantA,subject,claims)}`,...options.headers}});
  const login=async(label='owner',expectedFailure=false)=>{
    const context=await browser.newContext();
    const auth=await (await context.request.get(`${uiOrigin}/bff/auth/login?redirect=false&returnUrl=/organization`)).json();
    if(peer) {
      peer.state.subject=fixtures.users[label].subject;
      const authorization=await context.request.get(auth.authorizationUrl,{maxRedirects:0});assert.equal(authorization.status(),302);
      const callback=await context.request.get(authorization.headers().location,{maxRedirects:0});
      if(expectedFailure){assert.ok(callback.status()>=400&&callback.status()<500);assert.equal((await context.cookies()).some(cookie=>cookie.name==='skyra-session'),false);}
      else if(label!=='disabled')assert.equal(callback.status(),302,`real callback failed ${callback.status()}`);
      return context;
    }
    const code=`mock:${fixtures.users[label].subject}:${label}@test.invalid:Organization%20Test`;
    const callback=await context.request.get(`${uiOrigin}/bff/auth/callback?state=${auth.state}&code=${encodeURIComponent(code)}`);
    if(label!=='disabled')assert.ok(callback.status()<400,`callback failed ${callback.status()}`);
    return context;
  };
  const view=async context=>{const r=await context.request.get(`${uiOrigin}/bff/organization`);assert.equal(r.status(),200,await r.text());return r.json();};
  const patch=async(context,name,version,extra={},csrf=true)=>{
    const session=await (await context.request.get(`${uiOrigin}/bff/session`)).json();
    return context.request.patch(`${uiOrigin}/bff/organization`,{headers:{Origin:uiOrigin,...(csrf?{'X-CSRF-Token':session.csrfToken}:{}),...(version?{'If-Match':version}:{}),...extra},data:typeof name==='object'?name:{name}});
  };
  const auditCount=async()=>Number((await owner.query("SELECT count(*) FROM admin_audit_events WHERE tenant_id=$1 AND action='TENANT_UPDATED'",[fixtures.tenantA])).rows[0].count);
  try {
    if(peer){
      await owner.query('UPDATE users SET issuer=$1 WHERE id=ANY($2::uuid[])',[peer.issuer,Object.values(fixtures.users).map(user=>user.id)]);
      peer.state.redirects.add(uiOrigin+'/bff/auth/callback');peer.state.redirects.add(uiOrigin+'/login');
    }
    adminChild=launch('admin-service',adminEnv);await wait(`http://127.0.0.1:${adminPort}/health/liveness`);
    if(integratedMode){integratedGateway=await (await import('../quotas/gateway-stack.mjs')).quotaGateway(evidence,{now:'2030-01-01T12:00:00Z',metrics:true,...((process.env.SKYRA_STORAGE_E2E==='true'||process.env.SKYRA_SESSION_E2E==='true')?{maxSegmentBytes:4096}:{})});pipelineQuery=await (await import('../credentials/feature005-query-stack.mjs')).startQueryStack({storeRoot:integratedGateway.store},evidence);}
    if(pipelineMode){const marker=JSON.parse(fs.readFileSync(path.join(evidence,'ingestion-store.json')));pipelineQuery=await (await import('../credentials/feature005-query-stack.mjs')).startQueryStack({storeRoot:marker.storeRoot},evidence);}
    const sessionRuntime=await (await import('../../scripts/lib/session-test-runtime.mjs')).sessionTestEnvironment();
    if(process.env.SKYRA_ADVANCED_EXPLORER_E2E==='true')exportProxy=await (await import('../advanced-explorer/query-proxy.mjs')).queryFaultProxy(pipelineQuery.origin);
    const bffVariables={ADVANCED_AUDIT_USAGE_ENABLED:process.env.SKYRA_AUDIT_USAGE_E2E==='true'?'true':'false',ADVANCED_ANALYTICS_ENABLED:process.env.SKYRA_ADVANCED_ANALYTICS_E2E==='true'?'true':'false',ADVANCED_EXPLORER_ENABLED:process.env.SKYRA_ADVANCED_EXPLORER_E2E==='true'?'true':'false',BFF_PORT:String(bffPort),...(pipelineQuery?{QUERY_SERVICE_URL:exportProxy?.origin??pipelineQuery.origin,QUERY_SERVICE_JWT_SECRET:pipelineQuery.secret}:{}),BFF_ALLOWED_ORIGINS:uiOrigin,ADMIN_SERVICE_URL:`http://127.0.0.1:${adminPort}`,BFF_USE_AUTHORITATIVE_MEMBERSHIP:'true',INTERNAL_JWT_SECRET:secret,OIDC_ISSUER_URL:fixtures.issuer,ENABLE_MOCK_OIDC:'true',...(peer?{...peer.environment,OIDC_REDIRECT_URI:uiOrigin+'/bff/auth/callback',OIDC_POST_LOGOUT_REDIRECT_URI:uiOrigin+'/login'}:{}),...sessionRuntime};
    const startBff=async()=>{bffChild=launch('console-bff',bffVariables);await wait(`http://127.0.0.1:${bffPort}/bff/auth/readiness`);};
    const stopBff=async(crash=false)=>{if(bffChild.exitCode!==null||bffChild.signalCode)return;const done=new Promise(r=>bffChild.once('exit',r));bffChild.kill(crash?'SIGKILL':'SIGTERM');await done;};
    const bffControl={variables:bffVariables,stop:stopBff,start:startBff,restart:async(crash=false)=>{await stopBff(crash);await startBff();}};
    await startBff();
    if(process.env.SKYRA_FINAL_ACCEPTANCE_E2E==='true')fs.writeFileSync(path.join(evidence,'service-topology.json'),JSON.stringify({origins:{console:uiOrigin,bff:'http://127.0.0.1:'+bffPort,admin:'http://127.0.0.1:'+adminPort,query:pipelineQuery.origin,gateway:integratedGateway.origin,controlledOidcIssuer:peer.issuer},postgres:{host:state.host,port:state.port,database:state.database,clusterId:state.clusterId,dataDirectory:state.data},runtimeRoles:{admin:'skyra_org_runtime',gateway:'skyra_ingestion_runtime',query:pipelineQuery.runtimeRole,sessions:'skyra_bff_sessions_runtime'},features:{signedOidcProtocol:protocol,previewMode:false,mockBusinessApis:false,durableSessions:sessionRuntime.SESSION_STORE_BACKEND==='postgres',meteredGateway:true,audit:true,usage:true,advancedExplorer:true,advancedAnalytics:true,advancedAuditUsage:true},ownedStorage:{store:integratedGateway.store,wal:path.join(integratedGateway.store,'wal'),archive:path.join(integratedGateway.store,'archive')},serviceArgv:['node apps/admin-service/dist/main.js','node apps/console-bff/dist/main.js','node apps/query-service/dist/main.js','node tests/quotas/gateway-child.mjs','optimized Console served by existing organization integration harness','RS256/JWKS controlled signed-OIDC fixture'],noRealMicrosoftAuthentication:true,noCredentialsPublished:true},null,2));

    browser=await chromium.launch({headless:true, ...(fs.existsSync(path.join(process.env['ProgramFiles(x86)']||'C:\\Program Files (x86)','Microsoft/Edge/Application/msedge.exe')) ? {channel:'msedge'} : {})});
    // Offline acceptance must not wait on public font CDNs; business APIs stay real.
    const newContext=browser.newContext.bind(browser);browser.newContext=async(...args)=>{const scoped=await newContext(...args);await scoped.route(/^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//,route=>route.abort());return scoped;};
    const context=await login(), page=await context.newPage();
    const fatal=[];page.on('pageerror',error=>fatal.push(error.message));
    if(!(integratedMode||process.env.SKYRA_DEVELOPER_ONLY==='true'||pipelineMode&&process.env.SKYRA_PIPELINE_ONLY==='true'||quotaMode&&process.env.SKYRA_QUOTA_ONLY==='true'||auditMode&&process.env.SKYRA_AUDIT_ONLY==='true')){
    if(peer){
      await t.test('real browser code flow creates a new session, prevents fixation and logs out locally and at provider',async()=>{
        const fresh=await browser.newContext(),screen=await fresh.newPage();peer.state.subject=fixtures.users.owner.subject;
        await screen.goto(`${uiOrigin}/bff/auth/login?returnUrl=/organization`);await screen.getByRole('heading',{name:'Organization overview',exact:true}).waitFor();
        const old=(await fresh.cookies()).find(cookie=>cookie.name==='skyra-session');assert.ok(old?.httpOnly);assert.equal(old.sameSite,'Lax');
        await screen.goto(`${uiOrigin}/bff/auth/login?returnUrl=/organization`);await screen.getByRole('heading',{name:'Organization overview',exact:true}).waitFor();
        const current=(await fresh.cookies()).find(cookie=>cookie.name==='skyra-session');assert.notEqual(current.value,old.value);
        assert.equal((await fetch(`${uiOrigin}/bff/session`,{headers:{Cookie:`skyra-session=${old.value}`}})).status,401);
        const session=await (await fresh.request.get(`${uiOrigin}/bff/session`)).json();
        const response=await fresh.request.post(`${uiOrigin}/bff/auth/logout`,{headers:{Origin:uiOrigin,'X-CSRF-Token':session.csrfToken}});assert.equal(response.status(),200);
        const data=await response.json();assert.ok(data.providerLogoutUrl.startsWith(peer.origin+'/oauth2/v2.0/logout?'));await screen.goto(data.providerLogoutUrl);await screen.waitForURL(uiOrigin+'/login');
        assert.equal((await fresh.request.get(`${uiOrigin}/bff/session`)).status(),401);await fresh.close();
      });
      await t.test('cryptographic callback errors never create a session',async()=>{
        for(const mode of ['signature','issuer','audience','expired','nonce','none','unknown']){peer.state.mode=mode;const denied=await login('owner',true);await denied.close();}peer.state.mode='valid';
      });
      await t.test('verified identity without active membership cannot gain access from provider OrgOwner claims',async()=>{
        for(const label of ['missing','revoked','suspended']){const denied=await login(label);assert.equal((await denied.request.get(`${uiOrigin}/bff/organization`)).status(),403);await denied.close();}
      });
      await t.test('revocation is effective on the next request of an established signed-provider session',async()=>{
        const active=await login('admin');assert.equal((await active.request.get(`${uiOrigin}/bff/organization`)).status(),200);
        try {await owner.query("UPDATE tenant_memberships SET status='REVOKED' WHERE tenant_id=$1 AND user_id=$2",[fixtures.tenantA,fixtures.users.admin.id]);assert.equal((await active.request.get(`${uiOrigin}/bff/organization`)).status(),403);}
        finally {await owner.query("UPDATE tenant_memberships SET status='ACTIVE' WHERE tenant_id=$1 AND user_id=$2",[fixtures.tenantA,fixtures.users.admin.id]);await active.close();}
      });
    }
    await t.test('runtime role cannot alter/drop audit or grant itself schema-owner authority',async()=>{
      for(const sql of ['UPDATE admin_audit_events SET action=action','DELETE FROM admin_audit_events','TRUNCATE admin_audit_events','ALTER TABLE admin_audit_events DISABLE TRIGGER ALL','CREATE TABLE public.runtime_escape(id int)','UPDATE tenants SET code=code','UPDATE tenants SET id=id','UPDATE tenants SET created_at=created_at','UPDATE tenants SET status=status'])await assert.rejects(runtime.query(sql));
      assert.equal((await runtime.query("SELECT rolsuper FROM pg_roles WHERE rolname=current_user")).rows[0].rolsuper,false);
    });
    await t.test('database rejects mismatched project membership and role scope',async()=>{
      await owner.query('BEGIN');
      try {
      const project=crypto.randomUUID();await owner.query("INSERT INTO projects(id,tenant_id,name,updated_at) VALUES($1,$2,'Scope probe',now())",[project,fixtures.tenantB]);
      await owner.query('SAVEPOINT scope_probe');
      await assert.rejects(owner.query('INSERT INTO project_memberships(tenant_id,project_id,user_id) VALUES($1,$2,$3)',[fixtures.tenantA,project,fixtures.users.owner.id]),{code:'23503'});
      await owner.query('ROLLBACK TO SAVEPOINT scope_probe');
      const role=(await owner.query("SELECT id FROM roles WHERE name='Developer'")).rows[0].id;
      await assert.rejects(owner.query('INSERT INTO role_assignments(tenant_id,project_id,user_id,role_id) VALUES($1,$2,$3,$4)',[fixtures.tenantA,project,fixtures.users.owner.id,role]),{code:'23503'});
      } finally {
    if(exportProxy)await exportProxy.close();
    if(integratedGateway)await integratedGateway.stop();await owner.query('ROLLBACK');}
    });
    await t.test('anonymous, forged, expired and cross-tenant assertions are rejected',async()=>{
      assert.equal((await fetch(`http://127.0.0.1:${adminPort}/admin/v1/tenants/${fixtures.tenantA}`)).status,401);
      assert.equal((await direct(fixtures.tenantB)).status,403);
      assert.equal((await direct(fixtures.tenantB,undefined,{method:'PATCH',headers:{'Content-Type':'application/json','If-Match':`"o${fixtures.tenantB}:1"`},body:JSON.stringify({name:'Cross-tenant attempt'})})).status,403);
      assert.equal((await direct(fixtures.tenantA,undefined,{}, {exp:1})).status,401);
      assert.equal((await fetch(`http://127.0.0.1:${adminPort}/admin/v1/tenants/${fixtures.tenantA}`,{headers:{Authorization:'Bearer forged'}})).status,401);
    });
    await t.test('disabled/revoked/missing membership and Viewer role fail closed',async()=>{
      for(const label of ['disabled','revoked','suspended','missing','viewer'])assert.equal((await direct(fixtures.tenantA,fixtures.users[label].subject)).status,403,label);
      const other=await login('viewer');
      const count=await auditCount(), original=await view(context);
      assert.equal((await patch(other,'Unauthorized change',original.version)).status(),403);
      assert.equal((await view(context)).name,original.name);assert.equal(await auditCount(),count);
      const deniedPage=await other.newPage();await deniedPage.goto(`${uiOrigin}/organization`);await deniedPage.getByRole('alert').filter({hasText:'permission'}).waitFor();await deniedPage.screenshot({path:path.join(evidence,'permission-denied.png')});
      await other.close();
    });
    await t.test('BFF requires session, CSRF, valid name-only payload and version',async()=>{
      const anon=await browser.newContext();assert.equal((await anon.request.get(`${uiOrigin}/bff/organization`)).status(),401);
      const anonymousPage=await anon.newPage();await anonymousPage.goto(`${uiOrigin}/organization`);await anonymousPage.waitForURL(/\/login(?:\?|$)/);assert.equal(await anonymousPage.locator('skyra-organization').count(),0);await anon.close();
      const original=await view(context);
      assert.equal((await patch(context,'CSRF rejection',original.version,{},false)).status(),403);
      assert.equal((await patch(context,'No precondition')).status(),428);
      assert.equal((await patch(context,'Wrong organization context',original.version.replace(fixtures.tenantA,fixtures.tenantB))).status(),409);
      for(const value of [{name:'x'},{name:' '.repeat(5)},{name:3},{name:'x'.repeat(256)},{name:'Valid',status:'ACTIVE'},{name:'Valid',tenantId:fixtures.tenantB},{name:'Valid',id:fixtures.tenantB}])assert.equal((await patch(context,value,original.version)).status(),400);
      assert.equal((await context.request.get(`${uiOrigin}/bff/organization?tenantId=${fixtures.tenantB}`)).status(),200);
      assert.equal((await view(context)).id,fixtures.tenantA);
    });
    await t.test('browser loading and saving feedback use the real delayed backend path',async()=>{
      let releaseRead,releaseWrite;
      const readGate=new Promise(resolve=>{releaseRead=resolve;}),writeGate=new Promise(resolve=>{releaseWrite=resolve;});
      await page.route('**/bff/organization',async route=>{await (route.request().method()==='GET'?readGate:writeGate);await route.continue();});
      try {
        await page.goto(`${uiOrigin}/organization/settings`,{waitUntil:'domcontentloaded'});await page.locator('skyra-organization [aria-busy="true"]').waitFor();releaseRead();
        await page.getByLabel('Organization name',{exact:true}).fill(`State feedback organization ${Date.now()}`);
        await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.getByRole('button',{name:'Saving…',exact:true}).waitFor();releaseWrite();
        await page.getByRole('status').filter({hasText:'Organization name saved'}).waitFor();
      } finally {
    if(exportProxy)await exportProxy.close();
    if(integratedGateway)await integratedGateway.stop();releaseRead();releaseWrite();await page.unroute('**/bff/organization');}
    });
    await t.test('browser reads organization and saves persisted trimmed name with immutable audit',async()=>{
      await page.goto(`${uiOrigin}/organization`);await page.getByRole('heading',{name:'Organization overview',exact:true}).waitFor();await page.locator('skyra-organization').getByText(fixtures.tenantA,{exact:true}).waitFor();
      await page.screenshot({path:path.join(evidence,'organization-overview.png'),fullPage:true});
      await page.getByRole('button',{name:'Edit settings',exact:true}).click();
      const input=page.getByLabel('Organization name',{exact:true});await input.fill('  Persisted Organization  ');
      await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.getByRole('status').filter({hasText:'Organization name saved'}).waitFor();
      await page.reload();await input.waitFor();assert.equal(await input.inputValue(),'Persisted Organization');
      const row=(await owner.query('SELECT name FROM tenants WHERE id=$1',[fixtures.tenantA])).rows[0];assert.equal(row.name,'Persisted Organization');
      const event=(await owner.query("SELECT details,actor_user_id FROM admin_audit_events WHERE tenant_id=$1 AND action='TENANT_UPDATED' ORDER BY created_at DESC LIMIT 1",[fixtures.tenantA])).rows[0];
      assert.equal(event.actor_user_id,fixtures.users.owner.id);assert.equal(event.details.after.name,row.name);assert.equal(event.details.outcome,'SUCCESS');assert.ok(event.details.correlationId);
      await assert.rejects(runtime.query('DELETE FROM admin_audit_events WHERE tenant_id=$1',[fixtures.tenantA]));
    });
    await t.test('form validation, cancel and unsaved-change protection work',async()=>{
      const input=page.getByLabel('Organization name',{exact:true});await input.fill(' ');assert.equal(await page.getByRole('button',{name:'Save changes',exact:true}).isDisabled(),true);
      await page.getByRole('button',{name:'Cancel changes',exact:true}).click();await page.waitForFunction(()=>document.querySelector('skyra-tech-input')?.value==='Persisted Organization');assert.equal(await input.inputValue(),'Persisted Organization');
      await input.fill('Draft organization');page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'Back to overview',exact:true}).click();assert.ok(page.url().endsWith('/organization/settings'));
      await page.getByRole('button',{name:'Cancel changes',exact:true}).click();
    });
    await t.test('two browser contexts reject a stale save and preserve the first update',async()=>{
      const second=await login(), other=await second.newPage();await other.goto(`${uiOrigin}/organization/settings`);await other.getByLabel('Organization name',{exact:true}).waitFor();
      await page.getByLabel('Organization name',{exact:true}).fill('Concurrent first update');await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.getByRole('status').filter({hasText:'Organization name saved'}).waitFor();
      await other.getByLabel('Organization name',{exact:true}).fill('Concurrent stale update');await other.getByRole('button',{name:'Save changes',exact:true}).click();await other.getByRole('alert').filter({hasText:'changed'}).waitFor();
      assert.equal((await view(context)).name,'Concurrent first update');await other.screenshot({path:path.join(evidence,'concurrency-conflict.png')});
      other.once('dialog',dialog=>dialog.accept());await other.getByRole('button',{name:'Reload latest values',exact:true}).click();await other.waitForFunction(()=>document.querySelector('skyra-tech-input')?.value==='Concurrent first update');assert.equal(await other.getByLabel('Organization name',{exact:true}).inputValue(),'Concurrent first update');await second.close();
    });
    await t.test('controlled audit failure rolls tenant update back through the full API path',async()=>{
      const original=await view(context), count=await auditCount();
      await owner.query(`CREATE OR REPLACE FUNCTION public.reject_feature001b_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.details->>'correlationId'='feature001b-audit-failure' THEN RAISE EXCEPTION 'Injected audit failure'; END IF; RETURN NEW; END $$`);
      await owner.query('CREATE TRIGGER feature001b_audit_failure BEFORE INSERT ON admin_audit_events FOR EACH ROW EXECUTE FUNCTION public.reject_feature001b_audit()');
      try { assert.equal((await patch(context,'Must not persist',original.version,{'X-Correlation-ID':'feature001b-audit-failure'})).status(),502); }
      finally {await owner.query('DROP TRIGGER feature001b_audit_failure ON admin_audit_events');await owner.query('DROP FUNCTION public.reject_feature001b_audit()');}
      assert.equal((await view(context)).name,original.name);assert.equal(await auditCount(),count);
    });
    await t.test('non-active organization remains readable but denies display-name mutation',async()=>{
      const count=await auditCount();
      await owner.query("UPDATE tenants SET status='SUSPENDED' WHERE id=$1",[fixtures.tenantA]);
      try {
        const original=await view(context);assert.equal(original.status,'SUSPENDED');
        assert.equal((await patch(context,'Inactive edit',original.version)).status(),409);assert.equal(await auditCount(),count);
        await page.reload();await page.getByRole('status').filter({hasText:'not active'}).waitFor();assert.equal(await page.getByRole('button',{name:'Save changes',exact:true}).isDisabled(),true);
      } finally {
    if(exportProxy)await exportProxy.close();
    if(integratedGateway)await integratedGateway.stop();await owner.query("UPDATE tenants SET status='ACTIVE' WHERE id=$1",[fixtures.tenantA]);}
    });
    await t.test('OrgAdmin can update through its real persisted membership',async()=>{
      const context=await login('admin'), original=await view(context);
      assert.equal((await patch(context,'Administrator update',original.version)).status(),200);await context.close();
    });
    await t.test('responsive light/dark presentation, keyboard and component accessibility',async()=>{
      const results=[];
      for(const [label,width,height] of [['desktop',1440,1000],['tablet',768,1024],['mobile',390,844]])for(const theme of ['light','dark']){
        await page.setViewportSize({width,height});await page.evaluate(value=>localStorage.setItem('skyra-theme',value),theme);await page.reload();await page.getByLabel('Organization name',{exact:true}).waitFor();
        await page.evaluate(async()=>{await new Promise(requestAnimationFrame);await Promise.all(document.getAnimations().filter(a=>a.effect&&Number.isFinite(a.effect.getComputedTiming().endTime)).map(a=>a.finished.catch(()=>{})));await new Promise(requestAnimationFrame);});
        await page.addScriptTag({content:axe.source});
        const audit=await page.evaluate(async()=>globalThis.axe.run(document.querySelector('skyra-organization'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));
        results.push({label,theme,violations:audit.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)}))});
        await page.screenshot({path:path.join(evidence,`${label}-${theme}.png`),fullPage:true});
        const bounds=await page.locator('skyra-organization').boundingBox();
        assert.ok(bounds && bounds.x < width && bounds.y < height && bounds.width > Math.min(300,width-30),`${label} organization must be visibly inside the viewport`);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${label} horizontal overflow`);
      }
      fs.writeFileSync(path.join(evidence,'accessibility.json'),JSON.stringify(results,null,2));
      assert.ok(results.every(r=>r.violations.length===0),JSON.stringify(results));
      await page.getByLabel('Organization name',{exact:true}).focus();await page.keyboard.press('Tab');
      assert.equal(await page.getByRole('button',{name:'Back to overview',exact:true}).evaluate(element=>element.getRootNode().activeElement===element),true);
      await page.keyboard.press('Enter');await page.getByRole('heading',{name:'Organization overview',exact:true}).waitFor();assert.deepEqual(fatal,[]);
    });
    await t.test('real service outage shows an error and Retry recovers persisted organization',async()=>{
      const stopped=new Promise(resolve=>adminChild.once('exit',resolve));adminChild.kill();await stopped;
      await page.reload();await page.getByRole('alert').filter({hasText:'unavailable'}).waitFor();await page.screenshot({path:path.join(evidence,'service-error.png'),fullPage:true});
      adminChild=launch('admin-service',adminEnv);await wait(`http://127.0.0.1:${adminPort}/health/liveness`);
      await page.getByRole('button',{name:'Retry',exact:true}).click();await page.getByRole('heading',{name:'Administrator update',exact:true}).waitFor();
    });
    if(membersMode)await (await import('../members/browser-scenarios.mjs')).runMembersScenarios(t,{owner,fixtures,context,page,browser,login,uiOrigin,adminPort,token,evidence});
    if(projectsMode)await (await import('../projects/browser-scenarios.mjs')).runProjectScenarios(t,{owner,fixtures,context,page,browser,login,uiOrigin,adminPort,token,evidence});
    if(credentialsMode)await (await import('../credentials/browser-scenarios.mjs')).runCredentialScenarios(t,{owner,fixtures,context,page,browser,login,uiOrigin,adminPort,token,evidence});
    }
    if(pipelineMode&&process.env.SKYRA_DEVELOPER_ONLY!=='true'&&process.env.SKYRA_ANALYTICS_ONLY!=='true')await (await import('../credentials/feature005-browser.mjs')).runPipelineBrowser(t,{context,page,fixtures,uiOrigin,evidence});
    if(pipelineMode&&process.env.SKYRA_DEVELOPER_ONLY!=='true'&&process.env.SKYRA_PIPELINE_ONLY!=='true'){const credentialEvidence=path.join(evidence,'credentials-regression');fs.mkdirSync(credentialEvidence,{recursive:true});await (await import('../credentials/browser-scenarios.mjs')).runCredentialScenarios(t,{owner,fixtures,context,page,browser,login,uiOrigin,adminPort,token,evidence:credentialEvidence});}
    if(pipelineMode&&process.env.SKYRA_DEVELOPER_ONLY!=='true'&&process.env.SKYRA_EXPLORER_E2E==='true'&&process.env.SKYRA_ANALYTICS_ONLY!=='true')await (await import('../explorer/browser-scenarios.mjs')).runExplorerScenarios(t,{owner,fixtures,context,page,browser,login,uiOrigin,evidence,pipelineQuery});
    if(pipelineMode&&process.env.SKYRA_DEVELOPER_ONLY!=='true'&&process.env.SKYRA_ANALYTICS_E2E==='true')await (await import('../analytics/browser-scenarios.mjs')).runAnalyticsScenarios(t,{owner,fixtures,context,page,browser,login,uiOrigin,evidence,pipelineQuery});
    if(process.env.SKYRA_SESSION_E2E==='true'&&process.env.SKYRA_ANALYTICS_FOCUSED!=='true')await (await import('../sessions/browser-scenarios.mjs')).runSessionBrowserScenarios(t,{owner,fixtures,context,page,browser,login,uiOrigin,evidence,bffControl,peer});
    if(integratedMode&&process.env.SKYRA_ANALYTICS_FOCUSED!=='true')await (await import('../integrated/browser-scenarios.mjs')).runIntegratedScenarios(t,{owner,fixtures,context,page,browser,login,uiOrigin,evidence,gateway:integratedGateway,query:pipelineQuery,adminPort,bffPort,adminControl:{stop:async()=>{const done=new Promise(r=>adminChild.once('exit',r));adminChild.kill();await done;},start:async()=>{adminChild=launch('admin-service',adminEnv);await wait(`http://127.0.0.1:${adminPort}/health/liveness`);}}});
    if(process.env.SKYRA_ADVANCED_EXPLORER_E2E==='true'&&(process.env.SKYRA_ANALYTICS_FOCUSED!=='true'||process.env.SKYRA_EXPLORER_FOCUSED==='true'))await (await import('../advanced-explorer/browser-scenarios.mjs')).runAdvancedExplorerScenarios(t,{owner,fixtures,context,page,browser,login,uiOrigin,evidence,gateway:integratedGateway,query:pipelineQuery,bffControl,exportProxy});
    if(process.env.SKYRA_ADVANCED_ANALYTICS_E2E==='true'&&process.env.SKYRA_AUDIT_USAGE_ONLY!=='true')await (await import(process.env.SKYRA_ANALYTICS_FOCUSED==='true'?'../advanced-analytics/preference-pending.browser.mjs':'../advanced-analytics/browser-scenarios.mjs')).runAdvancedAnalyticsScenarios(t,{owner,fixtures,context,page,browser,login,uiOrigin,evidence,gateway:integratedGateway,query:pipelineQuery,bffControl,exportProxy});
    if(process.env.SKYRA_AUDIT_USAGE_E2E==='true'&&process.env.SKYRA_FINAL_EXPLORER_ONLY!=='true')await (await import('../advanced-administration/browser-scenarios.mjs')).runAdvancedAdministration(t,{owner,fixtures,context,page,browser,login,uiOrigin,evidence,gateway:integratedGateway,query:pipelineQuery,bffControl});
    if(process.env.SKYRA_FINAL_ACCEPTANCE_E2E==='true'&&process.env.SKYRA_FINAL_EXPLORER_ONLY!=='true')await (await import('../final-acceptance/browser-scenarios.mjs')).runFinalAcceptance(t,{owner,fixtures,context,page,browser,login,uiOrigin,evidence,gateway:integratedGateway,query:pipelineQuery,bffControl});
    if(process.env.SKYRA_DEVELOPER_E2E==='true')await (await import('../developer/browser-scenarios.mjs')).runDeveloperScenarios(t,{owner,fixtures,context,page,browser,login,uiOrigin,evidence});
    if(quotaMode)await (await import('../quotas/browser-scenarios.mjs')).runQuotaScenarios(t,{owner,fixtures,context,page,browser,login,uiOrigin,evidence,adminPort,token});
    if(auditMode)await (await import('../audit/browser-scenarios.mjs')).runAuditScenarios(t,{owner,fixtures,context,page,browser,login,uiOrigin,evidence,adminPort,token,adminControl:{stop:async()=>{const done=new Promise(r=>adminChild.once('exit',r));adminChild.kill();await done;},start:async()=>{adminChild=launch('admin-service',adminEnv);await wait(`http://127.0.0.1:${adminPort}/health/liveness`);}}});
    if(auditMode||integratedMode)assert.deepEqual(fatal,[]);
    await context.close();
    fs.writeFileSync(path.join(evidence,'e2e-environment.json'),JSON.stringify({database:state.database,port:state.port,runtimeRole:'skyra_org_runtime',adminPort,bffPort,uiOrigin,issuer:fixtures.issuer,mechanism:peer?'Controlled protocol issuer with real code exchange, S256, RS256/JWKS; ENABLE_MOCK_OIDC=false; actual Admin/BFF/PostgreSQL/Angular':'Existing OIDC mock exchange explicitly enabled only in NODE_ENV=test; real authoritative directory, sessions, CSRF and persistence',fatalConsoleErrors:fatal},null,2));
  } finally {
    if(exportProxy)await exportProxy.close();
    if(integratedGateway)await integratedGateway.stop();
    if(pipelineQuery)await pipelineQuery.stop();
    if(browser)await browser.close();ui.closeAllConnections();await new Promise(resolve=>ui.close(resolve));
    for(const child of [bffChild,adminChild])if(child&&!child.killed)child.kill();
    for(const log of logs)fs.closeSync(log);
    if(peer){try{await owner.query('ROLLBACK');await owner.query('UPDATE users SET issuer=$1 WHERE id=ANY($2::uuid[])',[originalIssuer,Object.values(fixtures.users).map(user=>user.id)]);}finally{await peer.close();}}
    await runtime.end();await owner.end();
  }
});
