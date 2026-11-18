import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

// Stage manifests instead of changing workspace dependencies or publishing packages.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const destination=path.resolve(root,process.argv[2]??'.tmp/sdk-packages');
if(!destination.startsWith(root+path.sep))throw Error('Package output must remain inside this checkout');
fs.mkdirSync(destination,{recursive:true});
function run(command,args,cwd){const r=spawnSync(command,args,{cwd,encoding:'utf8',windowsHide:true});if(r.status!==0)throw Error(r.stderr||r.stdout||'Package command failed');return r.stdout;}
for(const name of ['logger-core','logger-node']){
  run(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p',`packages/${name}/tsconfig.json`],root);
  const source=path.join(root,'packages',name),stage=fs.mkdtempSync(path.join(destination,`${name}-`));
  const manifest=JSON.parse(fs.readFileSync(path.join(source,'package.json'),'utf8'));
  manifest.engines={node:'>=22'};
  delete manifest.scripts;delete manifest.devDependencies;
  if(name==='logger-node')manifest.dependencies['@skyra/logger-core']=JSON.parse(fs.readFileSync(path.join(root,'packages/logger-core/package.json'),'utf8')).version;
  fs.writeFileSync(path.join(stage,'package.json'),JSON.stringify(manifest,null,2));
  fs.cpSync(path.join(source,'dist'),path.join(stage,'dist'),{recursive:true});
  const npmCli=path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
  const result=JSON.parse(run(process.execPath,[npmCli,'pack','--ignore-scripts','--json','--pack-destination',destination],stage));
  console.log(path.join(destination,result[0].filename));
}
