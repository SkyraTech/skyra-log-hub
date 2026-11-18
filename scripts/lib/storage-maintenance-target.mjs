import fs from 'node:fs';import path from 'node:path';
import {root,readState,testEnvironment,isolatedAdminClient} from '../isolated-postgres.mjs';
import {connectIsolatedClient,connectIsolatedIngestionRuntimeClient} from './isolated-target.mjs';
import {verifyIntegratedMigrations} from './integrated-migration-integrity.mjs';
export async function maintenanceTarget(store){
 const state=readState(),env=testEnvironment(state),physical=await isolatedAdminClient(state);await physical.end();
 const integrity=await connectIsolatedClient(env.ISOLATED_DATABASE_URL,env);try{await verifyIntegratedMigrations(integrity);}finally{await integrity.end();}
 const role=JSON.parse(fs.readFileSync(path.join(root,'.tmp/feature004-postgres/gateway-runtime.json')));if(role.clusterId!==state.clusterId)throw Error('Runtime cluster mismatch');
 const url=new URL(env.ISOLATED_DATABASE_URL);url.username='skyra_ingestion_runtime';url.password=role.password;
 const db=await connectIsolatedIngestionRuntimeClient(url.href,env);
 try{await db.query('SET default_transaction_read_only = on');const ownership=JSON.parse(fs.readFileSync(path.join(store,'ownership.json')));if(ownership.clusterId!==state.clusterId)throw Error('Store cluster mismatch');return {db,options:{store,allowedParent:path.join(root,'.tmp'),clusterId:state.clusterId,ownerId:ownership.id}};}catch(e){await db.end();throw e;}
}
