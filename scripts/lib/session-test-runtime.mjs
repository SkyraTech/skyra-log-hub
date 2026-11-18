import {verifySessionMigration} from './session-migration-integrity.mjs';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {root,readState,testEnvironment,isolatedAdminClient} from '../isolated-postgres.mjs';import {connectIsolatedClient,connectIsolatedSessionRuntimeClient} from './isolated-target.mjs';import {verifyIntegratedMigrations} from './integrated-migration-integrity.mjs';
export async function sessionTestEnvironment(){
 const state=readState(),env=testEnvironment(state),physical=await isolatedAdminClient(state);await physical.end();const owner=await connectIsolatedClient(env.ISOLATED_DATABASE_URL,env);try{const ledger=await verifyIntegratedMigrations(owner);assert.equal(ledger.length,ledger.some(r=>r.migration_name==='20261116010000_dev016_dashboard_preferences')?13:ledger.some(r=>r.migration_name==='20261116000000_dev015_saved_searches')?12:11);await verifySessionMigration(owner);}finally{await owner.end();}
 const privateState=JSON.parse(fs.readFileSync(path.join(root,'.tmp/dev013-postgres/runtime.json')));assert.equal(privateState.clusterId,state.clusterId);assert.match(privateState.password,/^[a-f0-9]{64}$/);assert.match(privateState.dataKey,/^[a-f0-9]{64}$/);
 const url=new URL(env.ISOLATED_DATABASE_URL);url.username='skyra_bff_sessions_runtime';url.password=privateState.password;const checked=await connectIsolatedSessionRuntimeClient(url.href,env);await checked.end();
 return {BFF_SESSION_DATABASE_URL:url.href,BFF_SESSION_DATA_KEY:privateState.dataKey,SESSION_STORE_BACKEND:'postgres'};
}
