import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),label=process.env.SKYRA_SDK_EVIDENCE_LABEL??'feature010';if(!/^(?:feature01[01]|dev01[2345678]|dev01[45678]-node22)$/.test(label))throw Error('Invalid SDK evidence label');const evidence=path.join(root,'.tmp/'+label+'-evidence');
const consumer=fs.mkdtempSync(path.join(evidence,'consumer-'));
fs.writeFileSync(path.join(consumer,'package.json'),JSON.stringify({name:'skyra-clean-consumer',private:true,type:'module'}));
function run(name,command,args){const r=spawnSync(command,args,{cwd:consumer,windowsHide:true,encoding:'utf8',timeout:120000});fs.writeFileSync(path.join(evidence,name+'.log'),(r.stdout??'')+(r.stderr??''));if(r.status!==0)throw Error(name+' failed; see sanitized local log');return r;}
const npm=process.env.SKYRA_SDK_NPM_CLI??path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
// Repack already installed third-party dependencies for fully offline verification.
// This is validation infrastructure, not an alternative SDK distribution.
const require=createRequire(path.join(root,'packages/logger-core/package.json')),dependencies=[];
const ajvRequire=createRequire(require.resolve('ajv/package.json'));
for(const name of ['ajv','ajv-formats','fast-deep-equal','fast-uri','json-schema-traverse','require-from-string','@types/node','undici-types']){
  let manifest;
  for(const resolver of [require,ajvRequire,createRequire(path.join(root,'packages/logger-node/package.json')),createRequire(path.join(root,'node_modules/@types/node/package.json'))]){try{manifest=resolver.resolve(name+'/package.json');break;}catch{}}
  if(!manifest)throw Error('Installed offline dependency missing: '+name);
  // pnpm content-store hard links can become tar hard-link entries that npm does
  // not reliably materialize on Windows. Copy bytes into an owned staging tree.
  const stage=fs.mkdtempSync(path.join(evidence,'offline-package-'));
  fs.cpSync(path.dirname(manifest),stage,{recursive:true,dereference:true});
  const r=spawnSync(process.execPath,[npm,'pack','--ignore-scripts','--json','--pack-destination',path.join(evidence,'packages')],{cwd:stage,encoding:'utf8',windowsHide:true});
  if(r.status!==0)throw Error('Offline dependency packaging failed: '+name);
  dependencies.push(path.join(evidence,'packages',JSON.parse(r.stdout)[0].filename));
}
run('consumer-install',process.execPath,[npm,'install','--offline','--ignore-scripts','--no-audit','--no-fund',...dependencies,path.join(evidence,'packages/skyra-logger-core-1.0.0.tgz'),path.join(evidence,'packages/skyra-logger-node-1.0.0.tgz')]);
fs.copyFileSync(path.join(root,'examples/managed-ingestion/first-log.mjs'),path.join(consumer,'first-log.mjs'));
fs.writeFileSync(path.join(consumer,'pipeline-sample.mjs'),fs.readFileSync(path.join(root,'examples/managed-ingestion/sample.mjs'),'utf8').replace('../../packages/logger-node/dist/index.js','@skyra/logger-node'));
fs.writeFileSync(path.join(consumer,'consumer.mts'),`import {createSkyraLogger,HttpTransport,type SkyraLoggerConfig,type LogContext} from '@skyra/logger-node';
const config:SkyraLoggerConfig={projectId:'consumer-project',serviceName:'consumer',environment:'development',instanceId:'test'};
const context:LogContext={traceId:'a'.repeat(32),spanId:'b'.repeat(16),labels:{run_id:'consumer'},attributes:{nested:{id:42}}};
const logger=createSkyraLogger(config);for(const level of ['trace','debug','info','warn','error','fatal'] as const)logger[level]('consumer',context);await logger.flush();await logger.close();
const transport:typeof HttpTransport=HttpTransport;void transport;
`);
run('consumer-types',process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'--module','NodeNext','--moduleResolution','NodeNext','--target','ES2022','--strict','--skipLibCheck','consumer.mts']);
run('consumer-esm',process.execPath,['consumer.mjs']);
const snippet=fs.readFileSync(path.join(root,'apps/console-web/src/app/features/developer/getting-started.component.ts'),'utf8').match(/readonly code=`([\s\S]*?)`;/)?.[1];
if(!snippet)throw Error('Onboarding snippet not found');
fs.writeFileSync(path.join(consumer,'onboarding-snippet.mjs'),snippet);
run('consumer-snippet-types',process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'--types','node','--allowJs','--checkJs','--noEmit','--module','NodeNext','--moduleResolution','NodeNext','--target','ES2022','--strict','--skipLibCheck','onboarding-snippet.mjs']);
const missing=spawnSync(process.execPath,['first-log.mjs'],{cwd:consumer,env:{PATH:process.env.PATH},encoding:'utf8'});if(missing.status!==1||!missing.stderr.includes('Missing configuration'))throw Error('Missing configuration did not fail safely');
fs.writeFileSync(path.join(evidence,'consumer.json'),JSON.stringify({directory:consumer,module:'ESM',runtime:process.version,typescriptExit:0,javascriptExit:0,missingConfigurationExit:missing.status,dependencyResolution:fs.realpathSync(path.join(consumer,'node_modules/@skyra/logger-node'))},null,2));
console.log('Clean consumer installed, compiled and executed:',consumer);
