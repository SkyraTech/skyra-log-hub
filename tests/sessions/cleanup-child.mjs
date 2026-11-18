import {sessionTestEnvironment} from '../../scripts/lib/session-test-runtime.mjs';import {PostgresSessionRepository} from '../../apps/console-bff/dist/modules/auth/application/postgres-session.repository.js';
const env=await sessionTestEnvironment(),store=new PostgresSessionRepository({url:env.BFF_SESSION_DATABASE_URL,key:env.BFF_SESSION_DATA_KEY,issuer:'urn:isolated-dev013-cleanup',clientId:'cleanup-test',idleMs:60000,absoluteMs:120000});await store.initialize();
// Test-only interception of the actual database completion, not a replacement cleanup.
const query=store.pool.query.bind(store.pool);store.pool.query=async(...args)=>{const result=await query(...args);if(String(args[0]).includes('DELETE FROM bff_sessions s USING doomed')){process.send({stage:'session-cleanup-committed'});await new Promise(()=>{});}return result;};
try{await store.cleanup(1);}finally{await store.close();}
