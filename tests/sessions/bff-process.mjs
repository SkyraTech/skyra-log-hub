import fs from 'node:fs';import path from 'node:path';import net from 'node:net';import crypto from 'node:crypto';import {spawn,fork} from 'node:child_process';
import {root,readState,testEnvironment} from '../../scripts/isolated-postgres.mjs';import {sessionTestEnvironment} from '../../scripts/lib/session-test-runtime.mjs';
export async function startSessionBff(variables,evidence,options={}){
 const sessionEnv=await sessionTestEnvironment(),env={...testEnvironment(readState()),...variables,...sessionEnv};delete env.DATABASE_URL;delete env.ISOLATED_DATABASE_URL;
 const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=options.port??server.address().port;await new Promise(r=>server.close(r));env.BFF_PORT=String(port);
 const log=fs.openSync(path.join(evidence,'session-bff-'+crypto.randomUUID()+'.log'),'w'),messages=[];
 const child=options.memoryProbe?fork(path.join(root,'tests/advanced-explorer/bff-memory-child.mjs'),[],{cwd:root,windowsHide:true,env,stdio:['ignore',log,log,'ipc']}):options.fault?fork(path.join(root,'tests/sessions/bff-fault-child.mjs'),[],{cwd:root,windowsHide:true,env:{...env,SESSION_FAULT:options.fault},stdio:['ignore',log,log,'ipc']}):spawn(process.execPath,[path.join(root,'apps/console-bff/dist/main.js')],{cwd:root,windowsHide:true,env,stdio:['ignore',log,log]});fs.closeSync(log);child.on('message',m=>messages.push(m));
 const origin='http://127.0.0.1:'+port;
 const stop=async()=>{if(child.exitCode!==null||child.signalCode!==null)return;const done=new Promise(r=>child.once('exit',r));child.kill();await done;};
 for(let i=0;i<150;i++){if(child.exitCode!==null)throw Error('Session BFF startup failed; inspect safe log');try{if((await fetch(origin+'/bff/auth/readiness')).status===200)return {origin,child,stop,messages,crash:async()=>{if(child.exitCode!==null||child.signalCode!==null)return;const done=new Promise(r=>child.once('exit',r));child.kill('SIGKILL');await done;},until:async stage=>{for(let n=0;n<200;n++){if(messages.some(m=>m.stage===stage))return;await new Promise(r=>setTimeout(r,25));}throw Error('BFF fault boundary timeout');}};}catch{}await new Promise(r=>setTimeout(r,50));}
 await stop();throw Error('Session BFF readiness timeout');
}
