import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {root,readState,testEnvironment,isolatedAdminClient} from './isolated-postgres.mjs';import {connectIsolatedClient} from './lib/isolated-target.mjs';
const state=readState(),env=testEnvironment(state),verified=await connectIsolatedClient(env.ISOLATED_DATABASE_URL,env);await verified.end();const physical=await isolatedAdminClient(state);await physical.end();
const cwd=path.join(root,'apps/query-service'),tests=path.join(cwd,'dist-test/tests');
const files=fs.readdirSync(tests,{recursive:true}).filter(p=>p.endsWith('.test.js')).map(p=>path.join(tests,p));
if(!files.length)throw Error('Compile Query Service tests first');
const result=spawnSync(process.execPath,['--test',...(process.env.QUERY_TEST_CONCURRENCY==='1'?['--test-concurrency=1']:[]),...files],{cwd,env,stdio:'inherit',windowsHide:true,timeout:120000});process.exit(result.status??1);
