import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const LABEL=/^(?:dev01[2345678]|feature(?:00[6789]|01[01])|run-[a-z0-9][a-z0-9-]*)$/;
const RUN_ID=/^[a-z0-9][a-z0-9-]{7,63}$/;

function assertInsideTmp(candidate,workspaceRoot){
 const tmpRoot=path.resolve(workspaceRoot,'.tmp');
 const resolved=path.resolve(candidate);
 const relative=path.relative(tmpRoot,resolved);
 if(!relative||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error(`Evidence path must remain inside ${tmpRoot}`);
 let current=tmpRoot;
 for(const segment of relative.split(path.sep)){
  current=path.join(current,segment);
  if(fs.existsSync(current)&&fs.lstatSync(current).isSymbolicLink())throw Error(`Evidence path cannot cross a symlink or junction: ${current}`);
 }
 return resolved;
}

export function assertEvidenceLabel(label){
 if(typeof label!=='string'||!LABEL.test(label))throw Error(`Invalid or missing evidence run label: ${label??'missing'}`);
 return label;
}

export function assertAuthorizedEvidenceDirectory(evidence,{workspaceRoot=process.cwd(),label}={}){
 assertEvidenceLabel(label);
 const resolved=assertInsideTmp(evidence,workspaceRoot),base=path.basename(resolved),parent=path.basename(path.dirname(resolved));
 if(!base.endsWith('-evidence'))throw Error('Evidence directory must end in -evidence');
 if(base!==`${label}-evidence`&&!parent.startsWith(`${label}-session-runs`))throw Error(`Evidence directory does not belong to run label ${label}`);
 if(fs.existsSync(resolved)&&!fs.lstatSync(resolved).isDirectory())throw Error(`Evidence target is not a directory: ${resolved}`);
 return resolved;
}

export function createUniqueEvidenceDirectory({workspaceRoot=process.cwd(),label,runId=crypto.randomUUID().replaceAll('-','')}={}){
 assertEvidenceLabel(label);
 if(typeof runId!=='string'||!RUN_ID.test(runId))throw Error('Invalid or missing unique evidence run identifier');
 const parent=assertInsideTmp(path.join(workspaceRoot,'.tmp',`${label}-session-runs`),workspaceRoot);
 if(fs.existsSync(parent)&&fs.lstatSync(parent).isSymbolicLink())throw Error('Evidence run parent cannot be a symlink or junction');
 fs.mkdirSync(parent,{recursive:true,mode:0o700});
 const directory=path.join(parent,`${runId}-evidence`);
 fs.mkdirSync(directory,{recursive:false,mode:0o700});
 return directory;
}

function safeName(name){
 if(typeof name!=='string'||!name||name.includes('/')||name.includes('\\')||name==='.'||name==='..'||name.startsWith('.'))throw Error(`Invalid evidence file name: ${name}`);
 return name;
}

export function publishEvidenceFile(directory,name,content,{workspaceRoot=process.cwd(),label}={}){
 const dir=assertAuthorizedEvidenceDirectory(directory,{workspaceRoot,label}),file=safeName(name),target=path.join(dir,file),temporary=path.join(dir,`.${file}.${crypto.randomUUID()}.tmp`);
 if(fs.existsSync(target))throw Error(`Refusing to replace existing evidence file: ${target}`);
 let fd;
 try{
  fd=fs.openSync(temporary,'wx',0o600);
  const bytes=Buffer.isBuffer(content)?content:Buffer.from(String(content));
  fs.writeFileSync(fd,bytes);
  fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
  if(fs.existsSync(target))throw Error(`Evidence publication race detected: ${target}`);
  try{fs.linkSync(temporary,target);fs.unlinkSync(temporary);}catch(error){
   if(!['EPERM','EOPNOTSUPP','EXDEV'].includes(error.code))throw error;
   if(fs.existsSync(target))throw Error(`Evidence publication race detected: ${target}`);
   fs.renameSync(temporary,target);
  }
  return {path:target,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),incomplete:false};
 }catch(error){
  if(fd!==undefined)try{fs.closeSync(fd);}catch{}
  const marker=path.join(dir,`.${file}.incomplete`);
  try{if(!fs.existsSync(marker))fs.writeFileSync(marker,JSON.stringify({file,reason:String(error.message??error),createdAt:new Date().toISOString()},null,2),{flag:'wx',mode:0o600});}catch{}
  try{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}catch{}
  throw error;
 }
}

export function verifyCandidateHash(candidate,expected){
 const actual=crypto.createHash('sha256').update(fs.readFileSync(candidate)).digest('hex');
 return {candidate:path.resolve(candidate),expected,actual,match:actual===expected};
}
